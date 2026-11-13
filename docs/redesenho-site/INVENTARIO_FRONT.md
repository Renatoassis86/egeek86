# Inventário do front (2026-11-13)

Autor: engenheiro-frontend do Conselho Geek. Fase 1 (diagnóstico). Nenhum código de produção foi alterado.
Legenda de evidência: DADO REAL (lido no código ou medido, com fonte), HIPÓTESE, RECOMENDAÇÃO.
Estados: ok / precisa ajuste / quebrado / sem uso.

Método: leitura de `src/app/**/page.tsx`, `src/components/**`, `package.json`, `next.config.ts`; varredura de `public/images` por script (caminho literal em `src/`) e por hash MD5 (arquivos idênticos); medição no navegador em docs/redesenho-site/AUDITORIA_RESPONSIVA.md. Limite: uso de imagem por caminho montado dinamicamente (template string) e imagens guardadas no banco (notícias) não aparecem no grep.

## 1. Shell comum (todas as rotas públicas)

DADO REAL, `src/app/(shop)/layout.tsx` e `src/app/(detalhe)/layout.tsx` (o de detalhe reexporta o de shop; fica fora de `(shop)` de propósito, por causa do soft-404).
- AppShell com: TopUtilityBar (link Arkos Intelligence, redes), AppHeader (Institucional com 5 âncoras, Ofertas e Preços com 3 itens, Notícias, Plus), BottomTabBar mobile (Início, Ofertas, Monitorar, Notícias ou Hype, Perfil), MobileNavDrawer, HeaderSearchModal, SiteFooter, TopProgressBar.
- Estado: ok. Ajustes: `/black-friday` não tem link em nenhum menu, rodapé ou home (só no sitemap, `src/app/sitemap.ts:20`); o drawer chama `/ranking` de "Ranking de Vendedores" (`mobile-nav-drawer.tsx:49`) e a página se chama "Ranking de colecionadores" e está vazia por regra; rodapé e header também apontam `/ranking` (`site-footer.tsx:33`, `app-header.tsx:243`).

## 2. Rotas públicas

Resumo: 21 rotas em `(shop)`, 4 em `(detalhe)`, 4 de acesso (`/entrar`, `/login`, `/esqueci-senha`, `/redefinir-senha`). Admin (`/admin/**`) fica fora deste inventário (rotas de operação, sem desenho público).

