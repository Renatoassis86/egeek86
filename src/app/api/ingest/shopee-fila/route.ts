import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { couponCors as cors, couponGuard as guard } from '@/server/coupons/ingest-guard';
import { VITRINE_PLATAFORMAS, VITRINE_TETO_CENTAVOS, escolherMenores, montarJogosVitrine } from '@/lib/messaging/vitrine-games';
import { carregarOfertasVitrine } from '@/server/messaging/vitrine-games';
import { decidirFila, priorizarFila, shopeeVivoLigado, urlLeituraShopee, type CandidatoShopee } from '@/lib/messaging/shopee-fila-viva';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const rows = <T>(r: unknown) => r as unknown as T[];
const JOB_BLOQUEIO = 'shopee-vivo-bloqueio';

/**
 * R-119, FILA DE LEITURA DA SHOPEE. A aba logada pergunta QUAIS paginas ler e QUANDO; o servidor responde so dentro da janela que antecede a vitrine de jogos (14 min antes da marca
 * do cron), so com os N itens da Shopee mais baratos de cada plataforma na ordem da vitrine (os 30 candidatos que ela verifica) e so quem ainda precisa de leitura.
 *   GET  /api/ingest/shopee-fila  -> { servir, motivo?, reabre_em_min?, itens: [{ offer_id, item_id, url, preco_esperado_cents, plataforma, posicao, idade_min }] }
 *   POST /api/ingest/shopee-fila  { evento: 'verificacao' | 'retomada', detalhe? }  -> registra a verificacao anti-robo (a fila fecha por 90 min; nada tenta contornar).
 * Mesma protecao das rotas de cupom (origem da Shopee + token). Kill-switch: SHOPEE_VIVO=off. Fila e ritmo em src/lib/messaging/shopee-fila-viva.ts.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

let cache: { em: number; cands: CandidatoShopee[] } | null = null;
const CACHE_MS = 150_000;

async function candidatosShopee(): Promise<CandidatoShopee[]> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.cands;
  const ofertas = await carregarOfertasVitrine();
  const { jogos } = montarJogosVitrine(ofertas);
  const porPlat = VITRINE_PLATAFORMAS.map((p) => ({ p, lista: escolherMenores(jogos, p.gens, 30).filter((j) => j.precoCentavos <= VITRINE_TETO_CENTAVOS && !!j.ofertaId) }));
  const ids = [...new Set(porPlat.flatMap((x) => x.lista.map((j) => j.ofertaId as string)))];
  if (!ids.length) return [];
  const info = rows<{ oid: string; ref: string | null }>(await db.execute(sql`
    SELECT o.id::text AS oid, o.external_ref AS ref
    FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE n.slug = 'shopee' AND o.id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`));
  const por = new Map(info.map((x) => [x.oid, x]));
  const cands: CandidatoShopee[] = [];
  for (const { p, lista } of porPlat) {
    let pos = 0;
    for (const j of lista) {
      const x = por.get(j.ofertaId as string);
      const m = /^shopee-(\d{1,19})$/.exec(x?.ref ?? '');
      // a posicao conta TODOS os candidatos da plataforma (nao so Shopee): e a ordem real em que a vitrine verifica
      if (x && m) cands.push({ offerId: j.ofertaId as string, itemId: m[1], plataforma: p.key, posicao: pos, precoCents: j.precoCentavos, idadeMin: null });
      pos++;
    }
  }
  cache = { em: Date.now(), cands };
  return cands;
}

export async function GET(request: NextRequest) {
  const denied = guard(request, 'shopee');
  if (denied) return denied;
  const headers = cors(request);
  const now = new Date();
  const est = rows<{ lidas: number | null; verif: number | null }>(await db.execute(sql`
    SELECT (SELECT COALESCE(sum(checked), 0)::int FROM collector_runs WHERE job = 'disponibilidade-viva' AND network = 'shopee' AND started_at > now() - interval '60 minutes') AS lidas,
           (SELECT CASE WHEN status = 'error' THEN (extract(epoch FROM now() - started_at) / 60.0)::float8 END FROM collector_runs WHERE job = ${JOB_BLOQUEIO} AND started_at > now() - interval '6 hours' ORDER BY started_at DESC LIMIT 1) AS verif`))[0];
  const d = decidirFila({ now, lidasUltimaHora: est?.lidas ?? 0, minDesdeVerificacao: est?.verif ?? null, desligado: !shopeeVivoLigado() });
  if (!d.servir) return NextResponse.json({ servir: false, motivo: d.motivo, reabre_em_min: d.reabreEmMin ?? null, itens: [] }, { headers });
  // a lista de candidatos vem do cache de 2,5 min; a IDADE da leitura e sempre fresca (leitura gravada ha pouco nao volta para a fila)
  const base = await candidatosShopee();
  const idades = base.length ? rows<{ oid: string; idade: number }>(await db.execute(sql`SELECT offer_id::text AS oid, (extract(epoch FROM now() - verificado_em) / 60.0)::float8 AS idade
    FROM oferta_verificacao_viva WHERE fonte = 'pagina_shopee' AND offer_id IN (${sql.join(base.map((c) => sql`${c.offerId}::uuid`), sql`, `)})`)) : [];
  const idadePor = new Map(idades.map((x) => [x.oid, x.idade]));
  const cands = base.map((c) => ({ ...c, idadeMin: idadePor.get(c.offerId) ?? null }));
  const fila = priorizarFila(cands, { minAteVitrine: d.minAteVitrine, limite: d.limite });
  const itens = fila.flatMap((f) => {
    const url = urlLeituraShopee(f.itemId);
    return url ? [{ offer_id: f.offerId, item_id: f.itemId, url, preco_esperado_cents: f.precoCents, plataforma: f.plataforma, posicao: f.posicao, idade_min: f.idadeMin == null ? null : Math.round(f.idadeMin * 10) / 10 }] : [];
  });
  return NextResponse.json({ servir: true, min_ate_vitrine: Math.round(d.minAteVitrine * 10) / 10, itens }, { headers });
}

export async function POST(request: NextRequest) {
  const denied = guard(request, 'shopee');
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > 1_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let b: { evento?: unknown; detalhe?: unknown };
  try { b = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  if (b.evento !== 'verificacao' && b.evento !== 'retomada') return NextResponse.json({ error: 'evento_invalido' }, { status: 400, headers });
  const detalhe = typeof b.detalhe === 'string' ? b.detalhe.replace(/[^\w ./:=&?-]/g, '').slice(0, 120) : null;
  // 'verificacao' grava status 'error' e fecha a fila por 90 min; 'retomada' (o dono resolveu) grava 'ok' como linha mais nova e reabre. Nada e apagado.
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
    VALUES (${JOB_BLOQUEIO}, 'shopee', now(), now(), 0, ${b.evento === 'verificacao' ? 'error' : 'ok'}, 0, ${JSON.stringify({ evento: b.evento, detalhe })}::text::jsonb)`);
  return NextResponse.json({ ok: true }, { headers });
}
