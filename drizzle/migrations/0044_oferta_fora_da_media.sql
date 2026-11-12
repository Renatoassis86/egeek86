-- 0044: OFERTA "FORA DA MEDIA" SEM QUARENTENA (dono, 2026-11-11; ADR 0011 rascunho; piloto de identidade PS5 + Resident Evil).
-- PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json (como 0019-0043). ADITIVA: so duas colunas anulaveis em affiliate_offers.
-- Motivo: nao existe hoje como tirar uma oferta ATIVA e VISIVEL so da media. quarantined_at some com a oferta de toda leitura;
-- status='draft' tambem a esconde. Esta flag tira da MEDIA/mediana/selo e mantem a oferta na lista, com preco e horario.
-- Rollback: 0044_oferta_fora_da_media.rollback.sql. Aplicar (apenas o dono), no molde da 0042/0043.
--
-- ORDEM DE PUBLICACAO (obrigatoria): 1) APLICAR esta migracao; 2) so entao fazer o deploy do codigo que le a marca.
-- O codigo de leitura (feito, nao publicado) referencia affiliate_offers.avg_excluded_at em dezenas de consultas (via
-- avgExcludedFlagSql/inAverageSql em src/server/queries/public-offers.ts): deploy ANTES da coluna = erro 42703 nas paginas e no job.
-- Valvula: AVG_EXCLUDED_DISABLED=1 no ambiente faz a leitura ignorar a marca (nenhuma consulta toca a coluna); serve para rodar o
-- codigo num banco sem a 0044 ou para recuar rapido. O schema Drizzle NAO ganhou as colunas de proposito (select() total quebraria sem a coluna).
-- Depois de marcar ofertas: dias ja FECHADOS em price_daily_state nao sao reescritos; recalcular os produtos afetados (backfill) para a
-- media historica/grafico refletirem a marca; o dia aberto e o "agora" refletem no proximo ciclo.
-- A leitura honra a marca em: public_offers (mediana/piso), computeDayState (media, mediana, n_offers, members, lojas), mediana das lojas
-- de hoje, product-price-stats/price-table/selos, historico de preco (media), departamentos, busca, totais da plataforma e candidatos
-- de mensagem (judgeOffer bloqueia 'fora_da_media'). Menor preco, maximo, listas e cartoes continuam mostrando a oferta.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS avg_excluded_at     timestamptz;  -- NULL = conta na media; preenchido = fora da media (oferta continua ativa e visivel)
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS avg_excluded_reason text;         -- ex.: 'piloto-identidade:cerca-superior', 'piloto-identidade:identidade-incerta'

CREATE INDEX IF NOT EXISTS affiliate_offers_avg_excluded_idx ON affiliate_offers (avg_excluded_at) WHERE avg_excluded_at IS NOT NULL;
