import type { FastifyInstance } from "fastify";
import { mailFrom, smtpTransport, webUrl } from "../context.js";

export async function sendMail(app: FastifyInstance, input: { to: string; subject: string; text: string }) {
  if (!smtpTransport) {
    app.log.info({ to: input.to, subject: input.subject }, "SMTP not configured; skipped email");
    return;
  }

  await smtpTransport.sendMail({ from: mailFrom, ...input });
}

export async function sendInviteEmail(app: FastifyInstance, input: { to: string; organizationName: string; inviteToken: string }) {
  const link = `${webUrl}/set-password?token=${encodeURIComponent(input.inviteToken)}`;
  await sendMail(app, {
    to: input.to,
    subject: `Join ${input.organizationName} on OpenReview Studio`,
    text: `You have been invited to join ${input.organizationName}.\n\nSet your password to get started:\n${link}\n\nThis link expires in 7 days.`
  });
}
