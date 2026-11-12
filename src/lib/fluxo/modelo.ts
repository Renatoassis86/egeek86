// Modulo PURO (sem banco, sem server-only) do /admin/fluxo: tipos, cadencias esperadas, saude dos nos e leitura da fila de execucao.
// Cadencias vem de vercel.json e de src/lib/collector-runs/slo.ts (dados reais de configuracao, nao medicao).

export type Saude = 'ok' | 'atencao' | 'critico' | 'sem_dado';

export interface JobRow {
  job: string;
  network: string | null;
  lastStartedAt: string | null;
  lastOkAt: string | null;
  lastStatus: string | null;
  lastDurationMs: number | null;
  checked: number | null;
  errors: number | null;
  rateLimited: number | null;
  budgetExhausted: boolean | null;
  stoppedBecause: string | null;
  oldestDueAgeS: number | null;
  runs24h: number;
  errors24h: number;
  runningStale: number;
}

export interface JobEsperado {
  /** Prefixo do job em collector_runs (casa 'collect-vertical:livros' com 'collect-vertical:'). */
  chave: string;
  rotulo: string;
  /** Cadencia esperada em minutos; null = sem cadencia definida (aparece, mas nao pontua atraso). */
  cadenciaMin: number | null;
  no: NoId;
  /** Opcional = depende de flag/loop que pode estar desligado de proposito: ausencia vira "sem dado", nunca vermelho. */
  opcional?: boolean;
}

export type NoId =
  | 'extracao-ml' | 'extracao-shopee' | 'extracao-amazon' | 'extracao-plus' | 'cupons'
  | 'banco' | 'catalogo' | 'preco' | 'mensagens' | 'front';

export const JOBS_ESPERADOS: JobEsperado[] = [
  { chave: 'collect-prices', rotulo: 'Coleta Mercado Livre', cadenciaMin: 5, no: 'extracao-ml' },
  { chave: 'ml-links-assistida', rotulo: 'Links meli.la (aba assistida)', cadenciaMin: null, no: 'extracao-ml' },
  { chave: 'collect-shopee', rotulo: 'Coleta Shopee', cadenciaMin: 5, no: 'extracao-shopee' },
  { chave: 'amazon-assistida', rotulo: 'Amazon assistida (aba logada)', cadenciaMin: 120, no: 'extracao-amazon' },
  { chave: 'amazon-vitrine', rotulo: 'Amazon vitrine por loja', cadenciaMin: null, no: 'extracao-amazon' },
  ...['tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte', 'impressao3d'].map((v) => ({
    chave: `collect-vertical:${v}`, rotulo: `Plus: ${v}`, cadenciaMin: 15, no: 'extracao-plus' as NoId,
  })),
  { chave: 'discover-products', rotulo: 'Descoberta ML', cadenciaMin: 60, no: 'catalogo' },
  { chave: 'semear-vertical', rotulo: 'Semeadura Plus', cadenciaMin: 20, no: 'catalogo' },
  { chave: 'fila-api-oficial-ml', rotulo: 'Fila API oficial ML', cadenciaMin: 20, no: 'catalogo' },
  { chave: 'refresh-snapshots:stats', rotulo: 'Estatistica de preco (V1)', cadenciaMin: 30, no: 'preco' },
  { chave: 'refresh-snapshots:daily', rotulo: 'Base oferta-dia (V2)', cadenciaMin: 30, no: 'preco', opcional: true },
  { chave: 'refresh-snapshots:showcase', rotulo: 'Vitrine (showcase)', cadenciaMin: 15, no: 'front' },
  { chave: 'refresh-snapshots:inventory', rotulo: 'Inventario do catalogo', cadenciaMin: 60, no: 'front' },
  { chave: 'cupons-batimento', rotulo: 'Cupons: batimento do loop 24 h', cadenciaMin: 60, no: 'cupons' },
  { chave: 'cupons-assistida', rotulo: 'Cupons: leitura assistida', cadenciaMin: null, no: 'cupons' },
  { chave: 'agente-cupons', rotulo: 'Agente de cupons', cadenciaMin: null, no: 'cupons' },
];

export function acharEsperado(job: string): JobEsperado | undefined {
  return JOBS_ESPERADOS.find((e) => job === e.chave) ?? JOBS_ESPERADOS.find((e) => job.startsWith(e.chave));
}

