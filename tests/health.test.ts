import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const appPromise = buildApp();

describe("health endpoints", () => {
  it("reports that the process is alive", async () => {
    const app = await appPromise;
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("exposes the API identity", async () => {
    const app = await appPromise;
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.json().apiVersion).toBe("v1");
  });
});

afterAll(async () => {
  const app = await appPromise;
  await app.close();
});
