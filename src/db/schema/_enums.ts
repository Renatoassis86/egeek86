import { pgEnum } from 'drizzle-orm/pg-core';

// ============================================================
// Identity
// ============================================================
export const userRole = pgEnum('user_role', [
  'customer',
  'seller',
  'seller_staff',
  'support',
  'moderator',
  'admin',
  'super_admin',
]);

export const userStatus = pgEnum('user_status', ['active', 'suspended', 'deleted']);

// ============================================================
// Seller
// ============================================================
export const sellerStatus = pgEnum('seller_status', [
  'pending_kyc',
  'active',
  'suspended',
  'terminated',
]);

export const kycStatus = pgEnum('kyc_status', ['pending', 'approved', 'rejected', 'expired']);

// ============================================================
// Catalog
// ============================================================
export const productStatus = pgEnum('product_status', ['draft', 'active', 'paused', 'archived']);

export const productCondition = pgEnum('product_condition', [
  'new',
  'sealed',
  'open_box',
  'used_like_new',
  'used_good',
  'used_fair',
  'collector',
]);

export const mediaType = pgEnum('media_type', ['image', 'video', 'model_3d', '360']);

// ============================================================
// Inventory
// ============================================================
export const stockMovementType = pgEnum('stock_movement_type', [
  'inbound',
  'outbound',
  'adjustment',
  'reservation',
  'release',
  'loss',
]);

// ============================================================
// Pricing
// ============================================================
export const promotionType = pgEnum('promotion_type', [
  'percentage',
  'fixed',
  'free_shipping',
  'bxgy',
  'points_multiplier',
]);

export const couponStatus = pgEnum('coupon_status', ['active', 'paused', 'expired', 'used_up']);

// ============================================================
// Commerce
// ============================================================
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'disputed',
  'failed',
]);

export const fulfillmentStatus = pgEnum('fulfillment_status', [
  'pending',
  'preparing',
  'shipped',
  'delivered',
  'returned',
]);

export const shipmentStatus = pgEnum('shipment_status', [
  'label_created',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'returned',
  'lost',
]);

// ============================================================
// Payment
// ============================================================
export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'authorized',
  'captured',
  'failed',
  'cancelled',
  'refunded',
  'partial_refund',
  'chargeback',
]);

export const paymentMethod = pgEnum('payment_method', [
  'pix',
  'credit_card',
  'debit_card',
  'boleto',
  'wallet',
  'wallet_internal',
]);

export const refundStatus = pgEnum('refund_status', [
  'pending',
  'approved',
  'processed',
  'failed',
  'rejected',
]);

// ============================================================
// Hype
// ============================================================
export const dropStatus = pgEnum('drop_status', [
  'scheduled',
  'live',
  'sold_out',
  'ended',
  'cancelled',
]);

export const dropAccess = pgEnum('drop_access', [
  'public',
  'waitlist',
  'invite_only',
  'tier_locked',
]);

// ============================================================
// Loyalty
// ============================================================
export const pointReason = pgEnum('point_reason', [
  'signup',
  'purchase',
  'review',
  'referral',
  'redeem',
  'expire',
  'admin_adjust',
  'refund_reversal',
  'mission',
  'birthday',
  'drop_participation',
]);

export const badgeTier = pgEnum('badge_tier', [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'legendary',
]);

export const missionStatus = pgEnum('mission_status', [
  'active',
  'completed',
  'expired',
  'abandoned',
]);

// ============================================================
// Reviews
// ============================================================
export const reviewStatus = pgEnum('review_status', [
  'pending',
  'approved',
  'rejected',
  'flagged',
  'hidden',
]);

// ============================================================
// Notification
// ============================================================
export const notificationChannel = pgEnum('notification_channel', [
  'email',
  'push',
  'whatsapp',
  'sms',
  'in_app',
  'telegram',
]);

export const notificationStatus = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'clicked',
]);

// ============================================================
// Geek Deals (Afiliados)
// ============================================================
export const affiliateOfferStatus = pgEnum('affiliate_offer_status', [
  'draft',
  'active',
  'paused',
  'expired',
  'archived',
]);

export const affiliatePriceSource = pgEnum('affiliate_price_source', ['manual', 'api', 'scrape']);

// ============================================================
// Geek Deals — Classificação de jogos
// ============================================================
export const gameFormat = pgEnum('game_format', ['physical', 'digital', 'unknown']);

export const gamePlatformGen = pgEnum('game_platform_gen', [
  'switch_1',
  'switch_2',
  'ps4',
  'ps5',
  'xbox_one',
  'xbox_series',
  'unknown',
]);

export const gameEditionType = pgEnum('game_edition_type', [
  'full_game',
  'upgrade_pack',
  'dlc',
  'bundle',
  'unknown',
]);

// 'structured' reservado pro futuro (Mercado Livre não expõe hoje um atributo
// estruturado pra full/DLC/bundle) — na prática só 'keyword_rule' e 'manual'.
export const gameEditionSource = pgEnum('game_edition_source', ['structured', 'keyword_rule', 'manual']);

// ============================================================
// Notícias
// ============================================================
// 'original' = artigo escrito pela própria editoria, lido inteiro no site.
// 'curated_link' = destaque de matéria de outro portal: só resumo próprio +
// link de saída, nunca reprodução do texto de terceiros (mesmo princípio de
// "nunca raspagem" já seguido pro dado de preço).
export const articleKind = pgEnum('article_kind', ['original', 'curated_link']);

export const articleCategory = pgEnum('article_category', [
  'cultura_pop',
  'sinopse_jogo',
  'tecnologia',
  'lancamentos',
]);

export const articleStatus = pgEnum('article_status', ['draft', 'published', 'archived']);
