CREATE TABLE "GuestReviewer" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestReviewer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShareLink" ADD COLUMN "assetVersionId" TEXT;
ALTER TABLE "Comment" ADD COLUMN "guestReviewerId" TEXT;
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_guestReviewerId_fkey" FOREIGN KEY ("guestReviewerId") REFERENCES "GuestReviewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_assetVersionId_fkey" FOREIGN KEY ("assetVersionId") REFERENCES "AssetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
