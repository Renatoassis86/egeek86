# Auditoria EG-01..EG-25 cruzada com o código e o banco (2026-10-31)

Escopo: mapeamento somente leitura. O relatório externo foi feito sem acesso ao código; cada hipótese abaixo foi checada no checkout `C:\repositorio\egeek86` e no banco por SELECT (pacote `postgres`, `.env.local`, nenhum segredo impresso). Complementa `docs/relatorio-varredura-2026-10-30.md` (qa-verificador), que já corrigiu parte dos itens; o que ele corrigiu está marcado como "feito na varredura". Nada foi escrito no banco ou no código.

Legenda de status: confirmado (hipótese do relatório vale), parcial (vale em parte ou já corrigido em parte), refutado (não existe no código/banco). Nenhum item inteiro foi refutado, mas há sub-hipóteses refutadas (detalhadas por item).

## 0. Medições no banco (SELECT, 2026-10-31 ~00:00)

| Medição | Resultado |
|---|---|
| master_products / ofertas / ofertas ativas / snapshots | 4.706 / 10.181 / 6.054 (ML 2.261, Shopee 3.793; Magalu e Amazon 0) / 3.195.204 |
| Status das ofertas | active 6.054, expired 4.125, archived 2 (enum: draft, active, paused, expired, archived) |
| Duplicatas exatas por título+plataforma (lógica de `normalizeTitle`), todos os tipos | 6 grupos, 7 linhas excedentes (3 grupos com oferta ativa nos dois lados; sobretudo consoles "Nintendo Switch"/"PlayStation 5" de título genérico) |
| Idem, só `product_type = 'game'` | 2 grupos, 2 excedentes (Elden Ring unknown x Xbox Série X; Switch OLED) |
| Quase-duplicatas Jaccard >= 0,8 (regra atual de `findExistingMasterProduct`) | 68 grupos, 75 excedentes (inclui falsos positivos digital x físico) |
| Fragmentação real de jogos com ruído de título removido (pronta entrega, open box, 100%, nacional, envio imediato etc., só jogos) | 83 grupos, 105 produtos excedentes; 75 desses grupos têm oferta ativa em mais de um master (a média está dividida) |
| `platform = 'unknown'` | 919 masters no total (401 jogos, 20 consoles, 498 acessórios); 127 jogos com 262 ofertas ativas |
| RE Village | 10 masters com o nome. PS5 padrão fragmentado em 4: "Jogo Resident Evil Village - Ps5 Físico" (21 ativas, 10.715 snapshots), "...Ps5 Física Lacrado Pronta Entrega" (3), "...Standart PS5 BR Open Box" (1), "...PlayStation 5 - Mídia fisica 100% original" (1). Os demais são edições distintas legítimas (Gold 29 ativas, Steelbook PS4, Saga Capcom) ou lixo (encarte reimpresso, 2 ativas). |
| Zelda TotK | 23 masters; mínimo 5 variantes do jogo Switch 1 ("Switch Midia Fisica", "Nacional", "physical Switch 2 Edition", "Japão", "Collector's") mais acessórios e consoles classificados no mesmo nome (Pro Controller, dock cover, Hori Split Pad, Switch OLED edição Zelda) |
| Mario Kart 8 | 18 masters; "Mario Kart 8 Deluxe - Nintendo Switch" (15 ativas) mais "Super Mario Kart 8 Deluxe", "Jogo Mario Kart 8 Deluxe HBCPAABPA", "Mario Kart 8 Deluxe Loose", "Direct from Japan" etc. (>= 4 fragmentos do mesmo jogo) e 9 itens que não são o jogo (volantes, caixa, encarte, kits, lote) |
| God of War Ragnarok | 11 masters; o jogo PS5 está em 1 master (6 ativas, sem duplicata de padrão), mas há console, controle DualSense (9 ativas), pré-venda, espanhol |
| EA FC | 26 masters; FC 24, 25 e 26 em PS5 aparecem fragmentados (FC 25 PS5: "EA FC 25 - PS5", "EA SPORTS FC25", "FC 25 CD", "Jogo FC 25 Playstation 5", "EA SPORTS FC 25 ... Pronta Entrega", "EA FC 25 (Fifa 25) Narração", ou seja >= 6 masters do mesmo jogo); misturados a consoles com FC embutido |
| Ofertas ativas com preço < 35% da mediana do produto | 20 ofertas / 15 produtos (produtos com >= 3 ofertas ativas); 26 / 21 com >= 2 ofertas. Top: 8 ofertas Shopee a exatamente R$ 11,00 em jogos de ~R$ 340 (Mario Kart 8 mediana R$ 329, Zelda TotK R$ 349, Mario Odyssey R$ 337, Wonder R$ 390), 1 snapshot cada, `seller_id` nulo |
| Ofertas ativas < R$ 20 | 240 (216 Shopee, 25 ML); 48 delas em masters `game` |
| Ofertas ativas sem snapshot há > 3 dias | 5.274 (mas 0 com `last_checked_at` antigo: o coletor grava `last_checked_at` no `finally`, mesmo em erro, `collect-prices.ts:175-182`) |
| Ofertas ativas com último snapshot > 30 dias | 3.854 (Shopee 2.723; ML 1.131). Shopee: 3.829 de 3.855 ativas têm só 1 snapshot (de toda a vida) |
| Histórico credível (regra ADR: >= 5 cotações e >= 14 dias) | 2.794 de 3.223 produtos com oferta ativa (87%) ficam em "histórico curto" |
| Palavras no título dos masters | encarte 11, caixa vazia 4, faceplate 9, réplica 1, capa 0, case 0, nfc 0, game-key 0. Em ofertas ativas: encarte 17 e caixa vazia 4 (todas em masters `game`), faceplate 9 (6 em console, 2 em game, 1 em accessory). 17 masters `game` com essas palavras. |
| Preço 0 no histórico | 0 snapshots; 2 ofertas ativas com preço 0 (sentinel, não exibidas) |
| master_products com slug "loja+id" | 2.678 de 4.706 terminam em `-shopee-NNNNNN`; 220 slugs de oferta ativa com id externo; nenhum `mlb` |
| Cupons | tabela `affiliate_coupons` vazia (0 linhas) |
| Watches | 28, nenhuma com `target_price_cents` |
| Notícias | 7 publicadas (18/07 a 27/07/2026) e 2 rascunhos |
| Drops / leilões / pedidos / points_ledger / levels | 0 / 0 / 0 / 0 / 0 |
| Segurança | RLS desligado nas 78 tabelas do schema public; 0 policies; o papel `anon` tem SELECT, INSERT e UPDATE em profiles, affiliate_offers, master_products, news_articles, points_ledger e affiliate_price_watches (checado com `has_table_privilege`, sem tentar escrever) |
| Performance (medido no banco) | `DISTINCT ON` de dedup das ativas 1,3 s; média 30d para 200 ofertas 0,6 s (cada tela repete isso mais `getFeaturedOffers`) |

## 1. Tabela resumo

