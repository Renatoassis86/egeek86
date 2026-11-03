# Parecer do Cientista de Dados de Monitoramento em Tempo Real: pipeline dos indicadores de preço (2026-11-01)

Conselho Geek, consultivo; decisão de negócio é do responsável. Escopo: estudar COMO OPERAR média única, mediana, mínimo histórico, veredito, ofertas do dia, cotações históricas e contadores como pipeline de dados quase em tempo real, com a regra nova do dono (itens efetivamente separados; só item IDÊNTICO se junta).

Somente leitura: nenhum código editado, nada gravado. As medições novas abaixo foram SELECT em transação READ ONLY via pooler 6543 (script no scratchpad, fora do repositório). Fora do escopo, a pedido: a página de produto local travando.

Legenda: [REAL] medido agora no banco ou lido no código; [HIPÓTESE] inferência a confirmar; [RECOMENDAÇÃO]. Números herdados de outros pareceres levam a fonte.

## 1. Posição

**Apoio com ressalvas.** O desenho certo separa duas velocidades: o PREÇO ATUAL (rápido, barato, sai de `affiliate_offers`, 17 mil linhas) e a LINHA DE BASE estatística (média, mediana, piso, mínimo; lenta, pré-computada, defasagem de até 10 min é inofensiva). O veredito é "preço fresco contra base pré-computada". Hoje as duas coisas são recalculadas juntas sobre 3,25 M de snapshots a cada cache frio; é daí que vêm os 9 a 19 s. As ressalvas: (a) a regra "só item idêntico" exige uma chave de identidade que o catálogo ainda não tem completa (49% dos masters ativos com edição `unknown`); (b) o agregado diário muda a média de 72 produtos em mais de 10% e depende de decisão do dono (ADR 0004); (c) o cron de coleta hoje renova cada oferta a cada 2,4 h, não a cada 15 min como o código declara.

## 2. Leitura da situação (o que o dado mostra)

### 2.1 Achados novos, medidos hoje

| # | Achado | Fonte |
|---|---|---|
| A1 | 94,7% dos snapshots dos últimos 7 dias (197.345 de 208.449) vêm de só 459 ofertas com 20 ou mais linhas na semana, enquanto 9.735 ofertas gravaram algo. A "oscilação de 2 a 7 preços por dia" do ADR 0004 não é cupom: é o defeito de identidade da oferta, que já foi diagnosticado no código (`collect-prices.ts:198-219`, "483 ofertas, 186 mil trocas A-B-A em 7 dias") | [REAL] SQL + código |
| A2 | A correção `collapseBySeller` entrou perto de 2026-10-31 19h (snapshots/hora caem de ~2.800 para 600 a 1.500; ofertas distintas/hora sobem de ~400 para ~1.700 por causa do carimbo de batimento). Até 10-30 eram 27 a 31 mil linhas por dia; em 11-01 até 11h, 6.286 | [REAL] SQL |
| A3 | Daqui para frente o volume é de 1 linha por oferta por dia (batimento de 24 h em `record-price-snapshot.ts:35`) mais 1 por mudança real. Mudanças reais nas últimas 24 h: ~733 (623+81+21+2+4+2 por faixa de magnitude). Estimativa de regime: ~9 mil batimentos + ~0,7 mil mudanças = ~10 mil linhas/dia, ~1,7 MB/dia a 165 B/linha (536 MB / 3,24 M), ~0,6 GB/ano | [REAL] base, [HIPÓTESE] regime |
| A4 | Frescor ML (8.481 ofertas ativas): 3.560 checadas na última hora; idade desde a última checagem p50 73 min, p90 129 min, p99 144 min. Shopee (590 ativas): 100% na última hora, p99 49 min. O código declara 15 min (5 min para observadas) | [REAL] SQL |
| A5 | Por que 2,4 h: `MAX_OFFERS_PER_RUN = 150` conta OFERTAS, mas a chamada de API é por GRUPO (`external_ref`). São 8.481 ofertas em 1.833 grupos (média 4,6 ofertas por chamada; 170 grupos com 10 ou mais). 3.560 ofertas/hora / 150 = ~24 execuções por hora, o dobro das 12 do `*/5` do `vercel.json`. [HIPÓTESE forte]: dois disparadores ativos (Vercel cron e o `pg_cron` citado em `modelo-indicadores.md` 6.1). Em tempo cheio, ciclo = 8.481 / 3.560 = 2,4 h, coerente com p50 = 73 min (metade do ciclo). `cron.job` não existe no banco consultado, então não consegui provar o segundo disparador por SELECT | [REAL] + [HIPÓTESE] |
| A6 | O ciclo lento atrasa a saída do ar: oferta que o vendedor retirou só é expirada quando seu grupo é revisitado (até ~2,4 h) | [REAL] código `collect-prices.ts:424-435` |
| A7 | Expiração é imediata e sem histerese quando o vendedor some da resposta (`:427-435`); o contador de 3 falhas só vale para resposta VAZIA. 5.938 das 7.834 expiradas têm `consecutive_miss_count = 0`, ou seja, saíram por esse caminho. Há reativação automática, então existe vai-e-volta (flapping) [HIPÓTESE] | [REAL] SQL + código |
| A8 | O adaptador do ML não pagina `/products/{id}/items` (lê só `results`). Se a API devolver página parcial, vendedores "somem" e são expirados por engano [HIPÓTESE, medir] | [REAL] código `mercado-livre.ts:33-44` |
| A9 | A oferta guarda `title: masterProduct.name` (o título do produto, não o do anúncio) e NÃO persiste `externalItemId`, condição, nem loja oficial. Logo o sistema não consegue hoje auditar se dois anúncios da oferta são o mesmo item. Identidade da oferta = (produto, rede, vendedor), o que causou A1 | [REAL] código `collect-prices.ts:355-380`, `price-sources.ts:3-13` |
| A10 | Identidade do produto: dos 2.231 masters vivos com oferta ativa, `game_edition_type = 'unknown'` em 1.098 (49%); `manufacturer` preenchido em 0; `gtin` em 0; `meli_catalog_id` em 1.658 (74%). Duplicata por nome normalizado + plataforma: 0 grupos (a dedup atual segura o caso trivial; as duplicatas restantes são as semânticas, como o duplo `catalog_product_id`) | [REAL] SQL |
| A11 | Plataforma `unknown` entre masters com oferta ativa: jogo 209, acessório 160, console 3 (372 de 2.231 = 16,7% na definição ampla, que inclui acessório multiplataforma). Os 180 do guardião usam o recorte da cartela visível | [REAL] SQL |
| A12 | Não há tabela de execução do coletor nem de saúde dos dados (as 78 tabelas públicas não incluem nada do tipo). O coletor devolve `CollectPricesSummary` mas não persiste | [REAL] SQL |
| A13 | Cache de leitura hoje é `unstable_cache` por deploy (DBA 2.2): vazio após cada deploy, e é por isso que a primeira visita paga 30 a 150 s | [REAL] DBA |

