import assert from "node:assert/strict";
import test from "node:test";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "../packages/db/src/index";

const API_URL = process.env.TEST_API_URL ?? "http://localhost:4000";
const originalsBucket = process.env.S3_BUCKET_ORIGINALS ?? "originals";
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "openreview",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "openreview-secret"
  }
});

async function request<T>(path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  return { response, payload: payload as T };
}

async function putOriginalObject(key: string) {
  await s3.send(new PutObjectCommand({
    Bucket: originalsBucket,
    Key: key,
    Body: Buffer.from("openreview test object"),
    ContentType: "video/mp4"
  }));
}

test("API health endpoint responds", async () => {
  const { response, payload } = await request<{ status: string }>("/health");

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ok");
  assert.equal(response.headers.get("x-dns-prefetch-control"), "off");
});

test("core authenticated review workflow", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `smoke-${suffix}@openreview.local`;
  const password = "smoke-password";

  const register = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      name: "Smoke Tester",
      organizationName: `Smoke Org ${suffix}`
    })
  });
  assert.equal(register.response.status, 201);
  assert.ok(register.payload.token);

  const token = register.payload.token;
  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Project", organizationId: register.payload.organization.id })
  }, token);
  assert.equal(project.response.status, 200);

  const projectDetail = await request<{ id: string; assets: unknown[] }>(`/projects/${project.payload.id}`, {}, token);
  assert.equal(projectDetail.response.status, 200);
  assert.equal(projectDetail.payload.id, project.payload.id);

  const originalKey = `${register.payload.organization.id}/${project.payload.id}/${suffix}.mp4`;
  await putOriginalObject(originalKey);
  const asset = await request<{ id: string; versions: Array<{ id: string }> }>("/assets", {
    method: "POST",
    body: JSON.stringify({ projectId: project.payload.id, name: "Smoke Asset", originalKey })
  }, token);
  assert.equal(asset.response.status, 201);
  const versionId = asset.payload.versions[0]?.id;
  assert.ok(versionId);

  const assetDetail = await request<{ id: string; versions: Array<{ id: string }> }>(`/assets/${asset.payload.id}`, {}, token);
  assert.equal(assetDetail.response.status, 200);
  assert.equal(assetDetail.payload.id, asset.payload.id);
  const versionDetail = await request<{ id: string }>(`/versions/${versionId}`, {}, token);
  assert.equal(versionDetail.response.status, 200);
  assert.equal(versionDetail.payload.id, versionId);

  const comment = await request<{ id: string; body: string }>(`/review/${versionId}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: "Smoke comment",
      timeSeconds: 1.25,
      annotationJson: {
        type: "annotation",
        paths: [{ kind: "freehand", color: "#67e8f9", points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }],
        shapes: [{ kind: "rectangle", color: "#67e8f9", start: { x: 0.2, y: 0.2 }, end: { x: 0.5, y: 0.5 } }]
      }
    })
  }, token);
  assert.equal(comment.response.status, 201);
  assert.equal(comment.payload.body, "Smoke comment");

  const unauthenticatedComments = await request(`/review/${versionId}/comments`);
  assert.equal(unauthenticatedComments.response.status, 401);

  const reply = await request<{ id: string }>(`/comments/${comment.payload.id}/replies`, {
    method: "POST",
    body: JSON.stringify({ body: "Smoke reply" })
  }, token);
  assert.equal(reply.response.status, 201);

  const resolved = await request<{ resolvedAt: string | null }>(`/comments/${comment.payload.id}/resolve`, {
    method: "PATCH",
    body: JSON.stringify({ resolved: true })
  }, token);
  assert.equal(resolved.response.status, 200);
  assert.ok(resolved.payload.resolvedAt);

  const approval = await request<{ status: string }>(`/review/${versionId}/approval`, {
    method: "POST",
    body: JSON.stringify({ status: "APPROVED", note: "Smoke approval" })
  }, token);
  assert.equal(approval.response.status, 200);
  assert.equal(approval.payload.status, "APPROVED");
});

test("password-protected public share workflow", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `share-${suffix}@openreview.local`;
  const password = "share-password";

  const register = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, organizationName: `Share Org ${suffix}` })
  });
  assert.equal(register.response.status, 201);

  const token = register.payload.token;
  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Share Project", organizationId: register.payload.organization.id })
  }, token);
  const originalKey = `${register.payload.organization.id}/${project.payload.id}/${suffix}.mp4`;
  await putOriginalObject(originalKey);
  const asset = await request<{ versions: Array<{ id: string }> }>("/assets", {
    method: "POST",
    body: JSON.stringify({ projectId: project.payload.id, name: "Share Asset", originalKey })
  }, token);
  const versionId = asset.payload.versions[0]?.id;
  assert.ok(versionId);

  const share = await request<{ token: string }>(`/review/${versionId}/share-links`, {
    method: "POST",
    body: JSON.stringify({ password: "protected-pass" })
  }, token);
  assert.equal(share.response.status, 201);

  const shareLinks = await request<Array<{ id: string; token: string; passwordProtected: boolean; revoked: boolean }>>(`/review/${versionId}/share-links`, {}, token);
  assert.equal(shareLinks.response.status, 200);
  const createdShareLink = shareLinks.payload.find((link) => link.token === share.payload.token);
  assert.ok(createdShareLink);
  assert.equal(createdShareLink.passwordProtected, true);
  assert.equal(createdShareLink.revoked, false);

  const locked = await request(`/share/${share.payload.token}`);
  assert.equal(locked.response.status, 403);

  const access = await request<{ accessToken: string }>(`/share/${share.payload.token}/access`, {
    method: "POST",
    body: JSON.stringify({ password: "protected-pass" })
  });
  assert.equal(access.response.status, 200);
  assert.ok(access.payload.accessToken);

  const publicComment = await request<{ id: string; guestReviewer: { name: string } }>(`/share/${share.payload.token}/comments?accessToken=${access.payload.accessToken}`, {
    method: "POST",
    body: JSON.stringify({ name: "Guest Tester", body: "Guest smoke comment", timeSeconds: 2 })
  });
  assert.equal(publicComment.response.status, 201);
  assert.equal(publicComment.payload.guestReviewer.name, "Guest Tester");

  const publicApproval = await request<{ id: string; status: string }>(`/share/${share.payload.token}/approval?accessToken=${access.payload.accessToken}`, {
    method: "POST",
    body: JSON.stringify({ name: "Guest Tester", status: "CHANGES_REQUESTED", note: "Guest smoke decision" })
  });
  assert.equal(publicApproval.response.status, 201);
  assert.equal(publicApproval.payload.status, "CHANGES_REQUESTED");

  const revoked = await request<{ revoked: boolean }>(`/share-links/${createdShareLink.id}/revoke`, {
    method: "PATCH",
    body: JSON.stringify({ revoked: true })
  }, token);
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.payload.revoked, true);

  const revokedAccess = await request(`/share/${share.payload.token}/access`, {
    method: "POST",
    body: JSON.stringify({ password: "protected-pass" })
  });
  assert.equal(revokedAccess.response.status, 404);
});

test("archive and organization member management workflow", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `admin-${suffix}@openreview.local`;
  const registration = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "admin-password", organizationName: `Admin Org ${suffix}` })
  });
  const token = registration.payload.token;

  const invited = await request<{ role: string; user: { email: string } }>(`/organizations/${registration.payload.organization.id}/members`, {
    method: "POST",
    body: JSON.stringify({ email: `member-${suffix}@openreview.local`, name: "Invited Member", role: "REVIEWER" })
  }, token);
  assert.equal(invited.response.status, 201);
  assert.equal(invited.payload.role, "REVIEWER");

  const members = await request<Array<{ user: { email: string } }>>(`/organizations/${registration.payload.organization.id}/members`, {}, token);
  assert.equal(members.response.status, 200);
  assert.ok(members.payload.some((member) => member.user.email === `member-${suffix}@openreview.local`));

  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Archived Project", organizationId: registration.payload.organization.id })
  }, token);
  const archived = await request<{ archivedAt: string | null }>(`/projects/${project.payload.id}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true })
  }, token);
  assert.equal(archived.response.status, 200);
  assert.ok(archived.payload.archivedAt);

  const projects = await request<Array<{ id: string }>>("/projects", {}, token);
  assert.ok(!projects.payload.some((item) => item.id === project.payload.id));
});

