# Modelo de Indicadores — Espaço Geek 86

> Documento de referência: define, com fórmula e fonte de dado, todo indicador de preço/mercado
> exibido em qualquer tela do site. Objetivo: qualquer pessoa (ou IA) consiga auditar se um número
> na tela "bate" com o modelo, sem precisar reconstruir a lógica lendo todo o código de novo.
>
> Homologado em 2026-07-26 contra o banco de produção (consultas diretas, não amostra sintética).

---

## 1. Os dois escopos: "Oferta" vs "Produto"

Todo indicador de preço no site é calculado em UM destes dois escopos — confundi-los é a causa mais
comum de "os números não batem":

- **Oferta (`affiliate_offers.id`)**: o anúncio de UM vendedor específico numa rede específica
  (ex: "Minecraft Switch Física" no Mercado Livre, vendedor X). Histórico = só os snapshots
  daquele `offer_id`.
- **Produto (`master_products.id`)**: o jogo/item em si, agregando TODOS os vendedores/redes ativos
  que vendem aquele produto. Histórico = snapshots de todas as ofertas ativas com aquele
  `master_product_id`. "Menor preço do produto" = o menor entre todos os vendedores, não um vendedor
  fixo.

| Tela | Escopo | Função |
|---|---|---|
| `/ofertas/[slug]` (público, uma oferta) | Oferta | `getOfferMetrics(offerId)` |
| `/admin/ofertas/[id]` (linha "este anúncio") | Oferta | `getOfferMetrics(offerId)` |
| `/admin/ofertas/[id]` (linha "produto/todos vendedores") | Produto | `getMasterProductMetrics(masterProductId)` |
| Cards de grade (`/ofertas`, home, `/tabela-de-precos`) | Produto | `getOfferListingMetrics(offerIds[])` (batch) |
| `/monitoramento` (Bolsa Gamer) — preço no topo e na lista | Produto | `getUserWatches`/`getBestActiveOfferIdsForMasterProducts` |
| `/monitoramento` — gráfico (linha e média) | Produto | `getMasterProductPriceHistory(masterProductId, timeframe)` |
| `/monitoramento/comparar/[id]` | Produto (lista todas as ofertas do produto) | `getOfferComparisonForMasterProduct` |
| Home — "Destaques"/"Maiores quedas" | Produto (dedup por produto, oferta mais barata representa) | `getFeaturedOffers`, `getTopMovers` |

**Por que isso importa**: se uma tela mostra "preço atual" de uma OFERTA (um vendedor só) ao lado
de uma tela que mostra "preço atual" do PRODUTO (o vendedor mais barato entre todos), os dois números
podem legitimamente divergir — não é bug, é escopo diferente. Nas telas atuais isso está rotulado
corretamente (ex: `/ofertas/[slug]` mostra o preço daquele vendedor específico; `/monitoramento`
sempre deixa explícito "Menor preço entre todas as lojas").

---

## 2. Indicadores de preço

### 2.1 Preço Atual (`currentPriceCents`)

- **Escopo oferta**: último `price_cents` snapshotado daquele `offer_id` (`ORDER BY collected_at DESC LIMIT 1`), OU o cache `affiliate_offers.current_price_cents` (mantidos em sincronia pelo coletor — auditado nesta sessão, 100% consistentes nos casos verificados).
- **Escopo produto**: `MIN(current_price_cents)` entre todas as ofertas com `status = 'active' AND current_price_cents > 0` daquele `master_product_id`.
- **Nunca inclui**: ofertas `draft`/`paused`/`expired`/`archived`, nem `current_price_cents = 0` (placeholder de "ainda não coletado").

### 2.2 Menor Preço Já Visto (`lowestPriceCents` / `isLowestEver`)

- `MIN(price_cents)` de **todo o histórico** de snapshots do escopo (oferta ou produto) — sem
  limite de período, sem exclusão de outlier. É o único indicador que **nunca** passa pelo filtro
  de outlier (ver seção 3), porque representa o menor preço que **de fato aconteceu**, mesmo que
  tenha sido um evento raro.
- `isLowestEver = currentPriceCents <= lowestPriceCents`.

### 2.3 Preço Médio (`avgPriceCents30d` / `avgPriceCents` do gráfico)

- Média aritmética de `price_cents` de todos os snapshots do escopo dentro da janela (30 dias nos
  cards/detalhe; o período selecionado no seletor do gráfico em `/monitoramento`).
- **Sempre passa pelo filtro de outlier** (seção 3) antes do cálculo final.
- No gráfico de `/monitoramento`, essa é a linha tracejada "Preço médio (todas as lojas)" —
  agregada por balde de tempo (não é média móvel da linha de menor preço).