| Rota | Arquivo | Linhas | Estado | Justificativa curta |
|---|---|---|---|---|
| `/` | `(shop)/page.tsx` | 964 | precisa ajuste | 13 sessões, 27.851 px de altura no mobile, 106 imagens (medido); falta destaque por plataforma e quadro de destaques grande |
| `/ofertas` | `(shop)/ofertas/page.tsx` | 509 | ok / ajuste | prateleiras por tipo e plataforma funcionam; falta quadro de destaques grande |
| `/ofertas/[slug]` | `(detalhe)/ofertas/[slug]/page.tsx` | 484 | ok / ajuste | cartão-produto, métricas v2, gráfico em Suspense, tabela de lojas |
| `/monitoramento` | `(shop)/monitoramento/page.tsx` | 177 | precisa ajuste | gráfico de preço com "linhas estranhas" (diagnóstico em outro parecer); visitante limitado a 1 item |
| `/monitoramento/altas-e-baixas` | `(shop)/monitoramento/altas-e-baixas/page.tsx` | 41 | ok | tabela pública de maiores variações; sem link no menu (HIPÓTESE: só alcançável por URL) |
| `/monitoramento/comparar/[id]` | `(detalhe)/monitoramento/comparar/[masterProductId]/page.tsx` | 249 | ok | comparação por produto |
| `/tabela-de-precos` | `(shop)/tabela-de-precos/page.tsx` | 167 | ok | PriceTableBoard, `force-dynamic` |
| `/pesquisa` | `(shop)/pesquisa/page.tsx` | 35 | ok | formulário de pesquisa da comunidade |
| `/noticias` | `(shop)/noticias/page.tsx` | 422 | precisa ajuste | seção `data-theme="light"` no site dark; carrossel + lista + paginação por categoria |
| `/noticias/[slug]` | `(detalhe)/noticias/[slug]/page.tsx` | 218 | ok | react-markdown |
| `/plus` | `(shop)/plus/page.tsx` | 49 | precisa ajuste | só cartões de loja por departamento + grupos de WhatsApp; sem vitrine de produtos |
| `/black-friday` | `(shop)/black-friday/page.tsx` | 162 | precisa ajuste | tem conteúdo (régua, prateleiras), mas sem nenhum link de entrada |
| `/ranking` | `(shop)/ranking/page.tsx` | 40 | ok (vazio por regra) | estado vazio honesto, sem dado fake; link em 3 menus leva a página sem conteúdo |
| `/sobre` | `(shop)/sobre/page.tsx` | 588 | precisa ajuste | 6 sessões, 17 imagens; duas imagens idênticas na mesma página (ver seção 5) |
| `/inteligencia-gamer` | `(shop)/inteligencia-gamer/page.tsx` | 483 | quebrado (regra) | 8 matérias escritas à mão no código (`INTEL_ITEMS`, linha 28) com afirmações de dado sem fonte (ver seção 6) |
| `/hype-zone` | `(shop)/hype-zone/page.tsx` | 423 | ok (fechada) | `MARKETPLACE_PUBLIC = false` (`src/lib/features.ts:12`); `assertMarketplaceVisible()` |
| `/hype-zone/curadoria`, `/hype-zone/leiloes`, `/leiloes` | `(shop)/hype-zone/...` | 230/438/5 | ok (fechada) | mesma trava |
| `/mercado/[vertical]`, `/mercado/[vertical]/[slug]` | `(detalhe)/mercado/...` | 169/92 | ok (trava de departamentos) | departamentos Plus; HIPÓTESE: ativos só com chave aberta |
| `/carrinho` | `(shop)/carrinho/page.tsx` | 78 | ok | "Lista de acompanhamento" |
| `/conta`, `/conta/notificacoes`, `/conta/vendedor*` | `(shop)/conta/...` | 155/110/297/62/60 | ok (logado) | vendedor depende da trava do marketplace |
| `/contatos`, `/termos`, `/privacidade` | `(shop)/...` | 187/153/155 | ok | institucionais |
| `/link-em-ativacao`, `/oferta-encerrada` | `(shop)/...` | 28/34 | ok | telas de estado |
| `/entrar` | `app/entrar/page.tsx` | 508 | precisa ajuste | login e cadastro juntos; papel "afiliado" como estado interno e no formulário (ver seção 6) |
| `/login`, `/esqueci-senha`, `/redefinir-senha` | `app/...` | 139/95/56 | ok | `/login` convive com `/entrar` (duas portas de entrada; HIPÓTESE: redundância) |
| `/admin/**` | `src/app/admin` | n/a | fora do escopo | operação interna |

## 3. Sessões por página (na ordem de renderização)

### 3.1 Home `/` (`(shop)/page.tsx`, 964 linhas)
Dados no topo: `getPublicMetrics`, `getSurveyAggregationForHome`, `getHomeSearchData` em paralelo (`page.tsx:85`); `force-dynamic` (linha 63); leituras com cache persistido de 60 s.

| # | Sessão | Onde | Indicadores / conteúdo | Estado |
|---|---|---|---|---|
| 1 | Hero com busca | `Hero`, linha 452 | selo "Ofertas reais. Decisões inteligentes.", H1, SearchBox com chips de plataforma | ok |
| 2 | Faixa-declaração | `StatementBand`, linha 334 | 3 contadores (produtos com oferta, lojas monitoradas, cotações) | ajuste: rótulos em 11 px |
| 3 | Promoções da semana | `WeeklyPromosSection` (`geek-deals/weekly-promos-section`, carrossel embla) | cupons/promos | ok |
| 4 | Categorias "lado do jogo / lado da cultura" | `CategoriesSection`, linha 224 | 2 cartões com máscara de imagem | ajuste: não leva a ofertas por plataforma |
| 5 | Destaques de vendas | `SalesHighlights` (`geek-deals/sales-highlights`) | prateleira de ofertas | ok |
| 6 | Seção Plus | `SecaoPlusHome` (`plus/secao-plus-home`) | departamentos Plus | ok |
| 7 | Faixas Plus | `FaixasPlusHome` (`plus/faixas-plus-home`) | faixas por departamento | ok |
| 8 | Pesquisa da comunidade | `SurveySection`, linha 253; `GamerSurvey` | agregação da pesquisa | ok |
| 9 | Indicadores | `IndicatorsSection`, linha 285; 4 `StatTile` | produtos, marketplaces com oferta ativa, cotações, "produtos abaixo do normal" | ok |
| 10 | Teaser Inteligência Gamer | linha 645 | chamada para `/inteligencia-gamer` + 3 imagens | ajuste: leva a página com conteúdo sem fonte |
| 11 | Notícias | `HomeNewsSection`, linha 757 | últimos artigos publicados | ok |
| 12 | Benefícios | `Benefits`, linha 854 | 3 a 4 itens numerados | ajuste: texto de apoio, sem dado |
| 13 | Newsletter | `NewsletterCTA`, linha 908 | convite (Telegram) | ok |

