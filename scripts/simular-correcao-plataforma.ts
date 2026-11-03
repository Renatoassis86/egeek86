/** Simulação (somente leitura): jogos cuja plataforma do cadastro difere da citada no título. Gera CSV e a lista de pares para o --apply. */
import fs from 'node:fs';
import { derivePlatformFromTitle } from '../src/lib/affiliate/game-classification';
import { mentionsMultipleGenerations } from '../src/lib/affiliate/dedup';
import { classifyCatalogItem } from '../src/lib/catalog/dimensions';
import { connect } from './_dup-shared';
(async () => {
  const sql = connect();
  const rows = await sql`select m.id, m.name, m.game_platform_gen::text gen,
      (select count(*) from affiliate_offers o where o.master_product_id=m.id and o.status='active') ativas
    from master_products m where m.product_type='game' and (m.attributes->>'mergedInto') is null`;
  const out: string[] = ['id;nome;plataforma_atual;plataforma_pelo_titulo;ofertas_ativas'];
  const fix: Array<{ id: string; from: string; to: string }> = [];
  for (const r of rows) {
    const t = derivePlatformFromTitle(r.name as string);
    const ambiguo = mentionsMultipleGenerations(String(r.name)) || /(one|360).*(series|x)|one.*\/.*series|ps4.*ps5|ps5.*ps4/i.test(String(r.name));
    const soJogo = classifyCatalogItem(String(r.name), 'game').dimension === 'game';
    if (t !== 'unknown' && t !== r.gen && r.gen !== 'unknown' && !ambiguo && soJogo) {
      out.push([r.id, `"${String(r.name).replace(/"/g, "'")}"`, r.gen, t, r.ativas].join(';'));
      fix.push({ id: r.id as string, from: r.gen as string, to: t });
      console.log(`${String(r.name).slice(0, 62).padEnd(62)} | ${r.gen} -> ${t} | ativas ${r.ativas}`);
    }
  }
  fs.writeFileSync('docs/correcao-plataforma-simulacao-2026-11-01.csv', out.join('\n'), 'utf8');
  fs.writeFileSync('backup/dados/correcao-plataforma-2026-11-01.json', JSON.stringify(fix, null, 1), 'utf8');
  console.log('\ntotal a corrigir:', fix.length);
  await sql.end();
})();
