/**
 * R-116: pontuacao de foto (modelo R-109, CLIP local + regressao) das ofertas que PODEM entrar na vitrine de jogos por plataforma. Roda FORA do caminho do envio:
 * a vitrine so le `vitrine_foto_pontuacao` (padrao negado: sem pontuacao = o jogo nao entra). Cache por md5 da URL da imagem; nunca grava quarentena, nunca apaga.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/foto-vitrine-pontuar.ts [--por-plataforma 40] [--orcamento 240] [--dry]
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/foto-vitrine-pontuar.ts --loop [--cada 8]     # laco continuo (reinicia em erro)
 *
 * PERMANENTE (R-119, B): tarefa agendada do Windows `Egeek86-FotoVitrine` (scripts/foto-vitrine-tarefa.ps1 -Acao Instalar) roda UMA rodada (sem --loop) a cada 8 min; se a maquina
 * reiniciar ou o processo morrer, a proxima disparada recomeca (reinicio automatico). Cada rodada bate em collector_runs, job `foto-vitrine-pontuar` (status ok|error, checked =
 * pontuadas, meta = contagem), que o vigia le. O CLIP local (@huggingface/transformers + onnxruntime + sharp, centenas de MB) nao cabe em funcao serverless: por isso e local.
 *
 * Candidatas: por plataforma, as N ofertas MAIS BARATAS que passam na camada de condicao (titulo/vendedor) e ainda nao tem pontuacao valida (< 10 dias).
 * Orcamento de tempo por rodada; imagem ilegivel/indisponivel = nao grava (o jogo continua fora).
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './_dup-shared';
import { lerEmLotes } from './_foto-leitor';
import { FOTO_NAO_NOVA_VERSAO, decidirFotoNaoNova, distanciaHash, sinaisTexto, type ModeloLogistico } from '../src/lib/catalog/foto-nao-nova';

const argv = process.argv.slice(2);
const arg = (n: string, d: number) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
const DRY = argv.includes('--dry');
const LOOP = argv.includes('--loop');
const POR_PLAT = arg('--por-plataforma', 40);
const ORCAMENTO_S = arg('--orcamento', 240);
const CADA_MIN = arg('--cada', 8);
const MODELO = path.resolve('src/lib/catalog/foto-nao-nova-modelo.json');
const md5 = async (s: string) => (await import('node:crypto')).createHash('md5').update(s).digest('hex');
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Batimento em collector_runs (job foto-vitrine-pontuar): nunca derruba a rodada. */
async function bater(status: 'ok' | 'error', t0: number, checked: number, meta: Record<string, unknown>) {
  if (DRY) return;
  const sql = connect();
  try {
    await sql`SET statement_timeout = 8000`;
    await sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
      VALUES ('foto-vitrine-pontuar', 'local', ${new Date(t0).toISOString()}::timestamptz, now(), ${Date.now() - t0}, ${status}, ${checked}, ${JSON.stringify(meta)}::text::jsonb)`;
  } catch { /* o batimento nunca derruba a rodada */ } finally { await sql.end({ timeout: 5 }).catch(() => undefined); }
}

async function rodada(): Promise<{ pontuadas: number; meta: Record<string, unknown> }> {
  const t0 = Date.now();
  const { carregarOfertasVitrine } = await import('../src/server/messaging/vitrine-games');
  const { VITRINE_PLATAFORMAS, condicaoSuspeita, VITRINE_FOTO_VALIDADE_DIAS } = await import('../src/lib/messaging/vitrine-games');
  const modelo = JSON.parse(fs.readFileSync(MODELO, 'utf8')) as ModeloLogistico;
  // a leitura da vitrine em modo foto ligada traz fotoFaixa/idade; ofertas sem pontuacao valida precisam ser pontuadas
  const ofertas = await carregarOfertasVitrine();
  const validade = Math.min(10, VITRINE_FOTO_VALIDADE_DIAS - 4);
  const faltam = ofertas.filter((o) => !condicaoSuspeita(o.tituloOferta, o.masterNome, o.vendedor ?? '') && !!o.imagem && (!o.fotoFaixa || (o.fotoIdadeDias ?? 99) > validade));
  const escolhidas = new Map<string, (typeof faltam)[number]>();
  const porPlat = VITRINE_PLATAFORMAS.map((p) => faltam.filter((o) => !!o.gen && p.gens.includes(o.gen)).sort((a, b) => a.precoCentavos - b.precoCentavos).slice(0, POR_PLAT));
  for (let i = 0; i < POR_PLAT; i++) for (const l of porPlat) if (l[i] && !escolhidas.has(l[i]!.imagem!)) escolhidas.set(l[i]!.imagem!, l[i]!);
  console.log(`[${new Date().toISOString()}] ofertas<=teto: ${ofertas.length}; sem pontuacao valida (e sem barra de texto): ${faltam.length}; a pontuar agora: ${escolhidas.size}`);
  if (!escolhidas.size || DRY) return { pontuadas: 0, meta: { ofertas: ofertas.length, faltam: faltam.length, a_pontuar: escolhidas.size } };
  const sql = connect();
  try {
    const mids = [...new Set([...escolhidas.values()].map((o) => o.masterId))];
    const cat = new Map<string, string>();
    for (let i = 0; i < mids.length; i += 100) {
      for (const r of await sql<{ id: string; c: string | null }[]>`SELECT id::text AS id, (default_images ->> 0) AS c FROM master_products WHERE id = ANY(${mids.slice(i, i + 100)}::uuid[])`) if (r.c) cat.set(r.id, r.c);
    }
    const urls = [...escolhidas.keys()];
    const cont = { pontuadas: 0, ilegiveis: 0, alto: 0, medio: 0, baixo: 0, cortadas: 0 };
    for (let i = 0; i < urls.length; i += 8) {
      if (Date.now() - t0 > ORCAMENTO_S * 1000) { cont.cortadas = urls.length - i; break; }
      const fatia = urls.slice(i, i + 8);
      const lidas = await lerEmLotes(fatia, 8, 0);
      const cats = [...new Set(fatia.map((u) => cat.get(escolhidas.get(u)!.masterId)).filter((c): c is string => !!c && !fatia.includes(c)))];
      const catLidas = cats.length ? await lerEmLotes(cats, 8, 0) : new Map();
      for (const u of fatia) {
        const l = lidas.get(u);
        const o = escolhidas.get(u)!;
        if (!l) { cont.ilegiveis++; continue; }
        const cu = cat.get(o.masterId);
        const c = cu && cu !== u ? catLidas.get(cu) ?? null : null;
        const dist = c ? distanciaHash(l.hash, c.hash) : null;
        const s = decidirFotoNaoNova(modelo, { embedding: l.emb, features: l.features, texto: sinaisTexto(o.tituloOferta, o.vendedor ?? ''), distCapaOficial: dist });
        const gravou = await sql`INSERT INTO vitrine_foto_pontuacao (url_hash, image_url, faixa, pontuacao, motivo, razoes, dist_catalogo, versao, pontuado_em)
          VALUES (${await md5(u)}, ${u}, ${s.faixa}, ${s.pontuacao}, ${s.motivo}, ${s.razoes.join('; ').slice(0, 300)}, ${dist}, ${FOTO_NAO_NOVA_VERSAO}, now())
          ON CONFLICT (url_hash) DO UPDATE SET faixa = EXCLUDED.faixa, pontuacao = EXCLUDED.pontuacao, motivo = EXCLUDED.motivo, razoes = EXCLUDED.razoes, dist_catalogo = EXCLUDED.dist_catalogo, versao = EXCLUDED.versao, pontuado_em = now() RETURNING url_hash`;
        if (gravou.length) { cont.pontuadas++; cont[s.faixa]++; } else cont.ilegiveis++; // so conta o que de fato gravou
      }
      await pausa(500);
    }
    console.log(`  resultado: ${JSON.stringify(cont)} em ${Math.round((Date.now() - t0) / 1000)} s`);
    return { pontuadas: cont.pontuadas, meta: { ...cont, ofertas: ofertas.length, faltam: faltam.length, a_pontuar: escolhidas.size } };
  } finally { await sql.end({ timeout: 5 }); }
}

/** Uma rodada com batimento. Em modo tarefa agendada, erro vira batimento 'error' e codigo de saida 0: a proxima disparada recomeca sozinha. */
async function rodadaComBatimento() {
  const t0 = Date.now();
  try { const r = await rodada(); await bater('ok', t0, r.pontuadas, r.meta); } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 200);
    console.error('ERRO na rodada (segue):', msg);
    await bater('error', t0, 0, { erro: msg });
  }
}

(async () => {
  if (!LOOP) { await rodadaComBatimento(); process.exit(0); }
  for (;;) { // regra do dono: loop nao para; erro = reinicia na proxima volta
    await rodadaComBatimento();
    await pausa(CADA_MIN * 60_000);
  }
})().catch((e) => { console.error('ERRO:', String((e as Error)?.message ?? e).slice(0, 300)); process.exit(1); });
