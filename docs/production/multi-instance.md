# Multi-Instance Deployment

Run multiple API containers behind a load balancer when you need horizontal scale.

## Requirements

- One PostgreSQL database
- One Redis instance (pub/sub for SSE must be shared)
- One MinIO or S3-compatible object store
- Identical environment variables on every API and worker instance

## Realtime events

Review SSE channels use Redis pub/sub. Any API instance can publish and any instance can subscribe, so clients may connect to different API pods and still receive live comment and transcode updates.

## Storage URLs

Set `S3_PUBLIC_ENDPOINT` when proxies are served through a CDN or public MinIO hostname. The API uses this value when generating public media URLs for clients outside the private network.

## Health checks

- Liveness: `GET /health`
- Readiness: `GET /health/ready`

Only route traffic to instances that return `ready`.
