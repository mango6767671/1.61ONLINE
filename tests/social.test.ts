import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

let app: FastifyInstance | undefined;
let db: typeof import("../src/db/pool.js").pool;
let aliceId = "";
let bobId = "";
let charlieId = "";
let aliceToken = "";
let bobToken = "";
let charlieToken = "";
let suffix = "";

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
  suffix = randomUUID().slice(0, 8);

  const passwordHash = "not-used-by-this-test";
  const users = await Promise.all([
    db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [`alice-${suffix}@example.test`, passwordHash]
    ),
    db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [`bob-${suffix}@example.test`, passwordHash]
    ),
    db.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [`charlie-${suffix}@example.test`, passwordHash]
    )
  ]);

  aliceId = users[0].rows[0]!.id;
  bobId = users[1].rows[0]!.id;
  charlieId = users[2].rows[0]!.id;

  await Promise.all([
    db.query("INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)", [aliceId, `Alice_${suffix}`]),
    db.query("INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)", [bobId, `Bob_${suffix}`]),
    db.query("INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)", [charlieId, `Charlie_${suffix}`])
  ]);

  aliceToken = app.jwt.sign({ sub: aliceId, email: `alice-${suffix}@example.test` }, { expiresIn: "15m" });
  bobToken = app.jwt.sign({ sub: bobId, email: `bob-${suffix}@example.test` }, { expiresIn: "15m" });
  charlieToken = app.jwt.sign({ sub: charlieId, email: `charlie-${suffix}@example.test` }, { expiresIn: "15m" });
});

describe("community social graph", () => {
  it("sends, accepts, lists, searches, and removes a friendship", async () => {
    const sent = await app!.inject({
      method: "POST",
      url: "/v1/social/friend-requests",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { targetUserId: bobId }
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json()).toMatchObject({ sent: true, targetUserId: bobId, status: "pending" });

    const incoming = await app!.inject({
      method: "GET",
      url: "/v1/social/friend-requests?direction=incoming",
      headers: { authorization: `Bearer ${bobToken}` }
    });
    expect(incoming.statusCode).toBe(200);
    expect(incoming.json().requests).toEqual([
      expect.objectContaining({ userId: aliceId, sentByMe: false })
    ]);

    const accepted = await app!.inject({
      method: "POST",
      url: `/v1/social/friend-requests/${aliceId}/accept`,
      headers: { authorization: `Bearer ${bobToken}` },
      payload: {}
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ accepted: true, userId: aliceId });

    const friends = await app!.inject({
      method: "GET",
      url: "/v1/social/friends",
      headers: { authorization: `Bearer ${aliceToken}` }
    });
    expect(friends.statusCode).toBe(200);
    expect(friends.json().friends).toEqual([
      expect.objectContaining({ userId: bobId, displayName: `Bob_${suffix}` })
    ]);

    const search = await app!.inject({
      method: "GET",
      url: `/v1/social/players?query=Charlie_${suffix}`,
      headers: { authorization: `Bearer ${aliceToken}` }
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().players).toEqual([
      expect.objectContaining({ userId: charlieId, displayName: `Charlie_${suffix}` })
    ]);
    expect(search.json().players[0]).not.toHaveProperty("email");

    const duplicate = await app!.inject({
      method: "POST",
      url: "/v1/social/friend-requests",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { targetUserId: bobId }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: "already_friends" });

    const removed = await app!.inject({
      method: "DELETE",
      url: `/v1/social/friends/${bobId}`,
      headers: { authorization: `Bearer ${aliceToken}` }
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ removed: true });
  });

  it("rejects self-friend requests and invalid player search queries", async () => {
    const selfRequest = await app!.inject({
      method: "POST",
      url: "/v1/social/friend-requests",
      headers: { authorization: `Bearer ${aliceToken}` },
      payload: { targetUserId: aliceId }
    });
    expect(selfRequest.statusCode).toBe(400);
    expect(selfRequest.json()).toEqual({ error: "cannot_friend_self" });

    const invalidSearch = await app!.inject({
      method: "GET",
      url: "/v1/social/players?query=%25",
      headers: { authorization: `Bearer ${charlieToken}` }
    });
    expect(invalidSearch.statusCode).toBe(400);
  });
});

afterAll(async () => {
  if (app) await app.close();
  if (db) {
    const ids = [aliceId, bobId, charlieId].filter(Boolean);
    if (ids.length) await db.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids]);
    await db.end();
  }
});
