import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/online_test";
  process.env.JWT_SECRET ??= "test-only-secret-that-is-at-least-32-characters";
  process.env.CORS_ORIGIN ??= "http://localhost:5173";
  const { buildApp } = await import("../src/app.js");
  app = await buildApp();
});

describe("health endpoints", () => {
  it("reports that the process is alive", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("exposes the API identity", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.json().apiVersion).toBe("v1");
  });

  it("rejects unauthenticated player requests", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/player/profile" });
    expect(response.statusCode).toBe(401);
  });
});

afterAll(async () => {
  await app?.close();
});
