import { z } from "zod";

export const timecodeSchema = z.object({
  seconds: z.number().nonnegative(),
  frame: z.number().int().nonnegative().optional(),
  rate: z.number().positive().optional()
});

export type ReviewTimecode = z.infer<typeof timecodeSchema>;

export const assetVersionStatus = ["UPLOADED", "PROCESSING", "READY", "FAILED"] as const;
export type AssetVersionStatus = (typeof assetVersionStatus)[number];

export const approvalStatus = ["PENDING", "CHANGES_REQUESTED", "APPROVED"] as const;
export type ApprovalStatus = (typeof approvalStatus)[number];

/** Roll up per-reviewer approvals into a single version status for project grids. */
export function rollupApprovalStatus(approvals: Array<{ status: ApprovalStatus }>): ApprovalStatus {
  if (approvals.length === 0) return "PENDING";
  const statuses = approvals.map((approval) => approval.status);
  if (statuses.some((status) => status === "CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (statuses.every((status) => status === "APPROVED")) return "APPROVED";
  if (statuses.some((status) => status === "APPROVED")) return "APPROVED";
  return "PENDING";
}

export const organizationRole = ["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const;

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8),
  organizationName: z.string().min(1).max(120)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).nullable().optional(),
  email: z.string().email().optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(160),
  organizationId: z.string().min(1)
});

export const createAssetSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(240),
  originalKey: z.string().min(1).max(1024),
  folderId: z.string().min(1).optional()
});

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 * 1024; // 5TB (S3 max object size)
const MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PART_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const MAX_PARTS = 10_000;

/**
 * Calculate optimal part size for multipart uploads.
 * Scales the part size with file size to stay under the 10,000 parts limit.
 */
export function calculatePartSize(fileSizeBytes: number): number {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  let partSize: number;

  if (fileSizeBytes <= 5 * GB) {
    partSize = 64 * MB;
  } else if (fileSizeBytes <= 50 * GB) {
    partSize = 128 * MB;
  } else if (fileSizeBytes <= 500 * GB) {
    partSize = 512 * MB;
  } else {
    partSize = Math.ceil(fileSizeBytes / (MAX_PARTS - 1));
  }

  return Math.max(MIN_PART_SIZE, Math.min(MAX_PART_SIZE, partSize));
}

export const presignUploadSchema = z.object({
  projectId: z.string().min(1),
  filename: z.string().min(1).max(240),
  contentType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE)
});

export const createMultipartUploadSchema = presignUploadSchema.extend({
  partCount: z.number().int().min(1).max(MAX_PARTS)
});

export const signMultipartPartSchema = z.object({
  key: z.string().min(1).max(1024),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1).max(MAX_PARTS)
});

export const completeMultipartUploadSchema = z.object({
  key: z.string().min(1).max(1024),
  uploadId: z.string().min(1),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE).optional(),
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1).max(MAX_PARTS)
});

export const abortMultipartUploadSchema = z.object({
  key: z.string().min(1).max(1024),
  uploadId: z.string().min(1)
});

export const createVersionSchema = z.object({
  originalKey: z.string().min(1).max(1024)
});

export const createCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  timeSeconds: z.number().nonnegative(),
  frame: z.number().int().nonnegative().optional(),
  annotationJson: z.unknown().optional()
});

export const createReplySchema = z.object({
  body: z.string().min(1).max(4000)
});

export const resolveCommentSchema = z.object({
  resolved: z.boolean()
});

export const approvalSchema = z.object({
  status: z.enum(approvalStatus),
  note: z.string().max(4000).optional()
});

export const archiveSchema = z.object({
  archived: z.boolean()
});

export const revokeShareLinkSchema = z.object({
  revoked: z.boolean().default(true)
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "MEMBER", "REVIEWER"]).default("MEMBER")
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(organizationRole)
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional()
});

export const createShareLinkSchema = z.object({
  expiresAt: z.string().datetime().optional(),
  password: z.string().min(8).max(200).optional(),
  inviteEmail: z.string().email().optional()
});

export const shareAccessSchema = z.object({
  password: z.string().optional()
});

export const publicCommentSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  body: z.string().min(1).max(4000),
  timeSeconds: z.number().nonnegative(),
  frame: z.number().int().nonnegative().optional(),
  annotationJson: z.unknown().optional()
});

export const publicReplySchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  body: z.string().min(1).max(4000)
});

export const publicApprovalSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  status: z.enum(approvalStatus),
  note: z.string().max(4000).optional()
});

export const createFolderSchema = z.object({
  projectId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  name: z.string().min(1).max(160)
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  parentId: z.string().min(1).nullable().optional()
});

export const moveAssetSchema = z.object({
  folderId: z.string().min(1).nullable()
});

export const addProjectMemberSchema = z.object({
  userId: z.string().min(1)
});

export type ReviewEventType =
  | "comment.created"
  | "comment.updated"
  | "comment.resolved"
  | "reply.created"
  | "approval.updated"
  | "version.status"
  | "presence.updated";

export type ReviewEvent = {
  type: ReviewEventType;
  assetVersionId: string;
  payload: unknown;
  at: string;
};
