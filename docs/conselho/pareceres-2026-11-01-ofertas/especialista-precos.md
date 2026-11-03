# Parecer do Especialista em Inteligência e Comparação de Preços: Vitrine /ofertas segmentada (2026-11-01)

Legenda: [REAL] = lido no código ou medido por outro parecer; [HIPÓTESE] = inferência a confirmar; [RECOMENDAÇÃO]. Nada foi editado nem gravado. Não consultei o banco nesta rodada: toda cifra de volume vem de `docs/conselho/pareceres-2026-11-01/dba-postgres.md`.

## 1. Posição

**Apoio com ressalvas.** A vitrine segmentada é boa para o negócio e cabe no modelo vigente, desde que (a) as seções sejam subconjuntos estritos do que a tabela de preços já considera "abaixo do normal" e "menor registrado", (b) nasçam de UMA varredura do catálogo, não de 5 a 8 consultas novas, e (c) PC e retrô só entrem depois que o catálogo souber o que são (hoje não sabe). Nenhuma regra de `AGENTS.md` é violada pelo desenho abaixo; a Contra vale para qualquer implementação que preencha seção vazia com item sem histórico elegível.

## 2. Leitura da situação (o que existe hoje)

[REAL] `src/app/(shop)/ofertas/page.tsx`:
- `:99-102` carrega `listRankedOffers({limit: 200})` ordenado por PREÇO ASCENDENTE (`:87`, `sortBy` padrão `price_asc`; ordenação em `affiliate.ts:254`). Todas as prateleiras (`:128-144`, fatiadas em 8 por `:204/:217/:230/:243`) saem desses 200 mais baratos do catálogo. É viés de seleção: um console de R$ 3.000 com 20% de queda real nunca entra no pool; barato domina por construção. O próprio comentário `:113-127` já reconhece o sintoma.
- `:128-130` "No Menor Preço Histórico" = `isLowestEver` dentro da amostra de 200, ordenado por `avgDiscountPercent`. O hero (`:161`) mostra `publicMetrics.lowestEverCount` do catálogo inteiro e a prateleira mostra até 8 de uma amostra: números de escopos diferentes na mesma tela.
- `:186-187` "Tá Vendendo Muito ... mais procuradas e populares": o ranking (`affiliate.ts:1176-1179`) não tem sinal algum de venda ou clique. Rótulo que afirma o que o dado não mede.
- `affiliate.ts:1138-1161` (`rankFeaturedOfferIds`): o pool de 60 candidatos é pré-ordenado pela queda `previous_price_cents -> atual` da oferta, depois reranqueado por estatística. Produto no menor preço há semanas (sem mudança recente) nunca disputa vaga.
- `affiliate.ts:241-250` deduplica por `master_product_id` (bom), mas não filtra `NOT (mp.attributes ? 'mergedInto')`, que `price-table.ts:188` filtra. [HIPÓTESE] pode haver master mesclado na vitrine; verificar `catalogDimensionFilter`.
- `price-history.ts:586-673` (`getTopMovers`, "maiores quedas"): usa `status='active'` (`:615`), NÃO `publicOffersCtes` (ADR 0002), sem elegibilidade, sem filtro de vendedor fraco, e a base (`:633-637`) é o MENOR baseline entre ofertas, então uma isca barata no passado vira "queda de X%" falsa. Não pode alimentar a vitrine como está.
- `getMasterProductPriceHistory` (`price-history.ts:274`) é legado (ILIKE por nome, só ofertas ativas, modelo-indicadores 7.8): não usar em grade.

[REAL] O que já está pronto e deve ser reutilizado: a CTE `combined` de `price-table.ts:98-180`. Por produto (1 oferta pública mais barata, `:111-133`) ela já entrega: `avg_price_cents`, `min_price_cents`, `max_price_cents`, `quote_count`, `history_days`, `eligible`, `low_confidence`, `seller_weak`, `pf_median`, `discount_percent_raw` (`:153-158`, só `below`, elegível, sem baixa confiança) e `low_badge_ok` (`:162-176`, com vendedor fraco, dispersão e zona de suspeita já tratados). A mediana limpa existe em `product_stats.median_cents` (`product-price-stats.ts:129,141`) mas `base` (`price-table.ts:137-148`) não a seleciona. Faltam só `median_cents`, `previous_price_cents` e `last_price_change_at` da oferta.

