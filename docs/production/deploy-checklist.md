# Production Deploy Checklist

1. Set `JWT_SECRET` to a random value of at least 32 characters.
2. Configure PostgreSQL, Redis, and MinIO credentials.
3. Set `WEB_URL` and `NEXT_PUBLIC_API_URL` to public HTTPS origins.
4. Optionally set `METRICS_ENABLED=true` and scrape `GET /metrics` from the API service.
5. Run `docker compose -f docker-compose.prod.yml up -d --build`.
6. Run migrations: `docker compose -f docker-compose.prod.yml exec api pnpm db:migrate`.
7. Do **not** run demo seed in production. Use `ALLOW_DEMO_SEED=true` only for intentional demo stacks.
8. Verify `GET /health/ready` returns `ready`.
9. Complete a backup/restore drill using `backup-restore.md`.
10. Terminate TLS at your reverse proxy (`reverse-proxy-tls.md`).
11. Package the Adobe panel (`adobe-panel.md`) if editors use Premiere or After Effects.
