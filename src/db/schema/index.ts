// ============================================================
// Barrel de schemas Drizzle — Espaço Geek 86
// Organizado por domínio (identity → ops).
// Tudo no schema public (MVP). Futuro: schemas Postgres separados.
// ============================================================

// Compartilhados
export * from './_enums';
export * from './_types';

// Identity
export * from './profiles';
export * from './addresses';
export * from './referrals';

// Seller
export * from './sellers';
export * from './seller_kyc';
export * from './seller_metrics';
export * from './seller_payouts';

// Catalog
export * from './brands';
export * from './franchises';
export * from './categories';
export * from './master_products';
export * from './products';
export * from './product_variants';
export * from './product_media';
export * from './product_ratings';

// Inventory
export * from './inventory';

// Pricing
export * from './pricing';

// Commerce
export * from './carts';
export * from './orders';

// Payment
export * from './payments';

// Hype Zone
export * from './hype';
export * from './curations';
export * from './auctions';

// Geek Deals (Afiliados)
export * from './affiliate_networks';
export * from './affiliate_sellers';
export * from './affiliate_offers';
export * from './affiliate_pricing';
export * from './affiliate_messages';
export * from './affiliate_watches';
export * from './affiliate_cart';

// Loyalty / Gamificação
export * from './loyalty';

// Engagement (wishlist, reviews, views)
export * from './engagement';

// Search
export * from './search';

// Notification
export * from './notification';

// Notícias
export * from './news_articles';

// Analytics
export * from './analytics';

// Audit
export * from './audit';

// Ops (feature flags, idempotency, config, redirects SEO)
export * from './ops';
