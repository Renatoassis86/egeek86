/**
 * SIMULACAO (DRY-RUN, SO LEITURA) do aumento da aprovacao das lojas Plus (dono, 2026-11-12).
 * Compara os criterios v2 (estritos) com os v3 (relaxados, flag APROVACAO_RELAXADA) sobre os masters em 'review' de cada vertical
 * (impressao3d usa avaliarImpressao3d, inalterado) e grava o PLANO em docs/backups/aprovacao-plus-plano-<ts>.json. Nao escreve no banco.
 *
 *   npx tsx --env-file=.env.local scripts/simular-aprovacao-plus.ts [--amostra 15]
 *
 * O plano tem tres grupos:
 *   aprovar      masters que passam hoje; origem 'ja_passava_v2' | 'relaxamento_v3' | 'confirmado_pelo_dono'
 *   fila         masters que so falham por motivo que uma resposta humana resolve: item para identity_review_items (continuam 'review')
 *   permanecem   o resto, com motivos (legitimo: usado, duplicado, sem foto, sem oferta clicavel...)
 * Aplicacao (com backup, transacao e rollback): scripts/aplicar-aprovacao-plus.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { CRITERIA_VERSION_V2, CRITERIA_VERSION_V3 } from '../src/lib/catalog/aprovacao-nicho';
import { carregarEAvaliar, type ItemPlano } from './_aprovacao-plus-shared';

const argv = process.argv.slice(2);
const AMOSTRA = Number(argv[argv.indexOf('--amostra') + 1]) || 15;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  const sql = connect();
  try {
    const todos = await carregarEAvaliar(sql);
    const resumo: Record<string, any> = {};
    for (const m of todos) {
      const R = (resumo[m.vertical] ??= { total: 0, aprovadosHoje: 0, review: 0, rejeitados: 0, aprovarJaPassava: 0, aprovarPorRelaxamento: 0, aprovarConfirmadoDono: 0, fila: 0, permanecem: 0, motivosPermanecem: {} as Record<string, number> });
      R.total++;
      if (m.verdictAntes === 'approved') R.aprovadosHoje++;
      else if (m.verdictAntes === 'rejected') R.rejeitados++;
      else {
        R.review++;
        if (m.destino === 'aprovar') R[m.origem === 'ja_passava_v2' ? 'aprovarJaPassava' : m.origem === 'relaxamento_v3' ? 'aprovarPorRelaxamento' : 'aprovarConfirmadoDono']++;
        else if (m.destino === 'fila') R.fila++;
        else { R.permanecem++; for (const z of m.motivosV3) R.motivosPermanecem[z] = (R.motivosPermanecem[z] ?? 0) + 1; }
      }
    }
    const aprovar = todos.filter((x) => x.destino === 'aprovar');
    const fila = todos.filter((x) => x.destino === 'fila');
    const permanecem = todos.filter((x) => x.destino === 'permanecem');
    const plano = { geradoEm: new Date().toISOString(), criteriosV2: CRITERIA_VERSION_V2, criteriosV3: CRITERIA_VERSION_V3, resumo, aprovar, fila, permanecem };
    const dir = path.resolve('docs/backups'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `aprovacao-plus-plano-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify(plano, null, 2));
    for (const [vert, R] of Object.entries(resumo)) console.log(vert.padEnd(18), JSON.stringify({ ...R, motivosPermanecem: undefined }));
    const mp: Record<string, Record<string, number>> = {}; for (const [vert, R] of Object.entries(resumo)) mp[vert] = R.motivosPermanecem;
    console.log('Motivos que permanecem:', JSON.stringify(mp));
    console.log(`Plano: ${path.relative(process.cwd(), f)} | aprovar=${aprovar.length} (relaxamento=${aprovar.filter((x) => x.origem === 'relaxamento_v3').length}) fila=${fila.length} permanecem=${permanecem.length}`);
    const rel = aprovar.filter((x) => x.origem === 'relaxamento_v3');
    const amostra: Record<string, ItemPlano[]> = {};
    for (const vert of new Set(rel.map((x) => x.vertical))) {
      const xs = rel.filter((x) => x.vertical === vert);
      const step = Math.max(1, Math.floor(xs.length / AMOSTRA));
      amostra[vert] = xs.filter((_, i) => i % step === 0).slice(0, AMOSTRA);
    }
    fs.writeFileSync(path.join(dir, `aprovacao-plus-amostra-${stamp}.json`), JSON.stringify(amostra, null, 2));
    console.log('Amostra: docs/backups/aprovacao-plus-amostra-' + stamp + '.json');
  } finally { await sql.end(); }
}
main().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