Leitura em uma frase: o dado bruto novo já está relativamente limpo (A2, A3); a lentidão vem de ler o histórico legado inteiro a cada cache frio, e a falta de frescor vem de um limite de lote mal calibrado (A5). Ambos têm correção barata.

### 2.2 Divergência registrada com o parecer do DBA

O DBA (seção 2.3) e o ADR 0004 tratam a alternância de preço como causa desconhecida e justificam o agregado diário também por isso. A1 mostra que a causa é conhecida e já corrigida em código (identidade da oferta). Consequência: o agregado diário continua sendo necessário PARA VELOCIDADE e para higienizar o legado (3,25 M linhas, ~95% da semana de legado vinda de 4,7% das ofertas), mas o argumento "o preço oscila de verdade" não deve ir ao dono como fato. Diferente de "cupom" ou "variante", o que existia era leitura de anúncios distintos gravada na mesma oferta, isto é, contaminação por item não idêntico, exatamente o que a regra nova do dono proíbe.

## 3. Resposta ao pedido

### (1) Arquitetura do pipeline

Camadas, com o que é tabela, o que é MV e o que é cache:

```
L0 API oficial (ML Buy Box, Shopee Affiliate)         [fonte; sem scraping]
 -> L1 Coletor (cron + fila por prioridade)           [escreve só mudança + batimento]
 -> L2 Validação de contrato                          [rejeita antes de gravar]
 -> L3 Identidade do item e do produto                [chave canônica]
 -> L4 Bruto append-only: affiliate_price_snapshots  [intocado]
 -> L5 Agregados: affiliate_price_daily -> product_price_stats
 -> L6 Leitura: showcase_snapshot + getPublicMetrics  [um JSON pequeno por visão]
 -> L7 Web: ISR/tag + warm pós-deploy                 [só serve]
```

**L1 Coleta.** Fila por prioridade em vez de FIFO por `last_checked_at`: quente (observadas por usuário, itens das vitrines e de "ofertas do dia", ofertas com mudança de preço nas últimas 24 h), morna (ofertas públicas), fria (resto e expiradas, 1x por dia). O lote passa a ser medido em GRUPOS (chamadas), não ofertas. Um único agendador (resolver A5). Cada execução grava uma linha em `pipeline_run` (início, fim, grupos, chamadas, 429/5xx, escritas, expiradas, duração). Idempotência: já existe o `pg_advisory_xact_lock` por oferta em `record-price-snapshot.ts:42`; falta um lock de execução (`pg_try_advisory_lock` do cron) para tolerar disparo duplo sem trabalho duplicado.

**L2 Validação (antes de gravar).** Contrato por resposta: preço inteiro > 0, moeda BRL, `condition = 'new'` (já filtrado), `item_id` e `seller_id` presentes, `price` coerente com `original_price`. Resposta suspeita (muito menos vendedores que o conhecido, ou preço fora de [piso 35%, teto 3x mediana]) NÃO expira nem grava como preço público: marca e reconfere no próximo tick quente. Esses limites já existem como regra de leitura (`price-verdict.ts`); a novidade é aplicá-los também na ESCRITA de expiração.

**L3 Identidade (o coração da regra nova do dono).** Dois níveis, tratados separadamente:

*Item (anúncio):* a oferta passa a ser (rede, vendedor, `external_item_id`), um anúncio por oferta. `collapseBySeller` deixa de ser necessário como remendo. Cada anúncio ganha `external_item_id`, `listing_title`, `condition`, `official_store`. Isso viabiliza auditar item a item e é a única forma de saber se um anúncio é idêntico ao produto onde está.

*Produto (master):* chave canônica `identity_key = plataforma | tipo(kind) | formato | edição | composição | núcleo normalizado do título`, onde o núcleo remove acento, caixa, pontuação, cláusula de compatibilidade ("para PS5") e ruído de marketing. Resolução em camadas (alinhada ao guardião):

