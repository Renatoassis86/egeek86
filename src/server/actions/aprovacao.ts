'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/require-admin';
import { isUuid, parseKey } from '@/lib/aprovacao/motivos';
import {
  aplicarObvios, decidir, desfazer, historico, painel, previaObvios, proximosCartoes,
  type Acao, type Cartao, type HistoricoRow, type Painel, type PreviaLote,
} from '@/server/aprovacao/aprovacao';

// Server Actions sao endpoints publicos: cada uma chama requireAdmin() ANTES de qualquer leitura ou escrita (nao herdam a protecao da pagina).
// Erros ao cliente sao genericos; o detalhe fica no log do servidor.

export interface RespostaAprovacao { ok: boolean; error?: string; decisionId?: string; liberada?: boolean; masterAprovado?: boolean; already?: boolean; painel?: Painel; historico?: HistoricoRow[] }

const ACOES: Acao[] = ['aprovar', 'recusar', 'pular', 'escolha'];

async function resumo(userId: string) {
  const [p, h] = await Promise.all([painel(db, userId), historico(db, 50)]);
  return { painel: p, historico: h };
}

export async function carregarCartoes(skip: string[] = []): Promise<{ ok: boolean; cartoes: Cartao[] }> {
  await requireAdmin();
  try {
    return { ok: true, cartoes: await proximosCartoes(db, { skip: Array.isArray(skip) ? skip.slice(0, 300) : [], limit: 20 }) };
  } catch (e) {
    console.error('[aprovacao] carregar cartoes:', e instanceof Error ? e.message : e);
    return { ok: false, cartoes: [] };
  }
}

export async function decidirCartao(key: string, acao: string, value?: string): Promise<RespostaAprovacao> {
  const admin = await requireAdmin();
  if (!parseKey(key) || !ACOES.includes(acao as Acao)) return { ok: false, error: 'pedido_invalido' };
  if (value !== undefined && typeof value !== 'string') return { ok: false, error: 'pedido_invalido' };
  try {
    const r = await decidir(db, { key, acao: acao as Acao, value, userId: admin.id });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath('/admin/aprovacao');
    return { ok: true, decisionId: r.decisionId, liberada: r.liberada, masterAprovado: r.masterAprovado, already: r.already, ...(await resumo(admin.id)) };
  } catch (e) {
    console.error('[aprovacao] decidir:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'falha' };
  }
}

export async function desfazerDecisao(decisionId: string): Promise<RespostaAprovacao> {
  const admin = await requireAdmin();
  if (!isUuid(decisionId)) return { ok: false, error: 'pedido_invalido' };
  try {
    const r = await desfazer(db, { decisionId, userId: admin.id });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath('/admin/aprovacao');
    return { ok: true, decisionId, already: r.already, ...(await resumo(admin.id)) };
  } catch (e) {
    console.error('[aprovacao] desfazer:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'falha' };
  }
}

export async function previaLoteObvios(): Promise<{ ok: boolean; previa?: PreviaLote }> {
  await requireAdmin();
  try { return { ok: true, previa: await previaObvios(db) }; } catch (e) { console.error('[aprovacao] previa:', e instanceof Error ? e.message : e); return { ok: false }; }
}

export async function confirmarLoteObvios(ids: string[]): Promise<RespostaAprovacao & { aplicados?: number; mudaram?: number; erros?: number }> {
  const admin = await requireAdmin();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every(isUuid)) return { ok: false, error: 'pedido_invalido' };
  try {
    const r = await aplicarObvios(db, { ids, userId: admin.id });
    revalidatePath('/admin/aprovacao');
    return { ok: true, aplicados: r.aplicados, mudaram: r.mudaram, erros: r.erros, ...(await resumo(admin.id)) };
  } catch (e) {
    console.error('[aprovacao] lote:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'falha' };
  }
}

export async function atualizarPainel(): Promise<RespostaAprovacao> {
  const admin = await requireAdmin();
  try { return { ok: true, ...(await resumo(admin.id)) }; } catch { return { ok: false, error: 'falha' }; }
}
