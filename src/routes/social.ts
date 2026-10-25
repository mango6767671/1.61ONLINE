import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../db/pool.js";

const playerSearchSchema = z.object({
  query: z.string().trim().min(2).max(32).regex(/^[\p{L}\p{N} _-]+$/u)
}).strict();

const userIdSchema = z.string().uuid().transform((value) => value.toLowerCase());
const requestSchema = z.object({ targetUserId: userIdSchema }).strict();

const socialRoutes: FastifyPluginAsync = async (app) => {
  app.get("/players", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = playerSearchSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });

    const result = await pool.query(
      `SELECT u.id AS "userId",
              pp.display_name AS "displayName",
              pp.rank,
              CASE WHEN p.last_seen_at > NOW() - INTERVAL '90 seconds'
                THEN p.status ELSE 'offline' END AS status
       FROM users u
       JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN player_presence p ON p.user_id = u.id
       WHERE u.id <> $2
         AND pp.display_name IS NOT NULL
         AND pp.display_name ILIKE '%' || $1 || '%'
         AND NOT EXISTS (
           SELECT 1 FROM friendships f
           WHERE f.user_low_id = LEAST(u.id, $2::uuid)
             AND f.user_high_id = GREATEST(u.id, $2::uuid)
         )
       ORDER BY pp.display_name ASC
       LIMIT 20`,
      [parsed.data.query, request.user.sub]
    );
    return { players: result.rows };
  });

  app.get("/friends", { preHandler: [app.authenticate] }, async (request) => {
    const result = await pool.query(
      `SELECT u.id AS "userId",
              COALESCE(pp.display_name, 'Player') AS "displayName",
              pp.rank,
              CASE WHEN p.last_seen_at > NOW() - INTERVAL '90 seconds'
                THEN p.status ELSE 'offline' END AS status,
              f.created_at AS "friendsSince"
       FROM friendships f
       JOIN users u ON u.id = CASE
         WHEN f.user_low_id = $1::uuid THEN f.user_high_id
         ELSE f.user_low_id END
       JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN player_presence p ON p.user_id = u.id
       WHERE $1::uuid IN (f.user_low_id, f.user_high_id)
         AND f.status = 'accepted'
       ORDER BY pp.display_name NULLS LAST, u.id
       LIMIT 200`,
      [request.user.sub]
    );
    return { friends: result.rows };
  });

  app.get("/friend-requests", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = z.object({
      direction: z.enum(["incoming", "outgoing"]).default("incoming")
    }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });

    const result = await pool.query(
      `WITH visible_requests AS (
         SELECT f.user_low_id, f.user_high_id, f.requested_by_user_id, f.created_at,
                CASE WHEN f.user_low_id = $1::uuid THEN f.user_high_id
                     ELSE f.user_low_id END AS other_user_id
         FROM friendships f
         WHERE f.status = 'pending'
           AND $1::uuid IN (f.user_low_id, f.user_high_id)
           AND (($2::text = 'incoming' AND f.requested_by_user_id <> $1::uuid)
             OR ($2::text = 'outgoing' AND f.requested_by_user_id = $1::uuid))
       )
       SELECT u.id AS "userId",
              COALESCE(pp.display_name, 'Player') AS "displayName",
              r.requested_by_user_id = $1::uuid AS "sentByMe",
              r.created_at AS "createdAt"
       FROM visible_requests r
       JOIN users u ON u.id = r.other_user_id
       JOIN player_profiles pp ON pp.user_id = u.id
       ORDER BY r.created_at ASC
       LIMIT 100`,
      [request.user.sub, parsed.data.direction]
    );
    return { direction: parsed.data.direction, requests: result.rows };
  });

  app.post("/friend-requests", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    const requesterId = String(request.user.sub).toLowerCase();
    const targetId = parsed.data.targetUserId;
    if (requesterId === targetId) return reply.code(400).send({ error: "cannot_friend_self" });

    const target = await pool.query("SELECT 1 FROM users WHERE id = $1", [targetId]);
    if (!target.rowCount) return reply.code(404).send({ error: "player_not_found" });

    const [userLowId, userHighId] = orderedPair(requesterId, targetId);
    const existing = await pool.query<{ status: string; requested_by_user_id: string }>(
      `SELECT status, requested_by_user_id FROM friendships
       WHERE user_low_id = $1 AND user_high_id = $2`,
      [userLowId, userHighId]
    );
    const relationship = existing.rows[0];
    if (relationship?.status === "accepted") {
      return reply.code(409).send({ error: "already_friends" });
    }
    if (relationship?.status === "pending") {
      return reply.code(409).send({
        error: relationship.requested_by_user_id.toLowerCase() === requesterId
          ? "friend_request_already_pending"
          : "incoming_friend_request_exists"
      });
    }

    try {
      await pool.query(
        `INSERT INTO friendships (user_low_id, user_high_id, requested_by_user_id, status)
         VALUES ($1, $2, $3, 'pending')`,
        [userLowId, userHighId, requesterId]
      );
    } catch (error) {
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "relationship_already_exists" });
      request.log.error({ err: error }, "Friend request creation failed");
      return reply.code(500).send({ error: "internal_error" });
    }

    return reply.code(201).send({ sent: true, targetUserId: targetId, status: "pending" });
  });

  app.post("/friend-requests/:userId/accept", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = z.object({ userId: userIdSchema }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_user_id" });

    const currentId = String(request.user.sub).toLowerCase();
    const targetId = parsed.data.userId;
    if (currentId === targetId) return reply.code(400).send({ error: "invalid_user_id" });
    const [userLowId, userHighId] = orderedPair(currentId, targetId);

    const result = await pool.query(
      `UPDATE friendships
       SET status = 'accepted', updated_at = NOW()
       WHERE user_low_id = $1 AND user_high_id = $2
         AND status = 'pending' AND requested_by_user_id <> $3
       RETURNING user_low_id`,
      [userLowId, userHighId, currentId]
    );
    if (!result.rowCount) {
      return reply.code(404).send({ error: "incoming_friend_request_not_found" });
    }
    return { accepted: true, userId: targetId };
  });

  app.delete("/friend-requests/:userId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = z.object({ userId: userIdSchema }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_user_id" });

    const currentId = String(request.user.sub).toLowerCase();
    const targetId = parsed.data.userId;
    if (currentId === targetId) return reply.code(400).send({ error: "invalid_user_id" });
    const [userLowId, userHighId] = orderedPair(currentId, targetId);

    const result = await pool.query(
      `DELETE FROM friendships
       WHERE user_low_id = $1 AND user_high_id = $2 AND status = 'pending'`,
      [userLowId, userHighId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "pending_friend_request_not_found" });
    return { removed: true };
  });

  app.delete("/friends/:userId", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = z.object({ userId: userIdSchema }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_user_id" });

    const currentId = String(request.user.sub).toLowerCase();
    const targetId = parsed.data.userId;
    if (currentId === targetId) return reply.code(400).send({ error: "invalid_user_id" });
    const [userLowId, userHighId] = orderedPair(currentId, targetId);

    const result = await pool.query(
      `DELETE FROM friendships
       WHERE user_low_id = $1 AND user_high_id = $2 AND status = 'accepted'`,
      [userLowId, userHighId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "friendship_not_found" });
    return { removed: true };
  });
};

function orderedPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export default socialRoutes;