| Camada | O que decide | Cobertura hoje [REAL] | Comportamento em conflito |
|---|---|---|---|
| 1 Âncora estruturada | `meli_catalog_id`, GTIN, categoria da rede | 74% com catalog id; GTIN 0% | conflito estrutura x texto vai à fila |
| 2 Regras ponderadas | lexicos por classe, plataforma, edição, composição | edição conhecida em 51% | confiança alta publica |
| 3 Modelo estatístico (TF-IDF + logística) | só desempate e detector de anomalia; treinado com rótulo humano, não com `product_type` do banco | n/a | nunca decide sozinho |
| 4 Fila de revisão humana | dono ou guardião; decisão vira exemplo e `human_locked` | n/a | fail-closed |

Estado de identidade por oferta, `identity_status`: `confirmed` (chave completa e anúncio consistente), `provisional` (chave incompleta, por exemplo edição `unknown`), `rejected` (anúncio não é o item, por exemplo bundle, usado, edição diferente). **Só `confirmed` entra em média, mediana, mínimo, veredito e contadores.** `provisional` aparece na página e no comparador mas sem selo e sem veredito (cai em "histórico curto"/"identidade em validação"). `rejected` fica no banco, nunca é apagado, e não entra em nenhuma estatística. Isso é fail-closed: na dúvida, separado. O custo é cobertura menor no começo; o ganho é média incontaminada, que é o que o dono pediu.

Garantia no banco: índice único parcial `UNIQUE (identity_key) WHERE merged_into IS NULL AND identity_status = 'confirmed'` impõe "um jogo, uma média" por construção (hoje só `findExistingMasterProduct` impõe, e já falhou no incidente de 176 duplicatas). Esta é decisão de desenho para o DBA validar.

**L4 Bruto.** `affiliate_price_snapshots` continua append-only e intocado. Adicionar apenas colunas aditivas e anuláveis quando necessário (`item_id`), sem reescrever histórico. Histórico legado de oferta contaminada (A1) não é apagado: é marcado como `legacy_ambiguous` em uma tabela de apoio e excluído das estatísticas, ou reduzido pelo agregado diário (ver a seguir).

**L5 Agregados.**

| Objeto | Tipo | Grão | Refresh | Invalidação |
|---|---|---|---|---|
| `affiliate_price_daily` (DBA, 0022 desenhada) | tabela derivada | oferta x dia (São Paulo): último, mín, máx, n_coletas, primeiro/último instante | `refresh_price_daily(hoje)` ao fim de cada execução do coletor (UPSERT só dos offer_ids tocados) e rebuild do dia anterior às 03h | idempotente; qualquer dia pode ser reconstruído do bruto |
| `product_price_stats` | MV com `REFRESH ... CONCURRENTLY` (índice único em `master_product_id`), criada `WITH DATA` | produto | a cada 10 min; só linhas com `identity_status = confirmed` | após refresh, o job chama `revalidateTag('price-stats')` apenas se alguma linha mudou |
| preço público atual por produto | NÃO materializar (54 ms medidos pelo DBA) | produto | leitura direta de `affiliate_offers` | n/a |
| `showcase_snapshot` (Especialista de Preços, opção B) | tabela pequena `payload jsonb`, `computed_at` | visão (seção x tipo x fabricante) | junto com o refresh da MV | substitui por UPSERT; leitor serve o último mesmo se o rebuild falhar |
| contadores (`getPublicMetrics`) | extraídos do mesmo `showcase_snapshot` | global | idem | mesmo `computed_at` em todas as telas, o que fecha o F-15 |
| cache Next | `unstable_cache`/ISR como CAMADA FINA sobre a leitura barata | página | 300 s; `revalidateTag` por evento | o dado frio nunca mais custa 9 a 19 s porque a leitura fria é um SELECT indexado |

Princípio de refresh: **mudança de preço atualiza o "agora" em segundos (UPDATE em `affiliate_offers`), a base muda em minutos**. Veredito = `current_price` fresco contra `avg/median` da MV de até 10 min. Para 2 mil produtos, o erro dessa defasagem na média é desprezível (a média de uma série de dezenas de oferta-dias não se mexe com uma cotação).

**Após deploy:** (i) a leitura fria já é barata (SELECT em `showcase_snapshot`/MV); (ii) rota protegida `/api/cron/warm` (mesmo segredo dos crons) acionada por webhook de deploy da Vercel e por `vercel.json` a cada 10 min, que chama as leituras de `/`, `/ofertas`, `/tabela-de-precos`, `/sobre` e as primeiras páginas; (iii) o `warm` loga latência e falha (alerta se > 3 s). Esta é a recomendação do DBA, que endosso, com a diferença de ordem em 6.

**Mediana e mínimo.** Mediana (`percentile_cont(.5)`) calculada sobre a cotação diária limpa, uma definição só (`medianSql`). Mínimo histórico lê o `price_min` diário (não perde preço real intradiário) e o piso de plausibilidade; preserva a decisão de ADR 0004 item 3. Veredito segue a média (modelo 9.1); a mediana só confirma nas seções (Especialista de Preços 3.1).

### (2) Detecção de mudança, saída do ar e latência-alvo

**Mudança de preço.** Já é "escrever só quando muda" com batimento de 24 h (`record-price-snapshot.ts`), e `last_price_change_at`/`previous_price_cents` são gravados no mesmo `UPDATE`. Falta o que o "Oferta do dia" precisa: persistência (novo preço visto em 2 ou mais coletas com 1 h ou mais entre elas) e anti-oscilação, que o Especialista de Preços já especificou. Eu acrescento o gatilho de confirmação rápida: queda de 20% ou mais, ou preço fora da faixa plausível, sobe a oferta para a fila quente com reconsulta no próximo tick (5 min), sem esperar o ciclo; só depois da confirmação o preço entra em vitrine. Para monitor (não para gate), usar EWMA/CUSUM sobre o log-preço por produto: alerta de produto cuja mediana diária caiu mais de 2 desvios robustos (MAD) em 3 dias. O gate de preço continua sendo o piso 35% e o teto 3x da mediana, que já estão em produção.

