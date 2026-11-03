# Parecer do DBA e Engenheiro de Dados Postgres (rodada 1, 2026-11-01)

Escopo: F-15 (contadores), F-18 (performance, EG-11), F-26 (cotação = 1 por oferta por dia). Somente leitura: todas as medições são SELECT / EXPLAIN ANALYZE sobre o banco de produção via `scripts/_dup-shared.ts` (porta 6543). Nada foi escrito. SQL de migration abaixo é DESENHO, não aplicado. Scripts de medição ficaram no scratchpad, fora do repositório.

Legenda: [REAL] = medido agora no banco; [CÓDIGO] = lido no repositório; [HIPÓTESE] = inferência a confirmar; [RECOMENDAÇÃO].

## 1. Posição

1. F-15: o problema é de DEFINIÇÃO e de TEMPO, não de bug de aritmética. Há pelo menos três definições de "produtos" e duas de "vendedores" em código, e os números da auditoria foram colhidos em momentos diferentes sobre dados que mudam a cada 5 minutos. Recomendo UMA função `getPublicMetrics()` sobre UMA view, com definição escrita e rótulo próprio para qualquer recorte.
2. F-18: o gargalo está medido. São duas consultas que varrem os 3,25 M de snapshots e ordenam tudo em disco (`percentile_cont` sobre `q_all`): 9,0 s e 18,7 s, mais 8,1 s por vez na tabela. Não é índice faltando; é falta de agregado. O caminho certo é agregado diário por oferta + estatística materializada por produto, com cache sobre a leitura barata e pré-aquecimento.
3. F-26: aprovo "uma cotação por oferta por dia" como AGREGADO DIÁRIO derivado, sem mexer em `affiliate_price_snapshots` (append-only, histórico intocável, regra do projeto). Reduz 3.249.799 linhas para 67.048 (48x) nas leituras estatísticas. Mas muda a média de 382 de 4.623 produtos em mais de 2% (72 em mais de 10%), então exige decisão do Estatístico antes de ir ao ar.

## 2. Leitura

### 2.1 F-15: de onde sai cada número

