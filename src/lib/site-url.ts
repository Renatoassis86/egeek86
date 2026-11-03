/**
 * URL pública canônica do site (sitemap, robots, canonical). Sem segredos.
 * Em produção na Vercel, variável ausente ou apontando para localhost cai no domínio oficial.
 */
const PRODUCTION_URL = 'https://www.egeek86.com';

export function siteBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  const isLocal = !raw || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(raw);
  if (isLocal && process.env.VERCEL_ENV === 'production') return PRODUCTION_URL;
  return raw || 'http://localhost:3000';
}
