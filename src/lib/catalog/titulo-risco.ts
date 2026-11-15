// Sem 'server-only': função pura. Título de RISCO para a quarentena em lote (dono, 2026-11-15, decisão 3): reaproveita os motivos do porteiro.
import { evaluateCatalogGate } from '@/lib/catalog/gate';
import { foldTitle } from '@/lib/catalog/dimensions';
import type { ProductType } from '@/db/schema';

/**
 * Motivos do porteiro que são RISCO de autenticidade/modificação (lista do dono). Ficam de fora clone_controle_* (controle compatível de terceiros),
 * embalagem_sem_jogo e clone_generico: já são tratados pelo porteiro, mas não são "título de risco" desta quarentena.
 */
const MOTIVOS_DE_RISCO = /^(?:destravado_modificado|console_modificado|pirata_copia|replica_1_1|paralelo|nao_original|midia_iso_gravada|repro_cartucho|milhares_de_jogos|cartucho_n_em_1|jogos_a_escolha|clone_hardware|desbloqueio)/;

export interface RiscoTitulo { motivo: string; termo: string | null }

/** Só o que é inequívoco em qualquer departamento (celular "desbloqueado" e impressora "cópia" são legítimos fora de games). */
const RISCO_QUALQUER_DEPARTAMENTO =
  /\bfalsific\w*|\breplicas?\b|\bpiratead\w*|\bpirata\b|\bprimeira linha\b|\bimitacao\b|\btinfoil\b|\bdev ?board\b|\bsx ?os\b|\bmod ?chip\w*|\bimportad[oa]s? sem garantia\b/;

/**
 * null = sem risco. Games: usa o porteiro (categoria not_original: destravado/desbloqueado/modificado, réplica, paralelo, pirata, ISO,
 * repro, clone...) com o título da OFERTA ou do master; fora de games só o inequívoco acima.
 */
export function avaliarTituloRisco(titulo: string, ctx: { vertical: string; productType: ProductType; gameFormat?: string | null }): RiscoTitulo | null {
  const t = foldTitle(titulo);
  const x = RISCO_QUALQUER_DEPARTAMENTO.exec(t);
  if (x) return { motivo: 'titulo_risco:nao_original', termo: x[0] };
  if (ctx.vertical !== 'games') return null;
  const g = evaluateCatalogGate({ name: titulo, productType: ctx.productType, gameFormat: ctx.gameFormat ?? null, manual: null });
  if (g.verdict === 'rejected' && g.category === 'not_original' && MOTIVOS_DE_RISCO.test(g.reason)) return { motivo: `titulo_risco:${g.reason}`, termo: g.matched };
  return null;
}
