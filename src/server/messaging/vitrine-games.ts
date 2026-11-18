import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { buildGoLink } from '@/lib/messaging/group-messages';
import { sendTelegramGroupMessage } from '@/lib/messaging/telegram-send';
import { familiaDe, VITRINE_INTERVALO_MIN, VITRINE_TETO_CENTAVOS, VITRINE_TOP, escolherTopRodizio, janelaKey, montarLegenda, vitrineLigada, type JogoVitrine } from '@/lib/messaging/vitrine-games';
import { amazonFrescorMin } from '@/lib/messaging/confirmacao-preco';
import { aptaSql } from '@/server/queries/ranking-busca';
import { getOfferListingMetrics } from '@/server/queries/affiliate';
import { resolveCover } from '@/server/messaging/card-cover';
import { renderCapaVitrine } from '@/server/messaging/vitrine-games-capa';
import type { GamePlatformGen } from '@/db/schema';

export const JOB_VITRINE_GAMES = 'vitrine-games';
const rows = <T>(r: unknown) => r as unknown as T[];
const horaSP = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Jogos NOVOS com oferta ativa, elegível, link de afiliado publicável e leitura fresca (Amazon: mesma janela das outras lojas, R-101), menor preço até R$ 200, com mais ofertas primeiro. */
export async function carregarJogosVitrine(): Promise<JogoVitrine[]> {
  const tudo = rows<{ mid: string; name: string; plat: GamePlatformGen; n: number; oid: string; slug: string; minp: number; img: string | null }>(await db.execute(sql`
    SELECT m.id::text AS mid, m.name, m.game_platform_gen AS plat, count(*)::int AS n,
           (array_agg(o.id::text ORDER BY o.current_price_cents, o.id))[1] AS oid,
           (array_agg(o.slug::text ORDER BY o.current_price_cents, o.id))[1] AS slug,
           min(o.current_price_cents)::int AS minp,
           (array_agg(o.image_url ORDER BY o.current_price_cents) FILTER (WHERE o.image_url IS NOT NULL))[1] AS img
    FROM master_products m
    JOIN affiliate_offers o ON o.master_product_id = m.id
    JOIN affiliate_networks n ON n.id = o.network_id
    WHERE m.vertical = 'games' AND m.product_type = 'game' AND NOT (m.attributes ? 'mergedInto') AND ${aptaSql()}
      AND m.name !~* '(c[aâ]mera|controle|joystick|capa para|case |suporte|cabo |carregador|pel[ií]cula|headset|amiibo)'
      AND (n.slug <> 'amazon' OR o.last_checked_at > now() - make_interval(mins => ${amazonFrescorMin()}::int))
    GROUP BY m.id
    HAVING min(o.current_price_cents) <= ${VITRINE_TETO_CENTAVOS}
    ORDER BY count(*) DESC, m.id`));
  // 60 por família (PlayStation, Xbox, Switch 1, Switch 2), mais ofertas primeiro: o rodízio de cada família tem profundidade e nenhuma é engolida pela outra.
  const cont = new Map<string, number>();
  const r = tudo.filter((x) => {
    const f = familiaDe(x.plat) ?? 'outra';
    const c = (cont.get(f) ?? 0) + 1;
    cont.set(f, c);
    return c <= 60;
  });
  const base: JogoVitrine[] = r.map((x) => ({
    masterId: x.mid, gen: x.plat, slug: x.slug, titulo: x.name, plataforma: GAME_PLATFORM_GEN_LABELS[x.plat] ?? '', precoCentavos: x.minp, ofertas: x.n, imagem: x.img,
  }));
  const met = await getOfferListingMetrics(r.map((x) => x.oid)).catch(() => new Map());
  const porOferta = new Map(r.map((x) => [x.mid, x.oid]));
  return base.map((j) => {
    const m = met.get(porOferta.get(j.masterId) ?? '');
    return m ? { ...j, elegivel: m.eligibility?.eligible === true, veredito: m.verdict?.kind ?? null, deltaPct: m.verdict?.deltaPercent != null ? -m.verdict.deltaPercent : null } : j;
  });
}

