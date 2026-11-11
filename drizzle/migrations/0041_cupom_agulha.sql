-- 0041: auditoria do "cupom na agulha" (Agente de Cupons, 2026-11-11). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0040). ADITIVA: so acrescenta uma coluna anulavel
-- a coupon_consults (0037). Nenhuma oferta, cotacao, cupom, anuncio divulgado ou mensagem e tocado.
-- Rollback: 0041_cupom_agulha.rollback.sql (remove a coluna e o indice).
-- Aplicar com: npx tsx --env-file=.env.local scripts/apply-cupom-agulha.ts --apply  (apenas o dono).
-- O codigo tolera a ausencia da migration: sem a coluna, a consulta grava como antes (sem o motivo).

-- Por que NAO saiu cupom numa consulta ("item:sem_leitura | campanha:sem_codigo_do_dono_ativo | loja_categoria:..."). NULL quando saiu.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE coupon_consults ADD COLUMN IF NOT EXISTS miss_reason text;

-- Consulta frequente do painel de saude: motivos nas ultimas 24 h.
CREATE INDEX IF NOT EXISTS coupon_consults_miss_idx ON coupon_consults (consulted_at DESC) WHERE found = false;
