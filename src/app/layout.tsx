import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { cookies, headers } from 'next/headers';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toast';
import type { ResolvedTheme, Theme } from '@/lib/stores/theme-store';
import './globals.css';

// ============================================================
// Fonts — self-hosted via next/font (zero CLS).
// As CSS vars são consumidas em @theme do globals.css.
// ============================================================
// 2026-11-17: fontes embutidas no projeto (src/app/fonts, subconjunto latin, licença SIL OFL). O build não consulta mais o Google Fonts: o erro
// intermitente "next/font/google queries have exactly one entry" derrubava deploys (commits f36865e e 135766f) e exigia reimplantar na mão.
const geistSans = localFont({
  variable: '--font-sans-display',
  display: 'swap',
  src: [
    { path: './fonts/geist-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/geist-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/geist-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/geist-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/geist-sans-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
});

const geistMono = localFont({
  variable: '--font-sans-mono',
  display: 'swap',
  src: [
    { path: './fonts/geist-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/geist-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/geist-mono-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
});

const inter = localFont({
  variable: '--font-sans-body',
  display: 'swap',
  src: [
    { path: './fonts/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/inter-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
});

// ============================================================
// Metadata
// ============================================================
export const metadata: Metadata = {
  title: {
    default: 'Espaço Geek 86, o cofre da cultura geek',
    template: '%s | Espaço Geek 86',
  },
  description:
    'Comparador de preços de jogos, consoles e acessórios, com histórico de preço, pesquisa de mercado e notícias da cultura geek.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL.startsWith('http')
        ? process.env.NEXT_PUBLIC_APP_URL
        : `https://${process.env.NEXT_PUBLIC_APP_URL}`
      : 'https://egeek86.vercel.app'
  ),
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Espaço Geek 86',
    images: [
      {
        url: '/images/system/og-cover.png',
        width: 1734,
        height: 907,
        alt: 'Espaço Geek 86 — informação real sobre games, decisões inteligentes.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/images/system/og-cover.png'],
  },
  applicationName: 'Espaço Geek 86',
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B0908' },
    { media: '(prefers-color-scheme: light)', color: '#FAF7F0' },
  ],
};

// ============================================================
// Root layout
// ============================================================
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let themeCookie: Theme = 'dark';
  let resolvedTheme: ResolvedTheme = 'dark';

  try {
    const cookieStore = await cookies();
    const headerStore = await headers();

    themeCookie = (cookieStore.get('theme')?.value ?? 'dark') as Theme;
    const prefersDark = headerStore.get('sec-ch-prefers-color-scheme') !== 'light';

    resolvedTheme =
      themeCookie === 'auto' ? (prefersDark ? 'dark' : 'light') : themeCookie;
  } catch (e) {
    // Fallback para tema escuro se houver qualquer problema de leitura no SSR
  }

  return (
    <html
      lang="pt-BR"
      data-theme={resolvedTheme}
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased overflow-x-hidden max-w-full w-full">
        <ThemeProvider initialTheme={themeCookie} initialResolvedTheme={resolvedTheme}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
