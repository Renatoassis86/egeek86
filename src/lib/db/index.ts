import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

// Cliente Postgres com pooling adequado para serverless.
// Em runtime usamos o transaction pooler (porta 6543) → prepare:false obrigatório.
// max:10 (não 1, não 5): várias páginas disparam queries em paralelo via
// Promise.all — SalesHighlights faz 8 de uma vez, admin/ofertas faz 6. Com
// max:5 essas duas já estouravam o pool sozinhas (a 6ª/7ª query ficava na
// fila esperando uma conexão liberar), o que incluía a checagem de sessão
// do admin (requireAdmin -> getCurrentProfile, mesmo pool) — achado real
// (2026-07-24): /admin/ofertas por vezes levava 20-25s só pra REDIRECIONAR
// um visitante sem login, porque a checagem de auth ficava atrás das 6
// queries da página na fila do pool. O pooler de transação (6543) aguenta
// bem mais que isso, diferente do pooler de sessão (5432, teto de 15
// conexões no total) — onde um max mais generoso seria arriscado.
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 10,
  idle_timeout: 10,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
