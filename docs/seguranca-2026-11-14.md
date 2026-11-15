# Segurança D1 e D3 (2026-11-14)

Escopo: C8 do checklist (cabeçalhos e revisão de todas as rotas em `src/app/api`). Nada foi escrito em produção.

## D1. Cabeçalhos (`next.config.ts`)
Aplicados a todas as rotas (`/:path*`):
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` (sem `preload`, de propósito).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (câmera, microfone, geolocalização, pagamento e USB desligados).
- **CSP aplicada (enforce), só o que não quebra nada:** `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`.
- **CSP completa em Report-Only:** `default-src 'self'`; `script-src 'self' 'unsafe-inline'` (+ `'unsafe-eval'` só fora de produção); `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob: https:`; `font-src 'self' data:`; `connect-src 'self' https://*.supabase.co wss://*.supabase.co`; `media-src`; `form-action 'self'`.
- Base: o código não carrega script, iframe nem fonte de terceiros (fontes via `next/font`, imagens remotas de lojas em qualquer https, Supabase no navegador). O Telegram é chamado só pelo servidor.
- Os cabeçalhos antigos de `/images` e `/loops` continuam; `/loops` mantém `Access-Control-Allow-Origin: *` (scripts sem credenciais, o token vem do bootstrap do dono).

**Para endurecer depois (não feito):** tirar `'unsafe-inline'` do `script-src` exige nonce por requisição (proxy + `headers()` dinâmico). Promover a CSP de Report-Only para enforce só depois de olhar o console em `?v=2`, Plus, login e /admin.

## D3. Revisão das 39 rotas
**Estado bom (sem mudança):**
- `/api/cron/*` (22): todas passam por `rejectUnlessCronAuthorized` (falha fechada sem `CRON_SECRET`); `loja-teste` tem chave própria com `timingSafeEqual`.
- `/api/admin/*` (5): `getCurrentProfile` + 401.
- `/api/ingest/*` (7): token dedicado (>= 32 caracteres, `timingSafeEqual`) e origem por rede (`couponGuard`/`ingest-guard`).
- `/api/webhooks/mercadolivre`: Bearer com `timingSafeEqual`. `/api/monitoramento/watchlist`: exige usuário logado.
- Rotas públicas (`produtos/[id]/grafico|lojas`, `search`, `search/insights`, `monitoramento/search`) só leem; `grafico` valida UUID e cacheia resposta negativa.
- SQL: consultas parametrizadas pelo drizzle. Os `sql.raw` com listas de ids (`aprovacao.ts`, `owner-blocks.ts`, `queue.ts`) só recebem UUID validado (`parseKey` com regex de UUID) ou ids filtrados por `[^0-9a-f-]`. Os demais `sql.raw` são constantes numéricas do código.
- `public/`: nenhum segredo (busca por chaves, tokens, URLs de banco). Variáveis `NEXT_PUBLIC_*`: só URL do app e URL/chave anônima do Supabase (públicas por desenho).

**Corrigido:**
1. `src/lib/auth/cron-auth.ts`: comparação do segredo (Bearer e `?key=`) agora em tempo constante (antes `===`). Testado (6 casos).
2. `src/app/api/webhooks/telegram/route.ts`: falha fechada sem `TELEGRAM_WEBHOOK_SECRET` e comparação em tempo constante.
3. Respostas de erro dos crons (`ampliar-amostra-shopee`, `aprovacao-auto`, `cobertura-shopee`, `import-shopee-conversions`, `semear-vertical`, `refresh-snapshots`): deixam de devolver `e.message` ao cliente; o erro vai para o log do servidor e a resposta é genérica (`falha`).
4. `src/app/api/monitoramento/price-history/route.ts`: `masterProductId` agora exige UUID (antes qualquer texto chegava ao banco e virava erro 500).

