# Relatório de varredura — www.egeek86.com (2026-10-30)

Escopo: produção atual (deploy `egeek86-4acr5ztre`, banco Supabase novo) contra as regras de `AGENTS.md`, skill `regras-negocio-egeek`, `docs/modelo-indicadores.md` §7 e ADR 0001. Método: HTTP em produção, logs Vercel (1h), leitura de código, somente SELECT no banco, preview Vercel. Nada foi escrito no banco, nada em produção, sem commit.

**Preview validado:** https://egeek86-ea7pouxd0-renatos-projects-a493f2df.vercel.app (typecheck e `next build` passam; 29 rotas testadas via `vercel curl`, todas 200 exceto cron 401 e /admin 307, sem erro nos logs do preview).
Observação: um deploy anterior do preview (`la3rp2vyt`) falhou por erro transitório de download do Google Fonts no build remoto; o redeploy passou sem mudança de código.

## 1. Inventário

- `src/app`: 51 páginas e 18 route handlers (api/admin, api/cron x3, api/health, api/monitoramento x3, api/search, api/webhooks x2, auth x3, go x2).
- Produção, 20 páginas públicas + `/robots.txt` + `/sitemap.xml` + 5 páginas de detalhe + links do rodapé/home: todas as páginas existentes respondem 200 sem marcador de erro ("couldn't load", "Application error", "[object Object]", "R$ 0,00", "Modo Demonstração"). Os "undefined" no HTML são payload RSC, não texto visível.
- 404 encontrados: `/cadastro`, `/categorias`, `/contato`, `/faq`, `/rastreio`, `/seja-seller`, `/sellers`, `/trocas`, `/universos`, `/robots.txt`, `/sitemap.xml`.
- Tempos em produção (cache frio): `/` 6,5 a 21 s, `/monitoramento/altas-e-baixas` 23 a 26 s, `/ofertas` 4,6 s, `/tabela-de-precos` 4,4 s. Demais abaixo de 1 s.

## 2. Achados por severidade

### CRÍTICO

**C1. `/ranking` exibia leaderboard inventado "Atualizado em Tempo Real"** (6 usuários fictícios com XP, nível e positivação escritos no código; não existe tabela de XP no banco). Violação direta da regra de dado real. CORRIGIDO: página reduzida a estado honesto "ainda não há ranking" (`src/app/(shop)/ranking/page.tsx`).

**C2. Fluxo falso de compra de drop** (`src/components/hype/hype-zone-tabs.tsx`): clicar em comprar mostrava "Compra Aprovada com Sucesso!" com ID de transação `Math.random()`, sem gravar nada. Hoje a tabela `drops` está vazia (inalcançável), mas ficaria enganoso no primeiro drop. CORRIGIDO: agora só avisa que a compra direta ainda não existe.

**C3. Rotas de cron abertas se `CRON_SECRET` faltar** (`collect-prices` e `discover-products` liberavam tudo sem a variável; `notify-price-drops` aceitava o texto `Bearer undefined`). Em produção a variável existe e as rotas respondem 401, mas falhava aberto. CORRIGIDO: `src/lib/auth/cron-auth.ts` (falha fechada) usado pelas 3 rotas. Mantido `?key=` por compatibilidade; recomenda-se abandoná-lo (segredo em URL vai para logs).

**C4. Credencial de banco versionada no código.** `scripts/check-quotes-standalone.ts` (senha do projeto Supabase ANTIGO, ref `sdrj...`) e `backup/testar-conexao.mjs` (senha de outro projeto, ref `ynqu...`). CORRIGIDO: ambos leem de `process.env`. Nenhum outro segredo versionado encontrado (varredura por URL com senha, JWT, `sk_`, `SECRET=`; `.env*` está no `.gitignore`; os demais `postgres://...@localhost` são defaults de dev). **Ação sua:** as duas senhas continuam no histórico do repositório e a segunda apareceu em saída de ferramenta durante esta varredura; rotacione ambas e considere o projeto antigo descomissionado. Pendente (exige você).

### ALTO

**A1. Home: `WeeklyPromosSection: TypeError: c.get is not a function`** (único erro de render da última hora em `/`). Causa raiz: `getOfferListingMetrics` devolvia um `Map` por dentro de `createCachedQuery`/`unstable_cache`, que serializa em JSON e entrega objeto sem `.get`. Efeito: a seção "Ofertas da semana" sumia da home sempre que vinha do cache. CORRIGIDO em `src/server/queries/affiliate.ts` (cache guarda `Record`, `Map` é remontado; mesmo padrão já usado em `product-price-stats.ts`). Validado no preview: seção renderiza com o selo "no menor preço já visto", sem erro nos logs.

