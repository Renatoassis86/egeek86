// Sem 'server-only': função pura sobre dados já carregados. Duas análises sobre a CESTA (master e suas ofertas):
//  - FUSÃO errada: oferta cujo título contradiz o produto da cesta (contamina a média);
//  - DIVISÃO: dois masters que são o mesmo produto (fragmentam a média), com "blocking" por marca+tipo.
import { extrairAtributos, montarLexicoMarcas, type Atributos, type LexicoMarcas } from './atributos';
import { IndiceTfidf, julgarAtributos, ps5Console, conflitosEntre, LIMIAR_APLICAR, LIMIAR_SUGERIR, type Conflito, type Julgamento } from './comparar';

export interface OfertaCesta {
  id: string;
  titulo: string;
  rede: string;
  ref?: string | null;
  status?: string;
}

export interface MasterCesta {
  id: string;
  nome: string;
  vertical: string;
  tipoCadastro: string;
  gtin?: string | null;
  mpn?: string | null;
  fabricante?: string | null;
  plataforma?: string | null;
  formato?: string | null;
  ofertas: OfertaCesta[];
  /** Veredito humano do dono (catalogGate.manual): nunca desfeito. */
  decisaoHumana?: boolean;
}

export type ClasseOferta = 'ok' | 'fora' | 'duvida';

export interface OfertaAvaliada {
  id: string;
  classe: ClasseOferta;
  conflitos: Conflito[];
  confianca: number;
}

export interface ResultadoCesta {
  masterId: string;
  /** A maioria das ofertas diverge do nome do master: o nome é o suspeito; nada é aplicado sozinho. */
  nomeDivergente: boolean;
  nomeSugerido?: string;
  ofertas: OfertaAvaliada[];
  /** Cesta MISTA: as ofertas se contradizem entre si num eixo (110V x 220V, 55" x 65"...) que o nome do master não fixa. Só sugestão (separar em masters). */
  misturas: Array<{ eixo: string; grupos: Record<string, string[]> }>;
}

export class Motor {
  readonly lexico: LexicoMarcas;
  readonly indice: IndiceTfidf;
  private cache = new Map<string, Atributos>();

  constructor(titulos: string[] = [], fabricantes: string[] = []) {
    this.lexico = montarLexicoMarcas(fabricantes);
    this.indice = new IndiceTfidf();
    const vistos = new Set<string>();
    for (const t of titulos) {
      if (vistos.has(t)) continue;
      vistos.add(t);
      this.indice.adicionar(this.atributos(t).nucleo);
    }
  }

  atributos(titulo: string): Atributos {
    let a = this.cache.get(titulo);
    if (!a) {
      a = extrairAtributos(titulo, this.lexico);
      if (this.cache.size > 200_000) this.cache.clear();
      this.cache.set(titulo, a);
    }
    return a;
  }

  julgar(a: string, b: string): Julgamento {
    return julgarAtributos(this.atributos(a), this.atributos(b), this.indice);
  }
}

/** Plataforma do cadastro (game_platform_gen) vira atributo quando o título não cita (jogo de uma geração só). */
function comPlataforma(a: Atributos, plataforma?: string | null): Atributos {
  if (!plataforma || plataforma === 'unknown' || a.plataformas.length) return a;
  const mapa: Record<string, string> = { switch_1: 'switch', switch_2: 'switch2', ps5: 'ps5', ps4: 'ps4', xbox_series: 'xbox_series', xbox_one: 'xbox_one', xbox_360: 'xbox_360' };
  const p = mapa[plataforma];
  return p ? { ...a, plataformas: [p] } : a;
}

/**
 * Avalia as ofertas de UMA cesta contra o produto do master. 'fora' = conflito DURO com o nome do master (e o nome não é o
 * divergente da cesta): tira da média. Sem conflito duro a oferta fica ('ok'): informação ausente nunca tira oferta.
 */
export function analisarCesta(m: MasterCesta, motor: Motor): ResultadoCesta {
  const am = comPlataforma(motor.atributos(m.nome), m.plataforma);
  const ofertas: OfertaAvaliada[] = m.ofertas.map((o) => {
    const j = julgarAtributos(motor.atributos(o.titulo), am, motor.indice);
    const duros = j.conflitos.filter((c) => c.duro);
    return { id: o.id, classe: duros.length ? 'fora' : 'ok', conflitos: duros, confianca: duros.length ? j.confianca : 1 };
  });
  const fora = ofertas.filter((r) => r.classe === 'fora').length;
  // Quando a MAIORIA das ofertas diverge do nome, o estranho é o nome do master: a cesta vai para revisão (nada é aplicado sozinho).
  const nomeDivergente = m.ofertas.length >= 4 && fora / m.ofertas.length > 0.5;
  let nomeSugerido: string | undefined;
  if (nomeDivergente) {
    const freq = new Map<string, number>();
    for (const o of m.ofertas) freq.set(o.titulo, (freq.get(o.titulo) ?? 0) + 1);
    nomeSugerido = [...freq.entries()].sort((x, y) => y[1] - x[1])[0][0];
  }
  return { masterId: m.id, nomeDivergente, nomeSugerido, ofertas, misturas: misturasDaCesta(m, motor) };
}

