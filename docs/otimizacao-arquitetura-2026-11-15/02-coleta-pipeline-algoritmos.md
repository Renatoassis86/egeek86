# Otimização da arquitetura, fatia 02: pipeline de coleta, jobs, mensageria e algoritmos/indicadores

Data: 2026-11-15, medições às 19:00 UTC (16:00 BRT). Modo: somente leitura (SELECT em transação `read only`, `statement_timeout` 25 s, `max: 1`; nenhum dado nem código alterado; scripts temporários apagados). Sem segredos impressos.
Rótulos: **[medido]** = número obtido agora no banco; **[leitura]** = lido no código (arquivo:linha aproximada); **[hipótese]** = inferência a confirmar.
Não repete o que já está em `docs/auditoria-2026-11-15/` nem a fila #20 a #110. Onde um achado já tem item na fila, vem marcado `#NN` (e o que eu acrescento de medida ou de ângulo); onde não tem, `NOVO`.

## Resumo no topo: top 10 por retorno/esforço

| # | Achado | Evidência (resumo) | Esforço | Risco | Fila |
|---|---|---|---|---|---|
| 1 | Nenhum `fetch` do caminho quente do Mercado Livre tem timeout: uma resposta pendurada consome o orçamento inteiro e vira linha presa | `mercado-livre.ts:25,64,110`, `collect-vertical.ts:123`, `ml-api.ts:55`: 0 `AbortSignal.timeout`; 16 `timeout_reaper` do `collect-prices` e 24 do `collect-shopee` em 72 h; duração máx. 215 s com orçamento de 160 s; livros chega a 407 s | S | baixo | NOVO (a #72 tratou o sintoma, não a causa) |
| 2 | `collect-prices` ainda roda 2 vezes no mesmo minuto e as duas pegam as mesmas 500 ofertas: metade das chamadas ao ML é duplicada | 279 de 294 minutos com 2 execuções; 573 execuções em 24 h; intervalo p10 = 45 s [medido]. Trava de ciclo já existe (`cycle-lock.ts`) e não é usada nos coletores | S | baixo | #73 cobre achar o disparador; a trava por job é NOVA (defesa independente) |
| 3 | Ofertas Shopee fora de games não têm cron de coleta: 138 de 138 do esporte estão com mais de 3 h e 77 com mais de 24 h | `collect-shopee/route.ts` aceita `?v=` e diz que o tick é necessário; `vercel.json` só tem `/api/cron/collect-shopee` sem `v` | S | baixo | NOVO |
| 4 | O erro dominante da coleta é do nosso banco, não da fonte, e o classificador o esconde em `other`/`network` | amostras de erro: "Failed query: select ... affiliate_offers" e "socket sem resposta em 30000 ms"; 98% dos ~6,2 mil erros em 72 h caem em `other` (3.439) ou `network` (2.704); 429 são 59 | S | nenhum | NOVO (liga com #87) |
| 5 | `amazon-assistida` grava `status='ok'` e `errors=0` fixos: 2.717 execuções, 0 erro em 72 h, o que é por construção | `ingest/amazon-assistida/route.ts` (INSERT com `'ok'` e `0`) | S | nenhum | NOVO |
| 6 | Trabalho inútil por batimento: 52% das linhas novas de snapshot são `batimento` (mesmo preço) e cada uma dispara 3 a 5 consultas de quarentena | 69,6 mil de 132,8 mil snapshots em 3 dias; `record-price-snapshot.ts:~108` roda `avaliarEQuarentenarPreco` sempre que `inserted` | S | baixo | NOVO |
| 7 | Queda fantasma entra no histórico: 122 quedas de mais de 50% que voltam ao preço anterior (A→B→A) em 3 dias; `collect-prices.ts` não usa a régua de preço baixo | 206 quedas >50% em 95,5 mil mudanças; mínimo diário abaixo de 50% da mediana em 541 de 12.035 dias completos (4,5%) | M | médio | NOVO (parcial R2-12) |
| 8 | A métrica de "atraso" engana: a fila `due_total` é de cadência (15 min), não de atraso. O atraso real do ML games é 0 ofertas acima de 6 h; o problema real é eletroeletrônicos (748 de 7.298, 10,2%, acima de 6 h) e a Amazon (p50 de 37 h) | consulta de idade por rede/vertical [medido] | S | nenhum | ajusta #88 e #20 (trocar a métrica) |
| 9 | 76% das propostas de mensagem expiram; o gatilho AC sozinho gera 56% do volume e envia 9,6% | AC 16.477 criadas, 13.458 expiradas, 1.578 enviadas em 72 h | M | médio | #90 (M1); aqui o número por gatilho e o orçamento por canal |
| 10 | Contratos de ingestão sem esquema único nem versão: validação manual campo a campo, `zod` instalado e usado em 1 arquivo; o loop injetado no Chrome não declara versão | `grep zod` em `ingest/*`: 0; `public/loops/*.js` sem `v` no payload | M | médio | parcial #92 (token); esquema e versão são NOVOS |

Mais dois itens fora do top 10 por serem hipótese ou de menor retorno: corrida na renovação do token OAuth do ML (S, NOVO) e backoff por oferta falha sem `next_check_at` (M, NOVO). Estão nas seções 2 e 3.

---

## 0. O que já está bom (para não mexer)

- **Idempotência do snapshot**: `recordPriceSnapshot` serializa por oferta com `pg_advisory_xact_lock(hashtext(offerId))` e só grava quando o preço muda ou no batimento de 24 h (`record-price-snapshot.ts`). Mesmo com disparo duplo não há linha repetida de preço.
- **Fila de mensagens**: `INSERT ... ON CONFLICT (dedup_key, channel) DO NOTHING`, reivindicação atômica, 429 do Telegram devolve a mensagem com `retry_after`, reconferência ao vivo antes do envio (já medida pela auditoria 03: divergência máxima de 0,89%).
- **Trava de ciclo do group-messages** (`cycle-lock.ts`): lock de transação com `idle_in_transaction_session_timeout` e falha aberta. Medido: o `group-messages` roda 1.389 vezes em 24 h, p95 47 s contra teto de 60 s, 62 erros em 72 h (1,5%).
- **Reaper (#72) funciona**: 4 linhas `running` hoje (eram 104). Em 72 h ele fechou 85 execuções com `timeout_reaper`. Ver seção 1 sobre a causa que continua.
- **Concorrência real é moderada**: excluindo as linhas fechadas pelo reaper, no máximo 8 execuções pesadas ao mesmo tempo (p95 = 6, média 3,6) [medido]. O "cron empilhado" da auditoria 04 (C2) é real mas não é o gargalo.
- **Loops do Chrome**: recuo com jitter (`Math.random()` em `amazon-assistida.js:210`, `cupons-24h.js:202`), teto de 30 min, "nenhum loop para", lógica pura separada do DOM.
- **Rotas de ingestão**: `timingSafeEqual`, origem fixa por rede (`originAllowedForNetwork`), limite de corpo (400 KB), tamanho mínimo do token (32), kill-switch por 503, filtro de 40 linhas por chamada.
- **Indicador de preço**: média por oferta-dia com carry-forward limitado a 48 h, faixa plausível de 35% a 3x, decomposição encadeada (Dutot) com `matched_change_pct` e `composition_flag`, piso de 3 ofertas, dias `gap/partial/complete/legacy` explícitos (`daily-state.ts`). É um desenho acima da média do mercado.
- **Quarentena não destrutiva**: a leitura nunca é descartada, só marcada com motivo (migration 0052), e só libera o que ela mesma marcou.
- **Observabilidade de base**: `collector_runs` com `due_total`, `oldest_due_age_s`, `error_kinds`, `stopped_because`, amostras de erro em `meta`; `collector-health` com reaper embutido.

---

## 1. Orquestração e tolerância a falhas

### 1.1 Medida da saúde dos jobs (72 h) [medido]

| Job | Execuções | partial/budget | error (todos `timeout_reaper`) | p50 / p95 / máx. (s) | 429 |
|---|---|---|---|---|---|
| collect-prices | 1.726 | 0 | 16 (0,9%) | 99 / 153 / 215 | 52 |
| collect-shopee | 861 | 837 (97%) | 24 (2,8%) | 243 / 261 / 290 | 3 |
| collect-vertical:livros | 287 | 246 (86%) | 2 | 278 / 359 / **407** | 1 |
| collect-vertical:eletroeletronicos | 288 | 189 (66%) | 5 | 242 / 286 / **379** | 0 |
| collect-vertical:impressao3d | 283 | 203 (72%) | 0 | 244 / 277 / 329 | 3 |
| collect-vertical:esporte | 287 | 3 | 1 | 152 / 206 / 305 | 0 |
| refresh-snapshots:showcase | 288 | 0 | 12 (4,2%) | 106 / 151 / 241 | 0 |
| refresh-snapshots:vitrines | 323 | 0 | 9 | 8 / 21 / 37 | 0 |
| discover-products | (24 h: 69) | | 7 em 72 h | | |
| group-messages | 4.205 | 0 | 62 `error` reais | 16 / 47 / 79 | |

### 1.2 Achado O1 (alto retorno, S): `fetch` sem timeout no caminho quente do ML. NOVO

- **Evidência [leitura]**: `src/server/collector/sources/mercado-livre.ts` linhas ~25, ~64 e ~110 (`fetchSellerTitles`, `fetchSnapshots`, `fetchCatalogPage`), `src/server/collector/vertical/collect-vertical.ts:123` (`fetchRawPage`), `src/lib/catalog/vertical/ml-api.ts` (`doFetch(...)` sem `signal`), `discover-products.ts:405` e `mercado-livre-auth.ts:37,63`. Dos 8 arquivos do repositório que usam `AbortSignal.timeout`, nenhum é um desses (existe só em `mercado-livre-details.ts:24` com 8 s e `shopee-auth.ts:103` com 15 s).
- **Evidência [medido]**: `collect-prices` tem orçamento de 160 s (`COLLECT_BUDGET_MS`) e duração máxima de 215 s; `collect-vertical:livros` tem orçamento de 240 s e duração p95 de 359 s e máxima de 407 s, acima do `maxDuration` de 300 s da rota. O orçamento é verificado entre grupos (`Date.now() - startedMs > budgetMs`), então o tempo real é orçamento + a pior chamada em andamento. Sem timeout, a pior chamada é "indefinida" (o `undici` espera até 300 s pelos cabeçalhos).
- **Impacto**: parte das 85 linhas fechadas pelo reaper em 72 h (2,8% do `collect-shopee`, 0,9% do `collect-prices`) vem daqui. Cada função morta perde o lote em andamento (sem carimbo, sem `finish`) e gasta CPU até o teto.
- **Recomendação**: um `fetchComTimeout(url, init, ms = 10_000)` único em `src/lib/http/` com `AbortSignal.timeout`, retry de 1 tentativa só para 5xx/rede com espera 300 a 900 ms aleatória (jitter) e respeito a `Retry-After` no 429. Trocar nos 7 pontos. Combinar com: orçamento de tempo = `maxDuration` menos 60 s (e não 80%) e checagem de prazo também dentro do lote (hoje só entre grupos).
- **Esforço S, risco baixo** (falha vira erro já tratado: sem carimbo, volta à fila). **Ordem: 1.**

### 1.3 Achado O2: disparo duplo continua e as duas execuções fazem o mesmo trabalho. #73 + NOVO (trava por job)

- **Evidência [medido]**: 573 execuções do `collect-prices` em 24 h contra 288 esperadas de `*/5`; em 279 de 294 minutos distintos há 2 execuções; o intervalo entre execuções consecutivas tem p10 = 45 s, p50 = 150 s, p90 = 255 s. Como a seleção é `ORDER BY lastCheckedAt ASC LIMIT 500` e o carimbo só avança por grupo processado, as duas execuções começam com as mesmas ~500 ofertas e repetem as mesmas chamadas à API do ML (a trava por oferta evita só a linha duplicada, não a chamada). Estimativa [hipótese, não medida por oferta]: até metade das chamadas ao catálogo do ML é redundante.
- **Origem**: a auditoria 04 já registrou o `pg_net`; a flag `CRON_BLOQUEIA_PG_NET` (commit 045b720) existe e está desligada por padrão [leitura: `cron-auth.ts:30`]. Ligá-la é decisão do dono (#73).
- **Recomendação nova, independente de achar o disparador**: usar `acquireCycleLock('collect-prices')` (já pronta, `cycle-lock.ts`) no início de cada coletor (`collect-prices`, `collect-shopee`, os 5 `collect-vertical`, `discover-*`), devolvendo `{skipped:'ciclo anterior'}`. Isso cobre também o caso de uma execução passar de 5 min. Esforço S; risco baixo (a trava é de transação e cai sozinha).
- **Ordem: 2.**

### 1.4 Achado O3: o tick de coleta Shopee de outras verticais não está agendado. NOVO

- **Evidência [leitura]**: `src/app/api/cron/collect-shopee/route.ts` explica que `?v=esporte` existe porque o `collect-vertical` é só ML e que "sem este tick as ofertas passam de 6 h"; `vercel.json` contém apenas `/api/cron/collect-shopee` (games). **[medido]** ofertas Shopee ativas fora de games: esporte 138 (todas > 3 h, 77 > 24 h), impressão 3D 23 (21 > 3 h), eletrodomésticos 11 (todas > 3 h), eletroeletrônicos 1. Total 173 ofertas sem coleta recorrente (o `ampliar-amostra-shopee` e `cobertura-shopee` as tocam só de passagem).
- **Impacto**: as mensagens de esporte e 3D da Shopee dependem de confirmação recente; essas 173 ofertas ficam fora de qualquer envio e de média confiável. Em volume é pequeno hoje, mas a #60 (ciência/tecnologia) e a ampliação Shopee vão aumentar.
- **Recomendação**: adicionar ao `vercel.json` `collect-shopee?v=esporte` (a cada 15 min) e, com o mesmo padrão, uma entrada única `?v=outras` que varra as demais verticais. Esforço S; risco baixo (rota já pronta e testada). Depende do dono (agendar). **Ordem: 3.**

### 1.5 Achado O4: a métrica de atraso mistura cadência com backlog. Ajusta #88 e #20

- **Evidência [medido]**: `collect-prices` tem `due_total` quase constante em ~6.700 por hora e `sel = 500` (teto) em todas as 24 h, enquanto a idade da confirmação das ofertas ML ativas é: games 9.064 ofertas, **0 acima de 6 h**; tecnologia, livros, eletrodomésticos, 3D e esporte: 0 acima de 6 h. `due_total` conta ofertas com última checagem acima de 15 min (a cadência), não ofertas "atrasadas". Já `oldest_due_age_s` oscila de 1 h a 2.503 h hora a hora (outliers isolados, p.ex. ofertas `draft` voltando à fila), não é tendência.
- **O atraso real [medido, idade da última confirmação, ofertas ativas]**:

| Rede/vertical | Ativas | p50 (h) | p90 (h) | > 24 h |
|---|---|---|---|---|
| ML (todas) | 26.092 | 0,5 | 1,1 | 687 |
| ML eletroeletrônicos | 7.298 | n/m | n/m | 686 (9,4%); 748 acima de 6 h; 7 nunca checadas |
| Shopee (games) | 4.062 | 1,1 | 1,9 | 0 |
| Amazon | 2.853 | **37,0** | **80,0** | 2.416 (84,7%) |

  Resumo: a leitura "fila nunca zera" da auditoria 04 vale para eletroeletrônicos do ML (cuja rota estoura o orçamento de chamadas ou de tempo em 189 de 288 execuções e seleciona 4.465 ofertas por execução com cadência de 15 min) e para a Amazon; **não vale para games, tecnologia, livros, eletrodomésticos, 3D e esporte do ML**, que estão frescos.
- **Recomendação**: (a) trocar o SLO de coleta por "p90 da idade da confirmação por rede e vertical, ofertas ativas" (a consulta acima, S) e alarmar acima de 2 h (ML/Shopee) e 24 h (Amazon); (b) concentrar a #88 em eletroeletrônicos (dividir em 2 rotas a/b por faixa de id ou subir o teto de chamadas) e deixar as demais verticais como estão; (c) `due_total` e `oldest_due_age_s` ficam como diagnóstico, não como SLO. Esforço S para (a), M para (b). Risco baixo. **Ordem: 8.**

### 1.6 Achado O5: falha sem recuo por oferta (cabeça de fila). NOVO, parte hipótese

- **Evidência [leitura]**: as três coletas escolhem por `last_checked_at ASC NULLS FIRST` e só carimbam o grupo que respondeu (`collect-prices.ts`: "falha não renova o carimbo"; `collect-vertical.ts`: "sem carimbo: o catálogo segue devido"). A única coluna de controle é `consecutive_miss_count` (que conta "sem vendedor", não falha); não existe `next_check_at`, contagem de falhas por oferta nem dead-letter [medido: colunas de `affiliate_offers` com `fail/error/next/retry`: nenhuma].
- **Medida**: 6,2 mil erros de consulta em 72 h só nos jobs de preço; livros tem ~6 erros por execução. Quanto desses são os mesmos itens repetidos não foi medido: o `meta` guarda só 3 amostras sem id do catálogo **[não medi por oferta]**. As amostras sugerem erro transitório de banco (O6), não item "venenoso".
- **Impacto potencial**: um catálogo que falha sempre (404 estranho, resposta gigante) volta ao topo e gasta chamada em todo ciclo, atrasando os demais.
- **Recomendação**: `check_fail_count` + `next_check_at = now() + least(2^n * 5 min, 6 h) * (0,75..1,25)` (jitter); a seleção passa a filtrar `next_check_at <= now()`. Após N falhas seguidas, status `check_suspenso` (dead-letter com motivo) visível no admin. Requer migration (aval). Esforço M; risco médio. **Ordem: 11** (só depois de medir por oferta: gravar o `externalRef` falho em `meta.erros_ref`, S, hoje).

### 1.7 Achado O6: o erro dominante é interno e o classificador o esconde. NOVO (liga com #87 e #16)

- **Evidência [medido]** (`meta.errorSamples`, 48 h): as mensagens mais frequentes são `Failed query: select "id", "affiliate_link_pending", "status" from "affiliate_offers" where ...` (253 no `collect-prices`), `socket sem resposta em 30000 ms` (239 no `collect-prices`, 109 em livros, 95 em 3D), `Failed query: update "affiliate_offers" set "last_checked_at" ...` (73 em 3D, 71 em livros) e `Failed query: update ... quarantined_at` (87 em livros). Erros de HTTP do ML são minoria: 429 = 59, 4xx = 20 em 72 h.
- **Classificação [leitura + medido]**: `classify-error.ts` só reconhece `HTTP nnn` e palavras de rede; "Failed query" cai em `other` (3.439 ocorrências) e "socket sem resposta" casa `/socket/` e vira `network` (2.704). Resultado: o painel mostra "rede" e "outros" e ninguém enxerga que 98% dos erros são contenção no Postgres (as duas consultas pesadas de 76% da carga, D4).
- **Impacto**: diagnóstico errado leva a otimizar cota de API (que não é o limite) em vez do banco. Também explica por que erros se concentram em livros, 3D e eletro: são as rotas de 240 s com mais escritas.
- **Recomendação**: novo `kind: 'db'` (padrões `Failed query`, `socket sem resposta`, `connection`, `statement timeout`, `too many`), `kind: 'oauth'` para "Falha ao renovar token"; alarme quando `db` passar de 2% das consultas. Esforço S; risco nenhum. A correção de fundo é #87 (materializar `live_networks` e `product_price_stats`). **Ordem: 4.**

### 1.8 Achado O7: corrida na renovação do token OAuth do ML. NOVO, hipótese

- **Evidência [leitura]**: `mercado-livre-auth.ts:getValidAccessToken` lê o token do banco e, se faltam menos de 5 min, chama `refreshTokens` (o comentário diz que o ML **rotaciona** o refresh_token a cada uso). Sem lock: duas execuções simultâneas (e hoje há 2 do `collect-prices` por minuto, mais as verticais) leem o mesmo refresh_token; a segunda recebe 400 (`Falha ao renovar token (400)`, texto sem "HTTP", classificado como `other`).
- **Não medido**: não achei registro claro de falha de token em 72 h (0 `auth`; o texto cairia em `other`). Pode já ter ocorrido sem rótulo. Risco: perder a coleta ML por até 6 h até alguém reautorizar manualmente se o par de tokens ficar inconsistente.
- **Recomendação**: `pg_advisory_xact_lock('ml-oauth')` ao redor de "reler, decidir, renovar, salvar" e reler o token depois de obter a trava (padrão "double-checked"). Esforço S; risco baixo. **Ordem: 9.**

### 1.9 Cron Vercel x fila/worker (avaliação de arquitetura)

- O desenho atual (24 entradas em `vercel.json`, lotes por tempo, carimbo por oferta) é adequado para ~33 mil ofertas e plano Pro. Os pontos que uma fila com worker resolveria (lock, retry com backoff, dead-letter, backpressure) podem ser obtidos sem trocar de plataforma com: trava por job (O2), `next_check_at` (O5), timeout e retry com jitter (O1) e orçamento de chamadas por rede em vez de por rota. O orçamento de chamadas já existe nas verticais (`plusCallQuota` por hora/24 h) e no `collect-prices` (`createCallBudget`); falta um orçamento **único por rede** somando as rotas, já que 8 rotas dividem a mesma cota do ML.
- **Não recomendo** migrar para fila externa antes da Black Friday: o ganho não compensa o risco. Reavaliar depois de 27/11 se as verticais passarem de ~50 mil ofertas.

---

## 2. Contratos de ingestão

### 2.1 Achado I1: validação manual e sem versão. NOVO (token por rede é #92)

- **Evidência [leitura]**: `ingest/amazon-assistida/route.ts` valida `rows` com um `filter` (id UUID e `r` é array) e deixa `a`, `t`, `p`, `l`, `s` de cada item sem checagem de tipo e faixa até `ingestAmazonRows`; `cupons` tem `validateBatch` puro e testado (bom), mas cada rota tem sua própria forma; `grep zod` nas rotas `ingest/*` = 0, embora o `zod ^4.4.3` esteja instalado e só `coupons/campaign.ts` o use. Nenhum payload leva campo de versão; o loop é injetado por "fetch + eval" e "após recarregar a aba o loop morre" (auditoria 04, L1), então servidor novo com loop velho (ou o contrário) falha em silêncio.
- **Impacto**: um campo mudado no loop ou no servidor vira erro 500/`sem_linhas` sem diagnóstico; preço do navegador (`p`) chega sem teto nem piso de sanidade na borda (a plausibilidade só roda depois, por referência do master).
- **Recomendação**: `src/lib/ingest/schemas.ts` com `zod` por rede/rota, campo `v` (inteiro) no payload e `loop_version` no cabeçalho; o servidor devolve `{ min_loop_version, current }` e o loop (que já tem recuo) mostra pausa "atualizar loop" em vez de insistir; recusa 422 com a lista de campos inválidos (limitada) e conta as recusas em `collector_runs.meta`. Esforço M; risco médio (mexer no contrato de loops em produção: manter o aceite do formato antigo por 7 dias). **Ordem: 10.**
- **Limites de uso**: sem rate limit por token (corpo ≤ 400 KB e ≤ 40 linhas, mas nenhuma contagem por minuto). Para uma aba do próprio dono é aceitável; o risco só cresce com o token compartilhado (#92). Sugestão S: contador em memória/linha por token e 429 acima de 120 chamadas/min.

### 2.2 Achado I2: o registro da execução da Amazon é fixo em `ok`. NOVO

- **Evidência [leitura]**: `ingest/amazon-assistida/route.ts` insere `collector_runs` com `status='ok'` e `errors=0` literais no caminho de sucesso; só a exceção grava `error`. **[medido]** 2.717 execuções em 72 h, 0 erro, 0 `partial`. Quando todas as buscas do lote voltam rejeitadas ou truncadas, a linha continua `ok`. O `amazon-vitrine` já usa `vs.truncado || vs.erros ? 'partial' : 'ok'`: replicar.
- **Recomendação**: derivar `status` e `errors` de `stats` (`rejeitados`, `sem_resultado`, `truncado`), gravar `price_confirmed`. Esforço S. **Ordem: 5.**

---

## 3. Identidade de produto e deduplicação

### 3.1 Medidas [medido]

| Chave | Masters sem a chave | % de 11.867 |
|---|---|---|
| `gtin` | 9.470 | 79,8% |
| `mpn` | 11.631 | 98,0% |
| `meli_catalog_id` | 5.360 | 45,2% |

- Ofertas ativas sem master: 0; sem `external_ref`: 0 (de 33.083). Masters com nome normalizado idêntico: 26 grupos (52 masters), residual pequeno.
- O índice `master_products_gtin_uq` é único, bom; `meli_catalog_id` também (parcial).

### 3.2 Achado D-ID1: identidade forte só em 20% dos masters. #55 (GTIN/MPN pelo ML) e #98; sem número até agora

- **Impacto**: a junção entre redes (Amazon, Shopee) depende de nome e regras (`group-rules`, `dedup.ts` com 1.004 linhas, `offer-identity`), caminho mais frágil e custoso: 1.007 masters em 2 ou mais redes (15,6%) segundo a auditoria 03. Cada falso positivo contamina a média; cada falso negativo esconde preço de outra loja.
- **Recomendação**: (a) tornar GTIN/EAN o primeiro critério de junção quando a oferta de outra rede o traz (Amazon expõe EAN na página; Shopee, às vezes) e gravar `gtin_source`; (b) o `mpn` normalizado (sem espaços e traços) como segunda chave para impressoras e eletrônicos; (c) medir a taxa de masters `merge` desfeitos (já 0 em 7 dias, ótimo) como critério de segurança antes de ampliar a fusão automática. Esforço M; risco médio. Ordem 12 (depois da Black Friday), salvo o enriquecimento já em curso (#55).

---

## 4. Qualidade de dados: outliers, quarentena e reprocessamento

### 4.1 Achado Q1: queda fantasma entra no histórico. NOVO (parcial R2-12 e a quarentena por tipo)

- **Evidência [medido, 3 dias]**: 95,5 mil variações consecutivas de preço; 206 com queda maior que 50% (0,22%), 8 maiores que 65%, 203 altas maiores que 2x. Pelo padrão A→B→A (cai mais de 50% e a leitura seguinte volta a menos de 5% do preço original) há **122 quedas transitórias** em 72 h, ~40 por dia, prováveis erros de leitura, anúncio errado ou vendedor trocando preço por minutos.
- **Evidência [leitura]**: `collect-prices.ts` não importa `isImplausiblyLow`/`isImplausiblyHigh` (grep: só Amazon, Shopee e vitrine usam); `quarentena-preco-tipo.ts` declara que o preço baixo demais "é tratado pelos coletores que já aplicam a regra 35%" e quarentena só o alto e o absoluto por tipo. O ML games e as verticais recebem queda sem confirmação.
- **Efeito no indicador [medido]**: dos 12.035 dias completos das últimas 2 semanas, o **mínimo do dia fica abaixo de 50% da mediana oferta-dia em 541 (4,5%)** e abaixo de 70% em 2.908 (24,2%). Parte é promoção real, mas o mínimo é "mínimo das cotações brutas" (comentário de `daily-state.ts`), então uma queda fantasma vira "menor preço do dia" e pode virar "menor preço do período". A reconferência ao vivo antes do envio impede a mensagem errada, mas não a página nem o gráfico.
- **Recomendação**: confirmação por segunda leitura ("debounce") para queda >50% sem corroboração de outra oferta do master: o snapshot entra com `record_kind='mudanca'` e `suspect=true` (coluna nova) ou na tabela de quarentena de leitura; o mínimo diário ignora `suspect` até a leitura seguinte confirmar (a próxima leitura chega em ≤15 min no ML). Alternativa S sem migration: não renovar o carimbo e reler no ciclo seguinte quando a queda passa de 50% e a oferta tem ≥2 referências. Esforço M; risco médio (mexe na coleta). Medir antes e depois o par `queda>50%` e `A→B→A`. **Ordem: 7.**

### 4.2 Achado Q2: trabalho inútil por batimento. NOVO

- **Evidência [medido, 3 dias]**: `source=api`: 68.277 `batimento`, 48.255 `mudanca`, 10.539 `primeira`; `source=scrape`: 1.343 `batimento`, 1.495 `mudanca`, 936 `primeira`. Batimento = 69.620 de 132.845 (52%).
- **Evidência [leitura]**: `record-price-snapshot.ts` (final da função): `if (inserted) { ... avaliarEQuarentenarPreco(...) }` e o gancho de sombra, com `inserted = true` também no batimento. `avaliarEQuarentenarPreco` faz 1 `SELECT` com `JOIN`, 1 consulta de referências do master (`getMasterReferencePrices`) e, conforme o caso, 1 `UPDATE`: ~23 mil execuções por dia sobre um preço que **não mudou** (só a referência dos outros pode ter mudado).
- **Impacto**: ~46 mil consultas extras por dia competindo com as duas consultas que já respondem por 76% do tempo do banco (D4) e com o pool de 60 conexões. Também a transação por oferta (lock, 2 SELECTs, INSERT, UPDATE) é N+1 por oferta; uma versão em lote por grupo (um `INSERT ... SELECT` com `DISTINCT ON` e um `UPDATE ... FROM`) cortaria ~80% dos round trips, esforço M.
- **Recomendação**: pular a avaliação de quarentena e o gancho de sombra quando `recordKind === 'batimento'` (esforço S); reavaliar a quarentena a cada N horas por master num job único (set-based) em vez de por snapshot. Risco baixo (o preço não mudou; o que muda é a referência, que o job periódico cobre). **Ordem: 6.**

### 4.3 Reprocessamento

- Já existe a base certa: tabelas derivadas recalculáveis do zero (`price_daily_*` "podem ser recalculadas do zero a partir dos snapshots"), scripts de backfill e rollback. Falta uma trilha única de **reprocesso**: hoje cada correção é um script de lote (`aplicar-limpeza-*`) e a causa continua gerando. Sugestão: depois de Q1, rodar o mesmo detector sobre o histórico (dry-run, relatório, `--apply` com backup) para marcar `suspect` retroativamente. #106 padroniza os scripts.
- **Dias abertos antigos**: 541 `price_daily_state` com `closed=false` e dia passado [medido]; já na #15 (piorou de 99). Não repito.

---

## 5. Estatística do indicador de preço

Medidas sobre os últimos 14 dias de `price_daily_state` [medido]:

| Medida | Valor |
|---|---|
| dias `complete` (n ≥ 3) | 12.035 |
| dias `partial` (n = 1 ou 2) | 27.197 (69% dos dias com algum dado) |
| dias `gap` | 1.783 |
| dias complete com exatamente n = 3 | 3.214 (26,7%) |
| média por oferta-dia de n ofertas | 8,7 nos completos |
| razão média/mediana: p50 / p95 | 1,023 / 1,202 |
| dias em que média e mediana divergem >10% | 2.245 (18,7%) |
| dias em que divergem >25% | 405 (3,4%) |
| `composition_flag` verdadeiro | 3.342 (27,8%) dos dias completos |
| dias completos com loja repetida (`n_stores` < `n_offers`) | 1.863 (15,5%), 1,15 ofertas por loja |
| dias com ofertas fora da faixa (`outlier_offers` > 0) | 72 |

### 5.1 Achado E1: a média simples é frágil com poucas ofertas, e quase 70% dos dias nem chegam a n = 3. #14 (média única) e acréscimo

- **Leitura**: a média por oferta-dia com n = 3 a 5 é a estatística mais ruidosa possível: um preço a 2,9x a mediana ainda passa na faixa plausível (teto 3x) e arrasta a média. Em 3,4% dos dias a média está mais de 25% longe da mediana. O desenho já tem o contrapeso certo (mediana oferta-dia gravada, `matched_change_pct`), mas o selo e as comparações usam a média como manchete.
- **Recomendação**: (a) manchete = **mediana oferta-dia** quando n < 5 e **média aparada** (10% de cada ponta) quando n ≥ 5; manter a média simples no detalhe; (b) estreitar o teto da faixa plausível de 3x para 2x da mediana somente para o cálculo da média (a faixa de `outlier` continua para a quarentena); (c) a variação "dia contra dia" mostrada ao usuário deve ser **sempre a do conjunto casado** (`matched_change_pct`), já que a composição domina em 27,8% dos dias; (d) ponderar a loja, não a oferta, quando a mesma loja tem várias ofertas no master (15,5% dos dias). Esforço S para (a) e (c), M para (b) e (d); risco baixo (leitura/exibição; a #14 já planeja paridade em sombra, usar o mesmo mecanismo). **Ordem: 9 a 10.**
- **Não medi**: o efeito de cada alternativa nos vereditos publicados (precisa do `comparar-metricas-sombra.ts` com as variantes). O juízo (`VERDICT_JUDGEMENT_ENABLED`) está desligado, o que reduz o risco.

### 5.2 Janela e viés

- O carry-forward de 48 h (`FRESH_MAX_AGE_MS`) com "oferta viva" evita ressuscitar expiradas, bom. O ponto cego é a Amazon, cuja idade de confirmação p50 é 37 h: o ADR 0010 (frescor por confirmação, teto 24 h) já cobre; com 84,7% das ofertas acima de 24 h a média da Amazon entra pouco. Não é erro de fórmula, é falta de coleta (L1/#81).

---

## 6. Mensageria

### 6.1 Medidas por gatilho (72 h) [medido]

| Gatilho | Criadas | Enviadas | Expiradas | Latência p50 até o envio | p90 |
|---|---|---|---|---|---|
| AC | 16.477 | 1.578 (9,6%) | 13.458 (81,7%) | 87 min | 5,7 h |
| G2 | 11.848 | 2.644 (22,3%) | 8.321 (70,2%) | 6,9 min | 2,0 h |
| N1 | 404 | 42 | 301 | 51 min | 5,5 h |
| CUPOM | 267 | 101 | 139 | 58 min | 2,0 h |
| G3 / G5 / G4 | 124 / 53 / 32 | 52 / 19 / 4 | 66 / 34 / 27 | 9 min / 8 min / 24 s | |
| P1 a P4, OK1, OK2 | ~400 | ~140 | ~250 | 21 a 61 min | |
| **Total** | ~29.600 | ~6.570 (22%) | ~22.600 (76%) | | |

### 6.2 Achado M1: orçamento de geração por canal. #90 (M1/D5); o acréscimo é o número por gatilho

- **Leitura**: AC (alta de confiança) é 56% do volume e envia 9,6%; G2 é 40% do volume e envia 22%. Os dois somam 96% das linhas, então **só dois gatilhos geram o custo** (linhas, o `row_number()` de 6,4 s, CPU de avaliação). Os gatilhos de maior valor para o dono (consoles, 3D, cupom) têm volume pequeno e mediana de espera de 1 h: o AC e o G2 ocupam a vez.
- **Recomendação**: (a) orçamento de geração por canal e por rodada = capacidade de envio da cadência (hoje ~1.440 mensagens/dia por canal), distribuído por prioridade (CUPOM e G2 de alto desconto primeiro, AC no que sobrar), e não regerar proposta expirada sem mudança de preço; (b) o `UPDATE ... SET status='expirada'` em lote só para propostas com mais de 2 h; (c) índice parcial na fila (#90). Esforço M; risco médio (mexe na régua; manter testes de `regua.ts` e `pool-diversidade.ts`). **Ordem: 9 do top 10.**
- **Latência de CUPOM**: mediana caiu de 118 min (auditoria 04) para 58 min nesta janela de 72 h; p90 continua 2 h. O gargalo é a leitura do Chrome e a janela de frescor de 120 min, não o envio.

### 6.3 Dead-letter e retry da mensageria

- Retentativas: máximo 3 por mensagem (`attempts < 3`), `enviando` preso volta a `erro` em 10 min, 429 do Telegram respeita `retry_after`. Falta só o **destino final** visível: mensagens com `erro` (57 no total, 1,0% nas últimas 72 h) não têm painel de "esgotadas" nem alarme; sugerir um contador em `/admin/fluxo` e alarme acima de 5% por hora. S, baixo risco.

---

## 7. Observabilidade, SLOs e testabilidade

| Item | Estado | Sugestão | Esforço |
|---|---|---|---|
| Logs estruturados | `console.log(JSON.stringify(...))` por cron, sem nível nem correlação | campo `run_id` e `job` em toda linha (o `collector_runs.id` já existe); nível `warn/error` | S |
| Métricas | `collector_runs` é o único repositório (bom) | acrescentar `db_ms` por run (tempo em consulta) para separar banco de rede | S |
| Taxonomia de erro | `other`/`network` = 98% (O6) | `db`, `oauth` | S |
| SLO de frescor | `due_total`/`oldest_due` (enganosos, O4) | p90 de idade por rede/vertical + dead-man (#70) | S |
| SLO de mensagens | latência por gatilho já medível (6.1) | p90 de G2 e CUPOM como SLO, alarme se > 30 min | S |
| Registros de ingestão | Amazon fixa `ok` (I2) | derivar de `stats` | S |
| Painel | `/admin/fluxo` | incluir esgotadas, `db` e frescor por vertical | M |
| Suíte e CI | 99 `test-*.ts` (eram 89 há horas), sem agregado nem CI | #91 (já na fila) | M |
| Teste do que mais quebra | há teste do reaper, rodízio, multi-catálogo, estado diário | faltam teste de **timeout** (O1), de **trava por job** (O2) e de **debounce** (Q1) | S cada |

---

## 8. Acoplamento

- `group-rules.ts` tem **2.477 linhas** (2.474 na auditoria 04) e `group-messages.ts` 1.348; `collect-prices.ts` 906, `discover-products.ts` 1.232, `group-queue.ts` 852. A fatia por gatilho é a #109 (P2). Acrescento só a **ordem segura**: (1) teste de caracterização que congele a saída de `evaluateProduct`/`evaluateProductV2Prices` sobre ~200 entradas reais gravadas em JSON (golden file); (2) extrair as funções puras sem estado primeiro (`regua.ts` e `pool-diversidade.ts` já são exemplos do padrão); (3) só então mover por gatilho. Não mexer antes de 27/11.
- Acoplamento coleta e regra de negócio: `collect-prices.ts` importa `evaluateOfferIdentity` e `loadOwnerBlocks` (identidade) e `price-sources`; o corte limpo é um módulo `applySnapshotsToGroup` com interface `{ruleset, repo}` para teste sem banco (a função tem 330 linhas). Esforço L, P2.

---

## 9. Plano de execução sugerido

| Ordem | Item | Esforço | Dono humano? | Fila |
|---|---|---|---|---|
| 1 | O1 timeout e retry com jitter nos 7 pontos do ML; orçamento = teto menos 60 s | S | não | NOVO |
| 2 | O2 trava por job em todos os coletores (`acquireCycleLock(job)`) | S | não | NOVO (+#73) |
| 3 | O3 agendar `collect-shopee?v=esporte` e `?v=outras` | S | sim (agendar) | NOVO |
| 4 | O6 `kind: 'db'` e `'oauth'` no classificador; `meta.erros_ref` | S | não | NOVO |
| 5 | I2 status e erros reais em `amazon-assistida` | S | não | NOVO |
| 6 | Q2 pular quarentena e sombra nos batimentos | S | não | NOVO |
| 7 | Q1 debounce de queda >50% (piloto sem migration: reler no ciclo seguinte) | M | aval (barreira nova) | NOVO |
| 8 | O4 SLO por p90 de idade de confirmação; foco da #88 em eletroeletrônicos | S + M | não | ajusta #88/#20 |
| 9 | O7 lock na renovação do token OAuth do ML; M1 orçamento de geração por canal | S + M | não | NOVO / #90 |
| 10 | E1 manchete por mediana/média aparada e variação sempre casada; I1 esquemas `zod` e versão do payload | S + M | aval (muda o que o público vê) | #14 + NOVO |
| 11 | O5 `next_check_at` com backoff por oferta (depois de medir os itens que mais falham) | M | aval (migration) | NOVO |
| 12 | D-ID1 chave forte (GTIN/MPN) como primeiro critério de junção; refatoração de `group-rules.ts` com golden file | M a L | não | #55, #98, #109 |

Itens 1 a 6 cabem em um dia de trabalho e não exigem migration. Itens 7 a 10 exigem decisão de produto do dono (o que o público vê, barreira nova). Os itens 11 e 12 ficam para depois da Black Friday.

---

## 10. O que não medi (limites)

- **Origem do disparo duplo** do `collect-prices`: medi o efeito (279 de 294 minutos com 2 execuções), não a origem; sem acesso ao painel do Supabase/Vercel.
- **Falhas repetidas por oferta**: o banco guarda só 3 amostras de erro por execução sem o id do catálogo; não sei se os ~6 erros por execução são os mesmos itens (por isso O5 é recomendação condicional).
- **Redundância exata de chamadas ao ML** com o disparo duplo: estimativa por desenho, não contada por chamada.
- **Peso das alternativas de média** (E1) nos vereditos publicados; **efeito dos 122 casos A→B→A** nas mensagens enviadas (a reconferência ao vivo provavelmente os barrou; não cruzei).
- **Corrida do token OAuth** (O7): só leitura de código; sem registro direto de falha.
- **`EXPLAIN`** das consultas pesadas (continua na auditoria 04); **custo em R$** da Vercel/Supabase; **tráfego de páginas**.
- Os números são instantâneos de 2026-11-15 19:00 UTC e mudam a cada ciclo. As amostras de erro cobrem 48 h; as taxas de execução, 72 h; o indicador, 14 dias; os saltos de preço, 3 dias.