**Oferta que sai do ar/estoque.** A API oficial não informa estoque; "sair do ar" = o vendedor não aparece na resposta do Buy Box (ou o item muda de status). Regras propostas:
1. Histerese: omissão em 2 coletas consecutivas do mesmo grupo (coluna `missing_since` ou reuso de `consecutive_miss_count` também para omissão de vendedor), a não ser que o grupo seja quente (então 2 ticks de 5 min, ou seja ~10 min).
2. Disjuntor por grupo: se o grupo tinha 4 ou mais vendedores ativos e a resposta traz menos de metade, tratar como resposta parcial; não expira ninguém, reconsulta no próximo tick (A8).
3. Disjuntor por execução: se uma execução expiraria mais de 5% das ofertas que checou, aborta a expiração e alerta.
4. Paginação de `/products/{id}/items`: verificar na documentação oficial do ML o limite por página e paginar, se houver.
5. Concorrência real (regra do dono): quando a mais barata sai, "preço atual" vira a próxima ativa pública automaticamente; já é assim (modelo 7.5), e a latência da reação passa a ser a da histerese.
6. Rótulo na UI: "disponível na última coleta (há X h)", nunca "em estoque".

**Latências-alvo (p95, ponta a ponta), tier quente / morno / frio.**

| Etapa | Quente | Morno | Frio | Hoje [REAL] |
|---|---|---|---|---|
| Intervalo de coleta do grupo | 10 min | 30 min | 2 h (expiradas 24 h) | ML p50 73 min, p99 144 min; Shopee p99 49 min |
| Chamada API + validação + gravação (por grupo) | 2 s | 2 s | 2 s | não medido (sem `pipeline_run`) |
| Mudança de preço gravada em `affiliate_offers` | intervalo + 10 s | idem | idem | idem |
| Base estatística (MV) | 10 min | 10 min | 10 min | recalculada a cada cache frio |
| Página reflete (tag + ISR) | 5 min | 5 min | 5 min | 300 s a 600 s mais cold start |
| **Preço mudou na loja -> site** | **≤ 25 min** | **≤ 45 min** | **≤ 2,2 h** | 2,4 h |
| **Vendedor saiu -> sai de "preço atual"** | **≤ 25 min** | **≤ 65 min** | **≤ 4,2 h** | ~2,4 h a 7 h (3 ciclos para resposta vazia) |

**Orçamento de chamadas** (ML, 1.833 grupos; cota oficial NÃO medida, ver 5).
- Hoje: ~24 execuções/h x ~33 grupos (150 ofertas / 4,6) ≈ 790 chamadas/h ≈ 0,22/s [HIPÓTESE sobre o número de grupos por execução].
- Alvo em camadas: quente 200 grupos a cada 10 min = 1.200/h; morna 900 grupos a cada 30 min = 1.800/h; fria 733 grupos a cada 2 h = 367/h. Total ≈ 3.370 chamadas/h ≈ 0,94/s, cerca de 4x o consumo atual. Por referência, uma política plana de 15 min custaria 7.332/h (2,0/s); a em camadas custa menos da metade e dá o frescor onde o usuário olha.
- Adaptativo: tratar 429 com `Retry-After`/backoff exponencial com jitter; se a taxa de 429 passar de 1% em 15 min, o orçador reduz o tier frio primeiro, depois o morno, nunca o quente.
- Cabe em 200 s (`maxDuration` da rota)? Com concorrência 4 e ~1 s/chamada, 150 grupos levam ~40 s. [HIPÓTESE]: medir a latência real por chamada em `pipeline_run` antes de aumentar o lote.
- Shopee: 590 ativas a cada 30 min, `maxOffers 600`, 3 em paralelo, para em 10 erros seguidos; já tem disjuntor e fica como está. Expiradas a cada 24 h gastam cota (3.574 expiradas); reduzir para semanal se a taxa de reativação for baixa [medir].

### (3) Qualidade de dado: invariantes, testes, monitores, SLOs, painel

**Invariantes (SELECT, rodam a cada 10 min no job de qualidade e em CI contra dado de teste de contrato; cada violação vira linha em `pipeline_health`).**

| ID | Invariante | Gravidade |
|---|---|---|
| I1 | Nenhum `master_product` vivo com `identity_key` repetido entre `confirmed` | crítica |
| I2 | `affiliate_offers.current_price_cents` = último snapshot da oferta (exceto sentinel 0) | crítica |
| I3 | Toda oferta ativa com preço > 0 tem >= 1 snapshot | crítica |
| I4 | Nenhum preço público < 35% da mediana nem > 3x a mediana do produto | alta |
| I5 | `snapshots do dia por oferta <= 2 + mudanças reais` (detecta volta da oscilação A-B-A) | alta |
| I6 | `last_checked_at` de oferta pública <= 3x o intervalo do seu tier | alta |
| I7 | soma dos buckets de tipo = `products`; soma dos buckets de fabricante + "sem plataforma" = `products` (Especialista de Preços 3.5) | alta |
| I8 | todas as telas leem o mesmo `computed_at` no instante da medição | alta |
| I9 | `affiliate_price_daily` reconcilia com o bruto: contagem de dias e `MIN(price)` iguais por amostra aleatória de 200 ofertas | alta |
| I10 | `product_price_stats.computed_at` <= 15 min | média |
| I11 | nenhum `master` `confirmed` com `edition = unknown` ou `platform = unknown` | média |
| I12 | `master.product_type` igual ao tipo efetivo da cartela em `confirmed` (hoje 22% divergem) | média |
| I13 | nenhuma oferta `confirmed` com `item_id` nulo (depois da migração) | média |
| I14 | expiradas por execução <= 5% das checadas | média |

