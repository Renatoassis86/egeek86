/** Estado RLS/grants (SOMENTE LEITURA). npx tsx --env-file=.env.local scripts/rls-estado.ts */
import { connect } from './_dup-shared';

async function main() {
  const sql = connect();
  try {
    const [who] = await sql`select current_user u, (select rolbypassrls from pg_roles where rolname=current_user) bypass`;
    console.log('role', who);
    const tabs = await sql`
      select count(*)::int total, count(*) filter (where c.relrowsecurity)::int com_rls, count(*) filter (where not c.relrowsecurity)::int sem_rls
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')`;
    console.log('tabelas', tabs[0]);
    const sem = await sql`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity order by 1`;
    console.log('sem RLS:', sem.map((r) => r.relname).join(', ') || '(nenhuma)');
    const pol = await sql`select schemaname, tablename, policyname, cmd, roles from pg_policies where schemaname in ('public') order by 2,3`;
    console.log('policies public:', pol.length, pol.slice(0, 40));
    const g = await sql`select grantee, count(*)::int n, count(distinct table_name)::int tabelas from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') group by 1`;
    console.log('grants tabela', g);
    const gs = await sql`select grantee, count(*)::int n from information_schema.role_usage_grants where object_schema='public' and grantee in ('anon','authenticated') group by 1`;
    console.log('usage grants (sequences)', gs);
    const fn = await sql`
      select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) owner, has_function_privilege('anon', p.oid,'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid,'EXECUTE') auth_exec
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and pg_get_userbyid(p.proowner)<>'supabase_admin' order by 1`;
    console.log('funcoes public', fn);
    const trg = await sql`
      select t.tgname, c.relname tabela, p.proname fn, p.prosecdef secdef, pg_get_userbyid(p.proowner) owner
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
      where not t.tgisinternal and n.nspname in ('auth') order by 1`;
    console.log('triggers em auth.*', trg);
    const dp = await sql`select pg_get_userbyid(defaclrole) role, defaclobjtype, defaclacl::text acl from pg_default_acl order by 1,2`;
    console.log('default privileges', dp);
    const ext = await sql`select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname in ('pg_trgm','unaccent')`;
    console.log('ext', ext);
    const objs = await sql`select to_regclass('public.master_products_search_norm_trgm_idx') idx, to_regprocedure('public.egeek_search_norm(text)') fn, to_regclass('public.affiliate_conversions') conv`;
    console.log('0020/0021 existentes?', objs[0]);
    const cnt = await sql`select (select count(*) from public.master_products)::int masters, (select count(*) from public.affiliate_offers)::int offers`;
    console.log('contagens', cnt[0]);
    const cols = await sql`select table_name from information_schema.tables where table_schema='public' and table_name in ('profiles','carts','cart_items','messages','orders','favorites','watchlist')`;
    console.log('tabelas sensiveis presentes', cols.map((r) => r.table_name));
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
