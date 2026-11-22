# Relatório: como anda a melhoria na leitura do banco (2026-11-22)

Pedido do dono (22/11): "como anda a melhoria na leitura e ações sobre o banco de dados que deliberamos para que o banco andasse de forma mais rápida". Medido em 22/11 entre 06:09 e 06:20 UTC (03h BRT, madrugada), só com consultas leves (uma por vez, `statement_timeout` 8 s, 1 conexão), sem ler segredo. Conferido pelo efeito no banco, pelo código e pelo `vercel.json`. As variáveis da Vercel não foram lidas: "ligado" abaixo é o padrão do código mais a prova no banco.

**Resumo em uma linha:** o tempo de banco das maiores consultas caiu de ~2.264 s/h para ~816 s/h (-64%), as consultas pesadas antigas sumiram e o cron de estatísticas fecha (24 de 24 ok); **mas o ciclo de envio hoje está mais lento e com erro (7% dos ciclos em 24 h) e a leitura de blocos subiu**, por causa de rotinas novas que ainda leem demais (seção 3).

## 1. O que foi implementado desde 15/11

| # | Melhoria | Estado | Prova de hoje | Ganho medido (documentado) |
|---|---|---|---|---|
| 1 | Cache incremental do histórico de envios (`HISTORY_CACHE`) | Ligado | consulta completa antiga: 15.969 chamadas em 19/11 e as mesmas hoje (0 novas) | 160 chamadas/h e 294 s/h para 0. **Efeito colateral:** o delta dele é hoje a consulta nº 1 (seção 2) |
| 2 | Contagem de cotações base + delta (`QUOTE_COUNT_INCREMENTAL`) | Ligado | base diária no `showcase_snapshot`; contagem completa (311 chamadas, 2.948 s) parou de crescer | ~99 GB lidos em 3 dias para delta de 1 h em 1,7 s |
| 3 | Estatística de preço incremental (`PRICE_STATS_INCREMENTAL`) | Ligado | `product_price_stats` com 7.938 linhas, autovacuum de hoje 05:20 | candidatos em 1 leitura, não mais EXISTS por produto (estourava 30 s) |
| 4 | Resumo exato `product_price_rollup` (`PRICE_STATS_ROLLUP`) | Ligado | `q_all` parou: 4.812 chamadas acumuladas, igual ao fim de 19/11 (4.807 + 5) | q_all 48 para 6,7 chamadas/h; 423 mil para 40,7 mil blocos/h; 296 produtos, 0 diferenças |
| 5 | Ofertas públicas materializadas (`PUBLIC_OFFERS_MAT`, cron a cada 3 min) | Ligado | `public_offers_mat` com 54.695 linhas; consultas `live_network` paradas (+0 na janela) | ~70 para ~0,3 chamada/h |
| 6 | Redes vivas em memória (`LIVE_NETWORK_CACHE`) | Ligado | junto da linha 5 | parte da linha 5 |
| 7 | Memos (série diária das mensagens, envios por tipo) | Ligado, parcial | memo é por instância (não medi a consulta de leitura da série diária na janela; só a escrita `price_daily_offer`, 8 chamadas/h) | 28 para 24 chamadas/h (só instância fria) |
| 8 | Índices parciais/compostos (`collector_runs`, `group_messages`, snapshots) | Ligado | existem e válidos (inventário de 20/11) | histórico 11,8 MB/chamada para índice; contagem de 1 h de 18 s para 1,7 s |
| 9 | Autovacuum agressivo (scale 0,05) em `collector_runs`, `group_messages`, `affiliate_offers` | Ligado | dead tuples hoje: 857 / 1.063 / 3.844 (antes 138 / 4.655 / 2.907) | tabelas quentes sob controle |
| 10 | Memo por hora do collector-health (`HEALTH_HOURLY_MEMO`) | Ligado | 1,8 chamada/h de 9,3 s para ~0 s | ~17 s de banco/h e ~3 M de linhas por rodada |
| 11 | Identidade restrita ao produto na abertura (`IDENTITY_SCOPE_MASTERS`) | Ligado | 2.727 excluídas, 14.058 produtos, 0 diferença | contagem 1.073 a 1.636 ms para 306 ms |
| 12 | Índice parcial da cota Plus (0072) | Ligado | existe | buffers 6.803 para 519; plano 800 para 70 |
| 13 | Vigia do cron de estatísticas + guarda de lote (`CRON_WATCHDOG`, `STATS_CHUNK_GUARD`) | Ligado | 24 h: `refresh-snapshots:stats` 24 de 24 `ok` (p50 165 s); `vitrines` 122 ok, 21 fechadas pelo vigia (`watchdog`, 270 s), 1 reaper | antes 16 de 16 rodadas fechadas pelo reaper em ~678 s |
| 14 | Pré-filtro da janela da fila R-110 (`GROUP_JANELA_PREFILTRO`) | Ligado | a consulta da janela (`fam6`) ainda custa 46 chamadas/h x 2,8 s (seção 2) | linhas barradas por repetição de 30 a 60 por loja para 0 a 2; **ganho foi de fluxo, não de custo de banco** |
| 15 | Tipo em `group_messages` + pista-sombra R-112 (cron a cada 5 min, canais livros, impressão 3D, beleza) | Ligado, só sombra | 288 rodadas em 24 h, todas `ok`; **tipo preenchido em 418 de 4.137 envios de 24 h (10%)**: só os canais piloto | rota p50 1,97 s, p95 2,89 s; UPDATE único do tipo (era um por tipo) |

