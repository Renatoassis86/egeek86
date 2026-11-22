import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { GAME_PLATFORM_GEN_LABELS } from '@/lib/affiliate/labels';
import { buildGoLink } from '@/lib/messaging/group-messages';
import { sendTelegramGroupMessage } from '@/lib/messaging/telegram-send';
import { familiaDe, VITRINE_INTERVALO_MIN, VITRINE_PLATAFORMAS, VITRINE_TETO_CENTAVOS, VITRINE_TOP, escolherMenores, escolherTopRodizio, janelaKey, montarJogosVitrine, montarLegenda, montarLegendaPlataforma, vitrineLigada, vitrinePorPlataformaLigada, type CamadaBarra, type FaixaFoto, type JogoVitrine, type OfertaVitrine } from '@/lib/messaging/vitrine-games';
import { FOTO_NAO_NOVA_VERSAO } from '@/lib/catalog/foto-nao-nova';
import { amazonFrescorMin } from '@/lib/messaging/confirmacao-preco';
import { aptaSql } from '@/server/queries/ranking-busca';
import { getOfferListingMetrics } from '@/server/queries/affiliate';
import { resolveCover } from '@/server/messaging/card-cover';
import { renderCapaVitrine } from '@/server/messaging/vitrine-games-capa';
import type { GamePlatformGen } from '@/db/schema';

export const JOB_VITRINE_GAMES = 'vitrine-games';
const rows = <T>(r: unknown) => r as unknown as T[];
const horaSP = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Flag de rollback da camada de foto (b)+(c): VITRINE_FOTO=off ignora a tabela de pontuacao (a camada de condicao (a) continua). */
export const vitrineFotoLigada = (env: Record<string, string | undefined> = process.env) => !/^(0|off|false|nao|não)$/i.test((env.VITRINE_FOTO ?? '').trim());

/**
 * R-116: ofertas APTAS de jogos NOVOS com preco ate o teto (R$ 250), por OFERTA (titulo do anuncio, vendedor e pontuacao de foto), com link de afiliado publicavel e leitura fresca
 * (Amazon: mesma janela das outras lojas, R-101). `ofertasDoMaster` e o total de ofertas aptas do produto (diagnostico). A pontuacao vem de `vitrine_foto_pontuacao` (script fora do envio).
 */
export async function carregarOfertasVitrine(): Promise<OfertaVitrine[]> {
  const fotoOn = vitrineFotoLigada();
  const r = rows<{ oid: string; slug: string; titulo: string; loja: string | null; p: number; img: string | null; mid: string; nome: string; plat: GamePlatformGen; n: number; faixa: string | null; idade: number | null }>(await db.execute(sql`
    SELECT * FROM (
      SELECT o.id::text AS oid, o.slug::text AS slug, o.title AS titulo, o.store_name AS loja, o.current_price_cents::int AS p, o.image_url AS img,
             m.id::text AS mid, m.name AS nome, m.game_platform_gen AS plat, (count(*) OVER (PARTITION BY m.id))::int AS n,
             fp.faixa AS faixa, (extract(epoch FROM now() - fp.pontuado_em) / 86400.0)::float8 AS idade
      FROM master_products m
      JOIN affiliate_offers o ON o.master_product_id = m.id
      JOIN affiliate_networks n ON n.id = o.network_id
      LEFT JOIN vitrine_foto_pontuacao fp ON fp.url_hash = md5(o.image_url) AND fp.versao = ${FOTO_NAO_NOVA_VERSAO}
      WHERE m.vertical = 'games' AND m.product_type = 'game' AND NOT (m.attributes ? 'mergedInto') AND ${aptaSql()} AND o.quarantined_at IS NULL
        AND m.name !~* '(c[aâ]mera|controle|joystick|capa para|case |suporte|cabo |carregador|pel[ií]cula|headset|amiibo)'
        AND (n.slug <> 'amazon' OR o.last_checked_at > now() - make_interval(mins => ${amazonFrescorMin()}::int))
    ) x
    WHERE x.p <= ${VITRINE_TETO_CENTAVOS}
    LIMIT 8000`));
  return r.map((x) => ({
    ofertaId: x.oid, masterId: x.mid, slug: x.slug, tituloOferta: x.titulo, vendedor: x.loja, masterNome: x.nome, gen: x.plat, plataforma: GAME_PLATFORM_GEN_LABELS[x.plat] ?? '',
    precoCentavos: x.p, imagem: x.img, ofertasDoMaster: x.n,
    fotoFaixa: fotoOn ? ((x.faixa as FaixaFoto | null) ?? null) : 'baixo', fotoIdadeDias: fotoOn ? x.idade : 0,
  }));
}

