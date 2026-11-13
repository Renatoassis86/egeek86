# Incidente de desempenho do banco (2026-11-13): estado anterior e reversao

Mudancas de infraestrutura feitas, com o estado de antes e como desfazer. Nenhum dado de negocio foi escrito.

| Mudanca | Estado anterior | Reverter |
|---|---|---|
| `ALTER ROLE postgres SET idle_in_transaction_session_timeout = '180s'` | `pg_roles.rolconfig` de `postgres` = `{"search_path=\"$user\", public, extensions"}` (sem timeout; valor efetivo 0) | `ALTER ROLE postgres RESET idle_in_transaction_session_timeout;` |
| `ANALYZE affiliate_price_snapshots` | ultimo autoanalyze 2026-11-11 15:48 UTC, 296.357 mortas em 3,43 M | nao ha o que reverter (so atualiza estatistica) |
| Codigo: `src/server/messaging/group-offers.ts` (achq sem subconsulta correlacionada; leitura base em transacao com `SET LOCAL statement_timeout 25s` e `lock_timeout 5s`) | commit anterior ao deste | `git revert` do commit |
| Codigo: `src/server/messaging/cycle-lock.ts` + `src/app/api/cron/group-messages/route.ts` (um ciclo por vez, falha aberta) | rota sem trava | `git revert`; ou apagar a chamada `acquireCycleLock` na rota |

Nenhuma migration, nenhum indice novo, `vercel.json` intocado (cadencia dos crons igual).

Medidas de ANTES (2026-11-13 ~01:10 a 01:25 UTC):
- `group-messages` ultimos 30 min: 27 ciclos, media 24.895 ms, p95 48.014 ms, max 49.361 ms; ciclos alternados com `timing.pick` de 14 a 17 s (estouro do teto de espera de 14 s) e de 0,1 a 0,3 s (cache).
- EXPLAIN ANALYZE da leitura base do pick, banco quase ocioso: 12.593 ms. Duas causas: (a) subconsulta correlacionada do Achado (`SELECT count(*) FROM live l2 ... WHERE l2.mid = l.mid`) varrendo a CTE materializada 9.011 vezes (a CTE tem 16.119 linhas; o planner estima 13) = ~145 M linhas; (b) semi join do `ev` com a CTE em nested loop (183 x 9.216). Depois da correcao: 1.181 ms, lista de produtos identica (4.202 linhas, 0 diferencas, 2.998 de Achado).
- Janela de 120 s no `pg_stat_statements`: 2 execucoes do pick consumiram 67 s de CPU de banco (38 s + 29 s sob contencao), mais ~60 consultas `live_networks` (a vitrine) consumindo ~110 s.
- Home: 30,7 s de tempo total em 3 de 3 medidas (TTFB de 0,3 a 15 s); /black-friday 1 a 2,6 s.
