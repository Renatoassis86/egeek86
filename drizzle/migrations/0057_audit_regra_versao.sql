-- 0057 (#119): versao da regra de comparacao no veredito (1 = tolerancia antiga de 0,5%; 2 = maior entre R$ 1,00 e 0,1%). ADITIVA e idempotente.
ALTER TABLE offer_link_audit ADD COLUMN IF NOT EXISTS regra_versao smallint NOT NULL DEFAULT 1;
