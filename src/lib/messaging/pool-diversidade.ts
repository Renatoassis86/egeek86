// Seleção PURA do pool de produtos avaliados a cada ciclo, com rodízio por TIPO (ata 2026-11-12-diversidade-fluxo-plus).
// Sem banco, sem relógio, sem aleatoriedade: o mesmo dia/hora e a mesma entrada dão a mesma saída (hash determinístico).
// Antes: cota por loja ordenada por "razão de entrada" e hash horário, então um tipo com muitos produtos (123 air fryers) ocupava o pool.
// Agora: cada tipo da loja recebe um turno por rodada (tipos menos enviados nas últimas 24 h primeiro), e produtos que nunca têm razão
// de entrada por média/movimento (1 vendedor) entram pelo grupo ACHADO.

import { classificarTipo, TIPO_OUTROS } from '@/lib/catalog/tipos-produto';
import { ehMarcaPreferida, normalizaNome } from '@/lib/messaging/cota-item';
import { marcaDoItem } from '@/lib/messaging/marcas-lojas';
import { naoOfertavel } from '@/lib/catalog/nao-ofertavel';

/**
 * Ordem de MARCA dentro do tipo (dono, 2026-11-18: "destaque as principais marcas do mercado", exceto games; as 5 marcas da Beleza primeiro): 0 = marca preferida do dono,
 * 1 = principal marca da loja, 2 = as demais (e todo item de games). Só ORDEM: nenhum produto sai do pool por isso.
 */
export function marcaRank(vertical: string, name: string): number {
  if (vertical === 'games') return 2;
  if (ehMarcaPreferida(vertical, name)) return 0;
  return marcaDoItem(vertical, normalizaNome(name)) ? 1 : 2;
}

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

/**
 * Cotas do pool, IGUAIS para toda loja (dono, 2026-11-17: "todas tem o mesmo poder de enviar"; "exatamente o mesmo fluxo para todos os canais existentes e os que vamos criar").
 * Loja nova herda estas cotas sem código: a seleção itera sobre as verticais que aparecem nos dados.
 * Cada loja: POR_LOJA produtos principais = até EVENTOS_MAX de eventos/movimento (r = 1) + prioridade (menor razão primeiro, rodízio de tipo) + ROTACAO_PCT de rotação pura
 * (ignora a razão: percorre o conjunto inteiro, para ninguém ficar fora do ciclo), mais ACHADO_POR_LOJA para o aviso de monitoramento e CUPOM_POR_LOJA.
 */
const envInt = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isInteger(n) && n > 0 && n <= 1000 ? n : d; };
export const POOL = {
  POR_LOJA: envInt('POOL_POR_LOJA', 150),
  /** Dos POR_LOJA, até isto vem direto de eventos/movimento (r = 1) para não perder queda real de preço. */
  EVENTOS_MAX: 30,
  /** Parte do POR_LOJA reservada à rotação pura (percentual). */
  ROTACAO_PCT: 35,
  /** Produtos extras por loja para o aviso de monitoramento (ACHADO). */
  ACHADO_POR_LOJA: envInt('POOL_ACHADO_POR_LOJA', 40),
  /** Produtos com cupom valido na agulha, por loja. Entram ANTES dos demais, por rodizio de tipo; o excedente cai na fila normal. */
  CUPOM_POR_LOJA: 40,
} as const;

/** FNV-1a 32 bits: ordem estável por hora, sem Math.random. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 2026-11-17: mistura final (fmix32). FNV-1a sozinho correlacionava as ordens de chaves que diferem só nos últimos caracteres (hora:minuto), e o rodízio por minuto
  // repetia quase os mesmos produtos (161 de 600 em 60 ciclos). Com a mistura, a união cobre ~570 de 600.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
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
    if (naoOfertavel(row.v, row.name)) continue; // R-108: armaria (Esporte) e equipamento de restaurante (Casa) nunca entram no pool
    const tipo = row.grupo ?? classificarTipo(row.v, row.name);
    if (opts.skipOutros && tipo === TIPO_OUTROS && !row.grupo) continue;
    const k = tipoKey(row.v, tipo);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(row);
  }
  const order = [...groups.keys()].sort((a, b) => (sends[a] ?? 0) - (sends[b] ?? 0) || hash32(a + hourKey) - hash32(b + hourKey) || a.localeCompare(b));
  const lists = order.map((k) => (groups.get(k) as PoolRow[]).slice().sort((x, y) => marcaRank(x.v, x.name) - marcaRank(y.v, y.name) || x.r - y.r || hash32(x.mid + hourKey) - hash32(y.mid + hourKey) || x.mid.localeCompare(y.mid)));
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

/**
 * Seleção final, sem duplicata, IGUAL para toda loja. Por loja: cupom, eventos, prioridade com rodízio de tipo, rotação pura e achado. As listas das lojas são
 * intercaladas uma a uma (ordem das lojas sorteada pelo ciclo), então qualquer corte posterior no total tira o mesmo de cada loja: nenhuma depende da outra.
 */
