# Plano técnico: expansão do Espaço Geek 86 para tecnologia (informática, TVs, computadores, eletroportáteis, eletrodomésticos)

Data: 2026-10-31. Autor: arquiteto-next. Status: PLANO. Nada foi alterado em código, banco ou deploy.

Convenção de confiança usada neste documento: **[medido]** = observado hoje em chamada real GET ou consulta SELECT; **[código]** = lido no repositório; **[hipótese]** = inferência a validar; **[estimativa]** = conta feita sobre medições, com premissa explícita.

## 0. Resumo executivo

1. A API oficial do Mercado Livre **não oferece listagem de produtos por categoria**. `/sites/MLB/search` segue em 403. `/products/search` só aceita busca por palavra-chave (ou GTIN, ou atributos junto com palavra-chave), devolve no máximo 200 resultados por consulta (limit 100 e offset 100) e não filtra por categoria. Descobrir catálogo de eletrônicos é, portanto, **montar consultas (tipo + marca) e filtrar o resultado por `domain_id`**, mais o endpoint `/highlights` (20 mais vendidos por categoria).
2. **Cerca de 75% a 85% dos produtos de catálogo devolvidos pela busca não têm nenhuma oferta ativa** (`/products/{id}/items` responde 404 "No winners found"). Já os produtos vindos de `/highlights` tiveram 60 de 60 com oferta. Catálogo existente não significa produto monitorável: a descoberta precisa de uma sonda de preço antes de criar o `master_product`.
3. Preço atual por vendedor é obtido de forma oficial e funciona com o token do app: `/products/{catalog_product_id}/items` (preço, preço original, vendedor, item, condição). O coletor atual já usa isso e se aplica a eletrônicos quase sem mudança.
4. **Achado crítico no coletor atual, a corrigir antes de qualquer escala** [medido]: nos últimos 7 dias, 98% das cotações gravadas (202.528 de 206.169) vieram de 418 ofertas que alternam entre 2 e 3 preços a cada coleta (por exemplo 4.699 e 4.899 reais com 1 segundo de diferença). A causa provável é que o mesmo vendedor tem dois anúncios (`item_id`) do mesmo catálogo e a oferta é chaveada só por (produto, rede, vendedor): cada coleta grava os dois preços em sequência. Isso infla o volume em cerca de 50 vezes, pesa a "média única" a favor dessas ofertas e tornaria a expansão inviável em custo.
5. Modelo de dados: o schema já tem `categories`, `brands`, `gtin` (único), `mpn`, `attributes jsonb` em `master_products`, todos vazios ou ociosos [medido: `categories` 0 linhas, `brands` 0, `gtin` 0 preenchidos]. A migração é pequena. O que **não** pode ser reaproveitado é a normalização de título de `dedup.ts`: ela apaga capacidade (`\d{2,4}gb`, `\dtb`) e trata "full", "novo", "original" como ruído, o que fundiria Galaxy 128 GB com 256 GB, por exemplo. Eletrônicos precisam de chave própria (GTIN, senão marca + modelo + variante).
6. **Recomendação de piloto: Smart TVs** (categoria folha `MLB1002`, domínio `MLB-TELEVISIONS`). Justificativa na seção 6.
7. Custo no Supabase: a base está em 566 MB, `affiliate_price_snapshots` tem 3,03 milhões de linhas e 530 MB [medido]. Com o bug de oscilação corrigido, a projeção para 3.000 produtos de tecnologia é de cerca de 2 GB por ano; com o bug, ficaria na casa das dezenas de GB por ano. Proponho agregado diário (`affiliate_price_daily`, `master_price_daily`) e retenção do bruto; a retenção conflita com a regra "histórico intocável" e depende do dono.

---

## 1. Mudanças no modelo atual

### 1.1 O que existe hoje e onde está preso a jogos [código]

| Peça | Arquivo | Acoplamento com jogos |
|---|---|---|
| Enum `product_type` = `game`, `console`, `accessory` | `src/db/schema/_enums.ts` | Mistura "domínio" com "tipo". NOT NULL default `game` em `master_products`. |
| "plataforma" = coluna `game_platform_gen` (enum switch_1, ps5, xbox_series…) | `master_products.ts` | Só faz sentido para jogos e consoles. Default `unknown`. |
| Dedup por título + plataforma | `src/lib/affiliate/dedup.ts` (`findExistingMasterProduct`, `normalizeTitle`, `isSameProduct`) | `NOISE_WORDS`, `MARKER_WORDS`, `PLATFORM_STRIP` e `derivePlatformFromTitle` são de games. `PLATFORM_STRIP` remove `NN gb` e `N tb`. A consulta de candidatos filtra por `game_platform_gen IN (plataforma, 'unknown')`, ou seja, **todo master de tecnologia (plataforma `unknown`) viraria candidato de toda busca de jogo sem plataforma**. |
| Classificador | `product-type-classifier.ts` (Naive Bayes game/console/accessory), `mercado-livre-classify.ts` (regex sobre `path_from_root`: "jogo", "acessório", "console") | Treinado só com 3 classes de games; a regex de categoria classificaria errado qualquer caminho de tecnologia ("Consoles" etc.). |
| Busca | `search-products.ts` (1.252 linhas), `query-normalize.ts` | `SearchProductKind = ProductType`; abas Jogos/Consoles/Acessórios; `extractPlatforms`, `effectivePlatform`, `detectNonGameByRules`, `HARDWARE_RE`, `MERCH_RE`; índice de sugestão em memória com **todos** os masters. |
| Selos e veredito | `price-verdict.ts`, `product-price-stats.ts` (ADR 0001/0002) | Genéricos: dependem de `master_product_id`, cotações e datas. Reaproveitáveis. |
| Indicadores globais | `getPlatformStats`, `price-table.ts`, ranking, home | Calculam média e menor preço "gerais" sobre **todas** as ofertas ativas. Misturar TV (milhares de reais) com jogo (centenas) destrói esses números. |

### 1.2 Taxonomia proposta (categoria > subcategoria)

