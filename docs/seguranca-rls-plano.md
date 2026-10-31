# Plano de RLS e REVOKE (EG-07 / N1)

Migration: `drizzle/migrations/0019_rls_revoke_anon.sql` (NÃO aplicada; fica fora do `_journal.json`, então `drizzle-kit migrate` não a executa).

## O problema (medido por SELECT em 2026-10-31)
- 78 tabelas em `public` com RLS desligado e 0 policies.
- `anon` e `authenticated` têm SELECT, INSERT, UPDATE, DELETE e TRUNCATE em todas as 78 (default privileges do Supabase).
- A chave anon é pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Se o schema `public` estiver exposto no PostgREST (padrão), qualquer pessoa lê e escreve `profiles` (inclusive `role`), `affiliate_offers`, `news_articles` etc. sem passar pelo app.
- Escrita não foi testada; a exposição é inferida dos privilégios.

## Por que a migration não quebra o app
- O app usa Drizzle como role `postgres` (dono das tabelas, BYPASSRLS) pelo pooler 6543. RLS e grants de anon não o afetam.
- Os clientes Supabase do código só usam `supabase.auth.*` (login, sessão, reset de senha): `src/lib/supabase/{client,server,middleware}.ts` e as páginas entrar, login, esqueci-senha, redefinir-senha. Nenhum `.from()`, `.rpc()` ou `.storage` em `src/`. O cliente `service_role` existe, mas ninguém o usa.
- Por isso a migration revoga tudo (inclusive SELECT) de anon/authenticated e liga RLS sem policies. O schema `auth` não é tocado.

## Passo a passo
1. Backup: `backup/exportar.mjs`.
2. Aplicar primeiro num branch/projeto de teste do Supabase. Sem branch, em produção fora do pico (a migration é rápida e transacional).
3. SQL Editor do Supabase: colar `0019_rls_revoke_anon.sql` e executar. Há uma verificação interna que aborta (rollback automático) se sobrar grant ou tabela sem RLS. Se o bloco `supabase_admin` der permissão negada, remova essas 3 linhas e repita.
   Alternativa: `psql "$DIRECT_URL" -f drizzle/migrations/0019_rls_revoke_anon.sql` (conexão direta 5432).
4. Painel Supabase, Settings > API > Exposed schemas: remover `public`. Defesa independente da migration.

## Como testar
Com a chave anon (não cole a chave em canais compartilhados):
- `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`: antes devolve dados; depois deve dar 401/403 (permission denied) ou erro de schema não exposto.
- Escrita: PATCH em `master_products?id=eq.00000000-0000-0000-0000-000000000000` com a chave anon deve dar 401/403 (id inexistente; não altera nada).
- SQL: `select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated');` = 0, e nenhuma tabela de `public` com `relrowsecurity = false`.
- App: `/`, `/ofertas`, `/ofertas/<slug>`, `/monitoramento`, `/tabela-de-precos`; login em `/entrar`, `/conta`, watchlist, `/admin` como admin; `GET /api/cron/collect-prices` com `Authorization: Bearer $CRON_SECRET`; `npm run build`.

## Rollback
Bloco comentado no fim da migration (DISABLE RLS + GRANT ALL). Reabre a exposição; use só para diagnóstico.

## Riscos
- Baixo: qualquer cliente fora do repositório (app mobile, script externo, job pg_net) que use a chave anon para ler tabelas passará a falhar. Nada disso aparece no código; confirme que não existe.
- Tabelas futuras: os `ALTER DEFAULT PRIVILEGES` evitam que nasçam abertas; mesmo assim, toda migration nova deve incluir `ENABLE ROW LEVEL SECURITY`.
- Se um dia houver leitura pública via supabase-js: GRANT SELECT + policy de SELECT por tabela; nunca escrita.

## Ações do dono (não automatizáveis)
- Trocar a senha do admin e ativar MFA para admin/super_admin.
- Rotacionar: as 2 senhas de banco que estiveram versionadas (projetos `sdrj...` e `ynqu...`) e, por precaução, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e o client secret do Mercado Livre.
- Definir `MELI_WEBHOOK_SECRET` na Vercel e trocar a URL do webhook no painel do ML para `https://egeek86.com/api/webhooks/mercadolivre?key=<segredo>`. Sem a variável, o webhook valida só o `application_id` (MERCADO_LIVRE_CLIENT_ID).
