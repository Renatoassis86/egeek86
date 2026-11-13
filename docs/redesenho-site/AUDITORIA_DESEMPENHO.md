# Auditoria de desempenho do front (2026-11-13)

Autor: engenheiro-performance-web (Conselho Geek). Fase 1, diagnóstico e plano. Nenhum código, deploy ou commit foi feito.
Rótulos: DADO REAL (medido por mim em 2026-11-13, com a fonte), HIPÓTESE (inferência sem prova) e RECOMENDAÇÃO.

Método das medições: `curl.exe` (PowerShell, Windows, uma máquina no Brasil, borda Vercel gru1) contra https://www.egeek86.com, `Accept-Encoding: gzip`, 5 rodadas intercaladas de 12 URLs (60 requisições), 0,5 s entre URLs e 6 s entre rodadas (cada URL repete a cada ~15 s, acima do mínimo de 5 s). Tamanhos são bytes transferidos comprimidos (gzip). Análise de bundle feita baixando os chunks de produção e comprimindo com brotli. Nenhum build foi rodado. Dados brutos: `scratchpad\s2.tsv` (sessão).

Incidente de método (declarado): uma primeira tentativa em bash rodou duas vezes em paralelo e falhou por memória do Git Bash (fork). Descartei o resultado dela para as tabelas e refiz tudo em PowerShell, sequencial. Os números abaixo vêm só da segunda execução, mais uma leitura avulsa da home (3,54 s) feita antes.

## (a) Tempo de resposta real por HTTP

TTFB = `time_starttransfer`. Total = `time_total` (conteúdo completo, streaming incluído). n = 5 por URL. Formato mín / mediana / máx, em segundos.

| URL | TTFB | Total | HTML gzip (KB) | Amostras com total > 3 s |
|---|---|---|---|---|
| / | 0,43 / 0,48 / 0,75 | 0,83 / **4,68** / 4,96 | 68 | **3 de 5** |
| /ofertas | 0,32 / 0,33 / 0,37 | 1,02 / 1,06 / 1,34 | 66 | 0 |
| /ofertas/back-4-blood-playstation-5-video-game-amazon-700dcc | 0,37 / 0,38 / **2,68** | 0,38 / 0,39 / 2,79 | 15 | 0 (mas 2 de 5 com TTFB de 2,7 s, ver abaixo) |
| /monitoramento | 0,30 / 0,33 / 0,37 | 0,31 / 0,34 / 0,51 | 14 | 0 |
| /pesquisa?q=zelda | 0,30 / 0,33 / 0,35 | 0,32 / 0,35 / 0,41 | 13 | 0 |
| /noticias | 0,31 / 0,34 / 0,40 | 0,45 / 0,46 / 0,52 | 20 | 0 |
| /plus | 0,32 / 0,35 / 0,39 | 0,33 / 0,40 / 0,49 | 18 | 0 |
| /black-friday | 0,33 / 0,35 / 0,42 | 0,71 / 0,84 / 0,93 | 62 | 0 |
| /ranking | 0,32 / 0,33 / 0,42 | 0,33 / 0,45 / 0,53 | 12 | 0 |
| /tabela-de-precos | 0,33 / 0,35 / 0,42 | 0,50 / 0,57 / 0,66 | 38 | 0 |
| /sobre | 0,33 / 0,34 / 0,35 | 0,34 / 0,45 / 0,51 | 27 | 0 |
| /hype-zone | 0,31 / 0,33 / 0,37 | 0,32 / 0,33 / 0,48 | 11 | 0 |

Correção da linha de detalhe de produto: das 5 amostras, 2 tiveram TTFB de 2,65 s e 2,68 s (rodadas 1 e 4) e 3 tiveram 0,37 a 0,38 s; o total acompanha o TTFB (2,76 s e 2,79 s). Ou seja, 40% das amostras de detalhe passaram de 2,6 s (DADO REAL, n pequeno).

Cabeçalhos de cache (DADO REAL, iguais em todas as 60 requisições): `x-vercel-cache: MISS`, `age: 0`, `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`. Nenhuma página é servida do cache de borda; toda visita executa a função. Header `Vary: rsc, next-router-state-tree, ...`.

Tamanho bruto do HTML (sem compressão), DADO REAL: home 685 KB (363 KB em scripts inline do payload RSC), /ofertas 870 KB (469 KB inline), /black-friday 817 KB (446 KB inline). Comprimidos ficam em 62 a 68 KB, mas o navegador faz parse dos 685 a 870 KB.

### A home continua oscilando?

