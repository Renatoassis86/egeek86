# Auditoria 04: eficiência técnica (painel do Conselho Geek)

Data: 2026-11-15, manhã (UTC 07:30 a 08:00). Painel: engenheiro-software-principal, arquiteto-next, engenheiro-performance-web, engenheiro-coleta, dba-postgres, integrador-apis, bi-dataviz.
Modo: somente leitura. Nenhuma escrita em produção, nenhum código alterado. Consultas: SELECT em transação `read only` com `statement_timeout` de 30 s; HTTP: `curl` no site público. Nenhum segredo foi impresso.
Rótulos: **[medido]** = número obtido agora; **[leitura]** = lido no código; **[hipótese]** = inferência a confirmar.

## 0. Veredito em 8 linhas

1. O produto entrega o que promete no varejo de leitura: páginas respondem em 0,3 a 0,6 s de TTFB com cache quente, tipos passam em `tsc` (0 erros, 31 s), 61 de 69 testes sem banco passam, RLS ligada em todas as tabelas públicas e `anon` sem nenhum `SELECT`.
2. O gargalo real não é a web, é a **coleta**: 96% das execuções do `collect-shopee` (552 de 574 em 48 h) e 70% a 86% das de livros, impressão 3D e eletroeletrônicos terminam por `orcamento_de_tempo`. Nenhum ciclo fecha a fila.
3. **104 linhas de `collector_runs` estão em `running` há mais de 30 minutos** (105 no total). Causa: a função da Vercel é encerrada no teto de `maxDuration` e o `finally` com `run.finish` nunca roda. Falta um reaper (proposta na seção 3.4).
4. O banco gasta 76% do tempo de execução em duas consultas: `live_networks` (contagem por departamento, 78,6 h acumuladas) e estatística por master (59,6 h). Ambas já são cacheadas em memória por instância, o que é frágil na Vercel.
5. 82% das mensagens geradas expiram sem envio (14.402 expiradas contra 2.807 enviadas em 48 h). Isso é desperdício de CPU e de linhas, e esconde o gargalo real (latência até o envio).
6. A sonda externa não existe: o alerta de saúde só sai com `COLLECTOR_ALERTS=1` e `TELEGRAM_ALERT_CHAT_ID`, e nenhum dos dois está no `.env.local`; o vigia dos loops já registrou `canal_interno_nao_configurado`.
7. O Chrome é ponto único de falha para Amazon e cupons: há 5 lacunas de mais de 30 min nos batimentos em 48 h (a maior, 2 h 23 min).
8. Custo é baixo e previsível (banco de 1,07 GB, crescimento de uns 10 a 15 MB/dia). O que pode surpreender é o tempo de função: ~75 h/dia de funções de cron.

---

## 1. Código

### 1.1 Tamanho e acoplamento

Total em `src`: 96.720 linhas de `.ts/.tsx` [medido: `wc -l`]. Maiores arquivos:

| Arquivo | Linhas |
|---|---|
| `src/lib/messaging/group-rules.ts` | 2.474 |
| `src/server/queries/affiliate.ts` | 1.361 |
| `src/lib/messaging/group-messages.ts` | 1.345 |
| `src/server/queries/search-products.ts` | 1.268 |
| `src/server/collector/discover-products.ts` | 1.232 |
| `src/server/messaging/group-offers.ts` | 1.016 |
| `src/lib/affiliate/dedup.ts` | 1.004 |

Funções gigantes [medido com awk, funções acima de 150 linhas]: `discover-products.ts` `searchAndIngestTerm` 443 linhas; `collect-prices.ts` `applySnapshotsToGroup` 330 e `collectPrices` 289; `group-rules.ts` `evaluateProductV2Prices` 298 e `evaluateProduct` 186; `group-offers.ts` `loadFacts` 229.

**A1 (média). `group-rules.ts` concentra 72 funções exportadas e 2.474 linhas.** É o motor de todas as mensagens e tem duas gerações coexistindo (`evaluateProduct` e `evaluateProductV2Prices`). Impacto: cada regra nova (a cada tarefa da fila) mexe no mesmo arquivo, o que explica a frequência de regressões entre tarefas. Correção: dividir por gatilho (um arquivo por G2/G3/AC/CUPOM...) mantendo a fachada atual; teste de caracterização antes. Esforço: L. Fazer só depois da Black Friday.

**A2 (média). Lógica de identidade e porteiro espalhada em 12 arquivos** [medido: `find -iname '*identity*|*identidade*|*gate*'`]: `lib/affiliate/{amazon-identity,shopee-identity,offer-identity,offer-identity-sql}.ts`, `lib/catalog/{gate,console-identity,aprovacao-*,escopo-compra,item-miudo,tipos-produto}.ts`, `lib/catalog/vertical/{gate,identity}.ts`, `lib/pricing/identidade-midia.ts`, `lib/auth/marketplace-gate.ts` (esta é de autenticação, nome enganoso). A regra "só novo e em linha / sem usado / sem peças" aparece em `gate.ts`, `item-miudo.ts`, `console-identity.ts` e nos scripts `prune-*`. Impacto: uma decisão do dono precisa ser replicada em vários pontos; já houve limpezas corretivas em lote (`aplicar-limpeza-*`). Correção: um `catalog/porteiro.ts` único que componha as regras em ordem, com tabela de motivos (já existe `lib/aprovacao/motivos.ts` como embrião). Esforço: M.

**A3 (baixa). Nomes duplicados entre `src/lib` e `src/server`** [medido: `comm`]: `departamentos.ts`, `plus.ts`, `redesenho-home.ts`, `group-messages.ts`, `queue.ts`, `fila.ts`, `format.ts`, `grafico-dados.ts`, `lojas-hoje.ts`, `parecer-produto.ts`, `live-recheck.ts`, `amazon-promocoes.ts`. A divisão é intencional (puro em `lib`, I/O em `server`), mas os nomes iguais dificultam a busca e já provocaram importação errada. Correção: sufixo `.pure.ts` ou `-db.ts`. Esforço: S (renomeação mecânica).

