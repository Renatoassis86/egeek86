import 'server-only';
import { sql } from 'drizzle-orm';
import { isAdminRole } from '@/components/layout/shell-viewer';
import { db } from '@/lib/db';
import { withTimeout, detach } from '@/lib/cache/swr';
import { createPersistedQuery } from '@/lib/cache/server-cache';
import {
  CACHE_FLAGS_SEGUNDOS,
  DEPARTAMENTOS,
  FLAG_KEYS,
  decidirEstado,
  travaMestraLigada,
  departamentoPorSlug,
  estadoPermiteVer,
  type Departamento,
  type EstadoDepartamento,
  type FlagRow,
} from '@/lib/catalog/departamentos';
import { contarMastersVisiveis } from '@/server/queries/departamento';

/**
 * Contagem de masters visíveis por departamento: consulta pesada (0,8 a 2 s cada, até 140 s sob carga; `live_networks`),
 * que ANTES rodava em série e sem teto dentro do layout de toda página da loja (causa do incidente de 2026-11-13: home
 * em 30 s). Agora é snapshot persistido (cron + write-through): a página lê 1 linha; vencido serve o último valor real
 * e UMA instância recalcula por trás. Contagem é dado real, nunca inventado.
 */
export const mastersVisiveisCached = createPersistedQuery(
  async (slug: string) => contarMastersVisiveis(slug),
  ['dept-masters-visiveis-v1'],
  { revalidate: 300, maxStaleSeconds: 24 * 3600, coldTimeoutSeconds: 5, persist: { maxAgeSeconds: 1800, maxStaleSeconds: 24 * 3600 } }
);

/** Tempo máximo para a leitura das flags (1 consulta curta) na renderização da página. */
const FLAGS_READ_MS = 4_000;
/** Estado anterior só vale como reserva durante falha de leitura por este tempo; depois disso, fechado. */
const STALE_STATE_MAX_MS = 5 * 60_000;

/**
 * Leitura do estado dos departamentos (flag no banco + trava mestra MERCADO_UI + mínimo de masters),
 * com cache em memória curto (<= 60 s). Falha de leitura => FECHADO (nunca abre por erro).
 */
interface Snapshot {
  at: number;
  estados: Map<string, EstadoDepartamento>;
  contagens: Map<string, number>;
}
const G = globalThis as unknown as { __egeekDept?: { snap?: Snapshot; inflight?: Promise<Snapshot> } };
const store = (G.__egeekDept ??= {});

async function ler(): Promise<Snapshot> {
  const masterEnv = process.env.MERCADO_UI;
  const estados = new Map<string, EstadoDepartamento>();
  const contagens = new Map<string, number>();
  if (!travaMestraLigada(masterEnv)) {
    // Trava mestra desligada: nem toca no banco.
    for (const d of DEPARTAMENTOS) estados.set(d.slug, 'fechado');
    return { at: Date.now(), estados, contagens };
  }
  const rows = await withTimeout(
    db.execute<{ key: string; enabled: boolean; rules: unknown }>(
      sql`SELECT key, enabled, rules FROM feature_flags WHERE key IN (${sql.join(FLAG_KEYS.map((k) => sql`${k}`), sql`, `)})`
    ),
    FLAGS_READ_MS,
    'feature_flags'
  );
  const flags = new Map<string, FlagRow>(rows.map((r) => [r.key, { key: r.key, enabled: r.enabled, rules: r.rules }]));
  await Promise.all(
    DEPARTAMENTOS.map(async (d) => {
      const flag = flags.get(d.flag) ?? null;
      // Só conta masters (consulta mais cara) se a flag estiver ligada; a contagem vem do snapshot persistido.
      // Contagem indisponível (sem snapshot e consulta lenta) => 0 => fechado para este departamento (nunca abre por erro).
      const n = flag?.enabled ? await mastersVisiveisCached(d.slug).catch(() => 0) : 0;
      contagens.set(d.slug, n);
      estados.set(d.slug, decidirEstado({ masterEnv, flag, mastersVisiveis: n }));
    })
  );
  return { at: Date.now(), estados, contagens };
}

