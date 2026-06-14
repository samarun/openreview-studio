import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { prisma } from "@openreview/db";

type JobData = { assetVersionId?: string; originalKey?: string };
type ProbeResult = {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
  }>;
  format?: { duration?: string };
};

function requireInProduction(name: string) {
  const value = process.env[name];

  if (process.env.NODE_ENV === "production" && !value) {
    throw new Error(`${name} is required in production`);
  }

  return value;
}

requireInProduction("DATABASE_URL");
requireInProduction("REDIS_URL");
requireInProduction("S3_ENDPOINT");
requireInProduction("S3_ACCESS_KEY_ID");
requireInProduction("S3_SECRET_ACCESS_KEY");
requireInProduction("S3_BUCKET_ORIGINALS");
requireInProduction("S3_BUCKET_PROXIES");

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null
});

async function publishVersionEvent(
  assetVersionId: string,
  status: string,
  payload: unknown,
  shareToken?: string
) {
  const event = {
    type: "version.status",
    assetVersionId,
    payload: { status, ...(typeof payload === "object" && payload ? payload : {}) },
    at: new Date().toISOString()
  };

  await connection.publish(`review:${assetVersionId}`, JSON.stringify(event));

  if (shareToken) {
    await connection.publish(`share:${shareToken}`, JSON.stringify(event));
  }
}
const originalsBucket = process.env.S3_BUCKET_ORIGINALS ?? "originals";
const proxiesBucket = process.env.S3_BUCKET_PROXIES ?? "proxies";
const workerConcurrency = Number(process.env.WORKER_CONCURRENCY ?? 1);
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openreview",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openreview-secret"
  }
});

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`${command} exited with ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

function parseFrameRate(value?: string) {
  if (!value || value === "0/0") {
    return null;
  }

  const [numerator, denominator] = value.split("/").map(Number);

  if (numerator === undefined || denominator === undefined || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function contentTypeFor(path: string) {
  const extension = extname(path).toLowerCase();

  if (extension === ".m3u8") return "application/vnd.apple.mpegurl";
  if (extension === ".ts") return "video/mp2t";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".mp4") return "video/mp4";

  return "application/octet-stream";
}

async function downloadOriginal(key: string, destination: string) {
  const result = await s3.send(new GetObjectCommand({ Bucket: originalsBucket, Key: key }));

  if (!result.Body) {
    throw new Error(`Original object ${key} has no body`);
  }

  await mkdir(dirname(destination), { recursive: true });
  await pipeline(result.Body as Readable, createWriteStream(destination));
}

async function uploadFile(source: string, key: string, contentType = contentTypeFor(source)) {
  await s3.send(new PutObjectCommand({
    Bucket: proxiesBucket,
    Key: key,
    Body: await readFile(source),
    ContentType: contentType
  }));
}

async function uploadDirectory(sourceDirectory: string, keyPrefix: string) {
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const source = join(sourceDirectory, entry.name);

    if (entry.isDirectory()) {
      await uploadDirectory(source, `${keyPrefix}/${entry.name}`);
      continue;
    }

    if (entry.isFile()) {
      await uploadFile(source, `${keyPrefix}/${relative(sourceDirectory, source)}`);
    }
  }
}

async function probe(inputPath: string) {
  const output = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    inputPath
  ]);
  const result = JSON.parse(output) as ProbeResult;
  const videoStream = result.streams?.find((stream) => stream.codec_type === "video");
  const durationSeconds = result.format?.duration ? Number(result.format.duration) : null;

  return {
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    frameRate: parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate),
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null
  };
}

async function processAssetVersion(assetVersionId: string, originalKey: string) {
  const workingDirectory = fileURLToPath(new URL(`openreview-${assetVersionId}-${Date.now()}/`, `file://${tmpdir()}/`));
  const inputPath = join(workingDirectory, "input");
  const outputDirectory = join(workingDirectory, "output");
  const proxyPath = join(outputDirectory, "proxy.mp4");
  const thumbnailPath = join(outputDirectory, "thumb.jpg");
  const hlsDirectory = join(outputDirectory, "hls");
  const hlsManifestPath = join(hlsDirectory, "index.m3u8");
  const outputPrefix = originalKey.replace(/\.[^.]+$/, "");
  const proxyKey = `${outputPrefix}/proxy.mp4`;
  const thumbnailKey = `${outputPrefix}/thumb.jpg`;
  const hlsPrefix = `${outputPrefix}/hls`;
  const hlsManifestKey = `${hlsPrefix}/index.m3u8`;

  try {
    await mkdir(hlsDirectory, { recursive: true });
    const processing = await prisma.assetVersion.update({
      where: { id: assetVersionId },
      data: { status: "PROCESSING", failureReason: null },
      include: { shareLinks: true }
    });
    await publishVersionEvent(assetVersionId, "PROCESSING", processing, processing.shareLinks[0]?.token);
    await downloadOriginal(originalKey, inputPath);
    const metadata = await probe(inputPath);

    await run("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-vf", "scale='min(1920,iw)':-2",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      proxyPath
    ]);
    await run("ffmpeg", ["-y", "-i", inputPath, "-ss", "00:00:01", "-frames:v", "1", "-vf", "scale=640:-2", thumbnailPath]);
    await run("ffmpeg", [
      "-y",
      "-i", proxyPath,
      "-codec", "copy",
      "-start_number", "0",
      "-hls_time", "6",
      "-hls_list_size", "0",
      "-hls_segment_filename", join(hlsDirectory, "segment-%03d.ts"),
      hlsManifestPath
    ]);

    await uploadFile(proxyPath, proxyKey);
    await uploadFile(thumbnailPath, thumbnailKey);
    await uploadDirectory(hlsDirectory, hlsPrefix);

    const updated = await prisma.assetVersion.update({
      where: { id: assetVersionId },
      data: {
        status: "READY",
        proxyKey,
        hlsManifestKey,
        thumbnailKey,
        durationSeconds: metadata.durationSeconds,
        frameRate: metadata.frameRate,
        width: metadata.width,
        height: metadata.height,
        failureReason: null
      },
      include: { shareLinks: true }
    });

    await publishVersionEvent(updated.id, "READY", updated, updated.shareLinks[0]?.token);

    const proxyStats = await stat(proxyPath);

    return { assetVersionId, proxyKey, proxyBytes: proxyStats.size };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing failure";

    const failed = await prisma.assetVersion.update({
      where: { id: assetVersionId },
      data: { status: "FAILED", failureReason: message.slice(0, 4000) },
      include: { shareLinks: true }
    });

    await publishVersionEvent(assetVersionId, "FAILED", failed, failed.shareLinks[0]?.token);

    throw error;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

const worker = new Worker(
  "transcode",
  async (job) => {
    const data = job.data as JobData;

    if (!data.assetVersionId || !data.originalKey) {
      throw new Error("assetVersionId and originalKey are required");
    }

    return processAssetVersion(data.assetVersionId, data.originalKey);
  },
  { connection, concurrency: Number.isFinite(workerConcurrency) && workerConcurrency > 0 ? workerConcurrency : 1 }
);

worker.on("completed", (job) => console.log("completed transcode job", job.id));
worker.on("failed", (job, error) => console.error("failed transcode job", job?.id, error));

console.log("OpenReview worker listening for transcode jobs");

async function shutdown(signal: string) {
  console.log(`received ${signal}; shutting down worker`);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
