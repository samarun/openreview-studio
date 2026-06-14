import assert from "node:assert/strict";
import { test } from "node:test";

const API_URL = process.env.TEST_API_URL ?? "http://localhost:4000";

async function request<T>(path: string) {
  const response = await fetch(`${API_URL}${path}`);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  return { response, payload: payload as T };
}

test("GET /health returns ok", async () => {
  const { response, payload } = await request<{ status: string; service: string }>("/health");
  assert.equal(response.status, 200);
  assert.equal(payload.status, "ok");
  assert.equal(payload.service, "api");
});

test("GET /health/ready reports dependency checks", async () => {
  const { response, payload } = await request<{
    status: string;
    checks: { database: boolean; redis: boolean; originalsBucket: boolean; proxiesBucket: boolean };
  }>("/health/ready");

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ready");
  assert.equal(payload.checks.database, true);
  assert.equal(payload.checks.redis, true);
  assert.equal(payload.checks.originalsBucket, true);
  assert.equal(payload.checks.proxiesBucket, true);
});
