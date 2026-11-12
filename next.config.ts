import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loops de leitura/links rodam em abas logadas do dono e sao baixados por um bootstrap curto (fetch + eval). Sem credenciais nos arquivos.
  async headers() {
    return [{ source: '/loops/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex' }] }];
  },
  // /admin/fluxo le a fila viva de execucao (docs/fila-de-execucao.md) no servidor; sem isto o arquivo nao vai no bundle da Vercel.
  outputFileTracingIncludes: { '/admin/fluxo': ['./docs/fila-de-execucao.md'], '/api/admin/fluxo': ['./docs/fila-de-execucao.md'] },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