### 1.2 Tipos, testes e build

- `tsc --noEmit` completo: **0 erros**, 31 s [medido]. O `tsconfig` inclui `**/*.ts`, ou seja, `scripts/` (243 arquivos), `.next-perf*/types` e outras pastas de build entram na verificação. Isso só funciona porque `.next-perf2/3` ainda existem; remover as pastas sem ajustar o `include` é seguro, mas o `include` deveria nomear `src`, `scripts` e `next-env.d.ts`.
- Testes: existem **89** `scripts/test-*.ts`, mas só **32** têm entrada `npm run test:*` no `package.json`. Os outros 57 só rodam à mão. Não existe `npm test` agregado e **não há CI** (`.github` não existe). Rodei os 69 que não tocam em banco, sem flags: **61 passam, 8 falham** (`test-amazon-promocoes`, `test-amazon-vitrine`, `test-card-v2`, `test-cupom-agulha`, `test-grafico-dados`, `test-guardiao-cupons`, `test-plausibilidade`, `test-promo-prime`). Verifiquei os dois primeiros e três pilhas de erro: a causa é `import 'server-only'` sem `--conditions=react-server`, ou seja, falha de **harness**, não de regra. Os que dependem de banco (`test-departamentos`, `test-vitrine-*`, `test-front-regras`...) exigem `--env-file=.env.local` e rodam contra o banco de produção (somente leitura, mas sem ambiente de teste isolado).
- Cobertura real: sem medidor de cobertura; os testes são scripts de asserção sobre lógica pura (regras, mensagens, identidade). Não há teste de rota, de integração com a API da Vercel nem de carga.
- **A4 (média). Sem rede de proteção automática.** Nada roda os testes antes do deploy; os 5 quebras de build por import servidor para cliente passam sem barreira. Correção: um `npm run test:all` que lista os 89 com as flags certas, mais um `typecheck` obrigatório antes do push (hook `pre-push` local, já que não há CI). Esforço: S.
- Imports servidor para cliente: **213** arquivos usam `server-only` (boa barreira). Nos 92 arquivos `'use client'`, os imports de `@/server/...` encontrados são `server actions` ou `import type`, que são legítimos. O risco restante é `import` de valor (não de tipo) de módulo `server` em componente cliente; a barreira é o próprio `server-only` (quebra o build, como já aconteceu). Correção preventiva: regra de lint `no-restricted-imports` para `@/server/queries/*` em `components/**` marcados como cliente (o projeto não tem ESLint: `grep eslint package.json` = 0). Esforço: S.
- Dívida declarada: **0** marcadores `TODO/FIXME` no código (a dívida vive em prosa nos comentários e em `docs/divida-coleta-sem-api-oficial.md`). Bom hábito, mas dificulta o levantamento: sem marcador, não há como listar.

### 1.3 Pastas mortas e lixo no repositório

- `.next-perf2` (62 MB), `.next-perf3` (227 MB), `.next-start.log`, `build.log`, `--out` (arquivo criado por engano na raiz), `tsconfig.perf3.tsbuildinfo`, `tsconfig.tmp-check.tsbuildinfo`: não versionados (99 itens `??` no `git status`), mas poluem o tipo-check e o disco. `scripts/_q.mjs` já não existe. Correção: remover as pastas de perf e acrescentar `.next-*` ao `.gitignore`. Esforço: S.
- `docs/backups`: 153 arquivos, 319 MB; `backup/`: 884 MB (ignorado pelo git, correto). `docs/backups` é rastreado em parte e cresce a cada operação; vale política de retenção (manter 30 dias e compactar).
- Documentação duplicada: `relatorio-api-magalu-*.md` e `termos-shopee-*.zip` na raiz; mover para `docs/`.

### 1.4 Scripts de manutenção: padrão dry-run, backup e rollback

243 scripts. Dos **64** que escrevem no banco (excluindo testes) [medido por padrão textual, aproximado]: 49 têm `--apply`/dry-run, 50 têm backup, 50 têm rollback/revert. O modelo ouro é `aplicar-limpeza-running-presos-2026-11-14.ts` (dry-run por padrão, backup NDJSON, log, `--rollback`, guarda otimista no UPDATE). **13 scripts escrevem sem o padrão `--apply`**: `backfill-missing-initial-snapshots`, `backfill-placeholder-snapshots`, `cleanup-duplicate-snapshots`, `dedup-existing-master-products`, `fix-fake-meli-tool-id`, `prune-merchandise-products`, `prune-used-condition-products`, `reclassify-non-games`, `registrar-whatsapp-links`, `revert-identidade-etapa2`, `revert-merge-masters`, `revert-separar-formato`, `rls-pos-0021`. Severidade média: são legados, mas qualquer um deles, executado por engano, grava direto. Correção: um `scripts/_seguro.ts` com `modoSeguro(argv)` (dry-run por padrão, backup obrigatório) e migrar os 13. Esforço: M.

---

## 2. Desempenho web

### 2.1 TTFB medido

`curl` no domínio público, 4 repetições por rota [medido]. Todas as respostas vêm com `x-vercel-cache: MISS` (dinâmicas: 82 arquivos com `force-dynamic`).

| Rota | TTFB (s) | Total (s) | HTML bruto | Comprimido (br/gzip) |
|---|---|---|---|---|
| `/` | 0,37 a 0,62 | 0,6 a 2,7 | 573 KB | 47,5 KB |
| `/ofertas` | 0,33 a 0,37 | 1,0 a 4,9 | 987 KB | 51 KB |
| `/black-friday` | 0,32 a 0,36 | 0,8 a 4,0 | 906 KB | 48 KB |
| `/mercado/impressao3d` | 0,35 a 0,46 | 0,5 a 5,6 | 240 KB | n/m |
| `/mercado/tecnologia` | 0,35 a 0,38 | 0,5 a 2,1 | 243 KB | n/m |
| `/mercado/games` | 0,34 a 0,46 | 0,47 a 0,61 | 83 KB | n/m |
| `/monitoramento` | 0,32 a 0,42 | 0,37 a 0,60 | 94 KB | n/m |
| `/ofertas/[slug]` (frio, 1ª) | **2,70** | 4,7 | 101 KB | n/m |
| `/ofertas/[slug]` (morno) | 0,39 a 0,40 | 0,48 a 0,68 | 107 KB | n/m |