Usa a tabela `categories` já existente (`parent_id`, `path`, `level`, `attribute_schema jsonb`), hoje vazia. Dois níveis visíveis ao usuário; o domínio do Mercado Livre (`MLB-TELEVISIONS`) é um terceiro nível técnico, não exibido.

| Categoria (nível 1) | Subcategorias (nível 2) | Domínio/categoria ML de origem [medido] |
|---|---|---|
| TVs e Vídeo | Smart TVs; Projetores; Streaming (media players) | `MLB1002` / `MLB-TELEVISIONS`; `MLB2830`; `MLB133950` |
| Computadores | Notebooks; Desktops e All-in-One; Mini PCs | `MLB1652` / `MLB-NOTEBOOKS`; `MLB1649`, `MLB121405`; `MLB269606` |
| Informática | Monitores; Tablets; Impressoras; Roteadores e redes; Armazenamento; Componentes (fase tardia) | `MLB99245` / `MLB-COMPUTER_MONITORS`; `MLB99889` / `MLB-TABLETS`; `MLB1676`; `MLB5867`; `MLB430598`; `MLB1712` |
| Eletrodomésticos | Geladeiras e Freezers; Fogões, Fornos e Cooktops; Micro-ondas; Máquinas de lavar e secar; Lava-louças; Ar-condicionado | `MLB181294` / `MLB-REFRIGERATORS`, `MLB7072`; `MLB120315`, `MLB120314`, `MLB120316`; `MLB73057` / `MLB-MICROWAVES`; `MLB21168` / `MLB-WASHING_MACHINES`, `MLB431200`; `MLB73046`; `MLB1646` / `MLB-AIR_CONDITIONERS` |
| Eletroportáteis | Fritadeiras (air fryer); Liquidificadores e batedeiras; Cafeteiras; Aspiradores e robôs; Ventiladores | `MLB-AIR_FRYERS`; `MLB-BLENDERS`; subcategorias de `MLB438287` (Cozinha) e `MLB438286` (Casa), folhas a enumerar na fase 1 (não enumeradas nesta pesquisa); `MLB-ROBOT_VACUUMS`; `MLB1645` |

Notas:
- Celulares e smartwatches não foram pedidos. Ficam fora do escopo; se o dono quiser, entram como categoria própria (alta liquidez de vendedores, mas variantes de capacidade e cor complicam o dedup).
- O mapeamento é por **`domain_id`** do produto de catálogo (a busca devolve `domain_id` em cada resultado) e, como reserva, pela categoria folha. Proposta de tabela `external_category_map` (rede, tipo `domain`|`category`, id externo, `category_id` interno). Domínio sem mapeamento **não cria master**: vai para um log de rejeitados. É a versão tecnologia da regra "nunca cair em `unknown`".
- Domínios vizinhos poluem a busca por palavra-chave [medido]: "notebook" devolveu 140 notebooks em 200, o resto mochila, suporte, memória, caderno; "smart tv" devolveu 183 TVs e 12 controles remotos; "aspirador de po" devolveu 0 aspiradores em 200 (só sacos e robôs). O filtro por domínio é obrigatório, e as consultas precisam ser escolhidas por domínio (testadas).

### 1.3 Campos

O que já existe e passa a ser usado: `brand_id`, `category_id`, `gtin` (único), `mpn`, `attributes`, `default_images`, `meli_catalog_id` (único parcial).

| Campo | Situação | Uso |
|---|---|---|
| `gtin` | existe, 0 preenchidos | GTIN-13 normalizado (o ML devolve `07895808849004` com zero à esquerda e códigos de 8 a 14 dígitos). Fonte: atributo `GTIN` do produto de catálogo. Presente em 91% das TVs, 90% dos notebooks, 86% das geladeiras, 67% das air fryers, 74% dos micro-ondas [medido, amostras de ~100 a 190 produtos por domínio; veja 2.4]. |
| `brand_id` | existe, `brands` vazia | Atributo `BRAND`. Presente em 100% dos produtos de domínio amostrados. |
| `model_key` | **novo** (text) | `ALPHANUMERIC_MODEL` quando existe, senão `MODEL`, normalizado (minúsculas, sem espaços/hífens). `MODEL` existe em 94% das TVs mas só em 31% dos notebooks; `ALPHANUMERIC_MODEL` em 57% das TVs. |
| `variant_key` | **novo** (text) | Atributos discriminantes por categoria, definidos em `categories.attribute_schema` (ver 1.4). |
| `dedup_key` | **novo** (text) | Chave final de identidade (ver 1.4). |
| `attributes` (jsonb) | existe | Subconjunto dos atributos ML (`DISPLAY_SIZE`, `VOLTAGE`, capacidade, etc.) em `attributes.ml`, para filtros e página de produto. |
| `product_type` | existe | Ver 1.5. |

### 1.4 Chave de dedup para eletrônicos

Ordem de decisão (a primeira que resolver vence):

1. **GTIN-13 normalizado** igual: mesmo produto. Já existe índice único em `gtin`, que serve de rede de proteção.
2. **Marca + modelo + variante**, quando não há GTIN: `dedup_key = brand | model_key | variant_key`, com os discriminantes por categoria:
   - Smart TV: tamanho da tela em polegadas (`DISPLAY_SIZE`); o código do modelo costuma já conter o tamanho (ex.: `32S5K`).
   - Notebook: `ALPHANUMERIC_MODEL`/`MODEL` completo + processador + RAM + armazenamento. `MODEL` sozinho é genérico demais em 69% dos casos [medido], então a falta de GTIN em notebook cai para revisão manual, não para fusão automática.
   - Geladeira, micro-ondas, máquina de lavar, air fryer: capacidade (litros/kg) + voltagem (`VOLTAGE`: 127V, 220V, bivolt).
   - Ar-condicionado: BTU/h + ciclo (frio ou quente/frio) + inverter + voltagem.
