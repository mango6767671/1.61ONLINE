import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";

export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
export const REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
  email: string;
}

export interface IssuedAuthSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  refreshExpiresAt: Date;
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

export async function issueAuthSession(
  app: FastifyInstance,
  client: PoolClient,
  user: AuthUser
): Promise<IssuedAuthSession> {
  const refreshToken = randomBytes(48).toString("base64url");
  const result = await client.query<{ id: string; expires_at: Date }>(
    `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 days')
     RETURNING id, expires_at`,
    [user.id, hashRefreshToken(refreshToken)]
  );
  const session = result.rows[0]!;

  const accessToken = app.jwt.sign(
    { sub: user.id, email: user.email, sid: session.id },
    { expiresIn: "15m" }
  );

  return {
    sessionId: session.id,
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
    refreshExpiresIn: REFRESH_TOKEN_LIFETIME_SECONDS,
    refreshExpiresAt: session.expires_at
  };
}