Sim. DADO REAL: totais da home nas 5 amostras espaçadas = 4,83 s, 4,96 s, 0,85 s, 4,68 s, 0,83 s. 3 de 5 (60%) ficaram entre 4,7 e 5,0 s; a leitura avulsa anterior foi 3,54 s (somando, 4 de 6, 67%, acima de 3,5 s). A faixa rápida é 0,83 a 0,85 s.
Detalhe importante: o TTFB da home é bom em todas as amostras (0,43 a 0,75 s). A lentidão está na cauda do streaming: o shell chega rápido e o resto do conteúdo só termina em ~4,7 a 5,0 s. HIPÓTESE: uma seção sob Suspense espera o teto de frio (`coldTimeoutSeconds: 5` em `src/app/(shop)/page.tsx`, linha ~72) e o resultado fecha perto desse teto; as correções #46/R-49 trocaram a espera infinita por teto de 3 a 5 s, mas o teto é visível ao usuário quando o snapshot está frio. Precisa de log de servidor por seção para confirmar.
Meta da fila (home p95 < 3 s) NÃO está atendida: p95 observado ≈ 4,96 s no total (n=5, p95 = máximo).
Em contrapartida, as demais 11 páginas estão todas abaixo de 1,4 s no total e de 0,45 s no TTFB, exceto o spike do detalhe de produto.

## (b) Peso por página

### JavaScript e CSS (DADO REAL, chunks de produção baixados e comprimidos em brotli)

| Página | Chunks JS | JS bruto (KB) | JS brotli (KB) | CSS bruto / brotli (KB) |
|---|---|---|---|---|
| / | 16 | 1.132 | 291 | 192 / 21 |
| /ofertas | 18 | 1.248 | 324 | 192 / 21 |
| /ofertas/[slug] | 17 | 1.305 | 339 | 192 / 21 |
| /monitoramento | 18 | 1.327 | 344 | 192 / 21 |
| /noticias | 16 | 1.120 | 288 | 192 / 21 |
| /plus | 16 | 1.125 | 289 | 192 / 21 |
| /black-friday | 17 | 1.129 | 291 | 192 / 21 |
| /sobre | 16 | 1.092 | 279 | 192 / 21 |

Todas as páginas carregam 279 a 344 KB de JS comprimido; o piso comum é ~280 KB. Isso é alto para uma página de conteúdo. Maiores chunks da home: 233 KB (51 KB br, framework/Next), 222 KB (react-dom, 59 KB br), 117 KB (framer-motion, 34 KB br), 110 KB (34 KB br), 107 KB (25 KB br). O chunk de framer-motion está presente também em /monitoramento e /noticias (DADO REAL): vem do layout (`src/components/layout/bottom-tab-bar.tsx` importa framer-motion) e do `Reveal`. /monitoramento adiciona um chunk de 173 KB (49 KB br) com lightweight-charts. /noticias adiciona um chunk com sonner (39 KB).

CSS: dois arquivos, um de 174 KB bruto (Tailwind 4 completo, ~19 KB br) e um de 22 KB com 74 regras `@font-face` (71 com `font-display: swap`). Sem render-blocking relevante após compressão (21 KB br no total); o que pesa é a quantidade de regras de fonte.

### Imagens

DADO REAL, `images.unoptimized: true` em `next.config.ts`. Consequência: nenhuma imagem passa por `/_next/image` (0 de 106 tags `<img>` da home usam `/_next/image`), não há WebP/AVIF, nem redimensionamento, nem `srcset`/`sizes`. Em todas as páginas medidas, 100% das tags `<img>` estão sem atributo `sizes`. Na home: 106 imagens, 103 com `loading="lazy"`, 0 com `fetchpriority="high"`; as 3 não-lazy são o logo do cabeçalho e o `<img>` cru do fundo borrado.

Origem das 106 imagens da home: 54 de `http2.mlstatic.com`, 31 de `cf.shopee.com.br`, 13 de `m.media-amazon.com` (CDNs dos marketplaces, tamanhos ~320 px, fora do nosso controle), mais as locais abaixo.

`public/` tem 207 MB em 103 arquivos; 91 são PNG, 1 WebP. Maiores PNG (bytes, DADO REAL por `find`): header-collage de notícias 3,79 MB; universos/star-wars 3,76 MB; categorias/geek-collage 3,56 MB; home/divider-emblem 3,52 MB; hero/tile-back 3,39 MB; sobre/pilha-controles 3,34 MB; mascots/collector 3,25 MB; home/painel-analitico-86 3,17 MB; home/hype-zone-teaser 3,16 MB; home/statement-band 3,14 MB. Há também cópias soltas "ChatGPT Image 26 de jul..." de 3,1 a 3,3 MB na raiz de `public/` (candidatas a remoção do repositório se não referenciadas; verificar com grep antes).

