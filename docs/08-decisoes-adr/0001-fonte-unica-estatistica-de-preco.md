# ADR 0001: Fonte única de estatística de preço por produto

Data: 2026-10-30. Status: aceita (decisão do dono). Contexto: ETAPA 1 de `research/benchmarks/PLANO_IMPLEMENTACAO_TOP5.md`.

## Contexto
Quatro cálculos divergentes de menor preço e média (`getOfferMetrics`, `getMasterProductMetrics`, `getOfferListingMetrics`, estatísticas do histórico e `price-table.ts`) faziam o mesmo jogo exibir números diferentes por tela. A regra do negócio exige uma média única por jogo, sem dado sintético.

## Decisão
1. Média única do produto e "normal" = todo o histórico de cotações de todas as lojas (soma / total).
2. Mantém o filtro que descarta cotação acima de 2x a média bruta (fórmula e motivo em `docs/modelo-indicadores.md` 7.3).
3. Menor preço histórico conta ofertas expiradas, com rótulo "encerrada"; offers e snapshots nunca são apagados. **Revisada em 2026-10-31 (decisão do dono)**: o mínimo histórico, a média única, o máximo e a contagem ignoram cotações abaixo do piso de plausibilidade (`PLAUSIBILITY_FLOOR_PERCENT` = 35% da mediana das cotações do produto, só com >= `PLAUSIBILITY_MIN_OFFERS` = 3 cotações). Motivo: anúncio-isca (R$ 1,00 na home; "menor já visto" R$ 35,00 num Resident Evil Village PS5 de R$ 140; R$ 15,00 num Battlefield 1 de ~R$ 123) tornava o selo e o mínimo falsos. A cotação não é apagada; o piso só a tira dos indicadores. Transparência: `rawMinCents`, `floorCents`, `floorApplied` e `floorExcludedQuoteCount` em `MasterProductPriceStats`. O "menor já visto" da home usa o mesmo piso e só produtos com histórico elegível. Implementação única: `priceQuotesCtes` em `product-price-stats.ts` (vitrine, busca, produto, tabela de preços e home).
4. Selo e veredito só com >= 5 cotações e >= 14 dias de histórico; abaixo disso "histórico curto". "Em linha" = +-5% da média.
5. Empate de mínimo: primeira ocorrência.
6. Preço-alvo sugerido do alerta = menor histórico + 5% (constante em `price-verdict.ts`).
7. Implementação: `src/server/queries/product-price-stats.ts` (única query, por id e em lote, cache 60s) e `src/lib/affiliate/price-verdict.ts` (funções puras). Sem migration.

## Consequências
- Telas e alertas passam a ler desta fonte nas etapas seguintes; os cálculos legados ficam listados em `modelo-indicadores.md` 7.7.
- Produtos com histórico curto deixam de ganhar selo (menos vitrine "menor preço histórico"; avisar o dono).
- Risco de desempenho em produtos com muitos snapshots (3 varreduras por produto); medir com EXPLAIN antes de liberar nas listagens e, se preciso, agregar por dia (possível migration futura).
- Pendente: auditoria de duplicatas (F4), pois a estatística é por `master_product_id` e duplicatas fragmentam o mínimo.
