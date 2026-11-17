// E5 (#146, R-90): rodízio da coleta da Shopee entre verticais DENTRO do cron único `collect-shopee` (*/5).
// A API da Shopee limita por app (erro 10030) e o tick de Games usa ~4 dos 5 min; crons paralelos por vertical disputariam a mesma cota.
// Padrão: 1 tick em 3 vai para uma vertical que não é Games, em rodízio (cada vertical a cada 75 min com 5 verticais). COLLECT_SHOPEE_FATIA_OUTRAS=0 desliga.
export const VERTICAIS_SHOPEE_OUTRAS = ['esporte', 'eletrodomesticos', 'tecnologia', 'eletroeletronicos', 'impressao3d'] as const;

export function fatiaOutras(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.COLLECT_SHOPEE_FATIA_OUTRAS ?? '').trim();
  if (raw === '') return 3;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 12 ? n : 3;
}

/** Vertical a coletar neste tick (null = Games). `fatia` N => a cada N-ésimo tick de 5 min coleta uma vertical de fora de Games. */
export function verticalDoTick(now: Date, env: Record<string, string | undefined> = process.env): (typeof VERTICAIS_SHOPEE_OUTRAS)[number] | null {
  const fatia = fatiaOutras(env);
  if (fatia === 0) return null;
  const tick = Math.floor(now.getTime() / 300_000);
  if (tick % fatia !== fatia - 1) return null;
  const idx = Math.floor(tick / fatia) % VERTICAIS_SHOPEE_OUTRAS.length;
  return VERTICAIS_SHOPEE_OUTRAS[idx];
}
