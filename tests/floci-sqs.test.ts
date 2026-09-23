import assert from "node:assert/strict";
import { test } from "node:test";
import { FlociSqsClient } from "../packages/shared/src/floci-sqs.ts";

const endpoint = "http://floci:4566";
const queueUrl = `${endpoint}/000000000000/openreview-pr-1-transcode`;

test("Floci SQS transport uses the JSON protocol for send, receive, heartbeat, and acknowledge", async () => {
  const calls: Array<{ action: string; body: Record<string, unknown> }> = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const action = new Headers(init?.headers).get("x-amz-target") ?? "";
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ action, body });
    if (action === "AmazonSQS.ReceiveMessage") {
      return new Response(JSON.stringify({ Messages: [{ MessageId: "1", Body: "{}", ReceiptHandle: "receipt" }] }));
    }
    return new Response("{}");
  };
  const client = new FlociSqsClient(endpoint, queueUrl, fakeFetch);
  await client.send({ assetVersionId: "version-1", originalKey: "original.mp4" });
  assert.deepEqual(await client.receive(), [{ MessageId: "1", Body: "{}", ReceiptHandle: "receipt" }]);
  await client.extendVisibility("receipt");
  await client.delete("receipt");
  assert.deepEqual(calls.map((call) => call.action), [
    "AmazonSQS.SendMessage",
    "AmazonSQS.ReceiveMessage",
    "AmazonSQS.ChangeMessageVisibility",
    "AmazonSQS.DeleteMessage"
  ]);
  assert.equal(calls[0]?.body.QueueUrl, queueUrl);
  assert.deepEqual(JSON.parse(String(calls[0]?.body.MessageBody)), {
    assetVersionId: "version-1",
    originalKey: "original.mp4"
  });
  assert.equal(calls[1]?.body.VisibilityTimeout, 900);
});

test("Floci SQS transport rejects real AWS and cross-account queue URLs", () => {
  assert.throws(() => new FlociSqsClient("https://sqs.us-east-1.amazonaws.com", queueUrl), /local HTTP/);
  assert.throws(() => new FlociSqsClient(endpoint, `${endpoint}/123456789012/jobs`), /local account/);
  assert.throws(() => new FlociSqsClient(endpoint, "http://other:4566/000000000000/jobs"), /emulator endpoint/);
});

test("Floci SQS transport fails closed on server errors", async () => {
  const client = new FlociSqsClient(endpoint, queueUrl, async () => new Response("blocked", { status: 403 }));
  await assert.rejects(client.send({ assetVersionId: "v", originalKey: "k" }), /HTTP 403/);
});
