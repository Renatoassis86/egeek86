import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized, rejectUnlessCronOrTestKeyDryRun } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db';
import { COBERTURA_LIMITES, coberturaLigada, parseParametrosCobertura } from '@/lib/affiliate/shopee-cobertura';
import { coberturaShopee, desfazerCobertura, medirCategoriasCobertura } from '@/server/collector/cobertura-shopee';
import type { Sql } from '@/server/collector/ampliar-amostra-shopee';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * COBERTURA SHOPEE por listagem de categoria / loja (productOfferV2 oficial; ordem do dono de 2026-11-12). DESLIGADA por padrão.
 * Autorização: Bearer CRON_SECRET (rejectUnlessCronAuthorized; sem CRON_SECRET falha fechada).
 *
 *   SHOPEE_COBERTURA_ATIVA=1     interruptor de ambiente (sem ele a rota responde {desligado:true} e NÃO chama a API)
 *   SHOPEE_COBERTURA_CONFIG      JSON {"categorias":[{"catId":"…","loja":"games|livros|…"}],"lojas":[{"shopId":"…","loja":"…"}]}; vazio = sem fontes
 *   (sem apply)                  DRY-RUN: lê a API e o banco, devolve o que criaria; não grava nem o cursor
 *   ?apply=1                     grava (ofertas ativas p/ identidade forte; rascunho + pergunta na fila p/ dúvida; masters NOVOS sempre em revisão; cursor); ?dry=1 vence
 *   ?loja=livros,games  ?pages=4  ?maxCalls=120  ?maxDuvidas=40  ?maxMasters=30 (masters novos por rodada)  ?fonte=cat:<id>|shop:<id>
 *   Diretriz do dono (2026-11-12): variação de preço e poucas vendas NÃO descartam; produto sem master equivalente é CRIADO (review + dedup + porteiro); preço fora de 0,35x-3x entra quarentenado.
 *   ?probe=cat                   medição somente leitura: productCatIds devolvidos pela API para os masters de cada loja (<= 24 chamadas)
 *   ?rollback=<run_id>&apply=1   apaga só as ofertas/rascunhos/perguntas criadas por aquele run (sem apply só conta)
 * Para o PRIMEIRO 10030. Teto de 800 chamadas por hora deste job. NÃO está no vercel.json: agendar é decisão do dono.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronOrTestKeyDryRun(request);
  if (denied) return denied;
  if (!coberturaLigada(process.env.SHOPEE_COBERTURA_ATIVA)) return NextResponse.json({ desligado: true, como_ligar: 'definir SHOPEE_COBERTURA_ATIVA=1 na Vercel' });

  const q = request.nextUrl.searchParams;
  const rollback = q.get('rollback');
  const sql = (db as unknown as { $client: Sql }).$client;
  if (rollback) {
    if (!/^\d{1,18}$/.test(rollback)) return NextResponse.json({ error: 'rollback_invalido' }, { status: 400 });
    const r = await desfazerCobertura(sql, rollback, q.get('apply') === '1');
    return NextResponse.json(r, { status: r.ok ? 200 : 404 });
  }
  const parsed = parseParametrosCobertura((k) => q.get(k));
  if (!parsed.ok) return NextResponse.json({ error: parsed.erro }, { status: 400 });
  const p = parsed.params;
  const started = Date.now();

  try {
    if (p.probe) return NextResponse.json({ modo: 'probe', ...(await medirCategoriasCobertura(sql, p.lojas)), duracao_ms: Date.now() - started });
    const r = await coberturaShopee(sql, {
      apply: p.apply, lojas: p.lojas, paginas: p.paginas, maxCalls: p.maxCalls, maxDuvidas: p.maxDuvidas, maxMastersNovos: p.maxMastersNovos, fonte: p.fonte,
      deadlineMs: started + COBERTURA_LIMITES.orcamentoMsPadrao,
    });
    console.log('[cobertura-shopee]', JSON.stringify({ modo: r.modo, parou: r.parou, chamadas: r.chamadas.usadas, criadas: r.offersCreated.length, duvidas: r.draftOffers.length, mastersNovos: r.mastersCreated.length, quarentenadas: r.quarentenadas.length }));
    const status = r.erroApi && (r.erroApi.kind === 'auth' || r.erroApi.kind === 'access') ? 502 : 200;
    return NextResponse.json({ ...r, duracao_ms: Date.now() - started, reverter: r.modo === 'apply' && r.runId ? `?rollback=${r.runId}&apply=1` : null }, { status });
  } catch (e) {
    console.error('[cron cobertura-shopee] falhou:', (e as Error).message);
    return NextResponse.json({ error: 'falha' }, { status: 500 });
  }
}
