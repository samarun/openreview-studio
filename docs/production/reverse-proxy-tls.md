# Reverse Proxy And TLS

Terminate TLS in front of the web and API services. Set these environment variables to public HTTPS origins:

```bash
WEB_URL=https://review.example.com
NEXT_PUBLIC_API_URL=https://api.review.example.com
```

Example Caddy config:

```caddyfile
review.example.com {
  reverse_proxy web:3000
}

api.review.example.com {
  reverse_proxy api:4000
}
```

For single-host deployments, route `/api/*` to the API only if you add a path rewrite. The current app expects the API origin from `NEXT_PUBLIC_API_URL`.
