import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("seed blocks production without ALLOW_DEMO_SEED", () => {
  const result = spawnSync("pnpm", ["--filter", "@openreview/db", "exec", "tsx", "prisma/seed.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", ALLOW_DEMO_SEED: undefined },
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Demo seed is blocked in production/);
});
