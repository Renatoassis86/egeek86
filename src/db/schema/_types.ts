import { customType } from 'drizzle-orm/pg-core';

/**
 * citext — case-insensitive text. Requer extensão `citext` no Postgres.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

/**
 * bytea — bytes (para dados criptografados via pgcrypto).
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * tsvector — full-text search vector. Coluna costuma ser GENERATED ALWAYS AS.
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});