[REAL, DBA] Custo: `combined` roda 2x por consulta da tabela (`price-table.ts:250-262`, ~8 s cada frio) e uma 3ª vez nos contadores (`:338-364`); cache da tabela é por combinação de filtro (`:316`, 60 s), então cada filtro novo é cache frio. A home pós-deploy leva 22-38 s. O histórico real cobre só 110 dias (2026-07-13 a 2026-11-01), 3,25 M de snapshots.

[REAL] Catálogo: o enum `game_platform_gen` (`_enums.ts:248-257`) tem switch_1, switch_2, ps4, ps5, xbox_one, xbox_series, xbox_360, unknown. NÃO existe PC nem retrô. `master_products.manufacturer` existe (`schema/master_products.ts:37`) mas nenhum código em `src/` o escreve ou lê (busca feita). `unknown` hoje mistura PS3, Wii, 3DS, SNES e PC. `CLONE_RE` (`dimensions.ts:345`) exclui "retro game/console" genérico (clones), correto.

## 3. Resposta aos seis pontos

### 3.1 Critério de entrada (todas as seções partem de: oferta pública ADR 0002, produto não mesclado, na cartela, vendedor `sellerTier != low`, uma linha por `master_product_id` = a oferta pública mais barata)

**Abaixo do preço normal** (estado, sem janela de tempo): `eligible` (>= 5 cotações e >= 14 dias), `NOT low_confidence`, veredito `below` (preço atual < média única x 0,95) E preço atual < mediana limpa x 0,95. A confirmação pela mediana protege contra média puxada por cauda. É subconjunto do veredito único (`computeVerdict`), nunca contradiz a tabela. [RECOMENDAÇÃO] O N exibido ("N produtos abaixo do normal") é o `COUNT(discount_percent_raw IS NOT NULL)` da mesma varredura, que sem filtro é igual a `getPublicMetrics().belowAverageCount` (`public-metrics.ts:62`); o corte por vendedor fraco e mediana só reduz o que é MOSTRADO ("mostrando 8 de N").

**Cotação histórica** (estado, sem janela): três blocos, nesta ordem.
1. "No menor preço já registrado": `low_badge_ok` (selo existente) e `offerActive` (a oferta é a pública atual, logo ativa). Mantém piso 35%, teto, vendedor fraco fora, zona de suspeita com corroboração de 2 vendedores.
2. "Maiores quedas": NÃO usar `getTopMovers`. Queda = preço atual vs preço de referência ESTÁVEL da mesma oferta (mediana dos snapshots entre agora-8d e agora-24h, com >= 3 snapshots em >= 3 dias distintos), queda >= 5% e <= 60%; acima de 60% só com corroboração (mesma regra de `suspect_price`). Calculado por lateral só para os <= 100 candidatos já aprovados no filtro de elegibilidade, usando o índice `(offer_id, collected_at)`; custo limitado e independente dos 3,25 M.
3. "Séries": não consultar série por card. Mostrar a faixa real mín. / média / máx. do produto com o preço atual marcado (todos já em `combined`), mais data e loja do menor (`lowestRecord`, `affiliate.ts:882-885`). Sparkline só depois do agregado diário (`affiliate_price_daily`, DBA passo 2); antes disso não existe. Rótulo obrigatório: "desde 13/07/2026" (a base tem 110 dias; "já visto" não é "da história do varejo").

