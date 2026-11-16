// DESCONTO POR CARTÃO / MEIO DE PAGAMENTO lido na página do anúncio (dono, 2026-11-15, #112). PURO: sem banco, sem rede.
// A aba logada do dono manda só os TEXTOS que a página escreve ("Use seu cartão Itaú Mastercard e ganhe 15% off!", "em até 10x de R$ 845,91 sem juros",
// "18x R$ 547,33 com cartão Mercado Pago", "R$ 46,65 de cashback em Meli Dólar com seu Cartão de Crédito Mercado Pago", "5% OFF no Pix");
// aqui eles viram benefícios estruturados. Nada é inventado:
//  - emissora/cartão, percentual, teto, mínimo, parcelas e cashback saem do texto lido; o que não está escrito fica nulo;
//  - preço final derivado SÓ de percentual lido x preço lido na própria página (base); benefício de % por cartão/Pix sempre "a confirmar no carrinho"
//    (a regra completa — teto, validade, bandeira exata, conta — fica no "Saiba mais", não na página);
//  - parcelas e cashback não têm "preço final": são informação de pagamento (sem % inventado).
import { brlToCents } from './page-read';
import { AGULHA } from './agulha';

export type CardBenefitKind = 'cartao_pct' | 'pix_pct' | 'parcelas' | 'cashback' | 'preco_a_vista';

export interface CardBenefit {
  kind: CardBenefitKind;
  /** "Itaú Mastercard", "Mercado Pago"... só o que o texto escreve. */
  issuer: string | null;
  pct: number | null;
  capCents: number | null;
  minOrderCents: number | null;
  installments: number | null;
  installmentCents: number | null;
  /** parcelas: o texto diz "sem juros". */
  noInterest: boolean;
  cashbackCents: number | null;
  /** Preço final derivado (pct sobre a base lida); null quando não há pct ou base. */
  finalPriceCents: number | null;
  /** true = regras completas não estão na página: confirmar no carrinho. */
  needsConfirm: boolean;
  rawText: string;
  dedupKey: string;
}

type Parcial = Omit<CardBenefit, 'dedupKey'>;

const MONEY = String.raw`R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)`;
const PCT = String.raw`(\d{1,2}(?:[.,]\d{1,2})?)\s*%`;

