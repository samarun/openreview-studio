export type Organization = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  brandColor?: string | null;
};

export type Membership = {
  organization: Organization;
};

export type User = {
  id: string;
  email: string;
  name: string | null;
  memberships?: Membership[];
};

export type AssetVersion = {
  id: string;
  versionNumber: number;
  originalKey: string;
  proxyKey: string | null;
  hlsManifestKey: string | null;
  thumbnailKey: string | null;
  durationSeconds: number | null;
  frameRate: number | null;
  width: number | null;
  height: number | null;
  failureReason: string | null;
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  approvals?: Approval[];
};

export type Asset = {
  id: string;
  name: string;
  folderId?: string | null;
  project?: Project & { organization?: Organization };
  versions: AssetVersion[];
};

export type ProjectMember = {
  id: string;
  projectId: string;
  userId: string;
  createdAt: string;
  user: Pick<User, "id" | "email" | "name">;
};

export type OrgMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "REVIEWER";
  user: Pick<User, "id" | "email" | "name">;
};

export type Project = {
  id: string;
  name: string;
  organization: Organization;
  assets: Asset[];
};

export type ReviewComment = {
  id: string;
  body: string;
  timeSeconds: number;
  frame: number | null;
  annotationJson: AnnotationData | null;
  resolvedAt: string | null;
  author: Pick<User, "id" | "email" | "name"> | null;
  guestReviewer: GuestReviewer | null;
  replies: CommentReply[];
};

export type GuestReviewer = {
  id: string;
  email: string | null;
  name: string;
};

export type CommentReply = {
  id: string;
  body: string;
  author: Pick<User, "id" | "email" | "name"> | null;
  guestReviewer: GuestReviewer | null;
  createdAt: string;
};

export type Notification = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type Folder = {
  id: string;
  name: string;
  projectId: string;
  parentId: string | null;
  assets?: Asset[];
};

export type ApprovalStatus = "PENDING" | "CHANGES_REQUESTED" | "APPROVED";

export type Approval = {
  id: string;
  status: ApprovalStatus;
  note: string | null;
  updatedAt: string;
};

export type ShareLink = {
  id: string;
  token: string;
  expiresAt: string | null;
  assetVersion: AssetVersion & { asset: Asset; comments: ReviewComment[]; approvals: Approval[] };
  project: {
    id: string;
    name: string;
    organization: Organization;
  };
};

export type ReviewShareLink = {
  id: string;
  token: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  passwordProtected: boolean;
  revoked: boolean;
};

export type OrganizationShareLink = {
  id: string;
  token: string;
  projectId: string;
  projectName: string;
  assetVersionId: string | null;
  assetName: string | null;
  versionNumber: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  passwordProtected: boolean;
  createdAt: string;
};

export type AnnotationPoint = { x: number; y: number };

export type AnnotationPath = {
  kind?: "freehand";
  color: string;
  points: AnnotationPoint[];
};

export type AnnotationShape = {
  kind: "rectangle" | "circle" | "arrow" | "text";
  color: string;
  start: AnnotationPoint;
  end: AnnotationPoint;
  text?: string;
};

export type AnnotationData = {
  type: "annotation" | "freehand";
  shapes?: AnnotationShape[];
  paths: AnnotationPath[];
  /** When set, drawing stays visible from comment time through this second. */
  endSeconds?: number | null;
};

export type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actorUser: { id: string; email: string; name: string | null } | null;
};
