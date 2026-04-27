-- CreateTable
CREATE TABLE "OrderConfirmationNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderNumericId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "OrderConfirmationNotification_shop_idx" ON "OrderConfirmationNotification"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "OrderConfirmationNotification_shop_orderNumericId_key" ON "OrderConfirmationNotification"("shop", "orderNumericId");

-- Rename automation key: "Order updated" is replaced by app-defined "Order confirmed" (still driven by `orders/updated` webhooks + tag filter).
UPDATE "Automation" SET "key" = 'app/order_confirmed' WHERE "key" = 'orders/updated';