Componentes órfãos relacionados à home (nunca importados, DADO REAL por varredura): `PriceIntelligence` e `UniversesSection` e `DividerEmblem` estão definidos em `page.tsx` (linhas 411, 518, 588) mas NÃO renderizados em `HomePage` (linhas 93 a 113). Já `components/home/news-ticker.tsx`, `components/home/price-charts-showcase.tsx`, `components/geek-deals/platform-showcase.tsx` e `components/geek-deals/antibot-shield.tsx` não têm nenhum importador. Estado: sem uso.

O que falta para o pedido do dono (RECOMENDAÇÃO): quadro de destaques grande (hoje 2 prateleiras de 3 cards), destaques por plataforma (o `platform-showcase.tsx` e as 4 imagens `platforms/*` já existem e estão órfãos), sessão Geek Plus de destaque (hoje 2 sessões Plus, 6 e 7, sem vitrine de produto).

### 3.2 `/ofertas` (`(shop)/ofertas/page.tsx`, 509)
Ordem: SearchBox compacto; MarketplaceHeroBanner "Vitrine de Ofertas"; OfferSectionNav (âncoras e chips de tipo e fabricante); OfferFilters (selects h-11); prateleiras `GroupedOfferShelf`: Ofertas do dia, Destaques da semana, Menor preço já visto, Jogos por plataforma, Consoles por família, Acessórios por plataforma, Kits e bundles. Com `?q=` troca para `SearchResultsView`. Indicadores: queda 24 h contra a média de todas as lojas, menor preço desde 13/07/2026. Estado: ok; prateleira horizontal com cards de 72 vw (máx. 280 px) no mobile (`grouped-offer-shelf.tsx:99`).

### 3.3 `/ofertas/[slug]` (`(detalhe)/ofertas/[slug]/page.tsx`, 484)
Ordem: ProductImage; H1; ProductCardV1 (selo); PriceMetricsV2Block (média única, menor preço, faixa); PriceRangeBar; WatchToggleButton e CartToggleButton; ProductPriceChartSection (Suspense, gráfico lightweight-charts); ProductStoresTable (tabela com `min-w-[320px]`); GameAboutSection. Estado: ok; ajuste: conferir que o gráfico mostre cada mudança do menor preço (ADR 0004; análise no parecer do bi-dataviz).

### 3.4 `/monitoramento` (`(shop)/monitoramento/page.tsx`, 177; `force-dynamic`)
Ordem: banner de visitante (imagem `monitoramento/demo-banner.png`, selo "Visitante: 1 item por vez") ou título "Bolsa Gamer" para logado; MonitoringBoard (WatchlistPanel + PriceHistoryChart/PriceChartV2 + TimeframeSelector). Bibliotecas: lightweight-charts (`price-history-chart.tsx`, 635 linhas; `price-chart-v2.tsx`, 544 linhas, dois componentes de gráfico coexistem), framer-motion. Estado: precisa ajuste (gráfico).

### 3.5 `/noticias` (`(shop)/noticias/page.tsx`, 422)
Ordem: cabeçalho em tema claro (`data-theme="light"`, linha 52); FeaturedArticlesCarousel (embla); chips de categoria; lista (LeadArticleCard + ArticleCard); paginação. Sem dado fixo. Estado: precisa ajuste (tema claro isolado; imagens `noticias-hub/news-*` órfãs).

