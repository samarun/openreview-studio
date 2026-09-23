import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";

test("preview Sentry reporting excludes raw API and worker error details", async () => {
  const envelopes: string[] = [];
  let envelope = "";
  const server = createServer((request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(new URL(request.url ?? "", "http://localhost").pathname, "/api/2/envelope/");
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { envelope += chunk; });
    request.on("end", () => {
      envelopes.push(envelope);
      envelope = "";
      response.writeHead(200);
      response.end("ok");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.SENTRY_DSN = `http://0123456789abcdef0123456789abcdef@127.0.0.1:${address.port}/2`;
    process.env.SENTRY_ENVIRONMENT = "bibe-test";
    const { reportServerError, flushErrorReports } = await import("../apps/api/src/lib/sentry.ts");
    reportServerError(new Error("private-upload-name-and-token"));
    await flushErrorReports();
    const { reportTranscodeError, flushErrorReports: flushWorkerReports } = await import("../apps/worker/src/sentry.ts");
    reportTranscodeError(new Error("private-video-name-and-token"));
    await flushWorkerReports();
    assert.equal(envelopes.length, 2);
    assert.match(envelopes[0], /OpenReview API internal error/);
    assert.match(envelopes[1], /OpenReview transcode job failed/);
    for (const body of envelopes) {
      assert.doesNotMatch(body, /private-(upload|video)-name-and-token/);
      assert.doesNotMatch(body, /"request":/);
      assert.doesNotMatch(body, /"user":/);
    }
  } finally {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
