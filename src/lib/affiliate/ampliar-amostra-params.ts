/**
 * Parametros e paginacao da ampliacao de amostra Shopee (funcoes PURAS, sem banco/rede; testadas em
 * scripts/test-ampliar-amostra-params.ts). Usadas pela rota /api/cron/ampliar-amostra-shopee e pela lib
 * src/server/collector/ampliar-amostra-shopee.ts.
 */
export const VERTICAIS_ALVO = ['eletrodomesticos', 'eletroeletronicos', 'esporte', 'impressao3d', 'livros', 'tecnologia'] as const;
export type VerticalAlvo = (typeof VERTICAIS_ALVO)[number];

/** Limites da ROTA (2026-11-11, fase de formacao: maxDuration 300 s e orcamento de 240 s; o espacamento da Shopee e ~480 ms por chamada, entao cabem ~500 chamadas; antes 60 s/~100). O teto HORARIO abaixo continua o freio de quota. */
export const ROTA_LIMITE_MASTERS_PADRAO = 30;
export const ROTA_LIMITE_MASTERS_MAX = 80;
export const ROTA_MAX_CALLS_PADRAO = 200;
export const ROTA_MAX_CALLS_MAX = 450;
/** Teto de chamadas por hora deste job (o limite oficial e 8000/h somados a todos os coletores). */
export const TETO_HORARIO_PADRAO = 3000;

export interface ParametrosRota {
  verticals: VerticalAlvo[];
  limitMasters: number;
  offset: number;
  maxCalls: number;
  apply: boolean;
  /** run_id (collector_runs.id) a desfazer; quando presente a rota faz rollback em vez de coletar. */
  rollback: string | null;
}

function inteiro(raw: string | null, padrao: number, min: number, max: number): number | { erro: string } {
  if (raw == null || raw.trim() === '') return padrao;
  if (!/^\d+$/.test(raw.trim())) return { erro: 'numero_invalido' };
  const n = Number(raw.trim());
  return Math.min(max, Math.max(min, n));
}

/** Le os parametros da query. `vertical` e obrigatorio (exceto em rollback). Valores numericos fora do intervalo sao limitados. */
export function parseParametrosRota(get: (nome: string) => string | null): { ok: true; params: ParametrosRota } | { ok: false; erro: string } {
  const rollbackRaw = get('rollback');
  if (rollbackRaw != null && rollbackRaw !== '' && !/^\d{1,18}$/.test(rollbackRaw.trim())) return { ok: false, erro: 'rollback_invalido' };
  const rollback = rollbackRaw && rollbackRaw.trim() ? rollbackRaw.trim() : null;

  const vRaw = (get('vertical') ?? '').trim();
  let verticals: VerticalAlvo[] = [];
  if (vRaw) {
    for (const v of vRaw.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!(VERTICAIS_ALVO as readonly string[]).includes(v)) return { ok: false, erro: `vertical_invalida:${v}` };
      if (!verticals.includes(v as VerticalAlvo)) verticals.push(v as VerticalAlvo);
    }
  }
  if (!rollback && verticals.length === 0) return { ok: false, erro: 'vertical_obrigatoria' };

  const lm = inteiro(get('limitMasters'), ROTA_LIMITE_MASTERS_PADRAO, 1, ROTA_LIMITE_MASTERS_MAX);
  const off = inteiro(get('offset'), 0, 0, 1_000_000);
  const mc = inteiro(get('maxCalls'), ROTA_MAX_CALLS_PADRAO, 1, ROTA_MAX_CALLS_MAX);
  for (const [nome, v] of [['limitMasters', lm], ['offset', off], ['maxCalls', mc]] as const) {
    if (typeof v === 'object') return { ok: false, erro: `${nome}_invalido` };
  }
  return {
    ok: true,
    params: {
      verticals,
      limitMasters: lm as number,
      offset: off as number,
      maxCalls: mc as number,
      apply: get('apply') === '1',
      rollback,
    },
  };
}

/**
 * Proximo offset para paginar por lotes. `consumidos` = masters da lista elegivel (fatiada em `offset`) ja concluidos nesta
 * rodada; `saturados` = masters que, por terem ganho ofertas nesta rodada (so em apply), deixaram a lista elegivel (chegaram
 * ao maximo por master) e portanto deslocam a lista para tras. Devolve null quando a lista acabou.
 */
export function proximoOffset(offset: number, consumidos: number, saturados: number, totalElegiveis: number): number | null {
  const restantes = totalElegiveis - saturados;
  const prox = offset + consumidos - saturados;
  return prox >= restantes ? null : Math.max(0, prox);
}
