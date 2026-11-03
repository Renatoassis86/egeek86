# Parecer do Estatístico Sênior: validade dos indicadores (rodada 1, 2026-11-01)

Escopo: F-08, F-09, F-11, F-13, F-14, F-26 e a questão da mediana, da auditoria `docs/auditoria-cowork-2026-11-01.md`.
Método: leitura do código e SELECT somente leitura no banco de produção (via `connect()` de `scripts/_dup-shared.ts`). Nada foi editado nem escrito.
Rótulos: **[Dado]** = medido agora no banco ou no código; **[Hipótese]** = inferência a confirmar; **[Recomendação]** = proposta.

## Posição

1. A fórmula do veredito já está certa (`computeVerdict`, `price-verdict.ts:87-99`: faixa de ±5% da média única). O defeito de F-08 está **no consumidor**, não na função. A tabela e a página do produto não a usam.
2. F-26 (cotação repetida) é a causa estrutural mais séria: **3.249.799 cotações para 67.046 pares oferta-dia** (48 vezes). Corrigir isso muda contagem e mediana, e quase não muda a média.
3. F-09 procede só em parte. "Preço estável" nos 15 produtos é, em boa parte, a regra funcionando (queda ou alta de menos de 5% e mudança com mais de 7 dias). Há um bug real no cálculo (penúltimo snapshot em vez do preço anterior distinto) e um erro de conceito: a página mostra só tendência, nunca o veredito contra a média.
4. F-11 procede por **3 centavos**: o GT7 de R$ 70,00 passa no piso de R$ 69,97.
5. F-13 foi mal diagnosticado: um teto por múltiplo da mediana **não resolve** o caso Xbox Halo (a mediana do produto já é R$ 16.378).
6. F-14 procede e tem causa raiz: **dois pisos diferentes** (um sobre cotações, outro sobre ofertas frescas).
7. A mediana procede como lacuna. Ela existe só dentro do SQL do piso, nunca sai de `MasterProductPriceStats`.

## Leitura (com arquivo:linha)

### F-08 (rótulos de veredito): procede, causa no consumidor
- `src/components/price-table/price-table-board.tsx:409-419`: "Recorde Histórico" se `isLowestEver`. Senão, "Preço Excelente" se `avgDiscountPercent > 0`. Senão, "Preço Regular". Nunca lê `item.verdict`, que `price-table.ts:250` já calcula certo.
- `src/server/queries/price-table.ts:254`: `avgDiscountPercent` é definido como `avg > currentPrice`, sem faixa de ±5%. Qualquer centavo abaixo da média vira "Excelente". O "Regular" vira balde de tudo o resto, inclusive +64,5%.
- `price-table.ts:143-149` (`discount_percent_raw`) repete a mesma comparação sem faixa, mas só com elegibilidade. O filtro `onlyBelowAvg` (`:202`) usa a faixa de 5%. A coluna e o filtro discordam.
- `src/app/(shop)/ofertas/[slug]/page.tsx`: não há nenhum uso de `metrics.verdict` (grep vazio), embora `affiliate.ts:649-654` o calcule. Aí está o "veredito sumido" da página.
- Quem já faz certo: `search-products.ts:681` (`computeVerdict`, saída em `:707-709`).
- Fora do foco, mesma doença: `src/components/monitoring/price-history-chart.tsx:60-82` (`computePriceSignal`) decide "Comprar agora" por `atual <= mínimo da JANELA x 1,02`. Com janela de 3 pontos isso é trivial. É a causa de F-10 ("Comprar agora" com R$ 329,90 contra mínimo histórico de R$ 139,81). É um terceiro veredito, fora do `price-verdict.ts`.

