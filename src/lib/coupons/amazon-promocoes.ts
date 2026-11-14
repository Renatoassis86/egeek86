// LEITOR PURO das PROMOÇÕES DA AMAZON (páginas /promotion/psp/<ID>), 2026-11-12. Sem banco, sem rede, sem server-only: testado em
// scripts/test-amazon-promocoes.ts com fixtures reais em scripts/fixtures/amazon-cupons/.
//
// O que a Amazon mostra (descoberto lendo as páginas pela aba logada do dono, só leitura):
//  - A página da promoção tem um TÍTULO que é a regra ("Só no App: 15% off em Suplementos", "20% de desconto em 1 item(ns)",
//    "Exclusivo Prime: Compre 4 Livros e leve 10% off") e um banner "De <início> até <fim>" (nem sempre com hora).
//  - Os "Termos da promoção" (abre ao clicar em "Ver os termos") trazem a hora do fim: "expirando às 23:59 do dia 30 de Novembro de 2026".
//  - Os cards listam ASIN, título, preço atual e (às vezes) o preço anterior. O card NÃO mostra o preço com a promoção: o desconto é
//    aplicado depois (no app / no carrinho). Logo o preço final é DERIVADO da regra escrita no título (status derivado), como já é o selo.
//
// Regras desta camada (nada é inventado):
//  - VALIDADE só existe se lida (banner ou termos). Sem validade lida a promoção não vira cupom.
//  - Data sem hora no banner e sem hora nos termos: vale só até 00:00 BRT do último dia (conservador, nunca divulga além do lido).
//  - Exclusivo Prime, "seguir a loja" e compra de 2+ itens NÃO são para todos: viram `restrita` e NÃO geram cupom (a mensagem é para todos).
//  - Só app: entra, com a condição escrita ("só no app da Amazon") na mensagem.
import { sanitizeCouponName } from './coupon-name';

export const AMAZON_PROMO_ORIGIN = 'https://www.amazon.com.br';
export const AMAZON_PROMO_PATH = '/promotion/psp/';
export const MAX_ITENS_POR_PAGINA = 300;
/** Preço do card x preço da oferta no banco: acima disto o card é de outro item/variação e não liga. */
export const PRECO_TOLERANCIA = 0.15;

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

export interface PromoPayload {
  /** ID da promoção na URL (/promotion/psp/<ID>). */
  id: string;
  /** Título da página (document.title sem o prefixo "Amazon.com.br:" e sem o sufixo "promoção"). */
  titulo: string;
  /** Texto do banner do topo ("[Exclusivo para membros Prime] <título> De ... até ..."). */
  banner: string;
  /** Texto dos "Termos da promoção" quando lido (pode ser vazio). */
  termos?: string;
}

export interface PromoCardIn { a?: unknown; t?: unknown; p?: unknown; l?: unknown }
export interface PromoCard { asin: string; titulo: string; priceCents: number; listCents: number | null }

export type Restricao = 'prime' | 'quantidade' | 'seguir_loja' | null;

export interface PromoRead {
  id: string;
  titulo: string;
  percentual: number;
  /** Departamento que o título declara ("Suplementos"); null se o título não diz. */
  categoria: string | null;
  soApp: boolean;
  restricao: Restricao;
  /** Itens exigidos pela promoção (1 = desconto por item). */
  minItens: number | null;
  validFrom: string | null;
  validUntil: string;
  validityRaw: string;
  /** Frases dos termos que importam ao cliente (vendido pela Amazon; só produto físico). */
  termosCurtos: string[];
}