Não é melhoria de leitura, mas entrou no mesmo período: coletores de 4 lojas a cada 30 min (4b5f833) e semeadura a cada 20 min com guarda de alívio do banco.

## 2. Estado de hoje (medido)

**Fonte e período.** `pg_stat_statements` zerado em 15/11 22:33 UTC; o acumulado cobre 151,6 h. Os números "hoje" abaixo são o **delta de uma janela limpa de 7,9 min** (06:09:53 a 06:17:56 UTC, madrugada, sem rajada de testes). A janela é curta: a ordem é fiel, as taxas por hora têm margem. Só as 60 maiores consultas foram lidas.

**Top 10 por tempo total (janela de 7,9 min, extrapolado por hora):**

| # | Consulta (chamador) | Chamadas/h | Segundos de banco/h | Blocos lidos/h |
|---|---|---|---|---|
| 1 | Delta do histórico de envios (`SELECT id::text AS gm_id ... COALESCE(sent_at, created_at)`, group-offers) | 574 | 215 | 519.882 |
| 2 | Pool da detecção (`WITH live AS MATERIALIZED`, group-offers) | 46 | 187 | 231.698 |
| 3 | Janela da fila (`WITH fam6 AS MATERIALIZED`, group-queue) | 46 | 131 | 205.778 |
| 4 | Revalidação de cupons do ML (`WITH ml AS`, revalidation-queue) | 46 | 81 | 53.975 |
| 5 | Leitura de ofertas por master (`SELECT o.master_product_id, o.id AS offer_id ...`) | 1.991 | 56 | 25.276 |
| 6 | Série por oferta dos coletores (`select price_cents, collected_at from affiliate_price_snapshots where offer_id`) | 26.050 | 36 | 52.995 |
| 7 | Identidade de vendedor (`COALESCE(o.seller_id::text, ...)`) | 1.738 | 32 | 2.596 |
| 8 | `update affiliate_offers set current_price_cents` (coletores) | 25.927 | 25 | 13.323 |
| 9 | Auditoria de link (`SELECT o.id, o.affiliate_url AS link ...`) | 8 | 17 | 15.115 |
| 10 | `INSERT INTO price_daily_offer` (série diária) | 8 | 16 | 28.155 |

**Top por blocos lidos/h:** 1 delta do histórico (519.882), 2 pool da detecção (231.698), 3 janela da fila (205.778), 4 revalidação ML (53.975), 5 série dos coletores (52.995), 6 `UPDATE group_messages SET status` (51.900), 7 série diária (28.155), 8 ofertas por master (25.276), 9 auditoria de link (15.115), 10 `INSERT offer_link_audit` (15.115). Soma das 60 consultas: 858 s/h e 1,27 M blocos lidos/h.

**Comparação com o relatório de 19/11** (12 maiores consultas; antes = acumulado de 99 h até 19/11, hoje = janela acima):

| Medida | Antes (19/11) | Hoje | Mudança |
|---|---|---|---|
| Tempo de banco das 12 maiores | ~2.264 s/h | ~816 s/h | -64% |
| Blocos lidos das 12 maiores | ~777 mil/h | ~1.212 mil/h | **+56% (piorou)** |

A queda do tempo vem das consultas que sumiram (q_all, histórico completo, live_network). O aumento dos blocos lidos vem do delta do histórico (item 1 da tabela, que passou de 216 mil para 520 mil blocos/h) e do pool da detecção; o histórico lê a coluna `candidate` (jsonb) de cada linha nova e `group_messages` cresceu.

**Tabelas grandes (tamanho total com índices; mortas = `n_dead_tup`):**

