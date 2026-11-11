import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db';
import { parseParametrosRota } from '@/lib/affiliate/ampliar-amostra-params';
import { ampliarAmostraShopee, desfazerRun, type Sql } from '@/server/collector/ampliar-amostra-shopee';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Pro (mesmo teto de collect-shopee); era 60

/** Para de abrir trabalho novo aos 240 s (sobram 60 s para fechar o registro em collector_runs). Era 48 s de 60. */
const ORCAMENTO_MS = 240_000;
const MAX_PARES_NA_RESPOSTA = 40;

/**
 * AMPLIAR AMOSTRA SHOPEE (dono, 2026-11-11): procura na Shopee (Affiliate Open API oficial) a MESMA midia/produto dos masters
 * aprovados das lojas nao-Games e cria OFERTAS em masters existentes (nunca cria master). Roda dentro da Vercel porque as chaves
 * da Shopee so existem la. Protegida por TESTE_LOJA_KEY (header Authorization: Bearer <chave>; sem chave configurada = 503,
 * chave errada/ausente = 401). GET.
 *
 *   ?vertical=esporte[,livros]   obrigatorio (eletrodomesticos|eletroeletronicos|esporte|impressao3d|livros|tecnologia)
 *   &limitMasters=30             masters por vertical (padrao 30, maximo 80)
 *   &offset=0                    pula os N primeiros elegiveis (use proximoOffset da resposta anterior)
 *   &maxCalls=200                teto de chamadas a Shopee nesta rodada (padrao 200, maximo 450; tambem limitado pelo teto horario de 3000 deste job)
 *   &apply=1                     GRAVA (sem isso e dry-run); registro de reversao em collector_runs.meta
 *   ?rollback=<run_id>&apply=1   apaga so as ofertas criadas por aquele run (e suas cotacoes); sem apply so conta. Nunca toca masters.
 */
function authorized(request: NextRequest): 'ok' | 'desligado' | 'negado' {
  const expected = process.env.TESTE_LOJA_KEY;
  if (!expected || expected.length < 24) return 'desligado';
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'negado';
}

export async function GET(request: NextRequest) {
  const auth = authorized(request);
  if (auth !== 'ok') {
    // Tambem aceita CRON_SECRET (Vercel Cron, se o dono quiser agendar). Sem chave valida nenhuma: recusa.
    if (!process.env.CRON_SECRET) return NextResponse.json(auth === 'desligado' ? { error: 'desligado' } : { error: 'nao_autorizado' }, { status: auth === 'desligado' ? 503 : 401 });
    const denied = rejectUnlessCronAuthorized(request);
    if (denied) return denied;
  }

  const q = new URL(request.url).searchParams;
  const parsed = parseParametrosRota((k) => q.get(k));
  if (!parsed.ok) return NextResponse.json({ error: parsed.erro }, { status: 400 });
  const p = parsed.params;
  const sql = (db as unknown as { $client: Sql }).$client;

  if (p.rollback) {
    const r = await desfazerRun(sql, p.rollback, p.apply);
    return NextResponse.json(r, { status: r.ok ? 200 : 404 });
  }

  const started = Date.now();
  try {
    const r = await ampliarAmostraShopee(sql, {
      apply: p.apply,
      verticals: p.verticals,
      limitMasters: p.limitMasters,
      offset: p.offset,
      maxCalls: p.maxCalls,
      deadlineMs: started + ORCAMENTO_MS,
    });
    const status = r.erroApi && (r.erroApi.kind === 'auth' || r.erroApi.kind === 'access') ? 502 : 200;
    return NextResponse.json(
      {
        modo: r.apply ? 'apply' : 'dry-run',
        run_id: r.runId,
        verticais: r.verticals,
        parou_por: r.parou,
        // Erro da Shopee sempre exposto (ex.: kind=auth, code=10020), nunca escondido.
        erro_api: r.erroApi,
        chamadas: r.chamadas,
        por_vertical: Object.fromEntries(
          Object.entries(r.porVertical).map(([v, s]) => [
            v,
            {
              masters_aprovados: s.masters,
              masters_elegiveis: s.elegiveis,
              masters_testados: s.mastersTestados,
              masters_sem_item: s.mastersSemItem,
              itens_lidos: s.itensLidos,
              pares_aceitos: s.paresAceitos,
              ofertas_criadas: s.ofertasCriadas,
              duvidas: s.duvidas,
              descartes_por_motivo: s.descartes,
              proximo_offset: s.proximoOffset,
            },
          ])
        ),
        pares_aceitos: r.pares.slice(0, MAX_PARES_NA_RESPOSTA).map((x) => ({
          vertical: x.vertical,
          master_id: x.masterId,
          master: x.master,
          titulo_shopee: x.itemTitulo,
          preco_centavos: x.precoCentavos,
          loja: x.loja,
          item_id: x.itemId,
          motivo: x.motivo,
        })),
        pares_total: r.pares.length,
        ofertas_criadas: r.offersCreated,
        amostras_descarte: r.amostrasDescarte,
        duracao_ms: Date.now() - started,
        reverter: r.apply && r.runId ? `?rollback=${r.runId}&apply=1` : null,
      },
      { status }
    );
  } catch (e) {
    return NextResponse.json({ error: 'falha', mensagem: String((e as Error).message).slice(0, 300) }, { status: 500 });
  }
}