**Testes automáticos.** (a) Unitários sobre as funções puras: `computeVerdict`, mediana, piso/teto, chave de identidade (casos reais do guardião como regressão: Stand Mesa Base, Memory Card PS2, Halo combo, Gran Turismo 110GB), reputação de vendedor. (b) Teste de contrato do adaptador com resposta gravada de verdade da API (fixture capturada, nunca sintética): cobre campo faltando, preço 0, `condition` usado, paginação. (c) Teste de idempotência: aplicar a mesma resposta duas vezes e em paralelo gera 1 snapshot. (d) Teste de consistência entre telas: chama as 5 leituras e compara com `getPublicMetrics()` no mesmo `computed_at`. (e) Reconciliação diário/bruto (I9) na CI noturna. Em QA, o relatório de vazamento do guardião entra no `checklist-publicacao`.

**Monitores (cada um com limiar e ação).**

| Monitor | Medida | Alerta | Ação |
|---|---|---|---|
| Frescor | idade p95 de `last_checked_at` por rede e tier | p95 > 2x o alvo por 15 min | verificar cron e cota |
| Coleta parada | execuções/h e `pipeline_run` mais recente | nenhuma execução em 15 min | pager |
| Volume por loja | ofertas ativas, checadas/h e preços gravados/h por rede | queda > 30% vs mesma hora de 7 dias antes | investigar API |
| Queda brusca de contagem de ofertas | `ativas(t) / ativas(t-1h)` por rede e por produto | rede < 0,9; produto com >= 4 vendedores indo a 0 | disjuntor, reconsulta |
| Saltos de preço | mudanças com razão < 0,5 ou > 2 no dia, por rede | > 20 por dia ou 3x a média móvel de 14 dias | revisar piso/teto |
| Oscilação | ofertas com 3 ou mais mudanças no dia (A-B-A) | > 10 por dia | auditar identidade do item |
| Deriva de classificação | `% divergência tipo gravado x efetivo`, `% unknown` por plataforma, `% sem edição` | subir > 1 ponto em 7 dias, ou > meta (2% vazamento) | revisar fila |
| Deriva de preço do modelo | produtos cujo veredito mudou de faixa sem mudança de preço atual (efeito de recalcular base) | > 1% dos elegíveis num refresh | congelar publicação da base nova |
| Custo | linhas de bruto/dia, tamanho do banco, chamadas de API/h | bruto > 20 mil/dia ou banco > 70% do plano | agregar/arquivar com aprovação |
| Cota | 429/h e `Retry-After` | > 1% | encolher tier frio |
| Página | latência p95 de servidor das 4 rotas e primeira visita pós-deploy | > 3 s | rodar `warm` |

**SLOs propostos [RECOMENDAÇÃO, o dono confirma].**

| SLO | Meta | Janela |
|---|---|---|
| Frescor: ofertas públicas quentes com última checagem <= 25 min | 99% | 30 dias |
| Frescor: ofertas públicas mornas <= 65 min | 99% | 30 dias |
| Disponibilidade da coleta (execução concluída com sucesso a cada 5 min) | 99,5% | 30 dias |
| Consistência: 0 divergência entre telas para o mesmo `computed_at` | 100% das verificações | contínuo |
| Leitura fria (qualquer tela) no servidor | p95 < 1,5 s | 7 dias |
| Primeira visita pós-deploy | p95 < 3 s e 100% dos deploys aquecidos | por deploy |
| Contaminação: `rejected`/`provisional` dentro de estatística | 0 | contínuo |

Orçamento de erro: 0,5% de execuções falhas por mês (216 ticks de 43.200) congela mudanças de coleta e dispara revisão.

**Alertas.** Canal único (Telegram já existe na stack: tabela `telegram_link_tokens` [REAL]; canal a confirmar com `integrador-apis`) com três severidades: pager (coleta parada, I1/I2/I3 violados, banco > 85%), diário (monitores de volume, deriva), semanal (relatório de qualidade + fila de revisão). Alerta sem dono nem ação não existe.

**Painel mínimo `/admin/saude-dados`** (uma página, só leitura, 8 tiles, alimentada por `pipeline_run` e `pipeline_health`): (1) última execução do coletor e idade; (2) frescor p50/p95 por rede e tier; (3) execuções/h e erros/429; (4) ofertas ativas por rede e variação 1 h; (5) violações de invariante abertas (lista); (6) saltos de preço e oscilações do dia; (7) deriva de classificação (unknown, divergência, fila de revisão); (8) idade do `computed_at` do showcase/MV e custo (linhas/dia, GB). Cada tile mostra o limiar e fica vermelho/âmbar/verde.

### (4) Aplicar tipo, plataforma e fabricante sem reprocessar tudo

Fatos [REAL]: o catálogo vivo com oferta ativa tem 2.231 masters; classificar a cartela inteira em memória custa segundos. O que custa é o que vem depois: mudar plataforma ou tipo pode mudar a chave de identidade, fundir masters e mover cotações entre produtos, mudando média e veredito. Por isso a unidade incremental é o MASTER TOCADO, e o recálculo downstream é só dele.

