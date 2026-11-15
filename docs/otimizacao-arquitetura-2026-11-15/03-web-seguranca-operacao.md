# Otimização da arquitetura, fatia 03: aplicação web, desempenho, segurança, observabilidade, DevEx/CI e custos

Data: 2026-11-15 (tarde). Modo: somente leitura, nenhum código alterado, nenhum `next dev` ou `next build`. Pedido do dono: "estude nossa arquitetura e veja o que otimizar mais pelas boas práticas para esse tipo de projeto".
Esta fatia não repete a auditoria de 15/11 (`docs/auditoria-2026-11-15/`). Onde o item já está na fila, a coluna "Fila" traz o número; **NOVO** = ainda não está na fila. Rótulos: **[medido]** = número obtido hoje com `curl`, `npm audit` ou contagem no código; **[leitura]** = lido no código; **[hipótese]** = inferência a confirmar. Esforço: S até 1 h, M meio dia, L de 1 a 3 dias ou mais.

## 0. Resumo

O site é saudável para o tráfego que tem hoje (14 humanos nas últimas 24 h, segundo a auditoria 03), mas **toda visita é uma invocação de função na região `iad1` sem nenhum cache de borda**: as páginas públicas medidas voltam `Cache-Control: private, no-cache, no-store` e `X-Vercel-Cache: MISS`. Isso funciona com 14 visitas e é o primeiro ponto frágil se a Black Friday trouxer centenas de milhares. A boa notícia: o padrão de cache de borda já funciona no projeto (`/api/search` devolve `HIT` em 0,20 s) e as causas de as páginas não terem cache são 4 decisões pequenas e removíveis (W-01).

### Top 10 por retorno sobre esforço

