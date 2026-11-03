# ADR 0002: Piso de plausibilidade e frescor das ofertas públicas

Data: 2026-10-31. Status: proposta aplicada em código (parâmetros sugeridos na auditoria `docs/auditoria-egeek86.md`, decisão 4; o dono pode ajustar as constantes). Complementa o ADR 0001. Itens da auditoria: EG-03, EG-10, EG-13, EG-19, EG-22, N3.

## Contexto
- 8 ofertas Shopee ativas a exatamente R$ 11,00 em jogos de ~R$ 340, com 1 cotação cada, entravam como "preço atual" e "menor preço".
- `last_checked_at` não prova coleta: o coletor o grava no `finally`, inclusive quando a fonte lança erro (a fonte Shopee sempre lança). Medido em 2026-10-31: 3.854 ofertas Shopee ativas com `last_checked_at` dentro de 7 dias, mas nenhuma oferta Shopee criada há mais de 7 dias teve uma só mudança de preço, nem 1 snapshot, nos últimos 30 dias.
- O selo "menor preço já visto" usava `atual <= menor`, que é verdadeiro por definição com 1 cotação (139 de 200 ofertas amostradas). "Preço em queda" vinha dos 2 últimos snapshots de uma oferta isolada.
- `getActiveCouponsForDisplay` devolvia 5 cupons fixos (um "Verificado") quando a tabela estava vazia; `listRankedOffers` fazia `UPDATE master_products` dentro de uma leitura pública.

## Decisão
1. **Oferta pública** (única definição, `src/server/queries/public-offers.ts`, CTE `public_offers`). Todas as condições:
   1. `status = 'active'` e `current_price_cents > 0`.
   2. **Frescor**: `last_checked_at` dentro de `OFFER_FRESHNESS_DAYS = 7` dias, E prova de coleta real: (a) a própria oferta teve cotação nova na janela (`COALESCE(last_price_change_at, created_at)`), ou (b) a rede está "viva" (existe oferta criada antes da janela, da mesma rede, com `last_price_change_at` dentro da janela; só acontece se o coletor da rede de fato consulta a fonte).
   3. **Plausibilidade**: com `PLAUSIBILITY_MIN_OFFERS = 3` ou mais ofertas frescas no produto, descarta preço abaixo de `PLAUSIBILITY_FLOOR_PERCENT = 35`% da mediana dessas ofertas. Com menos de 3 não há régua e a oferta passa.
2. Constantes em `src/lib/affiliate/price-verdict.ts` (`OFFER_FRESHNESS_DAYS`, `PLAUSIBILITY_FLOOR_PERCENT`, `PLAUSIBILITY_MIN_OFFERS`). Nada é escrito nem apagado: a oferta continua no banco e as cotações continuam no histórico; ela só não entra em preço atual, vitrine, tabela, alerta nem contagem pública. Se a mais barata sai, vale a próxima (concorrência real, `AGENTS.md`).
3. Consultas que passam a usar a definição: `listRankedOffers`, `getPublicOffers`, `getFeaturedOffers`, `getPlatformStats` (contagem, média e "abaixo da média"), `price-table.ts`, `getBestActiveOfferIdsForMasterProducts` (watchlist e alerta) e `currentLowestActive` em `product-price-stats.ts`. Para listas montadas fora delas: `filterPublicOfferIds`.
4. **Selos só com elegibilidade** (ADR 0001, item 4: >= 5 cotações E >= 14 dias): "menor preço já registrado" (`computeLowBadge`), veredito, média de referência e "preço em queda" (`computePriceDrop`: queda >= `PRICE_DROP_MIN_PERCENT` = 5% entre o preço anterior confirmado e o atual, mudança em até `PRICE_DROP_WINDOW_DAYS` = 7 dias). Sem elegibilidade, os campos vêm `null`/`false`: nenhum valor de referência é fabricado.
5. **Média única como referência (EG-13)**: `avgPriceCents` é a média única do produto e é `null` sem elegibilidade. Não é preço de tabela; "de/por" só com `listPriceCents` real do anúncio. O alias `avgPriceCents30d` é mantido como depreciado e recebe o mesmo valor, para não quebrar a UI antes da Onda 2.
6. **Alerta com preço-alvo (EG-19)**: ao acompanhar grava-se `ceil(menor registrado * 1,05)` em `target_price_cents`, só com histórico elegível; sem alvo e sem histórico elegível não há alerta. Com alvo, avisa quando o menor preço público <= alvo (`target_reached`).
7. **Leitura não escreve**: removido o `UPDATE master_products` de `listRankedOffers` (0 linhas elegíveis a ele em 2026-10-31) e o fallback de cupons. Sem cupom real, a lista é vazia.

## Consequências
- O catálogo público encolhe de forma visível: de 3.287 para 806 produtos e de 6.127 para 2.526 ofertas (Shopee de 3.888 para 293), porque a coleta Shopee não existe de fato. Isso não é efeito do piso (que removeu 7 ofertas); é o frescor ser honesto. Reverte sozinho quando a coleta Shopee voltar a produzir mudanças de preço.
- ~70% dos cards perdem selo e média (ADR 0001 já avisava): na amostra de 200 ofertas, 60 têm histórico elegível.
- Limite conhecido: dentro de uma rede "viva" uma oferta individual cuja consulta falha continua passando enquanto `last_checked_at` for tocado no `finally`. Correção definitiva é do coletor (gravar `last_success_at` só no sucesso); quando existir, trocar a condição 2 por ele.
- Limite conhecido: a mediana do piso usa os preços atuais das ofertas frescas; com exatamente 3 ofertas, 2 lixos deslocam a mediana. O histórico (`lowAll`) ainda contém cotações implausíveis (32 de 806 produtos públicos têm menor histórico abaixo de 35% da mediana atual). Resolvido em 2026-10-31: o dono aprovou aplicar o piso também ao histórico (ADR 0001 item 3 revisado); a régua do histórico é a mediana das cotações do produto, não a das ofertas públicas.
- Custo: o lote de estatística passou de duas varreduras para uma (6,3 s para 3,3 s em 200 produtos, resultado idêntico); ainda é varredura de snapshots. O agregado diário (migration) segue recomendado (EG-11).

## Emenda de 2026-11-01
- O piso da oferta pública é **estrito**: preço > 35% da mediana. Com `>=`, o GT7 PS5 de R$ 70,00 (mediana R$ 200) passava por 3 centavos e ganhava o selo "Menor preço já registrado" (F-11).
- A mediana é a mesma função SQL (`medianSql`) para ofertas públicas e para as cotações do histórico. As duas populações ainda diferem (ofertas frescas x cotações). Para que "hoje" nunca seja menor que "menor já visto" (F-14), o menor preço do produto passou a incluir a oferta pública atual. Unificar a régua lendo o piso das cotações na CTE pública foi adiado: varreria 3,25 milhões de snapshots em toda consulta pública (parecer do DBA).
- Zona de suspeita (35% a 50% da mediana): a oferta continua pública, mas sem selo de recorde nem destaque sem corroboração de 2 vendedores distintos dentro de ±10%.
- Destaques e selos excluem vendedor de reputação baixa (`sellerTier`). Sem dado de vendedor (Shopee, reputação não buscada) NÃO é tratado como reputação baixa.
- Divergência registrada: o especialista em preços propõe piso de 60% para vendedor com < 10 vendas e teto de 2 x a mediana na oferta pública; o estatístico recomenda manter 35% como corte duro e aplicar o teto só aos agregados. Foi seguido o estatístico, com o efeito de reputação aplicado ao selo, ao destaque e ao menor preço histórico.
