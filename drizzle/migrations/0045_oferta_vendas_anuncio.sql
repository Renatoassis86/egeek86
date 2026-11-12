-- 0045: VENDAS DO ANUNCIO (sold_quantity) EM affiliate_offers, para o filtro de escopo das lojas Plus (dono autorizou em 2026-11-12).
-- PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0044). ADITIVA: duas colunas anulaveis, sem DEFAULT (metadado, sem reescrever tabela).
-- Fonte: SOMENTE API oficial. Medicao de 2026-11-08: /products/{id}/items NAO traz sold_quantity (0 de 37 itens); /items/{id} e /items?ids= dao 403 para
-- anuncio de terceiro. Entao as colunas ficam NULL (= nao informado) ate existir fonte oficial; o coletor so grava quando o campo vem no payload.
-- NULL nunca e tratado como 0 (sem dado nao e "zero vendas"). O schema Drizzle NAO ganhou as colunas de proposito (mesmo molde da 0044: select() total
-- quebraria antes da migracao); as leituras/gravacoes usam SQL cru, e o codigo de gravacao so toca a coluna quando ha valor no payload.
-- Rollback: 0045_oferta_vendas_anuncio.rollback.sql.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS sold_quantity    integer;      -- vendas acumuladas do anuncio na rede; NULL = nao informado
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS sold_quantity_at timestamptz;  -- quando a API informou esse valor (frescor)

-- Indice parcial pequeno: so ofertas com dado (a agregacao por master filtra por sold_quantity IS NOT NULL).
CREATE INDEX IF NOT EXISTS affiliate_offers_sold_quantity_idx ON affiliate_offers (master_product_id) WHERE sold_quantity IS NOT NULL;
