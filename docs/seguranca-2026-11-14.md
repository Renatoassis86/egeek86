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
