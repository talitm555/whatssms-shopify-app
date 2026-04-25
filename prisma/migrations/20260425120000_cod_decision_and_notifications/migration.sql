-- Redundant with schema: CodToken decision metadata
ALTER TABLE "CodToken" ADD COLUMN "decisionIp" TEXT;
ALTER TABLE "CodToken" ADD COLUMN "decisionUserAgent" TEXT;
ALTER TABLE "CodToken" ADD COLUMN "decisionLanguage" TEXT;
ALTER TABLE "CodToken" ADD COLUMN "decisionReferer" TEXT;

-- Remove legacy automation keys (replaced by Shopify topic slugs)
DELETE FROM "Automation" WHERE "key" NOT IN (
  'customers/create',
  'orders/create',
  'orders/updated',
  'orders/paid',
  'orders/fulfilled',
  'orders/cancelled',
  'fulfillments/create',
  'fulfillments/update'
);
