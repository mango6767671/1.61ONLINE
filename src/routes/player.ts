import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { pool } from "../db/pool.js";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(3).max(32).regex(/^[\p{L}\p{N} _-]+$/u).nullable()
}).strict();

const playerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await pool.query<{
      display_name: string | null;
      rank: number;
      cash: string;
      bank: string;
      updated_at: Date;
    }>(
      `SELECT display_name, rank, cash::text, bank::text, updated_at
       FROM player_profiles WHERE user_id = $1`,
      [request.user.sub]
    );
    const profile = result.rows[0];
    if (!profile) return reply.code(404).send({ error: "profile_not_found" });

    return {
      profile: {
        displayName: profile.display_name,
        rank: profile.rank,
        cash: profile.cash,
        bank: profile.bank,
        updatedAt: profile.updated_at
      }
    };
  });

  app.patch("/profile", { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const result = await pool.query<{ display_name: string | null; updated_at: Date }>(
      `UPDATE player_profiles
       SET display_name = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING display_name, updated_at`,
      [parsed.data.displayName, request.user.sub]
    );
    const profile = result.rows[0];
    if (!profile) return reply.code(404).send({ error: "profile_not_found" });

    return { profile: { displayName: profile.display_name, updatedAt: profile.updated_at } };
  });
};

export default playerRoutes;
