import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("worker extracts a thumbnail from the first available video frame", () => {
  const worker = readFileSync("apps/worker/src/index.ts", "utf8");
  const thumbnailCommand = worker.slice(
    worker.indexOf('const thumbnailPath = join(outputDirectory, "thumb.jpg")'),
    worker.indexOf('await run("ffmpeg", [', worker.indexOf('"-strict", "unofficial"') + 1)
  );

  assert.doesNotMatch(thumbnailCommand, /"-ss",\s*"00:00:01"/);
  assert.match(worker, /"-frames:v",\s*"1"/);
  assert.match(worker, /"-strict",\s*"unofficial"/);
});