3. **Cor fica fora da chave por padrão** (decisão D2 do dono): a cor raramente muda o preço e o ML costuma catalogar uma cor por `catalog_product_id`. Se a cor ficar fora, dois catálogos de cores diferentes **devem** poder apontar para o mesmo master. Hoje isso não é possível (um master tem um só `meli_catalog_id`) e há um risco concreto: `applySnapshotsToGroup` acha o placeholder da oferta por (master, rede, `seller_id IS NULL`) com `limit(1)`; com dois catálogos no mesmo master, escolheria o placeholder errado. Portanto: **no piloto, 1 master = 1 `catalog_product_id`** (mais a fusão por GTIN/chave quando o próprio ML duplicar o catálogo, como no incidente de 2026-07-29). Fusão de cores com tabela de aliases (`master_product_external_refs`) só na fase 3 e com o placeholder filtrando também por `external_ref`.
4. **Marcadores que impedem fusão** (equivalente de `MARKER_WORDS`): recondicionado, vitrine, open box, usado, seminovo, importado, versão global, kit, combo, lote, peça, reposição, compatível. A busca de domínio já exclui a maior parte (peças e acessórios têm outros domínios), e o coletor só aceita `condition = 'new'`.
5. **Não reutilizar `normalizeTitle`**. Criar `src/lib/affiliate/tech-dedup.ts` (funções puras, mesma interface de `findExistingMasterProduct`) e fazer `findExistingMasterProduct` despachar por tipo. Sem `PLATFORM_STRIP`, sem remoção de GB/TB, sem "full" como ruído (é Full HD).
6. A regra de "checar duplicata antes de inserir" continua valendo para toda rotina que cadastra master (descoberta de tecnologia, admin, criação de oferta), e o índice único parcial em `dedup_key` (onde `product_type = 'tech'`) é a rede de proteção. Antes de ligar a descoberta, rodar um relatório de dry-run como o `dup-report`, com contagem de grupos suspeitos.

### 1.5 "Um jogo, uma média" vira "um produto, uma média"

- Reescrever a regra de `AGENTS.md` e da skill `regras-negocio-egeek` como: *a mesma mercadoria nunca existe como mais de um `master_product`; a média é a soma de todas as cotações de todas as lojas que cobrimos, dividida pelo total de cotações; a oferta é sempre comparada à média única do produto.* A definição de identidade passa a ser por tipo: jogo = título + plataforma + edição; tecnologia = GTIN, senão marca + modelo + variante.
- Mecanicamente nada muda no cálculo: ADR 0001 e `product-price-stats.ts` já operam por `master_product_id`. Selo e veredito continuam exigindo 5 cotações e 14 dias de histórico; sem isso "histórico curto". O "em linha" de ±5% e o piso de plausibilidade de 35% da mediana (ADR 0002) devem ser **recalibrados por categoria com dado real** depois de algumas semanas (preços de eletrônicos oscilam em escalas diferentes das de jogos); até lá mantêm-se as constantes.
- **Risco para a regra "todas as cotações"**: TVs e celulares têm muitos vendedores (mediana de 2 vendedores novos por TV, mas até 14 na amostra; celulares até 67). Limitar a "os N mais baratos" tornaria a média enviesada para baixo e violaria o texto da regra. Decisão D3 do dono: persistir todos os vendedores (custo de linhas) ou persistir só os N mais baratos e declarar isso na tela. Recomendo todos os vendedores no piloto, depois medir.
- Defeito de composição a evitar: o item "média" não pode ser ponderado por oscilação (ver seção 3.2). Hoje a média por cotação é puxada pelas ofertas que oscilam.
- Indicadores globais (`getPlatformStats`, tabela de preços, ranking, "Preço Médio Geral") **precisam de escopo por tipo** (`product_type` ou categoria) antes de entrar o primeiro produto de tecnologia.

### 1.6 Enum `product_type` e a coluna de plataforma

Decisão técnica recomendada: **adicionar o valor `tech` ao enum `product_type`** (migration `ALTER TYPE ... ADD VALUE`, em migration separada, fora de transação) e usar `category_id` para a categoria real. Alternativa avaliada: coluna nova `vertical`. Rejeitada porque `product_type` é NOT NULL e todo master de tecnologia teria de carregar um valor falso de games. O custo da recomendação é irreversibilidade de `ADD VALUE` (inofensivo) e a auditoria dos pontos que tratam "qualquer coisa que não seja console/accessory" como jogo; um exemplo concreto: `search-products.ts` linha 539 mapeia qualquer tipo diferente de console/accessory para `game`. Os 23 arquivos que citam `gamePlatformGen`/`productType` precisam de revisão, listados na seção 1.8.

`game_platform_gen`, `game_format`, `game_edition_*` ficam como estão (valores `unknown` para tecnologia). Não renomear nem remover colunas.

### 1.7 Migrations (descrição, nada aplicado)

Todas aditivas e reversíveis, salvo o `ADD VALUE`. Na pasta `drizzle/migrations` o histórico é uma só pasta; manter o padrão atual de numeração.

| # | Migration | Detalhe | Risco |
|---|---|---|---|
| M1 | `ALTER TYPE product_type ADD VALUE 'tech'` | Isolada, sem outras instruções na mesma transação. | Baixo. |
| M2 | `master_products`: colunas `model_key`, `variant_key`, `dedup_key` (text, nulas) e índice único parcial `(dedup_key) WHERE product_type = 'tech' AND dedup_key IS NOT NULL` | Nulas não bloqueiam as 4.699 linhas atuais. | Baixo. |
| M3 | Dados de referência: `categories` (taxonomia 1.2, com `attribute_schema`) e `brands` (derivadas do atributo `BRAND` da API) | São dados de referência, não de mercado. Fonte: a própria API. | Baixo. |
| M4 | Tabela `external_category_map` e `discovery_candidates` (ref do catálogo, domínio, `last_probe_at`, resultado da sonda: `has_offer`/`no_offer`/`error`) | Evita repetir sonda em ~80% de catálogo sem oferta. | Baixo. |
| M5 | `affiliate_price_daily` e `master_price_daily` (ver 3.4) + função de agregação + job `pg_cron` | Aditiva. | Médio (lógica de agregação). |
| M6 | (fase 3) `master_product_external_refs` (master, rede, tipo de ref, ref) para vários catálogos por master | Só quando a cor sair da chave. | Médio. |
| M7 | Índices: `master_products (product_type, category_id)`, `affiliate_offers` já tem os parciais necessários | `CREATE INDEX CONCURRENTLY`. | Baixo. |

