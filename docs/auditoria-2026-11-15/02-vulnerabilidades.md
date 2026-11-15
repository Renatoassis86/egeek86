# Auditoria 2026-11-15, painel 2: vulnerabilidades no contexto do negócio

Painel: seguranca-db, engenheiro-infra-sre e engenheiro-backend (Conselho Geek). Somente leitura: código, `SELECT` no banco (transação `READ ONLY`), `vercel env ls` (só nomes e tipo) e `npm audit`. Nada foi escrito em produção. Nenhum valor de segredo foi lido ou impresso; onde há segredo, só o arquivo e o tipo.

Pergunta do dono: "o que ainda tem de vulnerabilidade diante do nosso contexto e modelo de negócio".

## 0. Resumo executivo

O ativo do negócio é a confiança no preço, e a receita é comissão por clique rastreado. As ameaças reais, em ordem, não são hackers sofisticados. São: (1) perder uma conta de afiliado (Amazon em especial) por política, (2) publicar preço ou produto errado para um público que já recebe ~900 mensagens por dia, (3) a coleta e os alertas pararem sem ninguém saber (um PC, uma conta logada, alerta desligado), (4) perder o banco sem backup fora da máquina.

O que está forte: RLS ligada em 102 de 102 tabelas, zero política e zero GRANT para `anon`/`authenticated` (a chave anônima não lê nem escreve nada); `requireAdmin` em todas as ações de mutação; nenhum `dangerouslySetInnerHTML`; `/go` e `/g` só redirecionam para destino vindo do banco; segredos fora do git; cron e ingest em tempo constante e fail-closed; rate limit de firewall publicado.

O que está fraco: alertas do coletor em dry-run, backup só local, Next.js com advisory crítico, preços/produtos de risco ativos, aviso de afiliado fora das páginas de maior exposição, repositório PÚBLICO no GitHub, token único de ingest para três redes, linhas `running` presas e um disparador externo duplicando o `collect-prices`.

Placar: 0 críticas explorando segurança clássica; 8 altas; 9 médias; 6 baixas.

---

## 1. Achados priorizados (probabilidade x impacto)

Legenda de esforço: P = até 1 h, M = meio dia, G = 1 a 3 dias.

### ALTAS

**A1. Alertas do coletor estão em dry-run: ninguém é avisado quando a coleta para.** (disponibilidade)
- Evidência: `vercel env ls production` não tem `COLLECTOR_ALERTS` nem `TELEGRAM_ALERT_CHAT_ID`. `src/server/observability/collector-health.ts:24` só envia se `COLLECTOR_ALERTS==='1'` e há chat; `src/server/coupons/heartbeat-store.ts:61-62` idem. `docs/erros-servidor-2026-11-14.md` já registra `cupons-vigia: canal_interno_nao_configurado`.
- Cenário: na Black Friday o Chrome do dono dorme, a sessão da Amazon expira ou a Shopee devolve 10030 por horas. O vigia detecta e grava no banco, mas não envia nada. Preço velho e ofertas mortas ficam no ar e o dono descobre pelo resultado.
- Correção: criar um grupo/chat privado só do dono, setar `COLLECTOR_ALERTS=1` e `TELEGRAM_ALERT_CHAT_ID` na Vercel e redeployar. Testar derrubando um loop de propósito. Esforço P. **P0.**

**A2. Backup do banco: um único export de 884 MB em disco local, sem evidência de PITR.** (continuidade)
- Evidência: `backup/` (gitignored, 884 MB, `ndjson` por tabela, `log-restauracao.txt`) é o único backup achado; `grep pitr|pg_dump` em `docs/` só acha um `pg_dump -t group_messages` pontual. O banco tem 1074 MB (acima do limite do plano gratuito, então é plano pago; PITR é add-on e não consta em nenhum doc). `drizzle.__drizzle_migrations` tem 19 linhas para ~52 migrations: as migrações são aplicadas por scripts próprios, sem ledger confiável.
- Cenário: um UPDATE em bloco errado (já houve vários "aplicar-*" em lote), uma migração ruim ou o Supabase pausar/corromper o projeto na semana da Black Friday. O backup local está no mesmo PC que concentra os loops, sem criptografia, e inclui `profiles`, `addresses`, `orders`.
- Correção: (a) confirmar no painel do Supabase o plano e ligar PITR (ou ao menos backups diários) antes de 20/11; (b) `pg_dump` noturno para fora da máquina (bucket privado/criptografado), com teste de restauração anotado em `docs/`; (c) criptografar ou mover `backup/dados`. Esforço M. **P0.**

