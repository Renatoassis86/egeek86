/**
 * PILOTO DO TIME DE IDENTIDADE DOS ITENS (dono aprovou o desenho em 2026-11-11; ADR 0011 rascunho). SOMENTE LEITURA / SIMULACAO.
 * Alvos: (a) masters PS5 de console; (b) master 'Resident Evil Generation Pack - Ns2' (32d3d75a-8edd-4270-9b43-b8cd7c1f4572).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/piloto-identidade-itens.ts
 *
 * R1 (identidade deterministica): chave derivada SO do titulo (console-identity.ts para PS5; leitor proprio para o jogo), sem olhar preco.
 * R3 (dispersao): ratio max/min, IQR, mediana x media, gap bimodal em log, cerca de Tukey em log (Q3 + 1,5 IQR) e plausibilidade
 *     (>= R$ 1 milhao, > 5x a mediana). O preco SO alarma; nunca decide identidade.
 * R2 (auditor cego) e R4 (API oficial) NAO sao executados aqui: ficam registrados como pendencias.
 * Grava apenas docs/backups/piloto-identidade-itens-plano-<ts>.json e ...-resumo-<ts>.txt. Nenhum UPDATE/INSERT/DELETE no banco
 * (a conexao e aberta em transacao READ ONLY). Aplicar o plano exige um script/aprovacao a parte (nao existe --apply aqui).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, type Sql } from './_dup-shared';
import { parseConsoleTitle, type ConsoleIdentity } from '../src/lib/catalog/console-identity';
import { derivePlatformFromTitle } from '../src/lib/affiliate/game-classification';
import { foldTitle } from '../src/lib/catalog/dimensions';
import { medianCont, plausibleBand, inBand } from '../src/lib/pricing/daily-state';

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const PLAN_DIR = path.resolve('docs/backups');
const RE_MASTER = '32d3d75a-8edd-4270-9b43-b8cd7c1f4572';
const MILLION_CENTS = 100_000_000; // R$ 1.000.000
const HIGH_MULT = 5; // > 5x a mediana do grupo
const GAP_BIMODAL = 0.4; // gap em log (~49%) com >= 2 ofertas de cada lado (ata 2026-11-11)
const TUKEY_K = 1.5;
const MIN_FOR_TUKEY = 5;
const brl = (c: number | null | undefined) => (c == null ? '-' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const sh = (id: string) => id.slice(0, 8);

// ------------------------------------------------------------------------------------------------
// Tipos
// ------------------------------------------------------------------------------------------------
interface MasterRow { id: string; name: string; pt: string; plat: string | null; activeOffers: number; stray: boolean }
interface OfferRow { id: string; mid: string; title: string; price: number; net: string; store: string; seller: string | null }
type Bucket = 'grupo' | 'incerta' | 'fora_escopo' | 'condicao';
interface Decision {
  offerId: string; title: string; price: number; net: string; store: string; fromMasterId: string;
  bucket: Bucket; key: string | null; confianca: string; naoProvado: string[];
  destinoMasterId: string | null; criarMasterChave: string | null; acoes: string[]; motivos: string[];
}

// ------------------------------------------------------------------------------------------------
// Estatistica (R3)
// ------------------------------------------------------------------------------------------------
function pct(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
/** Media do jeito de producao: faixa plausivel (35% a 3x a mediana), media so com >= 3. Cada oferta vale 1 (preco atual = oferta-dia de hoje). */
export function meanBand(prices: number[]): { n: number; mean: number | null } {
  const band = plausibleBand(prices);
  const kept = prices.filter((p) => inBand(p, band));
  return { n: kept.length, mean: kept.length >= 3 ? mean(kept) : null };
}
interface R3 {
  n: number; stores: number; min: number; max: number; ratio: number; median: number; mean: number; meanVsMedianPct: number;
  q1: number; q3: number; iqrOverMedian: number; logIqr: number; fenceLow: number | null; fenceHigh: number | null;
  maxLogGap: number; gapBetween: [number, number] | null; bimodal: boolean;
  implausiveis: Array<{ id: string; price: number; motivo: string }>; foraDaCerca: Array<{ id: string; price: number; lado: 'acima' | 'abaixo' }>;
  mediaAtualRegra: number | null; nAtualRegra: number; mediaComCerca: number | null; nComCerca: number; mediaCercaSoSuperior: number | null; veredito: string;
}
export function r3(offs: Array<{ id: string; price: number; skey: string }>): R3 {
  const implausiveis: R3['implausiveis'] = [];
  let rest = offs.filter((o) => { if (o.price >= MILLION_CENTS) { implausiveis.push({ id: o.id, price: o.price, motivo: '>= R$ 1.000.000' }); return false; } return true; });
  const med0 = medianCont(rest.map((o) => o.price)) ?? 0;
  if (rest.length >= 3) rest = rest.filter((o) => { if (o.price > HIGH_MULT * med0) { implausiveis.push({ id: o.id, price: o.price, motivo: `> ${HIGH_MULT}x a mediana (${brl(med0)})` }); return false; } return true; });
  const all = offs.map((o) => o.price);
  const sortedAll = [...all].sort((a, b) => a - b);
  const prices = rest.map((o) => o.price).sort((a, b) => a - b);
  const base = prices.length ? prices : sortedAll;
  const med = medianCont(base) as number;
  const q1 = pct(base, 0.25); const q3 = pct(base, 0.75);
  const lg = base.map(Math.log); const lq1 = pct(lg, 0.25); const lq3 = pct(lg, 0.75); const logIqr = lq3 - lq1;
  // gap bimodal: maior salto consecutivo em log com >= 2 ofertas de cada lado
  let maxGap = 0; let between: [number, number] | null = null;
  for (let i = 2; i <= base.length - 2; i++) { const g = lg[i] - lg[i - 1]; if (g > maxGap) { maxGap = g; between = [base[i - 1], base[i]]; } }
  const bimodal = maxGap > GAP_BIMODAL;
  const useTukey = base.length >= MIN_FOR_TUKEY;
  const fenceHigh = useTukey ? Math.exp(lq3 + TUKEY_K * logIqr) : null;
  const fenceLow = useTukey ? Math.exp(lq1 - TUKEY_K * logIqr) : null;
  const foraDaCerca: R3['foraDaCerca'] = [];
  if (useTukey && !bimodal) for (const o of rest) { if (o.price > (fenceHigh as number)) foraDaCerca.push({ id: o.id, price: o.price, lado: 'acima' }); else if (o.price < (fenceLow as number)) foraDaCerca.push({ id: o.id, price: o.price, lado: 'abaixo' }); }
  const out = new Set(foraDaCerca.map((f) => f.id));
  const atual = meanBand(base);
  const comCercaPrices = rest.filter((o) => !out.has(o.id)).map((o) => o.price);
  const bandCerca = useTukey ? { n: comCercaPrices.length, mean: comCercaPrices.length >= 3 ? mean(comCercaPrices) : null } : meanBand(comCercaPrices);
  const upOnly = rest.filter((o) => !(useTukey && !bimodal && o.price > (fenceHigh as number))).map((o) => o.price);
  const mn = mean(base) as number;
  const nStores = new Set(offs.map((o) => o.skey)).size;
  let veredito = 'ok';
  if (offs.length < 3) veredito = 'sem_media_menos_de_3_ofertas';
  else if (bimodal) veredito = 'em_revisao_bimodal_sem_cerca';
  else if (foraDaCerca.length || implausiveis.length) veredito = 'ok_com_ofertas_fora_da_media';
  else if (base.length >= 3 && Math.abs(mn / med - 1) > 0.1) veredito = 'em_revisao_media_x_mediana>10%';
  return {
    n: offs.length, stores: nStores, min: sortedAll[0], max: sortedAll[sortedAll.length - 1], ratio: sortedAll[sortedAll.length - 1] / sortedAll[0], median: med, mean: mn,
    meanVsMedianPct: (mn / med - 1) * 100, q1, q3, iqrOverMedian: (q3 - q1) / med, logIqr, fenceLow, fenceHigh, maxLogGap: maxGap, gapBetween: between, bimodal,
    implausiveis, foraDaCerca, mediaAtualRegra: atual.mean, nAtualRegra: atual.n, mediaComCerca: bimodal ? null : bandCerca.mean, nComCerca: bandCerca.n, mediaCercaSoSuperior: bimodal || upOnly.length < 3 ? null : mean(upOnly), veredito,
  };
}

