// Seleção PURA do pool de produtos avaliados a cada ciclo, com rodízio por TIPO (ata 2026-11-12-diversidade-fluxo-plus).
// Sem banco, sem relógio, sem aleatoriedade: o mesmo dia/hora e a mesma entrada dão a mesma saída (hash determinístico).
// Antes: cota por loja ordenada por "razão de entrada" e hash horário, então um tipo com muitos produtos (123 air fryers) ocupava o pool.
// Agora: cada tipo da loja recebe um turno por rodada (tipos menos enviados nas últimas 24 h primeiro), e produtos que nunca têm razão
// de entrada por média/movimento (1 vendedor) entram pelo grupo ACHADO.

import { classificarTipo, TIPO_OUTROS } from '@/lib/catalog/tipos-produto';

export interface PoolRow {
  mid: string;
  /** Departamento (loja). */
  v: string;
  /** Razão de entrada (1 = evento/movimento, 2 = abaixo da média, 3 = redes, 4 = muitas ofertas). */
  r: number;
  name: string;
  /** Substitui o tipo no rodizio (games: plataforma, porque games nao tem tipo). */
  grupo?: string;
}

/** Cotas do pool (ata 2026-11-12). Games não muda (220). */
export const POOL = {
  GAMES: 220,
  /** Antes 60. Por loja Plus, selecionadas por rodízio de tipo. */
  PLUS_MAIN: 75,
  /** Dos PLUS_MAIN, até isto vem direto de eventos/movimento (r = 1) para não perder queda real de preço. */
  PLUS_EVENTS_MAX: 30,
  /** Produtos extras por loja Plus para o gatilho ACHADO (1 vendedor / sem média). */
  PLUS_ACHADO: 30,
  /** Produtos extras de GAMES sem media calculada (Achado), por rodizio de plataforma. */
  GAMES_ACHADO: 40,
  /** Produtos com cupom valido na agulha, por loja (games e Plus). Entram ANTES dos demais, por rodizio de tipo; o excedente cai na fila normal. */
  CUPOM_POR_LOJA: 40,
} as const;

/** FNV-1a 32 bits: ordem estável por hora, sem Math.random. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const tipoKey = (v: string, tipo: string) => `${v}|${tipo}`;

/**
 * Rodízio por tipo: devolve até `limit` linhas, uma de cada tipo por rodada. Tipos menos enviados em 24 h (`sends`) abrem cada rodada;
 * dentro do tipo, menor razão (r) e depois hash horário. `skipOutros` descarta o tipo 'outros' (não classificável).
 */
export function rodizioPorTipo(rows: readonly PoolRow[], hourKey: string, sends: Readonly<Record<string, number>>, limit: number, opts: { skipOutros?: boolean } = {}): PoolRow[] {
  if (limit <= 0 || !rows.length) return [];
  const groups = new Map<string, PoolRow[]>();
  for (const row of rows) {
    const tipo = row.grupo ?? classificarTipo(row.v, row.name);
    if (opts.skipOutros && tipo === TIPO_OUTROS && !row.grupo) continue;
    const k = tipoKey(row.v, tipo);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
  }
  const order = [...groups.keys()].sort((a, b) => (sends[a] ?? 0) - (sends[b] ?? 0) || hash32(a + hourKey) - hash32(b + hourKey) || a.localeCompare(b));
  const lists = order.map((k) => (groups.get(k) as PoolRow[]).slice().sort((x, y) => x.r - y.r || hash32(x.mid + hourKey) - hash32(y.mid + hourKey) || x.mid.localeCompare(y.mid)));
  const out: PoolRow[] = [];
  for (let round = 0; out.length < limit; round++) {
    let took = false;
    for (const l of lists) {
      if (round < l.length) {
        out.push(l[round]);
        took = true;
        if (out.length >= limit) break;
      }
    }
    if (!took) break;
  }
  return out;
}

export interface PoolInput {
  /** Candidatos com razão de entrada (já filtrados no SQL: ofertas vivas, elegíveis, no escopo). */
  main: readonly PoolRow[];
  /** Produtos vivos fora de games que NÃO foram enviados nas últimas 24 h (base do ACHADO). */
  achado: readonly PoolRow[];
  hourKey: string;
  /** Envios nas últimas 24 h por 'loja|tipo'. */
  sends: Readonly<Record<string, number>>;
  /** Liga o grupo ACHADO. */
  achadoOn: boolean;
  /** Produtos que tem oferta com cupom VALIDO na agulha agora (ja validado por quem chama). Cota CUPOM_POR_LOJA por loja, rodizio de tipo. */
  cupom?: readonly PoolRow[];
}

/** Seleção final, sem duplicata: games por razão e hash; lojas Plus por eventos + rodízio de tipo; ACHADO por rodízio de tipo. */
export function selecionarPool(inp: PoolInput): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (rows: readonly PoolRow[]) => {
    for (const r of rows) if (!seen.has(r.mid)) (seen.add(r.mid), out.push(r.mid));
  };
  // Cupom primeiro: o agente de cupons deve sempre ter um cupom testado na fila. Cota por loja, rodizio de tipo (a diversidade vale tambem aqui).
  const cupomByV = new Map<string, PoolRow[]>();
  for (const r of inp.cupom ?? []) (cupomByV.get(r.v) ?? cupomByV.set(r.v, []).get(r.v)!).push(r);
  for (const rows of cupomByV.values()) add(rodizioPorTipo(rows, inp.hourKey, inp.sends, POOL.CUPOM_POR_LOJA));
  const byV = new Map<string, PoolRow[]>();
  for (const r of inp.main) (byV.get(r.v) ?? byV.set(r.v, []).get(r.v)!).push(r);

  const games = (byV.get('games') ?? []).slice().sort((a, b) => a.r - b.r || hash32(a.mid + inp.hourKey) - hash32(b.mid + inp.hourKey) || a.mid.localeCompare(b.mid));
  add(games.slice(0, POOL.GAMES));

  for (const [v, rows] of byV) {
    if (v === 'games') continue;
    const events = rodizioPorTipo(rows.filter((r) => r.r <= 1), inp.hourKey, inp.sends, POOL.PLUS_EVENTS_MAX);
    const taken = new Set(events.map((r) => r.mid));
    const rest = rodizioPorTipo(rows.filter((r) => !taken.has(r.mid)), inp.hourKey, inp.sends, POOL.PLUS_MAIN - events.length);
    add(events);
    add(rest);
  }
  if (inp.achadoOn) {
    const byA = new Map<string, PoolRow[]>();
    for (const r of inp.achado) if (!seen.has(r.mid)) (byA.get(r.v) ?? byA.set(r.v, []).get(r.v)!).push(r);
    for (const rows of byA.values()) add(rodizioPorTipo(rows, inp.hourKey, inp.sends, rows[0]?.v === 'games' ? POOL.GAMES_ACHADO : POOL.PLUS_ACHADO, { skipOutros: true }));
  }
  return out;
}

/** Mediana por 'loja|tipo' do MENOR preço por master (centavos) e o tamanho da amostra. Só dado real recebido. */
export function medianaPorTipo(rows: ReadonlyArray<{ v: string; name: string; minCents: number }>): Map<string, { median: number; n: number }> {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (r.v === 'games' || !(r.minCents > 0)) continue;
    const k = tipoKey(r.v, classificarTipo(r.v, r.name));
    (by.get(k) ?? by.set(k, []).get(k)!).push(r.minCents);
  }
  const out = new Map<string, { median: number; n: number }>();
  for (const [k, xs] of by) {
    const s = xs.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    out.set(k, { median: s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2), n: s.length });
  }
  return out;
}
