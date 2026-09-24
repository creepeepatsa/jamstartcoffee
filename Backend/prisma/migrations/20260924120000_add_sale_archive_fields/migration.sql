ALTER TABLE "Sale" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedBy" TEXT;

CREATE INDEX "Sale_archivedAt_idx" ON "Sale"("archivedAt");