import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

let app: FastifyInstance | undefined;
let db: typeof import("../src/db/pool.js").pool | undefined;
let email = "";
let userId = "";
let accessToken = "";
let refreshToken = "";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/online_test";
  process.env.JWT_SECRET ??= "test-only-secret-that-is-at-least-32-characters";
  process.env.CORS_ORIGIN ??= "http://localhost:5173";

  const [{ buildApp }, poolModule] = await Promise.all([
    import("../src/app.js"),
    import("../src/db/pool.js")
  ]);
  app = await buildApp();
  db = poolModule.pool;
  email = `auth-${randomUUID()}@example.test`;
});

describe("refreshable authentication sessions", () => {
  it("rotates refresh tokens and revokes access after logout", async () => {
    const registration = await app!.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: { email, password: "Strong-Community-Passphrase-2026!" }
    });
    expect(registration.statusCode).toBe(201);
    const created = registration.json();
    expect(created.refreshToken).toEqual(expect.any(String));
    expect(created.refreshExpiresIn).toBe(30 * 24 * 60 * 60);
    userId = created.user.id;
    accessToken = created.accessToken;
    refreshToken = created.refreshToken;

    const firstAccess = await app!.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(firstAccess.statusCode).toBe(200);

    const refresh = await app!.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: { refreshToken }
    });
    expect(refresh.statusCode).toBe(200);
    const rotated = refresh.json();
    expect(rotated.refreshToken).not.toBe(refreshToken);
    accessToken = rotated.accessToken;
    refreshToken = rotated.refreshToken;

    const oldAccess = await app!.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${created.accessToken}` }
    });
    expect(oldAccess.statusCode).toBe(401);

    const newAccess = await app!.inject({
      method: "GET",
      url: "/v1/client/account",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(newAccess.statusCode).toBe(200);
    expect(newAccess.json().account.id).toBe(userId);

    const logout = await app!.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: { refreshToken }
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ loggedOut: true });

    const revokedAccess = await app!.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(revokedAccess.statusCode).toBe(401);
  });
});

afterAll(async () => {
  if (app) await app.close();
  if (db) {
    if (userId) await db.query("DELETE FROM users WHERE id = $1", [userId]);
    await db.end();
  }
});