export type PromoParse = { ok: true; promo: PromoRead } | { ok: false; reason: 'sem_titulo' | 'sem_percentual' | 'sem_validade_lida' | 'promocao_encerrada' | 'id_invalido' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** "30 de novembro de 2026" + "23:59" (BRT, UTC-3, sem horário de verão desde 2019) -> ISO UTC. */
function brtToIso(d: number, mes: string, y: number, hh: number, mm: number): string | null {
  const m = MESES[norm(mes)] ?? MESES[mes.toLowerCase()];
  if (!m || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const t = Date.UTC(y, m - 1, d, hh + 3, mm, 0);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const DATA_RE = String.raw`(?:[a-zçã-]+-feira|s[aá]bado|domingo)?\s*(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})(?:\s+[àa]s\s+(\d{1,2}):(\d{2}))?`;

export function parseValidade(banner: string, termos: string): { from: string | null; until: string | null; raw: string } {
  const b = clean(banner);
  const de = new RegExp(String.raw`\bDe\s+${DATA_RE}`, 'i').exec(b);
  const ate = new RegExp(String.raw`\bat[eé]\s+${DATA_RE}`, 'i').exec(b);
  let from: string | null = null;
  if (de) from = brtToIso(+de[1], de[2], +de[3], de[4] ? +de[4] : 0, de[5] ? +de[5] : 0);
  if (!ate) {
    // Sem banner: só os termos ("expirando às 23:59 do dia 30 de Novembro de 2026").
    const t = /expirando\s+[àa]s\s+(\d{1,2}):(\d{2})\s+do\s+dia\s+(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i.exec(clean(termos));
    if (!t) return { from, until: null, raw: '' };
    return { from, until: brtToIso(+t[3], t[4], +t[5], +t[1], +t[2]), raw: t[0] };
  }
  const raw = clean(ate[0]);
  if (ate[4]) return { from, until: brtToIso(+ate[1], ate[2], +ate[3], +ate[4], +ate[5]), raw };
  // Data sem hora: usa a hora dos termos se for do mesmo dia; senão, conservador (00:00 BRT do último dia).
  const t = /expirando\s+[àa]s\s+(\d{1,2}):(\d{2})\s+do\s+dia\s+(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i.exec(clean(termos));
  if (t && +t[3] === +ate[1] && norm(t[4]) === norm(ate[2]) && +t[5] === +ate[3]) {
    return { from, until: brtToIso(+t[3], t[4], +t[5], +t[1], +t[2]), raw: `${raw}; ${clean(t[0])}` };
  }
  return { from, until: brtToIso(+ate[1], ate[2], +ate[3], 0, 0), raw: `${raw} (sem hora lida)` };
}

/** Lê a regra da promoção a partir do que a página escreve. Nunca assume: sem % no título ou sem validade lida = recusa com motivo. */
export function parsePromoPage(p: PromoPayload, now: Date): PromoParse {
  if (!/^[A-Z0-9]{8,20}$/.test(String(p?.id ?? ''))) return { ok: false, reason: 'id_invalido' };
  const titulo = clean(p.titulo).slice(0, 160);
  if (titulo.length < 6) return { ok: false, reason: 'sem_titulo' };
  const banner = clean(p.banner);
  const alvo = `${titulo} ${/exclusivo para membros prime/i.test(banner) ? 'Exclusivo Prime' : ''}`;
  const pct = /(\d{1,2}(?:[.,]\d)?)\s*%/.exec(titulo);
  const percentual = pct ? Number(pct[1].replace(',', '.')) : 0;
  if (!(percentual > 0 && percentual <= 70)) return { ok: false, reason: 'sem_percentual' };
  const v = parseValidade(banner, p.termos ?? '');
  if (!v.until) return { ok: false, reason: 'sem_validade_lida' };
  if (Date.parse(v.until) <= now.getTime()) return { ok: false, reason: 'promocao_encerrada' };

  const n = norm(alvo + ' ' + banner.slice(0, 120));
  const soApp = /\b(so no app|app only|no aplicativo|exclusivo no app)\b/.test(n);
  let minItens: number | null = null;
  const q1 = /\b(?:compre|leve)\s+(\d+)\b(?!\s*%)/.exec(n);
  const q2 = /\bem\s+(\d+)\s+(?:item|itens|item\(ns\)|produtos?|bebidas?|livros?|unidades?|pecas?|artigos?)\b/.exec(n);
  if (q1) minItens = +q1[1];
  else if (q2) minItens = +q2[1];
  let restricao: Restricao = null;
  if (/\bseguir\b/.test(n)) restricao = 'seguir_loja';
  else if (/\bprime\b/.test(n)) restricao = 'prime';
  else if (minItens != null && minItens >= 2) restricao = 'quantidade';

  const cat = /\boff\s+em\s+(?!\d)(.{2,40}?)\s*$/i.exec(titulo) ?? /\bdesconto\s+em\s+(?!\d)(.{2,40}?)\s*$/i.exec(titulo);
  // "Jogos de Nintendo Switch e Nintendo Switch 2 com 25% OFF": o departamento vem no INÍCIO do título (sem "off em <categoria>"). Só games é reconhecido aqui.
  const catInicio = !cat && /^(jogos?|games?|video ?games?)\b/.test(norm(titulo)) ? 'Games' : null;
  const termosCurtos: string[] = [];
  const tn = norm(p.termos ?? '');
  if (/apenas para produtos vendidos pela amazon/.test(tn)) termosCurtos.push('vale só para itens vendidos pela Amazon.com.br (não por vendedores parceiros)');
  if (/somente podera ser utilizado para compra de produtos fisicos|nao e valida para conteudo digital/.test(tn)) termosCurtos.push('só produtos físicos (não vale para conteúdo digital)');

  return {
    ok: true,
    promo: { id: p.id, titulo, percentual, categoria: cat ? clean(cat[1]) : catInicio, soApp, restricao, minItens, validFrom: v.from, validUntil: v.until, validityRaw: v.raw.slice(0, 200), termosCurtos },
  };
}

/**
 * PROMOÇÃO PRIME NA FINALIZAÇÃO (dono, 2026-11-14): o concorrente divulga "Exclusivo Prime: 25% de desconto na finalização do pedido" e nós descartávamos
 * essas promoções (`restrita_prime`). Passa a valer, atrás da flag PROMO_PRIME_DERIVADA, SÓ quando: a restrição é Prime (não "seguir a loja", não "compre N"),
 * há percentual e validade lidos e o departamento do título é mapeado (trava de departamento). O preço final é DERIVADO da regra escrita (como o de toda
 * promoção) e a oferta só vale depois da confirmação na página do próprio ASIN.
 */
export function primeNaFinalizacao(p: Pick<PromoRead, 'restricao' | 'minItens' | 'percentual' | 'categoria' | 'validUntil'>): boolean {
  if (p.restricao !== 'prime') return false;
  if (p.minItens != null && p.minItens >= 2) return false;
  if (!(p.percentual > 0 && p.percentual <= 70)) return false;
  if (!p.validUntil) return false;
  return verticaisDaCategoria(p.categoria).length > 0;
}

type Env = Record<string, string | undefined>;
const processEnv = (): Env => (typeof process !== 'undefined' ? process.env : {});
/** PROMO_PRIME_DERIVADA=on liga o registro das promoções Prime (desligada por padrão). */
export const promoPrimeLigada = (env: Env = processEnv()): boolean => (env.PROMO_PRIME_DERIVADA ?? '').toLowerCase() === 'on';
/** PROMO_DESCOBERTA=on liga o cadastro dos ASINs novos da página da promoção (games) pelo caminho da vitrine da Amazon (desligada por padrão). */
export const promoDescobertaLigada = (env: Env = processEnv()): boolean => (env.PROMO_DESCOBERTA ?? '').toLowerCase() === 'on';
/** GROUP_PROMO_PRIME=on deixa a mensagem CUPOM divulgar promoção Prime na finalização (desligada por padrão: a agulha segue barrando público restrito). */
export const promoPrimeMensagemLigada = (env: Env = processEnv()): boolean => (env.GROUP_PROMO_PRIME ?? '').toLowerCase() === 'on';
/** Texto do público lido (a página diz "Exclusivo para membros Prime"; o desconto entra na finalização do pedido). */
export const PUBLICO_PRIME_TEXTO = 'Exclusivo para membros Prime; desconto aplicado na finalização do pedido';

/** "431,06" / "R$ 1.234,56" -> centavos; null se não for valor. */
export function brlCents(raw: unknown): number | null {
  const m = /(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b/.exec(clean(raw));
  if (!m) return null;
  const v = parseInt(m[1].replace(/\./g, ''), 10) * 100 + parseInt(m[2], 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Cards da página -> itens válidos (ASIN de 10 caracteres, preço lido, sem repetição). */
export function parsePromoCards(cards: unknown): PromoCard[] {
  const out: PromoCard[] = [];
  const seen = new Set<string>();
  for (const c of (Array.isArray(cards) ? cards : []).slice(0, MAX_ITENS_POR_PAGINA) as PromoCardIn[]) {
    const asin = String(c?.a ?? '').toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    const price = brlCents(c.p);
    if (!price) continue;
    const list = brlCents(c.l);
    seen.add(asin);
    out.push({ asin, titulo: clean(c.t).slice(0, 200), priceCents: price, listCents: list && list > price ? list : null });
  }
  return out;
}

/** O preço do card confere com o da oferta no banco (mesma variação)? */
export function precoCasa(cardCents: number, offerCents: number): boolean {
  return offerCents > 0 && Math.abs(cardCents - offerCents) <= offerCents * PRECO_TOLERANCIA;
}

/** Preço final derivado da regra escrita no título (nunca exibido pela loja no card). */
export function precoComPromocao(priceCents: number, percentual: number): number {
  return priceCents - Math.round((priceCents * percentual) / 100);
}

export function fonteUrl(id: string): string {
  return `${AMAZON_PROMO_ORIGIN}${AMAZON_PROMO_PATH}${id}`;
}

/** Nome que a mensagem mostra: o título da promoção (sem "% off" cru, que a barreira de termos proíbe). */
export function nomeDaPromocao(titulo: string): string {
  const t = clean(titulo).replace(/(\d)\s*%\s*off\b/gi, '$1% de desconto').replace(/\bapp only\b/gi, 'Só no app');
  return sanitizeCouponName(t) ?? t.slice(0, 80);
}

/** Corpo de UM cupom (contrato /api/ingest/cupons) para UM ASIN ligado à oferta. Escopo `produto`: estável mesmo que os outros cards mudem. */
export function cupomDoItem(promo: PromoRead, item: { asin: string; offerId: string }, fonte: string, opts: { primeCheckout?: boolean } = {}): Record<string, unknown> {
  const nome = nomeDaPromocao(promo.titulo);
  // condicoes_texto entra no hash de deduplicação: só texto ESTÁVEL (os termos, que às vezes não são lidos, vão em `condicoes.termos`, fora do hash).
  const condicoes = [`Promoção da Amazon: ${nome}`, promo.soApp ? 'vale só pelo app da Amazon' : 'o desconto é aplicado pela própria Amazon', ...(opts.primeCheckout ? ['exclusivo para membros Prime, aplicado na finalização do pedido'] : [])].join('; ');
  return {
    tipo: 'percentual',
    valor: promo.percentual,
    valor_unidade: 'percentual',
    escopo: 'produto',
    escopo_ref: { item_ids: [item.asin], offer_ids: [item.offerId] },
    publico: opts.primeCheckout ? 'assinantes' : 'todos',
    ...(opts.primeCheckout ? { publico_texto: PUBLICO_PRIME_TEXTO } : {}),
    texto_bruto: `${promo.titulo} | Amazon.com.br${promo.categoria ? ` | ${promo.categoria}` : ''}`.slice(0, 3900),
    condicoes_texto: condicoes.slice(0, 1400),
    condicoes: { promo_id: promo.id, ativacao: promo.soApp ? 'app' : 'automatica', so_app: promo.soApp, preco_derivado_da_regra: true, ...(opts.primeCheckout ? { prime_checkout: true } : {}), termos: promo.termosCurtos.join('; ').slice(0, 190) || null },
    validade_inicio: promo.validFrom ?? undefined,
    validade_fim: promo.validUntil,
    validade_origem: 'texto_da_pagina',
    validade_texto: promo.validityRaw,
    fonte_tipo: 'portal_listagem',
    fonte_url: fonte,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// TRAVA DE DEPARTAMENTO (R-xx, 2026-11-13). Incidente: "Só no app: 20% off em Relógios" casou com Resident Evil 2 porque o leitor juntava os
// ASINs de carrosséis de recomendados (rhf-shoveler, "inspirado no seu histórico") com os da lista da regra. A promoção departamental só vale
// para produto do departamento escrito no título; a categoria do título precisa estar mapeada para verticais do catálogo. Em dúvida, não casa.
// ---------------------------------------------------------------------------------------------------------------------------------------------
/** Slugs reais de `affiliate_offers.vertical` / `master_products.vertical` (src/lib/catalog/departamentos.ts): 'eletrodomesticos' = Casa, 'eletroeletronicos' = Eletrônicos. */
export type Vertical = 'games' | 'impressao3d' | 'tecnologia' | 'livros' | 'eletrodomesticos' | 'eletroeletronicos' | 'esporte';

/** Departamentos que a Amazon escreve no título -> verticais do catálogo que realmente pertencem a eles. Categoria fora da tabela = nunca casa. */
const DEPARTAMENTOS: { re: RegExp; verticais: Vertical[] }[] = [
  { re: /^(video ?games?|games?|consoles?( e jogos)?|jogos (de )?video ?games?|jogos eletronicos)$/, verticais: ['games'] },
  { re: /^(esportes?|artigos esportivos|fitness|futebol|itens de pesca|ciclismo|camping|corrida|esportes e (aventura|lazer))$/, verticais: ['esporte'] },
  { re: /^(livros?|livros e (revistas|ebooks?)|hq|mangas?|quadrinhos)$/, verticais: ['livros'] },
  { re: /^(acessorios tech|tecnologia|informatica|computadores?|perifericos|celulares?|smartphones?|acessorios para (celular|informatica))$/, verticais: ['tecnologia'] },
  { re: /^(eletronicos|eletronicos e celulares|audio|tv e video|fones?)$/, verticais: ['eletroeletronicos'] },
  { re: /^(casa|cozinha|casa e cozinha|eletroportateis|eletrodomesticos|utilidades domesticas)$/, verticais: ['eletrodomesticos'] },
  { re: /^(relogios?|smartwatch(es)?|wearables?)$/, verticais: ['tecnologia', 'eletroeletronicos'] },
  { re: /^(impressao 3d|filamentos?|impressoras 3d)$/, verticais: ['impressao3d'] },
];

/** Verticais compatíveis com a categoria do título da promoção; [] = categoria não mapeada ou ausente (nada casa). */
export function verticaisDaCategoria(categoria: string | null | undefined): Vertical[] {
  const c = norm(clean(categoria)).replace(/\s+/g, ' ');
  if (!c) return [];
  return DEPARTAMENTOS.find((d) => d.re.test(c))?.verticais ?? [];
}

/** O produto (vertical do catálogo) pertence ao departamento escrito na promoção? Sem vertical conhecida ou categoria não mapeada = não. */
export function departamentoCompativel(categoria: string | null | undefined, vertical: string | null | undefined): boolean {
  const v = String(vertical ?? '').toLowerCase();
  return !!v && (verticaisDaCategoria(categoria) as string[]).includes(v);
}

/**
 * A linha do carrossel pertence à LISTA DA REGRA da promoção? `ancestrais` = do card para cima ({ tag, id }). Só vale o card dentro de `#productInfoList`
 * e fora de qualquer carrossel de recomendados (rhf-*, a-carousel, patrocinados). Prova (2026-11-13, A2N6WD5SKSR3G5): 69 cards na lista, 12 em 2 carrosséis rhf.
 */
export function cardEhDaLista(ancestrais: { tag?: string; id?: string; cls?: string }[]): boolean {
  let lista = false;
  for (const a of ancestrais) {
    const id = String(a.id ?? '');
    const tag = String(a.tag ?? '').toLowerCase();
    const cls = String(a.cls ?? '');
    if (/^rhf/i.test(tag) || /^rhf|^CardInstance|sp_detail|sponsored|carousel/i.test(id) || /a-carousel|rhf|sponsored/i.test(cls)) return false;
    if (id === 'productInfoList') lista = true;
  }
  return lista;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// VALIDAÇÃO POR PRODUTO NA FONTE (requisito do dono, 2026-11-13): o cupom só entra no produto depois que a PÁGINA DO PRÓPRIO ASIN confirma a
// promoção: link para a mesma promoção (/promotion/psp/<mesmo ID>) ou selo/linha de promoção com o mesmo percentual, e preço final coerente.
// ---------------------------------------------------------------------------------------------------------------------------------------------
export interface ItemLido {
  asin?: unknown;
  /** IDs /promotion/psp/<ID> encontrados nos links da página do item. */
  psp?: unknown;
  /** Texto dos blocos de promoção/cupom da página do item (promotions, couponsInBuybox, promoPriceBlockMessage...). */
  blocos?: unknown;
  /** Preço atual do item ("431,06"). */
  preco?: unknown;
  /** Preço final exibido pela loja com a promoção, se exibido. */
  precoFinal?: unknown;
}

export type Confirmacao =
  | { ok: true; evidencia: 'link_da_promocao' | 'selo_com_percentual'; priceCents: number; finalCents: number; finalLido: boolean }
  | { ok: false; motivo: 'asin_diferente' | 'sem_preco' | 'preco_nao_casa' | 'sem_confirmacao_na_pagina' | 'preco_final_incoerente' };

/** Pura. Sem confirmação explícita na página do item = não vale (ausência nunca prova validade). */
export function confirmarNoItem(item: ItemLido, esperado: { asin: string; promoId: string; percentual: number }, offerCents: number): Confirmacao {
  if (String(item.asin ?? '').toUpperCase() !== esperado.asin.toUpperCase()) return { ok: false, motivo: 'asin_diferente' };
  const price = brlCents(item.preco);
  if (!price) return { ok: false, motivo: 'sem_preco' };
  if (!precoCasa(price, offerCents)) return { ok: false, motivo: 'preco_nao_casa' };
  const psp = (Array.isArray(item.psp) ? item.psp : []).map((x) => String(x));
  const bloco = norm(clean(item.blocos));
  const pctTxt = String(esperado.percentual).replace('.', '[.,]');
  const seloMesmoPct = new RegExp(String.raw`(^|[^0-9])${pctTxt}\s*%\s*(off|de desconto|desconto)`).test(bloco);
  const evidencia = psp.includes(esperado.promoId) ? 'link_da_promocao' : seloMesmoPct ? 'selo_com_percentual' : null;
  if (!evidencia) return { ok: false, motivo: 'sem_confirmacao_na_pagina' };
  const derivado = precoComPromocao(price, esperado.percentual);
  const final = brlCents(item.precoFinal);
  if (final != null && Math.abs(final - derivado) > Math.max(derivado * 0.03, 100)) return { ok: false, motivo: 'preco_final_incoerente' };
  return { ok: true, evidencia, priceCents: price, finalCents: final ?? derivado, finalLido: final != null };
}
