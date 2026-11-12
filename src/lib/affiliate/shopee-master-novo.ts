// Sem 'server-only': funções puras (sem banco, sem rede), testadas em scripts/test-shopee-master-novo.ts.
import { extractFeat, norm } from './amazon-identity';
import { rejeicaoDeTitulo } from './shopee-identity';
import { avaliarCandidato, MOTIVOS_DA_FILA, type CandidatoMaster } from '../catalog/aprovacao-nicho';
import { avaliarTituloEsporte, IndiceMasters as IndiceEsporte, type EsporteOk } from '../catalog/vertical/esporte-shopee';
import { colorlessTitleKey, stripColors, stripSizes } from '../catalog/vertical/scope';
import { foldText, isGenericBrand, isIsbn13 } from '../catalog/vertical/identity';

/**
 * CRIAÇÃO DE PRODUTO NOVO A PARTIR DA SHOPEE (dono, 2026-11-12: "trazer TODOS os itens para o banco"; ordem 2 da correção de diretriz).
 * Item da Shopee sem master equivalente nas lojas Plus (e nos games, ver cobertura-shopee.ts) CRIA um master_product, na vertical da categoria
 * Shopee mapeada, depois de: (1) condição/acessório/digital (identidade, não preço) barram; (2) dedup por chave de identidade, GTIN/ISBN e título
 * sem cor, contra TODOS os masters da vertical (aprovados e em revisão) e contra os já planejados na execução; (3) o porteiro/escopo existente
 * (avaliarCandidato, aprovacao-nicho.ts, critérios v3) decide se a primeira oferta nasce ATIVA ou como RASCUNHO + pergunta na fila.
 *
 * O master SEMPRE nasce em `review` (ADR 0008; invisível, fora de média e vitrine). Quem o aprova é o fluxo existente
 * (scripts/aprovar-masters-nicho.ts / aplicar-aprovacao-plus.ts). Nada aqui inventa atributo: o que o título não diz fica ausente.
 *
 * Força da chave:
 *   forte  esporte: marca+modelo+gênero do léxico fechado; livros: ISBN-13 no título; demais: marca CONHECIDA (tabela brands) + código de modelo;
 *   fraca  só o título sem cor: o master nasce, mas a primeira oferta vai SEMPRE para a fila (nunca ativa) — a dúvida é humana.
 */

export type LojaPlus = 'eletroeletronicos' | 'eletrodomesticos' | 'tecnologia' | 'esporte' | 'impressao3d' | 'livros';
export const LOJAS_PLUS: readonly LojaPlus[] = ['eletroeletronicos', 'eletrodomesticos', 'tecnologia', 'esporte', 'impressao3d', 'livros'];
export const ehLojaPlus = (l: string): l is LojaPlus => (LOJAS_PLUS as readonly string[]).includes(l);

export type ForcaChave = 'forte' | 'fraca';

export interface PropostaMaster {
  loja: LojaPlus;
  nome: string;
  /** attributes.vertical.identityKey */
  chave: string;
  keyKind: 'isbn' | 'brand_model' | 'title';
  forca: ForcaChave;
  segmento: string | null;
  /** Nome de exibição da marca (manufacturer do master). */
  marca: string | null;
  gtin: string | null;
  catalogAttributes: Record<string, string>;
  esporte: EsporteOk | null;
}

export type ResultadoProposta = { ok: true; proposta: PropostaMaster } | { ok: false; motivo: string };

/** Marcas conhecidas (nomes normalizados por `norm`) vindas da tabela brands: dado real do catálogo, nunca lista inventada. */
export type MarcasConhecidas = ReadonlySet<string>;

const nomeLimpo = (titulo: string): string => stripSizes(stripColors(titulo.replace(/\s+/g, ' ').trim())).slice(0, 160).trim();
export const chaveFraca = (titulo: string): string => `titulo:${colorlessTitleKey(titulo)}`;