**A2. `/monitoramento/altas-e-baixas` levava 23 a 26 s.** Causa: `DISTINCT ON (offer_id)` ordenando ~3 M snapshots. CORRIGIDO com `CROSS JOIN LATERAL ... LIMIT 1` em `getTopMovers` e `getMasterProductChangePercent` (`src/server/queries/price-history.ts`): 28,1 s para 1,25 s medido no banco, resultado idêntico (30 linhas comparadas). Preview: 1,1 s.

**A3. Home levava 6,5 a 21 s.** Causa: `getPlatformStats` varre ~3,2 M snapshots 4 vezes (COUNT 2,5 s, MIN 1,9 s, "abaixo da média" 5,8 s) e tinha cache de 10 s. CORRIGIDO parcialmente: cache de 10 s para 300 s. Preview: frio 15 s, quente 0,5 s. Pendente: o primeiro acesso após expirar ainda paga ~6 s; solução estrutural é agregado diário/tabela de contadores (migration, decisão sua). `/ofertas` e `/tabela-de-precos` frios levam 4 a 6 s.

**A4. Coletor do Mercado Livre expirava oferta viva quando a API falhava.** `mercado-livre.ts` engolia 403/erro de rede e devolvia lista vazia; `collect-prices` interpreta vazio como "sem vendedor" e, após N ocorrências, marca `expired`. Hoje `/sites/MLB/search` dá 403 em todas as chamadas, e as expirações de ML hoje foram 171 (média dos 9 dias anteriores: ~38/dia), compatível com falso positivo (não provado). CORRIGIDO: se a API falhar e nada vier, a fonte lança erro (vira erro no resumo, não "miss"). Ofertas expiradas indevidamente voltam a `active` sozinhas quando reaparecem na coleta (lógica já existente).

**A5. 47 ofertas ativas com `current_price_cents` sem nenhuma cotação igual no histórico** (último snapshot de julho; 22 delas tocadas hoje pelo coletor). É preço exibido sem cotação por trás. Causa: `recordPriceSnapshot` só gravava snapshot se o preço da API diferisse do CACHE; se batia com o cache divergente, nunca gravava. CORRIGIDO em `src/server/collector/record-price-snapshot.ts`: compara também com o último snapshot (uma leitura indexada a mais por registro). As 47 se resolvem na próxima coleta real, sem escrita manual. Mais 1 oferta ativa sem nenhum snapshot (`controle-dualsense-sony-ps5-personalizado-itachi-uchiha-...`): idem.

**A6. Mercado Livre `/sites/MLB/search` retorna 403** (item (b) pedido). Verificado: 403 `{"message":"forbidden"}` também sem token e a partir de IP residencial, e `/products/{id}/items` sem token também; portanto não é IP de datacenter nem limite de taxa, é bloqueio/permissão do lado da API para esse endpoint. O código usa apenas hosts oficiais `api.mercadolibre.com` (Buy-Box `/products/{id}/items` com token continua funcionando: 998 ofertas ML checadas na última hora, snapshots `source=api` entrando, 28 mil/dia). Consequência: a descoberta de produtos ML (`discover-products`: categorias e termos) está inoperante e a busca de concorrentes avulsos (regra "concorrência real") só opera pelo Buy-Box. PENDENTE (dívida/ação sua): checar permissões do app no painel de desenvolvedores do ML ou abrir chamado; não foi implementado scraping.

### MÉDIO

**M1. Scraping existente (dívida, decisão de 2026-10-28):** `src/server/collector/discover-magalu-products.ts` (lê HTML público da busca da Magalu com User-Agent de navegador; Magalu tem 0 ofertas no banco, ou seja, hoje não produz nada) e `scrapeNewsArticle` em `src/server/actions/news.ts` (admin, raspa matéria de terceiros). Não alterados; recomenda-se remover/desligar Magalu da rota `discover-products`. Shopee usa API GraphQL oficial.

**M2. Links 404 no rodapé/home/notícias.** CORRIGIDO: rodapé (`site-footer.tsx`) sem `/universos`, `/sellers`, `/faq`, `/trocas`, `/rastreio`, `/seja-seller`; `/categorias` virou `/ofertas`, `/cadastro` virou `/entrar`, `/contato` virou `/contatos`; removidos o link "Ver todos" para `/universos` na home e o card Universos em `categories-showcase.ts`. Nenhuma página inventada. Adicionado `src/app/robots.ts`. Sitemap não criado (ficaria dependente de decisão de SEO).

