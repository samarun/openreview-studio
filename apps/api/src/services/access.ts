import type { S3Client } from "@aws-sdk/client-s3";
import type { OrganizationRole, Prisma } from "@openreview/db";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma, type AuthUser, type ShareAccessToken } from "../context.js";
import { httpError } from "../lib/errors.js";
import { hlsManifestCandidateForKey, proxyStorageKeyCandidates, shareLinkRevoked } from "../lib/utils.js";

export const commentInclude = {
  author: { select: { id: true, email: true, name: true } },
  guestReviewer: { select: { id: true, email: true, name: true } },
  replies: {
    include: {
      author: { select: { id: true, email: true, name: true } },
      guestReviewer: { select: { id: true, email: true, name: true } }
    },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.CommentInclude;

function roleAllowed(role: string, allowedRoles: OrganizationRole[]) {
  return allowedRoles.includes(role as OrganizationRole);
}

export async function getAuthUser(app: FastifyInstance, request: { headers: { authorization?: string } }): Promise<AuthUser> {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (!token) throw httpError(401, "Missing bearer token");
  return app.jwt.verify<AuthUser>(token);
}

export async function getAuthUserFromHeaderOrQuery(
  app: FastifyInstance,
  request: { headers: { authorization?: string }; query?: unknown }
): Promise<AuthUser> {
  const query = request.query as { token?: string } | undefined;
  if (query?.token) return app.jwt.verify<AuthUser>(query.token);
  return getAuthUser(app, request);
}

export function shareAccessTokenFromRequest(request: { query?: unknown }) {
  const query = request.query as { accessToken?: string } | undefined;
  return query?.accessToken;
}

export function bearerTokenFromRequest(request: { headers: { authorization?: string }; query?: unknown }) {
  const query = request.query as { token?: string } | undefined;
  if (query?.token) return query.token;
  return request.headers.authorization?.startsWith("Bearer ")
    ? request.headers.authorization.slice("Bearer ".length)
    : undefined;
}

/**
 * Check whether a user can see a project. OWNER/ADMIN always have access.
 * MEMBER/REVIEWER only have access when the project has no explicit
 * ProjectMember rows, or when they have their own ProjectMember row.
 */
export async function assertProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organization: { members: { some: { userId } } }
    },
    include: { organization: { include: { members: { where: { userId } } } } }
  });
  if (!project) throw httpError(404, "Project not found");

  const membership = project.organization.members[0];
  if (!membership) throw httpError(404, "Project not found");

  if (membership.role === "OWNER" || membership.role === "ADMIN") {
    return project;
  }

  const hasExplicitMembers = await prisma.projectMember.count({ where: { projectId } });
  if (hasExplicitMembers === 0) return project;

  const isProjectMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } }
  });
  if (!isProjectMember) throw httpError(404, "Project not found");

  return project;
}

export async function assertOrganizationRole(userId: string, organizationId: string, allowedRoles: OrganizationRole[]) {
  const membership = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } }
  });
  if (!membership || !roleAllowed(membership.role, allowedRoles)) {
    throw httpError(403, "You do not have permission for this action");
  }
  return membership;
}

export async function assertProjectRole(userId: string, projectId: string, allowedRoles: OrganizationRole[]) {
  const project = await assertProjectAccess(userId, projectId);
  await assertOrganizationRole(userId, project.organizationId, allowedRoles);
  return project;
}

export async function assertCanChangeMembership(input: { membershipId: string; nextRole?: OrganizationRole; remove?: boolean }) {
  const membership = await prisma.organizationMember.findUnique({
    where: { id: input.membershipId },
    include: { user: { select: { id: true, email: true, name: true } } }
  });
  if (!membership) throw httpError(404, "Member not found");

  if (membership.role === "OWNER" && (input.remove || input.nextRole !== "OWNER")) {
    const ownerCount = await prisma.organizationMember.count({
      where: { organizationId: membership.organizationId, role: "OWNER" }
    });
    if (ownerCount <= 1) throw httpError(400, "An organization must keep at least one owner");
  }

  return membership;
}

export async function assertAssetAccess(userId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: {
      id: assetId,
      project: { organization: { members: { some: { userId } } } }
    },
    include: { project: { include: { organization: true } }, versions: { where: { archivedAt: null }, orderBy: { versionNumber: "asc" } } }
  });
  if (!asset) throw httpError(404, "Asset not found");

  await assertProjectAccess(userId, asset.projectId);
  return asset;
}

/**
 * Build a Prisma `where` filter for projects that a user can see.
 * OWNER/ADMIN see everything; MEMBER/REVIEWER only see projects that
 * either have no explicit ProjectMember rows, or include them as a member.
 */
export async function visibleProjectsFilter(userId: string): Promise<Prisma.ProjectWhereInput> {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    select: { organizationId: true, role: true }
  });
  if (memberships.length === 0) return { id: "__never__" };

  const adminOrgIds = memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.organizationId);
  const restrictedOrgIds = memberships
    .filter((m) => m.role !== "OWNER" && m.role !== "ADMIN")
    .map((m) => m.organizationId);

  const or: Prisma.ProjectWhereInput[] = [];

  if (adminOrgIds.length > 0) {
    or.push({ organizationId: { in: adminOrgIds } });
  }

  if (restrictedOrgIds.length > 0) {
    or.push({
      organizationId: { in: restrictedOrgIds },
      members: { none: {} }
    });
    or.push({
      organizationId: { in: restrictedOrgIds },
      members: { some: { userId } }
    });
  }

  if (or.length === 0) return { id: "__never__" };
  return or.length === 1 ? or[0]! : { OR: or };
}

