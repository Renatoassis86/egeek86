import { sincronizarVendedorFracoForaDaMedia } from '@/server/pricing/weak-seller-avg';
import { NextResponse, type NextRequest } from 'next/server';
import { rejectUnlessCronAuthorized } from '@/lib/auth/cron-auth';
import { refreshProductStats, refreshShowcase, refreshVitrines } from '@/server/jobs/refresh-snapshots';
import { startCollectorRun } from '@/server/collector/collector-runs';
import { gravarSnapshotInventario } from '@/server/jobs/catalog-inventory-snapshot';
import { acquireCycleLock } from '@/server/messaging/cycle-lock';
import { priceDailyShadowEnabled, refreshPriceDaily } from '@/server/jobs/refresh-price-daily';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Pré-cálculo persistido da vitrine (Fase 2, ata 2026-11-03-fase2-precalculo.md). Vercel Cron (vercel.json):
 *   ?part=stats     a cada 15 min  -> product_price_stats (estatística canônica por produto)
 *   ?part=showcase  4 min depois   -> showcase_snapshot (contadores, rankings, tabela), que lê as estatísticas prontas
 *   ?part=vitrines  a cada 10 min -> showcase_snapshot (18 vitrines da nova home, R-49; trava de ciclo único, teto de 60 s)
 *   ?part=inventory  (1x por hora; upsert de 1 linha por loja por dia) -> catalog_inventory_snapshots (inventário do catálogo, migração 0040)
 *   ?part=daily     (SOMBRA, só com PRICE_DAILY_SHADOW=1) -> price_daily_offer/state/min_events (ata 2026-11-05)
 * Mesma autenticação das demais /api/cron/* (CRON_SECRET, falha fechada). `force=1` recalcula tudo, mesmo o recente.
 */
