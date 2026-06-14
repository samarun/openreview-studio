ALTER TABLE "Approval" ADD COLUMN "guestReviewerId" TEXT;
ALTER TABLE "Approval" ALTER COLUMN "reviewerId" DROP NOT NULL;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_guestReviewerId_fkey" FOREIGN KEY ("guestReviewerId") REFERENCES "GuestReviewer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