/** Código de modelo no título: 5 a 24 caracteres, letras E dígitos (mesmo critério de código do juiz de identidade). */
function codigoDeModelo(titulo: string): string | null {
  const f = extractFeat(titulo);
  const todos = [...f.codes, ...f.hcodes].filter((c) => c.length >= 5 && c.length <= 24 && /[a-z]/i.test(c) && /\d/.test(c));
  return todos.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Marca conhecida citada no título (a mais longa). Nunca genérica. */
function marcaNoTitulo(titulo: string, marcas: MarcasConhecidas): string | null {
  const t = ` ${norm(titulo)} `;
  let melhor: string | null = null;
  for (const m of marcas) {
    if (m.length < 3 || !t.includes(` ${m} `)) continue;
    if (!melhor || m.length > melhor.length) melhor = m;
  }
  return melhor;
}

const isbnNoTitulo = (titulo: string): string | null => {
  for (const x of titulo.replace(/(?<=\d)[-\s](?=\d)/g, '').match(/97[89]\d{10}/g) ?? []) if (isIsbn13(x)) return x;
  return null;
};

const fraca = (loja: LojaPlus, titulo: string, extra: Partial<PropostaMaster> = {}): PropostaMaster => ({
  loja, nome: nomeLimpo(titulo), chave: chaveFraca(titulo), keyKind: 'title', forca: 'fraca', segmento: null, marca: null, gtin: null, catalogAttributes: {}, esporte: null, ...extra,
});

/** Monta a proposta de master a partir do título do anúncio, ou o motivo de não haver (condição/acessório/digital/fora do recorte). */
export function propostaMasterNovo(loja: LojaPlus, titulo: string, marcas: MarcasConhecidas): ResultadoProposta {
  const rej = rejeicaoDeTitulo(titulo);
  if (rej) return { ok: false, motivo: rej.split(':').slice(0, 2).join(':') };
  if (!nomeLimpo(titulo)) return { ok: false, motivo: 'invalido:sem_titulo' };

  if (loja === 'esporte') {
    const av = avaliarTituloEsporte(titulo);
    if (av.ok) {
      return {
        ok: true,
        proposta: {
          loja, nome: av.nomeMaster, chave: av.chave, keyKind: 'brand_model', forca: 'forte', segmento: av.segmento, marca: av.marca.display, gtin: null,
          catalogAttributes: av.catalogAttributes, esporte: av,
        },
      };
    }
    // Condição/réplica/lote: identidade barra. Fora do recorte do departamento: não é produto da loja. Identidade incompleta/ambígua: dúvida humana.
    if (av.categoria === 'nao_novo' || av.categoria === 'falsificado' || av.categoria === 'lote' || av.categoria === 'fora_do_recorte') return { ok: false, motivo: `esporte:${av.categoria}` };
    return { ok: true, proposta: fraca(loja, titulo) };
  }

  if (loja === 'livros') {
    const isbn = isbnNoTitulo(titulo);
    if (isbn) return { ok: true, proposta: { ...fraca(loja, titulo), chave: `isbn:${isbn}`, keyKind: 'isbn', forca: 'forte', segmento: 'livros', gtin: isbn, catalogAttributes: { GTIN: isbn } } };
    return { ok: true, proposta: fraca(loja, titulo, { segmento: 'livros' }) };
  }

  const marcaN = marcaNoTitulo(titulo, marcas);
  const codigo = codigoDeModelo(titulo);
  if (marcaN && codigo && !isGenericBrand(marcaN)) {
    const display = marcaN.replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      ok: true,
      proposta: {
        ...fraca(loja, titulo), chave: `bm:|brand=${foldText(marcaN)}|model=${codigo}`, keyKind: 'brand_model', forca: 'forte', marca: display,
        catalogAttributes: { BRAND: display, MODEL: codigo.toUpperCase() },
      },
    };
  }
  return { ok: true, proposta: fraca(loja, titulo, marcaN ? { marca: marcaN.replace(/\b\w/g, (c) => c.toUpperCase()), catalogAttributes: { BRAND: marcaN.replace(/\b\w/g, (c) => c.toUpperCase()) } } : {}) };
}

// ---------------------------------------------------------------------------
// Dedup contra TODOS os masters da vertical (aprovados e em revisão) + os planejados na execução
// ---------------------------------------------------------------------------

export interface MasterDedupRow {
  id: string;
  name: string;
  /** attributes.vertical.identityKey */
  chave: string | null;
  gtin: string | null;
  segmento?: string | null;
  catalogAttributes?: Record<string, unknown> | null;
}

export type AchadoDedup =
  | { tipo: 'existente'; id: string; name: string; via: 'chave' | 'gtin' | 'triplo' | 'titulo' }
  | { tipo: 'ambiguo'; id: string; name: string }
  | null;

export class IndiceDedup {
  private porChave = new Map<string, MasterDedupRow>();
  private porGtin = new Map<string, MasterDedupRow>();
  private porTitulo = new Map<string, MasterDedupRow>();
  private esporte = new IndiceEsporte();
  total = 0;

  constructor(rows: MasterDedupRow[] = []) {
    for (const r of rows) this.add(r);
  }

  add(r: MasterDedupRow): void {
    this.total++;
    if (r.chave && !this.porChave.has(r.chave)) this.porChave.set(r.chave, r);
    if (r.gtin && !this.porGtin.has(r.gtin)) this.porGtin.set(r.gtin, r);
    const tk = colorlessTitleKey(r.name);
    if (tk && !this.porTitulo.has(tk)) this.porTitulo.set(tk, r);
    this.esporte.add({ id: r.id, name: r.name, segmento: r.segmento ?? null, identityKey: r.chave, catalogAttributes: r.catalogAttributes ?? null });
  }

