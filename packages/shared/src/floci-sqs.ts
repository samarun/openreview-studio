/**
 * Small JSON-protocol client for the local Floci SQS emulator only.
 * It deliberately rejects AWS endpoints; a real-AWS backend must use the AWS SDK.
 */
export type FlociSqsMessage = {
  MessageId?: string;
  Body?: string;
  ReceiptHandle?: string;
};

export type FlociSqsFetch = typeof fetch;

export class FlociSqsClient {
  readonly endpoint: string;
  readonly queueUrl: string;
  private readonly request: FlociSqsFetch;

  constructor(endpoint: string, queueUrl: string, request: FlociSqsFetch = fetch) {
    const base = new URL(endpoint);
    const queue = new URL(queueUrl);
    if (base.protocol !== "http:" || /(^|\.)amazonaws\.com$/i.test(base.hostname)) {
      throw new Error("Floci SQS requires an explicit local HTTP emulator endpoint");
    }
    if (base.origin !== queue.origin || !/^\/000000000000\/[a-zA-Z0-9_-]+$/.test(queue.pathname)) {
      throw new Error("Floci SQS queue URL must be in local account 000000000000 at the emulator endpoint");
    }
    this.endpoint = base.origin;
    this.queueUrl = queue.toString();
    this.request = request;
  }

  private async call<T>(action: string, body: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
    const response = await this.request(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target": `AmazonSQS.${action}`
      },
      body: JSON.stringify({ QueueUrl: this.queueUrl, ...body }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Floci SQS ${action} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  async send(data: { assetVersionId: string; originalKey: string }): Promise<void> {
    await this.call("SendMessage", { MessageBody: JSON.stringify(data) });
  }

  async receive(): Promise<FlociSqsMessage[]> {
    const result = await this.call<{ Messages?: FlociSqsMessage[] }>(
      "ReceiveMessage",
      { MaxNumberOfMessages: 1, WaitTimeSeconds: 10, VisibilityTimeout: 900 },
      16_000
    );
    return result.Messages ?? [];
  }

  async extendVisibility(receiptHandle: string): Promise<void> {
    await this.call("ChangeMessageVisibility", { ReceiptHandle: receiptHandle, VisibilityTimeout: 900 });
  }

  async delete(receiptHandle: string): Promise<void> {
    await this.call("DeleteMessage", { ReceiptHandle: receiptHandle });
  }
}

export function configuredFlociSqsClient(env: Record<string, string | undefined>): FlociSqsClient {
  if (!env.SQS_ENDPOINT || !env.SQS_QUEUE_URL) {
    throw new Error("SQS_ENDPOINT and SQS_QUEUE_URL are required for QUEUE_BACKEND=floci-sqs");
  }
  return new FlociSqsClient(env.SQS_ENDPOINT, env.SQS_QUEUE_URL);
}