Leitura: com cache quente o TTFB é bom. O problema é o **primeiro acesso após esfriar** (a 1ª visita à página de produto levou 2,7 s) e o **tempo total** alto nas listagens (a 1ª medição de `/ofertas`, `/mercado/impressao3d` e `/black-friday` levou 4 a 5,6 s; as seguintes, 1 s). O TTFB baixo vem do streaming; o conteúdo pesado chega depois.

**W1 (alta, risco de BF). O cache de vitrine é em memória por instância** [leitura: `src/lib/cache/swr.ts`, `globalThis.__egeekSwr`]. Na Vercel, cada instância nova nasce fria; com pico de tráfego na Black Friday, N instâncias frias recalculam em paralelo as consultas de 1 a 6 s (seção 3.2) contra um banco de 60 conexões. O `SWR_MAX_CONCURRENT` (padrão 2) protege por instância, não no total. Impacto: lentidão e `504` justamente no dia de pico; já houve incidente (P0 de 2026-11-02, relatado no próprio arquivo). Correção: pré-calcular as vitrines em tabela (já existem `showcase_snapshot` com 269 linhas e `refresh-snapshots`) e fazer as páginas lerem só a tabela; usar `revalidate` de 60 s com ISR nas páginas públicas que não dependem de cookie. Esforço: M.

**W2 (média). Todas as páginas públicas passam por `proxy.ts`, que chama `supabase.auth.getUser()` em toda requisição** [leitura: `src/lib/supabase/middleware.ts`, timeout de 5 s] e na home escreve cookie de visitante (`COOKIE_VISITANTE_HOME`). Cookie/`Set-Cookie` na resposta e `force-dynamic` impedem qualquer cache de CDN (`x-vercel-cache: MISS` em tudo). Impacto: cada visita anônima custa uma ida ao Supabase Auth (só quando há cookie `sb-*`) e uma invocação de função. Correção: no `proxy`, só chamar `getUser` quando existir cookie `sb-*-auth-token`; cookie de visitante só se a flag de experimento estiver ligada. Esforço: S.

**W3 (média). HTML de 573 KB a 987 KB** (48 a 51 KB comprimido). `/ofertas` embute 987 KB de HTML bruto; a home tem 87 `<img>`. Em celular de gama baixa o parse custa mesmo com 50 KB na rede. Correção: paginação/virtualização do bloco "ofertas" e `loading="lazy"` abaixo da dobra (já há 84 lazy de 87). Esforço: M.

### 2.2 Imagens e fontes

- `images.unoptimized: true` e `remotePatterns` com `**` [leitura: `next.config.ts`]: o `next/image` está desligado de propósito (custo de otimização da Vercel). Consequência: os cards carregam a foto original da loja, por exemplo `D_NQ_NP_660546-...-F.jpg` do Mercado Livre com 74 KB; a home referencia 34 imagens do ML, 31 da Shopee, 15 da Amazon. **Os `<img>` dos cards não declaram `width/height`** (ficam em caixa `absolute inset-0`, então o CLS é neutro, mas o navegador não reserva decodificação). Correção barata: para URLs do ML, trocar o sufixo `-F.jpg` por variante menor (`-V`/`-O`), e `srcset` simples. Esforço: S.
- `sharp` só em `src/server/messaging/card-v2.tsx` (cartão do Telegram), não no caminho da página: sem impacto na web.
- Imagens locais pesadas: `categorias/geek-collage.webp` 450 KB, `emblem/6-collectibles.webp` 382 KB, `home/divider-emblem.webp` 348 KB, `hero/tile-back.webp` 346 KB; `public` total 16 MB. O logo (`geek 86.webp`, 8 KB, declarado 4220x1568 exibido a `h-7`) é leve. Correção: reexportar as 4 maiores a 1280 px. Esforço: S.
- Fontes: `next/font` auto-hospedado, nenhuma `preload` de fonte detectada no HTML (0). Aceitável; o risco é troca de fonte no primeiro paint.
- JS: **19 chunks**, os maiores 74, 63, 41, 41 e 30 KB brotli [medido nas URLs da home]; **~300 KB brotli no total**. Está bom para o tipo de página. Sem `@vercel/analytics` ou `speed-insights`: **não há medição de Core Web Vitals reais**. Prováveis: LCP bom na home se a primeira imagem tiver `fetchPriority="high"` (há 2 com essa marca); INP bom; CLS baixo.
- Firewall da Vercel: durante a medição, uma rajada de ~30 requisições de um IP levou a respostas `403` com `X-Vercel-Mitigated: deny` por alguns minutos, inclusive para `Googlebot` e `TelegramBot` (todos os UAs testados foram negados no intervalo). Voltou ao normal sozinho. **W4 (média): confirmar no painel da Vercel que a regra de limite de taxa tem exceção para os robôs de busca e para o `TelegramBot` (a prévia de link do canal depende dele).** Esforço: S.

---

## 3. Banco

### 3.1 Tamanho e crescimento [medido]

Banco total: **1.074 MB**, PostgreSQL 17.11, Supavisor. Maiores tabelas:

| Tabela | Linhas vivas | Mortas | Total | Observação |
|---|---|---|---|---|
| `affiliate_price_snapshots` | 3.532.630 | 309.355 (8,8%) | 664 MB (heap 348 + índices 316) | último autovacuum **11/11** |
| `group_messages` | 31.103 | 3.997 | 85 MB | 22.724 expiradas |
| `affiliate_offers` | 41.991 | 4.846 | 76 MB | |
| `price_daily_offer` | 217.417 | 3.813 | 54 MB | |
| `coupon_reads` | 129.535 | 2.890 | 40 MB | |
| `collector_runs` | 28.995 | 186 | 32 MB | retenção de fato ~8 dias |
| `price_daily_state` | 72.132 | 12.801 (17%) | 31 MB | |
| `master_products` | 11.311 | 1.411 | 23 MB | |