| Tela | Número | Origem (arquivo:linha) | Definição efetiva |
|---|---|---|---|
| Home | Produtos (faixa e "Números do site") | `src/app/(shop)/page.tsx:86` e `:97` -> `searchData.totals.products` -> `getHomeSearchData()` `src/server/queries/home-search.ts:118` -> `compute()` `:37-102` | Produtos com >=1 oferta pública (ADR 0002), não mesclados (`:43`), cujo tipo efetivo (regex de título em TS, `effectiveCatalogType`) não é nulo (`:55-62`). `visible.length` (`:100`). Cache 600 s (`:104`) |
| Home | Marketplaces | `home-search.ts:46-50` (`COUNT(DISTINCT network_id)` das ofertas públicas) | redes com oferta pública |
| Home | Cotações | `page.tsx:86`, `stats.totalQuotes` -> `affiliate.ts:410-412` `COUNT(*)` de `affiliate_price_snapshots` | TODAS as linhas, inclusive `price_cents = 0` e abaixo do piso. Cache 300 s (`affiliate.ts:471-477`) |
| Home | Abaixo da média | `page.tsx:383`, `affiliate.ts:425-452` | produto com preço público < média -5%, histórico elegível |
| `/ofertas` | Produtos monitorados, lojas | `ofertas/page.tsx:95`, `:155`, `:157` -> `getPublicTotals()` `home-search.ts:113` | mesma função da home (mesma chave de cache `home-search-v5`) |
| `/ofertas` | "No menor preço histórico" | `ofertas/page.tsx:156` = `lowestEverOffers.length`, calculado em `:109-111` | itens da AMOSTRA `broadPool` (`listRankedOffers limit: 200`, `:97`) que são `isLowestEver` E jogo/console físico. Teto estrutural: 200 ofertas. É contagem da amostra, não do catálogo |
| `/sobre` | Produtos, lojas | `sobre/page.tsx:44`, `:126`, `:128` -> `getPublicTotals()` | igual à home |
| `/sobre` | Vendedores | `sobre/page.tsx:127` -> `stats.totalSellers` -> `affiliate.ts:408` `SELECT COUNT(*) FROM affiliate_sellers` | TODA linha de vendedor já vista, ativa ou não, com ou sem oferta. Cache 300 s |
| `/contatos` | Produtos, vendedores, lojas | `contatos/page.tsx:23`, `:56-58` | idem `/sobre` |
| Tabela | Cabeçalho "produtos monitorados" | `tabela-de-precos/page.tsx:65`, `:103` -> `getPublicTotals()` | igual à home (o comentário em `:98-102` já diz isso) |
| Tabela | Contador da seleção | `price-table.ts:224-228`, exibido em `price-table-board.tsx:123` e `tabela-de-precos/page.tsx:~124` | `COUNT(*)` de `combined`: produtos com oferta `status='active'` pública, filtrados por `catalogDimensionFilter` (lista de ids hidden/toType) + abas/filtros. Definição DIFERENTE da home (usa a lista de ids do `catalog-dimensions.ts`, não `effectiveCatalogType` linha a linha) |
| Tabela | "Recorde Histórico" | `price-table.ts:276` `isLowestEver = elegível && currentPrice <= lowest`; selo em `price-table-board.tsx:251` e `:408` | contagem por LINHA da tabela, sobre o catálogo inteiro, sem teto |
| Não exibido mas existe | `PlatformStats.totalProducts` | `affiliate.ts:404-407` `COUNT(DISTINCT master_product_id)` com `catalogHiddenFilter` | NÃO exclui mesclados no SQL (só a lista de ids hidden, carregada de masters não mesclados, `catalog-dimensions.ts:30-33`). Terceira definição de "produtos" convivendo no código |

Diagnóstico das divergências:

- 1.121 (home/`/contatos`) vs 1.075 (`/ofertas`/`/sobre`): no código atual, as quatro telas chamam a MESMA função e a MESMA chave de cache. Logo a diferença NÃO vem de fórmula; vem de tempo/instância [HIPÓTESE]. Reforço: a população pública varia no tempo porque `publicOffersCtes()` (`public-offers.ts:37-69`) depende de `now()` (janela de 7 dias, `live_networks`, mediana de ofertas frescas). Hoje [REAL] medi 1.804 produtos públicos (sem filtro de cartela), contra 1.121 da auditoria: o universo anda rápido (o coletor roda a cada 5 min, `vercel.json`). Cache de 600 s com `force-dynamic` na página (`page.tsx:61`, `sobre/page.tsx:41`) e cache por instância (`server-cache.ts:21-37` tem fallback em memória por lambda) permite que duas telas mostrem fotos de instantes diferentes.
- 1.070 (cabeçalho) vs 1.088 (soma das abas): a soma das abas usa `catalogDimensionFilter` por tipo (`price-table.ts:166-168`) e filtra `o.status='active'`; o cabeçalho usa `effectiveCatalogType` por título (`home-search.ts:55-62`). São dois classificadores para o mesmo conceito. 18 de diferença é consistente com isso [HIPÓTESE, não reproduzida em SQL porque o classificador é TS].
- Vendedores 2.314 vs 2.599: não é divergência de fórmula, é crescimento. [REAL] hoje há 3.486 linhas em `affiliate_sellers`; 1.436 foram criadas nas últimas 24 h. Mas a definição também é frágil: 3.486 total, 3.250 com alguma oferta, 2.497 com oferta ativa, 2.491 com oferta pública. O rótulo "Vendedores identificados" mistura "já vistos" com "ativos".
- 12 vs 167: não são o mesmo conceito. 12 = interseção de amostra de 200 ofertas com jogo/console físico; 167 = contagem de linhas da tabela inteira com selo. Nenhum dos dois é um erro de SQL; é falta de definição única e de rótulo.
- Cotações 3.246.260 (home) vs 3.245.732 (`/sobre`): mesma consulta, cache de 300 s e coletor escrevendo; esperado. [REAL] agora: 3.249.799.

