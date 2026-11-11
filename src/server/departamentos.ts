import 'server-only';
import { sql } from 'drizzle-orm';
import { isAdminRole } from '@/components/layout/shell-viewer';
import { db } from '@/lib/db';
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
  const rows = await db.execute<{ key: string; enabled: boolean; rules: unknown }>(
    sql`SELECT key, enabled, rules FROM feature_flags WHERE key IN (${sql.join(FLAG_KEYS.map((k) => sql`${k}`), sql`, `)})`
  );
  const flags = new Map<string, FlagRow>(rows.map((r) => [r.key, { key: r.key, enabled: r.enabled, rules: r.rules }]));
  for (const d of DEPARTAMENTOS) {
    const flag = flags.get(d.flag) ?? null;
    // Só conta masters (consulta mais cara) se a flag estiver ligada.
    const n = flag?.enabled ? await contarMastersVisiveis(d.slug) : 0;
    contagens.set(d.slug, n);
    estados.set(d.slug, decidirEstado({ masterEnv, flag, mastersVisiveis: n }));
  }
  return { at: Date.now(), estados, contagens };
}

async function snapshot(): Promise<Snapshot> {
  const agora = Date.now();
  if (store.snap && agora - store.snap.at < CACHE_FLAGS_SEGUNDOS * 1000) return store.snap;
  store.inflight ??= ler()
    .then((s) => (store.snap = s))
    .catch((err) => {
      console.error('[departamentos] falha ao ler flags; mantendo fechado', err);
      const estados = new Map<string, EstadoDepartamento>();
      for (const d of DEPARTAMENTOS) estados.set(d.slug, 'fechado');
      return (store.snap = { at: Date.now(), estados, contagens: new Map() });
    })
    .finally(() => {
      store.inflight = undefined;
    });
  return store.inflight;
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
