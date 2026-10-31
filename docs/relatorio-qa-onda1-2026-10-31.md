# Relatório QA da Onda 1 (2026-10-31)

Escopo: verificação do código local (sem git) e de um deploy de PREVIEW. Banco: somente SELECT (sessão read-only). Sem deploy em produção, sem commit.

## 1. Typecheck e build
- `npx tsc --noEmit`: passou (exit 0), antes e depois das correções.
- `npm run build`: passou (Next 16.2.6, Turbopack, 19 páginas, `ƒ Proxy (Middleware)` reconhecido). A 1ª tentativa falhou só por erro transitório de busca do `next/font/google`; repetida, passou. Aviso de CSS não bloqueante: `min-h-*` num comentário do CSS global.

## 2. Preview e HTTP
Previews: `egeek86-gs4x7kpsx` (antes das correções), `egeek86-clih5c126` e `egeek86-oi90fy5jq` (final). Ver observação sobre o primeiro deploy (`vercel deploy` sem `--scope` deu "Not authorized"; com `--scope renatos-projects-a493f2df` funciona).

| Rota | Resultado |
|---|---|
| `/`, `/ofertas`, `/ofertas/[slug]`, `/monitoramento`, `/tabela-de-precos`, `/ranking`, `/noticias`, `/pesquisa`, `/sobre`, `/login`, `/entrar`, `/robots.txt` | 200 |
| `/admin`, `/admin/cupons` sem login | 307 para `/login` |
| `/conta`, `/conta/notificacoes`, `/conta/vendedor` sem login | 200 com `NEXT_REDIRECT` para `/entrar` no corpo + `<meta refresh>` (ver pendência 3) |
| `/api/cron/*` sem segredo | 401 |
| `/api/admin/search-offers`, `/api/monitoramento/watchlist` sem login | 401 |
| `POST /api/webhooks/mercadolivre` com `application_id` errado | 401 |
| `/api/health`, `/api/search` | 200 |

Nenhum 500. Observação sobre o `proxy.ts`: ele NUNCA redirecionou; só renova o cookie de sessão (comentário no próprio arquivo). Quem redireciona é `requireAdmin` (layout `/admin`) e `requireCustomer` (layout `/conta`). O comportamento de redirect está preservado.

`vercel logs --level error`:
- Preview 1: 2 erros `Task timed out after 300 seconds` em `GET /admin` (09:32). Não reproduziram nos previews seguintes (4 chamadas a `/admin`, todas 307 em ~0,5 s). Não explicado; observar.
- Produção (12 h): só `[mercado-livre] /sites/MLB/search falhou (403)` repetido (pré-existente; busca por catálogo recusada pela API do ML).
- Preview 1 e 2 mostraram um `NOTICE ... column "keywords" ... already exists` vindo de DDL em tempo de requisição (corrigido, abaixo). No preview final: 0.

## 3. Números contra o banco (SELECT)
SQL independente (não usa o código do app) comparado à tela, em 3 produtos com histórico elegível e >= 2 ofertas públicas:

| Produto | Média SQL | Mínimo SQL | Preço atual público SQL | Tela (detalhe) | Tela (vitrine `/ofertas?q=`) |
|---|---|---|---|---|---|
| Capcom Fighting Collection 2 (Switch) | 258,26 | 229,96 | 264,92 | 258,26 / 229,96 / 264,92 | 258,26 / 229,96 / 264,92 |
| Controle Bluetooth 3 em 1 (1.205 e 76 cotações) | 127,56 | 93,60 | 99,90 | 127,56 / 93,60 / 99,90 | 127,56 / 93,60 / 99,90 |
| Controle Xbox Series X/S azul (1.609 cotações) | 455,39 | 426,55 | 449,77 | 455,39 / 426,55 / 449,77 | não aparece (produto `accessory`, fora da vitrine de jogos) |

Resultado: bate depois da correção F1. ANTES da correção, a página de detalhe divergia (ver F1).

## 4. Greps
- "Nível 12": 0 ocorrências em `src`.
- Cupom MELI100/SHOPEE20/MAGALU15/GAMER50/GEEK12 fixo: 0 no código executável (só o comentário em `affiliate.ts:986` que documenta a remoção).
- "Geek Points" em `src`: 0 (restam identificadores `geekPoints` de coluna/variável, e textos "sem pontos ainda"). 22 usos de "Geek Coins".
- Imagens de `public/images` com mais de um uso (viola "uma imagem, um lugar"):
  - `home/painel-analitico-86-light.png`: `(shop)/page.tsx:232` e `inteligencia-gamer/page.tsx:117`
  - `home/por-que-geek86.png`: `(shop)/page.tsx:997` e `inteligencia-gamer/page.tsx:106`
  - `home/statement-band.png`: `(shop)/page.tsx:403` e `inteligencia-gamer/page.tsx:61`
  - `noticias-hub/news-gta6.png`: 3 usos (`noticias/page.tsx:347`, `(shop)/page.tsx:862` e `:867`)
  - `noticias-hub/news-xmen.png`, `news-esports.png`, `news-gaming-setup.png`, `news-retro-console.png`: cada uma em `noticias/page.tsx` (pool) e `(shop)/page.tsx` (mapa por categoria)
  - `emblem/6-collectibles.png`: `(shop)/page.tsx:447` e `components/geek-deals/create-drop-form.tsx:306` (texto de ajuda/exemplo do formulário)
  - `system/og-cover.png`: `layout.tsx` 2x (Open Graph + Twitter, uso legítimo de metadado, não é imagem de página)
  - Sem uso nenhum no `src` (órfãs, 14): `categorias/gamer-collage`, `categorias/geek-collage`, `categorias/hero-geek-panel`, `conta/collector-badge`, `home/hero-watermark`, `home/hype-zone-teaser`, `mascots/collector`, `monitoramento/empty-state`, `noticias/header-collage`, `ofertas/header-collage`, `ranking/badge-legend`, `ranking/hero-banner`, `sobre/pilha-controles`, `sobre/snes-caixa`.