**M3. Imagens usadas em mais de um lugar** (regra "uma imagem, um lugar"). Trocadas em `inteligencia-gamer/page.tsx` por imagens existentes e não usadas: `hero-geracoes.png` para `categorias/hero-gamer-panel.png`, `data-analysis.png` para `home/pesquisa-comunidade.png`, `fliperama.png` para `sobre/locadora.png`. Ainda duplicadas (sem imagem livre adequada; pendência de geração):
- `home/statement-band.png`, `home/por-que-geek86.png`, `home/painel-analitico-86-light.png`: home e `/inteligencia-gamer`.
- `noticias-hub/news-gta6|xmen|esports|gaming-setup|retro-console.png`: home (mapa por título) e `/noticias`.
- `home/tile-1.png`: 2 usos em `profile-hub-tabs.tsx` (fallback de avatar e miniatura de drop). O uso em `/ranking` saiu.
Imagens ainda sem uso (14): `categorias/gamer-collage`, `geek-collage`, `hero-geek-panel`, `home/hero-watermark`, `mascots/collector`, `monitoramento/empty-state`, `noticias/header-collage`, `ofertas/header-collage`, `ranking/badge-legend`, `sobre/pilha-controles`, `sobre/snes-caixa`. Nota: `pesquisa-comunidade.png` contém um painel ilustrativo com números e "Maio 2024"; se isso incomodar, trocar.

**M4. Conteúdo editorial fabricado.** `/inteligencia-gamer` é um array fixo no código com artigos, autores (ex.: "Mariana Costa") e datas de jul/2026 inventados; as 9 notícias (7 publicadas e 2 rascunhos, com títulos duplicados de "X-Men" e "GTA 6") do banco têm texto sem fonte (`source_name` nulo), com afirmações como "GTA 6 fature US$ 5,2 bilhões". `docs/modelo-indicadores.md` §6.1 registra que o cliente pediu manter como mockup. Não alterado (decisão de negócio). Proposta: alimentar `/inteligencia-gamer` de `news_articles` e despublicar o que não tem fonte. Também: a home promete "50 Geek Points no primeiro cadastro" e não existe nenhum dado de pontos no banco; `src/components/geek-deals/antibot-shield.tsx` mostra telemetria falsa (hash `Math.random`) mas não é usado em nenhuma tela (código morto, remover).

**M5. "Menor preço já visto na plataforma" = R$ 1,00** (home, `getPlatformStats`). É dado real mas de anúncios-isca da Shopee ("Jogos xbox one ... Baixe diretamente", R$ 1,00) e glitch do ML (Hollow Knight a R$ 2,00 com preço atual R$ 269,79). 14 snapshots abaixo de R$ 5, 12 ofertas ativas abaixo de R$ 5. Decisão de negócio: piso de plausibilidade/exclusão de anúncio-isca.

**M6. Catálogo.** (somente relato; nada fundido)
- master_products: 4.706 (2.894 jogos, 365 consoles, 1.447 acessórios). Duplicatas exatas por título+plataforma normalizados (lógica de `normalizeTitle`): 2 grupos, 2 linhas excedentes, ambas de console cadastrado como `game` ("Nintendo Switch" x "Nintendo Switch Físico", este com 3 ofertas ativas; e dois "Nintendo Switch OLED 64GB Standard", sem oferta ativa). O incidente de 176 duplicatas de julho não se repete.
- Quase-duplicatas (Jaccard >= 0,8 dentro da plataforma): 27 pares; a maioria falso positivo (digital x físico são mídias diferentes; "Super Mario Party" x "Jamboree"). Prováveis duplicatas reais: Zelda BOTW (2 cadastros), Zelda Echoes of Wisdom (2 cadastros físicos), Zelda Tears of the Kingdom (edição Switch 2 x Switch 1 x "Nacional"), Castlevania Anniversary Collection (2). Proposta: revisar com `guardiao-catalogo` antes de fundir; a fusão exige escrita (sua autorização).
- `platform='unknown'`: 401 jogos, 20 consoles, 498 acessórios. Desses 401 jogos, 127 têm oferta ativa. A enum `game_platform_gen` não tem NES/N64/Wii/PS1/Game Boy etc., então jogos retrô ficam `unknown` por limitação do schema (decisão: ampliar a enum). Bug de código corrigido: `normalizeTitle` não reconhecia "Xbox **Série** X" (acento) (`src/lib/affiliate/dedup.ts`, ex.: "Elden Ring - Xbox Série X"). 31 dos 401 têm plataforma derivável do título (inclui alguns falsos como "Kit 4 Cortador..." que são acessório); o backfill é escrita e depende de você.
- Sem vínculo: 0 ofertas sem master, 0 sem rede, 0 snapshots órfãos, 0 snapshots com preço 0. 1.484 masters sem oferta ativa com preço (não devem aparecer no site; as listagens filtram `active` e `current_price_cents>0`, e o total "produtos monitorados" da home, 3.264, bate com a contagem direta). Ofertas ativas com preço 0: 2 (sentinel "aguardando coleta"; não são exibidas).
- Ofertas "Used"/variações de série da Shopee aparecem na lista de ofertas (ex.: `used-variation-...-japan-ver`): vendedores listam vários jogos num anúncio só; há scripts `prune-used-condition-products.ts`/`prune-merchandise-products.ts` já escritos; sugerido rodar com sua autorização.

