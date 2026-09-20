# Local OpenReview development, patterned after a BIBE preview

This is a personal learning counterpart to the per-PR Kubernetes preview, **not**
Buffer's internal Hermes implementation. It runs the same application components
and backing-service image families as the preview: web, API, FFmpeg worker,
PostgreSQL, Redis, and MinIO. Local processing remains on BullMQ by default;
the opt-in Floci SQS/KEDA path is for the Kubernetes lab only.

## Choose a container runtime

- On a Mac, use OrbStack's Docker-compatible runtime (or Docker Desktop).
- On the Ubuntu host, use Docker Engine and the Compose plugin.
- No real AWS account, ECR login, or cloud billing is needed for the default path.

Do not run this stack on the same ports or volumes as an existing OpenReview
deployment. The Compose project name and volumes are isolated, and the sole
published port binds to `127.0.0.1`.

## Start from source

From the OpenReview repository root:

```sh
cp .env.bibe-local.example .env.bibe-local
```

Open `.env.bibe-local` in an editor. Set `POSTGRES_PASSWORD` and
`MINIO_ROOT_PASSWORD` to independent random hex strings (`openssl rand -hex
24` is a convenient way to generate each), set `MINIO_ROOT_USER` to a local
name, and set `JWT_SECRET` to a separate random string of at least 32
characters. Quotes are unnecessary for these hex values. Do not copy the
terminal prompt or angle-bracket placeholders into the file. The environment
file is Git-ignored.

On the current Ubuntu host, port 8088 is used by another service and 8089 is
reserved for the Kubernetes preview ingress. Set `BIBE_LOCAL_PORT=8093` in the
isolated deployment. Use the configured port for health checks and SSH tunnels;
the example below uses the Ubuntu value.

```sh
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml config --quiet
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml up -d --build
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml ps
curl --fail --show-error http://127.0.0.1:8093/api/health/ready
```

Open `http://127.0.0.1:8093/` on Ubuntu (or the port you selected). The
gateway mirrors the preview's same-origin routes: `/api` goes to Fastify,
`/media` to the API, and `/originals` and `/proxies` to MinIO. The migration/seed
container runs before the API starts. The FFmpeg worker has concurrency 1 and
a 2 GB memory cap.

This Compose project is intentionally on-demand, not a boot service. After a
host restart, use the same `up -d --no-build` command to restore it; the named
database, Redis, MinIO, and registry volumes are retained. On the Ubuntu host,
keep port 8089 free for the separate Kubernetes preview ingress.

## Use exact pre-built images instead

Build the three application images in CI from one commit and record their
immutable `sha-<commit>` tags. Set `BIBE_WEB_IMAGE`, `BIBE_API_IMAGE`, and
`BIBE_WORKER_IMAGE` in `.env.bibe-local` to those exact image names. Authenticate
to the registry using its normal least-privilege credentials, then use:

```sh
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml pull web api worker
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml up -d --no-build
```

This works with the existing GHCR images. A real ECR registry would require
separate real-AWS authorization and is not part of this local lab. Keep registry
credentials outside the repository; never put them in `.env.bibe-local` or the
Compose file.

## Practice with a local image registry

The optional registry is bound only to the host's loopback interface. On the
Mac this is OrbStack's Docker runtime; on Ubuntu it is Docker Engine. Do not
publish port 5005 on a public interface or treat this unauthenticated registry
as a production service.

```sh
docker compose --profile registry --env-file .env.bibe-local -f docker-compose.bibe-local.yml up -d registry
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml build web api worker
docker tag openreview-bibe-local-web:dev localhost:5005/openreview-web:lab-1
docker tag openreview-bibe-local-api:dev localhost:5005/openreview-api:lab-1
docker tag openreview-bibe-local-worker:dev localhost:5005/openreview-worker:lab-1
docker push localhost:5005/openreview-web:lab-1
docker push localhost:5005/openreview-api:lab-1
docker push localhost:5005/openreview-worker:lab-1
```

Set `BIBE_WEB_IMAGE=localhost:5005/openreview-web:lab-1`,
`BIBE_API_IMAGE=localhost:5005/openreview-api:lab-1`, and
`BIBE_WORKER_IMAGE=localhost:5005/openreview-worker:lab-1` in `.env.bibe-local`.
Then run the `pull` and `up -d --no-build` commands from the previous section.
The `localhost:5005` image reference is for the Docker host, not a Kubernetes
pod; the preview cluster will continue using its GHCR images. Keep one tag
per source commit so all three components can be traced to the same revision.

## Stop safely

```sh
docker compose --env-file .env.bibe-local -f docker-compose.bibe-local.yml down
```

This stops only this Compose project and retains its named volumes. **Do not**
add `-v` unless you explicitly intend to erase this local database and media.
If the optional registry is running, also stop it with
`docker compose --profile registry --env-file .env.bibe-local -f docker-compose.bibe-local.yml down`.

## Verification limits

`docker compose config --quiet` checks only the Compose structure. On the
Ubuntu host, the exact-SHA image build, registry push/pull, API readiness, and
demo login were verified. After a host power cut, `up -d --no-build` restored
the stack from retained volumes on port 8093; API readiness and demo login
passed again. The Kubernetes preview has additional isolation (namespace,
quotas, Pod Security, and NetworkPolicies) that Compose does not reproduce.