function fechadoTudo(): Snapshot {
  const estados = new Map<string, EstadoDepartamento>();
  for (const d of DEPARTAMENTOS) estados.set(d.slug, 'fechado');
  return { at: Date.now(), estados, contagens: new Map() };
}

function recarregar(): Promise<Snapshot> {
  store.inflight ??= ler()
    .then((s) => (store.snap = s))
    .catch((err) => {
      const prev = store.snap;
      // Falha de leitura: reserva curta com o último estado real; passou disso, fechado (nunca abre por erro).
      if (prev && Date.now() - prev.at < STALE_STATE_MAX_MS) {
        console.error('[departamentos] falha ao ler flags; mantendo o último estado por até 5 min', err);
        return prev;
      }
      console.error('[departamentos] falha ao ler flags; mantendo fechado', err);
      return (store.snap = fechadoTudo());
    })
    .finally(() => {
      store.inflight = undefined;
    });
  return store.inflight;
}

async function snapshot(): Promise<Snapshot> {
  const agora = Date.now();
  if (store.snap && agora - store.snap.at < CACHE_FLAGS_SEGUNDOS * 1000) return store.snap;
  // Stale-while-revalidate: com leitura anterior, a página recebe o estado na hora e a releitura corre por trás
  // (o layout de TODA página da loja passa aqui; nunca pode esperar o banco).
  if (store.snap) {
    detach(recarregar());
    return store.snap;
  }
  return recarregar();
}

export async function estadoDoDepartamento(slug: string): Promise<EstadoDepartamento> {
  if (!departamentoPorSlug(slug)) return 'fechado';
  return (await snapshot()).estados.get(slug) ?? 'fechado';
}

/** Departamentos que o espectador pode ver agora (menu, rotas, /go). */
export async function departamentosVisiveis(ehAdmin: boolean): Promise<Departamento[]> {
  const s = await snapshot();
  return DEPARTAMENTOS.filter((d) => estadoPermiteVer(s.estados.get(d.slug) ?? 'fechado', ehAdmin));
}

export interface ResumoDepartamento {
  slug: string;
  estado: EstadoDepartamento;
  /** Produtos aprovados com oferta clicável (0 quando a flag está desligada: a contagem nem é feita). */
  produtos: number;
}

/** Estado e contagem de todos os departamentos (vitrine Plus). Falha de leitura => tudo fechado, sem contagem. */
export async function resumoDepartamentos(): Promise<ResumoDepartamento[]> {
  const s = await snapshot();
  return DEPARTAMENTOS.map((d) => ({
    slug: d.slug,
    estado: s.estados.get(d.slug) ?? 'fechado',
    produtos: s.contagens.get(d.slug) ?? 0,
  }));
}

export async function departamentoVisivel(slug: string, ehAdmin: boolean): Promise<Departamento | null> {
  const d = departamentoPorSlug(slug);
  if (!d) return null;
  return estadoPermiteVer(await estadoDoDepartamento(slug), ehAdmin) ? d : null;
}

/** Só para testes: zera o cache. */
export function _limparCacheDepartamentos() {
  store.snap = undefined;
}

/** /go: o departamento (vertical da oferta) está liberado para este visitante? Games nunca passa por aqui. */
export async function departamentoLiberadoParaGo(vertical: string): Promise<boolean> {
  if (!departamentoPorSlug(vertical)) return false;
  const estado = await estadoDoDepartamento(vertical);
  if (estado === 'publico') return true;
  if (estado === 'admin') return viewerEhAdmin();
  return false;
}

export async function viewerEhAdmin(): Promise<boolean> {
  // Import tardio: auth/sessão só é carregada quando o estado "só admin" exige (e mantém este módulo testável em Node puro).
  const { getCurrentProfile } = await import('@/lib/auth/require-admin');
  const p = await getCurrentProfile();
  return isAdminRole(p?.role);
}
