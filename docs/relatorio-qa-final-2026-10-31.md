# Relatório QA final, 2026-10-31

Escopo: verificação antes de git e deploy. Sem commit, sem deploy, sem escrita intencional no banco (só SELECT). Servidor de teste: `next start -p 3101` (a porta 3100 já estava ocupada por outro processo, PID 24048, não mexi nele). O servidor de teste foi encerrado.

## Veredicto: NO-GO condicional

GO assim que (1) o `.gitignore` corrigido abaixo for confirmado no repo real e (2) o dono decidir sobre os itens B2 e B3. Código, build e dados estão coerentes. O que bloqueava era o pacote (dump de 692 MB com PII).

## Resultado dos testes

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | OK, 0 erros |
| `npm run build` | OK (1ª tentativa, sem falha de Google Fonts) |
| Lint | Não existe (sem eslint config nem script). Não é falha, só lacuna. |
| Rotas | Todas 200, exceto `/go/[slug]` 302 (correto) e 404 real em rota inexistente |
| Console/servidor | `server.log` sem nenhum erro ou warning durante todos os testes |

Rotas e tempos (1ª requisição a frio, depois a quente):

| Rota | Status | Frio | Quente |
|---|---|---|---|
| `/` | 200 | 74,8 s | 1,6 a 2,1 s |
| `/ofertas` | 200 | 20,3 s | 1,7 a 1,9 s |
| `/ofertas?q=zelda` | 200 | 0,66 s | |
| `/ofertas?q=resident evil village ps5` | 200 | 0,39 s | |
| `/ofertas/console-nintendo-switch-2-...` | 200 | 0,35 s | |
| `/monitoramento` | 200 | 0,04 s | |
| `/monitoramento/altas-e-baixas` | 200 | 0,77 s | |
| `/tabela-de-precos` | 200 | 31,1 s | 0,34 s |
| `/ranking` | 200 | 0,03 s | |
| `/go/halo-wars-2-...` | 302 para mercadolivre.com.br (com `matt_tool`) | 1,55 s | |
| `/go/slug-inexistente` | 302 para `/ofertas` | | |
| `/api/search?q=zelda` | 200, 4 produtos | 1,9 s | |
| `/api/search/insights` (sem ids) | 200 `{"insights":{}}`; com 2 ids retorna veredito, média, mínimo | 2,1 s | |
| `/sobre`, `/termos`, `/privacidade` | 200 | <0,06 s | |
| `/noticias`, `/inteligencia-gamer`, `/pesquisa`, `/contatos`, `/hype-zone`, `/leiloes`, `/api/health` | 200 | | |

Busca: "resident evil village ps5" retorna Resident Evil Village (ps5) e Gold Edition (ps5), sem misturar plataformas. "zelda tears" retorna só Tears of Kingdom. Termo sem resultado ("xyzabc", "pes 5") responde vazio, sem erro.

## Dados (somente SELECT)

- Contagem unificada: SQL independente (critério ADR 0002 reimplementado por mim) deu **536 produtos / 2.237 ofertas públicas / 2 redes**. Home mostra 536, `/ofertas` mostra 536. Coerente.
- Frescor: último `last_checked_at` e último snapshot às 22:45 UTC de hoje. Coletor vivo.
- Snapshots com preço <= 0: 0.
- Piso de 35%: dos 802 produtos com >= 3 cotações, 36 têm cotação bruta abaixo de 35% da mediana (as iscas que o piso remove). Nos 4 primeiros resultados de "zelda", menor preço e contagem de ofertas da API batem exatamente com o banco (4 de 4). Insights mostram `floorApplied: true` e mínimo histórico R$ 250,00 coerente.
- Duplicata de `master_product`: 1 par, "Elden Ring: Tarnished Edition - NS2" (switch_2), `meli_catalog_id` MLB77262775 e MLB77262776. Nenhum dos dois tem oferta ativa, então não aparece ao público.

## Bloqueantes

**B1. `backup/` entraria no repositório público. CORRIGIDO.**
Simulei o conjunto commitável com um git temporário fora do projeto. `backup/` não estava no `.gitignore` (só no `.vercelignore`). Entrariam 86 arquivos de `backup/dados/*.ndjson`, incluindo `affiliate_price_snapshots.ndjson` (692 MB), `addresses`, `profiles` e demais tabelas com dado pessoal. Corrigi adicionando `/backup/` ao `.gitignore`; reverifiquei, 0 arquivos de `backup/` restam no conjunto. Os `.mjs` de `backup/` leem credenciais de variáveis de ambiente e não têm segredo literal, mas hoje ficam fora de qualquer forma.

