'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import {
  affiliateOffers,
  affiliateNetworks,
  affiliateCoupons,
  affiliateMessages,
  affiliatePriceSnapshots,
  masterProducts,
} from '@/db/schema';
import { requireAdmin } from '@/lib/auth/require-admin';
import { slugify } from '@/lib/slugify';
import { recordPriceSnapshot } from '@/server/collector/record-price-snapshot';
import { classifyMeliCatalogProduct } from '@/server/collector/sources/mercado-livre-classify';

/**
 * Normaliza número em formato brasileiro ("1.999,90") ou já com ponto decimal
 * ("199.90") para um float — trocar só a primeira vírgula por ponto quebra
 * separador de milhar (ex: "1.999,90" virava "1.999.90" → parseFloat parava
 * no 2º ponto e lia "1.999" como o valor inteiro).
 */
function parseBRLNumber(raw: string): number {
  const trimmed = raw.trim();
  const normalized =
    trimmed.includes(',') && trimmed.includes('.')
      ? trimmed.replace(/\./g, '').replace(',', '.') // "1.999,90" -> "1999.90"
      : trimmed.replace(',', '.'); // "199,90" -> "199.90"; "199.90" inalterado
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) throw new Error('Valor numérico inválido');
  return parsed;
}

function reaisToCents(value: FormDataEntryValue | null): number {
  const parsed = parseBRLNumber(String(value ?? ''));
  if (parsed < 0) throw new Error('Valor de preço inválido');
  return Math.round(parsed * 100);
}

function optionalReaisToCents(value: FormDataEntryValue | null): number | null {
  if (!value || String(value).trim() === '') return null;
  return reaisToCents(value);
}

// ============================================================
// Networks
// ============================================================

const networkSchema = z.object({
  name: z.string().min(2),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  colorHex: z.string().optional(),
  trackingNote: z.string().optional(),
});

export async function createNetwork(formData: FormData) {
  await requireAdmin();
  const parsed = networkSchema.parse({
    name: formData.get('name'),
    websiteUrl: formData.get('websiteUrl') || undefined,
    colorHex: formData.get('colorHex') || undefined,
    trackingNote: formData.get('trackingNote') || undefined,
  });

  await db.insert(affiliateNetworks).values({
    name: parsed.name,
    slug: slugify(parsed.name),
    websiteUrl: parsed.websiteUrl || null,
    colorHex: parsed.colorHex || null,
    trackingNote: parsed.trackingNote || null,
  });

  revalidatePath('/admin/redes');
  redirect('/admin/redes');
}

export async function toggleNetworkActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id'));
  // Toggle atômico no próprio SQL (NOT is_active) em vez de confiar no valor
  // que o client enviou de volta — evita reverter pro estado errado se o
  // registro mudou entre o render do form e o submit.
  await db
    .update(affiliateNetworks)
    .set({ isActive: sql`NOT ${affiliateNetworks.isActive}` })
    .where(eq(affiliateNetworks.id, id));
  revalidatePath('/admin/redes');
}

// ============================================================
// Offers
// ============================================================