function limpo(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\s*Saiba mais\.?$/i, '').trim().slice(0, 220);
}
function pctNum(raw: string): number | null {
  const v = Number(raw.replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v <= AGULHA.MAX_PLAUSIBLE_DISCOUNT_PCT ? v : null;
}
function emissora(raw: string | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').replace(/^(?:de |do |da )/i, '').replace(/[.,;!:]+$/, '').trim();
  if (!t || t.length > 50 || /\d/.test(t) || /^(?:cr[eé]dito|d[eé]bito|qualquer)$/i.test(t)) return null;
  return t.replace(/(\p{L})(\p{L}*)/gu, (_m, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
}
function base(kind: CardBenefitKind, rawText: string): Parcial {
  return { kind, issuer: null, pct: null, capCents: null, minOrderCents: null, installments: null, installmentCents: null, noInterest: false, cashbackCents: null, finalPriceCents: null, needsConfirm: false, rawText };
}
/**
 * NUNCA deriva preço final (rodada de 2026-11-16, "Itaú Mastercard 15%" da Amazon): o preço lido na página da Amazon JÁ é o de destaque ("10% off à vista no Pix"),
 * e formas de pagamento são excludentes; aplicar o % do cartão sobre ele empilhava descontos que não existem (R$ 7.901,18 -> R$ 6.716,00). Só se mostra valor final
 * se a PRÓPRIA página o mostrar (hoje o leitor não lê nenhum), então o preço final derivado é sempre nulo.
 */
function derivar(_pct: number | null, _seen: number | null, _cap: number | null): number | null {
  return null;
}
function chave(b: Parcial): string {
  return [b.kind, (b.issuer ?? '').toLowerCase(), b.pct ?? '', b.installments ?? '', b.installmentCents ?? '', b.cashbackCents ?? ''].join('|');
}

/** Interpreta UM texto. Devolve 0 ou 1 benefício (texto sem regra legível é descartado: nunca vira desconto inventado). */
export function parseCardBenefit(texto: string, seenCents: number | null): CardBenefit | null {
  const t = limpo(String(texto ?? ''));
  if (!t) return null;
  let b: Parcial | null = null;
  let m: RegExpExecArray | null;
  const cap = new RegExp(String.raw`(?:at[eé]|limite de|m[aá]x(?:imo)?\.?(?: de)?)\s*${MONEY}`, 'i').exec(t);
  const min = new RegExp(String.raw`(?:m[ií]n(?:imo)?\.?|compras? (?:acima|a partir) de|acima de)[^R\d]{0,12}${MONEY}`, 'i').exec(t);
  if ((m = new RegExp(String.raw`cart[ãa]o\s+(.{2,50}?)\s+e\s+(?:ganhe|economize|receba)\s+${PCT}`, 'i').exec(t))) {
    const pct = pctNum(m[2]);
    if (pct != null) {
      b = base('cartao_pct', t);
      b.issuer = emissora(m[1]);
      b.pct = pct;
      b.needsConfirm = true;
    }
  } else if ((m = new RegExp(String.raw`${PCT}\s*(?:off|de desconto)\s+[àa]\s+vista\s+(?:no|via|com)\s+(?:o\s+)?(pix|nupay)`, 'i').exec(t))) {
    // "10% off à vista no Pix e NuPay": é o QUALIFICADOR do preço de destaque que a página mostra (o preço lido já é esse), não um desconto a mais.
    const pct = pctNum(m[1]);
    if (pct != null) {
      b = base('preco_a_vista', t);
      b.pct = pct;
      b.issuer = m[2].toLowerCase() === 'pix' ? 'Pix' : 'NuPay';
    }
  } else if ((m = new RegExp(String.raw`${PCT}\s*(?:off|de desconto)?\s+(?:no|via|com)\s+(?:o\s+)?pix`, 'i').exec(t)) || (m = new RegExp(String.raw`pix[^%\d]{0,25}${PCT}`, 'i').exec(t))) {
    const pct = pctNum(m[1]);
    if (pct != null) {
      b = base('pix_pct', t);
      b.pct = pct;
      b.needsConfirm = true;
    }
  } else if ((m = new RegExp(String.raw`${MONEY}\s+de\s+cashback(?:\s+em\s+[\p{L} ]{2,20}?)?(?:\s+com\s+(?:seu\s+|o\s+)?cart[ãa]o(?:\s+de\s+cr[eé]dito)?\s+(.{2,40}?))?\s*$`, 'iu').exec(t))) {
    const c = brlToCents(m[1]);
    if (c != null) {
      b = base('cashback', t);
      b.cashbackCents = c;
      b.issuer = emissora(m[2]);
    }
  } else if ((m = new RegExp(String.raw`(\d{1,2})\s*x\s+(?:de\s+)?${MONEY}(?:\s+sem juros|\s+com\s+(?:o\s+)?cart[ãa]o\s+(.{2,40}?)\s*$)?`, 'i').exec(t))) {
    const n = Number(m[1]);
    const c = brlToCents(m[2]);
    if (n >= 2 && n <= 24 && c != null) {
      b = base('parcelas', t);
      b.installments = n;
      b.installmentCents = c;
      b.noInterest = /sem juros/i.test(t);
      b.issuer = emissora(m[3]);
    }
  }
  if (!b) return null;
  b.capCents = cap ? brlToCents(cap[1]) : null;
  b.minOrderCents = min ? brlToCents(min[1]) : null;
  b.finalPriceCents = derivar(b.pct, seenCents, b.capCents);
  return { ...b, dedupKey: chave(b) };
}

/**
 * GATILHO ANTI-ISCA (permanente, todas as redes): benefício derivado de texto genérico ou sem prova no item NÃO vira mensagem, lista, card nem alerta.
 * Verificado por padrão = só o que a página imprime junto do preço do próprio item: parcelas ("12x de R$ 731,61 sem juros") e o qualificador do preço de
 * destaque ("à vista no Pix"). Desconto de cartão (%), Pix % e cashback ficam "não verificados" (a regra completa fica atrás do "Saiba mais" e o texto pode
 * vir de banner de campanha) e só saem se CARD_BENEFITS_TIPOS os liberar explicitamente.
 */
export const TIPOS_VERIFICADOS_PADRAO: CardBenefitKind[] = ['parcelas', 'preco_a_vista'];
export function beneficioVerificado(b: Pick<CardBenefit, 'kind'>, tipos: readonly string[] = TIPOS_VERIFICADOS_PADRAO): boolean {
  return tipos.includes(b.kind);
}
export function tiposLiberados(env: Record<string, string | undefined> = process.env): string[] {
  const v = (env.CARD_BENEFITS_TIPOS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return v.length ? v : [...TIPOS_VERIFICADOS_PADRAO];
}

/** Vários textos -> benefícios únicos (até 8). */
export function parseCardBenefits(textos: unknown, seenCents: number | null): CardBenefit[] {
  const out = new Map<string, CardBenefit>();
  for (const x of (Array.isArray(textos) ? textos : []).slice(0, 12)) {
    const b = parseCardBenefit(typeof x === 'string' ? x : '', seenCents);
    if (b && !out.has(b.dedupKey)) out.set(b.dedupKey, b);
    if (out.size >= 8) break;
  }
  return [...out.values()];
}

type Rotulavel = Pick<CardBenefit, 'kind' | 'issuer' | 'pct' | 'installments' | 'installmentCents' | 'noInterest' | 'cashbackCents'>;
const reais = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctTxt = (v: number) => `${String(v).replace('.', ',')}%`;

/** Rótulo curto: "Itaú Mastercard 15%" / "Pix 5%" / "Cashback R$ 46,65 (Mercado Pago)" / "10x de R$ 845,91 sem juros". Null = nada a mostrar. */
export function rotuloBeneficioCartao(b: Rotulavel): string | null {
  if (b.kind === 'cartao_pct' && b.pct != null) return `${b.issuer ?? 'Cartão'} ${pctTxt(b.pct)}`;
  if (b.kind === 'pix_pct' && b.pct != null) return `Pix ${pctTxt(b.pct)}`;
  if (b.kind === 'preco_a_vista') return b.issuer === 'NuPay' ? 'à vista no NuPay' : 'à vista no Pix';
  if (b.kind === 'cashback' && b.cashbackCents != null) return `Cashback ${reais(b.cashbackCents)}${b.issuer ? ` (${b.issuer})` : ''}`;
  if (b.kind === 'parcelas' && b.installments != null && b.installmentCents != null) {
    return `${b.installments}x de ${reais(b.installmentCents)}${b.noInterest ? ' sem juros' : b.issuer ? ` no cartão ${b.issuer}` : ''}`;
  }
  return null;
}

/** Linha do site/mensagem: "Desconto no cartão: Itaú Mastercard 15% (a confirmar no carrinho)"; parcelas e cashback como "Pagamento: ...". */
export function textoFrontBeneficio(b: Rotulavel & Pick<CardBenefit, 'needsConfirm'>): string | null {
  const r = rotuloBeneficioCartao(b);
  if (!r) return null;
  const conf = b.needsConfirm ? ' (a confirmar no carrinho)' : '';
  if (b.kind === 'cartao_pct') return `Desconto no cartão: ${r}${conf}`;
  if (b.kind === 'pix_pct') return `Desconto no Pix: ${r.replace('Pix ', '')}${conf}`;
  if (b.kind === 'preco_a_vista') return `Preço ${r}`;
  return `Pagamento: ${r}`;
}