1. **Fabricante não precisa de backfill.** Derivar de `platform` por tabela fixa (`switch_1|switch_2|wii...` = Nintendo etc., a taxonomia do guardião). `manufacturer` hoje está vazio em 100% e nenhum código o usa [REAL]. Se `platform` está certa, fabricante é uma função, não um dado a reprocessar; só plataforma `unknown` fica sem família. Isso elimina um terço do pedido.
2. **Job incremental com cursor e versão.** Seleciona "sujos": `classified_at IS NULL`, `classifier_version < atual`, título mudou, `identity_status = provisional`, ou criado desde o último lote. Lotes de 200 masters por `id` com cursor persistido.
3. **Cada lote:** (a) dry-run que gera diff `{master, campo, antigo, novo, camada, confiança, evidência}`; (b) a própria tabela `catalog_reclassification_log` já grava o valor antigo e é o backup por id (somado a um dump CSV das colunas afetadas antes do lote); (c) aplica em UMA transação, só alta confiança (>= 0,90) e nunca `human_locked`; (d) antes de mudar plataforma/tipo roda `findExistingMasterProduct` com a chave nova: se bater, NÃO funde sozinho, vai para a fila de fusão com pré-visualização de impacto na média; (e) enfileira o master tocado em `stats_dirty` (a MV de 10 min já cobre; para visão imediata, `refresh` incremental do dia) ; (f) roda os invariantes I1, I11, I12 sobre o lote; (g) se qualquer invariante crítico falhar, reverte o lote.
4. **Reversível:** `rollback --batch <id>` lê o log e restaura valor antigo; fusão desfaz-se limpando `mergedInto` (padrão existente), sem apagar nada.
5. **Ordem dos lotes:** 12 console>accessory de alta confiança (piloto) -> os 464 com `product_type` contradito pela cartela -> os 180 com plataforma `unknown` (6 resgatáveis por `readPlatform`, 75 legados que dependem do enum, 99 sem pista que vão à revisão humana) -> preenchimento de edição para os 1.098 `unknown` (parte pela regra, o resto pela fila).
6. **Novos itens:** a descoberta chama a mesma função antes de inserir e o item sem confiança nasce `provisional`, jamais com o DEFAULT `game`. Remover o DEFAULT em migration posterior (guardião 4.11).
7. **Enum de plataforma:** `ADD VALUE` é irreversível; migration própria revisada pelo DBA. Enquanto isso, `attributes.legacyPlatform` (alternativa do guardião).

### (5) Custo, benefício e riscos

| Item | Custo | Benefício | Fonte |
|---|---|---|---|
| Agregado diário + MV | ~10 a 20 MB (110 dias); +~1 MB/dia (DBA); consultas de 3,25 M para 67 mil linhas | 9, 18,7 e 8 s caem para menos de 300 ms (meta, a medir) | DBA [REAL]/[HIPÓTESE] |
| `showcase_snapshot` + leitura única | tabela de poucos KB; 1 varredura em vez de 5 a 8 | filtros por URL sem consulta nova | Especialista de Preços |
| Reaquecimento pós-deploy | 1 rota, ~4 fetches por deploy e a cada 10 min | primeira visita de 30 a 150 s para < 3 s | DBA |
| Mais chamadas ao ML | ~4x o consumo atual (0,22 para 0,94/s) | frescor de 2,4 h para 10 a 30 min onde importa | cálculo acima, [HIPÓTESE] |
| Identidade confirmada + `item_id` | migration aditiva, backfill gradual, fila de revisão | média incontaminada, fim da A-B-A | A1, A9 |
| `pipeline_run`/`pipeline_health` | ~dezenas de milhares de linhas/ano | observabilidade, alertas, SLO | A12 |

Riscos e como detectar:

1. **Supabase pooler transação (6543, `prepare:false`, `max:10`).** O `SET LOCAL work_mem` só vale dentro de transação; não depender de ajuste por sessão. Refresh de MV e backfill em lotes pequenos e fora do pico do cron; `REFRESH ... CONCURRENTLY` exige índice único e MV já populada. Detecção: `pg_stat_activity` e duração de `pipeline_run`. O `max` do cliente de coleta é pequeno (comentário diz "pool max:1/5" em alguns trechos e `max:10` em `src/lib/db/index.ts`; inconsistência a confirmar com o DBA).
2. **Tamanho do banco.** Hoje 536 MB de snapshots (índices: 223 MB + 70 MB + 24 kB BRIN) e regime de +0,6 GB/ano (A3). O limite do plano Supabase não foi consultado: [dado que falta]. Retenção/particionamento do bruto só depois de a leitura migrar, e por decisão do dono (histórico não se apaga).
3. **Vercel.** `maxDuration` 200 s da rota de coleta; limite de crons do plano; ISR e `revalidateTag` custam invocações. Disparar dois agendadores (A5) já gasta o dobro. Detecção: duração e erros por execução, fatura de funções.
4. **Mudança semântica da média** (ADR 0004; 382 produtos > 2%, 72 > 10% segundo o DBA, e o estatístico mede menos no Switch 2). Rodar em sombra 7 dias, relatório assinado pelo Estatístico antes de ligar. Divergência registrada: DBA mede +12,4% no Switch 2 com "último do dia" (que, em minha leitura, vem da contaminação A1); o estatístico mede -0,05% com outro método; devem reconciliar lado a lado.
5. **Fail-closed reduz cobertura.** Marcar `provisional` os 49% sem edição pode esvaziar vitrines e selos no começo. Mitigação: começar com a edição derivada por regra, medir a cobertura antes de ligar a exclusão, e comunicar o número ao dono.
6. **Cota da API desconhecida.** Subir 4x o consumo sem medir pode gerar 429 e bloquear a coleta. Mitigação: subida gradual por tier, com o orçador adaptativo.
7. **Falsa expiração em massa** (A7, A8). Disjuntores por grupo e por execução; reativação automática já existe.
8. **Regra inegociável.** O agregado diário muda o significado de "cotação" no `AGENTS.md`: exige emenda do dono. Enquanto isso, a contagem pública segue contando snapshots brutos (ADR 0004 Decisão).