**Ofertas do dia** (evento, janela 24 h): produto que entrou em "abaixo do normal" por uma QUEDA confirmada da oferta pública mais barata nas últimas 24 h. Condições, todas:
- `eligible`, `NOT low_confidence`, veredito `below` e abaixo da mediana x 0,95 (mesmo critério de "Abaixo do normal").
- Queda >= 5% vs referência estável (item 2 acima), com `last_price_change_at >= now() - 24h`. O próprio evento de mudança de preço é a prova de coleta fresca (importante: `last_checked_at` é gravado no `finally` mesmo quando a fonte falha, `public-offers.ts:21-27`).
- Persistência: o novo preço aparece em >= 2 coletas com >= 1 h de intervalo (evita preço-lampejo).
- Anti-oscilação: excluir oferta que voltou ao preço de referência e caiu de novo >= 2 vezes nos últimos 7 dias. [REAL, ADR 0004] há ofertas com 2 a 7 preços alternando no mesmo dia, causa desconhecida; sem essa regra, todo vaivém vira "oferta do dia" repetida.
- Anti-reajuste (pré-promoção): excluir se a referência estável estiver > 15% acima da mediana limpa do produto (preço subiu antes de "cair"). [HIPÓTESE] o 15% precisa de calibragem com dado real (Estatístico); relevante porque Black Friday (27/11) está perto.
- Não suspeito: a regra `suspect_price` de `lowBadgeBlockReason` (`price-verdict.ts:206-217`) não pode disparar.
- Estoque: o modelo NÃO tem campo de estoque. "Estoque ativo" = `status='active'` + coleta que provou o preço. A UI diz "preço coletado há X h", nunca "em estoque".
- Sem janela maior: se faltar item, a seção se esconde (3.3). Estender para 7 dias vira OUTRA seção com outro nome ("Quedas da semana", usando a janela já existente em `PRICE_DROP_WINDOW_DAYS = 7`, `price-verdict.ts:48`), nunca "Oferta do dia" disfarçada.

**Deduplicação** [RECOMENDAÇÃO]: dentro de cada seção, 1 linha por master (a oferta mais barata representa; as outras lojas ficam no comparador). Na página, no máximo 2 aparições por produto: 1 em seção editorial (Dia > Histórica > Abaixo, em cascata: quem está em Dia sai das outras duas) e 1 em prateleira de catálogo (tipo ou fabricante). Prateleira por tipo e por fabricante são dois recortes do mesmo catálogo: sem filtro, mostrar UM eixo empilhado (tipo) e o outro como chips de navegação; empilhar os dois repete o mesmo item 3 ou 4 vezes (hoje o pool de 200 já repete).

### 3.2 Ranking (para não ser dominado por barato/absurdo)

Chave única, calculada em SQL sobre `combined`, sem termo de comissão ou de rede (neutralidade com afiliado):

`score = d x w_amostra x w_dispersao`, com
- `d = (mediana_limpa - atual) / mediana_limpa`, limitado a 0,50 para ranquear (acima disso é zona de suspeita, já tratada por corroboração; não premiar o absurdo).
- `w_amostra = min(1, history_days / 60)`. Uso dias de histórico, não `quote_count`, porque `quote_count` é frequência de coleta (Switch 2: 299.506 cotações para 1.590 oferta-dias, ADR 0004). Quando o ADR 0004 for aprovado, vira oferta-dias.
- `w_dispersao = 1` se `dispersion_ratio <= 2`, decaindo linearmente a 0,6 em 3 (acima de 3 já é `low_confidence` e não entra).
Desempate: economia em R$ (média - atual), depois mais vendedores públicos distintos. Piso de relevância: economia >= R$ 10 OU desconto >= 15% [HIPÓTESE, calibrar com a distribuição real], para botão de R$ 7,99 não ocupar vaga. Teto de 50% das vagas por `productType` em seção multitipo (acessório não engole jogo/console). Em prateleira de fabricante: ordem = `below` por score, depois `inline` por nº de ofertas públicas e nº de vendedores. Item `insufficient` (histórico curto) não entra em prateleira; aparece só na tabela de preços e na busca.

### 3.3 Mínimos e comportamento sem dado

