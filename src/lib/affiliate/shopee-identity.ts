// Sem 'server-only': funções puras (sem banco, sem rede), importáveis por script tsx e testes.
import { judgeGeneric, norm, prepareGeneric, buildQueryFor, type AmzCand, type GenericCtx, type MasterIdentity } from './amazon-identity';
import { rejectionOf } from '../catalog/vertical/identity';
import { evaluateCatalogGate } from '../catalog/gate';

/**
 * IDENTIDADE FORTE PARA AMPLIAR A AMOSTRA NA SHOPEE (decisão do dono, 2026-11-11; zero dado fake, dúvida fica FORA).
 *
 * Dado um MASTER já cadastrado e aprovado (departamentos que não são Games) e um item lido na busca por palavra-chave da
 * Shopee Affiliate Open API (itemId, productName, priceMin/priceMax, sales, ratingStar, offerLink), decide se é a MESMA
 * mídia/produto. Reusa o juiz de identidade da coleta da Amazon (amazon-identity.ts: marca, código de modelo, polegadas,
 * capacidades, voltagem, gênero, numerais, edição, região, ISBN) e o léxico de rejeição do catálogo vertical (usado,
 * recondicionado, Open Box, importado, fora de linha, não original). Sobre isso exige "forte":
 *
 *   accept  identidade FORTE: código de modelo igual (modelo_igual), ISBN-13 igual, campos iguais (filamento/resina), família
 *           igual (impressora 3D) ou título+autor+editora (livro). É o único resultado que cria oferta.
 *   doubt   o juiz aceitou por cobertura de título SEM código de modelo (marca_modelo_cobertura) ou ficou em dúvida (draft):
 *           NÃO cria; vai para o log. Há a opção explícita `aceitarCobertura` (desligada por padrão) para o dono decidir depois.
 *   reject  outro produto, condição não nova, pacote, acessório, fora de linha, não original, preço ambíguo etc.
 *
 * Nada aqui inventa atributo: o que o título não diz fica ausente e "ausente num lado só" é dúvida (regra D4 da Amazon).
 */

export type ShopeeOutcome = 'accept' | 'doubt' | 'reject';

export interface ShopeeCand {
  itemId: string;
  title: string;
  priceCents: number;
}

export interface ShopeeVerdict {
  outcome: ShopeeOutcome;
  /** Motivo curto e estável (log/auditoria), no formato `contador:razão`. */
  motivo: string;
  score: number;
  /** true quando o resultado é accept por identidade forte (nunca por cobertura). */
  forte: boolean;
}

/** Razões do juiz genérico que contam como identidade FORTE. */
export const RAZOES_FORTES = new Set(['modelo_igual', 'isbn_igual', 'campos_iguais', 'familia_igual', 'titulo_autor_editora']);
/** Aceito pelo juiz, mas sem código de modelo: fuzzy por cobertura de título. Fica FORA por padrão. */
export const RAZAO_COBERTURA = 'marca_modelo_cobertura';

const PLACEHOLDER_ID = 'SHOPEEITEM'; // o juiz da Amazon exige 10 caracteres [A-Z0-9]; letras puras nunca viram ISBN-10

const ACESSORIO_RE = /\b(capa (?:para|protetora|de (?:celular|silicone|tv|notebook))|capinha|case para|pelicula|protetor de tela|suporte (?:de parede|articulado|fixo|para|de mesa|de tv)|cabo (?:de|para|hdmi|usb|extensor)|carregador|refil|refis|filtro (?:para|de reposicao)|peca de reposicao|pecas de reposicao|reposicao|controle remoto|adaptador|extensor|mangueira|bateria|fonte de alimentacao|tampa|resistencia|correia|vedacao|junta|borracha de vedacao|etiqueta|sticker|adesivo|bico|hotend|mesa de impressao|lamina|cabecote)\b/;
const DIGITAL_RE = /\b(pdf|ebook|e book|kindle|apostila digital|download|arquivo digital|stl|modelo 3d para imprimir)\b/;

/** Termo do candidato que o MASTER não tem (a presença no master legitima o termo). */
function soNoCandidato(re: RegExp, mNorm: string, cNorm: string): string | null {
  const c = re.exec(cNorm);
  if (!c) return null;
  return re.test(mNorm) ? null : c[0];
}

