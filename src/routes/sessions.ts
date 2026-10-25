import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../db/pool.js";

const createSessionSchema = z.object({
  name: z.string().trim().min(3).max(48),
  region: z.string().trim().min(2).max(16).regex(/^[a-z0-9-]+$/),
  gameMode: z.string().trim().min(2).max(32).regex(/^[a-z0-9_-]+$/),
  visibility: z.enum(["public", "private"]).default("public"),
  maxPlayers: z.number().int().min(2).max(32).default(16)
}).strict();

const sessionRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      region: z.string().min(2).max(16).optional(),
      gameMode: z.string().min(2).max(32).optional()
    }).safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query" });
    }

    const result = await pool.query(
      `SELECT s.id, s.name, s.region, s.game_mode AS "gameMode",
              s.visibility, s.state, s.max_players AS "maxPlayers",
              COUNT(m.user_id)::int AS "playerCount"
       FROM game_sessions s
       LEFT JOIN session_members m ON m.session_id = s.id
       WHERE s.state = 'open' AND s.visibility = 'public'
         AND ($1::text IS NULL OR s.region = $1)
         AND ($2::text IS NULL OR s.game_mode = $2)
       GROUP BY s.id
       ORDER BY s.created_at ASC
       LIMIT 50`,
      [query.data.region ?? null, query.data.gameMode ?? null]
    );
    return { sessions: result.rows };
  });

  app.post("/", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        "SELECT session_id FROM session_members WHERE user_id = $1 FOR UPDATE",
        [request.user.sub]
      );
      if (previous.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "already_in_session" });
      }

      const data = parsed.data;
      const created = await client.query(
        `INSERT INTO game_sessions (owner_user_id, name, region, game_mode, visibility, max_players)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, region, game_mode AS "gameMode", visibility, state, max_players AS "maxPlayers"`,
        [request.user.sub, data.name, data.region, data.gameMode, data.visibility, data.maxPlayers]
      );
      const session = created.rows[0];
      await client.query("INSERT INTO session_members (session_id, user_id) VALUES ($1, $2)", [session.id, request.user.sub]);
      await client.query("DELETE FROM matchmaking_queue WHERE user_id = $1", [request.user.sub]);
      await client.query(
        `INSERT INTO player_presence (user_id, status, session_id, last_seen_at, updated_at)
         VALUES ($1, 'in_session', $2, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET status = 'in_session', session_id = $2, last_seen_at = NOW(), updated_at = NOW()`,
        [request.user.sub, session.id]
      );
      await client.query("COMMIT");
      return reply.code(201).send({ session: { ...session, playerCount: 1 } });
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "already_in_session" });
      request.log.error({ err: error }, "Session creation failed");
      return reply.code(500).send({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  app.post("/:sessionId/join", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_session_id" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        "SELECT session_id FROM session_members WHERE user_id = $1",
        [request.user.sub]
      );
      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "already_in_session" });
      }

      const found = await client.query(
        "SELECT id, max_players FROM game_sessions WHERE id = $1 AND state = 'open' AND visibility = 'public' FOR UPDATE",
        [params.data.sessionId]
      );
      const session = found.rows[0];
      if (!session) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "session_not_found" });
      }

      const count = await client.query(
        "SELECT COUNT(*)::int AS count FROM session_members WHERE session_id = $1",
        [session.id]
      );
      if (count.rows[0].count >= session.max_players) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "session_full" });
      }

      await client.query("INSERT INTO session_members (session_id, user_id) VALUES ($1, $2)", [session.id, request.user.sub]);
      await client.query("DELETE FROM matchmaking_queue WHERE user_id = $1", [request.user.sub]);
      await client.query(
        `INSERT INTO player_presence (user_id, status, session_id, last_seen_at, updated_at)
         VALUES ($1, 'in_session', $2, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET status = 'in_session', session_id = $2, last_seen_at = NOW(), updated_at = NOW()`,
        [request.user.sub, session.id]
      );
      await client.query("COMMIT");
      return { joined: true, sessionId: session.id, playerCount: count.rows[0].count + 1 };
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "already_in_session" });
      request.log.error({ err: error }, "Session join failed");
      return reply.code(500).send({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  app.post("/:sessionId/leave", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ sessionId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_session_id" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const removed = await client.query(
        "DELETE FROM session_members WHERE session_id = $1 AND user_id = $2 RETURNING session_id",
        [params.data.sessionId, request.user.sub]
      );
      if (!removed.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "session_membership_not_found" });
      }

      await client.query(
        `UPDATE player_presence SET status = 'online', session_id = NULL, updated_at = NOW()
         WHERE user_id = $1`,
        [request.user.sub]
      );
      const remaining = await client.query(
        "SELECT COUNT(*)::int AS count FROM session_members WHERE session_id = $1",
        [params.data.sessionId]
      );
      if (remaining.rows[0].count === 0) {
        await client.query("UPDATE game_sessions SET state = 'closed', updated_at = NOW() WHERE id = $1", [params.data.sessionId]);
      }
      await client.query("COMMIT");
      return { left: true };
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error }, "Session leave failed");
      return reply.code(500).send({ error: "internal_error" });
    } finally {
      client.release();
    }
  });
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export default sessionRoutes;
