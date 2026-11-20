# Inventario verificado: metodologia de leitura e tratamento de dados no banco (2026-11-20)

Conferido no git, no codigo e no banco de producao (consultas leves, `statement_timeout` 8 s). "Ligada" = o padrao do codigo e ligado e o efeito aparece no banco/`pg_stat_statements`; nao ha flag em `.env.local` e o painel de variaveis da Vercel nao foi lido (nao verificado).

| Melhoria | O que faz | Commit / arquivo | Flag (desliga) | No ar? Prova | Antes / depois |
|---|---|---|---|---|---|
| Cache incremental do historico de envios | `loadSentHistory` le so o delta; refresh completo a cada 5 min | 4ea0e4f, b7630bb (`group-offers.ts`) | `HISTORY_CACHE=off` | Sim: 15.969 chamadas da consulta antiga em 19/11 19h33 e 15.969 hoje 10h (0 novas em 14,7 h) | 160 chamadas/h, 294 mil ms/h -> 0 |
| Contagem de cotacoes base + delta | base exata 1x/dia + cotacoes novas por indice de data | 40735c5 (`public-metrics.ts`) | `QUOTE_COUNT_INCREMENTAL=off` | Sim: chave `public-quote-base-v1` com 21 h; 0 contagens completas em 15 min | ~99 GB lidos/3 dias -> delta de 1 h em 1,7 s |
| Estatistica de preco incremental | recalcula so produto com cotacao nova; `touch` nos demais | dcbb16b, 19db7e4, 17104bd (`refresh-snapshots.ts`) | `PRICE_STATS_INCREMENTAL=off` | Sim: 7.786 de 7.861 produtos com calculo < 2 h | candidatos em 1 leitura em vez de EXISTS por produto (estourava 30 s) |
| Resumo exato `product_price_rollup` | resume cotacoes por (oferta, preco); soma so as novas | 7d4a288, 7f3e926 (0068, `price-rollup.ts`) | `PRICE_STATS_ROLLUP=off` | Sim: 24.565 ofertas com resumo, marca d'agua 3,84 M a 1 mil ids do maximo | q_all: 48 -> 6,7 chamadas/h; 423 mil -> 40,7 mil blocos/h; hoje +5 chamadas em 14,7 h. Prova: 296 produtos, 0 diferencas |
| Ofertas publicas materializadas | `public_offers_mat` refeita a cada 3 min | 0547170 (0069, `public-offers-mat.ts`, cron `2-59/3`) | `PUBLIC_OFFERS_MAT=off` | Sim: 42.699 linhas, autovacuum de hoje | `live_networks`: ~70 -> ~0,3 chamada/h |
| Redes vivas em memoria | CTE `live_network` por memoria de instancia | e7549ab | `LIVE_NETWORK_CACHE=off` | Sim (junto da mat) | parte da linha acima |
| Memos da serie diaria e envios por tipo | memo de 20 min / 60 s por instancia | 0547170, 40735c5 | `GRUPO_SERIE_MEMO=off`, `HISTORY_CACHE=off` | Parcial: memo e por instancia, a consulta de serie ainda roda 24x/h (ver estudo) | 28 chamadas/h -> 24/h (so em instancia fria) |
| Indices parciais/compostos | collector_runs (job,status,fim), group_messages hist e tg enviada, snapshots collected_btree | `scripts/criar-indices-io.ts`, 0c12450 | `DROP INDEX CONCURRENTLY` | Sim: 4 existem e validos | historico 11,8 MB/chamada -> indice; contagem de 1 h 18 s -> 1,7 s |
| Autovacuum agressivo | `scale_factor` 0,05 em collector_runs, group_messages, affiliate_offers | reloptions no banco | `ALTER TABLE ... RESET` | Sim (conferido em pg_class) | dead tuples 138 / 4.655 / 2.907 |
| Orcamento do cron de estatisticas | 190 s -> 120 s | 8a7e3a3 | n/a | Sim, mas NAO resolveu o fechamento (ver R-111) | 16 de 24 rodadas seguiram "running" |

Pendente confirmado: o cron `refresh-snapshots?part=stats` ficou reaped (registro `running` fechado pelo collector-health 10 min depois) em todas as rodadas de 19/11 14:19 BRT a 20/11 06:19 BRT. Tratado em R-111 (vigia da rota + guarda de lote).
