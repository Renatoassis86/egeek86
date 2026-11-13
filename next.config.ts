import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loops de leitura/links rodam em abas logadas do dono e sao baixados por um bootstrap curto (fetch + eval). Sem credenciais nos arquivos.
  async headers() {
    return [
      // Imagens locais: nome novo = imagem nova (regra do projeto), entao o cache e imutavel por 1 ano. Nunca sobrescrever um arquivo em /images com outro conteudo.
      { source: '/images/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/geek%2086.webp', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/loops/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'no-store' }, { key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
  // D5 (ata 2026-11-13): o endereco antigo responde 308 de verdade (permanentRedirect dentro da pagina vira meta refresh com status 200 quando ha streaming).
  async redirects() {
    return [{ source: '/inteligencia-gamer', destination: '/noticias', permanent: true }];
  },
  // Compatibilidade: as imagens grandes foram reexportadas de .png para .webp no mesmo caminho logico. Referencias antigas
  // (capas gravadas no banco, scripts, links externos) a /images/x.png continuam funcionando quando o .png nao existe mais
  // (rewrite so vale se nao houver arquivo estatico com esse nome, ex.: og-cover.png).
  async rewrites() {
    return { beforeFiles: [], afterFiles: [{ source: '/images/:path*.png', destination: '/images/:path*.webp' }], fallback: [] };
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
