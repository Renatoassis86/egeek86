# Ata: Fase 2 da performance, pré-cálculo persistido (2026-11-03)

Porte: médio (nova tabela derivada + cron; sem mexer em regra de negócio). Conselho consultivo; decisão do responsável.

## Problema (dado real, produção)
Visita fria: home ~112 s, /tabela-de-precos 60 s, /ofertas?tipo=game 16 s, /ofertas 10 s; morna 7 s. O cache SWR é em memória
por instância; em serverless cada instância nasce vazia e recalcula ~3 M de cotações dentro da visita.

## Mini-pareceres
**dba-postgres**
- Posição: persistir o RESULTADO das consultas existentes em duas tabelas derivadas, sem tocar nas tabelas-fonte.
- Leitura: `product_price_stats` (uma linha por master, colunas = CTE `product_stats` canônica + `payload` JSON do
  `MasterProductPriceStats`) resolve lista, selo, tabela e contadores; `showcase_snapshot` (chave -> JSON) guarda rankings por filtro,
  contadores públicos e a tabela padrão. Duas tabelas é o mínimo: a primeira é relacional (a tabela de preços junta por SQL), a segunda é chave-valor.
- Riscos: sem FK de propósito (não pode travar fusão/arquivamento de master); RLS ligado e REVOKE como na 0019; escrita só pelo cron
  (upsert por PK, lotes de 120); leitura por PK/IN, índice em `computed_at`. Migration só CREATE IF NOT EXISTS, com rollback por DROP (tabelas derivadas).
- Métrica: leitura fria < 5 s; cron completo < 240 s.

**estatistico-senior**
- Posição: a fórmula não muda; o snapshot é a saída exata das mesmas queries (`getMasterProductPriceStatsBatchRaw` / `statsAggCtes`), com
  porteiro, identidade, piso de 35 %, ≥ 5 cotações e ≥ 14 dias, frescor ≤ 7 dias.
- Risco principal: defasagem. Estatística histórica (média, mediana, mínimos) muda devagar; o que muda rápido é o PREÇO ATUAL, e esse continua
  lido ao vivo (linhas de oferta; `current_price_cents` na tabela). Defasagem máxima do histórico: ~15-20 min (cron a cada 15 min).
  O `currentLowestActive` dentro do payload tem a mesma defasagem (antes: 10 min de cache em memória).
- Sem snapshot (ausente, > 3 h, cron parado, migration não aplicada) a tela volta ao cálculo ao vivo com timeouts; nunca valor inventado,
  nunca interpolação. Produto sem linha na tabela de preços = "histórico insuficiente" (honesto), igual a produto sem cotação.
- Verificação exigida: equivalência snapshot x ao vivo em amostra (feita; ver relatório).

## Decisão
Implementar. Escopo de código: `snapshot-store.ts`, `createPersistedQuery` (leitura do snapshot antes de calcular + write-through),
`getMasterProductPriceStatsBatch` lê `product_price_stats` e só calcula o que faltar, `price-table.ts` troca a CTE de estatística pela tabela
quando pronta (`statsSnapshotReady`), cron `/api/cron/refresh-snapshots` (`part=stats` a cada 15 min; `part=showcase` 4 min depois).
Fora de escopo: `src/lib/catalog/*`, dedup, identidade, classificadores, `apply-catalog-gate.ts` (outro agente).

## Como desfazer
1. Remover as duas linhas de `refresh-snapshots` de `vercel.json` (e/ou reverter o código: as telas voltam ao cálculo ao vivo sozinhas).
2. `npx tsx --env-file=.env.local scripts/apply-precalculo-snapshots.ts --rollback` (DROP das duas tabelas derivadas; nenhum dado-fonte é tocado).
