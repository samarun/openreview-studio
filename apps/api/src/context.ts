import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Queue } from "bullmq";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import nodemailer from "nodemailer";
import { prisma } from "@openreview/db";

export function requireInProduction(name: string) {
  const value = process.env[name];
  if (process.env.NODE_ENV === "production" && !value) {
    throw new Error(`${name} is required in production`);
  }
  return value;
}

requireInProduction("DATABASE_URL");
requireInProduction("REDIS_URL");
requireInProduction("JWT_SECRET");
requireInProduction("S3_ENDPOINT");
requireInProduction("S3_ACCESS_KEY_ID");
requireInProduction("S3_SECRET_ACCESS_KEY");
requireInProduction("S3_BUCKET_ORIGINALS");
requireInProduction("S3_BUCKET_PROXIES");

const jwtSecretValue = process.env.JWT_SECRET ?? "dev-secret";
if (process.env.NODE_ENV === "production") {
  if (jwtSecretValue.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  if (/change-me|dev-secret|replace-with/i.test(jwtSecretValue)) {
    throw new Error("JWT_SECRET must not use a placeholder value in production");
  }
}

export const jwtSecret = jwtSecretValue;
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  }
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

export const transcodeQueue = new Queue("transcode", {
  connection: redis,
  defaultJobOptions: {
    attempts: Number(process.env.TRANSCODE_JOB_ATTEMPTS ?? 3),
    backoff: { type: "exponential", delay: Number(process.env.TRANSCODE_JOB_BACKOFF_MS ?? 30_000) },
    removeOnComplete: { age: Number(process.env.TRANSCODE_JOB_COMPLETE_RETENTION_SECONDS ?? 24 * 60 * 60), count: 1000 },
    removeOnFail: { age: Number(process.env.TRANSCODE_JOB_FAILED_RETENTION_SECONDS ?? 7 * 24 * 60 * 60), count: 5000 }
  }
});

export const originalsBucket = process.env.S3_BUCKET_ORIGINALS ?? "originals";
export const proxiesBucket = process.env.S3_BUCKET_PROXIES ?? "proxies";

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openreview",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openreview-secret"
  }
});

/**
 * S3 client configured with the public-facing endpoint, used exclusively for
 * generating presigned URLs that browsers can reach. Falls back to the internal
 * `s3` client when S3_PUBLIC_ENDPOINT is not set (e.g. local development).
 */
export const s3Presign = process.env.S3_PUBLIC_ENDPOINT
  ? new S3Client({
      endpoint: process.env.S3_PUBLIC_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openreview",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openreview-secret"
      }
    })
  : s3;

export const smtpTransport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined
    })
  : null;

export const mailFrom = process.env.MAIL_FROM ?? "OpenReview Studio <openreview@localhost>";
export const webUrl = process.env.WEB_URL ?? "http://localhost:3000";

export type AuthUser = { id: string; email: string };
export type ShareAccessToken = { shareToken: string };

export type AppContext = {
  app: FastifyInstance;
  prisma: typeof prisma;
  redis: Redis;
  s3: S3Client;
  transcodeQueue: Queue;
};

export function createContext(app: FastifyInstance): AppContext {
  return { app, prisma, redis, s3, transcodeQueue };
}

export {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
  getSignedUrl,
  prisma
};
