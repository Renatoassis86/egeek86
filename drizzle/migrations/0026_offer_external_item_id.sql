-- Identificador estavel do anuncio na loja (2026-11-06). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0025). Aplicar so com aprovacao do dono, com backup:
--   npx tsx --env-file=.env.local scripts/apply-offer-external-item-id.ts            # dry-run
--   npx tsx --env-file=.env.local scripts/apply-offer-external-item-id.ts --apply
-- Ata: docs/conselho/atas/2026-11-06-coleta-multi-catalogo-ml.md (decisao 4).
-- Problema: external_ref guarda o catalog_product_id (varios vendedores e, em masters multi-catalogo, varios catalogos);
-- nao diz QUAL anuncio (item_id MLB...) a oferta representa. Sem isso nao ha como reconhecer o mesmo anuncio entre catalogos.
-- ADITIVA: 1 coluna NULLABLE sem default (so metadado, sem reescrever a tabela) + 1 indice unico PARCIAL.
-- Sem backfill: NULL = "ainda nao observado". Como todas as linhas ficam NULL, o indice unico nao pode falhar na criacao.
-- Nenhuma oferta, cotacao ou produto e tocado. Rollback: 0026_offer_external_item_id.rollback.sql.
-- A coluna NAO entra no schema Drizzle (src/db/schema) de proposito (db.select().from(affiliateOffers) listaria a coluna e
-- quebraria em producao antes da migration); o codigo futuro a grava/le por SQL cru, atras de flag.
-- ATENCAO antes de gravar: dois registros com o mesmo item na mesma rede violam o indice; quem gravar deve tratar o conflito
-- (ON CONFLICT DO NOTHING e registrar), nunca derrubar a coleta.

SET LOCAL lock_timeout = '5s';

ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS external_item_id text;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_offers_network_item_uq
  ON affiliate_offers (network_id, external_item_id)
  WHERE external_item_id IS NOT NULL;
-- (affiliate_offers ja tem RLS ligado e REVOKE de tabela inteira na 0019: a coluna nova herda.)
