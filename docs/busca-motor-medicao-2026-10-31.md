# Motor de busca de produtos: desenho e medição (2026-10-31)

Código: `src/server/queries/search-products.ts` (motor), `src/lib/search/query-normalize.ts` (normalização e pontuação, puro), `drizzle/migrations/0020_search_products_trgm.sql` (opcional, NÃO aplicada, fora do `_journal.json`), `scripts/medir-busca.ts` (medição, só SELECT). Nada foi escrito no banco, sem deploy, sem commit.

## Como a busca funciona hoje (antes deste motor)

- `/pesquisa` NÃO é busca: é a página da Pesquisa de Satisfação (`SurveyForm`). A busca de verdade é `/ofertas?q=termo`.
- `/ofertas` (`ofertas/page.tsx`) chama `listRankedOffers({ search, limit: 60 })`, que usa `fuzzyMatch`: cada palavra do termo tem de aparecer (`unaccent ILIKE %palavra%`) no título da oferta OU no nome do master, em qualquer ordem. Não há relevância, nem número de sequência, nem corte, nem sugestão. O resultado é uma oferta por master, mas misturando jogo, console e acessório.
- Busca do header (Ctrl+K, `header-search-modal.tsx`) chama `/api/search?q=` que usa o mesmo `listRankedOffers({ search, limit: 6 })` e mostra o título cru da oferta.
- Este motor substitui os três pontos; a ligação da UI não foi feita (fora do escopo).

## Desenho

Unidade do resultado: `master_product` com pelo menos 1 oferta pública (ADR 0002, `publicOffersCtes`), ignorando arquivados (`attributes ? 'mergedInto'`).

1. Etapa A (SQL, 1 consulta): CTE de ofertas públicas, agregados por master (menor preço, nº de ofertas, uma linha por loja com a oferta mais barata, em `jsonb`) e pré-filtro de candidatos por palavra (`LIKE ALL`) ou trigram (`word_similarity >= 0,45`, pg_trgm). Os filtros de loja e condição entram aqui, na oferta.
2. Etapa B (TS): decisão de relevância. Número de sequência tem de ser igual (romanos viram arábicos; "mario kart 8" nunca traz "7"). Toda palavra do termo tem de casar (exata, plural, prefixo ou 1 troca de letra em palavra de 6+ letras). Siglas expandem em variantes (gta, cod, tlou, rdr, re, ff, botw, totk...). Plataforma do termo (ps5, switch 2, xbox series x...) vira filtro e não conta como palavra. Corte de relevância 0,55. Título exato = 1,0.
3. Tipo efetivo: as regras de título de `detectNonGameByRules` (EG-04) mais regras extras (mangá, câmera, guidão, PC gamer, armazenamento em GB/TB...) corrigem em memória o que o banco ainda marca como `game`. Não escreve nada. Kits/lotes/combos ficam fora da aba de jogo, salvo se o termo pede kit/lote/combo.
4. Estatística (média única, veredito, selos, menor histórico com piso) vem de `product-price-stats.ts` + `price-verdict.ts` e só aparece com histórico elegível. Ver "Custo do histórico" abaixo.
5. Sem frete e sem prazo (não existem nos dados): nenhum filtro, campo ou ordenação.
6. Cache: `searchProducts` 60 s por combinação de parâmetros, `getSearchInsights` 10 min, `suggestProducts` pelo índice em memória (seção "Autocomplete: índice em memória"). Paginado (24 por página, máx. 60).

### Links de saída (ajuste do coordenador)

Só existe uma coluna de URL em `affiliate_offers`: `affiliate_url` (NOT NULL). Pelo schema, quando `affiliate_link_pending = true` ela guarda a página pública do anúncio (placeholder sem rastreio); quando `false`, o link de afiliado real. `external_ref` é o ID na loja (ex.: MLB123), não URL, e não é usado.

