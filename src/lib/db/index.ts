import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
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
const queryClient = postgres(connectionString, {
  prepare: false,
  max: isTransactionPooler ? 10 : 2,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