test("account profile and password can be updated", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `account-${suffix}@openreview.local`;
  const password = "account-password";
  const updatedEmail = `account-updated-${suffix}@openreview.local`;
  const updatedPassword = "updated-account-password";
  const registration = await request<{ token: string; user: { id: string }; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Account User", organizationName: `Account Org ${suffix}` })
  });

  const profile = await request<{ token: string; user: { email: string; name: string } }>("/me", {
    method: "PATCH",
    body: JSON.stringify({ email: updatedEmail, name: "Updated Account User" })
  }, registration.payload.token);
  assert.equal(profile.response.status, 200);
  assert.equal(profile.payload.user.email, updatedEmail);
  assert.equal(profile.payload.user.name, "Updated Account User");
  assert.ok(profile.payload.token);

  const oldLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  assert.equal(oldLogin.response.status, 401);

  const changed = await request<{ ok: boolean }>("/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: password, newPassword: updatedPassword })
  }, profile.payload.token);
  assert.equal(changed.response.status, 200);
  assert.equal(changed.payload.ok, true);

  const badPasswordChange = await request("/me/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: password, newPassword: "another-password" })
  }, profile.payload.token);
  assert.equal(badPasswordChange.response.status, 401);

  const newLogin = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: updatedEmail, password: updatedPassword })
  });
  assert.equal(newLogin.response.status, 200);
  assert.ok(newLogin.payload.token);
});

