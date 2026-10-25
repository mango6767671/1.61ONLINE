import { readFile } from "node:fs/promises";
import { pool } from "../src/db/pool.js";

try {
  const sql = await readFile(new URL("../migrations/001_initial.sql", import.meta.url), "utf8");
  await pool.query(sql);
  console.info("Database migration 001 applied.");
} catch (error) {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
