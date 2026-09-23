import * as Sentry from "@sentry/node";

const enabled = Boolean(process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "local",
    release: process.env.SENTRY_RELEASE,
    defaultIntegrations: false,
    integrations: [],
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      // Preview requests can contain credentials, names, and media identifiers.
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      delete event.extra;
      return event;
    }
  });
}

export function reportServerError(error: Error): void {
  if (!enabled) return;
  const errorType = /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name)
    ? error.name
    : "UnknownError";
  Sentry.captureException(new Error("OpenReview API internal error"), {
    tags: { component: "api", error_type: errorType }
  });
}

export async function flushErrorReports(): Promise<void> {
  if (enabled) await Sentry.flush(2000);
}
