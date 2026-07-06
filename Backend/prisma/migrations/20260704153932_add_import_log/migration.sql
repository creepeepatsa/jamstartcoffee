-- CreateTable
CREATE TABLE "ImportLog" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedBy" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportLog_fileHash_key" ON "ImportLog"("fileHash");
