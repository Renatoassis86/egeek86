# Parecer: Engenheiro de Software Principal (rodada 1, 2026-11-01)

Escopo: achados de front, UX, segurança e conteúdo da auditoria `docs/auditoria-cowork-2026-11-01.md`. Somente leitura: nada foi editado nem gravado no banco. Rótulos: **[REAL]** = lido no código; **[HIPÓTESE]** = inferido, a confirmar; **[REC]** = recomendação. Next 16: `sitemap.ts` aceita `generateSitemaps` com `id: Promise<string>` (doc em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`); middleware virou `src/proxy.ts`.

## 1. Posição

**Apoio com ressalvas.** Os itens deste escopo são em sua maioria correções pequenas e de baixo risco. Três ressalvas:
1. Nada que muda comportamento de número (veredito, tendência, mínimo) entra sem passar pelos membros de estatística/matemática; aqui só cuido de ligar a tela à fonte única já existente.
2. O repositório não tem framework de teste (`package.json` só tem `typecheck` e `build`; nenhum `*.test.ts`). Sem Pacote 0 (vitest), "teste" nas tabelas abaixo é verificação manual/scripts.
3. Itens de LGPD exigem decisão do responsável e revisão jurídica; eu só redijo e implemento.

## 2. Leitura da situação (por item)

### F-05 Notícia de teste e "Leia também" repetido
- [REAL] O artigo é renderizado em `src/app/(shop)/noticias/[slug]/page.tsx`; dados em `news_articles` (`src/db/schema/news_articles.ts`), com `status` em `draft|published|archived`. Só `published` aparece (`getArticleBySlug`, `news.ts:67`; "Leia também" `getRelatedArticles`, `news.ts:85-97`).
- [REAL] "Por Teste Monitoramento" vem de `getArticleAuthorName(authorId)` (`news.ts:74`) = `profiles.name` do autor. O texto não é código: é um perfil de teste. Duas camadas de dado de teste (artigo + perfil).
- [REAL] "Leia também" busca por categoria sem deduplicar título: se existirem dois registros `published` com o mesmo título ou slug diferente, os dois aparecem. [HIPÓTESE] É o caso das notícias X-Men (a auditoria viu "dois títulos" iguais).
- [REAL] Já existe despublicação reversível: `archiveArticle` em `src/server/actions/news*.ts:396-405` (`status='archived'`, não apaga). A rota do admin é `/admin/noticias/[id]`.
- Mudança mínima [REC]: (a) despublicar pelo admin (arquivar), nunca `DELETE`; (b) `getRelatedArticles`: `DISTINCT ON (lower(title))` ou filtro no TS por título normalizado; (c) regra de publicação na action: autor com nome que casa `/teste|test/i` ou `curated_link` sem `sourceUrl` é bloqueado (o check constraint `news_articles_kind_consistency_chk` já exige `source_url` para curated; o gap é só o `original` sem fonte e o autor teste).

### F-09 / F-10 Monitoramento lendo estatística diferente
- [REAL] `/monitoramento` renderiza `PriceHistoryChart` (`src/components/monitoring/price-history-chart.tsx`). Os dois textos do auditor vêm dele: "N lojas parceiras monitoradas" = `history.totalOffersCount` e "N cotações" = `history.totalQuoteCount` (linhas ~432-435), e "Comprar agora: no menor preço (ou muito perto)" sai de `computePriceSignal` (linhas ~60-96), que compara o último ponto contra o mín/média **do período selecionado** daquela série (`history.stats`).
- [REAL] A série vem de `getMasterProductPriceHistory` (`src/server/queries/price-history.ts:284`), que agrega outros masters por `name ILIKE '%nome limpo%'` + mesma geração (`cleanGameName`, linhas ~225-285). É uma segunda definição de "produto" e de estatística, diferente de `product-price-stats.ts` (fonte única, ADR 0001/0002). Isso contradiz a regra "um jogo, uma média".
- [REAL] A página de produto usa `getMasterProductMetrics` -> `buildMasterProductMetrics` (`affiliate.ts:~645`) com `computeVerdict`/`checkEligibility`. O sinal do monitoramento não usa o veredito canônico. Daí a divergência.
- [REAL] "NAIPEGAMES · 5_green": `monitoring-board.tsx` (~linhas 120-130) imprime `sellerNickname` e `sellerReputationLevel` cru. Já existe tradutor: `getSellerTrustInfo` em `src/lib/affiliate/labels.ts:42` (usado em `comparar/[masterProductId]/page.tsx:171` e na página da oferta).
- [REAL] F-09 na página do produto: `trend` é calculado em `buildMasterProductMetrics` com preço atual vs. penúltimo preço da mesma oferta (`affiliate.ts:~660`), só 'down/up' se variação >= `PRICE_DROP_MIN_PERCENT`; senão 'stable'. "Estável" em 15/15 é compatível com a oferta atual ser nova (sem preço anterior) ou com `prev` não preenchido. [HIPÓTESE] Precisa de consulta: quantas ofertas têm `previous_price_cents`/snapshot anterior.
- Mudança mínima [REC]:
  1. Traduzir reputação com `getSellerTrustInfo` em `monitoring-board.tsx` (trivial, sem risco numérico).
  2. Nova prop opcional `canonical` em `PriceHistoryChart` (veredito, mínimo, média, nº de cotações e de lojas de `getMasterProductPriceStats`). Se presente, o selo "Comprar agora/Bom momento/Considere esperar" e os contadores usam `canonical`; senão o componente se comporta como hoje. Só quem a página `/monitoramento` e a de produto passam.
  3. Para o selo: derivar de `computeVerdict` (3 faixas ±5%) e não do período. Se o veredito for "histórico curto", mostrar "Histórico ainda curto" e esconder "Comprar agora". Essa regra é do Matemático/Preços (F-08); eu só implemento a ligação.
  4. F-09: remover o rótulo "Preço estável" quando `prev` inexistente (mostrar nada) até o Matemático definir a regra de tendência. Mudança de comportamento: precisa de decisão do conselho.

### F-19 LGPD
- [REAL] `contatos/page.tsx:127` ("upload de foto da coleção + rosto"); `entrar/page.tsx:218, 430-445` (rosto obrigatório); `conta/vendedor/page.tsx:77`; `src/server/actions/auth.ts:47`. `privacidade/page.tsx` não cita foto de rosto, retenção, base legal nem cookies (seções: dados coletados, uso, terceiros, direitos...).
- [REAL] Cookies gravados: `sb-...-auth-token` (sessão Supabase), `theme`. Ambos estritamente necessários/preferência: não exigem consentimento prévio por si; banner só se entrar analytics/publicidade de terceiros. `analytics_events` é próprio (`go/[slug]/route.ts` grava referer e user-agent), então deve ser citado na política.
- [HIPÓTESE, não sou advogado] Foto do rosto usada para "verificar identidade" pode ser tratada como dado biométrico/sensível (LGPD art. 11) conforme o uso. Precisa de parecer jurídico sobre base legal, prazo de retenção e exclusão. A pergunta de negócio (o rosto é realmente necessário?) vem antes do texto.
- Mudança mínima [REC]: texto de finalidade, base legal (a definir pelo jurídico), retenção e canal de exclusão em `entrar/page.tsx` (junto ao campo), `contatos/page.tsx` e nova seção "Cookies e dados de navegação" e "Foto de verificação" em `privacidade/page.tsx`. Sem banner por ora.

### F-22 Sinopse
- [REAL, causa raiz] `scripts/fetch-sinopses.ts` foi salvo com **codificação duplicada (mojibake)**, não só o nome: linha 2/4/78 (`WikipÃ©dia`), linha 32 (`' jogo eletrÃ´nico'`), linha 51 (`/jogo eletr[Ã´o]nico/`), linhas 21/37 (`['â€™`]`). Consequências:
  - `attributes.synopsis_source.name` gravado como `WikipÃ©dia (en)` (a UI mostra `sourceName` direto, `game-about-section.tsx:~33`).
  - A busca em português usa o sufixo corrompido ("jogo eletrÃ´nico"), que não casa com nada na MediaWiki; por isso `pt` quase nunca acha e o script cai para `en`. Esta é a causa de "sinopse em inglês" [HIPÓTESE forte; confirmar rodando `--all` em dry-run e contando `r.lang`].
  - `src/server/queries/synopsis.ts` está correto (UTF-8, fallback `'Wikipédia'`); o bug não está nele, mas ele é o ponto certo para uma defesa de leitura.
- [REAL] "Ficha Rápida" = `features` do catálogo do Mercado Livre (`getMeliCatalogDetails`), renderizado em `game-about-section.tsx:~40-60` e alimentado em `ofertas/[slug]/page.tsx:311-315`. Também usa `rounded-[var(--radius-lg)]` (a auditoria afirma que não há cantos arredondados; ver conflito de padrão visual, item 3).
- Mudança mínima [REC]:
  1. Regravar `fetch-sinopses.ts` em UTF-8 correto (recodificar o arquivo inteiro, não substituir trecho a trecho) e ajustar a ordem: tenta `pt`, só então `en`, e grava `name: 'Wikipédia (pt)'`/`'(en)'`.
  2. `synopsis.ts`: defesa de leitura `fixMojibake(name)` (se contém `Ã`/`â€`, `Buffer.from(s,'latin1').toString('utf8')`), até o dado ser corrigido. Sem mudar o contrato.
  3. Remover a "Ficha Rápida" do vendedor: apagar o bloco `features` em `game-about-section.tsx` e a prop em `ofertas/[slug]/page.tsx` (`hasAboutSection` deixa de considerar features). Mudança de comportamento visível: precisa de OK do conselho (já indicada pelo responsável).
  4. Regra: sinopse em inglês só se não houver pt; o texto em inglês deve levar o rótulo "(en)" e `lang="en"` no parágrafo.

### F-23 Busca tolerante a erro
- [REAL] O motor atual **já** é tolerante: `search-products.ts` usa `word_similarity` (pg_trgm) com limiar estrito/relaxado e, na etapa TS, "1 erro de digitação" por palavra; `hasNormFunction()` (linha ~266) detecta a função `egeek_search_norm` e, se ausente, usa a expressão inline. A migration `0020_search_products_trgm.sql` é só **índice GIN + função IMMUTABLE** (performance), explicitamente opcional ("funciona sem esta migration"), não registrada em `meta/_journal.json`.
- [HIPÓTESE] Logo, aplicar a 0020 provavelmente **não** conserta `resident evill` -> 0. Duas explicações a testar: (a) o deploy auditado é anterior ao motor atual; (b) o limiar/ regra do passo B rejeita "evill" (duas letras iguais finais; `evill` vs `evil`: 1 inserção = deveria passar, a menos que o termo vire variante sem match). Rodar `scripts/medir-busca.ts` ou `searchProductsUncached` com os termos `resident evill`, `zeld`, `xbox` contra produção (leitura) antes de qualquer mudança.
- [REC] Não aplicar a 0020 como "fix da busca". Aplicar só se `medir-busca` mostrar tempo alto; é idempotente e reversível (`DROP INDEX`, `DROP FUNCTION`). Se `evill` falhar no motor atual, corrigir em `src/lib/search/query-normalize.ts` (arquivo do motor, fora deste escopo; ficar com o Backend).
- "xbox amplo demais": [HIPÓTESE] guarda de amplitude por palavra isolada; tratar `xbox` como família é regra de negócio (decisão).

### F-25 Imagens repetidas (grep feito)
Ocorrências `[REAL]` (código):
| Arquivo de imagem | Onde |
|---|---|
| `/images/categorias/hero-gamer-panel.png` | `inteligencia-gamer/page.tsx:37` (1 definição em `INTEL_ITEMS`, mas renderizada 2x: carrossel `currentItem` linha ~158 e grade `filteredItems` linha ~353 -> 2 `<img>` na mesma página) |
| `/images/home/observatorio-gamer-hero.png` | `(shop)/page.tsx:729` (1x estático) + `scripts/fix-news-cover-images.ts:11` grava como `cover_image_url` de notícias no banco -> a 2ª ocorrência na home vem de notícia do DB [HIPÓTESE] |
| `news-xmen/gta6/esports/gaming-setup/retro-console.png` | `noticias/page.tsx:330-334`: lista `CLEAN_NEWS_IMAGES` com **5 imagens** para N artigos; `getCleanNewsImage(cover, index)` (linhas 336-341) faz `index % 5`, logo repete por construção. Além disso, o DB provavelmente tem várias notícias com a mesma `cover_image_url` |
| `observatorio-cards-bg.png` | `(shop)/page.tsx:816` (1x no código) |

Mudança mínima [REC]:
- `noticias/page.tsx`: deduplicar por render com um `Set` por requisição: se a imagem já foi usada na página, não usar `index % 5`; passar `src={null}` para `SceneImage` (que já tem fallback atmosférico) ou omitir a mídia. Isso respeita "uma imagem, um lugar". Caveat: `getCleanNewsImage` ignora capas válidas que não começam com `/images/noticias-hub/news-` (cai no rodízio); o filtro deveria aceitar qualquer caminho público e barrar só duplicata.
- `inteligencia-gamer/page.tsx`: o item em destaque do carrossel não deve reaparecer na grade (`filteredItems.filter(i => i.id !== currentItem.id)`) ou a grade não repete a imagem do destaque.
- Dados: auditar `news_articles.cover_image_url` duplicados (consulta de leitura) e atribuir imagem única ou nula (ver DB).
- F-25 `srcset`: `SceneImage` é um `<Image unoptimized>`; "dois `<img>`" são duas instâncias. Não é problema de `srcset`.

### F-28 Fonte < 12 px no mobile
- [REAL] Token `--text-caption` já é 12px. Os 10-11 px vêm de **utilitários hard-coded**: `price-table-board.tsx` (`text-[11px]` linhas 146, 160, 175, 187, 201; `text-[10px]` linhas 250-277, 375, 400), `ui/badge.tsx:26` (`sm: text-[11px]`), `product-stores-table.tsx:55`, `results-grid.tsx:274`, `search-box.tsx:309`. 
- Mudança mínima [REC]: trocar `text-[10px]`/`text-[11px]` por `text-xs` (12px) nesses arquivos. Alternativa global em CSS é frágil. Risco: quebra de linha em badges/colunas estreitas do `price-table-board` em 390 px; verificar visualmente.

### F-29 Sitemap
- [REAL] `src/app/robots.ts` existe e não declara `sitemap`. Não há `sitemap.ts`. Fontes de URL: `affiliate_offers.slug` (público: `publicOffersCtes()` em `public-offers.ts:33`), `news_articles.slug` (published) e páginas estáticas.
- [REC] Criar `src/app/sitemap.ts` (+ `generateSitemaps` se > 50 mil URLs; hoje ~1,1 mil produtos, 1 arquivo basta). Só URLs `published`/oferta pública e um slug por master (a página de produto é `/ofertas/[slug]` por **oferta**, e há N ofertas por produto: escolher a oferta de menor preço por master para não duplicar conteúdo). Acrescentar `sitemap: ${base}/sitemap.xml` em `robots.ts`. `export const revalidate = 3600` (consulta é leve) para não pesar a cada rastreador. Risco: sitemap inclui URL de produto que depois é mergeado (`attributes ? 'mergedInto'`): filtrar. Teste: `curl /sitemap.xml` retorna 200, XML válido, 0 URL `mergedInto`.

### F-30 / F-31 / F-32
- F-30 [REAL] `inteligencia-gamer/page.tsx:188` `<span>Carrossel 2s</span>`: remover o span (linha única).
- F-31 [REAL] `src/app/api/health/route.ts` público, devolve `checks.supabase/postgres` e `detail: e.message` (vaza mensagem de erro). `src/lib/auth/cron-auth.ts` (`rejectUnlessCronAuthorized`) já existe. [REC] Anônimo: `{status}` e HTTP 200/503 apenas (útil para monitor externo); detalhes só com `Authorization: Bearer $CRON_SECRET`. Nenhum código no repositório chama `/api/health` (grep), então baixo risco, mas confirmar monitor externo na Vercel/uptime. Vercel Toolbar: [REAL] não há `@vercel/toolbar` no `package.json`; é configuração do projeto na Vercel (Settings > Toolbar: desligar em Production). Ação sem código, do responsável.
- F-32 [REAL] `src/app/go/[slug]/route.ts` redireciona slug inexistente/inativo para `/ofertas` silenciosamente. [REC] Redirecionar para uma página `src/app/(shop)/oferta-encerrada/page.tsx` (nova, `robots: noindex`) com busca e link para o produto (quando o slug existe mas está inativo, achar o `master_product` para sugerir alternativas) e registrar evento `affiliate_click_dead`. Manter o 302 para o destino quando a oferta existe. Risco: não abrir redirect aberto (destino continua vindo do banco, já seguro).

### Gráfico ausente na página do produto
- [REAL] Página de produto (`ofertas/[slug]/page.tsx`) não importa gráfico. `PriceHistoryChart` é reaproveitável: é `'use client'`, usa `lightweight-charts`, recebe `masterProductId`, `initialHistory`, `initialTimeframe`, `currentPriceCents`, faz fetch em `/api/monitoramento/price-history` e polling a cada 45 s.
- Problemas a tratar antes de reaproveitar [REAL]:
  1. Custo: `getMasterProductPriceHistory` pode levar vários segundos (comentário do próprio código cita 8-9 s). Precisa ir em `<Suspense>` com fallback fixo (evita CLS) e/ou `unstable_cache` por produto e janela; não bloquear o TTFB da página (hoje ~70 ms).
  2. Fonte: usa `ILIKE` entre masters (item F-09). Na página do produto, onde o resto usa fonte única, o gráfico tem de usar o mesmo conjunto de ofertas do produto (`masterProductId`) para o último ponto bater com "Hoje" e o mínimo bater com o card (C(b)/C(c) da auditoria). Isso é mudança em `price-history.ts` (Backend/Estatístico).
  3. `synchronizedHistory` sobrescreve o último ponto com `currentPriceCents` (linhas ~225-235): deixa o gráfico consistente com "Hoje", mas é um ajuste de exibição; documentar e não fazer em produto sem histórico (já protegido por `points.length`).
  4. Polling de 45 s por visitante anônimo multiplica custo; na página pública usar intervalo maior ou desligar (`usePollingRefresh` parâmetro).
  5. Contador "lojas parceiras monitoradas" e selo "Comprar agora" divergem (F-10): usar a prop `canonical`.
  6. "Add to cart" dentro do selo redireciona via `window.location`; na página de produto já existe `CartToggleButton`, então esconder o botão (`hideActions`).
- Dataviz [REC]: validar com o BI/dataviz e com `padrao-visual-egeek` (cor da linha, eixo em BRL) antes de publicar.

## 3. Riscos
1. **Regra "uma média só"**: o gráfico usa `ILIKE` de nome (segunda definição de produto). Enquanto o F-02 (duplicatas) não for resolvido, o gráfico pode misturar produtos. Detecção: comparar `stats.avgPriceCents` do gráfico com `avg` de `product-price-stats` em amostra de 30 produtos.
2. **Mojibake em outros pontos**: só `fetch-sinopses.ts` tem sequências `Ã/â€` no código (grep em `src` e `scripts`); o resto do repo está sadio. O dado no banco precisa de correção separada (ver DB).
3. **Padrão visual vs. código**: a auditoria diz "0 cantos arredondados", mas `game-about-section.tsx` usa `rounded-[var(--radius-lg)]` em 2 lugares, `noticias/page.tsx` `rounded-[var(--radius-xl)]`. Possivelmente `--radius-*` = 0; confirmar em `globals.css` antes de acusar regressão.
4. **Sitemap** pode expor produtos duplicados/errados (F-01/F-02) e amplificar SEO de dado ruim: publicar depois dos P0 de catálogo ou filtrar por elegibilidade.
5. **LGPD**: publicar texto de base legal sem validação jurídica pode agravar. Redigir como rascunho para revisão.
6. **Sem testes automatizados**: toda regressão dos itens acima só é detectada em QA manual.
7. **Remoção de "Ficha Rápida"** esvazia `hasAboutSection` em produtos sem sinopse; a seção "Sobre o jogo" some (comportamento desejado, mas é visível).

## 4. Recomendação: pacotes de trabalho disjuntos em arquivos

Cada arquivo aparece em **um** pacote só (paralelizável). Pacotes B e C se acoplam apenas pelo contrato da prop `canonical` (opcional, retrocompatível).

**Pacote 0: Infra de teste (opcional, mas antecede os demais)**
- Arquivos: `package.json`, `vitest.config.ts` (novo), `src/lib/**/__tests__/*` (novos).
- Entrega: vitest + testes de tabela para `getSellerTrustInfo`, `fixMojibake`, dedupe de imagens/relacionadas. Sem DB.
- DB: não.

**Pacote A: Notícias e imagens editoriais (F-05, F-25, F-30)**
- Arquivos: `src/server/queries/news.ts`, `src/app/(shop)/noticias/[slug]/page.tsx`, `src/app/(shop)/noticias/page.tsx`, `src/app/(shop)/inteligencia-gamer/page.tsx`, `src/server/actions/news*.ts` (guarda de publicação).
- Mudanças: dedupe de "Leia também"; `Set` de imagens usadas por página; destaque do carrossel fora da grade; remover "Carrossel 2s"; guarda de publicação (autor teste, curated sem fonte).
- Risco: baixo-médio (layout de /noticias muda quando falta imagem). Teste: `/noticias` com `querySelectorAll('img')` sem `src` repetido; "Leia também" sem título repetido.
- DB (só desenhar, ver Seção DB): arquivar o artigo de teste; deduplicar capas; trocar o autor ou arquivar o perfil de teste.

**Pacote B: Página do produto, sinopse e gráfico (F-22 UI, gráfico, F-09, F-10 lado componente)**
- Arquivos: `src/app/(shop)/ofertas/[slug]/page.tsx`, `src/components/affiliate/game-about-section.tsx`, `src/server/queries/synopsis.ts`, `src/components/monitoring/price-history-chart.tsx`, novo `src/components/affiliate/product-price-chart.tsx` (wrapper com Suspense/cache).
- Mudanças: remover Ficha Rápida; `fixMojibake` e `lang` na sinopse; montar o gráfico na página (Suspense, sem polling, `canonical`, `hideActions`); `price-history-chart.tsx` ganha `canonical?`, `hideActions?`, `pollMs?`; selo do período sai quando há `canonical`.
- Risco: médio (peso de página, CLS, número divergente). Teste: página com `masterProductId` com e sem histórico; último ponto = "Hoje"; mín do gráfico = card; TTFB da página sem regressão (stream); 390 px sem scroll horizontal.
- DB: não (leitura).

**Pacote C: Monitoramento (F-10 lado página)**
- Arquivos: `src/components/monitoring/monitoring-board.tsx`, `src/components/monitoring/watchlist-panel.tsx`, `src/app/(shop)/monitoramento/page.tsx`.
- Mudanças: reputação via `getSellerTrustInfo` (sem `5_green`); passar `canonical` (de `getMasterProductPriceStats`) ao gráfico. Depende só do contrato `canonical` do Pacote B.
- Risco: baixo. Teste: nenhum texto no formato `\d_(green|yellow|red|orange)`; contadores batem com `/tabela-de-precos`.
- DB: não.

**Pacote D: Mobile tipografia (F-28)**
- Arquivos: `src/components/price-table/price-table-board.tsx`, `src/components/ui/badge.tsx`, `src/components/search/product-stores-table.tsx`, `src/components/search/results-grid.tsx`, `src/components/search/search-box.tsx`.
- Mudança: `text-[10px]`/`text-[11px]` -> `text-xs`. Risco: baixo-médio (quebra de linha). Teste: script de verificação `getComputedStyle` em 390 px: 0 textos < 12 px na tabela.
- DB: não.

**Pacote E: SEO e superfícies técnicas (F-29, F-31, F-32)**
- Arquivos: novo `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/api/health/route.ts`, `src/app/go/[slug]/route.ts`, novo `src/app/(shop)/oferta-encerrada/page.tsx`.
- Risco: baixo (health), médio (sitemap, escolher a oferta canônica por master; filtrar `mergedInto`). Teste: `curl -i /sitemap.xml` 200 e XML válido; `robots.txt` com `Sitemap:`; `/api/health` anônimo sem `checks`/`detail`; `/go/xxxx-inexistente` -> `/oferta-encerrada`.
- Ação fora do código: desligar Vercel Toolbar em Production (painel). Sem DB.

**Pacote F: LGPD (F-19), só texto após decisão**
- Arquivos: `src/app/(shop)/privacidade/page.tsx`, `src/app/(shop)/contatos/page.tsx`, `src/app/entrar/page.tsx`, `src/app/(shop)/conta/vendedor/page.tsx` (texto da linha 77, opcional).
- Bloqueado por: decisão do responsável + jurídico. Teste: texto presente nas 3 páginas; link para política; sem banner.
- DB: não.

**Pacote G: Script de sinopses (F-22 dado)**
- Arquivos: `scripts/fetch-sinopses.ts` (recodificar UTF-8, tentar pt antes de en, gravar nome correto).
- Risco: baixo no código; o `--apply` escreve no banco (ver DB). Teste: dry-run (`--all`) sem `--apply` com contagem pt vs en e amostra de 20 sinopses.
- Ordem: independente dos demais.

Paralelismo: A, B, D, E, F, G rodam juntos; C após o contrato `canonical` de B (pode codar ao mesmo tempo contra o contrato). Conflitos de arquivo entre pacotes: nenhum (verificado pela lista). Conflito externo: `price-history.ts` (consulta) e `affiliate.ts` (tendência) ficam com Backend/Estatístico; não estão em nenhum pacote meu.

### Ações no banco (apenas desenho, nada executado)
| # | Item | Operação | Reversível | Pré-requisito |
|---|---|---|---|---|
| DB-1 | F-05 | `UPDATE news_articles SET status='archived', updated_at=now() WHERE slug='especialistas-preveem-que-gta-6-fature-us-5-2-bilhoes-na-semana-de-lancamento'` (ou `archiveArticle` pelo admin) | Sim (voltar para `published`) | Conferir antes com `SELECT id,title,status,author_id,cover_image_url` |
| DB-2 | F-05 | Listar artigos `published` duplicados: `SELECT lower(title), count(*) ... HAVING count(*)>1`; arquivar o mais antigo | Sim | Aprovação do responsável sobre qual manter |
| DB-3 | F-05 | Perfil "Teste Monitoramento": revisar quem é o autor de outros artigos antes de renomear/desativar | Parcial | Não apagar o perfil (FK `author_id`) |
| DB-4 | F-25 | `SELECT cover_image_url, count(*) FROM news_articles WHERE status='published' GROUP BY 1 HAVING count(*)>1` e atribuir capa única/nula | Sim | Imagens novas (Designer) |
| DB-5 | F-22 | `UPDATE master_products SET attributes = jsonb_set(attributes,'{synopsis_source,name}', to_jsonb(replace(attributes->'synopsis_source'->>'name','Ã©','é'))) WHERE attributes->'synopsis_source'->>'name' LIKE '%Ã%'` | Sim (rollback guardando valor antigo) | Backup da coluna |
| DB-6 | F-22 | Re-sinopse pt: onde `attributes->'synopsis_source'->>'name' LIKE '%(en)'` e achar pt, atualizar `description` + fonte. O script hoje só preenche `description IS NULL`: precisa de flag nova `--replace-en` | Sim (guardar texto antigo) | Pacote G |
| DB-7 | F-23 | Migration 0020 (índice GIN + função): **não é fix**; aplicar só se medição mostrar lentidão. Idempotente; `DROP INDEX/FUNCTION` desfaz | Sim | `medir-busca.ts` antes/depois |

Divergências a registrar: (1) auditoria sugere aplicar a 0020 para a busca; eu discordo, o motor atual já tem trigram. (2) A auditoria diz F-25 "via srcset, não dois img"; o código usa `SceneImage` com fallback, o problema é lista circular, não responsividade.

## 5. Dado que falta
1. Resultado de `searchProductsUncached` para `resident evill`, `zeld`, `xbox` em produção, e se o deploy auditado contém o motor atual.
2. Quantas sinopses estão em inglês e quantas teriam pt (dry-run `fetch-sinopses --all` depois de corrigir a codificação).
3. Quantos `news_articles.cover_image_url` duplicados e quantos artigos com títulos repetidos; quem é o autor do perfil de teste e quantos artigos tem.
4. Tempo real de `getMasterProductPriceHistory('1M')` por produto (p50/p95) para decidir `unstable_cache` e Suspense.
5. Quantas ofertas ativas têm `previous_price_cents` (causa de "Preço estável" em 15/15).
6. Valor de `--radius-*` em `globals.css` (se for 0, os `rounded-*` são inofensivos).
7. Decisão do responsável e jurídico sobre o rosto (finalidade, retenção, base legal) e sobre a palavra "afiliado" em Termos.
8. Existe monitor externo apontando para `/api/health`?

## 6. Métrica de sucesso
- `/noticias` e `/inteligencia-gamer`: 0 `src` de imagem repetido por página; "Leia também" 0 títulos repetidos; 0 artigos com autor de teste `published`.
- `/monitoramento`: 0 textos crus de reputação; "N lojas/N cotações" = valores de `product-price-stats` do mesmo produto; "Comprar agora" nunca aparece sem histórico elegível.
- Página do produto: gráfico visível em 100% dos produtos com histórico elegível; último ponto = "Hoje"; TTFB p95 sem piora > 10%; CLS < 0,1.
- Sinopses: 0 ocorrências de `Ã`/`â€` em `master_products.attributes`; >= X% (medir) das sinopses em pt; 0 "Ficha Rápida" renderizada.
- Tipografia: 0 textos < 12 px na tabela a 390 px.
- `/sitemap.xml` 200 com as URLs esperadas; `robots.txt` aponta o sitemap; `/api/health` anônimo sem detalhes; `/go/<inexistente>` leva a `/oferta-encerrada`.
- Qualidade: `npm run typecheck` e `npm run build` verdes em cada pacote; pelo menos testes de tabela para os utilitários do Pacote 0.