A tabela de snapshots é a pior em custo de índice: 316 MB de índices para 348 MB de heap. `record_kind`: 3.241.690 `mudanca`, 250.522 `batimento`, 40.091 `primeira`, 356 `manual`, 85 nulos.

Crescimento de `affiliate_price_snapshots` por dia: 8,5 mil (07/11), 13,5 mil (10/11), **26,7 mil (11/11), 40,1 mil (12/11), 44,5 mil (13/11), 43,3 mil (14/11)** [medido]. Salto de 3,3x a partir de 11/11 (efeito da ampliação de cupom ML e da coleta por vertical). Estimativa: ~190 bytes/linha incluindo índices, logo **~8 MB/dia só em snapshots**; o banco inteiro cresce 10 a 15 MB/dia. Até 27/11 (12 dias): **+130 a +180 MB**, sem risco de espaço no plano atual. `group_messages` cresce ~7,8 mil linhas/dia (~3 MB/dia).

**D1 (média). Autovacuum atrasado em `affiliate_price_snapshots`** (última passagem 11/11 15:43, 309 mil linhas mortas, depois de `UPDATE ... SET record_kind` em lotes de 12 s). A tabela está em 8,8% de mortas; o limite padrão do autovacuum é 20% das linhas + 50, então ele só dispara perto de 700 mil mortas. Correção: `ALTER TABLE affiliate_price_snapshots SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01)`. Esforço: S (migration pequena; exige aval do dono por ser DDL em produção).

**D2 (baixa). Índices.** Sem duplicatas exatas [medido]. Três índices pouco usados e grandes: `affiliate_offers_price_confirmed_idx` (8,2 MB, 0 usos), `coupon_reads_coupon_idx` (7,1 MB, 1 uso), `master_products_search_norm_trgm_idx` (6,9 MB, 0 usos). Total ~22 MB recuperáveis; é pouco, e o `trgm` pode servir à busca em produção (contador reiniciado em 30/10). Recomendação: observar mais 7 dias; não remover antes da Black Friday.

**D3 (média). `master_products` sofre varredura sequencial**: 1.285.655 `seq_scan` leram 10 bilhões de linhas, contra 472 milhões de `idx_scan`; `affiliate_offers`: 410 mil varreduras sequenciais leram 6,8 bilhões. Em tabelas de 11 mil e 42 mil linhas isso é rápido por varredura, mas é CPU constante e explica parte das 181 h de tempo de execução. Candidatos: as consultas `live_networks` e as de masters por vertical. Esforço: M (EXPLAIN das duas consultas e índice parcial por `vertical`/`status`).

### 3.2 Consultas lentas (`pg_stat_statements`, desde 30/10, 16 dias) [medido]

Tempo total de execução registrado: ~181 h. Por categoria:

| Categoria | Chamadas | Horas | Fatia |
|---|---|---|---|
| `live_networks` (contagem de masters visíveis por departamento, `src/server/departamentos.ts:144`, `public-offers.ts`) | 255.302 | **78,6** | 43% |
| estatística por master (`q_all AS MATERIALIZED`, `src/server/queries/product-price-stats.ts`) | 56.692 | **59,6** | 33% |
| resto | 52,4 milhões | 15,6 | 9% |
| outras de snapshots | 5,9 milhões | 15,2 | 8% |
| `group_messages` | 795.257 | 12,6 | 7% |
| `collector_runs` | 64.946 | 0,16 | 0% |

Médias: `q_all` 3,1 a 6,1 s por chamada; `live_networks` 1,1 a 2,2 s; picos de **35 s de média** (`live_networks`, 42 chamadas, máximo 87 s) e 102 s (`live`). O próprio comentário do código admite "0,8 a 2 s cada, até 140 s sob carga". Também aparece `UPDATE ... SET record_kind` (83 chamadas, 12,5 s de média, máximo 53 s) e `SELECT ... row_number() OVER (PARTITION BY g.trigger...)` na fila de mensagens (3.228 chamadas, **6,4 s de média**).

**D4 (alta). Duas consultas respondem por 76% da carga e rodam centenas de milhares de vezes.** `live_networks` roda 255 mil vezes em 16 dias (~660/h): é recalculada por departamento e por instância. Correção: materializar a contagem por departamento em tabela (`departamento_contagem`), atualizada pelo `refresh-snapshots:vitrines`; as páginas só leem. A mesma ideia vale para a estatística por master, que já tem `product_price_stats` (7.000 linhas, idade média 71 min, máxima **16.645 min = 11,6 dias**): ali o valor antigo pode ser mostrado ao usuário. Esforço: M. Retorno: libera ~70% do tempo de CPU do banco e remove a causa da lentidão no pico.

**D5 (média). A consulta da fila de mensagens com `row_number()` leva 6,4 s em média** e roda a cada minuto. Está fazendo o trabalho de ranqueamento sobre a tabela inteira (31 mil linhas, 22,7 mil expiradas). Correção: índice parcial `WHERE status IN ('proposta','proposta_auto','aprovada')` e restringir a janela por `created_at > now() - interval '48 hours'`. Esforço: S.

### 3.3 Conexões [medido]

`max_connections = 60`. Instantâneo: 6 ativas, 15 ociosas (a mais velha há 15 dias, do próprio Supabase/PostgREST), 1 `idle in transaction`. Origem: 16 sessões do Supavisor (7 ociosas, 5 ativas, 4 `idle in transaction`), 1 `pg_net`, 1 PostgREST, 1 `pg_cron scheduler`, `postgres_exporter`, 2 `pgbouncer`. As `idle in transaction` observadas tinham menos de 1 s e seguravam `pg_advisory_xact_lock(hashtext($1))` (travas de ciclo, legítimas) e um `select id from master_products where slug = $1` (de uma transação aberta). **Sem sessão presa**; a configuração do cliente (`idle_timeout 20 s`, `max_lifetime 10 min`, timeout de socket, pools `live` e `bg`) é madura e documentada em `src/lib/db/index.ts`. O `DATABASE_URL` usa a porta **6543** (pooler de transação), como exige o código. `cache hit` de heap: **98,82%**.

