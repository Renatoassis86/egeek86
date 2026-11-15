/** R2-4/R2-12/R2-17: vendedor fraco fora só da média; Amazon implausível em quarentena; sem botões de canal no cabeçalho do departamento. */
import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { weakSellerSql } from '../src/server/queries/public-offers';
let falhas = 0;
const check = (ok: boolean, n: string) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}`); if (!ok) falhas++; };
async function main() {
  const dept = fs.readFileSync('src/app/(detalhe)/mercado/[vertical]/page.tsx', 'utf8');
  check(!/telegramUrl|whatsappUrl|canaisDaLoja/.test(dept), 'r2-17: cabeçalho do departamento sem Telegram/WhatsApp');
  const amz = fs.readFileSync('src/server/collector/amazon-assisted.ts', 'utf8');
  check(/quarentena_preco_baixo_demais/.test(amz) && !/preco_baixo_demais'\); log\.push[^;]*; continue; \}/.test(amz), 'r2-12: preço implausível vai para quarentena, não é descartado');
  const w = fs.readFileSync('src/server/pricing/weak-seller-avg.ts', 'utf8');
  check(/quarantined_at/.test(w) === false && /MOTIVO_VENDEDOR_FRACO/.test(w), 'r2-4: marca só a média, nunca quarentena');
  if (process.env.DATABASE_URL) {
    const r = await db.execute<{ n: number; vis: number }>(sql`
      SELECT count(*) FILTER (WHERE ${weakSellerSql('sel')} AND o.status='active' AND o.avg_excluded_at IS NULL)::int AS n,
             count(*) FILTER (WHERE ${weakSellerSql('sel')} AND o.status='active' AND o.avg_excluded_at IS NOT NULL AND o.quarantined_at IS NULL)::int AS vis
      FROM affiliate_offers o LEFT JOIN affiliate_sellers sel ON sel.id = o.seller_id`);
    check(Number(r[0]!.n) === 0, `r2-4: nenhuma oferta ativa de vendedor fraco dentro da média (${r[0]!.n})`);
    check(Number(r[0]!.vis) > 0, `r2-4: ofertas de vendedor fraco seguem ativas e visíveis (${r[0]!.vis})`);
  }
  console.log(falhas ? `${falhas} FALHAS` : 'OK');
  process.exit(falhas ? 1 : 0);
}
main();
export {};
