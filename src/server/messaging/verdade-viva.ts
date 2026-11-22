import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { netKind } from '@/lib/messaging/group-rules';
import { fetchLiveQuote } from '@/lib/messaging/live-recheck';
import { VIVO_JANELA_AMAZON_MIN, VIVO_JANELA_VITRINE_MIN, decidirVivo, type DecisaoVivo, type LeituraViva } from '@/lib/messaging/verdade-viva';
import { loadLiveTargets, realLiveDeps } from '@/server/messaging/live-recheck';
import type { JogoVitrine } from '@/lib/messaging/vitrine-games';

const rows = <T>(r: unknown) => r as unknown as T[];

/**
 * R-118: prepara a verificacao VIVA de uma lista de jogos da vitrine (um LiveTarget por oferta; uma leitura da tabela de verificacoes).
 *  - Mercado Livre: API oficial (vencedores do catalogo = anuncio ativo, novo e COM ESTOQUE; some quando esgota) na hora do envio; grava a verificacao e o snapshot.
 *  - Shopee: a API de afiliados (productOfferV2) NAO traz estoque e devolve o preco de lista da API, que diverge da pagina (medido: 139,90 vs 119,62 num item esgotado na pagina);
 *    so vale a leitura da PAGINA do anuncio feita pela aba logada (`pagina_shopee`, rota /api/ingest/disponibilidade-viva) dentro da janela. Sem ela: nao verificavel.
 *  - Amazon: sem consulta ao vivo possivel; vale a leitura da coleta assistida dentro de 45 min (R-81).
 *  - Qualquer outra rede: nao verificavel.
 */
export async function prepararVerificacaoViva(jogos: readonly JogoVitrine[], tetoCents: number, now: Date = new Date()): Promise<(j: JogoVitrine) => Promise<DecisaoVivo>> {
  const ids = [...new Set(jogos.map((j) => j.ofertaId).filter((x): x is string => !!x))].slice(0, 190);
  const targets = ids.length ? await loadLiveTargets(ids.map((offerId) => ({ offerId, detectedPriceCents: jogos.find((j) => j.ofertaId === offerId)?.precoCentavos ?? null })), new Map(), now) : [];
  const alvoPor = new Map(targets.map((t) => [t.offerId, t]));
  const leituras = ids.length
    ? rows<{ oid: string; disponivel: boolean; preco: number | null; fonte: string; idade: number; motivo: string | null }>(await db.execute(sql`
        SELECT offer_id::text AS oid, disponivel, preco_cents AS preco, fonte, (extract(epoch FROM now() - verificado_em) / 60.0)::float8 AS idade, motivo
        FROM oferta_verificacao_viva WHERE offer_id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`))
    : [];
  const leituraPor = new Map(leituras.map((l) => [l.oid, l]));
  const deps = realLiveDeps();
  const gravar = (offerId: string, fonte: string, disponivel: boolean, preco: number | null, motivo: string | null) =>
    db.execute(sql`INSERT INTO oferta_verificacao_viva (offer_id, verificado_em, fonte, disponivel, preco_cents, motivo) VALUES (${offerId}::uuid, now(), ${fonte}, ${disponivel}, ${preco}, ${motivo})
      ON CONFLICT (offer_id) DO UPDATE SET verificado_em = now(), fonte = EXCLUDED.fonte, disponivel = EXCLUDED.disponivel, preco_cents = EXCLUDED.preco_cents, motivo = EXCLUDED.motivo`).catch(() => undefined);

  return async (j) => {
    const t = j.ofertaId ? alvoPor.get(j.ofertaId) : undefined;
    if (!t || !j.ofertaId) return { ok: false, motivo: 'nao_verificavel' };
    const k = netKind({ networkSlug: t.networkSlug, networkName: t.networkName ?? t.networkSlug });
    let leitura: LeituraViva = { estado: 'nao_verificavel', motivo: 'rede_sem_verificacao' };
    let janela = VIVO_JANELA_VITRINE_MIN;
    if (k === 'ml') {
      const q = await fetchLiveQuote({ ...t, detectedPriceCents: j.precoCentavos }, deps);
      if (q.ok) {
        await deps.record?.(t, q.priceCents).catch(() => undefined);
        await gravar(j.ofertaId, 'api_ml', true, q.priceCents, null);
        leitura = { estado: 'ok', precoCents: q.priceCents, idadeMin: 0, fonte: 'api_ml' };
      } else if (q.kind === 'unavailable') {
        await gravar(j.ofertaId, 'api_ml', false, null, q.reason.slice(0, 60));
        leitura = { estado: 'esgotado', idadeMin: 0, fonte: 'api_ml' };
      } else leitura = { estado: 'nao_verificavel', motivo: q.reason };
    } else if (k === 'shopee') {
      const l = leituraPor.get(j.ofertaId);
      if (l && l.fonte === 'pagina_shopee') leitura = l.disponivel && l.preco ? { estado: 'ok', precoCents: l.preco, idadeMin: l.idade, fonte: l.fonte } : { estado: 'esgotado', idadeMin: l.idade, fonte: l.fonte };
    } else if (k === 'amazon') {
      janela = VIVO_JANELA_AMAZON_MIN;
      if (t.confirmedAt) leitura = { estado: 'ok', precoCents: t.storedPriceCents, idadeMin: (now.getTime() - t.confirmedAt.getTime()) / 60_000, fonte: 'coleta_amazon' };
    }
    return decidirVivo(j.precoCentavos, leitura, { janelaMin: janela, tetoCents });
  };
}
