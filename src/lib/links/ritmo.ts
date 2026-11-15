// Ritmo global das leituras de página do ML (#119). PURO: o estado vive em UMA linha de collector_runs (job 'auditoria-ritmo'); aqui só se decide.
// Incidente de 2026-11-15: um UPDATE externo gravou o meta como STRING jsonb; `{...meta}` espalhou os caracteres e a linha chegou a 58 MB /
// 3,6 milhões de chaves, derrubando conexões. Por isso: o estado lido é SEMPRE saneado (string vira JSON, só 6 números são aceitos, tamanho
// limitado) e o que se grava é SEMPRE um objeto novo com essas 6 chaves, nunca o meta lido.

export const RITMO_CFG = {
  /** Intervalo global entre leituras de página (rodada 2 do revisor: 2 s ainda levou captcha na 22ª leitura). */
  INTERVALO_MS: 4000,
  /** Teto de leituras por janela de 10 min (todas as fontes somadas). */
  JANELA_MS: 10 * 60_000,
  JANELA_MAX: 120,
  /** Recuo em captcha/429: 15 -> 30 -> 60 min (cresce a cada bloqueio dentro de 6 h do anterior; reinicia depois). */
  RECUOS_MIN: [15, 30, 60],
  REINICIA_RECUO_MS: 6 * 3_600_000,
  /** Meta maior que isto (em caracteres) é lixo: reinicia. */
  META_MAX_CHARS: 2000,
} as const;

export interface EstadoRitmo {
  prox: number;
  bloqueadoAte: number;
  janelaIni: number;
  janelaN: number;
  recuos: number;
  ultimoBloqueio: number;
}

export const ESTADO_ZERO: EstadoRitmo = { prox: 0, bloqueadoAte: 0, janelaIni: 0, janelaN: 0, recuos: 0, ultimoBloqueio: 0 };

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e14 ? Math.floor(v) : 0);

/** Sanea o meta lido do banco: string jsonb vira JSON; array, texto solto ou objeto gigante viram estado zerado; só as 6 chaves numéricas passam. */
export function sanearMeta(raw: unknown, maxChars: number = RITMO_CFG.META_MAX_CHARS): EstadoRitmo {
  let v: unknown = raw;
  if (typeof v === 'string') {
    if (v.length > maxChars) return { ...ESTADO_ZERO };
    try { v = JSON.parse(v); } catch { return { ...ESTADO_ZERO }; }
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...ESTADO_ZERO };
  if (Object.keys(v as object).length > 50) return { ...ESTADO_ZERO }; // objeto gigante: não confia em nada
  const o = v as Record<string, unknown>;
  return { prox: num(o.prox), bloqueadoAte: num(o.bloqueado_ate), janelaIni: num(o.janela_ini), janelaN: num(o.janela_n), recuos: Math.min(num(o.recuos), 99), ultimoBloqueio: num(o.ultimo_bloqueio) };
}

/** Objeto a gravar: só 6 chaves, nunca o meta lido. */
export function metaParaGravar(e: EstadoRitmo): Record<string, number> {
  return { prox: e.prox, bloqueado_ate: e.bloqueadoAte, janela_ini: e.janelaIni, janela_n: e.janelaN, recuos: e.recuos, ultimo_bloqueio: e.ultimoBloqueio };
}

export type Reserva = { ok: true; esperaMs: number; estado: EstadoRitmo } | { ok: false; motivo: 'recuo' | 'teto_da_janela'; ateMs: number; estado: EstadoRitmo };

/** Reserva um slot: respeita recuo, teto por janela de 10 min e intervalo global. */
export function reservar(e: EstadoRitmo, agora: number, cfg = RITMO_CFG): Reserva {
  if (e.bloqueadoAte > agora) return { ok: false, motivo: 'recuo', ateMs: e.bloqueadoAte, estado: e };
  const novaJanela = agora - e.janelaIni >= cfg.JANELA_MS;
  const ini = novaJanela ? agora : e.janelaIni;
  const n = novaJanela ? 0 : e.janelaN;
  if (n >= cfg.JANELA_MAX) return { ok: false, motivo: 'teto_da_janela', ateMs: ini + cfg.JANELA_MS, estado: e };
  const prox = Math.max(e.prox, agora);
  return { ok: true, esperaMs: prox - agora, estado: { ...e, prox: prox + cfg.INTERVALO_MS, janelaIni: ini, janelaN: n + 1 } };
}

/** Captcha/429: calcula o novo estado com recuo crescente. */
export function bloquear(e: EstadoRitmo, agora: number, cfg = RITMO_CFG): EstadoRitmo {
  const seguido = e.ultimoBloqueio > 0 && agora - e.ultimoBloqueio < cfg.REINICIA_RECUO_MS;
  const recuos = seguido ? e.recuos + 1 : 1;
  const min = cfg.RECUOS_MIN[Math.min(recuos, cfg.RECUOS_MIN.length) - 1]!;
  return { ...e, bloqueadoAte: agora + min * 60_000, recuos, ultimoBloqueio: agora };
}