### F-09 (tendência): procede em parte
- **[Dado]** `affiliate.ts:662-667` calcula a tendência comparando o preço atual com o penúltimo **snapshot** (`getPreviousPriceByOffer`, `affiliate.ts:689-701`, `rn = 2`).
- **[Dado]** Em 60 dias, em 942 de 2.251 ofertas (42%) o penúltimo snapshot tem o mesmo preço do último, por causa do batimento de 24 h (`record-price-snapshot.ts:34-35,68-71`). Nesses casos a variação sempre sai 0 e o resultado é "stable".
- **[Dado]** `affiliate.ts:659-667` não aplica a janela de 7 dias (`PRICE_DROP_WINDOW_DAYS`). Aplica só a faixa de 5%.
- **[Dado]** A tendência é da menor oferta pública do produto (`stats.currentLowestActive`). O preço exibido em `page.tsx` é `offer.currentPriceCents`, da oferta visitada. Podem ser ofertas diferentes.
- **[Dado]** Nos 5 produtos que medi, o `previous_price_cents` real da oferta mais barata dá: Wonder +3,3% em 27/09, Switch 2 +0,9% em 30/10, Xbox Halo -4,3% em 26/07, RE Village sem mudança, GT7 sem preço anterior (oferta criada hoje). Pela regra "5% em 7 dias", os cinco são "estável" de fato.
- Conclusão: os 15 "estável" não provam um valor fixo. Mostram dois defeitos: o rótulo "estável" afirma sem prova, e o usuário lê tendência como se fosse veredito. O GT7 a -66% é caso de veredito/isca, não de tendência.

### F-11 (isca R$ 70 no GT7): procede, margem de 3 centavos
- **[Dado]** Mediana das cotações do GT7 (produto `c43eea01`) = R$ 199,90, com 93 cotações. Piso de 35% = R$ 69,97. A oferta de R$ 70,00 passa por R$ 0,03.
- **[Dado]** A oferta (`a4ea8546`) foi criada hoje às 02:40 UTC, com 1 snapshot e `previous_price_cents = 0`. Outra oferta expirada também está em R$ 70,00 (mesmo produto, vendedor sem apelido). Nenhum outro vendedor está perto de R$ 70.
- Regras no código: `product-price-stats.ts:61-75` (piso 35%, `PLAUSIBILITY_FLOOR_PERCENT`, `price-verdict.ts:26`). O selo só exige `atual <= lowAll` e elegibilidade (`price-verdict.ts:115-120`). Nada exige corroboração.
- **[Dado]** Sensibilidade ao piso, sobre as 6.787 ofertas ativas de produtos com 3 ou mais cotações: abaixo de 35% da mediana = 23 ofertas; abaixo de 50% = 89 (1,3%). Piso de 50% cortaria 66 a mais.
- Risco do corte alto: promoção real de 50% (Black Friday) seria cortada. O dono já decidiu que a cotação nunca é apagada. O corte duro só afeta o indicador.

### F-13 (preços muito altos): procede em parte, causa diferente da sugerida
- **[Dado]** Xbox Series X Halo (produto `f9cd118c`): mediana das cotações R$ 16.378, mínimo R$ 6.499, máximo R$ 19.964, 23 cotações, 8 ofertas. Média com filtro 2x = R$ 16.146.
- A mediana já é o preço inflado. Teto de "3 x mediana" não corta nada aqui. O que torna o caso grave é o selo "Excelente" (F-08: -4% virou "Excelente"). Pela regra de 3 faixas seria "Em linha".
- O filtro 2x (`product-price-stats.ts:229-231`) usa média bruta, que o próprio outlier infla. Com 1 ponto 100x maior em 5 cotações, 2x a média não o corta. A mediana é a régua robusta.
- **[Dado]** Das 6.787 ofertas ativas: 184 estão acima de 2x a mediana das cotações (2,7%) e 54 acima de 3x (0,8%).
- O preço atual é sempre a menor oferta pública (`product-price-stats.ts:269-281`), então um teto sobre ofertas poderia deixar o produto sem preço. Teto só pode valer para os agregados (média, máximo), não para a oferta pública.
- A razão máx/mín limpa do Xbox Halo é 3,07x. Dispersão alta é o sinal certo de baixa confiança.

### F-14 (atual abaixo do "menor já visto"): procede, duas réguas
- Duas medianas distintas definem "plausível":
  - Estatística: mediana das **cotações** (`product-price-stats.ts:65-67`, `priceQuotesCtes`).
  - Oferta pública: mediana das **ofertas frescas** (`public-offers.ts:61-65,73`).
