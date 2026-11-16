import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { couponCors as cors, couponGuard as guard } from '@/server/coupons/ingest-guard';
import { COUPON_ORIGINS_BY_NETWORK } from '@/lib/coupons/page-read';
import { TTL_PROVA_MIN } from '@/lib/coupons/cofre';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GANCHO DA SIMULAÇÃO DE CHECKOUT (R-64/R-66). A aba logada do dono simula o checkout ATÉ ANTES DE PAGAR (nunca compra, nunca confirma pedido) e manda o resultado aqui:
 *   { rows: [{ offer_id, coupon_ref, kind?: 'cupom'|'beneficio', resultado: 'aplicado' | 'nao_aplicado', valor_final_cents?, nome?, minimo_cents? }] }
 * `aplicado` grava a prova `simulacao_de_checkout` (TTL 30 min; sustenta PREÇO FINAL; no ML só SOMA a um cupom que já tem campaign_id, nunca substitui a prova do modal).
 * `nao_aplicado` grava uma prova REVOGADA que VETA o cupom/benefício dentro do TTL (podeDivulgar). Regras (QA R-67): origem por REDE (a aba da Amazon simula ofertas da Amazon; ML idem);
 * `valor_final_cents` obrigatório em `aplicado`, 0 < valor < preço da oferta e >= 30% dele; `coupon_ref` precisa existir para a oferta (leitura com essa campanha ou linha do cofre;
 * `sem_campanha` só fora do ML); limite SIMULACOES_POR_HORA (padrão 30) ATÔMICO (lock consultivo + contagem + gravação na mesma transação). Procedimento: docs/causa-raiz-erros-de-cupom-2026-11-16.md.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

/** Rede cuja aba tem esta origem (a rota aceita a origem de cada rede, mas a oferta tem de ser da MESMA rede da aba). */
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
  let body: { rows?: { offer_id?: string; coupon_ref?: string; kind?: string; resultado?: string; valor_final_cents?: number; nome?: string; minimo_cents?: number }[] };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 10).filter((r) => r && /^[0-9a-f-]{36}$/i.test(String(r.offer_id)) && /^[\w:.-]{1,80}$/.test(String(r.coupon_ref)) && (r.resultado === 'aplicado' || r.resultado === 'nao_aplicado'));
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas_validas' }, { status: 400, headers });
  const limite = Math.max(1, Number(process.env.SIMULACOES_POR_HORA) || 30);

  const res = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('cofre-simulacao'))`);
    const [uso] = (await tx.execute(sql`SELECT count(*)::int AS n FROM coupon_validation_trail WHERE uso = 'simulacao_de_checkout' AND at > now() - interval '1 hour'`)) as unknown as { n: number }[];
    if ((uso?.n ?? 0) + rows.length > limite) return { limite429: true as const, usadas: uso?.n ?? 0 };
    let gravadas = 0;
    const recusadas: string[] = [];
    for (const r of rows) {
      const kind = r.kind === 'beneficio' ? 'beneficio' : 'cupom';
      const offer = (await tx.execute(sql`SELECT nn.slug AS rede, o.current_price_cents::int AS price FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id WHERE o.id = ${r.offer_id}::uuid AND o.status = 'active'`)) as unknown as { rede: string; price: number }[];
      if (!offer[0]) { recusadas.push('oferta_inexistente'); continue; }
      if (redeAba && offer[0].rede !== redeAba) { recusadas.push('oferta_de_outra_rede'); continue; }
      const aplicado = r.resultado === 'aplicado';
      const v = r.valor_final_cents;
      if (aplicado && !(Number.isInteger(v) && (v as number) > 0 && (v as number) < offer[0].price && (v as number) >= offer[0].price * 0.3)) { recusadas.push('valor_final_invalido'); continue; }
      const refOk = (r.coupon_ref === 'sem_campanha' && offer[0].rede !== 'mercado-livre') || ((await tx.execute(sql`
        SELECT 1 FROM offer_coupon_reads WHERE offer_id = ${r.offer_id}::uuid AND campaign_id = ${r.coupon_ref} AND read_at > now() - interval '24 hours'
        UNION ALL SELECT 1 FROM coupon_validations WHERE offer_id = ${r.offer_id}::uuid AND coupon_ref = ${r.coupon_ref} LIMIT 1`)) as unknown as unknown[]).length > 0;
      if (!refOk) { recusadas.push('cupom_inexistente_na_oferta'); continue; }
      const proved = JSON.stringify({ nome: typeof r.nome === 'string' ? r.nome.slice(0, 80) : null, valorFinalCents: aplicado ? v : null, minimoCents: Number.isFinite(r.minimo_cents) ? r.minimo_cents : null });
      await tx.execute(sql`
        INSERT INTO coupon_validations (offer_id, coupon_ref, kind, network_slug, proof_type, state, motivo, proved, read_at, validated_at, expires_at, validator, revoked_at, last_decided_at)
        VALUES (${r.offer_id}::uuid, ${'sim:' + r.coupon_ref}, ${kind}, ${offer[0].rede}, 'simulacao_de_checkout', ${aplicado ? 'divulgavel' : 'revogado'}, ${aplicado ? null : 'simulacao_nao_aplicou'}, ${proved}::jsonb,
                now(), now(), now() + make_interval(mins => ${TTL_PROVA_MIN.simulacao_de_checkout}::int), 'aba logada (simulação até antes de pagar)', ${aplicado ? null : new Date().toISOString()}::timestamptz, now())
        ON CONFLICT (offer_id, coupon_ref) DO UPDATE SET kind = EXCLUDED.kind, proof_type = EXCLUDED.proof_type, state = EXCLUDED.state, motivo = EXCLUDED.motivo, proved = EXCLUDED.proved, read_at = now(), validated_at = now(),
          expires_at = EXCLUDED.expires_at, validator = EXCLUDED.validator, revoked_at = EXCLUDED.revoked_at, last_decided_at = now()`);
      if (!aplicado) await tx.execute(sql`UPDATE coupon_validations SET state = 'revogado', motivo = 'simulacao_nao_aplicou', revoked_at = now(), last_decided_at = now() WHERE offer_id = ${r.offer_id}::uuid AND coupon_ref = ${r.coupon_ref}`);
      await tx.execute(sql`INSERT INTO coupon_validation_trail (offer_id, coupon_ref, network_slug, kind, uso, acao, motivo, proof_type, detalhe) VALUES (${r.offer_id}::uuid, ${r.coupon_ref}, ${offer[0].rede}, ${kind}, 'simulacao_de_checkout', ${aplicado ? 'liberado' : 'revogado'}, ${aplicado ? null : 'simulacao_nao_aplicou'}, 'simulacao_de_checkout', ${proved}::jsonb)`);
      gravadas++;
    }
    return { limite429: false as const, gravadas, recusadas };
  });
  if (res.limite429) return NextResponse.json({ error: 'limite_por_hora', limite, usadas: res.usadas }, { status: 429, headers });
  return NextResponse.json({ ok: true, recebidas: rows.length, gravadas: res.gravadas, recusadas: res.recusadas, limite_por_hora: limite }, { headers });
}
