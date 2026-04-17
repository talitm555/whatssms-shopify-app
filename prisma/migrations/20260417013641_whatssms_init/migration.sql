-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "encryptedWhatssmsSecret" TEXT,
    "whatssmsApiBaseUrl" TEXT,
    "defaultSmsMode" TEXT NOT NULL DEFAULT 'devices',
    "defaultSmsDeviceId" TEXT,
    "defaultWaAccountId" TEXT,
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "codSendSms" BOOLEAN NOT NULL DEFAULT true,
    "codSendWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "codSmsTemplate" TEXT NOT NULL DEFAULT 'Order {{order_name}} ({{order_total}}). Confirm or reject: {{confirm_url_sms}}',
    "codWaTemplate" TEXT NOT NULL DEFAULT 'Order {{order_name}} ({{order_total}}). Confirm or reject: {{confirm_url_wa}}',
    "codLinkTtlHours" INTEGER NOT NULL DEFAULT 72,
    "codGatewayHints" TEXT,
    "marketingRequiresSmsConsent" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendSms" BOOLEAN NOT NULL DEFAULT false,
    "sendWa" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT NOT NULL DEFAULT '',
    "smsMode" TEXT,
    "smsDevice" TEXT,
    "waAccount" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "payloadHash" TEXT,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CodToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "orderNumericId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "resolvedAction" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AsyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoredCustomerRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerGid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Automation_shop_key_key" ON "Automation"("shop", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookReceipt_webhookId_key" ON "WebhookReceipt"("webhookId");

-- CreateIndex
CREATE UNIQUE INDEX "CodToken_publicToken_key" ON "CodToken"("publicToken");

-- CreateIndex
CREATE INDEX "CodToken_shop_orderGid_idx" ON "CodToken"("shop", "orderGid");

-- CreateIndex
CREATE INDEX "AsyncJob_status_runAfter_idx" ON "AsyncJob"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "StoredCustomerRef_shop_customerGid_key" ON "StoredCustomerRef"("shop", "customerGid");