### 2.2 F-18: medições (EXPLAIN ANALYZE, produção, Postgres via pooler)

Volume [REAL]: `affiliate_price_snapshots` 3.249.799 linhas, 535 MB total (243 MB heap, 222 MB do índice `(offer_id, collected_at)`, BRIN de 48 kB); 14.482 ofertas distintas; 110 dias (2026-07-13 a 2026-11-01); `affiliate_offers` 16 mil linhas (14 MB); `master_products` 5,4 mil.

| Consulta | Código | Tempo medido | Observação |
|---|---|---|---|
| `COUNT(*)` snapshots | `affiliate.ts:410` | 446 ms | Seq Scan, 30 mil buffers |
| `publicOffersCtes` + produtos distintos | `affiliate.ts:404` | 54 ms | barata (usa `affiliate_offers_active_price_idx`) |
| `getHomeSearchData.compute` (linhas + join master) | `home-search.ts:38-45` | 43 ms | barata; o custo do hero é cache frio de duas consultas, não essa |
| `getPlatformLowestPriceCentsEver` (`priceQuotesCtes(TRUE)`) | `product-price-stats.ts:82-94` | 9.030 ms | Seq Scan de 3,25 M em 581 ms; resto é `percentile_cont` x2 com sort em disco (`temp written=72.032` blocos) |
| `itemsBelowAverage` (publicOffers + `priceQuotesCtes(IN (SELECT ...))`) | `affiliate.ts:425-452` | 18.712 ms | 2,99 M de linhas atravessam `q_all` -> `pfloor` -> `q` -> `raw` -> `hist`; `temp written=141.762` |
| Tabela, escopo "todos os produtos públicos" | `price-table.ts:118`, 2 execuções (count `:224` + página `:230`) | 8.052 ms cada, ~16 s por render frio | a CTE inteira roda duas vezes; com `?todos=1` (`SHOW_ALL_CAP = 1000`, `tabela-de-precos/page.tsx:25`) soma o resto do render: 37,9 s observado |
| Alternativa: agregar por oferta-dia direto do bruto | (teste) | 1.792 ms (group) / 22 s (DISTINCT ON com `date_trunc`) | construir o diário não pode ser feito com `DISTINCT ON (date_trunc)` sem índice; precisa ser incremental por faixa de dias |

Leitura do gargalo:

- `priceQuotesCtes` (`product-price-stats.ts:51-76`) materializa TODAS as cotações do escopo em `q_all`, calcula mediana por produto (sort), faz join de volta e filtra. Quando o escopo é "todos" ou "todos os produtos com oferta pública" (o caso das telas), ele lê 3 M de linhas toda vez. O índice por oferta é inútil nesse padrão: a consulta quer o catálogo inteiro.
- `getPlatformStats` (`affiliate.ts:402-453`) dispara 7 consultas em `Promise.all`; duas são as de 9 s e 18,7 s. Se o pool do app serializa (pooler de transação, `prepare:false`, `max` baixo em `src/lib/db/index.ts`) elas somam ~28 s, que é exatamente a faixa de 22-38 s da home. Na home, `getPlatformStats` e `getHomeSearchData` rodam em paralelo (`page.tsx:78-80`), mas só a primeira é pesada.
- O que parece "cache" não protege: `createCachedQuery` usa `unstable_cache` (`server-cache.ts:23-26`), que é do Data Cache por deploy; após cada deploy está vazio, e a primeira visita paga 22-38 s. Isso explica `/ofertas` 13,8 s na primeira e ~1,3 s depois (padrão EG-11).
- A tabela também recomputa estatística por requisição: o cache da tabela é por filtro (`price-table.ts:285-293`, 60 s), então cada combinação de filtro/aba/busca é um cache frio de 8-16 s.
- Os valores abaixo do piso: `q_all` desperdiça 254 mil linhas (3.249.799 - 2.995.799) filtradas só depois do sort.

