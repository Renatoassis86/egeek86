// R-114 (dono, 2026-11-22): MENSAGEM V4 das lojas no Telegram. MÓDULO PURO: sem banco, sem rede, sem relógio, sem env na importação.
// Ata: docs/conselho/atas/2026-11-22-mensagem-v4.md. Rollback: MENSAGEM_V4=off devolve o formato anterior (o compositor nem é chamado).
//
// O que a v4 garante em toda mensagem de UM produto (modelos media, movimento, achado e preco-agora):
//  1. Os TRÊS estados que o sistema já tem, sem inventar outro: "Novo no monitoramento" (produto recém-entrado), "Em monitoramento"
//     (já acompanhado, sem histórico para laudo) e "Diagnóstico de compra" (veredito da régua ou leitura com base suficiente).
//  2. Segmentação explícita: Categoria (loja), Tipo, Marca, Plataforma, Formato e Condição "Novo".
//  3. Indicadores de preço (R-107): menor preço registrado, comparação com a média, queda, Pix, parcelas e frete (só com prova).
//  4. Comparação com a MÉDIA em todo estado EXCETO "Novo no monitoramento" (que não compara). Sem média = a linha diz que ainda não há.
//  5. LINK DE AFILIADO DO DONO no corpo, em linha própria e em texto puro (sobrevive ao copiar para o WhatsApp); o botão continua.
//     Link do texto = o curto do dono quando passa no padrão da R-70; senão o /go do próprio site. Nunca link de terceiro.
//  6. Legenda de foto <= 1024 caracteres visíveis: linhas acessórias saem, em ordem fixa, até caber (o link e o preço nunca saem).
//  7. Sem metodologia nem regra interna no texto (só o dado).
import { ehLinkAfiliadoValido } from '@/lib/affiliate/link-afiliado';
import { marcaDoItem } from '@/lib/messaging/marcas-lojas';
import { normalizarTitulo, ROTULO_OUTROS } from '@/lib/catalog/tipos-produto';
import {
  TG,
  WA,
  buildGoLink,
  compraLines,
  dayToDate,
  departmentLabel,
  escapeTelegramHtml,
  escapeWhatsapp,
  fmtBRL,
  fmtDay,
  getSlogan,
  inNetwork,
  isAmazonOffer,
  promoLine,
  readingOf,
  sellerLine,
  seloLines,
  stampLine,
  topic,
  withTag,
  GROUP_LINK_BASE,
  type Fmt,
  type GroupChannel,
  type MoveDetail,
  type MsgAvg,
  type MsgOffer,
  type PriceInd,
} from '@/lib/messaging/group-messages';
import { cabecalhoDeDegrau, faixaTexto, ROTULO_MONITORAMENTO, REGUA, type Degrau, type FaixaPreco } from '@/lib/messaging/regua';
import { captionVisibleLength } from '@/lib/messaging/telegram-send';
import type { MenorPrecoRegistrado } from '@/lib/messaging/menor-preco-registrado';

export type EstadoMensagem = 'novo' | 'monitoramento' | 'diagnostico';

/** Rótulos dos três estados (os mesmos do sistema: ACHADO 'Novo no monitoramento'/'Em monitoramento' e a régua 'Diagnóstico'). */
export const ROTULO_ESTADO: Record<EstadoMensagem, string> = {
  novo: 'Novo no monitoramento',
  monitoramento: 'Em monitoramento',
  diagnostico: 'Diagnóstico de compra',
};

/** Orçamento da legenda antes de o envio acrescentar "Grupo no WhatsApp: <link>" (~70) e, se houver, o cupom: fica abaixo de 1024. */
export const V4_ORCAMENTO_LEGENDA = 930;

/** MENSAGEM_V4=off (ou 0/false/nao) volta ao formato anterior. Padrão: ligado. */
export function mensagemV4Ligada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|0|false|nao|não)$/i.test(String(env.MENSAGEM_V4 ?? '').trim());
}