- Mostrar a seção apenas com >= 3 itens (Dia, Histórica) ou >= 4 (Abaixo do normal, prateleiras). Abaixo disso, ESCONDER a seção (sem cabeçalho vazio e sem preencher com item de outra seção, de outra janela, de outro limiar ou sem histórico).
- Nunca relaxar limiar em silêncio (de 5% para 3%, de 24 h para 72 h).
- Se todas as seções se esconderem (filtro estreito ou coleta parada): estado vazio honesto, uma linha: "Nenhuma oferta atende aos critérios agora (atualizado em HH:MM)", com link para `/tabela-de-precos` com os mesmos filtros e o contador "N produtos com histórico curto" (verdadeiro, sai da mesma varredura).
- Frescor: cada seção exibe `computedAt`; se `computedAt` > 30 min, selo "dados de HH:MM". Se a coleta de uma rede morrer, `live_networks` (`public-offers.ts:64-69`) já tira as ofertas dela; as seções encolhem sozinhas em vez de mostrar preço velho.

### 3.4 Limites, paginação e custo

[RECOMENDAÇÃO, em ordem]
1. **Uma varredura, não oito.** Nova função `getShowcaseSnapshot()` que monta `buildCtes(where catálogo inteiro)` UMA vez (`combined ... AS MATERIALIZED`, referenciada por UNION ALL de top-K por seção) e devolve JSON pequeno: para cada seção x tipo x fabricante, top 24 ids com score, preço, média, mediana, mín, máx, veredito e dados da oferta (slug, loja, imagem), mais os contadores (produtos, abaixo do normal, menor registrado, histórico curto, sem plataforma). Payload estimado em centenas de linhas [HIPÓTESE]. O catálogo ainda tem ~1,8 mil produtos públicos [REAL, DBA]; a escolha de top-K em SQL é barata, o custo é a CTE `combined` (~8 s frio hoje).
2. **Filtro de URL não vai ao banco.** Cache da varredura com chave única (sem filtro); `?tipo`, `?fabricante`, `?geracao` filtram em memória sobre os buckets. Cada combinação deixa de ser cache frio de 8 s (hoje `price-table.ts:316`).
3. **Os cards leem da própria linha.** Montar `OfferListingMetrics` a partir da linha de `combined` (como `price-table.ts:264-310` já faz) e dispensar `getOfferListingMetrics` (`affiliate.ts:894-905`) para ~100 ofertas, que dispara `getMasterProductPriceStatsBatch` sobre produtos com centenas de milhares de snapshots. A hidratação de imagem/vendedor é por chave primária, só para os ids exibidos (<= 8 por seção).
4. **Pré-computado hoje: nada.** O que existe é `unstable_cache` (por deploy, vazio após cada deploy; DBA 2.2). Opção A (imediata): 1 varredura cacheada 300 s + rota de aquecimento pós-deploy (DBA passo 4). Opção B (preferida, depende de Backend/DBA): o cron do coletor grava o resultado numa tabela derivada pequena (`showcase_snapshot`: chave, `payload jsonb`, `computed_at`), reconstruível a qualquer momento, sem tocar em `affiliate_price_snapshots`; a página lê em milissegundos e serve o último snapshot (stale-while-revalidate) mesmo se a varredura falhar. Opção C (alvo): a varredura passa a ler `master_product_price_stats_mv` e `affiliate_price_daily` (DBA passo 2; meta < 300 ms), bloqueada pela decisão do ADR 0004.
5. **Paginação.** A página mostra 8 por seção. "Ver todas (N)" leva à tabela existente com os mesmos filtros (`?abaixo=1`, `?menor=1`, `tipo`, `geracao`), que já pagina (limite 40, `price-table.ts:185`). Se for preciso paginar a vitrine em si, paginar em memória sobre o top-24 cacheado (sem OFFSET sobre a CTE). Cap duro por seção: 24.
6. **Contadores sem 3ª varredura.** Os contadores de `getPriceTableCounters` (`price-table.ts:338`) podem sair do mesmo payload, eliminando a 3ª execução da CTE (~8 s).
7. **Queda estável (3.1)** roda só para <= 100 candidatos por lateral indexado: custo [HIPÓTESE] de dezenas de ms; medir antes de ligar.

### 3.5 Filtros por URL e consistência dos contadores