## Importantes (decisão do dono ou correção não trivial)

**I1. Tempo a frio inaceitável.** `/` 74,8 s, `/tabela-de-precos` 31 s, `/ofertas` 20 s na primeira chamada após subir o servidor (cache vazio). Quente: 0,3 a 2 s. No Vercel, cada instância nova ou cache expirado pode pegar essa penalidade, e pode estourar o timeout da função. Recomendo pré-aquecer o cache (cron ou rota de warm-up após deploy) e otimizar as consultas de estatística (`getSearchInsights` já foi citada no código como lenta em produto muito cotado). Medir no deploy de preview antes de produção.

**I2. Termos proibidos em texto visível ao cliente.** Ocorrências reais renderizadas:
- "afiliado(s)": `/sobre` (várias, incluindo o módulo "Painel de Afiliados e Vendedores"), `/termos` (cláusula "Links de Afiliados"), `/carrinho` ("link de afiliado de cada um"), `/conta/notificacoes`, `/entrar` (opção de cadastro "Afiliado (Gerar links e comissões)").
- "frete": `/pesquisa` e `src/lib/format.ts` ("Frete grátis"), `src/lib/survey/questions.ts`.
- "tempo real": `/sobre` ("cronômetro em tempo real" nos leilões).
- "Geek Points": nenhuma ocorrência em texto renderizado das páginas testadas; `userGeekPoints` existe em componentes de hype/curadoria (não verifiquei se está visível para logado).
Não removi: a cláusula de `/termos` sobre links de afiliado é divulgação de publicidade, e retirá-la tem risco jurídico; precisa de decisão. As demais são troca de texto simples, mas dependem da sua definição de termo substituto.

**I3. Imagem repetida (regra "uma imagem, um lugar").**
- `/noticias`: `CLEAN_NEWS_IMAGES` (5 imagens) é reciclada por índice (`index % 5`); no HTML, cada imagem aparece 4 vezes (xmen 8 vezes) na mesma página. Viola a regra. Corrigir exige uma imagem por matéria (capa própria) ou deixar o card sem imagem.
- `/` e `/inteligencia-gamer`: `observatorio-gamer-hero.png` e `hero-gamer-panel.png` aparecem 2x no HTML da própria página. No código de `/` há um único uso, então provavelmente é a renderização dupla do `SceneImage` (camada/blur); confirmar no navegador.
- `emblem/6-collectibles.png`: usada na home e como fallback `onError` em `create-drop-form.tsx` (admin/vendedor). Uso 2x no código.

**I4. Plataforma `unknown` em produtos com oferta ativa:** 52 dos 536 públicos (43 jogos, 13 acessórios, 1 console, contando fora do público também). Alguns são plataformas realmente fora do enum (DS, 3DS, SNES), mas há casos que o título resolve: "Atari Soulcalibur V, Xbox 360...", "Cyberpunk 2077" etc. A regra manda derivar do título antes de desistir. Esconde duplicatas futuras. Cabe ao guardião do catálogo.

**I5. Duplicata Elden Ring Tarnished Edition NS2** (sem oferta ativa, fora da vitrine). Mesclar com `scripts/merge-duplicate-masters.ts` (precisa escrita; não executei).

**I6. Um clique de teste foi gravado.** `GET /go/halo-wars-2-...` insere um `analytics_events` (`affiliate_click`) por desenho. Linha id **1013**, criada 2026-10-31 22:42:43 UTC, UA `curl`. Contaminação mínima da métrica de cliques; sugiro apagar essa linha (`DELETE FROM analytics_events WHERE id = 1013`), não fiz por ser escrita. Vale também a rota `/go` ignorar bots (UA curl/headless) para a métrica de conversão ficar limpa.

## Menores