| EG | Severidade | Status real | Esforço | Escreve no banco? |
|---|---|---|---|---|
| 01 duplicatas de jogo | Alta | confirmado | G | Sim (fundir masters) |
| 02 média/mínimo divergem | Alta | parcial (fonte única pronta, telas não migradas) | M | Não |
| 03 preços implausíveis / oferta sem coleta | Crítica | confirmado (causa raiz diferente da hipótese) | G | Sim (opcional: expirar Shopee obsoleta) |
| 04 acessórios/encartes misturados | Alta | parcial (Game-Key refutado) | M | Sim (reclassificar product_type) |
| 05 indicadores contraditórios / números fixos | Alta | confirmado | M | Não |
| 06 /conta e /ranking fictícios | Alta | parcial (ranking e compra de drop corrigidos na varredura) | P | Não |
| 07 senha admin / role no servidor | Crítica | parcial (role ok; RLS ausente é achado novo grave) | M | Sim (migration RLS/REVOKE) |
| 08 links 404 | Média | parcial (8 de 9 corrigidos ou inexistentes no código; /universos/[slug] ainda existe na home) | P | Não |
| 09 página do produto sem gráfico/lojas | Alta | confirmado | G | Não |
| 10 selos "Menor já visto" / "Preço em queda" | Alta | confirmado | P | Não |
| 11 desempenho | Média | parcial (parte corrigida na varredura) | M | Opcional (agregado diário) |
| 12 gráfico /monitoramento | Média | parcial | M | Não |
| 13 média riscada como de/por | Média | confirmado | P | Não |
| 14 rótulos "Ver ofertas" | Baixa | confirmado | P | Não |
| 15 imagens repetidas | Média | parcial (3 trocadas na varredura; 9 ainda; 2 arquivos ausentes) | M | Não |
| 16 notícias de 27/07 | Média | confirmado | P/M | Não (conteúdo) |
| 17 "200 ofertas" sem grade | Baixa | confirmado | P | Não |
| 18 títulos crus / descrições copiadas | Média | confirmado | M | Não |
| 19 alerta sem preço-alvo | Média | confirmado | M | Não (coluna já existe) |
| 20 cabeçalho logado | Média | confirmado | P | Não |
| 21 mobile: imagem na 1ª tela | Média | parcial (visto só no código) | P | Não |
| 22 cupons "Verificado" | Alta | confirmado (pior: cupons de exemplo fixos no código) | P | Não |
| 23 "Carrinho" | Baixa | confirmado | P | Não |
| 24 arte do hero com terceiros | Alta (jurídico) | confirmado | M | Não |
| 25 título de aba, Points/Coins, toolbar, seção clara | Baixa | parcial (toolbar não vem do código) | P | Não |

Contagem: confirmado 15 (01, 03, 05, 09, 10, 13, 14, 16, 17, 18, 19, 20, 22, 23, 24), parcial 10 (02, 04, 06, 07, 08, 11, 12, 15, 21, 25), refutado 0, já corrigido 0 (várias correções parciais feitas pela varredura).

## 2. Achados novos que o relatório externo não viu

N1. Segurança: RLS desligado em todas as tabelas e `anon` com INSERT/UPDATE. A chave anon é pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`); se o schema public estiver exposto no PostgREST, qualquer pessoa lê e escreve profiles (inclusive `role`), preços e notícias. Verificar com seguranca-db (exposição do schema no projeto Supabase) antes de qualquer outra coisa.

N2. Scraping Shopee em produção: `src/server/collector/discover-shopee-products.ts:101-120` usa `https://shopee.com.br/api/v4/search/search_items` com User-Agent de navegador quando `SHOPEE_AFFILIATE_APP_ID/SECRET` não existem (`fetchViaPublicSearch`); a fonte de preço `sources/shopee.ts` é um stub que lança erro. Resultado: 3.793 ofertas Shopee ativas com 1 preço único (de quando foram descobertas), nunca atualizado, e `price / 100000` pode ser o menor preço de variação (origem provável dos R$ 11,00). Viola "só API oficial" e "sem dado fake". Confirmar se as variáveis existem na Vercel (aqui só vi os nomes em `.env.local`: não há SHOPEE_*).

N3. `listRankedOffers` executa `UPDATE master_products SET product_type='game' ...` dentro de uma leitura pública (`src/server/queries/affiliate.ts:~176-195`, ramo `productType === 'console'`). Escrita em rota de leitura, por ILIKE de "jogo/game/físico/mídia": reclassifica console como jogo e é origem plausível de "console cadastrado como game" (M6 da varredura).

N4. `getActiveCouponsForDisplay` (`affiliate.ts:~963-1030`) devolve 5 cupons fixos (MELI100, SHOPEE20, MAGALU15, GAMER50, GEEK12) quando a tabela está vazia, um deles com selo "Verificado" e `validUntil: null`. Dado fake em produção (viola regra 1).

N5. `/ofertas`: `monitoredProducts: broadPool.length` está limitado pelo `limit: 200` (`ofertas/page.tsx`), então o contador do banner nunca passa de 200.

N6. `public/images/home/mercado-gamer-numeros.png` e `public/images/home/tile-1.png` não existem: `SceneImage` mostra o selo de fallback "em produção" (`scene-image.tsx:106`), que é o "EM PRODUÇÃO" do relatório (EG-05). As legendas "Drop ao vivo · em produção" e "Mercado Gamer em Números · em produção" (`page.tsx:314, 793, 828`) são texto escrito à mão.

## 3. Seções detalhadas

### EG-01 Duplicatas de jogo (slug com loja + id)
(a) Tabelas/funções: `master_products`, `affiliate_offers.master_product_id`, `affiliate_price_watches` (unique user+master); `src/lib/affiliate/dedup.ts` (`normalizeTitle`, `findExistingMasterProduct`), chamadores em `src/server/actions/affiliate.ts`, `src/server/actions/collector.ts`, `src/server/collector/discover-products.ts`, `discover-shopee-products.ts`, `discover-magalu-products.ts`. Slug: `slugify` + sufixo `shopee-NNNNNN` na criação.
(b) Confirmada, mas a causa mudou: todos os caminhos de criação já chamam `findExistingMasterProduct`; o furo é a regra. O limiar Jaccard 0,8 usa `max(|A|,|B|)`; "resident evil village pronta entrega" contra "resident evil village" dá 3/5 = 0,6 e não casa. Ruído comercial (pronta entrega, open box, 100%, nacional, envio imediato, "Standart", CD, PS5 BR) não está na lista `noiseWords`. Consequência medida: 83 grupos / 105 excedentes em jogos. As 7 duplicatas "exatas" restantes são de título genérico de console ("Nintendo Switch", "PlayStation 5"). Slug "loja+id": confirmado (2.678 masters). O slug do master não é exposto em URL pública (a rota pública é o slug da oferta), então é cosmético; o slug da oferta também tem hash de loja.
(c) Mudar: (1) `dedup.ts`: lista de ruído ampliada; comparar por conjunto "núcleo" e usar bloqueio por palavras que definem produto distinto (gold, collector, deluxe vs base, steelbook, encarte, caixa vazia, loose, japão, kit, lote, combo, "switch 2 edition", digital) para não fundir variações legítimas; excluir masters "fantasma" (já fundidos) dos candidatos. (2) Script de fusão com dry-run. (3) Reclassificar fora do conjunto os itens que não são o jogo (ver EG-04).
(d) Escrita: sim. Plano seguro: `scripts/merge-duplicate-masters.ts` (novo) em 3 fases. Fase 1 dry-run: gera lista de grupos (id canônico, ids duplicados, nomes, ofertas ativas, preço mediano de cada) para revisão humana em arquivo fora de `docs/` (ex.: `backup/dados/merge-plan-2026-10-31.json`), sem UPDATE. Fase 2 backup: rodar `backup/exportar.mjs` (ou `delta.mjs`) para `master_products`, `affiliate_offers`, `affiliate_price_watches`, e gravar o mapeamento antigo->novo de cada `offer_id` movido. Fase 3 execução por grupo em transação: `UPDATE affiliate_offers SET master_product_id = canônico WHERE master_product_id IN (duplicados)`; watches: mover onde não colidir no unique (user, master) e, onde colidir, `is_active=false` no duplicado (não apagar); marcar o master duplicado como fantasma (`attributes = attributes || {"mergedInto": "<id>"}`, sem DELETE; ele fica sem oferta e já é filtrado das listagens). Snapshots não mudam (ligados por `offer_id`), então histórico preservado e a média única passa a somar todas as lojas. Reversível pelo mapeamento. Canônico = master com mais ofertas ativas (empate: mais antigo). Executar só com autorização do dono, por lote (começar pelos 5 jogos do relatório).
(e) Esforço G. (f) Dependências: precede EG-02/09/10 (números só ficam corretos depois) e EG-04 (separar não-jogos antes de fundir). Cache `unstable_cache` 60 a 300 s: aguardar ou revalidar após a fusão.
(g) Arquivos: `src/lib/affiliate/dedup.ts`, `scripts/merge-duplicate-masters.ts` (novo), `scripts/dry-run-dup-report.ts` (novo).

