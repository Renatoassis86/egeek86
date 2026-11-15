# Otimização da arquitetura, fatia 1: banco de dados e modelo de dados

Data: 2026-11-15 (fim da tarde, UTC 19:00). Autor: dba-postgres (fatia do pedido "estude nossa arquitetura e veja o que otimizar pelas boas práticas").
Modo: somente leitura. Só SELECT e EXPLAIN (sem ANALYZE) em transação `read only`, `statement_timeout` de 20 s, `max: 1`, nenhum segredo impresso, nenhum dado nem código alterado. Os scripts temporários de medição foram apagados.
Rótulos: **[medido]** número obtido agora; **[leitura]** lido no código; **[hipótese]** inferência a confirmar.
Não repete `docs/auditoria-2026-11-15/04-eficiencia-tecnica.md` (D1 a D6, 104 `running` presas, cache por instância). Cada achado diz se já está na fila ("coberto #NN"), se está em parte, ou se é NOVO.

Fontes: `pg_stat_user_tables`, `pg_stat_user_indexes`, `pg_stat_statements` (desde 30/10), `pg_stat_database` (desde 29/10, 17 dias), `pg_class`/`pg_indexes`/`pg_constraint`/`pg_stats`, um `EXPLAIN` e uma amostra de 121 s de `pg_stat_statements` (diferença entre duas fotos) para ver o ritmo de agora e não só o acumulado.

---

## Resumo: top 10 por retorno sobre esforço

