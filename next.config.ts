import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Fotos de capa dos jogos vêm da API do Mercado Livre (offer.imageUrl /
    // masterProduct.defaultImages) — CDN compartilhado entre todos os sites
    // ML (Brasil, Argentina, Chile...), sempre em *.mlstatic.com.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.mlstatic.com",
      },
    ],
  },
};

export default nextConfig;