export function formatBrlForJudge(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export interface JulgarOpts {
  /** Aceita marca_modelo_cobertura como accept (padrão false: dúvida fica fora). */
  aceitarCobertura?: boolean;
}

/**
 * Julga UM item da Shopee contra UM master (contexto já preparado com prepareGeneric). Pura.
 */
export function judgeShopee(ctx: GenericCtx, cand: ShopeeCand, opts: JulgarOpts = {}): ShopeeVerdict {
  const title = String(cand.title ?? '').slice(0, 300);
  const cNorm = norm(title);
  const mNorm = ctx.mNorm;
  const rej = (motivo: string, score = 0): ShopeeVerdict => ({ outcome: 'reject', motivo, score, forte: false });

  if (!cNorm) return rej('invalido:sem_titulo');
  if (!Number.isFinite(cand.priceCents) || cand.priceCents <= 0) return rej('invalido:sem_preco');

  // 1. Léxico de rejeição do catálogo vertical (usado, recondicionado, Open Box, importado, fora de linha, não original...).
  //    O que o próprio master diz legitima o termo (ex.: master "Livro ... Edição Importada" não existe aqui, mas vale a regra).
  const lex = rejectionOf({ id: cand.itemId, name: title });
  if (lex) {
    const doMaster = rejectionOf({ id: 'm', name: ctx.m.name });
    if (!doMaster || doMaster.reason !== lex.reason) {
      return rej(`${lex.reason === 'fora_de_linha' ? 'fora_de_linha_ou_retro' : 'rejeitado_condicao'}:${lex.reason}:${lex.matched}`);
    }
  }
  // 2. Não original (réplica, paralelo, pirata, clone) pelo porteiro do catálogo: determinístico, vale para qualquer vertical.
  try {
    const g = evaluateCatalogGate({ name: title, productType: 'accessory' });
    if (g.verdict === 'rejected' && g.category === 'not_original') return rej(`rejeitado_condicao:nao_original:${g.reason}`);
  } catch {
    // porteiro indisponível para este título: segue só com o juiz e o léxico
  }
  // 3. Acessório/peça/digital que o master não é (o juiz da Amazon cobre só "compatível com/para").
  const acc = soNoCandidato(ACESSORIO_RE, mNorm, cNorm);
  if (acc) return rej(`rejeitado_composicao:acessorio:${acc}`);
  const dig = soNoCandidato(DIGITAL_RE, mNorm, cNorm);
  if (dig) return rej(`rejeitado_composicao:digital:${dig}`);

  // 4. Juiz de identidade compartilhado com a Amazon.
  const amz: AmzCand = { a: PLACEHOLDER_ID, t: title, p: formatBrlForJudge(cand.priceCents), l: null, s: 0 };
  const v = judgeGeneric(ctx, amz);
  if (v.outcome === 'reject') return rej(`${v.counter}:${v.reason}`, v.score);
  if (v.outcome === 'draft') return { outcome: 'doubt', motivo: `duvida:${v.reason}`, score: v.score, forte: false };
  // accept
  if (RAZOES_FORTES.has(v.reason)) return { outcome: 'accept', motivo: `forte:${v.reason}`, score: v.score, forte: true };
  if (v.reason === RAZAO_COBERTURA) {
    if (opts.aceitarCobertura) return { outcome: 'accept', motivo: `cobertura:${v.reason}`, score: v.score, forte: false };
    return { outcome: 'doubt', motivo: `duvida:${v.reason}`, score: v.score, forte: false };
  }
  // razão desconhecida (código novo no juiz): na dúvida, fora
  return { outcome: 'doubt', motivo: `duvida:razao_nao_prevista:${v.reason}`, score: v.score, forte: false };
}

export interface ShopeeNodeFiltros {
  /** Piso de vendas. 0 (padrão da cobertura, dono 2026-11-12) = não filtra: vendas viraram SINAL de relevância (ver sinalVendas), não descarte. */
  minVendas: number;
  minNota: number;
}

/**
 * Filtros de qualidade do ANÚNCIO (não de identidade nem de preço): link oficial, foto, vendas (só se minVendas > 0) e nota. Devolve o motivo do
 * descarte ou null. Dono (2026-11-12): "poucas_vendas" NÃO é mais filtro de entrada na cobertura; use `sinalVendas` para registrar a relevância.
 */
export function filtroAnuncio(
  n: { sales: number | null; imageUrl: string | null; offerLink: string | null; ratingStar?: unknown },
  f: ShopeeNodeFiltros
): string | null {
  if (!n.offerLink || !LINK_OFICIAL.test(n.offerLink)) return 'sem_offerlink_oficial';
  if (!n.imageUrl) return 'sem_foto';
  if (f.minVendas > 0 && (n.sales ?? 0) < f.minVendas) return 'poucas_vendas';
  const nota = Number(n.ratingStar);
  if (Number.isFinite(nota) && nota > 0 && nota < f.minNota) return 'nota_baixa';
  return null;
}

/** Piso histórico de vendas, agora só como SINAL de relevância (o item entra no banco mesmo abaixo dele). */
export const VENDAS_RELEVANCIA_MIN = 3;
export const sinalVendas = (sales: number | null): 'relevante' | 'poucas_vendas' => ((sales ?? 0) >= VENDAS_RELEVANCIA_MIN ? 'relevante' : 'poucas_vendas');

/**
 * Condição/composição do título (usado, recondicionado, Open Box, importado, fora de linha, retrô, réplica, acessório, peça, digital): é
 * IDENTIDADE, não preço, e continua barrando a entrada. Sem master de comparação (a criação de master novo não tem um). Devolve o motivo curto
 * `classe:razão` ou null. Mesmas regras de judgeShopee (passos 1 a 3), centralizadas aqui para a criação de produto.
 */
export function rejeicaoDeTitulo(titulo: string): string | null {
  const title = String(titulo ?? '').slice(0, 300);
  const cNorm = norm(title);
  if (!cNorm) return 'invalido:sem_titulo';
  const lex = rejectionOf({ id: 'x', name: title });
  if (lex) return `${lex.reason === 'fora_de_linha' ? 'fora_de_linha_ou_retro' : 'rejeitado_condicao'}:${lex.reason}:${lex.matched}`;
  try {
    const g = evaluateCatalogGate({ name: title, productType: 'accessory' });
    if (g.verdict === 'rejected' && g.category === 'not_original') return `rejeitado_condicao:nao_original:${g.reason}`;
  } catch {
    // porteiro indisponível para este título: segue só com o léxico
  }
  const acc = ACESSORIO_RE.exec(cNorm);
  if (acc) return `rejeitado_composicao:acessorio:${acc[0]}`;
  const dig = DIGITAL_RE.exec(cNorm);
  if (dig) return `rejeitado_composicao:digital:${dig[0]}`;
  return null;
}

export const LINK_OFICIAL = /^https:\/\/([a-z0-9-]+\.)*(shopee\.com\.br|shp\.ee)\//i;

/**
 * Consultas de busca para o master, da mais específica para a reserva. Livros: ISBN, depois título+autor. Demais: marca+modelo+nome
 * (buildQueryFor, o mesmo da Amazon). A reserva só é usada quando a primeira não devolveu nenhum item aceitável.
 */
export function buildShopeeQueries(m: MasterIdentity): string[] {
  // Atributos de catálogo do ML às vezes trazem "modelo" sujo (nome inteiro colado: "Tornozeleira5KgKit"). Para a busca da Shopee a
  // consulta principal usa só códigos que aparecem como palavra no NOME do master; a do atributo vem como reserva.
  const limpo: MasterIdentity = { ...m, mpn: null, cat: m.cat ? { ...m.cat, MODEL: undefined, ALPHANUMERIC_MODEL: undefined, MPN: undefined } : m.cat };
  const principal = m.vertical === 'livros' ? buildQueryFor(m) : buildQueryFor(limpo);
  const out = [principal];
  if (m.vertical !== 'livros') {
    const comAtributos = buildQueryFor(m);
    if (comAtributos !== principal) out.push(comAtributos);
  }
  if (m.vertical === 'livros') {
    const titulo = typeof m.cat?.BOOK_TITLE === 'string' && m.cat.BOOK_TITLE.trim() ? m.cat.BOOK_TITLE.trim() : m.name;
    const autor = typeof m.cat?.AUTHOR === 'string' ? m.cat.AUTHOR.split(',')[0].trim() : '';
    const alt = `${titulo} ${autor && !norm(titulo).includes(norm(autor)) ? autor : ''}`.replace(/\s+/g, ' ').trim().split(' ').slice(0, 11).join(' ');
    if (alt && alt !== principal) out.push(alt);
  }
  return out.filter((q) => q.length >= 3);
}

export { prepareGeneric };
