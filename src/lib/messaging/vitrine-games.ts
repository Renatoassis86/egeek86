// PURO (sem banco, sem rede, sem relógio). Vitrine de jogos até R$ 200 no canal de games, a cada 30 minutos (dono, 2026-11-17):
// UMA mensagem com capa premium dos 10 principais, nome e breve diagnóstico de cada um. Só dado real; diagnóstico só com histórico elegível (R-91).
import { classificar } from '@/lib/ranking-busca';
import type { VerdictKind } from '@/lib/affiliate/price-verdict';

export const VITRINE_TETO_CENTAVOS = 20_000;
export const VITRINE_TOP = 10;
export const VITRINE_INTERVALO_MIN = 30;
/** Limite de legenda do Telegram contado depois do HTML interpretado. */
export const VITRINE_CAPTION_MAX = 1024;

export interface JogoVitrine {
  masterId: string;
  slug: string;
  titulo: string;
  plataforma: string;
  precoCentavos: number;
  ofertas: number;
  imagem: string | null;
  /** Veredito contra a média única; só vale com histórico elegível. */
  veredito?: VerdictKind | null;
  elegivel?: boolean;
  /** % abaixo (positivo) ou acima (negativo) da média única. */
  deltaPct?: number | null;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Título curto e limpo para a lista: tira plataforma e ruídos comuns, corta em `max` caracteres sem partir palavra. */
export function tituloCurto(t: string, max = 34): string {
  let s = t
    .replace(/\s*[-–|:]\s*(ps\s?[45]|playstation\s?[45]|xbox[\w\s]*|nintendo switch\s?2?|switch\s?2?|pc)\b.*$/i, '')
    .replace(/^\s*(jogo|game)\s+/i, '')
    .replace(/\b(ps\s?[45]|playstation\s?[45]|xbox\s?(one|series\s?[xs]?|360)?|nintendo switch\s?2?|switch\s?2?)\b/gi, ' ')
    .replace(/\b(m[ií]dia f[ií]sica|lacrado|novo|original|lan[cç]amento|standard( edition)?|sony|nintendo|cd projekt red|edi[cç][aã]o padr[aã]o|jogo em)\b/gi, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–|:,\s]+|[-–|:,\s]+$/g, '')
    .trim();
  if (!s) s = t.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.55 ? cut.slice(0, sp) : cut).trim()}…`;
}

export function reais(c: number): string {
  return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Diagnóstico curto. Sem histórico elegível NÃO há diagnóstico: "Novo em monitoramento" (1 oferta) ou "Em monitoramento" (mais de uma). */
export function diagnosticoCurto(j: Pick<JogoVitrine, 'ofertas' | 'elegivel' | 'veredito' | 'deltaPct'>): { texto: string; diagnostico: boolean } {
  const c = classificar({ nOfertas: j.ofertas, elegivel: !!j.elegivel, veredito: j.veredito ?? null });
  if (!c.diagnostico) return { texto: c.rotulo, diagnostico: false };
  const pct = j.deltaPct != null && Math.abs(j.deltaPct) >= 1 ? ` (${j.deltaPct > 0 ? '−' : '+'}${Math.abs(Math.round(j.deltaPct))}%)` : '';
  return { texto: `${c.rotulo}${pct}`, diagnostico: true };
}

/**
 * Os 10 principais: primeiro quem tem diagnóstico "abaixo do normal", dentro disso quem tem mais ofertas (mais lojas = mais procura; evita premiar só a maior queda, que pode ser anomalia), depois a maior queda,
 * depois o menor preço e o id (desempate estável). Só jogo até R$ 200 com preço > 0; um por produto.
 */
export function escolherTop(jogos: readonly JogoVitrine[], n = VITRINE_TOP): JogoVitrine[] {
  const vistos = new Set<string>();
  const ok = jogos.filter((j) => j.precoCentavos > 0 && j.precoCentavos <= VITRINE_TETO_CENTAVOS && !vistos.has(j.masterId) && !!vistos.add(j.masterId));
  const abaixo = (j: JogoVitrine) => (j.elegivel && j.veredito === 'below' ? 1 : 0);
  return ok
    .slice()
    .sort((a, b) => abaixo(b) - abaixo(a) || b.ofertas - a.ofertas || (b.deltaPct ?? 0) - (a.deltaPct ?? 0) || a.precoCentavos - b.precoCentavos || a.masterId.localeCompare(b.masterId))
    .slice(0, n);
}


/** Rodadas (vitrines de 30 min) em que um jogo descansa depois de aparecer: 3 = 1h30 fora da capa (dono, 2026-11-17: "rodizio entre os jogos menores de 200"). */
export const VITRINE_REPOUSO_RODADAS = 3;

/**
 * RODIZIO entre todos os jogos até R$ 200. `recentes` = masters de cada vitrine já enviada, da mais nova para a mais antiga.
 * Quem não saiu nas últimas VITRINE_REPOUSO_RODADAS vitrines (ou nunca saiu) concorre pela ordem de qualidade de `escolherTop`; faltando gente,
 * completa com quem saiu há mais tempo. Assim todos passam pela capa e os melhores voltam primeiro.
 */
export function escolherTopRodizio(jogos: readonly JogoVitrine[], recentes: ReadonlyArray<readonly string[]>, n = VITRINE_TOP, repouso = VITRINE_REPOUSO_RODADAS): JogoVitrine[] {
  const ordenados = escolherTop(jogos, jogos.length);
  const ultima = new Map<string, number>();
  recentes.forEach((ids, i) => { for (const id of ids) if (!ultima.has(id)) ultima.set(id, i); });
  const descansados = ordenados.filter((j) => !ultima.has(j.masterId) || (ultima.get(j.masterId) as number) >= repouso);
  if (descansados.length >= n) return descansados.slice(0, n);
  const tomados = new Set(descansados.map((j) => j.masterId));
  const resto = ordenados.filter((j) => !tomados.has(j.masterId)).sort((a, b) => (ultima.get(b.masterId) ?? 99) - (ultima.get(a.masterId) ?? 99));
  return [...descansados, ...resto].slice(0, n);
}

/** Legenda HTML do Telegram (<= 1024 caracteres visíveis). `link(i)` devolve o link de saída (/go) do jogo i. */
export function montarLegenda(top: readonly JogoVitrine[], hora: string, link: (i: number) => string): string {
  const monta = (max: number) => {
    const linhas = top.map((j, i) => {
      const d = diagnosticoCurto(j);
      return `${i + 1}. <a href="${esc(link(i))}">${esc(tituloCurto(j.titulo, max))}</a> · ${esc(j.plataforma)} · <b>${reais(j.precoCentavos)}</b>\n    ${d.diagnostico ? '' : ''}${esc(d.texto)}`;
    });
    return [`<b>🎮 Jogos até R$ 200 · ${esc(hora)}</b>`, '', ...linhas, '', 'Atualizada a cada 30 min. O diagnóstico só aparece com histórico suficiente.'].join('\n');
  };
  let out = monta(34);
  for (const max of [30, 26, 22, 18]) {
    if (visivel(out) <= VITRINE_CAPTION_MAX) break;
    out = monta(max);
  }
  return out;
}

export function visivel(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').length;
}

/** Chave da janela de 30 minutos (America/Sao_Paulo é irrelevante: usa UTC, só precisa ser estável): uma vitrine por janela. */
export function janelaKey(now: Date, intervaloMin = VITRINE_INTERVALO_MIN): string {
  const slot = Math.floor(now.getTime() / (intervaloMin * 60_000));
  return `vg-${slot}`;
}

export function vitrineLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.VITRINE_GAMES ?? '').trim());
}
