# Estudo: o que ainda le o banco demais (2026-11-20, medido)

Fontes: `pg_stat_statements` (zerado em 15/11 22h33; delta exato contra `pgss-depois-2026-11-19.json`, 14,7 h), `pg_stat_user_tables`, `pg_stat_activity`, `collector_runs`. Consultas leves, uma por vez, `statement_timeout` 8 s; envio de Telegram conferido antes e depois (59 enviadas nos 15 min anteriores ao indice). Janelas curtas ficaram poluidas por outros processos; a ordem abaixo usa a janela limpa e o acumulado, ambos declarados.

## Ja resolvido e confirmado (delta em 14,7 h)
q_all (estatistica por produto): +5 chamadas (era 48/h). `loadSentHistory`: +0 (era 160/h). CTE de ofertas publicas: +0 a +27 chamadas por familia (era ~70/h somadas).

## As 5 rotinas que mais custam hoje (janela limpa de 0,80 h, 10:09 a 10:57 UTC; soma das 14 maiores ~500 s de banco/h, ~14% de um nucleo)
Atencao: uma janela anterior (10:01 a 10:10) ficou poluida por uma rajada de ~140 chamadas identicas de ~13 consultas (execucao de testes com banco por outro processo); foi descartada. Antes da otimizacao de 19/11 as 12 maiores somavam ~2.230 s/h (relatorio-otimizacao-2026-11-19).
1. **Pool da deteccao (`WITH live AS MATERIALIZED ...`)**: 48 chamadas/h x 3,6 s = 174 s/h, 195 mil blocos lidos/h. group-queue/group-offers (outro agente).
2. **Leitura do historico de envios (`SELECT id::text AS gm_id ... COALESCE(sent_at, created_at)`)**: 713 chamadas/h x 122 ms = 87 s/h, 216 mil blocos/h (300 blocos por chamada: le a coluna `candidate` jsonb). E o delta do cache incremental; a consulta completa antiga segue em 0 chamadas. Candidato: ler so colunas escalares no delta e carregar `candidate` apenas das linhas novas (group-offers, outro agente).
3. **Serie diaria `price_daily_offer`**: 6 chamadas/h x 5,6 s + 319/h x 89 ms = 63 s/h, 54 mil blocos/h. Indices corretos; o custo e o join com `affiliate_offers` para ~40 produtos por chamada; memo por instancia nao basta em serverless frio.
4. **Escrita da serie por oferta dos coletores** (`select price_cents, collected_at ... where offer_id` 25,7 mil/h x 1 ms e `update affiliate_offers set current_price_cents` 25,6 mil/h): ~45 s/h, 51 mil blocos/h. Volume proporcional aos coletores religados; sem ganho barato sem mexer no nucleo de coleta (congelado).
5. **Envios por tipo em 24 h (`SELECT m.vertical, m.name FROM group_messages ...`)**: 40 chamadas/h x 525 ms = 21 s/h, 110 mil blocos/h (group-offers).
Rotinas corrigidas nesta entrega (medidas no acumulado desde 15/11 22h33, 107,6 h): abertura de produto (price-history, 5 consultas, 32 aberturas/h, ~18 s de banco cada, ~580 s/h no periodo); cota Plus (22 chamadas/h, 4.547 s no periodo); saude do coletor (1,8 chamada/h, 1.858 s no periodo). Nao apareceram na janela limpa por falta de trafego naquele momento; o ganho aparece no acumulado.
Origem nao confirmada: rajadas de 35 a 63 mil chamadas/h de consultas curtas (`integridade-preco`, `frete-prazo`, `monitor-preco-impressoras`) vistas so na janela poluida; nao se repetiram na janela limpa.

## Tabelas
Maiores: `affiliate_price_snapshots` 786 MB (3,72 M linhas, 310 mil mortas, **nunca passou por autovacuum**, 8%), `group_messages` 407 MB, `collector_runs` 109 MB (80 mil linhas; 11,7 mil sao `group-messages-fases` e 4,9 mil `preencher-anuncios`), `price_daily_offer` 104 MB (55 mil mortas). Leituras sequenciais altas: `master_products` 621 mil varreduras (16,9 mil linhas, so CPU), `affiliate_offers` 113 mil (5,4 bilhoes de tuplas), `preco_isca_marcas` 2,26 M de varreduras historicas (parou de crescer). Sessoes: 2 `idle in transaction` por trava de ciclo (advisory), esperado.

## Cron de estatisticas que nao fecha (causa)
Todas as rodadas de 19/11 14:19 BRT em diante foram fechadas pelo reaper (678 s, "running alem de maxDuration"); as rodadas `ok` de antes duravam 222 e 301 s. O orcamento (120 s) so era conferido ANTES de cada lote e o lote (120 produtos, 2 em paralelo, bg pool) nao tinha limite proprio: com o banco ocupado um lote passava dos 300 s da funcao, o `finally` nao rodava e a linha ficava `running`. O preparo (resumo/ingestao) terminou em segundos (marca d'agua atualizada 09:19:34, 35 s apos o inicio). Mesmo mecanismo afeta toda rota longa: 24 h de `collector_runs` tem 5 a 16 linhas reaped por hora (collect-prices 43/43, collect-vertical, vitrines 21/144, showcase 10/47).
