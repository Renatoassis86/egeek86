import 'server-only';
import { sql } from 'drizzle-orm';
import type { db as Db } from '@/lib/db';
import { decidir, proximosCartoes, type Cartao } from '@/server/aprovacao/aprovacao';
import { guardaAuto } from '@/lib/aprovacao/auto-guarda';

/**
 * APROVACAO CONTINUA AUTOMATICA (dono, 2026-11-12): o que a vitrine/coleta da Amazon traz de obvio entra SEM fila humana.
 * Reaproveita decidir() (mesmas guardas, mesma transacao curta por cartao, identity_decisions com estado anterior => desfazer em /admin/aprovacao).
 * Fora do automatico (continua para o dono): midia, modelo, armazenamento, preco e qualquer cartao barrado por guardaAuto/decidir.
 * Registro: collector_runs (job 'aprovacao-auto') com os decisionIds; reversao = desfazer() de cada id (ou o painel de historico).
 * Desligar: APROVACAO_AUTO=off (a rota responde {desligado:true} e nao toca o banco).
 */
type DbT = typeof Db;
export const JOB_APROVACAO_AUTO = 'aprovacao-auto';
export const aprovacaoAutoLigada = (env = process.env.APROVACAO_AUTO) => (env ?? '').trim().toLowerCase() !== 'off';
const rows = <T>(r: unknown) => r as unknown as T[];

export interface ResultadoAuto {
  desligado?: boolean; dryRun: boolean; candidatos: number; tentados: number; liberadas: number; masters: number; ja: number;
  barradasAuto: Record<string, number>; barradasDecidir: Record<string, number>; erros: number; decisionIds: string[]; duracaoMs: number; runId: string | null;
}
class Rollback extends Error {}

export async function rodarAprovacaoAuto(dbx: DbT, o: { lote?: number; orcamentoMs?: number; dry?: boolean } = {}): Promise<ResultadoAuto> {
  const t0 = Date.now();
  const lote = Math.min(100, Math.max(1, o.lote ?? 40));
  const orcamento = o.orcamentoMs ?? 150_000;
  const out: ResultadoAuto = { dryRun: !!o.dry, candidatos: 0, tentados: 0, liberadas: 0, masters: 0, ja: 0, barradasAuto: {}, barradasDecidir: {}, erros: 0, decisionIds: [], duracaoMs: 0, runId: null };
  if (!aprovacaoAutoLigada()) return { ...out, desligado: true };
  const admin = rows<{ id: string }>(await dbx.execute(sql`SELECT id::text AS id FROM profiles WHERE role IN ('admin','super_admin') ORDER BY created_at LIMIT 1`))[0]?.id;
  if (!admin) throw new Error('sem_admin_para_registrar_decisao');
  if (!o.dry) {
    const r = rows<{ id: string }>(await dbx.execute(sql`INSERT INTO collector_runs (job, network, started_at, status, meta) VALUES (${JOB_APROVACAO_AUTO}, 'amazon', now(), 'running', '{}'::jsonb) RETURNING id::text AS id`));
    out.runId = r[0]?.id ?? null;
  }
  try {
    const todos = await proximosCartoes(dbx, { limit: 600 });
    const alvo: Cartao[] = [];
    for (const c of todos) {
      const g = guardaAuto({ motivo: c.motivo, rede: c.rede, title: c.title, vertical: c.vertical, plataforma: c.plataforma, priceCents: c.priceCents, refCents: c.refCents, nRefs: c.nRefs });
      if (!g) alvo.push(c);
      else if (c.rede === 'amazon') out.barradasAuto[g] = (out.barradasAuto[g] ?? 0) + 1;
    }
    out.candidatos = alvo.length;
    for (const c of alvo.slice(0, lote)) {
      if (Date.now() - t0 > orcamento) break;
      out.tentados++;
      const aplicar = async (d: DbT) => {
        const r = await decidir(d, { key: c.key, acao: 'aprovar', userId: admin });
        if (!r.ok) { out.barradasDecidir[r.error ?? 'erro'] = (out.barradasDecidir[r.error ?? 'erro'] ?? 0) + 1; if (r.error === 'falha') out.erros++; return; }
        if (r.already) { out.ja++; return; }
        if (r.liberada) out.liberadas++;
        if (r.masterAprovado) out.masters++;
        if (r.decisionId) out.decisionIds.push(r.decisionId);
      };
      if (o.dry) await dbx.transaction(async (tx) => { await aplicar(tx as unknown as DbT); throw new Rollback(); }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
      else await aplicar(dbx);
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch (e) {
    out.erros++;
    out.duracaoMs = Date.now() - t0;
    if (out.runId) await fechar(dbx, out, 'error', e);
    throw e;
  }
  out.duracaoMs = Date.now() - t0;
  if (out.runId) await fechar(dbx, out, out.erros > 0 ? 'partial' : 'ok');
  return out;
}

async function fechar(dbx: DbT, r: ResultadoAuto, status: string, e?: unknown) {
  const meta = JSON.stringify({ liberadas: r.liberadas, masters: r.masters, barradasAuto: r.barradasAuto, barradasDecidir: r.barradasDecidir, decisionIds: r.decisionIds, erro: e ? (e instanceof Error ? e.message.slice(0, 200) : 'erro') : undefined });
  await dbx.execute(sql`UPDATE collector_runs SET finished_at = now(), duration_ms = ${r.duracaoMs}, status = ${status}, checked = ${r.tentados}, errors = ${r.erros}, offers_created = ${r.liberadas}, meta = ${meta}::text::jsonb WHERE id = ${r.runId}::bigint`)
    .catch((x) => console.error('[aprovacao-auto] falha ao fechar run', x instanceof Error ? x.message : x));
}