### EG-02 Média/mínimo divergem entre vitrine e página do produto
(a) Cálculos legados em `src/server/queries/affiliate.ts`: `getOfferMetrics` (escopo oferta, linha 551), `getMasterProductMetrics` (612; só o mínimo já vem da fonte única), `getOfferListingMetrics` (842, produto, média 30 d, usada nos cards), `getFeaturedOffers` (1075), `price-table.ts`, `price-history.ts` (estatísticas do gráfico). Fonte única nova: `product-price-stats.ts` + `price-verdict.ts` (ADR 0001), validada pela varredura (6/6 produtos).
(b) Confirmada como sintoma; a hipótese causal (telas calculam diferente) está certa e conhecida: a página `/ofertas/[slug]` usa `getOfferMetrics(offer.id)` (`ofertas/[slug]/page.tsx`, escopo oferta) e o card usa média 30 d do produto; o gráfico usa outra janela. A fonte única existe mas nenhuma tela a consome (`getMasterProductPriceStats` só é usada dentro de `getMasterProductMetrics`).
(c) Mudar: migrar cards, página do produto, tabela de preços, monitoramento, admin e `detect-price-drops.ts` para `getMasterProductPriceStatsBatch`; marcar legados como deprecated; rotular escopo na UI (regra 9). Medir com EXPLAIN antes de ligar nas listagens (ADR cita 3 varreduras por produto; considerar agregado diário).
(d) Sem escrita. (e) M. (f) Depende de EG-01 (fusão) para números finais; é pré-requisito de EG-09, EG-10, EG-13, EG-19.
(g) Arquivos: `src/server/queries/affiliate.ts`, `product-price-stats.ts`, `price-table.ts`, `price-history.ts`, `src/lib/affiliate/price-verdict.ts`, `src/server/notifications/detect-price-drops.ts`, `docs/modelo-indicadores.md` (seção 7.7).

### EG-03 Preços implausíveis e oferta sem coleta como ativa
(a) `affiliate_offers`, `affiliate_price_snapshots`; `discover-shopee-products.ts`, `sources/shopee.ts` (stub), `collect-prices.ts` (`finally` grava `lastCheckedAt`), `record-price-snapshot.ts`; consultas públicas `listRankedOffers`, `getOfferListingMetrics`. Filtro atual: só descarta cotação > 2x a média bruta (`raw_avg * 2`), não há piso.
(b) Confirmada, com causa raiz mais profunda. R$ 11,00: 8 ofertas Shopee ativas, todas com 1 snapshot `source=api` criado na descoberta, `seller_id` nulo, 5 delas jogos de ~R$ 340. "Sem coleta há 1 mês" bate: 2.723 ofertas Shopee e 1.131 ML têm último snapshot > 30 dias; Shopee 3.829/3.855 com 1 snapshot só. O campo `last_checked_at` engana: é atualizado no `finally` mesmo quando a fonte lança erro (a fonte Shopee sempre lança), então parece "verificada agora". Refutada a hipótese de que bastaria um piso: o piso esconde o sintoma, a causa é a Shopee sem coleta oficial.
(c) Mudar: (1) Coleta: Shopee só via Affiliate API oficial (credenciais) ou desligar descoberta/exibição da Shopee; não gravar `last_checked_at` quando a coleta falhou (gravar `last_success_at` separado ou só no sucesso). (2) Leitura pública: piso de plausibilidade relativo (ex.: preço < 35% da mediana do produto com >= 3 ofertas, ou < 20% do `lowAll` do conjunto de lojas confiáveis, sem apagar nada) e piso absoluto por tipo; oferta fora do piso é excluída do "preço atual" público e do selo, mas mantida no banco; selos só com credibilidade (EG-10). (3) Regra de frescor: oferta ativa sem cotação confirmada há > N dias (decisão do dono, sugestão 7) não entra no "preço atual" público; se a loja é a mais barata e está obsoleta, vale a próxima (regra de concorrência real). (4) Opcional com escrita: marcar `expired` as ofertas Shopee sem coleta verificável (3.8 mil, ~63% das ativas): reversível porque `collect-prices.ts:365` reativa `expired` quando volta a achar; precisa de decisão do dono porque derruba o catálogo público de ~6 mil para ~2,2 mil ofertas.
(d) Escrita opcional descrita acima: dry-run listando contagem por rede e por faixa de idade, backup, `UPDATE ... SET status='expired'` em lote com lista de ids guardada para reverter. Nunca DELETE.
(e) G. (f) Depende de decisão do dono (Shopee) e alimenta EG-02/10. (g) Arquivos de coleta: `src/server/collector/discover-shopee-products.ts`, `sources/shopee.ts`, `sources/shopee-auth.ts`, `collect-prices.ts`, `record-price-snapshot.ts`, `src/app/api/cron/*`; arquivos de leitura: `src/server/queries/affiliate.ts`, `product-price-stats.ts`, `price-verdict.ts`.

### EG-04 Acessórios, encartes, caixa vazia, partes misturados a jogos; Game-Key Card
(a) `master_products.product_type` (enum game/console/accessory), `product-type-classifier.ts` (Naive Bayes + `product-type-classifier-model.json`), `isNonProductAccessory` e `isUsedCondition` em `discover-products.ts`, `listRankedOffers` (UPDATE de console para game, ver N3), vitrines em `ofertas/page.tsx` (`isGameOrConsolePhysical`).
(b) Parcial. Confirmado: 17 masters `game` com encarte/caixa vazia/faceplate/réplica (ex.: "Somente Encarte ... Mario Kart 8 Deluxe", "CAIXA VAZIA Zelda TotK", "Faceplate PS5 Elden Ring", "Nier Replicant" por "replicant" casar com "réplica" se o regex for solto: cuidado de falso positivo); nos masters de jogo há ainda volante, dock cover, Pro Controller, console OLED edição Zelda, kits e lotes. Refutado: Game-Key Card (0 ocorrências no catálogo), NFC, capa e case (0).
(c) Mudar: lista de bloqueio por palavra aplicada na descoberta e como reclassificação (encarte, caixa vazia, faceplate, capa, case, "somente", réplica com fronteira de palavra, cabo, volante, kit/lote/combo), com regra "sem 'jogo/mídia/físico' no título e com termo de acessório vence"; remover o `UPDATE` em leitura; criar valor/flag para "peça/embalagem" (ver decisão do dono: esconder ou categoria "Peças e embalagens"). Game-Key Card: tratar como característica de edição (`game_edition_type` ou atributo), pois nenhuma ocorrência existe hoje.
(d) Escrita: sim, `UPDATE master_products SET product_type` em lote (reclassificação), com dry-run listando id, nome, tipo atual e tipo proposto, backup de `master_products` e script reversível (guardar tipo anterior). Fusão EG-01 depois.
(e) M. (f) Antes de EG-01; alimenta EG-17. (g) `src/lib/affiliate/product-type-classifier.ts` (+ model json), `src/server/collector/discover-products.ts`, `discover-shopee-products.ts`, `src/server/queries/affiliate.ts` (só a remoção do UPDATE), `scripts/reclassify-non-games.ts` (novo).