**D6 (baixa). 60 conexões são pouco para a Black Friday se a Vercel escalar para muitas instâncias.** Cada instância abre até `MAX_BY_KIND` conexões por pool (`live` + `bg`); o Supavisor multiplexa, mas o teto de clientes do Supavisor também é finito. Correção: aumentar o tamanho do plano de computação do Supabase por 3 dias (BF) e conferir `max_client_conn`. Esforço: S (decisão de custo do dono).

### 3.4 As 104 linhas `collector_runs` em `running` há mais de 30 min [medido]

Total em `running`: 105; mais de 30 min: **104** de 29.003 linhas (0,36%). Por job:

| Job | Linhas presas | Mais antiga | Mais nova |
|---|---|---|---|
| `collect-prices` | 31 | 11/11 02:35 | 15/11 03:40 |
| `collect-shopee` | 31 | 11/11 02:35 | 15/11 06:40 |
| `refresh-snapshots:showcase` | 11 | 12/11 20:04 | 14/11 16:34 |
| `collect-vertical:livros` | 7 | 12/11 05:31 | 14/11 04:41 |
| `discover-products` | 7 | 12/11 11:17 | 14/11 21:17 |
| `refresh-snapshots:vitrines` | 7 | 13/11 22:35 | 15/11 00:05 |
| `collect-vertical:eletroeletronicos` | 6 | 11/11 02:37 | 15/11 03:36 |
| `collect-vertical:impressao3d` | 2 | 12/11 07:14 | 12/11 08:14 |
| `semear-vertical:eletroeletronicos` | 1 | 13/11 22:27 | 13/11 22:27 |
| `collect-vertical:esporte` | 1 | 15/11 03:38 | 15/11 03:38 |

Distribuição por dia: 9 (11/11), 30 (12/11), 21 (13/11), 31 (14/11), 13 (15/11 até agora): **o problema continua ocorrendo**, ~25/dia, após a correção do `stats` (a 14/11 o `stats` deixou de gerar presas; os demais seguem). Observação: 12 das presas do `collect-prices` e 19 do `collect-shopee` aparecem em 48 h.

**Causa [leitura + medido]**: a Vercel mata a função ao atingir `maxDuration` (`collect-prices` 200 s, `collect-shopee`/`collect-vertical`/`refresh-snapshots` 300 s). `collect-prices` não tem `budgetMs` próprio; a duração máxima observada foi 214 s, acima do teto de 200 s. No `collect-shopee`/`vertical`, o orçamento de 240 s mais o último lote chega a 285 s (máx. 285 s) a 407 s (livros, máx. observado, o que indica que a duração medida inclui espera na fila de conexões antes do `finish`). Quando o teto vence, o `finally` não roda e a linha fica `running`. As rotas `discover-products`, `refresh-snapshots:showcase` e `:vitrines` presas indicam o mesmo mecanismo ou queda de conexão durante o `finish`. Que `refresh-snapshots:vitrines` tenha o próprio `skipped` por trava mostra que parte das presas pode vir de execuções que perderam a trava e foram encerradas antes de gravar.

**Impacto**: `health-eval.ts` já trata `running` antigo como "abandonado" (`abandonedAfterMin`), então não há alarme falso, mas: (a) o painel `/admin/fluxo` conta `stale` (>10 min) e mostra ruído permanente; (b) o `collector-health` mistura abandonadas reais com concluídas; (c) as ofertas "devidas" não distinguem execuções que fizeram trabalho parcial.

**Reaper proposto (esforço S)**: rota ou etapa do `collector-health` (já a cada 30 min) que executa

```sql
UPDATE collector_runs
   SET status = 'error', finished_at = started_at + make_interval(secs => 300),
       stopped_because = 'abandonada_sem_fim', duration_ms = 300000
 WHERE status = 'running' AND finished_at IS NULL
   AND started_at < now() - interval '15 minutes';
```

com os mesmos cuidados do script de 14/11: dry-run por padrão, backup NDJSON, log e `--rollback`; e a marca `abandonada_sem_fim` para distinguir de erro real. Além do reaper, reduzir a causa: dar a `collect-prices` um `budgetMs` de 150 s; baixar `budgetMs` de `collect-shopee` e `collect-vertical` de 240 s para 200 s (margem de 100 s, como já fizeram para o `stats`); e gravar `run.finish` em um bloco com `Promise.race` de 5 s no início do último lote (checkpoint "quase no limite").

---

## 4. Pipeline de coleta e mensagens

### 4.1 Gargalos da coleta [medido, janela 48 h]

| Job | Execuções | `orcamento_de_tempo` | `partial` | Duração média/máx. (s) | 429 | Devidas (atual) | Idade da mais velha |
|---|---|---|---|---|---|---|---|
| `collect-shopee` | 574 | **552 (96%)** | 555 | 243 / 285 | 3 | 3.218 | 129 min |
| `collect-prices` (ML API) | 1.150 | 0 | 0 | 105 / 214 | 19 | **6.894** | 60 min (média 24 h: 53,5 h; máx. **2.503 h**) |
| `collect-vertical:livros` | 191 | 163 (85%) | 165 | 280 / 407 | 0 | 1.674 | 58 min (2,7 h) |
| `collect-vertical:impressao3d` | 187 | 124 (66%) | 133 | 222 / 329 | 2 | 1.059 | 72 min |
| `collect-vertical:eletroeletronicos` | 192 | 112 (58%) | 144 | 226 / 379 | 0 | **4.018** | **1.767 min (29,5 h)** |
| `collect-vertical:esporte` | 191 | 2 | 3 | 151 / 305 | 0 | 471 | 103 min |
| `collect-vertical:tecnologia` | 192 | 2 | 2 | 62 / 228 | 1 | 929 | 45 min |
| `collect-vertical:eletrodomesticos` | 192 | 2 | 2 | 103 / 223 | 0 | 1.138 | 104 min |

