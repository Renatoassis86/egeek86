/**
 * Volume PREVISTO da regra R-44 (elegibilidade pelo menor preço registrado). SOMENTE LEITURA, não envia nem grava.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/medir-volume-minimo.ts
 * Avalia o mesmo pool do ciclo de mensagens duas vezes (GROUP_REGUA_ELEGIVEL_MIN desligada e ligada) e compara os candidatos enviáveis (auto, sem retenção).
 */
import { pickProductIds, detectGroupCandidates } from '../src/server/messaging/group-offers';
import { RULES, RELEASED_VERTICALS } from '../src/lib/messaging/group-rules';

const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n; };

async function rodada(ids: string[], now: Date, ligado: boolean) {
  if (ligado) process.env.GROUP_REGUA_ELEGIVEL_MIN = 'on'; else delete process.env.GROUP_REGUA_ELEGIVEL_MIN;
  const ok = new Map<string, { vertical: string; trigger: string; degrau: number | null; via: boolean; name: string; tv: boolean }>();
  for (let i = 0; i < ids.length; i += 150) {
    const r = await detectGroupCandidates({ now, verticals: [...RELEASED_VERTICALS], productIds: ids.slice(i, i + 150), history: [], includePlatform: false, achado: true, cupom: false });
    for (const c of r.candidates) if (c.sendable && c.status === 'auto' && !c.held && c.trigger !== 'AC') ok.set(c.messageKey, { vertical: c.vertical, trigger: c.trigger, degrau: c.regua?.degrau ?? null, via: c.regua?.viaMinima === true, name: c.name, tv: /(^|[^a-z0-9])(smart ?tv|tv)([^a-z0-9]|$)/i.test(c.name) });
  }
  return ok;
}

async function main() {
  const now = new Date();
  const ids = await pickProductIds({ verticals: [...RELEASED_VERTICALS], now, maxAgeMin: RULES.DETECT_MAX_AGE_MIN, amazonMaxAgeMin: RULES.AMAZON_DETECT_MAX_AGE_MIN, eventWindowHours: 24, maxProducts: 1500, achado: true });
  const antes = await rodada(ids, now, false);
  const depois = await rodada(ids, now, true);
  const novos = [...depois.entries()].filter(([k]) => !antes.has(k));
  const porLoja = (m: Map<string, { vertical: string }>) => { const o: Record<string, number> = {}; for (const v of m.values()) bump(o, v.vertical); return o; };
  const novosLoja: Record<string, number> = {}; const novosTrig: Record<string, number> = {}; let tvs = 0;
  for (const [, v] of novos) { bump(novosLoja, v.vertical); bump(novosTrig, v.trigger); if (v.tv) tvs++; }
  console.log(JSON.stringify({ produtosNoPool: ids.length, enviaveisAntes: antes.size, enviaveisDepois: depois.size, acrescimo: depois.size - antes.size, acrescimoPct: antes.size ? Math.round(((depois.size - antes.size) / antes.size) * 1000) / 10 : null, antesPorLoja: porLoja(antes), depoisPorLoja: porLoja(depois), novosPorLoja: novosLoja, novosPorGatilho: novosTrig, novosQueSaoTV: tvs, amostraNovos: novos.slice(0, 8).map(([, v]) => `${v.vertical}|${v.trigger}|d${v.degrau ?? '-'}|${v.name.slice(0, 50)}`) }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
