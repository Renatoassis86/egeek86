/**
 * Frete e prazo das impressoras 3D até o CEP do dono (#118). Módulo PURO (sem banco, sem rede): interpreta as duas fontes e monta a linha da mensagem.
 * Nunca inventa: sem leitura, ou leitura com mais de 12 h, a linha diz "Prazo ainda não lido". Contrato em docs/frete-prazo-impressoras-2026-11-15.md.
 */
import { amazonFrescorMin } from '../messaging/confirmacao-preco';

export const CEP_ALVO = '58035090';
export const IDADE_MAX_MS = 12 * 3600_000;
export type FonteFrete = 'ml_api' | 'amazon_pagina';

export interface Cotacao {
  zip: string;
  costCents: number | null;
  free: boolean;
  etaFrom: string | null; // AAAA-MM-DD
  etaTo: string | null;
  carrier: string | null;
  logistic: string | null; // tipo logístico do ML (fulfillment, self_service, ...)
  soldBy: string | null;
  source: FonteFrete;
  readAt: Date;
}

/** Flag FRETE_PRAZO_IMPRESSORAS: 1/on/true liga a captura no servidor (ML via API) e a gravação das leituras da Amazon. Padrão desligada. */
export function fretePrazoLigado(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.FRETE_PRAZO_IMPRESSORAS ?? '').trim().toLowerCase();
  return v === '1' || v === 'on' || v === 'true';
}

const MESES: Record<string, number> = { janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12 };
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** Data civil (fuso de Brasília, UTC-3) de um instante, como AAAA-MM-DD. */
export function dataBR(d: Date): string { return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10); }
export const somaDias = (isoDate: string, n: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

/** Dia/mês sem ano -> AAAA-MM-DD no ano que deixa a data a partir de ontem (em relação à leitura). */
function resolverData(dia: number, mes: number, leitura: Date): string | null {
  if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12)) return null;
  const hoje = dataBR(leitura);
  const y = Number(hoje.slice(0, 4));
  const c = iso(y, mes, dia);
  return c >= somaDias(hoje, -1) ? c : iso(y + 1, mes, dia);
}

export interface EntregaAmazon { free: boolean; costCents: number | null; etaFrom: string | null; etaTo: string | null; zip: string | null; soldBy: string | null }

/**
 * Texto do bloco de entrega da página da Amazon, p.ex. "Entrega GRÁTIS Sábado, 21 de Novembro", "Entrega R$201 24 - 26 de Novembro. Ver detalhes",
 * "Entrega GRÁTIS Amanhã, 16 de Novembro". Devolve null se não achar nem valor/gratuidade nem data (nunca chuta).
 */
export function parseEntregaAmazon(textoEntrega: string, leitura: Date, opts: { cepTexto?: string | null; vendidoPor?: string | null } = {}): EntregaAmazon | null {
  const t = sem(String(textoEntrega ?? '').replace(/\s+/g, ' ')).slice(0, 400);
  if (!t) return null;
  // #120: frete grátis CONDICIONADO (só para membros Prime, ou "no seu primeiro pedido") não é o custo desta conta/CEP: leitura recusada (nunca vira "Frete grátis").
  if (/para membros prime|no seu primeiro pedido|primeiro pedido/.test(t) && /gratis/.test(t)) return null;
  const free = /(entrega|frete)\s+gratis/.test(t);
  const mc = /entrega\s+r\$\s*([\d.]+(?:,\d{1,2})?)/.exec(t);
  const costCents = free ? 0 : mc ? Math.round(Number(mc[1].replace(/\./g, '').replace(',', '.')) * 100) : null;
  let etaFrom: string | null = null;
  let etaTo: string | null = null;
  const mes = '([a-z]{3,9})\\.?';
  const faixa = new RegExp(`(\\d{1,2})(?:\\s+de\\s+${mes})?\\s*[-–]\\s*(\\d{1,2})\\s+de\\s+${mes}`).exec(t);
  const unica = new RegExp(`(\\d{1,2})\\s+de\\s+${mes}`).exec(t);
  if (faixa) {
    const m2 = MESES[faixa[4]];
    const m1 = faixa[2] ? MESES[faixa[2]] : m2;
    if (m1 && m2) { etaFrom = resolverData(Number(faixa[1]), m1, leitura); etaTo = resolverData(Number(faixa[3]), m2, leitura); }
  } else if (unica && MESES[unica[2]]) {
    etaFrom = etaTo = resolverData(Number(unica[1]), MESES[unica[2]], leitura);
  } else if (/\bhoje\b/.test(t)) etaFrom = etaTo = dataBR(leitura);
  else if (/\bamanha\b/.test(t)) etaFrom = etaTo = somaDias(dataBR(leitura), 1);
  if (costCents == null || !etaTo) return null; // sem valor/gratuidade ou sem data: leitura incompleta, não vira linha
  const zipM = /(\d{5})[-‑‐\s]?(\d{3})/.exec(opts.cepTexto ?? '');
  const vendedor = opts.vendidoPor && !/[{}"\\]|marketplaceid|merchantid/i.test(String(opts.vendidoPor)) ? String(opts.vendidoPor).replace(/^\s*(enviado\s*\/?\s*vendido|vendido e enviado por|vendido por)\s*/i, '').trim().slice(0, 80) : '';
  return { free, costCents, etaFrom, etaTo, zip: zipM ? `${zipM[1]}${zipM[2]}` : null, soldBy: vendedor || null };
}

export interface EntregaMl { free: boolean; costCents: number; etaFrom: string; etaTo: string; logistic: string | null; zip: string | null }

const diaIso = (s: unknown): string | null => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);