**M7. Estatística canônica (`product-price-stats.ts`) confere com o banco.** Para 6 produtos (os 3 com mais cotações: 363.266, 292.790, 235.607; 2 médios: 67 e 52; 1 pequeno: 2) a média, número de cotações, descartadas pelo filtro 2x, máximo, mínimo e data do mínimo bateram exatamente com o cálculo direto em JS sobre as linhas brutas (6/6). Não há uso nas telas ainda (só `affiliate.ts:682`). EXPLAIN ANALYZE: produto mais pesado (um controle DualSense com 363 mil cotações, 52 ofertas): agregado 1,9 s + mínimos 3,6 s por produto, sem cache; lote de 36 produtos: 0,18 s + 0,32 s. Planos usam o índice `affiliate_price_snapshots_offer_collected_idx` (Index Scan por oferta, Parallel Seq Scan em `affiliate_offers` pequena, spill em disco no sort). Risco conhecido no ADR: antes de ligar em listagens, criar agregado diário (migration) ou limitar janela; a cauda de produtos muito cotados é o problema, não a média.

### BAIXO / observações

- Cron: `vercel.json` agenda `collect-prices` e `discover-products` a cada 5 min; o novo banco NÃO tem `pg_cron` (schema `cron` inexistente), então tudo roda pela Vercel. Última hora: 24 invocações de collect-prices e 14 de discover-products, todas HTTP 200, sem timeout; coletor grava no banco novo (snapshots `source=api`: 27 a 29 mil/dia de 26 a 30/10; 998 ofertas ML e 1.690 Shopee checadas na última hora; `max(last_checked_at)` = agora). **`notify-price-drops` (digest diário) não está agendada em lugar nenhum** (dependia do pg_cron antigo): pendente decidir agendar na Vercel.
- `/api/admin/search-offers` exige admin (401 anônimo); `/admin/*` redireciona para login (307). `/api/monitoramento/search` responde 200 anônimo (busca pública; sem dado sensível). Webhook Telegram só aceita com secret (falha fechada: se `TELEGRAM_WEBHOOK_SECRET` faltar, rejeita). Webhook do Mercado Livre (`/api/webhooks/mercadolivre`) não valida assinatura/origem (processa notificações em `after()`); recomendável validar `application_id`/`user_id`. Variáveis Telegram, Resend e WhatsApp não existem no ambiente de produção.
- Rótulo "Ranking de Vendedores" no header/menu móvel; a página agora fala de colecionadores. Ajustar quando houver ranking real.
- `middleware.ts` usa convenção depreciada (Next 16 pede `proxy`).

## 3. Arquivos alterados

- `src/server/queries/affiliate.ts` (Map no cache; revalidate 300 s de `getPlatformStats`)
- `src/server/queries/price-history.ts` (LATERAL em 2 consultas)
- `src/server/collector/record-price-snapshot.ts` (snapshot por divergência com o último)
- `src/server/collector/sources/mercado-livre.ts` (falha de API não vira "sem vendedor")
- `src/lib/auth/cron-auth.ts` (novo) e as 3 rotas `src/app/api/cron/*/route.ts`
- `src/lib/affiliate/dedup.ts` (reconhece "série")
- `src/app/(shop)/ranking/page.tsx` (reescrita honesta)
- `src/components/hype/hype-zone-tabs.tsx` (remove compra simulada)
- `src/components/layout/site-footer.tsx`, `src/app/(shop)/page.tsx`, `src/app/(shop)/noticias/page.tsx`, `src/lib/categories-showcase.ts` (links 404)
- `src/app/robots.ts` (novo)
- `src/app/(shop)/inteligencia-gamer/page.tsx` (3 imagens)
- `scripts/check-quotes-standalone.ts`, `backup/testar-conexao.mjs` (credenciais removidas)

## 4. Pendências que exigem você

1. Rotacionar as duas senhas de banco vazadas no código (e no histórico git).
2. ML `/sites/MLB/search` 403: permissões/chamado do app; sem isso a descoberta ML não roda.
3. Decidir sobre conteúdo editorial/mockup (`/inteligencia-gamer`, notícias sem fonte, promessa de Geek Points) e sobre o piso de preço plausível (R$ 1,00).
4. Escrita no banco: fundir duplicatas reais; backfill de plataforma (31 deriváveis); ampliar enum para retrô; podar "used"/série da Shopee.
5. Gerar imagens novas para os pares ainda duplicados (home x inteligência-gamer, home x notícias, tile-1).
6. Agendar `notify-price-drops`; remover Magalu/scrape de notícias (dívida de scraping); remover `antibot-shield.tsx`.
7. Performance estrutural: contadores/agregado diário para home e estatística por produto.
8. Deploy de produção: não feito; o preview acima contém todas as correções.