### 3.6 `/plus`, `/black-friday`, `/ranking`, `/pesquisa`, `/tabela-de-precos`
- `/plus`: cabeçalho; grade de CartaoLojaPlus (1/2/3 colunas); GruposWhatsapp; link de volta. Sem vitrine de produtos.
- `/black-friday`: cabeçalho "Quedas reais de preço"; GroupedOfferShelf; FaixasPlusHome; "Por tamanho da queda" com ReguaLegenda (5 degraus).
- `/ranking`: estado vazio com 2 botões.
- `/pesquisa`: Badge, título, SurveyForm.
- `/tabela-de-precos`: MarketplaceHeroBanner; PriceTableBoard; paginação.

### 3.7 `/sobre` (588): HeroSection, PlatformMetricsSection (StatTile, métricas reais), QuemSomos, MissaoVisaoValores, ObjetivosJustificativa, FerramentasShowcase (linhas 341 a 511, a maior), Idealizador.

### 3.8 `/hype-zone` (fechada): hero com 3 SVG decorativos de 450 a 600 px, cards de reputação, HypeZoneTabs (drops ao vivo, em breve, encerrados).

### 3.9 `/entrar` (508): painel de marca (arcade-neon-noite), login, cadastro com escolha de papel (comprador, afiliado, colecionador) e questionário.

## 4. Bibliotecas por página (DADO REAL, `package.json` e imports)
- Global: next 16, react, tailwind 4 (`tw-animate-css`), `@radix-ui/*` (dialog, dropdown, select, tabs, tooltip, popover, switch etc.), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `vaul` (drawer), `zustand`.
- framer-motion: 5 arquivos (BottomTabBar, Reveal e afins); embla (`embla-carousel-react`, `-autoplay`): `weekly-promos-carousel.tsx`, `featured-articles-carousel.tsx`.
- lightweight-charts: `monitoramento/price-history-chart.tsx` (usado em /monitoramento e /ofertas/[slug]); `animated-stat-bars.tsx` e `globals.css` mencionam o nome (HIPÓTESE: só comentário).
- react-markdown: `/noticias/[slug]`.
- Sem biblioteca de gráfico além de lightweight-charts; sem lib de carrossel duplicada.

## 5. Imagens de `public/images` (77 arquivos, todos PNG, 172 MB)

DADO REAL (script de varredura por caminho literal em `src/` e MD5).

Resumo: 53 usadas uma vez, 23 sem uso, 1 com 2 ocorrências (`system/og-cover.png`, em `app/layout.tsx` como openGraph e twitter, mesma página de metadados; não é imagem visual duplicada).

### 5.1 Violação da regra "uma imagem, um lugar" (conteúdo idêntico com nomes diferentes)
Hash MD5 igual:
1. `sobre/aluguel-tv.png` == `sobre/quarto-retro.png`: AMBAS USADAS NA MESMA PÁGINA `/sobre` (`sobre/page.tsx:168` e `:291`). Violação real, estado: quebrado (regra).
2. `noticias-hub/esports-event.png` == `sobre/snes-caixa.png`: uma usada em `/inteligencia-gamer:85`, a outra sem uso. Estado: precisa ajuste (descartar a sem uso).
3. `categorias/gamer-collage.png` == `sobre/pilha-controles.png`: ambas sem uso.
Por caminho literal não há mais nenhuma imagem repetida entre páginas (o incidente de 2026-07-29 está corrigido). Atenção: a imagem `home/statement-band.png`, `home/pesquisa-comunidade.png` e `categorias/hero-gamer-panel.png` aparecem em `inteligencia-gamer` como capa de matéria; cada uma uma vez.

### 5.2 Sem uso (23), candidatas a remoção ou reaproveitamento por decisão do dono
`categorias/gamer-collage`, `categorias/geek-collage`, `categorias/hero-geek-panel`, `conta/collector-badge`, `hero/tile-accent`, `hero/tile-back`, `hero/tile-main`, `home/hype-zone-teaser`, `home/newsletter-vip-club`, `mascots/collector`, `monitoramento/empty-state`, `noticias/header-collage`, `noticias-hub/news-esports`, `noticias-hub/news-gaming-setup`, `noticias-hub/news-gta6`, `noticias-hub/news-retro-console`, `noticias-hub/news-xmen`, `ofertas/header-collage`, `ranking/badge-legend`, `ranking/hero-banner`, `sobre/loja-retro`, `sobre/pilha-controles`, `sobre/snes-caixa`.
Efetivamente sem uso por componente órfão: `platforms/acessorios`, `platforms/nintendo`, `platforms/playstation`, `platforms/xbox` (só em `platform-showcase.tsx`, que ninguém importa). Total: 27 imagens fora do site. Atenção a `noticias-hub/news-*`: podem ser referenciadas por artigos no banco (HIPÓTESE; não conferido).

