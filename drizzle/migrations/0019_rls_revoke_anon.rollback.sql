-- Rollback da 0019_rls_revoke_anon.sql. Restaura o estado original do Supabase
-- (RLS desligado, GRANT ALL para anon/authenticated). REABRE a exposicao via PostgREST:
-- use so para diagnostico/emergencia. Idempotente.
-- Nota: nao desfaz o REVOKE ja existente nas tabelas da 0022 se voce quiser mante-las fechadas:
-- apos rodar, re-execute `REVOKE ALL ON TABLE product_price_stats, showcase_snapshot FROM anon, authenticated;`
-- (a 0022 ja nasceu fechada; este rollback as reabre junto com as demais).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('GRANT ALL ON TABLE %I.%I TO anon, authenticated', t.schemaname, t.tablename);
  END LOOP;
END $$;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
