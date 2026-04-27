-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "encryptedWhatssmsSecret" TEXT,
    "whatssmsApiBaseUrl" TEXT,
    "defaultSmsMode" TEXT NOT NULL DEFAULT 'devices',
    "defaultSmsDeviceId" TEXT,
    "defaultWaAccountId" TEXT,
    "urlShortenerSms" BOOLEAN NOT NULL DEFAULT false,
    "urlShortenerWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "codEnabled" BOOLEAN NOT NULL DEFAULT true,
    "codSendSms" BOOLEAN NOT NULL DEFAULT true,
    "codSendWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "codSmsTemplate" TEXT NOT NULL DEFAULT 'Hi {{customer_first_name}},
Please click the link below to confirm your order:
{{order_name}}
{{line_items}}
{{order_total}}

{{confirm_url_sms}}

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}',
    "codWaTemplate" TEXT NOT NULL DEFAULT 'Hi {{customer_first_name}},
Please click the link below to confirm your order:
{{order_name}}
{{line_items}}
{{order_total}}

{{confirm_url_wa}}

If you have any questions, feel free to contact us.

Regards,
{{shop_name}}',
    "codLinkTtlHours" INTEGER NOT NULL DEFAULT 72,
    "codGatewayHints" TEXT,
    "marketingRequiresSmsConsent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "OrderConfirmationNotification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderNumericId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderConfirmationNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendSms" BOOLEAN NOT NULL DEFAULT false,
    "sendWa" BOOLEAN NOT NULL DEFAULT false,
    "template" TEXT NOT NULL DEFAULT '',
    "smsMode" TEXT,
    "smsDevice" TEXT,
    "waAccount" TEXT,
    "abandonedCheckoutDelayMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "payloadHash" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodToken" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderGid" TEXT NOT NULL,
    "orderNumericId" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAction" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionIp" TEXT,
    "decisionUserAgent" TEXT,
    "decisionLanguage" TEXT,
    "decisionReferer" TEXT,

    CONSTRAINT "CodToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredCustomerRef" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerGid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredCustomerRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderConfirmationNotification_shop_idx" ON "OrderConfirmationNotification"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "OrderConfirmationNotification_shop_orderNumericId_key" ON "OrderConfirmationNotification"("shop", "orderNumericId");

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

