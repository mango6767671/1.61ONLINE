import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";

const app = await buildApp();

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exit(1);
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
