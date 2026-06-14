# Deploying OpenReview Studio

Production deployment guide using Docker Compose on Ubuntu.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- At least 4 GB RAM, 2 CPU cores
- Ports 3000, 4000, 5433, 6380, 9002, 9003 available (configurable)

## Quick start

```bash
# 1. Clone the repository
git clone <repo-url> openreview-studio && cd openreview-studio

# 2. Create the production env file
cp .env.production.example .env.production

# 3. Generate secrets and edit the file
openssl rand -base64 48   # use output as JWT_SECRET
openssl rand -base64 24   # use output as POSTGRES_PASSWORD
openssl rand -base64 24   # use output as MINIO_ROOT_PASSWORD
nano .env.production

# 4. Build images
docker compose -f docker-compose.production.yml build

# 5. Start infrastructure (postgres, redis, minio)
docker compose -f docker-compose.production.yml up -d \
  openreview-postgres openreview-redis openreview-minio openreview-createbuckets

# 6. Run database migrations
docker compose -f docker-compose.production.yml run --rm openreview-migrate

# 7. Start the application
docker compose -f docker-compose.production.yml up -d
```

## Port mapping

All ports use non-standard values to avoid conflicts with host services:

| Service        | Container port | Default host port | Env var              |
|----------------|---------------|-------------------|----------------------|
| PostgreSQL     | 5432          | **5433**          | `POSTGRES_PORT`      |
| Redis          | 6379          | **6380**          | `REDIS_PORT`         |
| MinIO API      | 9000          | **9002**          | `MINIO_API_PORT`     |
| MinIO Console  | 9001          | **9003**          | `MINIO_CONSOLE_PORT` |
| API server     | 4000          | **4000**          | `API_PORT`           |
| Web app        | 3000          | **3000**          | `WEB_PORT`           |

## Build-time variables

`NEXT_PUBLIC_API_URL` is baked into the Next.js bundle at build time. If your
API is served on a different URL than `http://localhost:4000`, set it in
`.env.production` **before building**:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com
```

Then rebuild the web image:

```bash
docker compose -f docker-compose.production.yml build openreview-web
```

## Common operations

### View logs

```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Single service
docker compose -f docker-compose.production.yml logs -f openreview-api
```

### Restart a service

```bash
docker compose -f docker-compose.production.yml restart openreview-api
```

### Run migrations after a schema change

```bash
docker compose -f docker-compose.production.yml run --rm openreview-migrate
```

### Rebuild and deploy a single service

```bash
docker compose -f docker-compose.production.yml build openreview-api
docker compose -f docker-compose.production.yml up -d --no-deps openreview-api
```

### Stop everything

```bash
docker compose -f docker-compose.production.yml down
```

### Stop and remove all data (destructive)

```bash
docker compose -f docker-compose.production.yml down -v
```

## Reverse proxy

In production, place nginx or Caddy in front of the web (3000) and API (4000)
ports to handle TLS termination and domain routing.

**Example Caddy config:**

```
review.example.com {
    reverse_proxy localhost:3000
}

api.review.example.com {
    reverse_proxy localhost:4000
}
```

If using a single domain with path-based routing:

```
review.example.com {
    handle /api/* {
        reverse_proxy localhost:4000
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

## Backups

### PostgreSQL

```bash
docker exec openreview-postgres pg_dump -U openreview openreview | gzip > backup-$(date +%F).sql.gz
```

### MinIO

The MinIO data volume (`openreview-minio-data`) stores all uploaded and
transcoded media. Back up the Docker volume or use `mc mirror` to sync to
another S3-compatible target.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| API won't start | Check `JWT_SECRET` is >= 32 chars and not a placeholder |
| DB connection refused | Ensure `openreview-postgres` is healthy: `docker inspect openreview-postgres` |
| Worker stuck | Check ffmpeg is installed in the worker image: `docker exec openreview-worker ffmpeg -version` |
| MinIO buckets missing | Re-run: `docker compose -f docker-compose.production.yml up openreview-createbuckets` |
