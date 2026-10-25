import type { FastifyPluginAsync } from "fastify";
import argon2 from "argon2";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { hashRefreshToken, issueAuthSession } from "../services/auth-sessions.js";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128)
}).strict();

const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256)
}).strict();

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
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
      const tokens = await issueAuthSession(app, client, user);
      await client.query("COMMIT");

      return reply.code(201).send(authResponse(user, tokens));
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) return reply.code(409).send({ error: "account_already_exists" });
      request.log.error({ err: error }, "Registration failed");
      return reply.code(500).send({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    try {
      const { email, password } = parsed.data;
      const result = await pool.query<{ id: string; email: string | null; password_hash: string | null }>(
        "SELECT id, email, password_hash FROM users WHERE email = $1",
        [email]
      );
      const user = result.rows[0];
      const valid = user?.password_hash ? await argon2.verify(user.password_hash, password) : false;

      if (!user || !user.email || !user.password_hash || !valid) return reply.code(401).send({ error: "invalid_credentials" });

      const activeBan = await pool.query(
        "SELECT 1 FROM community_bans WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [user.id]
      );
      if (activeBan.rowCount) return reply.code(403).send({ error: "account_suspended" });

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tokens = await issueAuthSession(app, client, user);
        await client.query("COMMIT");
        return authResponse({ id: user.id, email: user.email }, tokens);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      request.log.error({ err: error }, "Login failed");
      return reply.code(500).send({ error: "internal_error" });
    }
  });

  app.post("/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    const client = await pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;

      const currentResult = await client.query<{
        id: string;
        user_id: string;
        email: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT s.id, s.user_id, u.email, s.expires_at, s.revoked_at
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.refresh_token_hash = $1
         FOR UPDATE OF s`,
        [hashRefreshToken(parsed.data.refreshToken)]
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("ROLLBACK");
        inTransaction = false;
        return reply.code(401).send({ error: "invalid_refresh_token" });
      }

      if (current.revoked_at) {
        // A rotated token was reused. Revoke remaining sessions for this account.
        await client.query(
          "UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
          [current.user_id]
        );
        await client.query("COMMIT");
        inTransaction = false;
        return reply.code(401).send({ error: "refresh_token_reuse_detected" });
      }

      if (current.expires_at.getTime() <= Date.now()) {
        await client.query("UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1", [current.id]);
        await client.query("COMMIT");
        inTransaction = false;
        return reply.code(401).send({ error: "refresh_token_expired" });
      }

      await client.query(
        "UPDATE auth_sessions SET revoked_at = NOW(), last_used_at = NOW() WHERE id = $1",
        [current.id]
      );
      const next = await issueAuthSession(app, client, { id: current.user_id, email: current.email });
      await client.query(
        "UPDATE auth_sessions SET replaced_by_session_id = $1 WHERE id = $2",
        [next.sessionId, current.id]
      );
      await client.query("COMMIT");
      inTransaction = false;

      return authResponse({ id: current.user_id, email: current.email }, next);
    } catch (error) {
      if (inTransaction) {
        try { await client.query("ROLLBACK"); } catch { /* connection may already be closed */ }
      }
      request.log.error({ err: error }, "Token refresh failed");
      return reply.code(500).send({ error: "internal_error" });
    } finally {
      client.release();
    }
  });

  app.post("/logout", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });

    // Idempotent: don't disclose whether a supplied refresh token was ever valid.
    await pool.query(
      "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE refresh_token_hash = $1",
      [hashRefreshToken(parsed.data.refreshToken)]
    );
    return { loggedOut: true };
  });

  app.post("/logout-all", { preHandler: [app.authenticate] }, async (request) => {
    const result = await pool.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [request.user.sub]
    );
    return { loggedOut: true, revokedSessions: result.rowCount ?? 0 };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await pool.query<{ id: string; email: string | null; created_at: Date }>(
      "SELECT id, email, created_at FROM users WHERE id = $1",
      [request.user.sub]
    );
    const user = result.rows[0];
    if (!user) return reply.code(404).send({ error: "user_not_found" });
    return { user: { id: user.id, email: user.email, createdAt: user.created_at } };
  });
};

function authResponse(
  user: { id: string; email: string | null },
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    refreshExpiresIn: number;
    refreshExpiresAt: Date;
  }
) {
  return {
    user,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: "Bearer",
    expiresIn: tokens.expiresIn,
    refreshExpiresIn: tokens.refreshExpiresIn,
    refreshExpiresAt: tokens.refreshExpiresAt
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export default authRoutes;