// ------------------------------------------------------------------------------------------------
// R1 PS5: chave do titulo. Overlay do piloto: 825 GB sem Slim/Pro = PS5 original (Fat) com confianca media; edicao + Pro mantem o eixo Pro.
// ------------------------------------------------------------------------------------------------
interface Ps5Ident { id: ConsoleIdentity; key: string | null; note: string[]; conf: 'alta' | 'media' | 'baixa'; naoProvado: string[] }
export function identPs5(title: string): Ps5Ident {
  const t = foldTitle(title.replace(/\bp\.? ?s\.? ?5\b/gi, 'ps5'));
  // 825 GB sem Slim/Pro e SEM "digital" = PS5 original (Fat, disco). Com "digital" e ambiguo (Fat digital x Slim digital 825 GB do Brasil): fica 'nd' (incerta).
  const use825 = /\b825 ?gb\b/.test(t) && !/\b(slim|pro)\b/.test(t) && !/\b(digital|all digital|sem leitor|sem disco)\b/.test(t);
  const id = parseConsoleTitle(title, { ps5Unmarked: use825 ? 'base' : 'nd' });
  if (id.scope !== 'in' || !id.key) return { id, key: null, note: [], conf: 'baixa', naoProvado: [] };
  let key = id.key; const note: string[] = [];
  let np = [...id.unresolved];
  if (id.edition) {
    // Edicao limitada define o produto: modelo nao provado nao reprova (a chave nao usa modelo); so o eixo Pro (hardware diferente) separa.
    np = np.filter((u) => !u.includes('Fat/Slim') && !u.includes('sem marcador') && !u.includes('mídia presumida'));
    if (id.model === 'pro') { key = key.replace('|ed|', '|ed:pro|'); note.push('eixo Pro mantido na edicao (Pro 2 TB != Slim)'); }
  }
  const conf: Ps5Ident['conf'] = np.length === 0 ? 'alta' : np.some((u) => u.includes('não prova')) ? 'baixa' : 'media';
  return { id, key, note, conf, naoProvado: np };
}
function nameFromKey(key: string, id: ConsoleIdentity): string {
  const m = id.model === 'pro' ? 'Pro' : id.model === 'slim' ? 'Slim' : id.model === 'base' ? '(original)' : '(modelo nao provado)';
  const mid = id.media === 'digital' ? 'Digital' : id.media === 'disc' ? 'com leitor de disco' : '';
  return ['Console PlayStation 5', m, mid, id.edition ? `Edicao ${id.edition}` : '', id.pack ? `Pacote ${id.packSignature}` : '', id.region ? `Regiao ${id.region}` : ''].filter(Boolean).join(' ') + ` [${key}]`;
}

