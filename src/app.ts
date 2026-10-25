import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import playerRoutes from "./routes/player.js";
import presenceRoutes from "./routes/presence.js";
import sessionRoutes from "./routes/sessions.js";
import matchmakingRoutes from "./routes/matchmaking.js";
import clientRoutes from "./routes/client.js";
import socialRoutes from "./routes/social.js";
import discordIntegrationRoutes from "./routes/discord-integration.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email?: string | null; sid?: string };
    user: { sub: string; email?: string | null; sid?: string };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    bodyLimit: 1_048_576,
    trustProxy: env.NODE_ENV === "production"
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "unauthorized" });
      return;
    }

    try {
      const sessionId = request.user.sid;
      if (typeof sessionId === "string") {
        const active = await pool.query(
          "SELECT 1 FROM auth_sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > NOW()",
          [sessionId, request.user.sub]
        );
        if (!active.rowCount) {
          await reply.code(401).send({ error: "unauthorized" });
          return;
        }
      }

      const ban = await pool.query(
        "SELECT 1 FROM community_bans WHERE user_id = $1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1",
        [request.user.sub]
      );
      if (ban.rowCount) {
        await reply.code(403).send({ error: "account_suspended" });
      }
    } catch (error) {
      request.log.error({ err: error }, "Authentication state validation failed");
      await reply.code(503).send({ error: "authentication_state_unavailable" });
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;
    if (request.url.startsWith("/v1/integrations/discord/") || request.url === "/v1/client/bootstrap") return;
    try {
      const result = await pool.query<{ setting_value: { enabled?: boolean; reason?: string | null } }>(
        "SELECT setting_value FROM community_settings WHERE setting_key = 'maintenance'"
      );
      const maintenance = result.rows[0]?.setting_value;
      if (maintenance?.enabled === true) {
        await reply.code(503).send({
          error: "maintenance_mode",
          message: maintenance.reason || "Community services are temporarily unavailable for maintenance."
        });
      }
    } catch (error) {
      request.log.error({ err: error }, "Maintenance state check failed");
      await reply.code(503).send({ error: "service_state_unavailable" });
    }
  });

  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/v1/auth" });
  await app.register(playerRoutes, { prefix: "/v1/player" });
  await app.register(presenceRoutes, { prefix: "/v1/presence" });
  await app.register(sessionRoutes, { prefix: "/v1/sessions" });
  await app.register(matchmakingRoutes, { prefix: "/v1/matchmaking" });
  await app.register(clientRoutes, { prefix: "/v1/client" });
  await app.register(socialRoutes, { prefix: "/v1/social" });
  await app.register(discordIntegrationRoutes, { prefix: "/v1/integrations/discord" });

  app.get("/", async () => ({
    service: "community-online-backend",
    apiVersion: "v1",
    status: "ok"
  }));

  return app;
}