**Pendências (precisam de decisão):**
- **Chave na URL dos crons (`?key=<CRON_SECRET>`):** o segredo vai para logs de acesso e histórico. Existe só pelo job pg_net antigo. Recomendo migrar o pg_net para `Authorization: Bearer` e remover o `?key=`.
- **Limite de requisições (D2, não autorizado):** rotas públicas de leitura e `search` não têm rate limit; hoje só o cache de CDN protege.
- **`loja-teste`** devolve mensagens de erro de propósito (diagnóstico com chave própria): manter ou remover depois da Black Friday.
- **Rotação de segredos:** o token do `__MLL_CFG` passa por scripts do dono; trocar `INGEST_TOKEN`/`CRON_SECRET` periodicamente.

## Rodada R2 (dono, 2026-11-14): infraestrutura e segurança

**R2-7, cobertura da Shopee com cota própria e espaçada.** Medido: o `collect-shopee` ocupa cerca de 4 dos 5 minutos de cada tick (244 s em média, 165 chamadas) e a cobertura batia no 10030 com 8 a 16 chamadas. Agora: (1) vercel.json roda a cobertura a cada 10 min (minutos 4, 14, ... 54) com `maxCalls=8` (antes: 22 e 52, 45 chamadas); (2) só roda na janela livre: se houver `collect-shopee` 'running' iniciado há menos de 6 min, a rodada espera (`parou='aguardando_coleta'`, sem API, sem cursor, sem linha de run); (3) a pausa depois de um 10030 caiu de 45 para 20 min; (4) o 10030 já fecha como `partial`. Teste: `scripts/test-shopee-cobertura.ts` (53/53). Reverter: voltar o cron para `22,52 * * * *` com `maxCalls=45`.

**R2-8, linhas presas do `refresh-snapshots:stats`.** 24 linhas (não 25) em 'running' sem `finished_at` desde 12/11 viraram 'error' com `stopped_because='timeout_antigo'`. Script `scripts/aplicar-limpeza-running-presos-2026-11-14.ts` (dry-run, backup NDJSON, log, `--rollback`). Backup: `docs/backups/limpeza-running-presos-2026-11-15T00-58-38-648Z.ndjson`. Depois: 0 presas, 0 'running' recentes tocadas.

**R2-9, `?key=` na URL do cron.** Achado: o banco NÃO tem `pg_cron` nem `pg_net` (extensões e esquemas `cron`/`net` inexistentes), então não há job pg_net para migrar dentro do Supabase; o disparador externo que ainda usa `?key=` é desconhecido (o histórico já mostra `collect-prices` rodando fora do vercel.json, pares :00 e :45). Os crons do vercel.json usam Bearer. O que fiz, sem janela sem cron: (1) cada uso de `?key=` agora gera `console.warn('[cron-auth] autorizado por ?key= (legado):', rota)` (só a rota, nunca o segredo), para achar o disparador; (2) chave `CRON_ACEITA_KEY_NA_URL=off` desliga o `?key=` sem deploy de código (padrão: continua aceitando). Teste: `scripts/test-cron-auth-key-legado.ts` (8/8). **Falta (decisão do dono):** achar o disparador pelo log (`vercel logs -q "cron-auth"`) e só então ligar `CRON_ACEITA_KEY_NA_URL=off`; desligar antes pode derrubar um cron externo desconhecido.

**R2-10, `loja-teste` e limite de requisições.** (1) Rota `/api/cron/loja-teste` removida (commit fd928fe, de outro agente, que a incluiu na varredura). (2) Firewall da Vercel, publicado em produção, duas regras de rate limit por IP, janela de 60 s, bloqueio de 1 min: `limite-api-publica` (120 req/min em `/api`, exceto `/api/ingest`, `/api/cron` e `/api/webhooks`) e `limite-paginas` (300 req/min nas páginas, exceto `/api`, `/_next`, `/loops`, `/images`, `/_vercel`, `/favicon`). Verificado ao vivo: `/`, `/ofertas` e `/contatos` 200; 200 requisições seguidas a `/api/ingest/*` sem nenhuma mitigação do firewall (os loops do Chrome com token não são limitados); `/api` passou a ser limitado depois de 120 req/min (1 resposta 429 e então bloqueio de 1 min do IP). Reverter: `vercel firewall rules remove limite-api-publica` e `limite-paginas`, depois `vercel firewall publish`.