**A3. Next.js 16.2.6 com advisory crítico no `npm audit`; sharp e zod com advisories altos.** (superfície pública)
- Evidência: `npm audit --omit=dev`: 1 crítica (`next`, direta), 5 altas (`sharp` direta, `zod` direta, `nanoid`, `postcss`, `source-map-js`). Títulos do `next`: bypass de Middleware/Proxy (Turbopack, single locale), DoS em Server Actions, SSRF em Server Actions em servidor custom, cache confusion. Correção disponível sem salto de major: `next@16.4.6`. `sharp` processa imagens baixadas de terceiros em `prepareCoverV2` (`src/server/messaging/card-v2.tsx:65`), então os CVEs de libvips/libheif importam.
- Cenário: a autorização real não depende do `proxy.ts` (está em `requireAdmin`/ações), o que reduz muito o risco de bypass; o DoS em Server Actions e o parser de imagem são os vetores práticos.
- Correção: subir `next` para 16.4.6, `sharp` e `zod` para as versões corrigidas, rodar `test:*` e `build`, e só então promover. Esforço M. **P0** (a trava de CI de G1 evita repetir deploy quebrado).

**A4. Preços implausíveis e produtos de risco passando como ofertas ativas.** (integridade do ativo)
- Evidência (SELECT, `status='active' and quarantined_at is null`): 51 ofertas acima de R$ 30.000 (ex.: Canon PowerShot G3 X a R$ 77.700; projetor Samsung The Freestyle a R$ 29.000; lava-louças Electrolux a R$ 18.000; Smart TV 32" Philco a R$ 12.000) e 12 abaixo de R$ 5 (grips, telescópio a ~R$ 0). 112 títulos com termos de risco: 60 "desbloqueado", 41 "retro", 4 "retrô", 2 "replica", 2 "usada", 1 "open box"; 98 deles na vertical games, entre eles ~8+ Nintendo Switch "desbloqueado/kamikaze" a R$ 1.659 a R$ 3.499. Masters com 1 só oferta ativa: 3.806 de 8.326 (45%), onde a checagem de mediana (`price-plausibility.ts`, `MIN_REFERENCES = 2`) não tem como julgar. 17 ofertas games abaixo de 35% da mediana do master. O código já tem regras (`console-identity.ts:60` MODDED, `offer-identity-sql.ts`, `gate.ts`) mas a ativa ainda tem resíduo; o Conselho já decidiu "usado/retrô fora" e "destravado/modificado fora das médias".
- Cenário: uma mensagem com "Switch OLED por R$ 1.659" que é console destravado, ou uma câmera "por R$ 77.700" em destaque, destrói a confiança e atrai reclamação/denúncia às lojas (e o ML pode tratar destravado como produto proibido). Vendedor que sobe preço ou cria anúncio isca para entrar em vitrine é o abuso mais plausível neste negócio.
- Correção: (1) quarentena em lote com backup do conjunto acima, via a trilha de aprovação existente (`aplicar-*` com `--rollback`); (2) teto absoluto por vertical (ex.: sem preço > R$ 30.000 ou < R$ 5 em ofertas públicas) como segunda trava independente da mediana; (3) para master de 1 oferta, exigir preço dentro de faixa histórica da própria oferta (variação > 3x em uma coleta = quarentena); (4) tornar "desbloqueado/destravado/réplica" excludente também no gate de exibição, não só na média. Esforço M. **P0.**

**A5. Aviso de afiliado: risco de política das redes e regulatório (CONAR/CDC) depois da decisão do dono.** (jurídico)
- Evidência: `src/components/legal/commission-notice.tsx` existe mas não é usado em nenhuma tela; a divulgação hoje está só em `termos/page.tsx:131` e `sobre/page.tsx:565`. As regras da Shopee salvas em `docs/termos-shopee-2026-11-10/14-guia-conar-2026-identificacao-publicitaria.md` e `13-termos...` exigem identificação publicitária; o Programa de Associados Amazon exige declaração visível no site; mensagens do Telegram carregam link de afiliado no texto (`group-messages.ts:240`).
- Cenário: a Amazon encerra a conta de associado (perda total de comissão e do histórico) por falta de declaração; um concorrente ou usuário denuncia ao CONAR/Procon; a Shopee reprova campanha. É a falha de menor custo e maior impacto do relatório.
- Mitigação sem contrariar o dono (nada de banner nas telas de produto): (a) linha curta e fixa no rodapé global "Podemos receber comissão por compras feitas pelos links", com link para `/sobre#transparencia`; (b) seção "Como ganhamos dinheiro" em Sobre e item dedicado em Termos (a existente é uma linha); (c) a declaração oficial da Amazon por extenso ("Como Associado da Amazon, recebo comissão por compras qualificadas") nessa mesma página, que satisfaz a exigência de ser localizável; (d) nas mensagens do canal, uma linha final padrão ("link de afiliado"), que o texto de 3 linhas já comporta. A decisão do dono sobre retirar o aviso das páginas de produto fica intacta. Esforço P. **P0** (texto) e confirmar com o dono.

**A6. Raspagem automática da Amazon em aba logada (2/2 h) viola os termos do Programa de Associados.** (política da rede)
- Evidência: `amazon-assistida`: 474 runs/24 h; `public/loops/amazon-assistida.js`, `amazon-promocoes.js`; ADR 0009. 1.968 das 2.801 ofertas Amazon ativas (70%) estão sem checagem há mais de 24 h e 2.626 há mais de 6 h; a exibição pública já filtra por frescor da Amazon (`src/server/queries/departamento.ts:77`), então a vitrine não mostra preço velho, mas a coleta continua sem API oficial (PA-API) e com a conta logada do dono.
- Cenário: a Amazon detecta automação na conta do dono (a mesma conta com os cookies do Associates), bloqueia o login ou fecha a conta de associado. Impacto direto em receita e na conta pessoal.
- Correção: usar o PA-API/Creators API para preço (a pesquisa de Amazon na Fila já tratou a integração), limitar o loop a descoberta de catálogo e a conta de leitura separada da conta do Associates; se mantido, reduzir frequência e registrar a decisão com ciência do risco. Esforço G. **P1** (decisão do dono + plano antes da BF).

**A7. Repositório GitHub PÚBLICO com 98 MB de backups e documentos estratégicos.** (superfície)
- Evidência: `gh repo view` -> `visibility: PUBLIC`. Rastreados: `docs/backups/*` (153 arquivos, ~98 MB; `group_messages`, ofertas, vendedores), `docs/` inteiro (estratégia, atas do Conselho, plano de comissão, termos da Shopee), `src/lib/admin-gestao/taxas-comissao.ts` (tabela de taxas de comissão; o comentário diz "uso exclusivo do admin"; o runtime respeita, o código-fonte não). Um endereço de e-mail pessoal (domínio gmail) em arquivos de `docs/`. Nenhum segredo encontrado (ver seção 2).
- Cenário: concorrente lê a estratégia (verticais, regras de média, thresholds de mensagens), reproduz os critérios para contornar a quarentena (vendedor que ajusta título para escapar das regexes públicas) ou usa o histórico de mensagens. Dados de `group_messages` são públicos por natureza, mas as taxas de comissão e a estratégia de redes não deveriam estar abertas.
- Correção: tornar o repositório privado (um clique, sem custo no plano atual do dono) ou, se precisar ser público, mover `docs/backups`, `docs/conselho`, `docs/termos-*` e `taxas-comissao.ts` para repositório privado e limpar do histórico. Esforço P (privar). **P0.**

**A8. Disparador externo desconhecido duplica o `collect-prices` (e provavelmente usa `?key=`).** (disponibilidade/cota)
- Evidência: `collect-prices` rodou 573 vezes em 24 h contra 288 esperadas para `*/5`; 274 minutos tiveram exatamente 2 runs no mesmo minuto (SELECT agrupando por `date_trunc('minute')`). `collect-shopee` rodou 287 (normal). O banco não tem `pg_cron` nem `pg_net` (`pg_extension`: só plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault, citext, pg_trgm, unaccent). Ou seja: existe um segundo agendador em algum lugar (outro serviço de cron, GitHub Action em outro repositório, monitor de uptime ou agente do dono).
- Cenário: o consumo de cota do ML dobra (já há 29 runs com `rate_limited` ou `stopped_because` de limite em 24 h), o `collect-prices` concorre consigo mesmo e deixa linhas presas (ver M1); o `?key=` continua aceito e o segredo do cron trafega em URL e logs de terceiros.
- Correção: achar a origem (`vercel logs -q "cron-auth"`, procurar `[cron-auth] autorizado por ?key= (legado)`; conferir cron-job.org, UptimeRobot, GitHub Actions, Make/Zapier, agentes do dono); desligar a duplicata; só então `CRON_ACEITA_KEY_NA_URL=off`. Esforço P a M. **P0.**

### MÉDIAS

**M1. 106 linhas `collector_runs` em `running` sem fim (a mais antiga: 2026-11-11 02:35 UTC). Explicação.**
- Evidência: `select ... where finished_at is null and started_at < now()-30min`: collect-prices 31, collect-shopee 31, refresh-snapshots:showcase 11, collect-vertical:livros 7, discover-products 7, refresh-snapshots:vitrines 7, collect-vertical:eletroeletronicos 6, impressao3d 2, semear-vertical 1, esporte 1. Distribuição: 9 em 11/11, 30 em 12/11, 21 em 13/11, 31 em 14/11, 13 em 15/11 (a limpeza de 14/11 só tratou `refresh-snapshots:stats`).
- Causa raiz: `run.finish` só roda se a função termina. A Vercel mata a função em `maxDuration` e a linha fica `running`. Medido em runs concluídos nos últimos 3 dias: `collect-shopee` média 243 s, máximo 285 s (teto 300 s: o orçamento de tempo e o teto praticamente coincidem); `collect-prices` máximo 214 s com `maxDuration = 200` (`route.ts:12`); `collect-vertical:livros` máximo 455 s com teto 300 s (a duração gravada inclui o tempo até o kill); `refresh-snapshots:showcase` máximo 241 s. Agravante: duplicação do A8 (duas execuções simultâneas disputam os mesmos itens). Efeito: estatísticas de saúde sujas, `collector-health` conta `running` como "ocupado" e o gate da cobertura Shopee ("se há `collect-shopee` running < 6 min, espera") pode se confundir. Sem efeito em preços (os dados já foram gravados antes do kill).
- Correção: (a) orçamento de tempo = 80% do `maxDuration` em cada rota e `run.finish` num `finally` com `after()`; (b) job de saneamento (cron a cada 15 min) que fecha como `error/timeout_antigo` todo `running` mais velho que o `maxDuration` da rota + 2 min, com o mesmo padrão `aplicar-limpeza-running-presos` já existente (backup NDJSON e `--rollback`); (c) tirar a duplicata do A8. Esforço M. **P1.**

**M2. Token único de ingest para ML, Shopee e Amazon; checagem de Origin só vale para navegador.**
- Evidência: `ingest-guard.ts:21` usa `COUPON_INGEST_TOKEN || ASSISTED_INGEST_TOKEN || AMAZON_INGEST_TOKEN`; na Vercel só existe `AMAZON_INGEST_TOKEN` (Sensitive), portanto as rotas de cupom, ML-links, Amazon e Shopee compartilham o mesmo segredo. O `Origin` pode ser forjado por qualquer cliente que não seja navegador (curl).
- Cenário: o token vive na closure de uma aba logada (extensão de navegador, script colado, log do `evaluate` do agente). Quem o obtém injeta preços, cupons e links em todas as redes, e o site publica (e o Telegram envia) o que o atacante quiser. Probabilidade baixa, impacto alto.
- Correção: um token por rede (`COUPON_INGEST_TOKEN`, `ML_LINKS_INGEST_TOKEN`, `SHOPEE_INGEST_TOKEN`), rotação trimestral, validação de plausibilidade no servidor para preço vindo do ingest (hoje a defesa é só mediana + quarentena), e teto de volume por token (`MAX_ROWS=40` já existe). Esforço M. **P1.**

**M3. `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SUPABASE_*` na Vercel como "Non-sensitive"; `DATABASE_URL`, `DIRECT_URL` e `CRON_SECRET` também em Preview.**
- Evidência: `vercel env ls production`: a service role e as variáveis públicas aparecem com valor visível ("eyJ2…") e tipo Non-sensitive; `DATABASE_URL`, `DIRECT_URL`, `CRON_SECRET` e as credenciais do Mercado Livre estão em Production e Preview. O mapa já registrado pelo time é que os segredos de integração (Shopee, tokens) estão `Sensitive` e por isso os scripts locais não os leem.
- Cenário: qualquer colaborador/ferramenta com acesso ao projeto Vercel vê a chave de serviço que ignora RLS. Um deploy de Preview (ex.: branch de teste de agente) roda com acesso de escrita ao banco de produção.
- Correção: reemitir a service role e marcá-la Sensitive; remover `DATABASE_URL`/`DIRECT_URL`/`CRON_SECRET` do escopo Preview (ou apontar um banco/branch separado); manter `NEXT_PUBLIC_*` como estão (públicas por desenho). Esforço P a M. **P1.**

**M4. Sem rate limit nas rotas que consultam o banco com cache-miss por parâmetro livre, e `/go` escreve em tabela por clique.**
- Evidência: `GET /api/search?q=` cacheia por URL (`s-maxage=60`), então `q` aleatório fura o CDN e dispara `suggestProducts` (trigram em ~42 mil ofertas) e busca de notícias; `/api/health` faz `SELECT 1` por hit sem cache; `/go/[slug]` grava `analytics_events` em cada clique (`after()`), com `User-Agent` e referer. O firewall limita a 120 req/min por IP em `/api` e 300 req/min nas páginas, o que cobre bot simples, não botnet. `max_connections = 60`.
- Cenário: scraper distribuído ou concorrente ativa varredura de `q`/slugs na semana da Black Friday e consome conexões; o site cai exatamente quando mais vende.
- Correção: regra de firewall extra por ASN/UA (bloquear UAs de scrapers conhecidos), cache de `q` normalizado (minúsculas, trim) e `s-maxage` maior, dedupe de cliques por (`anonymous_id`,`slug`,minuto) antes de inserir, e Edge Config/WAF "Under Attack" pronto para ligar. Esforço M. **P1.**

**M5. Camada de SSRF e de parser de imagem sem barreira de destino.**
- Evidência: `card-v2.tsx:65` e `offer-card.tsx:165` fazem `fetch(url, { redirect: 'follow' })` na URL da foto da oferta (vinda de coleta/ingest) sem allowlist de host nem bloqueio de IP privado; `news.ts:225` `scrapeNewsArticle(url)` busca URL arbitrária (admin only). `discover-products.ts:405` usa URL montada de API.
- Cenário: hoje só o dono/admin e fontes autenticadas alimentam essas URLs; com o token compartilhado (M2) um atacante poderia apontar `image_url` para um endpoint interno do Vercel/AWS metadata e usar o conteúdo no card. Probabilidade baixa, impacto médio.
- Correção: função `safeFetchImage` com allowlist (mlstatic.com, shopee/susercontent, m.media-amazon.com), `redirect: 'manual'`, bloqueio de IP privado/link-local e limite de bytes (já existe `COVER_MAX_BYTES`). Esforço M. **P2.**

**M6. Sem trava de CI: 5+ deploys em Error por import de banco em componente de cliente e conflitos de tipo.**
- Evidência: não há `.github/` nem workflow; `git log` tem `9c53d0e` (cartao-vitrine de cliente importava `regras.ts` que chega ao banco), `8981ee7` (import de config-ciencia não commitado), `aab8e41` (scripts/rls-testar-anon.ts colidindo no type check). A Vercel mantém o último deploy bom, mas correções de segurança e de dados ficam presas.
- Correção: workflow GitHub Actions em todo push/PR: `npm ci`, `npm run typecheck`, `next build`, e uma regra `eslint no-restricted-imports` (ou `scripts/check-client-boundary.ts`) que falha quando um arquivo com `'use client'` importa, direta ou transitivamente, `@/lib/db`, `server-only` ou `@/server/*`. Bloquear merge em `main` sem verde. Esforço M. **P1.**

**M7. Conexão do app ao banco sem TLS.**
- Evidência: `src/lib/db/index.ts:94-107` usa um `net.connect` próprio (sem TLS) sempre que a URL não pede `sslmode=require|verify`; o servidor tem `ssl = on`. O mesmo vale para os scripts locais (`scripts/_q.mjs`), que atravessam a internet da casa do dono.
- Cenário: captura de tráfego na rede doméstica ou em Wi-Fi público expõe consultas e dados (incluindo `profiles`/`orders`); a senha viaja via SCRAM, mas o conteúdo não.
- Correção: aceitar o custo do socket para o timeout e adicionar `tls.connect` ao `stuckAwareSocket` (mantendo o setTimeout), ou ao menos exigir `sslmode=require` nos scripts. Testar o pooler de transação com TLS. Esforço M. **P2.**

**M8. LGPD e cookies incompletos.**
- Evidência: `privacidade/page.tsx:138-148` lista só `sb-…-auth-token` e `theme`, mas `src/proxy.ts` grava `eg_v` (UUID de visitante, 1 ano, `httpOnly`) em `/`; `analytics_events` guarda `anonymous_id`, `User-Agent` e referer; `drop_access_log` guarda hash de IP e `fingerprint`; `profiles` guarda `telegram chat id`. A política existe, tem Encarregado e direitos, mas não cita `eg_v`, nem retenção, nem Telegram/Plus/WhatsApp consent completo. Não há banner de consentimento (cookie `eg_v` é analítico/experimento, não estritamente necessário).
- Correção: acrescentar `eg_v` e `analytics_events` à política (finalidade, prazo, base legal legítimo interesse), definir retenção (ex.: 13 meses, job de expurgo) e decidir entre banner simples de consentimento ou desligar o `eg_v` até haver consentimento. Esforço P. **P1.**

**M9. Regras de uso das redes: preço guardado por mais que o permitido, logos e mensagens.**
- Evidência: o histórico `affiliate_price_snapshots` (3,4 milhões de linhas, 664 MB) guarda preço do ML e da Shopee indefinidamente; o dono fixou frescor em 24 h (commit `9c53d0e`), mas a retenção de série histórica de preço de terceiros e a exibição de gráfico público ("menor preço", "média por oferta/dia") não estão cobertas por nenhum doc de termos do ML ou da Amazon que eu tenha achado em `docs/`. Para a Shopee há `docs/termos-shopee-2026-11-10/13-termos...`. Logos das lojas nos cards e nos botões (não auditado aqui).
- Correção: o Conselho precisa registrar em `docs/` uma matriz "rede x o que o termo permite (cache de preço, histórico, uso de marca, links curtos/redirecionamento, mensagens)" e ajustar, por rede, o que for restrição explícita; para a Amazon, manter preço só enquanto fresco e não publicar série histórica derivada de raspagem. Esforço M. **P1.**

### BAIXAS

**B1.** `/api/health` ignora o interruptor `CRON_ACEITA_KEY_NA_URL=off` e compara com `===` e `?key=` direto (`src/app/api/health/route.ts:13-16`): reutilizar `rejectUnlessCronAuthorized`. Esforço P.
**B2.** `audit_log` com 0 linhas: nenhuma ação administrativa (aprovação em bloco, troca de URL de afiliado, exclusão de vendedor) deixa trilha em banco. Hoje a trilha são os NDJSON em `docs/backups`. Gravar uma linha por ação de admin. Esforço M.
**B3.** CSP só em Report-Only para o essencial (`script-src` com `'unsafe-inline'` ainda aceito) e HSTS sem `preload`. Risco baixo porque não há `dangerouslySetInnerHTML` e o React escapa títulos de terceiros. Promover para enforce depois de olhar o console; nonce por requisição. Esforço G. **P2.**
**B4.** `profiles` tem 8 linhas e `auth.users` 1: 7 perfis sem usuário de autenticação (5 sellers e 2 customers, resíduo de seed). Inofensivo por RLS, mas confunde `/admin/usuarios`. Limpar com backup. Esforço P.
**B5.** Cópias de ambiente em disco: `backup/.env.projeto-antigo`, `backup/env.local.antes-merge-2026-11-11` (contêm service role, URLs do banco, token do Vercel OIDC) e `.env.local`, tudo fora do git mas na mesma pasta de trabalho, em PC com vários agentes. Apagar as cópias antigas e rotacionar o que estiver nelas. Esforço P.
**B6.** `docs/backups` e logs locais não rastreados (`build.log`, `.next-start.log`, `--out`): conferido, sem padrão de segredo. Manter fora do commit; `--out` (arquivo criado por engano na raiz) pode ser apagado.

---

## 2. Segredos: o que foi procurado e o que apareceu

Busca com padrões (JWT `eyJ…`, `sb_secret_/sb_publishable_`, `postgres://usuário:senha@`, token de bot `NNN:AA…`, hex longo atribuído a `token/secret`, `AKIA`, `ghp_`, `sk-`, `?key=<valor>`), em arquivos rastreados e no histórico:

- Nenhum segredo real em arquivo rastreado. `.env.local` e `.env*` estão no `.gitignore` e nunca entraram no histórico (nenhum `.env`, `.pem` ou credencial adicionado em 532 commits; só `.env.example`).
- `postgres://postgres:<placeholder>@localhost` em `src/lib/db/index.ts:9` e `scripts/dedup-existing-master-products.ts:20` (fallback local, senha de exemplo) e citação em `docs/relatorio-qa-final-2026-10-31.md:97` (texto do relatório de busca). Sem credencial real.
- Hex longo em `docs/backups/limpar-cupons-promocoes-amazon-2026-11-13T00-45-35-340Z.ndjson`, `docs/linha-base-gamer-*.json` e `docs/termos-shopee-2026-11-10/integracao-proposta-NAO-ADOTADA.md`: parecem hash/ID de linha base (não atribuídos a token/secret); não são credenciais.
- `public/loops/*.js` e `scripts/chrome/*.js`: recebem o token em `window.__MLL_CFG`/`__AMZA_CFG`, apagam o objeto e guardam na closure (padrão correto); os `docs/amazon-assistida-loop.md` e `ml-links-ui.js:7-9` só citam `'...'`/`<AMAZON_INGEST_TOKEN>` como marcador.
- Risco residual de operação (não de commit): o token passa pelo `evaluate`/log da sessão do agente e pode ficar em transcript de conversa. Mitigação: rotacionar `AMAZON_INGEST_TOKEN` após cada campanha longa e nunca colar token em prompt (usar a variável de ambiente do navegador).
- Na Vercel: segredos de integração (Shopee, tokens de ingest, bot) estão `Sensitive`; a service role e as `NEXT_PUBLIC_*` estão `Non-sensitive` (M3).
- Não encontrados na Vercel: `TELEGRAM_WEBHOOK_SECRET` (a rota do webhook falha fechada, ou seja, o webhook do bot está inativo), `COUPON_INGEST_TOKEN`, `COLLECTOR_ALERTS`, `TELEGRAM_ALERT_CHAT_ID`, `CRON_ACEITA_KEY_NA_URL`.

---

## 3. Superfície pública: o que foi verificado

- RLS (SELECTs em `pg_class`/`pg_policies`/`role_table_grants`): 102 de 102 tabelas com RLS; 0 política; 0 GRANT para `anon`/`authenticated`. Equivalente ao `scripts/rls-testar-anon.ts` (que continua sendo a verificação ao vivo via PostgREST): chave anônima não acessa nenhuma tabela. `sql.raw/unsafe`: 69 usos, listas de id validadas por UUID (revisão de 2026-11-14 mantida).
- Admin: `src/app/admin/layout.tsx` chama `requireAdmin()`; `proxy.ts` é só barreira barata. Das 22 arquivos de Server Actions, os que não chamam `requireAdmin` são de usuário final (`cart`, `notification-preferences`, `price-watches`, `telegram-link`, `conta/actions`), com `getUser` na própria ação ou sem escrita fora do dono do dado (conferir `cart.ts` e `price-watches.ts` com teste negativo de IDOR: P2).
- Comissão prevista: fica em `src/lib/admin-gestao/taxas-comissao.ts` e `admin-comissao.ts`, consumidos só por `/admin`; as únicas colunas de comissão no banco são `affiliate_conversions`, `sellers`, `order_items` e `shopee_campaigns`, nenhuma em consulta pública (varredura por importadores fora de `src/app/admin`: só `affiliate-reports/*` e `affiliate-conversions.ts`, que são de cron/admin). O teste `scripts/test-comissao-admin.ts` existe; a exposição real é o código-fonte público (A7).
- Cabeçalhos: HSTS 1 ano, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP parcial enforce (B3). `/loops` com `Access-Control-Allow-Origin: *` por desenho (scripts sem credencial).
- XSS: nenhum `dangerouslySetInnerHTML` em `src`; React escapa títulos; mensagens do Telegram escapam `&<>` em `parse_mode HTML`. Busca: `q` truncada em 80 caracteres e parametrizada.
- Redirecionamento: `/go/[slug]` e `/g/[code]` resolvem o destino no banco (não há open redirect); link pendente não redireciona (1.061 ofertas ML ativas estão com `affiliate_link_pending` e portanto não geram comissão: **receita parada**, ver 4).

---

## 4. Integridade de preço, afiliado e qualidade de dados (números)

- Ofertas ativas e não em quarentena: Mercado Livre 24.443 (1.061 com link de afiliado pendente: sem comissão, sem clique), Shopee 4.073, Amazon 2.801. Nenhuma `affiliate_url` ativa sem marca de afiliado reconhecível (regex de `matt_tool/tag=/s.shopee/amzn.to/meli.la/...`): 0 em todas as redes.
- ML com checagem velha: 303 ofertas com `last_checked_at` > 24 h e 748 > 6 h. Shopee: 81 e 87. Amazon: 1.968 e 2.626. A vitrine filtra por frescor; o risco é descobrir preço errado no clique.
- Mensagens (7 dias): 6.242 enviadas (só Telegram), 22.721 expiradas, 1.101 propostas, 761 propostas automáticas, 223 retidas, 57 erro, 2 rejeitadas. Divergência entre preço da mensagem e recheck ao vivo: 13 de 6.242 acima de 5% e 20 com `recheck_divergence_pct` nulo; a conferência ao vivo cobre ~1.516 das 6.242 (24%). Divergência mensagem x site é baixa, mas a cobertura do recheck precisa subir antes da BF.
- Master sem veredito: `game_edition_type` nulo ou `nao_identificado` = 0. Fila de identidade: 1.169 itens `pending`, 2.421 resolvidos, 483 auto. A fila pendente é o estoque de dúvida do catálogo.
- Produtos de risco e preços absurdos: A4.
- Duplicatas: 3.806 masters com 1 oferta e 1.848 com 2; não medi duplicata de master (assunto do painel de catálogo).

---

## 5. Disponibilidade e continuidade

- Pontos únicos de falha: (1) PC do dono com Chrome aberto e abas logadas (loops ML-links, cupons, Amazon): `cupons-assistida` 22 runs, `ml-links-assistida` 573, `amazon-assistida` 474 em 24 h; se o PC dorme, três frentes param e hoje sem alerta (A1); (2) uma conta logada na Amazon/ML/Shopee (A6); (3) Telegram: um bot, um canal, sem fallback (6.242 mensagens/semana); (4) Supabase com `max_connections = 60` e `statement_timeout = 40 s`; `idle_in_transaction_session_timeout = 180 s` já limpa transações presas (1 `idle in transaction` hoje); (5) Vercel Cron como único agendador oficial e um segundo, desconhecido (A8).
- Shopee 10030 e 429: `cobertura-shopee` 9 erros em 31 execuções nas últimas 24 h (já virou `partial` no código, mas o dado histórico do dia ainda conta como erro); 29 runs com limite de taxa em 24 h.
- Vercel "Sensitive" que scripts locais não leem: aceito como desenho (impede o agente de ver a chave da Shopee); o custo é que diagnósticos de API ao vivo dependem do dono ou de rota de cron; registrar em `docs/` quais scripts exigem Vercel.
- Falha do deploy: a Vercel mantém o último bom, mas quem corrige algo urgente na BF pode ficar travado por erro de build (M6).

---

## 6. Processos

- Aprovação ampla com backup: a prática (NDJSON + log + `--rollback`) é boa e consistente em `scripts/aplicar-*`. Lacuna: não há teste automático de rollback (restaurar de fato num banco de teste) e o backup fica no repositório público (A7).
- Drift código x banco: 19 linhas em `__drizzle_migrations` para ~52 migrations; aplicação por script; `0021_affiliate_conversions.PENDING.sql` ainda pendente. Sugestão: tabela `schema_ledger` própria, preenchida por cada script de migração, e `npm run db:check` que compara com os arquivos.
- Ambiente local x produção: `.env.local` só tem 8 chaves; segredos de integração só existem na Vercel (Sensitive), então scripts locais não reproduzem produção; rodar contra produção real exige DATABASE_URL de produção no PC (M7: sem TLS).

---

## 7. Plano priorizado

**P0, antes da Black Friday (27/11), começando agora**
1. A7: tornar o repositório privado e tirar `docs/backups`, estratégia e e-mail do alcance público. (P)
2. A1: criar chat de alerta e setar `COLLECTOR_ALERTS=1` e `TELEGRAM_ALERT_CHAT_ID`; testar. (P)
3. A2: confirmar plano/PITR no Supabase, `pg_dump` noturno para fora da máquina e um teste de restauração. (M)
4. A5: texto de transparência em Sobre/Termos/rodapé e linha padrão nas mensagens do canal; levar ao dono como mitigação que não recoloca o aviso nos cards. (P)
5. A4: quarentena em lote (com backup) dos 51 preços > R$ 30.000, 12 < R$ 5 e 98 itens de games com termos de risco; teto absoluto por vertical. (M)
6. A8: achar e desligar o segundo disparador do `collect-prices`; depois `CRON_ACEITA_KEY_NA_URL=off`. (P a M)
7. A3: `next@16.4.6`, `sharp`, `zod`; build e testes. (M)

**P1, até a BF ou logo depois**
8. M6: CI com typecheck + build + regra de fronteira cliente/servidor. (M)
9. M1: saneador de `running` presos e orçamento de tempo a 80% do `maxDuration`. (M)
10. M2 e M3: token por rede, service role como Sensitive, tirar produção do escopo Preview. (M)
11. M4: regras de firewall adicionais e dedupe de clique; plano de "modo ataque" para a BF. (M)
12. M8 e M9: política de cookies/retenção e matriz de termos por rede. (M)
13. A6: decisão do dono sobre a raspagem da Amazon e plano de migração para API oficial. (G)

**P2, depois da BF**
14. M5 (safe fetch), M7 (TLS), B2 (audit_log), B3 (CSP enforce com nonce), teste negativo de IDOR em carrinho e alertas de preço, ledger de migrações, B4 a B6.

---

Arquivos centrais citados: `src/lib/auth/require-admin.ts`, `src/lib/auth/cron-auth.ts`, `src/server/coupons/ingest-guard.ts`, `src/app/api/health/route.ts`, `src/proxy.ts`, `next.config.ts`, `vercel.json`, `src/lib/db/index.ts`, `src/server/collector/price-plausibility.ts`, `src/server/queries/departamento.ts`, `src/server/observability/collector-health.ts`, `src/lib/admin-gestao/taxas-comissao.ts`, `src/app/(shop)/privacidade/page.tsx`, `src/app/(shop)/termos/page.tsx`, `src/app/(shop)/sobre/page.tsx`, `scripts/rls-testar-anon.ts`.
