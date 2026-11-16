import { NextResponse, type NextRequest } from 'next/server';
import { couponCors as cors, couponGuard as guard } from '@/server/coupons/ingest-guard';
import { lerResultadoCodigo, normalizarCodigo, pistasLigadas } from '@/lib/coupons/candidato';
import { filaDeConferencia, registrarConferencia } from '@/server/coupons/candidatos';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * VALIDADOR DE CÓDIGO DE CUPOM DO ML NA ABA LOGADA (R-79). Atrás da flag CUPOM_PISTAS_COMUNIDADE (desligada = 503 `pistas_desligadas`).
 *   GET  -> { fila: [{ codigo, valor_texto, minimo_cents, limite_cents, escopo_dito, fontes }] } até 3 candidatos que podem ser conferidos agora
 *           (30 min entre conferências do mesmo código, 3 tentativas no máximo).
 *   POST { codigo, texto } -> o texto do modal DEPOIS de "Inserir código" (a aba só lê; o servidor interpreta). Registra o estado do candidato e, se a LOJA
 *           declarou "Em todo o Mercado Livre", entra no pipeline normal de cupons (cofre R-64, prova lista_oficial_de_cupons). Nada é divulgado por aqui.
 * Origem fixa do ML + token, como as outras rotas assistidas. O código inserido não é dado pessoal; o resultado é só a janela de validação.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function GET(request: NextRequest) {
  const denied = guard(request, 'mercado-livre');
  if (denied) return denied;
  const headers = cors(request);
  if (!pistasLigadas()) return NextResponse.json({ error: 'pistas_desligadas' }, { status: 503, headers });
  const fila = await filaDeConferencia(new Date(), 3);
  return NextResponse.json({
    fila: fila.map((c) => ({ codigo: c.codigo, valor_texto: c.valor_num ? `${c.valor_tipo === 'percentual' ? c.valor_num + '%' : 'R$ ' + c.valor_num}` : null, minimo_cents: c.minimo_cents ? Number(c.minimo_cents) : null, limite_cents: c.limite_cents ? Number(c.limite_cents) : null, escopo_dito: c.escopo_dito, fontes: c.fontes.length })),
  }, { headers });
}

export async function POST(request: NextRequest) {
  const denied = guard(request, 'mercado-livre');
  if (denied) return denied;
  const headers = cors(request);
  if (!pistasLigadas()) return NextResponse.json({ error: 'pistas_desligadas' }, { status: 503, headers });
  const text = await request.text();
  if (text.length > 5000) return NextResponse.json({ error: 'corpo_grande_demais' }, { status: 413, headers });
  let body: { codigo?: unknown; texto?: unknown };
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'json_invalido' }, { status: 400, headers }); }
  const codigo = typeof body.codigo === 'string' ? normalizarCodigo(body.codigo) : null;
  if (!codigo) return NextResponse.json({ error: 'codigo_invalido' }, { status: 400, headers });
  if (typeof body.texto !== 'string' || body.texto.length > 1500) return NextResponse.json({ error: 'texto_invalido' }, { status: 400, headers });
  const now = new Date();
  const r = lerResultadoCodigo(body.texto, now);
  const res = await registrarConferencia(codigo, r, now);
  if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 404, headers });
  return NextResponse.json({ ok: true, resultado: r.resultado, estado: res.estado, motivo: res.motivo, ingestao: res.ingestao ?? null }, { headers });
}