- `outboundUrl` = `affiliate_url` se for http(s) válido; senão `null`. Nunca inventado.
- `isAffiliateLink` = `affiliate_link_pending = false` E URL http(s). Uso interno (servidor/analytics); a UI do cliente não exibe a palavra "afiliado".
- Está no item (oferta mais barata) e em cada loja de `stores[]`.
- Estado real hoje: 2.246 ofertas ativas, todas com `affiliate_link_pending = false` e URL http(s) (2.167 `produto.mercadolivre.com.br` e 75 `www.mercadolivre.com.br` com `matt_tool`, 3 `s.shopee.com.br`, 1 `meli.la`). O ramo "pendente" (link público) está implementado mas NÃO foi exercitado por dado real, porque não há oferta pendente ativa.
- Observação: `/go/[slug]/route.ts` hoje bloqueia o clique de oferta pendente. Se a UI passar a usar `outboundUrl` direto, esse bloqueio deixa de valer para a busca; decisão do dono se isso é desejado.

## Banco (verificado)

- Extensões: `pg_trgm 1.6`, `unaccent 1.1` (schema public). `search_path` inclui public.
- Sem índice de texto em `master_products`. Sem migration o motor roda com varredura sequencial: a consulta de candidatos executa em ~30 ms no servidor do banco (`EXPLAIN ANALYZE`: 29 a 33 ms para `xyz`, `zel`, `fif`; a CTE `public_offers` sozinha: 14,5 ms). A migration 0020 cria `egeek_search_norm(text)` (IMMUTABLE) e um índice GIN trigram parcial; o motor detecta a função em runtime (`to_regprocedure`) e a usa se existir. Só vale quando o catálogo crescer.
- Condição novo/usado: não existe coluna. O filtro `condition` deduz do título da oferta (usado, seminovo, used, open box, recondicionado). Hoje há 0 ofertas ativas com esses termos, então `condition: 'used'` devolve vazio (correto, não é bug).
- 4.667 masters não arquivados (2.817 jogo, 372 console, 1.478 acessório, pela coluna); 116 arquivados.

## Medição

Máquina de desenvolvimento, pooler 6543, ida e volta ao banco medida em ~160 ms (`SELECT 1`). Tempos de parede, sem cache, 1 execução por termo (a variação entre execuções chega a 2x por causa da rede). Precisão = itens corretos / itens listados (até 10 por termo). "Insights" = `getSearchInsightsUncached` dos itens da página.

| # | Termo | Busca (ms) | Total jogos | Corretos/listados | Observação |
|---|---|---|---|---|---|
| 1 | resident evil village ps5 | 1490 (1ª, inclui detecção da função) | 2 | 2/2 | Village e Gold Edition, PS5; plataforma deduzida do termo |
| 2 | mario kart 8 | 635 | 1 | 1/1 | só o 8 Deluxe |
| 3 | mario kart 7 | 1218 | 0 | vazio correto | sem sugestão (não oferece o 8 no lugar) |
| 4 | zelda | 407 | 4 | 4/4 | mais 1 acessório na aba acessório |
| 5 | god of war | 399 | 3 | 3/3 | inclui um combo "Ragnarok + 2018" (1 anúncio com 2 jogos) |
| 6 | god of war ragnarok ps5 | 409 | 1 | 1/1 | |
| 7 | fifa | 460 | 1 | 1/1 | só Fifa 16 tem oferta pública |
| 8 | fc 25 | 597 | 0 | vazio correto | `filtered_out`: só existe 1 acessório |
| 9 | xyz123 | 733 | 0 | vazio correto | sem sugestão |
| 10 | ps5 | 830 | 51 | 10/10 | navegação por plataforma (sem texto) |
| 11 | controle (aba jogo) | 626 | 0 | vazio correto | `filtered_out`; 43 na aba acessório |
| 12 | controle (aba acessório) | 525 | 43 | 10/10 | |
| 13 | gta v | 402 | 6 | 6/6 | via sigla; sem guidão, PC gamer nem console |
| 14 | pokemon | 429 | 15 | 10/10 | |
| 15 | super mario | 590 | 10 | 9/10 | 1 duvidoso: "Nintendo Super Mario Deluxe Toad House" (R$ 500, plataforma desconhecida), provável item não-jogo |
| 16 | call of duty | 738 | 0 | vazio correto | há 29 masters COD/TLOU/Modern Warfare no banco, nenhum com oferta pública (ADR 0002) |
| 17 | final fantasy 7 | 370 | 3 | 3/3 | "VII" casa "7" |
| 18 | the last of us | 1326 | 0 | vazio correto | idem 16 |
| 19 | elden ring | 367 | 4 | 4/4 | |
| 20 | spider man | 372 | 1 | 1/1 | |
| 21 | zelsa (erro de digitação) | 740 | 0 | sugestão correta | "Zelda: ..." (3 títulos) |
| 22 | resident evl vilage | 733 | 0 | sugestão correta | "Resident Evil Village" |
| 23 | console ps5 (aba console) | 576 | 4 | 4/4 | |
| 24 | xbox series x (aba console) | 665 | 3 | 3/3 | |
| 25 | switch 2 | 684 | 16 | 10/10 | navegação por plataforma |
| 26 | mario, ordem menor preço | 592 | 18 | 10/10 | |
| 27 | mario, ordem maior desconto | 2813 | 18 | 10/10 | calcula histórico dos 18 |
| 28 | zelda, ordem mais lojas | 494 | 4 | 4/4 | todas têm 1 loja (só Mercado Livre tem oferta pública) |
| 29 | zelda, loja mercado-livre, R$ 100 a 300 | 382 | 0 | vazio correto | `filtered_out`: todas custam mais que R$ 300 |
| 30 | zelda, condição usado | 750 | 0 | vazio correto | não há oferta usada |

