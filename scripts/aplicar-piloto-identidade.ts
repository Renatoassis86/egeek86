/**
 * APLICACAO DO PLANO DO PILOTO DE IDENTIDADE (PS5 console + Resident Evil Generation Pack). Padrao de auditar-consoles.ts.
 * Plano de origem: docs/backups/piloto-identidade-itens-plano-<ts>.json (gerado por scripts/piloto-identidade-itens.ts).
 *
 *   # 1) DRY-RUN (padrao): revalida tudo ao vivo numa transacao READ ONLY e imprime o que faria + medias antes/depois. Nao escreve nada.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-piloto-identidade.ts [--plano <arquivo.json>]
 *   # 2) APLICAR (so o dono; exige backup recente de affiliate_offers + --por)
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-piloto-identidade.ts --apply --plano <arquivo.json> --por "Nome" [--so mover,fora_da_media,veredito]
 *   # 3) REVERTER
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-piloto-identidade.ts --rollback backup/logs/aplicar-piloto-identidade-<ts>.json [--apply]
 *
 * ACOES (decisao do dono 2026-11-11):
 *   mover         ofertas do plano com acao 'mover' (hoje 6: 599ae76d->2541db02 e 71a42333->fea28c9c) + price_daily_offer; revalida status,
 *                 master de origem, titulo, chave de identidade (identPs5) e o master de destino. Qualquer divergencia ABORTA tudo.
 *   fora_da_media marca (SEM quarentena; a oferta continua ativa e visivel) em affiliate_offers.avg_excluded_at/avg_excluded_reason:
 *                 (a) ofertas fora da cerca de Tukey so no lado SUPERIOR (o inferior so com prova da API; dono 2026-11-11), recalculada ao vivo;
 *                 (b) ofertas de identidade incerta (fail-closed). DEPENDE da migracao 0044 (coluna nova); sem ela o apply recusa estas acoes.
 *   veredito      master Resident Evil Generation Pack: attributes.identityVerdict = em_revisao (jsonb, sem coluna nova). Nenhuma oferta tocada.
 * Nunca apaga linha. Recalcula price_daily_state/price_min_events (codigo existente) so dos masters afetados por MOVER.
 * ATENCAO: o selo/media so deixam de contar a oferta marcada depois que eligibleOfferSql honrar avg_excluded_at (ver cabecalho da 0044).
 */
