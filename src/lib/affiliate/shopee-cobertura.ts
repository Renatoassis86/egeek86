// Sem 'server-only': funções puras (sem banco, sem rede), testadas em scripts/test-shopee-cobertura.ts.
import { norm, prepareGeneric, type GenericCtx, type MasterIdentity } from './amazon-identity';
import { judgeShopee, type ShopeeVerdict } from './shopee-identity';
import { VERTICAIS_ALVO } from './ampliar-amostra-params';

/**
 * COBERTURA SHOPEE (dono, 2026-11-12: "a Shopee traga TODOS os produtos que trabalhamos"). Descoberta pela API OFICIAL de afiliados
 * (productOfferV2) por LISTAGEM DE CATEGORIA (productCatId + sortType por vendas) e por loja (shopId), em vez de só busca por palavra.
 *
 * Fatos da documentação (docs/termos-shopee-2026-11-10/08-api-list-product-offer.md), sem inventar:
 *  - productCatId (Int32) filtra categoria nível 1/2/3; os ids do Brasil estão no guia de vendedores (seller.shopee.com.br/edu/category-guide);
 *    NÃO existe query de listagem de categorias na Open API. Por isso nenhum id vem de memória: a lista abaixo nasce VAZIA e só é
 *    preenchida com ids MEDIDOS (rota `?probe=cat` lê `productCatIds` dos itens que a própria API devolve) e conferidos pelo dono.
 *  - listType/matchId só funcionam juntos e sem os demais filtros: não usados. isAMSOffer/isKeySeller existem, mas filtram por comissão/loja
 *    chave, não por identidade; não usados.
 *  - Não há GTIN/EAN/ISBN no retorno. O casamento por código só acontece se o vendedor escreveu o código no título (ISBN-13, modelo).
 */

export type LojaCobertura = 'games' | (typeof VERTICAIS_ALVO)[number];
export const LOJAS_COBERTURA: readonly LojaCobertura[] = ['games', ...VERTICAIS_ALVO];

export interface CategoriaCfg {
  /** productCatId (Int32 como texto, só dígitos). */
  catId: string;
  loja: LojaCobertura;
  nota?: string;
}
export interface LojaShopeeCfg {
  /** shopId (só dígitos): loja oficial/chave a varrer por vendas. */
  shopId: string;
  loja: LojaCobertura;
  nota?: string;
}
export interface CoberturaCfg {
  categorias: CategoriaCfg[];
  lojas: LojaShopeeCfg[];
}

/** Ids MEDIDOS e conferidos. Vazio de propósito (ver cabeçalho). Também aceita override por env SHOPEE_COBERTURA_CONFIG (JSON). */
export const CATEGORIAS_MEDIDAS_COBERTURA: CoberturaCfg = { categorias: [], lojas: [] };

const INT32_MAX = 2147483647;
export const catIdValido = (v: unknown): v is string => typeof v === 'string' && /^\d{1,10}$/.test(v) && Number(v) > 0 && Number(v) <= INT32_MAX;
export const shopIdValido = (v: unknown): v is string => typeof v === 'string' && /^\d{1,19}$/.test(v);

/** Lê a configuração (constante + override por env). Entradas inválidas são descartadas e listadas em `invalidas`. */
export function lerConfigCobertura(envJson: string | undefined, base: CoberturaCfg = CATEGORIAS_MEDIDAS_COBERTURA): { cfg: CoberturaCfg; invalidas: string[] } {
  const invalidas: string[] = [];
  let bruto: unknown = base;
  if (envJson && envJson.trim()) {
    try {
      bruto = JSON.parse(envJson);
    } catch {
      invalidas.push('env_json_invalido');
      bruto = base;
    }
  }
  const o = (bruto ?? {}) as { categorias?: unknown; lojas?: unknown };
  const categorias: CategoriaCfg[] = [];
  const lojas: LojaShopeeCfg[] = [];
  for (const c of Array.isArray(o.categorias) ? o.categorias : []) {
    const x = c as Partial<CategoriaCfg>;
    if (catIdValido(String(x?.catId)) && LOJAS_COBERTURA.includes(x?.loja as LojaCobertura)) categorias.push({ catId: String(x.catId), loja: x.loja as LojaCobertura, nota: x.nota });
    else invalidas.push(`categoria:${String(x?.catId)}`);
  }
  for (const c of Array.isArray(o.lojas) ? o.lojas : []) {
    const x = c as Partial<LojaShopeeCfg>;
    if (shopIdValido(String(x?.shopId)) && LOJAS_COBERTURA.includes(x?.loja as LojaCobertura)) lojas.push({ shopId: String(x.shopId), loja: x.loja as LojaCobertura, nota: x.nota });
    else invalidas.push(`loja:${String(x?.shopId)}`);
  }
  return { cfg: { categorias, lojas }, invalidas };
}

