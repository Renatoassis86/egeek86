import {
  pgTable,
  uuid,
  text,
  timestamp,
  smallint,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { citext } from './_types';
import { brands } from './brands';
import { categories } from './categories';
import { franchises } from './franchises';
import { productType, gameFormat, gamePlatformGen, gameEditionType, gameEditionSource } from './_enums';

/**
 * master_products — catálogo canônico controlado pela plataforma.
 * 1 master = 1 "produto único no mundo real" (ex: Funko Pop Naruto #71).
 * Permite agrupar ofertas de N sellers (futuro BuyBox), curadoria, IA.
 */
export const masterProducts = pgTable(
  'master_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gtin: text('gtin'),
    mpn: text('mpn'),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    description: text('description'),
    brandId: uuid('brand_id').references(() => brands.id),
    categoryId: uuid('category_id').references(() => categories.id),
    franchiseId: uuid('franchise_id').references(() => franchises.id),
    releaseYear: smallint('release_year'),
    manufacturer: text('manufacturer'),
    attributes: jsonb('attributes').notNull().default({}),
    defaultImages: jsonb('default_images').notNull().default([]),
    isVerified: boolean('is_verified').notNull().default(false),
    // Distingue jogo de hardware/acessório no mesmo catálogo — todo produto
    // já existente é 'game' (default), nada muda pra ele. 'console' reaproveita
    // gamePlatformGen abaixo pra dizer QUAL console é (não pra qual roda).
    productType: productType('product_type').notNull().default('game'),
    // Classificação de jogos (Geek Deals) — gameFormat/gamePlatformGen vêm
    // direto de atributo estruturado do Mercado Livre (FORMAT/CONSOLE_VERSION),
    // gameEditionType é a única inferida por regra de palavra-chave sobre o
    // título (ver src/lib/affiliate/game-classification.ts).
    gameFormat: gameFormat('game_format').notNull().default('unknown'),
    gamePlatformGen: gamePlatformGen('game_platform_gen').notNull().default('unknown'),
    gameEditionType: gameEditionType('game_edition_type').notNull().default('unknown'),
    // null = nunca classificado; preenchido mesmo quando o resultado é
    // 'unknown' (a regra rodou e não conseguiu decidir) — distingue "nunca
    // tentei" de "tentei e é ambíguo mesmo".
    gameEditionSource: gameEditionSource('game_edition_source'),
    gameCollection: text('game_collection'),
    // catalog_product_id do Mercado Livre — chave de dedup determinística
    // pra jogos (física e digital são catálogos diferentes no ML, então usar
    // isso em vez do nome digitado evita misturar os dois no mesmo master).
    meliCatalogId: text('meli_catalog_id'),
    classifiedAt: timestamp('classified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('master_products_slug_uq').on(t.slug),
    uniqueIndex('master_products_gtin_uq').on(t.gtin),
    index('master_products_brand_idx').on(t.brandId),
    index('master_products_franchise_idx').on(t.franchiseId),
    index('master_products_category_idx').on(t.categoryId),
    uniqueIndex('master_products_meli_catalog_id_uq')
      .on(t.meliCatalogId)
      .where(sql`meli_catalog_id IS NOT NULL`),
    index('master_products_game_classification_idx').on(t.gameFormat, t.gamePlatformGen, t.gameEditionType),
  ]
);

export type MasterProduct = typeof masterProducts.$inferSelect;

export type ProductType = (typeof productType.enumValues)[number];
export type GameFormat = (typeof gameFormat.enumValues)[number];
export type GamePlatformGen = (typeof gamePlatformGen.enumValues)[number];
export type GameEditionType = (typeof gameEditionType.enumValues)[number];
export type GameEditionSource = (typeof gameEditionSource.enumValues)[number];
