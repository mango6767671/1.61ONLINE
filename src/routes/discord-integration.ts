import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";

const snowflake = z.string().regex(/^\d{17,20}$/);
const actorSchema = z.object({
  actorDiscordId: snowflake,
  actorUsername: z.string().trim().min(1).max(100)
});
const signupSchema = z.object({
  discordUserId: snowflake,
  username: z.string().trim().min(1).max(64),
  globalName: z.string().trim().max(64).nullable().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional()
}).strict();
const reportSchema = z.object({
  reporterDiscordId: snowflake,
  reporterUsername: z.string().trim().min(1).max(100),
  targetDiscordId: snowflake.optional(),
  targetUsername: z.string().trim().max(100).optional(),
  category: z.enum(["cheating", "harassment", "exploit", "bug", "other"]),
  details: z.string().trim().max(1500).optional()
}).strict();
const announceSchema = actorSchema.extend({
  title: z.string().trim().min(3).max(100),
  body: z.string().trim().min(3).max(2000),
  severity: z.enum(["info", "success", "warning", "maintenance"]).default("info"),
  durationHours: z.number().int().min(1).max(720).optional()
}).strict();
const banSchema = actorSchema.extend({
  discordUserId: snowflake,
  reason: z.string().trim().min(3).max(500),
  durationMinutes: z.number().int().min(1).max(525600).optional()
}).strict();
const reportResolutionSchema = actorSchema.extend({
  status: z.enum(["resolved", "dismissed"]),
  resolution: z.string().trim().min(3).max(1000)
}).strict();
const maintenanceSchema = actorSchema.extend({
  enabled: z.boolean(),
  reason: z.string().trim().max(500).optional()
}).strict();

const integrationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", async (request, reply) => {
    const expected = env.DISCORD_BOT_API_KEY;
    if (!expected) {
      await reply.code(503).send({ error: "discord_integration_not_configured" });
      return;
    }
    const raw = request.headers["x-community-bot-key"];
    const supplied = Array.isArray(raw) ? raw[0] : raw;
    if (!supplied) {
      await reply.code(401).send({ error: "unauthorized_integration" });
      return;
    }
    const expectedBytes = Buffer.from(expected, "utf8");
    const suppliedBytes = Buffer.from(supplied, "utf8");
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      await reply.code(401).send({ error: "unauthorized_integration" });
    }
  });

  app.get("/status", async (_request, reply) => {
    const dbCheck = await pool.query("SELECT NOW() AS server_time");
    const stats = await pool.query<{
      accounts: number;
      active_players: number;
      open_sessions: number;
      queued_players: number;
      active_bans: number;
      open_reports: number;
      open_tickets: number;
      pending_suggestions: number;
    }>(
      "SELECT (SELECT COUNT(*)::int FROM users) AS accounts, " +
      "(SELECT COUNT(*)::int FROM player_presence WHERE last_seen_at > NOW() - INTERVAL '90 seconds') AS active_players, " +
      "(SELECT COUNT(*)::int FROM game_sessions WHERE state = 'open') AS open_sessions, " +
      "(SELECT COUNT(*)::int FROM matchmaking_queue) AS queued_players, " +
      "(SELECT COUNT(*)::int FROM community_bans WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS active_bans, " +
      "(SELECT COUNT(*)::int FROM community_reports WHERE status = 'open') AS open_reports, " +
      "(SELECT COUNT(*)::int FROM community_tickets WHERE status = 'open') AS open_tickets, " +
      "(SELECT COUNT(*)::int FROM community_suggestions WHERE status = 'pending') AS pending_suggestions"
    );
    const maintenance = await getMaintenance();
    return {
      service: "1.61ONLINE community backend",
      status: "online",
      database: "connected",
      serverTime: dbCheck.rows[0].server_time,
      maintenance,
      stats: stats.rows[0]
    };
  });

  app.post("/signup", async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const data = parsed.data;

    const displayName = normalizeDisplayName(data.globalName || data.username, data.discordUserId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{
        user_id: string;
        display_name: string | null;
        rank: number;
        cash: string;
        bank: string;
        linked_at: Date;
      }>(
        "SELECT d.user_id, p.display_name, p.rank, p.cash::text, p.bank::text, d.linked_at " +
        "FROM discord_accounts d JOIN player_profiles p ON p.user_id = d.user_id WHERE d.discord_user_id = $1 FOR UPDATE OF d",
        [data.discordUserId]
      );

      if (found.rowCount) {
        await client.query(
          "UPDATE discord_accounts SET username = $2, global_name = $3, avatar_url = $4, updated_at = NOW() WHERE discord_user_id = $1",
          [data.discordUserId, data.username, data.globalName ?? null, data.avatarUrl ?? null]
        );
        await client.query("COMMIT");
        const user = found.rows[0]!;
        return {
          created: false,
          account: {
            id: user.user_id,
            discordUserId: data.discordUserId,
            displayName: user.display_name,
            rank: user.rank,
            cash: user.cash,
            bank: user.bank,
            linkedAt: user.linked_at
          }
        };
      }

      const created = await client.query<{ id: string }>(
        "INSERT INTO users (email, password_hash) VALUES (NULL, NULL) RETURNING id"
      );
      const userId = created.rows[0]!.id;
      await client.query("INSERT INTO player_profiles (user_id, display_name) VALUES ($1, $2)", [userId, displayName]);
      const linked = await client.query<{ linked_at: Date }>(
        "INSERT INTO discord_accounts (discord_user_id, user_id, username, global_name, avatar_url) " +
        "VALUES ($1, $2, $3, $4, $5) RETURNING linked_at",
        [data.discordUserId, userId, data.username, data.globalName ?? null, data.avatarUrl ?? null]
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        created: true,
        account: {
          id: userId,
          discordUserId: data.discordUserId,
          displayName,
          rank: 1,
          cash: "0",
          bank: "0",
          linkedAt: linked.rows[0]!.linked_at
        }
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        const existing = await pool.query<{ user_id: string; display_name: string | null; rank: number }>(
          "SELECT d.user_id, p.display_name, p.rank FROM discord_accounts d JOIN player_profiles p ON p.user_id = d.user_id WHERE d.discord_user_id = $1",
          [data.discordUserId]
        );
        if (existing.rowCount) {
          return {
            created: false,
            account: { id: existing.rows[0]!.user_id, discordUserId: data.discordUserId, displayName: existing.rows[0]!.display_name, rank: existing.rows[0]!.rank }
          };
        }
      }
      request.log.error({ err: error }, "Discord signup failed");
      return reply.code(500).send({ error: "signup_failed" });
    } finally {
      client.release();
    }
  });

  app.get("/players", async (request, reply) => {
    const query = z.object({
      query: z.string().trim().min(2).max(32).optional(),
      limit: z.coerce.number().int().min(1).max(25).default(10)
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "invalid_query" });

    const result = await pool.query(
      "SELECT d.discord_user_id AS \"discordUserId\", d.username, d.global_name AS \"globalName\", " +
      "p.display_name AS \"displayName\", p.rank, " +
      "CASE WHEN pr.last_seen_at > NOW() - INTERVAL '90 seconds' THEN pr.status ELSE 'offline' END AS status " +
      "FROM discord_accounts d JOIN player_profiles p ON p.user_id = d.user_id " +
      "LEFT JOIN player_presence pr ON pr.user_id = d.user_id " +
      "WHERE ($1::text IS NULL OR p.display_name ILIKE $1 ESCAPE '!') " +
      "ORDER BY p.rank DESC, p.display_name ASC LIMIT $2",
      [query.data.query ? "%" + query.data.query.replace(/[!%_]/g, (char) => "!" + char) + "%" : null, query.data.limit]
    );
    return { players: result.rows };
  });

  app.get("/players/:discordUserId", async (request, reply) => {
    const params = z.object({ discordUserId: snowflake }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_discord_user_id" });
    const result = await pool.query<{
      user_id: string;
      discord_user_id: string;
      username: string;
      global_name: string | null;
      display_name: string | null;
      rank: number;
      cash: string;
      bank: string;
      status: string;
      is_banned: boolean;
      ban_reason: string | null;
      ban_expires_at: Date | null;
    }>(
      "SELECT u.id AS user_id, d.discord_user_id, d.username, d.global_name, p.display_name, p.rank, p.cash::text, p.bank::text, " +
      "CASE WHEN pr.last_seen_at > NOW() - INTERVAL '90 seconds' THEN pr.status ELSE 'offline' END AS status, " +
      "EXISTS(SELECT 1 FROM community_bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > NOW())) AS is_banned, " +
      "(SELECT b.reason FROM community_bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > NOW()) ORDER BY b.created_at DESC LIMIT 1) AS ban_reason, " +
      "(SELECT b.expires_at FROM community_bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > NOW()) ORDER BY b.created_at DESC LIMIT 1) AS ban_expires_at " +
      "FROM discord_accounts d JOIN users u ON u.id = d.user_id JOIN player_profiles p ON p.user_id = u.id " +
      "LEFT JOIN player_presence pr ON pr.user_id = u.id WHERE d.discord_user_id = $1",
      [params.data.discordUserId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "discord_account_not_found" });
    const p = result.rows[0]!;
    return { player: { userId: p.user_id, discordUserId: p.discord_user_id, username: p.username, globalName: p.global_name, displayName: p.display_name, rank: p.rank, cash: p.cash, bank: p.bank, status: p.status, isBanned: p.is_banned, banReason: p.ban_reason, banExpiresAt: p.ban_expires_at } };
  });

  app.get("/sessions", async () => {
    const result = await pool.query(
      "SELECT s.id, s.name, s.region, s.game_mode AS \"gameMode\", s.max_players AS \"maxPlayers\", " +
      "COUNT(m.user_id)::int AS \"playerCount\", s.created_at AS \"createdAt\" " +
      "FROM game_sessions s LEFT JOIN session_members m ON m.session_id = s.id " +
      "WHERE s.state = 'open' AND s.visibility = 'public' GROUP BY s.id ORDER BY s.created_at DESC LIMIT 10"
    );
    return { sessions: result.rows };
  });

  app.get("/announcements", async () => {
    const result = await pool.query(
      "SELECT id, title, body, severity, created_by_username AS \"createdBy\", created_at AS \"createdAt\", expires_at AS \"expiresAt\" " +
      "FROM community_announcements WHERE active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) " +
      "ORDER BY created_at DESC LIMIT 10"
    );
    return { announcements: result.rows };
  });

  app.post("/reports", async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    if (parsed.data.targetDiscordId === parsed.data.reporterDiscordId) return reply.code(400).send({ error: "cannot_report_self" });

    const result = await pool.query<{ id: string; created_at: Date }>(
      "INSERT INTO community_reports (reporter_discord_id, reporter_username, target_discord_id, target_username, category, details) " +
      "VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at",
      [parsed.data.reporterDiscordId, parsed.data.reporterUsername, parsed.data.targetDiscordId ?? null, parsed.data.targetUsername ?? null, parsed.data.category, parsed.data.details ?? null]
    );
    return reply.code(201).send({ report: { id: result.rows[0]!.id, status: "open", createdAt: result.rows[0]!.created_at } });
  });

  app.get("/reports", async (request, reply) => {
    const parsed = z.object({ status: z.enum(["open", "resolved", "dismissed", "all"]).default("open"), limit: z.coerce.number().int().min(1).max(50).default(25) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
    const result = await pool.query(
      "SELECT id, reporter_discord_id AS \"reporterDiscordId\", reporter_username AS \"reporterUsername\", " +
      "target_discord_id AS \"targetDiscordId\", target_username AS \"targetUsername\", category, details, status, " +
      "created_at AS \"createdAt\", reviewed_by_username AS \"reviewedBy\", resolution " +
      "FROM community_reports WHERE ($1::text = 'all' OR status = $1) ORDER BY created_at DESC LIMIT $2",
      [parsed.data.status, parsed.data.limit]
    );
    return { reports: result.rows };
  });

  app.patch("/reports/:reportId", async (request, reply) => {
    const params = z.object({ reportId: z.string().uuid() }).safeParse(request.params);
    const parsed = reportResolutionSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_report_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const updated = await pool.query(
      "UPDATE community_reports SET status = $2, reviewed_at = NOW(), reviewed_by_discord_id = $3, reviewed_by_username = $4, resolution = $5 " +
      "WHERE id = $1 AND status = 'open' RETURNING id",
      [params.data.reportId, parsed.data.status, parsed.data.actorDiscordId, parsed.data.actorUsername, parsed.data.resolution]
    );
    if (!updated.rowCount) return reply.code(404).send({ error: "open_report_not_found" });
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "report.resolve", undefined, { reportId: params.data.reportId, status: parsed.data.status, resolution: parsed.data.resolution });
    return { resolved: true, reportId: params.data.reportId, status: parsed.data.status };
  });

  app.post("/players/:discordUserId/ban", async (request, reply) => {
    const params = z.object({ discordUserId: snowflake }).safeParse(request.params);
    const parsed = banSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_discord_user_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    if (params.data.discordUserId === parsed.data.actorDiscordId) return reply.code(400).send({ error: "cannot_ban_self" });

    const account = await pool.query<{ user_id: string }>("SELECT user_id FROM discord_accounts WHERE discord_user_id = $1", [params.data.discordUserId]);
    if (!account.rowCount) return reply.code(404).send({ error: "discord_account_not_found" });
    const userId = account.rows[0]!.user_id;
    const client = await pool.connect();
    const expiresAt = parsed.data.durationMinutes ? new Date(Date.now() + parsed.data.durationMinutes * 60_000) : null;
    try {
      await client.query("BEGIN");
      await client.query("UPDATE community_bans SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
      const ban = await client.query<{ id: string }>(
        "INSERT INTO community_bans (user_id, reason, banned_by_discord_id, banned_by_username, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [userId, parsed.data.reason, parsed.data.actorDiscordId, parsed.data.actorUsername, expiresAt]
      );
      await client.query("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
      await client.query("COMMIT");
      await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "player.ban", params.data.discordUserId, { reason: parsed.data.reason, durationMinutes: parsed.data.durationMinutes ?? null, banId: ban.rows[0]!.id });
      return { banned: true, discordUserId: params.data.discordUserId, expiresAt, banId: ban.rows[0]!.id };
    } catch (error) {
      await client.query("ROLLBACK");
      request.log.error({ err: error }, "Discord player ban failed");
      return reply.code(500).send({ error: "ban_failed" });
    } finally {
      client.release();
    }
  });

  app.delete("/players/:discordUserId/ban", async (request, reply) => {
    const params = z.object({ discordUserId: snowflake }).safeParse(request.params);
    const parsed = actorSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_discord_user_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const account = await pool.query<{ user_id: string }>("SELECT user_id FROM discord_accounts WHERE discord_user_id = $1", [params.data.discordUserId]);
    if (!account.rowCount) return reply.code(404).send({ error: "discord_account_not_found" });
    const revoked = await pool.query(
      "UPDATE community_bans SET revoked_at = NOW(), revoked_by_discord_id = $2 WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) RETURNING id",
      [account.rows[0]!.user_id, parsed.data.actorDiscordId]
    );
    if (!revoked.rowCount) return reply.code(404).send({ error: "active_ban_not_found" });
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "player.unban", params.data.discordUserId, { revokedBanIds: revoked.rows.map((r: { id: string }) => r.id) });
    return { unbanned: true, discordUserId: params.data.discordUserId };
  });

  app.post("/announcements", async (request, reply) => {
    const parsed = announceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const expiresAt = parsed.data.durationHours ? new Date(Date.now() + parsed.data.durationHours * 3_600_000) : null;
    const result = await pool.query<{ id: string; created_at: Date }>(
      "INSERT INTO community_announcements (title, body, severity, created_by_discord_id, created_by_username, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at",
      [parsed.data.title, parsed.data.body, parsed.data.severity, parsed.data.actorDiscordId, parsed.data.actorUsername, expiresAt]
    );
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "announcement.create", undefined, { announcementId: result.rows[0]!.id, title: parsed.data.title, severity: parsed.data.severity });
    return reply.code(201).send({ announcement: { id: result.rows[0]!.id, title: parsed.data.title, body: parsed.data.body, severity: parsed.data.severity, createdAt: result.rows[0]!.created_at, expiresAt } });
  });

  app.delete("/announcements/:announcementId", async (request, reply) => {
    const params = z.object({ announcementId: z.string().uuid() }).safeParse(request.params);
    const parsed = actorSchema.safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_announcement_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const removed = await pool.query("UPDATE community_announcements SET active = FALSE, removed_at = NOW(), removed_by_discord_id = $2 WHERE id = $1 AND active = TRUE RETURNING id", [params.data.announcementId, parsed.data.actorDiscordId]);
    if (!removed.rowCount) return reply.code(404).send({ error: "active_announcement_not_found" });
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "announcement.remove", undefined, { announcementId: params.data.announcementId });
    return { removed: true, announcementId: params.data.announcementId };
  });

  app.put("/maintenance", async (request, reply) => {
    const parsed = maintenanceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    const value = { enabled: parsed.data.enabled, reason: parsed.data.enabled ? (parsed.data.reason || "Scheduled maintenance") : null };
    await pool.query(
      "INSERT INTO community_settings (setting_key, setting_value, updated_by_discord_id, updated_at) VALUES ('maintenance', $1::jsonb, $2, NOW()) " +
      "ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by_discord_id = EXCLUDED.updated_by_discord_id, updated_at = NOW()",
      [JSON.stringify(value), parsed.data.actorDiscordId]
    );
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "maintenance.toggle", undefined, value);
    return { maintenance: value };
  });

  app.post("/audit", async (request, reply) => {
    const parsed = actorSchema.extend({
      action: z.string().trim().min(3).max(80),
      targetDiscordId: snowflake,
      details: z.record(z.unknown()).default({})
    }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, parsed.data.action, parsed.data.targetDiscordId, parsed.data.details);
    return reply.code(201).send({ recorded: true });
  });

  app.get("/audit", async (request, reply) => {
    const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
    const result = await pool.query(
      "SELECT id, actor_discord_id AS \"actorDiscordId\", actor_username AS \"actorUsername\", action, target_discord_id AS \"targetDiscordId\", details, created_at AS \"createdAt\" FROM community_admin_audit ORDER BY created_at DESC LIMIT $1",
      [parsed.data.limit]
    );
    return { entries: result.rows };
  });

  app.get("/tickets", async (_request, reply) => {
    const result = await pool.query(
      "SELECT id, opener_discord_id AS \"openerDiscordId\", opener_username AS \"openerUsername\", topic, channel_id AS \"channelId\", status, created_at AS \"createdAt\" FROM community_tickets WHERE status = 'open' ORDER BY created_at ASC LIMIT 100"
    );
    return { tickets: result.rows };
  });

  app.post("/tickets", async (request, reply) => {
    const parsed = z.object({ openerDiscordId: snowflake, openerUsername: z.string().trim().min(1).max(100), topic: z.string().trim().min(3).max(120) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const existing = await pool.query<{ id: string; channel_id: string | null }>(
      "SELECT id, channel_id FROM community_tickets WHERE opener_discord_id = $1 AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      [parsed.data.openerDiscordId]
    );
    if (existing.rowCount) return reply.code(409).send({ error: "ticket_already_open", ticket: { id: existing.rows[0]!.id, channelId: existing.rows[0]!.channel_id } });
    const created = await pool.query<{ id: string; created_at: Date }>(
      "INSERT INTO community_tickets (opener_discord_id, opener_username, topic) VALUES ($1, $2, $3) RETURNING id, created_at",
      [parsed.data.openerDiscordId, parsed.data.openerUsername, parsed.data.topic]
    );
    await writeAudit(parsed.data.openerDiscordId, parsed.data.openerUsername, "ticket.create", parsed.data.openerDiscordId, { ticketId: created.rows[0]!.id, topic: parsed.data.topic });
    return reply.code(201).send({ ticket: { id: created.rows[0]!.id, createdAt: created.rows[0]!.created_at, status: "open" } });
  });

  app.put("/tickets/:ticketId/channel", async (request, reply) => {
    const params = z.object({ ticketId: z.string().uuid() }).safeParse(request.params);
    const parsed = z.object({ channelId: snowflake }).strict().safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_ticket_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const result = await pool.query("UPDATE community_tickets SET channel_id = $2 WHERE id = $1 AND status = 'open' RETURNING id", [params.data.ticketId, parsed.data.channelId]);
    if (!result.rowCount) return reply.code(404).send({ error: "open_ticket_not_found" });
    return { linked: true };
  });

  app.get("/tickets/by-channel/:channelId", async (request, reply) => {
    const params = z.object({ channelId: snowflake }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "invalid_channel_id" });
    const result = await pool.query(
      "SELECT id, opener_discord_id AS \"openerDiscordId\", opener_username AS \"openerUsername\", topic, status FROM community_tickets WHERE channel_id = $1",
      [params.data.channelId]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "ticket_not_found" });
    return { ticket: result.rows[0] };
  });

  app.post("/tickets/:ticketId/close", async (request, reply) => {
    const params = z.object({ ticketId: z.string().uuid() }).safeParse(request.params);
    const parsed = actorSchema.extend({ reason: z.string().trim().max(500).optional() }).strict().safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_ticket_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const result = await pool.query(
      "UPDATE community_tickets SET status = 'closed', closed_at = NOW(), closed_by_discord_id = $2, close_reason = $3 WHERE id = $1 AND status = 'open' RETURNING opener_discord_id",
      [params.data.ticketId, parsed.data.actorDiscordId, parsed.data.reason ?? null]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "open_ticket_not_found" });
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "ticket.close", result.rows[0]!.opener_discord_id, { ticketId: params.data.ticketId, reason: parsed.data.reason ?? null });
    return { closed: true, ticketId: params.data.ticketId };
  });

  app.post("/suggestions", async (request, reply) => {
    const parsed = z.object({ authorDiscordId: snowflake, authorUsername: z.string().trim().min(1).max(100), body: z.string().trim().min(8).max(1500) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const created = await pool.query<{ id: string; created_at: Date }>(
      "INSERT INTO community_suggestions (author_discord_id, author_username, body) VALUES ($1, $2, $3) RETURNING id, created_at",
      [parsed.data.authorDiscordId, parsed.data.authorUsername, parsed.data.body]
    );
    return reply.code(201).send({ suggestion: { id: created.rows[0]!.id, status: "pending", createdAt: created.rows[0]!.created_at } });
  });

  app.get("/suggestions", async (request, reply) => {
    const parsed = z.object({ status: z.enum(["pending", "planned", "implemented", "declined", "all"]).default("pending"), limit: z.coerce.number().int().min(1).max(50).default(25) }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
    const result = await pool.query(
      "SELECT id, author_discord_id AS \"authorDiscordId\", author_username AS \"authorUsername\", body, status, created_at AS \"createdAt\", staff_note AS \"staffNote\" FROM community_suggestions WHERE ($1::text = 'all' OR status = $1) ORDER BY created_at DESC LIMIT $2",
      [parsed.data.status, parsed.data.limit]
    );
    return { suggestions: result.rows };
  });

  app.patch("/suggestions/:suggestionId", async (request, reply) => {
    const params = z.object({ suggestionId: z.string().uuid() }).safeParse(request.params);
    const parsed = actorSchema.extend({ status: z.enum(["planned", "implemented", "declined"]), staffNote: z.string().trim().max(1000).optional() }).strict().safeParse(request.body);
    if (!params.success) return reply.code(400).send({ error: "invalid_suggestion_id" });
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const result = await pool.query(
      "UPDATE community_suggestions SET status = $2, reviewed_at = NOW(), reviewed_by_discord_id = $3, reviewed_by_username = $4, staff_note = $5 WHERE id = $1 AND status IN ('pending', 'planned') RETURNING id",
      [params.data.suggestionId, parsed.data.status, parsed.data.actorDiscordId, parsed.data.actorUsername, parsed.data.staffNote ?? null]
    );
    if (!result.rowCount) return reply.code(404).send({ error: "suggestion_not_found" });
    await writeAudit(parsed.data.actorDiscordId, parsed.data.actorUsername, "suggestion.update", undefined, { suggestionId: params.data.suggestionId, status: parsed.data.status, staffNote: parsed.data.staffNote ?? null });
    return { updated: true, suggestionId: params.data.suggestionId, status: parsed.data.status };
  });
};

async function getMaintenance(): Promise<{ enabled: boolean; reason: string | null }> {
  const result = await pool.query<{ setting_value: { enabled?: boolean; reason?: string | null } }>(
    "SELECT setting_value FROM community_settings WHERE setting_key = 'maintenance'"
  );
  const value = result.rows[0]?.setting_value;
  return { enabled: value?.enabled === true, reason: value?.enabled ? (value.reason ?? "Scheduled maintenance") : null };
}

function normalizeDisplayName(value: string, discordUserId: string): string {
  const cleaned = value.normalize("NFKC").replace(/[^\p{L}\p{N} _-]/gu, "").trim().replace(/\s+/g, " ").slice(0, 32);
  return cleaned.length >= 3 ? cleaned : `Player_${discordUserId.slice(-6)}`;
}

async function writeAudit(
  actorDiscordId: string,
  actorUsername: string,
  action: string,
  targetDiscordId?: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  await pool.query(
    "INSERT INTO community_admin_audit (actor_discord_id, actor_username, action, target_discord_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [actorDiscordId, actorUsername, action, targetDiscordId ?? null, JSON.stringify(details)]
  );
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export default integrationRoutes;
