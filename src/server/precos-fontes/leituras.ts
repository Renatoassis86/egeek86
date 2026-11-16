import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { LeituraExterna } from '@/lib/precos-fontes/resolver';

/** Leituras externas mais recentes (por ASIN e fonte) das ultimas 3 h. Tabela ausente (migration 0065 nao aplicada) ou erro = mapa vazio (so Chrome). */
export async function leiturasExternasPorAsin(asins: string[]): Promise<Map<string, LeituraExterna[]>> {
  const out = new Map<string, LeituraExterna[]>();
  const lista = [...new Set(asins.filter((a) => /^[A-Z0-9]{10}$/.test(a)))];
  if (!lista.length) return out;
  try {
    const rows = (await db.execute(sql`
      SELECT DISTINCT ON (asin, fonte) asin, fonte, preco_cents::text AS p, pix_cents::text AS px, disponivel, lido_em
      FROM amazon_leituras_preco
      WHERE asin IN (${sql.join(lista.map((a) => sql`${a}`), sql`, `)}) AND lido_em > now() - interval '3 hours'
      ORDER BY asin, fonte, lido_em DESC`)) as unknown as { asin: string; fonte: 'creators_api' | 'keepa'; p: string | null; px: string | null; disponivel: boolean; lido_em: Date | string }[];
    for (const r of rows) {
      const arr = out.get(r.asin) ?? [];
      arr.push({ fonte: r.fonte, precoCents: r.p != null ? Number(r.p) : null, pixCents: r.px != null ? Number(r.px) : null, lidoEm: new Date(r.lido_em), disponivel: r.disponivel });
      out.set(r.asin, arr);
    }
  } catch { /* sem tabela/sem leitura: cai na camada do Chrome */ }
  return out;
}

export async function gravarLeituras(ls: Array<LeituraExterna & { asin: string }>): Promise<number> {
  let n = 0;
  for (const l of ls) {
    await db.execute(sql`INSERT INTO amazon_leituras_preco (asin, fonte, preco_cents, pix_cents, disponivel, lido_em) VALUES (${l.asin}, ${l.fonte}, ${l.precoCents}, ${l.pixCents}, ${l.disponivel !== false}, ${l.lidoEm.toISOString()}::timestamptz)`);
    n++;
  }
  return n;
}