**C1 (alta). A fila de coleta nunca zera.** O `collect-prices` verifica ~123 ofertas por execução (a cada 5 min) e mantém 6.894 devidas; o `eletroeletronicos` verifica 191 por rodada com 3.711 devidas em média. A "idade da mais velha" chega a 29,5 h no `eletroeletronicos` e a 2.503 h (104 dias, `collect-prices`, máximo de 24 h) em algum item. Impacto no negócio: preço mostrado pode estar atrasado várias horas, justamente quando a promoção da Black Friday vira em minutos. Correção:
 1. subir a cadência de `collect-vertical:eletroeletronicos` e `livros` de 15 para 5 min, ou dividir em duas rotas (a/b) por faixa de id;
 2. priorizar por valor: ordenar as devidas por (cliques recentes, desconto, presença em mensagem) antes de ordenar por idade, para que o orçamento seja gasto onde o preço importa;
 3. antes de 27/11, congelar a ampliação de catálogo (`semear-vertical`, `ampliar-amostra-shopee`, `discover-*`) em favor de atualizar o que já existe.
 Esforço: M.

**C2 (média). Cron empilhado.** `vercel.json` tem 21 entradas; a cada 5 min disparam `collect-prices` e `collect-shopee` no mesmo instante (`*/5`); `group-messages` a cada minuto; `refresh-snapshots` com 5 partes em minutos distintos (bom). Os `collect-vertical` já estão escalonados (`1-59/15`, `6-59/15`, ...), mas cada um dura 60 a 280 s, ou seja, **até 3 coletores de 240 s rodando em paralelo** mais `collect-shopee` (240 s) e `collect-prices` (105 s), todos contra a mesma cota de API do Mercado Livre e do mesmo pool de banco. É o que gera os 429 (19 no `collect-prices` e 3 a 5 nos demais, em 48 h; poucos em número absoluto). Correção: tornar as rotas mutuamente exclusivas por rede com a trava de ciclo que já existe (`acquireCycleLock` em `src/server/messaging/cycle-lock.ts`, usada só nas vitrines). Esforço: S.

**C3 (média). `cobertura-shopee` esgota a cota toda rodada**: 28 `error` + 11 `partial` de 60 execuções em 48 h; `rate_limit` em 38 (o docs/erros-servidor-2026-11-14.md já registrou e passou a fechar como `partial`, mas os 28 `error` seguem na janela porque a correção é de 14/11). Decisão do dono pendente: dar cota própria ou espaçar.

**Carga do cupom ML (+1.500 ofertas)**: não há contador direto; em `affiliate_offers` há 24.943 ofertas atualizadas na última hora e a taxa de snapshots por dia triplicou a partir de 11/11 (8,5 mil para 44 mil). O reflexo na coleta é o aumento das devidas (`collect-prices` 6.894, `eletroeletronicos` 4.018). **[hipótese]** parte do aumento de snapshots vem de ofertas já existentes que passaram a ser verificadas com mais frequência, não de ofertas novas; para confirmar, comparar `price_confirmed` por job antes/depois de 11/11.

### 4.2 Taxa de falha por job (48 h) [medido]

Sem `error` (0 de N): `amazon-assistida` 1.605, `amazon-vitrine` 154, `aprovacao-auto` 239, `collect-prices` 1.150, `collect-shopee` 574, todos os `collect-vertical` (1.137 execuções), `refresh-snapshots:daily/inventory/showcase/vitrines`, `ml-links-assistida` 973, `fila-api-oficial-ml` 139.
Com falha: `group-messages` **28 `error` de 2.800 (1,0%)** (consultas transitórias, ver `docs/erros-servidor-2026-11-14.md`); `cobertura-shopee` 28 de 60 (47%); `refresh-snapshots:stats` 18 de 96 (19%, `timeout_antigo`, histórico); `cupons-batimento` 4 de 491 (parada do operador); `ampliar-amostra-shopee` 1 de 1 (`erro_rate_limit`, 107 s); `semear-vertical:eletroeletronicos` 1 de 140 e `http_429` em 8 execuções.

### 4.3 Mensagens: filas, idempotência, latência

- **Idempotência: boa** [leitura: `group-queue.ts`]: `INSERT ... ON CONFLICT (dedup_key, channel) DO NOTHING`; reivindicação atômica por `UPDATE ... WHERE status IN (...) AND attempts < 3`; envio presos em `enviando` voltam a `erro` após 10 min; erro 429 do Telegram devolve a mensagem à fila com `retry_after`. No pior caso (queda entre o envio ao Telegram e a gravação `enviada`), o desenho é "no máximo uma vez", sem duplicidade.
- **Retentativas**: 2.803 enviadas com 1 tentativa, 4 com 2, 0 com 3 (nenhuma esgotou). `erro` 57 no total.
- **Estoque (todo o histórico, 4 dias)**: 22.724 `expirada`, 6.244 `enviada`, 1.100 `proposta`, 760 `proposta_auto`, 223 `retida`, 57 `erro`.

**M1 (média). 82% das mensagens geradas expiram** (14.402 `expirada` contra 2.807 `enviada` em 48 h). Isto indica geração em excesso: o motor propõe tudo o que passa nas regras e a fila de envio (limitada por cadência por canal) não consome. Custo: 7,8 mil linhas/dia, o `row_number()` de 6,4 s (D5) e CPU de avaliação. Correção: limitar a proposta ao que cabe na cadência (teto por rodada) e, quando uma proposta expira, não regerar a mesma sem mudança de preço. Esforço: M.