test("multipart upload contract creates and aborts an upload", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registration = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `multipart-${suffix}@openreview.local`, password: "multipart-password", organizationName: `Multipart Org ${suffix}` })
  });
  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Multipart Project", organizationId: registration.payload.organization.id })
  }, registration.payload.token);
  const upload = await request<{ originalKey: string; uploadId: string; partSizeBytes: number }>("/uploads/multipart", {
    method: "POST",
    body: JSON.stringify({ projectId: project.payload.id, filename: "large.mov", contentType: "video/quicktime", sizeBytes: 128 * 1024 * 1024, partCount: 2 })
  }, registration.payload.token);
  assert.equal(upload.response.status, 200);
  assert.ok(upload.payload.originalKey);
  assert.ok(upload.payload.uploadId);
  assert.equal(upload.payload.partSizeBytes, 64 * 1024 * 1024);

  const signedPart = await request<{ uploadUrl: string; partNumber: number }>("/uploads/multipart/part", {
    method: "POST",
    body: JSON.stringify({ key: upload.payload.originalKey, uploadId: upload.payload.uploadId, partNumber: 1 })
  }, registration.payload.token);
  assert.equal(signedPart.response.status, 200);
  assert.ok(signedPart.payload.uploadUrl);
  assert.equal(signedPart.payload.partNumber, 1);

  const abort = await request<{ ok: boolean }>("/uploads/multipart/abort", {
    method: "POST",
    body: JSON.stringify({ key: upload.payload.originalKey, uploadId: upload.payload.uploadId })
  }, registration.payload.token);
  assert.equal(abort.response.status, 200);
  assert.equal(abort.payload.ok, true);
});

test("multipart object keys cannot be signed by another organization", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `owner-${suffix}@openreview.local`, password: "owner-password", organizationName: `Owner Org ${suffix}` })
  });
  const attacker = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `attacker-${suffix}@openreview.local`, password: "attacker-password", organizationName: `Attacker Org ${suffix}` })
  });
  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Owner Project", organizationId: owner.payload.organization.id })
  }, owner.payload.token);
  const upload = await request<{ originalKey: string; uploadId: string }>("/uploads/multipart", {
    method: "POST",
    body: JSON.stringify({ projectId: project.payload.id, filename: "large.mov", contentType: "video/quicktime", sizeBytes: 128 * 1024 * 1024, partCount: 2 })
  }, owner.payload.token);

  const forbidden = await request("/uploads/multipart/part", {
    method: "POST",
    body: JSON.stringify({ key: upload.payload.originalKey, uploadId: upload.payload.uploadId, partNumber: 1 })
  }, attacker.payload.token);
  assert.equal(forbidden.response.status, 404);

  await request("/uploads/multipart/abort", {
    method: "POST",
    body: JSON.stringify({ key: upload.payload.originalKey, uploadId: upload.payload.uploadId })
  }, owner.payload.token);
});