| # | Achado | Evidência | Esforço | Risco | Fila |
|---|---|---|---|---|---|
| 1 | **Cache de borda para páginas anônimas** (`s-maxage` 60 s + `stale-while-revalidate`) em `/`, `/ofertas`, `/black-friday`, `/mercado/[vertical]`, `/ofertas/[slug]`: remover 4 bloqueios (cookies no layout raiz, cookie `eg_v`, `getUser` no proxy, personalização na página de produto) | 100% das páginas medidas `private, no-store` + `MISS`; `src/app/layout.tsx:94-95`; `Set-Cookie: eg_v` na home [medido] | M (home, ofertas, vitrines) a L (produto) | médio | **NOVO** (#86 e #89 tocam só partes) |
| 2 | **Tirar o `proxy.ts` do caminho de `/go`, `/g`, `/api/search`, sitemap e robots** (o `matcher` só exclui `api/produtos`, `api/webhooks`, `api/ingest` e imagens) | `src/proxy.ts:48`; o clique que gera comissão paga um `getUser` com teto de 5 s antes do redirect [leitura] | S | baixo | **NOVO** |
| 3 | **Fotos menores** na origem: ML `-F.jpg` 76 a 273 KB contra `-V.webp` 5,6 a 22 KB; Shopee original 145 a 401 KB contra `_tn` 24 a 45 KB | 3 fotos ML e 2 Shopee baixadas hoje [medido]; `/ofertas` referencia 74 ML, 120 Shopee e 20 Amazon | S a M | baixo (testar nitidez nos cards grandes) | parcial #89 (ML sim; Shopee `_tn` NOVO) |
| 4 | **Paginar `/ofertas` e `/black-friday`**: 490 ofertas por requisição (250 + 120 + 120; 1.100 com filtro) e 53% do HTML é payload RSC | `/ofertas` 1.006.260 B, `/black-friday` 871.115 B, `?page=2` devolve o mesmo tamanho [medido]; `ofertas/page.tsx:155-157` | M | baixo | parcial #89 |
| 5 | **Medição real de Core Web Vitals e de erros** (`@vercel/speed-insights` + `onRequestError` em `instrumentation.ts` gravando em tabela) | nenhum SDK de analytics/erro no `package.json` [medido]; `instrumentation.ts` só aquece cache fora da Vercel | S | baixo | **NOVO** (#89 só cita a falta) |
| 6 | **Dependabot e CI de PR** com typecheck, testes e `next build` no GitHub Actions (resolve também a falta de RAM da máquina local) | só existe `backup-externo.yml` em `.github/workflows`; `npm audit` com 7 vulnerabilidades (1 crítica) | S a M | baixo | #77 e #91 cobrem a correção; Dependabot e build em CI NOVO |
| 7 | **Entradas públicas que gravam sem limite**: `submitSurveyResponse` e `logDropAccess` sem zod, sem tamanho máximo e sem limite por IP; `/go` grava um evento por clique (72% bots) | `src/server/actions/survey.ts:18-38`, `hype.ts:62`; 18 dos 21 arquivos de actions sem zod [medido] | S | baixo | parcial #93 (firewall); validação NOVO |
| 8 | **CSP em Report-Only sem destino de relatório**: ninguém recebe as violações, então a promoção a enforce (#107) não tem dado | `next.config.ts` sem `report-to`/`report-uri` [medido] | S | baixo | **NOVO** (liga com #107) |
| 9 | **Teste de carga e plano de capacidade da Black Friday** contra preview, com meta por rota | nenhum teste de carga existe; capacidade só inferida | M | médio (não rodar em produção) | **NOVO** (#93 pede "plano de pico", sem número) |
| 10 | **`ProductImage` é componente cliente com `useState` em cada card** (cerca de 110 instâncias hidratadas por página de lista) | `src/components/ui/product-image.tsx:1,56`; 92 arquivos `'use client'` [medido] | M | baixo | **NOVO** |

Já cobertos e que continuam P0 (não repeti a análise): #69 repositório ainda **PUBLIC** (confirmei com `gh repo view` hoje), #70 alertas e sonda externa, #72 reaper, #73 segundo disparador, #77 Next 16.4.6, #85 exceção de firewall, #86 `getUser` só com cookie `sb-*`, #89 pré-aquecimento.

### O que eu não medi (honestidade)

- **Custo em reais** de Vercel e Supabase: não tenho acesso ao painel de uso. Só contei invocações a partir de `vercel.json`. Linha de base de custo continua **SEM DADO**.
- **Regras de WAF/rate limit da Vercel, plano exato, retenção de logs, região configurada no painel**: não verificável por fora. Onde cito, marco **NÃO VERIFICADO**.
- **Core Web Vitals reais** (LCP, INP, CLS): não existem dados de campo. Só medi TTFB, tamanho e cabeçalhos.
- **Capacidade sob carga**: não gerei carga (a máquina tem pouca RAM e produção tem WAF). Tudo sobre o pico é raciocínio de arquitetura, não teste.
- **JS do cliente**: não rebaixei os chunks; uso a medida da auditoria 04 (19 chunks, ~300 KB brotli) e confirmei só a contagem (19 chunks na home, 26 KB de CSS em brotli).
- **TTFB varia**: a mesma página de produto deu 2,7 s (auditoria 04) e 5,5 s (minha medida, 1ª visita fria). Uma rodada de `curl` não é distribuição.
- Se o proxy do Next 16 precede o cache da CDN da Vercel (W-02) é **[hipótese]**: não testei com cabeçalho de diagnóstico.

---

## 1. O que medi hoje (produção, `www.egeek86.com`, poucas requisições)

| Rota | HTTP | TTFB (s) | Total (s) | Bytes (br) | Bytes HTML | Cache |
|---|---|---|---|---|---|---|
| `/` | 200 | 0,48 | 0,97 | 47.352 | 680.309 | `private, no-store`, MISS, `Set-Cookie: eg_v` |
| `/ofertas` | 200 | 0,35 | 3,76 | 52.204 | 1.006.260 | `private, no-store`, MISS |
| `/black-friday` | 200 | 0,41 | 1,96 | n/m | 871.115 | idem |
| `/mercado/impressao3d` | 200 | 0,40 | **7,63** | 23.815 | n/m | idem |
| `/ofertas/battlefield-6-...` (1ª visita) | 200 | **5,55** | **7,55** | n/m | 108.837 | idem |
| `/games` | 404 | 0,43 | 0,43 | 10.225 | n/m | idem (a rota real é `/mercado/games`) |
| `/api/health` | 200 | 0,59 | 0,59 | 21 | n/m | `public, max-age=0, must-revalidate` (faz `SELECT 1`) |
| `/api/search?q=ps5` | 200 | 3,66 (frio), depois 0,20 | n/m | 3.738 | n/m | `s-maxage=60`, **HIT** na 2ª |
| `/go/slug-inexistente` | 302 | 0,55 | n/m | n/m | n/m | `public, max-age=0, must-revalidate` |
| `/sitemap.xml` | 200 | n/m | n/m | 246.616 B | n/m | **HIT** (`revalidate = 3600`, `Age: 90`) |

Cabeçalhos presentes em todas as respostas: HSTS (1 ano, sem `preload`), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP enforçada parcial (`frame-ancestors`, `object-src`, `base-uri`) mais CSP completa em Report-Only. Preload de fontes presente (4 `Link: rel=preload`, 3 arquivos `woff2` na home). `X-Vercel-Id: gru1::iad1::...` em todas: a borda é São Paulo e a **função roda em `iad1` (Virgínia)**; o banco está em `aws-0-us-east-2` (Ohio) [só o nome do host, lido no `.env.local`].

Outras medidas: 169 `<script>` na home (payload RSC); 53% do HTML é `self.__next_f.push` (payload RSC): `/ofertas` 524.753 de 996.711 bytes, home 359.458 de 680.309; `/ofertas` com 112 `<img>`; 82 arquivos com `force-dynamic` (de 58 páginas e 44 rotas em `src/app`); 7 `loading.tsx`; nenhum `revalidate` em página pública (só `sitemap.ts`), nenhum `use cache`, nenhuma tag; `vercel.json` sem `functions` e sem `regions`.

---

## 2. Aplicação web e desempenho

### W-01. Nenhuma página pública é cacheada na borda (NOVO, maior retorno)

**Evidência [medido + leitura].** Todas as páginas HTML voltam `private, no-cache, no-store` e `MISS`. Quatro causas empilhadas, e basta uma para impedir o cache:

1. `src/app/layout.tsx:94-95`: o layout raiz chama `cookies()` e `headers()` só para decidir o tema (`theme` e `sec-ch-prefers-color-scheme`). Isso torna **todas** as rotas dinâmicas, mesmo as que o dono quiser tornar estáticas.
2. `src/proxy.ts:19-33` e `src/lib/supabase/middleware.ts`: a home recebe `Set-Cookie: eg_v` (visto na resposta) e todo caminho passa por `supabase.auth.getUser()`. A Vercel não guarda no cache respostas com `Set-Cookie`. O rollout da home nova já foi a 100% (fila #84), então o cookie de sorteio perdeu a função, mas continua sendo escrito.
3. `export const dynamic = 'force-dynamic'` em `(shop)/page.tsx`, `black-friday`, `monitoramento`, `plus`, `mercado/[vertical]` e `mercado/[vertical]/[slug]` (o comentário diz que é para o build não pré-renderizar buscando no banco).
4. `src/app/(shop)/layout.tsx:7-8`: `getCurrentProfile()` + `getCartItemCount` + `departamentosVisiveis` em toda página; e a página de produto lê perfil, carrinho e alertas do usuário (`(detalhe)/ofertas/[slug]/page.tsx:94-99`).

**Impacto.** Cada visita é uma invocação em `iad1` mais consultas no Supabase (Ohio). Com a Black Friday, custo de função, latência (borda `gru1` para `iad1` e volta, **[hipótese]** da ordem de 100 a 150 ms só de ida e volta, não medida) e risco de saturar as 60 conexões crescem linearmente com as visitas. Cache de borda por 60 s transformaria milhares de visitas por minuto em cerca de 1 invocação por página por região por minuto.

**Recomendação (em degraus; parar no degrau que o risco permitir antes de 27/11).**
- Degrau 1 (S, junto com #86): parar de escrever `eg_v` (rollout em 100%) e fazer o `proxy` só chamar `getUser` se existir cookie `sb-*-auth-token`.
- Degrau 2 (S a M): tema sem `cookies()`/`headers()`: um `<script>` inline minúsculo antes da pintura lê `localStorage`/`prefers-color-scheme` e põe `data-theme` (padrão do `next-themes`); `<html suppressHydrationWarning>` já existe. O servidor passa a renderizar sem cookie.
- Degrau 3 (M): o cabeçalho/`AppShell` recebe `viewer` e `cartCount` do cliente (um `fetch('/api/eu')` privado, pequeno) em vez de ler no layout; mesma ideia para `WatchToggleButton` e `CartToggleButton` na página de produto (ilha cliente).
- Degrau 4 (S): nas páginas anônimas, trocar `force-dynamic` por `export const revalidate = 60` (ou `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`) e testar em preview que a resposta traz `X-Vercel-Cache: HIT`/`STALE`. **Pré-requisito:** subir o Next (#77): o `npm audit` lista "cache poisoning in SSG/ISR rendering ... cross-user content substitution" (GHSA-mcj8-r9mp-w47p) para a 16.2.6.

**Esforço e risco.** M para home, `/ofertas`, `/black-friday` e vitrines; L para a página de produto (personalização). Risco médio: vazar conteúdo personalizado entre usuários se algum dado de sessão sobrar no HTML cacheado. Mitigação: teste automatizado que busca a página com e sem cookie `sb-*` e compara; manter `private` em `/conta`, `/carrinho`, `/admin`, `/monitoramento`. **Ordem:** degraus 1 e 2 até 19/11, degrau 4 só na home e `/black-friday` até 24/11, produto depois. **Plano B se não der tempo:** #89 (pré-aquecimento) e #87 (materializar consultas) já protegem o banco.

### W-02. O `proxy.ts` roda em caminhos onde só atrapalha (NOVO)

O `matcher` (`src/proxy.ts:48`) exclui apenas `_next/static`, `_next/image`, `favicon.ico`, `api/webhooks`, `api/ingest`, `api/produtos` e extensões de imagem. Ficam dentro: **`/go/*` e `/g/*`** (o caminho que gera comissão), `/api/search`, `/api/monitoramento/*`, `/sitemap.xml`, `/robots.txt`, `/loops/*`. O comentário do próprio arquivo diz que `api/produtos` foi excluído para ficar cacheável no CDN; a mesma lógica vale para `api/search` (já responde `s-maxage=60`, mas a requisição ainda executa o proxy antes do cache, **[hipótese]**: no Next 16 o `proxy` roda em Node e, na Vercel, precede o cache da CDN).
**Impacto:** cada clique em "Ir à loja" faz uma ida ao Supabase Auth (teto de 5 s no `Promise.race` de `middleware.ts`) antes do 302; com o Auth lento, o redirect de receita fica lento. **Recomendação (S, risco baixo):** adicionar `go|g|api/search|sitemap|robots|loops` ao grupo negativo do `matcher`; o `/go` não depende de sessão.

### W-03. `/go/[slug]` seleciona a linha inteira e vai ao banco a cada clique (NOVO)

`src/app/go/[slug]/route.ts:36-40`: `db.select().from(affiliateOffers)` (todas as colunas) por clique, sem cache. TTFB medido no caminho "não existe": 0,55 s. A gravação do evento já usa `after()` (bom). **Recomendação (S):** selecionar só `id, networkId, vertical, affiliateUrl, affiliateLinkPending, currentPriceCents, status, quarantinedAt`; cache em memória por slug de 30 a 60 s (o destino muda raramente) com invalidação por TTL; `Cache-Control: private, max-age=0` no 302 para não cachear no navegador. O dedupe de cliques por (anônimo, slug, minuto) já está em #93.

### W-04. HTML de 0,9 a 1 MB nas listas (parcial #89)

`ofertas/page.tsx:155-157` pede `limit` de 250 jogos + 120 consoles + 120 acessórios por requisição (600/200/300 = 1.100 com qualquer filtro) e a página não tem paginação (`?page=2` devolveu o mesmo tamanho, 1.006.548 B [medido]). `/black-friday` tem 871 KB: **é a página que vai receber o pico**. Mais da metade do HTML é payload RSC (cada card aparece duas vezes: marcação e props).
**Recomendação (M):** limitar cada seção a 24 a 48 cards, com botão "ver mais" que busca de um endpoint cacheável (mesmo padrão de `api/produtos/[id]/grafico`, `s-maxage=60`); `/black-friday` com seções fixas e curtas. Meta: HTML < 250 KB bruto. **Risco baixo**, mas toca a ordenação por seção (cascata Dia > Menor preço > Destaques) definida pelo dono: o corte tem de vir depois da cascata, não antes.

### W-05. Fotos: a maior fonte de bytes e é barata de reduzir (parcial #89; Shopee NOVO)

`next.config.ts:61-67`: `images.unoptimized: true` com `remotePatterns` `**`. A decisão (evitar custo de otimização da Vercel) é razoável e as fotos saem direto das lojas, sem banda nossa. O que falta é pedir a variante certa. Medido hoje (3 fotos ML, 2 Shopee):

| Origem | Original (hoje) | Variante pequena | Redução |
|---|---|---|---|
| ML `...-F.jpg` | 146.290 / 273.283 / 76.359 B | `-V.webp` 22.022 / 14.962 / 5.578 B; `-I.jpg` 7.766 / 4.418 / 2.829 B | 85 a 95% |
| Shopee `.../file/<id>` | 144.610 / 400.692 B | `<id>_tn` 24.380 / 44.651 B | 83 a 89% |

`/ofertas` referencia 74 URLs ML, 120 Shopee e 20 Amazon, quase todas `loading="lazy"`. Num celular, rolar 40 cards = ~6 MB hoje contra ~0,7 MB com as variantes **[estimativa]**.
**Recomendação (S a M):** função `thumbUrl(src, largura)` aplicada na hora de renderizar (nunca gravar no banco): ML trocar o sufixo `-F` por `-V.webp`/`-I.jpg` conforme o card; Shopee acrescentar `_tn`; Amazon trocar o modificador `_SL1500_` por `_SL300_` quando existir (não testei). Testar nitidez nos cards grandes (o `-I` é pequeno demais para a página de produto; ali manter o original). Declarar `width`/`height` e `decoding="async"` no `<img>`; `fetchPriority="high"` já aparece em 2 imagens da home. **Risco baixo**, sempre cair no original em `onError`. **Não** ligar o `next/image` otimizado antes da Black Friday: custo por imagem e superfície de CVE (as vulnerabilidades de Image Optimization do `npm audit` só não se aplicam porque a otimização está desligada).

### W-06. Primeira visita fria (coberto por #87 e #89; dado novo)

Medida hoje: produto 5,55 s de TTFB e 7,55 s no total; `/mercado/impressao3d` 7,63 s no total. A auditoria 04 mediu 2,70 s no produto: a variação mostra que depende de qual instância responde. O cache SWR é por instância (`src/lib/cache/swr.ts`, `globalThis.__egeekSwr`), então cada instância nova da Vercel nasce fria. Com W-01 o problema some para visitantes anônimos (a borda segura a resposta); sem W-01, #87 (tabela materializada) é a única proteção real. Pré-aquecimento (#89) não alcança todas as instâncias. **Recomendação adicional (S):** um cron barato a cada 5 min que faz GET em 10 a 20 URLs (home, `/ofertas`, `/black-friday`, 5 vitrines, top produtos), mantém ao menos uma instância quente e revalida a borda quando W-01 estiver ativo.

### W-07. Região da função e do banco (NOVO, só decisão)

Função em `iad1`, banco em `us-east-2`: as duas ficam juntas (bom para as 5 a 10 consultas por página), mas o público é brasileiro (`gru1` só serve de borda). Mudar para `gru1` exigiria mover o banco para `sa-east-1` (migração L com janela, risco alto). **Recomendação:** não mexer antes da Black Friday; W-01 resolve a distância para o conteúdo anônimo. Reavaliar em janeiro com Core Web Vitals reais por país (depende de O-01). Se for mover um dos dois, mover os dois.

### W-08. Fontes, JS e CSS: aceitáveis, com um ajuste barato (baixa)

3 famílias (Geist com 5 pesos, Geist Mono com 3 e Inter com 4, `src/app/layout.tsx:12-31`) servidas por `next/font` (auto-hospedado, sem CLS); a home referencia 3 `woff2`. CSS 26 KB em brotli. JS ~300 KB brotli em 19 chunks (auditoria 04). Está dentro do razoável. Ajuste (S): Geist e Inter fazem o mesmo papel (display e corpo); manter uma família corta 1 a 2 arquivos. Valor pequeno; só se sobrar tempo.

### W-09. `ProductImage` cliente em cada card (NOVO)

`src/components/ui/product-image.tsx:1` é `'use client'` e usa `useState` só para o `onError`. Cada lista tem cerca de 110 instâncias: cada uma é uma fronteira de cliente que hidrata, e as props de cada card entram no payload RSC (parte dos 53% de W-04). **Recomendação (M):** versão servidor sem estado com `<img onerror=...>` inline (ou fundo CSS com ícone por trás) e manter a versão cliente só onde precisa de estado. Reduz JS de hidratação e HTML. **Risco baixo**; conferir por captura de tela (há `docs/amostras-qa-home`).

---

## 3. Segurança

O que já está bom está na seção 8; aqui só o que sobra ou é novo. Já cobertos e não repetidos: #69 (repo público), #77 (Next/sharp/zod), #85 (exceção de firewall), #92 (segredos), #93 (firewall extra), #94 (LGPD), #107 (hardening geral).

### S-01. CSP em Report-Only sem destino (NOVO)

`next.config.ts:9-27`: a política completa está em `Content-Security-Policy-Report-Only` sem `report-uri`/`report-to`. As violações só aparecem no console de cada visitante, que ninguém lê; o plano "promover a CSP quando o console estiver limpo" (#107) não tem como saber. **Recomendação (S):** rota `POST /api/csp-report` que registra em `console.error` (ou tabela com retenção de 7 dias), com limite de tamanho (4 KB) e amostragem de 10%; acrescentar `report-uri /api/csp-report` ao Report-Only. Depois de 7 dias, promover `form-action`, `connect-src` e `img-src` a enforce (baixo risco) e deixar `script-src` com `'unsafe-inline'` até decidir sobre nonce. **Atenção:** nonce de CSP obriga renderização dinâmica e conflita com o cache de borda de W-01; a alternativa compatível é manter `script-src 'self' 'unsafe-inline'` e tratar XSS na origem (o app não usa `dangerouslySetInnerHTML` em nenhum arquivo [medido: 0 ocorrências], boa defesa).

### S-02. Entrada pública sem validação nem limite (NOVO; firewall em #93)

- `src/server/actions/survey.ts:18-38`: `submitSurveyResponse` aceita anônimo (decisão de produto), mas `answers` não tem limite de chaves nem de tamanho do texto; só o campo `required` é checado. Qualquer cliente pode gravar megabytes por requisição em `survey_responses` (jsonb). Server Actions são `POST` públicos mesmo sem formulário.
- `src/server/actions/hype.ts:62`: `logDropAccess(dropId, action, clientMetadata: any)` grava metadata livre vinda do navegador, sem login obrigatório. O módulo é do marketplace de drops (legado).
- `zod` é usado em 3 dos 21 arquivos de `src/server/actions` (`affiliate.ts`, `auth.ts`, `news.ts` [medido]); os demais validam à mão ou não validam (por exemplo `cart.ts` e `price-watches.ts` não checam o formato do UUID, mas a autorização é correta: `requireCustomer` e `WHERE user_id = profile.id`, ver seção 8). O risco real é de lixo e abuso de armazenamento, não de vazamento.
- `/go/[slug]` grava 1 linha em `analytics_events` por clique (1.356 desde 15/07, 72% bots).

**Recomendação (S):** esquema `zod` com limites (máx. 12 chaves, 500 caracteres por resposta, 8 KB total) em `submitSurveyResponse`; `clientMetadata` limitado a objeto de até 2 KB ou removido; regra de limite de taxa por IP na Vercel para `POST` na home e em `/pesquisa` (**NÃO VERIFICADO** se existe) e para `/go` (por exemplo 60 por minuto por IP). Fechar também as rotas legadas (S-04).

### S-03. Cache negativo da busca (baixa)

As rotas `api/search`, `api/monitoramento/*` e `api/produtos/[id]/*` truncam a entrada (`q` com `slice(0,80)`, `limit` com `Math.min`), bom. O que falta é cache negativo para `q` aleatório (cada termo novo é uma consulta nova; `s-maxage=60` só ajuda termos repetidos). Previsto em #93 ("`q` de busca normalizada"). Reforço: `s-maxage=300` para respostas vazias.

### S-04. Superfície do marketplace de drops ainda no ar (NOVO, baixa)

`/hype-zone`, `/leiloes` e `/conta/vendedor` respondem 200 (80 KB cada) e ainda existem actions de leilão e fila de espera (`src/server/actions/auction.ts`, `hype.ts`). O `robots.txt` já as exclui. É código antigo que o negócio atual não usa (hub de preços, ver `00-sintese.md`), com superfície de ataque, custo de manutenção e texto antigo no rodapé ("Drops, raridades e curadoria"). **Recomendação (S a M):** responder 404/410 nas rotas legadas e remover as actions depois da Black Friday. Não testei o conteúdo dessas rotas (**NÃO VERIFICADO** o que renderizam).

### S-05. Itens de rotina (baixa, S)

- HSTS sem `preload`: só vale se o domínio inteiro e os subdomínios forem HTTPS para sempre; decidir depois do pico.
- `Cross-Origin-Opener-Policy: same-origin` ausente; ganho pequeno.
- `/loops/*` com `Access-Control-Allow-Origin: *` e `no-store` é intencional (bootstrap dos loops); assinatura em #107 (L2).
- Sem `serverActions.allowedOrigins`: correto; o Next compara `Origin` e `Host` por padrão e não há proxy reverso próprio.

---

## 4. Observabilidade

### O-01. Sem Core Web Vitals reais e sem registro de erros de renderização (NOVO)

**Evidência [medido].** `package.json` não tem `@vercel/speed-insights`, `@vercel/analytics`, Sentry, OpenTelemetry nem log drain; busca por esses nomes em `src` = 0. `src/instrumentation.ts` só aquece cache fora da Vercel (`if (process.env.VERCEL) return`). Erros de página aparecem apenas como `console.error` nos logs da Vercel (retenção **NÃO VERIFICADA**). Os 5+ deploys em Error e as falhas recorrentes de jobs só foram achados porque alguém investigou (`docs/erros-servidor-2026-11-14.md`).
**Recomendação (S):**
1. `@vercel/speed-insights` no layout (uma linha; LCP/INP/CLS reais por rota e por país). Se a CSP virar enforce, liberar o domínio dele em `connect-src`.
2. `export async function onRequestError(err, request, context)` em `instrumentation.ts` (hook oficial do Next 15+): grava rota, mensagem curta e `digest` em tabela `app_errors` (dedupe por `digest` + hora, retenção de 14 dias). Mesmo padrão que o projeto já usa para `collector_runs`. Assim "erro 500 numa página" vira linha consultável e pode alimentar o `collector-health`.
3. Alerta de erro de página no mesmo canal interno da #70.
**Risco baixo**; o `onRequestError` nunca pode lançar nem bloquear (try/catch, `after`). **Ordem:** até 20/11, para ter dados antes de 27/11.

### O-02. Sonda externa e alertas (coberto por #70; acréscimo)

`/api/health` consulta o banco com `SELECT 1` (bom: a sonda detecta banco fora, não só função de pé) e devolve 200 sem credencial. Para a sonda externa, usar também uma rota de **conteúdo** (um produto fixo com palavra esperada), porque o health não pega o caso "função sobe mas a página quebra por consulta lenta". Medida de hoje: o health respondeu em 0,59 s.

### O-03. Metas escritas e página de status (NOVO, S, depois da BF)

Definir 3 metas em `docs/`: disponibilidade das páginas públicas >= 99,5% por mês, p75 de TTFB <= 800 ms com cache, 0 `504` em dia de pico. Uma página de status simples (a do próprio provedor de sonda serve) com link no rodapé de `/contatos`. Sem isso não há como dizer ao dono se "a Black Friday correu bem".

### O-04. Logs (baixa)

Mensagens livres em `console.error` com prefixo `[rota]`: suficiente nesta escala. Se `onRequestError` entrar, padronizar `{rota, codigo, digest}`; já existe a sugestão de registrar `err.cause` em `docs/erros-servidor-2026-11-14.md`.

---

## 5. DevEx e CI/CD

### C-01. Não há CI de PR; o build local é inviável e o build de CI resolve (parcial #91)

`.github/workflows/` tem só `backup-externo.yml` (backup cifrado, secrets opcionais). Sem validação automática antes de a Vercel construir: `tsc --noEmit` leva 31 s e dá 0 erros (auditoria 04), mas ninguém o executa em `push`; 89 testes, 32 com entrada em `npm run`, 57 só à mão. A máquina do dono tem pouca RAM e a auditoria achou 563 processos `next build` órfãos; **o GitHub Actions é o lugar certo para o `next build`** (7 GB de RAM, descartável).
**Recomendação (S a M), `ci.yml` em `pull_request` e `push` para `main`:** `npm ci` (com cache), `npm run typecheck`, `npm run test:all` (da #91), regra de fronteira cliente/servidor (planejada na #91) e `next build` com variáveis de teste (as páginas são `force-dynamic`, não precisam do banco para compilar). Marcar como obrigatório com proteção de branch (se o repositório ficar privado, #69, a proteção depende do plano do GitHub; **NÃO VERIFICADO**).

### C-02. Dependabot e `npm audit` agendado (NOVO, S)

As 7 vulnerabilidades (1 crítica em `next`, 5 altas, 1 moderada) só foram vistas porque a auditoria rodou o comando. **Recomendação:** `.github/dependabot.yml` com `package-ecosystem: npm`, `schedule: weekly`, `open-pull-requests-limit: 3`, agrupando `next`/`react` e `drizzle`; e um passo `npm audit --omit=dev --audit-level=high` no CI (informativo, não bloqueante). Custo zero.

### C-03. Rollback e deploys em Error (NOVO, S, documentação)

Cinco ou mais deploys falharam em `Error` por imports de servidor em cliente (auditoria 02, M6); o site não caiu porque a Vercel mantém o deploy anterior em produção, mas ninguém foi avisado. **Recomendação:** (a) escrever em `FLUXO_MESTRE.md` um parágrafo "rollback de código": `vercel rollback` ou "Instant Rollback" no painel para o deploy anterior (não achei runbook; `grep` em `docs` só cita rollback de dados e da home); (b) comentário de status de build da Vercel no GitHub; (c) ensaiar um rollback uma vez antes de 24/11 (como a #84 fez com a home); (d) congelar mudanças de 23 a 28/11 (previsto em #84 e #88).

### C-04. Preview e migrações (coberto por #107; reforço)

Migrations Drizzle são manuais (`db:migrate`) e o ledger tem 19 linhas para cerca de 52 migrações; coerente com "sem DDL em produção sem aval", mas torna o preview perigoso se apontar para o banco de produção: a auditoria 02 já registra `DATABASE_URL` em Preview (#92). Reforço: nenhuma variável de produção em Preview (banco de teste, ou preview só de leitura).

### C-05. Lint, versões de Node e pastas de build (S, junto da #91)

`package.json` sem ESLint e sem `engines`; `@types/node ^20` enquanto o workflow usa Node 22; `tsconfig.json` lista `.next-perf*/types` e inclui `**/*.ts` (243 scripts). **Recomendação:** `engines: { node: ">=22" }`, `@types/node` alinhado, `include` com `src`, `scripts` e `next-env.d.ts`, `.gitignore` para `.next-*` (a #91 já cobre) e ESLint mínimo com `no-restricted-imports` para a fronteira cliente/servidor.

### C-06. Organização do código (baixa; depois da BF, #109)

Os 7 maiores arquivos têm 1.000 a 2.474 linhas; `group-rules.ts` concentra 72 exportações. A fronteira cliente/servidor é protegida por `server-only` em 213 arquivos (auditoria 04); falta regra de lint. Nomes duplicados entre `src/lib` e `src/server` já estão em #109. Dois acréscimos baratos: (a) `proxy`, `ShopLayout` e a página de produto chamam `getUser`/perfil cada um por conta própria (até 3 idas ao Supabase Auth por visita logada [leitura]): um helper com `React.cache` reduz para 1 por requisição no servidor; (b) 92 componentes cliente em 96 mil linhas é proporção alta, mas não é problema por si.

---

## 6. Custos e capacidade

### K-01. Invocações de cron (calculado a partir de `vercel.json`)

24 crons. Invocações por dia, pela frequência de cada um: `group-messages` 1.440 (a cada minuto), `collect-prices` 288, `collect-shopee` 288, 6 `collect-vertical` de 96 cada (576), `cobertura-shopee` 144, `aprovacao-auto` 144, `refresh-snapshots` (5 partes) cerca de 360, `semear-vertical` 72, `fila-api-oficial` 72, os demais 24 a 48 cada. **Total aproximado 3.550 por dia, cerca de 107 mil por mês, só de cron** (sem o disparador duplicado de `collect-prices` da #73 e sem visitas). A auditoria 04 mediu 71 a 79 h de tempo de função por dia. **Custo em R$: SEM DADO** (preciso do painel de uso da Vercel: GB-h de memória provisionada, CPU ativa, e egress do Supabase).
**Recomendação (S):** até 20/11, o dono abre Vercel > Usage e Supabase > Reports e registramos em `docs/` 5 números: invocações do mês, GB-h, CPU ativa, banda, tamanho e conexões do banco. Sem isso, "custo da Black Friday" é adivinhação.

### K-02. Banda e imagens

As fotos vêm direto das lojas, então a banda das imagens não é nossa (vantagem do `unoptimized`); o custo é do visitante em 4G (W-05). A banda de HTML é pequena (48 a 52 KB em brotli por página de lista). O que cresce com tráfego é o **tempo de função** por visita (W-01) e o egress do banco. Com W-01 ativo, o custo marginal de uma visita anônima cai a zero de função e zero de banco.

### K-03. Supabase Micro e o pico

`max_connections = 60` (auditoria 04, D6), duas consultas pesadas (#87) e 1,07 GB de banco. A proposta da #93 (subir a computação do Supabase por 3 dias) está certa e é a proteção mais barata se W-01 não ficar pronto: **decidir até 22/11, subir em 25/11, reverter em 30/11**. Conferir que o `max_client_conn` do Supavisor está acima de (instâncias previstas x pool por instância). **[hipótese]**: sem W-01, 30 instâncias x 10 conexões exigiriam 300 clientes no Supavisor; o Supavisor multiplexa, mas o teto de clientes é finito e não o medi.

### K-04. Teste de carga (NOVO, M)

Nunca houve teste de carga; a capacidade é só inferida. **Recomendação:** `k6` (ou `autocannon`) no GitHub Actions (não na máquina local) contra a **URL de preview** da Vercel, nunca contra produção, com perfil de 50 req/s por 3 min em `/`, `/ofertas`, `/ofertas/<slug>`, `/go/<slug>`, `/api/search?q=...`; meta: p95 de TTFB < 1,5 s, 0 erros 5xx, conexões do banco < 40 de 60. Rodar duas vezes: antes e depois de W-01. Atenção: o preview usa o banco de produção (#92): só rotas de leitura e `/go` com slug inexistente (não grava evento).

---

## 7. Plano mínimo para a Black Friday (27/11/2026)

Hoje é 15/11; faltam 12 dias. Filtro: só o que reduz o risco de o site cair ou de perder clique no dia, na ordem de execução. Itens do dono marcados.

| Quando | Ação | Fila / NOVO | Quem |
|---|---|---|---|
| 16 a 17/11 | Repositório privado (continua PUBLIC) | #69 | **dono** |
| 16 a 17/11 | Parar `eg_v`, `proxy` só com cookie `sb-*`, tirar `/go`, `/g`, `/api/search`, sitemap e robots do `matcher` | #86 + W-02 (NOVO) | time |
| 16 a 18/11 | Subir `next` 16.4.6, sharp e zod; `npm audit` sem crítica | #77 | time |
| 17 a 18/11 | Alertas, sonda externa em `/api/health` e numa página de produto, Speed Insights e `onRequestError` em tabela | #70 + O-01 (NOVO) | time + **dono** (chat e conta da sonda) |
| 17 a 19/11 | Exceção de firewall para Googlebot e TelegramBot; limites por IP em `/go`, `/api/search` e POSTs; saber onde ligar e desligar o modo "Under Attack" | #85, #93, S-02 | **dono** (painel) |
| 18 a 19/11 | `ci.yml` (typecheck, testes, build) e Dependabot | C-01, C-02 (NOVO) | time |
| 18 a 20/11 | Tema sem `cookies()`; ilhas cliente para viewer e carrinho; `/black-friday` e home com `s-maxage=60` testados em preview (com e sem cookie) | W-01 (NOVO) | time |
| 19 a 21/11 | Fotos menores (ML `-V.webp`/`-I.jpg`, Shopee `_tn`), paginação das listas e de `/black-friday` | W-04, W-05, #89 | time |
| 20/11 | Linha de base de custo: abrir Usage da Vercel e do Supabase (5 números) | K-01 | **dono** |
| 21 a 22/11 | Teste de carga em preview (antes e depois do cache) com meta de p95; ensaio de rollback uma vez | K-04, C-03 | time |
| 22/11 | Decidir a subida da computação do Supabase por 3 dias; conferir `max_client_conn` | #93, K-03 | **dono** (custo) |
| 23 a 28/11 | **Congelamento**: só correção de erro; sem semeadura nem ampliações; `refresh-snapshots` e coleta rodando | #88, #84 | todos |
| 25/11 | Subir a computação do Supabase; pré-aquecer páginas; cron de aquecimento a cada 5 min ligado | K-03, W-06 | **dono** + time |
| 26/11 | Revisão final: sonda verde, alertas testados, rollback ensaiado, runbook de 1 página ("se cair, fazer isto") | O-03, C-03 | time |
| 27 a 28/11 | Plantão: ver Speed Insights, `app_errors`, conexões do banco e fila de coleta a cada 2 h; se falhar, voltar o deploy anterior, ligar "Under Attack", pausar coletas pesadas | todos | time + **dono** |

Critério de pronto: `/`, `/ofertas`, `/black-friday` devolvem `X-Vercel-Cache: HIT`/`STALE` para visita anônima; `/go` sem passar pelo proxy; sonda externa e alerta de prova recebidos; um rollback ensaiado; teste de carga com p95 < 1,5 s e < 40 conexões. Se W-01 não passar nos testes até 21/11, **desistir do cache de borda e ficar só com subir o Supabase, W-02, W-03, W-05 e #87**: o site funciona hoje e a decisão deve ser conservadora.

Observação honesta sobre prioridade: a auditoria 03 mostra 5 inscritos no canal e 14 cliques humanos em 24 h. Se a audiência não crescer (#80), o pico da Black Friday será pequeno e o maior risco do dia será a **coleta parar** (#70, #72, #81), não a web. Por isso o plano está limitado ao essencial e deixa para depois o que só rende sob tráfego grande (região, `use cache`, refatoração).

---

## 8. O que já está bom (não mexer)

- **Autorização em camadas.** `requireAdmin`/`requireCustomer` em cada Server Action de mutação (21 arquivos conferidos; `surveys.ts` usa `assertAdmin` próprio); `cart.ts` e `price-watches.ts` filtram por `user_id = profile.id`, sem IDOR por `offerId`/`cartItemId`; `/admin` tem barreira de cookie no `proxy` antes de renderizar e `requireAdmin` no layout; `getUser()` (não `getSession()`) nos pontos conferidos.
- **Webhooks e cron.** Telegram valida `secret_token` em tempo constante e falha fechada sem segredo; webhook do ML com `timingSafeEqual`; `/api/cron/*` e `/api/health` usam a mesma função de autorização (#73 termina o resto).
- **`/go` sem redirecionamento aberto**: destino sempre do banco, só `http(s)`, evento gravado em `after()` (nunca atrasa o clique), links `affiliate_link_pending` não redirecionam.
- **Cabeçalhos de segurança** completos e sem custo: HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP parcial em enforce e a completa em Report-Only. Nenhum `dangerouslySetInnerHTML`.
- **Cache com intenção.** `api/search` (`s-maxage=60`, `stale-while-revalidate=300`) e `api/produtos/[id]/grafico` (`s-maxage=60`) mostram `HIT`; `sitemap.xml` com `revalidate = 3600` (`HIT`); imagens locais `immutable` por 1 ano; `loops` com `no-store`.
- **Motor de cache SWR com single-flight e semáforo** (`swr.ts`), nascido de um P0 real (02/11); protege o banco por instância e é base certa para #87.
- **Streaming e Suspense** na home (seções com busca própria): TTFB de 0,35 a 0,48 s mesmo com HTML de 1 MB.
- **Fontes** auto-hospedadas com preload; JS ~300 KB brotli em 19 chunks; `loading="lazy"` em 84 de 87 imagens da home.
- **`/api/health` com `SELECT 1`**: detecta banco fora. Reaper de execuções presas já entrou no `collector-health` (commit `b358933`).
- **RLS ligada em 102 de 102 tabelas e `anon` sem acesso** (auditorias 02 e 04): o navegador não lê o banco por fora do servidor.
- **Scripts e backup** com dry-run, backup NDJSON e `--rollback` (padrão ouro `aplicar-limpeza-running-presos`); `backup-externo.yml` cifrado já no repositório (precisa dos secrets, #71).
- **Disciplina de custo**: `images.unoptimized` evita cobrança por imagem e serve as fotos das lojas sem banda nossa; `maxDuration` explícito por rota; crons de coleta espalhados por minuto.
- **Tipos**: `tsc` com 0 erros em 96 mil linhas.

---

## 9. Mapa dos achados (esforço, risco, ordem, fila)

| ID | Resumo | Esforço | Risco | Ordem | Fila |
|---|---|---|---|---|---|
| W-01 | Cache de borda nas páginas anônimas | M a L | médio | P0 parcial (até 21/11) | NOVO (liga #86, #89) |
| W-02 | `proxy` fora de `/go`, `/g`, `/api/search`, sitemap, robots | S | baixo | P0 (até 17/11) | NOVO |
| W-03 | `/go`: colunas mínimas e cache de 30 a 60 s | S | baixo | P0/P1 | NOVO |
| W-04 | Paginar `/ofertas` e `/black-friday` (HTML < 250 KB) | M | baixo | P1 (até 22/11) | parcial #89 |
| W-05 | Variantes pequenas de foto (ML, Shopee, Amazon) | S a M | baixo | P1 | parcial #89 |
| W-06 | Cron de aquecimento a cada 5 min | S | baixo | P1 | parcial #89 |
| W-07 | Região função/banco | L | alto | só depois (janeiro) | NOVO (decisão) |
| W-08 | Consolidar famílias de fonte | S | baixo | P2 | NOVO |
| W-09 | `ProductImage` sem estado | M | baixo | P1/P2 | NOVO |
| S-01 | Destino para relatórios da CSP | S | baixo | P1 | NOVO (liga #107) |
| S-02 | Validação e limites nas entradas públicas | S | baixo | P1 | NOVO (liga #93) |
| S-03 | Cache negativo da busca | S | baixo | P2 | parcial #93 |
| S-04 | Rotas legadas do marketplace de drops | S a M | baixo | P2 (depois da BF) | NOVO |
| S-05 | HSTS preload, COOP | S | baixo | P2 | NOVO |
| O-01 | Speed Insights + `onRequestError` | S | baixo | P0/P1 (até 20/11) | NOVO |
| O-02 | Sonda também em página de conteúdo | S | baixo | P0 | #70 (acréscimo) |
| O-03 | Metas escritas e página de status | S | baixo | P2 | NOVO |
| C-01 | `ci.yml` com typecheck, testes e build | S a M | baixo | P1 (até 19/11) | parcial #91 |
| C-02 | Dependabot e audit no CI | S | baixo | P1 | NOVO |
| C-03 | Runbook de rollback e ensaio | S | baixo | P1 | NOVO |
| C-05 | `engines`, ESLint mínimo, `tsconfig.include` | S | baixo | P1 | #91 |
| C-06 | `React.cache` no perfil por requisição | S | baixo | P2 | NOVO |
| K-01 | Linha de base de custo (5 números) | S | nenhum | P0 (dono) | NOVO (liga #108) |
| K-03 | Computação do Supabase no pico | S | baixo | decisão 22/11 | #93 |
| K-04 | Teste de carga em preview | M | médio | P1 (até 22/11) | NOVO (liga #93) |

Todas as medições desta fatia saíram de poucas requisições `curl` (cerca de 40 no total, sem rajada) feitas na tarde de 15/11, mais `npm audit --omit=dev`, `gh repo view` e leitura de código. Nenhum dado de usuário foi usado; nenhum segredo foi impresso (só o nome do host do banco para a região).
