-- CreateTable
CREATE TABLE "recharge_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "balanceBefore" DECIMAL(12,2),
    "balanceAfter" DECIMAL(12,2),
    "idempotencyKey" TEXT,
    "jobId" TEXT,
    "durationMs" INTEGER,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "recharge_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recharge_transactions_idempotencyKey_key" ON "recharge_transactions"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "recharge_transactions_jobId_key" ON "recharge_transactions"("jobId");

-- CreateIndex
CREATE INDEX "recharge_transactions_userId_idx" ON "recharge_transactions"("userId");

-- CreateIndex
CREATE INDEX "recharge_transactions_numberId_idx" ON "recharge_transactions"("numberId");

-- CreateIndex
CREATE INDEX "recharge_transactions_phone_idx" ON "recharge_transactions"("phone");

-- CreateIndex
CREATE INDEX "recharge_transactions_status_idx" ON "recharge_transactions"("status");

-- CreateIndex
CREATE INDEX "recharge_transactions_createdAt_idx" ON "recharge_transactions"("createdAt");

-- AddForeignKey
ALTER TABLE "recharge_transactions" ADD CONSTRAINT "recharge_transactions_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recharge_transactions" ADD CONSTRAINT "recharge_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
