-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
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
    "marketingRequiresSmsConsent" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_ShopSettings" ("codEnabled", "codGatewayHints", "codLinkTtlHours", "codSendSms", "codSendWhatsapp", "codSmsTemplate", "codWaTemplate", "createdAt", "defaultSmsDeviceId", "defaultSmsMode", "defaultWaAccountId", "encryptedWhatssmsSecret", "marketingRequiresSmsConsent", "shop", "updatedAt", "urlShortenerSms", "urlShortenerWhatsapp", "whatssmsApiBaseUrl") SELECT "codEnabled", "codGatewayHints", "codLinkTtlHours", "codSendSms", "codSendWhatsapp", "codSmsTemplate", "codWaTemplate", "createdAt", "defaultSmsDeviceId", "defaultSmsMode", "defaultWaAccountId", "encryptedWhatssmsSecret", "marketingRequiresSmsConsent", "shop", "updatedAt", "urlShortenerSms", "urlShortenerWhatsapp", "whatssmsApiBaseUrl" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