### 2.4 Variação % (`changePercent` / Var%)

- Fórmula: `((atual - baseline) / baseline) * 100`, arredondado a 1 casa decimal.
- **Baseline varia por tela**: `/monitoramento` usa 24h (`getMasterProductChangePercent`, padrão);
  "Maiores altas/baixas" usa o período selecionado (24h/7d/30d via `getTopMovers`). Sempre no escopo
  PRODUTO (menor preço entre vendedores), nunca de uma oferta isolada.
- `null` quando não há snapshot antigo o bastante pra comparar (produto novo/recém-integrado) — a
  UI mostra "N/D", nunca inventa um número.

### 2.5 Desconto % vs. Tabela (`discountPercent`)

- Se a fonte informou `discount_percent` no snapshot, usa direto. Senão, calcula
  `((listPriceCents - current) / listPriceCents) * 100` quando `listPriceCents > current`.
- É sobre o **preço de tabela do próprio anúncio** (ex: "de/por" que o vendedor anunciou), diferente
  do desconto vs. média (2.6).

### 2.6 Desconto % vs. Média (`avgDiscountPercent` / `discount_percent_raw` na tabela de preços)

- `((avgPriceCents30d - current) / avgPriceCents30d) * 100`, só quando `avgPriceCents30d > current`
  (senão `null` — nunca número negativo mostrado como "desconto").
- É o valor usado por "Apenas itens abaixo da média" e pela ordenação "Maior Desconto vs. Média" em
  `/tabela-de-precos` — auditado nesta sessão (busca real, ordenação monotônica confirmada).

### 2.7 Contagem de Cotações (`totalQuoteCount` / `snapshotCount`)

- Contagem de linhas em `affiliate_price_snapshots` do escopo. Em `/monitoramento`, escopada ao
  **período selecionado no seletor** (1D/1S/1M/etc), não ao histórico vitalício — o rótulo já deixa
  isso explícito ("X cotações no mês", por exemplo).
- Em `getPlatformStats` (indicador global "Cotações de Preço" na Home), a contagem é uma
  **estimativa** via `pg_class.reltuples` (com fallback pra `COUNT(*)` exato se a estimativa não
  existir) — trade-off deliberado de performance numa tabela com dezenas de milhares de linhas;
  pode divergir do valor exato em ±alguns %, nunca é fabricado.

---

## 3. Regra de exclusão de outlier (por que a média nunca "explode")

Aplicada em **todo** cálculo de média (nunca no mínimo/máximo/contagem):

1. Calcula a média bruta (`raw_avg`) de todos os preços do período/escopo, sem filtro.
2. Descarta qualquer snapshot com `price_cents > raw_avg * 2` (mais de 100% acima da média bruta —
   tipicamente erro de captura, frete embutido por engano, ou câmbio errado).
3. Recalcula a média final só com as linhas que sobraram.

Implementada de forma idêntica (mesmo padrão de CTE) em: `getOfferMetrics`, `getMasterProductMetrics`,
`getOfferListingMetrics`, `getFeaturedOffers`, `getMasterProductPriceHistory` (afeta `stats.avgPriceCents`
e a linha tracejada `avgPoints` ao mesmo tempo — nunca diverge um do outro), `price-table.ts` e agora
também `getPlatformStats` (indicador "Preço Médio Geral" da Home).
Confirmado por leitura direta do código nesta sessão em todos os pontos.

**Achado paralelo (2026-07-26)**: a média BRUTA (sem filtro) de todas as ofertas ativas da plataforma
é de R$ 1.367,98, contra R$ 365,72 depois do filtro — uma diferença grande demais pra ser só "algumas
cotações isoladas". Investigando a causa: há uma oferta de console cadastrada a R$ 22.850,00 (Console
PlayStation 4 Slim 1TB) que é quase certamente erro de captura (preço real de um PS4 Slim não passa de
poucas centenas de reais) — vale corrigir/revisar esse anúncio específico no admin, é dado de catálogo
errado, não só um outlier estatístico a ignorar.

### 3.1 Novos indicadores institucionais (Home) — 2026-07-26

- **Preço Médio Geral**: `AVG(current_price_cents)` de toda oferta ativa, outlier-excluído (regra acima).
- **Menor Preço Histórico**: `MIN(price_cents)` de todo `affiliate_price_snapshots` já coletado (excluindo
  `price_cents = 0`, que é sempre placeholder de "ainda não coletado", nunca um preço real) — nunca
  filtrado por outlier, é o menor preço que de fato já aconteceu.
- **Itens em Queda Agora**: contagem de `master_products` cujo menor preço ativo hoje está abaixo da
  própria média histórica (mesmo cálculo de `avgDiscountPercent`, aplicado em lote pra todo o catálogo).

