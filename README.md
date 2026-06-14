# OpenReview Studio

OpenReview Studio is an open-source video review and collaboration platform designed for browser-based review workflows plus Adobe Premiere Pro and After Effects panels.

## Goals

- SaaS-ready architecture.
- Open-source infrastructure: PostgreSQL, Redis, MinIO, FFmpeg, Next.js, Fastify, Prisma, BullMQ.
- Video upload, transcoding, review links, timecode comments, versioning, approvals, and Adobe extension workflows.

## Apps

- `apps/web`: Next.js reviewer/client interface.
- `apps/api`: Fastify API for projects, assets, comments, approvals, auth, and uploads.
- `apps/worker`: BullMQ worker for FFmpeg transcoding jobs.
- `apps/adobe-panel`: CEP panel scaffold for Premiere Pro and After Effects.

## Packages

- `packages/db`: Prisma schema and database client.
- `packages/shared`: shared validation schemas and domain types.
- `packages/ui`: shared React UI primitives.

## Local Development

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Production

Set a strong `JWT_SECRET`, review the storage credentials, then build and run the production stack:

```bash
JWT_SECRET="replace-with-a-long-random-secret-at-least-32-chars" docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api pnpm db:migrate
```

Do **not** run `pnpm db:seed` in production unless you intentionally set `ALLOW_DEMO_SEED=true` for a one-off demo environment.

Production services expose the web app on `http://localhost:3000`, API on `http://localhost:4000`, MinIO API on `http://localhost:9000`, and MinIO console on `http://localhost:9002`. The API exposes `GET /health` for process liveness and `GET /health/ready` for PostgreSQL, Redis, and object-storage readiness.

Additional production guides:

- `docs/production/backup-restore.md`
- `docs/production/reverse-proxy-tls.md`
- `docs/production/adobe-panel.md`

## Service URLs

- Web: `http://localhost:3000`
- API: `http://localhost:4000/health`
- MinIO API: `http://localhost:9000`
- MinIO console: `http://localhost:9002`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

Review updates stream over **Server-Sent Events** (`/review/:assetVersionId/events` and `/share/:token/events`) instead of polling.

See `docs/roadmap.md` for phased delivery status.

## Demo Account

After `pnpm db:seed`, a demo account is available:

- Email: `demo@openreview.local`
- Password: `openreview-demo`

## API MVP

- `GET /health`: return API process liveness.
- `GET /health/ready`: return dependency readiness for PostgreSQL, Redis, and object storage.
- `POST /auth/register`: create a user and organization.
- `POST /auth/login`: return a bearer token.
- `GET /me`: return the signed-in user and organizations.
- `PATCH /me`: update the signed-in user's profile name/email and return a refreshed bearer token.
- `POST /me/password`: change the signed-in user's password after verifying the current password.
- `GET /organizations/:organizationId/members`: list organization members.
- `POST /organizations/:organizationId/members`: invite or upsert an organization member.
- `PATCH /organizations/:organizationId/members/:membershipId`: update a member role.
- `DELETE /organizations/:organizationId/members/:membershipId`: remove a member.
- `GET /organizations/:organizationId/audit-logs`: list recent organization audit events.
- `GET /projects`: list projects available to the signed-in user.
- `POST /projects`: create a project in an organization.
- `GET /projects/:projectId`: load one accessible project with active assets and versions.
- `GET /assets/:assetId`: load one accessible asset with project and versions.
- `GET /versions/:assetVersionId`: load one accessible asset version.
- `POST /uploads/presign`: create a MinIO/S3 presigned URL for a small original video upload.
- `POST /uploads/multipart`: start a resumable multipart upload for large originals.
- `POST /uploads/multipart/part`: create a presigned URL for one multipart upload part.
- `POST /uploads/multipart/complete`: complete a multipart upload.
- `POST /uploads/multipart/abort`: abort a failed multipart upload.
- `POST /assets`: create an asset, first version, and transcode queue job.
- `POST /assets/:assetId/versions`: create a new asset version and transcode queue job.
- `GET /review/:assetVersionId/comments`: list review comments for a version.
- `POST /review/:assetVersionId/comments`: create an authenticated timestamped review comment.
- `POST /comments/:commentId/replies`: add a reply to an accessible review comment.
- `PATCH /comments/:commentId/resolve`: resolve or reopen a review comment.
- `GET /review/:assetVersionId/approval`: get the signed-in reviewer's decision.
- `POST /review/:assetVersionId/approval`: submit pending, changes requested, or approved decision.
- `POST /review/:assetVersionId/share-links`: create a public guest review link for a version.
- `GET /review/:assetVersionId/share-links`: list public guest review links for a version.
- `PATCH /share-links/:shareLinkId/revoke`: revoke or restore a public guest review link.
- `GET /share/:token`: load a public shared review.
- `POST /share/:token/comments`: add a guest reviewer comment to a shared review.

Protected routes require `Authorization: Bearer <token>`.
Project and asset write actions require an organization `OWNER`, `ADMIN`, or `MEMBER` role. `REVIEWER` members can read accessible projects and participate in reviews but cannot create projects, upload originals, archive records, or manage share links.
Only `OWNER` and `ADMIN` members can invite, remove, or update member roles and view audit logs. The API prevents removing or demoting the last organization owner.

## Next Milestones

1. Harden production operations with full Prisma migration history, backup restore drills, service healthchecks, and deployment runbooks.
2. Expand realtime review collaboration with live comment/status updates and richer version comparison workflows.
3. Complete Adobe CEP packaging and host-specific validation for Premiere Pro and After Effects marker import.
4. Add advanced administration: share-link management, role management, audit log browsing, and organization settings.

## Object Storage

Uploads use MinIO by default. The web app requests a presigned URL from the API, uploads the original directly to the `S3_BUCKET_ORIGINALS` bucket, then creates the asset/version record. Files larger than 100 MB use multipart upload with 64 MB parts and abort on failure. Asset and version creation verify that the original object exists before queueing transcoding, so callers must use keys returned by the upload endpoints after the upload completes.

Required storage environment variables are shown in `.env.example`: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_ORIGINALS`, `S3_BUCKET_PROXIES`, and `S3_FORCE_PATH_STYLE`.

## Media Processing

The worker requires `ffmpeg` and `ffprobe` on the host or in the worker container path. Transcode jobs download originals from `S3_BUCKET_ORIGINALS`, generate an MP4 proxy, HLS playlist/segments, and thumbnail, upload outputs to `S3_BUCKET_PROXIES`, then mark the asset version `READY` with duration, frame rate, and resolution metadata. Failed jobs are marked `FAILED` with a stored failure reason.

Transcode queue behavior is configurable with `TRANSCODE_JOB_ATTEMPTS`, `TRANSCODE_JOB_BACKOFF_MS`, `TRANSCODE_JOB_COMPLETE_RETENTION_SECONDS`, and `TRANSCODE_JOB_FAILED_RETENTION_SECONDS`. Worker parallelism is controlled with `WORKER_CONCURRENCY`. API and worker processes handle `SIGTERM`/`SIGINT` by closing queues, Redis connections, and Prisma connections before exiting.

The web review surfaces poll active processing versions every 10 seconds and review comments/share pages every 15 seconds so status and feedback update without manual refresh.
