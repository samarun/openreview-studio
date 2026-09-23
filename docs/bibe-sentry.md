# Private Sentry error reporting for BIBE previews

The BIBE OpenReview API and worker can send sanitized failure events to the
separate self-hosted Sentry installation on the Ubuntu host. This is **opt-in**:
without `SENTRY_DSN`, the application does not initialize reporting. The web
browser does not receive a DSN and does not send telemetry.

The GitOps chart provides the DSN through a reflected Kubernetes Secret and
permits egress only to a private ingest-only bridge. The bridge has no host
port and rejects the Sentry UI and other API paths. Each event carries the
preview namespace as its environment and the exact PR commit as its release.

Only API 5xx responses and failed transcode jobs are reported. These are
synthetic error messages: raw request bodies, user information, media names,
FFmpeg stderr and original exception messages are not sent. Tracing and
profiling are disabled. The existing application logs remain the source for
detailed local diagnosis.

To disable reporting, set `sentry.enabled: false` in the trusted-main GitOps
ApplicationSet values. Removing a PR still deletes its namespace and reflected
secret; the Sentry project is shared and retained for later review.

The associated private bridge, project and secret setup is documented in the
GitOps repository at `docs/openreview-sentry.md`. It uses the existing
self-hosted Sentry installation, not Sentry SaaS or real AWS.
