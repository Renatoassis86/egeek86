/**
 * R-108: modelo de foto "nao nova" (mao / varios jogos). Docs: docs/modelo-foto-nao-nova.md.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/foto-nao-nova.ts levantar
 *   npx tsx ... scripts/foto-nao-nova.ts treinar            # baixa (lotes de 8, pausa) as URLs rotuladas, valida por CV, grava o modelo
 *   npx tsx ... scripts/foto-nao-nova.ts pontuar [--limite 300] [--apply --por "Nome"]   # DRY-RUN por padrao
 *   npx tsx ... scripts/foto-nao-nova.ts --rollback docs/backups/foto-nao-nova-log-<ts>.json [--apply]
 *
 * Seguranca: nunca apaga; nunca toca decisao humana; so 'alto' e gravado e so como quarentena de OFERTA (a mesma marca da regra de 2026-11-15:
 * `affiliate_offers.quarantined_at`), com backup NDJSON e log para reverter. 'medio' vira lista para o dono. Consultas leves, uma por vez.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import {
  FOTO_NAO_NOVA_VERSAO, LADO_PADRAO, decidirFotoNaoNova, dHash, distanciaHash, extrairFeatures, metricas, normalizarVetor, podeMarcar,
  pontuarVetor, sinaisTexto, treinarLogistico, type FotoFeatures, type ModeloLogistico,
} from '../src/lib/catalog/foto-nao-nova';

import { ENCODER, lerEmLotes, type Lida } from './_foto-leitor';

const argv = process.argv.slice(2);
const cmd = argv[0] ?? '';
const APPLY = argv.includes('--apply');
const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const DIR = path.resolve('docs/backups');
const MODELO = path.resolve('src/lib/catalog/foto-nao-nova-modelo.json');
const CACHE = path.resolve('docs/ml/foto-embeddings-rotuladas.json');
const ROTULOS = path.resolve('docs/backups/foto-mao-real-por-url-2026-11-15.json');
// aplicar so acima de max(limiarAlto, 0.8): o limiar 'alto' e o menor que atinge precisao 0.95 e e ruidoso com 198 rotulos
const LIMIAR_APLICAR = Math.max(0.8, Number(arg('--limiar-aplicar') ?? 0));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function levantar() {
  const sql = connect();
  try {
    const [a] = await sql<{ n: number; img: number }[]>`SELECT count(*)::int n, count(*) FILTER (WHERE jsonb_array_length(default_images) > 0)::int img FROM master_products WHERE vertical = 'games' AND COALESCE(attributes->'catalogGate'->>'verdict','') <> 'rejected' AND (attributes->>'mergedInto') IS NULL`;
    console.log('masters games vivos:', a);
    const [b] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM master_products WHERE vertical = 'games' AND attributes->'catalogGate'->>'manual' = 'rejected'`;
    console.log('rejeitados manualmente no catalogo (rotulo positivo gravado no banco):', b!.n);
    const [c] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM affiliate_offers WHERE vertical = 'games' AND status = 'active' AND quarantined_at IS NULL AND image_url IS NOT NULL`;
    console.log('ofertas games ativas, sem quarentena, com imagem:', c!.n);
    const [d] = await sql<{ n: number; m: number }[]>`SELECT count(*)::int n, count(DISTINCT master_product_id)::int m FROM group_messages WHERE vertical = 'games' AND status = 'enviada' AND sent_at > now() - interval '3 days'`;
    console.log('mensagens games enviadas em 3 dias / masters distintos:', d);
  } finally { await sql.end(); }
}

async function treinar() {
  const rot = (JSON.parse(fs.readFileSync(ROTULOS, 'utf8')) as { classes: Record<string, { classe: string }> }).classes;
  const urls = Object.keys(rot).filter((u) => rot[u]!.classe === 'mao_real' || rot[u]!.classe === 'sem_mao_real');
  let cache: Record<string, Lida | null> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const faltam = urls.filter((u) => !(u in cache));
  console.log(`rotuladas: ${urls.length}; em cache: ${urls.length - faltam.length}; a baixar: ${faltam.length}`);
  if (faltam.length) {
    const lidas = await lerEmLotes(faltam);
    for (const [u, v] of lidas) cache[u] = v;
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
  }
  const usaveis = urls.filter((u) => cache[u]);
  console.log(`legiveis: ${usaveis.length}/${urls.length}`);
  const X = usaveis.map((u) => normalizarVetor(cache[u]!.emb));
  const y = usaveis.map((u) => (rot[u]!.classe === 'mao_real' ? 1 : 0));
  // validacao cruzada estratificada de 5 dobras, determinista (ordem por URL)
  const idx = usaveis.map((_, i) => i).sort((a, b) => (usaveis[a]! < usaveis[b]! ? -1 : 1));
  const dobraDe = new Array<number>(usaveis.length);
  const cont = [0, 0];
  for (const i of idx) { dobraDe[i] = cont[y[i]!]!++ % 5; }
  const pcv = new Array<number>(usaveis.length).fill(0);
  for (let d = 0; d < 5; d++) {
    const tr = usaveis.map((_, i) => i).filter((i) => dobraDe[i] !== d);
    const m = treinarLogistico(tr.map((i) => X[i]!), tr.map((i) => y[i]!));
    const modelo = { dim: X[0]!.length, ...m } as ModeloLogistico;
    for (let i = 0; i < usaveis.length; i++) if (dobraDe[i] === d) pcv[i] = pontuarVetor(modelo, X[i]!);
  }
  // limiares: alto = menor limiar com precisao CV >= 0.95; medio = menor limiar com precisao >= 0.80
  let limiarAlto = 1.01, limiarMedio = 1.01; // sem limiar que atinja a precisao exigida = nada e marcado
  for (let t = 0.99; t >= 0.2; t -= 0.01) {
    // o menor limiar que ainda atinge a precisao (aqui o laco desce, entao o ultimo que passa vence)
    const mt = metricas(y, pcv, t);
    if ((mt.precisao ?? 0) >= 0.95) limiarAlto = Math.round(t * 100) / 100;
    if ((mt.precisao ?? 0) >= 0.8) limiarMedio = Math.round(t * 100) / 100;
  }
  const mAlto = metricas(y, pcv, limiarAlto), mMedio = metricas(y, pcv, limiarMedio), m50 = metricas(y, pcv, 0.5);
  const final = treinarLogistico(X, y);
  const modelo: ModeloLogistico = {
    versao: FOTO_NAO_NOVA_VERSAO, encoder: ENCODER, dim: X[0]!.length, ...final, limiarAlto, limiarMedio,
    metricas: { n: usaveis.length, positivos: y.filter(Boolean).length, validacao: 'cruzada 5 dobras estratificada, determinista', limiar50: m50, alto: { limiar: limiarAlto, ...mAlto }, medio: { limiar: limiarMedio, ...mMedio }, rotulos: 'docs/backups/foto-mao-real-por-url-2026-11-15.json (classificacao visual do assistente, NAO bloqueios do dono)', treinadoEm: new Date().toISOString() },
  };
  fs.writeFileSync(MODELO, JSON.stringify(modelo, null, 1));
  console.log(JSON.stringify(modelo.metricas, null, 1));
}

function carregarModelo(): ModeloLogistico { return JSON.parse(fs.readFileSync(MODELO, 'utf8')) as ModeloLogistico; }

interface Cand { oferta: string; master: string; nome: string; url: string; vendedor: string | null; catalogo: string | null; gate: { manual?: string | null; verdict?: string | null } | null }

async function pontuar() {
  const modelo = carregarModelo();
  const limite = Number(arg('--limite') ?? 300);
  const sql = connect();
  try {
    // uma leitura leve: ofertas ativas de games com imagem, cuja oferta enviada nos ultimos 3 dias (os que o usuario realmente ve)
    const rows = await sql<{ oferta: string; master: string; nome: string; url: string; vendedor: string | null; catalogo: string | null; gate: Cand['gate'] }[]>`
      SELECT o.id::text AS oferta, m.id::text AS master, m.name AS nome, o.image_url AS url, o.store_name AS vendedor,
             (m.default_images ->> 0) AS catalogo, m.attributes -> 'catalogGate' AS gate
      FROM affiliate_offers o JOIN master_products m ON m.id = o.master_product_id
      WHERE o.vertical = 'games' AND o.status = 'active' AND o.quarantined_at IS NULL AND o.image_url IS NOT NULL
        AND o.id IN (SELECT offer_id FROM group_messages WHERE vertical = 'games' AND status = 'enviada' AND sent_at > now() - interval '3 days' AND offer_id IS NOT NULL ORDER BY sent_at DESC LIMIT ${limite * 2})
      LIMIT ${limite}`;
    console.log('candidatos lidos:', rows.length);
    const elegiveis = rows.filter((r) => podeMarcar({ manual: r.gate?.manual, verdict: r.gate?.verdict }));
    console.log('sem decisao humana nem rejeicao:', elegiveis.length);
    const urls = [...new Set(elegiveis.map((r) => r.url))];
    const lidas = await lerEmLotes(urls);
    const catUrls = [...new Set(elegiveis.map((r) => r.catalogo).filter((u): u is string => !!u && !lidas.has(u)))].slice(0, 400);
    const catLidas = await lerEmLotes(catUrls);
    const res: Array<Cand & { pont: number; faixa: string; motivo: string | null; razoes: string[]; dist: number | null }> = [];
    let falhas = 0;
    for (const r of elegiveis) {
      const l = lidas.get(r.url);
      if (!l) { falhas++; continue; }
      const cat = r.catalogo && r.catalogo !== r.url ? (catLidas.get(r.catalogo) ?? lidas.get(r.catalogo) ?? null) : null;
      const dist = cat ? distanciaHash(l.hash, cat.hash) : null;
      const s = decidirFotoNaoNova(modelo, { embedding: l.emb, features: l.features, texto: sinaisTexto(r.nome, r.vendedor ?? ''), distCapaOficial: dist });
      res.push({ ...r, pont: s.pontuacao, faixa: s.faixa, motivo: s.motivo, razoes: s.razoes, dist });
    }
    const por = (f: string) => res.filter((x) => x.faixa === f);
    console.log(`pontuadas: ${res.length}; imagem ilegivel: ${falhas}; alto: ${por('alto').length}; medio: ${por('medio').length}; baixo: ${por('baixo').length}`);
    const out = path.join(DIR, `foto-nao-nova-pontuacao-${stamp}.json`);
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ criadoEm: new Date().toISOString(), modelo: { versao: modelo.versao, limiarAlto: modelo.limiarAlto, limiarMedio: modelo.limiarMedio }, alto: por('alto'), medio: por('medio') }, null, 1));
    console.log('lista (alto + medio) em', out);
    for (const x of [...por('alto'), ...por('medio')].slice(0, 25)) console.log(`  ${x.faixa} ${x.pont} | ${x.nome.slice(0, 60)} | ${x.razoes.join('; ')}`);
    if (!APPLY) return void console.log('DRY-RUN: nada gravado. --apply --por "Nome" poe em quarentena SO as de faixa alto.');
    const quem = arg('--por');
    if (!quem) throw new Error('--por obrigatorio com --apply');
    const alvo = por('alto').filter((x) => x.pont >= LIMIAR_APLICAR);
    const bk = path.join(DIR, `foto-nao-nova-${stamp}.ndjson`);
    fs.writeFileSync(bk, alvo.map((x) => JSON.stringify({ oferta: x.oferta, master: x.master, quarantinedAntes: null, motivo: x.motivo, pontuacao: x.pont })).join('\n') + '\n');
    const gravados: string[] = [];
    for (const x of alvo) {
      const u = await sql`UPDATE affiliate_offers SET quarantined_at = now() WHERE id = ${x.oferta}::uuid AND quarantined_at IS NULL`;
      if (u.count) gravados.push(x.oferta);
      await pausa(30);
    }
    const logFile = path.join(DIR, `foto-nao-nova-log-${stamp}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ criadoEm: new Date().toISOString(), por: quem, backup: path.basename(bk), motivo: 'foto_nao_nova', gravados }, null, 1));
    console.log(`GRAVADOS: ${gravados.length}/${alvo.length} | log: ${logFile}`);
  } finally { await sql.end(); }
}

async function rollback(file: string) {
  const log = JSON.parse(fs.readFileSync(file, 'utf8')) as { gravados: string[] };
  console.log('a reverter:', log.gravados.length);
  if (!APPLY) return void console.log('DRY-RUN: use --apply');
  const sql = connect();
  try {
    for (const id of log.gravados) await sql`UPDATE affiliate_offers SET quarantined_at = NULL WHERE id = ${id}::uuid AND quarantined_at IS NOT NULL`;
    console.log('ROLLBACK aplicado.');
  } finally { await sql.end(); }
}

(async () => {
  if (argv.includes('--rollback')) return rollback(arg('--rollback')!);
  if (cmd === 'levantar') return levantar();
  if (cmd === 'treinar') return treinar();
  if (cmd === 'pontuar') return pontuar();
  console.log('uso: levantar | treinar | pontuar [--limite N] [--apply --por Nome] | --rollback <log> [--apply]');
})().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : String(e)); process.exit(1); });
