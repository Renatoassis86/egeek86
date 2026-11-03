# Parecer: Especialista em Preços (rodada 1, 2026-11-01)

Escopo: F-10, F-11, F-12, F-13, F-24, F-27 da `docs/auditoria-cowork-2026-11-01.md`. Somente leitura. Medições por SELECT em 2026-11-01, usando a definição de "oferta pública" do ADR 0002 reproduzida em SQL (7.868 ofertas públicas: Mercado Livre 7.665, Shopee 203).

## 1. Posição

**Apoio com ressalvas.** A arquitetura (fonte única, piso pela mediana, frescor) está certa; o que falta é régua de **confiança do vendedor** e **marca de oferta internacional**. Piso e teto por preço sozinhos não resolvem: o GT7 R$ 70 passa no piso por exatamente 35,0% da mediana. Nenhuma regra inegociável é violada pelas recomendações abaixo (sem dado sintético; só campos de API oficial; nada é apagado).

## 2. Leitura da situação

Rótulo: **[R]** real medido, **[H]** hipótese, **[Rec]** recomendação.

### F-11 GT7 R$ 70
- **[R]** Existem 3 `master_product` de GT7 ativos (mediana 248 com 6 ofertas; mediana 4.886 com 70 ofertas, mistura de edição/console; mediana 200 com 57 ofertas). O de R$ 70 tem mediana R$ 200: 70/200 = 0,350, e o piso é `>=` (`public-offers.ts:67`), então passa por borda. Vendedor da oferta: 1 a 5 vendas, sem reputação (`affiliate_sellers.total_sales`).
- **[R]** Piso de 35% e `PLAUSIBILITY_MIN_OFFERS = 3`: `public-offers.ts:27-29,66-67`; para o histórico `product-price-stats.ts:51-76` (mesma régua, mediana das cotações).
- **[R]** O vendedor nunca entra na elegibilidade. `getSellerTrustInfo` (`src/lib/affiliate/labels.ts:46-63`) só gera rótulo de UI; `minSellerSales` existe como filtro opcional (`affiliate.ts:182,227,1120`) mas nenhuma tela de destaque o liga por padrão (`rankFeaturedOfferIds`, `affiliate.ts:1085-1124`, só aplica se o filtro vier).
- **[R]** 59 ofertas públicas estão abaixo de 50% da mediana (136 abaixo de 60%); 40 das 59 têm vendedor com menos de 10 vendas ou sem vendedor.

### F-12 Internacional (Switch 2)
- **[R]** O banco NÃO guarda origem/internacional. `affiliate_offers` (`src/db/schema/affiliate_offers.ts:27-81`) não tem coluna de shipping, tags, país ou origem (consulta a `information_schema` sem colunas `intern/ship/tag/origin/country`). `affiliate_sellers` (`affiliate_sellers.ts:16-33`) só tem reputação, vendas e % positivo.
- **[R]** A resposta do coletor `/products/{id}/items` traz `item_id, price, original_price, currency_id, condition, seller_id, shipping{free_shipping,cost}` (`docs/mercado-livre-api.md:117-131`); o tipo no código só lê `item_id, price, original_price, seller_id, condition` (`discover-products.ts:410`, `mercado-livre.ts:10,40`). Nada sobre origem é lido.
- **[R]** Título como único sinal hoje: 105 de 7.868 ofertas públicas casam com internacional/importado/110v/tomada etc. (heurística ruidosa; "Modelo Nacional de Tomada" é nome de produto Nacional e casa por "tomada"). 
- **[H]** Atributo da API oficial a coletar: no item (`GET /items/{id}` só funciona para o próprio vendedor, doc seção 5, então depende do que o endpoint `/products/{id}/items` devolver por resultado) os candidatos são `shipping.logistic_type` / `shipping.tags`, `tags` do item (ex.: `cbt_item`, `international_delivery_mode`), `international_delivery_mode` e `seller_address.country.id` do vendedor (`GET /users/{seller_id}` já é chamado em `mercado-livre-seller.ts:67-71`; o mesmo payload traz `address`/`site_id` e `tags`). **Validar na resposta real antes de codar**; não afirmo o nome exato do campo.