// ------------------------------------------------------------------------------------------------
// R1 Resident Evil: leitor proprio (plataforma, midia, edicao, lote/combo, versao)
// ------------------------------------------------------------------------------------------------
function identRe(title: string) {
  const t = foldTitle(title);
  const plat = /\b(ns2|switch 2)\b/.test(t) ? 'switch_2' : derivePlatformFromTitle(t);
  const fisico = /\b(fisic[oa]|midia fisica|cartucho|lacrado)\b/.test(t);
  const digital = /\b(digital|codigo|chave|key|download|eshop)\b/.test(t);
  const media = fisico && !digital ? 'fisica' : digital && !fisico ? 'digital' : 'nd';
  const edM = /\b(deluxe|collector|colecionador|steelbook|gold|ultimate|day one|limitada|limited)\b/.exec(t);
  const lote = /\+|\b(combo|kit|lote|bundle)\b|\b\d+ ?(jogos|unidades|pecas)\b|\b\d ?x\b/.test(t);
  const versao = /\b(switch 2 edition|upgrade|atualizacao)\b/.test(t) ? 'switch2_edition' : 'padrao';
  const naoProvado: string[] = [];
  if (media === 'nd') naoProvado.push('midia fisica x digital (titulo nao diz)');
  if (!edM) naoProvado.push('edicao (titulo nao cita; "Generation Pack" e o nome do produto)');
  naoProvado.push('conteudo do pacote/lote (titulo nao lista os jogos)');
  naoProvado.push('condicao novo/usado/lacrado (titulo nao diz)');
  const key = `re-generation-pack|${plat}|midia:${media}|ed:${edM ? edM[1] : 'std'}|${lote ? 'combo' : 'avulso'}|v:${versao}`;
  return { key, plat, media, edicao: edM ? edM[1] : null, lote, versao, confianca: media === 'nd' ? 'baixa' : 'media', naoProvado };
}

// ------------------------------------------------------------------------------------------------
async function main() {
  const sql = connect();
  try {
    const out = await sql.begin('read only', async (tx) => run(tx as unknown as Sql));
    fs.mkdirSync(PLAN_DIR, { recursive: true });
    const jf = path.join(PLAN_DIR, `piloto-identidade-itens-plano-${stamp}.json`);
    const tf = path.join(PLAN_DIR, `piloto-identidade-itens-resumo-${stamp}.txt`);
    fs.writeFileSync(jf, JSON.stringify(out.plan, null, 2));
    fs.writeFileSync(tf, out.lines.join('\n'));
    console.log(out.lines.join('\n'));
    console.log(`\nPlano: ${path.relative(process.cwd(), jf)}\nResumo: ${path.relative(process.cwd(), tf)}\nSIMULACAO: nada foi escrito no banco.`);
  } finally { await sql.end({ timeout: 5 }); }
}