### EG-05 Indicadores contraditórios, números fixos, painel "tempo real" / "EM PRODUÇÃO"
(a) Admin: `src/components/admin/admin-analytics-dashboard.tsx` (histograma, `storeShare` 4.147/1.573/858/357/216 que somam exatamente 7.151, mapa por UF 4.433/1.001/715/572/430 que também somam 7.151, "Hubs Cotia, Louveira e Guarulhos", KPI "300.342" cotações, "+75 cotações / 5 min", "5 Plataformas", badges "Live Scrape"/"API 24/7"), `src/app/admin/data-science/page.tsx` ("98.8%", "Ativo em Produção"), `src/app/admin/page.tsx`. Home: `getPlatformStats` (`affiliate.ts:387`, cache 300 s), `MARKET_NUMBERS` em `(shop)/page.tsx:260` (números Newzoo/Statista escritos à mão com fonte).
(b) Confirmada. 3194626 e 2045 não existem no código (3.194.626 é o COUNT real de snapshots do banco, hoje 3.195.204: não é fixo); 7.151, 4.147, Cotia e 98.8% são constantes do código, sem origem no banco (Magalu 858, Amazon 357, Casas Bahia 216 contradizem o banco: 0 ofertas); "tempo real"/"em produção" aparecem em `page.tsx:365, 433, 314, 793, 828`, `loading.tsx:6`. "EM PRODUÇÃO" vem de imagem ausente (N6), não de status do sistema.
(c) Mudar: substituir os arrays do dashboard por consultas reais (contagens por rede e por faixa de preço, via nova `src/server/queries/admin-metrics.ts` para não conflitar com `affiliate.ts`); apagar mapa por UF/hubs (não existe dado de UF; se o dono quiser, só com campo real de origem do vendedor); remover "98.8% acurácia" e demais métricas de modelo sem medição; trocar "tempo real" por "atualizado em <data da última coleta>"; criar a imagem ausente ou trocar o `SceneImage` por um existente não usado; manter `MARKET_NUMBERS` apenas com fonte e ano citados e rótulo "dado externo".
(d) Sem escrita. (e) M. (f) Independe de EG-01; usa a mesma definição de "ativa" de EG-03. (g) `src/components/admin/admin-analytics-dashboard.tsx`, `src/app/admin/page.tsx`, `src/app/admin/data-science/page.tsx`, `src/server/queries/admin-metrics.ts` (novo), `src/app/(shop)/page.tsx` e `src/app/(shop)/loading.tsx` (textos), `src/components/motion/scene-image.tsx` (fallback sem texto "em produção").

### EG-06 /conta e /ranking fictícios, cronômetros, drop "ao vivo"
(a) `src/app/(shop)/conta/page.tsx:81` ("Nível 12 (Colecionador)"), `src/components/conta/profile-hub-tabs.tsx:197-211` ("Nível 12", "2.840 XP", "480 Coins", "4.9/5.0", "18 Transações", barra de 85%), `src/components/layout/app-header.tsx:263` ("Nível 12" no menu), `src/app/(shop)/ranking/page.tsx`, `live-bid-room.tsx`, `hype-countdown.tsx`.
(b) Parcial. Já corrigido na varredura: `/ranking` virou estado honesto (sem "Renato Assis Lvl 99" nem CyberCollector; conferido no arquivo atual) e a compra simulada de drop foi removida. Ainda confirmado: os valores de `/conta` e do cabeçalho são constantes (o banco tem 0 pedidos, 0 pontos, 0 níveis, então "Nível 12" e "18 transações" são fictícios e contradizem "nenhum pedido"). Refutado: "cronômetros que não correm" e "drop antigo ao vivo" não vêm de dado fixo; `live-bid-room.tsx` tem `setInterval` real e as tabelas `drops` e `auctions` estão vazias (o relatório provavelmente viu um deploy anterior). Os rótulos "Ranking de Vendedores" no header/menu móvel ainda contradizem a página nova (varredura).
(c) Mudar: remover os blocos de gamificação ou ligá-los a `points_ledger`/`levels` quando houver dado, e mostrar "sem pontos ainda" por padrão; tirar "Nível 12" de header, conta e perfil; renomear "Ranking de Vendedores".
(d) Sem escrita. (e) P. (f) Decisão do dono sobre gamificação (EG-25 Points x Coins). (g) `src/app/(shop)/conta/page.tsx`, `src/components/conta/profile-hub-tabs.tsx`, `src/components/layout/app-header.tsx`, `src/components/layout/mobile-nav-drawer.tsx`.

### EG-07 Senha admin fraca e verificação de role no servidor
(a) `src/lib/auth/require-admin.ts` (`requireAdmin`: redireciona se role não é admin/super_admin), `src/server/actions/*.ts`, `src/app/api/admin/search-offers/route.ts`, `src/middleware.ts`, tabela `profiles` (1 super_admin, 5 seller, 2 customer), Supabase Auth.
(b) Senha: ação do dono (não verificável nem desejável por mim; trocar e ativar MFA). Role no servidor: confirmado correto: layout admin e a maioria das actions chamam `requireAdmin`/`requireCustomer`; `/api/admin/search-offers` exige admin (varredura). Pontos a revisar: `src/server/actions/collector.ts` (3 verificações para 6 funções exportadas), `messages.ts` (0/2), `surveys.ts` (0/3), `auth.ts`, `/api/webhooks/mercadolivre` (sem validação de origem). Achado crítico novo: N1 (RLS desligado e `anon` com escrita).
(c) Mudar: migration que habilita RLS em todas as tabelas do schema public (com policies só onde o front usa o client Supabase direto; o app usa Drizzle com conexão direta, que ignora RLS se for o papel dono) e `REVOKE ALL ... FROM anon, authenticated` nas tabelas que o app não consulta via PostgREST; revisar as actions sem guarda; validar assinatura do webhook ML.
(d) Escrita: sim (DDL). Plano: listar via SELECT o que o front lê via client Supabase (grep `supabase.from`), preparar migration em `drizzle/migrations`, aplicar primeiro num branch/preview do Supabase, testar login, `/conta`, watchlist; REVOKE é reversível com GRANT. Pedir autorização antes de aplicar.
(e) M. (f) Independente; deve ir antes de qualquer divulgação. (g) `drizzle/migrations/` (novo arquivo), `src/server/actions/collector.ts`, `messages.ts`, `surveys.ts`, `src/app/api/webhooks/mercadolivre/route.ts`.

### EG-08 Nove links 404
(a) `src/components/layout/site-footer.tsx`, `app-header.tsx`, `mobile-nav-drawer.tsx`, `src/lib/categories-showcase.ts`, `src/app/(shop)/page.tsx:684-718`. Rotas existentes em `src/app/(shop)`: carrinho, conta, contatos, hype-zone, inteligencia-gamer, leiloes, monitoramento, noticias, ofertas, pesquisa, privacidade, ranking, sobre, tabela-de-precos, termos; `src/app` tem entrar, login, esqueci-senha, redefinir-senha. Não existem universos, categorias, sellers, faq, contato, trocas, rastreio, seja-seller, cadastro.
(b) Parcial. Na varredura: rodapé sem os links mortos; `/categorias` virou `/ofertas`, `/cadastro` virou `/entrar`, `/contato` virou `/contatos`; removido o card "Universos" e o "Ver todos". Mas a home ainda gera `href={`/universos/${u.slug}`}` para 6 universos (`page.tsx:684-718`, imagens em `public/images/universos/`) e não há rota `universos/[slug]`: continua 404 (6 links). Nos arquivos atuais não encontrei referência a faq, trocas, rastreio, seja-seller, sellers, cadastro; refutadas no código (eram do deploy anterior). O mecanismo `seo_redirects` existe mas está vazio.
(c) Mudar: remover ou apontar os 6 links de universos para `/ofertas?q=<franquia>`; adicionar teste de links (script que lê todos os `href` e confere contra a lista de rotas) ao QA. Páginas institucionais (FAQ, trocas) só se o dono quiser (conteúdo real).
(d) Sem escrita. (e) P. (f) Nenhuma. (g) `src/app/(shop)/page.tsx` (bloco universos; mesmo arquivo de EG-14/15/16/24).

