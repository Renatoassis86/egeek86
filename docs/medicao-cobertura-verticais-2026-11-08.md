# Medição de cobertura por vertical (Mercado Livre e Shopee), 2026-11-08

Medição pontual, somente leitura, autorizada pelo dono (teto de 60 chamadas ao Mercado Livre e 3 à Shopee Affiliate Open API). Script: `scripts/medir-cobertura-verticais.ts` (tsx, `--env-file=.env.local --conditions=react-server`). Nada foi gravado no banco, nenhum token foi impresso ou salvo, sem scraping, sem dado inventado. O token ML foi lido por SELECT de `system_config` (não houve renovação, que gravaria no banco).

## Resumo de consumo
- **ML: 58 de 60 chamadas** (41 com HTTP 200, 1 com 206, 16 com 404 "No winners found"; nenhum 429, nenhum 5xx). Latência mediana 232 ms, máxima 2.778 ms (a `/products/search` é a mais lenta: 0,2 a 2,8 s).
- **Shopee: 0 de 3 chamadas.** `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_APP_SECRET` não existem no `.env.local` nem no ambiente do processo (o adapter exige as duas). Não tentei contornar nem usar credencial de outra origem.
- **Rate limit:** a API do ML não devolveu nenhum cabeçalho de cota (`X-RateLimit-*`, `Retry-After`): só `x-request-id`. Limite por tempo e cota por app NÃO foram observados.

## Como a amostra foi montada (e o viés dela)
1. 1 busca `GET /products/search?status=active&site_id=MLB&q=...&limit=10` por vertical (13 chamadas).
2. 1 `GET /products/{id}` + 1 `GET /products/{id}/items?limit=100` no primeiro resultado do domínio esperado (26 chamadas).
3. Onde deu 404, uma 2ª tentativa só em `/items` num outro catálogo do mesmo domínio, o de mais atributos (10 chamadas).
4. Multiget `/items?ids=` nos itens achados (7 chamadas), 1 sonda no formato exato do coletor (1) e `/users/{id}` (1).

Viés: a busca não é ordenada por relevância confiável (para "ssd 1tb" o 1º resultado foi um notebook; "soundbar" trouxe controle remoto e suporte; "bola" trouxe balão e mochila), e `paging.total` satura em 10.000. A amostra é de 1 a 2 catálogos por vertical, não do universo: os números abaixo mostram o que existe, não uma taxa de cobertura.

## Tabela por vertical
Colunas de busca: dos 10 resultados, quantos no domínio-alvo e quantos trazem o atributo com valor. "Ofertas" = anúncios em `/products/{id}/items` do catálogo testado.

| Vertical | Total na busca | No domínio-alvo (de 10) | GTIN | MPN | Catálogo testado | Ofertas (itens / vendedores) | Condição | Faixa de preço (R$) |
|---|---|---|---|---|---|---|---|---|
| notebook | 10.000+ | 7 | 7 | 1 | 2 catálogos, ambos 404 sem ofertas | 0 | n/d | n/d |
| SSD | 8.878 | 7 | 9 | 0 | 2 catálogos, ambos 404 | 0 | n/d | n/d |
| placa de vídeo | 6.529 | 10 | 10 | 4 | MLB49575556 | 6 / 4 | 6 novo | 12.599 a 14.919 |
| impressora 3D | 10.000+ | 3 (resto filamento) | 7 | 1 | MLB57441703 | 1 / 1 | 1 novo | 500 |
| impressora | 10.000+ | 10 | 8 | 0 | MLB25707943 | 5 / 3 | 5 novo | 3.984 a 5.469 |
| smart TV | 10.000+ | 10 | 8 | 0 | 2 catálogos, ambos 404 | 0 | n/d | n/d |
| soundbar | 1.331 | 6 | 8 | 1 | MLB65128496 | 3 de 4 (HTTP 206) / 3 | 3 novo | 1.000 a 1.941 |
| livros | 10.000+ | 10 | 10 (ISBN vem em GTIN) | 0 | MLB71760033 | 16 / 16 | 16 novo | 58 a 142 |
| geladeira | 1.923 | 10 | 10 | 0 | 2 catálogos, ambos 404 | 0 | n/d | n/d |
| air fryer | 5.328 | 8 | 7 | 0 | MLB26034306 | 2 / 2 | 2 novo | 164 a 340 |
| máquina de lavar | 10.000+ | 9 (1 de brinquedo) | 10 | 0 | 2 catálogos, ambos 404 | 0 | n/d | n/d |
| tênis de corrida | 10.000+ | 10 | **0** | 0 | 2 catálogos, ambos 404 | 0 | n/d | n/d |
| bola de futebol | 10.000+ | 8 (balão, mochila) | 10 | 0 | MLB22815604 | 4 / 3 | 4 novo | 79 a 110 |

