import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { randomInt } from "node:crypto";

const botKey = "test-only-discord-bot-secret-that-is-at-least-32-characters";
let app: FastifyInstance | undefined;
let db: typeof import("../src/db/pool.js").pool | undefined;
let discordUserId = "";
let actorDiscordId = "";
let communityUserId = "";

function snowflake(prefix: string): string {
  return prefix + Array.from({ length: 17 }, () => randomInt(0, 10)).join("");
}

const authHeader = { "x-community-bot-key": botKey };

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/online_test";
  process.env.JWT_SECRET ??= "test-only-secret-that-is-at-least-32-characters";
  process.env.DISCORD_BOT_API_KEY = botKey;
  process.env.CORS_ORIGIN ??= "http://localhost:5173";
  const [{ buildApp }, poolModule] = await Promise.all([
    import("../src/app.js"),
    import("../src/db/pool.js")
  ]);
  app = await buildApp();
  db = poolModule.pool;
  discordUserId = snowflake("9");
  actorDiscordId = snowflake("8");
});

describe("Discord community integration API", () => {
  it("requires the private bot API key", async () => {
    const response = await app!.inject({ method: "GET", url: "/v1/integrations/discord/status" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthorized_integration" });
  });

  it("creates a Discord-native account and makes signup idempotent", async () => {
    const payload = {
      discordUserId,
      username: "community-tester",
      globalName: "Community Tester",
      avatarUrl: null
    };
    const created = await app!.inject({
      method: "POST",
      url: "/v1/integrations/discord/signup",
      headers: authHeader,
      payload
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().created).toBe(true);
    expect(created.json().account.discordUserId).toBe(discordUserId);
    expect(created.json().account.displayName).toBe("Community Tester");
    communityUserId = created.json().account.id;

    const duplicate = await app!.inject({
      method: "POST",
      url: "/v1/integrations/discord/signup",
      headers: authHeader,
      payload: { ...payload, username: "community-tester-updated" }
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().created).toBe(false);
    expect(duplicate.json().account.id).toBe(communityUserId);

    const lookup = await app!.inject({
      method: "GET",
      url: "/v1/integrations/discord/players/" + discordUserId,
      headers: authHeader
    });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().player.isBanned).toBe(false);
  });

  it("applies and revokes community bans for registered accounts", async () => {
    const ban = await app!.inject({
      method: "POST",
      url: "/v1/integrations/discord/players/" + discordUserId + "/ban",
      headers: authHeader,
      payload: {
        actorDiscordId,
        actorUsername: "test-admin",
        discordUserId,
        reason: "Automated integration test",
        durationMinutes: 5
      }
    });
    expect(ban.statusCode).toBe(200);
    expect(ban.json().banned).toBe(true);

    const lookupBanned = await app!.inject({
      method: "GET",
      url: "/v1/integrations/discord/players/" + discordUserId,
      headers: authHeader
    });
    expect(lookupBanned.statusCode).toBe(200);
    expect(lookupBanned.json().player.isBanned).toBe(true);

    const unban = await app!.inject({
      method: "DELETE",
      url: "/v1/integrations/discord/players/" + discordUserId + "/ban",
      headers: authHeader,
      payload: { actorDiscordId, actorUsername: "test-admin" }
    });
    expect(unban.statusCode).toBe(200);
    expect(unban.json().unbanned).toBe(true);
  });

  it("stores reports, suggestions, and announcements", async () => {
    const report = await app!.inject({
      method: "POST",
      url: "/v1/integrations/discord/reports",
      headers: authHeader,
      payload: {
        reporterDiscordId: actorDiscordId,
        reporterUsername: "test-reporter",
        targetDiscordId: discordUserId,
        targetUsername: "community-tester",
        category: "bug",
        details: "Integration test report details"
      }
    });
    expect(report.statusCode).toBe(201);
    expect(report.json().report.status).toBe("open");

    const suggestion = await app!.inject({
      method: "POST",
      url: "/v1/integrations/discord/suggestions",
      headers: authHeader,
      payload: {
        authorDiscordId: actorDiscordId,
        authorUsername: "test-suggester",
        body: "Please add a new community feature."
      }
    });
    expect(suggestion.statusCode).toBe(201);
    expect(suggestion.json().suggestion.status).toBe("pending");

    const announcement = await app!.inject({
      method: "POST",
      url: "/v1/integrations/discord/announcements",
      headers: authHeader,
      payload: {
        actorDiscordId,
        actorUsername: "test-admin",
        title: "Integration test announcement",
        body: "This is a temporary test message.",
        severity: "info",
        durationHours: 1
      }
    });
    expect(announcement.statusCode).toBe(201);
    expect(announcement.json().announcement.title).toBe("Integration test announcement");

    const status = await app!.inject({
      method: "GET",
      url: "/v1/integrations/discord/status",
      headers: authHeader
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().stats.accounts).toBeGreaterThanOrEqual(1);
    expect(status.json().stats.open_reports).toBeGreaterThanOrEqual(1);
  });
});

afterAll(async () => {
  if (app) await app.close();
  if (db) {
    if (communityUserId) await db.query("DELETE FROM users WHERE id = $1", [communityUserId]);
    await db.query("DELETE FROM community_reports WHERE reporter_discord_id = $1", [actorDiscordId]);
    await db.query("DELETE FROM community_suggestions WHERE author_discord_id = $1", [actorDiscordId]);
    await db.query("DELETE FROM community_announcements WHERE created_by_discord_id = $1", [actorDiscordId]);
    await db.query("DELETE FROM community_admin_audit WHERE actor_discord_id IN ($1, $2)", [actorDiscordId, discordUserId]);
    await db.end();
  }
});
