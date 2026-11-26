# Parecer do Arquiteto Next (rodada 1, 2026-11-26): engenharia reversa do Pelando

Legenda: [FATO] observado publicamente (briefing e arquivos de apoio); [INFERÊNCIA] reconstrução minha; [CÓDIGO] lido no nosso repositório. Nenhuma requisição adicional foi feita; nada foi escrito em código ou produção.

## 1. Posição
O ganho do Pelando vem de três decisões baratas, não de tecnologia exótica: (a) HTML quase estático com TTL de 60 s na borda; (b) dado vivo (votos, comentários, novas ofertas) separado do HTML, em API própria e ilhas pequenas; (c) SEO programático segmentado por frescor. Nós já temos (b) em parte (APIs com s-maxage) e quase nada de (a) e (c). Recomendo copiar (a), (c) e o JSON-LD; NÃO copiar ilhas/Astro, chat, votação em tempo real nem API pública aberta agora.

## 2. Arquitetura provável do Pelando

```
Usuário
  |
Cloudflare (CDN/WAF; cf-cache-status HIT; Cache-Control public, max-age=60, SWR=240)   [FATO]
  |-- HTML  -> origem Astro (SSR/estático regenerado ~1 min; last-modified ~1 min)       [FATO/INFERÊNCIA]
  |-- /_astro/*.js, assets.pelando.com.br -> arquivos com hash (imutáveis)               [FATO]
  |-- media.pelando.com.br/<w>x<h>/filters:format(webp)/<hash> -> servidor de imagem     [FATO URL / INFERÊNCIA motor (estilo thumbor/imgproxy)]
  '-- api-web.pelando.com.br (JSON; preconnect) -> feed, votos, comentários, alertas     [FATO existência / INFERÊNCIA conteúdo]
Ilhas no navegador (Feed, HeaderV2, Chat, AlertsButton, Notifications, SignInModal,
  GoogleOneTap, SearchInput, PostDropdown, WhatsappBanner)                               [FATO]
   Feed: hidrata o HTML e atualiza por polling/stream na api-web                         [INFERÊNCIA]
   Chat/Notifications: WebSocket ou SSE/polling em serviço próprio                       [INFERÊNCIA, sem prova]
Ingestão: usuário posta oferta -> fila de moderação -> publicada; "temperatura" =
  votos ponderados por tempo, recalculada em worker e gravada (não na leitura)           [INFERÊNCIA]
Busca: índice textual separado (Elastic/Algolia/OpenSearch) atrás da api-web             [INFERÊNCIA, não verificável]
Votação: POST autenticado -> contador em cache (Redis) + fila para o banco               [INFERÊNCIA]
```
Pontos fortes reais: HTML leve para robô e cliente lento; o custo de milhões de visitas cai no CDN, o banco vê no máximo 1 regeneração/min por URL; JS só onde há interação.

## 3. Cache e atualização
- [FATO] max-age=60 + stale-while-revalidate=240: o usuário nunca espera a origem; no pior caso vê dado de até ~5 min. O produto aceita "quase tempo real" no HTML e deixa o dado crítico (temperatura, comentário) para a API.
- Nosso equivalente [CÓDIGO]: `src/app/(shop)/page.tsx:27` usa `force-dynamic` (sem cache de borda no HTML) e `src/app/layout.tsx:105-106` lê `cookies()`/`headers()` (tema) no layout raiz, o que torna TODA rota dinâmica e impede cache de borda. Só as APIs `src/app/api/produtos/[id]/grafico`, `.../lojas`, `src/app/api/search`, `src/app/api/ranking-busca` enviam `s-maxage` + SWR. Já temos cache em processo (`src/lib/cache/swr.ts`, `server-cache.ts`), que alivia o banco mas não a latência nem a escala de instâncias frias.
- Gargalo estrutural: pool com poucas conexões por instância (`src/lib/db/index.ts`, pooler de transação 6543, `max` por tipo) e 30+ crons (`vercel.json`) disputando o mesmo I/O. Cada render dinâmico concorrente é conexão; cache de borda é a única mudança que REDUZ carga no banco em vez de repartir.

## 4. SEO programático
Pelando [FATO]: slugs `/d/<slug>-<hash4>` (slug legível + id curto, estável se o título mudar); hubs `/c/<cat>`, `/cupons-de-descontos/<loja>`, `/recentes`, `/mais-quentes`; sitemaps por tipo e frescor (promotions_recent horário, promotions_AAAA_MM arquivo, stores, communities) com lastmod por URL; JSON-LD DiscussionForumPosting + BreadcrumbList; robots bloqueia crawlers de SEO e rotas privadas.
Nós [CÓDIGO]: `src/app/sitemap.ts` é um arquivo único, `revalidate = 3600`, teto 5000 ofertas + 500 artigos, sem lojas/categorias; `changeFrequency` é ignorado pelo Google e o lastmod usa `updatedAt` (muda a cada coleta, o que dilui o sinal). `src/app/robots.ts` é simples e correto. Não há JSON-LD nas páginas (grep em `src/` só acha um coletor); `src/app/(detalhe)/ofertas/[slug]/page.tsx` tem `generateMetadata` mas sem dados estruturados. Slug por oferta já existe (`affiliate_offers.slug`).