// ---------------------------------------------------------------------------
// Fontes de listagem + cursor
// ---------------------------------------------------------------------------

export interface FonteListagem {
  /** Chave estável do cursor: `cat:<id>` ou `shop:<id>`. */
  chave: string;
  tipo: 'categoria' | 'loja';
  id: string;
  loja: LojaCobertura;
}
export const fontesDe = (cfg: CoberturaCfg, so?: LojaCobertura[]): FonteListagem[] =>
  [
    ...cfg.categorias.map((c): FonteListagem => ({ chave: `cat:${c.catId}`, tipo: 'categoria', id: c.catId, loja: c.loja })),
    ...cfg.lojas.map((c): FonteListagem => ({ chave: `shop:${c.shopId}`, tipo: 'loja', id: c.shopId, loja: c.loja })),
  ].filter((f) => !so || so.length === 0 || so.includes(f.loja));

export interface CursorFonte {
  page: number;
  /** Quantas voltas completas na fonte (a lista de vendas é recomeçada do topo quando acaba). */
  voltas: number;
  atualizadoEm?: string;
  /** Erros 10000 (System Error) nesta fonte; a fonte vai para o fim da fila e a execucao segue com as outras. */
  falhas?: number;
}
export type CursorMapa = Record<string, CursorFonte>;

/** Páginas por fonte por volta (a API não documenta profundidade; 40 páginas x 50 = 2.000 itens mais vendidos). */
export const PAGINAS_MAX_POR_FONTE = 40;

/** Próximo cursor depois de ler uma página. Acabou a lista (ou o teto de páginas) = recomeça na página 1 e conta a volta. */
export function avancarCursor(c: CursorFonte | undefined, r: { temProxima: boolean; vazia: boolean }, agora = new Date()): CursorFonte {
  const atual = c ?? { page: 1, voltas: 0 };
  if (!r.temProxima || r.vazia || atual.page >= PAGINAS_MAX_POR_FONTE) return { page: 1, voltas: atual.voltas + 1, atualizadoEm: agora.toISOString() };
  return { page: atual.page + 1, voltas: atual.voltas, atualizadoEm: agora.toISOString() };
}

/** Fonte da vez: a de menor (voltas, página mais antiga). Espalha o trabalho entre as fontes em vez de esgotar uma por vez. */
export function proximaFonte(fontes: FonteListagem[], cursor: CursorMapa): FonteListagem | null {
  if (fontes.length === 0) return null;
  return [...fontes].sort((a, b) => {
    const ca = cursor[a.chave] ?? { page: 1, voltas: 0 };
    const cb = cursor[b.chave] ?? { page: 1, voltas: 0 };
    return ca.voltas - cb.voltas || (ca.atualizadoEm ?? '').localeCompare(cb.atualizadoEm ?? '') || a.chave.localeCompare(b.chave);
  })[0];
}

// ---------------------------------------------------------------------------
// Parâmetros da rota
// ---------------------------------------------------------------------------

export const COBERTURA_LIMITES = {
  paginasPadrao: 4,
  paginasMax: 10,
  chamadasPadrao: 120,
  chamadasMax: 350,
  orcamentoMsPadrao: 200_000,
  orcamentoMsMax: 250_000,
  duvidasPadrao: 40,
  duvidasMax: 150,
  /** Masters NOVOS (criados a partir de itens Shopee sem equivalente) por execução. Freio de volume: a criação é sempre limitada. */
  mastersNovosPadrao: 30,
  mastersNovosMax: 120,
  tetoHorarioPadrao: 800,
} as const;