| # | Achado | Evidência medida | Esforço | Risco | Fila |
|---|---|---|---|---|---|
| 1 | **97% dos UPDATE de preço em `affiliate_offers` não mudam nada**: `recordPriceSnapshot` regrava `current_price_cents` sempre | 5.624.489 `UPDATE ... SET current_price_cents` contra 177.914 que mudam o preço; `affiliate_offers` recebeu 21,2 milhões de UPDATE em 17 dias para 44 mil linhas (~480 por linha) | S | Baixo | NOVO |
| 2 | **`work_mem` de 3,5 MB faz o banco gravar 2,26 TB em arquivos temporários**; as variações da `q_all` respondem por ~76% | `pg_stat_database`: 304.760 arquivos, 2.317.055 MB; `q_all`: 788 + 552 + 219 + 60 + 35 + 28 GB; amostra de 121 s: 22 chamadas, 178 s de banco, 673 MB temporários | S (mitigar) / M (resolver) | Baixo / Médio | NOVO (a #87 trata da consulta, não do derrame em disco) |
| 3 | **A estatística por produto relê o histórico bruto** em vez de `price_daily_offer` | `q_all` 3,1 a 6,2 s por chamada, máximo 62 s; `price_daily_offer` tem 234 mil linhas contra 3,56 milhões de snapshots | M | Médio (muda número publicado) | Coberto em parte (#87, #14) |
| 4 | **Ofertas que oscilam entre poucos preços enchem a série**: até 1.126 "mudança" em 7 dias com 10 preços | top 100 ofertas = 1.485.062 de 3.556.258 snapshots (41,8%); top 1.000 = 91,9%; `mudanca` = 3,25 milhões | M | Médio | NOVO |
| 5 | **A elegibilidade é reavaliada por regex em cada leitura** (`live_networks`, ~80 `LIKE`/`~` por oferta) | 22 chamadas em 121 s = 60 s de banco; acumulado 78,6 h | L | Médio | Coberto em parte (#87 materializa a contagem; NOVO: gravar o veredito por oferta) |
| 6 | **Tabelas pequenas e muito reescritas sem `fillfactor`** (`product_price_stats`, `showcase_snapshot`) | `product_price_stats`: 6.260.005 UPDATE, 0 HOT, 2.126 B de heap por linha para linha de 982 B; `showcase_snapshot`: 136.189 UPDATE, 0 HOT | S | Baixo | NOVO |
| 7 | **Índice morto impede HOT**: `affiliate_offers_price_confirmed_idx` (8,3 MB, 0 usos) cobre a coluna que 460 mil linhas atualizam | 6,74 milhões de UPDATE não-HOT em `affiliate_offers` (31,7%); 230.385 `UPDATE ... last_price_confirmed_at` | S | Baixo | Coberto em parte (D2, sem o argumento do HOT) |
| 8 | **Autovacuum e índice composto de `affiliate_price_snapshots`** | sem vacuum desde 11/11, 309.355 mortas; índice `(offer_id, collected_at)` = 245 MB para 3,56 milhões de entradas (~70 B/entrada) | S | Baixo | Coberto (#90, D1); NOVO: reindex |
| 9 | **Ingestão em uma transação por leitura, sem lote** | 6,08 milhões de BEGIN, 5,63 milhões de `advisory_xact_lock`; amostra de 121 s: 1.431 chamadas, 5 idas e voltas cada | M | Médio | NOVO |
| 10 | **Migrações fora do ledger**: 19 linhas no ledger para 54 arquivos; buraco em 0039, 0050 repetida, arquivo `PENDING` | `drizzle.__drizzle_migrations` = 19 | M | Baixo | Coberto (#71, #107) |

Ordem sugerida: 1, 7, 6, 2 (mitigação) e 8 antes da Black Friday: são S, reversíveis e não mudam nenhum número publicado. 3, 4, 5 e 9 só depois do congelamento de 23 a 28/11 e com parecer do cientista-precos, porque alteram o que o usuário vê.

---

## 1. Inventário medido

- PostgreSQL 17.11. 103 tabelas, 302 índices, 0 views materializadas, 0 tabelas particionadas no `public` (a única é `realtime.messages`, do Supabase). Extensões instaladas: `pg_stat_statements`, `pg_trgm`, `citext`, `unaccent`, `pgcrypto`, `uuid-ossp`, `supabase_vault`. Disponíveis e não instaladas: `pg_cron`, `pg_partman`, `pg_repack`, `pgstattuple`, `hypopg`, `pg_buffercache`.
- Banco: 1.106 MB. Cache hit de heap 98,93%, de índice 98,86%. `jit = off`, `random_page_cost = 1,1`, `shared_buffers` 256 MB, `work_mem` 3.500 kB, `maintenance_work_mem` 64 MB, `max_connections` 60, `autovacuum_vacuum_scale_factor` 0,2.
- Maiores: `affiliate_price_snapshots` 668 MB (350 heap + 318 índices), `group_messages` 101 MB (85 MB de manhã), `affiliate_offers` 76 MB, `price_daily_offer` 57 MB, `coupon_reads` 40 MB.
- 21 deadlocks desde 29/10 e 11.737 rollbacks contra 34,9 milhões de commits (`pg_stat_database`). Instantâneo de sessões: 7 ativas, 7 ociosas, 3 `idle in transaction`.

## 2. Modelagem de série temporal

O desenho é o recomendado para monitor de preço: fatos append-only (`affiliate_price_snapshots`: só mudança mais um batimento de 24 h), agregado por oferta e dia (`price_daily_offer`), estado por produto e dia (`price_daily_state`, 72.643 linhas desde 13/07) e cache de estatística por produto (`product_price_stats`, 7.030 linhas). A modelagem não é o problema; o problema é que as consultas quentes ainda caem no nível bruto.

**B1 (alta). `q_all` lê o histórico bruto inteiro dos produtos do lote.** [leitura: `src/server/queries/product-price-stats.ts:71`; medido] O CTE `q_all AS MATERIALIZED` junta `affiliate_offers` com todos os snapshots, depois calcula mediana e média com `percentile_cont` (ordenação). Três variações: 23.907 + 17.045 + 10.240 chamadas, 20,7 + 16,8 + 17,5 h, médias de 3,1, 3,6 e 6,2 s, máximo de 62 s, 539 + 386 + 352 GB de blocos lidos fora do cache. Na amostra de 121 s: 22 chamadas, 178 s de tempo de banco, ou seja, mais de um núcleo ocupado só por essa família. O `EXPLAIN` do acesso por produto usa corretamente o índice `(offer_id, collected_at)` e estima 1.332 snapshots por oferta; o custo está no volume, não no plano.
Recomendação: calcular média, mínimos de 1 ano e 3 meses, mediana e dispersão a partir de `price_daily_offer` (15x menos linhas) e deixar o bruto só para o que exige a cotação exata. A memória do projeto já fixa "média por oferta/dia" como métrica de referência, então é o caminho coerente, mas a definição precisa de parecer do cientista-precos. Atenção: `price_daily_offer` só tem dados desde **2026-10-24** [medido: `min(day)`], enquanto `price_daily_state` vai até 13/07; antes de trocar, completar o backfill oferta-dia (`scripts/backfill-price-daily.ts`).
Esforço M. Risco médio (números publicados mudam). Ordem: depois de 28/11. Fila: coberto em parte (#87, #14); a ideia de ler do agregado diário no lugar do bruto não está dita assim.

**B2 (alta). O ruído de oscilação domina o volume.** [medido] 42.493 ofertas têm snapshot, 7.689 só um. As 100 ofertas com mais linhas somam **1.485.062 de 3.556.258 (41,8%)**; as 1.000 maiores somam 3.268.835 (**91,9%**); a maior tem 33.471 linhas. Nos últimos 7 dias, as ofertas mais ativas registram 585 a 1.126 "mudança" com só 3 a 10 preços distintos: o preço vai e volta entre poucos valores. Causa provável [hipótese]: anúncio com variações ou leitura alternada entre preço cheio e com cupom ou pix; a migração 0048 (`oferta_variacao_preco`) tratou a variação na oferta, mas a série continua gravando cada ida e volta. Consequências: 91% da tabela é `mudanca`, o índice de 245 MB e a `q_all` são dimensionados por ruído, e a média por cotação (`AVG(price_cents)` sobre linhas de snapshot) fica enviesada para quem oscila.
Recomendação: (a) histerese na gravação (só grava a mudança se o novo preço se repete em 2 leituras ou difere dos dois últimos valores); (b) marcar a oferta oscilante em `avg_excluded` até a causa ser corrigida; (c) ancorar a série na variante. Medir antes quantas mudanças são retorno ao preço de duas leituras atrás. Esforço M, risco médio, NOVO. B1 neutraliza o viés na média, mas não o volume.

**B3 (média, coberto #108). `affiliate_price_snapshots` cresce sem teto.** [medido] 3.556.258 linhas; por tipo: 3.248.931 mudança, 264.240 batimento, 42.474 primeira, 356 manual, 85 nulas. Nos últimos 6 dias, 19 a 25 mil batimentos e 12 a 18 mil mudanças por dia. O batimento é redundante com `affiliate_offers.last_checked_at` e com `price_daily_offer` (que também provam coleta viva) e é ~40% das inserções recentes.
Particionar por mês **ainda não compensa**: 3,5 milhões de linhas e 350 MB de heap cabem numa tabela só no plano Micro, e a leitura é por `offer_id`, não por faixa de data. O BRIN em `collected_at` quase não é usado (1.029 varreduras, 32 kB) e a correlação física da coluna é 0,54, então não ajuda. Ordem: (1) retenção do batimento (manter 30 dias; o resto vive em `price_daily_offer`), por job ou `pg_cron` (disponível, não instalada); (2) só se a tabela passar de ~15 milhões de linhas, particionar por mês com `pg_partman`. Esforço M para (1); risco baixo se o rollup diário estiver completo (B1).

**B4 (baixa, NOVO). Contrato "append-only" quebrado e coluna solta.** O comentário do schema diz "nunca UPDATE", mas houve 3.380.476 UPDATE (2.419.022 HOT) por causa do backfill da migração 0038 [medido]. `record_kind` é `text` sem `CHECK` e tem 85 nulos. Recomendação: `CHECK (record_kind IN ('primeira','mudanca','batimento','manual'))` depois de preencher os 85 nulos, e corrigir o comentário. Esforço S.

## 3. Consultas quentes e memória

**B5 (alta, NOVO). Arquivos temporários: 2,26 TB.** [medido] `pg_stat_database`: **304.760 arquivos, 2.317.055 MB** desde 29/10 (~133 GB por dia) com `work_mem` de 3.500 kB. Por consulta (`temp_blks_written`): `q_all` 788 + 552 + 219 + 60 + 35 + 28 + 21 + 21 GB (~1,7 TB, ~76%), `live_networks` pontual 27 GB (18 chamadas de 92 s), `ml` da fila da API 32 GB (1.935 chamadas). Cada chamada de `q_all` derrama ~33 MB porque a ordenação do `percentile_cont` e o CTE materializado passam de 3,5 MB. Num Micro isso disputa o mesmo orçamento de I/O dos crons.
Recomendação em duas camadas: (1) mitigação (S): dentro da transação do job de estatística, `SET LOCAL work_mem = '32MB'` (nunca no global, por causa das 60 conexões), e conferir `temp_blks_written` na foto seguinte; (2) solução (M): B1 elimina a ordenação do bruto. Fila: a #87 fala em materializar a carga, mas o derrame em disco e o `work_mem` não aparecem. NOVO. Também ligar `track_io_timing` (seção 11) para medir o I/O real.

**B6 (média, coberto em parte #87/#90). Fila de mensagens.** A consulta com `row_number() OVER (PARTITION BY trigger, vertical, candidate->>...)` mais `NOT EXISTS` correlacionado sobre `group_messages` soma 7,6 h, média 7 s, máximo 29,6 s; na amostra de 121 s, 3 chamadas = 61 s de banco (~20 s cada, pior que a média histórica). `group_messages` tem 36.510 linhas vivas, **27.149 `expirada`** (74%) e 6.839 mortas (18,7%). O filtro (`channel`, `status IN (2)`, `claimed_at IS NULL`, `attempts < 3`) não tem índice parcial próprio nem janela de tempo. A #90 já propõe índice parcial e janela de 48 h. Acrescento: **não existe retenção de `group_messages`** [leitura: nenhum `DELETE FROM group_messages` em `src` nem em `scripts`]; mover ou apagar `expirada` com mais de 7 dias (padrão `aplicar-*`: dry-run, backup NDJSON, log) faz a tabela e o plano encolherem. Esforço S, risco baixo.

**B7 (média, coberto em parte #87). `live_networks`.** [leitura+medido] A contagem por departamento repete, para cada oferta, `lower(title)` com ~80 `LIKE`/`~` (regras de console, jogo e peça), mais `NOT IN (subselect)` sobre `master_products.attributes -> 'catalogGate'` e outro `NOT IN` com junção de `affiliate_offers` consigo mesma. Acumulado 78,6 h em 255 mil chamadas. As páginas já leem uma contagem persistida (`createPersistedQuery`, `src/server/departamentos.ts:27`), mas a consulta ainda roda 22 vezes em 121 s (60 s de banco) por refrescos e pelos lotes de `public-offers`. Recomendação nova: **gravar o veredito de elegibilidade por oferta** (`affiliate_offers.visivel` ou tabela `offer_gate_verdict(offer_id, visible, reason, rule_version, evaluated_at)`) na ingestão e na revisão, em vez de reaplicar regex a cada leitura; as consultas viram `WHERE visivel AND status = 'active'` com índice parcial. Princípio: classificar na escrita, não na leitura. Esforço L (regras em `catalog/gate.ts`, `console-identity.ts`, `item-miudo.ts`), risco médio (versão da regra e recálculo quando ela muda). Depois da Black Friday; antes dela vale só o que a #87 já pede.

**B8 (baixa). JSONB sem índice de expressão.** `master_products.attributes -> 'catalogGate' ->> 'verdict'` é filtrado sem índice nem estatística (11,7 mil linhas, 24 MB). Se B7 não for adiante, um índice de expressão resolve; se for, a coluna materializada substitui. É a mesma causa das varreduras sequenciais da D3. Esforço S.

## 4. Escrita, idempotência e HOT

**B9 (alta, NOVO). Escritas sem mudança.** [medido + leitura de `src/server/collector/record-price-snapshot.ts`] A cada leitura de preço, mesmo sem mudança, `recordPriceSnapshot` abre uma transação, pega `pg_advisory_xact_lock`, faz 2 SELECTs e executa **sempre** `UPDATE affiliate_offers SET current_price_cents = $1 WHERE id = $2`. Contagem: 5.624.489 desses UPDATE contra 177.914 que de fato mudam o preço (`... SET current_price_cents, last_price_change_at, previous_price_cents`): **97% de escrita redundante**, cada uma gerando versão nova da linha, tuplo morto e trabalho de autovacuum e WAL. Outros UPDATE sem mudança prováveis: `SET quarantined_at = NULL` em `src/server/collector/vertical/collect-vertical.ts:303` (1.125.824 chamadas, roda mesmo quando já é nulo), `SET last_checked_at, consecutive_miss_count` (658.431 + 1.339.496 + 379.569). `n_tup_upd` de `affiliate_offers`: **21.226.395 em 17 dias** (~1,25 milhão por dia, ~28 por oferta por dia).
Recomendação: (a) `... WHERE id = $2 AND current_price_cents IS DISTINCT FROM $1` (ou pular em JS quando o preço é igual); (b) `... AND quarantined_at IS NOT NULL` no UPDATE de liberação; (c) consolidar `last_checked_at`, `consecutive_miss_count` e `last_price_confirmed_at` em um só UPDATE por oferta por rodada, em lote com `UPDATE ... FROM unnest(...)`. Esforço S para (a) e (b), M para (c). Risco baixo. Ganho esperado [hipótese]: retirar 3 a 5 milhões de UPDATE por 17 dias, menos tuplos mortos e menos autovacuum (1.520 passadas em `affiliate_offers`).

**B10 (média, NOVO). Ingestão sem lote.** 6.077.323 BEGIN, 6.072.568 COMMIT, 5.634.786 `pg_advisory_xact_lock` e 5.706.295 SELECTs do último snapshot por oferta (2,75 milhões de blocos lidos fora do cache, 0,46 ms cada). Na amostra de 121 s, 1.431 chamadas de `recordPriceSnapshot` (~12 por segundo), cada uma com ~5 idas e voltas ao banco. Recomendação: para a lista de uma página de resultado, buscar o estado de todas as ofertas em 1 SELECT (`id = ANY($1)` mais `DISTINCT ON (offer_id)` do último snapshot), decidir em memória e gravar só as mudanças com 1 `INSERT ... SELECT unnest(...)` e 1 `UPDATE ... FROM unnest(...)`. O lock por oferta pode virar uma trava por lote, e a `cycle-lock.ts` já oferece o mecanismo. Esforço M (a maior mudança de código desta lista), risco médio (concorrência entre jobs). Fazer depois de B9.

**B11 (média, NOVO). `fillfactor` e upserts que não comparam.** [medido] `product_price_stats`: 7.030 linhas, 6.260.005 UPDATE (~890 por linha em 17 dias), **0 HOT**, 14,6 MB de heap (2.126 B por linha para linha de 982 B, ~2x de espaço). `showcase_snapshot`: 326 linhas, 136.189 UPDATE, 0 HOT, linha de 5,4 KB. `price_daily_offer`: 5.910.497 UPDATE, 56% HOT, 18,8% de mortas. `price_daily_state`: 1.846.010 UPDATE, 91% HOT. O INSERT de `product_price_stats` (51.802 chamadas) é um upsert que reescreve a linha mesmo quando nada mudou. Recomendação: `ALTER TABLE ... SET (fillfactor = 70)` em `product_price_stats` e `showcase_snapshot`, e `ON CONFLICT DO UPDATE ... WHERE excluded.* IS DISTINCT FROM tabela.*`; o fillfactor só vale para páginas novas, mas um `VACUUM FULL` ou `pg_repack` de uma tabela de 14 MB é curto. Esforço S, risco baixo.

**B12 (média, parcial D2). O índice não usado impede HOT.** `affiliate_offers_price_confirmed_idx` (parcial em `last_price_confirmed_at`, 8,3 MB, **0 varreduras** em 17 dias) cobre uma coluna escrita em 230.385 UPDATE (`UPDATE ... SET last_price_confirmed_at = now() WHERE id IN (...)`, 460.770 linhas). Enquanto o índice existir, esses UPDATE nunca são HOT e o UPDATE não-HOT gera entrada nova em todos os índices da tabela. 6,74 milhões de UPDATE (31,7%) em `affiliate_offers` não são HOT. A auditoria da manhã recomendou observar 7 dias; o contador já cobre 17 e é zero. Esforço S, risco baixo, rollback é recriar com `CREATE INDEX CONCURRENTLY`. Fora do horário de pico.

**B13 (baixa). Upserts linha a linha em `price_daily_offer`.** 238.712 chamadas de `INSERT ... ON CONFLICT` para 238.967 linhas (1,14 ms cada), isto é, 1 linha por comando. Só vale em lote se o refresh aparecer entre os maiores consumidores depois de B1.

## 5. Índices

[medido, contadores desde 29/10]
- Sem índice duplicado exato. Prefixo redundante só em `price_min_events_master_at_idx (master_product_id, at DESC)` contra `price_min_events_uq (master_product_id, at, min_cents, source)`: 4 MB, inofensivo. Os demais pares do resultado são de `auth.*`, `storage.*` (Supabase) e `stocks` (loja vazia).
- Não usados (não únicos, > 1 MB): `affiliate_offers_price_confirmed_idx` 8,3 MB e `master_products_search_norm_trgm_idx` 6,7 MB, ambos com 0 usos. O de `trgm` pode servir a uma busca futura; manter até haver prova.
- **`affiliate_price_snapshots_offer_collected_idx`: 245 MB para 3,56 milhões de entradas (~70 B por entrada).** Um btree `(uuid, timestamptz)` saudável gasta ~40 B por entrada, ou seja, ~140 MB. A diferença (~100 MB) é provavelmente bloat dos 960 mil UPDATE não-HOT do backfill de `record_kind` **[hipótese; `pgstattuple` está disponível mas não instalada, e criar extensão é escrita]**. `REINDEX INDEX CONCURRENTLY` (PostgreSQL 17) é online; precisa de ~245 MB livres e de lock curto. Esforço S, risco baixo; fazer depois do ajuste de autovacuum. É também o índice mais usado do banco (24,4 milhões de varreduras): o acesso por oferta é o certo.
- Chaves estrangeiras sem índice (esquema `public`): 35, quase todas em tabelas vazias da loja (pedidos, drops, estoque; 0 MB). Relevantes só `affiliate_offers.seller_id` e `affiliate_offers.created_by` (tabela de 43 MB). Sem efeito hoje; se a #98 mesclar vendedores em lote, criar índice parcial em `seller_id`. Prioridade baixa.
- `group_messages` tem 9 índices numa tabela com ~675 mil comandos INSERT, a maior parte caindo em `ON CONFLICT DO NOTHING`. Confirmar `idx_scan` de `group_messages_key_idx` e `group_messages_store_idx` antes de qualquer remoção (não consultei).

## 6. Integridade

[medido]
- **Boa**: 112 FKs (39 `CASCADE`, 68 `NO ACTION`), 59 `CHECK`, 1 tabela sem PK (`fulfillment_items`, vazia, da loja). 0 de 44.064 ofertas sem `master_product_id`; 0 snapshots órfãos nas últimas 24 h; 0 duplicidades `(offer_id, collected_at)` em 130.911 linhas dos últimos 3 dias; 0 slugs duplicados em `master_products`. `status` de `group_messages`, `coupon_items` e `collector_runs` têm `CHECK`.
- **`affiliate_price_snapshots.offer_id` sem FK, de propósito** [leitura: comentário do schema], decisão documentada e correta para evitar contenção. Mas **não há `UNIQUE`** em `(offer_id, collected_at)`: a única barreira contra duplicata é o `advisory lock` por oferta dentro da transação. Hoje 0 duplicatas medidas. Um índice único custaria ~150 MB; alternativa barata: um teste semanal de duplicata no vigia. Esforço S.
- **Texto no lugar de enum**: `vertical`, `network`, `record_kind`, `status`, `trigger`, `channel` são `text`. Para valores que crescem, `text + CHECK` é mais fácil de evoluir que `ENUM`, e vários já têm `CHECK`. Faltam `CHECK` em `record_kind` e `collector_runs.stopped_because`, e a lista de verticais está repetida em vários lugares (`affiliate_offers_vertical_chk`, `master_products`, `group_messages`, `coupon_announcements`, `catalog_inventory_snapshots`, `store_section_verticals`). Recomendação: tabela `verticals(slug)` com FK, ou um `DOMAIN`, para que criar uma vertical seja uma linha e não várias migrações. Esforço M, risco baixo, prioridade baixa, NOVO.
- `price_daily_offer` e `price_daily_state` sem FK, de propósito (derivadas). Correto, mas conferir periodicamente linhas de oferta apagada (349 `DELETE` até agora). Não medi órfãs.

## 7. Vacuum, bloat, crescimento e retenção

[medido]
- `affiliate_price_snapshots`: último autovacuum 11/11 15:43, só 9 passadas em 17 dias, 309.355 mortas (8,7%; o limite padrão de 20% seria ~711 mil). Coberto por D1/#90 (`autovacuum_vacuum_scale_factor 0.02`). Acrescento `autovacuum_analyze_scale_factor 0.01` para manter as estimativas de `offer_id` frescas.
- Mortas hoje: `affiliate_offers` 20,2% (8.893), `price_daily_offer` 18,8% (44.114), `group_messages` 18,7% (6.839), `price_daily_state` 13,3% (9.640). O autovacuum global dá conta das pequenas, mas `scale_factor 0,05` nessas quatro reduziria o pico de bloat sem custo. As 1.520 passadas em `affiliate_offers` e 2.334 em `product_price_stats` são consequência de B9 e B11.
- Crescimento: 1.074 MB (manhã) para 1.106 MB agora, +32 MB em ~11 h (~70 MB por dia), acima dos 10 a 15 MB por dia da manhã [hipótese: o ritmo inclui a expansão do cupom e de `group_messages`, +16 MB no mesmo intervalo]. Até 27/11 chegaria perto de 1,9 GB; sem risco no plano atual, mas expiradas e batimentos antigos são o maior desperdício evitável.
- **`coupon_reads` sem retenção**: 129.665 linhas desde 11/11 (3 dias, ~43 mil por dia, 240 B por linha, ~10 MB por dia). Em 12 meses seriam ~16 milhões de linhas e ~3,8 GB. Política sugerida: 30 dias detalhados, o resto agregado por dia. NOVO, esforço S.
- `collector_runs`: retenção de fato ~7 dias (31.230 linhas, 5 `running` agora); limpeza existente, bom.

## 8. Conexões, pooler e prepared statements

- Porta 6543 (Supavisor, modo transação), `prepare: false`, `idle_timeout` 20 s, `max_lifetime` 10 min, pools `live` e `bg` [leitura: `src/lib/db/index.ts`]. Em linha com a boa prática; `pg_advisory_xact_lock` (e não a trava de sessão) é compatível com modo transação. Sem prepared statements cada comando paga Parse (0,04 a 0,3 ms nos comandos pequenos): aceitável.
- `statement_timeout` do servidor continua em 2 min (o código registra que o Supavisor ignora o parâmetro de startup). Recomendação: `ALTER ROLE <papel_da_app> SET statement_timeout = '30s'` (e valor maior só no job de estatística, via `SET LOCAL`), que vem do papel e não do cliente; **[hipótese: testar numa conexão de teste que o Supavisor respeita]**. Há consultas de 62 s (máximo de `q_all`) e 92 s (`live_networks`, 18 chamadas). Risco médio (pode cortar job que hoje termina em 40 s). NOVO, S.
- `idle_in_transaction_session_timeout = '30s'` no papel: 3 sessões `idle in transaction` no instantâneo. NOVO, S, risco baixo.
- Conexão direta (5432) só para migrações [leitura: `drizzle.config.ts`]: correto. Black Friday: coberto em D6 e #93.

## 9. RLS, privilégios e segurança do modelo

- [medido] RLS ligada em **103 de 103** tabelas, **0 policies** (negação total para `anon` e `authenticated`), nenhum GRANT em tabela do `public` para `anon` ou `authenticated`, 0 funções `SECURITY DEFINER` de 86. O aplicativo usa o papel `postgres` (`bypassrls`). Legítimo e seguro para a arquitetura atual (acesso só pelo servidor).
- Atenção: como não há policies, qualquer uso futuro do cliente Supabase no navegador (PostgREST/`supabase-js`) devolveria 0 linhas sem erro. Se carrinho e alertas passarem a usar PostgREST, será preciso escrever policies tabela a tabela. Hoje é risco de surpresa, não de vazamento. Relacionado à #107 (IDOR).
- 20 triggers, a maioria `set_updated_at_trigger` de tabelas da loja; nenhuma nas tabelas quentes de preço (correto). Em consequência, a maior parte dos UPDATE quentes de `affiliate_offers` **não atualiza `updated_at`**, então a coluna não indica a última escrita; quem a usar como cursor incremental erra. Documentar e usar `last_checked_at` ou `last_price_change_at`. NOVO, S.

## 10. Migrações

- [medido] `drizzle.__drizzle_migrations`: **19 linhas**; `drizzle/migrations`: **54** `.sql` e 34 `.rollback.sql`; `meta/_journal.json` com 19 entradas (0000 a 0018). Da 0019 em diante as migrações são aplicadas por scripts (`scripts/aplicar-migration-00NN.ts`, `scripts/apply-price-daily.ts`), deliberadamente fora do journal (o cabeçalho da 0024 diz isso). Consequências: `drizzle-kit migrate` e `generate` não enxergam ~35 migrações; um ambiente novo (staging, restauração) sobe incompleto; não há prova de aplicação. Numeração: buraco em 0039, duas `0050_*` (`short_code` e `short_code_idx`), `0021_affiliate_conversions.PENDING.sql`.
- Pontos bons: aditivas, `IF NOT EXISTS`, `rollback.sql` ao lado (34 de 54, 63%) e script `aplicar-*` com dry-run. Padrão acima da média.
- Recomendação (coberta em #71 e #107): tabela própria `schema_migrations(version, applied_at, checksum, applied_by)` populada por um `registrar-migracoes.ts` que confere o catálogo (`pg_indexes`, `information_schema`) para marcar as já aplicadas, e um `aplicar-migracao.ts` único com dry-run em vez de um script por número; a checagem de numeração da #24 fecha o buraco. Esforço M, risco baixo. Rollback de migração que acrescenta coluna perde dado: aceitável.

## 11. Observabilidade do banco

- `pg_stat_statements` ligado, mas com `dealloc = 63`: a tabela sofreu expulsões. A consulta de `live_networks` gera texto distinto por quantidade de parâmetros (`IN ($1 ... $120)`), inflando `queryid`. Usar `= ANY($1::uuid[])` em lugar de `IN` de tamanho variável reduz planos e `queryid` e melhora a estatística. S por ponto de chamada. NOVO.
- `track_io_timing = off`: ativar (`ALTER DATABASE ... SET track_io_timing = on`, sem reinício) para medir o I/O real dos temporários. S.
- Sem alerta de idade da estatística (`product_price_stats`: mediana 56 min, **máxima 12 dias** [medido]) nem de mortas por tabela; o `collector-health` poderia ler `pg_stat_user_tables`.

---

## 12. O que já está bom (não mexer)

1. **Idempotência das mensagens**: `INSERT ... ON CONFLICT (dedup_key, channel) DO NOTHING` com índice único (`group_messages_dedup_uq`, 1,09 milhão de usos) e reivindicação atômica por `UPDATE ... WHERE status IN (...) AND attempts < 3`.
2. **Snapshot só em mudança ou batimento de 24 h**, com `pg_advisory_xact_lock` por oferta: 0 duplicatas medidas em 3 dias.
3. **Duas camadas de agregação** (`price_daily_offer`, `price_daily_state`), derivadas, recalculáveis, sem FK de propósito e com rollback.
4. **Índice composto de snapshots** `(offer_id, collected_at)`, 24,4 milhões de usos: é exatamente o acesso da consulta quente.
5. **Índices parciais** bem aplicados em `affiliate_offers` (ativas, quarentena, `external_ref` e `external_item_id` únicos parciais) e em `group_messages` (`recheck`, `short_code`).
6. **Cache hit** de ~98,9% em heap e índice; `random_page_cost = 1,1` e `jit = off`, adequados a consultas curtas.
7. **RLS em 103 de 103 tabelas**, sem GRANT para `anon` e `authenticated`, 0 funções `SECURITY DEFINER`.
8. **Pooler de transação com `prepare: false`**, `idle_timeout`, `max_lifetime` e travas `xact`: configuração madura e comentada.
9. **Migrações** aditivas, com `IF NOT EXISTS`, rollback ao lado e aplicação em dry-run.
10. **Retenção** de `collector_runs` (~7 dias) e `analytics_events` (1.387 linhas).
11. **Integridade** consistente: 112 FKs, 59 `CHECK`, 0 `master_product_id` nulo, 0 slugs duplicados, 0 snapshots órfãos (amostra de 24 h).

## 13. O que não foi medido

- **`EXPLAIN ANALYZE`** de qualquer consulta quente (a regra era só `EXPLAIN`). O plano completo de `q_all` e de `live_networks` exige reproduzir o SQL gerado pelo Drizzle com ~120 UUIDs; só medi o plano simplificado do acesso por produto. Os custos de B1, B5 e B7 vêm de `pg_stat_statements`, não de plano.
- **Bloat real** de tabelas e índices (`pgstattuple` não instalada; criar extensão é escrita). A estimativa de ~100 MB no índice composto é aritmética (70 B contra ~40 B por entrada): **[hipótese]**.
- **Quantas das 3,25 milhões de "mudança" são retorno a preço anterior** (B2): exigiria uma janela `lag()` pesada; medir em tabela temporária fora do pico.
- **Linhas órfãs** em `price_daily_offer` e `price_daily_state`, e **uso** de `group_messages_key_idx` e `group_messages_store_idx`.
- O acumulado de `pg_stat_statements` mistura períodos (desde 30/10), e a fração de `live_networks` que ainda ocorre depois da persistência de 13 a 15/11 só aparece na amostra de 121 s (22 chamadas): janela curta. Repetir por 1 h antes de decidir. O ritmo de temporários (673 MB em 121 s) é de uma só amostra.
- Custo em reais de Supabase e Vercel, `max_client_conn` do Supavisor e teste de restauração de backup (#71). `pg_cron` não está instalada neste banco; o disparo duplicado do `collect-prices` não vem dele (coberto pela #73).
- Nada foi escrito, alterado, vacuumado ou reindexado.