### 1.8 Código a tocar (levantamento)

`dedup.ts` (despacho por tipo), novo `tech-dedup.ts`, `discover-products.ts` (1.018 linhas: hoje só games, consoles, acessórios; novo `discover-tech-products.ts` separado, sem mexer no de games), `mercado-livre-classify.ts` (nova resolução de categoria por mapa, sem regex de "jogo"), `search-products.ts` (parâmetro `productType`/`categoria`, índice de sugestão por tipo, linha 539), `query-normalize.ts` (`extractPlatforms` não deve agir em consulta de tecnologia), `price-table.ts`, `home-search.ts`, `price-watches.ts`, `price-history.ts`, `affiliate.ts`, `public-offers.ts`, `getPlatformStats`, componentes `offer-card.tsx`, `price-table-board.tsx`, `search-results-view.tsx` (rótulo de tipo `TYPE_LABEL`), `sales-highlights.tsx`, `app-header.tsx`. Lista de arquivos obtida por `grep` de `gamePlatformGen` em `src`.

---

## 2. Descoberta de produtos pela API oficial do Mercado Livre (medições de 2026-10-31)

### 2.1 Método e credencial

- Somente chamadas **GET**, leitura apenas. Nenhum POST, nenhuma gravação.
- O token do app **não está em `.env.local`** (o arquivo só tem chaves do Supabase e da Vercel). Ele fica em `system_config` (chave `mercado_livre_oauth`). Li o `access_token` (válido por mais 52 minutos) com um SELECT e usei em arquivo temporário de scratchpad, nunca impresso. **Não** acionei o refresh, porque o refresh do ML rotaciona o `refresh_token` e exigiria escrever no banco.
- Intervalo entre chamadas de 150 a 450 ms; mesmo assim apareceu um **HTTP 429** em rajada rápida de buscas (4 chamadas grandes seguidas); ritmo sustentado de 2,7 req/s em `/products/{id}/items` (60 de 60 OK) e 1,4 req/s em `/products/search` com limit 100 (40 de 40 OK). A API não devolve cabeçalhos de cota. **A cota oficial por app não foi confirmada**; tratar como desconhecida e medir em produção.

### 2.2 Endpoints: o que funciona e o que está bloqueado [medido]

| Endpoint | Resultado | Serve para |
|---|---|---|
| `GET /sites/MLB/search?q=...` | **403** `forbidden`, com token | Bloqueado. Nenhuma busca clássica, nem por categoria, nem por `catalog_product_id`. O coletor atual ainda o chama a cada produto (ver 3.1). |
| `GET /items/{id}` e `GET /items?ids=` | **403** `access_denied` por item (item de terceiros) | Bloqueado. Sem detalhe de anúncio de terceiro. |
| `GET /products/search?site_id=MLB&status=active&q=...` | 200. `paging.total` limitado a 10.000. Devolve `id`, `domain_id`, `name`, `attributes` (BRAND, MODEL, GTIN, DISPLAY_SIZE, VOLTAGE…), `pictures`, `status` | **Descoberta**. Sem filtro de categoria. |
| mesma, sem `q`, `product_identifier`, `parent_product_id` ou `attributes` | 400 "must be provided" | Não há como "listar tudo" nem "listar por categoria". Parâmetros `category`, `category_id`, `domain_id` são ignorados quando há `q`. `attributes=BRAND:x` sozinho dá 400. |
| paginação | `limit` máximo 100; `offset` máximo 100 (101, 110, 150, 500 dão 400). `search_after` e `last` são **ignorados** (retornam a primeira página de novo). | **No máximo 200 resultados por consulta.** O universo se constrói por muitas consultas. |
| `product_identifier=<GTIN>` | 200, exato | Dedup e verificação por GTIN. |
| `GET /products/{id}` | 200: nome, `domain_id`, `attributes` (até ~40), fotos, `main_features`. `buy_box_winner` veio **null** mesmo em produtos com ofertas | Atributos e imagem. Não usar para preço. |
| `GET /products/{id}/items?limit=100` | 200 com ofertas (preço, `original_price`, `seller_id`, `item_id`, `condition`, frete, selo oficial) ou **404 "No winners found"** | **Preço oficial por vendedor.** Frete aparece no retorno, mas não será usado nem exibido. |
| `GET /highlights/MLB/category/{id}` | 200, **sempre 20** itens (limite ignorado), tipo `PRODUCT` (a maioria) / `ITEM` / `USER_PRODUCT` | Semente de alta qualidade: **60 de 60** produtos testados (TVs, geladeiras, notebooks) tinham oferta ativa. Só catálogo `PRODUCT` interessa. |
| `GET /trends/MLB/{category}` | 200, 50 palavras-chave | Sementes de consulta por categoria. |
| `GET /categories/{id}` | 200 sem token. Mostra filhas e `total_items_in_this_category` | Árvore de categorias. **O total é de anúncios, não de produtos de catálogo.** |
| `GET /categories/{id}/attributes` | 200 (121 atributos em TVs) | Definir `attribute_schema` por categoria. |
| `GET /sites/MLB/domain_discovery/search?q=` | 200, devolve `domain_id` e `category_id` | Ferramenta do admin (palavra livre para domínio). |
| `GET /sites/MLB/categories` | 200 | Raízes. |
| `GET /domains/{id}`; `/sites/MLB/category_predictor/predict` | 404 | Indisponíveis. |

### 2.3 Categorias do ML que cobrem cada grupo pedido

Total em anúncios (não catálogo) [medido]: Televisores 10.383 · Notebooks 50.424 · Computadores (desktop) 60.155 · All In One 4.468 · Mini PCs 14.081 · Monitores 39.217 · Tablets 34.933 · Impressoras 26.981 · Roteadores 42.738 · Geladeiras 8.273 · Freezers 4.188 · Micro-ondas 9.472 · Fogões 15.629 · Fornos 10.577 · Cooktop 20.129 · Máquinas de Lavar 7.354 · Máquinas de Secar 5.796 · Lava-Louças 6.521 · Ares Condicionados 11.394 · Ventiladores 127.549 · Pequenos eletrodomésticos (Cozinha 885.643 e Casa 661.951, com folhas a enumerar). Os códigos estão na tabela 1.2.

