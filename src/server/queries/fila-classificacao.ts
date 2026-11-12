import 'server-only';
import { db } from '@/lib/db';
import { countPending, countRulesLearned, getAutoResolved, getPendingCards, type AutoResolvedRow, type QueueCard } from '@/server/identity-queue/queue';

export interface FilaClassificacaoPayload { cards: QueueCard[]; pendentes: number; regrasAprendidas: number; autoResolvidos: number; autoRecentes: AutoResolvedRow[] }

/** Fila de classificação para o popup do admin (somente leitura). Quem chama já passou por requireAdmin. */
export async function getFilaClassificacao(limit = 50): Promise<FilaClassificacaoPayload> {
  try {
    const [cards, pendentes, regrasAprendidas, auto] = await Promise.all([getPendingCards(db, limit), countPending(db), countRulesLearned(db), getAutoResolved(db).catch(() => ({ total: 0, recentes: [] as AutoResolvedRow[] }))]);
    return { cards, pendentes, regrasAprendidas, autoResolvidos: auto.total, autoRecentes: auto.recentes };
  } catch (e) {
    // Migration 0042 ainda não aplicada (tabelas ausentes): o admin segue funcionando sem o popup.
    console.error('[fila-classificacao] indisponível:', e instanceof Error ? e.message : e);
    return { cards: [], pendentes: 0, regrasAprendidas: 0, autoResolvidos: 0, autoRecentes: [] };
  }
}
