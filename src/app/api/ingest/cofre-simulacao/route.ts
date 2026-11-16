import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { couponCors as cors, couponGuard as guard } from '@/server/coupons/ingest-guard';
import { TTL_PROVA_MIN } from '@/lib/coupons/cofre';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GANCHO DA SIMULAÇÃO DE CHECKOUT (R-64, etapa 7). A aba logada do dono simula o checkout ATÉ ANTES DE PAGAR (nunca compra, nunca confirma pedido) e manda o resultado aqui:
 *   { rows: [{ offer_id, coupon_ref, resultado: 'aplicado' | 'nao_aplicado', valor_final_cents?, nome?, minimo_cents? }] }
 * `aplicado` grava a prova `simulacao_de_checkout` (maior confiança; TTL 30 min; é a única que sustenta PREÇO FINAL de benefício de cartão). `nao_aplicado` REVOGA o cupom/benefício daquela oferta
 * (leitura divergente derruba tudo). Limite: SIMULACOES_POR_HORA (padrão 30) no total; acima disso responde 429 e não grava. Mesma proteção das outras rotas assistidas (origem fixa, token; sem token = 503).
 * Procedimento para a equipe: docs/causa-raiz-erros-de-cupom-2026-11-16.md (seção "Simulação de checkout").
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function POST(request: NextRequest) {
  const denied = guard(request);
  if (denied) return denied;
  const headers = cors(request);
  const text = await request.text();
  if (text.length > 20_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { rows?: { offer_id?: string; coupon_ref?: string; resultado?: string; valor_final_cents?: number; nome?: string; minimo_cents?: number }[] };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 10).filter((r) => r && /^[0-9a-f-]{36}$/i.test(String(r.offer_id)) && /^[\w:.-]{1,80}$/.test(String(r.coupon_ref)) && (r.resultado === 'aplicado' || r.resultado === 'nao_aplicado'));
  if (!rows.length) return NextResponse.json({ error: 'sem_linhas_validas' }, { status: 400, headers });
  const limite = Math.max(1, Number(process.env.SIMULACOES_POR_HORA) || 30);
  const [uso] = (await db.execute(sql`SELECT count(*)::int AS n FROM coupon_validation_trail WHERE uso = 'simulacao_de_checkout' AND at > now() - interval '1 hour'`)) as unknown as { n: number }[];
  if ((uso?.n ?? 0) + rows.length > limite) return NextResponse.json({ error: 'limite_por_hora', limite, usadas: uso?.n ?? 0 }, { status: 429, headers });
  let gravadas = 0;
  for (const r of rows) {
    const offer = (await db.execute(sql`SELECT nn.slug AS rede FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id WHERE o.id = ${r.offer_id}::uuid AND o.status = 'active'`)) as unknown as { rede: string }[];
    if (!offer[0]) continue;
    const aplicado = r.resultado === 'aplicado';
    const proved = JSON.stringify({ nome: typeof r.nome === 'string' ? r.nome.slice(0, 80) : null, valorFinalCents: Number.isFinite(r.valor_final_cents) ? r.valor_final_cents : null, minimoCents: Number.isFinite(r.minimo_cents) ? r.minimo_cents : null });
    await db.execute(sql`
      INSERT INTO coupon_validations (offer_id, coupon_ref, kind, network_slug, proof_type, state, motivo, proved, read_at, validated_at, expires_at, validator, revoked_at, last_decided_at)
      VALUES (${r.offer_id}::uuid, ${'sim:' + r.coupon_ref}, 'cupom', ${offer[0].rede}, 'simulacao_de_checkout', ${aplicado ? 'divulgavel' : 'revogado'}, ${aplicado ? null : 'simulacao_nao_aplicou'}, ${proved}::jsonb,
              now(), now(), now() + make_interval(mins => ${TTL_PROVA_MIN.simulacao_de_checkout}::int), 'aba logada (simulação até antes de pagar)', ${aplicado ? null : new Date().toISOString()}::timestamptz, now())
      ON CONFLICT (offer_id, coupon_ref) DO UPDATE SET proof_type = EXCLUDED.proof_type, state = EXCLUDED.state, motivo = EXCLUDED.motivo, proved = EXCLUDED.proved, read_at = now(), validated_at = now(),
        expires_at = EXCLUDED.expires_at, validator = EXCLUDED.validator, revoked_at = EXCLUDED.revoked_at, last_decided_at = now()`);
    // Linha própria da simulação (chave `sim:<cupom>`): a decisão normal do cofre não a sobrescreve. `nao_aplicado` também REVOGA a linha normal do mesmo cupom.
    if (!aplicado) await db.execute(sql`UPDATE coupon_validations SET state = 'revogado', motivo = 'simulacao_nao_aplicou', revoked_at = now(), last_decided_at = now() WHERE offer_id = ${r.offer_id}::uuid AND coupon_ref = ${r.coupon_ref}`);
    await db.execute(sql`INSERT INTO coupon_validation_trail (offer_id, coupon_ref, network_slug, kind, uso, acao, motivo, proof_type, detalhe) VALUES (${r.offer_id}::uuid, ${r.coupon_ref}, ${offer[0].rede}, 'cupom', 'simulacao_de_checkout', ${aplicado ? 'liberado' : 'revogado'}, ${aplicado ? null : 'simulacao_nao_aplicou'}, 'simulacao_de_checkout', ${proved}::jsonb)`);
    gravadas++;
  }
  return NextResponse.json({ ok: true, recebidas: rows.length, gravadas, limite_por_hora: limite }, { headers });
}