/** Resposta de GET /items/{id}/shipping_options?zip_code=... ; escolhe a opção recomendada (senão a de menor custo). Sem opção/data: null. */
export function parseShippingOptionsMl(json: unknown, logisticDoAnuncio?: string | null): EntregaMl | null {
  const j = json as { destination?: { zip_code?: string }; options?: Array<Record<string, any>> } | null;
  const ops = Array.isArray(j?.options) ? j!.options!.filter((o) => o && typeof o === 'object') : [];
  if (!ops.length) return null;
  const o = ops.find((x) => x.display === 'recommended') ?? [...ops].sort((a, b) => Number(a.cost ?? 1e12) - Number(b.cost ?? 1e12))[0];
  const costNum = Number(o.cost);
  if (!Number.isFinite(costNum) || costNum < 0) return null;
  const e = o.estimated_delivery_time ?? {};
  const etaFrom = diaIso(e.date);
  if (!etaFrom) return null;
  const etaTo = diaIso(e.offset?.date);
  const costCents = Math.round(costNum * 100);
  return { free: costCents === 0, costCents, etaFrom, etaTo: etaTo && etaTo >= etaFrom ? etaTo : etaFrom, logistic: logisticDoAnuncio ?? null, zip: j?.destination?.zip_code ? String(j.destination.zip_code).replace(/\D/g, '') : null };
}

export interface ItemCatalogoMl { item_id?: string; price?: number; condition?: string | null; seller_id?: number | string; shipping?: { logistic_type?: string; free_shipping?: boolean } }

/** Escolhe o anúncio da oferta entre os vencedores do catálogo: id conhecido; senão vendedor (um só preço, ou preço igual ao da oferta). Ambíguo: null. */
export function escolherItemMl(rows: ItemCatalogoMl[], t: { itemId?: string | null; sellerExternalId?: string | null; priceCents?: number | null }): ItemCatalogoMl | null {
  const novos = rows.filter((r) => r.item_id && r.condition === 'new');
  if (t.itemId) return novos.find((r) => r.item_id === t.itemId) ?? null;
  const centavos = (r: ItemCatalogoMl) => Math.round(Number(r.price) * 100);
  if (!t.sellerExternalId) return null;
  const s = novos.filter((r) => r.seller_id != null && String(r.seller_id) === t.sellerExternalId);
  if (!s.length) return null;
  if (new Set(s.map(centavos)).size === 1) return s[0];
  const p = s.filter((r) => centavos(r) === t.priceCents);
  return p.length === 1 ? p[0] : null;
}