/** Eixos em que ofertas da MESMA cesta não podem divergir (decisão do dono: voltagem, região, capacidade, tamanho, pack separam). */
export function misturasDaCesta(m: MasterCesta, motor: Motor): Array<{ eixo: string; grupos: Record<string, string[]> }> {
  const out: Array<{ eixo: string; grupos: Record<string, string[]> }> = [];
  const attrs = m.ofertas.map((o) => ({ id: o.id, a: motor.atributos(o.titulo) }));
  const am = motor.atributos(m.nome);
  const eixo = (nome: string, valor: (a: Atributos) => string | null) => {
    const grupos: Record<string, string[]> = {};
    for (const { id, a } of attrs) { const v = valor(a); if (v) (grupos[v] ??= []).push(id); }
    if (Object.keys(grupos).length >= 2) out.push({ eixo: nome, grupos });
  };
  eixo('voltagem', (a) => (a.voltagens.length === 1 && a.voltagens[0] !== 'bivolt' ? a.voltagens[0] : null));
  {
    const imp = attrs.filter((x) => x.a.importado).map((x) => x.id), nac = attrs.filter((x) => !x.a.importado).map((x) => x.id);
    if (imp.length && nac.length) out.push({ eixo: 'regiao', grupos: { importado: imp, sem_marca_de_regiao: nac } });
  }
  if (!ps5Console(am)) eixo('armazenamento', (a) => (a.armazenamento.length === 1 ? String(a.armazenamento[0]) : null));
  eixo('polegadas', (a) => (a.polegadas.length === 1 ? String(a.polegadas[0] / 10) : null));
  eixo('pack', (a) => (a.pack > 1 ? String(a.pack) : null));
  return out;
}

// ---------------------------------------------------------------------------
// Divisão: pares de masters que são o mesmo produto
// ---------------------------------------------------------------------------

export interface SugestaoJuncao {
  canonicoId: string;
  incorporarId: string;
  confianca: number;
  similaridade: number;
  motivo: string;
  /** Alta confiança (>= LIMIAR_APLICAR, sem conflito, sem trava de GTIN/decisão humana): elegível a aplicar. */
  aplicavel: boolean;
  travas: string[];
  conflitosSuaves: string[];
}

interface Candidato { m: MasterCesta; a: Atributos; ativos: number }

function chaveBloco(a: Atributos, m: MasterCesta): string | null {
  if (!a.tipo || !a.marca) return null;
  return [m.vertical, m.tipoCadastro, a.marca, a.tipo, a.acessorio ? 'a' : 'p'].join('|');
}

/**
 * Sugere junções de masters com "blocking" por vertical+tipo de cadastro+marca+tipo (não compara tudo com tudo). O canônico é o de mais
 * ofertas ativas. Nunca sugere quando há conflito duro; trava a aplicação quando há GTIN diferente nos dois, decisão humana ou
 * condição não nova.
 */
export function sugerirJuncoes(masters: MasterCesta[], motor: Motor, opts: { tamanhoMaxBloco?: number } = {}): SugestaoJuncao[] {
  const max = opts.tamanhoMaxBloco ?? 600;
  const blocos = new Map<string, Candidato[]>();
  for (const m of masters) {
    if (!m.ofertas.length) continue;
    const a = comPlataforma(motor.atributos(m.nome), m.plataforma);
    const k = chaveBloco(a, m);
    if (!k) continue;
    const ativos = m.ofertas.filter((o) => o.status === 'active').length;
    const l = blocos.get(k) ?? [];
    l.push({ m, a, ativos });
    blocos.set(k, l);
  }
  const out: SugestaoJuncao[] = [];
  for (const [, lista] of blocos) {
    if (lista.length < 2) continue;
    const l = lista.length > max ? lista.slice(0, max) : lista;
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        const x = l[i], y = l[j];
        // sub-blocking barato: precisa compartilhar ao menos um token raro do núcleo
        if (!partilhaToken(x.a, y.a)) continue;
        const jul = julgarAtributos(x.a, y.a, motor.indice);
        if (jul.veredito !== 'igual') continue;
        const [can, inc] = x.ativos >= y.ativos ? [x, y] : [y, x];
        const travas: string[] = [];
        if (x.m.gtin && y.m.gtin && x.m.gtin !== y.m.gtin) travas.push('gtin_diferente');
        if (x.m.decisaoHumana || y.m.decisaoHumana) travas.push('decisao_humana');
        if (x.a.naoNovo || y.a.naoNovo) travas.push('condicao_nao_nova');
        if ((x.m.plataforma ?? 'unknown') !== (y.m.plataforma ?? 'unknown') && x.m.plataforma !== 'unknown' && y.m.plataforma !== 'unknown') travas.push('plataforma_cadastro_diferente');
        if ((x.m.formato ?? 'unknown') !== (y.m.formato ?? 'unknown')) travas.push('formato_diferente');
        const suaves = jul.conflitos.filter((c) => !c.duro).map((c) => c.eixo);
        out.push({
          canonicoId: can.m.id,
          incorporarId: inc.m.id,
          confianca: jul.confianca,
          similaridade: jul.similaridade,
          motivo: jul.evidencias.join(',') || 'nucleo_identico',
          aplicavel: jul.confianca >= LIMIAR_APLICAR && !travas.length && !suaves.filter((s) => !/^(?:tipo_desconhecido|marca_desconhecida)$/.test(s)).length,
          travas,
          conflitosSuaves: suaves,
        });
      }
    }
  }
  return out.sort((p, q) => q.confianca - p.confianca);
}

function partilhaToken(a: Atributos, b: Atributos): boolean {
  if (a.mpn.some((x) => b.mpn.includes(x)) || a.codigos.some((x) => b.codigos.includes(x))) return true;
  const sb = new Set(b.nucleo);
  let n = 0;
  for (const t of a.nucleo) if (t.length >= 3 && sb.has(t) && ++n >= 2) return true;
  return false;
}

export { ps5Console, conflitosEntre, LIMIAR_APLICAR, LIMIAR_SUGERIR };