async function run(sql: Sql) {
  const lines: string[] = []; const L = (s = '') => lines.push(s);
  const mastersRaw = await sql<MasterRow[]>`
    SELECT m.id::text, m.name, m.product_type::text pt, m.game_platform_gen::text plat, false AS stray,
           (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status='active' AND o.quarantined_at IS NULL) AS "activeOffers"
    FROM master_products m WHERE m.vertical='games' AND (m.attributes->>'mergedInto') IS NULL AND m.product_type='console' AND m.game_platform_gen='ps5'`;
  const strays = await sql<MasterRow[]>`
    SELECT m.id::text, m.name, m.product_type::text pt, m.game_platform_gen::text plat, true AS stray,
           (SELECT count(*)::int FROM affiliate_offers o WHERE o.master_product_id = m.id AND o.status='active' AND o.quarantined_at IS NULL) AS "activeOffers"
    FROM master_products m WHERE m.vertical='games' AND (m.attributes->>'mergedInto') IS NULL AND m.product_type<>'console'
      AND m.name ~* '(playstation ?5|ps ?5)'
      AND m.name ~* '(^|[^a-z])(console|videogame|video game)([^a-z]|$)|^(sony )?(playstation ?5|ps5)[^a-z]*(slim|pro|digital|825|1 ?tb)'
      AND EXISTS (SELECT 1 FROM affiliate_offers o WHERE o.master_product_id=m.id AND o.status='active')`;
  const masters = [...mastersRaw, ...strays];
  const mById = new Map(masters.map((m) => [m.id, m]));
  const mIdent = new Map(masters.map((m) => [m.id, identPs5(m.name)]));
  // Masters cujo proprio nome nao e console PS5 (Portal, leitor de disco etc): fora do piloto (nao misturam console com console).
  const pilotMasters = masters.filter((m) => mIdent.get(m.id)!.id.scope === 'in' && mIdent.get(m.id)!.id.family === 'ps5');
  const foraPiloto = masters.filter((m) => !pilotMasters.includes(m) && m.activeOffers > 0).map((m) => ({ id: m.id, name: m.name, tipo: m.pt, ativas: m.activeOffers, motivo: mIdent.get(m.id)!.id.reason }));
  const pilotIds = pilotMasters.map((m) => m.id);
  const offers = await sql<OfferRow[]>`
    SELECT o.id::text, o.master_product_id::text AS mid, o.title, o.current_price_cents::float8 AS price, n.slug AS net,
           COALESCE(o.store_name,'') AS store, o.seller_id::text AS seller
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id
    WHERE o.status='active' AND o.quarantined_at IS NULL AND o.current_price_cents>0 AND o.master_product_id = ANY(${pilotIds}::uuid[])`;
  const stored = await sql<Array<{ mid: string; avg: number | null; n: number; day: string }>>`
    SELECT DISTINCT ON (master_product_id) master_product_id::text AS mid, avg_cents::float8 AS avg, n_offers AS n, day::text AS day
    FROM price_daily_state WHERE master_product_id = ANY(${pilotIds}::uuid[]) ORDER BY master_product_id, day DESC`;
  const quar = await sql<Array<{ price: number }>>`
    SELECT o.current_price_cents::float8 AS price FROM affiliate_offers o WHERE o.status='active' AND o.quarantined_at IS NOT NULL AND o.master_product_id = ANY(${pilotIds}::uuid[])`;
  const storedBy = new Map(stored.map((s) => [s.mid, s]));

  // ---------------- R1: decisao por oferta (so titulo, sem preco) ----------------
  const decisions: Decision[] = [];
  const identOf = new Map<string, Ps5Ident>();
  for (const o of offers) {
    const pi = identPs5(o.title); identOf.set(o.id, pi);
    const id = pi.id; const m = mById.get(o.mid)!;
    const base = { offerId: o.id, title: o.title, price: o.price, net: o.net, store: o.store || o.seller || '', fromMasterId: o.mid, destinoMasterId: null, criarMasterChave: null as string | null };
    if (id.scope !== 'in' || !pi.key) {
      decisions.push({ ...base, bucket: 'fora_escopo', key: null, confianca: 'n/a', naoProvado: [], acoes: ['marcar_fora_da_media'], motivos: [`nao e console PS5 em linha: ${id.reason}`] }); continue;
    }
    if (id.condition !== 'new') {
      decisions.push({ ...base, bucket: 'condicao', key: pi.key, confianca: pi.conf, naoProvado: pi.naoProvado, acoes: ['marcar_fora_da_media'], motivos: [`condicao ${id.condition}: fora das medias (regra do dono)`] }); continue;
    }
    if (pi.conf === 'baixa') {
      decisions.push({ ...base, bucket: 'incerta', key: pi.key, confianca: 'baixa', naoProvado: pi.naoProvado, acoes: ['marcar_incerta'], motivos: ['titulo nao prova a versao; fail-closed: visivel, fora da media'] }); continue;
    }
    decisions.push({ ...base, bucket: 'grupo', key: pi.key, confianca: pi.conf, naoProvado: pi.naoProvado, acoes: [], motivos: [...pi.note] });
    void m;
  }

  // ---------------- Particao: grupos por chave; destino ----------------
  const groups = new Map<string, Decision[]>();
  for (const d of decisions) if (d.bucket === 'grupo' && d.key) (groups.get(d.key) ?? groups.set(d.key, []).get(d.key)!).push(d);
  // master canonico por chave: master de console (nao stray) cuja propria identidade = chave, com mais ofertas do grupo.
  const consoleMasters = pilotMasters.filter((m) => !m.stray && mIdent.get(m.id)!.id.condition === 'new');
  const canonical = new Map<string, MasterRow>();
  for (const key of groups.keys()) {
    const cands = consoleMasters.filter((m) => mIdent.get(m.id)!.key === key);
    if (!cands.length) continue;
    const held = (m: MasterRow) => groups.get(key)!.filter((d) => d.fromMasterId === m.id).length;
    canonical.set(key, [...cands].sort((a, b) => held(b) - held(a) || b.activeOffers - a.activeOffers || a.id.localeCompare(b.id))[0]);
  }
  const novos = new Map<string, { key: string; nome: string; ofertas: number }>();
  for (const [key, ds] of groups) {
    const canon = canonical.get(key);
    const sample = identPs5(ds[0].title).id;
    for (const d of ds) {
      if (canon) {
        d.destinoMasterId = canon.id;
        if (d.fromMasterId === canon.id) d.acoes.push('manter');
        else { d.acoes.push('mover'); d.motivos.push(`chave ${key} pertence ao master ${sh(canon.id)}`); }
      } else {
        d.criarMasterChave = key; d.acoes.push('mover_para_master_novo');
        d.motivos.push(`nenhum master de console com a chave ${key}: criar master proprio`);
      }
    }
    if (!canon) novos.set(key, { key, nome: nameFromKey(key, sample), ofertas: ds.length });
  }
  // duplicatas de master (mesma chave, 2+ masters): informativo (as ofertas ja migram ao canonico)
  const unioes: Array<{ key: string; canonico: string; duplicados: string[] }> = [];
  for (const [key, canon] of canonical) {
    const dups = consoleMasters.filter((m) => mIdent.get(m.id)!.key === key && m.id !== canon.id && m.activeOffers > 0);
    if (dups.length) unioes.push({ key, canonico: canon.id, duplicados: dups.map((d) => d.id) });
  }

  // ---------------- R3 por grupo ----------------
  const analises: Array<{ key: string; kind: string; confianca: string; masterDestino: string | null; masterDestinoNome: string | null; r3: R3; naoProvado: string[] }> = [];
  for (const [key, ds] of groups) {
    const a = r3(ds.map((d) => ({ id: d.offerId, price: d.price, skey: `${d.net}:${d.store}` })));
    const sample = identPs5(ds[0].title).id;
    for (const im of a.implausiveis) { const d = ds.find((x) => x.offerId === im.id)!; d.acoes.push('quarentenar'); d.motivos.push(`preco implausivel: ${im.motivo}`); }
    for (const f of a.foraDaCerca) { const d = ds.find((x) => x.offerId === f.id)!; d.acoes.push('marcar_fora_da_cerca'); d.motivos.push(`fora da cerca de Tukey (log) ${f.lado}: ${brl(f.price)} (cerca ${brl(f.lado === 'acima' ? a.fenceHigh : a.fenceLow)})`); }
    const worst = ds.some((d) => d.confianca === 'media') ? 'media' : 'alta';
    analises.push({ key, kind: sample.pack ? 'pacote' : sample.edition ? 'edicao' : 'avulso', confianca: worst, masterDestino: canonical.get(key)?.id ?? null, masterDestinoNome: canonical.get(key)?.name ?? null, r3: a, naoProvado: [...new Set(ds.flatMap((d) => d.naoProvado))] });
  }
  analises.sort((x, y) => y.r3.n - x.r3.n);

  // ---------------- ANTES (por master atual) ----------------
  const antes = pilotMasters.map((m) => {
    const offs = offers.filter((o) => o.mid === m.id);
    if (!offs.length) return null;
    const prices = offs.map((o) => o.price);
    const mb = meanBand(prices); const sp = storedBy.get(m.id);
    const keys = new Set(offs.map((o) => identOf.get(o.id)?.key ?? 'fora_escopo'));
    const inMaster = offs.map((o) => identOf.get(o.id)!);
    const naoNovo = inMaster.filter((i) => i.id.condition !== 'new').length;
    return {
      masterId: m.id, nome: m.name, chaveDoMaster: mIdent.get(m.id)!.key, ofertasAtivas: offs.length, chavesDistintasNasOfertas: keys.size, ofertasForaEscopo: decisions.filter((d) => d.fromMasterId === m.id && d.bucket === 'fora_escopo').length,
      ofertasCondicaoNaoNova: naoNovo, ofertasIncertas: decisions.filter((d) => d.fromMasterId === m.id && d.bucket === 'incerta').length,
      mediaRecalculada: mb.mean, nRecalculada: mb.n, medianaBruta: medianCont(prices), min: Math.min(...prices), max: Math.max(...prices), ratio: Math.max(...prices) / Math.min(...prices),
      mediaArmazenada: sp?.avg ?? null, nArmazenada: sp?.n ?? null, diaArmazenado: sp?.day ?? null,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null).sort((a, b) => b.ofertasAtivas - a.ofertasAtivas);

  // ---------------- Resident Evil ----------------
  const reOffers = await sql<Array<OfferRow & { status: string }>>`
    SELECT o.id::text, o.master_product_id::text AS mid, o.title, o.current_price_cents::float8 AS price, n.slug AS net, COALESCE(o.store_name,'') AS store, o.seller_id::text AS seller, o.status::text AS status
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id=o.network_id
    WHERE o.master_product_id=${RE_MASTER}::uuid AND o.quarantined_at IS NULL AND o.current_price_cents>0 ORDER BY o.current_price_cents`;
  const reActive = reOffers.filter((o) => o.status === 'active');
  const reStored = (await sql<Array<{ avg: number | null; n: number; day: string; med: number | null }>>`
    SELECT avg_cents::float8 AS avg, n_offers AS n, day::text AS day, median_offer_day_cents::float8 AS med FROM price_daily_state WHERE master_product_id=${RE_MASTER}::uuid ORDER BY day DESC LIMIT 1`)[0];
  const reDec = reActive.map((o) => ({ o, i: identRe(o.title) }));
  const reGroups = new Map<string, typeof reDec>();
  for (const x of reDec) (reGroups.get(x.i.key) ?? reGroups.set(x.i.key, []).get(x.i.key)!).push(x);
  const reAnalises = [...reGroups].map(([key, xs]) => ({ key, confianca: xs[0].i.confianca, naoProvado: xs[0].i.naoProvado, r3: r3(xs.map((x) => ({ id: x.o.id, price: x.o.price, skey: `${x.o.net}:${x.o.seller ?? x.o.store}` }))), ofertas: xs.map((x) => ({ id: x.o.id, title: x.o.title, price: x.o.price, net: x.o.net, store: x.o.store || x.o.seller || '' })) }));
  const reSorted = reActive.map((o) => o.price).sort((a, b) => a - b);
  const reSens = {
    upperTail748a990: reActive.filter((o) => o.price >= 74800).map((o) => sh(o.id)),
    mediaSemCaudaSuperior: mean(reActive.filter((o) => o.price < 74800).map((o) => o.price)),
    mediaSemAmazon: mean(reActive.filter((o) => o.net !== 'amazon').map((o) => o.price)),
    mediaTodas: mean(reSorted), mediana: medianCont(reSorted),
  };

  // ---------------- Resumo ----------------
  const bucketN = (b: Bucket) => decisions.filter((d) => d.bucket === b).length;
  const acaoN = (a: string) => decisions.filter((d) => d.acoes.includes(a)).length;
  const summary = {
    modo: 'SIMULACAO (read only)', mastersPs5ConsoleNoPiloto: pilotMasters.length, mastersForaDoPiloto: foraPiloto.length, ofertasAtivasAvaliadas: offers.length,
    gruposPorChave: groups.size, gruposComMasterExistente: canonical.size, gruposQuePedemMasterNovo: novos.size,
    ofertasGrupo: bucketN('grupo'), ofertasIncertas: bucketN('incerta'), ofertasForaEscopo: bucketN('fora_escopo'), ofertasCondicaoNaoNova: bucketN('condicao'),
    manter: acaoN('manter'), mover: acaoN('mover'), moverParaMasterNovo: acaoN('mover_para_master_novo'), marcarIncerta: acaoN('marcar_incerta'),
    marcarForaDaMedia: acaoN('marcar_fora_da_media'), quarentenar: acaoN('quarentenar'), marcarForaDaCerca: acaoN('marcar_fora_da_cerca'), uniaoDeMastersDuplicados: unioes.length,
  };

  L('=== PILOTO DE IDENTIDADE DOS ITENS (SIMULACAO, SOMENTE LEITURA) ===');
  L(`Gerado em ${new Date().toISOString()} | dado real do banco (SELECT em transacao READ ONLY) | R2 e R4 NAO executados`);
  L(JSON.stringify(summary, null, 2));

  L('\n##### PARTE A: PS5 CONSOLE #####');
  L('\n--- ANTES: masters atuais (media armazenada hoje x media recalculada do mesmo universo; cada oferta vale 1) ---');
  for (const a of antes) {
    L(`${sh(a.masterId)} "${a.nome.slice(0, 70)}" | ativas=${a.ofertasAtivas} chaves=${a.chavesDistintasNasOfertas} fora_escopo=${a.ofertasForaEscopo} nao_novo=${a.ofertasCondicaoNaoNova} incertas=${a.ofertasIncertas}`);
    L(`     preco ${brl(a.min)} a ${brl(a.max)} (ratio ${a.ratio.toFixed(1)}x) mediana=${brl(a.medianaBruta)} | media armazenada(${a.diaArmazenado ?? '-'}, n=${a.nArmazenada ?? '-'})=${brl(a.mediaArmazenada)} | recalculada(n=${a.nRecalculada})=${brl(a.mediaRecalculada)}`);
  }
  L('\n--- DEPOIS: grupos propostos por chave de identidade (R1) com R3 ---');
  for (const g of analises) {
    const r = g.r3; const ds = groups.get(g.key)!;
    L(`\n[${g.kind.toUpperCase()}] ${g.key}  | confianca=${g.confianca} | destino: ${g.masterDestino ? `master ${sh(g.masterDestino)} "${(g.masterDestinoNome ?? '').slice(0, 55)}"` : 'CRIAR MASTER NOVO'}`);
    L(`   n=${r.n} lojas=${r.stores} | min=${brl(r.min)} max=${brl(r.max)} ratio=${r.ratio.toFixed(2)}x | mediana=${brl(r.median)} media=${brl(r.mean)} (${r.meanVsMedianPct.toFixed(1)}%) | IQR/mediana=${r.iqrOverMedian.toFixed(2)} | gap bimodal log=${r.maxLogGap.toFixed(2)}${r.gapBetween ? ` entre ${brl(r.gapBetween[0])} e ${brl(r.gapBetween[1])}` : ''}${r.bimodal ? ' BIMODAL' : ''}`);
    L(`   cerca Tukey(log): ${r.fenceHigh == null ? 'n<5: vale plausibilidade' : `${brl(r.fenceLow)} a ${brl(r.fenceHigh)}`} | fora da cerca=${r.foraDaCerca.length} | implausiveis=${r.implausiveis.length} | veredito R3=${r.veredito}`);
    L(`   MEDIA: regra atual=${brl(r.mediaAtualRegra)} (n=${r.nAtualRegra}) -> com cerca=${brl(r.mediaComCerca)} (n=${r.nComCerca}) | cerca so superior=${brl(r.mediaCercaSoSuperior)}`);
    if (g.naoProvado.length) L(`   titulo nao prova: ${g.naoProvado.join('; ')}`);
    for (const d of [...ds].sort((a, b) => a.price - b.price)) L(`     - ${sh(d.offerId)} ${brl(d.price).padStart(14)} ${d.net.padEnd(13)} [${d.acoes.join('+')}] ${d.title.slice(0, 95)}${d.fromMasterId !== d.destinoMasterId ? `  (de ${sh(d.fromMasterId)})` : ''}`);
  }
  for (const [b, titulo] of [['incerta', 'IDENTIDADE INCERTA (visiveis, fora da media)'], ['condicao', 'CONDICAO NAO NOVA (fora da media)'], ['fora_escopo', 'FORA DE ESCOPO (nao e console PS5 em linha)']] as const) {
    const ds = decisions.filter((d) => d.bucket === b).sort((x, y) => x.fromMasterId.localeCompare(y.fromMasterId) || x.price - y.price);
    L(`\n--- ${titulo}: ${ds.length} ofertas ---`);
    for (const d of ds) L(`     - ${sh(d.offerId)} ${brl(d.price).padStart(14)} ${d.net.padEnd(13)} (master ${sh(d.fromMasterId)}) ${d.title.slice(0, 85)} | chave ${d.key ?? '-'} | ${d.motivos[0]}${d.naoProvado.length ? ' | ' + d.naoProvado[0] : ''}`);
  }
  L('\n--- ANTES x DEPOIS por master destino (media armazenada hoje -> media do grupo, regra atual / com cerca) ---');
  const dest = new Map<string, typeof analises>();
  for (const g of analises) if (g.masterDestino) (dest.get(g.masterDestino) ?? dest.set(g.masterDestino, []).get(g.masterDestino)!).push(g);
  for (const [mid, gs] of dest) {
    const a = antes.find((x) => x.masterId === mid); const g = gs.sort((x, y) => y.r3.n - x.r3.n)[0];
    const ref = a?.mediaArmazenada ?? a?.mediaRecalculada ?? null; const dep = g.r3.mediaComCerca;
    L(`     ${sh(mid)} ${(mById.get(mid)?.name ?? '').slice(0, 48).padEnd(48)} antes=${brl(ref)} (n=${a?.nArmazenada ?? a?.nRecalculada ?? '-'}) | depois: regra=${brl(g.r3.mediaAtualRegra)} (n=${g.r3.nAtualRegra}) cerca=${brl(dep)} (n=${g.r3.nComCerca}) | variacao=${ref && dep ? ((dep / ref - 1) * 100).toFixed(1) + '%' : '-'}${gs.length > 1 ? ' (' + gs.length + ' grupos no mesmo master)' : ''}`);
  }
  L(`\nOfertas de confianca media mantidas no grupo (precisam de R2/R4): ${decisions.filter((d) => d.bucket === 'grupo' && d.confianca === 'media').length} de ${decisions.filter((d) => d.bucket === 'grupo').length}`);
  L(`Ofertas PS5 console ja em quarentena hoje (fora de toda leitura): ${quar.length}; maior preco em quarentena ${brl(Math.max(0, ...quar.map((q) => q.price)))}; ${quar.filter((q) => q.price >= MILLION_CENTS).length} com preco >= R$ 1 milhao (nenhuma ativa/fora de quarentena o tem).`);
  L('\n--- Masters fora do piloto (nome nao e console PS5) ---');
  for (const f of foraPiloto) L(`     ${sh(f.id)} (${f.tipo}, ${f.ativas} ativas) "${f.name.slice(0, 70)}" - ${f.motivo}`);
  L('\n--- Masters duplicados (mesma chave) ---');
  for (const u of unioes) L(`     ${u.key}: canonico ${sh(u.canonico)}; duplicados ${u.duplicados.map(sh).join(', ')}`);
  L('\n--- Masters novos propostos ---');
  for (const n of novos.values()) L(`     ${n.nome} (${n.ofertas} ofertas${n.ofertas < 3 ? ', sem media: < 3' : ''})`);

  L('\n##### PARTE B: RESIDENT EVIL GENERATION PACK - NS2 #####');
  L(`Ofertas: ${reOffers.length} nao quarentenadas (${reActive.length} ativas, ${reOffers.length - reActive.length} expiradas fora do calculo). Media armazenada ${reStored?.day}: ${brl(reStored?.avg)} (n=${reStored?.n}), mediana ${brl(reStored?.med)}.`);
  for (const g of reAnalises) {
    const r = g.r3;
    L(`\n[RE] ${g.key} | confianca=${g.confianca}`);
    L(`   n=${r.n} lojas=${r.stores} | min=${brl(r.min)} max=${brl(r.max)} ratio=${r.ratio.toFixed(2)}x | mediana=${brl(r.median)} media=${brl(r.mean)} (${r.meanVsMedianPct.toFixed(1)}%) | IQR/mediana=${r.iqrOverMedian.toFixed(2)} | gap bimodal log=${r.maxLogGap.toFixed(2)}${r.gapBetween ? ` entre ${brl(r.gapBetween[0])} e ${brl(r.gapBetween[1])}` : ''}${r.bimodal ? ' BIMODAL' : ''}`);
    L(`   cerca Tukey(log): ${brl(r.fenceLow)} a ${brl(r.fenceHigh)} | fora da cerca=${r.foraDaCerca.length} | implausiveis=${r.implausiveis.length} | veredito R3=${r.veredito}`);
    L(`   MEDIA: antes (regra atual)=${brl(r.mediaAtualRegra)} n=${r.nAtualRegra} -> depois (cerca)=${brl(r.mediaComCerca)} n=${r.nComCerca}`);
    L(`   titulo nao prova: ${g.naoProvado.join('; ')}`);
    for (const o of g.ofertas) L(`     - ${sh(o.id)} ${brl(o.price).padStart(12)} ${o.net.padEnd(13)} ${o.title}`);
  }
  L(`\nSensibilidade (so alarme, nao prova): media todas=${brl(reSens.mediaTodas)}; mediana=${brl(reSens.mediana)}; sem a cauda >= R$ 748 (${reSens.upperTail748a990.length} ofertas: ${reSens.upperTail748a990.join(',')})=${brl(reSens.mediaSemCaudaSuperior)}; sem Amazon=${brl(reSens.mediaSemAmazon)}.`);

  const limites = [
    'O titulo das 19 ofertas do Mercado Livre do Resident Evil e IDENTICO ("Resident Evil Generation Pack - Ns2", titulo do catalogo ML, nao o titulo do anuncio do vendedor): R1 so enxerga UMA chave. O titulo nao prova midia (fisica x digital), conteudo do pacote, lote/combo, condicao (novo/usado/lacrado) nem se e a versao Switch 2.',
    'Dispersao (R3) e sintoma, nao prova: no RE a faixa R$ 439,90 a R$ 990 e continua (nao ha gap bimodal) e nada cai fora da cerca de Tukey; os 7 anuncios de R$ 748 a R$ 990 so podem ser separados se R4 provar diferenca de atributo ou de condicao.',
    'No PS5, o titulo nao prova: Slim x original quando falta a palavra (tratado como incerta), "Digital" ausente (disco presumido: confianca media), 825 GB sem a palavra digital lido como original (Fat, inferencia do piloto, confianca media; 825 GB + digital fica incerta porque o Slim Digital brasileiro tambem tem 825 GB), 1 TB lido como Slim (inferencia do codigo), condicao quando o titulo cala (presume novo), conteudo real de pacote/kit, lacre, regiao quando o titulo nao cita (presume Brasil) e edicoes que o vendedor nao nomeia.',
    'Identidade de cor nao separa (regra do dono). Capacidade do PS5 nao separa (decisao 2026-11-03); quem carrega e o modelo.',
    'R2 (auditor cego, outro agente): precisa receber SO os titulos (sem chave e sem preco) de cada grupo, apontar pares "diferente/nao provado", e dar segundo parecer nas ofertas de confianca media, nos masters com mais de 30 ofertas (Slim Digital) e nos grupos com mensagem automatica. Este piloto nao substitui o auditor: o classificador e o mesmo codigo.',
    'R4 (API oficial, sem scraping): ML Items/Catalog API (condition, attributes de modelo/capacidade/edicao, listing, seller), Amazon PA-API/Catalog (ASIN/atributos), Shopee Open API. Necessaria para: provar midia e conteudo do pacote do RE; confirmar condicao dos extremos; confirmar modelo/edicao das ofertas de confianca media e das incertas. Nao consultada aqui (sem credenciais).',
    'Preco usado nas medias e o preco atual de cada oferta ativa (1 valor por oferta = oferta-dia de hoje); a media armazenada do price_daily_state usa a elegibilidade de producao e pode diferir da recalculada.',
  ];
  L('\n##### LIMITES #####');
  for (const x of limites) L(`- ${x}`);

  const plan = {
    geradoEm: new Date().toISOString(), versao: 1, modo: 'simulacao', aplicado: false,
    regra: {
      r1: 'chave de identidade deterministica so do titulo (console-identity.ts + overlay do piloto); preco nunca entra',
      r3: `alarme de dispersao; cerca de Tukey em log (Q3+${TUKEY_K}*IQR) com n>=${MIN_FOR_TUKEY} e sem gap bimodal > ${GAP_BIMODAL}; implausivel >= R$ 1.000.000 ou > ${HIGH_MULT}x mediana; n<${MIN_FOR_TUKEY} usa plausibilidade (35% a 3x mediana)`,
      semVeredito: 'sem veredito validado, sem selo e sem mensagem de media (dono, 2026-11-11)',
    },
    reversao: {
      como: 'Nada foi aplicado. Cada decisao guarda fromMasterId e acoes; o inverso e: mover => devolver a fromMasterId; mover_para_master_novo => devolver a fromMasterId e arquivar o master novo; marcar_incerta/marcar_fora_da_media/marcar_fora_da_cerca => limpar o marcador; quarentenar => quarantined_at = NULL. Um apply futuro deve seguir o padrao de auditar-consoles.ts (backup ndjson, log com status committed, transacao unica).',
    },
    summary, antes, grupos: analises.map((g) => ({ ...g, ofertas: groups.get(g.key)!.map((d) => ({ id: d.offerId, titulo: d.title, preco: d.price, rede: d.net, loja: d.store, deMaster: d.fromMasterId, acoes: d.acoes, motivos: d.motivos })) })),
    mastersNovos: [...novos.values()], unioesDeMasters: unioes,
    incertas: decisions.filter((d) => d.bucket === 'incerta'), condicaoNaoNova: decisions.filter((d) => d.bucket === 'condicao'), foraEscopo: decisions.filter((d) => d.bucket === 'fora_escopo'),
    mastersForaDoPiloto: foraPiloto, decisions,
    residentEvil: {
      masterId: RE_MASTER, armazenado: reStored ?? null, grupos: reAnalises, sensibilidade: reSens,
      acoesPropostas: [
        { acao: 'veredito_master', valor: 'em_revisao', motivo: 'titulo identico nas 19 ofertas ML; midia/conteudo/condicao nao provados; falta R2 e R4' },
        { acao: 'solicitar_R4', ofertas: reActive.filter((o) => o.price >= 74800 || o.net === 'amazon' || o.price <= 53347).map((o) => ({ id: o.id, preco: o.price, rede: o.net })) },
        { acao: 'nenhuma_oferta_movida_ou_quarentenada', motivo: 'sem prova de identidade diferente; cerca de Tukey nao marca nenhuma' },
      ],
    },
    limites,
    pendencias: { R2: 'auditor cego (outro agente) sobre os titulos dos grupos, sem preco e sem chave', R4: 'confirmacao de atributos pela API oficial da loja', qa: 'qa-verificador e estatistico-senior antes de qualquer aplicacao' },
  };
  return { lines, plan };
}

// Executa so quando chamado direto (o script de aplicacao importa identPs5/r3/meanBand sem disparar a simulacao).
if (path.basename(process.argv[1] ?? '') === 'piloto-identidade-itens.ts') main().catch((e) => { console.error('FALHA:', e instanceof Error ? (e.stack ?? e.message) : e); process.exit(1); });