async function fotosDoTop(top: readonly JogoVitrine[]): Promise<Array<string | null>> {
  const um = async (j: JogoVitrine) => {
    if (!j.imagem) return null;
    try {
      const { cover } = await resolveCover([j.imagem]);
      return cover ? `data:${cover.type};base64,${cover.buf.toString('base64')}` : null;
    } catch { return null; }
  };
  // Foto que demorar demais fica de fora (a capa usa a inicial): a vitrine nunca atrasa por causa de imagem.
  const limite = new Promise<null>((r) => setTimeout(() => r(null), 14_000));
  return Promise.all(top.map((j) => Promise.race([um(j), limite])));
}

export interface ResultadoVitrine { acao: string; enviados?: number; motivo?: string; messageId?: string; candidatos?: number; ms: number }

export async function rodarVitrineGames(o: { now?: Date; dry?: boolean; force?: boolean } = {}): Promise<ResultadoVitrine & { legenda?: string; capa?: Buffer; top?: JogoVitrine[] }> {
  const t0 = Date.now();
  const now = o.now ?? new Date();
  if (!vitrineLigada()) return { acao: 'desligada', ms: 0 };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!o.dry && (!token || !chatId)) return { acao: 'sem_destino', ms: 0 };
  if (!o.dry && !o.force) {
    const ult = rows<{ s: string }>(await db.execute(sql`SELECT started_at::text AS s FROM collector_runs WHERE job = ${JOB_VITRINE_GAMES} AND status = 'ok' ORDER BY started_at DESC LIMIT 1`))[0];
    if (ult && now.getTime() - new Date(ult.s).getTime() < (VITRINE_INTERVALO_MIN - 3) * 60_000) return { acao: 'recente', ms: Date.now() - t0 };
  }
  const candidatos = await carregarJogosVitrine();
  // Rodízio: o que saiu nas últimas vitrines descansa (VITRINE_REPOUSO_RODADAS); prévias (dry) não contam.
  const recentes = rows<{ m: string[] | null }>(await db.execute(sql`SELECT meta->'masters' AS m FROM collector_runs WHERE job = ${JOB_VITRINE_GAMES} AND status = 'ok' ORDER BY started_at DESC LIMIT 12`)).map((x) => x.m ?? []);
  const top = escolherTopRodizio(candidatos, recentes, VITRINE_TOP);
  if (top.length < 3) return { acao: 'poucos_jogos', candidatos: candidatos.length, ms: Date.now() - t0 };
  const key = janelaKey(now);
  const hora = horaSP(now);
  const legenda = montarLegenda(top, hora, (i) => buildGoLink(top[i].slug, 'tg', `${key}-${i + 1}`));
  const capa = await renderCapaVitrine(top, hora, await fotosDoTop(top));
  if (o.dry) return { acao: 'previa', candidatos: candidatos.length, ms: Date.now() - t0, legenda, capa, top };
  const r = await sendTelegramGroupMessage({ token, chatId, text: legenda, photo: capa, silent: true });
  const ok = r.ok && r.photoSent !== false;
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
    VALUES (${JOB_VITRINE_GAMES}, 'telegram', ${now.toISOString()}::timestamptz, now(), ${Date.now() - t0}, ${r.ok ? 'ok' : 'error'}, ${top.length},
            ${JSON.stringify({ janela: key, messageId: r.messageId, erro: r.ok ? undefined : r.error, fotoSkipped: r.photoSkipped, masters: top.map((j) => j.masterId) })}::text::jsonb)`);
  return { acao: r.ok ? 'enviada' : 'falhou', enviados: r.ok ? 1 : 0, messageId: r.messageId, motivo: ok ? undefined : r.error, candidatos: candidatos.length, ms: Date.now() - t0 };
}
