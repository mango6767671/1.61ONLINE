import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";

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
    methods: ["GET", "POST", "OPTIONS"]
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_SECRET });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });

  await app.register(healthRoutes, { prefix: "/health" });
  await app.register(authRoutes, { prefix: "/v1/auth" });

  app.get("/", async () => ({
    service: "community-online-backend",
    apiVersion: "v1",
    status: "ok"
  }));

  return app;
}