### F-13 R$ 15.500 / R$ 12.500 como preço atual
- **[R]** Não existe teto no preço atual. A CTE `public_offers` só tem piso (`public-offers.ts:62-68`); o filtro de 2× média existe apenas no histórico (`product-price-stats.ts:229-231`). `currentLowestActive` pega o MENOR preço público (`:280`), então um outlier alto não vira "atual" a menos que seja o único. Mas ele aparece em listas por oferta, no máximo e no "Excelente" do Xbox.
- **[R]** Caso extremo: há oferta pública de "Console Nintendo Switch 2" a R$ 447.009 (erro de captura) com mediana R$ 4.360. Preço > 2× mediana: 159 ofertas (51 acima de 3×), em 6.334 ofertas de produtos com >= 3 ofertas.

### F-24 Reputação baixa em destaques
- **[R]** `getFeaturedOffers` não filtra reputação (`affiliate.ts:1085-1160`). Nas ofertas públicas: 253 "1_red", 54 "2_orange", 457 "3_yellow", 4.365 "5_green", 199 "4_light_green", **2.540 sem reputação (32%)**, dos quais 1.358 sem vendedor associado (Shopee 203 + ML 1.155) e 1.182 com vendedor mas reputação nula.
- **[R]** Como oferta MAIS BARATA do produto (a que vira preço atual/destaque): 34 de 1.803 produtos têm vendedor "red"; 916 (51%) têm vendedor com < 10 vendas ou sem dado. Esse é o tamanho real da exposição ao selo.

### F-27 Bundle
- **[R]** Existe detecção: `isBundleTitle` = `kit|lote|combo` apenas (`product-type-classifier.ts:306-308`); `dimensions.ts:367` acrescenta `\bbundle\b` e o resultado `bundle` sai em `DimensionResult` (`:96-97`). Porém a UI usa só `isBundleTitle(...)` (sem "bundle") para o selo (`offer-card.tsx:57`, `price-table-board.tsx:236,344`, `ofertas/[slug]/page.tsx:121`), por isso "Switch 2 + Mario Kart World Bundle" não recebe selo. Medido: 86 ofertas públicas com a palavra "bundle" que a regra do selo não pega (todas as 86 sem kit/lote/combo), 10 com " + "; por tipo (bundle|+): console 78, game 13, accessory 5.
- **[R]** O comentário de `dimensions.ts:96` promete "FORA da média/menor preço do console puro"; isso só vale para o que `bundle` marca, e a média/mínimo (`product-price-stats.ts`) não lê esse flag (não há referência a bundle no arquivo). **[H]** Bundle que cai no mesmo master que o console puro distorce média e mínimo.

### F-10 Reputação crua "5_green"
- **[R]** `monitoring-board.tsx:128-131` imprime `active.sellerReputationLevel` cru (`· 5_green`). O tradutor já existe (`getSellerTrustInfo`, usado em `offer-card.tsx:163` e `monitoramento/comparar/[masterProductId]/page.tsx:172`), então a correção é trocar o uso. O "3 lojas / 10 cotações" divergente é o item de fonte única (ADR 0001), fora deste parecer.
- Observação: `labels.ts:49-51` dá "Vendedor confiável · {powerSellerStatus}" com texto cru da API ("platinum"), e `powerSellerStatus` vence a cor vermelha (um vendedor "1_red" com power_seller seria "confiável"). **[H]** raro, mas a ordem deve checar red primeiro.

## 3. Riscos

1. **Manipulação**: vendedor novo cria anúncio-isca a 36-50% da mediana e fica logo acima do piso (já ocorre: 59 ofertas < 50%). Detecção: razão preço/mediana x vendas do vendedor.
2. **Falso positivo**: filtro rígido por reputação esconde 32% das ofertas (sem reputação) e quase todo o Shopee (sem vendedor). Reputação ausente NÃO é reputação baixa: tratar como "não verificado", não como exclusão.
3. **Internacional**: sem campo, qualquer regra por título erra ("Modelo Nacional de Tomada" tem a palavra tomada e é nacional). Risco de excluir oferta nacional legítima.
4. **Teto 2× mediana** corta lançamento/edição de colecionador (mediana de mistura). Em produto com mediana ruim (GT7 de R$ 4.886, que mistura console e jogo) corta o certo. Dedup (F-02) precede.
5. **Reputação desatualizada**: refresh só quando novo ou velho (`affiliate_sellers.ts:10-14`); `refreshedAt` precisa ser exigido.

