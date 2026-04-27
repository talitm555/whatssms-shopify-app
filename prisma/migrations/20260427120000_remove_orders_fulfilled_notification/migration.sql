-- Remove obsolete "Order fulfilled" (orders/fulfilled) automation rules.
DELETE FROM "Automation" WHERE "key" = 'orders/fulfilled';