import fs from 'node:fs';
import path from 'node:path';
import { identPs5, r3, meanBand } from './piloto-identidade-itens';
import { PRICE_DAILY_REGIME_START, spDay } from '../src/lib/pricing/daily-state';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const arg = (n: string) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const APPLY = flag('--apply');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const PLAN_DIR = path.resolve('docs/backups');
const BK_DATA = path.resolve('backup/dados');
const BK_LOGS = path.resolve('backup/logs');
const REASON_FENCE = 'piloto-identidade:cerca-superior';
const REASON_UNCERTAIN = 'piloto-identidade:identidade-incerta';
const brl = (c: number | null | undefined) => (c == null ? '-' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const sh = (id: string) => id.slice(0, 8);

// ----------------------------------------------------------------------------------------------------------------
// Derivacao PURA das acoes a partir do plano (testavel sem banco)
// ----------------------------------------------------------------------------------------------------------------
interface PlanDecision { offerId: string; title: string; price: number; fromMasterId: string; destinoMasterId: string | null; key: string | null; acoes: string[]; bucket: string }
interface PlanGroup { key: string; masterDestino: string | null; r3: { fenceHigh: number | null; bimodal: boolean; foraDaCerca: Array<{ id: string; price: number; lado: 'acima' | 'abaixo' }> }; ofertas: Array<{ id: string; titulo: string; preco: number; deMaster: string }> }
export interface PilotPlan {
  geradoEm: string; decisions: PlanDecision[]; grupos: PlanGroup[]; incertas: PlanDecision[];
  residentEvil: { masterId: string; acoesPropostas: Array<{ acao: string; valor?: string; motivo?: string }> };
}
export interface Actions {
  moves: PlanDecision[];
  fence: Array<{ offerId: string; price: number; groupKey: string }>; // so lado superior
  fenceLowerIgnored: number;
  uncertain: PlanDecision[];
  verdict: { masterId: string; valor: string; motivo: string } | null;
}
export function deriveActions(plan: PilotPlan): Actions {
  const moves = plan.decisions.filter((d) => d.acoes.includes('mover') && d.destinoMasterId && d.destinoMasterId !== d.fromMasterId);
  const fence: Actions['fence'] = []; let lower = 0;
  for (const g of plan.grupos) for (const f of g.r3.foraDaCerca) { if (f.lado === 'acima') fence.push({ offerId: f.id, price: f.price, groupKey: g.key }); else lower++; }
  const uncertain = plan.incertas.filter((d) => d.acoes.includes('marcar_incerta'));
  const v = plan.residentEvil.acoesPropostas.find((a) => a.acao === 'veredito_master');
  return { moves, fence, fenceLowerIgnored: lower, uncertain, verdict: v?.valor === 'em_revisao' ? { masterId: plan.residentEvil.masterId, valor: v.valor, motivo: v.motivo ?? '' } : null };
}

// ----------------------------------------------------------------------------------------------------------------
// Execucao
// ----------------------------------------------------------------------------------------------------------------
class DryAbort extends Error {}
const lit = (sqlTag: typeof import('drizzle-orm').sql, list: string[]) => sqlTag.join(list.map((i) => sqlTag`${i}::uuid`), sqlTag`, `);

function recentBackup(): { ok: boolean; txt: string } {
  const files = fs.existsSync(BK_DATA) ? fs.readdirSync(BK_DATA).filter((f) => /^affiliate_offers.*\.ndjson$/.test(f)) : [];
  const newest = Math.max(0, ...files.map((f) => fs.statSync(path.join(BK_DATA, f)).mtimeMs));
  const ageH = (Date.now() - newest) / 3_600_000;
  return { ok: !!newest && ageH <= 12, txt: newest ? `${ageH.toFixed(1)} h` : 'nenhum' };
}

function latestPlan(): string {
  const f = fs.readdirSync(PLAN_DIR).filter((x) => /^piloto-identidade-itens-plano-.*\.json$/.test(x)).sort().pop();
  if (!f) throw new Error('nenhum plano piloto-identidade-itens-plano-*.json em docs/backups');
  return path.join(PLAN_DIR, f);
}

async function run(mode: 'dry' | 'apply') {
  const planFile = path.resolve(arg('--plano') ?? (APPLY ? (() => { throw new Error('--apply exige --plano <arquivo.json>'); })() : latestPlan()));
  const por = arg('--por');
  if (mode === 'apply' && !por) throw new Error('--apply exige --por "<quem aprovou>"');
  const only = new Set((arg('--so') ?? 'mover,fora_da_media,veredito').split(','));
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8')) as PilotPlan;
  const planAgeH = (Date.now() - Date.parse(plan.geradoEm)) / 3_600_000;
  if (mode === 'apply' && planAgeH > 24) throw new Error(`plano com ${planAgeH.toFixed(1)} h (> 24 h): gere de novo`);
  const bk = recentBackup();
  if (mode === 'apply' && !bk.ok) throw new Error(`Backup de affiliate_offers: ${bk.txt} (> 12 h ou ausente). Rode: node --env-file=.env.local backup/backup-pre-fusao.mjs`);

  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db');
  const pd = mode === 'apply' ? await import('../src/server/pricing/price-daily') : null;
  const ds = mode === 'apply' ? await import('../src/lib/pricing/daily-state') : null;
  const A = deriveActions(plan);
  const now = new Date(); const today = spDay(now);
  const logFile = path.join(BK_LOGS, `aplicar-piloto-identidade-${stamp}.json`);
  const lines: string[] = []; const L = (s = '') => lines.push(s);
  const log: Record<string, any> = { status: 'pending', stamp, por, planFile, backupAge: bk.txt, moves: [], flagged: [], verdict: null, files: {} };
  const rows = async (tx: any, table: string, where: any) => (await tx.execute(sql`SELECT to_jsonb(t) AS j FROM ${sql.raw(table)} t WHERE ${where}`)).map((r: any) => r.j);
  const wr = (n: string, data: unknown[]) => { const f = path.join(BK_DATA, `aplicar-piloto-identidade-${stamp}-${n}.ndjson`); fs.writeFileSync(f, data.map((r) => JSON.stringify(r)).join('\n') + (data.length ? '\n' : '')); return f; };
  if (mode === 'apply') { fs.mkdirSync(BK_LOGS, { recursive: true }); fs.mkdirSync(BK_DATA, { recursive: true }); }

  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '300s'`);
      if (mode === 'dry') await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const lock = mode === 'apply' ? sql`FOR UPDATE` : sql``;
      // Contagem ESTAVEL: so linhas anteriores ao inicio da transacao (a coleta ao vivo continua inserindo).
      const cutIso = new Date(((await tx.execute(sql`SELECT now() AS t`))[0] as any).t).toISOString();
      const cnt = async () => (await tx.execute(sql`SELECT (SELECT count(*) FROM affiliate_offers WHERE created_at <= ${cutIso}::timestamptz)::int o, (SELECT count(*) FROM affiliate_price_snapshots WHERE collected_at <= ${cutIso}::timestamptz)::int s, (SELECT count(*) FROM master_products WHERE created_at <= ${cutIso}::timestamptz)::int m`))[0];
      const c0 = await cnt();
      const hasCol = (await tx.execute(sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='affiliate_offers' AND column_name IN ('avg_excluded_at','avg_excluded_reason')`))[0].n === 2;

      L(`=== APLICAR PILOTO DE IDENTIDADE (${mode === 'apply' ? 'APPLY' : 'DRY-RUN, READ ONLY'}) ===`);
      L(`plano ${path.relative(process.cwd(), planFile)} (gerado ha ${planAgeH.toFixed(1)} h) | backup de affiliate_offers: ${bk.txt}${bk.ok ? '' : ' (INSUFICIENTE: --apply recusaria)'} | migracao 0044 (colunas avg_excluded_*): ${hasCol ? 'aplicada' : 'NAO aplicada'}`);
      L(`Do plano: mover=${A.moves.length}; cerca SUPERIOR=${A.fence.length} (inferior ignorado, regra do dono: ${A.fenceLowerIgnored}); incertas=${A.uncertain.length}; veredito=${A.verdict ? `${sh(A.verdict.masterId)}=${A.verdict.valor}` : 'nenhum'}`);

      // ---------- carga ao vivo ----------
      type Live = { id: string; mid: string; st: string; q: boolean; title: string; price: number; net: string; excl: string | null };
      const loadOffers = async (ids: string[], withLock = false): Promise<Map<string, Live>> => {
        if (!ids.length) return new Map();
        const exclSel = hasCol ? sql`o.avg_excluded_at::text` : sql`NULL::text`;
        const r = await tx.execute(sql`SELECT o.id::text AS id, o.master_product_id::text AS mid, o.status::text AS st, (o.quarantined_at IS NOT NULL) AS q, o.title, o.current_price_cents::float8 AS price, n.slug AS net, ${exclSel} AS excl
          FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.id IN (${lit(sql, ids)}) ${withLock ? lock : sql``}`);
        return new Map(r.map((x: any) => [x.id, x as Live]));
      };
      const bad: string[] = []; // divergencias que ABORTAM (mover/veredito)
      const skipped: string[] = []; // ignoradas com seguranca (marcas)

      // ---------- MOVER: revalidacao estrita ----------
      const moveLive = await loadOffers(A.moves.map((m) => m.offerId), true);
      const destIds = [...new Set(A.moves.map((m) => m.destinoMasterId as string))];
      const srcIds = [...new Set(A.moves.map((m) => m.fromMasterId))];
      const mrow = async (ids: string[]) => ids.length ? new Map<string, any>((await tx.execute(sql`SELECT id::text AS id, name, product_type::text AS pt, game_platform_gen::text AS plat, attributes->>'mergedInto' AS mi FROM master_products WHERE id IN (${lit(sql, ids)}) ${lock}`)).map((r: any) => [r.id, r])) : new Map<string, any>();
      const mm = await mrow([...destIds, ...srcIds]);
      if (only.has('mover')) {
        for (const id of [...destIds, ...srcIds]) if (!mm.get(id)) bad.push(`master ${sh(id)} sumiu`); else if (mm.get(id).mi) bad.push(`master ${sh(id)} ja arquivado`);
        for (const d of destIds) { const m = mm.get(d); if (m && (m.pt !== 'console' || m.plat !== 'ps5')) bad.push(`destino ${sh(d)} nao e console ps5 (${m.pt}/${m.plat})`); }
        for (const m of A.moves) {
          const l = moveLive.get(m.offerId);
          if (!l) { bad.push(`oferta ${sh(m.offerId)} sumiu`); continue; }
          if (l.st !== 'active') bad.push(`oferta ${sh(m.offerId)} status ${l.st}`);
          if (l.q) bad.push(`oferta ${sh(m.offerId)} em quarentena`);
          if (l.mid !== m.fromMasterId) bad.push(`oferta ${sh(m.offerId)} agora no master ${sh(l.mid)} (plano: ${sh(m.fromMasterId)})`);
          if (l.title !== m.title) bad.push(`oferta ${sh(m.offerId)} titulo mudou`);
          const pi = identPs5(l.title); const destKey = mm.get(m.destinoMasterId as string) ? identPs5(mm.get(m.destinoMasterId as string).name).key : null;
          if (pi.conf === 'baixa' || pi.id.condition !== 'new') bad.push(`oferta ${sh(m.offerId)} identidade nao e mais provada/nova`);
          if (pi.key !== m.key || destKey !== m.key) bad.push(`oferta ${sh(m.offerId)} chave ao vivo ${pi.key} / destino ${destKey} != plano ${m.key}`);
        }
      }

      // ---------- CERCA SUPERIOR: recalculada ao vivo, por grupo ----------
      const fenceOk: Array<{ offerId: string; price: number; groupKey: string }> = [];
      const fenceInfo: string[] = [];
      if (only.has('fora_da_media')) {
        const byGroup = new Map<string, typeof A.fence>();
        for (const f of A.fence) (byGroup.get(f.groupKey) ?? byGroup.set(f.groupKey, []).get(f.groupKey)!).push(f);
        for (const [gk, fs_] of byGroup) {
          const g = plan.grupos.find((x) => x.key === gk)!;
          const live = await loadOffers(g.ofertas.map((o) => o.id));
          const members = g.ofertas.map((o) => live.get(o.id)).filter((x): x is Live => !!x && x.st === 'active' && !x.q);
          if (members.length < Math.ceil(g.ofertas.length * 0.9)) { for (const f of fs_) skipped.push(`cerca ${sh(f.offerId)}: grupo ${gk} perdeu membros (${members.length}/${g.ofertas.length})`); continue; }
          const r = r3(members.map((x) => ({ id: x.id, price: x.price, skey: x.id })));
          fenceInfo.push(`${gk}: n=${r.n} cerca superior ao vivo=${brl(r.fenceHigh)}${r.bimodal ? ' BIMODAL (sem cerca)' : ''}`);
          for (const f of fs_) {
            const l = live.get(f.offerId);
            const out = r.foraDaCerca.find((x) => x.id === f.offerId);
            if (!l || l.st !== 'active' || l.q) skipped.push(`cerca ${sh(f.offerId)}: oferta nao esta mais ativa`);
            else if (l.excl) skipped.push(`cerca ${sh(f.offerId)}: ja marcada`);
            else if (!out || out.lado !== 'acima') skipped.push(`cerca ${sh(f.offerId)}: ao vivo ${brl(l.price)} nao esta mais acima da cerca (${brl(r.fenceHigh)})`);
            else fenceOk.push({ offerId: f.offerId, price: l.price, groupKey: gk });
          }
        }
      }
      // ---------- INCERTAS: ainda incertas ao vivo ----------
      const uncLive = only.has('fora_da_media') ? await loadOffers(A.uncertain.map((d) => d.offerId)) : new Map<string, Live>();
      const uncOk: Array<{ offerId: string; mid: string; price: number }> = [];
      if (only.has('fora_da_media')) for (const d of A.uncertain) {
        const l = uncLive.get(d.offerId);
        if (!l || l.st !== 'active' || l.q) { skipped.push(`incerta ${sh(d.offerId)}: nao esta mais ativa`); continue; }
        if (l.title !== d.title || l.mid !== d.fromMasterId) { skipped.push(`incerta ${sh(d.offerId)}: titulo/master mudou`); continue; }
        if (l.excl) { skipped.push(`incerta ${sh(d.offerId)}: ja marcada`); continue; }
        const pi = identPs5(l.title);
        if (pi.conf !== 'baixa') { skipped.push(`incerta ${sh(d.offerId)}: ao vivo a identidade ja nao e baixa (${pi.conf})`); continue; }
        uncOk.push({ offerId: d.offerId, mid: l.mid, price: l.price });
      }
      // ---------- VEREDITO ----------
      let verdictPrev: unknown = null; let verdictOk = false;
      if (only.has('veredito') && A.verdict) {
        const r = (await tx.execute(sql`SELECT attributes->'identityVerdict' AS iv, attributes->>'mergedInto' AS mi FROM master_products WHERE id = ${A.verdict.masterId}::uuid ${lock}`))[0] as any;
        if (!r) bad.push('master Resident Evil sumiu'); else if (r.mi) bad.push('master Resident Evil arquivado'); else { verdictPrev = r.iv ?? null; verdictOk = true; }
      }
      const needCol = (fenceOk.length + uncOk.length) > 0;
      if (needCol && !hasCol) bad.push(`acoes fora_da_media (${fenceOk.length + uncOk.length} ofertas) exigem a migracao 0044 (colunas avg_excluded_at/avg_excluded_reason). Aplique-a antes ou use --so mover,veredito`);

      // ---------- ANTES x DEPOIS das medias (mesma formula do piloto: faixa plausivel, cada oferta vale 1) ----------
      const affected = [...new Set([...destIds, ...srcIds, ...uncOk.map((u) => u.mid)])];
      const fenceMasters = fenceOk.length ? (await tx.execute(sql`SELECT id::text AS id, master_product_id::text AS mid FROM affiliate_offers WHERE id IN (${lit(sql, fenceOk.map((f) => f.offerId))})`)) as Array<{ id: string; mid: string }> : [];
      const allMasters = [...new Set([...affected, ...fenceMasters.map((x) => x.mid)])];
      const pool = allMasters.length ? (await tx.execute(sql`SELECT o.id::text AS id, o.master_product_id::text AS mid, o.current_price_cents::float8 AS price, m.name FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id
        WHERE o.master_product_id IN (${lit(sql, allMasters)}) AND o.status = 'active' AND o.quarantined_at IS NULL AND o.current_price_cents > 0`)) as Array<{ id: string; mid: string; price: number; name: string }> : [];
      const stored = allMasters.length ? new Map<string, any>((await tx.execute(sql`SELECT DISTINCT ON (master_product_id) master_product_id::text AS mid, avg_cents::float8 AS avg, n_offers AS n, day::text AS day FROM price_daily_state WHERE master_product_id IN (${lit(sql, allMasters)}) ORDER BY master_product_id, day DESC`)).map((r: any) => [r.mid, r])) : new Map<string, any>();
      const moveTo = new Map(A.moves.map((m) => [m.offerId, m.destinoMasterId as string]));
      const dropped = new Set([...fenceOk.map((f) => f.offerId), ...uncOk.map((u) => u.offerId)]);
      const mname = new Map(pool.map((p) => [p.mid, p.name]));
      L('\n--- MEDIAS antes -> depois por master afetado (recalculo local; cada oferta vale 1) ---');
      for (const mid of allMasters) {
        const before = pool.filter((p) => p.mid === mid).map((p) => p.price);
        const afterP = pool.filter((p) => !dropped.has(p.id) && (moveTo.get(p.id) ?? p.mid) === mid).map((p) => p.price);
        const b = meanBand(before); const a = meanBand(afterP);
        const sp = stored.get(mid);
        const variacao = b.mean && a.mean ? `${((a.mean / b.mean - 1) * 100).toFixed(1)}%` : '-';
        L(`  ${sh(mid)} "${(mname.get(mid) ?? '').slice(0, 52)}": armazenada(${sp?.day ?? '-'}, n=${sp?.n ?? '-'})=${brl(sp?.avg)} | agora n=${b.n} ${brl(b.mean)} -> depois n=${a.n} ${brl(a.mean)} (${variacao})`);
      }
      L('\n--- ACOES QUE SERIAM APLICADAS (apos revalidacao ao vivo) ---');
      L(`MOVER ${only.has('mover') ? A.moves.length : 0}:`);
      for (const m of A.moves) L(`   ${sh(m.offerId)} ${brl(moveLive.get(m.offerId)?.price)} ${sh(m.fromMasterId)} -> ${sh(m.destinoMasterId as string)} "${m.title.slice(0, 60)}"`);
      L(`FORA DA MEDIA - cerca superior ${fenceOk.length}:`);
      for (const f of fenceOk) L(`   ${sh(f.offerId)} ${brl(f.price)} [${f.groupKey}]`);
      for (const i of fenceInfo) L(`   (${i})`);
      L(`FORA DA MEDIA - identidade incerta ${uncOk.length}:`);
      for (const u of uncOk) L(`   ${sh(u.offerId)} ${brl(u.price)} master ${sh(u.mid)}`);
      L(`VEREDITO: ${verdictOk ? `master ${sh(A.verdict!.masterId)} identityVerdict=em_revisao (anterior: ${JSON.stringify(verdictPrev)})` : 'nenhum'}`);
      L(`IGNORADAS na revalidacao (${skipped.length}):`); for (const s of skipped) L(`   ${s}`);
      L(`DIVERGENCIAS QUE ABORTAM (${bad.length}):`); for (const b of bad) L(`   ${b}`);
      L(`Contagens estaveis (<= inicio da transacao): ofertas=${c0.o} cotacoes=${c0.s} masters=${c0.m}`);

      if (mode === 'dry') { throw new DryAbort(); }
      if (bad.length) throw new Error('revalidacao falhou: ' + bad.join(' | '));

      // ---------- APPLY ----------
      const files: Record<string, string> = {};
      const moveIds = only.has('mover') ? A.moves.map((m) => m.offerId) : [];
      const flagIds = [...fenceOk.map((f) => f.offerId), ...uncOk.map((u) => u.offerId)];
      const touched = [...new Set([...moveIds, ...flagIds])];
      const mIds = [...new Set([...(moveIds.length ? [...destIds, ...srcIds] : []), ...(verdictOk ? [A.verdict!.masterId] : [])])];
      if (touched.length) files.affiliate_offers = wr('affiliate_offers', await rows(tx, 'affiliate_offers', sql`id IN (${lit(sql, touched)})`));
      if (mIds.length) {
        files.master_products = wr('master_products', await rows(tx, 'master_products', sql`id IN (${lit(sql, mIds)})`));
        files.price_daily_state = wr('price_daily_state', await rows(tx, 'price_daily_state', sql`master_product_id IN (${lit(sql, mIds)}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`));
        files.price_min_events = wr('price_min_events', await rows(tx, 'price_min_events', sql`master_product_id IN (${lit(sql, mIds)}) AND source = 'reconstructed'`));
        files.price_daily_offer = wr('price_daily_offer', await rows(tx, 'price_daily_offer', sql`master_product_id IN (${lit(sql, mIds)})`));
      }
      log.files = files;

      for (const m of moveIds.length ? A.moves : []) {
        const r = await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${m.destinoMasterId}::uuid, updated_at = now() WHERE id = ${m.offerId}::uuid AND master_product_id = ${m.fromMasterId}::uuid AND status = 'active' RETURNING id`);
        if (r.length !== 1) throw new Error(`oferta ${m.offerId} nao pode ser movida`);
        log.moves.push({ offerId: m.offerId, from: m.fromMasterId, to: m.destinoMasterId, title: m.title, price: m.price });
      }
      if (moveIds.length) await tx.execute(sql`UPDATE price_daily_offer SET master_product_id = o.master_product_id FROM affiliate_offers o WHERE price_daily_offer.offer_id = o.id AND o.id IN (${lit(sql, moveIds)}) AND price_daily_offer.master_product_id <> o.master_product_id`);

      for (const [ids, reason] of [[fenceOk.map((f) => f.offerId), REASON_FENCE], [uncOk.map((u) => u.offerId), REASON_UNCERTAIN]] as const) {
        for (const id of ids) {
          const r = await tx.execute(sql`UPDATE affiliate_offers SET avg_excluded_at = now(), avg_excluded_reason = ${reason} WHERE id = ${id}::uuid AND avg_excluded_at IS NULL AND quarantined_at IS NULL RETURNING id`);
          if (r.length !== 1) throw new Error(`oferta ${id} nao pode ser marcada`);
          log.flagged.push({ offerId: id, reason });
        }
      }
      if (verdictOk) {
        const v = { verdict: A.verdict!.valor, since: now.toISOString(), by: 'aplicar-piloto-identidade', approvedBy: por, reason: A.verdict!.motivo, plan: path.basename(planFile) };
        const up = await tx.execute(sql`UPDATE master_products SET attributes = attributes || ${JSON.stringify({ identityVerdict: v })}::jsonb, updated_at = now() WHERE id = ${A.verdict!.masterId}::uuid AND (attributes->>'mergedInto') IS NULL RETURNING id`);
        if (up.length !== 1) throw new Error('falha ao gravar veredito');
        log.verdict = { masterId: A.verdict!.masterId, previous: verdictPrev };
      }

      // Recalculo (codigo existente) so dos masters tocados por MOVER.
      const recalc = moveIds.length ? [...new Set([...destIds, ...srcIds])] : [];
      if (recalc.length && pd && ds) {
        await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id IN (${lit(sql, recalc)}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`);
        const { rows: stRows } = await pd.computeStatesForBatch(tx, recalc, PRICE_DAILY_REGIME_START, today, now);
        await pd.upsertStates(tx, stRows);
        await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id IN (${lit(sql, recalc)}) AND source = 'reconstructed'`);
        const fromAt = new Date(`${PRICE_DAILY_REGIME_START}T03:00:00Z`);
        const recon = await pd.loadReconOffers(tx, recalc, fromAt.toISOString());
        for (const [pid, offs] of recon) await pd.insertEvents(tx, pid, ds.reconstructMinEvents(offs, fromAt), 'reconstructed');
      }

      const c1 = await cnt();
      if (c0.o !== c1.o || c0.s !== c1.s || c0.m !== c1.m) throw new Error('contagens de ofertas/cotacoes/masters mudaram: rollback');
      const chk = moveIds.length ? await tx.execute(sql`SELECT id::text, master_product_id::text AS mid FROM affiliate_offers WHERE id IN (${lit(sql, moveIds)})`) : [];
      for (const r of chk as any[]) if (r.mid !== A.moves.find((m) => m.offerId === r.id)!.destinoMasterId) throw new Error('verificacao pos-mover falhou');
      log.status = 'committed'; log.verificacoes = { contagens: c1, mastersRecalculados: recalc.length };
      fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    });
  } catch (e) {
    if (!(e instanceof DryAbort)) { if (fs.existsSync(logFile)) fs.renameSync(logFile, logFile + '.invalido'); throw e; }
  }
  console.log(lines.join('\n'));
  if (mode === 'dry') {
    const txt = path.join(PLAN_DIR, `aplicar-piloto-identidade-dryrun-${stamp}.txt`);
    fs.writeFileSync(txt, lines.join('\n'));
    console.log(`\nDRY-RUN: nada foi escrito no banco. Relatorio: ${path.relative(process.cwd(), txt)}`);
    console.log(`Aplicar (dono): npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-piloto-identidade.ts --apply --plano ${path.relative(process.cwd(), planFile)} --por "<Nome>"`);
  } else {
    console.log(`\nAPLICADO. Log de reversao: ${path.relative(process.cwd(), logFile)}`);
    console.log(`Reverter: npx tsx --conditions=react-server --env-file=.env.local scripts/aplicar-piloto-identidade.ts --rollback ${path.relative(process.cwd(), logFile)} --apply`);
  }
}

const readNd = (f: string): any[] => { const t = fs.readFileSync(path.resolve(f), 'utf8').trim(); return t ? t.split('\n').map((l) => JSON.parse(l)) : []; };

async function rollback(file: string) {
  const log = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (log.status !== 'committed') throw new Error('log sem status committed');
  const { sql } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db');
  const survivors: string[] = [...new Set<string>([...log.moves.flatMap((m: any) => [m.from, m.to])])];
  console.log(`${APPLY ? 'REVERTENDO' : 'DRY-RUN da reversao'}: ${log.moves.length} oferta(s) movida(s), ${log.flagged.length} marca(s) fora da media, veredito=${log.verdict ? 'sim' : 'nao'}`);
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '300s'`);
      if (log.flagged.length) await tx.execute(sql`UPDATE affiliate_offers SET avg_excluded_at = NULL, avg_excluded_reason = NULL WHERE id IN (${lit(sql, log.flagged.map((f: any) => f.offerId))}) AND avg_excluded_reason LIKE 'piloto-identidade:%'`);
      if (log.verdict) {
        if (log.verdict.previous) await tx.execute(sql`UPDATE master_products SET attributes = attributes || ${JSON.stringify({ identityVerdict: log.verdict.previous })}::jsonb, updated_at = now() WHERE id = ${log.verdict.masterId}::uuid`);
        else await tx.execute(sql`UPDATE master_products SET attributes = attributes - 'identityVerdict', updated_at = now() WHERE id = ${log.verdict.masterId}::uuid`);
      }
      for (const m of [...log.moves].reverse()) await tx.execute(sql`UPDATE affiliate_offers SET master_product_id = ${m.from}::uuid, updated_at = now() WHERE id = ${m.offerId}::uuid AND master_product_id = ${m.to}::uuid`);
      if (survivors.length) {
        const ids = lit(sql, survivors);
        await tx.execute(sql`DELETE FROM price_daily_offer WHERE master_product_id IN (${ids})`);
        await tx.execute(sql`DELETE FROM price_daily_state WHERE master_product_id IN (${ids}) AND day >= ${PRICE_DAILY_REGIME_START}::date AND quality <> 'legacy'`);
        await tx.execute(sql`DELETE FROM price_min_events WHERE master_product_id IN (${ids}) AND source = 'reconstructed'`);
        for (const name of ['price_daily_offer', 'price_daily_state', 'price_min_events'] as const) {
          const data = log.files[name] ? readNd(log.files[name]) : [];
          if (data.length) await tx.execute(sql`INSERT INTO ${sql.raw(name)} SELECT * FROM jsonb_populate_recordset(NULL::${sql.raw(name)}, ${JSON.stringify(data)}::jsonb)`);
        }
      }
      const bkOffers = log.files.affiliate_offers ? readNd(log.files.affiliate_offers) : [];
      if (bkOffers.length) {
        const live = await tx.execute(sql`SELECT id::text, master_product_id::text AS mid FROM affiliate_offers WHERE id IN (${lit(sql, bkOffers.map((r: any) => r.id))})`);
        const m = new Map<string, string>(live.map((r: any) => [r.id, r.mid]));
        const bad = bkOffers.filter((r: any) => m.get(r.id) !== r.master_product_id).length;
        console.log(`Verificacao: ${bkOffers.length - bad} de ${bkOffers.length} ofertas de volta ao master do backup.`);
        if (bad) throw new Error('reversao incompleta: rollback da reversao');
      }
      if (!APPLY) throw new DryAbort();
    });
    console.log('REVERTIDO.');
  } catch (e) {
    if (!(e instanceof DryAbort)) throw e;
    console.log('DRY-RUN da reversao: transacao desfeita.');
  }
}

async function main() {
  const rb = arg('--rollback');
  if (rb) { await rollback(rb); process.exit(0); }
  await run(APPLY ? 'apply' : 'dry');
  process.exit(0);
}

if (path.basename(process.argv[1] ?? '') === 'aplicar-piloto-identidade.ts') main().catch((e) => { console.error('FALHA:', e instanceof Error ? (e.stack ?? e.message) : e); process.exit(1); });