## 5. Desempenho
Pelando [FATO]: home ~275 KB e oferta ~420 KB de HTML (pesado); mídia com transformação por URL (0x200, 0x500, webp) e hashes; JS por ilha com hash.
Nós [CÓDIGO]: `next.config.ts` tem `images.unoptimized: true` e `remotePatterns` com `**`: servimos a imagem da loja no tamanho original, sem webp nem dimensão. É o maior ganho de LCP e banda a custo baixo. Fontes locais e `/images` imutáveis já estão certos.

## 6. Mudanças candidatas (ordem recomendada)

| # | Mudança | Custo | Risco (pool) | Ganho | Ordem |
|---|---|---|---|---|---|
| 1 | JSON-LD Product + Offer (AggregateOffer quando há várias lojas) + BreadcrumbList em `/ofertas/[slug]`; Organization/WebSite no layout | P (1 dia) | Nenhum: usa dados já lidos. Regras: só com preço fresco e verificado (R-81/R-90), nunca preço-isca (R-61), sem `aggregateRating` inventado, `availability` só se medida | Rich results, SEO | 1 |
| 2 | Sitemaps segmentados via `generateSitemaps` (recentes horário, ofertas por lotes, lojas, departamentos, notícias); lastmod = última MUDANÇA real de preço/conteúdo, não toda coleta | P-M | Baixo: 1 consulta leve por segmento, cache 1 h; rodar fora de pico (lição de 18/11) | Descoberta e frescor | 2 |
| 3 | Transformação de imagem: NÃO reativar `next/image` otimizado (custo Vercel e CPU); proxy leve com loader próprio (Cloudflare Images/Supabase Storage transform) para thumbs webp 200/500 px dos cards | M | Zero no banco; custo de banda e risco de direito de imagem da loja; só foto real | LCP, banda | 3 |
| 4 | Cache de borda no HTML: tirar `cookies()/headers()` do layout raiz (tema por script inline + cookie no cliente, ou CSS `prefers-color-scheme`); em home, `/ofertas` e detalhe usar `revalidate=60` + `s-maxage=60, stale-while-revalidate=240` | M-G | Médio: mexe no render de todas as páginas; risco de flash de tema e de preço velho (Amazon vale 45 min, R-81; vitrine R-90 exige "coletado há X" calculado no cliente). Reduz carga do pool; regeneração concorrente exige single-flight (já em `swr.ts`) | Maior alívio de pool e TTFB | 4, canário em `/ofertas/[slug]` |
| 5 | Ilhas vs RSC: manter RSC-first; só `use client` no que muda ao vivo (preço, "coletado há", gráfico) lendo API com s-maxage 60. Migrar para Astro: não | P | Baixo | Mesmo efeito do Pelando sem trocar de stack | junto com 4 |
| 6 | API pública de leitura versionada (`/api/v1/ofertas`, só leitura, s-maxage, paginada, sem campos internos) | M | Alto sem CDN. Abre superfície a scraping e ao link de afiliado (R-70); regras internas não vão ao front | Parcerias, apps | 6, só se o dono pedir |
| 7 | Votação, chat, notificações em tempo real | G | Alto: Realtime/WebSocket consome conexões; fora do modelo (curadoria de preço medido, não comunidade); alerta por Telegram/WhatsApp já cobre | Baixo | Não fazer |

Ordem: 1 -> 2 -> 3 (independentes, baixo risco, em paralelo) -> 4/5 em canário -> 6 sob pedido. 7 fora.

## 7. Riscos transversais
- Cache de borda e preço: respeitar R-81/R-90; HTML com preço e carimbo `coletadoEm`, "há X min" calculado no cliente; nunca cachear mais de 60 s página com preço de Amazon.
- Pool: nenhum item acima aumenta conexões simultâneas; 2 e 4 só reduzem ou mantêm. O item 6 sem CDN seria o único a piorar.
- Reversibilidade: tudo atrás de flag/env; JSON-LD e sitemap revertem por deploy; cache em canário por rota.
- O item 4 é estrutural e pede ADR em `docs/08-decisoes-adr/` (último: 0013) antes de executar.
- Item 3 pede parecer do `guardiao-catalogo` sobre direito e identidade da imagem.

## 8. Dado que falta
1. Hit ratio e TTFB atuais da Vercel (log de edge) para medir o ganho do item 4: NÃO VERIFICADO.
2. Parcela do tráfego orgânico que entra por páginas de oferta (Search Console).
3. Se o Pelando usa polling ou WebSocket: não observado; não muda a decisão.
4. Tamanho real do HTML da nossa home e da oferta (medir antes e depois).

## 9. Métricas de sucesso
- Itens Product válidos no Search Console >= 95% das URLs do sitemap; zero erro de preço divergente.
- LCP p75 mobile da oferta e da home antes/depois dos itens 3 e 4; meta < 2,5 s.
- Taxa de HIT da borda nas rotas canário >= 80% e queda de consultas/min ao pool nelas.
- URLs indexadas vs enviadas por segmento do sitemap.