### 2.3 F-26: cotação = 1 por oferta por dia

[REAL] Distribuição dos snapshots: 316 manuais + 14.482 via API; média de 48 snapshots por oferta-dia (3.249.799 linhas para 67.048 pares oferta-dia); ofertas isoladas com ~1.200 snapshots em 2 dias e 2 a 7 preços distintos. Isso mostra preço alternando entre poucos valores várias vezes ao dia (cupom/variação por coleta) [HIPÓTESE da causa, a confirmar com o Cientista de Dados de Tempo Real]. Ritmo recente: 18 a 45 mil snapshots por dia; na semana de 25/10 a 31/10 passou de 18,7 mil para 45,4 mil/dia (mais ofertas coletadas por dia, 422 -> 2.077).

Impacto de armazenamento: bruto 535 MB hoje, ~+5 a 10 MB/dia no ritmo atual. Agregado diário: 67.048 linhas hoje; teto de ~14,5 mil ofertas/dia (hoje 14.482 ofertas com snapshot); com ~70 bytes/linha mais índice, ordem de 10 a 20 MB para os 110 dias e ~1 MB/dia. Um ano no teto (14,5 mil x 365 = 5,3 M linhas) cabe em ~400 MB, e o ritmo real é bem menor porque só ofertas com coleta no dia geram linha.

Impacto de consulta: as leituras estatísticas passam de 3,25 M para 67 mil linhas (48x menos). O sort do `percentile_cont` deixa de ir a disco.

Impacto semântico (medido, produto a produto): média bruta (ponderada pela frequência de coleta) vs média de 1 cotação/oferta/dia (última do dia):

| Produto | Cotações brutas | Cotações diárias | Média bruta | Média diária | Mínimo |
|---|---|---|---|---|---|
| Switch 2 Modelo Nacional | 299.506 | 1.590 | R$ 4.458,53 | R$ 5.009,88 (+12,4%) | R$ 2.799,00 igual |
| DualSense Galactic Purple | 365.299 | 1.621 | R$ 567,33 | R$ 555,23 | R$ 350,00 igual |
| GTA 5 PS5 | 195.811 | 1.238 | R$ 215,22 | R$ 213,41 | R$ 50,00 igual |
| Resident Evil 3 PS5 | 105.706 | 1.190 | R$ 210,85 | R$ 214,64 | R$ 49,90 igual |

Em 4.623 produtos: 382 mudam a média em mais de 2%, 72 em mais de 10%. O mínimo histórico, se for tomado do `price_min` diário (e não do "último do dia"), não muda. Se o diário guardasse só o último preço, perderia mínimos reais intradiários: por isso a tabela diária guarda mín, máx e último.

## 3. Riscos

1. Mudança semântica de média: recalcular com cotação diária altera selos, vereditos e "abaixo da média" (72 produtos >10%). Estatístico e Matemático precisam aprovar a regra (último, mediana ou mínimo do dia) antes de ligar; subir em paralelo e comparar. [ALTO]
2. Dois classificadores de cartela (TS por título vs lista de ids) são a causa de 1.070 vs 1.088. Uma view SQL não resolve sozinha: o classificador está em `src/lib/catalog/dimensions.ts`. Se a view de métricas não aplicar o mesmo filtro, nasce um quarto número. [ALTO]
3. Materialized view com `REFRESH` bloqueia leitura sem `CONCURRENTLY`; `CONCURRENTLY` exige índice único e falha no primeiro refresh se a MV estiver vazia (precisa de `WITH DATA` na criação). [MÉDIO]
4. Backfill do diário: o `DISTINCT ON` com `date_trunc` levou 22 s sobre tudo; rodar de uma vez perto do horário de coleta concorre com o cron (`*/5 min`). Backfill em lotes de dia, fora do horário. [MÉDIO]
5. Descompasso entre o que o cron grava e o diário: se o diário for atualizado só 1x/hora, "preço mais baixo de hoje" fica defasado. Mitigação: o `UPSERT` diário roda no próprio `INSERT` do coletor (mesma transação), ou o agregado é recalculado incrementalmente só para o dia corrente. [MÉDIO]
6. `unstable_cache` é por deploy: sem pré-aquecimento a primeira visita pós-deploy paga o custo cheio mesmo com MV (menor, mas existe). [MÉDIO]
7. Supabase pooler transação (6543) + `prepare:false`: `SET LOCAL work_mem` só vale dentro de transação; não confiar em ajustar `work_mem` por sessão. [BAIXO]
8. A regra "histórico é intocável" não é violada: tudo é derivado; qualquer retenção/partição dos snapshots brutos é decisão posterior e do responsável.

