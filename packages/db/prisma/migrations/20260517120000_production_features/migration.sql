-- AlterTable Organization
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "storageQuotaBytes" BIGINT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;

-- AlterTable ShareLink
ALTER TABLE "ShareLink" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

-- CreateTable InviteToken
CREATE TABLE IF NOT EXISTS "InviteToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InviteToken_token_key" ON "InviteToken"("token");
CREATE INDEX IF NOT EXISTS "InviteToken_userId_idx" ON "InviteToken"("userId");

ALTER TABLE "InviteToken" DROP CONSTRAINT IF EXISTS "InviteToken_userId_fkey";
ALTER TABLE "InviteToken" ADD CONSTRAINT "InviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GuestReviewer unique email (nullable)
CREATE UNIQUE INDEX IF NOT EXISTS "GuestReviewer_email_key" ON "GuestReviewer"("email");

-- AlterTable Asset
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "folderId" TEXT;
CREATE INDEX IF NOT EXISTS "Asset_folderId_idx" ON "Asset"("folderId");

-- CreateTable Folder
CREATE TABLE IF NOT EXISTS "Folder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Folder_projectId_idx" ON "Folder"("projectId");
CREATE INDEX IF NOT EXISTS "Folder_parentId_idx" ON "Folder"("parentId");

ALTER TABLE "Folder" DROP CONSTRAINT IF EXISTS "Folder_projectId_fkey";
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Folder" DROP CONSTRAINT IF EXISTS "Folder_parentId_fkey";
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Folder" DROP CONSTRAINT IF EXISTS "Folder_organizationId_fkey";
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Asset" DROP CONSTRAINT IF EXISTS "Asset_folderId_fkey";
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_userId_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Approval unique for guest reviewers
CREATE UNIQUE INDEX IF NOT EXISTS "Approval_assetVersionId_guestReviewerId_key" ON "Approval"("assetVersionId", "guestReviewerId");

-- CommentReply guest support
ALTER TABLE "CommentReply" ALTER COLUMN "authorId" DROP NOT NULL;
ALTER TABLE "CommentReply" ADD COLUMN IF NOT EXISTS "guestReviewerId" TEXT;
ALTER TABLE "CommentReply" DROP CONSTRAINT IF EXISTS "CommentReply_guestReviewerId_fkey";
ALTER TABLE "CommentReply" ADD CONSTRAINT "CommentReply_guestReviewerId_fkey" FOREIGN KEY ("guestReviewerId") REFERENCES "GuestReviewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