- Uma oferta pode passar no piso público e cair no piso estatístico. O "preço atual" é então menor que o mínimo.
- **[Dado]** Sem piso, nenhuma oferta ativa tem preço abaixo do menor snapshot do produto (0 de 7.887). A contradição vem só do piso. Com o piso das cotações, 23 de 6.787 ofertas ativas (0,34%) ficam abaixo da régua estatística.
- **[Dado]** Nintendo Land: oferta `21d8d2ba`, título "Nintendo Land", ligada ao produto "Metroid Other M" (`22b6dc4d`). Snapshots alternando 12030 e 41500 a cada ~45 min desde 12/08. É F-01 (vínculo errado), mais uma oferta que oscila. A estatística do produto está contaminada na origem.
- Em `page.tsx`, o "HOJE" é `offer.currentPriceCents` da oferta visitada, não `stats.currentLowestActive`. Mesmo sem o piso, a página pode mostrar um atual que a estatística não conhece.

### F-26 (cotação repetida): procede, e é a causa estrutural
- `product-price-stats.ts:55-60` (`q_all`): cada linha de `affiliate_price_snapshots` é uma "cotação". A média e a contagem pesam pela frequência de coleta de cada anúncio.
- `record-price-snapshot.ts:21-27` documenta que o coletor antigo gravava uma linha por checagem (15 mil linhas em 1 mês num produto). Hoje grava só em mudança ou batimento de 24 h, mas o legado ficou.
- **[Dado]** Global: 3.249.799 cotações com preço > 0, 14.482 ofertas, **67.046 pares oferta-dia**. Últimos 14 dias: 419.033 linhas para 15.717 pares oferta-dia (27x).

Impacto real, 5 produtos (piso 35% da mediana nos dois casos; filtro 2x mantido; "dia" = último preço observado... ver nota abaixo):

| Produto | Cotações hoje | Oferta-dia | Redução | Média hoje | Média oferta-dia | Variação | Mediana hoje | Mediana oferta-dia |
|---|---|---|---|---|---|---|---|---|
| Switch 2 Nacional | 299.506 | 1.590 | 188x | R$ 4.455,56 | R$ 4.453,21 | -0,05% | R$ 4.491,00 | R$ 4.399,99 |
| Mario Wonder Switch | 155.858 | 1.099 | 142x | R$ 384,96 | R$ 380,58 | -1,1% | R$ 369,90 | R$ 360,90 |
| RE Village PS5 | 10.816 | 301 | 36x | R$ 182,60 | R$ 185,33 | +1,5% | R$ 184,90 | R$ 194,90 |
| GT7 PS5 | 93 | 64 | 1,5x | R$ 205,45 | R$ 209,94 | +2,2% | R$ 199,90 | R$ 199,90 |
| Xbox Series X Halo | 23 | 17 | 1,4x | R$ 16.146,30 | R$ 15.946,52 | -1,2% | R$ 16.378,00 | R$ 16.478,00 |

Nota do método: usei o último preço de cada oferta em cada dia (UTC). Para a regra final recomendo `percentile_disc(0.5)` do dia, que também devolve um preço observado e resiste a oscilação (ver passos). A ordem de grandeza não muda.

Leitura: a **média quase não se move** (no máximo 2,2%). A **contagem despenca** (até 188x). A **mediana muda até 5,4%** (RE Village), o suficiente para cruzar a faixa de ±5% em algumas ofertas. Isso confirma que a média de hoje é estável porque a frequência de coleta é parecida entre anúncios; o ganho de F-26 é honestidade da contagem, não correção da média.

### Mediana
- `MasterProductPriceStats` (`product-price-stats.ts:119-154`) não tem campo de mediana. `pfloor.median_cents` (`:65`) existe só no SQL do piso, sobre cotações brutas, antes do piso.
- Nenhuma tela mostra mediana (confirmado na auditoria §4.1 e no código).

### Duplicação de agregação (risco de divergência)
- A ADR 0001 diz "implementação única", mas só o piso é compartilhado (`priceQuotesCtes`). Média com filtro 2x, mínimo e contagem são reescritos em `product-price-stats.ts:213-251`, `price-table.ts:119-133` e `search-products.ts` (consumo). Qualquer mudança de regra precisa ser feita em 2 SQLs.

## Riscos

