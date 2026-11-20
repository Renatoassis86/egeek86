// R-111: memo por hora das cotacoes gravadas (puro, testado em scripts/test-health-hourly-memo.ts).
// A tabela de cotacoes so recebe linhas novas, entao a contagem de uma hora FECHADA nao muda. O memo guarda as horas fechadas e a
// consulta le so a cauda (da hora de corte em diante), em vez de contar 8 dias (~3 M de linhas) a cada rodada do collector-health.

export interface HourCount { h: string; n: number }
export interface HourlyMemo { through: string; points: HourCount[] }

const HOUR_MS = 3_600_000;
/** Horas mais novas que `now - MARGEM` nao entram no memo (cotacao gravada com atraso ainda pode cair nelas). */
export const MEMO_MARGEM_HORAS = 1;

export const floorHour = (d: Date): Date => new Date(Math.floor(d.getTime() / HOUR_MS) * HOUR_MS);

/** Instante de corte: horas ANTES dele sao fechadas (memorizaveis); a cauda e lida do corte em diante. */
export function memoCutoff(now: Date): Date {
  return new Date(floorHour(now).getTime() - MEMO_MARGEM_HORAS * HOUR_MS);
}

/** O memo serve se existe, tem corte valido, nao esta no futuro e cobre a janela pedida a partir do corte. */
export function memoUsable(memo: HourlyMemo | null | undefined, now: Date, windowDays: number): memo is HourlyMemo {
  if (!memo || !Array.isArray(memo.points)) return false;
  const through = Date.parse(memo.through);
  if (!Number.isFinite(through)) return false;
  if (through > memoCutoff(now).getTime()) return false;
  // memo velho demais deixaria um buraco entre o corte dele e a cauda: a cauda comeca em `through`, entao qualquer corte passado serve.
  return through >= now.getTime() - windowDays * 24 * HOUR_MS;
}

/** Une memo (horas < through) com a cauda lida (horas >= through), na janela [now - windowDays, now]. Ordenado por hora. */
export function mergeHourly(memo: HourlyMemo, tail: HourCount[], now: Date, windowDays: number): HourCount[] {
  const through = Date.parse(memo.through);
  const minH = floorHour(new Date(now.getTime() - windowDays * 24 * HOUR_MS)).getTime();
  const map = new Map<number, number>();
  for (const p of memo.points) {
    const t = Date.parse(p.h);
    if (t < through && t >= minH) map.set(t, p.n);
  }
  for (const p of tail) {
    const t = Date.parse(p.h);
    if (t >= through && t >= minH) map.set(t, p.n);
  }
  return [...map].sort((a, b) => a[0] - b[0]).map(([t, n]) => ({ h: new Date(t).toISOString(), n }));
}

/** Novo memo a gravar: todas as horas completas anteriores ao corte de `now`. */
export function nextMemo(series: HourCount[], now: Date, windowDays: number): HourlyMemo {
  const cut = memoCutoff(now).getTime();
  const minH = floorHour(new Date(now.getTime() - windowDays * 24 * HOUR_MS)).getTime();
  return { through: new Date(cut).toISOString(), points: series.filter((p) => Date.parse(p.h) < cut && Date.parse(p.h) >= minH) };
}