## 4. Recomendação (em ordem; nenhuma apaga dado)

1. **Piso estrito e por confiança** (`public-offers.ts`): trocar `>=` por `>` e tornar o piso dependente do vendedor: piso 35% se vendedor com `total_sales >= 50` ou power seller; piso 60% se vendedor com < 10 vendas, sem vendas ou sem seller. Medido: afeta no máximo 136 ofertas públicas (< 60% da mediana), sendo 40+ de vendedor fraco. Constantes novas em `price-verdict.ts` junto de `PLAUSIBILITY_FLOOR_PERCENT`.
2. **Entrada em destaque e selos "menor preço"**: exigir vendedor "verificado" = reputação não vermelha/laranja E (`total_sales >= 10` ou power seller). A oferta continua pública e comparável; só deixa de ganhar selo "Menor preço já registrado" e vitrine (`getFeaturedOffers`, `affiliate.ts:1140-1149`: adicionar condição no `candidates`). Exposição: 34 produtos com vendedor red como mais barato; 916 com vendedor fraco/sem dado (impacto grande: aplicar primeiro só a red/orange e `total_sales < 10` explícito, 307 + 1.298 ofertas, e medir antes de ligar a de "sem dado").
3. **Teto**: oferta pública precisa de `preço <= 2 x mediana` (n >= 3) para entrar em "atual", máximo e lista; 159 ofertas (51 acima de 3×, incluindo o R$ 447.009). Continua visível na página da oferta com rótulo "preço muito acima do mercado".
4. **Internacional**: (a) coletar um atributo de origem; (b) nova coluna `affiliate_offers.is_international boolean` e `affiliate_sellers.country`; (c) enquanto não houver dado, NÃO inferir pelo título para excluir. Depois do dado: separar de "preço atual nacional" e mostrar "Internacional, sujeito a imposto" sem somar tributo (não há dado real de imposto; somar seria fabricar).
5. **Selo Bundle**: unificar a detecção numa função só (usar `DimensionResult.bundle` ou incluir `bundle` e " + " em `isBundleTitle`) e aplicar nos 4 pontos de UI; manter bundle fora da média do console puro lendo o flag em `product-price-stats.ts` (cobre 86 + 99 ofertas públicas).
6. **F-10**: em `monitoring-board.tsx:128-131` trocar `sellerReputationLevel` cru por `getSellerTrustInfo`, e reordenar `labels.ts:49-56` para checar red antes de powerSeller.
7. **NÃO fazer**: não deletar ofertas; não esconder vendedor sem reputação como se fosse ruim; não somar imposto estimado; não inferir "internacional" por regex de título; não aplicar teto sem antes resolver duplicata (F-02).

## 5. Dado que falta

- Payload real de `/products/{id}/items` e `/users/{seller_id}` do Mercado Livre para identificar o campo de origem/CBT (1 chamada de amostra com a Switch 2 internacional, MLB conhecida da auditoria).
- Cobertura de reputação: 1.182 ofertas com vendedor e reputação nula (refresh pendente?) e `refreshed_at` do cache.
- Backtest: das ofertas < 60% da mediana, quantas são reais (conferência manual de ~20 no ML).
- Separação de GT7: três masters de GT7 (um de mediana R$ 4.886 misturando console/jogo) indica dedup/classificação pendente que contamina mediana e teto.

## 6. Métrica de sucesso

- 0 ofertas públicas abaixo de 50% da mediana de vendedor com < 10 vendas (hoje 40) e 0 acima de 3× mediana (hoje 51).
- 0 selo "Menor preço já registrado" e 0 destaque com vendedor red/orange ou < 10 vendas (hoje 34 produtos com red como mais barato).
- 100% das reputações exibidas via `getSellerTrustInfo` (0 ocorrências de `_green|_red|_yellow` na tela).
- Bundles com selo: 185 ofertas hoje sem cobertura completa → 100%.
- % de ofertas ML com atributo de origem preenchido >= 95% após coleta.
- Taxa de falso positivo do filtro (oferta legítima barata excluída) < 5% no backtest manual.