### (6) PLANO DE EXECUÇÃO (ordem por ganho de confiabilidade e velocidade)

Esforço: P = até 0,5 dia; M = 1 a 2 dias; G = 3 a 5 dias; (estimativas de engenharia, hipóteses).

**Trilha A: só código, sem gravar no banco (começa já)**

| # | Item | Esforço | Depende de | Pronto quando | Métrica |
|---|---|---|---|---|---|
| A1 | Confirmar e eliminar o disparo duplo (Vercel cron x `pg_cron`), um agendador só; `pg_try_advisory_lock` por execução. Só desligar o segundo junto com A2 | P | acesso ao painel Supabase/Vercel | uma única fonte de disparo documentada; execuções/h = 12 | execuções/h; ofertas checadas/h cai de 3.560 para o esperado de 1 agendador (então A2 é obrigatório) |
| A2 | Lote por GRUPOS (ex.: 150 grupos), não por ofertas; ordenação por tier | M | A1 | frescor ML p95 <= 65 min em 24 h | idade p95 de `last_checked_at` (hoje p90 129 min) |
| A3 | Registrar cada execução (`pipeline_run`) em log estruturado (sem tabela nova ainda) e medir latência por chamada, 429 e duração | P | nada | 7 dias de log com p50/p95 por chamada | duração de execução, % 429 |
| A4 | Disjuntor de expiração (resposta parcial, > 5% por execução) e histerese de 2 omissões | M | A3 | teste de contrato com fixture real; 0 expiração em massa em simulação sobre fixture | expiradas/h, reativações/h |
| A5 | Paginação do Buy Box (após ler doc oficial) | P | doc ML | adaptador cobre `paging.total` | vendedores por grupo antes/depois |
| A6 | `getPublicMetrics` e prateleiras a partir de UMA varredura (`getShowcaseSnapshot`), tipo efetivo único | M | Especialista de Preços, Guardião | invariantes I7, I8 passam | divergência entre telas = 0 |
| A7 | Rota `/api/cron/warm` + `revalidateTag` por evento no fim da coleta | P | A6 | cada deploy aquece as 4 rotas; log de warm | primeira visita p95 |
| A8 | Testes: idempotência, contrato (fixtures reais), consistência entre telas, casos reais de classificação | M | A6 | CI verde | cobertura dos invariantes |
| A9 | Job de qualidade só de leitura (I1 a I14) gravando em log; página `/admin/saude-dados` v1 lendo direto do banco | M | A3 | 8 tiles funcionando | tempo para detectar coleta parada < 15 min |
| A10 | Relatório de vazamento e de deriva (evolução de `audit-segmentacao.ts`), SELECT-only | P | Guardião | CSV por rodada | % divergência tipo, % unknown |

**Trilha B: grava no banco, COM backup, log e aprovação (migrations aditivas e reversíveis)**

| # | Item | Esforço | Depende de | Pronto quando | Métrica |
|---|---|---|---|---|---|
| B1 | `affiliate_price_daily` + `refresh_price_daily` + backfill por dia fora do pico, em sombra | M | DBA, backup de `affiliate_price_snapshots` (dump dos 536 MB ou das linhas afetadas), rollback `0022` | reconciliação I9 = 100% em amostra | linhas ~67 mil; tempo de backfill |
| B2 | `product_price_stats` (MV `CONCURRENTLY`) em sombra por 7 dias lado a lado com o cálculo atual | M | B1 | relatório de diferença por produto assinado pelo Estatístico | 382/72 produtos comparados; latência < 300 ms |
| B3 | `pipeline_run` e `pipeline_health` (tabelas pequenas) | P | A3, A9 | painel lendo as tabelas | SLO de coleta calculável |
| B4 | Índice parcial `affiliate_offers (master_product_id) WHERE status='active'` com `CREATE INDEX CONCURRENTLY` | P | DBA | `EXPLAIN` mostra uso | tempo da CTE de oferta pública |
| B5 | `showcase_snapshot` (opção B) preenchida junto da MV | M | A6, B2 | leitura fria < 300 ms | p95 de servidor por rota |
| B6 | Colunas aditivas na oferta: `external_item_id`, `listing_title`, `condition`, `identity_status`; coletor passa a persistir; backfill gradual | G | DBA, A4 | 100% das ofertas novas com `item_id`; legado em backfill | % ofertas com `item_id` |
| B7 | `identity_key` + `identity_status` em master, `catalog_reclassification_log`, job incremental de lotes (seção 4) com piloto de 12 itens | G | Guardião, DBA, B6 | piloto reversível testado (aplicar e desfazer) | divergência tipo (22% para <= 2%), unknown (<= 3%) |
| B8 | Índice único parcial por `identity_key` entre `confirmed` | P | B7 | I1 garantido por constraint | duplicatas = 0 |
| B9 | Migração de leituras (tabela, abas, home, contadores) da CTE para a MV | M | B2, B5, decisão D1 | tela fria < 1,5 s | tempo e linhas lidas (<= 100 mil) |
| B10 | Reidentificação do legado contaminado (A1): marcar oferta/dia ambíguos em tabela de apoio, sem apagar | M | B6, decisão D3 | estatística de produto exclui o ambíguo | dispersão e % produtos afetados |

**Trilha C: precisa de decisão do dono**