export interface CarregadoVitrine { jogos: JogoVitrine[]; barradas: Record<CamadaBarra, number>; barradasPorGen: Record<string, Record<CamadaBarra, number>>; ofertas: number }

/** Jogos NOVOS elegiveis (3 camadas, R-116) com diagnostico do preco, prontos para o rodizio ou para os 10 menores de cada plataforma. */
export async function carregarJogosVitrine(): Promise<CarregadoVitrine> {
  const ofertas = await carregarOfertasVitrine();
  const { jogos: todos, barradas } = montarJogosVitrine(ofertas);
  // contagem de barradas por plataforma (para a medicao)
  const barradasPorGen: Record<string, Record<CamadaBarra, number>> = {};
  for (const p of VITRINE_PLATAFORMAS) barradasPorGen[p.key] = montarJogosVitrine(ofertas.filter((o) => !!o.gen && p.gens.includes(o.gen))).barradas;
  // Diagnostico so para quem pode aparecer: 60 por familia (mais ofertas primeiro, rodizio) + os 40 mais baratos de cada geracao (vitrine por plataforma).
  const gens = new Map<string, JogoVitrine[]>();
  for (const j of todos) (gens.get(j.gen ?? 'outra') ?? gens.set(j.gen ?? 'outra', []).get(j.gen ?? 'outra')!).push(j);
  const pool = new Map<string, JogoVitrine>();
  const fam = new Map<string, number>();
  for (const j of [...todos].sort((a, b) => b.ofertas - a.ofertas || a.masterId.localeCompare(b.masterId))) {
    const f = familiaDe(j.gen) ?? 'outra';
    const c = (fam.get(f) ?? 0) + 1;
    fam.set(f, c);
    if (c <= 60) pool.set(j.masterId, j);
  }
  for (const l of gens.values()) for (const j of l.sort((a, b) => a.precoCentavos - b.precoCentavos).slice(0, 40)) pool.set(j.masterId, j);
  const r = [...pool.values()];
  const oidPorMaster = new Map<string, string>();
  for (const o of ofertas) { const j = pool.get(o.masterId); if (j && j.slug === o.slug) oidPorMaster.set(o.masterId, o.ofertaId); }
  const met = await getOfferListingMetrics([...oidPorMaster.values()]).catch(() => new Map());
  const jogos = r.map((j) => {
    const m = met.get(oidPorMaster.get(j.masterId) ?? '');
    return m ? { ...j, elegivel: m.eligibility?.eligible === true, veredito: m.verdict?.kind ?? null, deltaPct: m.verdict?.deltaPercent != null ? -m.verdict.deltaPercent : null } : j;
  });
  return { jogos, barradas, barradasPorGen, ofertas: ofertas.length };
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
  const carregado = await carregarJogosVitrine();
  const candidatos = carregado.jogos;
  if (vitrinePorPlataformaLigada()) return rodarVitrinesPorPlataforma({ now, dry: !!o.dry, force: !!o.force, candidatos, barradasPorGen: carregado.barradasPorGen, token, chatId, t0 });
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

/**
 * VITRINE POR PLATAFORMA (dono, 2026-11-20): uma mensagem com cartão para cada plataforma (Switch 1, Switch 2, Xbox One/Series, PS5, PS4), sempre os 10 menores preços até R$ 200.
 * Cada plataforma tem a sua trava de 27 min (collector_runs job `vitrine-games:<chave>`): falha numa não repete as outras. Os cartões são montados em paralelo e enviados em sequência.
 */
async function rodarVitrinesPorPlataforma(a: { now: Date; dry: boolean; force: boolean; candidatos: JogoVitrine[]; barradasPorGen: Record<string, Record<CamadaBarra, number>>; token?: string; chatId?: string; t0: number }): Promise<ResultadoVitrine & { legenda?: string; capa?: Buffer; top?: JogoVitrine[]; plataformas?: Array<Record<string, unknown>> }> {
  const hora = horaSP(a.now);
  const key = janelaKey(a.now);
  const jobDe = (k: string) => `${JOB_VITRINE_GAMES}:${k}`;
  const pendentes: typeof VITRINE_PLATAFORMAS[number][] = [];
  for (const p of VITRINE_PLATAFORMAS) {
    if (!a.dry && !a.force) {
      const ult = rows<{ s: string }>(await db.execute(sql`SELECT started_at::text AS s FROM collector_runs WHERE job = ${jobDe(p.key)} AND status = 'ok' ORDER BY started_at DESC LIMIT 1`))[0];
      if (ult && a.now.getTime() - new Date(ult.s).getTime() < (VITRINE_INTERVALO_MIN - 3) * 60_000) continue;
    }
    pendentes.push(p);
  }
  if (!pendentes.length) return { acao: 'recente', candidatos: a.candidatos.length, ms: Date.now() - a.t0 };
  const montados = await Promise.all(pendentes.map(async (p) => {
    const top = escolherMenores(a.candidatos, p.gens, VITRINE_TOP); // R-116: candidatos ja sao so jogos NOVOS (3 camadas); quem sai, o proximo mais barato elegivel repoe
    if (top.length < 1) return { p, top, legenda: "", capa: null as Buffer | null };
    const legenda = montarLegendaPlataforma(top, hora, p.rotulo, p.gens.length > 1, (i) => buildGoLink(top[i].slug, 'tg', `${key}-${p.key.replace(/_/g, '')}-${i + 1}`));
    const capa = await renderCapaVitrine(top, hora, await fotosDoTop(top), p.rotulo);
    return { p, top, legenda, capa };
  }));
  const resumo: Array<Record<string, unknown>> = [];
  let enviados = 0;
  for (const m of montados) {
    if (!m.capa) { resumo.push({ plataforma: m.p.key, acao: 'poucos_jogos', jogos: m.top.length }); continue; }
    if (a.dry) { resumo.push({ plataforma: m.p.key, acao: 'previa', jogos: m.top.length, barradas: a.barradasPorGen[m.p.key], titulos: m.top.map((j) => j.titulo.slice(0, 40)), menor: m.top[0]?.precoCentavos, maior: m.top[m.top.length - 1]?.precoCentavos, legendaChars: m.legenda.length, capaBytes: m.capa.length }); continue; }
    const t1 = Date.now();
    const r = await sendTelegramGroupMessage({ token: a.token as string, chatId: a.chatId as string, text: m.legenda, photo: m.capa, silent: true });
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
      VALUES (${jobDe(m.p.key)}, 'telegram', ${a.now.toISOString()}::timestamptz, now(), ${Date.now() - t1}, ${r.ok ? 'ok' : 'error'}, ${m.top.length},
              ${JSON.stringify({ janela: key, plataforma: m.p.key, messageId: r.messageId, erro: r.ok ? undefined : r.error, fotoSkipped: r.photoSkipped, masters: m.top.map((j) => j.masterId), teto: VITRINE_TETO_CENTAVOS, menor: m.top[0]?.precoCentavos, maior: m.top[m.top.length - 1]?.precoCentavos, barradas: a.barradasPorGen[m.p.key] })}::text::jsonb)`);
    if (r.ok) enviados++;
    resumo.push({ plataforma: m.p.key, acao: r.ok ? 'enviada' : 'falhou', jogos: m.top.length, messageId: r.messageId, erro: r.ok ? undefined : r.error });
    await new Promise((res) => setTimeout(res, 3_000));
  }
  // O job de controle da vitrine única também registra a rodada (a trava de 27 min e o monitor de saúde continuam enxergando a atividade).
  if (!a.dry && enviados > 0) {
    await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, checked, meta)
      VALUES (${JOB_VITRINE_GAMES}, 'telegram', ${a.now.toISOString()}::timestamptz, now(), ${Date.now() - a.t0}, 'ok', ${enviados}, ${JSON.stringify({ janela: key, porPlataforma: true, plataformas: resumo.map((x) => x.plataforma) })}::text::jsonb)`);
  }
  return { acao: a.dry ? 'previa' : enviados > 0 ? 'enviada' : 'falhou', enviados, candidatos: a.candidatos.length, ms: Date.now() - a.t0, plataformas: resumo, top: montados[0]?.top };
}