## 4. Recomendação em passos

Ordem proposta (do mais barato e reversível ao mais estrutural). Nenhum passo foi executado.

### Passo 0. Decisões antes de qualquer código (Estatístico, Matemático, responsável)
- Definição canônica de "Produtos monitorados": produto (não mesclado) com >=1 oferta pública (ADR 0002) dentro da cartela pública. Definição de "Lojas": redes com >=1 oferta pública. "Vendedores": vendedores distintos com >=1 oferta pública (hoje 2.491, em vez de 3.486 "já vistos"). "No menor preço histórico": produtos da cartela com preço público atual <= mínimo histórico elegível (contagem do catálogo, não da amostra). "Cotações": snapshots com `price_cents > 0` (ou, após F-26, linhas do diário; escolher e rotular).
- Regra de cotação diária (último do dia vs mediana vs mínimo). Recomendo guardar `price_last`, `price_min`, `price_max`, `n_collected` e deixar a estatística escolher a coluna.

### Passo 1. Fonte única de contadores (sem esperar a MV)
Criar `getPublicMetrics()` em um único módulo (ex.: `src/server/queries/public-metrics.ts`), uma consulta que devolve `{ products, stores, sellers, quotes, belowAverage, lowestEverCount, computedAt }`, com UM filtro de cartela. Home, `/ofertas`, `/sobre`, `/contatos`, cabeçalho da tabela leem só dela; remover `PlatformStats.totalProducts/totalSellers/totalNetworks/totalQuotes` e `getPublicTotals`/`totals` de `home-search.ts`. A tabela expõe, com rótulo próprio ("N itens nesta seleção"), só o recorte filtrado. O hero de `/ofertas` passa a ler `lowestEverCount` do catálogo (hoje `ofertas/page.tsx:156`). Incluir `computedAt` e mostrar "atualizado em" evita a leitura de "bug" quando a base se move.

### Passo 2. Agregado diário por oferta (migration DESENHADA, próxima: `0022_price_daily_and_product_stats.sql`)
Rótulo: não aplicar. Rollback junto (`0022_...rollback.sql`).

