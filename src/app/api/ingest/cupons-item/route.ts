import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { couponCors as cors, couponGuard as guard } from '@/server/coupons/ingest-guard';
import { listarFilaRevalidacao, resolverUrlsLeitura } from '@/server/coupons/revalidation-queue';
import { sanitizeCouponCode, sanitizeCouponName } from '@/lib/coupons/coupon-name';
import { nomeColunasLigadas } from '@/server/coupons/nome-colunas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * [cupons-item] reaproveita a proteção da rota de links; o texto abaixo é do arquivo original.
 * Links OFICIAIS de afiliado do Mercado Livre (gerados no Gerador de links do programa de afiliados pela aba logada do dono,
 * um por vez, para o par URL -> link ser exato). Decisão do dono em 2026-11-10. O link `meli.la/...` abre a página de afiliado
 * do dono (EGeek 86) com o produto em destaque, e o botão "Ir para produto" leva ao anúncio com o rastreio completo
 * (matt_tool_id, matt_tracing_id, source=affiliate-profile). Mesma proteção da rota da Amazon: origem fixa, token dedicado
 * (sem token = 503 = kill-switch). Cada gravação guarda o link antigo em collector_runs.meta (reversível).
 */
const MAX_ROWS = 100;

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

/**
 * CUPOM POR ANÚNCIO (dono, 2026-11-11): a página do item do Mercado Livre embute o cupom aplicável ("R$ 315,46 com Cupom", campaign_id).
 * A aba logada do dono lê só os itens da fila (o mais barato de cada produto, com link oficial, sem leitura recente) e envia aqui.
 * O servidor só guarda (offer_coupon_reads) e valida: preço com cupom precisa ser menor que o preço atual da oferta.
 * Mesma proteção das outras rotas assistidas (origem fixa, token; sem token = 503).
 */
/**
 * Fila de leitura (compatível com a aba atual: { items: [{ id, url }] }). Agora priorizada pelo Agente de Cupons (cupom na agulha):
 * cupom já divulgado, mensagem pronta na fila, anúncio com cupom visto há pouco e só depois as demais (ver revalidation-queue.ts).
 * Os campos extras (prioridade, motivo, ultima_leitura_min) são opcionais para a aba. ?n=20
 */
export async function GET(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const n = Math.min(Math.max(1, Number(new URL(request.url).searchParams.get('n') ?? 20) || 20), 40);
  const items = await resolverUrlsLeitura(await listarFilaRevalidacao(n));
  return NextResponse.json({ items }, { headers: cors(request) });
}

/** `name` (título da promoção como a página escreve) e `code` (código digitável) são OPCIONAIS: só o que a página mostrou; validados aqui (texto limpo, 80 / 20 caracteres). */
interface CouponRow { campaign_id?: string; label?: string; status?: string; name?: unknown; code?: unknown }

/** "R$ 315,46 com Cupom" -> 31546; null se não bate com o formato. */
function centsFromLabel(label: string): number | null {
  const m = label.match(/R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  const dec = m[2] ? (m[2].length === 1 ? parseInt(m[2], 10) * 10 : parseInt(m[2], 10)) : 0;
  const v = parseInt(m[1].replace(/\./g, ''), 10) * 100 + dec;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** { rows: [{ id, coupons: [{ campaign_id, label, status, name?, code? }] }] } — coupons vazio = lido e sem cupom. */
export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > 120_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: { id: string; coupons?: CouponRow[] }[] };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, MAX_ROWS).filter((r) => r && /^[0-9a-f-]{36}$/i.test(String(r.id)));
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas_validas' }, { status: 400, headers });

  let lidas = 0;
  let comCupom = 0;
  for (const r of rows) {
    const offer = await db.execute<{ price: string }>(sql`
      SELECT o.current_price_cents::text AS price FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id
      WHERE o.id = ${r.id}::uuid AND nn.slug = 'mercado-livre' AND o.status = 'active' LIMIT 1`);
    if (!offer[0]) continue;
    const price = Number(offer[0].price);
    const valid = (Array.isArray(r.coupons) ? r.coupons : [])
      .map((c) => ({ campaign: /^\d{3,12}$/.test(String(c.campaign_id ?? '')) ? String(c.campaign_id) : null, label: String(c.label ?? '').slice(0, 120), status: String(c.status ?? '').slice(0, 40), name: sanitizeCouponName(c.name), code: sanitizeCouponCode(c.code) }))
      .map((c) => ({ ...c, cents: centsFromLabel(c.label) }))
      .filter((c) => c.cents != null && c.cents > 0 && c.cents < price && /cupom/i.test(c.label));
    if (!valid.length) {
      await db.execute(sql`INSERT INTO offer_coupon_reads (offer_id, status, price_seen_cents) VALUES (${r.id}::uuid, 'sem_cupom', ${price}::int)`);
      lidas++;
      continue;
    }
    for (const c of valid) {
      if (nomeColunasLigadas()) {
        await db.execute(sql`
          INSERT INTO offer_coupon_reads (offer_id, campaign_id, status, label, price_with_coupon_cents, price_seen_cents, coupon_name, coupon_code)
          VALUES (${r.id}::uuid, ${c.campaign}, ${c.status || null}, ${c.label}, ${c.cents}::int, ${price}::int, ${c.name}, ${c.code})`);
      } else {
        await db.execute(sql`
          INSERT INTO offer_coupon_reads (offer_id, campaign_id, status, label, price_with_coupon_cents, price_seen_cents)
          VALUES (${r.id}::uuid, ${c.campaign}, ${c.status || null}, ${c.label}, ${c.cents}::int, ${price}::int)`);
      }
      comCupom++;
    }
    lidas++;
  }
  return NextResponse.json({ ok: true, recebidos: rows.length, lidas, com_cupom: comCupom }, { headers });
}