1. **Mudar a definição de cotação** (F-26) mexe no texto da regra inegociável ("somatório de TODAS as cotações dividido pelo total"). Nenhum preço real some nem é inventado, mas muda o que é uma cotação. Exige emenda do dono (ADR nova).
2. **Contadores caem** de 3,2 milhões para cerca de 67 mil na home. Honesto, mas o dono vai ver o número "encolher" (marketing).
3. **Piso mais alto** pode cortar promoção real e esconder um menor preço legítimo. Mitigar com corroboração, não com corte maior.
4. **Eligibilidade (>= 5 cotações)** passa a contar oferta-dia. Produtos de 5 cotações no mesmo dia deixam de ser elegíveis (já exigem 14 dias, então o efeito é pequeno).
5. **Cache de 60 s** (`product-price-stats.ts:359-366`) e tags: mudar o SQL exige invalidar `master-product-price-stats` e `price-table-data`.
6. **Desempenho:** agrupar por oferta-dia soma uma agregação ao SQL já pesado (ADR 0001 já pede migration de agregado diário). A solução definitiva é uma tabela/materialized view `offer_day_prices`.
7. **Produto contaminado (F-01, F-02):** nenhuma regra estatística conserta vínculo errado nem duplicata. Estatística correta sobre produto errado continua errada.
8. **Oferta oscilante** (Nintendo Land: 12030/41500 a cada 45 min) gera "tendência" falsa se usarmos o último snapshot.

## Recomendação (especificação implementável, em passos)

### Passo 1. Veredito único de 3 faixas (F-08)
- Reutilizar `computeVerdict` (`price-verdict.ts:87`). Não criar fórmula nova.
- Adicionar em `price-verdict.ts` uma função pura `verdictLabel(kind)`:
  - `below` = "Abaixo do normal" (verde)
  - `inline` = "Em linha com o normal" (neutro)
  - `above` = "Acima do normal" (aviso)
  - `insufficient` = "Histórico curto" (sem selo)
- `price-table-board.tsx:409-419`: trocar a cascata por `item.verdict.kind` mais o selo de recorde. Remover "Preço Excelente" e "Preço Regular". "Recorde Histórico" só se `isLowestEver` e `verdict.kind !== 'insufficient'`.
- `page.tsx`: exibir o badge de veredito (usar `metrics.verdict`, já calculado em `affiliate.ts:649-654`) com o delta em R$ e %.
- `price-history-chart.tsx:60-82`: substituir `computePriceSignal` por `computeVerdict`/`computeLowBadge` alimentados pela estatística canônica do produto. Isso fecha F-10.
- `price-table.ts:143-149` e `:254`: derivar `discount_percent_raw` e `avgDiscountPercent` de `verdict.deltaPercent` (preenchido só fora da faixa).
- Teste de regressão: para 100% das linhas da tabela, rótulo exibido = rótulo recalculado de `computeVerdict`.

### Passo 2. Tendência real (F-09)
- Criar em `price-verdict.ts` uma função pura `computePriceMove({ currentCents, previousCents, changedAt, quoteCount, historyDays, now })` que devolve `{ direction: 'down' | 'up', percent, at }` ou `null`. Generaliza `computePriceDrop` (`:148-158`), reaproveitando a janela de `PRICE_DROP_WINDOW_DAYS = 7` e o mínimo de `PRICE_DROP_MIN_PERCENT = 5`.
- Alimentar com `affiliate_offers.previous_price_cents` e `last_price_change_at` da oferta exibida, **não** com o penúltimo snapshot. Estender a query `currentRows` de `product-price-stats.ts:269-281` para trazê-los.
- `affiliate.ts:662-667` e `:689-701`: remover `getPreviousPriceByOffer` e usar `computePriceMove`.
- Anti-oscilação: se a oferta teve mais de 2 mudanças em 24 h, não emitir tendência (caso Nintendo Land).
- `page.tsx:64` (`TREND_META`): "Preço em queda" e "Preço subindo" só quando houver `computePriceMove`. Sem movimento, mostrar "Sem variação de 5% ou mais em 7 dias" (texto verdadeiro) em vez de "Preço estável". A tendência e o preço mostrado devem vir da mesma oferta.