---

## 4. O gráfico de `/monitoramento` — como cada linha é montada

- **Linha sólida (menor preço)**: um ponto por "balde" de tempo (3 dias no timeframe "1M", escala
  por período — ver `AVG_BUCKET_MS`). Dentro de cada balde, é o menor preço válido entre TODOS os
  vendedores ativos do produto naquele intervalo, herdando o último preço conhecido de vendedores
  que não postaram nova cotação no balde (não "esquece" um vendedor só porque ele não foi
  recotado). O último ponto é sempre recalculado pro instante atual (`finalMin`), não fica preso ao
  fechamento do último balde.
- **Linha tracejada (preço médio)**: mesma grade de baldes, `AVG` de todo snapshot de todo vendedor
  ativo no balde (não é média móvel da linha sólida) — outlier-filtrada (seção 3).
- **Baseline pré-janela**: pra timeframes com corte (ex: "1M"), busca o último preço conhecido de
  cada oferta **antes** do início da janela, pra não fingir que uma oferta "não existia" só porque
  sua última cotação foi antes do corte.

---

## 5. Bug real encontrado e corrigido nesta sessão: cabeçalho "preço atual" congelado

**Sintoma relatado**: no `/monitoramento`, o preço "atual" exibido no topo do painel às vezes não
batia com o último ponto do gráfico logo abaixo.

**Causa raiz confirmada** (não foi bug de cálculo/dado — os dois valores batiam perfeitamente
quando checados direto no banco pros produtos reportados, Minecraft Nintendo Switch Mídia Física e
Red Dead Redemption - Nintendo Switch): o componente `MonitoringBoard` guardava o item selecionado
num `useState` que só era atualizado ao TROCAR de jogo — nunca ao passar o tempo. O gráfico
(`PriceHistoryChart`) tem seu próprio polling a cada 45s e avançava sozinho; o cabeçalho, não. Se o
preço mudasse enquanto a aba ficava aberta, o gráfico refletia o valor novo e o cabeçalho continuava
mostrando o valor de quando a página carregou.

**Correção**: `WatchlistPanel` agora repassa pro `MonitoringBoard` (via `onItemsRefreshed`) o
resultado do seu próprio polling; `MonitoringBoard` usa isso pra manter o item ativo (inclusive o
preço do cabeçalho) sincronizado com o mesmo ritmo do gráfico.

## 6. Segundo bug encontrado nesta mesma investigação: "watchlist zerada volta sozinha"

**Sintoma relatado**: apagar todos os itens da lista e atualizar a página fazia a lista "voltar".

**Causa raiz confirmada** (a exclusão em si sempre gravou certo no banco — `is_active = false`
confirmado linha a linha): `/monitoramento/page.tsx` tinha um fallback que, sempre que
`getUserWatches` retornava vazio — inclusive pra um usuário logado que **de propósito** zerou a
lista — preenchia a tela com "ofertas populares" (ou, em último caso, uma lista de demonstração
fixa), rotulando tudo como "Sua lista". Não era o mesmo item voltando; era uma lista diferente sendo
mostrada como se fosse a do usuário.

**Correção**: os dois fallbacks (populares e demonstração) agora só disparam pra **visitante sem
conta** (`!profile`). Usuário logado com lista vazia vê o estado real de lista vazia, e o painel do
gráfico mostra "Selecione um produto para monitorarmos" em vez de manter o último jogo (agora
removido) na tela.

---

## 6.1 Incidente grave (2026-07-28/29): dado sintético/corrompido no banco de produção

Investigando um relato de preço divergente entre `/monitoramento`, `/admin` e o anúncio real no
Mercado Livre (Darksiders III - Nintendo Switch), a causa raiz não foi nenhuma fórmula — foi dado
de fato fabricado/corrompido, gravado por scripts avulsos que rodaram direto contra o banco de
produção, fora do pipeline oficial:

- **`scripts/seed-price-history-snapshots.ts`** (deletado): gerava 16 pontos de histórico "falso"
  por oferta usando uma fórmula de onda senoidal (`preço × (1 + sin(...) × 4.5%)`) em vez de
  qualquer coleta real — **57.376 linhas fabricadas em 3.586 ofertas**, alimentando direto toda
  média/mínimo histórico/gráfico dessas ofertas. Todas removidas (mantido histórico real e entradas
  manuais genuínas de admin).