const LOGISTICA: Record<string, string> = { fulfillment: 'Full', cross_docking: 'Mercado Envios (coleta)', xd_drop_off: 'Mercado Envios (agência)', drop_off: 'Mercado Envios (agência)', self_service: 'Envio Flex', custom: 'Envio do vendedor', default: 'Mercado Envios' };
export function rotuloLogisticaMl(logistic: string | null | undefined): string | null {
  return logistic ? (LOGISTICA[logistic] ?? null) : null;
}

const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dsem = (d: string) => SEM[new Date(`${d}T12:00:00Z`).getUTCDay()];
export function brlCents(c: number): string { return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

/**
 * Cotação com leitura de até 12 h (ML: API, data do anúncio); mais velha (ou sem valor/gratuidade) = ausente.
 * R-88 (2026-11-16, P2S Combo: a mensagem dizia 25/11 e a página 20/11): a entrega da AMAZON é volátil (mudou de 19/11 para 25/11 para 20/11 em 26 h) e vale o mesmo
 * que o preço da Amazon (R-81, AMAZON_FRESCOR_MIN, padrão 45 min); mais velha vira "Prazo ainda não lido".
 */
export function cotacaoValida(q: Cotacao | null | undefined, now: Date, env: Record<string, string | undefined> = process.env): q is Cotacao {
  if (!q || !(q.readAt instanceof Date) || isNaN(q.readAt.getTime())) return false;
  const idade = now.getTime() - q.readAt.getTime();
  const limite = q.source === 'amazon_pagina' ? amazonFrescorMin(env) * 60_000 : IDADE_MAX_MS;
  if (idade < -5 * 60_000 || idade > limite) return false;
  return q.free || (q.costCents != null && q.costCents >= 0);
}

/** Linha da mensagem. Ex.: "Frete grátis · chega até qui, 20/11 (CEP 58035090)"; "Prazo ainda não lido" sem leitura válida. Nunca inventa. */
export function linhaFretePrazo(q: Cotacao | null | undefined, now: Date, cepAlvo: string = CEP_ALVO): string {
  if (!cotacaoValida(q, now)) return 'Prazo ainda não lido';
  const frete = q.free ? 'Frete grátis' : `Frete ${brlCents(q.costCents!)}`;
  let prazo = '';
  if (q.etaTo) prazo = q.etaFrom && q.etaFrom !== q.etaTo ? ` · chega de ${dm(q.etaFrom)} a ${dm(q.etaTo)}` : ` · chega até ${dsem(q.etaTo)}, ${dm(q.etaTo)}`;
  const cep = q.zip === cepAlvo ? ` (CEP ${cepAlvo})` : ` (CEP lido ${q.zip})`;
  return `${frete}${prazo}${cep}`;
}

/** Detalhes extras para a decisão de compra (só o que foi lido): logística do ML e quem vende/envia na Amazon. */
export function detalhesEntrega(q: Cotacao | null | undefined, now: Date): string | null {
  if (!cotacaoValida(q, now)) return null;
  const p: string[] = [];
  const log = q.source === 'ml_api' ? rotuloLogisticaMl(q.logistic) : null;
  if (log) p.push(log);
  if (q.soldBy) p.push(`vendido e enviado por ${q.soldBy}`);
  return p.length ? p.join(' · ') : null;
}

/** Entre as cotações de uma oferta, a do CEP-alvo; senão a mais recente do mesmo prefixo (5 dígitos; a Amazon mostra o CEP da conta). */
export function melhorCotacao(qs: Cotacao[], cepAlvo: string = CEP_ALVO): Cotacao | null {
  const alvo = qs.filter((q) => q.zip === cepAlvo);
  const lista = alvo.length ? alvo : qs.filter((q) => q.zip.slice(0, 5) === cepAlvo.slice(0, 5));
  return [...lista].sort((a, b) => b.readAt.getTime() - a.readAt.getTime())[0] ?? null;
}

/** Cadência: P2S Combo e P1S Combo a cada 30 min; as demais a cada 3 h. */
export const intervaloMs = (destaque: boolean) => (destaque ? 30 : 180) * 60_000;
export function devida(ultimaLeitura: Date | null, destaque: boolean, now: Date): boolean {
  return !ultimaLeitura || now.getTime() - ultimaLeitura.getTime() >= intervaloMs(destaque);
}