- `?tipo=game|console|accessory` (já existe, `page.tsx:57,85`), `?geracao=` lista separada por vírgula (já existe, `:84`), `?fabricante=nintendo|playstation|xbox` (novo, lista branca). Mapa fixo: nintendo = {switch_1, switch_2}; playstation = {ps4, ps5}; xbox = {xbox_one, xbox_series, xbox_360}. Se vierem `fabricante` e `geracao`, vale a interseção; interseção vazia = estado vazio honesto (não ignorar o filtro).
- **PC e retrô: não implementar por ILIKE de título na página.** O modelo não tem esses valores (3.2 acima). Requisito para liberar: nova dimensão de plataforma persistida (`platform_family` ou ampliação do enum, derivada de título em `src/lib/catalog/dimensions.ts`, nunca padrão `unknown` — regra de `AGENTS.md`), definição de "retrô" pelo Gamer Veterano (geração <= 6ª? só originais, nunca clones, já excluídos por `CLONE_RE`), e backfill auditado pelo Guardião do Catálogo. Até lá o filtro mostra só Nintendo, PlayStation, Xbox, e um aviso "N itens sem plataforma identificada (inclui PC e retrô) não aparecem nas prateleiras por fabricante" com o N real.
- **Contadores.** Sem filtro: hero e cabeçalhos leem `getPublicMetrics()` (`public-metrics.ts:38-69`). Com qualquer filtro: o hero mostra "N itens nesta seleção" saído do mesmo payload (mesmo `where`, mesmo instante), nunca o global ao lado de uma lista filtrada. Invariantes testáveis: soma dos buckets de tipo = `products` do snapshot; soma dos buckets de fabricante + "sem plataforma" = `products`; `products`/`belowAverage`/`lowestEver` do snapshot sem filtro = `getPublicMetrics()` no mesmo `computedAt`. Diferença entre caches de 300 s separados gera o "1.121 vs 1.075" do F-15; por isso a recomendação 6 (uma varredura alimenta os dois).
- Variantes filtradas: `noindex` e `canonical` para `/ofertas`, como `generateMetadata` já faz para busca (`page.tsx:33-38`).

### 3.6 Riscos de enganar o usuário e rótulos

| Risco | Como a UI rotula / evita |
|---|---|
| "Oferta do dia" que é vaivém de preço (ADR 0004: 2 a 7 preços/dia) | Regras de persistência e anti-oscilação; rótulo "preço coletado há X h" |
| Reajuste pré-promoção (Black Friday 27/11) | Referência estável vs mediana de longo prazo; exibir "preço de referência" só quando passa o teste |
| Média inflada pela frequência de coleta (72 produtos mudam >10% com ADR 0004) | Confirmação por mediana; rótulo "vs. média de todas as lojas"; reavaliar quando F-26 for decidido |
| "Menor preço já visto" parece histórico de anos | "Menor preço registrado pelo Espaço Geek 86 desde 13/07/2026" + loja + data + "encerrada" se `offerActive=false` |
| "Estoque" afirmado sem dado | Nunca escrever "em estoque"; "disponível na última coleta (há X h)" |
| Vendedor fraco ou isca em destaque | `isHighlightEligibleSeller`, piso 35%, zona de suspeita (já vigentes) |
| "Tá Vendendo Muito" sem sinal de venda (`page.tsx:186`) | Renomear (ex.: "Melhores descontos reais"); não usar linguagem de popularidade sem métrica |
| Riscar "de" (preço cheio) com a média | Proibido; só `listPriceCents` real do snapshot (EG-13) pode virar "de/por" |
| Comissão influenciando ordem | Score sem termo de rede/comissão; aviso de afiliado no rodapé da seção |
| Seção cheia de "histórico curto" | Item `insufficient` fora das seções; contador de "histórico curto" visível |
| Item raro com pouca concorrência (1 vendedor só) | Mostrar nº de lojas/vendedores no card; desempate por mais vendedores |

## 4. Recomendação (ordem)

