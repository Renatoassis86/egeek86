import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';
import { beneficiosVivosPorOferta } from '@/server/coupons/card-benefits';
import { rotuloBeneficioCartao } from '@/lib/coupons/card-benefit';
import { avisoImpressoraLigado, MODELOS_AVISO, textoAvisoImpressora, type AvisoImpressora } from '@/lib/coupons/aviso-impressoras';
import { modeloGuia3d } from '@/lib/messaging/prioridade-3d';

/**
 * Aviso privado ao dono (chat TELEGRAM_ALERT_CHAT_ID) quando surge cupom válido ou desconto de cartão NOVO em P2S Combo / P1S Combo (#112).
 * Flag PRINTER_COUPON_ALERT (padrão ligada; off desliga). Sem COLLECTOR_ALERTS=1 + chat + token: dry-run (devolve o que enviaria, não grava dedup).
 * Dedup: cartão = offer_card_benefits.alerted_at; cupom = collector_runs (job 'impressora-cupom-aviso', meta.chave). 1 aviso por cupom/benefício novo.
 * Nunca lança. Nunca imprime o id do chat.
 */
const JOB = 'impressora-cupom-aviso';

interface Cand { id: string; name: string; rede: string; price: number; url: string | null }
type Novo = AvisoImpressora & { marcar: () => Promise<void> };

async function ofertasCombo(): Promise<Cand[]> {
  const rows = (await db.execute<{ id: string; name: string; rede: string; price: string; url: string | null }>(sql`
    SELECT o.id::text AS id, m.name, nn.slug AS rede, o.current_price_cents::text AS price, o.affiliate_url AS url
    FROM affiliate_offers o JOIN affiliate_networks nn ON nn.id = o.network_id JOIN master_products m ON m.id = o.master_product_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND o.vertical = 'impressao3d' AND nn.slug IN ('mercado-livre', 'amazon')
      AND m.name ~* 'bambu' AND m.name ~* 'combo' AND m.name ~* '(p2s|p1s)'`)) as unknown as { id: string; name: string; rede: string; price: string; url: string | null }[];
  const pos = (n: string) => (MODELOS_AVISO as readonly string[]).indexOf(modeloGuia3d(n)?.slug ?? '');
  return rows
    .filter((r) => pos(r.name) >= 0)
    .map((r) => ({ id: r.id, name: r.name, rede: r.rede, price: Number(r.price), url: r.url }))
    .sort((a, b) => pos(a.name) - pos(b.name) || a.price - b.price);
}

const REDE_NOME: Record<string, string> = { 'mercado-livre': 'Mercado Livre', amazon: 'Amazon' };

export interface ResultadoAvisoImpressoras { ligado: boolean; enviaria: number; enviados: number; dryRun: boolean; avisos: string[] }

export async function alertarCuponsImpressoras(now: Date = new Date()): Promise<ResultadoAvisoImpressoras> {
  const vazio: ResultadoAvisoImpressoras = { ligado: avisoImpressoraLigado(), enviaria: 0, enviados: 0, dryRun: true, avisos: [] };
  if (!vazio.ligado) return vazio;
  try {
    const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
    const dryRun = process.env.COLLECTOR_ALERTS !== '1' || !chat || !process.env.TELEGRAM_BOT_TOKEN;
    const ofertas = await ofertasCombo();
    if (!ofertas.length) return { ...vazio, dryRun };
    const beneficios = await beneficiosVivosPorOferta(ofertas.map((o) => o.id));
    const novos: Novo[] = [];
    for (const o of ofertas) {
      const modelo = modeloGuia3d(o.name)?.rotulo ?? o.name;
      const rede = REDE_NOME[o.rede] ?? o.rede;
      // Cartão/Pix em %: ainda não avisado.
      const ja = (await db.execute<{ dedup_key: string }>(sql`SELECT dedup_key FROM offer_card_benefits WHERE offer_id = ${o.id}::uuid AND alerted_at IS NOT NULL`)) as unknown as { dedup_key: string }[];
      const avisados = new Set(ja.map((x) => x.dedup_key));
      for (const b of beneficios.get(o.id) ?? []) {
        if ((b.kind !== 'cartao_pct' && b.kind !== 'pix_pct') || avisados.has(b.dedupKey)) continue;
        novos.push({
          tipo: 'cartao', chave: `${o.id}|${b.dedupKey}`, modelo, rede, titulo: rotuloBeneficioCartao(b) ?? b.rawText,
          regra: `${b.rawText}${b.capCents ? `; teto ${b.capCents / 100} reais` : '; teto e validade na tela Saiba mais da loja'}`,
          validade: 'não informada na página', link: o.url, anuncioCents: b.baseCents ?? o.price, finalCents: b.finalPriceCents, confirmar: b.needsConfirm,
          marcar: async () => { await db.execute(sql`UPDATE offer_card_benefits SET alerted_at = now() WHERE offer_id = ${o.id}::uuid AND dedup_key = ${b.dedupKey}`); },
        });
      }
      // Cupom válido pela agulha, ainda não avisado.
      let r: Awaited<ReturnType<typeof lookupItemCouponDetail>> = null;
      try { r = await lookupItemCouponDetail(o.id, undefined, now); } catch { r = null; }
      if (r) {
        const d = r.detail;
        const chave = `${o.id}|${d.name}|${d.finalCents}`;
        const ja2 = (await db.execute<{ n: string }>(sql`SELECT count(*)::text AS n FROM collector_runs WHERE job = ${JOB} AND meta->>'chave' = ${chave}`)) as unknown as { n: string }[];
        if (Number(ja2[0]?.n ?? 0) === 0) {
          novos.push({
            tipo: 'cupom', chave, modelo, rede, titulo: d.name + (d.code ? ` (código ${d.code})` : ''),
            regra: [d.activation, d.minOrderCents ? `compra mínima ${d.minOrderCents / 100} reais` : null, d.maxDiscountCents ? `desconto máximo ${d.maxDiscountCents / 100} reais` : null, d.ruleKnown ? null : 'regra completa na tela do cupom'].filter(Boolean).join('; '),
            validade: d.validUntil ? new Date(d.validUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'não informada na página', link: o.url,
            anuncioCents: d.offerPriceCents, finalCents: d.finalCents, confirmar: !d.ruleKnown,
            marcar: async () => { await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES (${JOB}, ${o.rede}, now(), now(), 0, 'ok', ${JSON.stringify({ chave })}::jsonb)`); },
          });
        }
      }
    }
    const textos = novos.map((n) => textoAvisoImpressora(n));
    if (dryRun) return { ligado: true, enviaria: novos.length, enviados: 0, dryRun: true, avisos: textos };
    let enviados = 0;
    for (let i = 0; i < novos.length && enviados < 5; i++) {
      const res = await sendTelegramMessage(chat!, textos[i]);
      if (res.ok) { await novos[i].marcar(); enviados++; }
    }
    return { ligado: true, enviaria: novos.length, enviados, dryRun: false, avisos: [] };
  } catch (e) {
    console.error('[aviso-impressoras] falhou:', e instanceof Error ? e.message : e);
    return vazio;
  }
}