Leitura direta:
- **Catálogo existe em todas as 13 verticais**, mas só **7 de 13** tiveram um catálogo com oferta em até 2 tentativas. Dos 23 catálogos cuja lista de ofertas foi consultada, **16 responderam 404 "No winners found"** (o catálogo existe, sem vendedor ativo). A busca devolve catálogos mortos com frequência: semear por "primeiro resultado da busca" desperdiça cota.
- **Ofertas por catálogo nos que têm vendedor:** 1, 2, 3 (de 4), 4, 5, 6 e 16. Mediana 4. Muito mais rasos que o tamanho típico de catálogo de jogo.
- `paging` de `/products/{id}/items`: `{total, offset, limit:100}`, igual ao que o coletor já assume. Nenhum catálogo medido passou de 16 ofertas; o comportamento acima de 100 NÃO foi observado nesta medição.
- **HTTP 206 no soundbar:** `paging.total = 4` mas vieram 3 itens. Se o caminho paginado do coletor trata "itens únicos menores que o total" como falha (ata de 06/11, `paging-inconsistente`/incompleto), esse catálogo falharia sempre. A causa do 206 (item removido na entrega?) não foi investigada.

## Identidade: GTIN, MPN, marca, modelo
- **`/products/search` já traz `attributes` por resultado** (só os com valor). Presença nos 10 resultados de cada vertical: BRAND 10/10 em 12 verticais (livros não têm BRAND), MODEL 8 a 10 (livros e máquina de lavar: 0), **GTIN entre 7 e 10 em 11 verticais, 0 em tênis de corrida**, MPN raro (4 em placa de vídeo, 1 em notebook, impressora 3D e soundbar, 0 no resto), ISBN como id separado: 0 (o ISBN vem em `GTIN`).
- **`/products/{id}` do 1º catálogo do domínio NÃO trouxe GTIN em nenhum dos 13 casos** (só BRAND/MODEL/LINE e atributos técnicos), enquanto os catálogos com mais atributos (os da 2ª tentativa) listam GTIN. Ou seja, GTIN depende do catálogo: catálogos mais ricos têm, os pobres não. Os valores de GTIN não foram lidos nesta medição (só a presença do atributo com valor).
- Livros: autor (`AUTHOR`), título (`BOOK_TITLE`), editora (`BOOK_PUBLISHER`), edição (`BOOK_EDITION`), capa (`BOOK_COVER`), ano, páginas; GTIN em 10/10 dos resultados.
- Atributos de identidade úteis por domínio (vistos nos resultados): notebook/TV/impressora `BRAND`+`MODEL`+`ALPHANUMERIC_MODEL`+`GTIN`; placa de vídeo `BRAND`+`SERIES`+`MODEL`+`EDITION`+`MEMORY_SIZE`+`MPN`+`GTIN`; geladeira `BRAND`+`MODEL`+`ALPHANUMERIC_MODEL`+`VOLTAGE`+`TOTAL_CAPACITY`+`GTIN`; tênis `BRAND`+`MODEL`+`VERSION`+`GENDER`+`COLOR`+`SIZE` (sem GTIN); SSD `BRAND`+`MODEL`+`CAPACITY`+`GTIN`. `VOLTAGE` e `COLOR` separam variantes legítimas (110/220 V).
- Há `parent_id` e `children_ids` nos catálogos (família de variantes); `children_ids` veio vazio em todos os `/products/{id}` consultados.

