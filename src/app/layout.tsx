import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Inter } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/toast';
import type { ResolvedTheme, Theme } from '@/lib/stores/theme-store';
import './globals.css';

// ============================================================
// Fonts — self-hosted via next/font (zero CLS).
// As CSS vars são consumidas em @theme do globals.css.
// ============================================================
const geistSans = Geist({
  variable: '--font-sans-display',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const geistMono = Geist_Mono({
  variable: '--font-sans-mono',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
});

const inter = Inter({
  variable: '--font-sans-body',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
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
    'Marketplace premium de cultura geek: action figures, TCG, colecionáveis, hype drops e raridades. Coleção, curadoria e comunidade.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
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
  const cookieStore = await cookies();
  const headerStore = await headers();

  const themeCookie = (cookieStore.get('theme')?.value ?? 'dark') as Theme;
  const prefersDark = headerStore.get('sec-ch-prefers-color-scheme') !== 'light';

  const resolvedTheme: ResolvedTheme =
    themeCookie === 'auto' ? (prefersDark ? 'dark' : 'light') : themeCookie;

  return (
    <html
      lang="pt-BR"
      data-theme={resolvedTheme}
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider initialTheme={themeCookie} initialResolvedTheme={resolvedTheme}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