### Passo 3. Piso, teto e dispersão (F-11, F-13, F-14)
1. **Uma régua só.** Fazer `publicOffersCtes` (`public-offers.ts:61-75`) ler o piso de `priceQuotesCtes` (mediana das cotações por oferta-dia, passo 4), em vez de recalcular a mediana das ofertas frescas. Invariante: oferta pública nunca fica abaixo do piso estatístico.
2. **Rede de segurança de F-14.** Em `buildMasterProductMetrics` (`affiliate.ts:646`) e em `page.tsx`: `lowestShown = min(lowAll, atual da oferta exibida se pública)`. Com a régua única isso é só defesa.
3. **Piso (zona dura).** Manter 35% da mediana (ADR 0001/0002, decisão do dono). A cotação nunca é apagada.
4. **Zona de suspeita (35% a 50% da mediana).** Fica nos indicadores, mas **não ganha** o selo "Menor preço já registrado", nem entra em vitrine/destaque, a menos que haja corroboração: pelo menos 2 vendedores distintos com preço dentro de ±10% dele. O GT7 de R$ 70,00 (50% = R$ 99,95; ofertas seguintes R$ 105 e R$ 120) cai nessa zona e perde o selo sem ser removido. A cotação continua em `lowAll`; só o selo é bloqueado. Constantes novas em `price-verdict.ts`: `PLAUSIBILITY_SOFT_FLOOR_PERCENT = 50`, `LOW_BADGE_MIN_DISTINCT_SELLERS = 2`.
5. **Teto (só agregados).** Cotação acima de `3 x mediana` sai de média e máximo. Substitui a base "2 x média bruta" por base robusta, **sem remover** o filtro 2x (ADR 0001 item 2 continua valendo por cima). Não aplicar o teto a ofertas públicas (o produto poderia ficar sem preço atual).
6. **Dispersão.** Novo campo `dispersionRatio = máx limpo / mín limpo`. Se `> 3`, marcar `lowConfidence`: sem selo de recorde e veredito "Abaixo do normal" rebaixado para "Em linha" visual com aviso "preço muito disperso". Caso Xbox Halo (3,07x).
7. Oferta internacional (F-12): decisão do dono já recomendada na auditoria (excluir da média e do selo). Depende de campo de origem do anúncio (dado que falta).

### Passo 4. Uma cotação por oferta por dia (F-26)
- Em `priceQuotesCtes` (`product-price-stats.ts:55-60`), criar a CTE `q_day`: por `(offer_id, dia em America/Sao_Paulo)`, valor = `percentile_disc(0.5)` dos preços do dia (preço realmente observado, sem interpolação).
- **Média, mediana, contagem, máximo e piso** passam a ler de `q_day`.
- **Mínimo (`lowAll`/`low1y`/`low3m`) continua lendo o snapshot bruto**, com o piso. O mínimo não depende da frequência, e assim um preço real que durou poucas horas não se perde. O selo continua exigindo a corroboração do passo 3.
- Elegibilidade: `quoteCount` = oferta-dias. Mantém 5 e 14 dias.
- Replicar em `price-table.ts:119-133`. Melhor: extrair uma CTE comum `statsAggCtes` para eliminar a duplicação de agregação.
- Rotular "N cotações" como "N cotações (oferta-dia)" e trocar "variações" em `price-table-board.tsx:397`.
- Performance: criar `offer_day_prices` (materialized view ou tabela agregada, `REFRESH` após o coletor) quando a EXPLAIN mostrar custo (ADR 0001 já recomenda). Sem migration, a agregação ao vivo é viável para o produto individual e cara para lotes grandes.
- Esta mudança exige **emenda formal** à regra "somatório de todas as cotações" (nova ADR 0004). O dono precisa aprovar antes.

### Passo 5. Mediana como "preço típico"
- Adicionar `medianCents` a `MasterProductPriceStats` (`product-price-stats.ts:119`), calculada sobre `q_day` já sem isca: `percentile_disc(0.5)`.
- Exibir na página do produto, logo abaixo do preço: "Preço típico: R$ X (mediana das cotações)". Na tabela e nos cards, não substituir a média.
- Só com histórico elegível. Sem elegibilidade, não aparece (mesma regra: nunca fabricar referência).
- A média continua sendo a referência oficial do veredito ("comparada contra essa média única", regra inegociável). A mediana é informação adicional e de auditoria.