## Campos de oferta (`/products/{id}/items`, 37 itens em 7 catálogos)
- **Presentes em 100% dos itens:** `item_id`, `seller_id`, `price`, `currency_id`, `condition`, `listing_type_id` (`gold_pro` e `gold_special`), `category_id`, `warranty`, `shipping` (`free_shipping`, `logistic_type`, `mode`, `store_pick_up`, `local_pick_up`, `tags`, `cost`), `seller_address`, `accepts_mercadopago`, `tier`, `inventory_id`, `tags`, `deal_ids`, `sale_terms`, `user_product_id`, `min_purchase_unit`.
- **Parcial:** `official_store_id` (1 de 6 na placa, 1 de 5 na impressora, 1 de 3 no soundbar, 14 de 16 em livros, 3 de 4 na bola, 0 no resto). `original_price`: só na impressora (4 de 5); nulo nos outros 6 catálogos. `sale_price`: nenhum.
- **Ausentes neste endpoint:** `available_quantity`/estoque, título, `status`, `catalog_product_id`, `sold_quantity`. Estoque só existiria no item, e o item está bloqueado (próxima seção).
- **Frete grátis:** 2 de 3 (soundbar), 1 de 16 (livros), 1 de 4 (bola), todos nos demais. O campo existe; o frete efetivo ao CEP do cliente não.
- **Condição:** 37 de 37 `new`. Zero usado/recondicionado nas 7 listas. NÃO dá para extrapolar: pode ser que o endpoint de catálogo já filtre por novo, o que a ata de 06/11 não confirma.
- **Reputação do vendedor:** não vem em `/items`; vem em `GET /users/{seller_id}` (HTTP 200: `seller_reputation.level_id`, `power_seller_status`, `transactions.total`). Testado em 1 vendedor (`5_green`, platinum, 405.573 transações). Custo: 1 chamada por vendedor; NÃO foi testado se há cache/multiget de usuários.

## Bloqueio de `/items` com o token do app (achado importante)
`GET /items?ids=...` (7 chamadas, 37 ids) e a sonda no formato exato do coletor (`&attributes=id,title,...`, 3 ids) devolveram **HTTP 200 no envelope, mas 403 `access_denied` em TODOS os itens**. É o mesmo 403 já visto em `/items/{id}` na ata de 06/11. Consequências:
- Estoque, título original do anúncio, `status` e `catalog_product_id` do item não são obtidos pelo token atual.
- `fetchSellerTitles` (`mercado-livre.ts`, linha ~25) usa esse mesmo multiget; se o 403 vale em produção, `sellerTitle` volta nulo e a rechecagem de identidade por título original nunca acontece. **Precisa ser confirmado em produção** (não vi o log do coletor). Se confirmado, é risco para a defesa "Open Box/outra edição nunca representa o vendedor".
- A causa (escopo do app, item de terceiros) não foi investigada; hipótese não verificada.

