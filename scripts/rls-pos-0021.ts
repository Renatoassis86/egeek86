import { connect } from './_dup-shared';
(async () => {
  const sql = connect();
  try {
    const r = await sql`select c.relrowsecurity rls, (select count(*)::int from information_schema.role_table_grants g where g.table_name='affiliate_conversions' and g.grantee in ('anon','authenticated')) grants_anon from pg_class c where c.oid='public.affiliate_conversions'::regclass`;
    console.log('affiliate_conversions', r[0]);
    const t = await sql`select (select count(*)::int from affiliate_conversions) conv`;
    console.log('postgres le conversions:', t[0]);
    // escrita real sob postgres, desfeita
    try {
      await sql.begin(async (tx) => {
        await tx`insert into affiliate_conversions (source, network_slug, external_id) values ('ml_csv','teste','__rls_teste__')`;
        const [x] = await tx`select count(*)::int n from affiliate_conversions`;
        console.log('postgres insere (dentro de tx desfeita): linhas =', x.n);
        const [p] = await tx`update profiles set role = role where id = (select id from profiles limit 1) returning 1 as ok`;
        console.log('postgres atualiza profiles (no-op, desfeito):', p ? 'ok' : 'nenhuma linha');
        throw new Error('desfazer');
      });
    } catch (e) { if (!(e instanceof Error && e.message === 'desfazer')) throw e; }
    const [after] = await sql`select count(*)::int n from affiliate_conversions`;
    console.log('linhas depois do teste desfeito:', after.n);
  } finally { await sql.end(); }
})();
