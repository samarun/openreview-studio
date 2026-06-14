ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "AssetVersion" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");
CREATE INDEX "Asset_archivedAt_idx" ON "Asset"("archivedAt");
CREATE INDEX "AssetVersion_archivedAt_idx" ON "AssetVersion"("archivedAt");
