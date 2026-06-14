# OpenReview Studio Roadmap

## Phase 1 — Production hardening

- Block demo seed in production unless `ALLOW_DEMO_SEED=true`
- Enforce minimum `JWT_SECRET` length in API and seed
- Prometheus-style metrics at `GET /metrics` when `METRICS_ENABLED=true`
- Production compose health checks for Redis and API dependencies
- CI smoke tests for `/health`, `/health/ready`, and seed guard
- Deploy checklist and environment documentation

## Phase 2 — Review workflow

- Project folders: create, rename, delete, filter, move assets, upload into folder
- Real-time review via SSE with reconnect/backoff (replace polling)
- Notification inbox in app shell
- Organization-wide share link table in settings
- Guest comment resolve on public share links
- Compare versions from review top bar
- Approval rollup on project grid

## Phase 3 — Adobe panel

- Upload active sequence as new asset
- Upload new version to existing asset
- Import review comments as sequence markers
- Live comment updates over SSE
- ZXP packaging script (`pnpm --filter @openreview/adobe-panel package`)

## Future

- Multipart uploads for very large exports
- Webhook integrations and Slack notifications
- Advanced permissions and reviewer-only project access
- Side-by-side compare with synced playback and comment overlays
