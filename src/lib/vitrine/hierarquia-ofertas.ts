// Adaptadores PUROS (so tipos importados: roda em script) das estruturas da vitrine para ItemHierarquia. Ver hierarquia.ts para a pontuacao.
import type { OfferWithRelations, OfferListingMetrics } from '@/server/queries/affiliate';
import type { CartaoDepartamento } from '@/server/queries/departamento';
import { sellerTier } from '@/lib/affiliate/price-verdict';
import { marcaDoItem } from '@/lib/messaging/marcas-lojas';
import { classificarTipo } from '@/lib/catalog/tipos-produto';
import { hierarquiaLigada, hierarquizar, type ItemHierarquia, type OpcoesHierarquia } from './hierarquia';

export type MapaPopularidade = ReadonlyMap<string, number>;
export const chavePopularidade = (networkId: string, externalRef: string | null | undefined) => `${networkId}:${externalRef ?? ''}`;

export function normalizarNome(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const PREFIXOS = new Set(['jogo', 'game', 'console', 'novo', 'lacrado', 'midia', 'fisica', 'original']);
/** Familia = 3 primeiras palavras do nome (sem prefixos genericos), mesma ideia da cota de familia da fila de envio. */
export function familiaDoNome(nome: string): string {
  return normalizarNome(nome).split(' ').filter((p) => !PREFIXOS.has(p)).slice(0, 3).join(' ');
}

const SUBTIPOS_ACESSORIO: ReadonlyArray<[string, RegExp]> = [
  ['controle', /\b(controle|controller|joystick|dualsense|dualshock|pro controller|joy con)\b/],
  ['headset', /\b(headset|headphone|fone|fones)\b/],
  ['carga', /\b(carregador|base de carga|dock|bateria)\b/],
  ['capa', /\b(capa|case|bolsa|pelicula|estojo|skin)\b/],
  ['memoria', /\b(cartao de memoria|microsd|ssd|hd externo|memoria)\b/],
  ['volante', /\b(volante|pedal|cockpit)\b/],
  ['cabo', /\b(cabo|hdmi|adaptador|suporte|hub)\b/],
  ['periferico', /\b(mouse|teclado|mousepad|webcam|microfone)\b/],
  ['assinatura', /\b(gift card|cartao presente|assinatura|psn|live gold|game pass|nintendo switch online)\b/],
];
export function subtipoAcessorio(nome: string): string {
  const t = normalizarNome(nome);
  for (const [k, re] of SUBTIPOS_ACESSORIO) if (re.test(t)) return k;
  return 'outros';
}

function idadeMin(d: Date | string | null | undefined, agora: number): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? Math.max(0, (agora - t) / 60000) : null;
}

/** Oferta de games (listRankedOffers/getFeaturedOffers) + metricas ja calculadas + mapa de popularidade -> item da hierarquia. */
export function itemDeOferta(o: OfferWithRelations, m: OfferListingMetrics | undefined, pop: MapaPopularidade, agora: number): ItemHierarquia {
  const mp = o.masterProduct;
  const v = m?.verdict;
  const lowConfidence = v?.lowConfidence === true;
  const queda = v?.kind === 'below' && v.deltaPercent != null ? -v.deltaPercent : null;
  // queda bruta (mesmo rebaixada por baixa confianca): so para flagrar preco-isca; o veredito rebaixa para 'inline' mas deltaPercent continua la.
  const bruta = v && v.deltaPercent != null && v.deltaPercent < 0 ? -v.deltaPercent : null;
  const eleg = m?.eligibility?.eligible === true;
  const tipo = mp.productType === 'accessory' ? `acc:${subtipoAcessorio(mp.name)}` : `${mp.productType}:${mp.gamePlatformGen ?? 'x'}`;
  return {
    id: o.id,
    tipo,
    marca: marcaDoItem('games', normalizarNome(mp.name)),
    loja: o.network.slug,
    familia: familiaDoNome(mp.name) || null,
    popularidade: pop.get(chavePopularidade(o.networkId, o.externalRef)) ?? 0,
    quedaMediaPct: queda,
    proximidadeMinimo: eleg && m && m.lowestPriceCents > 0 && o.currentPriceCents > 0 ? Math.min(1, m.lowestPriceCents / o.currentPriceCents) : null,
    noMenorRegistrado: m?.isLowestEver === true,
    baixaConfianca: lowConfidence,
    quedaBrutaPct: bruta,
    vendedor: sellerTier(o.seller) === 'low' ? 'low' : sellerTier(o.seller) === 'ok' ? 'ok' : 'unverified',
    idadeMin: idadeMin(o.lastCheckedAt as unknown as Date | null, agora),
  };
}

/** Reordena ofertas de games. Desligado (VITRINE_HIERARQUIA=off) devolve a MESMA ordem recebida. */
export function hierarquizarOfertas(
  ofertas: readonly OfferWithRelations[],
  metricas: ReadonlyMap<string, OfferListingMetrics>,
  pop: MapaPopularidade,
  opts: OpcoesHierarquia & { agora?: number; ligada?: boolean } = {}
): OfferWithRelations[] {
  if (!(opts.ligada ?? hierarquiaLigada())) return [...ofertas];
  const agora = opts.agora ?? Date.now();
  return hierarquizar(ofertas, (o) => itemDeOferta(o, metricas.get(o.id), pop, agora), opts);
}

/** Cartao de departamento (Arkos Price): sem historico/selo; vale frescor, tipo do departamento, marca da loja e loja. */
export function itemDeCartao(dept: string, c: Pick<CartaoDepartamento, 'id' | 'nome' | 'lojaMenor' | 'verificadoEm'>, agora: number): ItemHierarquia {
  return {
    id: c.id,
    tipo: `${dept}:${classificarTipo(dept, c.nome)}`,
    marca: marcaDoItem(dept, normalizarNome(c.nome)),
    loja: c.lojaMenor ?? null,
    familia: familiaDoNome(c.nome) || null,
    popularidade: 0,
    quedaMediaPct: null,
    proximidadeMinimo: null,
    noMenorRegistrado: false,
    baixaConfianca: false,
    quedaBrutaPct: null,
    vendedor: null,
    idadeMin: idadeMin(c.verificadoEm as unknown as Date | string | null, agora),
  };
}

export function hierarquizarCartoes<T extends Pick<CartaoDepartamento, 'id' | 'nome' | 'lojaMenor' | 'verificadoEm'>>(dept: string, cartoes: readonly T[], opts: OpcoesHierarquia & { agora?: number; ligada?: boolean } = {}): T[] {
  if (!(opts.ligada ?? hierarquiaLigada())) return [...cartoes];
  const agora = opts.agora ?? Date.now();
  return hierarquizar(cartoes, (c) => itemDeCartao(dept, c, agora), opts);
}