### EG-09 Página do produto sem gráfico, janelas, tabela de lojas, "R$ X abaixo/acima da média"
(a) `src/app/(shop)/ofertas/[slug]/page.tsx` (a rota pública é a oferta, não o master), componentes prontos: `monitoring/price-history-chart.tsx`, `getMasterProductPriceHistory`, `getOfferComparisonForMasterProduct` (`/monitoramento/comparar/[masterProductId]/page.tsx` já lista as lojas), `price-range-bar.tsx`, `product-price-stats.ts` (lowAll/low1y/low3m, veredito).
(b) Confirmada: a página mostra metadados, selo e `getOfferMetrics`; não há gráfico, janelas de mínimo, nem lista de lojas, nem delta em R$ e %. O plano `PLANO_IMPLEMENTACAO_TOP5.md` já descreve isso (ETAPA 2).
(c) Mudar: reformular a página para o escopo produto (sem criar rota nova: o slug da oferta continua e carrega `masterProductId`): bloco de veredito (R$ X abaixo/em linha/acima do normal, selo apenas com credibilidade), mínimos 3 meses/1 ano/tudo com loja e "encerrada", tabela de lojas ativas (reuso do comparar), gráfico com janelas, aviso "histórico curto".
(d) Sem escrita. (e) G. (f) Depende de EG-02 (dados), EG-01 (números certos), EG-03 (piso), EG-12 (gráfico). (g) `src/app/(shop)/ofertas/[slug]/page.tsx`, novos componentes em `src/components/affiliate/` (ex. `price-verdict-panel.tsx`, `store-price-table.tsx`), reuso sem editar de `src/components/monitoring/price-history-chart.tsx` (se for preciso alterá-lo, é EG-12 e fica com o dono daquele arquivo).

### EG-10 "Menor já visto" com 1 coleta; "Preço em queda" sem queda
(a) `isLowestEver: current <= lowest` (`affiliate.ts:821`, `price-table.ts`), selos em `offer-card.tsx:121,156`, `page.tsx:581`, `weekly-promos-carousel.tsx:160`, `ofertas/[slug]/page.tsx:59,134` (`TREND_META.down`), `weekly-promos-section.tsx:44` ("Preço em queda essa semana"). Regra nova: `price-verdict.ts` (>= 5 cotações e >= 14 dias).
(b) Confirmada: 4.819 ofertas ativas têm exatamente 1 snapshot, e nesse caso `current <= lowest` é verdadeiro por definição. A ETAPA 1 criou `price-verdict.ts` mas as telas ainda usam o cálculo trivial. "Preço em queda": a tendência vem de `getOfferMetrics` (últimos 2 snapshots de uma oferta) e pode rotular queda de 1 centavo ou de oferta isolada.
(c) Mudar: selos e "em queda" só via `price-verdict` (credibilidade e faixa de 5%); sem credibilidade, texto "histórico curto". Impacto esperado: ~87% dos produtos ativos perdem selo (ADR já avisa; avisar o dono). "Em queda": exigir queda real >= limiar entre cotações confirmadas.
(d) Sem escrita. (e) P a M. (f) Depende de EG-02. (g) `src/components/affiliate/offer-card.tsx`, `src/components/geek-deals/weekly-promos-carousel.tsx`, `weekly-promos-section.tsx`, `src/app/(shop)/ofertas/[slug]/page.tsx`, `src/app/(shop)/ofertas/page.tsx`, `src/app/(shop)/page.tsx` (texto do selo na home) e `affiliate.ts` (remover `isLowestEver` trivial).

### EG-11 Desempenho
(a) `src/app/(shop)/page.tsx` (`force-dynamic`), `getPlatformStats` (4 varreduras de 3,2 M snapshots), `listRankedOffers` (dedup 1,3 s + o UPDATE do N3), `getOfferListingMetrics` (3 varreduras), `getFeaturedOffers`, `getTopMovers`.
(b) Parcial. A varredura mediu `/` 6,5 a 21 s e `/monitoramento/altas-e-baixas` 23 a 26 s e já aplicou `LATERAL` (28 s para 1,25 s) e cache de 300 s; `/ofertas` 4,6 s em produção na medição dela (o relatório externo viu ~13 s, plausível em cache frio com tráfego). Confirmado que `/ofertas` não tem cache de página, que `/` é `force-dynamic` e que cada visita refaz dedup + métricas. Prefetch excessivo: não medido (muitos `Link` com prefetch padrão em grades); hipótese a medir.
(c) Mudar: agregado diário por produto (tabela de contadores/estatísticas por master, migration, alimentada pelo cron) para `getPlatformStats` e estatística por produto; cache por tag para `/ofertas` e home; remover escrita em leitura (N3); `prefetch={false}` em grades grandes; medir com `EXPLAIN (ANALYZE)` e logs da Vercel antes e depois.
(d) Escrita opcional: nova tabela de agregados (migration) populada por INSERT; sem apagar nada. (e) M. (f) Depende de EG-02 (qual consulta será a oficial) e vem depois dele. (g) `src/server/queries/affiliate.ts`, `product-price-stats.ts`, `price-history.ts`, `src/app/(shop)/page.tsx` (cache), `src/app/(shop)/ofertas/page.tsx`, `drizzle/migrations/` (opcional).

### EG-12 Gráfico de /monitoramento
(a) `src/server/queries/price-history.ts` (`getMasterProductPriceHistory`, `computeBucketedMinSeries`, `AVG_BUCKET_MS`), `src/components/monitoring/price-history-chart.tsx` (AreaSeries, `LineType.Simple`), `monitoring-board.tsx`, `watchlist-panel.tsx`.
(b) Parcial. Confirmado que cada balde herda o último preço conhecido de cada vendedor ("herdando o preço...", `price-history.ts:122`; `modelo-indicadores.md` §4 descreve isso como método). Isso desenha pontos que não são cotações, o que o relatório aponta e o ADR/plano já listam como problema (gráfico deveria ser degrau, sem preencher lacuna, regra 1). Var%: baseline fixo de 24 h no painel e período selecionado nos movers (§2.4) gera inconsistência. Não conferi o aviso do 1D na tela; o código só rotula `timeVisible`.
(c) Mudar: série em degrau (`LineType.WithSteps`) usando só pontos de cotações reais; carry-forward apenas como linha reta horizontal entre cotações e sem marcador, ou omitir lacunas; no 1D sem cotações suficientes, não desenhar e mostrar aviso; Var% sempre com a janela escolhida e rótulo da janela.
(d) Sem escrita. (e) M. (f) Depende do dado do servidor (EG-02/D). (g) `src/components/monitoring/**`, `src/app/(shop)/monitoramento/**`, `src/server/queries/price-history.ts`.

### EG-13 Média riscada como "de/por"
(a) `src/components/affiliate/offer-card.tsx:136-142` (`line-through` quando `avgPriceCents30d > currentPriceCents`, texto "Preço médio"), `price-table-board.tsx:390`.
(b) Confirmada. A média não é preço de tabela anunciado; riscá-la sugere desconto sobre preço de lista. `listPriceCents` (preço de tabela real do anúncio) existe separado.
(c) Mudar: tirar o `line-through` da média; mostrar "R$ X abaixo da média (R$ Y)" com escopo "todas as lojas"; usar de/por só com `listPriceCents` real do anúncio.
(d) Sem escrita. (e) P. (f) Combinar com EG-02/10. (g) `src/components/affiliate/offer-card.tsx`, `src/components/price-table/price-table-board.tsx`.

### EG-14 Rótulos "Ver ofertas" nos cards da home
(a) `Cluster` em `src/app/(shop)/page.tsx:~164-184` renderiza o mesmo texto "Ver ofertas" para todos os cards do lado GEEK (Hype Zone, Notícias, Observatório Gamer, em `src/lib/categories-showcase.ts:20-22`); `platform-showcase.tsx:75` também.
(b) Confirmada: o rótulo é fixo, o destino não é uma oferta para 3 dos cards.
(c) Mudar: `CategoryCard` ganha `cta` próprio ("Ver drops", "Ler notícias", "Abrir o Observatório"); `Ver ofertas` só nos de produto.
(d) Sem escrita. (e) P. (f) Nenhuma. (g) `src/lib/categories-showcase.ts`, `src/app/(shop)/page.tsx`, `src/components/geek-deals/platform-showcase.tsx`.