- **`scripts/audit-and-fix-price-discrepancies.ts`** (nunca commitado, achado só localmente):
  tentou corrigir UM preço via `WHERE nome ILIKE '%Darksiders%'` — o match amplo pegou 26 ofertas de
  6 jogos diferentes da franquia (plataformas diferentes, jogos diferentes) e forçou todas pro mesmo
  preço fixo. As 23 ainda presas nesse valor foram resetadas pro sentinel `0` ("aguardando nova
  coleta") em vez de eu inventar um número de reposição.
- **`scripts/update-mario-rpg-price.ts`**: mesmo padrão, oferta única.
- **`scripts/seed-5-collectors.ts`**: cadastrava 5 perfis de "colecionador" fictícios como se fossem
  vendedores reais — mantido a pedido do cliente como mockup por enquanto (não é dado de preço).
- **`scripts/seed-5-news.ts`**: notícias com conteúdo fabricado atribuído a fontes reais (Newzoo,
  Bloomberg) — mesma decisão, mantido como mockup por enquanto.

**Bug de código real, ainda ativo, encontrado na varredura seguinte** (esse não era script avulso —
era o próprio coletor oficial): `collect-prices.ts`, ao criar uma oferta nova pra um vendedor ainda
não rastreado, gravava `currentPriceCents` já com o preço real direto no `INSERT`. A chamada de
`recordPriceSnapshot()` logo em seguida compara o preço novo contra o preço já em cache pra decidir
se grava uma linha de histórico — como os dois já batiam (o INSERT já tinha posto o valor real), a
condição "preço mudou" dava falso e o primeiro snapshot nunca era gravado. Resultado: **175 ofertas
ativas com preço exibido na tela e ZERO linha em `affiliate_price_snapshots`** — nenhuma cotação
real por trás do número. Corrigido: a oferta agora nasce com `currentPriceCents = 0` (mesmo sentinel
de "ainda não coletado" já usado em `discover-products.ts`), e é o `recordPriceSnapshot()` — único
caminho que grava preço de verdade em todo o sistema — quem preenche o valor real e o histórico
juntos, atômico, sem exceção pro caso "oferta nova".

**Verificado, não presumido**: pipeline automático real (`pg_cron`, job `geek-deals-collect-prices`,
`*/5 * * * *`) confirmado ativo e saudável durante todo o incidente — nunca foi bug do coletor
agendado, sempre foram scripts avulsos ou o bug pontual acima. Amostra pós-correção (7 ofertas,
incluindo as 2 Darksiders III restantes): `current_price_cents` bate 100% com o último snapshot real.

**Verificado e descartado como problema**: ~20 preços "redondos" (R$199,90, R$299,00, R$349,90 etc.)
compartilhados por 13-47 produtos totalmente diferentes cada. Investigado e não é fabricação — é o
padrão real de precificação psicológica do varejo (terminações .90/.99/.00), esperado num catálogo
de milhares de anúncios de vendedores independentes competindo pelos mesmos preços "redondos".

## 7. O que foi validado nesta homologação (dado real, não amostra sintética)

- Índice único (`user_id, master_product_id`) de `affiliate_price_watches` confirmado existente no
  banco de produção (não é o bug de migração silenciosa já visto antes nesta sessão).
- Nenhuma linha duplicada de watch por usuário/produto.
- Para os dois produtos citados nos prints originais, TODAS as ofertas ativas têm
  `affiliate_offers.current_price_cents` idêntico ao último snapshot de `affiliate_price_snapshots`
  daquele `offer_id` — zero divergência de dado bruto encontrada.
- Busca por produto relacionado (fuzzy match usado só pelo gráfico pra juntar o mesmo jogo em
  catalogações separadas) não trouxe nenhum produto "vizinho" indevido pra nenhum dos dois casos —
  hipótese inicial de contaminação cruzada foi **descartada** com dado real, não presumida.
- `getOfferMetrics`, `getMasterProductMetrics`, `getOfferListingMetrics`, `getFeaturedOffers` e
  `getMasterProductPriceHistory` lidos linha a linha nesta sessão: todos aplicam a mesma regra de
  outlier, a mesma definição de "ativo", e nunca misturam a fórmula do mínimo com a da média.

## 8. O que ainda não foi auditado (fora do escopo desta rodada)

- `/monitoramento/comparar/[masterProductId]` (tela de comparação entre vendedores) foi lida mas
  não teve seus números confrontados com dado ao vivo nesta rodada (usa `currentPriceCents` direto
  de `affiliate_offers`, sem agregação — mesmo princípio de "Preço Atual" da seção 2.1, risco baixo).
- `getAdminDashboardMetrics` (cliques, cupons expirando) não faz parte do escopo de preço/média
  deste modelo — são contagens diretas, sem outlier a considerar.
- Volume de conteúdo do módulo de Notícias é baixo (2 publicados) — não é um problema de métrica,
  mas limita quão "cheio" o layout de portal fica até mais matérias serem publicadas.
