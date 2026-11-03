# Inventário de funcionalidades: escopo teórico x entregue (2026-11-01)

Autor: Estrategista de Mercado (Conselho Geek, rodada 1, somente leitura).
Fontes: `docs/PROJECT_BLUEPRINT.md`, `docs/08-decisoes-adr/0003-gamificacao-xp-e-geek-coins.md`, `docs/plano-expansao-tecnologia-2026-10-31.md`, `docs/auditoria-cowork-2026-11-01.md` (seções 2, 5, 6, 7), `research/benchmarks/PANORAMA.md`, `vercel.json`, `src/app`, `src/server`, `src/db/schema`, `docs/pg-cron-setup.md`.

Rótulos: [código] = lido nos arquivos citados; [auditoria] = medido pelo Cowork em produção em 01/11, não reverificado por mim; [inferência] = minha leitura, a confirmar.

Classes: **A** entregue e coerente · **B** entregue mas incoerente com o negócio · **C** prometido e não entregue · **D** entregue sem estar no escopo.

Escopo do negócio (blueprint seção 1 e 5): inteligência de preço e histórico, comparador, alertas, confiança. "Se não fortalece um dos 7 pilares, não entra". O blueprint em si admite que só o Geek Deals tem funcionalidade real.

## 1. Núcleo: inteligência de preço e comparação

| # | Item prometido / existente | Onde (arquivo) | Classe | Observação |
|---|---|---|---|---|
| 1 | Coleta por API oficial Mercado Livre | `src/server/collector/collect-prices.ts`, `price-sources.ts`, cron `/api/cron/collect-prices` (`*/5`, `vercel.json`) | A | Cadência de 5 min no cron; blueprint falava em 5/15 min por temperatura. Há dívida declarada de scraping em `docs/divida-coleta-sem-api-oficial.md`. |
| 2 | Coleta Shopee (Affiliate Open API) | `collect-shopee-prices.ts`, cron `/api/cron/collect-shopee` (`*/10`) | A | 157 produtos Shopee [auditoria]. |
| 3 | Descoberta automática de produtos | `discover-products.ts`, `discover-shopee-products.ts`, `discover-magalu-products.ts`, rota `/api/cron/discover-products` | B | A rota existe mas NÃO está em `vercel.json`; depende de pg_cron manual (`docs/pg-cron-setup.md`) cujo estado em produção não verifiquei. Magalu: descoberta existe, loja não aparece (2 lojas reais) [auditoria]. |
| 4 | Importação de conversões Shopee | `/api/cron/import-shopee-conversions`, `affiliate-reports/shopee-api.ts` | A (parcial) | Também fora de `vercel.json`. Alimenta a métrica de conversão, a que fecha o funil de receita. |
| 5 | Uma média por produto (ADR 0001) | `product-price-stats.ts`, `price-verdict.ts` | B | Fonte única existe, mas média contaminada (F-01, F-13) e cotação pesa por frequência de coleta (F-26). |
| 6 | Mediana / "preço típico" | `product-price-stats.ts`, `price-plausibility.ts` usam mediana internamente | C (na UI) | Não exibida ao usuário (auditoria seção 6). |
| 7 | Veredito de preço | `lib/affiliate/price-verdict.ts` | B | "Excelente" para qualquer delta < 0; "Regular" com +64,5% (F-08); "Preço estável" em 15/15 (F-09). |
| 8 | Piso de plausibilidade e frescor (ADR 0002) | `collector/price-plausibility.ts` | B | Piso sobre média, não mediana: R$ 70 do GT7 passou (F-11). Sem teto (F-13). |
| 9 | Histórico e gráfico de preço | `/monitoramento`, `components/monitoring/price-history-chart.tsx`, `/api/monitoramento/price-history` | B | Gráfico não está na página do produto `/ofertas/[slug]` (auditoria seção 6). |
| 10 | Página de oferta/produto | `app/(shop)/ofertas/[slug]/page.tsx` | B | Tem `generateMetadata`, média, tabela por loja, frescor. Sem JSON-LD `Product` [código: grep `ld+json` sem resultado]. Mínimo "Menor já visto" menor que o atual (F-14). |
| 11 | Busca | `search-products.ts` (1.252 linhas), `/api/search`, `/ofertas` | B | Sem tolerância a erro (F-23); aba Consoles x busca divergem (F-20). |
| 12 | Tabela de preços (catálogo) | `/tabela-de-precos`, `queries/price-table.ts` | B | 37,9 s com `?todos=1`; filtro "Mídia Digital" ativo (F-04, F-18). |
| 13 | Altas e baixas | `/monitoramento/altas-e-baixas`, `top-movers-table.tsx` | B | Não aplica o filtro da cartela: teclado, óculos, borracha (F-07). |
| 14 | Comparar entre lojas | `/monitoramento/comparar/[masterProductId]`, `product-stores.ts` | B | Contagens divergem da estatística do produto (F-10). |
| 15 | Dedup de master_product | `src/lib/affiliate/dedup.ts` | B | Regra inegociável viva no código; duplicatas ainda em produção (F-02, 176 históricos). |
| 16 | Cobertura de títulos obrigatórios | nenhum arquivo | C | Zelda TotK e Mario Kart 8 Deluxe ausentes (F-21). |
| 17 | Rotulagem oferta internacional / bundle | nenhum arquivo | C | F-12, F-27. |
| 18 | Segmentação games / consoles / acessórios | `catalog-dimensions.ts`, `docs/segmentacao-catalogo-2026-10-31.md` | B | Vazamentos de não-jogo e desbloqueado (F-03, F-06). |
| 19 | Contadores públicos | `getPlatformStats` em `queries/affiliate.ts`, home/sobre/contatos | B | 4 valores distintos para "produtos" (F-15). Viola "uma fonte". |
| 20 | Sinopse | `queries/synopsis.ts` | B | Sinopse do produto errado (F-01), inglês (F-22). |

