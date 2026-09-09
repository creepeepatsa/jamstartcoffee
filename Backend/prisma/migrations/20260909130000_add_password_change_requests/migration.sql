CREATE TABLE "PasswordChangeRequest" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "PasswordChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordChangeRequest_status_idx" ON "PasswordChangeRequest"("status");
CREATE INDEX "PasswordChangeRequest_email_idx" ON "PasswordChangeRequest"("email");