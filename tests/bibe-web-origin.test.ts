import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("BIBE web images use the preview's own origin for API requests", () => {
  const workflow = readFileSync(".github/workflows/bibe-preview-images.yml", "utf8");
  const reviewEvents = readFileSync("apps/web/src/lib/use-review-events.ts", "utf8");

  assert.match(workflow, /NEXT_PUBLIC_API_URL=\/api/);
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_API_URL=https:\/\/openreview-pr-/);
  assert.match(reviewEvents, /new URL\(`\$\{API_URL\}\$\{path\}`, window\.location\.origin\)/);
});
