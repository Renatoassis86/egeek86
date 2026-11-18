# Cronograma da v2 em dias (2026-11-18 a 2026-11-27)

Regra: cada dia fecha com teste, portao verde, deploy e medicao. Itens que dependem de contratacao ou de decisao do dono ficam fora (marcados).

| Dia | Entrega | Pronto quando |
|---|---|---|
| D0 qua 18/11 | Medir coletores (feito: `scripts/medir-sobreposicao-coletores.ts`); decidir o ajuste dos coletores; ciclo do alerta: auditar disparo | numeros no commit; decisao registrada |
| D1 qui 19/11 | Ajuste de coletores (orcamento por rodada) + alerta por usuario fechado no site e no Telegram (revalidacao ao vivo antes de avisar) | `collect-vertical` sem `error/running` orfaos em 24 h; 1 alerta de teste ponta a ponta |
| D2 sex 20/11 | JSON-LD Product/AggregateOffer so com preco fresco; canonical; landing da Black Friday | validador de dados estruturados sem erro; landing no ar |
| D3 sab 21/11 | Canario de leitura (20 a 30 produtos por rede) + quarentena de leitura nula; segundo extrator Amazon em sombra | canario no portao e em cron horario |
| D4 dom 22/11 | Cliques /go com dedupe (sinal do score); score de interesse em SOMBRA (so grava, nao muda coleta) | score gravado para 100% das ofertas ativas |
| D5 seg 23/11 | Materializar ofertas publicas (flag, sombra) + cache do grafico | home e departamento sem CTE de ~2 s; comparacao identica |
| D6 ter 24/11 | Deals robustos (2 leituras + baseline robusto) em sombra; rotular 200 alertas | precisao medida com intervalo |
| D7 qua 25/11 | Pagina por produto mestre (`/p/slug`, 301) atras de flag | 301 testado; flag desligada em producao |
| D8 qui 26/11 | Congelamento pre-Black Friday: so correcao; ligar o que estiver verde | portao verde 24 h |
| 27/11 | Black Friday: so vigia | |

Fora do cronograma (dependem do dono): Keepa e revisao da R-82; Redis/QStash (contratacao); extensao e API (gatilho de audiencia e parecer juridico).

## Correcao do plano com base na medicao de hoje
- "Parar batimento como linha" foi RETIRADO: o batimento ja e 1 linha por oferta a cada 24 h e economiza ~5 MB/dia num banco de 689 MB; remove a prova de continuidade da serie. Risco maior que o ganho.
- Coletores: 7 departamentos a cada 15 min, cada um com 4 a 5 min de media (max 9 min); 100% das execucoes se sobrepoem a outro departamento; a maioria termina `partial` (estourou o orcamento de 240 s), ha `error` e `running` orfaos.