## 2. Retenção: alertas e conta

| # | Item | Onde | Classe | Observação |
|---|---|---|---|---|
| 21 | Acompanhar preço + preço-alvo sugerido | `server/actions/price-watches.ts` (alvo só com histórico elegível) | A | Coerente com a regra de dado real. Preço-alvo editável via `setWatchTarget`. |
| 22 | Detecção de queda (alvo, mínimo, 12% abaixo da média) | `notifications/detect-price-drops.ts` | A | Usa fonte única e ofertas públicas (ADR 0001/0002). Herda a contaminação da média quando não há alvo. |
| 23 | Envio por e-mail (Resend) | `send-email.ts`, `send-daily-digest.ts` | A | Cron `/api/cron/notify-price-drops` diário às 11:00 UTC. |
| 24 | Envio por Telegram | `send-telegram.ts`, `actions/telegram-link.ts`, `/api/webhooks/telegram` | A | |
| 25 | Preferências de notificação | `actions/notification-preferences.ts`, `/conta/notificacoes` | A | |
| 26 | Alerta imediato (tempo quase real) | nenhum | C | Único ciclo diário. Concorrentes (ITAD, GG.deals, Keepa, Promobit) alertam por evento [PANORAMA]. |
| 27 | WhatsApp automático | `send-whatsapp.ts` usado só em `actions/admin-cart.ts` | D | Blueprint declara fora de escopo; existe código para carrinho admin. Verificar se roda. |
| 28 | Login/conta/dashboard | `/entrar`, `/conta`, `components/conta` | A | |
| 29 | Lista de compra ("carrinho") | `/carrinho`, `actions/cart.ts`, `/admin/carrinhos` | A | Vira "Ir à loja". Schema de marketplace (carts/orders/payments) segue sem uso. |
| 30 | Contadores sociais reais (quantos acompanham) | nenhum | C | Lacuna do PANORAMA seção 3. |
| 31 | Newsletter | `<NewsletterCTA />` em `app/(shop)/page.tsx` | D (a verificar) | Não localizei fluxo de envio. [inferência] Pode ser só captura. |

## 3. Aquisição: SEO, redirecionamento, medição

