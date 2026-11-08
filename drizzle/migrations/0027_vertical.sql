-- Departamentos (verticais) do catalogo (2026-11-08). PROPOSTA: NAO aplicada, NAO registrada em meta/_journal.json de proposito
-- (como 0019-0026). Aplicar so com aprovacao do dono, DEPOIS de 0025 e 0026, com backup:
--   npx tsx --env-file=.env.local scripts/apply-vertical.ts            # dry-run (estado + ensaio em tabelas TEMP, sempre ROLLBACK)
--   npx tsx --env-file=.env.local scripts/apply-vertical.ts --apply
-- ADR 0008 e ata docs/conselho/atas/2026-11-08-sub-plataforma-categorias.md (Fase 1, item 5).
-- ADITIVA. Nenhuma oferta, cotacao, snapshot ou produto e reescrito: todo registro existente nasce vertical = 'games'.
--
-- LOCK / IMPACTO (PostgreSQL 17.11 medido; master_products 6,5 mil linhas/10 MB, affiliate_offers 19,4 mil/17 MB):
--   * ADD COLUMN ... NOT NULL DEFAULT 'games' (default CONSTANTE) e so metadado no PG >= 11: sem reescrita da tabela.
--     Pede ACCESS EXCLUSIVE por instantes (lock_timeout 5s: se houver transacao longa, ABORTA em vez de enfileirar leituras).
--   * ADD CONSTRAINT CHECK varre a tabela uma vez (milissegundos nesse tamanho) sob o mesmo lock.
--   * CREATE INDEX (nao CONCURRENTLY) bloqueia ESCRITA por ~dezenas de ms nessas tabelas; como os indices sao PARCIAIS
--     (vertical <> 'games') eles nascem vazios e sao praticamente instantaneos. CONCURRENTLY exigiria sair da transacao
--     (perderia o tudo-ou-nada) e nao compensa. Leituras nao sao bloqueadas pelo CREATE INDEX.
--   * O apply-vertical.ts toma LOCK explicito, confere contagens antes/depois DENTRO da transacao e aborta se divergirem.
-- ALTER TYPE ... ADD VALUE roda aqui na mesma transacao de proposito: o valor novo NAO e usado em nenhum comando deste arquivo
--   (o CHECK abaixo evita o literal 'general'), que e a unica restricao do Postgres (ERRO "unsafe use of new value").
--   Irreversivel por natureza (o rollback nao remove o valor; fica inerte).
-- A coluna NAO e adicionada ao schema Drizzle antes do apply: ver nota no apply-vertical.ts (SELECT * lista a coluna).

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 1) Valor neutro para masters que nao sao jogo/console/acessorio de game (decisao do conselho; fallback documentado: so a coluna).
ALTER TYPE product_type ADD VALUE IF NOT EXISTS 'general';

-- 2) A coluna. Default constante = metadado; todo registro existente fica 'games'.
ALTER TABLE master_products ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'games';
ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS vertical text NOT NULL DEFAULT 'games';

-- 3) Lista fixa (allow-list). Novo departamento = nova migracao que troca o CHECK, nunca texto livre.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_vertical_chk' AND conrelid = 'master_products'::regclass) THEN
    ALTER TABLE master_products ADD CONSTRAINT master_products_vertical_chk
      CHECK (vertical IN ('games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_offers_vertical_chk' AND conrelid = 'affiliate_offers'::regclass) THEN
    ALTER TABLE affiliate_offers ADD CONSTRAINT affiliate_offers_vertical_chk
      CHECK (vertical IN ('games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte'));
  END IF;
  -- 4) Coerencia vertical x tipo (so master_products tem product_type). Barato (so a propria linha), nao afeta a coleta gamer:
  --    insert/update gamer continua 'games' + game/console/accessory. Rejeita: vertical <> 'games' com 'game', e 'games' com
  --    qualquer valor fora de game/console/accessory (inclui 'general'). Escrita sem o literal 'general' (ver cabecalho).
  --    Coerencia ENTRE tabelas (offer.vertical = master.vertical) fica como TESTE (scripts de isolamento), nao trigger:
  --    trigger no caminho quente de insert/update de ofertas e nos merges de master nao compensa.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_products_vertical_type_chk' AND conrelid = 'master_products'::regclass) THEN
    ALTER TABLE master_products ADD CONSTRAINT master_products_vertical_type_chk
      CHECK (
        (vertical = 'games' AND product_type IN ('game', 'console', 'accessory'))
        OR (vertical <> 'games' AND product_type <> 'game')
      );
  END IF;
END $$;

-- 5) Indices PARCIAIS so das verticais novas (nascem vazios): fila/consulta por vertical e teste de vazamento.
--    A superficie gamer (vertical = 'games', ~100 % das linhas) segue pelos indices atuais (ex.: affiliate_offers_active_price_idx)
--    com o filtro de vertical como condicao extra sem custo; indice nela nao teria seletividade.
CREATE INDEX IF NOT EXISTS master_products_vertical_idx
  ON master_products (vertical) WHERE vertical <> 'games';
CREATE INDEX IF NOT EXISTS affiliate_offers_vertical_status_idx
  ON affiliate_offers (vertical, status) WHERE vertical <> 'games';

-- 6) RLS: master_products e affiliate_offers ja tem RLS ligado e REVOKE de tabela inteira para anon/authenticated (0019); coluna
--    nova herda (sem GRANT por coluna). Nenhuma tabela nova aqui, nenhuma policy criada. O apply confere pos-aplicacao.