### Passo 6. Ordem de entrega
1. Passo 1 (rótulos e página) e Passo 2 (tendência): baixo risco, não mexem em regra de dado.
2. Passo 3.1 e 3.2 (régua única): corrige F-14.
3. Passo 3.4, 3.5, 3.6 (zona de suspeita, teto, dispersão): resolve F-11 e F-13.
4. Passo 4 (oferta-dia) com ADR 0004 aprovada: resolve F-26.
5. Passo 5 (mediana) junto com o passo 4.

## O que NÃO deve mudar (resposta ao dono)

- **Média única do produto** como referência do veredito (ADR 0001 item 1). Não trocar o veredito para ser contra a mediana. A mediana entra como informação extra.
- **Faixa "em linha" de ±5%** e a elegibilidade de 5 cotações e 14 dias (ADR 0001 item 4).
- **Nada é apagado nem inventado.** A cotação isca continua no banco; o piso só a tira do indicador. O mínimo continua lendo cotação real. Sem interpolação.
- **Piso de 35% da mediana** (ADR 0001 item 3 revisado, ADR 0002) fica como corte duro. A "zona de suspeita" é uma camada de selo por cima, não um corte maior.
- **Filtro 2x** da média (ADR 0001 item 2) fica; o teto de 3x a mediana é adicional.
- **Concorrência real:** o preço atual é a menor oferta pública ativa; se a mais barata sai, vale a seguinte.
- **Um jogo, uma média só:** nenhuma média por loja ou por oferta; nenhuma comparação contra média própria da oferta. Esta rodada não mexe em dedup (F-02), mas depende dele.
- **Preço-alvo do alerta** = menor histórico + 5% (ADR 0001 item 6).
- **Fonte única:** nada de novo cálculo fora de `price-verdict.ts` e `product-price-stats.ts`.

## Dado que falta

1. Aprovação do dono para a emenda de "cotação" (oferta-dia) e para a ADR 0004.
2. Reputação e identificador do vendedor por oferta (hoje `nickname` pode ser nulo; a reputação aparece como código cru "5_green"). Sem isso a corroboração do passo 3.4 só consegue contar `seller_id`.
3. Origem do anúncio (nacional/internacional) e se o preço inclui imposto, para F-12.
4. Distribuição de preço por categoria (percentis P10/P50/P90 por plataforma e tipo) para calibrar teto e dispersão com dados reais, em vez de 3x e 3,07x.
5. Conferir o produto Xbox Halo e o PS5 Slim (R$ 5.069 de média) manualmente: a mediana inflada é cluster real de revendedores ou produto/edição misturados?
6. EXPLAIN dos SQLs com `q_day` para decidir entre agregação ao vivo e `offer_day_prices`.
7. Corrigir a oscilação 12030/41500 da oferta de Nintendo Land (coletor lendo vendedores diferentes sob o mesmo id de catálogo). É dependência de Coleta/DBA.

## Métrica de sucesso

1. Em 100% das linhas da tabela e dos cards, o rótulo exibido é igual ao recomputado por `computeVerdict` (teste automatizado). Zero "Excelente" com delta entre 0 e -5%. Zero "Regular" com delta acima de +5%.
2. Para toda oferta pública: `menor registrado <= preço atual exibido`. Zero contradição "HOJE menor que menor já visto" (hoje o risco abrange 23 de 6.787 ofertas ativas, 0,34%).
3. Nenhum selo de recorde em produto com `lowConfidence` ou com cotação na zona de suspeita sem corroboração. O GT7 de R$ 70,00 perde o selo.
4. Tendência: "queda" ou "alta" só com `previous_price_cents` e mudança em até 7 dias; zero rótulo "Preço estável". Teste com oferta cujo penúltimo snapshot é igual ao atual (42% das ofertas) retornando a tendência certa.
5. Contagem de cotações: soma por produto = pares oferta-dia distintos (hoje 3,25 milhões; esperado ~67 mil), e a média nos 5 produtos testados varia no máximo 2,5% frente à de hoje.
6. Mediana presente na página de 100% dos produtos elegíveis, ausente nos demais; média e mediana consistentes entre página, tabela e busca.
7. SQL de agregação em um só lugar (`statsAggCtes`), com teste comparando página, tabela e busca para uma amostra de 50 produtos.
