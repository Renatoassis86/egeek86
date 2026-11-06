import 'server-only';
import { createCachedQuery } from '@/lib/cache/server-cache';
import { buildLojasHoje, type LojasHoje } from '@/lib/pricing/lojas-hoje';
import { loadLiveOffers, loadOfferMeta } from '@/server/pricing/price-metrics-v2';

/**
 * "Lojas de hoje" (Fase 3, painel 2). SÓ LEITURA. Usa as mesmas consultas do "preço agora" (`loadLiveOffers` + `loadOfferMeta`,
 * que aplicam `eligibleOfferSql`: sem quarentena, sem rascunho, sem placeholder redundante, identidade visível, catálogo aprovado)
 * e a mesma régua de frescor e faixa (`buildLojasHoje`). Resultado serializável (ISO), em cache de 60 s como o resto.
 */
async function loadLojasHoje(masterProductId: string): Promise<LojasHoje> {
  const now = new Date();
  const [live, meta] = await Promise.all([loadLiveOffers(masterProductId, now), loadOfferMeta(masterProductId)]);
  return buildLojasHoje(
    live.map((l) => {
      const m = meta.get(l.offerId);
      return { ...l, vendedor: m?.seller ?? null, rede: m?.network ?? '', baixaReputacao: m?.weak === true };
    }),
    now
  );
}

export const getLojasHoje: (masterProductId: string) => Promise<LojasHoje> = createCachedQuery(loadLojasHoje, ['lojas-hoje-1'], {
  revalidate: 60,
  coldTimeoutSeconds: 5,
  live: true,
  hardTimeoutSeconds: 20,
});