## 5. Diff de risco
- Server actions: todas as de escrita têm guarda (`requireAdmin`/`requireCustomer`/`getCurrentProfile`; `surveys.ts` e `messages.ts` usam `assertAdmin` em cada função; `collector.ts` exige login nas de colecionador e `requireAdmin` nas `trigger*`). Exceção intencional: `survey.ts#submitSurveyResponse` aceita anônimo (sem rate limit). `contatos/page.tsx` tem form com action vazia (placeholder, não grava nada, mas o botão "Enviar" finge enviar).
- Cron: `rejectUnlessCronAuthorized` em `notify-price-drops`; vercel.json agenda `0 11 * * *` (o comentário da rota ainda cita pg_cron: confirmar que não há agendamento duplo no Supabase).
- Webhook ML: falha fechado (application_id; `MELI_WEBHOOK_SECRET` opcional, ver pendência 4).
- Migration `0019_rls_revoke_anon.sql`: fora do `_journal.json`, `drizzle-kit migrate` não a executa; nenhum código depende dela. Não aplicada, conforme combinado.
- Escritas fora do esperado encontradas:
  1. DDL em leitura pública: `noticias/page.tsx` rodava `ALTER TYPE ... ADD VALUE` x10 e `ALTER TABLE news_articles ADD COLUMN` a cada GET; `news.ts#createArticle/updateArticle` rodavam o `ALTER TABLE` ANTES de `requireAdmin` (corrigido, F2).
  2. `discover-products.ts#pruneMerchandiseProducts` faz `DELETE` de snapshots, ofertas e master_products por palavra-chave (viola "histórico intocável"). Não é chamada pelo app (só `scripts/prune-merchandise-products.ts` a espelha), mas é código perigoso a remover. Não alterado.
  3. `noticias/[slug]/page.tsx:57` faz `UPDATE news_articles` em GET (promove artigo para "original"); contador de leitura/auto-conversão em rota pública, pré-existente.
  4. Demais escritas são do coletor, webhooks, `go/*` (analytics) e callbacks de auth: esperadas.

## Correções feitas
- F1. Página de detalhe `/ofertas/[slug]` (`src/app/(shop)/ofertas/[slug]/page.tsx`) usava `getOfferMetrics` (escopo da oferta isolada): mostrava "Menor preço já registrado" com 1 única cotação, "Média dos últimos 30 dias" e menor "já visto" de uma loja só (ex.: Capcom: média 251,96 e mínimo 243,10 na tela contra 258,26 e 229,96 do produto). Trocado por `getMasterProductMetrics` (fonte única, ADR 0001/0002): selo só com histórico elegível, média única do produto (rótulo "Média do produto (todas as lojas)"), barra de faixa só quando elegível, senão "Histórico ainda curto para comparar com a média"; legenda "N cotações (todas as lojas)". `src/components/geek-deals/price-range-bar.tsx`: rótulos "Média 30d" para "Média".
- F2. Removido DDL de tempo de requisição em `src/app/(shop)/noticias/page.tsx` (função `ensureDbEnums` e chamada) e `src/server/actions/news.ts` (2 `ALTER TABLE`), com import `sql` não usado removido. Conferido por SELECT: os 10 valores do enum e a coluna `keywords` já existem no banco e na migration 0014.

## Pendências
1. Decidir e ajustar imagens repetidas (seção 4); regra do AGENTS.md ainda violada em 10 caminhos. Não gerei imagens.
2. Remover `pruneMerchandiseProducts` e `scripts/prune-merchandise-products.ts` (ou trocá-los por `expired`/reclassificação).
3. `/conta/*` responde 200 + meta refresh (streaming com `loading.tsx`) em vez de 307 para anônimos, e `/noticias/<slug inexistente>` responde 200 (soft 404). Funcionam para o usuário; ruim para SEO/monitores. Pré-existente.
4. `MELI_WEBHOOK_SECRET`: configurar na Vercel e atualizar a URL no painel do ML (`?key=`), hoje só a checagem do `application_id` protege.
5. Timeout de 300 s em `GET /admin` visto uma vez (preview 1); se reaparecer, investigar `requireAdmin` + `loading`/pool de conexão.
6. `PriceRangeBar` mostra o extremo direito (`max(atual, média)`) como se fosse teto histórico; não é o máximo real. Ajustar rótulo ou usar `maxCents`.
7. `hype-zone/page.tsx:362` promete "+10 XP" e "+50 Geek Coins por acerto" sem nenhum dado de pontos no banco (sem dado fake: avaliar texto). `contatos` com formulário que não envia nada.
8. Docs: `PROJECT_BLUEPRINT.md` ainda cita "Geek Points" (linha 197); `docs/auditoria-egeek86.md` EG-10/EG-13 deve marcar a página de detalhe como corrigida.
9. `/ofertas?q=` do Xbox controle: acessórios não aparecem na vitrine de jogos (esperado), mas a página de detalhe deles continua acessível por link.
10. Cobertura não feita: navegador desktop/mobile e tema claro/escuro (checklist item 3); verificação foi por HTTP/HTML. Telas logadas (`/conta` autenticada, admin) não testadas por falta de sessão.
