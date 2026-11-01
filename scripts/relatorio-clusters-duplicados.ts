/** Relatório somente leitura: clusters de masters duplicados com oferta ativa, com sugestão de canônico. */
import fs from 'node:fs';
import { analyzeDuplicates, pickCanonical } from '../src/lib/affiliate/dedup';
import { connect, loadMasterRows } from './_dup-shared';

(async () => {
  const sql = connect();
  const rows = await loadMasterRows(sql);
  const a = analyzeDuplicates(rows);
  const out: string[] = ['tipo;cluster;papel;id;nome;plataforma_db;ofertas_ativas;ofertas_total;cotacoes'];
  let n = 0;
  const relevant = a.reviewClusters.filter((c) => c.members.filter((m) => m.activeOffers > 0).length >= 2 && c.kind !== 'non_game_exact');
  for (const c of relevant) {
    n++;
    const canon = pickCanonical(c.members);
    for (const m of c.members) {
      out.push([c.kind, n, m.id === canon.id ? 'CANONICO_SUGERIDO' : 'arquivar', m.id, `"${m.name.replace(/"/g, "'")}"`, m.gamePlatformGen, m.activeOffers, m.totalOffers, m.snapshots].join(';'));
    }
  }
  fs.writeFileSync('docs/duplicados-clusters-para-revisao-2026-11-01.csv', out.join('\n'), 'utf8');
  console.log(`clusters com 2+ masters com oferta ativa: ${relevant.length}`);
  const byKind: Record<string, number> = {};
  for (const c of relevant) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  console.log(JSON.stringify(byKind));
  for (const c of relevant.slice(0, 14)) {
    const canon = pickCanonical(c.members);
    console.log(`\n[${c.kind}] ${c.note.slice(0, 80)}`);
    for (const m of c.members) console.log(`  ${m.id === canon.id ? '★' : ' '} ${m.name.slice(0, 70)} | ${m.gamePlatformGen} | ofertas ativas ${m.activeOffers} | cot ${m.snapshots}`);
  }
  await sql.end();
})();
