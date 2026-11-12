/** Sonda de dominios ML para calcados (somente leitura, ~8 chamadas; token nao e impresso): npx tsx --conditions=react-server --env-file=.env.local scripts/medir-dominios-calcado-ml.ts */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
async function main() {
  const rows = await db.execute<{ value: { accessToken?: string; expiresAt?: number } }>(sql`select value from system_config where key='mercado_livre_oauth' limit 1`);
  const t = rows[0]?.value?.accessToken;
  if (!t) throw new Error('sem token');
  for (const q of ['chinelo nike', 'sandalia adidas', 'sapatilha ciclismo', 'chuteira nike', 'tenis corrida asics', 'bota trilha', 'sapato esportivo', 'chinelo slide']) {
    const r = await fetch(`https://api.mercadolibre.com/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=50`, { headers: { Authorization: `Bearer ${t}` } });
    const j: any = await r.json();
    const c: Record<string, number> = {};
    for (const p of j.results ?? []) c[p.domain_id ?? '?'] = (c[p.domain_id ?? '?'] ?? 0) + 1;
    console.log(q.padEnd(24), r.status, JSON.stringify(c));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