**M2 (média). Latência da descoberta até a mensagem** [medido, `sent_at - created_at` em 48 h]: mediana por gatilho: G2 318 s (p90 2,0 h), G3 483 s, G5 428 s, G4 25 s, OK2 128 s; **AC 72 min (p90 5,5 h)**, N1 61 min (p90 4 h), P1 33 min, P2 21 min, P3 42 min, P4 61 min, **CUPOM 118 min (p90 2 h)**. O gatilho de cupom, que depende da leitura do Chrome e da janela de frescor de 120 min, é o mais lento; AC (alta de confiança) leva mais de uma hora na mediana. Para promoção relâmpago da Black Friday esses números são altos. Correção: priorizar a fila por gatilho e frescor (G2 e CUPOM à frente) e reservar capacidade de envio para eles. Esforço: M.

### 4.4 Loops do Chrome (`public/loops/*.js`, 2.282 linhas)

Cinco arquivos: `amazon-assistida` (514), `amazon-promocoes` (442), `cupons-24h` (549), `ml-cupons-item` (364), `ml-links-ui` (413). Pontos fortes [leitura]: lógica pura testável separada do DOM (`PURO`, teste em `scripts/test-cupons-24h.ts`), token só em closure (nunca em `localStorage`), `window.__CUP_CFG` apagado após a injeção, relógio por Web Worker para evitar o throttling de aba em segundo plano (`amazon-assistida.js:273`, `ml-links-ui.js:149`), recuo com teto de 30 min em captcha/login/403/429, batimento a cada ciclo (`cupons-heartbeat`) e vigia no servidor (aviso se a rede ficar 60 min sem batimento).

**L1 (alta). Dependência total de uma aba aberta e logada.** Recarregar a aba mata o loop ("após recarregar a aba o loop morre: injetar de novo"). Se o Chrome fecha, o computador dorme ou o Windows reinicia: Amazon assistida, ML links, cupons de Amazon e Shopee e `fila-api-oficial-ml` param; as ofertas Amazon já mostram 1.968 de 2.801 ativas com mais de 24 h sem leitura [medido]. O sinal chega em ~60 min (vigia), mas o aviso não sai: `canal_interno_nao_configurado` (`src/lib/coupons/heartbeat.ts:139`); o último alerta do vigia é de 14/11 13:25. Medido: 5 lacunas de mais de 30 min em 48 h nos batimentos, a maior de 2 h 23 min. Correção: (1) configurar `TELEGRAM_ALERT_CHAT_ID`/`COLLECTOR_ALERTS=1` hoje (ação do dono, S); (2) Task Scheduler do Windows para reabrir o Chrome com a aba e a extensão ao iniciar (`scripts/chrome/` já tem os loops; falta o disparo no logon); (3) para o caminho crítico (preço Amazon), avaliar a API oficial de afiliados como substituto da raspagem (já listado em `docs/divida-coleta-sem-api-oficial.md`). Esforço: S a L.

**L2 (média). Segurança operacional do bootstrap**: o loop é baixado por "fetch + eval" de `/loops/*.js` com `Access-Control-Allow-Origin: *` e `Cache-Control: no-store` [leitura: `next.config.ts`]. O token não está no arquivo (bom), mas qualquer página pode ler o código-fonte; e o `eval` na aba logada executa o que o servidor entregar. Aceitável com o domínio sob controle do dono; vale assinar o arquivo (hash conferido no bootstrap). Esforço: S.

### 4.5 Custo de infraestrutura (estimativa)

- Execuções de cron na Vercel: ~3.400 por dia (excluindo os loops do Chrome, que não consomem função) mais `group-messages` a cada minuto (já incluído); **tempo de função somado: 71 a 79 h/dia** (medido na soma de `duration_ms`); cerca de **2.300 h/mês** de duração, que na cobrança por CPU ativa da Vercel é bem menor que o relógio por serem em grande parte esperas de I/O. O plano Pro (a repetição de 300 s de `maxDuration` indica o plano Pro) cobre o uso atual.
- Supabase: 1,07 GB e ~60 conexões. Sem custo extra enquanto o plano incluir ≥ 8 GB; a computação (CPU) é o recurso apertado (181 h de execução em 16 dias ≈ 0,47 núcleo médio).
- Sem estimativa confiável de tráfego (sem Analytics), então o custo de renderização das páginas não pode ser calculado. **Dado que falta**: visitas/dia e proporção de instâncias frias.

---

## 5. Eficácia e efetividade

- **Exatidão do pipeline (preço lido = preço mostrado)**: o desenho tem salvaguardas fortes: `price_confirmed` e `record_kind` no snapshot, reconfirmação ao vivo antes do envio (`live_checked_at`, `live_price_cents`, `recheck_divergence_pct` em `group_messages`), agulha de cupom com 4 conferências e janela de 120 min. Limite: a exatidão é tão boa quanto a idade da leitura (C1). Para ofertas Amazon a idade passa de 24 h em 70% delas. **Dado que falta**: taxa real de divergência `recheck_divergence_pct` (já gravada; basta agregar).
- **Latência até a mensagem**: ver M2.
- **Alarmes e observabilidade**: existem `collector-health` (cron a cada 30 min), `/admin/fluxo`, `/api/health` (só `SELECT 1`), `slo.ts` e `health-eval.ts` bem testados. Faltam: (a) sonda **externa** (nada fora da Vercel chama `/api/health`; se a Vercel ou o Supabase cair, ninguém é avisado); (b) canal de alerta ligado; (c) métricas de Core Web Vitals; (d) alerta sobre o `idade da mais velha > N h`; (e) painel de custo.
  Correção: UptimeRobot/BetterStack gratuito em `/api/health` a cada 1 min com aviso por Telegram; ligar `COLLECTOR_ALERTS`. Esforço: S.