### EG-15 Imagens repetidas
(a) Referências em `src/app/(shop)/page.tsx`, `noticias/page.tsx`, `inteligencia-gamer/page.tsx`, `profile-hub-tabs.tsx`; função `getMatchingCover` (`page.tsx:~930`) cai em `news-gta6.png` por padrão.
(b) Parcial. Varredura trocou 3 imagens. Hoje ainda há 9 caminhos citados em mais de um arquivo: `news-gta6.png` (3x), `statement-band`, `por-que-geek86`, `painel-analitico-86-light` (home e inteligencia-gamer), `news-xmen`, `news-esports`, `news-gaming-setup`, `news-retro-console` (home e noticias), `home/tile-1.png` (2x no mesmo arquivo e o arquivo nem existe). O "news-xmen 8x" do relatório vem do fallback por título e de notícias duplicadas no banco (títulos "X-Men" e "GTA 6" repetidos), não só do código. 14 imagens existentes estão sem uso e podem ser distribuídas.
(c) Mudar: cada notícia com `cover_image_url` próprio (campo existe e nenhuma está sem capa); fallback por título eliminado (sem capa = sem imagem ou arte genérica única); trocar duplicatas por imagens livres ou novas (designer-marca); `grep` de cada caminho antes de reutilizar.
(d) Sem escrita no banco (capas ficam em `news_articles.cover_image_url`; alterá-las é UPDATE de conteúdo, tratar junto com EG-16 e pedir autorização). (e) M. (f) Liga-se a EG-16 e EG-24. (g) `public/images/**` (novos arquivos), `src/app/(shop)/page.tsx`, `src/app/(shop)/noticias/page.tsx`, `src/app/(shop)/inteligencia-gamer/page.tsx`, `src/components/conta/profile-hub-tabs.tsx`.

### EG-16 Notícias de 27/07
(a) `news_articles` (7 publicadas, última 2026-07-27, 2 rascunhos), `src/app/(shop)/noticias/**`, `src/server/queries/news.ts`, `src/server/actions/news.ts` (`scrapeNewsArticle` raspa matéria de terceiros: dívida de scraping, M1 da varredura).
(b) Confirmada: nada publicado desde 27/07; varredura (M4) acrescenta que o texto é sem fonte (`source_name` nulo) com afirmações numéricas atribuídas a terceiros e que `/inteligencia-gamer` é array fixo com autores e datas inventados (a página foi editada hoje).
(c) Mudar: não gerar notícia nova com dado inventado. Opções: publicar só conteúdo com fonte e data reais, ou ocultar a seção "Notícias" da home até haver conteúdo; mostrar data real e "última atualização"; despublicar o que não tem fonte (UPDATE de `status`, reversível) conforme decisão do dono.
(d) Escrita: só se o dono decidir despublicar (UPDATE de status em 2 a 9 linhas; sem DELETE). (e) P/M. (f) Decisão do dono; liga a EG-15. (g) `src/app/(shop)/noticias/**`, `src/app/(shop)/inteligencia-gamer/page.tsx`, home (`HomeNewsSection` em `page.tsx`).

### EG-17 "200 ofertas" sem grade
(a) `ofertas/page.tsx`: `broadPool = listRankedOffers({ limit: 200 })`, `monitoredProducts: broadPool.length` (N5) e cada prateleira usa `slice(0, 8)`; `OfferFilters resultCount={broadPool.length}`.
(b) Confirmada: o contador mostra no máximo 200 mas só são renderizados 6 a 8 por prateleira; não existe a grade completa nem paginação (a lista de 200 é só `filter`).
(c) Mudar: grade paginada ("Todas as ofertas") com contagem real (`COUNT` de produtos ativos) e ordenação; manter prateleiras como atalhos.
(d) Sem escrita. (e) P. (f) EG-04 (só jogos entram na contagem de jogos). (g) `src/app/(shop)/ofertas/page.tsx`, `src/components/affiliate/offer-filters.tsx` (e componente de grade), `affiliate.ts` (função de contagem, se for preciso).

### EG-18 Títulos crus, descrições copiadas
(a) `affiliate_offers.title` e `master_products.name` são o título do anúncio (ex.: "Jogo Resident Evil Village - Ps5 Físico", "Novo Lacrado Jogo ... Dublado em Português +Brinde"); não há função de título de exibição (só `cleanTitle` interno do dedup). Descrição: `game-about-section.tsx` usa `getMeliCatalogDetails` (descrição/atributos do catálogo ML).
(b) Confirmada para título (cru em cards e página). Descrição "copiada": o texto vem da API oficial do catálogo ML; é cópia literal, risco de direitos e de conteúdo duplicado, mas não é dado inventado. Hipótese a avaliar com o dono.
(c) Mudar: `displayTitle(master)` (nome canônico limpo = título normalizado + plataforma + edição) e guardar o título cru só como "anúncio do vendedor"; resumo próprio/gerado só a partir de atributos estruturados reais (sem inventar sinopse); exibir a descrição do ML com atribuição ou omitir.
(d) Sem escrita (campo calculado). Opcional: `master_products.name` canônico via script de fusão (EG-01). (e) M. (f) Depois de EG-01 (nome canônico). (g) `src/lib/affiliate/display-title.ts` (novo), `src/components/affiliate/offer-card.tsx`, `src/app/(shop)/ofertas/[slug]/page.tsx`, `src/components/affiliate/game-about-section.tsx`.

### EG-19 Alerta sem preço-alvo
(a) `affiliate_price_watches.target_price_cents` (existe, nunca lido nem escrito: 28 watches, 0 com alvo), `src/server/actions/price-watches.ts`, `watch-toggle-button.tsx` (já rotulado "Acompanhar preço"/"Acompanhando"), `src/server/notifications/detect-price-drops.ts` (usa `getOfferMetrics`, escopo oferta, e limiar de média 30 d).
(b) Confirmada. O botão já se chama "Acompanhar preço", então a renomeação decidida pelo dono já está feita no rótulo; falta o preço-alvo e a regra de alerta.
(c) Mudar: ao acompanhar, gravar `target_price_cents = ceil(lowAll * 1,05)` (constante em `price-verdict.ts`, ADR item 6), permitir editar; `detect-price-drops` passa a comparar o menor preço ativo do produto com o alvo, via fonte única, respeitando credibilidade; texto "Acompanhar preço" com o alvo visível.
(d) Sem escrita de schema (coluna existe); a action grava `target_price_cents` nos novos watches. Watches antigos ficam sem alvo (null = alvo sugerido na leitura). (e) M. (f) EG-02 e EG-10; EG-09 hospeda o botão. (g) `src/server/actions/price-watches.ts`, `src/components/geek-deals/watch-toggle-button.tsx`, `src/server/notifications/detect-price-drops.ts`, `src/lib/affiliate/price-verdict.ts`, `src/server/queries/price-watches.ts`.

### EG-20 Cabeçalho mostra login/cadastro estando logado
(a) `src/components/layout/app-header.tsx:~298-305` mostra sempre "Cadastrar Colecionador / Leiloeiro" e "Entrar / Fazer Login" no menu do ícone de usuário; `mobile-nav-drawer.tsx:201-214` idem; `app-shell.tsx` recebe a contagem do carrinho do layout (o layout já sabe o perfil).
(b) Confirmada: o cabeçalho não recebe o estado de sessão.
(c) Mudar: passar `profile` (nome, role) do layout para `AppShell`/header; logado mostra "Minha conta" e "Sair"; visitante mostra Entrar/Cadastrar; admin vê atalho para `/admin`.
(d) Sem escrita. (e) P. (f) EG-06 (remover "Nível 12" no mesmo arquivo). (g) `src/components/layout/app-header.tsx`, `mobile-nav-drawer.tsx`, `app-shell.tsx`, `src/app/(shop)/layout.tsx`.

