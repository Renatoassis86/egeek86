# Estudo: o que ainda le o banco demais (2026-11-20, medido)

Fontes: `pg_stat_statements` (zerado em 15/11 22h33; delta exato contra `pgss-depois-2026-11-19.json`, 14,7 h), `pg_stat_user_tables`, `pg_stat_activity`, `collector_runs`. Consultas leves, uma por vez, `statement_timeout` 8 s; envio de Telegram conferido antes e depois (59 enviadas nos 15 min anteriores ao indice). Janelas curtas (5 a 8 min) ficaram poluidas por laços de outros processos; por isso os custos abaixo usam o acumulado e as taxas por hora de cada rotina.

## Ja resolvido e confirmado (delta em 14,7 h)
q_all (estatistica por produto): +5 chamadas (era 48/h). `loadSentHistory`: +0 (era 160/h). CTE de ofertas publicas: +0 a +27 chamadas por familia (era ~70/h somadas).

## As 5 rotinas que mais custam hoje
1. **Pool de ofertas da deteccao/fila (`live`, `live_networks`/`fresh_offers`)**: ~325 + ~200 chamadas/h, 1,9 a 4,4 s cada, ~1,3 mil s de banco por hora (14,5 h). Mora em group-queue/group-offers (outro agente). Ainda nao le a tabela materializada.
2. **Serie diaria `price_daily_offer` (group-offers.ts:752)**: ~24 chamadas/h, 7 a 41 s cada, 217 mil a 1,7 M de blocos lidos/h. Indices corretos (EXPLAIN sem ANALYZE: indice por produto+dia); o custo e o join com `affiliate_offers` para ~40 produtos por chamada e o memo e por instancia (serverless frio). Candidato: memo persistido em `showcase_snapshot` (fora do meu escopo).
3. **Abertura de produto (`price-history.ts`, 5 consultas)**: ~3.450 aberturas em 4,5 dias, ~15 s de banco cada (4,2 + 3 + 3 + 3 + 4 s). Causa: a subconsulta de identidade varria as ~62 mil ofertas por consulta. **Corrigido (R-111).**
4. **Saude do coletor (`collector-health`, contagem por hora de 8 dias)**: 14 chamadas/h, 9,3 s cada, 260 mil blocos/h. **Corrigido (R-111).**
5. **Chamadas curtas em alto volume (integridade/frete/agente de cupons)**: consultas de 60 a 250 ms a 35 a 63 mil chamadas/h na janela medida (`integridade-preco`, `frete-prazo`, `monitor-preco-impressoras`), 1,6 M a 2,8 M de blocos/h. Origem NAO confirmada (a rota de integridade roda 1x/min; o volume sugere laco externo ou script em execucao). Pendente de confirmar.
Tambem relevante: gravacao da serie por oferta (`select price_cents, collected_at ... where offer_id`): 26 mil chamadas/h, 5,9 ms; +386 mil chamadas em 14,7 h (coletores religados).

## Tabelas
Maiores: `affiliate_price_snapshots` 786 MB (3,72 M linhas, 310 mil mortas, **nunca passou por autovacuum**, 8%), `group_messages` 407 MB, `collector_runs` 109 MB (80 mil linhas; 11,7 mil sao `group-messages-fases` e 4,9 mil `preencher-anuncios`), `price_daily_offer` 104 MB (55 mil mortas). Leituras sequenciais altas: `master_products` 621 mil varreduras (16,9 mil linhas, so CPU), `affiliate_offers` 113 mil (5,4 bilhoes de tuplas), `preco_isca_marcas` 2,26 M de varreduras historicas (parou de crescer). Sessoes: 2 `idle in transaction` por trava de ciclo (advisory), esperado.

## Cron de estatisticas que nao fecha (causa)
Todas as rodadas de 19/11 14:19 BRT em diante foram fechadas pelo reaper (678 s, "running alem de maxDuration"); as rodadas `ok` de antes duravam 222 e 301 s. O orcamento (120 s) so era conferido ANTES de cada lote e o lote (120 produtos, 2 em paralelo, bg pool) nao tinha limite proprio: com o banco ocupado um lote passava dos 300 s da funcao, o `finally` nao rodava e a linha ficava `running`. O preparo (resumo/ingestao) terminou em segundos (marca d'agua atualizada 09:19:34, 35 s apos o inicio). Mesmo mecanismo afeta toda rota longa: 24 h de `collector_runs` tem 5 a 16 linhas reaped por hora (collect-prices 43/43, collect-vertical, vitrines 21/144, showcase 10/47).