```sql
-- 0022_price_daily_and_product_stats.sql  (DESENHO, NÃO APLICAR)
BEGIN;

-- 1) Agregado diário por oferta. Derivado de affiliate_price_snapshots; a
--    tabela bruta continua append-only e intocada.
CREATE TABLE affiliate_price_daily (
  offer_id        uuid        NOT NULL,
  day             date        NOT NULL,                 -- dia em America/Sao_Paulo
  price_last_cents bigint     NOT NULL CHECK (price_last_cents > 0),
  price_min_cents  bigint     NOT NULL CHECK (price_min_cents  > 0),
  price_max_cents  bigint     NOT NULL CHECK (price_max_cents  > 0),
  n_collected     integer     NOT NULL CHECK (n_collected > 0),
  first_at        timestamptz NOT NULL,
  last_at         timestamptz NOT NULL,
  PRIMARY KEY (offer_id, day)
);
CREATE INDEX affiliate_price_daily_day_idx ON affiliate_price_daily (day);
-- offer_id sem FK, pelo mesmo motivo da tabela bruta (alto volume, sem lock de FK).

-- 2) Função de carga incremental de UM dia (idempotente; usada no backfill e pelo cron).
CREATE OR REPLACE FUNCTION refresh_price_daily(p_day date) RETURNS integer
LANGUAGE sql AS $$
  WITH ins AS (
    INSERT INTO affiliate_price_daily AS d
      (offer_id, day, price_last_cents, price_min_cents, price_max_cents, n_collected, first_at, last_at)
    SELECT s.offer_id, p_day,
           (array_agg(s.price_cents ORDER BY s.collected_at DESC))[1],
           MIN(s.price_cents), MAX(s.price_cents), COUNT(*)::int,
           MIN(s.collected_at), MAX(s.collected_at)
    FROM affiliate_price_snapshots s
    WHERE s.price_cents > 0
      AND s.collected_at >= (p_day::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND s.collected_at <  ((p_day + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY s.offer_id
    ON CONFLICT (offer_id, day) DO UPDATE SET
      price_last_cents = EXCLUDED.price_last_cents, price_min_cents = EXCLUDED.price_min_cents,
      price_max_cents = EXCLUDED.price_max_cents, n_collected = EXCLUDED.n_collected,
      first_at = EXCLUDED.first_at, last_at = EXCLUDED.last_at
    RETURNING 1)
  SELECT COUNT(*)::int FROM ins;
$$;

-- 3) Estatística por produto, materializada (usa o mesmo piso/median da fonte única,
--    mas sobre o diário: ~67 mil linhas em vez de 3,25 M).
CREATE MATERIALIZED VIEW master_product_price_stats_mv AS
WITH q_all AS (
  SELECT o.master_product_id, d.offer_id, d.day, d.price_last_cents AS price_cents,
         d.price_min_cents, d.first_at, d.last_at
  FROM affiliate_offers o JOIN affiliate_price_daily d ON d.offer_id = o.id
),
pfloor AS (
  SELECT master_product_id, COUNT(*)::int AS n_all, MIN(price_min_cents) AS raw_min,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) AS median_cents,
         CASE WHEN COUNT(*) >= 3
              THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY price_cents) * 0.35 END AS floor_cents
  FROM q_all GROUP BY master_product_id
),
q AS (
  SELECT a.* FROM q_all a JOIN pfloor f USING (master_product_id)
  WHERE f.floor_cents IS NULL OR a.price_min_cents >= f.floor_cents
),
raw AS (
  SELECT master_product_id, AVG(price_cents) AS raw_avg, COUNT(*)::int AS quote_count,
         MAX(price_cents) AS max_raw, MIN(first_at) AS history_since, MAX(last_at) AS history_until,
         MIN(price_min_cents) AS min_all,
         MIN(price_min_cents) FILTER (WHERE day >= current_date - 365) AS min_1y,
         MIN(price_min_cents) FILTER (WHERE day >= current_date - 90)  AS min_3m
  FROM q GROUP BY master_product_id
)
SELECT r.master_product_id, r.quote_count, r.raw_avg, r.max_raw, r.min_all, r.min_1y, r.min_3m,
       r.history_since, r.history_until,
       AVG(q.price_cents) FILTER (WHERE q.price_cents <= r.raw_avg * 2) AS avg_cents,
       MAX(q.price_cents) FILTER (WHERE q.price_cents <= r.raw_avg * 2) AS max_cents,
       COUNT(*)           FILTER (WHERE q.price_cents <= r.raw_avg * 2)::int AS avg_quote_count,
       pf.n_all, pf.raw_min, pf.floor_cents
FROM raw r
JOIN q USING (master_product_id)
JOIN pfloor pf USING (master_product_id)
GROUP BY r.master_product_id, r.quote_count, r.raw_avg, r.max_raw, r.min_all, r.min_1y, r.min_3m,
         r.history_since, r.history_until, pf.n_all, pf.raw_min, pf.floor_cents
WITH DATA;
CREATE UNIQUE INDEX master_product_price_stats_mv_pk ON master_product_price_stats_mv (master_product_id);

-- 4) Preço público atual: já é barato (54 ms); não materializar.

COMMIT;
-- Backfill (fora desta transação, em lotes, fora do horário de coleta):
--   SELECT refresh_price_daily(d::date) FROM generate_series('2026-07-13'::date, current_date, '1 day') d;
-- Refresh periódico (cron, após o coletor):
--   SELECT refresh_price_daily(current_date); REFRESH MATERIALIZED VIEW CONCURRENTLY master_product_price_stats_mv;
```