### EG-21 Mobile: imagem ocupa a 1ª tela, preço abaixo
(a) `ofertas/[slug]/page.tsx`: grade `lg:grid-cols-[minmax(0,440px)_1fr]` com o bloco da imagem `aspect-square` primeiro; abaixo de `lg` vira coluna única e a imagem quadrada de largura total vem antes do preço.
(b) Parcial: confirmado pelo código (ordem e aspecto); não validei em dispositivo.
(c) Mudar: no mobile, título e preço antes da imagem (ordem) ou imagem com altura máxima (`max-h-[40vh]`, `aspect-[4/3]`); CTA fixo no rodapé; validar 360 a 412 px.
(d) Sem escrita. (e) P. (f) Mesma página de EG-09/10; fazer junto. (g) `src/app/(shop)/ofertas/[slug]/page.tsx`.

### EG-22 Cupons "Verificado" sem validade
(a) `getActiveCouponsForDisplay` (`affiliate.ts:926-1030`), `coupon-carousel.tsx`, `MarketplaceHeroBanner` em `/ofertas`, tabela `affiliate_coupons` (tem `valid_until`, `status`).
(b) Confirmada e agravada: a tabela está vazia e o código devolve 5 cupons de exemplo hardcoded (MELI100, SHOPEE20, MAGALU15, GAMER50 com selo "Verificado", GEEK12 de AliExpress) com `validUntil: null`. É dado fake em produção.
(c) Mudar: apagar o fallback (sem cupons reais, não mostrar o carrossel); exibir só cupons ativos com `valid_until` e data de última verificação; "Verificado" só com campo de verificação preenchido.
(d) Sem escrita. (e) P. (f) Nenhuma, mas toca `affiliate.ts` (mesmo dono de EG-02). (g) `src/server/queries/affiliate.ts`, `src/components/affiliate/coupon-carousel.tsx`, `src/app/(shop)/ofertas/page.tsx`.

### EG-23 "Carrinho" confunde num comparador
(a) `app-header.tsx:313` (aria-label "Carrinho"), `mobile-nav-drawer.tsx:74`, `src/app/(shop)/carrinho/page.tsx` (já explica "itens que você marcou interesse"), `cart-toggle-button.tsx`, tabelas `affiliate_cart_items`.
(b) Confirmada: a rota é `/carrinho`, mas não há checkout; o fluxo real é lista de interesse com aviso por WhatsApp.
(c) Mudar rótulos para "Lista de interesse" (ou "Minha lista"), manter rota com redirect e não renomear a tabela.
(d) Sem escrita. (e) P. (f) Header é do dono de EG-20. (g) `src/app/(shop)/carrinho/page.tsx`, `src/components/affiliate/cart-toggle-button.tsx` e (do outro dono) `app-header.tsx`, `mobile-nav-drawer.tsx`.

### EG-24 Arte do hero com personagens de terceiros
(a) `src/app/(shop)/page.tsx:557-576` (`/images/hero/tile-back.png`, `tile-main.png`, `tile-accent.png`).
(b) Confirmada visualmente (abri `tile-main` e `tile-back`): Mario, Yoshi, Link, Zelda, Samus, Donkey Kong, Ryu/Street Fighter II, Mega Man, console e controle Super Nintendo, logos "Nintendo". `tile-accent` não abri. As duas telas principais também são quase a mesma cena (risco para a regra "uma imagem, um lugar").
(c) Mudar: substituir por arte original sem IP de terceiros (aplicar `padrao-visual-egeek`), preferindo fotos reais próprias da loja/coleção; checar também `public/images/universos/*` (Naruto, One Piece, Marvel, Star Wars, Pokémon, Dragon Ball: personagens licenciados) e `news-xmen`, `news-gta6`. Decisão do dono sobre uso de arte licenciada.
(d) Sem escrita. (e) M. (f) EG-15 (arquivos novos). (g) `public/images/hero/**` (novos), `src/app/(shop)/page.tsx`.

### EG-25 Título de aba, Geek Points x Coins, toolbar Vercel, seção clara no tema escuro
(a) `src/app/layout.tsx` define `template: '%s | Espaço Geek 86'`; 6 páginas já escrevem o sufixo no próprio título (`conta/page.tsx`, `conta/vendedor/page.tsx`, `monitoramento/page.tsx`, `ranking/page.tsx`, `tabela-de-precos/page.tsx`, `admin/data-science/page.tsx`); "Geek Points": `page.tsx:1018,1105`, `hype-zone/page.tsx`, `hype-zone/curadoria/page.tsx`; "Geek Coins": `conta/page.tsx:96`, `profile-hub-tabs.tsx:208`; `ofertas/page.tsx` usa `data-theme="light"` em 2 seções de propósito (fundos `#faf7f2` e `#fffdf9`).
(b) Parcial. Confirmados: título duplicado nas 6 páginas, Points x Coins (2 nomes para a mesma moeda que nem existe: `points_ledger` vazio) e seção clara dentro do tema escuro (decisão de design explícita no código, não bug). Refutado no código: toolbar da Vercel (nenhum `@vercel/toolbar`/`VercelToolbar` em `package.json`, `next.config.ts` ou layout); aparece por configuração do projeto na Vercel (Toolbar habilitada para o ambiente de produção): ação do dono no painel (Settings > General > Vercel Toolbar). `/robots.txt` e sitemap: robots criado na varredura.
(c) Mudar: tirar o sufixo dos 6 títulos; adotar um nome só (decisão do dono) e usar nas telas; desligar a toolbar no painel; decidir se as seções claras ficam (então documentar no padrão visual) ou seguem o tema.
(d) Sem escrita. (e) P. (f) Decisão do dono (nome da moeda; seções claras). (g) Os 6 arquivos de título (cada um fica com o dono do diretório: `conta/**` e `admin/**` com a frente de conta/admin, `monitoramento/page.tsx` e `tabela-de-precos/page.tsx` com a frente de dataviz, `ranking/page.tsx` com a varredura/QA já concluída), `hype-zone/**`, `page.tsx`.

## 4. Decisões que dependem do dono

1. Shopee: ligar a Affiliate API oficial (credenciais) ou desligar descoberta e exibição da Shopee (hoje 63% das ofertas ativas, preços congelados e provável scraping). Se desligar: autorizar marcar como `expired` as Shopee sem cotação confiável (reversível).
2. Autorizar escrita no banco: fusão de duplicatas (EG-01), reclassificação de tipo (EG-04), migration de RLS/REVOKE (EG-07), despublicar notícias sem fonte (EG-16).
3. Segurança: trocar a senha admin e ativar MFA (EG-07); rotacionar as 2 senhas de banco que estavam no código; confirmar no Supabase se o schema public está exposto ao PostgREST.
4. Piso de plausibilidade (sugestão: < 35% da mediana do produto com >= 3 ofertas, e piso absoluto por tipo; R$ 1,00 hoje aparece como "menor preço visto") e prazo de frescor (sugestão 7 dias).
5. Aceitar que ~87% dos produtos percam selo/veredito por "histórico curto" (ADR 0001).
6. Nome da moeda (Geek Points ou Geek Coins) e se gamificação fica escondida até haver dado.
7. Conteúdo editorial: manter, reescrever com fonte ou ocultar `/inteligencia-gamer` e notícias; autores fictícios.
8. Arte com personagens licenciados (hero, `universos/*`, capas de notícia): substituir.
9. Seções claras no tema escuro e Vercel Toolbar (config no painel).
10. Páginas institucionais (FAQ, trocas, rastreio, seja-seller): criar com conteúdo real ou não ter.
11. Se o dono quiser mapa por UF ou hubs logísticos, só com campo real de origem; senão apagar.

## 5. Proposta de ondas paralelas (arquivos sem sobreposição)

Regra: cada arquivo pertence a um único agente por onda. `src/app/(shop)/page.tsx` e `src/server/queries/affiliate.ts` são os pontos quentes; ficam cada um com um agente só. O qa-verificador já editou hoje `ranking/page.tsx`, `inteligencia-gamer/page.tsx`, `site-footer.tsx`, `categories-showcase.ts`, `dedup.ts`, `record-price-snapshot.ts`, `price-history.ts` e `affiliate.ts`; quem for tocar nesses arquivos deve reler o estado atual.

