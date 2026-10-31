-- CreateTable
CREATE TABLE "verification_searches" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "nid" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "matchFound" BOOLEAN NOT NULL DEFAULT false,
    "redirectedToCentral" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "matchedProfile" JSONB,
    "filledFields" JSONB,
    "photoUrl" TEXT,
    "documentUrl" TEXT,
    "documentBackUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc_submissions" (
    "id" TEXT NOT NULL,
    "submitJobId" TEXT,
    "searchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTING',
    "stage" TEXT,
    "subscriberName" TEXT,
    "nationalIdNumber" TEXT,
    "phoneNumber" TEXT,
    "connection" TEXT,
    "subscriberType" TEXT,
    "allFormFields" JSONB,
    "userFilledFields" JSONB,
    "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
    "hasDocument" BOOLEAN NOT NULL DEFAULT false,
    "hasDocumentBack" BOOLEAN NOT NULL DEFAULT false,
    "photoData" TEXT,
    "documentData" TEXT,
    "documentBackData" TEXT,
    "durationMs" INTEGER,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "loginUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_credentials" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "display_companies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "display_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "centralIdentityUserId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "nidHash" TEXT,
    "customerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "companyName" TEXT,
    "companyPosition" TEXT,
    "kycVerifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numbers" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'BD',
    "countryCode" TEXT NOT NULL DEFAULT '+880',
    "city" TEXT,
    "area" TEXT,
    "numberType" TEXT NOT NULL DEFAULT 'MOBILE',
    "callRate" DECIMAL(10,4),
    "costPrice" DECIMAL(10,2),
    "salePrice" DECIMAL(10,2),
    "providerId" TEXT,
    "providerReferenceId" TEXT,
    "displayCompanyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "activationStatus" TEXT,
    "customerId" TEXT,
    "reservedAt" TIMESTAMP(3),
    "reservationExpiresAt" TIMESTAMP(3),
    "reservedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_status_history" (
    "id" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_wallets" (
    "id" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "paymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "rechargeOrderId" TEXT,
    "numberId" TEXT,
    "walletId" TEXT,
    "gateway" TEXT NOT NULL DEFAULT 'PIPRAPAY',
    "gatewayPaymentId" TEXT,
    "gatewayTransactionId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "idempotencyKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_audit_logs" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "oldAmount" DECIMAL(12,2),
    "newAmount" DECIMAL(12,2),
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "adminId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recharge_orders" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "numberId" TEXT NOT NULL,
    "walletId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recharge_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_imports" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "importedBy" TEXT NOT NULL,
    "errorLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_import_rows" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "numberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_searches_jobId_key" ON "verification_searches"("jobId");

-- CreateIndex
CREATE INDEX "verification_searches_nid_idx" ON "verification_searches"("nid");

-- CreateIndex
CREATE INDEX "verification_searches_status_idx" ON "verification_searches"("status");

-- CreateIndex
CREATE INDEX "verification_searches_createdAt_idx" ON "verification_searches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "icc_submissions_submitJobId_key" ON "icc_submissions"("submitJobId");

-- CreateIndex
CREATE INDEX "icc_submissions_nationalIdNumber_idx" ON "icc_submissions"("nationalIdNumber");

-- CreateIndex
CREATE INDEX "icc_submissions_status_idx" ON "icc_submissions"("status");

-- CreateIndex
CREATE INDEX "icc_submissions_createdAt_idx" ON "icc_submissions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "providers_code_key" ON "providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_credentials_providerId_key" ON "provider_credentials"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "display_companies_code_key" ON "display_companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_centralIdentityUserId_key" ON "customers"("centralIdentityUserId");

-- CreateIndex
CREATE INDEX "customers_centralIdentityUserId_idx" ON "customers"("centralIdentityUserId");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "numbers_number_key" ON "numbers"("number");

-- CreateIndex
CREATE UNIQUE INDEX "numbers_normalizedNumber_key" ON "numbers"("normalizedNumber");

-- CreateIndex
CREATE INDEX "numbers_status_idx" ON "numbers"("status");

-- CreateIndex
CREATE INDEX "numbers_customerId_idx" ON "numbers"("customerId");

-- CreateIndex
CREATE INDEX "numbers_providerId_idx" ON "numbers"("providerId");

-- CreateIndex
CREATE INDEX "number_status_history_numberId_idx" ON "number_status_history"("numberId");

-- CreateIndex
CREATE UNIQUE INDEX "number_wallets_numberId_key" ON "number_wallets"("numberId");

-- CreateIndex
CREATE INDEX "number_wallets_customerId_idx" ON "number_wallets"("customerId");

-- CreateIndex
CREATE INDEX "number_wallet_transactions_walletId_idx" ON "number_wallet_transactions"("walletId");

-- CreateIndex
CREATE INDEX "number_wallet_transactions_numberId_idx" ON "number_wallet_transactions"("numberId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_numberId_idx" ON "order_items"("numberId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_idx" ON "order_status_history"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_customerId_idx" ON "payments"("customerId");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payment_audit_logs_paymentId_idx" ON "payment_audit_logs"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "recharge_orders_idempotencyKey_key" ON "recharge_orders"("idempotencyKey");

-- CreateIndex
CREATE INDEX "recharge_orders_customerId_idx" ON "recharge_orders"("customerId");

-- CreateIndex
CREATE INDEX "recharge_orders_numberId_idx" ON "recharge_orders"("numberId");

-- CreateIndex
CREATE INDEX "number_import_rows_importId_idx" ON "number_import_rows"("importId");

-- CreateIndex
CREATE INDEX "system_audit_logs_actorId_idx" ON "system_audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "system_audit_logs_resource_idx" ON "system_audit_logs"("resource");

-- CreateIndex
CREATE INDEX "system_audit_logs_createdAt_idx" ON "system_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "icc_submissions" ADD CONSTRAINT "icc_submissions_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "verification_searches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_displayCompanyId_fkey" FOREIGN KEY ("displayCompanyId") REFERENCES "display_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_status_history" ADD CONSTRAINT "number_status_history_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_wallets" ADD CONSTRAINT "number_wallets_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_wallets" ADD CONSTRAINT "number_wallets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_wallet_transactions" ADD CONSTRAINT "number_wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "number_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_import_rows" ADD CONSTRAINT "number_import_rows_importId_fkey" FOREIGN KEY ("importId") REFERENCES "number_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
