import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../db/pool.js";

const queueSchema = z.object({
  gameMode: z.string().trim().min(2).max(32).regex(/^[a-z0-9_-]+$/),
  region: z.string().trim().min(2).max(16).regex(/^[a-z0-9-]+$/)
}).strict();

const matchmakingRoutes: FastifyPluginAsync = async (app) => {
  app.post("/queue", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = queueSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const membership = await pool.query(
      "SELECT 1 FROM session_members WHERE user_id = $1",
      [request.user.sub]
    );
    if (membership.rowCount) return reply.code(409).send({ error: "already_in_session" });

    const result = await pool.query(
      `INSERT INTO matchmaking_queue (user_id, game_mode, region)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
       SET game_mode = EXCLUDED.game_mode, region = EXCLUDED.region, queued_at = NOW()
       RETURNING game_mode AS "gameMode", region, queued_at AS "queuedAt"`,
      [request.user.sub, parsed.data.gameMode, parsed.data.region]
    );
    return reply.code(202).send({ status: "queued", queue: result.rows[0] });
  });

  app.get("/status", { preHandler: [app.authenticate] }, async (request) => {
    const result = await pool.query(
      `SELECT game_mode AS "gameMode", region, queued_at AS "queuedAt"
       FROM matchmaking_queue WHERE user_id = $1`,
      [request.user.sub]
    );
    if (!result.rowCount) return { status: "not_queued" };
    return { status: "searching", queue: result.rows[0] };
  });

  app.delete("/queue", { preHandler: [app.authenticate] }, async (request) => {
    const result = await pool.query(
      "DELETE FROM matchmaking_queue WHERE user_id = $1",
      [request.user.sub]
    );
    return { cancelled: (result.rowCount ?? 0) > 0 };
  });
};

export default matchmakingRoutes;