export async function GET(request: NextRequest) {
  const denied = rejectUnlessCronAuthorized(request);
  if (denied) return denied;

  const part = request.nextUrl.searchParams.get('part') ?? 'all';
  const force = request.nextUrl.searchParams.get('force') === '1';
  const started = Date.now();
  // 'stats' roda o lote inteiro sozinho: 190 s deixam folga de ~110 s sob o teto de 300 s para o ultimo lote (rodadas de :30 ficavam 'running' para sempre por estourar o teto).
  const BUDGET_MS = part === 'stats' ? 120_000 : 240_000;
  const out: Record<string, unknown> = { part };
  // Registro de execucao (flag COLLECTOR_RUNS=1; no-op sem a flag; nunca lanca).
  const run = await startCollectorRun(`refresh-snapshots:${part}`, null);

  // Vitrines: um ciclo por vez (trava própria); ciclo anterior ainda rodando => este pula, sem empilhar leitura no banco.
  let vitrinesLock: Awaited<ReturnType<typeof acquireCycleLock>> | null = null;
  if (part === 'vitrines') {
    vitrinesLock = await acquireCycleLock('refresh-snapshots:vitrines');
    if (!vitrinesLock.acquired) {
      await run.finish({ meta: { part, skipped: 'ciclo anterior ainda em andamento (trava)' } });
      return NextResponse.json({ part, skipped: 'ciclo anterior ainda em andamento (trava)' });
    }
  }

  // Vigia de fechamento (R-111): o registro 'running' nunca fica aberto. Se o trabalho passar de WATCHDOG_MS (maxDuration - 30 s), a rota fecha
  // o registro como parcial (meta.watchdog) e responde antes do teto da Vercel; sem isto a funcao morria no teto, o finally nao rodava e o
  // collector-health fechava a linha como erro 10 min depois (16 de 24 rodadas de stats em 19-20/11). `CRON_WATCHDOG=off` desliga.
  const watchdogOn = !/^(0|off|false)$/i.test((process.env.CRON_WATCHDOG ?? '').trim());
  const WATCHDOG_MS = (maxDuration - 30) * 1000;
  const work = async () => {
    // E6 (#147): vendedor fraco fora da média sincronizado também a cada 10 min (antes só a cada 30 min, no part=stats): a janela em que uma oferta nova de vendedor fraco pesa na média cai de 30 para 10 min.
    if (part === 'vitrines') await sincronizarVendedorFracoForaDaMedia({ apply: true }).catch((e) => console.error('[weak-seller-avg]', e instanceof Error ? e.message : e));
    if (part === 'vitrines') out.vitrines = await refreshVitrines({ budgetMs: 60_000 });
    if (part === 'stats' || part === 'all') {
      out.stats = await refreshProductStats({ budgetMs: BUDGET_MS, minAgeMs: force ? 0 : undefined });
    }
    if (part === 'showcase' || part === 'all') {
      out.showcase = await refreshShowcase({ budgetMs: Math.max(20_000, BUDGET_MS - (Date.now() - started)), force });
    }
    if (part === 'daily') {
      // Gatilho de preco-isca (R-61): varredura de seguranca ANTES de recalcular o dia (marca o que o gancho da coleta nao viu, solta o que nao se sustenta). Melhor esforco.
      try {
        const { varrerIsca } = await import('@/server/pricing/preco-isca');
        const v = await varrerIsca(true, { budgetMs: 60_000 });
        out.isca = { ligado: v.ligado, avaliadas: v.avaliadas, novas: v.novasIscas, soltas: v.quarentenasSoltas, exemplos: v.exemplos.slice(0, 5) };
      } catch (err) {
        out.isca = { erro: err instanceof Error ? err.message.slice(0, 120) : 'erro' };
      }
      // Condição não nova (R-75): Open Box/vitrine/mostruário em quarentena reversível. Melhor esforço.
      try {
        const { varrerCondicaoNaoNova } = await import('@/server/pricing/condicao-nao-nova');
        const c = await varrerCondicaoNaoNova(true);
        out.condicao = { ligado: c.ligado, novas: c.novas, soltas: c.soltas };
      } catch (err) {
        out.condicao = { erro: err instanceof Error ? err.message.slice(0, 120) : 'erro' };
      }
      // Link divergente (R-76): oferta com auditoria de link bloqueante recente sai da vitrine (quarentena reversível). Melhor esforço.
      try {
        const { varrerLinkDivergente } = await import('@/server/pricing/link-divergente');
        out.linkDivergente = await varrerLinkDivergente(true);
      } catch (err) {
        out.linkDivergente = { erro: err instanceof Error ? err.message.slice(0, 120) : 'erro' };
      }
      out.daily = priceDailyShadowEnabled()
        ? await refreshPriceDaily({ budgetMs: Math.max(20_000, BUDGET_MS - (Date.now() - started)) })
        : { skipped: 'PRICE_DAILY_SHADOW desligada' };
    }
    // Inventário do catálogo: tolerante a falha por construção (nunca lança; erro vai no retorno).
    if (part === 'inventory' || part === 'all') {
      out.inventory = await gravarSnapshotInventario();
    }
  };
  try {
    if (watchdogOn) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const working = work();
      working.catch(() => undefined);
      const outcome = await Promise.race([
        working.then(() => 'done' as const),
        new Promise<'watchdog'>((resolve) => { timer = setTimeout(() => resolve('watchdog'), WATCHDOG_MS); }),
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (outcome === 'watchdog') {
        vitrinesLock?.release();
        out.elapsedMs = Date.now() - started;
        out.watchdog = true;
        console.warn(`[cron refresh-snapshots] vigia: part=${part} passou de ${WATCHDOG_MS} ms; registro fechado como parcial`);
        await run.finish({ stoppedBecause: 'watchdog', budgetExhausted: true, meta: out });
        return NextResponse.json(out);
      }
      await working;
    } else {
      await work();
    }
  } catch (err) {
    vitrinesLock?.release();
    console.error('[cron refresh-snapshots] falhou:', err);
    await run.finish({ fatal: true, meta: { part, error: err instanceof Error ? err.message.slice(0, 200) : 'erro' } });
    console.error('[cron refresh-snapshots] falhou:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ...out, error: 'falha' }, { status: 500 });
  }
  vitrinesLock?.release();
  out.elapsedMs = Date.now() - started;
  await run.finish({ meta: out });
  return NextResponse.json(out);
}