| # | Decisão | Quem recomenda | Por que bloqueia |
|---|---|---|---|
| D1 | Aprovar ADR 0004 (cotação por oferta por dia), regra do dia (último, mediana ou mínimo) e fuso; emenda no `AGENTS.md` | Estatístico + DBA + este parecer | muda média de 72 produtos em mais de 10% e o texto da regra inegociável |
| D2 | Política fail-closed: `provisional` e `rejected` fora das estatísticas | Guardião + este parecer | reduz cobertura no curto prazo |
| D3 | Tratamento do legado A-B-A: aceitar marcar como ambíguo e excluir das estatísticas (histórico preservado) | Estatístico | altera números históricos exibidos |
| D4 | Retro, PC, combos jogo+brinde e jogo+hardware: entram na cartela? | Gamer Veterano + Guardião | define o `kind` e a composição |
| D5 | Frescor máximo para oferta pública (hoje 7 dias, ADR 0002): sugiro 3x o intervalo do tier após A2 (cerca de 3 h) | Especialista de Preços | muda quantas ofertas aparecem |
| D6 | Orçamento de API (subir ~4x as chamadas) e confirmação da cota oficial do ML | Integrador de APIs | risco de 429 |
| D7 | Plano de retenção do bruto (arquivar/partir por mês) | DBA | só depois de B9; nunca apagar |
| D8 | Canal de alerta (Telegram) e quem recebe | dono | operação |

Ordem sugerida de execução: **A1, A3, A2, A4, A5** (dias 1 a 3: coleta correta e fresca, risco quase nulo, ganho imediato de frescor) -> **A6, A7, B4** (dias 3 a 5: velocidade de leitura e primeira visita sem custo de banco novo) -> **B1, B2 em sombra** (semana 2; decisão D1 em paralelo) -> **A8, A9, B3** (semana 2: testes, qualidade e painel) -> **B5, B9** (semana 3, após D1) -> **B6, B7, B8, B10** (semanas 3 a 5, dependem de D2, D3, D4). A trilha de identidade (B6 a B8) é a mais longa e a mais importante para a regra do dono, mas a trilha de velocidade e frescor (A1 a A7) entrega valor sem esperá-la.

## 4. Riscos principais (resumo)

1. Dois agendadores ativos (A5) mascaram o diagnóstico de frescor: se o dono corrigir para um só sem A2, o ciclo piora de 2,4 h para ~4,7 h. Ordem obrigatória: A2 e A1 entram no mesmo deploy.
2. Fail-closed de identidade reduz vitrines no começo; precisa de decisão e de medição de cobertura antes.
3. Subir a coleta 4x sem saber a cota do ML. Subida gradual e orçador adaptativo.
4. Média mudando de valor visível ao público quando B2 for ligada.
5. Estimativas de esforço e de custo são hipóteses; a latência real por chamada ainda não foi medida.

## 5. Dado que falta (todos por SELECT ou log, sem escrita)

1. Cota oficial e limites de paginação de `/products/{id}/items` do Mercado Livre (doc oficial; Integrador de APIs).
2. Quantos disparadores estão ativos hoje (painel Vercel e Supabase); `cron.job` não está acessível por esta conexão.
3. Latência real por chamada e duração por execução (A3).
4. Quantos produtos mudariam de faixa de veredito com a MV em sombra (B2).
5. Taxa de flapping de expiração/reativação por semana (precisa de `pipeline_run` ou `status` histórico).
6. Quantas ofertas `confirmed` teríamos na prática (chave completa) com as regras atuais, antes de ligar D2.
7. Limite de tamanho do plano Supabase e do plano Vercel (crons e `maxDuration`).
8. Se `analytics_events` (1.049 linhas) tem sinal suficiente de clique para definir o tier quente além de watches (apenas 16 masters observados [REAL]).

## 6. Métricas de sucesso

- Frescor ML: p95 de idade de `last_checked_at` de 144 min para <= 65 min (A2) e, nas ofertas quentes, <= 25 min.
- Latência de leitura: consultas de 9, 18,7 e 8 s para < 300 ms; primeira visita pós-deploy de 30 a 150 s para < 3 s; tela fria < 1,5 s.
- Volume: <= 12 mil linhas/dia no bruto; leituras estatísticas <= 100 mil linhas; `temp written` = 0.
- Identidade: 0 duplicata `confirmed`; divergência de tipo de 22% para <= 2%; `unknown` de plataforma <= 3% dos visíveis; 100% das ofertas novas com `item_id`.
- Consistência: 0 divergência entre telas no mesmo `computed_at`.
- Operação: coleta parada detectada em < 15 min; 0 expiração em massa; SLOs da seção 3 cumpridos por 30 dias.

## Dependências e divergências declaradas

- DBA: desenho do agregado, MV, constraint de identidade, índices e backup. Divergência: eu atribuo a alternância de preço ao defeito de identidade da oferta (A1), não a variação legítima.
- Estatístico e Matemático: regra do dia, MAD/CUSUM nos monitores, relatório de diferença da média.
- Guardião de Catálogo: chave de identidade, camadas, fila, lotes; concordo com o desenho e acrescento o estado `confirmed/provisional/rejected` por oferta e a regra "só `confirmed` entra em estatística".
- Especialista de Preços: seções da vitrine; concordo com persistência e anti-oscilação, que dependem da coleta correta (A1 a A4).
- Integrador de APIs: cota e paginação do ML; canal de alerta.
- Backend e Performance Web: lote por grupo, lock de execução, ISR/tag, rota de warm.
- Divergência de dado: o DBA conta 180 plataformas `unknown` na cartela visível; minha contagem ampla (todos os masters com oferta ativa, inclusive acessórios) dá 372. Recortes diferentes, não conflito.