| # | Item | Onde | Classe | Observação |
|---|---|---|---|---|
| 32 | `sitemap.xml` | inexistente (`src/app/robots.ts` tem 7 linhas, sem `Sitemap:`) | C | F-29. 404 confirmado [auditoria] e ausência no código [código]. |
| 33 | SEO programático (blueprint seção 12) | `db/schema/ops.ts` (`seo_redirects`, sem uso) | C | Blueprint marca 🟡. |
| 34 | Dados estruturados (JSON-LD) | nenhum | C | [código] sem `ld+json`. |
| 35 | Metadados por página | `generateMetadata` em `ofertas/[slug]`, `ofertas`, `noticias/[slug]`, `monitoramento/comparar` | A | |
| 36 | Redirecionamento de afiliado `/go/[slug]` | `app/go/[slug]/route.ts`, `go/noticia/[slug]` | A | Slug inexistente cai em `/ofertas` sem aviso (F-32). |
| 37 | Rastreio de cliques e conversões | `queries/affiliate-clicks.ts`, `affiliate-conversions.ts`, `analytics_events`, `docs/rastreio-cliques-e-conversoes-2026-10-31.md` | A (parcial) | Só `affiliate_click` instrumentado (blueprint seção 16). Sem funil (visita, busca, produto, clique). |
| 38 | Performance da home | `app/(shop)/page.tsx` (1.013 linhas) | B | 22,5 a 38,5 s [auditoria]. Mata SEO e conversão (Core Web Vitals). |
| 39 | Divulgação de publicidade | `termos`, `sobre` | B | Termos dizem "parceiros afiliados"; a regra interna proíbe a palavra ao cliente (decisão 5). |

## 4. Conteúdo, Observatório, notícias

| # | Item | Onde | Classe | Observação |
|---|---|---|---|---|
| 40 | Notícias | `/noticias`, `/noticias/[slug]`, `queries/news.ts`, `/admin/noticias`, `schema/news_articles.ts` | B | Autor "Teste Monitoramento" sem fonte (F-05); imagem repetida 8x (F-25). |
| 41 | Observatório / Inteligência Gamer | `/inteligencia-gamer`, `components/home/price-charts-showcase.tsx` | B | Conteúdo editorial sem dado próprio (nota 3, auditoria seção 2); rótulo "Carrossel 2s" (F-30). |
| 42 | Painel de mercado da home | `app/(shop)/page.tsx` `MarketStatsSection`/`MarketNumbersSection` (linhas ~240-330), `price-charts-showcase.tsx` | B | Números não fecham (F-17). Dados de terceiros (Newzoo) hardcoded, não são dado da plataforma. |
| 43 | Pesquisa gamer / survey | `/pesquisa`, `actions/survey.ts`, `queries/survey.ts`, `gamer-survey.tsx` | D | Não está no blueprint. Gera dado próprio real (potencial editorial), mas fora do núcleo. |
| 44 | Geek Intelligence (B2B) | `/admin/data-science` apenas | C | Visão ⚪ no blueprint. |

## 5. Comunidade, gamificação, Hype Zone, leilões

| # | Item | Onde | Classe | Observação |
|---|---|---|---|---|
| 45 | Gamificação ADR 0003 (`awardCoins`, XP, níveis, benefícios) | schema `loyalty.ts` | C | `grep awardCoins` sem resultado [código]. Nada da implementação do ADR entregue. |
| 46 | Pontos soltos ainda ativos | `actions/curation.ts` (`+10` direto em `geekPoints`, linha ~60; `+50` voto vencedor, ~176-191), `actions/collector.ts` | B | Fora da fonte única `points_ledger`; sem idempotência nem teto diário. |
| 47 | Resgate de pontos em cupom ("100 pontos = R$ 1,00") | `curation.ts` `convertPointsToDiscount` (linhas ~77-123), `components/geek-deals/points-rewards-card.tsx` | B | O ADR 0003 manda remover. Ainda no código e na UI. Contradiz decisão do dono de 2026-10-31. |
| 48 | Ranking de colecionadores/vendedores | `/ranking` | A | Estado vazio honesto (nota 7). Ranking fictício foi retirado. |
| 49 | Hype Zone (drops) | `/hype-zone`, `components/hype`, `queries/hype.ts`, `actions/hype.ts`, `schema/hype.ts` | B | Blueprint dizia "zero UI" (🟡); hoje existe UI completa. Nota 3 por não ser comparação de preço. Está em destaque na navegação (`app-header.tsx` linha ~58, `bottom-tab-bar.tsx` linha 13 com `highlight: true`). |
| 50 | Leilões C2C | `/hype-zone/leiloes` (433 linhas), `/leiloes` (re-export de 5 linhas), `actions/auction.ts`, `live-bid-room.tsx`, `schema/auctions.ts` | D / B | Não está no blueprint como produto. Texto promete "escudo anti-bot", "caução", "itens inspecionados" sem mecanismo visível [auditoria]. Risco legal e de confiança. |
| 51 | Curadoria por votação | `/hype-zone/curadoria`, `actions/curation.ts`, `schema/curations.ts` | D | Fora do blueprint. 404 em `/curadoria` raiz [auditoria]. |
| 52 | Área de vendedor C2C (onboarding, novo drop) | `/conta/vendedor/*`, `schema/sellers.ts`, `seller_kyc.ts`, `seller_payouts.ts` | D | Blueprint lista "programa de sellers" como futuro ⚪. Entregue antes do núcleo estar confiável. |
| 53 | Credenciamento com foto do rosto | `/contatos` | D (risco) | F-19 LGPD, dado biométrico sem base legal. |
| 54 | Wishlists, reviews, product_views | `schema/engagement.ts` | C | Schema sem UI (blueprint seção 15). |
| 55 | Geek Graph | `affiliate_watches` como aresta embrionária | C | Visão ⚪. |

