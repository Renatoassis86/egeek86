// Metodologias de selecao por DIVERSIDADE (dono, 2026-11-19: "soam poucos itens por loja, fica mandando a mesma coisa").
// Puro (sem banco): usado pelo harness scripts/sim-diversidade.ts e como especificacao da ordem aplicada em group-queue.ts (rodizio aninhado).
// So ORDEM: nada e excluido ("livre acesso", sem prender o fluxo).

export interface ItemSel {
  id: string;
  vertical: string;
  tipo: string;
  marca: string | null; // marca principal do dicionario da loja; null = sem marca conhecida (neutro)
  fam: string; // familia (3 primeiras palavras do nome)
  q: number; // qualidade/prioridade (degrau da regua*100 + popularidade); maior = melhor
  prefer: boolean; // marca preferida do dono
  created: number;
}

export interface Hist {
  tipo: Map<string, number>;
  marca: Map<string, number>;
  fam: Map<string, number>;
}

export const histVazio = (): Hist => ({ tipo: new Map(), marca: new Map(), fam: new Map() });
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const get = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
const melhor = (a: ItemSel, b: ItemSel) => b.q - a.q || b.created - a.created;

function clonar(h: Hist): Hist {
  return { tipo: new Map(h.tipo), marca: new Map(h.marca), fam: new Map(h.fam) };
}
function registrar(h: Hist, it: ItemSel) {
  inc(h.tipo, it.tipo);
  if (it.marca) inc(h.marca, it.marca);
  inc(h.fam, it.fam);
}

export type Metodo = (itens: readonly ItemSel[], hist: Hist, n: number) => ItemSel[];

/** M0 - ordem por qualidade pura (referencia "sem diversidade"). */
export const m0Qualidade: Metodo = (itens, _h, n) => [...itens].sort(melhor).slice(0, n);

/** Escolhe sempre o item de menor "custo" (contagens ja enviadas + ja escolhidas), desempate por qualidade. */
function guloso(itens: readonly ItemSel[], hist: Hist, n: number, custo: (it: ItemSel, h: Hist) => number): ItemSel[] {
  const h = clonar(hist);
  const resto = [...itens].sort(melhor);
  const out: ItemSel[] = [];
  while (out.length < n && resto.length) {
    let bi = 0;
    let bc = Infinity;
    for (let i = 0; i < resto.length; i++) {
      const c = custo(resto[i], h);
      if (c < bc) { bc = c; bi = i; }
    }
    const [it] = resto.splice(bi, 1);
    out.push(it);
    registrar(h, it);
  }
  return out;
}

/** M1 - rodizio por TIPO (deficit): o tipo menos enviado abre. */
export const m1Tipo: Metodo = (i, h, n) => guloso(i, h, n, (it, hh) => get(hh.tipo, it.tipo));

/** M2 - deficit ponderado tipo + marca + familia. */
export const m2Ponderado: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => get(hh.tipo, it.tipo) * 3 + (it.marca ? get(hh.marca, it.marca) * 2 : 0) + get(hh.fam, it.fam) * 5);

/** M3 - marca primeiro (cota por marca principal), depois tipo. */
export const m3Marca: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => (it.marca ? get(hh.marca, it.marca) * 10 : 0) + get(hh.tipo, it.tipo));

/** M4 - penalidade forte por familia/modelo repetido, depois tipo. */
export const m4Familia: Metodo = (i, h, n) => guloso(i, h, n, (it, hh) => get(hh.fam, it.fam) * 100 + get(hh.tipo, it.tipo));

/** M5 - marca preferida do dono abre, depois M2. */
export const m5Preferida: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => (it.prefer ? 0 : 1000) + get(hh.tipo, it.tipo) * 3 + (it.marca ? get(hh.marca, it.marca) * 2 : 0) + get(hh.fam, it.fam) * 5);

/** M6 - rodizio ANINHADO: tipo -> marca -> familia -> item (cada nivel por deficit lexicografico, nao ponderado). */
export const m6Aninhado: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => {
    // lexicografico: tipo domina, depois marca, depois familia (pesos grandes o bastante para nunca se misturarem)
    return get(hh.tipo, it.tipo) * 1e6 + (it.marca ? get(hh.marca, it.marca) : 0) * 1e3 + get(hh.fam, it.fam);
  });

/** M7 - M6 com marca preferida abrindo dentro de cada tipo e marca sem dicionario contada como "marca propria" (familia). */
export const m7AninhadoPref: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => get(hh.tipo, it.tipo) * 1e6 + (it.prefer ? 0 : 5e5) + (it.marca ? get(hh.marca, it.marca) : get(hh.fam, it.fam)) * 1e3 + get(hh.fam, it.fam));

/** M8 - rodizio por tipo; dentro do tipo a marca menos enviada (games fora: so ordem de qualidade). Sem familia. */
export const m8TipoMarca: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => get(hh.tipo, it.tipo) * 1e6 + (it.vertical !== 'games' && it.marca ? get(hh.marca, it.marca) * 1e3 : 0));

/** M9 - M8 + marca preferida abre + familia ja enviada recua (peso baixo, so desempata). */
export const m9TipoMarcaFam: Metodo = (i, h, n) =>
  guloso(i, h, n, (it, hh) => get(hh.tipo, it.tipo) * 1e6 + (it.prefer ? 0 : 5e5) + (it.vertical !== 'games' && it.marca ? get(hh.marca, it.marca) * 1e3 : 0) + get(hh.fam, it.fam));

export const METODOS: ReadonlyArray<[string, Metodo]> = [
  ['M0 qualidade pura', m0Qualidade],
  ['M1 rodizio por tipo', m1Tipo],
  ['M2 deficit ponderado', m2Ponderado],
  ['M3 marca primeiro', m3Marca],
  ['M4 penaliza familia', m4Familia],
  ['M5 marca preferida+M2', m5Preferida],
  ['M6 aninhado tipo>marca>familia', m6Aninhado],
  ['M7 aninhado+preferida', m7AninhadoPref],
  ['M8 tipo>marca (games fora)', m8TipoMarca],
  ['M9 tipo>pref>marca>familia', m9TipoMarcaFam],
];

export interface Medida {
  n: number;
  tipos: number;
  marcas: number;
  familias: number;
  topoTipoPct: number;
  perdaQualidadePct: number;
}

export function medir(sel: readonly ItemSel[], todos: readonly ItemSel[], n: number): Medida {
  const cnt = new Map<string, number>();
  for (const s of sel) inc(cnt, s.tipo);
  const top = sel.length ? Math.max(...cnt.values()) : 0;
  const melhoresQ = [...todos].sort(melhor).slice(0, n).reduce((a, b) => a + b.q, 0);
  const q = sel.reduce((a, b) => a + b.q, 0);
  return {
    n: sel.length,
    tipos: new Set(sel.map((s) => s.tipo)).size,
    marcas: new Set(sel.filter((s) => s.marca).map((s) => s.marca)).size,
    familias: new Set(sel.map((s) => s.fam)).size,
    topoTipoPct: sel.length ? Math.round((top / sel.length) * 100) : 0,
    perdaQualidadePct: melhoresQ > 0 ? Math.max(0, Math.round((1 - q / melhoresQ) * 100)) : 0,
  };
}