Pontos de atenção do desenho: o "histórico" do menor preço usa `price_min_cents` do dia (não perde intradiário); o piso de plausibilidade deve ser aplicado sobre o mesmo critério que o Estatístico escolher (aqui usei `price_min` no filtro, por coerência com "isca sai do mínimo"); a pré-validação é rodar `master_product_price_stats_mv` ao lado do cálculo atual e comparar produto a produto (como já foi feito em 2026-10-31, comentário em `product-price-stats.ts:208-211`). Fuso: o dia é `America/Sao_Paulo`, decisão a confirmar.

Índices adicionais recomendados (baixo risco, em `affiliate_offers`, 16 mil linhas):
```sql
CREATE INDEX CONCURRENTLY affiliate_offers_master_active_idx
  ON affiliate_offers (master_product_id) WHERE status = 'active';
-- cobre o DISTINCT ON da tabela e o join de public_offers por produto
```
Em `affiliate_price_snapshots` NÃO recomendo novo índice: o índice atual `(offer_id, collected_at)` serve a leitura por oferta (página de produto e `refresh_price_daily` por faixa de dia via BRIN). O problema é varredura completa, que índice não resolve.

### Passo 3. Reescrever as 3 consultas para ler a MV
- `getPlatformLowestPriceCentsEver`, `itemsBelowAverage` (`affiliate.ts:425`) e a CTE de estatística da tabela (`price-table.ts:118`) passam a ler `master_product_price_stats_mv` em vez de `priceQuotesCtes`. `priceQuotesCtes` fica para o batch por produto (a página de produto) enquanto a MV não cobrir os campos; migrar depois.
- Meta de tempo esperada [HIPÓTESE, a medir após o passo 2]: cada uma abaixo de 300 ms (67 mil linhas + join de 1,8 mil produtos), contra 9 s, 18,7 s e 8 s.
- A tabela deve usar uma única consulta com `COUNT(*) OVER()` (hoje a CTE inteira executa duas vezes, `price-table.ts:224` e `:230`), e o "Ver todos" deve paginar (cap de 1000, `tabela-de-precos/page.tsx:25`).

### Passo 4. Cache e pré-aquecimento
- Manter `createCachedQuery`, mas com a camada que sobra barata: `getPublicMetrics` com `revalidate` 300 e tag `price-snapshots`; o cron de coleta (`/api/cron/collect-prices`) chama `revalidateTag` ao terminar o refresh da MV, para a invalidação ser por evento e não por relógio.
- Home e `/sobre`: sair de `force-dynamic` (`page.tsx:61`, `sobre/page.tsx:41`) para ISR (`export const revalidate = 300`), desde que nada na página dependa de cookie/usuário; se houver bloco por usuário, isolar em um componente cliente. Isto é com o Engenheiro de Performance Web e o Backend.
- Pré-aquecimento pós-deploy: rota protegida `/api/cron/warm` (mesmo segredo dos crons) que chama `getPublicMetrics()`, `getPriceTableData` das 3 abas e primeira página, `getHomeSearchData`, e faz `fetch` de `/`, `/ofertas`, `/tabela-de-precos`, `/sobre`; acionada por webhook "deployment succeeded" da Vercel (ou GitHub Action `curl` depois do deploy) e também por entrada em `vercel.json` a cada 10 min como rede de segurança. Com a MV, o aquecimento custa <1 s por rota em vez de 20-40 s.
- Stale-while-revalidate: `unstable_cache` já serve dado velho enquanto revalida depois do primeiro preenchimento; o risco real é só o primeiro request pós-deploy, que o pré-aquecimento elimina.