### 2.4 Quantos produtos de catálogo cada categoria expõe (limite inferior) [medido]

Método: por domínio, 15 consultas "tipo + marca" com limit 100 (apenas a primeira página), contando ids únicos dentro do `domain_id` esperado. É **limite inferior** (cada consulta devolve até 200 e eu usei só 100). O `paging.total` não serve: bateu o teto de 10.000 mesmo para consultas específicas, porque a busca é frouxa.

| Domínio | Produtos únicos no domínio (≥) | GTIN | BRAND | MODEL | VOLTAGE | Com oferta ativa na amostra (/items) | Vendedores "new" por produto com oferta |
|---|---|---|---|---|---|---|---|
| Smart TVs | 653 | 91% | 100% | 94% | 54% | 4 de 25 e 6 de 24 (em duas amostras) | mediana 2, máx 14 |
| Notebooks | 938 | 91% | 100% | 31% | 0% | 3 de 25 | mediana 2, máx 4 |
| Geladeiras | 727 | 86% | 100% | 98% | 56% | 3 de 25 | mediana 5, máx 6 |
| Micro-ondas | 665 | 74% | 100% | 97% | 90% | 5 de 25 | mediana 4, máx 10 |
| Air fryers | 314 | 67% | 100% | 99% | 73% | 10 de 25 | mediana 8, máx 20 |
| Lavadoras | ≥ 74 (consulta fraca) | 89% | 100% | 47% | 30% | 0 de 25 | n/d |
| Ar-condicionado | ≥ 20 pela consulta "split"; a consulta "split inverter" trouxe 190 de 200 | 91% | 100% | 99% | 94% | 1 de 20 | 7 |
| Celulares (fora do escopo) | 768 | n/d | n/d | n/d | n/d | 8 de 25 | mediana 12, máx 67 |

Leitura: as amostras de preço são pequenas (20 a 25 produtos por domínio), então os percentuais de oferta ativa são **indicativos** (faixa de 0% a 40%), não valores exatos. O universo real **monitorável** por categoria hoje é da ordem de dezenas a poucas centenas de produtos por domínio, não milhares. Para o conjunto inteiro pedido (TV, computadores, informática, eletrodomésticos, eletroportáteis) a ordem de grandeza é de milhares, atingida só nas fases tardias.

### 2.5 Preço atual de forma oficial

Sim, para produtos de catálogo com ofertas. `/products/{id}/items` devolve preço de venda (`price`), preço riscado (`original_price`), vendedor, item e condição, e é o que o coletor já usa. Limites: (a) é preço de anúncio, não inclui desconto de cupom, Pix ou parcelamento; (b) produto sem vencedor devolve 404 (tratado como "sem oferta agora"); (c) catálogo "USER_PRODUCT" e itens sem catálogo não têm esse caminho; (d) sem estoque, que não será usado.

### 2.6 Estratégia de descoberta proposta

1. **Sementes de qualidade**: `/highlights` das categorias folha mapeadas, diária, só tipo `PRODUCT` (20 por categoria, custo de 1 chamada por categoria).
2. **Varredura por palavra-chave**: por domínio, lista de consultas "tipo + marca" (marcas obtidas do atributo `BRAND` do próprio retorno, não inventadas) com 2 páginas (200 resultados), semanal e rotativa por cursor, no modelo do que `discover-products.ts` já faz para games. Sementes extras de `/trends`.
3. **Filtro por domínio** (via `external_category_map`) e **sonda de preço**: uma chamada `/items` por candidato; só passa para `master_products` + `affiliate_offers` quem tem ao menos uma oferta `new`. Resultado da sonda gravado em `discovery_candidates` com nova tentativa mensal para quem deu 404.
4. **Dedup** (seção 1.4) antes de inserir.
5. Custo estimado por categoria (ex.: Smart TVs): 15 marcas × 2 páginas = 30 buscas + ~650 sondas = ~680 chamadas, cerca de 5 a 8 minutos em ritmo sustentado. Repetido semanalmente é desprezível frente à cota observada.

**O que está bloqueado ou não existe**: busca clássica, detalhe de item de terceiro, listagem por categoria, paginação profunda, filtro de categoria na busca de produtos, cota oficial (desconhecida), cupom de terceiros, GTIN em 100% dos produtos (faltam 9% a 33%), `buy_box_winner` confiável. Nada disso exige scraping; o desenho acima fica 100% em API oficial.

---

## 3. Coletor, volume, cota e custo

### 3.1 Como o coletor atual se aplica [código]

`collect-prices.ts` agrupa ofertas por (rede, `external_ref` = `catalog_product_id`), chama o adaptador da rede e grava um snapshot por vendedor via `recordPriceSnapshot` (só quando o preço muda). Isso serve a eletrônicos sem alteração de conceito. Pontos a corrigir antes de escalar:

1. **Chamada morta a cada produto**: `mercado-livre.ts` faz `GET /sites/MLB/search?catalog_product_id=...` (403 sempre). Dobra o número de chamadas e gera `console.error` por produto. Remover; manter apenas `/products/{id}/items`. Também há uso de `/sites/MLB/search?category=` em `discover-products.ts` (linha 839), igualmente morto.
2. **Oscilação por vendedor com dois anúncios** (achado crítico, seção 0 item 4) [medido; causa = hipótese]. Das 1.316 ofertas com snapshot nos últimos 7 dias, 418 (403 com `seller_id` definido, 15 placeholders) geraram 202.528 de 206.169 linhas; 371 delas têm 3 valores distintos ou menos em mais de 100 cotações. Exemplo real: uma oferta gravou 489.900 e 469.900 centavos com 1 segundo de intervalo, repetidamente. Correção sugerida (a validar com a investigação, antes de aplicar): por rodada, manter para cada (produto, rede, vendedor) apenas o **menor preço** entre seus anúncios, ou chavear a oferta por `item_id`. Decisão de regra: um vendedor com dois anúncios do mesmo catálogo conta como uma cotação (a mais barata) por rodada.
3. **Limite por rodada é em ofertas, não em produtos**: `MAX_OFFERS_PER_RUN = 150` com mediana de 2 e média de 3,7 ofertas por catálogo [medido] equivale a ~40 chamadas por rodada. Com o cron a cada 5 minutos, a capacidade efetiva é de cerca de 11.500 consultas de catálogo por dia, ou seja, ~574 catálogos atuais são visitados mais ou menos de hora em hora, **não a cada 15 minutos** como o comentário do código sugere [estimativa]. Para tecnologia, trocar o limite para "N catálogos por rodada" e usar cadência por camada: quente (acompanhado por usuário ou top 100) 15 min; geral 1 a 3 horas; frio (sem mudança há 14 dias) diário.
4. **429 sem recuo**: falha vira exceção e a oferta volta à fila, o que é seguro, mas sem espera exponencial. Adicionar `Retry-After`/jitter e teto de concorrência por rede.
5. **Expiração por 3 falhas** (`MAX_CONSECUTIVE_MISSES`) funciona; mas, como ~80% do catálogo está sem oferta, a sonda da descoberta evita criar produto morto.
6. **Placeholder** (`seller_id IS NULL`) por master: ver risco da seção 1.4 item 3.

### 3.2 Volume e cota [estimativa, premissas explícitas]

Hoje: 2.237 ofertas ativas do ML em 574 catálogos [medido]. Chamadas por dia = catálogos × (24h ÷ cadência).

| Cenário | Catálogos | Cadência média | Chamadas/dia | Taxa média |
|---|---|---|---|---|
| Piloto TVs | 150 | 1 h | 3.600 | 0,04/s |
| Fase 3 (6 categorias) | 1.000 | 1 h | 24.000 | 0,28/s |
| Escala cheia | 3.000 | 1 h + quente 15 min em 10% | ~100.000 | ~1,2/s |

O ritmo sustentado medido sem 429 (2,7 req/s em `/items`) cobre todos os cenários, mas a cota diária/horária oficial é desconhecida; incluir contador de chamadas e de 429 na saída do cron antes de escalar. Tempo por rodada: concorrência 4, ~0,4 s por chamada, `maxDuration` 200 s na rota de coleta [código], ou seja, limite teórico de ~2.000 chamadas por rodada, muito acima do usado hoje.

### 3.3 Volume de dados e custo no Supabase

Medições: banco 566 MB; `affiliate_price_snapshots` 3.030.027 linhas, 530 MB (~175 bytes por linha com índices); 27.000 a 31.800 snapshots/dia nos últimos 10 dias; `affiliate_offers` 10.343 linhas e 13 MB; `master_products` 4.699 linhas e 5 MB. Fonte `api` em 3.220.359 linhas.

Projeção para tecnologia, com o bug corrigido (premissas): mediana atual de 2 cotações por oferta por semana entre as ofertas que não oscilam; assumo 3 vezes isso para eletrônicos (12 por oferta por semana, hipótese a validar, as promoções de Black Friday e variação de vendedor aumentam); 6 ofertas por catálogo (média atual 3,7, TVs até 14).

| Catálogos | Ofertas | Cotações/dia | Linhas/ano | Tamanho/ano (175 B) |
|---|---|---|---|---|
| 150 | 900 | ~1.500 | 0,6 M | ~0,1 GB |
| 1.000 | 6.000 | ~10.000 | 3,7 M | ~0,6 GB |
| 3.000 | 18.000 | ~31.000 | 11,5 M | ~2 GB |

Com o bug atual (50 vezes mais linhas nas ofertas afetadas), o mesmo catálogo de 3.000 produtos chegaria a dezenas de GB por ano. **O plano do Supabase em uso não está documentado no repositório**: 566 MB já passa de 500 MB (limite do plano gratuito, conforme meu conhecimento; confirmar com o dono), logo provavelmente é pago. Decisão D5.

### 3.4 Retenção e agregado diário

Proposta, em duas camadas:

- **Bruto**: manter `affiliate_price_snapshots` completo por 90 dias (leituras de gráfico de curto prazo, selos, "queda recente").
- **Agregado diário**, tabelas novas (migration M5):
  - `affiliate_price_daily (offer_id, day, first_cents, last_cents, min_cents, min_at, max_cents, n_quotes, sum_cents, n_clean, sum_clean_cents)`, chave (offer_id, day).
  - `master_price_daily (master_product_id, day, min_cents, min_at, n_quotes, sum_cents, n_clean, sum_clean_cents, n_offers_active)`.
  Guardar **soma e contagem** (não a média do dia) preserva exatamente a média única: `Σ soma ÷ Σ contagem` entre dias e lojas é idêntica à do bruto. O mínimo por dia preserva o "menor preço já registrado" exato (data com precisão de dia mais horário em `min_at`).
- **Outlier (>2x a média bruta, ADR 0001)**: a regra precisa do bruto. No agregado, gravar também `n_clean` e `sum_clean_cents`, calculados na hora da agregação com a média bruta do produto vigente naquele dia. Resultado equivale ao atual para dados recentes e fica congelado para os antigos; documentar a diferença no ADR.
- **Leitura**: `product-price-stats.ts` passa a unir agregado (> 90 dias) com bruto (≤ 90 dias). Hoje faz 3 varreduras de snapshots por produto; com agregado a varredura longa cai de milhares de linhas para um valor por dia.
- **Job**: `pg_cron` diário que agrega o dia fechado, verifica contagem (Σ bruto = Σ agregado), e só depois marca o dia como "agregado confirmado".
- **Conflito com regra existente**: o Blueprint e a skill dizem "histórico completo preservado, nunca truncado" e "nunca deletar `affiliate_price_snapshots`". Apagar bruto contraria isso. Alternativas, em ordem de segurança: (1) não apagar, só particionar por mês (`affiliate_price_snapshots` particionada por `collected_at`) e mandar partições antigas para armazenamento frio (exportação Parquet/CSV no Storage) mantendo o agregado no banco; (2) apagar o bruto antigo **somente da categoria tecnologia**, depois de agregado confirmado; (3) não reter nada (inviável em escala cheia). Decisão D4 do dono. Para o catálogo de games, não propor nada: 3 milhões de linhas e 530 MB são suportáveis; resolver o bug de oscilação já reduz a tabela de forma relevante (as 418 ofertas oscilantes concentram quase tudo o que entra por semana), mas **remover o histórico oscilante existente é mexer em dado histórico e exige aprovação explícita**.
- **Redução na origem** (barata, sem apagar nada): corrigir a oscilação (3.1.2); gravar nova cotação só se a variação for ≥ R$ 1,00 ou ≥ 0,5% (parâmetro por categoria, decisão de produto, afeta a definição de "cotação").