export async function assertOriginalKeyAccess(userId: string, key: string) {
  const [, projectId] = key.split("/");
  if (!projectId) throw httpError(403, "Object key is not accessible");
  return assertProjectAccess(userId, projectId);
}

function mediaKeyWhere(key: string) {
  const keys = proxyStorageKeyCandidates(key);
  const or: Prisma.AssetVersionWhereInput["OR"] = [];

  for (const candidate of keys) {
    or.push({ proxyKey: candidate }, { hlsManifestKey: candidate }, { thumbnailKey: candidate });
    const hlsManifestKey = hlsManifestCandidateForKey(candidate);
    if (hlsManifestKey) or.push({ hlsManifestKey });
  }

  return { OR: or } satisfies Prisma.AssetVersionWhereInput;
}

export async function assertProxyKeyAccess(userId: string, key: string) {
  const version = await prisma.assetVersion.findFirst({
    where: {
      ...mediaKeyWhere(key),
      asset: { project: { organization: { members: { some: { userId } } } } }
    },
    include: { asset: { select: { projectId: true } } }
  });
  if (!version) throw httpError(404, "Media not found");

  await assertProjectAccess(userId, version.asset.projectId);
  return version;
}

export async function assertAssetVersionAccess(userId: string, assetVersionId: string) {
  const version = await prisma.assetVersion.findFirst({
    where: {
      id: assetVersionId,
      asset: { project: { organization: { members: { some: { userId } } } } }
    },
    include: { asset: { include: { project: { include: { organization: true } } } } }
  });
  if (!version) throw httpError(404, "Asset version not found");

  await assertProjectAccess(userId, version.asset.projectId);
  return version;
}

export async function assertCommentAccess(userId: string, commentId: string) {
  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      assetVersion: { asset: { project: { organization: { members: { some: { userId } } } } } }
    },
    include: { assetVersion: { select: { asset: { select: { projectId: true } } } } }
  });
  if (!comment) throw httpError(404, "Comment not found");

  await assertProjectAccess(userId, comment.assetVersion.asset.projectId);
  return comment;
}

export async function getAccessibleShareLink(app: FastifyInstance, shareToken: string, accessToken?: string) {
  const shareLink = await prisma.shareLink.findUnique({ where: { token: shareToken } });
  if (!shareLink || shareLinkRevoked(shareLink)) throw httpError(404, "Share link not found");

  if (!shareLink.passwordHash) return shareLink;
  if (!accessToken) throw httpError(403, "Share password required");

  try {
    const payload = app.jwt.verify<ShareAccessToken>(accessToken);
    if (payload.shareToken !== shareToken) throw httpError(403, "Invalid share access token");
  } catch {
    throw httpError(403, "Invalid share access token");
  }

  return shareLink;
}

export async function assertShareProxyKeyAccess(
  app: FastifyInstance,
  shareToken: string,
  accessToken: string | undefined,
  key: string
) {
  const shareLink = await getAccessibleShareLink(app, shareToken, accessToken);
  if (!shareLink.assetVersionId) throw httpError(404, "Share link not found");

  const version = await prisma.assetVersion.findFirst({
    where: { id: shareLink.assetVersionId, ...mediaKeyWhere(key) }
  });
  if (!version) throw httpError(404, "Media not found");
  return version;
}

export async function findOrCreateGuestReviewer(input: { name: string; email?: string }) {
  if (input.email) {
    return prisma.guestReviewer.upsert({
      where: { email: input.email.toLowerCase() },
      update: { name: input.name },
      create: { name: input.name, email: input.email.toLowerCase() }
    });
  }

  return prisma.guestReviewer.create({
    data: { name: input.name }
  });
}

export function formatShareLink(link: { id: string; token: string; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date; updatedAt: Date; passwordHash: string | null }) {
  return {
    id: link.id,
    token: link.token,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    passwordProtected: Boolean(link.passwordHash),
    revoked: shareLinkRevoked(link)
  };
}

export async function uniqueOrganizationSlug(name: string) {
  const { slugify } = await import("../lib/utils.js");
  const base = slugify(name) || "organization";
  let slug = base;
  let counter = 2;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  return slug;
}

export async function assertOriginalObjectExists(
  s3Client: import("@aws-sdk/client-s3").S3Client,
  key: string,
  bucket: string
) {
  const { HeadObjectCommand } = await import("../context.js");
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    throw httpError(400, "Original object was not found. Upload the file before creating an asset or version.");
  }
}

export async function checkStorageQuota(organizationId: string, additionalBytes: bigint) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org?.storageQuotaBytes) return;
  const used = org.storageUsedBytes + additionalBytes;
  if (used > org.storageQuotaBytes) {
    throw httpError(403, "Organization storage quota exceeded");
  }
}

export async function incrementStorageUsed(organizationId: string, bytes: bigint) {
  if (bytes <= 0n) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { storageUsedBytes: { increment: bytes } }
  });
}

export async function getObjectByteSize(s3Client: S3Client, bucket: string, key: string) {
  const { HeadObjectCommand } = await import("../context.js");
  const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return BigInt(head.ContentLength ?? 0);
}