Onda 0 (sem código; decisões da seção 4, backup `backup/exportar.mjs` antes de qualquer escrita).

Onda 1 (6 agentes em paralelo; depende só de decisão 1 e 2 para os itens que escrevem):

| Agente | Itens | Arquivos (exclusivos) |
|---|---|---|
| seguranca-db | EG-07, parte de EG-05 (nada) | `drizzle/migrations/*` (nova), `src/server/actions/collector.ts`, `src/server/actions/messages.ts`, `src/server/actions/surveys.ts`, `src/app/api/webhooks/mercadolivre/route.ts`, `src/middleware.ts` |
| engenheiro-coleta | EG-03 (coleta), EG-04 (entrada) | `src/server/collector/**` (todos), `src/app/api/cron/**`, `vercel.json` |
| guardiao-catalogo | EG-01, EG-04 (dados) | `src/lib/affiliate/dedup.ts`, `src/lib/affiliate/product-type-classifier.ts`, `product-type-classifier-model.json`, `src/lib/affiliate/game-classification.ts`, `scripts/merge-duplicate-masters.ts`, `scripts/reclassify-non-games.ts`, `scripts/dry-run-dup-report.ts` (novos) |
| cientista-precos | EG-02, EG-03 (piso/frescor), EG-10 (regra), EG-12 (servidor), EG-19 (servidor), EG-22 (servidor), EG-11 (consultas), N3 | `src/server/queries/affiliate.ts`, `product-price-stats.ts`, `price-table.ts`, `price-history.ts`, `price-watches.ts`, `src/lib/affiliate/price-verdict.ts`, `src/lib/affiliate/message-template.ts`, `src/server/notifications/**`, `src/server/actions/price-watches.ts`, `src/server/queries/admin-metrics.ts` (novo), `docs/modelo-indicadores.md`, `docs/08-decisoes-adr/0002-*.md` (novo, piso e frescor) |
| engenheiro-frontend A (shell e home) | EG-05 (home), EG-08, EG-14, EG-20, EG-23 (header), EG-24 (troca de referência depois do asset), EG-25 (home/hype) | `src/app/(shop)/page.tsx`, `src/app/(shop)/layout.tsx`, `src/app/(shop)/loading.tsx`, `src/components/layout/**`, `src/lib/categories-showcase.ts`, `src/components/geek-deals/platform-showcase.tsx`, `src/components/motion/scene-image.tsx`, `src/components/home/**`, `src/app/layout.tsx`, `src/app/(shop)/hype-zone/**` |
| engenheiro-frontend B (conta e admin) | EG-05 (admin), EG-06, EG-25 (títulos de conta/admin) | `src/app/(shop)/conta/**`, `src/components/conta/**`, `src/app/admin/**`, `src/components/admin/**` |

Dentro da onda 1, o cientista-precos entrega primeiro (ordem interna) `getMasterProductPriceStatsBatch` + remoção do fallback de cupons + do UPDATE em leitura, para liberar a onda 2. O guardiao-catalogo roda o dry-run primeiro e só executa a fusão com autorização; a fusão deve terminar antes da onda 2 validar números (as telas funcionam com ou sem fusão, mas os números mudam).

Onda 2 (depois de cientista-precos e, idealmente, da fusão):

| Agente | Itens | Arquivos (exclusivos) |
|---|---|---|
| engenheiro-frontend C (produto e vitrine) | EG-09, EG-10, EG-13, EG-17, EG-18, EG-19 (UI), EG-21, EG-22 (UI), EG-23 (carrinho) | `src/app/(shop)/ofertas/**`, `src/app/(shop)/carrinho/**`, `src/components/affiliate/**`, `src/components/geek-deals/{price-range-bar,watch-toggle-button,sales-highlights,weekly-promos-carousel,weekly-promos-section}.tsx`, `src/lib/affiliate/display-title.ts` (novo), `src/lib/affiliate/labels.ts`, `src/lib/format.ts` |
| bi-dataviz | EG-12, EG-25 (títulos de monitoramento e tabela) | `src/components/monitoring/**`, `src/app/(shop)/monitoramento/**`, `src/app/api/monitoramento/**`, `src/components/price-table/**`, `src/app/(shop)/tabela-de-precos/**` |
| designer-marca | EG-15, EG-24 | Somente arquivos novos em `public/images/**` e `docs/banco-de-imagens.md`; a troca de referências no código é feita pelo dono de cada arquivo (home: agente A; `noticias` e `inteligencia-gamer`: editor-noticias; conta: agente B) |
| editor-noticias | EG-16 e EG-15 (capas) | `src/app/(shop)/noticias/**`, `src/app/(shop)/inteligencia-gamer/page.tsx`, `src/server/queries/news.ts`, `src/server/actions/news.ts` |

Onda 3 (verificação): qa-verificador (typecheck, build, desktop e mobile, tema claro e escuro, números contra o banco, grep de imagens, script de links, `/ofertas`, `/` e `/monitoramento/*` medidos com cache frio), atualização de `PROJECT_BLUEPRINT.md` e `modelo-indicadores.md`, e migration de agregado diário se a medição pedir (EG-11).

Dependências resumidas: EG-04 antes de EG-01; EG-01 antes de validar EG-02/09/10; EG-02 antes de EG-09, EG-10, EG-13, EG-19; EG-03 (decisão Shopee) antes de confiar nos números de preço; EG-09 e EG-21 na mesma página; EG-20 e EG-23 e EG-06 compartilham `app-header.tsx` (por isso ficam no agente A).

## 6. O que não foi verificado (lacunas do mapa)

- Tela real em navegador/dispositivo (EG-21, EG-12 aviso do 1D, EG-25 toolbar): só leitura de código; `tile-accent.png` do hero não foi aberta.
- Prefetch excessivo e o tempo de 13 s de `/ofertas` (EG-11): não reproduzidos; só medidas de consulta no banco.
- Se `SHOPEE_AFFILIATE_APP_ID/SECRET` existem na Vercel (define se há scraping ativo em produção, EG-03/N2).
- Exposição do schema public no PostgREST do Supabase (EG-07/N1): privilégios e RLS lidos por SELECT, sem teste de escrita.
- Descrição "copiada" (EG-18): origem identificada (catálogo ML), sem checagem de duplicidade com outros sites.

## 7. Mapa para a Onda 1 pedida (EG-03, 04, 05, 06, 13, 10)

Já corrigido pelo qa-verificador e fora do escopo: ranking fictício, compra falsa de drop, cron sem secret, Map do WeeklyPromos, links 404 do rodapé, imagens em /inteligencia-gamer. Arquivos por item, sem sobreposição entre si:
- EG-03: `src/server/collector/{collect-prices,discover-shopee-products,record-price-snapshot}.ts`, `sources/shopee*.ts` (coleta); piso/frescor em `src/server/queries/affiliate.ts` (agente de preços, dono também de EG-10 servidor).
- EG-04: `src/lib/affiliate/product-type-classifier.ts`, `src/server/collector/discover-products.ts`, `scripts/reclassify-non-games.ts` (novo); a remoção do UPDATE em leitura fica em `affiliate.ts` (mesmo agente de EG-03/10).
- EG-05 e EG-06: `src/components/admin/admin-analytics-dashboard.tsx`, `src/app/admin/**`, `src/server/queries/admin-metrics.ts` (novo), `src/app/(shop)/conta/**`, `src/components/conta/**`, `src/components/layout/app-header.tsx` ("Nível 12").
- EG-13 e EG-10 (UI): `src/components/affiliate/offer-card.tsx`, `src/components/price-table/price-table-board.tsx`, `src/components/geek-deals/weekly-promos-*.tsx`; EG-10 depende de `price-verdict.ts` já existente.
- Conflito a evitar: `affiliate.ts` com um único dono; `app-header.tsx` com um único dono (EG-06 e EG-20).
