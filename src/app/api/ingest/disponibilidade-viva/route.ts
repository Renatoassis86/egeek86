import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { couponCors as cors, couponGuard as guard } from '@/server/coupons/ingest-guard';
import { COUPON_ORIGINS_BY_NETWORK } from '@/lib/coupons/page-read';
import { validarLeituraPagina } from '@/lib/messaging/verdade-viva';

const MOTIVO_ESGOTADO = 'esgotado_pagina';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * R-118, VERDADE VIVA. A aba logada (Shopee/ML/Amazon) le a PAGINA do anuncio (preco de lista e disponibilidade) e manda aqui:
 *   { rows: [{ offer_id, disponivel: boolean, preco_cents?: number (obrigatorio se disponivel), motivo?: string }] }  (ate 20 linhas)
 * Grava a leitura viva (`oferta_verificacao_viva`, fonte `pagina_<rede>`); `disponivel:false` (esgotado/pausado) EXPIRA a oferta na mesma transacao (status 'expired',
 * motivo na verificacao): ela sai da vitrine, das mensagens e do site. Reversivel: a coleta reativa a oferta quando a API voltar a lista-la com preco. Origem por REDE (a aba so
 * fala da propria rede); nunca apaga nada.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

function redeDaOrigem(origin: string): string | null {
  for (const [rede, origens] of Object.entries(COUPON_ORIGINS_BY_NETWORK)) if ((origens as readonly string[]).includes(origin)) return rede;
  return null;
}

export async function POST(request: NextRequest) {
  const redeAba = redeDaOrigem(request.headers.get('origin') ?? '');
  const denied = guard(request, redeAba ?? 'mercado-livre');
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > 20_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: Array<Record<string, unknown>> };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const linhas = (Array.isArray(body.rows) ? body.rows : []).slice(0, 20).map((r) => validarLeituraPagina(r ?? {}));
  const validas = linhas.filter((l): l is Extract<typeof l, { ok: true }> => l.ok);
  if (!validas.length) return NextResponse.json({ error: 'sem_linhas_validas', recusadas: linhas.length }, { status: 400, headers });
  let gravadas = 0, expiradas = 0, disponiveis = 0, divergentes = 0, somaDivPct = 0;
  const recusadas: string[] = linhas.filter((l) => !l.ok).map((l) => (l as { erro: string }).erro);
  for (const l of validas) {
    await db.transaction(async (tx) => {
      const of = ((await tx.execute(sql`SELECT n.slug AS rede, o.current_price_cents::int AS banco FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.id = ${l.offerId}::uuid`)) as unknown as { rede: string; banco: number }[])[0];
      // a aba so fala da propria rede (a da Shopee nao atesta oferta da Amazon)
      if (!of || (redeAba && of.rede !== redeAba)) { recusadas.push(!of ? 'oferta_inexistente' : 'rede_diferente_da_aba'); return; }
      await tx.execute(sql`INSERT INTO oferta_verificacao_viva (offer_id, verificado_em, fonte, disponivel, preco_cents, motivo)
        VALUES (${l.offerId}::uuid, now(), ${'pagina_' + of.rede}, ${l.disponivel}, ${l.precoCents}, ${l.motivo})
        ON CONFLICT (offer_id) DO UPDATE SET verificado_em = now(), fonte = EXCLUDED.fonte, disponivel = EXCLUDED.disponivel, preco_cents = EXCLUDED.preco_cents, motivo = EXCLUDED.motivo`);
      gravadas++;
      if (l.disponivel && l.precoCents && of.banco > 0) { disponiveis++; const dv = (Math.abs(l.precoCents - of.banco) / of.banco) * 100; somaDivPct += dv; if (dv > 2) divergentes++; }
      if (!l.disponivel) {
        // QUARENTENA (alem de 'expired'): o coletor reativa 'expired' quando a API de afiliados volta a listar o item (a Shopee lista item esgotado), mas nunca mexe em quarantined_at.
        const u = (await tx.execute(sql`UPDATE affiliate_offers SET status = 'expired', quarantined_at = COALESCE(quarantined_at, now()), quarantine_reason = COALESCE(quarantine_reason, ${MOTIVO_ESGOTADO}), updated_at = now()
          WHERE id = ${l.offerId}::uuid AND (status = 'active' OR quarantined_at IS NULL) RETURNING id`)) as unknown as unknown[];
        expiradas += u.length;
      } else {
        // voltou ao estoque: solta so a quarentena que ESTA rota pos (nunca a de preco absurdo, foto ou outra)
        await tx.execute(sql`UPDATE affiliate_offers SET status = 'active', quarantined_at = NULL, quarantine_reason = NULL, updated_at = now() WHERE id = ${l.offerId}::uuid AND quarantine_reason = ${MOTIVO_ESGOTADO}`);
      }
    });
  }
  // R-119: cada lote vira uma linha de controle (o ritmo por hora da fila da Shopee e a medicao saem daqui); falha ao gravar nunca derruba a resposta
  if (redeAba && gravadas > 0) {
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
      VALUES ('disponibilidade-viva', ${redeAba}, now(), now(), 0, 'ok', ${gravadas}, ${JSON.stringify({ expiradas, disponiveis, divergentes, divMediaPct: disponiveis ? Math.round((somaDivPct / disponiveis) * 10) / 10 : null })}::text::jsonb)`).catch(() => undefined);
  }
  return NextResponse.json({ gravadas, expiradas, recusadas }, { headers });
}
