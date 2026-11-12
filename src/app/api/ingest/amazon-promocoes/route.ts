import { NextResponse, type NextRequest } from 'next/server';
import { couponCors, couponGuard } from '@/server/coupons/ingest-guard';
import { ingestPromocaoAmazon } from '@/server/coupons/amazon-promocoes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * PROMOÇÕES DA AMAZON (páginas /promotion/psp/<ID>), leitura pela aba logada do dono em www.amazon.com.br, SÓ LEITURA (autorizada pelo dono em
 * 2026-11-12). Mesma proteção das rotas de cupom: origem fixa da Amazon + token (sem token = 503 = kill-switch). Corpo até 150 KB.
 *
 *   POST /api/ingest/amazon-promocoes
 *     { lidos_em: ISO com fuso, promo: { id, titulo, banner, termos? }, itens: [{ a: ASIN, t: título, p: "431,06", l: "519,00"? }] }
 *     -> { ok, promo_id, motivo?, itens_lidos, casados, preco_nao_casa, asins_novos[], total_asins_novos, resumo, fechados }
 *
 * O servidor lê a regra e a validade (src/lib/coupons/amazon-promocoes.ts), liga os ASINs que já são oferta e grava em coupon_items.
 * Nada é inventado: sem validade lida, nada é gravado. Prime, quantidade mínima e "seguir a loja" não geram cupom.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: couponCors(request) });
}

export async function POST(request: NextRequest) {
  const denied = couponGuard(request, 'amazon');
  if (denied) return denied;
  const headers = couponCors(request);
  const text = await request.text();
  if (text.length > 150_000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  try {
    const r = await ingestPromocaoAmazon(body);
    return NextResponse.json(r, { status: r.ok || r.motivo ? 200 : 400, headers });
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } } | null)?.cause;
    const code = cause?.code ?? (e as { code?: string } | null)?.code ?? '';
    console.error('[amazon-promocoes] falhou', code, cause?.message ?? (e instanceof Error ? e.message.slice(0, 200) : e));
    // Pooler/rede instável (consulta sem resposta, conexão derrubada): transitório, a aba tenta de novo; todas as gravações são idempotentes.
    if (/SOCKET_TIMEOUT|CONNECTION_|ECONNRESET|ETIMEDOUT|57014/.test(code)) {
      return NextResponse.json({ error: 'banco_instavel', motivo: code }, { status: 503, headers: { ...headers, 'Retry-After': '30' } });
    }
    return NextResponse.json({ error: 'erro_interno', motivo: code || undefined }, { status: 500, headers });
  }
}
