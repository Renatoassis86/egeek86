-- Rollback da 0058.
DROP INDEX IF EXISTS group_messages_offer_created_idx;
ALTER TABLE affiliate_offers DROP COLUMN IF EXISTS link_verificado_em;