// ---------------------------------------------------------------------------
// Estado do produto
// ---------------------------------------------------------------------------
export interface EntradaEstado {
  model: 'media' | 'movimento' | 'achado' | 'preco-agora';
  /** achado: a oferta e o produto entraram há pouco (R-72). */
  novo?: boolean;
  /** Veredito da régua gravado no candidato (rotulo 'Em monitoramento' = média provisória, sem laudo). */
  veredito?: { rotulo: string } | null;
  /** Loja ainda na fase de formação (sem histórico). */
  emFormacao?: boolean;
  avg?: MsgAvg | null;
  /** Dias de série medida que sustentam a leitura. */
  seriesDays?: number;
}

/**
 * Mapa EXATO para os estados que o sistema já tem (nada novo):
 *  - achado novo -> Novo no monitoramento; achado antigo e preco-agora (N1, sem base) -> Em monitoramento;
 *  - media/movimento com veredito da régua -> o rótulo da régua decide ('Em monitoramento' = média provisória; qualquer degrau = Diagnóstico);
 *  - media/movimento sem régua -> Diagnóstico só com base (>= MIN_OFERTAS_PCT ofertas e >= MIN_DIAS_HISTORICO dias), senão Em monitoramento.
 */
export function estadoDaMensagem(e: EntradaEstado): EstadoMensagem {
  if (e.model === 'achado') return e.novo === true ? 'novo' : 'monitoramento';
  if (e.model === 'preco-agora') return 'monitoramento';
  if (e.veredito) return e.veredito.rotulo === ROTULO_MONITORAMENTO ? 'monitoramento' : 'diagnostico';
  if (e.emFormacao) return 'monitoramento';
  const a = e.avg;
  if (!a || !(a.cents > 0)) return 'monitoramento';
  const ofertasOk = a.scope === 'own' || a.offers >= REGUA.MIN_OFERTAS_PCT;
  return ofertasOk && (e.seriesDays ?? 0) >= REGUA.MIN_DIAS_HISTORICO ? 'diagnostico' : 'monitoramento';
}

// ---------------------------------------------------------------------------
// Só produto NOVO (última barreira, vale com a v4 ligada ou desligada)
// ---------------------------------------------------------------------------
const CONDICAO_NAO_NOVA_RE =
  /\b(usad[oa]s?|semi ?nov[oa]s?|recondicionad[oa]s?|reacondicionad[oa]s?|refurbished|open ?box|vitrine|mostruario|sem lacre|lacre (?:aberto|rompido|violado)|caixa aberta|embalagem aberta|segunda mao|pre ?owned|de exposicao|avariad[oa]s?|com defeito|para retirada de pecas|sucata)\b/;
/** Vitrine como PRODUTO (expositor/estante), não como condição do item. */
const VITRINE_PRODUTO = /\b(expositor|estante|nicho|display|suporte|prateleira|cristaleira|armario|acrilic\w*|case)\b/;