const createOfferSchema = z.object({
  productName: z.string().min(2),
  networkId: z.string().uuid(),
  title: z.string().min(2),
  affiliateUrl: z.string().url(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  storeName: z.string().optional(),
  status: z.enum(['draft', 'active']),
  highlightNote: z.string().optional(),
  externalRef: z.string().trim().optional(),
});

async function findOrCreateMasterProduct(name: string) {
  const slug = slugify(name);
  const [existing] = await db.select().from(masterProducts).where(eq(masterProducts.slug, slug)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(masterProducts).values({ name, slug }).returning();
  return created;
}

/**
 * Quando a rede é Mercado Livre e a oferta traz externalRef (catalog_product_id),
 * dedupe por esse ID em vez do nome digitado — física e digital do mesmo
 * jogo são catálogos diferentes no ML, então isso os separa corretamente em
 * master_products distintos (dedup por nome misturaria os dois formatos).
 * Classifica (físico/digital/geração/tipo de edição) só na primeira vez que
 * um catalog_product_id aparece — não muda com o tempo, diferente de preço.
 */
async function findOrCreateMasterProductForOffer(name: string, networkId: string, externalRef: string | null) {
  const [network] = await db
    .select({ slug: affiliateNetworks.slug })
    .from(affiliateNetworks)
    .where(eq(affiliateNetworks.id, networkId))
    .limit(1);

  if (network?.slug === 'mercado-livre' && externalRef) {
    const [existing] = await db.select().from(masterProducts).where(eq(masterProducts.meliCatalogId, externalRef)).limit(1);
    if (existing) return existing;

    let classification: Awaited<ReturnType<typeof classifyMeliCatalogProduct>> | null = null;
    try {
      classification = await classifyMeliCatalogProduct(externalRef);
    } catch (err) {
      console.error(`Falha ao classificar ${externalRef}, seguindo com 'unknown':`, (err as Error).message);
    }

    const baseSlug = slugify(name);
    const [collision] = await db.select().from(masterProducts).where(eq(masterProducts.slug, baseSlug)).limit(1);
    const slug = collision ? slugify(`${name}-${externalRef.slice(-6)}`) : baseSlug;

    const [created] = await db
      .insert(masterProducts)
      .values({
        name,
        slug,
        meliCatalogId: externalRef,
        ...(classification ?? {}),
        classifiedAt: classification ? new Date() : null,
      })
      .returning();
    return created;
  }

  return findOrCreateMasterProduct(name);
}

export async function createAffiliateOffer(formData: FormData) {
  const profile = await requireAdmin();

  const parsed = createOfferSchema.parse({
    productName: formData.get('productName'),
    networkId: formData.get('networkId'),
    title: formData.get('title'),
    affiliateUrl: formData.get('affiliateUrl'),
    imageUrl: formData.get('imageUrl') || undefined,
    storeName: formData.get('storeName') || undefined,
    status: formData.get('status'),
    highlightNote: formData.get('highlightNote') || undefined,
    externalRef: formData.get('externalRef') || undefined,
  });

  const priceCents = reaisToCents(formData.get('priceReais'));
  const listPriceCents = optionalReaisToCents(formData.get('listPriceReais'));
  const couponCode = (formData.get('couponCode') as string) || null;

  const masterProduct = await findOrCreateMasterProductForOffer(
    parsed.productName,
    parsed.networkId,
    parsed.externalRef || null
  );
  // Sufixo aleatório evita colisão do índice único de slug quando o mesmo
  // título é recadastrado na mesma rede (ex: reposição de estoque em vez de
  // usar "Registrar novo preço" na oferta existente).
  const offerSlug = slugify(`${parsed.title}-${parsed.networkId.slice(0, 8)}-${randomUUID().slice(0, 6)}`);

  const offer = await db.transaction(async (tx) => {
    const [createdOffer] = await tx
      .insert(affiliateOffers)
      .values({
        masterProductId: masterProduct.id,
        networkId: parsed.networkId,
        title: parsed.title,
        slug: offerSlug,
        affiliateUrl: parsed.affiliateUrl,
        imageUrl: parsed.imageUrl || null,
        externalRef: parsed.externalRef || null,
        storeName: parsed.storeName || null,
        currentPriceCents: priceCents,
        status: parsed.status,
        highlightNote: parsed.highlightNote || null,
        publishedAt: parsed.status === 'active' ? new Date() : null,
        createdBy: profile.id,
      })
      .returning();

    await tx.insert(affiliatePriceSnapshots).values({
      offerId: createdOffer.id,
      priceCents,
      listPriceCents,
      couponCode,
      source: 'manual',
    });

    return createdOffer;
  });

  revalidatePath('/admin/ofertas');
  revalidatePath('/ofertas');
  redirect(`/admin/ofertas/${offer.id}`);
}

const logPriceSchema = z.object({
  offerId: z.string().uuid(),
  couponCode: z.string().optional(),
});

export async function logNewPrice(formData: FormData) {
  await requireAdmin();
  const parsed = logPriceSchema.parse({
    offerId: formData.get('offerId'),
    couponCode: formData.get('couponCode') || undefined,
  });

  const priceCents = reaisToCents(formData.get('priceReais'));
  const listPriceCents = optionalReaisToCents(formData.get('listPriceReais'));

  await recordPriceSnapshot({
    offerId: parsed.offerId,
    priceCents,
    listPriceCents,
    couponCode: parsed.couponCode || null,
    source: 'manual',
  });

  revalidatePath(`/admin/ofertas/${parsed.offerId}`);
  revalidatePath('/ofertas');
}

const offerStatusSchema = z.enum(['draft', 'active', 'paused', 'expired', 'archived']);

export async function updateOfferStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id'));
  const status = offerStatusSchema.parse(formData.get('status'));

  const values: { status: typeof status; publishedAt?: Date } = { status };
  if (status === 'active') values.publishedAt = new Date();

  await db.update(affiliateOffers).set(values).where(eq(affiliateOffers.id, id));

  revalidatePath('/admin/ofertas');
  revalidatePath(`/admin/ofertas/${id}`);
  revalidatePath('/ofertas');
}

/**
 * Reexecuta a classificação via API — sempre atualiza os campos estruturados
 * (gameFormat/gamePlatformGen/gameCollection, vêm direto do atributo do ML,
 * seguro sobrescrever), mas só sobrescreve gameEditionType/gameEditionSource
 * se a fonte atual NÃO for 'manual' (não pisa em correção humana já feita).
 */
export async function reclassifyMasterProduct(formData: FormData) {
  await requireAdmin();
  const masterProductId = String(formData.get('masterProductId'));
  const offerIdForRedirect = String(formData.get('offerId'));

  const [master] = await db.select().from(masterProducts).where(eq(masterProducts.id, masterProductId)).limit(1);
  if (!master?.meliCatalogId) throw new Error('Produto sem catalog_product_id do Mercado Livre — nada a reclassificar.');

  const classification = await classifyMeliCatalogProduct(master.meliCatalogId);
  const keepManualEdition = master.gameEditionSource === 'manual';

  await db
    .update(masterProducts)
    .set({
      gameFormat: classification.gameFormat,
      gamePlatformGen: classification.gamePlatformGen,
      gameCollection: classification.gameCollection,
      ...(keepManualEdition
        ? {}
        : { gameEditionType: classification.gameEditionType, gameEditionSource: classification.gameEditionSource }),
      classifiedAt: new Date(),
    })
    .where(eq(masterProducts.id, masterProductId));

  revalidatePath(`/admin/ofertas/${offerIdForRedirect}`);
}

const gameEditionTypeSchema = z.enum(['full_game', 'upgrade_pack', 'dlc', 'bundle', 'unknown']);

/** Correção manual — sempre vence, marcada como fonte 'manual' pro reclassify futuro não sobrescrever. */
export async function correctGameEditionType(formData: FormData) {
  await requireAdmin();
  const masterProductId = String(formData.get('masterProductId'));
  const offerIdForRedirect = String(formData.get('offerId'));
  const gameEditionType = gameEditionTypeSchema.parse(formData.get('gameEditionType'));

  await db
    .update(masterProducts)
    .set({ gameEditionType, gameEditionSource: 'manual', classifiedAt: new Date() })
    .where(eq(masterProducts.id, masterProductId));

  revalidatePath(`/admin/ofertas/${offerIdForRedirect}`);
}

// ============================================================
// Coupons
// ============================================================

const createCouponSchema = z.object({
  networkId: z.string().uuid(),
  code: z.string().min(2),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed', 'free_shipping', 'bxgy', 'points_multiplier']),
  discountValue: z.string().min(1),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

export async function createCoupon(formData: FormData) {
  const profile = await requireAdmin();
  const parsed = createCouponSchema.parse({
    networkId: formData.get('networkId'),
    code: formData.get('code'),
    description: formData.get('description') || undefined,
    discountType: formData.get('discountType'),
    discountValue: formData.get('discountValue'),
    validUntil: formData.get('validUntil') || undefined,
    notes: formData.get('notes') || undefined,
  });

  await db.insert(affiliateCoupons).values({
    networkId: parsed.networkId,
    code: parsed.code.toUpperCase(),
    description: parsed.description || null,
    discountType: parsed.discountType,
    discountValue: parseBRLNumber(parsed.discountValue).toFixed(2),
    // "T23:59:59-03:00" ancora no fim do dia em horário de Brasília, evitando
    // que "YYYY-MM-DD" (interpretado como meia-noite UTC pelo JS) apareça como
    // expirado quase um dia antes do pretendido pro admin.
    validUntil: parsed.validUntil ? new Date(`${parsed.validUntil}T23:59:59-03:00`) : null,
    notes: parsed.notes || null,
    createdBy: profile.id,
  });

  revalidatePath('/admin/cupons');
  redirect('/admin/cupons');
}

const couponStatusSchema = z.enum(['active', 'paused', 'expired', 'used_up']);

export async function updateCouponStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id'));
  const status = couponStatusSchema.parse(formData.get('status'));

  await db.update(affiliateCoupons).set({ status }).where(eq(affiliateCoupons.id, id));
  revalidatePath('/admin/cupons');
}

// ============================================================
// Messages
// ============================================================

export interface RecordMessageInput {
  offerId: string;
  messageText: string;
  priceCentsAtSend: number;
  destination?: string;
}

/** Chamada diretamente do client (onClick após copiar) — não é <form action>. */
export async function recordMessageCopied(input: RecordMessageInput) {
  const profile = await requireAdmin();

  await db.insert(affiliateMessages).values({
    offerId: input.offerId,
    messageText: input.messageText,
    priceCentsAtSend: input.priceCentsAtSend,
    destination: input.destination || null,
    createdBy: profile.id,
  });

  revalidatePath('/admin/mensagens');
}