export function selecionarPool(inp: PoolInput): string[] {
  const porLoja = new Map<string, string[]>();
  const seen = new Set<string>();
  const lista = (v: string) => porLoja.get(v) ?? porLoja.set(v, []).get(v)!;
  const add = (v: string, rows: readonly PoolRow[]) => {
    for (const r of rows) if (!seen.has(r.mid)) (seen.add(r.mid), lista(v).push(r.mid));
  };
  const by = (src: readonly PoolRow[]) => {
    const m = new Map<string, PoolRow[]>();
    for (const r of src) (m.get(r.v) ?? m.set(r.v, []).get(r.v)!).push(r);
    return m;
  };
  // Cupom primeiro: o agente de cupons deve sempre ter um cupom testado na fila.
  for (const [v, rows] of by(inp.cupom ?? [])) add(v, rodizioPorTipo(rows, inp.hourKey, inp.sends, POOL.CUPOM_POR_LOJA));
  const rotQuota = Math.floor((POOL.POR_LOJA * POOL.ROTACAO_PCT) / 100);
  for (const [v, rows] of by(inp.main)) {
    const events = rodizioPorTipo(rows.filter((r) => r.r <= 1), inp.hourKey, inp.sends, POOL.EVENTOS_MAX);
    add(v, events);
    const taken = new Set(events.map((r) => r.mid));
    const resto = rows.filter((r) => !taken.has(r.mid));
    add(v, rodizioPorTipo(resto, inp.hourKey, inp.sends, POOL.POR_LOJA - events.length - rotQuota));
    // Rotação pura: a razão não conta; só o rodízio de tipo e o hash do ciclo. Percorre o conjunto inteiro em poucos ciclos.
    add(v, rodizioPorTipo(resto.map((r) => ({ ...r, r: 0 })).filter((r) => !seen.has(r.mid)), inp.hourKey + '#rot', inp.sends, rotQuota));
  }
  if (inp.achadoOn) {
    for (const [v, rows] of by(inp.achado)) add(v, rodizioPorTipo(rows.filter((r) => !seen.has(r.mid)), inp.hourKey, inp.sends, POOL.ACHADO_POR_LOJA, { skipOutros: true }));
  }
  const ordem = [...porLoja.keys()].sort((a, b) => hash32(a + inp.hourKey) - hash32(b + inp.hourKey) || a.localeCompare(b));
  const out: string[] = [];
  for (let i = 0; ; i++) {
    let took = false;
    for (const v of ordem) { const l = porLoja.get(v)!; if (i < l.length) { out.push(l[i]); took = true; } }
    if (!took) break;
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

/**
 * Rodizio de lojas na DETECCAO (2026-11-18, banco lento): cada ciclo avalia so `porCiclo` lojas consecutivas (comeco = minuto % total), então a consulta pesada do pool
 * custa ~porCiclo/total e todas as lojas passam por ela a cada `total/porCiclo` minutos. porCiclo <= 0 ou >= total = todas (comportamento de antes).
 */
export function lojasDaRodada(todas: readonly string[], now: Date, porCiclo: number): string[] {
  const n = todas.length;
  if (!n || !(porCiclo > 0) || porCiclo >= n) return [...todas];
  const ini = Math.floor(now.getTime() / 60_000) % n;
  return Array.from({ length: porCiclo }, (_, i) => todas[(ini + i) % n]);
}