test("reviewers can read but cannot create projects or upload originals", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `role-owner-${suffix}@openreview.local`, password: "owner-password", organizationName: `Role Owner Org ${suffix}` })
  });
  const reviewer = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `role-reviewer-${suffix}@openreview.local`, password: "reviewer-password", organizationName: `Role Reviewer Org ${suffix}` })
  });
  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Role Project", organizationId: owner.payload.organization.id })
  }, owner.payload.token);

  const invited = await request<{ role: string }>(`/organizations/${owner.payload.organization.id}/members`, {
    method: "POST",
    body: JSON.stringify({ email: `role-reviewer-${suffix}@openreview.local`, role: "REVIEWER" })
  }, owner.payload.token);
  assert.equal(invited.response.status, 201);
  assert.equal(invited.payload.role, "REVIEWER");

  const readable = await request<{ id: string }>(`/projects/${project.payload.id}`, {}, reviewer.payload.token);
  assert.equal(readable.response.status, 200);

  const createProject = await request("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Forbidden Project", organizationId: owner.payload.organization.id })
  }, reviewer.payload.token);
  assert.equal(createProject.response.status, 403);

  const presign = await request("/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ projectId: project.payload.id, filename: "blocked.mp4", contentType: "video/mp4", sizeBytes: 1024 })
  }, reviewer.payload.token);
  assert.equal(presign.response.status, 403);
});

test("organization admins can manage members and view audit logs", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `member-owner-${suffix}@openreview.local`, password: "owner-password", organizationName: `Member Owner Org ${suffix}` })
  });
  const organizationId = owner.payload.organization.id;
  const invited = await request<{ id: string; role: string; user: { email: string } }>(`/organizations/${organizationId}/members`, {
    method: "POST",
    body: JSON.stringify({ email: `managed-${suffix}@openreview.local`, name: "Managed User", role: "MEMBER" })
  }, owner.payload.token);
  assert.equal(invited.response.status, 201);

  const updated = await request<{ id: string; role: string }>(`/organizations/${organizationId}/members/${invited.payload.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "ADMIN" })
  }, owner.payload.token);
  assert.equal(updated.response.status, 200);
  assert.equal(updated.payload.role, "ADMIN");

  const auditLogs = await request<Array<{ action: string; actorUser: { email: string } | null }>>(`/organizations/${organizationId}/audit-logs`, {}, owner.payload.token);
  assert.equal(auditLogs.response.status, 200);
  assert.ok(auditLogs.payload.some((entry) => entry.action === "organization_member.update_role"));

  const removed = await request(`/organizations/${organizationId}/members/${invited.payload.id}`, { method: "DELETE" }, owner.payload.token);
  assert.equal(removed.response.status, 204);

  const members = await request<Array<{ id: string }>>(`/organizations/${organizationId}/members`, {}, owner.payload.token);
  assert.ok(!members.payload.some((member) => member.id === invited.payload.id));
});

test("last organization owner cannot be removed or demoted", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `last-owner-${suffix}@openreview.local`, password: "owner-password", organizationName: `Last Owner Org ${suffix}` })
  });
  const members = await request<Array<{ id: string; role: string }>>(`/organizations/${owner.payload.organization.id}/members`, {}, owner.payload.token);
  const ownerMembership = members.payload.find((member) => member.role === "OWNER");
  assert.ok(ownerMembership);

  const demote = await request(`/organizations/${owner.payload.organization.id}/members/${ownerMembership.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "ADMIN" })
  }, owner.payload.token);
  assert.equal(demote.response.status, 400);

  const remove = await request(`/organizations/${owner.payload.organization.id}/members/${ownerMembership.id}`, { method: "DELETE" }, owner.payload.token);
  assert.equal(remove.response.status, 400);
});

test("proxy media keys cannot be fetched by another organization", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const owner = await request<{ token: string; organization: { id: string } }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `media-owner-${suffix}@openreview.local`, password: "owner-password", organizationName: `Media Owner Org ${suffix}` })
  });
  const attacker = await request<{ token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: `media-attacker-${suffix}@openreview.local`, password: "attacker-password", organizationName: `Media Attacker Org ${suffix}` })
  });
  const project = await request<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({ name: "Media Project", organizationId: owner.payload.organization.id })
  }, owner.payload.token);
  const originalKey = `${owner.payload.organization.id}/${project.payload.id}/${suffix}.mp4`;
  await putOriginalObject(originalKey);
  const asset = await request<{ versions: Array<{ id: string }> }>("/assets", {
    method: "POST",
    body: JSON.stringify({ projectId: project.payload.id, name: "Media Asset", originalKey })
  }, owner.payload.token);
  const versionId = asset.payload.versions[0]?.id;
  assert.ok(versionId);

  const proxyKey = `${owner.payload.organization.id}/${project.payload.id}/${suffix}/proxy.mp4`;
  await prisma.assetVersion.update({ where: { id: versionId }, data: { proxyKey } });

  const forbidden = await request(`/media/proxies/${proxyKey}?token=${attacker.payload.token}`);
  assert.equal(forbidden.response.status, 404);
});