| Tabela | Tamanho | Linhas vivas | Mortas | Último autovacuum |
|---|---|---|---|---|
| `affiliate_price_snapshots` | 810 MB | 3.821.813 | 310.264 (8%) | **nunca** |
| `group_messages` | 657 MB | 238.735 | 1.063 | 22/11 05:43 |
| `collector_runs` | 124 MB | 100.267 | 857 | 21/11 23:43 |
| `price_daily_offer` | 121 MB | 486.136 | 55.500 (11%) | 22/11 02:09 |
| `affiliate_offers` | 108 MB | 76.333 | 3.844 | 22/11 06:07 |
| `price_daily_state` | 63 MB | 154.108 | 28.012 (18%) | 22/11 04:10 |
| `coupon_reads` | 51 MB | 164.115 | 16 | 16/11 |

(O estudo de 20/11 citou 407 MB para `group_messages`; não sei se era só a tabela ou com índices, então não afirmo crescimento, só registro 657 MB e 238 mil linhas.) `master_products` tem 909.944 varreduras sequenciais acumuladas (17 mil linhas, só CPU) e `affiliate_offers` 124.666.

**Ciclo `group-messages` e rota `pista-sombra` (collector_runs, últimas 24 h):**

| Job | Ciclos | Status | p50 | p95 | Máximo |
|---|---|---|---|---|---|
| group-messages | 2.315 | ok | 24,6 s | 78,2 s | 191 s |
| group-messages | 174 | **error** (7,0% de 2.489) | 71,3 s | 120,7 s | 194,6 s |
| pista-sombra | 288 | ok (0 erros) | 1,97 s | 2,89 s | 4,7 s |

Por hora (BRT) o p50 do ciclo ficou entre 17,6 s e 51,6 s e o p95 entre 49 s e 106 s; a pior faixa foi 08h a 12h e 15h a 16h (p50 29 a 52 s, 8 a 14 erros por hora). **Piorou em relação ao R-112** (p50 16,4 a 18,3 s, p95 66,6 a 70,7 s, medidos em 20/11 à noite). Não medi a causa da piora; hipóteses ainda sem prova: delta do histórico mais pesado, revalidação de cupons, coletores religados disputando o disco.

**Erros do `group-messages` em 24 h (174), por consulta que falhou** (o erro grava só "Failed query", sem distinguir timeout de conexão; os de 30 a 60 s em consultas triviais indicam espera por conexão ou lentidão do banco):

| Consulta que falhou | Ciclos |
|---|---|
| `UPDATE group_messages SET claim_from = status, status = 'enviando'` (reserva da mensagem para envio) | 75 |
| `SELECT to_regclass('public.group_messages')` (checagem trivial: indica conexão presa) | 24 |
| `SELECT id::text AS gm_id ...` (delta do histórico) | 15 |
| `INSERT INTO group_messages ... SELECT` (propostas) | 14 |
| `INSERT INTO group_offer_watch ... ILIKE '%amazon%'` | 11 |
| `SELECT max(counted_at) FROM group_member_counts` | 10 |
| `SELECT ... recheck_due_at <= $1` (recheck) | 9 |
| demais | 16 |

Mais de metade dos erros (99 de 174) são consultas triviais ou de escrita de uma linha, o que aponta para banco ocupado ou espera por trava, não para uma consulta única pesada.

**Conexões (uma amostra leve de `pg_stat_activity`, madrugada, não é pico):** 25 sessões de 60 permitidas; 4 ativas (mais antiga 23 s), 4 `idle in transaction` (mais antiga 60 s), 10 ociosas, 1 interna. Pico real não medido: exigiria amostrar durante o dia.

**Registros `running` fechados pelo reaper em 24 h (rotas sem vigia):** `collect-prices` 51 (de cerca de 144 rodadas), `collect-vertical` eletroeletrônicos 24, beleza 16, esporte 5, livros 5, impressão 3D 2, `discover-products` 3, `collect-shopee` 3: **~109**. O vigia do R-111 só cobre `refresh-snapshots`.

**Vazão de envio:** 4.137 mensagens do Telegram enviadas em 24 h (~172/h; antes de 19/11: 60 a 110/h, depois 100 a 151/h).

## 3. O que ainda lê o banco demais e o que NÃO foi implementado

**As 5 rotinas mais caras hoje** (tabela da seção 2): (1) delta do histórico de envios, 215 s/h; (2) pool da detecção, 187 s/h; (3) janela da fila, 131 s/h; (4) revalidação de cupons ML, 81 s/h; (5) leituras por master, 56 s/h. As três primeiras são group-offers/group-queue, o caminho do envio: é por isso que o envio sofre.