## 6. Expansão e plataforma

| # | Item | Onde | Classe | Observação |
|---|---|---|---|---|
| 56 | Expansão para tecnologia/eletro | `docs/plano-expansao-tecnologia-2026-10-31.md` (plano; nada aplicado) | C | Plano técnico apenas. Depende de "um produto, uma média" e de `product_type = tech`. |
| 57 | Marketplace próprio (carrinho, pedido, pagamento) | `schema/orders.ts`, `payments.ts`, `carts.ts`, `inventory.ts` | C | Schema sem UI nem actions. Dívida de manutenção sem retorno. |
| 58 | Admin (ofertas, cupons, redes, usuários, mensagens, pesquisa) | `src/app/admin/*` | A | Cupom é cadastro manual (decisão correta). |
| 59 | Webhooks Mercado Livre e Telegram | `/api/webhooks/*` | A | |
| 60 | Saúde / observabilidade | `/api/health` | B | Público, expõe estado (F-31). |
| 61 | Benchmarks | `research/benchmarks/` | A | 12 portais; lacunas listadas no PANORAMA seção 3 ainda abertas. |

## 7. Contagem

| Classe | Itens |
|---|---|
| A entregue e coerente | 1, 2, 4, 21-25, 28, 29, 35-37, 48, 58, 59, 61 (parcial em 4 e 37) |
| B entregue mas incoerente | 3, 5, 7-15, 18-20, 38-42, 46, 47, 49, 60 |
| C prometido e não entregue | 6 (UI), 16, 17, 26, 30, 32-34, 44, 45, 54-57 |
| D entregue sem estar no escopo | 27, 31, 43, 50-53 |

Leitura: o núcleo de coleta e alerta é sólido e coerente; a camada de apresentação (número, veredito, contagem) é onde o negócio vaza confiança. Fora do núcleo, há cinco módulos de comunidade/C2C (itens 49-53) que consomem manutenção e risco, e três itens de aquisição (32-34) que custam pouco e não existem.

## 8. Crons (verificável)

| Cron | Em `vercel.json` | Cadência | Observação |
|---|---|---|---|
| `/api/cron/collect-prices` | Sim | `*/5 * * * *` | |
| `/api/cron/collect-shopee` | Sim | `*/10 * * * *` | |
| `/api/cron/notify-price-drops` | Sim | `0 11 * * *` | Único alerta, uma vez ao dia. |
| `/api/cron/discover-products` | Não | via pg_cron (manual) | Estado em produção desconhecido. |
| `/api/cron/import-shopee-conversions` | Não | não localizada | Confirmar agendamento. |

## 9. Dependências e limites deste inventário

- Não rodei o site; as medições de produção vêm do Cowork.
- Classificação A/B/C/D é minha. Divergências com o presidente ou com o QA devem ser registradas em ata.
