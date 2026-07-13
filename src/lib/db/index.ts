import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Cliente Postgres com pooling adequado para serverless.
// Em runtime usamos o transaction pooler (porta 6543) → prepare:false obrigatório.
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 1,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
