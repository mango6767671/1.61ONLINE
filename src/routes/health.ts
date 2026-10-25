import type { FastifyPluginAsync } from "fastify";
import { pool } from "../db/pool.js";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/live", async () => ({ status: "ok" }));

  app.get("/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready", services: { database: "up" } };
    } catch {
      return reply.code(503).send({
        status: "not_ready",
        services: { database: "down" }
      });
    }
  });
};

export default healthRoutes;