- M1. `/ofertas/[slug]` inexistente responde HTTP 200 (com `noindex`), por causa do streaming do `loading.tsx` antes do `notFound()`. Soft-404; o `noindex` mitiga.
- M2. Cantos: o override global (`* { border-radius: 0 !important }` em `globals.css`) zera tudo, inclusive `rounded-full`. Classes que contradizem a regra continuam no código (242 ocorrências de `rounded-*` fora do admin, incluindo `rounded-full`, `rounded-[var(--radius-xl)]`) e dependem do override. Efeito colateral: bolinhas de status, spinners e avatares viram quadrados. Não há `border-radius` literal no código de tela; os e-mails (`notifications/templates.ts`) usam `border-radius:0`. Limpeza das classes é cosmética e arriscada de fazer em lote.
- M3. Código simulado inalcançável em `src/components/hype/hype-zone-tabs.tsx`: o diálogo "Cockpit Anti-Bot" (fila fictícia "#3", "Compra Aprovada", ID de transação com `Math.random()`). `setIsBuying(true)` e `setBuyStep` nunca são chamados, então hoje não aparece ao usuário. Remover antes que alguém ligue o botão, pela regra de dado fake.
- M4. `src/app/(shop)/inteligencia-gamer/page.tsx` tem `INTEL_ITEMS` fixo no código (títulos e resumos editoriais como "Levantamento revela a alta de preços de cartuchos raros..."), com autor e data. É conteúdo editorial, não dado de mercado, mas as afirmações numéricas precisam de fonte ou checagem do editor-notícias.
- M5. Imagens não referenciadas no código (podem ser uso dinâmico): `categorias/gamer-collage`, `categorias/hero-geek-panel`, `conta/collector-badge`, `hero/tile-*`, `home/hype-zone-teaser`, `mascots/collector`, `monitoramento/empty-state`, `noticias/header-collage`, `ofertas/header-collage`, `ranking/badge-legend`, `ranking/hero-banner`, `sobre/pilha-controles`, `sobre/snes-caixa`. `public/images` pesa 179 MB (77 arquivos), `public` total 207 MB; considerar compressão antes de publicar.
- M6. `/termos` contém emoji (⚠️) em texto de interface; `/entrar` usa 🔗. Divergente do padrão visual.
- M7. 1 oferta pública fica abaixo de 35% da mediana de TODOS os snapshots do produto. É diferença de base (a elegibilidade pública usa a mediana das ofertas frescas; o piso do histórico usa a mediana dos snapshots). Não é erro, mas os dois critérios podem divergir em casos de borda.
- M8. `README.md` e docs citam o nome `service_role` apenas como orientação; não há valor secreto.
- M9. Pasta `research/benchmarks` (133 arquivos, 6,4 MB, inclui prints de portais de terceiros) entraria no repo público (está só no `.vercelignore`). Avaliar se deve ficar fora.

## Segurança do pacote

Não podem ir ao repositório público:
- `.env.local` (contém `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_OIDC_TOKEN`): ignorado por `.env*`. OK.
- `.vercel/`: ignorado. OK.
- `backup/` (dump NDJSON, logs, scripts de migração): **estava exposto, agora ignorado (B1).**
- `.claude/`, `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`: ignorados. OK.
- Decidir: `research/` (ver M9), `docs/*.pdf`, `relatorio-api-magalu-*.md` (relatórios internos de API).

Busca de segredos nos 708 arquivos que seriam commitados (já sem `backup/dados`): padrões `eyJ...`, `sb_secret`, `sb_publishable_`, `postgres://usuario:senha@`, `service_role`, `password=`, chaves privadas, `AKIA`, `sk-`, `shpat_`, `client_secret`. Apenas referências por nome de variável e o fallback `postgres://postgres:postgres@localhost:5432/postgres` em `src/lib/db/index.ts` e `scripts/dedup-existing-master-products.ts` (credencial de dev local genérica, sem risco). Além disso, comparei os valores reais de chaves, tokens e senhas do `.env.local` (8 valores, inclusive a senha extraída da URL do banco) contra o conteúdo de todos os arquivos: **0 ocorrências**. Recomendo rotacionar a senha do banco e a service_role se algum dia o `backup/` ou o `.env.local` tiver saído da máquina.

## Regras inegociáveis

- Dado fake: nenhum encontrado em tela alcançável. Ressalvas M3 e M4. Contagens, médias e mínimos vêm de SELECT e batem com a API.
- Um jogo, uma média: 1 duplicata remanescente, fora da vitrine (I5).
- Scraping: nenhum novo. O existente segue como dívida registrada: `discover-magalu-products.ts` (HTML público com UA de navegador) está **desligado por padrão** (`MAGALU_PUBLIC_SCRAPING_ENABLED`) e `docs/divida-coleta-sem-api-oficial.md` cita também a busca pública da Shopee em `discover-shopee-products.ts`, que ainda é chamada. Revisar antes de ampliar.

## Correções que fiz (triviais)

1. `C:\repositorio\egeek86\.gitignore`: adicionado `/backup/` (B1).
Nenhuma outra alteração de código.

## Pendências para o dono

Decidir termo substituto e política de `/termos` (I2), apagar a linha 1013 (I6), mesclar o par Elden Ring (I5), plano para o tempo a frio (I1), imagens da página de notícias (I3).