1. Aprovar o desenho de seções e critérios acima como contrato (Estatístico e Matemático confirmam o `score` e os limiares; Cientista de Dados de Tempo Real confirma persistência/anti-oscilação).
2. Implementar `getShowcaseSnapshot()` sobre `buildCtes` (adicionar `median_cents`, `previous_price_cents`, `last_price_change_at` ao `base`), cache único, filtros em memória, cards montados da própria linha. Opção A agora, Opção B logo depois, Opção C quando o DBA e o ADR 0004 liberarem.
3. Substituir o pool `limit: 200` por preço (`page.tsx:99-102`) e corrigir o rótulo `:186`.
4. Entregar Nintendo, PlayStation e Xbox; deixar PC e retrô como item de backlog com pré-requisito de catálogo (3.5).
5. NÃO: usar `getTopMovers` ou `getMasterProductPriceHistory` na vitrine; preencher seção com item sem histórico elegível; relaxar limiar para encher seção; inferir plataforma por ILIKE na página; chamar `getOfferListingMetrics` para centenas de ofertas; criar um `master_product` ou editar o enum fora de `findExistingMasterProduct`/migração aprovada.

## 5. Dado que falta (todos por SELECT somente leitura, antes de fixar limiares)

1. Quantos produtos passam cada seção hoje, por tipo e fabricante (define se os mínimos 3/4 escondem tudo): contagens de `below`, `low_badge_ok`, queda estável 24 h, queda 7 d.
2. Distribuição de `d` e da economia em R$ entre os `below` (calibra o piso "R$ 10 ou 15%" e o teto 0,50).
3. Frequência de ofertas com >= 2 reversões em 7 dias (calibra a anti-oscilação) e a causa da alternância de preço (Integrador/Cientista de Dados de Tempo Real).
4. Proporção de referências estáveis > 15% acima da mediana (anti-reajuste), medida antes e depois de 27/11.
5. Quantos produtos ficam em `game_platform_gen = 'unknown'` e quantos desses são PC ou retrô por título (dimensiona o backlog de catálogo).
6. Se o enum de `master_products.manufacturer` tem algum dado (nenhum código o usa).
7. Tempo real da varredura única e do lateral de 100 candidatos.
8. Existe sinal de clique/venda por produto utilizável (para um futuro "mais procurados" real)?

## 6. Métrica de sucesso

- Consistência: 0 divergência entre contadores da vitrine (sem filtro) e `getPublicMetrics()` no mesmo `computedAt`; soma dos buckets = total (teste automatizado).
- Honestidade: 100% dos itens exibidos em seção têm `eligible`, vendedor não fraco e oferta pública; 0 item sem histórico em seção; nenhum rótulo de "estoque" ou "popular".
- Qualidade do ranking: no top 8 de cada seção, <= 50% de acessórios e economia mediana >= R$ 10 (a verificar); taxa de "Ofertas do dia" cujo preço ainda é o mesmo 24 h depois >= 80% (mede persistência real).
- Custo: primeira visita pós-deploy da /ofertas < 3 s no servidor com Opção B (hoje 13,8 s a 38 s); qualquer filtro de URL sem consulta nova pesada (< 300 ms).
- Retenção: cliques por exibição nas seções vs. prateleiras antigas (Estrategista).

## Dependências e divergências declaradas

- Estatístico e Matemático: `score`, pesos, limiar 0,95 sobre a mediana e teto 0,50. Possível divergência: o veredito oficial usa a MÉDIA (`modelo-indicadores.md` 9.1: "a mediana não entra no veredito"); aqui a mediana entra só como confirmação adicional nas seções, tornando-as mais estritas que o veredito sem contradizê-lo. Registro a escolha para eles aceitarem ou recusarem.
- Cientista de Dados de Tempo Real: persistência, anti-oscilação e prova de coleta.
- DBA e Backend: `showcase_snapshot` (migration nova, não desenhada aqui), MV e agregado diário; aquecimento pós-deploy.
- Guardião do Catálogo e Gamer Veterano: dimensão de plataforma (PC, retrô) e definição de retrô.
- Engenheiro de Performance Web: ISR e Suspense por seção.
- ADR 0004 (cotação por dia) muda a média sobre a qual tudo isso se apoia; ligar a vitrine antes dessa decisão é aceitável só com o rótulo "vs. média de todas as lojas" e a confirmação pela mediana.
