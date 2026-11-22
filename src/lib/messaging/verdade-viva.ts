// R-117 (dono 2026-11-22): VERDADE VIVA. PURO (sem banco, sem rede). Nada e listado numa vitrine sem verificacao de PRECO e de DISPONIBILIDADE dentro de uma janela curta.
// Padrao negado: sem como verificar ao vivo = NAO LISTA e o proximo elegivel repoe. O preco exibido e o VIVO (preco de lista; cupom so com prova), nunca o do banco defasado.

/** Janela maxima da leitura viva para a vitrine (dono: <= 15 min). Amazon segue a R-81 (45 min: a coleta assistida e a unica fonte). */
export const VIVO_JANELA_VITRINE_MIN = 15;
export const VIVO_JANELA_AMAZON_MIN = 45;
/** Divergencia aceita entre o preco do banco e o vivo; acima disso vale o vivo (ou descarta). */
export const VIVO_TOLERANCIA_PCT = 2;

export type LeituraViva =
  | { estado: 'ok'; precoCents: number; idadeMin: number; fonte: string }
  | { estado: 'esgotado'; idadeMin: number; fonte: string }
  | { estado: 'nao_verificavel'; motivo: string };

export type DecisaoVivo =
  | { ok: true; precoCents: number; usouVivo: boolean; divergenciaPct: number; fonte: string }
  | { ok: false; motivo: 'esgotado' | 'nao_verificavel' | 'leitura_velha' | 'preco_vivo_acima_do_teto' | 'preco_invalido' };

export function vivoLigado(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.VITRINE_VIVO ?? '').trim());
}

/** Decide UMA oferta: disponivel e leitura dentro da janela; preco vivo manda (diferenca > 2% = usa o vivo, desde que respeite o teto). */
export function decidirVivo(precoBancoCents: number, leitura: LeituraViva, o: { janelaMin: number; tetoCents: number }): DecisaoVivo {
  if (leitura.estado === 'nao_verificavel') return { ok: false, motivo: 'nao_verificavel' };
  if (leitura.estado === 'esgotado') return { ok: false, motivo: 'esgotado' };
  if (!(leitura.idadeMin >= 0) || leitura.idadeMin > o.janelaMin) return { ok: false, motivo: 'leitura_velha' };
  if (!(leitura.precoCents > 0) || !Number.isFinite(leitura.precoCents)) return { ok: false, motivo: 'preco_invalido' };
  if (leitura.precoCents > o.tetoCents) return { ok: false, motivo: 'preco_vivo_acima_do_teto' };
  const div = precoBancoCents > 0 ? (Math.abs(leitura.precoCents - precoBancoCents) / precoBancoCents) * 100 : 100;
  return { ok: true, precoCents: leitura.precoCents, usouVivo: div > VIVO_TOLERANCIA_PCT, divergenciaPct: Math.round(div * 10) / 10, fonte: leitura.fonte };
}

export interface ResultadoEscolha<T> { escolhidos: Array<{ item: T; decisao: Extract<DecisaoVivo, { ok: true }> }>; barrados: Record<string, number>; checados: number; cortadoPorOrcamento: boolean }

/**
 * Percorre os candidatos (do mais barato) verificando em lotes ate completar `n`; quem falha e reposto pelo proximo. Limites: `maxChecagens` e `orcamentoMs`
 * (estourou = para e entrega o que verificou: nunca completa com item NAO verificado).
 */
export async function escolherVerificados<T>(candidatos: readonly T[], verificar: (c: T) => Promise<DecisaoVivo>, n: number, o: { lote?: number; maxChecagens?: number; orcamentoMs?: number; agora?: () => number } = {}): Promise<ResultadoEscolha<T>> {
  const lote = o.lote ?? 4, max = o.maxChecagens ?? 30, orc = o.orcamentoMs ?? 45_000, agora = o.agora ?? Date.now;
  const t0 = agora();
  const escolhidos: ResultadoEscolha<T>['escolhidos'] = [];
  const barrados: Record<string, number> = {};
  let checados = 0, cortado = false;
  for (let i = 0; i < candidatos.length && escolhidos.length < n; i += lote) {
    if (checados >= max || agora() - t0 > orc) { cortado = true; break; }
    const fatia = candidatos.slice(i, i + lote).slice(0, max - checados);
    const rs = await Promise.all(fatia.map(async (c) => ({ c, d: await verificar(c).catch((): DecisaoVivo => ({ ok: false, motivo: 'nao_verificavel' })) })));
    checados += fatia.length;
    for (const { c, d } of rs) {
      if (d.ok) { if (escolhidos.length < n) escolhidos.push({ item: c, decisao: d }); }
      else barrados[d.motivo] = (barrados[d.motivo] ?? 0) + 1;
    }
  }
  return { escolhidos, barrados, checados, cortadoPorOrcamento: cortado };
}

/** Linha vinda da aba logada da Shopee (ou de qualquer leitura de pagina): valida o corpo antes de gravar. */
export function validarLeituraPagina(r: { offer_id?: unknown; disponivel?: unknown; preco_cents?: unknown; motivo?: unknown }): { ok: true; offerId: string; disponivel: boolean; precoCents: number | null; motivo: string | null } | { ok: false; erro: string } {
  if (typeof r.offer_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(r.offer_id)) return { ok: false, erro: 'offer_id_invalido' };
  if (typeof r.disponivel !== 'boolean') return { ok: false, erro: 'disponivel_obrigatorio' };
  if (r.disponivel) {
    const p = Number(r.preco_cents);
    if (!Number.isInteger(p) || p < 100 || p > 50_000_00) return { ok: false, erro: 'preco_obrigatorio_quando_disponivel' };
    return { ok: true, offerId: r.offer_id, disponivel: true, precoCents: p, motivo: null };
  }
  return { ok: true, offerId: r.offer_id, disponivel: false, precoCents: null, motivo: typeof r.motivo === 'string' ? r.motivo.slice(0, 60) : 'esgotado' };
}