  buscar(p: PropostaMaster): AchadoDedup {
    const c = this.porChave.get(p.chave);
    if (c) return { tipo: 'existente', id: c.id, name: c.name, via: 'chave' };
    if (p.gtin) {
      const g = this.porGtin.get(p.gtin);
      if (g) return { tipo: 'existente', id: g.id, name: g.name, via: 'gtin' };
    }
    if (p.esporte) {
      const e = this.esporte.buscar(p.esporte);
      if (e?.tipo === 'existente') return { tipo: 'existente', id: e.id, name: e.name, via: e.via === 'chave' ? 'chave' : e.via === 'triplo' ? 'triplo' : 'titulo' };
      if (e?.tipo === 'ambiguo') return { tipo: 'ambiguo', id: e.id, name: e.name };
    }
    const t = this.porTitulo.get(colorlessTitleKey(p.nome));
    if (t) return { tipo: 'existente', id: t.id, name: t.name, via: 'titulo' };
    return null;
  }

  /** Registra o master recém-criado (ou planejado, no dry-run) para o próximo item da mesma execução achá-lo. */
  adicionar(p: PropostaMaster, id: string): void {
    this.add({ id, name: p.nome, chave: p.chave, gtin: p.gtin, segmento: p.segmento, catalogAttributes: p.catalogAttributes });
  }
}

// ---------------------------------------------------------------------------
// Decisão: anexar a um master achado, criar master novo, ou descartar
// ---------------------------------------------------------------------------

export interface ItemParaMaster {
  titulo: string;
  priceCents: number;
  hasImage: boolean;
}

export type DecisaoMasterNovo =
  /** Master já existe (dedup). `oferta`: ativa só em chave exata; título igual ou ambíguo = dúvida (fila). */
  | { acao: 'anexar'; masterId: string; masterNome: string; via: string; oferta: 'ativa' | 'duvida'; motivo: string }
  | { acao: 'criar'; proposta: PropostaMaster; oferta: 'ativa' | 'duvida'; motivo: string; sugestaoPorteiro: 'approved' | 'review'; motivosPorteiro: string[] }
  | { acao: 'descartar'; motivo: string };

/** Motivos do porteiro/escopo que NÃO são resolvidos por resposta humana e barram a criação (usado, brinquedo, nome genérico, sem foto...). */
const MOTIVOS_RESOLVE_NA_CRIACAO = new Set(['sem_evidencia_positiva_do_porteiro', 'sem_oferta_clicavel', ...MOTIVOS_DA_FILA]);

export function decidirMasterNovo(loja: LojaPlus, item: ItemParaMaster, marcas: MarcasConhecidas, indice: IndiceDedup): DecisaoMasterNovo {
  const r = propostaMasterNovo(loja, item.titulo, marcas);
  if (!r.ok) return { acao: 'descartar', motivo: r.motivo };
  const p = r.proposta;
  const achado = indice.buscar(p);
  if (achado?.tipo === 'ambiguo') return { acao: 'anexar', masterId: achado.id, masterNome: achado.name, via: 'ambiguo', oferta: 'duvida', motivo: 'master_novo:possivel_duplicata' };
  if (achado?.tipo === 'existente') {
    const exata = achado.via === 'chave' || achado.via === 'gtin' || achado.via === 'triplo';
    return { acao: 'anexar', masterId: achado.id, masterNome: achado.name, via: achado.via, oferta: exata && p.forca === 'forte' ? 'ativa' : 'duvida', motivo: `master_existente:${achado.via}` };
  }
  // Porteiro/escopo existentes (critérios v3) sobre o candidato com a única oferta que temos.
  const cand: CandidatoMaster = {
    id: 'novo', name: p.nome, vertical: loja, gtin: p.gtin, mpn: null, hasImage: item.hasImage,
    gate: { suggested: p.forca === 'forte' ? 'approved' : 'review' },
    catalogAttributes: p.catalogAttributes, precosClicaveis: [item.priceCents], ofertasAtivas: 1, ofertasQuarentena: 0,
    titulosOfertas: [item.titulo], nomeDuplicado: false, segment: p.segmento, manufacturer: p.marca,
  };
  const av = avaliarCandidato(cand);
  const definitivos = av.motivos.filter((m) => !MOTIVOS_RESOLVE_NA_CRIACAO.has(m));
  if (definitivos.length > 0) return { acao: 'descartar', motivo: `porteiro:${definitivos[0]}` };
  const sugestao = p.forca === 'forte' ? 'approved' : 'review';
  const ativa = p.forca === 'forte' && av.aprovavel;
  return {
    acao: 'criar', proposta: p, oferta: ativa ? 'ativa' : 'duvida', sugestaoPorteiro: sugestao, motivosPorteiro: av.motivos,
    motivo: ativa ? 'master_novo:chave_forte' : `master_novo:${p.forca === 'fraca' ? 'chave_fraca' : av.motivos.join('+') || 'duvida'}`,
  };
}