Imagens locais que a home referencia, servidas hoje como PNG cru (tamanho transferido medido por curl, sem compressão, `cache-control: public, max-age=0, must-revalidate`):
- `observatorio-gamer-hero.png`: 2.670.757 bytes (2,55 MB). É pré-carregada por `Link: rel=preload; as=image` no cabeçalho da home e usada num `<img>` com `blur-2xl opacity-40`, ou seja, 2,5 MB para um fundo desfocado a 40% de opacidade.
- `observatorio-cards-bg.png`: 2.635.491 bytes (2,51 MB).
- `painel-analitico-86.png`: 3.174.478 bytes (3,03 MB).
- `hero-watermark.png`: 1.672.626 bytes (1,60 MB).
Soma só dessas quatro: ~9,7 MB. Um visitante que role a home inteira baixa ~10 MB só dessas, antes das 100+ fotos de produto.
Logo: `geek 86.webp` tem 92 KB e dimensões 4220x1568, exibido a h-7/h-8 (28 a 32 px de altura); aparece duas vezes na home (cabeçalho e rodapé). O correto seria ~200x75 px (poucos KB).
LCP e CLS: as imagens de produto no topo da lista são `lazy` e sem `priority`, o que atrasa o LCP (HIPÓTESE: o elemento LCP da home é a imagem do hero ou o primeiro card; precisa de medição em navegador, não feita nesta fase). Tags `<img>` de produto vêm com largura/altura? Não verifiquei por tag individual (dado que falta).

### Fontes

DADO REAL (`src/app/layout.tsx` + CSS de produção): 3 famílias via `next/font/google` (Geist 5 pesos, Geist Mono 3, Inter 4), todas `display: 'swap'`, formato woff2, self-hosted pelo Next (zero requisição ao Google em runtime). 74 regras `@font-face` (subsets por unicode-range), mas o navegador só baixa as usadas. A home faz `rel=preload` de 3 arquivos woff2. Ponto de atenção: 12 pesos declarados nas 3 famílias; cada peso/família extra é mais um arquivo na primeira pintura. RECOMENDAÇÃO: reduzir a 2 famílias (Geist + Inter ou só Geist) e 3 a 4 pesos, ou usar a fonte variável.

## (c) Bibliotecas (package.json) e uso (DADO REAL: grep em `src/`)

| Biblioteca | Arquivos que importam | Onde / peso medido | Leitura |
|---|---|---|---|
| framer-motion 12 | 6 (`bottom-tab-bar`, `reveal`, `animated-price`, `animated-stat-bars`, `price-charts-showcase`, `lib/motion.ts`) | chunk de 117 KB bruto / 34 KB br em TODAS as páginas (vem do layout e do `Reveal`) | Maior custo desproporcional. Candidato nº 1: trocar `Reveal` e `bottom-tab-bar` por CSS (transition/animation) ou usar `LazyMotion` + `m` com `domAnimation` (~5 KB). |
| lightweight-charts 5 | 1 componente (`monitoring/price-history-chart.tsx`) + helpers de cor | chunk de 173 KB / 49 KB br, hoje só em /monitoramento | Correto estar isolado. Confirmar que o detalhe do produto o carrega via `dynamic()` só quando o gráfico entra na tela; no detalhe medi 339 KB br contra 291 KB br da home, sinal de que algo extra carrega ali. |
| embla-carousel (+autoplay) | 2 (`weekly-promos-carousel`, `featured-articles-carousel`) | ~6 KB cada, pequeno | Manter. O carrossel de notícias na home não deve autoanimar acima da dobra (CLS/INP). |
| @radix-ui (12 pacotes) | 6 arquivos | espalhado em chunks compartilhados (um de 35 KB com radix+lucide) | Aceitável; checar se Dialog/Select/Dropdown carregam na home sem uso. |
| lucide-react 1.x | 114 arquivos | ícones por import nominal (tree-shake ok); chunk misto | Manter; garantir import nominal, nunca `import * as`. |
| react-markdown 10 | 1 (`/noticias/[slug]/page.tsx`) | traz remark/micromark (peso alto) | Fica fora da home; confirmar que só entra no artigo. Alternativa: renderizar markdown no servidor (RSC), zero JS no cliente. |
| sonner 2 | 20 arquivos | chunk de 39 KB (11 KB br) no layout raiz (`<Toaster/>`) em todas as páginas | Carregar sob demanda (só quando há toast). |
| vaul 1 (drawer) | 1 | pequeno | Verificar se carrega fora da tela que o usa. |
| zustand | 1 | pequeno | Manter. |