/** Motivo de bloqueio se algum texto (nome do master, título da oferta) declara condição não nova. null = ok. */
export function bloqueioCondicaoNaoNova(...textos: Array<string | null | undefined>): string | null {
  for (const raw of textos) {
    const t = normalizarTitulo(raw ?? '').trim();
    if (!t) continue;
    const m = CONDICAO_NAO_NOVA_RE.exec(t);
    if (!m) continue;
    if (m[1] === 'vitrine' && VITRINE_PRODUTO.test(t)) continue;
    return `condicao_nao_nova_na_mensagem(${m[1]})`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Segmentação
// ---------------------------------------------------------------------------
const MARCA_ESPECIAL: Record<string, string> = { 'tp link': 'TP-Link', 'l oreal': "L'Oréal", 'l?oreal': "L'Oréal", 'de walt': 'DeWalt', 'black decker': 'Black+Decker', 'hot wheels': 'Hot Wheels', 'g tech': 'G-Tech', 'o boticario': 'O Boticário', 'bambu lab': 'Bambu Lab', 'ea sports': 'EA Sports' };

const NAO_E_MARCA = / (bluetooth|sebo|nozzle|ender|kobra|dualsense|pulse|gen) /g;

/** Marca do produto a partir do dicionário da loja (marcas-lojas.ts), exibida legível. Games: nenhuma (a plataforma já diz). null = não identificada. */
export function marcaParaExibicao(vertical: string, titulo: string): string | null {
  if (vertical === 'games') return null;
  // O dicionário da loja serve à variedade da fila e traz palavras que NÃO são marca ("bluetooth", "sebo", linhas de produto): saem antes de procurar.
  const limpo = normalizarTitulo(titulo).replace(NAO_E_MARCA, ' ').replace(/\s+/g, ' ').trim();
  const raw = marcaDoItem(vertical, limpo);
  if (!raw) return null;
  if (MARCA_ESPECIAL[raw]) return MARCA_ESPECIAL[raw];
  if (raw.length <= 3) return raw.toUpperCase();
  return raw.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function rotuloFormato(formato: string | null | undefined): string | null {
  return formato === 'physical' ? 'Mídia física' : formato === 'digital' ? 'Mídia digital' : null;
}

// ---------------------------------------------------------------------------
// Link de compra no corpo
// ---------------------------------------------------------------------------
/** O link que vai no texto: o de afiliado do dono (R-70) quando passa no padrão da rede; senão o /go do site (rastreio próprio). Nunca outro. */
export function linkDeCompraDoTexto(o: MsgOffer, canal: GroupChannel, messageKey: string): string | null {
  const url = (o.affiliateUrl ?? '').trim();
  if (url && /^https:\/\/[^\s<>"]+$/.test(url) && ehLinkAfiliadoValido(url, o.networkSlug)) return url;
  try {
    return buildGoLink(o.slug, canal, messageKey);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Comparação com a média
// ---------------------------------------------------------------------------
const pct1 = (x: number) => x.toFixed(1).replace('.', ',');

/** "12,3% abaixo da média das lojas (R$ 100,00)". Amazon nunca cita outra loja (média do mercado / na Amazon / mediana do próprio anúncio). null = sem média. */
export function textoComparacaoMedia(price: number, avg: MsgAvg | null | undefined, amazon: boolean): string | null {
  if (!avg || !(avg.cents > 0)) return null;
  // Amazon só compara com média quando o escopo foi definido (PRICE_AMAZON_MODE=on); sem escopo, a média é a das outras lojas e não se cita.
  if (amazon && !avg.scope) return null;
  const own = amazon && avg.scope === 'own';
  const nome = own ? `mediana de ${avg.days ?? 14} dias deste anúncio` : !amazon ? 'média das lojas' : avg.scope === 'amazon' ? 'média na Amazon' : 'média do mercado';
  const diff = ((avg.cents - price) / avg.cents) * 100;
  if (Math.abs(diff) < 0.05) return `no nível da ${nome} de ${fmtBRL(avg.cents)}`;
  return diff > 0 ? `${pct1(diff)}% abaixo da ${nome} de ${fmtBRL(avg.cents)}` : `${pct1(-diff)}% acima da ${nome} de ${fmtBRL(avg.cents)}`;
}

// ---------------------------------------------------------------------------
// Compositor
// ---------------------------------------------------------------------------
export interface MensagemV4Input {
  estado: EstadoMensagem;
  vertical: string;
  titulo: string;
  /** Tipo do produto na loja (rótulo legível). Games: 'Jogo' ou 'Console'. */
  tipoLabel?: string | null;
  marca?: string | null;
  plataforma?: string | null;
  formato?: string | null;
  offer: MsgOffer;
  messageKey: string;
  adTag: string;
  avg?: MsgAvg | null;
  /** Veredito da régua (degrau + rótulo): só no Diagnóstico de compra. */
  veredito?: { degrau: Degrau; rotulo: string } | null;
  move?: MoveDetail | null;
  refCents?: number | null;
  sinceDay?: string | null;
  ind?: PriceInd | null;
  faixa?: FaixaPreco | null;
  /** Achado com histórico próprio: frase pronta (ex.: "em linha com a mediana dos últimos 10 dias de coleta deste produto"). */
  diagnostico?: string | null;
  /** R-117: menor preço já registrado (série fechada, antes de hoje) frente ao preço atual. null/ausente = sem registro anterior: a linha é omitida. */
  menor?: MenorPrecoRegistrado | null;
}

type Opcional = 'bf' | 'faixa' | 'vendedor' | 'promo' | 'slogan' | 'selos';
const ORDEM_CORTE: Opcional[] = ['bf', 'faixa', 'vendedor', 'selos', 'promo', 'slogan'];

function movimentoBullets(f: Fmt, i: MensagemV4Input, amz: boolean): string[] {
  const price = i.offer.priceCents;
  const out: string[] = [];
  const m = i.move ?? null;
  if (m) {
    if ((m.kind === 'OK2' || m.kind === 'T1') && m.prevCents != null && m.prevCents > price) {
      out.push(topic(f, 'Queda', `${pct1(((m.prevCents - price) / m.prevCents) * 100)}% a menos que ontem (${fmtBRL(m.prevCents)})`));
    }
    const desde = fmtDay(dayToDate(m.sinceDay));
    if (m.kind === 'OK1') out.push(topic(f, 'Menor preço registrado', `novo mínimo${amz ? ' da Amazon' : ''}, desde ${desde} (o anterior era ${fmtBRL(m.refCents)})`));
    else if (price < m.refCents) out.push(topic(f, 'Menor preço registrado', `${fmtBRL(m.refCents)} (este preço é ${pct1(((m.refCents - price) / m.refCents) * 100)}% menor)`));
    else if (price === m.refCents) out.push(topic(f, 'Menor preço registrado', `este preço é o menor que registramos, desde ${desde}`));
    else out.push(topic(f, 'Menor preço registrado', `${fmtBRL(m.refCents)} (este preço é ${pct1(((price - m.refCents) / m.refCents) * 100)}% maior)`));
  } else if (i.refCents != null && i.refCents > 0) {
    const ref = i.refCents;
    if (price < ref) out.push(topic(f, 'Menor preço registrado', `novo mínimo${i.sinceDay ? `, desde ${fmtDay(dayToDate(i.sinceDay))}` : ''} (o anterior era ${fmtBRL(ref)})`));
    else if (price === ref) out.push(topic(f, 'Menor preço registrado', `este preço é o menor que registramos${i.sinceDay ? `, desde ${fmtDay(dayToDate(i.sinceDay))}` : ''}`));
    else out.push(topic(f, 'Menor preço registrado', `${fmtBRL(ref)} (este preço é ${pct1(((price - ref) / ref) * 100)}% maior)`));
  }
  return out;
}

/** R-117: a linha do menor preço já registrado, com a data. Texto simples (sobrevive ao copiar para o WhatsApp). */
export function linhaMenorPreco(f: Fmt, m: MenorPrecoRegistrado): string {
  const quando = `${fmtBRL(m.cents)} em ${fmtDay(dayToDate(m.day))}`;
  if (m.situacao === 'novo-minimo') return topic(f, 'Menor preço já registrado', `este é o menor preço que já vimos (o anterior era ${quando})`);
  if (m.situacao === 'igual') return topic(f, 'Menor preço já registrado', `este preço iguala o menor que já vimos, ${quando}`);
  return topic(f, 'Menor preço registrado', `${quando} · agora +${pct1(m.acimaPct ?? 0)}%`);
}

/** "Nome do jogo (Console)": só o nome do console entre parênteses; não duplica se o título já termina com ele. */
export function tituloGames(titulo: string, plataforma: string | null | undefined): string {
  const p = (plataforma ?? '').trim();
  if (!p) return titulo;
  const fim = titulo.toLowerCase().replace(/\s+/g, ' ');
  if (fim.endsWith(`(${p.toLowerCase()})`)) return titulo;
  return `${titulo} (${p})`;
}

function montar(i: MensagemV4Input, canal: GroupChannel, sem: ReadonlySet<Opcional>): string | null {
  const f: Fmt = canal === 'tg' ? TG : WA;
  const italic = (s: string) => (canal === 'tg' ? `<i>${escapeTelegramHtml(s)}</i>` : `_${escapeWhatsapp(s)}_`);
  const o = i.offer;
  const amz = isAmazonOffer(o);
  const price = o.priceCents;
  const titulo = i.titulo.replace(/\s+/g, ' ').trim();
  if (!titulo || !(price > 0)) return null;

  // 1) Estado (e veredito, no Diagnóstico)
  const cab = [f.b(ROTULO_ESTADO[i.estado])];
  if (i.estado === 'diagnostico' && i.veredito) cab.push(cabecalhoDeDegrau(i.veredito.degrau, i.veredito.rotulo, canal));
  const blocoCab = cab.join('\n');

  // 2) Título e segmentação
  const tipo = i.tipoLabel && i.tipoLabel !== ROTULO_OUTROS ? i.tipoLabel : null;
  const segA = [`Categoria: ${departmentLabel(i.vertical)}`, tipo ? `Tipo: ${tipo}` : null].filter(Boolean).join(' · ');
  const segB = [i.marca ? `Marca: ${i.marca}` : null, i.plataforma ? `Plataforma: ${i.plataforma}` : null, rotuloFormato(i.formato) ? `Formato: ${rotuloFormato(i.formato)}` : null, 'Condição: Novo']
    .filter(Boolean)
    .join(' · ');
  // R-122 (dono, 2026-11-24): em games o início é só "Nome do jogo (Console)"; sem linhas de categoria/tipo/formato/condição.
  const blocoTitulo = i.vertical === 'games' ? f.b(tituloGames(titulo, i.plataforma)) : [f.b(titulo), f.t(segA), f.t(segB)].join('\n');

  // 3) Preço, loja e métricas de compra (R-107)
  const storeLabel = o.storeName ? o.storeName.replace(/https?:\/\/\S+/gi, ' ').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  const showStore = storeLabel.length >= 2 && storeLabel.toLowerCase().replace(/\.com(\.br)?$/, '') !== o.networkName.trim().toLowerCase();
  const blocoPreco = [`${f.b(fmtBRL(price))} ${f.t(inNetwork(o.networkName))}${showStore ? `\nVendido por ${f.b(storeLabel)}` : ''}`, ...compraLines(o, f)].join('\n');

  // 4) Indicadores
  const bullets: string[] = [];
  if (i.estado === 'novo') {
    bullets.push(topic(f, 'Situação', 'começamos a acompanhar o preço deste produto agora'));
    // Só com registro anterior de verdade (nunca inventa): sem histórico a linha não existe.
    if (i.menor) bullets.push(linhaMenorPreco(f, i.menor));
  } else {
    const cmp = textoComparacaoMedia(price, i.avg, amz);
    if (cmp) bullets.push(topic(f, 'Vs. média', cmp));
    else if (i.diagnostico) bullets.push(topic(f, 'Vs. histórico do produto', i.diagnostico));
    // Sem média (e sem histórico próprio): a linha é OMITIDA por completo, não bloqueia o envio (dono, 2026-11-22). Quando a média existir, a linha entra sozinha.
    // R-117: com o dado do menor preço já registrado (e a data), a linha dele substitui a antiga "Menor preço registrado" (uma só, sem repetir).
    const lm = i.menor ? linhaMenorPreco(f, i.menor) : null;
    for (const b of movimentoBullets(f, i, amz)) if (!lm || !b.includes('Menor preço registrado')) bullets.push(b);
    if (lm) bullets.push(lm);
    if (!sem.has('faixa')) {
      if (i.faixa) bullets.push(topic(f, 'Faixa registrada', faixaTexto(i.faixa)));
      else if (i.ind && i.ind.days >= 3) bullets.push(topic(f, 'Histórico', `mais barato que em ${i.ind.cheaperThanDays} de ${i.ind.days} dias; mínimo ${fmtBRL(i.ind.minCents)}, máximo ${fmtBRL(i.ind.maxCents)}`));
    }
    if (i.estado === 'diagnostico' && !i.veredito) {
      const leit = readingOf(price, i.avg && !(amz && i.avg.scope === 'own') ? i.avg.cents : null, i.move?.refCents ?? i.refCents ?? null);
      if (leit) bullets.push(topic(f, 'Leitura', leit));
    }
    if (i.estado === 'monitoramento' && i.avg) bullets.push(topic(f, 'Situação', 'histórico ainda curto; seguimos monitorando o preço'));
  }
  if (!sem.has('vendedor')) {
    const v = sellerLine(o);
    if (v) bullets.push(topic(f, 'Vendedor', v));
  }
  if (!sem.has('selos')) for (const t of seloLines(o, f)) bullets.push(t);
  // R-122: a linha "Black Friday" saiu das mensagens (dono, 2026-11-24).

  // 5) Link de compra: URL em texto puro, linha própria
  const link = linkDeCompraDoTexto(o, canal, i.messageKey);
  if (!link) return null;
  const blocoLink = `${f.b('Comprar')}\n${canal === 'tg' ? escapeTelegramHtml(link) : link}`;

  // 6) Divulgação do site (URL em texto puro) e rodapé
  const blocoPromo = !sem.has('promo') && !amz ? (canal === 'tg' ? promoLinePlain(canal, i.messageKey) : promoLine(canal, i.messageKey)) : null;
  const rodape = [italic(withTag(stampLine(o), i.adTag)), sem.has('slogan') ? null : italic(`Espaço Geek 86 · ${getSlogan()}`)].filter(Boolean).join('\n');

  return [blocoCab, blocoTitulo, blocoPreco, bullets.join('\n'), blocoLink, blocoPromo, rodape].filter((b): b is string => !!b && b.trim() !== '').join('\n\n');
}

/** "Histórico completo: https://www.egeek86.com/?s=tg&m=<id>" em texto puro (o link com rótulo "egeek86.com" perde a URL ao copiar). */
function promoLinePlain(canal: GroupChannel, messageKey: string): string {
  return `Histórico completo: ${escapeTelegramHtml(`${GROUP_LINK_BASE}/?s=${canal}&m=${messageKey}`)}`;
}

/**
 * Texto final da mensagem v4 do canal. null = não foi possível montar com segurança (sem preço, sem título ou sem link de compra): o chamador
 * mantém o formato anterior. Se passar do orçamento de legenda, as linhas acessórias saem na ordem ORDEM_CORTE (nunca o link, o preço nem o #publicidade).
 */
export function comporMensagemV4(i: MensagemV4Input, canal: GroupChannel, orcamento: number = V4_ORCAMENTO_LEGENDA): string | null {
  const sem = new Set<Opcional>();
  let txt = montar(i, canal, sem);
  if (txt == null) return null;
  const tam = (s: string) => (canal === 'tg' ? captionVisibleLength(s) : s.length);
  for (const k of ORDEM_CORTE) {
    if (tam(txt) <= orcamento) break;
    sem.add(k);
    const t2 = montar(i, canal, sem);
    if (t2 == null) break;
    txt = t2;
  }
  return txt;
}