### 5.3 Usadas (53), por página
- Home: `categorias/gamer-mask-light`, `categorias/geek-mask-light`, `emblem/6-collectibles`, `emblem/8-drop-reveal`, `emblem/g-gadgets` (estes 3 e `home/divider-emblem` ficam em sessão não renderizada, ver 3.1: efetivamente sem uso), `home/hero-watermark`, `home/observatorio-cards-bg`, `home/observatorio-gamer-hero`, `home/painel-analitico-86`, `universos/*` (6, também em sessão não renderizada). Estado: ok com a ressalva.
- `/inteligencia-gamer`: `categorias/hero-gamer-panel`, `home/painel-analitico-86-light`, `home/pesquisa-comunidade`, `home/por-que-geek86`, `home/statement-band`, `noticias-hub/esports-event`, `noticias-hub/gamer-setup`, `sobre/locadora`.
- `/sobre`: 13 imagens (`sobre/*`, `noticias-hub/data-analysis`).
- `/noticias`: `colunistas/arthur|jessica|renato`. `/conta`: `conta/profile-hero`, `conta/empty-state`. `/monitoramento`: `monitoramento/demo-banner`, `monitoramento/unlock-account`. `/entrar`: `login/arcade-neon-noite`. 404: `errors/404-illustration`. Fechadas: `hype-zone/banner`, `hype-zone/reputation-guide`, `hype-zone/geek-hammer`.

### 5.4 Peso (DADO REAL)
`next.config.ts:12` tem `images.unoptimized: true`: nenhuma imagem passa pelo otimizador (sem redimensionar, sem WebP/AVIF). Há PNGs de 3,2 a 3,8 MB (`noticias/header-collage`, `universos/star-wars` 3,76 MB, `categorias/geek-collage`, `home/divider-emblem`, `sobre/arcade-anos-90-noite`). Estado: precisa ajuste (prioridade alta para mobile).

## 6. Violações e riscos de regra encontrados (DADO REAL)
1. `/inteligencia-gamer`: `INTEL_ITEMS` (`page.tsx:28`, 8 itens) são matérias fixas no código, com datas ("27 Jul 2026"), tempos de leitura e frases como "Levantamento revela a alta de preços de cartuchos raros" sem fonte e sem artigo real. Mesmo padrão do ranking removido em 2026-10-30. Pendência para o conselho decidir: remover, ligar a artigos reais do banco ou sinalizar. Não alterei.
2. Palavra "afiliado": aparece para o cliente em `app/entrar/page.tsx` (estado `'afiliado'` linha 166; botão e questionário linhas 361 a 380; texto visível a confirmar), contra a regra "afiliado nunca aparece ao cliente". Em `/sobre` aparece só no nome de arquivo e id de imagem (`ferramenta-gestao-afiliados`, linhas 360 e 365), não no texto (a confirmar o `alt`/título da ferramenta). `commission-notice.tsx` apenas comenta a regra.
3. Cantos retos: ocorrências de `rounded-full/xl/2xl/lg/md/3xl`: home 9, hype-zone 3, sobre 7, monitoramento 1, entrar 1 (contagem por arquivo de página; componentes não contados). BottomTabBar usa `rounded-full` (`bottom-tab-bar.tsx:60`). Revisar contra o token de raio do design system.
4. Imagem idêntica duplicada em `/sobre` (5.1).
5. Duas portas de login (`/entrar` e `/login`).

## 7. Componentes sem importador (DADO REAL, varredura de imports)
`components/geek-deals/antibot-shield.tsx`, `components/geek-deals/platform-showcase.tsx`, `components/home/news-ticker.tsx`, `components/home/price-charts-showcase.tsx`. (A varredura travou por falta de processos na máquina; houve 1 falha de fork, conferir por `tsc`/knip na execução.)
