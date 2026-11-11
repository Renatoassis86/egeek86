// Sem 'server-only': funções puras (sem banco, sem rede), importáveis pela descoberta, por scripts tsx e por testes.
import { foldText, normalizeTitleKey, rejectionOf } from './identity';
import { accessoryIssue, comboIssue, nichoIssue } from './scope';
import { LINHAS, MARCAS, PISO_PRECO_CENTAVOS, TIMES, type GrupoLinha, type MarcaDef } from './esporte-shopee-lexico';

/**
 * IDENTIDADE DE ESPORTE A PARTIR DO TÍTULO DA SHOPEE (decisão do dono, 2026-11-11).
 * A Shopee não devolve atributo estruturado (marca, modelo, gênero): só o título. Então a identidade FORTE exige as três coisas
 * lidas do título contra um léxico fechado (esporte-shopee-lexico.ts): marca + modelo/linha + gênero. Faltou qualquer uma => não vira
 * master (motivo `sem_marca` / `sem_modelo` / `sem_genero`); nada é completado por suposição.
 *
 * Chave: bm:<segmento>|brand=<marca>|model=<modelo>|gender=<gênero>[|cap=<litros>]  (mesmo formato das chaves do ML; cor e tamanho NUNCA entram).
 * Só produto NOVO e EM LINHA: usado, recondicionado, Open Box, importado, réplica/falsificado, lote/kit e "modelo antigo" são descartados
 * com o mesmo léxico do catálogo do ML (rejectionOf) mais o léxico de réplica específico da Shopee.
 */
export const ESPORTE_SHOPEE_VERSION = 1;

export type Genero = 'masculino' | 'feminino' | 'unissex' | 'infantil';
const GENERO_LABEL: Record<Genero, string> = { masculino: 'Masculino', feminino: 'Feminino', unissex: 'Unissex', infantil: 'Infantil' };

/** Minúsculas, sem acento, hífen vira espaço, decimal "3.0" vira "3p0" e "990v5" vira "990 v5". */
export function prep(s: string): string {
  return foldText(s.replace(/(\d)[.,](\d)/g, '$1p$2').replace(/(\d{3,4})(v\d{1,2})\b/gi, '$1 $2'));
}