Resumo de precisão: 72 corretos de 73 itens listados em consultas com resultado (98,6%), 7 de 7 consultas sem correspondência vazias (sem lixo) e 2 de 2 erros de digitação com a sugestão certa.

### O que a primeira medição achou e foi corrigido

Primeira rodada (mesmos termos), lixo que aparecia e como foi tratado:

- `controle` na aba jogo trazia "Poison Control" e "Control Powera ..." (correspondência fraca `controle` ~ `control`). Correção: erro de digitação só vale com troca de 1 letra no mesmo tamanho; inserção/remoção só alimenta o "quis dizer".
- `mario` trazia "Wario Ware" (2 itens). Mesma correção.
- `gta v` trazia guidão de bicicleta GTA, PC Gamer e console com GTA (3 de 9 eram lixo). Correção: regras extras de tipo (guidão, PC gamer, armazenamento GB/TB, ...).
- `elden ring` trazia um mangá; `switch 2` trazia uma câmera. Mesma regra extra.
- Autocomplete `resident evil v` voltava vazio (o "v" virava numeral romano 5). Correção: palavra final de até 2 caracteres é tratada como prefixo quando a leitura normal não acha nada.

### Tempo

- Busca (sem histórico): 370 a 830 ms de parede neste ambiente (picos de 1,2 a 1,5 s na 1ª chamada, que inclui a detecção da função de normalização, e em termos que passam por trigram). Servidor do banco: ~30 ms por consulta; o resto é rede (ida e volta ~160 ms medida). Em produção na mesma região do banco o esperado é bem menor; não foi medido lá.
- Autocomplete `suggestProducts`: agora pelo índice em memória, ver a seção própria abaixo (a medição anterior, por consulta SQL, ficava em 370 a 1.140 ms daqui e não atingia 300 ms).
- Insights (histórico, 10 itens): produtos comuns 0,3 a 3,5 s (zelda 4 itens 1,4 s; pokemon 10 itens 2,0 s; switch 2 10 itens 1,8 s). Produtos muito cotados: `ps5` (10 itens mais cotados) 7,5 s; `controle` acessório 4,7 s.

### Custo do histórico (risco real, ADR 0001 já avisava)

`affiliate_price_snapshots` tem 3,2 milhões de linhas; o master mais cotado tem 73 ofertas e 296 mil snapshots (`EXPLAIN ANALYZE` da CTE de cotações: ~1 s só para ele; a estatística completa de 10 masters populares levou 15 s e a de 3 levou 6,5 s). Por isso:

- `searchProducts` NÃO calcula o histórico por padrão: devolve preço, lojas e links rápido, com `insights: null`.
- A UI hidrata os selos com `getSearchInsights(ids)` (cache 10 min), ou pede `withInsights: true`.
- `sort: 'discount'` exige histórico e avalia só os `DISCOUNT_SORT_POOL = 30` mais relevantes (`truncated: true` quando há mais). Nos casos medidos o resultado completou em 2,8 s para 18 produtos de "mario".
- Solução de fundo: o agregado diário já recomendado (EG-11, migration futura). Com ele `insights` e a ordenação por desconto passam a ser instantâneos para todo o catálogo.


## Autocomplete: índice em memória (2026-10-31, aprovado pelo dono)

Assinaturas e formato de retorno de `suggestProducts`, `searchProducts` e `getSearchInsights` não mudaram.

Desenho (`search-products.ts`, seção "Índice em memória do autocomplete"):

- Uma consulta carrega todos os produtos com oferta pública (ADR 0002, mesma `publicOffersCtes`; masters `mergedInto` fora): nome, plataforma, tipo, menor preço público, nº de ofertas e de lojas, imagem e slug da oferta mais barata (`href` = `/ofertas/[slug]`). Hoje: 536 produtos.
- Na carga, cada produto já guarda o nome analisado (`analyzeName`), tipo e plataforma efetivos, flag de kit/lote, título limpo e nome dobrado. A busca percorre o índice e usa as MESMAS funções da busca principal: `parseQuery`, siglas, numerais romanos, regra de número de sequência, `scoreName` com último token como prefixo, corte 0,55, kits escondidos, restrição por plataforma digitada (`resident evil ps4` só devolve PS4; `ps5` nunca sugere PS4) e a regra do "v" curto como prefixo.
- Diferença: a pontuação por trigram do banco não existe aqui (peso de 0,1 na relevância); a ordem entre itens muito parecidos pode mudar levemente.
- Memória do processo com TTL de 90 s (`SUGGEST_INDEX_TTL_MS`). Passado o TTL, a próxima chamada responde NA HORA com o índice velho e dispara a recarga em segundo plano (stale-while-revalidate, uma só recarga por vez). Se a recarga falha, mantém o velho. Só a primeira chamada a frio de um processo espera a carga.
- Por baixo, a carga passa por `createCachedQuery` (`unstable_cache`, 120 s, tags `affiliate-offers`/`price-snapshots`), que é o mecanismo do Next 16.2 sem Cache Components (ver `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`; o projeto não usa `cacheComponents`). Isso amortece instâncias serverless novas, que reaproveitam a carga de outra instância. NÃO foi possível verificar esse amortecimento aqui: fora do Next o `unstable_cache` cai no cache em memória e a medição foi direta no banco.
- Sem índice disponível (falha na 1ª carga), `suggestProducts` cai na consulta SQL anterior.
- `warmSuggestIndex()`: pré-carrega o índice (útil num `instrumentation.ts` ou no primeiro request). Funções `...ForMeasurement` existem só para o script.
- Em `next dev` o estado do módulo pode ser perdido a cada recompilação (HMR) e o índice recarrega; em produção o estado persiste enquanto a instância viver.

Medição (`scripts/medir-busca.ts --so-autocomplete`, 16 termos x 30 chamadas = 480 chamadas quentes):

| Situação | Tempo |
|---|---|
| 1ª chamada a frio do processo (carrega o índice, inclui abrir conexão com o banco) | 1.796 ms (2.206 ms na rodada anterior) |
| Recarga do banco, 4 repetições (também é o custo da recarga em segundo plano) | 973, 674, 1.451, 852 ms (rodada anterior: 498, 264, 248, 225; a rede variou) |
| Quente, mediana das 480 chamadas | 0,27 ms (0,59 ms na rodada anterior) |
| Quente, p95 | 0,78 ms (2,93 ms antes) |
| Quente, pior caso (pico isolado, provável coleta de lixo) | 20,5 ms (92,5 ms antes) |
| Após o TTL (relógio avançado 200 s): resposta com índice velho | 0 ms |
| Chamada seguinte, com a recarga rodando por baixo | 1 ms |

