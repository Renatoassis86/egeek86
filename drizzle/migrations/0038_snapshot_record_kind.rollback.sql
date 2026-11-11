ALTER TABLE affiliate_price_snapshots DROP CONSTRAINT IF EXISTS affiliate_price_snapshots_kind_chk;
ALTER TABLE affiliate_price_snapshots DROP COLUMN IF EXISTS record_kind;
