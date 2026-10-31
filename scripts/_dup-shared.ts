/**
 * Carga de dados compartilhada por dry-run-dup-report.ts e
 * merge-duplicate-masters.ts. SOMENTE SELECT. Nunca imprime a connection
 * string nem qualquer credencial.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import type { MasterRow } from '../src/lib/affiliate/dedup';

export type Sql = postgres.Sql<{}>;
export type Tx = postgres.TransactionSql<{}>;

export function loadDatabaseUrl(): string {
  let url = process.env.DATABASE_URL ?? '';
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!url && fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('DATABASE_URL=')) {
        url = line.trim().substring('DATABASE_URL='.length).replace(/^["']|["']$/g, '').trim();
        break;
      }
    }
  }
  if (!url) throw new Error('DATABASE_URL não encontrada em .env.local nem no ambiente.');
  let port = '';
  try {
    port = new URL(url).port;
  } catch {
    throw new Error('DATABASE_URL inválida (conteúdo omitido por segurança).');
  }
  if (port !== '6543') {
    throw new Error(`DATABASE_URL deve usar o pooler na porta 6543 (porta atual: ${port || 'padrão'}).`);
  }
  return url;
}

export function connect(): Sql {
  return postgres(loadDatabaseUrl(), { prepare: false, max: 1, idle_timeout: 20 });
}

export interface FkRef {
  table: string;
  column: string;
}

/** Descobre pelo catálogo do Postgres todas as FKs que apontam para master_products(id). */
export async function listMasterFks(tx: Sql | Tx): Promise<FkRef[]> {
  const rows = await tx<{ table: string; column: string }[]>`
    SELECT cl.relname AS "table", att.attname AS "column"
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.master_products'::regclass
      AND ns.nspname = 'public'
    ORDER BY 1, 2`;
  return rows.map((r) => ({ table: r.table, column: r.column }));
}

/** Carrega todos os masters com contagem de ofertas e de snapshots (via oferta). */
export async function loadMasterRows(tx: Sql | Tx): Promise<MasterRow[]> {
  await tx`SET LOCAL statement_timeout = '300s'`;
  const masters = await tx<
    {
      id: string;
      name: string;
      product_type: string;
      game_platform_gen: string;
      game_format: string;
      created_at: Date;
      merged_into: string | null;
    }[]
  >`
    SELECT id, name, product_type::text, game_platform_gen::text, game_format::text, created_at,
           attributes ->> 'mergedInto' AS merged_into
    FROM master_products`;
  const offers = await tx<{ master_product_id: string; total: string; active: string }[]>`
    SELECT master_product_id, count(*) AS total, count(*) FILTER (WHERE status = 'active') AS active
    FROM affiliate_offers GROUP BY master_product_id`;
  const snaps = await tx<{ master_product_id: string; n: string }[]>`
    SELECT o.master_product_id, count(*) AS n
    FROM affiliate_price_snapshots s
    JOIN affiliate_offers o ON o.id = s.offer_id
    GROUP BY o.master_product_id`;

  const offerMap = new Map(offers.map((o) => [o.master_product_id, o]));
  const snapMap = new Map(snaps.map((s) => [s.master_product_id, Number(s.n)]));
  return masters.map((m) => ({
    id: m.id,
    name: m.name,
    productType: m.product_type,
    gamePlatformGen: m.game_platform_gen,
    gameFormat: m.game_format,
    createdAt: m.created_at,
    mergedInto: m.merged_into,
    activeOffers: Number(offerMap.get(m.id)?.active ?? 0),
    totalOffers: Number(offerMap.get(m.id)?.total ?? 0),
    snapshots: snapMap.get(m.id) ?? 0,
  }));
}

/** Conta linhas por master em cada tabela com FK para master_products. */
export async function countFkRows(
  tx: Sql | Tx,
  fks: FkRef[],
  masterIds: string[]
): Promise<Map<string, Map<string, number>>> {
  // tabela.coluna -> (master id -> linhas)
  const out = new Map<string, Map<string, number>>();
  if (masterIds.length === 0) return out;
  for (const fk of fks) {
    const rows = await tx<{ id: string; n: string }[]>`
      SELECT ${tx(fk.column)}::text AS id, count(*) AS n
      FROM ${tx(fk.table)}
      WHERE ${tx(fk.column)} = ANY(${masterIds}::uuid[])
      GROUP BY 1`;
    out.set(`${fk.table}.${fk.column}`, new Map(rows.map((r) => [r.id, Number(r.n)])));
  }
  return out;
}

export function describeBackup(root: string, maxAgeHours: number) {
  const dir = path.join(root, 'backup', 'dados');
  const files = ['master_products', 'affiliate_offers', 'affiliate_price_watches'];
  const info = files.map((f) => {
    const p = path.join(dir, `${f}.ndjson`);
    if (!fs.existsSync(p)) return { file: f, exists: false, ageHours: Infinity, bytes: 0 };
    const st = fs.statSync(p);
    return {
      file: f,
      exists: true,
      ageHours: (Date.now() - st.mtimeMs) / 3_600_000,
      bytes: st.size,
    };
  });
  const ok = info.every((i) => i.exists && i.bytes > 0 && i.ageHours <= maxAgeHours);
  return { dir, info, ok, maxAgeHours };
}

/** Lê os ids de um .ndjson de backup (campo "id"). */
export function readBackupIds(file: string): Set<string> {
  const ids = new Set<string>();
  if (!fs.existsSync(file)) return ids;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as { id?: string };
      if (obj.id) ids.add(obj.id);
    } catch {
      /* linha truncada: ignora */
    }
  }
  return ids;
}

export function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
