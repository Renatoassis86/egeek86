import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { VITRINE_REGRAS, avaliarCandidato, type Candidato, type ContextoAvaliacao, type MotivoExclusao, type VitrineItem } from '@/lib/vitrines';

/**
 * MUDANÇAS DO MENOR PREÇO (ADR 0004, emenda 2026-11-05): eventos de `price_min_events` (source 'live') das últimas 24 h em que o menor
 * preço do produto CAIU pelo menos 5% sobre o evento anterior. Um evento por produto (o mais recente). Tabela pequena (~20 mil linhas) e
 * índice (master_product_id, at): leitura de ~40 ms medida (EXPLAIN ANALYZE, 2026-11-13). Só SELECT, com teto.
 */
export interface EventoBruto {
  masterProductId: string;
  em: string;
  centavos: number;
  antesCentavos: number;
  loja: string | null;
}

export function sqlEventosMenorPreco(): SQL {
  const janela = sql.raw(String(Math.trunc(VITRINE_REGRAS.MUDANCA_JANELA_HORAS)));
  const pct = sql.raw(String(Math.trunc(VITRINE_REGRAS.MUDANCA_QUEDA_MIN_PCT)));
  return sql`
    SELECT DISTINCT ON (e.master_product_id) e.master_product_id AS mid, e.at, e.min_cents, e.prev_min_cents, n.name AS net_name
    FROM price_min_events e
    LEFT JOIN affiliate_networks n ON n.id = e.network_id
    WHERE e.source = 'live' AND e.at >= now() - interval '${janela} hours'
      AND e.prev_min_cents IS NOT NULL AND e.min_cents > 0 AND e.min_cents < e.prev_min_cents
      AND (e.prev_min_cents - e.min_cents) * 100 >= e.prev_min_cents * ${pct}
    ORDER BY e.master_product_id, e.at DESC, e.id DESC
  `;
}

export async function carregarEventos(): Promise<EventoBruto[]> {
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '8s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    return tx.execute<Record<string, unknown>>(sqlEventosMenorPreco());
  });
  return rows.map((r) => ({
    masterProductId: String(r.mid),
    em: new Date(r.at as string | Date).toISOString(),
    centavos: Number(r.min_cents),
    antesCentavos: Number(r.prev_min_cents),
    loja: r.net_name == null ? null : String(r.net_name),
  }));
}

/** Junta eventos e candidatos elegíveis (mesmos filtros de identidade das demais vitrines; base de preço não é exigida: o evento é fato). Pura. */
export function montarMudancas(
  eventos: readonly EventoBruto[],
  candidatos: readonly Candidato[],
  ctx: ContextoAvaliacao
): { itens: VitrineItem[]; elegiveis: number; motivos: Partial<Record<MotivoExclusao, number>> } {
  const porMaster = new Map(candidatos.map((c) => [c.masterProductId, c]));
  const motivos: Partial<Record<MotivoExclusao, number>> = {};
  const marca = (m: MotivoExclusao) => (motivos[m] = (motivos[m] ?? 0) + 1);
  const bons: Array<{ em: number; item: VitrineItem }> = [];
  for (const ev of eventos) {
    const c = porMaster.get(ev.masterProductId);
    if (!c) {
      marca('fora_da_vitrine');
      continue;
    }
    const r = avaliarCandidato(c, ctx, { exigirBase: false });
    if (!r.ok) {
      marca(r.motivo);
      continue;
    }
    const a = r.avaliado;
    if (a.posicao.tipo === 'acima') {
      marca('acima_do_normal');
      continue;
    }
    const quedaPct = ((ev.antesCentavos - ev.centavos) / ev.antesCentavos) * 100;
    if (quedaPct > VITRINE_REGRAS.QUEDA_MAX_PCT) {
      marca('queda_acima_do_teto');
      continue;
    }
    // O evento só vale enquanto o preço vigente não passou dele (se subiu depois, o evento ficou velho).
    if (c.precoCentavos > ev.centavos) {
      marca('fora_da_vitrine');
      continue;
    }
    bons.push({ em: new Date(ev.em).getTime(), item: { ...a.item, evento: { em: ev.em, centavos: ev.centavos, antesCentavos: ev.antesCentavos, quedaPct: Math.round(quedaPct * 10) / 10, loja: ev.loja } } });
  }
  bons.sort((x, y) => y.em - x.em || (x.item.masterProductId < y.item.masterProductId ? -1 : 1));
  const elegiveis = bons.length;
  if (elegiveis < VITRINE_REGRAS.MIN_ITENS) return { itens: [], elegiveis, motivos };
  return { itens: bons.slice(0, VITRINE_REGRAS.MUDANCAS).map((b) => b.item), elegiveis, motivos };
}
