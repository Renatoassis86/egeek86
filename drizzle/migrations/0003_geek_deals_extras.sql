-- Custom SQL migration file, put your code below! --

-- affiliate_offers.updated_at: o trigger universal foi aplicado em 0001_extras.sql
-- via loop sobre as tabelas existentes na época (não é automático para tabelas
-- novas). Reaproveita a function set_updated_at() já criada em 0001.
DROP TRIGGER IF EXISTS set_updated_at_trigger ON "affiliate_offers";
CREATE TRIGGER set_updated_at_trigger BEFORE UPDATE ON "affiliate_offers"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
