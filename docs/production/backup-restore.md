# Backup And Restore

## PostgreSQL Backup

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U openreview openreview > openreview-postgres.sql
```

## PostgreSQL Restore

```bash
cat openreview-postgres.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U openreview openreview
```

## MinIO Backup

Back up the `minio-data` Docker volume or mirror buckets with `mc`:

```bash
mc alias set openreview http://localhost:9000 openreview openreview-secret
mc mirror openreview/originals ./backup/originals
mc mirror openreview/proxies ./backup/proxies
```

## Redis

Redis stores queues and transient worker state. Back up the `redis-data` volume if preserving queued jobs matters during maintenance.