## Recomendações de semeadura
1. **Semear por catálogo, não por termo.** Termo na busca devolve lixo (acessórios, brinquedo, catálogos mortos). Fluxo: busca → filtra pelo `domain_id` esperado → exige `GTIN` ou `MODEL`/`MPN` no atributo → só então chama `/items` e descarta 404 sem retentar. Orçamento: ~2 chamadas por catálogo candidato.
2. **Chave de identidade:** `GTIN` quando existir (11 de 13 verticais; livros = ISBN-13 no GTIN); senão `BRAND + MODEL (+ ALPHANUMERIC_MODEL)`; placa de vídeo `BRAND+SERIES+MODEL+EDITION+MEMORY_SIZE` (MPN em 4 de 10). Tênis: sem GTIN, usar `BRAND+MODEL+VERSION+GENDER+COLOR` e tratar tamanho como variante (`SIZE_GRID_ROW_ID`), nunca como produto.
3. **Verticais com melhor sinal agora:** livros (16 vendedores, GTIN 10/10), placa de vídeo (domínio 10/10, GTIN 10/10, mas só 6 ofertas), impressora. **Piores:** tênis (sem GTIN, 0 catálogos com oferta em 2 tentativas), máquina de lavar (catálogos mini/brinquedo sem MODEL), impressora 3D (domínio misturado com filamento).
4. **Aplicar a regra existente de plataforma/duplicata por analogia:** o `findExistingMasterProduct` por título+plataforma não serve; precisa de checagem de duplicata por GTIN/marca+modelo antes de criar o `master_product` fora de games.
5. **Resolver o bloqueio 403 de `/items`** antes de depender de estoque ou título para qualquer vertical nova.

## Riscos
- **Usado/recondicionado:** 0 nos 37 itens, mas amostra pequena e possível filtro do endpoint; eletrônicos (notebook, SSD, placa de vídeo, impressora) têm alto volume de usado/open box no ML. Precisa de medição própria antes de ligar (regra existente: Open Box fora das médias).
- **Variantes:** tênis (tamanho/cor), geladeira e TV (110/220 V), SSD (capacidade), placa de vídeo (edição/memória) geram catálogos irmãos (`parent_id`). Risco de juntar variantes ou de duplicar o mesmo produto em 2 catálogos (já ocorre em games).
- **Catálogos sem vendedor (404)** e **206 parcial** podem ser lidos como falha de coleta e, no regime tudo-ou-nada, travar o master.
- **Preço com poucas ofertas:** com 1 a 2 vendedores (impressora 3D, air fryer), "média de todas as ofertas" é frágil; a faixa é larga (air fryer R$ 164 a 340, soundbar R$ 1.000 a 1.941 para o mesmo catálogo).
- **Cota:** ~2,3 chamadas por catálogo útil, e a taxa de catálogo morto alta. Não foi medido limite de taxa.

## O que NÃO foi possível medir
- Shopee inteira: preço, preço original, IDs de produto/loja e categoria, por falta de `SHOPEE_AFFILIATE_APP_ID/SECRET` neste ambiente (0 de 3 chamadas gastas). O adapter só consulta `itemId, shopId, shopName, productName, priceMin, priceMax, sales, imageUrl, productLink, offerLink, ratingStar, priceDiscountRate`; categoria não está nesses campos (`productCatId` existe como filtro de entrada). Nenhuma validação ao vivo da Shopee foi feita.
- Estoque (`available_quantity`), `status`, `catalog_product_id` e GTIN no nível do item (403).
- Valores reais de GTIN, EAN, ISBN (só a presença do atributo).
- Cabeçalhos e limite de taxa do ML (não expostos); comportamento com mais de 100 ofertas; teto de `limit`.
- Proporção de usados/recondicionados (0 em 37, amostra insuficiente); em 6 verticais (notebook, SSD, smart TV, geladeira, máquina de lavar, tênis) não houve nenhum catálogo com oferta, então nada de `/items` foi medido para elas.
- Causa do 206 e dos 404 em catálogos "ativos".
- Reputação em mais de 1 vendedor; frete efetivo por CEP.

## Reprodução
`npx tsx --env-file=.env.local --conditions=react-server scripts/medir-cobertura-verticais.ts --fase busca|detalhe|segunda|itens|sonda|usuarios|shopee`, com `MEDICAO_ESTADO` e `MEDICAO_SAIDA` apontando para arquivos fora do repositório. O contador (60 ML, 3 Shopee) é cumulativo no arquivo de estado e o script aborta ao atingir o teto. Ele chamou 58 vezes; reexecutar sem apagar o estado só consome as 2 restantes.
