/**
 * Decisão do coordenador (2026-11-03, QA rodada 8; reversível): master de JOGO aprovado pelo porteiro, vivo, com oferta
 * ativa, `game_format = 'unknown'`, SEM marcador digital em NENHUM título (master e todas as ofertas) e SEM título misto,
 * passa a `game_format = 'physical'` com `attributes.formatEvidence = 'assumed_no_digital_marker'` (evidência FRACA e
 * auditável, distinta de formato provado). Ofertas com marcador digital seguem fora das médias (oferta digital em master
 * físico = divergência). NÃO se aplica a: console/acessório (inclusive tipado 'game'), masters fora do porteiro, masters
 * criados hoje pela descoberta/separação (continuam unknown até prova).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/assumir-fisico-sem-marcador-digital.ts [--apply]
 * Log: backup/dados/assumir-fisico-log-*.json. Desfazer: scripts/revert-separar-formato.ts <log> [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, describeBackup, readBackupIds } from './_dup-shared';
import { evaluateCatalogGate } from '../src/lib/catalog/gate';
import { titleHardwareKind } from '../src/lib/catalog/dimensions';
import { FORMAT_EVIDENCE_ASSUMED, deriveGameFormat, hasDigitalMarker } from '../src/lib/affiliate/game-classification';

const APPLY = process.argv.includes('--apply');
const CUTOFF = '2026-11-03T00:00:00Z'; // masters criados daqui em diante (descoberta/separação de hoje) ficam fora

async function main() {
  const sql = connect();
  try {
    await sql`SET statement_timeout = '300s'`;
    const masters = await sql<any[]>`select id, name, game_platform_gen::text plat, attributes, created_at from master_products
      where product_type = 'game' and game_format = 'unknown' and attributes->>'mergedInto' is null`;
    const offers = await sql<any[]>`select o.master_product_id mid, o.title, o.status::text status from affiliate_offers o
      join master_products m on m.id = o.master_product_id where m.product_type = 'game' and m.game_format = 'unknown' and m.attributes->>'mergedInto' is null`;
    const byM = new Map<string, any[]>();
    for (const o of offers) (byM.get(o.mid) ?? byM.set(o.mid, []).get(o.mid)!).push(o);

    const why = { semAtiva: 0, console: 0, novo: 0, naoAprovado: 0, marcadorDigital: 0, provaFisica: 0 };
    const pick: any[] = [];
    for (const m of masters) {
      const list = byM.get(m.id) ?? [];
      if (!list.some((o) => o.status === 'active')) { why.semAtiva++; continue; }
      if (titleHardwareKind(m.name) !== 'game') { why.console++; continue; }
      if (new Date(m.created_at) >= new Date(CUTOFF) || m.attributes?.splitFromFormat) { why.novo++; continue; }
      const titles = [m.name, ...list.map((o) => o.title)];
      if (titles.some(hasDigitalMarker)) { why.marcadorDigital++; continue; }
      if (titles.some((t) => deriveGameFormat(t) !== 'unknown')) { why.provaFisica++; continue; } // já seria provado
      const g = evaluateCatalogGate({
        name: m.name,
        productType: 'game' as any,
        gamePlatformGen: m.plat,
        gameFormat: 'unknown',
        offerTitles: list.filter((o) => o.status === 'active').map((o) => o.title),
        manual: m.attributes?.catalogGate?.manual ?? null,
      });
      const persisted = m.attributes?.catalogGate?.verdict; // veredito gravado que esconde também conta como fora do porteiro
      if (g.verdict !== 'approved' || (persisted && persisted !== 'approved')) { why.naoAprovado++; continue; }
      pick.push({ id: m.id, name: m.name, plat: m.plat, ativas: list.filter((o) => o.status === 'active').length });
    }
    console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}; masters unknown vivos: ${masters.length}`);
    console.log('Fora (motivo):', JSON.stringify(why));
    console.log(`A assumir físico: ${pick.length} masters, ${pick.reduce((s, p) => s + p.ativas, 0)} ofertas ativas`);
    try {
      const qa: Array<{ id: string }> = JSON.parse(fs.readFileSync('C:/tmp/qa8/invisiveis.json', 'utf8'));
      const set = new Set(pick.map((p) => p.id));
      console.log(`Cobre ${qa.filter((q) => set.has(q.id)).length} dos ${qa.length} da lista do QA; QA fora do plano: ${qa.filter((q) => !set.has(q.id)).length}`);
    } catch { /* lista do QA opcional */ }
    const csv = path.resolve('docs', `formato-assumido-fisico-${APPLY ? 'aplicado' : 'dryrun'}-2026-11-03.csv`);
    fs.writeFileSync(csv, '\uFEFFmaster_id;nome;plataforma;ofertas_ativas\n' + pick.map((p) => `${p.id};"${p.name.replace(/"/g, '""')}";${p.plat};${p.ativas}`).join('\n') + '\n', 'utf8');
    console.log('CSV:', path.relative(process.cwd(), csv));
    if (!APPLY) return;

    const backup = describeBackup(process.cwd(), 12);
    const bm = readBackupIds(path.join(backup.dir, 'master_products.ndjson'));
    if (!backup.ok || pick.some((p) => !bm.has(p.id))) throw new Error('Backup ausente/antigo/incompleto.');
    const logFile = path.resolve('backup', 'dados', `assumir-fisico-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const log: any = { criado_em: new Date().toISOString(), masters_criados: [], movimentos: [], rascunhos: [], colunas: [] };
    await sql
      .begin(async (tx) => {
        await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
        await tx`SET LOCAL statement_timeout = '300s'`;
        const [{ n: o0 }] = await tx`select count(*)::int n from affiliate_offers`;
        for (const p of pick) {
          const ev = { formatEvidence: FORMAT_EVIDENCE_ASSUMED, formatEvidenceAt: new Date().toISOString() };
          const u = await tx`update master_products set game_format = 'physical', attributes = attributes || ${tx.json(ev)}, updated_at = now()
            where id = ${p.id} and game_format = 'unknown'`;
          if (u.count !== 1) throw new Error('master mudou desde o plano: ' + p.id);
          log.colunas.push({ master_id: p.id, nome: p.name, de: 'unknown', para: 'physical', motivo: FORMAT_EVIDENCE_ASSUMED, removeAttr: ['formatEvidence', 'formatEvidenceAt'] });
        }
        const [{ n: o1 }] = await tx`select count(*)::int n from affiliate_offers`;
        if (o0 !== o1) throw new Error('contagem de ofertas mudou');
        fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
      })
      .catch((e) => {
        if (fs.existsSync(logFile)) fs.renameSync(logFile, logFile + '.invalido');
        throw e;
      });
    console.log('Log:', path.relative(process.cwd(), logFile), `(${log.colunas.length} masters)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error('Falha:', e instanceof Error ? e.message : e);
  process.exit(1);
});