// ---------------------------------------------------------------------------------------------------------------------
// Gênero
// ---------------------------------------------------------------------------------------------------------------------
export function generoDe(texto: string): Genero | null {
  const f = prep(texto);
  const kids = /\b(infantil|infanto juvenil|kids?|junior|juvenil|menino|meninos|menina|meninas|crianca|criancas)\b/.test(f);
  const uni = /\b(unissex|unisex|sem genero)\b/.test(f);
  const m = /\b(masculin[oa]s?|homem|homens|men|mens|masc)\b/.test(f);
  const w = /\b(feminin[oa]s?|mulher|mulheres|women|womens|wmns|fem)\b/.test(f);
  if (kids) return 'infantil';
  if (uni || (m && w)) return 'unissex';
  if (m) return 'masculino';
  if (w) return 'feminino';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Marca
// ---------------------------------------------------------------------------------------------------------------------
const MARCA_POR_KEY = new Map(MARCAS.map((m) => [m.key, m]));

function contemFrase(f: string, frase: string): boolean {
  return (' ' + f + ' ').includes(' ' + frase + ' ');
}

/** Marcas citadas no texto já normalizado. "Nike + Jordan" conta como Jordan (Air Jordan é da Nike, mas o catálogo lista Jordan). */
export function marcasNoTexto(f: string): MarcaDef[] {
  const achadas = MARCAS.filter((m) => m.aliases.some((a) => contemFrase(f, a)));
  if (achadas.some((m) => m.key === 'jordan')) return achadas.filter((m) => m.key !== 'nike');
  return achadas;
}

/** Marca de um valor de atributo (ex.: BRAND do ML) ou null. */
export function marcaDeAtributo(valor: string | null | undefined): MarcaDef | null {
  if (!valor) return null;
  const f = prep(valor);
  const exata = MARCA_POR_KEY.get(f);
  if (exata) return exata;
  const achadas = marcasNoTexto(f);
  return achadas.length === 1 ? achadas[0] : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Segmentos de esporte (da descoberta Shopee)
// ---------------------------------------------------------------------------------------------------------------------
export interface SegDef {
  key: string;
  label: string;
  noun: RegExp;
  /** Termos que tiram o título do segmento (além de nichoIssue/accessoryIssue do scope.ts). */
  forbid?: RegExp;
  grupo: GrupoLinha;
  generoObrigatorio: boolean;
  /** Mochila e bolsa: volume em litros é obrigatório e entra na chave (tamanhos diferentes são produtos diferentes). */
  capacidade?: boolean;
}

const LINGERIE = 'calcinha|cueca|sutia|lingerie|pijama|modelador|modeladora|cinta modeladora|fantasia|babador|bebe|recem nascido';

export const SEGMENTOS_ESPORTE: SegDef[] = [
  { key: 'tenis', label: 'Tênis', noun: /\b(tenis|sapatenis)\b/, grupo: 'tenis', generoObrigatorio: true },
  { key: 'regata', label: 'Regata', noun: /\b(regata|regatas)\b/, forbid: new RegExp(`\\b(${LINGERIE})\\b`), grupo: 'roupa', generoObrigatorio: true },
  { key: 'short', label: 'Short', noun: /\b(short|shorts|bermuda|bermudas|calcao)\b/, forbid: new RegExp(`\\b(jeans|sarja|linho|praia|sunga|saia|vestido|ciclismo|ciclista|mtb|${LINGERIE})\\b`), grupo: 'roupa', generoObrigatorio: true },
  { key: 'legging', label: 'Legging', noun: /\b(legging|leggings|fuseau)\b/, forbid: new RegExp(`\\b(gestante|termica|flanelada|${LINGERIE})\\b`), grupo: 'roupa', generoObrigatorio: true },
  {
    key: 'agasalho', label: 'Agasalho', noun: /\b(agasalho|jaqueta|corta vento|casaco|moletom|blusao|anorak)\b/,
    forbid: new RegExp(`\\b(couro|jeans|sarja|ecologico|pelo|ciclismo|ciclista|${LINGERIE})\\b`), grupo: 'roupa', generoObrigatorio: true,
  },
  { key: 'camisa-de-time', label: 'Camisa', noun: /\b(camisa|camisas|camiseta|camisetas|jersey)\b/, forbid: new RegExp(`\\b(ciclismo|ciclista|mtb|${LINGERIE})\\b`), grupo: 'roupa', generoObrigatorio: true },
  { key: 'roupa-de-compressao', label: 'Roupa de compressão', noun: /\b(compressao|compression|heatgear|techfit|baselayer)\b/, grupo: 'roupa', generoObrigatorio: true },
  { key: 'meia-esportiva', label: 'Meia', noun: /\b(meia|meias|meiao|meioes|sock|socks)\b/, forbid: /\b(meia calca|calca|pantufa|bebe|sapatilha|varizes|gestante)\b/, grupo: 'meia', generoObrigatorio: false },
  { key: 'bone', label: 'Boné', noun: /\b(bone|bones|viseira)\b/, grupo: 'bone', generoObrigatorio: false },
  { key: 'mochila-esportiva', label: 'Mochila', noun: /\b(mochila|mochilas)\b/, grupo: 'bolsa', generoObrigatorio: false, capacidade: true },
  { key: 'bolsa-de-treino', label: 'Bolsa', noun: /\b(bolsa|bolsas|mala|duffel)\b/, grupo: 'bolsa', generoObrigatorio: false, capacidade: true },
];
const SEG_POR_KEY = new Map(SEGMENTOS_ESPORTE.map((s) => [s.key, s]));

/** Segmentos cujo gênero é exigido (usado pela aprovação em bloco: scripts/aprovar-masters-nicho.ts). */
export const SEGMENTOS_ESPORTE_COM_GENERO = SEGMENTOS_ESPORTE.filter((s) => s.generoObrigatorio).map((s) => s.key);

function detectarSegmento(f: string): SegDef | null {
  // Compressão vence quando há uma peça junto ("camisa de compressão", "manga de compressão", "meia de compressão esportiva").
  if (/\b(compressao|compression|heatgear|techfit|baselayer|base layer)\b/.test(f) && /\b(camisa|camiseta|manga|mangas|calca|bermuda|short|shorts|legging|meia|meias|regata|top|colete|segunda pele)\b/.test(f)) {
    return SEG_POR_KEY.get('roupa-de-compressao')!;
  }
  // Regata é mais específica que camiseta ("camiseta regata").
  if (/\bregatas?\b/.test(f)) return SEG_POR_KEY.get('regata')!;
  let melhor: { seg: SegDef; idx: number } | null = null;
  for (const seg of SEGMENTOS_ESPORTE) {
    if (seg.key === 'roupa-de-compressao') continue;
    const m = seg.noun.exec(f);
    if (m && (!melhor || m.index < melhor.idx)) melhor = { seg, idx: m.index };
  }
  return melhor?.seg ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Modelo/linha
// ---------------------------------------------------------------------------------------------------------------------
interface Padrao {
  toks: string[];
  canon: string;
  versionado: boolean;
}
const padroesCache = new Map<string, Padrao[]>();

function padroes(marcaKey: string, grupo: GrupoLinha): Padrao[] {
  const k = `${marcaKey}|${grupo}`;
  let p = padroesCache.get(k);
  if (p) return p;
  p = [];
  for (const def of LINHAS[marcaKey]?.[grupo] ?? []) {
    const [canonRaw, ...aliases] = def.split('|');
    const versionado = canonRaw.endsWith('+');
    const canon = canonRaw.replace(/\+$/, '');
    for (const a of [canon, ...aliases.map((x) => x.replace(/\+$/, ''))]) p.push({ toks: a.split(' '), canon, versionado });
  }
  p.sort((a, b) => b.toks.length - a.toks.length);
  padroesCache.set(k, p);
  return p;
}

const VERSAO = /^(v\d{1,2}|\d{1,4}(p\d)?|\d{1,2}r)$/;
const MODIFICADORES = new Set(['low', 'mid', 'high', 'hi', 'ox', 'plus', 'light', 'lite', 'se', 'sc', 'dn', 'excee', 'tn', 'lift', 'platform']);

/** Remove expressões de tamanho ("tamanho 42", "tam 38 ao 44", "do 34 ao 43") para o número não virar versão do modelo. */
function semTamanhos(f: string): string {
  return f
    .replace(/\b(tamanho|tam|numeracao|numero|num|n)\s*\d{2}(p\d)?(\s+(ao|a|ate|e|ou)\s+\d{2})?\b/g, ' ')
    .replace(/\b(do|de)\s+\d{2}\s+(ao|a|ate)\s+\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type ModeloRes = { modelo: string; linha: string | null } | { erro: 'sem_modelo' | 'multiplos_modelos' };

function modeloPorLinhas(f: string, marcaKey: string, grupo: GrupoLinha): ModeloRes {
  const pats = padroes(marcaKey, grupo);
  if (pats.length === 0) return { erro: 'sem_modelo' };
  const toks = semTamanhos(f).split(' ');
  const achados: Array<{ start: number; end: number; modelo: string; linha: string }> = [];
  for (let i = 0; i < toks.length; ) {
    const hit = pats.find((p) => p.toks.every((t, k) => toks[i + k] === t));
    if (!hit) {
      i++;
      continue;
    }
    let j = i + hit.toks.length;
    const partes = [hit.canon];
    if (hit.versionado && j < toks.length && VERSAO.test(toks[j])) partes.push(toks[j++]);
    for (let n = 0; n < 2 && j < toks.length && MODIFICADORES.has(toks[j]); n++) partes.push(toks[j++]);
    achados.push({ start: i, end: j, modelo: partes.join(' '), linha: hit.canon });
    i = j;
  }
  if (achados.length === 0) return { erro: 'sem_modelo' };
  // Linhas diferentes no mesmo título = anúncio de vários modelos (SEO): não vira master. Modelos compostos ("corre supra",
  // "charged assert 10") são linhas próprias no léxico, nunca montados por vizinhança.
  const distintos = new Set(achados.map((a) => a.modelo));
  if (distintos.size > 1) return { erro: 'multiplos_modelos' };
  return { modelo: achados[0].modelo, linha: achados[0].linha };
}

const KITS: Array<{ nome: string; re: RegExp }> = [
  { nome: 'titular', re: /\b(i|home|titular|principal)\b/ },
  { nome: 'reserva', re: /\b(ii|away|reserva|visitante)\b/ },
  { nome: 'terceira', re: /\b(iii|third|terceira|alternativa)\b/ },
  { nome: 'goleiro', re: /\b(goleiro|goalkeeper)\b/ },
  { nome: 'treino', re: /\b(treino|training|aquecimento|pre jogo|prematch|pre match)\b/ },
];

function temporadaDe(f: string): string | null {
  const longa = /\b(20\d{2})\s(?:20)?(\d{2})\b/.exec(f);
  if (longa && Number(longa[2]) === (Number(longa[1]) + 1) % 100) return `${longa[1]}-${20}${longa[2]}`;
  const par = /\b(\d{2})\s(\d{2})\b/.exec(f);
  if (par && Number(par[1]) >= 15 && Number(par[1]) <= 30 && Number(par[2]) === Number(par[1]) + 1) return `20${par[1]}-20${par[2]}`;
  const ano = /\b(20[12]\d)\b/.exec(f);
  return ano ? ano[1] : null;
}

type TimeRes = { modelo: string; linha: string } | { erro: 'multiplos_modelos' | 'sem_modelo' | 'sem_temporada' } | null;

/** Camisa de time: modelo = time + uniforme (titular/reserva/terceira/goleiro/treino) + temporada. null = não é camisa de time. */
function modeloDeTime(f: string): TimeRes {
  const times = TIMES.filter((t) => t.aliases.some((a) => contemFrase(f, a)));
  if (times.length === 0) return null;
  if (times.length > 1) return { erro: 'multiplos_modelos' };
  const kits = KITS.filter((k) => k.re.test(f));
  if (kits.length !== 1) return { erro: kits.length === 0 ? 'sem_modelo' : 'multiplos_modelos' };
  const temp = temporadaDe(f);
  if (!temp) return { erro: 'sem_temporada' };
  return { modelo: `${times[0].key} ${kits[0].nome} ${temp}`, linha: times[0].key };
}

// ---------------------------------------------------------------------------------------------------------------------
// Exclusões
// ---------------------------------------------------------------------------------------------------------------------
const MARCAS_RE = 'nike|adidas|puma|asics|olympikus|mizuno|fila|under armour|new balance|vans|converse|reebok|skechers|hoka|jordan|oakley|lacoste';
/** Réplica/falsificado típicos da Shopee (somam ao léxico nao_original do catálogo do ML). */
const REPLICA_RE = new RegExp(
  `\\b(1 1|1x1|inspirad[oa]s?|similar(?:es)?|copia|imitacao|reproducao|fake|clone|aaa|thai|tailandes[a]?|versao jogador|player version|jogador|qualidade (?:premium|superior|importada)|premium importad[oa]|top (?:de )?linha|igual (?:ao )?original|(?:estilo|tipo|modelo|linha) (?:${MARCAS_RE}))\\b`
);
/** Lote, kit, combo, pacote, conjunto e "N pares/peças". */
const LOTE_RE = /\b(kit|kits|combo|combos|lote|atacado|revenda|pacote|conjunto|conj)\b|\b(?:[2-9]|\d{2,})\s*(?:pares|par|pecas|pcs|unidades|unid|und|un)\b|\b(?:dois|duas|tres|quatro|cinco|seis)\s+(?:pares|pecas|unidades)\b|\b(?:leve|compre)\s+\d/;
const CALCADO_FORA = /\b(adilette|slide|slides)\b/;

export type CategoriaDescarte = 'nao_novo' | 'falsificado' | 'lote' | 'fora_do_recorte' | 'identidade_incompleta' | 'ambiguo';

export interface EsporteNegado {
  ok: false;
  motivo: string;
  categoria: CategoriaDescarte;
  detalhe: string | null;
}

export interface EsporteOk {
  ok: true;
  segmento: string;
  marca: MarcaDef;
  /** Modelo/linha normalizado (chave). */
  modelo: string;
  linha: string | null;
  genero: Genero | null;
  capacidade: string | null;
  chave: string;
  nomeMaster: string;
  /** Mesmo formato de master_products.attributes.vertical.catalogAttributes das sementes do ML. */
  catalogAttributes: Record<string, string>;
  /** Piso de preço (centavos) abaixo do qual o anúncio é tratado como isca. */
  pisoCentavos: number;
  /** true quando é camisa de time (modelo = time + uniforme + temporada). */
  time: boolean;
}

export type EsporteAvaliacao = EsporteOk | EsporteNegado;

const nao = (motivo: string, categoria: CategoriaDescarte, detalhe: string | null = null): EsporteNegado => ({ ok: false, motivo, categoria, detalhe });

const CAPS_ESPECIAIS: Record<string, string> = { rs: 'RS', gt: 'GT', tr: 'TR', sb: 'SB', nmd: 'NMD', zx: 'ZX', acd: 'ACD', ua: 'UA', se: 'SE', sc: 'SC', dn: 'DN', tn: 'TN', ox: 'OX', psg: 'PSG', cbf: 'CBF', fx: 'FX', kr3: 'KR3', gts: 'GTS', vl: 'VL', sl: 'SL', eq21: 'EQ21' };

function exibirModelo(modelo: string): string {
  return modelo
    .split(' ')
    .map((t) => {
      if (CAPS_ESPECIAIS[t]) return CAPS_ESPECIAIS[t];
      if (/^\d+p\d$/.test(t)) return t.replace('p', '.');
      if (/^v\d+$/.test(t)) return t;
      if (/^\d/.test(t)) return t.toUpperCase();
      return t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join(' ');
}

function substantivoDe(seg: SegDef, f: string): string {
  switch (seg.key) {
    case 'camisa-de-time':
      return /\bcamiseta/.test(f) ? 'Camiseta' : 'Camisa';
    case 'short':
      return /\bbermuda/.test(f) ? 'Bermuda' : 'Short';
    case 'agasalho':
      return /\bjaqueta/.test(f) ? 'Jaqueta' : /\bcorta vento/.test(f) ? 'Jaqueta Corta-Vento' : /\bmoletom/.test(f) ? 'Moletom' : /\bcasaco/.test(f) ? 'Casaco' : 'Agasalho';
    case 'bolsa-de-treino':
      return /\bmala\b/.test(f) ? 'Mala' : 'Bolsa';
    default:
      return seg.label;
  }
}

function capacidadeDe(f: string): string | null {
  const m = /\b(\d{1,3})(?:p\d)?\s?(?:l|lt|lts|litro|litros)\b/.exec(f);
  return m ? `${m[1]}l` : null;
}

/**
 * Avalia o título de um anúncio da Shopee. Devolve a identidade forte (marca+modelo+gênero) ou o motivo exato de não haver.
 * Ordem: não novo/falsificado => lote/combo => marca => recorte (tipo de peça) => escopo => gênero => modelo.
 */
export function avaliarTituloEsporte(titulo: string): EsporteAvaliacao {
  const nome = (titulo ?? '').trim();
  if (!nome) return nao('sem_nome', 'identidade_incompleta');
  const f = prep(nome);

  // 1. Não novo / fora de linha / não original (mesmo léxico do catálogo do ML) e réplica da Shopee.
  const rej = rejectionOf({ id: 'shopee', name: nome });
  if (rej) return nao(rej.reason, rej.reason === 'nao_original' ? 'falsificado' : 'nao_novo', rej.matched);
  const rep = REPLICA_RE.exec(f);
  if (rep) return nao('replica_ou_falsificado', 'falsificado', rep[0]);

  // 2. Lote, kit, combo, pacote ("kit genérico sem marca" cai aqui também) e "+" juntando produtos.
  const lote = LOTE_RE.exec(f);
  if (lote) return nao('lote_ou_kit', 'lote', lote[0]);
  if (/\s\+|\+\s/.test(nome)) return nao('combo_pacote', 'lote', '+');
  const bundle = comboIssue('tenis', nome);
  if (bundle) return nao('combo_pacote', 'lote', bundle.matched);

  // 3. Marca real obrigatória.
  const marcas = marcasNoTexto(f);
  if (marcas.length === 0) return nao('sem_marca', 'identidade_incompleta');
  if (marcas.length > 1) return nao('multiplas_marcas', 'ambiguo', marcas.map((m) => m.key).join(','));
  const marca = marcas[0];

  // 4. Tipo de peça dentro do recorte do dono.
  if (/\b(chuteira|chuteiras)\b/.test(f)) return nao('chuteira_fora_do_recorte', 'fora_do_recorte');
  const seg = detectarSegmento(f);
  if (!seg) return nao('fora_do_recorte', 'fora_do_recorte');

  // 5. Escopo: acessório/peça, recorte de nicho e termos proibidos do segmento.
  const forbid = seg.forbid?.exec(f);
  if (forbid) return nao('fora_do_nicho', 'fora_do_recorte', forbid[0]);
  if (seg.key === 'tenis') {
    const c = CALCADO_FORA.exec(f);
    if (c) return nao('fora_do_nicho', 'fora_do_recorte', c[0]);
  }
  const acc = accessoryIssue(seg.key, nome);
  if (acc) return nao(acc.reason, 'fora_do_recorte', acc.matched);
  const nicho = nichoIssue(seg.key, nome);
  if (nicho) return nao(nicho.reason, 'fora_do_recorte', nicho.matched);

  // 6. Gênero (obrigatório em tênis e roupa; nos acessórios só conta se explícito e diferente de unissex).
  const generoBruto = generoDe(nome);
  if (seg.generoObrigatorio && !generoBruto) return nao('sem_genero', 'identidade_incompleta');
  const genero: Genero | null = seg.generoObrigatorio ? generoBruto : generoBruto === 'unissex' ? null : generoBruto;

  // 7. Modelo/linha (léxico). Camisa com time: time + uniforme + temporada.
  let modelo: string;
  let linha: string | null;
  let time = false;
  const doTime = seg.key === 'camisa-de-time' ? modeloDeTime(f) : null;
  if (doTime) {
    if ('erro' in doTime) return nao(doTime.erro, doTime.erro === 'multiplos_modelos' ? 'ambiguo' : 'identidade_incompleta');
    modelo = doTime.modelo;
    linha = doTime.linha;
    time = true;
  } else {
    const r = modeloPorLinhas(f, marca.key, seg.grupo);
    if ('erro' in r) return nao(r.erro, r.erro === 'multiplos_modelos' ? 'ambiguo' : 'identidade_incompleta');
    modelo = r.modelo;
    linha = r.linha;
  }

  let capacidade: string | null = null;
  if (seg.capacidade) {
    capacidade = capacidadeDe(f);
    if (!capacidade) return nao('sem_capacidade', 'identidade_incompleta');
  }

  const chave = `bm:${seg.key}|brand=${marca.key}|model=${modelo}${genero ? `|gender=${genero}` : ''}${capacidade ? `|cap=${capacidade}` : ''}`;
  const modeloExib = time ? exibirTime(modelo) : exibirModelo(modelo);
  const nomeMaster = [substantivoDe(seg, f), marca.display, modeloExib, capacidade ? capacidade.replace('l', ' L') : '', genero ? GENERO_LABEL[genero] : '']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const catalogAttributes: Record<string, string> = { BRAND: marca.display, MODEL: modeloExib };
  if (linha && !time) catalogAttributes.LINE = exibirModelo(linha);
  if (time) catalogAttributes.LINE = TIMES.find((t) => t.key === linha)?.display ?? linha ?? '';
  if (genero) catalogAttributes.GENDER = GENERO_LABEL[genero];
  if (capacidade) catalogAttributes.CAPACITY = capacidade.replace('l', ' L');
  const piso = (time ? PISO_PRECO_CENTAVOS[`${seg.key}:time`] : undefined) ?? PISO_PRECO_CENTAVOS[seg.key] ?? 0;
  return { ok: true, segmento: seg.key, marca, modelo, linha, genero, capacidade, chave, nomeMaster, catalogAttributes, pisoCentavos: piso, time };
}

function exibirTime(modelo: string): string {
  const t = TIMES.find((x) => modelo.startsWith(x.key + ' '));
  if (!t) return exibirModelo(modelo);
  const resto = modelo.slice(t.key.length + 1).split(' ');
  const kit = resto[0];
  const temp = resto.slice(1).join(' ');
  const kitExib = kit === 'titular' ? 'I' : kit === 'reserva' ? 'II' : kit === 'terceira' ? 'III' : kit === 'goleiro' ? 'Goleiro' : 'Treino';
  return `${t.display} ${kitExib} ${temp}`.trim();
}

// ---------------------------------------------------------------------------------------------------------------------
// Dedup contra masters existentes (criados pelo ML ou por esta descoberta)
// ---------------------------------------------------------------------------------------------------------------------
export interface MasterExistente {
  id: string;
  name: string;
  /** attributes.vertical.segment */
  segmento?: string | null;
  /** attributes.vertical.identityKey */
  identityKey?: string | null;
  /** attributes.vertical.catalogAttributes */
  catalogAttributes?: Record<string, unknown> | null;
}

export type BuscaMaster =
  | { tipo: 'existente'; id: string; name: string; via: 'chave' | 'triplo' | 'titulo' }
  | { tipo: 'ambiguo'; id: string; name: string; modelo: string }
  | null;

const triplo = (seg: string, marca: string, modelo: string, genero: string | null, cap: string | null) => `${seg}|${marca}|${modelo}|${genero ?? ''}|${cap ?? ''}`;
const grupo = (seg: string, marca: string, genero: string | null, cap: string | null) => `${seg}|${marca}|${genero ?? ''}|${cap ?? ''}`;

/**
 * Índice em memória dos masters de esporte. Um produto = um master: casa por chave de identidade igual, por (segmento, marca, modelo,
 * gênero) lidos do nome OU dos atributos do catálogo (masters do ML), ou por título normalizado igual. Se o modelo existente é prefixo do
 * nosso (ou vice-versa) — "Air Max 90" x "Air Max 90 Essential" — devolve `ambiguo`: NÃO cria (pode ser o mesmo produto), vai para conferência.
 */
export class IndiceMasters {
  private porChave = new Map<string, { id: string; name: string }>();
  private porTriplo = new Map<string, { id: string; name: string }>();
  private porTitulo = new Map<string, { id: string; name: string }>();
  private porGrupo = new Map<string, Array<{ modelo: string; id: string; name: string }>>();

  add(m: MasterExistente): void {
    const ref = { id: m.id, name: m.name };
    if (m.identityKey && !this.porChave.has(m.identityKey)) this.porChave.set(m.identityKey, ref);
    const tk = normalizeTitleKey(m.name);
    if (tk && !this.porTitulo.has(tk)) this.porTitulo.set(tk, ref);
    const cat = m.catalogAttributes ?? null;
    // (b) atributos do catálogo (ML: BRAND, MODEL, GENDER), no segmento gravado no master. Mais específicos que o nome.
    let modeloAttr = '';
    if (cat && m.segmento && SEG_POR_KEY.has(m.segmento)) {
      const marca = marcaDeAtributo(String(cat.BRAND ?? ''));
      modeloAttr = cat.MODEL ? prep(String(cat.MODEL)) : '';
      const seg = SEG_POR_KEY.get(m.segmento)!;
      const gBruto = generoDe(String(cat.GENDER ?? ''));
      const g = seg.generoObrigatorio ? gBruto : gBruto === 'unissex' ? null : gBruto;
      if (marca && modeloAttr && (g || !seg.generoObrigatorio)) this.indexar(m.segmento, marca.key, modeloAttr, g, null, ref);
      else modeloAttr = '';
    }
    // (a) pelo nome, com o mesmo avaliador. Se o atributo MODEL é MAIS longo que o modelo lido do nome ("Air Max 90 Essential" x "Air Max 90"),
    // o nome não é indexado: o anúncio "Air Max 90" cairia em cima de uma variante. Ele passa a ser `ambiguo` (conferência), nunca duplicata.
    const a = avaliarTituloEsporte(m.name);
    if (a.ok && !(modeloAttr && modeloAttr.startsWith(a.modelo + ' '))) this.indexar(a.segmento, a.marca.key, a.modelo, a.genero, a.capacidade, ref);
  }

  private indexar(seg: string, marca: string, modelo: string, genero: string | null, cap: string | null, ref: { id: string; name: string }): void {
    const t = triplo(seg, marca, modelo, genero, cap);
    if (!this.porTriplo.has(t)) this.porTriplo.set(t, ref);
    const g = grupo(seg, marca, genero, cap);
    const lista = this.porGrupo.get(g) ?? [];
    lista.push({ modelo, ...ref });
    this.porGrupo.set(g, lista);
  }

  buscar(ok: EsporteOk): BuscaMaster {
    const porChave = this.porChave.get(ok.chave);
    if (porChave) return { tipo: 'existente', ...porChave, via: 'chave' };
    const t = this.porTriplo.get(triplo(ok.segmento, ok.marca.key, ok.modelo, ok.genero, ok.capacidade));
    if (t) return { tipo: 'existente', ...t, via: 'triplo' };
    const tk = normalizeTitleKey(ok.nomeMaster);
    const porTitulo = tk ? this.porTitulo.get(tk) : undefined;
    if (porTitulo) return { tipo: 'existente', ...porTitulo, via: 'titulo' };
    for (const c of this.porGrupo.get(grupo(ok.segmento, ok.marca.key, ok.genero, ok.capacidade)) ?? []) {
      if (c.modelo !== ok.modelo && (c.modelo.startsWith(ok.modelo + ' ') || ok.modelo.startsWith(c.modelo + ' '))) {
        return { tipo: 'ambiguo', id: c.id, name: c.name, modelo: c.modelo };
      }
    }
    return null;
  }

  /** Registra um master recém-criado (ou planejado, no dry-run) para a próxima oferta da mesma execução achá-lo. */
  adicionar(ok: EsporteOk, id: string): void {
    const ref = { id, name: ok.nomeMaster };
    this.porChave.set(ok.chave, ref);
    const tk = normalizeTitleKey(ok.nomeMaster);
    if (tk) this.porTitulo.set(tk, ref);
    this.indexar(ok.segmento, ok.marca.key, ok.modelo, ok.genero, ok.capacidade, ref);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Filtros de preço (isca) puros
// ---------------------------------------------------------------------------------------------------------------------
/** Mediana (centavos) de uma lista; null se vazia. */
export function medianaCentavos(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Isca contra o lote da busca: com >= 3 anúncios da MESMA chave, preço < 35% da mediana do grupo. */
export function iscaNoLote(precoCentavos: number, precosDoGrupo: number[]): boolean {
  if (precosDoGrupo.length < 3) return false;
  const m = medianaCentavos(precosDoGrupo);
  return m != null && precoCentavos < m * 0.35;
}

// ---------------------------------------------------------------------------------------------------------------------
// Termos de busca (palavra-chave). Ordem = prioridade; a descoberta avança por cursor.
// ---------------------------------------------------------------------------------------------------------------------
const PRIORIDADE_MARCAS = ['nike', 'adidas', 'puma', 'asics', 'olympikus', 'mizuno', 'fila', 'new balance', 'under armour', 'vans', 'converse', 'reebok', 'skechers', 'hoka', 'saucony', 'brooks', 'jordan', 'lacoste', 'diadora'];
const MARCAS_VESTUARIO = ['nike', 'adidas', 'puma', 'under armour', 'olympikus', 'mizuno', 'fila', 'umbro', 'kappa', 'penalty', 'topper', 'mormaii', 'lupo', 'speedo', 'joma'];
const USOS_TENIS = ['masculino', 'feminino', 'corrida', 'caminhada', 'academia treino', 'futsal society', 'skate', 'casual esportivo'];
const PECAS = ['camiseta', 'camiseta dry fit', 'short', 'bermuda', 'legging', 'regata', 'jaqueta', 'agasalho', 'moletom', 'camisa compressao', 'meia', 'bone', 'mochila', 'bolsa treino'];

export function termosEsporte(): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const x = t.trim().replace(/\s+/g, ' ');
    if (x && !out.includes(x)) out.push(x);
  };
  // A. amplos por marca (maior rendimento por chamada)
  for (const b of PRIORIDADE_MARCAS) for (const u of USOS_TENIS) push(`tenis ${b} ${u}`);
  for (const b of MARCAS_VESTUARIO) for (const p of PECAS) push(`${p} ${b}`);
  // B. por modelo/linha do léxico (um termo por linha: marca + linha)
  for (const b of PRIORIDADE_MARCAS) {
    for (const l of LINHAS[b]?.tenis ?? []) push(`tenis ${b} ${l.split('|')[0].replace(/\+$/, '')}`);
  }
  for (const b of MARCAS_VESTUARIO) {
    for (const g of ['roupa', 'meia', 'bone', 'bolsa'] as GrupoLinha[]) for (const l of LINHAS[b]?.[g] ?? []) push(`${b} ${l.split('|')[0].replace(/\+$/, '')}`);
  }
  // C. camisas de time
  for (const t of TIMES) push(`camisa ${t.aliases[0]} oficial`);
  for (const t of TIMES.slice(0, 16)) for (const b of ['nike', 'adidas', 'puma', 'umbro', 'kappa', 'new balance']) push(`camisa ${t.aliases[0]} ${b}`);
  return out;
}

/** Marcas do léxico (para relatórios/testes). */
export const MARCAS_ESPORTE_SHOPEE = MARCAS.map((m) => m.key);