Qualidade (mesmos termos): `resi` lista os Resident Evil; `resident evil v` os dois Village; `resident evil ps4` só o RE 6 de PS4; `resident evil ps5` só os de PS5; `mario kart 8` só o 8; `god of war ps4` só o de PS4; `final fantasy vii` os 3 certos; `xyz` e `zelsa` vazios (autocomplete não faz "quis dizer", isso é da busca).

### O alvo de 300 ms, honestamente

- Chamada de dentro do servidor (função `suggestProducts` chamada por route handler ou Server Component, índice carregado): ATINGIDO com folga, mediana 0,3 a 0,6 ms e p95 0,8 a 3 ms medidos.
- Primeira chamada a frio de cada processo/instância: NÃO atinge. Mediu 1,8 a 2,2 s aqui (conexão nova + consulta + ida e volta de ~160 ms); a recarga com conexão já aberta levou de 225 ms a 1,4 s conforme a rede. Em produção, perto do banco, deve ser bem menor, mas não foi medido. Mitigações: Data Cache (não verificado), `warmSuggestIndex()` no start, e a UI não depender da 1ª resposta (debounce, mostrar o termo digitado).
- Chamada de fora (navegador até a rota): NÃO medi. Não há servidor Next no ar nesta medição. O tempo de rede cliente-servidor entra por cima dos ~1 ms de processamento e não é controlável pelo motor: 300 ms de ponta a ponta só são plausíveis com o servidor perto do usuário e a instância já quente. Medir com a rota real (`/api/search`) depois de ligada à UI, em produção ou preview.

## Correções pós-QA (docs/relatorio-qa-busca-2026-10-31.md)

- **F1 autocomplete de plataforma.** `suggestProducts('ps5')` (e `'switch 2 jogos'`, termo = plataforma + ruído) agora lista os produtos mais cotados daquela plataforma (mais ofertas primeiro; kits de fora; respeita `types`). `ps5`: GTA 5 (50 ofertas), Resident Evil 3 (28), Street Fighter 6 (26)... todos PS5. `ps` (2 letras, sem plataforma reconhecida) continua sendo busca de texto.
- **F2 facets.** Cada contagem é o conjunto que o usuário vê ao clicar, aplicando todos os eixos menos o próprio: `facets.types[t]` aplica plataforma e faixa de preço; `facets.platforms[p]` aplica tipo e faixa de preço; `facets.stores` aplica tipo, plataforma e preço (loja e condição já filtram na consulta, então a loja escolhida é o único eixo que não dá para "ignorar"). `total` = `facets.types[type]` = tamanho da lista, sempre (também em `sort: 'discount'`: `total` agora é o real; só `pageCount` é limitado aos 30 avaliados quando `truncated`). Em navegação por plataforma (termo só "ps5") os chips mostram só a plataforma aplicada. Conferido por simulação de cliques: `ps5` jogos 51/51, consoles 5/5, acessórios 16/16; `resident evil` jogos 9/9, consoles 1/1, acessórios 0/0; chips PS5 5/5 e PS4 1/1. Os 3 produtos de plataforma "não identificada" aparecem em `facets.platforms.unknown` (a UI atual filtra esse chip; por isso a soma visível ficava 6 de 9 no QA).
- **F3 título de exibição** (`cleanProductTitle`, agora com `{ keepPlatform }`). Passa a: tirar traço/pontuação solta nas pontas mesmo depois de remover "(Original)"/"(físico)"; separar palavras coladas conhecidas ("Thewild" vira "The Wild"); pôr espaço depois de ":" e maiúscula na palavra seguinte; tirar ™ ® ©; escrever siglas GTA, FIFA, WWE, NBA, NHL, NFL, UFC; preservar "Nintendo Switch Sports" (antes virava "™ Sports"); manter a plataforma no título de console e acessório (`keepPlatform`), onde ela identifica o produto. Resultado nos 535 produtos públicos: de 28 títulos com defeito para 1 (um acessório que o detector de defeito marca porque o nome original traz "Xbox One"; com `keepPlatform` ele sai "Bateria Recarregável Kapbom para Controle Xbox One 880 mAh"). Exemplos: "Resident Evil Village Gold Edition – PS5 (Original)" vira "Resident Evil Village Gold Edition"; "Zelda:breath Of Thewild Nintendo Switch" vira "Zelda: Breath Of The Wild"; "Jogo Ps4 Fifa 16" vira "FIFA 16". Não foi inventado nenhum nome: "Gta 5 - Grand Theft Auto V" fica como está (redundante, mas é o que o anúncio diz).
- **F4 /api/search/insights.** Rota de outro dono; só chamei a função `GET` com um `Request` (sem subir o Next, sem HTTP real e sem navegador). Com os ids de "zelda" + "mario kart 8" (5 produtos): status 200, `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`, 5 de 5 ids devolvidos, JSON idêntico ao `getSearchInsightsUncached`. Médias: Echoes of Wisdom 377,43, Breath of the Wild 393,73, Link's Awakening 315,63 (iguais ao QA); menor histórico R$ 250,00 / 250,00 / 245,00; "abaixo" nos dois primeiros, "em linha" no terceiro, "histórico curto" em Tears of the Kingdom e Mario Kart 8 (sem média, como pede o ADR 0001). `ids` inválidos ou ausentes: 200 com `{"insights":{}}`. Pendente: confirmar no navegador que a grade hidrata os selos; a rota levou 1,5 s para esses 5 produtos, e para 24 produtos muito cotados (ex.: lista de `ps5`) pode passar de 10 s, porque a estatística varre os snapshots (ver "Custo do histórico").

