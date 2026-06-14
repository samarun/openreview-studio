# Architecture

OpenReview Studio uses a modular monorepo so the web app, API, background worker, Adobe panel, and shared packages can evolve independently while sharing types and database access.

## Core Flow

1. Users upload original video files through the web app or Adobe panel.
2. Originals are stored in MinIO under the `originals` bucket.
3. The API creates an `AssetVersion` and queues a `transcode` job in Redis.
4. The worker runs FFmpeg to generate playback proxies, HLS manifests, thumbnails, and metadata.
5. Processed files are stored in the `proxies` bucket.
6. Reviewers watch the proxy, add timestamped comments, and approve or request changes.
7. The Adobe CEP panel fetches comments and jumps the host timeline to matching timestamps.

## Current MVP State

The API supports registration, login, account profile/password management, organization ownership, member invites, member role management, member removal, audit-log browsing, project and asset detail endpoints, project creation, direct-to-MinIO uploads, asset creation, version creation, timestamped comments, replies, approvals, archive flows, and protected guest share links with list/revoke management. Asset/version creation queues a `transcode` job. The worker downloads originals from MinIO, probes metadata with FFprobe, generates MP4 proxy, HLS output, and thumbnail files with FFmpeg, uploads processed outputs to MinIO, and marks versions `READY` or `FAILED`.

Original object keys are scoped to `organizationId/projectId/...` and asset creation/version creation should use keys returned by the upload endpoints. Authenticated media routes verify that the requested proxy/HLS/thumbnail key belongs to an asset version the user can access. Public share media routes verify the requested media belongs to the shared version and enforce share password access tokens when configured.

Asset and version creation verify the original object exists in `S3_BUCKET_ORIGINALS` before writing database records or queueing transcode jobs. This prevents invalid keys from becoming worker failures. The API has a lightweight liveness endpoint at `/health` and a dependency readiness endpoint at `/health/ready` that checks PostgreSQL, Redis, and both configured object-storage buckets.

Transcode jobs use configurable retry, exponential backoff, and retention defaults at queue creation time. The worker supports configurable concurrency through `WORKER_CONCURRENCY`. Both API and worker processes close Fastify, BullMQ, Redis, and Prisma resources during `SIGTERM`/`SIGINT` shutdown so container stops do not leave unnecessary open connections.

Organization roles are enforced at write boundaries. `OWNER`, `ADMIN`, and `MEMBER` can create projects, upload originals, create versions, archive records, and manage share links. `REVIEWER` can read accessible projects and participate in comments/approvals, but cannot mutate project or upload state. Only `OWNER` and `ADMIN` can manage members and read audit logs. The membership API protects organizations from losing their last owner.

## Local API Smoke Test

```bash
TOKEN=$(curl -s http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@openreview.local","password":"openreview-demo"}' | jq -r .token)

curl -s http://localhost:4000/projects \
  -H "authorization: Bearer $TOKEN"

curl -s http://localhost:4000/assets \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d '{"projectId":"demo-project","name":"Rough Cut v1","originalKey":"originals/demo/rough-cut.mov"}'
```

## Timecode Strategy

Comments store `timeSeconds` as the canonical value. Frame number and frame rate are optional metadata for frame-accurate display. Future milestones should add drop-frame/non-drop-frame normalization and sequence offset handling for Adobe timelines.

## Open-Source Boundary

Application code and infrastructure are open-source. Adobe Premiere Pro and After Effects integration must use Adobe CEP/ExtendScript APIs because those hosts are proprietary.