---

## 4. Interface

Sem frete, prazo ou estoque em nenhuma tela (o retorno da API traz frete; a camada de leitura não o expõe).

- **Navegação** (`app-header.tsx`, hoje: Sobre, Ofertas, Hype Zone, Inteligência Gamer, Notícias): novo item de topo **Tecnologia** (`/tecnologia`), com filhos pelas categorias de nível 1 (`/tecnologia/tvs`, `/tecnologia/computadores`, …). Só entra no menu categoria com produtos elegíveis (regra de dado real: não exibir categoria vazia). No celular, entrada correspondente em `mobile-nav-drawer.tsx` e `bottom-tab-bar.tsx`.
- **Busca** (`/pesquisa`): abas Jogos | Consoles | Acessórios | **Tecnologia**; dentro de Tecnologia, filtros por subcategoria, marca e variante. As abas de games não mudam; por padrão uma consulta sem aba continua em Jogos; "Todas" só quando houver volume. Sugestões (`suggestProducts`) por tipo, para o índice em memória não crescer sem controle.
- **Página de categoria** (`/tecnologia/[categoria]`): título e contagem de produtos com preço atual; "menores preços hoje" (ofertas públicas, ADR 0002); maiores quedas de preço (≥ 5% em até 7 dias); filtros de marca, faixa de preço e variante (polegadas, litros, voltagem, BTU); selo e veredito só com histórico elegível; link para a página do produto e para a comparação por loja já existentes.
- **Hero e home**: mantém o foco de games no hero. Faixa "Tecnologia" abaixo da seção de games, com 4 categorias e o menor preço hoje de cada produto de destaque, ativada quando a categoria piloto tiver produtos elegíveis suficientes (limiar sugerido: 30). Indicadores globais da home permanecem restritos a games até existir escopo por tipo.
- **Monitoramento/alertas**: reutilizar a watchlist e o alerta por preço-alvo; o rótulo "Bolsa Gamer" é de games, usar "Bolsa de Preços" ou aba por tipo (decisão D6).
- **Imagens**: cada categoria precisa de imagem própria e inédita (regra "uma imagem, um lugar"; `grep` do caminho antes de usar). Banner e imagens de categoria via skill `padrao-visual-egeek`/`designer-marca`. Imagem do produto vem da própria API (`pictures`).
- **Páginas de produto**: reutilizar `/ofertas/[slug]`; exibir atributos-chave (`DISPLAY_SIZE`, voltagem, capacidade) a partir de `attributes.ml`.

---

## 5. Identidade e marca

- O Blueprint já prevê o terreno: tagline secundária "Tecnologia · Games · Cultura Pop · Ofertas" e o marketplace lista eletrônicos, informática e tecnologia. A expansão é coerente com o posicionamento "inteligência de preço", não é mudança de identidade.
- **Proposta**: manter "Espaço Geek 86" como marca-mãe e "Geek Deals" como o motor de preços; **Tecnologia** entra como seção (menu e rota), não como submarca nem site separado. Games continua o produto de entrada e o hero.
- Para não perder foco: (1) ordem de lançamento por afinidade geek: TVs (consumo de console), monitores, notebooks, depois casa e cozinha; (2) casa e eletrodomésticos podem ficar sob um agrupador de nome próprio ("Casa Conectada" ou "Tecnologia para Casa") em vez de misturar geladeira com notebook no mesmo menu; (3) o conteúdo editorial (Inteligência Gamer) continua gamer, e ganha uma série curta de dossiês de preço de tecnologia só quando houver dado real.
- Texto institucional e Blueprint devem ser atualizados (não feito aqui) para refletir que o Geek Deals deixa de ser "somente jogos".
- Risco de marca: a pessoa que vem por "Geek" estranhar geladeira. Mitigação acima. Decisão D6.

---

## 6. Fases, esforço e recomendação de piloto

### 6.1 Piloto recomendado: Smart TVs

Por quê:
1. **Estrutura de dados mais limpa** [medido]: GTIN em 91%, MODEL em 94%, BRAND em 100%, `DISPLAY_SIZE` presente; chave "marca + modelo + polegadas" resolve o caso sem GTIN.
2. **Domínio isolado**: 183 de 200 resultados da consulta "smart tv" são do domínio certo (ruído de controles remotos é pequeno e separável por domínio), ao contrário de notebooks (140 de 200) e aspiradores (0 de 200 na consulta testada).
3. **Fonte de qualidade**: `/highlights` de Televisores devolveu 20 de 20 produtos com oferta; é a semente mais confiável.
4. **Ticket alto e preço volátil**: o valor de "menor preço registrado" e "média" é visível ao usuário.
5. **Janela de calendário**: a Black Friday de 2026 cai em 27/11. Para os selos, o ADR 0001 exige 14 dias e 5 cotações; começar a coletar até meados de novembro faz o histórico ficar elegível a tempo do pico, **desde que a Fase 0 e a Fase 1 sejam concluídas rápido** (risco de calendário, ver 7).
6. Variantes simples: tamanho de tela quase sempre no modelo; voltagem pouco relevante (maioria bivolt).
Contra: mediana de apenas 2 vendedores novos por TV na amostra, então a "média de todas as lojas" é fina por produto; mitigação: exibir "N lojas" e só selar com os mínimos do ADR 0001.

Alternativa de segundo piloto: **air fryers** (mediana de 8 vendedores, 40% do catálogo com oferta, melhor para o argumento "menores cotações"), mas ticket baixo e GTIN em 67%. Notebooks ficam para depois: MODEL genérico em 69% e variações de CPU/RAM/SSD.

