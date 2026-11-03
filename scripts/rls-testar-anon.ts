/** Testa o que a chave anon consegue via PostgREST. Imprime so status/contagem, nunca a chave nem dados. */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const H = { apikey: anon, Authorization: `Bearer ${anon}` };
const tables = ['profiles', 'carts', 'cart_items', 'orders', 'addresses', 'payments', 'affiliate_messages', 'system_config',
  'wishlists', 'telegram_link_tokens', 'master_products', 'affiliate_offers', 'affiliate_price_snapshots', 'news_articles',
  'product_price_stats', 'showcase_snapshot'];

async function main() {
  for (const t of tables) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
    let n = '';
    let code = '';
    if (r.ok) n = ' linhas visiveis=' + (r.headers.get('content-range') ?? '?');
    else { try { code = ' ' + ((await r.json()) as { code?: string }).code; } catch { /* */ } }
    console.log(`GET   ${t.padEnd(26)} -> ${r.status}${code}${n}`);
  }
  const w = await fetch(`${url}/rest/v1/master_products?id=eq.00000000-0000-0000-0000-000000000000`, {
    method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ name: 'x' }),
  });
  console.log(`PATCH master_products (id inexistente) -> ${w.status}`);
  const d = await fetch(`${url}/rest/v1/profiles?id=eq.00000000-0000-0000-0000-000000000000`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
  console.log(`DELETE profiles (id inexistente) -> ${d.status}`);
  const a = await fetch(`${url}/auth/v1/settings`, { headers: H });
  console.log(`GET   auth/v1/settings -> ${a.status}`);
  const s = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nao-existe@invalid.test', password: 'x' }) });
  console.log(`POST  auth token (credencial invalida; so prova que o Auth responde) -> ${s.status}`);
}
main();
