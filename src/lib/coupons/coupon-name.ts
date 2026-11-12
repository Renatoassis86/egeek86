// NOME DO CUPOM NA MENSAGEM (ordem do dono, 2026-11-12): "Sobre os cupons, SEMPRE na mensagem coloque o NOME DO CUPOM DA PROMOÇÃO. A prioridade
// sempre será o nome dele, para o cliente usar. Exceto aqueles cupons que você clica, ativa, resgata e não têm nome: para esses casos você
// explica como deve usar." Módulo PURO (sem banco, sem rede): decide o que a linha "Cupom:" mostra e o passo a passo quando não há nome.
//
// Tipos de uso:
//   (a) COM NOME/CÓDIGO: o texto que identifica a promoção (código digitável lido na página; título da campanha lido na página ou na lista de
//       cupons do portal). A mensagem mostra o nome em destaque e, quando digitável, "Código: XXXX".
//   (b) SEM NOME, de ATIVAR com um clique ("Ative em Cupons", "Aplicar cupom"): rótulo = valor da regra (diferença real lida) e passo a passo
//       curto e específico da loja.
//   (c) exige seguir a loja ou conta específica: continua EXCLUÍDO (agulha; nada deste módulo o libera).
// Nada é inventado: o nome só existe se a página/lista o mostrou; o valor do rótulo (b) é a diferença real entre os dois preços lidos.

export type CouponNet = 'mercado-livre' | 'amazon' | 'shopee' | string;

const MAX_NAME = 80;
/** Palavras que nunca são código de cupom (selo genérico lido por engano). */
const NOT_CODES = new Set(['CUPOM', 'CUPONS', 'VOUCHER', 'DESCONTO', 'APLICAR', 'CODIGO', 'PROMO', 'OFERTA', 'FRETE', 'GRATIS', 'ATIVAR', 'RESGATAR', 'SHOPEE', 'AMAZON']);

const fmtBRL = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Texto de nome vindo de fora (página, lista de cupons, POST do loop): só texto, sem marcação, sem link, sem a palavra proibida;
 * '25% OFF' vira '25% de desconto' (a barreira de termos proíbe '% OFF'). null = descartar.
 */
