-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "urlShortenerSms" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN "urlShortenerWhatsapp" BOOLEAN NOT NULL DEFAULT false;