**Não implementado, por prioridade (ganho / risco):**

| Prio | Ação | Ganho esperado | Risco |
|---|---|---|---|
| 1 | Delta do histórico lê só colunas escalares; `candidate` jsonb só das linhas novas que precisam (ou coluna materializada com o que o histórico usa) | tira ~520 mil blocos/h e ~215 s/h, a nº 1 | Baixo a médio: precisa teste de equivalência como o do rollup (flag + prova) |
| 2 | Vigia de fechamento nas demais rotas longas (`collect-prices`, `collect-vertical`, `discover-products`, `collect-shopee`): mesma técnica do R-111 | elimina ~109 registros `running` presos/dia e as sessões que seguem segurando conexão após o teto da função | Baixo: padrão já provado em `refresh-snapshots` |
| 3 | Pool da detecção (`live`): materializar ou memo curto por vertical (46 chamadas/h x 4 s) | ~187 s/h e ~230 mil blocos/h | Médio: o pool decide o que envia; precisa paridade |
| 4 | Janela da fila (`fam6`): o pré-filtro R-110 trouxe fluxo, mas a consulta ainda custa 2,8 s; revisar plano/índice por loja | ~131 s/h | Médio |
| 5 | Autovacuum agressivo em `affiliate_price_snapshots` (nunca teve; 310 mil mortas) e `price_daily_state` (18%); fazer fora do horário de pico | menos bloat e leituras sequenciais menores | Baixo, mas o primeiro vacuum é pesado em I/O: rodar de madrugada e vigiando o envio |
| 6 | Revalidação de cupons ML (`ml`): 12 M de buffers por 46 chamadas, é CPU/cache; restringir às campanhas vencendo | ~81 s/h | Baixo a médio (regras R-63 a R-68 não podem afrouxar) |
| 7 | Preencher `tipo` em todos os envios (hoje 10%) e fazer "envios por tipo em 24 h" ler a coluna em vez do jsonb | tira leitura de `candidate` nessa consulta | Baixo (backfill em lotes pequenos, com pausa) |
| 8 | Retenção/arquivamento do jsonb `candidate` de mensagens expiradas antigas em `group_messages` | tabela menor, histórico e varreduras mais baratos | Médio-alto: mexe em dado histórico; só com backup e aval do dono |
| 9 | Série dos coletores (26 mil leituras + 26 mil updates por hora, ~60 s/h) | pequeno por chamada | Núcleo de coleta congelado; não recomendo |

Não recomendo subir `GROUP_SEND_CONC` nem o pool de conexões enquanto o banco estiver nessa situação.

## 4. Veredito

**Mais rápido em parte; o caminho de envio hoje está pior.**

| Indicador | Antes | Hoje | Veredito |
|---|---|---|---|
| Tempo de banco das 12 maiores consultas | ~2.264 s/h | ~816 s/h | Melhor (-64%) |
| Consultas pesadas eliminadas (q_all, histórico completo, live_network) | 48 + 160 + ~70 chamadas/h | ~0 | Melhor |
| Cron de estatísticas fechando | 0 de 16 (reaper) | 24 de 24 `ok` | Melhor |
| Blocos lidos/h (12 maiores) | ~777 mil | ~1.212 mil | Pior (+56%) |
| Ciclo `group-messages` p50 / p95 | 16,4 a 18,3 s / 66,6 a 70,7 s (R-112) | 24,6 s / 78,2 s (ok); horas de pico p50 até 51,6 s | Pior |
| Ciclos com erro em 24 h | não registrado antes | 174 de 2.489 (7,0%) | Problema aberto |
| Vazão de envio | 60 a 110/h, depois 100 a 151/h | ~172/h | Melhor |
| Rota `pista-sombra` | meta 2 s mediana | p50 1,97 s, p95 2,89 s, 0 erros | Dentro da meta |

A otimização tirou a carga que era visível em 19/11, e o dono recebeu mais fluxo (172 envios/h). Porém o fluxo maior e as rotinas novas (delta do histórico, pool, janela, cupons) ocuparam o espaço liberado: o banco pequeno (256 MB de `shared_buffers`) continua no limite e 7% dos ciclos de envio falham em consultas simples. A próxima melhoria de maior valor é a prioridade 1 (delta do histórico sem `candidate`), seguida do vigia nas rotas longas (prioridade 2).

**Limites desta medição:** janela de 7,9 min, de madrugada (o dia tem mais carga); só as 60 maiores consultas; sem pico de conexões; flags da Vercel não lidas; causa da piora do ciclo não provada.
