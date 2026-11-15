-- 0058 (#119): anuncio do link verificado pela PAGINA uma vez (link_verificado_em) e indice para a consulta do escopo canal. ADITIVA e idempotente.
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS link_verificado_em timestamptz;
CREATE INDEX IF NOT EXISTS group_messages_offer_created_idx ON group_messages (offer_id, created_at);
