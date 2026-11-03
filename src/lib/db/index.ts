import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import net from 'node:net';
import { currentPoolKind, type PoolKind } from '@/lib/db/pool-context';
import * as schema from '@/db/schema';

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

// Achado real (2026-07-25): em produção (Vercel), cada instância serverless
// morna mantém seu próprio pool — com N instâncias concorrentes, o total de
// conexões é N × max. Na porta 5432 (pooler de SESSÃO do Supabase) o projeto
// inteiro tem um teto FIXO de 15 conexões simultâneas, não importa o quanto
// max seja reduzido por instância: um pico de tráfego com só 8 instâncias
// mornas e max:2 já bate no teto (16 > 15) e vira EMAXCONNSESSION,
// derrubando a Home pra todo mundo (504). Reduzir max de 10 pra 2 (commit
// afe0d99) foi um paliativo, não resolve — só atrasa o estouro.
// A correção de verdade é usar o pooler de TRANSAÇÃO do Supabase (porta
// 6543): ele multiplexa muito mais conexões de cliente sobre poucas
// conexões reais do Postgres, então não tem esse teto baixo. Detectamos
// isso pela própria connection string pra nunca mais regredir sem querer:
// com 5432 (ainda não migrado), max fica baixo e seguro; assim que
// DATABASE_URL apontar pro pooler de transação, max sobe sozinho, sem
// precisar de outro deploy.
const isTransactionPooler = connectionString.includes(':6543');

if (!isTransactionPooler) {
  console.error(
    '[db] DATABASE_URL não está apontando pro Transaction Pooler do Supabase (porta 6543) — ' +
      'está usando o pooler de sessão (5432), que tem teto de 15 conexões no projeto inteiro. ' +
      'Sob tráfego concorrente na Vercel isso estoura (EMAXCONNSESSION) e derruba a Home. ' +
      'Troque a env var DATABASE_URL na Vercel pela connection string "Transaction" do Supabase ' +
      '(Project Settings → Database → Connection Pooling → Transaction, porta 6543) — ' +
      'mantenha DIRECT_URL apontando pra 5432, só as migrações usam essa.'
  );
}

// prepare:false é OBRIGATÓRIO com o pooler de transação — em modo
// transaction o pgbouncer pode rotear cada query pra uma conexão real
// diferente por baixo, então um prepared statement de uma query anterior
// não existe mais na conexão que atende a próxima; sem prepare:false isso
// falha e cancela a query quase instantaneamente (foi o sintoma exato de
// uma tentativa anterior de usar a porta 6543 sem esse ajuste).
//
// Saúde das conexões (P0 2026-11-02): o pooler do Supabase derruba conexões
// ociosas/velhas (ECONNRESET) e uma conexão "meio morta" chegou a segurar um
// `count(*)` por ~8,5 h. Então:
//  - idle_timeout 20 s: o cliente fecha antes do pooler;
//  - max_lifetime 10 min (com jitter do próprio driver): nenhuma conexão vive o bastante para ficar velha;
//  - keep_alive 30 s: TCP keep-alive detecta conexão morta em vez de esperar para sempre;
//  - connection.application_name: aparece no pg_stat_activity para diagnóstico;
//  - o driver descarta a conexão que falha e abre outra na consulta seguinte; as
//    consultas de vitrine repetem uma vez em erro transitório (src/lib/cache/swr.ts).
// Pools RECICLÁVEIS e separados (P0 2026-11-03). Causa raiz medida:
//  - postgres.js com prepare:false + parâmetros fala o protocolo estendido em 3 etapas (Parse+Describe+Flush,
//    Bind+Execute, Sync após CommandComplete). No modo transação do Supavisor o backend fica 'active/ClientRead'
//    entre as etapas; sob rajada, uma etapa que não chega deixa a consulta sem resposta e o backend preso
//    (reproduzido: 14 de 16 visitas da rajada >25 s; pg_stat_activity com backend 'active' em ClientRead por
//    horas, só liberado quando o socket do cliente morre).
//  - O Supavisor ignora parâmetros de sessão do startup (statement_timeout e application_name: `show
//    statement_timeout` segue em 2 min), então o servidor não derruba a consulta; e o `withTimeout` da
//    aplicação só abandonava a ESPERA, deixando a conexão presa ocupada (e as seguintes na fila do driver).
//  - Correção: (1) socket com timeout de inatividade (destrói a conexão presa em qualquer consulta);
//    (2) `recycleDbPool()` troca o pool e destrói o antigo quando uma consulta estoura o tempo;
//    (3) pools 'live' (leitura da página) e 'bg' (recálculo pesado do SWR) separados, para uma consulta pesada
//    legítima não segurar as conexões das leituras curtas; (4) singleton em globalThis em QUALQUER ambiente
//    (antes só em dev: em produção cada cópia do módulo no bundle abriria o seu próprio pool).
type Sql = ReturnType<typeof postgres>;

/** Silêncio máximo do socket com consulta pendente. Estourou: o socket é destruído (CONNECTION_CLOSED → o chamador repete em conexão nova). */
const SOCKET_IDLE_MS: Record<PoolKind, number> = { live: 30_000, bg: 100_000 };

