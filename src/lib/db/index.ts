import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';

// Cliente Postgres com pooling adequado para serverless.
// Em runtime usamos o transaction pooler (porta 6543) → prepare:false obrigatório.
// max:5 (não 1): várias páginas disparam queries em paralelo via Promise.all
// (ex: SalesHighlights faz 8 de uma vez) — com max:1 elas ficam na fila, uma
// atrás da outra, na mesma conexão, transformando um Promise.all em execução
// serial de fato. O pooler de transação (6543) foi feito pra aguentar isso
// bem, diferente do pooler de sessão (5432, limite de 15 conexões no total)
// onde max:1 fazia sentido como precaução.
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 5,
  idle_timeout: 10,
  connect_timeout: 10,
  ssl: connectionString.includes('supabase') || process.env.NODE_ENV === 'production' ? 'require' : false,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
