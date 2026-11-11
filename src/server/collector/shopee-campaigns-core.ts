/**
 * Campanhas oficiais da Shopee (API oficial de afiliados, shopeeOfferV2): normalizacao e escolha da campanha para a mensagem.
 * Puro (sem banco, sem rede). A campanha so diz ONDE resgatar cupons e ofertas; o valor de cupom nunca e prometido.
 */

export interface ShopeeCampaignRaw {
  offerName?: unknown;
  offerType?: unknown;
  categoryId?: unknown;
  collectionId?: unknown;
  offerLink?: unknown;
  commissionRate?: unknown;
  periodStartTime?: unknown;
  periodEndTime?: unknown;
}

export interface ShopeeCampaign {
  offerName: string;
  offerType: number | null;
  categoryId: string | null;
  collectionId: string | null;
  offerLink: string;
  /** Texto como a API devolveu (nao convertemos: formato fracao/percentual nao e documentado para nos). */
  commissionRateRaw: string | null;
  periodStart: string | null; // ISO UTC
  periodEnd: string | null; // ISO UTC
}

/** Epoch da API (segundos; aceita ms) ou ISO para ISO UTC. null se nao for data valida. */
export function parseShopeeTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : NaN;
  const ms = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(String(v));
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

/** Descarta o que nao tem nome ou link https de shopee.com.br (nunca monta link). */
export function normalizeShopeeCampaign(r: ShopeeCampaignRaw): ShopeeCampaign | null {
  const name = typeof r.offerName === 'string' ? r.offerName.trim() : '';
  const link = typeof r.offerLink === 'string' ? r.offerLink.trim() : '';
  if (!name || !/^https:\/\/([a-z0-9-]+\.)*shopee\.com\.br\/[^\s<>"]+$/i.test(link)) return null;
  const t = Number(r.offerType);
  const idOrNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, 80));
  const rate = r.commissionRate === null || r.commissionRate === undefined ? null : String(r.commissionRate).slice(0, 40);
  return {
    offerName: name.slice(0, 200),
    offerType: Number.isFinite(t) ? t : null,
    categoryId: idOrNull(r.categoryId),
    collectionId: idOrNull(r.collectionId),
    offerLink: link,
    commissionRateRaw: rate,
    periodStart: parseShopeeTime(r.periodStartTime),
    periodEnd: parseShopeeTime(r.periodEndTime),
  };
}

function canon(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Palavras do nome da campanha que casam com cada departamento. Departamento sem regra = sem link (nao arriscamos campanha fora de assunto). */
const VERTICAL_PATTERNS: Record<string, RegExp[]> = {
  games: [/gaming\s*(&|e|and)?\s*console/, /gaming/, /console/, /\bgames?\b/],
  tecnologia: [/eletronic|electronic|computer|informatica/, /celular|phone/],
  eletroeletronicos: [/eletronic|electronic|eletro/],
  eletrodomesticos: [/eletrodomestic|home appliance/],
  livros: [/livro|book/],
  esporte: [/esporte|sport/],
  impressao3d: [],
};

/** A campanha ainda vale agora? Exige periodo FINAL lido no futuro e inicio ja passado (ou ausente). */
export function campaignActive(c: Pick<ShopeeCampaign, 'periodStart' | 'periodEnd'>, now: Date): boolean {
  if (!c.periodEnd || Date.parse(c.periodEnd) <= now.getTime()) return false;
  if (c.periodStart && Date.parse(c.periodStart) > now.getTime()) return false;
  return true;
}

/**
 * Link da campanha mais adequada ao departamento: ativa agora, nome casando com o departamento (o primeiro padrao e o mais
 * especifico: "Gaming & Consoles"). Empate: a que termina mais tarde. Sem casamento: null (a linha nao aparece).
 */
export function pickShopeeCampaignUrl(list: ShopeeCampaign[], vertical: string, now: Date): string | null {
  const pats = VERTICAL_PATTERNS[vertical] ?? [];
  let best: { c: ShopeeCampaign; rank: number } | null = null;
  for (const c of list) {
    if (!campaignActive(c, now)) continue;
    const name = canon(c.offerName);
    const rank = pats.findIndex((re) => re.test(name));
    if (rank < 0) continue;
    if (!best || rank < best.rank || (rank === best.rank && Date.parse(c.periodEnd!) > Date.parse(best.c.periodEnd!))) best = { c, rank };
  }
  return best ? best.c.offerLink : null;
}