### Passo 5. F-26 em produção
- Ligar o diário em paralelo (sombra) por pelo menos 7 dias; publicar a média "por dia" só depois da aprovação do Estatístico. Mostrar a contagem como "dias com cotação" ou "cotações diárias", mantendo o rótulo.
- Não apagar nem reescrever snapshots. Retenção/particionamento dos brutos (por mês) só depois de a leitura migrar, e como decisão de negócio.

## 5. Dado que falta

1. Por que o preço alterna entre 2 a 7 valores por oferta no mesmo dia (cupom? variante de vendedor? erro de parse?). Define se o "último do dia" é o preço certo. Responsável: Cientista de Dados de Tempo Real / Integrador.
2. Regra de cotação do dia (último, mediana, mínimo) e fuso: Estatístico + responsável.
3. Reprodução exata de 1.121/1.075/1.070/1.088: sem os horários e instâncias das medições da auditoria e sem o classificador TS em SQL, só consegui provar a divergência de definição, não reproduzir o número. Pedir à auditoria o horário de cada leitura, ou rodar `getPublicTotals` e `getPlatformStats` em produção com log de `computedAt`.
4. Tamanho do pool e `work_mem` efetivos do Supabase no plano atual; hoje `max` do `postgres-js` precisa ser lido em `src/lib/db/index.ts` (restante do arquivo) para confirmar se as 7 consultas de `getPlatformStats` serializam.
5. Distribuição de tráfego pós-deploy (quantas instâncias frias) para dimensionar o pré-aquecimento; métrica do Vercel (Edge/Function duration).
6. Se existem consumidores de `PlatformStats.totalProducts/totalSellers` fora das telas citadas (`grep` só achou home, `/sobre`, `/contatos`); confirmar antes de remover.

## 6. Métrica de sucesso

- Consistência: para o mesmo `computedAt`, 0 divergência entre telas para produtos, lojas, vendedores, cotações e "menor preço histórico" (teste automatizado que chama as 5 telas e compara; também com `generateStaticParams`/cache). Meta: 100% igual.
- Latência: `getPublicMetrics` (frio) < 300 ms; MV refresh < 2 s; tabela fria (qualquer filtro) < 1,5 s no servidor; home e `/ofertas` primeira visita pós-deploy < 3 s no servidor (hoje 22-38 s e 13,8 s); `?todos=1` paginado < 2 s (hoje 37,9 s).
- Peso: leituras estatísticas lendo <= 100 mil linhas (hoje 3,25 M) e `temp written` = 0 nessas consultas.
- Armazenamento: `affiliate_price_daily` < 50 MB aos 110 dias; crescimento <= 1,5 MB/dia.
- Higiene: primeira requisição pós-deploy já aquecida em 100% dos deploys (log do warm).
- Fidelidade do F-26: relatório de diferença de média por produto antes/depois, assinado pelo Estatístico (hoje: 382 produtos > 2%, 72 > 10%).

## Dependências e divergências declaradas

- Estatístico Sênior e Matemático Aplicado: regra de cotação diária e definição de "abaixo da média/menor histórico" (bloqueia o passo 5).
- Engenheiro de Performance Web e Backend: ISR da home/sobre, `getPublicMetrics`, rota de warm.
- Cientista de Dados de Tempo Real: causa da oscilação de preço intradiária; frescor do diário.
- Possível divergência com o Estatístico: eu prefiro guardar último/mín/máx por dia e deixar a regra escolher; ele pode preferir mediana do dia (exige guardar mais uma coluna ou calcular na carga).
