# Relatorio antes e depois da otimizacao do banco (2026-11-19)

Fonte: `pg_stat_statements` (contadores acumulados desde ~15/11 12:00; base antes = `pgss-baseline-2026-11-19.json`, medida 14:30 UTC; depois = `pgss-depois-2026-11-19.json`, ~3,9 h depois). Taxas "antes" = total / ~100 h; "depois" = delta / 3,9 h.

| Consulta (chamador) | Antes | Depois | Mudanca |
|---|---|---|---|
| q_all (estatistica de preco por produto) | 48 chamadas/h; 396 mil ms/h; 423 mil blocos lidos/h | 6,7 chamadas/h; 133 mil ms/h; 40,7 mil blocos/h | -86% chamadas, -66% tempo, -90% leitura |
| loadSentHistory (historico de envios) | 160 chamadas/h; 294 mil ms/h; 213 mil blocos/h | 0 chamadas da consulta antiga (cache incremental) | consulta completa eliminada |
| live_network e WITH de ofertas publicas (vitrine) | ~70 chamadas/h; ~280 mil ms/h | ~0,3 chamada/h | consulta eliminada do caminho quente |
| serie diaria price_daily_offer (mensagens) | 28 chamadas/h; 110 mil ms/h; 77 mil blocos/h | 0 chamadas (memo de 20 min) | eliminada do caminho quente |
| serie de preco por oferta (gravacao dos coletores) | 27,4 mil chamadas/h; 149 mil ms/h | 19,4 mil chamadas/h; 476 mil ms/h | PIOR por chamada (24,6 ms contra 5,9 ms): coletores religados + banco ocupado |

Soma do tempo das 12 consultas mais pesadas: ~2,23 milhoes de ms/h antes; ~0,72 milhao de ms/h depois (-68%); sem a serie dos coletores, -90% ou mais.

Operacao (Telegram), medida na mesma sessao: envios por hora de 60-110 (1 a 2 tipos por loja) para 100-151 (5 a 14 tipos por loja); oito lojas enviando.