/**
 * Socket próprio com timeout de inatividade (o driver não tem query_timeout): descarta de verdade a conexão
 * "meio morta" (rede doméstica Windows/pooler que parou de responder), em TODAS as consultas, inclusive as
 * que não passam por withTimeout. Sockets ociosos do pool já são fechados pelo idle_timeout (20 s).
 * Só vale para conexão sem TLS (o Supavisor do projeto aceita); com sslmode a URL usa o socket padrão.
 */
function stuckAwareSocket(kind: PoolKind) {
  return (o: { host: string[]; port: number[] }): Promise<net.Socket> => connectSocket(o, SOCKET_IDLE_MS[kind]);
}

function connectSocket(o: { host: string[]; port: number[] }, idleMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: o.host[0], port: o.port[0] });
    s.setNoDelay(true);
    s.setTimeout(idleMs, () => {
      s.destroy(Object.assign(new Error(`socket sem resposta em ${idleMs} ms`), { code: 'SOCKET_TIMEOUT' }));
    });
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
}


function createClient(kind: PoolKind): Sql {
  const max = MAX_BY_KIND[kind];
  const useCustomSocket = !/[?&]sslmode=(require|verify)/.test(connectionString);
  const client = postgres(connectionString, {
    ...(useCustomSocket ? { socket: stuckAwareSocket(kind) as never } : {}),
    prepare: false,
    // Transaction pooler: poucas conexões por processo (cada instância serverless abre o seu pool; N × max).
    max: isTransactionPooler ? max : Math.min(max, 2),
    idle_timeout: 20,
    max_lifetime: 60 * 10,
    keep_alive: 15,
    connect_timeout: 10,
    connection: { application_name: 'egeek-web' },
    onnotice: () => {},
  });
  // Mesmos parsers/serializers que o drizzle aplica ao 1º cliente (datas como string): o pool novo precisa igual.
  const passthrough = (val: unknown) => val;
  for (const type of ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231']) {
    client.options.parsers[type as unknown as number] = passthrough as never;
    client.options.serializers[type as unknown as number] = passthrough as never;
  }
  client.options.serializers[114] = passthrough as never;
  client.options.serializers[3802] = passthrough as never;
  return client;
}

// Conexões por pool. Na Vercel cada instância serverless abre o seu próprio conjunto: fica menor.
const onVercel = !!process.env.VERCEL;
const MAX_BY_KIND: Record<PoolKind, number> = {
  live: Number(process.env.DB_POOL_LIVE ?? (onVercel ? 3 : 4)),
  bg: Number(process.env.DB_POOL_BG ?? (onVercel ? 3 : 7)),
};

interface PoolSlot {
  current: Sql;
  recycledAt: number;
  recycles: number;
}
interface DbHolder {
  live: PoolSlot;
  bg: PoolSlot;
}
const globalForDb = globalThis as unknown as { __egeekDb2?: DbHolder };
// postgres.js conecta sob demanda: o pool que não é usado não abre conexão nenhuma.
const holder: DbHolder = (globalForDb.__egeekDb2 ??= {
  live: { current: createClient('live'), recycledAt: 0, recycles: 0 },
  bg: { current: createClient('bg'), recycledAt: 0, recycles: 0 },
});

/**
 * Troca o pool por um novo e destrói o antigo. No máximo 1 vez a cada 10 s por pool (várias consultas presas
 * estourando juntas disparam uma única troca). O pool antigo tem 20 s para terminar o que está em andamento (consulta saudável conclui; a presa é destruída pelo timeout do socket);
 * depois os sockets são destruídos (consultas ainda pendentes rejeitam e o chamador repete).
 */
export function recycleDbPool(reason: string, kind: PoolKind = currentPoolKind()): boolean {
  const slot = holder[kind];
  const now = Date.now();
  if (now - slot.recycledAt < 10_000) return false;
  slot.recycledAt = now;
  slot.recycles++;
  const old = slot.current;
  slot.current = createClient(kind);
  console.error(`[db] pool ${kind} reciclado (#${slot.recycles}): ${reason}`);
  old.end({ timeout: 20 }).catch(() => {});
  return true;
}

// Proxy que repassa tudo ao pool vigente do contexto; o drizzle guarda esta referência uma vez só.
const clientProxy = new Proxy(function () {} as unknown as Sql, {
  get: (_t, prop) => {
    const cur = holder[currentPoolKind()].current;
    const v = (cur as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(cur) : v;
  },
  apply: (_t, _this, args) => (holder[currentPoolKind()].current as unknown as (...a: unknown[]) => unknown)(...args),
}) as Sql;

// Permite ao cache SWR (src/lib/cache/swr.ts) reciclar o pool sem importar este módulo.
(globalThis as unknown as { __egeekRecyclePool?: typeof recycleDbPool }).__egeekRecyclePool = recycleDbPool;

export const db = drizzle(clientProxy, { schema });
export type DB = typeof db;