### 6.2 Fases e esforço (estimativa de um desenvolvedor, em dias úteis; premissa: sem imprevistos do lado do ML)

| Fase | Conteúdo | Dias |
|---|---|---|
| 0. Estabilizar | Investigar e corrigir oscilação por vendedor com dois anúncios (com dry-run e relatório antes); remover chamada morta ao `/sites/MLB/search`; limite por catálogos e não ofertas; recuo em 429; contador de chamadas; escopo por tipo nos indicadores globais; ADR 0004 (decisões do dono); atualizar regras no `AGENTS.md`/skill | 4 a 6 |
| 1. Piloto Smart TVs | M1 a M4; `tech-dedup.ts` com testes e dry-run; `discover-tech-products.ts` (highlights, varredura, sonda, mapa de domínios); classificador por mapa; aba Tecnologia e `/tecnologia/tvs`; QA com `qa-verificador` e `guardiao-catalogo` | 8 a 12 |
| 2. Agregado e retenção | M5, função de agregação, leitura unificada, verificação de somas, `pg_cron`; decisão D4 aplicada | 4 a 6 (pode correr junto da fase 1 após o dia 5) |
| 3. Expansão | Por categoria, usando o molde: monitores, air fryers, micro-ondas, geladeiras (2 a 3 dias cada); notebooks (+3 dias de dedup por configuração); aliases de catálogo (M6) se a decisão D2 for fundir cores | 15 a 20 |
| 4. Produto | Nav, home, SEO por categoria e marca, alertas, imagens de categoria, ajuste de selos por categoria com dados reais | 6 a 8 |

Total: aproximadamente 37 a 52 dias úteis (7 a 10 semanas). Piloto utilizável em 3 a 4 semanas.

---

## 7. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Oscilação por vendedor e média inflada pela repetição de cotações | Média e volume de dados errados; escala inviável | Fase 0 antes de qualquer descoberta de tecnologia; reprocessar média só com aprovação |
| Cota/429 desconhecidos da API | Coleta falha em escala | Contador, recuo com jitter, cadência por camadas, monitorar 429 no cron |
| Descoberta devolve catálogo sem oferta (75-85%) | Catálogo vazio e custo de sondas | Sonda antes de criar; `discovery_candidates` |
| ML catalogando o mesmo produto em dois `catalog_product_id` (incidente 2026-07-29) | Duas médias para um produto | Dedup por GTIN e chave antes de inserir; índice único; relatório de duplicatas semanal |
| Fusão acidental de variantes (GB, voltagem, polegadas) | Média errada | `tech-dedup.ts` próprio, dry-run, revisão manual quando falta GTIN em notebooks |
| Média de tecnologia com poucas cotações | Selo enganoso | Manter mínimos do ADR 0001, "histórico curto" |
| Piso e outlier calibrados para jogos | Ofertas corretas descartadas ou falsas aceitas | Recalibrar por categoria com dado real após 3 a 4 semanas |
| Indicadores globais misturados | Números absurdos na home | Escopo por tipo antes do piloto |
| Plano/limite do Supabase | Custo ou bloqueio | Decisão D5; agregado e redução na origem |
| Prazo da Black Friday (27/11) | Selos não ficam elegíveis a tempo | Cortar escopo: piloto só TVs, sem fase 2 antes do pico |
| Diluição da marca | Percepção | Seção 5 |
| Link de afiliado só com `matt_tool` configurado | Sem comissão se faltar a variável | Hoje todas as 2.238 ofertas ativas do ML têm `affiliate_link_pending = false` [medido]; manter a verificação em QA |
| Scraping | Violação da decisão de 2026-10-28 | Nenhuma etapa deste plano usa scraping; a dívida existente continua em `docs/divida-coleta-sem-api-oficial.md` |

## 8. Decisões que dependem do dono

| # | Decisão | Recomendação |
|---|---|---|
| D1 | Categoria piloto | Smart TVs |
| D2 | Cor entra ou não na chave de identidade (fundir cores num produto só?) | Fora da chave, mas só a partir da fase 3; no piloto 1 master = 1 catálogo |
| D3 | Persistir todos os vendedores ou só os N mais baratos (a segunda opção contraria "todas as cotações") | Todos no piloto; medir antes de limitar |
| D4 | Retenção: apagar bruto antigo de tecnologia, só particionar/arquivar, ou nada | Agregado diário + arquivar partições antigas; apagar apenas depois de agregado confirmado e com aprovação |
| D5 | Plano e orçamento do Supabase | Confirmar plano atual (566 MB em uso) |
| D6 | Nome da seção ("Tecnologia"), agrupador de casa, rótulo "Bolsa Gamer" | Tecnologia como seção; casa em agrupador próprio |
| D7 | Incluir celulares e smartwatches? | Não nesta etapa |
| D8 | Corrigir a oscilação reescrevendo ou removendo cotações históricas oscilantes (mexe em histórico e na média dos jogos atuais) | Corrigir só a gravação daqui para frente; qualquer limpeza do passado exige aprovação explícita e relatório prévio |
| D9 | Mudar o texto das regras inegociáveis para "um produto, uma média" | Sim |
| D10 | Parâmetro de variação mínima para gravar cotação nova (R$ 1,00 ou 0,5%) | Aprovar valor após ver a distribuição real |

## 9. O que não foi verificado

- Cota oficial de requisições do app (a API não expõe cabeçalhos).
- Se `/products/search` sem o termo "status=active" traria mais produtos; não testado.
- Folhas de Pequenos Eletrodomésticos (Cozinha, Casa) e de Componentes/Armazenamento; só os domínios `MLB-AIR_FRYERS`, `MLB-BLENDERS`, `MLB-ROBOT_VACUUMS` foram vistos.
- A causa exata da oscilação (hipótese forte, não provada por leitura do pipeline de gravação ou por replay).
- Percentual definitivo de catálogo com oferta ativa por domínio (amostras de 20 a 25).
- Plano contratado do Supabase.
- Comportamento do `matt_tool` em links de categorias novas (esperado igual ao de games).