const MIN = 60_000;

/** Verde: terminou ok/partial dentro de 1,25x a cadencia (+2 min de folga do cron). Ambar: ate 2x. Vermelho: acima de 2x ou ultima execucao em erro. */
export function saudeDoJob(r: Pick<JobRow, 'lastOkAt' | 'lastStatus' | 'runningStale'>, cadenciaMin: number | null, agora: number): { saude: Saude; motivo: string } {
  if (r.lastStatus === 'error') return { saude: 'critico', motivo: 'ultima execucao terminou em erro' };
  if (cadenciaMin == null) return { saude: r.lastOkAt ? 'ok' : 'sem_dado', motivo: r.lastOkAt ? 'sem cadencia definida; ultima execucao ok' : 'sem execucao ok nas ultimas 24 h' };
  if (!r.lastOkAt) return { saude: 'critico', motivo: 'nenhuma execucao ok nas ultimas 24 h' };
  const idade = (agora - new Date(r.lastOkAt).getTime()) / MIN;
  if (idade <= cadenciaMin * 1.25 + 2) return { saude: 'ok', motivo: `ok ha ${fmtMin(idade)} (cadencia ${cadenciaMin} min)` };
  if (idade <= cadenciaMin * 2 + 2) return { saude: 'atencao', motivo: `atrasado: ok ha ${fmtMin(idade)} (cadencia ${cadenciaMin} min)` };
  return { saude: 'critico', motivo: `muito atrasado: ok ha ${fmtMin(idade)} (cadencia ${cadenciaMin} min)` };
}

export function pior(a: Saude, b: Saude): Saude {
  const ordem: Saude[] = ['ok', 'sem_dado', 'atencao', 'critico'];
  return ordem.indexOf(a) >= ordem.indexOf(b) ? a : b;
}

export function fmtMin(m: number): string {
  if (m < 1) return 'menos de 1 min';
  if (m < 120) return `${Math.round(m)} min`;
  if (m < 48 * 60) return `${(m / 60).toFixed(1).replace('.', ',')} h`;
  return `${Math.round(m / 1440)} d`;
}

export interface LinhaFila { numero: string; prio: string; tarefa: string; dono: string; estado: string; criterio: string }

const limpa = (s: string) => s.replace(/\*\*/g, '').replace(/`/g, '').trim();

/** Le a tabela da fila viva (docs/fila-de-execucao.md). Devolve [] se nao achar o cabecalho esperado. */
export function parseFilaExecucao(md: string): LinhaFila[] {
  const linhas = md.split(/\r?\n/);
  const ini = linhas.findIndex((l) => /^\|\s*#\s*\|\s*Prio/i.test(l));
  if (ini < 0) return [];
  const out: LinhaFila[] = [];
  for (let i = ini + 2; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (!l.startsWith('|')) break;
    const c = l.replace(/^\||\|$/g, '').split('|').map(limpa);
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;
    out.push({ numero: c[0], prio: c[1], tarefa: c[2], dono: c[3], estado: c[4], criterio: c[5] ?? '' });
  }
  return out;
}

export interface Bloco<T> { ok: boolean; erro?: string; dados: T | null }

export interface FluxoSnapshot {
  geradoEm: string;
  jobs: Bloco<{ linhas: JobRow[]; totalRuns24h: number; ultimoRegistroEm: string | null }>;
  mensagens: Bloco<{ porStatus: { status: string; n: number; maisAntigoEm: string | null }[]; enviandoPresos: number; ultimaCriadaEm: string | null }>;
  classificacao: Bloco<{ pendentes: number; adiadas: number; maisAntigaEm: string | null }>;
  ofertas: Bloco<{
    mlLinksPendentes: number; mlAtivas: number; rascunhos: number;
    amazonAtivas: number; amazonFrescas40: number; amazonUltimaConfirmacaoEm: string | null;
  }>;
  idleTx: Bloco<{ n: number; maisLongaS: number | null }>;
  snapshots: Bloco<{ statsEm: string | null; showcaseMaisAntigoEm: string | null; showcaseMaisRecenteEm: string | null }>;
  plataformaDesconhecida: Bloco<{ n: number }>;
  fila: { ok: boolean; erro?: string; linhas: LinhaFila[] };
}
