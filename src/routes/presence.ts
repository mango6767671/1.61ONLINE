import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../db/pool.js";

const heartbeatSchema = z.object({
  status: z.enum(["online", "away"]).default("online")
}).strict();

const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.put("/heartbeat", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const result = await pool.query(
      `INSERT INTO player_presence (user_id, status, last_seen_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET status = CASE
             WHEN player_presence.status = 'in_session' THEN 'in_session'
             ELSE EXCLUDED.status
           END,
           last_seen_at = NOW(),
           updated_at = NOW()
       RETURNING status, last_seen_at`,
      [request.user.sub, parsed.data.status]
    );

    return { presence: result.rows[0] };
  });

  app.get("/", { preHandler: [app.authenticate] }, async (request) => {
    const result = await pool.query(
      `SELECT p.user_id AS "userId", COALESCE(pp.display_name, 'Player') AS "displayName",
              p.status, p.last_seen_at AS "lastSeenAt"
       FROM player_presence p
       JOIN player_profiles pp ON pp.user_id = p.user_id
       WHERE p.last_seen_at > NOW() - INTERVAL '90 seconds'
       ORDER BY p.last_seen_at DESC
       LIMIT 100`
    );
    return { players: result.rows };
  });
};

export default presenceRoutes;
