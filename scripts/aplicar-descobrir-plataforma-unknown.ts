/**
 * DESCOBRIR PLATAFORMA DOS JOGOS 'unknown' (dono, 2026-11-13). DRY-RUN + APLICAR + REVERTER.
 *
 *   npx tsx --env-file=.env.local scripts/aplicar-descobrir-plataforma-unknown.ts                       # dry-run: tabela + plano
 *   npx tsx --env-file=.env.local scripts/aplicar-descobrir-plataforma-unknown.ts --plano <plano.json> --apply --por "Nome"
 *   npx tsx --env-file=.env.local scripts/aplicar-descobrir-plataforma-unknown.ts --rollback <log.json> [--apply]
 *
 * Só grava master_products.game_platform_gen (unknown -> ps5/ps4/switch_1/switch_2/xbox_series) quando o NOME do master
 * (regra existente derivePlatformFromTitle) e os títulos de TODAS as ofertas ativas concordam, sem citar duas gerações/famílias.
 * Xbox One/360, retrô (PS1-3, Wii, 3DS...), cross-gen e ambíguos ficam 'unknown'. Não toca updated_at nem outras colunas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { derivePlatformFromTitle, legacyPlatformsMentioned, mentionsMultipleGenerations } from '../src/lib/affiliate/game-classification';
import { mentionsRetroPlatformOnly } from '../src/lib/catalog/gate';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.resolve('docs/backups');
const ACEITAS = new Set(['ps5', 'ps4', 'switch_1', 'switch_2', 'xbox_series']);

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Linha { id: string; titulo: string; ofertas: number; proposta: string; motivo: string; }

async function diagnosticar(): Promise<Linha[]> {
  const sql = connect();
  try {
    const rows = await sql<{ id: string; name: string; titles: string[]; n: number }[]>`
      SELECT m.id::text AS id, m.name,
        (SELECT array_agg(o.title) FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS titles,
        (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active') AS n
      FROM master_products m
      WHERE m.product_type = 'game' AND m.game_platform_gen::text = 'unknown' AND (m.attributes ->> 'mergedInto') IS NULL
        AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status = 'active')
      ORDER BY m.name`;
    return rows.map((r) => {
      const base = { id: r.id, titulo: r.name, ofertas: r.n };
      const textos = [r.name, ...(r.titles ?? [])];
      let dos = derivePlatformFromTitle(r.name);
      let origem = 'titulo_claro';
      if (dos === 'unknown' && (r.titles ?? []).length) {
        // Nome sem plataforma: vale o consenso de TODAS as ofertas ativas (cada título lido pela mesma regra).
        const ps = new Set((r.titles ?? []).map((t) => derivePlatformFromTitle(t)));
        if (ps.size === 1 && !ps.has('unknown')) { dos = [...ps][0]; origem = 'consenso_ofertas'; }
      }
      const retro = textos.map((t) => mentionsRetroPlatformOnly(fold(t))).find(Boolean) ?? null;
      const legado = textos.flatMap((t) => legacyPlatformsMentioned(t));
      if (dos === 'xbox_one' || dos === 'xbox_360') return { ...base, proposta: 'sem certeza', motivo: `fora_de_linha:${dos}` };
      if (retro || legado.length) return { ...base, proposta: 'sem certeza', motivo: `retro:${retro ?? legado[0]}` };
      if (dos === 'unknown') return { ...base, proposta: 'sem certeza', motivo: 'nome_sem_plataforma_clara' };
      if (!ACEITAS.has(dos)) return { ...base, proposta: 'sem certeza', motivo: `plataforma_nao_aceita:${dos}` };
      if (textos.some((t) => mentionsMultipleGenerations(t))) return { ...base, proposta: 'sem certeza', motivo: 'cross_gen' };
      if (dos === 'xbox_series' && textos.some((t) => /(?:^|[^a-z0-9])x?one(?:[^a-z0-9]|$)/.test(fold(t)))) return { ...base, proposta: 'sem certeza', motivo: 'cross_gen' };
      const divergente = (r.titles ?? []).map((t) => derivePlatformFromTitle(t)).filter((p) => p !== 'unknown' && p !== dos);
      if (divergente.length) return { ...base, proposta: 'sem certeza', motivo: `oferta_diverge:${divergente[0]}` };
      return { ...base, proposta: dos, motivo: origem };
    });
  } finally {
    await sql.end();
  }
}

async function medir(): Promise<Record<string, number>> {
  const sql = connect();
  try {
    const r = await sql<{ g: string; n: number }[]>`
      SELECT m.game_platform_gen::text g, count(*)::int n FROM master_products m
      WHERE m.product_type='game' AND (m.attributes ->> 'mergedInto') IS NULL
        AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status='active')
      GROUP BY 1 ORDER BY 2 DESC`;
    return Object.fromEntries(r.map((x) => [x.g, x.n]));
  } finally { await sql.end(); }
}

async function dryRun() {
  const ls = await diagnosticar();
  const ok = ls.filter((l) => l.proposta !== 'sem certeza');
  console.log(`unknown com oferta ativa: ${ls.length}; com certeza: ${ok.length}; sem certeza: ${ls.length - ok.length}`);
  for (const l of ls) console.log(`${l.id.slice(0, 8)} | ${l.titulo.slice(0, 80).padEnd(80)} | ${l.proposta} | ${l.motivo}`);
  const cont: Record<string, number> = {};
  for (const l of ls) cont[l.motivo.split(':')[0]] = (cont[l.motivo.split(':')[0]] ?? 0) + 1;
  console.log('Por motivo:', JSON.stringify(cont));
  fs.mkdirSync(DIR, { recursive: true });
  const p = path.join(DIR, `descobrir-plataforma-plano-${stamp}.json`);
  fs.writeFileSync(p, JSON.stringify({ geradoEm: new Date().toISOString(), antes: await medir(), linhas: ls }, null, 1));
  console.log('Plano:', path.relative(process.cwd(), p), '(DRY-RUN)');
}

async function aplicar() {
  const pp = arg('--plano'); const por = arg('--por');
  if (!pp || !por) throw new Error('--apply exige --plano e --por');
  const plano = JSON.parse(fs.readFileSync(path.resolve(pp), 'utf8')) as { geradoEm: string; linhas: Linha[] };
  if (Date.now() - new Date(plano.geradoEm).getTime() > 24 * 3_600_000) throw new Error('plano com mais de 24 h');
  const vivo = new Map((await diagnosticar()).map((l) => [l.id, l]));
  const alvo = plano.linhas.filter((l) => l.proposta !== 'sem certeza' && vivo.get(l.id)?.proposta === l.proposta);
  console.log(`Plano: ${plano.linhas.filter((l) => l.proposta !== 'sem certeza').length}; confirmados ao vivo: ${alvo.length}`);
  const ndjson = path.join(DIR, `aplicar-descobrir-plataforma-${stamp}.ndjson`);
  fs.writeFileSync(ndjson, alvo.map((l) => JSON.stringify({ id: l.id, titulo: l.titulo, game_platform_gen_anterior: 'unknown', proposta: l.proposta })).join('\n') + '\n');
  const logPath = path.join(DIR, `aplicar-descobrir-plataforma-log-${stamp}.json`);
  const antes = await medir();
  const log = { em: new Date().toISOString(), por, backup: path.relative(process.cwd(), ndjson), antes, depois: {} as Record<string, number>, gravados: [] as Array<{ id: string; titulo: string; de: string; para: string }>, falhas: [] as Array<{ id: string; erro: string }> };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
  const sql = connect();
  try {
    for (let i = 0; i < alvo.length; i += 20) {
      const lote = alvo.slice(i, i + 20);
      try {
        await sql.begin(async (tx) => {
          await tx`SET LOCAL lock_timeout = '3s'`; await tx`SET LOCAL statement_timeout = '15s'`;
          for (const l of lote) {
            const r = await tx`UPDATE master_products SET game_platform_gen = ${l.proposta}::game_platform_gen
              WHERE id = ${l.id}::uuid AND product_type='game' AND game_platform_gen::text = 'unknown'`;
            if (r.count === 1) log.gravados.push({ id: l.id, titulo: l.titulo, de: 'unknown', para: l.proposta });
            else log.falhas.push({ id: l.id, erro: 'não estava mais unknown' });
          }
        });
      } catch (e) { for (const l of lote) log.falhas.push({ id: l.id, erro: e instanceof Error ? e.message : String(e) }); }
    }
  } finally { await sql.end(); }
  log.depois = await medir();
  fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
  console.log(`Gravados: ${log.gravados.length}; falhas: ${log.falhas.length}\nAntes: ${JSON.stringify(antes)}\nDepois: ${JSON.stringify(log.depois)}\nBackup: ${log.backup}\nLog: ${path.relative(process.cwd(), logPath)}`);
}

async function reverter() {
  const log = JSON.parse(fs.readFileSync(path.resolve(arg('--rollback')!), 'utf8')) as { gravados: Array<{ id: string; para: string }> };
  console.log(`Reverter ${log.gravados.length} masters${APPLY ? '' : ' (DRY-RUN; use --apply)'}`);
  if (!APPLY) return;
  const sql = connect();
  try {
    let n = 0;
    for (const g of log.gravados) {
      const r = await sql`UPDATE master_products SET game_platform_gen = 'unknown'::game_platform_gen WHERE id = ${g.id}::uuid AND game_platform_gen::text = ${g.para}`;
      n += r.count;
    }
    console.log(`Revertidos: ${n}`);
  } finally { await sql.end(); }
}

(async () => {
  if (flag('--rollback')) await reverter(); else if (APPLY) await aplicar(); else await dryRun();
})().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : e); process.exit(1); });