- **Retenção**: `collector_runs` retém ~8 dias (limpeza existente); `affiliate_price_snapshots` guarda tudo desde 13/07 (correto: é o histórico do produto) mas sem particionamento nem arquivamento; com 44 mil linhas/dia, em 12 meses a tabela passa de 20 milhões de linhas e 4 GB. `price_daily_offer` (agregado diário) já existe e é o caminho para arquivar `batimento` antigo. Plano para depois da BF.
- **RLS e segredos**: RLS ligada em todas as tabelas públicas [medido: 0 tabelas sem RLS]; `anon` com 0 `SELECT` no esquema `public`. Cabeçalhos de segurança (HSTS, CSP em modo relatório, frame-ancestors) em `next.config.ts`. Rotas `/api/cron/*` sem token respondem `403` [medido].
- **Efetividade operacional**: o processo (Conselho, Fluxo Mestre, fila de execução) produz muito e rápido (63 tarefas na fila), mas a eficácia técnica é limitada por **mudar demais sem rede de proteção** (A4) e por **ampliar o catálogo mais rápido do que a coleta consegue atualizar** (C1).

---

## 6. Os 10 ganhos de maior retorno antes da Black Friday (27/11)

| # | Ganho | Achado | Esforço | Retorno |
|---|---|---|---|---|
| 1 | Ligar alerta e sonda externa: `COLLECTOR_ALERTS=1`, `TELEGRAM_ALERT_CHAT_ID`, UptimeRobot em `/api/health` | seção 5, L1 | S | Alto: hoje ninguém é avisado se o Chrome ou a Vercel parar |
| 2 | Reaper de `collector_runs` + reduzir `budgetMs` (`collect-prices` 150 s, `collect-shopee` e `collect-vertical` 200 s) | 3.4 | S | Médio: acaba o ruído (104 presas) e o `stale` do `/admin/fluxo` |
| 3 | Materializar a contagem por departamento (`live_networks`) e ler da tabela | D4 | M | Alto: retira 43% da carga do banco |
| 4 | Estatística por master: limitar idade máxima mostrada e recalcular só o que mudou | D4 | M | Alto: retira 33% da carga; hoje há valor de 11,6 dias |
| 5 | Priorizar a coleta por valor (cliques, desconto, em mensagem) e escalonar `eletroeletronicos`/`livros` a cada 5 min | C1 | M | Alto: preço atual no que mais vende |
| 6 | Congelar ampliações de catálogo (`semear`, `ampliar-amostra`, `discover`) de 20/11 a 30/11 | C1 | S | Médio: libera cota de API e CPU para atualizar |
| 7 | `proxy.ts`: não chamar `auth.getUser()` sem cookie `sb-*`; cookie de visitante só com a flag ligada | W2 | S | Médio: menos latência e custo por visita |
| 8 | Pré-aquecimento (`warm`) das páginas principais após cada deploy e `revalidate` de 60 s nas públicas | W1 | M | Alto: elimina o 1º acesso frio de 2,7 s e o pico de instâncias frias |
| 9 | Limitar a geração de propostas à cadência de envio; índice parcial para a fila | M1, D5 | S/M | Médio: some o `row_number` de 6,4 s e 14 mil expiradas por 48 h |
| 10 | `npm run test:all` com as flags certas + `typecheck` em `pre-push`; exceção no firewall para Googlebot/TelegramBot | A4, W4 | S | Médio: evita regressão sob corrida e perda de prévia de link |

## 7. Plano P0 / P1 / P2

**P0 (até 18/11; reversível, sem DDL em produção sem aval)**
- Ligar canal de alerta e sonda externa (#1). Ação do dono: criar o chat e colocar as duas variáveis.
- Reaper de `collector_runs` e ajuste dos orçamentos (#2). Código + script no padrão dry-run/backup/rollback.
- `proxy.ts` (#7).
- Confirmar a regra de firewall da Vercel (#10, W4).
- Task Scheduler do Windows para reabrir o Chrome com as abas (L1).

**P1 (até 24/11)**
- Contagem de departamento e estatística materializadas (#3, #4). Requer migration (aval do dono).
- Prioridade de coleta por valor e cadência de 5 min nas verticais com fila grande (#5).
- Warm-up e `revalidate` (#8); limite de propostas e índice parcial (#9).
- `autovacuum` mais agressivo em `affiliate_price_snapshots` (D1) e `VACUUM (ANALYZE)` manual fora de horário.
- `npm run test:all` e hook `pre-push` (#10, A4).
- Congelar ampliações em 20/11 (#6).
- Aumentar a computação do Supabase por 3 dias de pico (D6) e medir o `max_client_conn`.

**P2 (depois da BF)**
- Dividir `group-rules.ts` por gatilho (A1) e unificar o porteiro em `catalog/porteiro.ts` (A2).
- Renomear arquivos duplicados `lib`/`server` (A3); migrar os 13 scripts sem `--apply` ao padrão seguro.
- Limpeza das pastas mortas (`.next-perf2/3`, `build.log`, `--out`) e política de retenção de `docs/backups`.
- Políticas de retenção e arquivamento de `affiliate_price_snapshots` (batimentos antigos para o agregado diário), possível particionamento mensal.
- Reduzir imagens locais grandes e usar variante menor das fotos do ML; medir Core Web Vitals reais.
- Substituir a raspagem assistida da Amazon por API oficial onde houver (`docs/divida-coleta-sem-api-oficial.md`).

## 8. O que não foi possível verificar

- Tráfego real, taxa de instâncias frias e custo exato da Vercel/Supabase (sem acesso ao painel de cobrança nem Analytics).
- `EXPLAIN` das consultas `live_networks` e `q_all` (evitado por serem pesadas; recomenda-se rodar fora do pico).
- Os 8 testes que falharam foram confirmados como falha de harness (`server-only`) em 2 deles por execução direta e nos demais pela pilha de erro; não foram reexecutados com `--conditions=react-server`.
- `cron.job`/`pg_cron`: a tabela não existe no esquema acessado; o agendamento visível é só o do `vercel.json`. O comentário de `collect-prices` menciona um job `pg_cron`/`pg_net` (`geek-deals-collect-prices`) que pode coexistir em outro esquema; se existir, o `collect-prices` estaria sendo disparado duas vezes (confirmar no painel do Supabase). Isso é **[hipótese]**, sustentada por 1.150 execuções em 48 h contra 576 esperadas de `*/5` (a contagem 2x indica disparo duplo).