## Limites conhecidos

- Dados de catálogo: plataforma "Geração não identificada" em jogos cujo título cita "Xbox X" ou "Playstation Hits"; "Hits" é PS4. Item de classificação (EG-04), não do motor.
- Hoje só o Mercado Livre tem oferta pública relevante (Shopee/Magalu etc. ficam de fora pelo frescor do ADR 0002), então `storeCount` é 1 em quase tudo e a ordenação "mais lojas" ainda não separa nada.
- Selo "menor preço registrado" aparece em jogos que acabaram de cair ao mínimo; é o `computeLowBadge` do ADR, mas o menor histórico usa o piso da seção 5 abaixo, que difere do `lowAll` bruto da fonte única.
- Dois masters do mesmo jogo ainda existem quando o ruído do título difere (ex.: "Resident Evil Village" e "...Gold Edition" são edições distintas de propósito; "Gta 5" aparece em PS4 e em "Geração não identificada"). A fusão EG-01 continua sendo a correção.
- O corte 0,55 e os pesos foram calibrados nestes 30 casos; não há conjunto de teste maior.

## API para a UI

```ts
// src/server/queries/search-products.ts
searchProducts(params: SearchProductsParams): Promise<SearchProductsResult>   // cache 60 s
suggestProducts(term: string, limit = 8, opts?: { types?: ('game'|'console'|'accessory')[] }): Promise<ProductSuggestion[]>  // índice em memória (sem ida ao banco no caminho quente)
warmSuggestIndex(): Promise<number>   // opcional: pré-carrega o índice no start do servidor (devolve nº de produtos)
getSearchInsights(masterProductIds: string[]): Promise<Record<string, SearchInsights>>  // até 60 ids, cache 10 min
// sem cache, para scripts: searchProductsUncached, suggestProductsUncached (= suggestProducts), getSearchInsightsUncached

interface SearchProductsParams {
  term: string;                       // vazio só com `platform`
  type?: 'game' | 'console' | 'accessory';   // padrão 'game'
  platform?: GamePlatformGen | string | Array<...>;  // 'ps5', 'switch_2', 'xbox series x'...; sobrepõe a do termo
  minPriceCents?: number; maxPriceCents?: number;    // sobre o menor preço atual público
  store?: string | string[];          // id, nome ("Mercado Livre") ou slug ("mercado-livre")
  condition?: 'new' | 'used';         // deduzido do título da oferta
  sort?: 'relevance' | 'price_asc' | 'discount' | 'stores';
  withInsights?: boolean;             // padrão false ('discount' liga sozinho)
  page?: number; pageSize?: number;   // 24 padrão, máx 60
}

interface SearchProductsResult {
  term; normalizedTerm; appliedPlatform: GamePlatformGen | null; platformFromTerm: boolean;
  type; sort;
  items: SearchProduct[]; total; page; pageSize; pageCount;
  truncated: boolean;                 // true só em sort 'discount' com mais de 30 candidatos
  facets: { types: {game,console,accessory}; platforms: Partial<Record<GamePlatformGen, number>>; stores: {storeName, products}[] };
  emptyReason: 'generic_term' | 'no_match' | 'filtered_out' | null;
  didYouMean: string[];               // só quando 'no_match'
}

interface SearchProduct {
  masterProductId; title /* limpo */; rawName; imageUrl: string | null;
  platform: GamePlatformGen; platformLabel; productType; relevance /* 0..1 */;
  lowestPriceCents; lowestStoreName; href /* /ofertas/[slug] */;
  outboundUrl: string | null;         // link de afiliado real, ou URL pública do anúncio enquanto pendente
  isAffiliateLink: boolean;           // INTERNO: não exibir
  stores: { networkId, storeName, lowestPriceCents, offerCount, offerId, offerSlug, href, outboundUrl, isAffiliateLink }[]; // da mais barata à mais cara
  storeCount; offerCount;
  insights: SearchInsights | null;    // null = ainda não carregado (não é "sem histórico")
}

interface SearchInsights {
  masterProductId; currentCents: number | null;     // menor preço público do produto, todas as lojas
  avgPriceCents: number | null;                     // média única; null sem elegibilidade
  verdict: 'below' | 'inline' | 'above' | 'insufficient';
  verdictDeltaPercent: number | null;               // negativo = abaixo da média
  discountVsAvgPercent: number | null;              // positivo = mais barato que a média
  eligible: boolean; quoteCount; historyDays;
  lowestEverBadge: boolean; priceDrop: PriceDrop | null; priceFalling: boolean;
  historicLow: { priceCents, at, storeName, offerActive, floorReplacedRaw, floorApplied } | null;
}

interface ProductSuggestion {
  masterProductId; title; platform; platformLabel; productType;
  lowestPriceCents; offerCount; storeCount; imageUrl: string | null; href;
}
```

Padrão de uso: a página chama `searchProducts` (rápido), renderiza a grade e hidrata os selos por `getSearchInsights` (Suspense ou chamada do cliente). Abas Jogo/Console/Acessório com `facets.types`. Chips de plataforma com `facets.platforms`. Se `emptyReason === 'filtered_out'`, mostrar `facets.types` ("0 jogos, 43 acessórios") em vez de "nada encontrado".

Observação sobre `insights` com filtro de loja ativo: o veredito é do PRODUTO (todas as lojas, menor preço público do produto), não só da loja filtrada; é a regra "um jogo, uma média" (AGENTS.md).

## Menor histórico com piso (seção 5)

`historicLow` usa a cotação mais barata do histórico, descartando as abaixo de 35% (`PLAUSIBILITY_FLOOR_PERCENT`) da régua: mediana das ofertas públicas atuais quando há 3 ou mais; senão a média única se o histórico é elegível; sem régua, devolve o bruto com `floorApplied: false`. `floorReplacedRaw: true` indica que o mínimo bruto foi trocado pelo menor plausível. Isso é uma extensão do ADR 0002 aplicada só na busca (o ADR 0001 item 3 mantém o mínimo bruto na fonte única); alinhar com o dono.
