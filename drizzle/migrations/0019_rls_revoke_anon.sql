-- =============================================================================
-- EG-07 / N1  -  RLS ligado + REVOKE de anon/authenticated no schema public
-- STATUS: NAO APLICADA. Arquivo fora de meta/_journal.json de proposito: o
-- `drizzle-kit migrate` NAO a executa. Aplique manualmente seguindo
-- docs/seguranca-rls-plano.md.
--
-- Fatos levantados por SELECT (2026-10-31):
--   * 78 tabelas em public, todas com RLS desligado, 0 policies;
--   * anon e authenticated tem SELECT/INSERT/UPDATE/DELETE/TRUNCATE/... em
--     TODAS as 78 (default privileges do Supabase) + grants em sequences;
--   * o app acessa o banco so por Drizzle como role `postgres` (dono das tabelas,
--     BYPASSRLS=true) via DATABASE_URL (pooler 6543): RLS e GRANT de anon nao o afetam;
--   * os clientes Supabase do codigo (client.ts, server.ts, middleware.ts) so usam
--     `supabase.auth.*` (login, sessao, reset de senha); nenhum `.from()`, `.rpc()`
--     ou `.storage` em src/. `createSupabaseAdminClient` (service_role) nao e usado.
--   Logo, nenhuma tabela precisa de acesso via PostgREST: revoga-se TUDO de
--   anon/authenticated (inclusive SELECT) e liga-se RLS sem policies (default deny,
--   defesa em profundidade se alguem regrant). service_role e postgres seguem com acesso.
--
-- Se um dia o front passar a ler uma tabela via supabase-js, crie GRANT SELECT
-- + policy de SELECT especifica nessa tabela (nunca escrita).
-- =============================================================================

BEGIN;

-- 1) RLS em todas as tabelas de public + REVOKE de tudo para anon/authenticated
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon, authenticated', t.schemaname, t.tablename);
  END LOOP;
END $$;

-- 2) Sequences e funcao propria (trigger function; o disparo do trigger nao depende desse EXECUTE)
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;

-- 3) Objetos CRIADOS NO FUTURO nao devem nascer com grant para anon/authenticated
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- supabase_admin: pode exigir privilegio; se falhar, remova estas 3 linhas.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 4) Verificacao dentro da transacao: aborta (ROLLBACK) se sobrar grant ou tabela sem RLS
DO $$
DECLARE n_priv int; n_norls int;
BEGIN
  SELECT count(*) INTO n_priv FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
  SELECT count(*) INTO n_norls FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF n_priv <> 0 OR n_norls <> 0 THEN
    RAISE EXCEPTION 'Verificacao falhou: grants restantes=%, tabelas sem RLS=%', n_priv, n_norls;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- ROLLBACK (rode manualmente se algo quebrar; restaura o estado anterior do Supabase)
-- =============================================================================
-- BEGIN;
-- DO $$
-- DECLARE t record;
-- BEGIN
--   FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
--     EXECUTE format('GRANT ALL ON TABLE %I.%I TO anon, authenticated', t.schemaname, t.tablename);
--   END LOOP;
-- END $$;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
-- COMMIT;
