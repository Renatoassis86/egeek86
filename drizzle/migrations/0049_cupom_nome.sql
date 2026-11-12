-- 0049: NOME E CODIGO DO CUPOM LIDOS NA PAGINA (dono, 2026-11-12: "SEMPRE na mensagem coloque o NOME DO CUPOM DA PROMOCAO").
-- PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0048). ADITIVA: duas colunas anulaveis, sem DEFAULT.
-- NULL = a pagina nao mostrou nome/codigo (nunca inventado). coupon_name: titulo da promocao como a pagina escreve (texto limpo, ate 80);
-- coupon_code: codigo digitavel (4 a 20, A-Z0-9_-). O schema Drizzle NAO ganhou as colunas de proposito (mesmo molde da 0047); as rotas so
-- gravam com CUPOM_NOME_COLUNAS=1, depois de aplicada; a leitura (lookup) e tolerante a coluna ausente (to_jsonb). Rollback: 0049_cupom_nome.rollback.sql.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE offer_coupon_reads ADD COLUMN IF NOT EXISTS coupon_name text;
ALTER TABLE offer_coupon_reads ADD COLUMN IF NOT EXISTS coupon_code text;