export function cleanCouponText(raw: unknown, max: number = MAX_NAME): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  let s = raw.replace(/[\u0000-\u001f\u007f]/g, ' ');
  if (/[<>{}[\]`\\]|https?:|www\./i.test(s)) return null;
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*%\s*OFF\b/gi, '$1% de desconto').replace(/\s+/g, ' ').trim();
  if (/afiliad/i.test(s)) return null;
  if (s.length < 3 || s.length > max) return null;
  if (!/[A-Za-zÀ-ÿ0-9]/.test(s)) return null;
  return s;
}

/** Rótulos genéricos que não são nome: "Cupom", "Cupom do anúncio", "R$ 778,04 com Cupom" (preço, não nome). */
export function isGenericCouponName(s: string): boolean {
  const t = s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (/^(cupom|cupon|voucher|cupom do anuncio|cupom disponivel|aplicar cupom|ativar cupom)$/.test(t)) return true;
  if (/^r\$\s*[\d.,]+\s*com\s*(cupom|voucher)/.test(t)) return true;
  if (/\bseguir a loja\b/.test(t)) return true;
  return false;
}

/** Nome lido (página/POST): texto limpo e não genérico. */
export function sanitizeCouponName(raw: unknown): string | null {
  const s = cleanCouponText(raw);
  return s && !isGenericCouponName(s) ? s : null;
}

/** Código digitável lido (POST/página): 4 a 20 caracteres [A-Z0-9_-], com pelo menos uma letra, fora da lista de palavras comuns. Maiúsculas. */
export function sanitizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{3,19}$/.test(s) || !/[A-Z]/.test(s)) return null;
  const plain = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return NOT_CODES.has(plain) ? null : s;
}

export interface CouponUseInput {
  net: CouponNet;
  /** Código digitável lido na página (POST do loop). */
  code?: string | null;
  /** Nome/título da promoção lido na própria página do anúncio. */
  pageName?: string | null;
  /** Título da campanha na lista de cupons do portal (ex.: "10% OFF"). */
  listTitle?: string | null;
  /** Escopo na lista ("Em produtos de Loja", "Em TV Toshiba"). */
  listScope?: string | null;
  /** Ativação lida na lista do ML: AUTOMATIC | EU_QUERO. */
  ativacao?: string | null;
  /** Diferença real entre o preço do anúncio e o preço com cupom lido na página (centavos). */
  offCents: number;
  /** Desconto real em % (uma casa). */
  pct: number;
  /** Valor da regra lida (quando existir), para o rótulo do tipo (b). */
  rule?: { kind: 'percentual' | 'valor_fixo' | string; valueNum: number | null } | null;
}

export interface CouponUse {
  /** O que a linha "Cupom:" mostra. Nunca "Cupom do anúncio". */
  name: string;
  /** Código digitável (tipo a); null quando não há. */
  code: string | null;
  /** O nome veio da loja (true) ou é o rótulo do valor lido, tipo (b) (false). */
  named: boolean;
  /** Passo a passo curto e específico da loja. */
  howTo: string[];
  /** Os passos numa frase só ("1. Abra o anúncio; 2. ...; 3. ..."). */
  activation: string;
}

export function stepsText(steps: string[]): string {
  return steps.map((s, i) => `${i + 1}. ${s}`).join('; ') + '.';
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Passos de uso por rede e tipo. Sem inventar interface: só o que as páginas mostram ("Em Cupons", "Aplicar cupom", voucher no carrinho). */
export function howToUse(i: { net: CouponNet; code: string | null; name: string; named: boolean; ativacao?: string | null; offCents: number }): string[] {
  const valor = fmtBRL(i.offCents);
  if (i.code) return ['Abra o anúncio e adicione ao carrinho', `No campo de cupom, digite o código ${i.code}`, 'Finalize a compra'];
  if (i.net === 'amazon') return ['Abra o anúncio', `Clique em Aplicar o cupom de ${valor}, abaixo do preço`, 'Finalize a compra'];
  if (i.net === 'shopee') return ['Abra o anúncio', `Aplique o voucher${i.named ? ` ${i.name}` : ` de ${valor}`} no carrinho`, 'Finalize a compra'];
  // Mercado Livre
  if (String(i.ativacao ?? '').toUpperCase() === 'AUTOMATIC') return ['Abra o anúncio', 'O cupom é aplicado sozinho no pagamento (não precisa ativar)', 'Finalize a compra'];
  return ['Abra o anúncio', i.named ? `Em Cupons, ative o cupom ${i.name}` : `Em Cupons, ative o cupom de ${valor}`, 'Finalize a compra'];
}

/**
 * Decide o nome do cupom na mensagem. Prioridade: (1) nome lido na página do anúncio; (2) título da campanha na lista de cupons do portal
 * (com o escopo, ex.: "R$ 100 OFF em TV Toshiba"); (3) o código digitável, quando só ele existe; (4) sem nome: rótulo do valor lido
 * (regra da lista, senão a diferença real dos preços) e o passo a passo da loja.
 */
export function resolveCouponUse(inp: CouponUseInput): CouponUse {
  const code = sanitizeCouponCode(inp.code);
  const page = sanitizeCouponName(inp.pageName);
  let list = sanitizeCouponName(inp.listTitle);
  if (list) {
    const scope = cleanCouponText(inp.listScope ?? '', 70);
    if (scope && /^em\s/i.test(scope) && !/selecionad/i.test(scope)) list = `${list} ${lowerFirst(scope)}`;
  }
  let name: string | null = page ?? list ?? code ?? null;
  const named = name != null;
  if (!name) {
    const r = inp.rule;
    if (r?.kind === 'percentual' && r.valueNum) name = `${String(r.valueNum).replace('.', ',')}% de desconto`;
    else if (r?.kind === 'valor_fixo' && r.valueNum) name = `${fmtBRL(Math.round(r.valueNum * 100))} de desconto`;
    else name = `${fmtBRL(inp.offCents)} de desconto`;
  }
  const howTo = howToUse({ net: inp.net, code, name, named, ativacao: inp.ativacao, offCents: inp.offCents });
  return { name, code, named, howTo, activation: stepsText(howTo) };
}
