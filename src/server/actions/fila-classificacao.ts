'use server';

import { revalidatePath } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import {
  applyInTx, autoResolveObvious, countPending, countRulesLearned, drainRecalc, generateQueue, getAutoResolved, getCard, undoInTx, type AutoResolvedRow, type Exec, type GenerateStats, type QueueCard,
} from '@/server/identity-queue/queue';

// Server Actions são endpoints públicos: cada uma repete o guard do admin (requireAdmin), como as demais ações de mutação.

export interface RespostaFila { ok: boolean; error?: string; decisionId?: string; pendentes?: number; regrasAprendidas?: number; autoResolvidos?: number; autoRecentes?: AutoResolvedRow[]; item?: QueueCard | null }

async function totais() {
  const [pendentes, regrasAprendidas, auto] = await Promise.all([countPending(db), countRulesLearned(db), getAutoResolved(db).catch(() => ({ total: 0, recentes: [] as AutoResolvedRow[] }))]);
  return { pendentes, regrasAprendidas, autoResolvidos: auto.total, autoRecentes: auto.recentes };
}

async function recalcular() {
  try {
    await drainRecalc(db);
  } catch (e) {
    // A decisão já está gravada e o recálculo fica marcado como pendente (recalc_done_at nulo): a próxima chamada tenta de novo.
    console.error('[fila-classificacao] recálculo adiado:', e instanceof Error ? e.message : e);
  }
}

export async function responderItemFila(itemId: string, value: string): Promise<RespostaFila> {
  const admin = await requireAdmin();
  if (typeof itemId !== 'string' || typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(itemId)) return { ok: false, error: 'pedido_invalido' };
  const res = await db.transaction((tx) => applyInTx(tx as unknown as Exec, { itemId, value, userId: admin.id }));
  if (!res.ok) return { ok: false, error: res.error };
  await recalcular();
  revalidatePath('/admin');
  return { ok: true, decisionId: res.decisionId, ...(await totais()) };
}

export async function desfazerDecisaoFila(decisionId: string): Promise<RespostaFila> {
  const admin = await requireAdmin();
  if (typeof decisionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(decisionId)) return { ok: false, error: 'pedido_invalido' };
  const res = await db.transaction((tx) => undoInTx(tx as unknown as Exec, { decisionId, userId: admin.id }));
  if (!res.ok) return { ok: false, error: res.error };
  await recalcular();
  const row = await db.execute(sql`SELECT item_id::text AS id FROM identity_decisions WHERE id = ${decisionId}::uuid`);
  const itemId = (row as unknown as Array<{ id: string | null }>)[0]?.id;
  revalidatePath('/admin');
  return { ok: true, item: itemId ? await getCard(db, itemId) : null, ...(await totais()) };
}

export async function atualizarFilaClassificacao(): Promise<{ ok: boolean; stats?: GenerateStats; pendentes?: number; error?: string }> {
  await requireAdmin();
  try {
    const stats = await db.transaction((tx) => generateQueue(tx as unknown as Exec));
    // Casos óbvios (critério objetivo, reversível; kill-switch FILA_AUTO_OBVIO=off): o botão também varre a fila.
    if (process.env.FILA_AUTO_OBVIO !== 'off') await autoResolveObvious(db, { apply: true, budgetMs: 20_000 }).catch((e) => console.error('[fila-classificacao] auto-obvio:', e instanceof Error ? e.message : e));
    await recalcular();
    revalidatePath('/admin');
    return { ok: true, stats, pendentes: await countPending(db) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'falha' };
  }
}
