import type { MetadataRoute } from 'next';
import { siteBaseUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/conta', '/carrinho', '/go/', '/leiloes', '/hype-zone'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
