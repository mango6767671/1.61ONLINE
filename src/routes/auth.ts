import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { pool } from "../db/pool.js";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128)
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string; email: string }>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
        [email, passwordHash]
      );
      const user = result.rows[0]!;
      await client.query("INSERT INTO player_profiles (user_id) VALUES ($1)", [user.id]);
      await client.query("COMMIT");

      const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: "15m" });
      return reply.code(201).send({
        user: { id: user.id, email: user.email },
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: 900
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "account_already_exists" });
      request.log.error({ err: error }, "Registration failed");
      return reply.code(500).send({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  app.post("/login", async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    try {
      const { email, password } = parsed.data;
      const result = await pool.query<{ id: string; email: string; password_hash: string }>(
        "SELECT id, email, password_hash FROM users WHERE email = $1",
        [email]
      );
      const user = result.rows[0];
      const valid = user ? await argon2.verify(user.password_hash, password) : false;

      if (!user || !valid) return reply.code(401).send({ error: "invalid_credentials" });

      const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: "15m" });
      return {
        user: { id: user.id, email: user.email },
        accessToken: token,
        tokenType: "Bearer",
        expiresIn: 900
      };
    } catch (error) {
      request.log.error({ err: error }, "Login failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await pool.query<{ id: string; email: string; created_at: Date }>(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [request.user.sub]
    );
    const user = result.rows[0];
    if (!user) return reply.code(404).send({ error: "user_not_found" });
    return { user: { id: user.id, email: user.email, createdAt: user.created_at } };
  });
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export default authRoutes;