Padrão de código: 88 arquivos com `"use client"` em `src/app` e `src/components`. Quase todo o JS inicial é framework (react-dom 59 KB br + Next 51 KB br = 110 KB br) mais bibliotecas de UI compartilhadas.

Candidatos a `dynamic()` (RECOMENDAÇÃO): lightweight-charts e `price-charts-showcase` (abaixo da dobra na home), Toaster, carrossel de notícias abaixo da dobra, drawer (vaul), `GamerSurvey`. Candidatos a remoção: framer-motion no caminho crítico (substituir por CSS).

## (d) Comparação de ordem de grandeza com portais de referência

DADO REAL, medido por mim, 2 amostras por portal, espaçadas 5 s, só TTFB/tamanho/status (sem raspar conteúdo), `curl` com User-Agent de navegador genérico, `Accept-Encoding: gzip`, seguindo redirecionamentos. Sem prova de que algum portal serviu a mesma versão a um bot ou a um navegador real.

| Portal | Status | TTFB (amostras) | Total (amostras) | HTML gzip (KB) |
|---|---|---|---|---|
| zoom.com.br | 200 | 0,56 / 0,59 | 0,72 / 0,65 | 78 |
| promobit.com.br | 200 | 0,48 / 0,38 | 0,53 / 0,43 | 49 |
| pelando.com.br | 200 | 0,17 / 0,17 | 0,18 / 0,17 | 41 |
| kabum.com.br | 200 | 0,18 / 0,57 | 0,19 / 0,68 | 16 (provável página enxuta/ desafio de bot; não comparável) |
| mercadolivre.com.br | 200 | 0,52 / 0,60 | 0,69 / 0,75 | 168 |
| egeek86.com (home, boa) | 200 | 0,43 a 0,75 | 0,83 a 0,85 | 68 |
| egeek86.com (home, ruim) | 200 | 0,43 a 0,75 | 4,68 a 4,96 | 68 |

Leitura: o TTFB da home (0,43 a 0,75 s) está na mesma ordem de grandeza de Zoom, Promobit e Mercado Livre (0,4 a 0,6 s); Pelando é o melhor (0,17 s). O problema do egeek86 não é TTFB, é a cauda do streaming (total 4,7 a 5,0 s contra 0,2 a 0,75 s dos portais). Peso de HTML comprimido da home (68 KB) é comparável a Zoom (78 KB) e Promobit (49 KB). Não medi JS, imagens nem Core Web Vitals dos portais (sem dado, sem comparação).

## (e) Plano de correção priorizado

Metas (RECOMENDAÇÃO): home p95 total < 3 s e TTFB < 800 ms em todas as páginas (já cumprido nas 12 páginas medidas, exceto o spike do detalhe); LCP < 2,5 s no 4G móvel; JS inicial < 200 KB brotli na home e < 220 KB nas demais (hoje 279 a 344 KB); transferência de imagens locais da home < 600 KB (hoje ~9,7 MB nas quatro maiores). CLS < 0,1 e INP < 200 ms. Todas as metas de LCP/CLS/INP exigem medição em navegador (não feita nesta fase).

Ordem por ganho esperado e custo:

1. **Imagens (maior ganho, baixo risco)**. Ligar o otimizador do Next (remover `images.unoptimized: true` de `next.config.ts` ou, se o limite do plano Vercel de transformações preocupar, converter os PNG locais para WebP/AVIF em build e manter o `unoptimized`). Passar `sizes` e `priority`/`fetchPriority` na imagem do LCP e em 4 a 6 cards acima da dobra, `loading="lazy"` no resto. Reexportar os PNG de >2 MB em AVIF/WebP no tamanho de exibição (2x do container, tipicamente 1600 px de largura): esperado 2,5 a 3 MB para 60 a 200 KB cada. Trocar o `<img>` cru do fundo borrado (`observatorio-gamer-hero.png`, preload de 2,5 MB) por uma versão de ~20 KB ou por gradiente CSS e remover o `rel=preload` dela. Reexportar `geek 86.webp` em ~240x90 px. Ganho esperado: de ~10 MB para menos de 1 MB de imagens locais na home. Regra "uma imagem, um lugar" mantém: nunca duplicar arquivo para otimizar; sobrescrever o mesmo caminho.
2. **Cauda de streaming da home (4,7 a 5 s em 60% das amostras)**. Identificar a seção que espera ~4,5 s (HIPÓTESE: `coldTimeoutSeconds: 5`, leitura de snapshot frio), com log por seção no servidor. Mudar de "espera o teto" para "mostra o último snapshot persistido e atualiza em segundo plano" (SWR), ou envolver cada seção em `Suspense` com esqueleto de altura fixa. Respeita o frescor de ADR: o snapshot mostra o horário da última leitura. Meta: p95 total da home < 3 s; ideal ~1 s (faixa rápida atual 0,83 s).
3. **Cache de borda / ISR para páginas não personalizadas**. Hoje `x-vercel-cache: MISS` e `no-store` em tudo porque o `RootLayout` lê `cookies()` e `headers()` (tema) e várias páginas têm `force-dynamic`. Isso torna toda rota dinâmica. Ler o tema no cliente (script inline com `data-theme` antes da pintura, cookie lido no navegador) para liberar o layout, e usar `revalidate` de 30 a 60 s nas listas públicas (/ofertas, /ranking, /tabela-de-precos, /noticias, /sobre, /hype-zone) com tags de revalidação nos jobs de coleta. Em preço, o frescor da ADR 0004 manda: o selo e a média devem carregar o horário; nada de "preço velho como atual". Ganho esperado: TTFB de ~330 ms para ~50 a 100 ms em HIT; menos carga no banco (menos risco da fila #46). Requer parecer do dba-postgres e do engenheiro-backend (dependência).
4. **JS inicial**: tirar framer-motion do caminho crítico (substituir `Reveal` e a animação do `bottom-tab-bar` por CSS ou `LazyMotion`): -30 KB br em todas as páginas. `dynamic()` para Toaster, gráfico, enquete, drawer. Esperado: de 291 para ~220 KB br na home. Verificar o que o detalhe do produto carrega a mais (339 KB br).
5. **Detalhe de produto**: 2 de 5 amostras com TTFB 2,7 s. HIPÓTESE: consulta de histórico sem cache ou função fria. Aplicar o mesmo padrão de snapshot persistido (item 2) e reler com 20 amostras. Meta TTFB p95 < 800 ms.
6. **HTML da home/ofertas/black-friday (685 a 870 KB brutos, 363 a 469 KB de payload RSC inline)**: 106 a 118 cards renderizados de uma vez com dados duplicados no payload. Paginar ou limitar a ~24 cards por seção na home, com "ver mais" para a página de listagem. Isso também reduz memória/parse no celular. Atenção: o dono pediu um quadro de destaques de tamanho comparável ao dos grandes marketplaces; isso exige imagens leves (item 1) e renderização limitada acima da dobra.
7. **Fontes**: reduzir de 3 famílias/12 pesos para 2 famílias/4 pesos, mantendo `swap`. Ganho secundário (-2 a 4 arquivos woff2 na primeira pintura).
8. **Higiene**: remover (ou mover fora de `public/`) os arquivos "ChatGPT Image..." soltos e imagens não referenciadas (grep antes de apagar). Adicionar `Cache-Control` imutável para `/images/*` (hoje `max-age=0, must-revalidate`), com nome versionado quando trocar.

## Riscos
- Mudar o tema para o cliente e liberar cache pode causar flash de tema (FOUC) se o script inline não rodar antes da pintura; testar claro/escuro.
- Cachear listas de preço pode mostrar valor desatualizado; manter o horário de leitura visível e o TTL curto (30 a 60 s), em linha com ADR 0004.
- Ligar `next/image` aumenta custo de transformações na Vercel; estimar antes (ou pré-converter em build).
- n = 5 por URL é amostra pequena; o percentual de oscilação da home (60%) tem incerteza alta. Repetir com 30 a 50 amostras ao longo de um dia.

## Dado que falta
- Core Web Vitals reais (LCP, CLS, INP) em navegador, móvel 4G e desktop; Lighthouse/PageSpeed não foram rodados nesta fase.
- Log de servidor por seção da home e do detalhe para localizar a cauda de 4,5 s e o spike de 2,7 s.
- Medição na mesma rota antes/depois de cada correção.
- Estatística de ISR/cache hit na Vercel e o limite do plano para transformação de imagens.
- JS, imagens e CWV dos portais de referência (só TTFB/tamanho de HTML foram medidos).
- Se `.next-perf2/`, `.next-perf3/` e `.next/` têm `stats`: o diretório `.next-perf3` só continha `dev`; não usei build local.

## Métrica de sucesso
Home: p95 do total < 3 s e mediana < 1,2 s em 50 amostras espaçadas; TTFB p95 < 800 ms em todas as 12 páginas; LCP p75 < 2,5 s; JS inicial < 200 KB br na home; imagens locais da home < 600 KB; `x-vercel-cache: HIT` em ≥ 80% das requisições das listas públicas; detalhe de produto sem amostra de TTFB > 1 s em 20 leituras.