export interface ParametrosCobertura {
  apply: boolean;
  probe: boolean;
  lojas: LojaCobertura[];
  paginas: number;
  maxCalls: number;
  maxDuvidas: number;
  maxMastersNovos: number;
  /** Fonte única (teste dirigido): `cat:<id>` ou `shop:<id>`. */
  fonte: string | null;
}

function inteiro(raw: string | null, padrao: number, min: number, max: number): number | null {
  if (raw == null || raw.trim() === '') return padrao;
  if (!/^\d+$/.test(raw.trim())) return null;
  return Math.min(max, Math.max(min, Number(raw.trim())));
}

export function parseParametrosCobertura(get: (k: string) => string | null): { ok: true; params: ParametrosCobertura } | { ok: false; erro: string } {
  const lojas: LojaCobertura[] = [];
  for (const v of (get('loja') ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    if (!LOJAS_COBERTURA.includes(v as LojaCobertura)) return { ok: false, erro: `loja_invalida:${v}` };
    if (!lojas.includes(v as LojaCobertura)) lojas.push(v as LojaCobertura);
  }
  const paginas = inteiro(get('pages'), COBERTURA_LIMITES.paginasPadrao, 1, COBERTURA_LIMITES.paginasMax);
  const maxCalls = inteiro(get('maxCalls'), COBERTURA_LIMITES.chamadasPadrao, 1, COBERTURA_LIMITES.chamadasMax);
  const maxDuvidas = inteiro(get('maxDuvidas'), COBERTURA_LIMITES.duvidasPadrao, 0, COBERTURA_LIMITES.duvidasMax);
  const maxMastersNovos = inteiro(get('maxMasters'), COBERTURA_LIMITES.mastersNovosPadrao, 0, COBERTURA_LIMITES.mastersNovosMax);
  if (paginas == null) return { ok: false, erro: 'pages_invalido' };
  if (maxCalls == null) return { ok: false, erro: 'maxCalls_invalido' };
  if (maxDuvidas == null) return { ok: false, erro: 'maxDuvidas_invalido' };
  if (maxMastersNovos == null) return { ok: false, erro: 'maxMasters_invalido' };
  const fonte = (get('fonte') ?? '').trim() || null;
  if (fonte && !/^(cat|shop):\d{1,19}$/.test(fonte)) return { ok: false, erro: 'fonte_invalida' };
  return { ok: true, params: { apply: get('apply') === '1' && get('dry') !== '1', probe: get('probe') === 'cat', lojas, paginas, maxCalls, maxDuvidas, maxMastersNovos, fonte } };
}

/** Interruptor da cobertura (desligado por padrão): só roda com SHOPEE_COBERTURA_ATIVA=1. Gravar exige também apply=1 na chamada. */
export const coberturaLigada = (env: string | undefined): boolean => env === '1';

// ---------------------------------------------------------------------------
// Parada por rate limit / API instável
// ---------------------------------------------------------------------------

export type MotivoParada = 'rate_limit' | 'auth' | 'access' | 'erros_seguidos' | 'teto_de_chamadas' | 'orcamento_de_tempo' | 'sem_fontes' | null;

/** Decide se uma falha de chamada encerra a execução. O PRIMEIRO 10030 para (a janela de 1 h precisa passar); erro de outro tipo: 5 seguidos. */
export function paradaPorErro(kind: string | null, errosSeguidos: number): MotivoParada {
  if (kind === 'rate_limit') return 'rate_limit';
  if (kind === 'auth') return 'auth';
  if (kind === 'access') return 'access';
  return errosSeguidos >= 5 ? 'erros_seguidos' : null;
}

// ---------------------------------------------------------------------------
// Casamento anúncio -> master (todas as lojas não-Games; Games usa o dedup do banco)
// ---------------------------------------------------------------------------

export interface MasterParaIndice {
  id: string;
  identity: MasterIdentity;
  /** Ofertas Shopee ativas já ligadas ao master. */
  nShopee: number;
}
interface Entrada {
  id: string;
  ctx: GenericCtx;
  nShopee: number;
  miolo: Set<string>;
}
export interface IndiceMasters {
  porLoja: Map<string, Entrada[]>;
  porCodigo: Map<string, Entrada[]>;
  porIsbn: Map<string, Entrada[]>;
  total: number;
}

const tokensUteis = (s: string) => norm(s).split(' ').filter((t) => t.length >= 3);

export function criarIndice(masters: MasterParaIndice[]): IndiceMasters {
  const idx: IndiceMasters = { porLoja: new Map(), porCodigo: new Map(), porIsbn: new Map(), total: 0 };
  for (const m of masters) {
    const ctx = prepareGeneric(m.identity);
    const e: Entrada = { id: m.id, ctx, nShopee: m.nShopee, miolo: new Set(tokensUteis(m.identity.name)) };
    const add = (mp: Map<string, Entrada[]>, k: string) => mp.set(k, [...(mp.get(k) ?? []), e]);
    add(idx.porLoja, m.identity.vertical);
    for (const c of ctx.codes) add(idx.porCodigo, c);
    if (ctx.isbn) add(idx.porIsbn, ctx.isbn);
    idx.total++;
  }
  return idx;
}

export type DestinoItem =
  | { destino: 'aceito'; masterId: string; verdict: ShopeeVerdict }
  | { destino: 'duvida'; masterId: string; verdict: ShopeeVerdict; motivo: string }
  | { destino: 'rejeitado'; motivo: string }
  | { destino: 'sem_candidato' };

export const MAX_CANDIDATOS_POR_ITEM = 6;

/**
 * Candidatos do item: (1) mesmo código de modelo no título (compacto); (2) mesmo ISBN-13; (3) mesma marca (livro: mesmo autor) com >= 60% do miolo do nome
 * do master no título (só pode gerar DÚVIDA, pois sem código o juiz nunca aprova forte).
 */
export function candidatosDoTitulo(idx: IndiceMasters, titulo: string, loja: string): Entrada[] {
  const compacto = norm(titulo).replace(/ /g, '');
  const tn = norm(titulo);
  const tTok = new Set(tn.split(' '));
  const achados = new Map<string, { e: Entrada; prio: number }>();
  const por = (e: Entrada, prio: number) => {
    const a = achados.get(e.id);
    if (!a || a.prio > prio) achados.set(e.id, { e, prio });
  };
  for (const [codigo, es] of idx.porCodigo) {
    if (compacto.includes(codigo)) for (const e of es) if (e.ctx.m.vertical === loja) por(e, 0);
  }
  const isbns = (titulo.replace(/[-\s]/g, '').match(/97[89]\d{10}/g) ?? []);
  for (const i of isbns) for (const e of idx.porIsbn.get(i) ?? []) if (e.ctx.m.vertical === loja) por(e, 0);
  for (const e of idx.porLoja.get(loja) ?? []) {
    if (achados.has(e.id)) continue;
    // Livro não tem marca: o autor (todos os tokens) faz esse papel.
    const marca = e.ctx.brand ? norm(e.ctx.brand) : '';
    const porMarca = marca !== '' && ` ${tn} `.includes(` ${marca} `);
    const porAutor = loja === 'livros' && e.ctx.author.length > 0 && e.ctx.author.every((t) => tTok.has(t));
    if (!porMarca && !porAutor) continue;
    let comum = 0;
    for (const t of e.miolo) if (tTok.has(t)) comum++;
    if (e.miolo.size > 0 && comum / e.miolo.size >= 0.6) por(e, 1);
  }
  return [...achados.values()].sort((a, b) => a.prio - b.prio || b.e.nShopee - a.e.nShopee).slice(0, MAX_CANDIDATOS_POR_ITEM).map((a) => a.e);
}

/** Julga um anúncio contra os candidatos. Dois masters aceitos para o mesmo anúncio = ambíguo = DÚVIDA (nunca escolhe sozinho). */
export function casarItem(idx: IndiceMasters, item: { itemId: string; title: string; priceCents: number }, loja: string): DestinoItem {
  const cands = candidatosDoTitulo(idx, item.title, loja);
  if (cands.length === 0) return { destino: 'sem_candidato' };
  const aceitos: Array<{ e: Entrada; v: ShopeeVerdict }> = [];
  const duvidas: Array<{ e: Entrada; v: ShopeeVerdict }> = [];
  let ultimoRejeito = 'sem_match';
  for (const e of cands) {
    const v = judgeShopee(e.ctx, { itemId: item.itemId, title: item.title, priceCents: item.priceCents }, { aceitarCobertura: false });
    if (v.outcome === 'accept') aceitos.push({ e, v });
    else if (v.outcome === 'doubt') duvidas.push({ e, v });
    else ultimoRejeito = v.motivo;
  }
  if (aceitos.length === 1) return { destino: 'aceito', masterId: aceitos[0].e.id, verdict: aceitos[0].v };
  if (aceitos.length > 1) {
    const melhor = [...aceitos].sort((a, b) => b.v.score - a.v.score)[0];
    return { destino: 'duvida', masterId: melhor.e.id, verdict: melhor.v, motivo: `ambiguo_entre_${aceitos.length}_masters` };
  }
  if (duvidas.length > 0) {
    const melhor = [...duvidas].sort((a, b) => b.v.score - a.v.score)[0];
    return { destino: 'duvida', masterId: melhor.e.id, verdict: melhor.v, motivo: melhor.v.motivo };
  }
  return { destino: 'rejeitado', motivo: ultimoRejeito.split(':').slice(0, 2).join(':') };
}

// ---------------------------------------------------------------------------
// Destino de um item depois do casamento (correção de diretriz do dono, 2026-11-12)
// ---------------------------------------------------------------------------

/**
 * Motivos de rejeição do juiz (`contador:razão`) que são CONDIÇÃO/COMPOSIÇÃO (usado, recondicionado, Open Box, importado, fora de linha, retrô,
 * réplica, acessório, pacote, digital, item inválido): identidade, não preço. Continuam barrando. Os demais (`sem_match:*`: outro modelo,
 * outra capacidade, outro gênero...) dizem "é OUTRO produto": não há master equivalente e o produto passa a ser CRIADO.
 */
export function rejeicaoEhCondicao(motivo: string): boolean {
  return /^(fora_de_linha_ou_retro|rejeitado_condicao|rejeitado_composicao|invalido)(:|$)/.test(motivo);
}

export type DestinoFinal =
  | { destino: 'anexar'; masterId: string }
  | { destino: 'duvida'; masterId: string; motivo: string }
  | { destino: 'novo_master' }
  | { destino: 'descartar'; motivo: string };

/** Traduz o veredito do casamento no destino. Sem candidato ou "outro produto" => novo master; dúvida => fila; condição => descarta. */
export function destinoDoCasamento(d: DestinoItem): DestinoFinal {
  if (d.destino === 'aceito') return { destino: 'anexar', masterId: d.masterId };
  if (d.destino === 'duvida') return { destino: 'duvida', masterId: d.masterId, motivo: d.motivo };
  if (d.destino === 'sem_candidato') return { destino: 'novo_master' };
  return rejeicaoEhCondicao(d.motivo) ? { destino: 'descartar', motivo: d.motivo } : { destino: 'novo_master' };
}

// ---------------------------------------------------------------------------
// Medição de categorias (probe): agrega productCatIds devolvidos pela própria API
// ---------------------------------------------------------------------------

export interface ResumoCategoria {
  caminho: string;
  nivelFinal: string;
  itens: number;
  exemplos: string[];
}

/** Agrega `productCatIds` ([n1,n2,n3], 0 = nível inexistente) dos nós; devolve do mais frequente ao menos. Não grava nada. */
export function resumirCategorias(nodes: Array<{ productCatIds?: unknown; productName?: unknown }>): ResumoCategoria[] {
  const mapa = new Map<string, ResumoCategoria>();
  for (const n of nodes) {
    const ids = Array.isArray(n.productCatIds) ? n.productCatIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0) : [];
    if (ids.length === 0) continue;
    const caminho = ids.join('>');
    const r = mapa.get(caminho) ?? { caminho, nivelFinal: String(ids[ids.length - 1]), itens: 0, exemplos: [] };
    r.itens++;
    if (r.exemplos.length < 2 && n.productName) r.exemplos.push(String(n.productName).slice(0, 80));
    mapa.set(caminho, r);
  }
  return [...mapa.values()].sort((a, b) => b.itens - a.itens);
}
