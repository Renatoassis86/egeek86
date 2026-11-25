import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getAdTag } from '@/lib/messaging/group-config';
import { GROUP_LINK_BASE } from '@/lib/messaging/group-messages';
import { classificarTipo } from '@/lib/catalog/tipos-produto';
import { ehItemMiudoOuDuvida } from '@/lib/catalog/item-miudo';
import { beneficiosVivosPorOferta } from '@/server/coupons/card-benefits';
import { rotuloBeneficioCartao } from '@/lib/coupons/card-benefit';
import { linhasFretePrazoPorOferta } from '@/server/shipping/frete-prazo';
import { sendTelegramGroupMessage } from '@/lib/messaging/telegram-send';
import { linkPublicavelFilter } from '@/server/queries/public-offers';
import { auditarUrlsDeMensagem, resumoViolacoes } from '@/lib/affiliate/link-afiliado';
import { lookupItemCouponDetail } from '@/server/messaging/coupon-item-lookup';
import { amazonForaDasMensagens, amazonFrescorMin, amazonNoPrivado, avaliarConfirmacao, confirmacaoLigada, rigidoPrivadoLigado, itemIdDaUrl, quedaDoMesmoAnuncio, type Veredito } from '@/lib/messaging/confirmacao-preco';
import { ultimosVereditos } from '@/server/links/auditoria-links';
import { asinDaUrl, decidirPrecoAmazon } from '@/lib/precos-fontes/resolver';
import { leiturasExternasPorAsin } from '@/server/precos-fontes/leituras';
import { decidir, INTERVALO_MIN_MS, JANELA_MINIMO_DIAS, type MenorPreco } from '@/lib/coupons/monitor-preco-impressoras';
import {
  alvosLigados, TOP_POR_MODELO, INTERVALO_RODADA_MS, MAX_QUEDAS_POR_CICLO, MASTERS_PRIVADO, montarPaineis, secaoDe, textoQuedaSeguro,
  type Alvo, type GatilhoIndividual, type OfertaPainel, type SaidaPaineis,
} from '@/lib/messaging/painel-impressoras';

/**
 * LISTA das impressoras 3D no chat PRIVADO do dono (#117; o CANAL não recebe lista nem painel, decisão do dono 2026-11-15):
 *  - a cada 10 min uma lista NOVA (silenciosa, sem foto) com TODAS as impressoras ativas, frescas (24 h) e fora da quarentena do ML e da Amazon,
 *    combos P2S/P1S primeiro; a lista do ciclo anterior é APAGADA (deleteMessage) quando a nova termina;
 *  - queda de preço por anúncio (>= 2% ou R$ 50 sobre o último preço visto, ou novo mínimo de 14 dias do anúncio): mensagem INDIVIDUAL com som,
 *    no máximo 6 por ciclo (combos primeiro, maiores quedas primeiro), cooldown de 2 h por oferta; reutiliza `decidir` do monitor #114.
 * Estado em collector_runs (sem tabela nova): 'lista-impressoras' (lista congelada do ciclo + preços), 'lista-impressoras-privado' (cursor e ids
 * de mensagem do destino), 'lista-impressoras-queda' (cooldown). Flag PAINEL_IMPRESSORAS (1/on/privado liga; padrão desligada).
 * Roda no cron de group-messages (a cada minuto) com o tempo que sobra; 1,2 s entre chamadas; 429 pausa e retoma no cursor. Nunca lança.
 * Nunca imprime token nem chat id.
 */
const ESPACO_MS = 1200;
const MIN_CHAMADA_MS = 2500;
const JOB_LISTA = 'lista-impressoras';
const JOB_QUEDA = 'lista-impressoras-queda';
const jobDestino = (alvo: Alvo) => `lista-impressoras-${alvo}`;
const JOB_LEGADO = (alvo: Alvo) => `painel-impressoras-${alvo}`;

interface ItemTexto { key: string; rede: 'mercado-livre' | 'amazon'; text: string }
interface QuedaTexto { oferta: string; text: string; url?: string | null; gatilho?: string }
interface ListaCongelada { inicio: string; listas: ItemTexto[]; quedas: QuedaTexto[]; precos: Record<string, number>; itens?: Record<string, string>; ids?: string[]; foraPorConfirmacao?: number; ativosMl: number; ativosAmazon: number; problemas: string[] }
interface Estado { lista: string | null; cursor: number; ids: (string | null)[]; apagar: string[]; aberta: boolean; pausaAte: Date | null }

export interface ResultadoAlvo {
  alvo: Alvo;
  acao: 'recente' | 'pausado' | 'sem_destino' | 'sem_lista' | 'em_andamento' | 'concluida' | 'erro';
  chamadas?: number; enviados?: number; quedas?: number; cards?: number; apagados?: number; erros?: number; partes?: number; cursor?: number; erro?: string;
}
export interface ResultadoPaineis { ligado: boolean; alvos: ResultadoAlvo[]; gerada?: boolean; ativosMl?: number; ativosAmazon?: number; quedas?: number; problemas?: string[] }

interface RowOferta {
  id: string; master_id: string; master_name: string; title: string | null; rede: string; loja: string | null; price: string; url: string | null; slug: string;
  checked: Date | string; rating: string | null; nivel: string | null;
  pix?: string | null; conf: Date | string | null; miss: string | null; item: string | null; link_item: string | null; cat: string | null; pchg: Date | string | null; itroca: Date | string | null;
}

/** Qualificador do preço de destaque ("à vista no Pix") e parcelado, SÓ do que a página do item mostrou (benefícios verificados). */
function rotulosDePagamento(bs: (Parameters<typeof rotuloBeneficioCartao>[0] & { kind: string })[], cents: number, pixCents: number | null | undefined): { aVista: string | null; parcelado: string | null } {
  const p = bs.find((b) => b.kind === 'parcelas' && b.noInterest);
  // R-69: o preço da lista é o CHEIO; o Pix é atributo da oferta (pix_cents) e só aparece como "ou R$ X à vista no Pix" quando a página o mostrou e ele é menor.
  const aVista = pixCents && pixCents > 0 && pixCents < cents ? `ou R$ ${(pixCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} à vista no Pix` : null;
  return { aVista, parcelado: p ? rotuloBeneficioCartao(p) : null };
}

const id12 = (id: string) => id.replace(/-/g, '').slice(0, 12);

/** Impressoras (aparelhos) do ML e da Amazon: tipo 'impressoras' do site; sem item miúdo; ativas, <= 24 h, sem quarentena. */
export type OfertaCarregada = OfertaPainel & { id: string; confQueda?: Veredito; itemId?: string | null };

/** Ofertas fora da LISTA por falta de confirmação fresca (#119): preenchido a cada carregamento, lido por gerarLista. */
let foraDaLista = 0;

export async function carregarOfertasImpressoras(now: Date): Promise<OfertaCarregada[]> {
  foraDaLista = 0;
  const rows = (await db.execute<RowOferta & Record<string, unknown>>(sql`
    SELECT o.id::text AS id, m.id::text AS master_id, m.name AS master_name, o.title, nn.slug AS rede,
           COALESCE(NULLIF(o.store_name, ''), s.nickname) AS loja, o.current_price_cents::text AS price,
           o.affiliate_url AS url, o.slug, o.last_checked_at AS checked,
           o.pix_cents::text AS pix, o.last_price_confirmed_at AS conf, o.consecutive_miss_count::text AS miss, o.external_item_id AS item, o.link_item_id AS link_item, o.external_ref AS cat, o.last_price_change_at AS pchg, o.item_trocado_at AS itroca, s.positive_rating_percent::text AS rating, s.reputation_level AS nivel
    FROM affiliate_offers o
    JOIN affiliate_networks nn ON nn.id = o.network_id
    JOIN master_products m ON m.id = o.master_product_id
    LEFT JOIN affiliate_sellers s ON s.id = o.seller_id
    WHERE o.status = 'active' AND o.quarantined_at IS NULL AND ${linkPublicavelFilter('o')} AND o.vertical = 'impressao3d' AND o.current_price_cents > 0
      AND (nn.slug <> 'mercado-livre' OR o.seller_id IS NOT NULL) /* placeholder ML (sem vendedor) guarda o MENOR preço do catálogo e tem link de UM anúncio: preço e link divergem por desenho (93607216) */ AND nn.slug IN ('mercado-livre', 'amazon') ${amazonForaDasMensagens() && !amazonNoPrivado() ? sql`AND nn.slug <> 'amazon'` : sql``} AND o.last_checked_at > now() - interval '24 hours'
      AND m.id::text IN (${sql.join(MASTERS_PRIVADO.map((i) => sql`${i}`), sql`, `)})`)) as unknown as RowOferta[];
  // R-82 (camadas de fonte): leitura externa fresca (oficial/Keepa) CONFIRMA o par conhecido (estende o frescor, mesmo com o Chrome parado) ou VETA (divergente).
  try {
    const externas = await leiturasExternasPorAsin(rows.filter((r) => r.rede === 'amazon').map((r) => asinDaUrl(r.url) ?? ''));
    for (const r of rows) {
      if (r.rede !== 'amazon') continue;
      const ext = externas.get(asinDaUrl(r.url) ?? '') ?? [];
      if (!ext.length) continue;
      const d = decidirPrecoAmazon({ precoCents: Number(r.price), pixCents: r.pix != null ? Number(r.pix) : null, lidoEm: r.conf ? new Date(r.conf) : null }, ext, now);
      if (d.ok) r.conf = d.validoEm;
      else if (d.motivo === 'divergente' || d.motivo === 'indisponivel_na_fonte') r.conf = null;
    }
  } catch { /* sem camada externa: vale o Chrome (R-81) */ }
  const ligada = confirmacaoLigada();
  const audit = ligada ? await ultimosVereditos(rows.map((r) => r.id)) : new Map<string, { verdict: string; checkedAt: Date; okEm: Date | null }>();
  const fatos = (r: RowOferta, uso: 'queda' | 'lista') => avaliarConfirmacao({
    uso, rede: r.rede, status: 'active', quarantined: false, confirmedAt: r.conf ? new Date(r.conf) : null, missCount: r.miss != null ? Number(r.miss) : 0,
    priceItemId: r.item, catalogoRef: r.cat, linkItemId: r.link_item ?? itemIdDaUrl(r.url), auditoria: audit.get(r.id) ?? null, estrito: ligada && rigidoPrivadoLigado(), liberaAmazon: amazonNoPrivado(), precoMudouEm: r.pchg ? new Date(r.pchg) : null, itemTrocadoEm: r.itroca ? new Date(r.itroca) : null, now,
  }, ligada);
  // Lista: preço confirmado há <= 6 h e anúncio achado na última coleta; sem isso a oferta NÃO entra na lista (nunca "preço a confirmar" inventado).
  const aprovadas = rows.filter((r) => { const v = fatos(r, 'lista'); if (!v.ok) foraDaLista++; return v.ok; });
  const base = aprovadas
    .filter((r) => classificarTipo('impressao3d', r.master_name) === 'impressoras')
    .filter((r) => !ehItemMiudoOuDuvida(r.master_name, Number(r.price), 'general', 'impressao3d'))
    .map((r) => ({
      id: r.id, title: r.title, masterId: r.master_id, masterName: r.master_name, rede: r.rede, loja: r.loja, cents: Number(r.price), pixCents: r.pix ? Number(r.pix) : null,
      confQueda: fatos(r, 'queda'), itemId: r.item,
      url: r.url || (r.slug ? `${GROUP_LINK_BASE}/go/${encodeURIComponent(r.slug)}` : null), checkedAt: new Date(r.checked),
      reputacao: r.rating ? `${Math.round(Number(r.rating))}% de avaliações positivas` : null,
    }));
  // Cartão: todas as ofertas (uma consulta). Cupom lido na página: só os 8 menores de cada modelo em destaque e rede (as demais saem sem cupom).
  const cartoes = await beneficiosVivosPorOferta(base.map((o) => o.id)).catch(() => new Map());
  const alvos = new Map<string, typeof base>();
  for (const o of base) {
    const sc = secaoDe(o);
    if (!sc.destaque) continue;
    const k = `${sc.chave}|${o.rede}`;
    alvos.set(k, [...(alvos.get(k) ?? []), o]);
  }
  const top = [...alvos.values()].flatMap((l) => l.sort((a, b) => a.cents - b.cents).slice(0, 8));
  const cupons = new Map<string, { final: number; nome: string | null }>();
  await Promise.all(top.map(async (o) => {
    try {
      const r = await lookupItemCouponDetail(o.id, undefined, now);
      if (r && r.detail.finalCents > 0 && r.detail.finalCents < o.cents) cupons.set(o.id, { final: r.detail.finalCents, nome: r.detail.named ? r.detail.name : null });
    } catch { /* sem cupom */ }
  }));
  return base.map((o): OfertaCarregada => {
    const bs = ((cartoes.get(o.id) ?? []) as (Parameters<typeof rotuloBeneficioCartao>[0] & { needsConfirm: boolean; kind: string })[])
      .filter((b) => b.kind !== 'parcelas' && b.kind !== 'preco_a_vista')
      .map((b) => ({ rotulo: rotuloBeneficioCartao(b), needsConfirm: b.needsConfirm }))
      .filter((b): b is { rotulo: string; needsConfirm: boolean } => !!b.rotulo);
    const c = cupons.get(o.id);
    const todos = (cartoes.get(o.id) ?? []) as (Parameters<typeof rotuloBeneficioCartao>[0] & { kind: string })[];
    const { aVista, parcelado } = rotulosDePagamento(todos, o.cents, (o as { pixCents?: number | null }).pixCents);
    return { ...o, cupomFinalCents: c?.final ?? null, cupomNome: c?.nome ?? null, beneficios: bs, aVista, parcelado };
  });
}

/**
 * Porteiro NO ENVIO (#119, achado 17): a lista congelada é entregue em partes nos minutos seguintes. Se alguma oferta da lista mudou de preço, trocou
 * de anúncio, saiu da coleta ou foi desativada DEPOIS do congelamento, a lista (e os cards) é regenerada antes de enviar mais nada.
 */
async function mudouDesdeCongelamento(L: ListaCongelada): Promise<number> {
  const ids = L.ids ?? [];
  if (!ids.length) return 0;
  const rows = (await db.execute(sql`
    SELECT count(*)::int AS n FROM affiliate_offers
    WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})
      AND (last_price_change_at > ${L.inicio}::timestamptz OR item_trocado_at > ${L.inicio}::timestamptz OR status <> 'active' OR consecutive_miss_count > 0 OR quarantined_at IS NOT NULL
    )`)) as unknown as { n: number }[];
  let mudou = Number(rows[0]?.n ?? 0);
  // R-81/R-82: a lista e entregue em partes; preco de Amazon que perdeu a validade (45 min do Chrome, ou confirmacao externa vencida/divergente) obriga a regenerar.
  try {
    const amz = (await db.execute(sql`
      SELECT o.affiliate_url AS url, o.current_price_cents::text AS price, o.pix_cents::text AS pix, o.last_price_confirmed_at AS conf
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
      WHERE n.slug = 'amazon' AND o.id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`)) as unknown as { url: string | null; price: string; pix: string | null; conf: Date | string | null }[];
    if (amz.length) {
      const ext = await leiturasExternasPorAsin(amz.map((a) => asinDaUrl(a.url) ?? ''));
      const agora = new Date();
      for (const a of amz) {
        const d = decidirPrecoAmazon({ precoCents: Number(a.price), pixCents: a.pix != null ? Number(a.pix) : null, lidoEm: a.conf ? new Date(a.conf) : null }, ext.get(asinDaUrl(a.url) ?? '') ?? [], new Date(agora.getTime() - 15 * 60_000));
        if (!d.ok) mudou++;
      }
    }
  } catch { /* sem checagem de Amazon: o carregamento seguinte ja aplica a regra */ }
  return mudou;
}

async function ultimaLista(): Promise<ListaCongelada | null> {
  const r = (await db.execute<{ meta: ListaCongelada | null }>(sql`SELECT meta FROM collector_runs WHERE job = ${JOB_LISTA} AND status = 'ok' ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: ListaCongelada | null }[];
  return r[0]?.meta ?? null;
}

async function gravar(job: string, status: 'ok' | 'error', ms: number, meta: Record<string, unknown>): Promise<void> {
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES (${job}, 'telegram', now(), now(), ${Math.round(ms)}, ${status}, ${JSON.stringify(meta)}::jsonb)`);
}

/** Gera a lista do ciclo (e os cards individuais) e a congela em collector_runs. gravarLista=false = pré-visualização (nada é gravado). */
export async function gerarLista(now: Date, gravarLista = true): Promise<ListaCongelada> {
  const t0 = Date.now();
  const ofertas = await carregarOfertasImpressoras(now);
  const anterior = await ultimaLista();
  const prev = anterior && now.getTime() - new Date(anterior.inicio).getTime() < 3 * 3600_000 ? anterior.precos : null;
  const comAnterior: OfertaCarregada[] = ofertas.map((o) => ({ ...o, anteriorCents: prev ? (prev[id12(o.id)] ?? null) : null }));
  // Frete e prazo (#118): só nos 20 primeiros itens de cada rede (P2S Combo primeiro) para não estourar 4096. Sem leitura fresca: 'Prazo ainda não lido'.
  try {
    for (const rede of ['mercado-livre', 'amazon']) {
      const porModelo = new Map<string, number>();
      const ord = comAnterior.filter((o) => o.rede === rede).sort((a, b) => a.cents - b.cents).filter((o) => { const k = secaoDe(o).chave; const n = porModelo.get(k) ?? 0; porModelo.set(k, n + 1); return n < TOP_POR_MODELO; });
      const linhas = await linhasFretePrazoPorOferta(ord.map((o) => o.id), now);
      for (const o of ord) o.fretePrazo = linhas.get(o.id) ?? 'Prazo ainda não lido';
    }
  } catch { /* sem frete: a lista sai sem a linha */ }

  // Cards individuais (foto + legenda, com som): queda >= 2% e R$ 50, novo mínimo de 14 dias do modelo, cupom novo, cartão novo.
  // Cooldown de 2 h por oferta; no máximo 6 por ciclo (P2S Combo primeiro). Estado em collector_runs (JOB_QUEDA: meta.oferta e meta.chave).
  const quedas: QuedaTexto[] = [];
  const problemas: string[] = [];
  const recentes = (await db.execute<{ oferta: string }>(sql`SELECT meta->>'oferta' AS oferta FROM collector_runs WHERE job = ${JOB_QUEDA} AND started_at > now() - ${INTERVALO_MIN_MS / 1000}::int * interval '1 second'`)) as unknown as { oferta: string }[];
  const emCooldown = new Set(recentes.map((r) => r.oferta));
  const vistas = new Set(((await db.execute<{ chave: string }>(sql`SELECT meta->>'chave' AS chave FROM collector_runs WHERE job = ${JOB_QUEDA} AND started_at > now() - interval '7 days' AND meta->>'chave' IS NOT NULL`)) as unknown as { chave: string }[]).map((r) => r.chave));
  const masters = [...new Set(comAnterior.map((o) => o.masterId))];
  const mins = masters.length ? ((await db.execute<{ mid: string; mn: string }>(sql`
    SELECT af.master_product_id::text AS mid, min(s.price_cents)::text AS mn FROM affiliate_price_snapshots s JOIN affiliate_offers af ON af.id = s.offer_id
    WHERE af.master_product_id::text IN (${sql.join(masters.map((i) => sql`${i}`), sql`, `)}) AND s.collected_at > now() - (${JANELA_MINIMO_DIAS}::int * interval '1 day') AND s.collected_at < now() - interval '30 minutes'
    GROUP BY 1`)) as unknown as { mid: string; mn: string }[]) : [];
  const min14 = new Map(mins.map((m) => [m.mid, Number(m.mn)]));
  type Cand = { o: (typeof comAnterior)[number]; gatilho: GatilhoIndividual; chave: string; prio: number; queda: number };
  const cands: Cand[] = [];
  const chavesCartao = new Set<string>();
  for (const o of comAnterior) {
    if (emCooldown.has(o.id)) continue;
    // #119: card individual (queda, mínimo, cupom, cartão) só sai com preço confirmado há <= 60 min e link no mesmo anúncio do preço.
    if (o.confQueda && !o.confQueda.ok) { problemas.push(`card ${id12(o.id)} retido: ${o.confQueda.nota}`); continue; }
    const sc = secaoDe(o);
    const base = sc.ordemFixa * 1_000_000;
    // Queda só entre leituras do MESMO anúncio: troca de anúncio do vendedor não é queda (A1 Combo, 15/11).
    const mesmoItem = quedaDoMesmoAnuncio(anterior?.itens?.[id12(o.id)], o.itemId);
    if (!mesmoItem) problemas.push(`queda ${id12(o.id)} descartada: troca de anúncio (${anterior?.itens?.[id12(o.id)]} para ${o.itemId})`);
    if (mesmoItem && o.anteriorCents && o.cents < o.anteriorCents) {
      const atual: MenorPreco = { chave: o.id, rotulo: o.masterName, cents: o.cents, rede: o.rede, loja: o.loja, slug: '' };
      const acao = decidir({ atual, base: { cents: o.anteriorCents, rede: o.rede }, min14: min14.get(o.masterId) ?? null, ultimoAvisoEm: null, now });
      if (acao === 'queda' || acao === 'minimo') { cands.push({ o, gatilho: acao, chave: `${o.id}|q|${o.cents}`, prio: base, queda: o.anteriorCents - o.cents }); continue; }
    }
    if (o.cupomFinalCents != null && o.cupomFinalCents > 0 && o.cupomFinalCents < o.cents) {
      const chave = `${o.id}|c|${o.cupomNome ?? ''}|${o.cupomFinalCents}`;
      if (!vistas.has(chave)) { cands.push({ o, gatilho: 'cupom', chave, prio: 100_000_000 + base, queda: 0 }); continue; }
    }
    const b = (o.beneficios ?? [])[0];
    if (b) {
      const chave = `card|${o.masterId}|${o.rede}|${b.rotulo}`;
      if (!vistas.has(chave) && !chavesCartao.has(chave)) { chavesCartao.add(chave); cands.push({ o, gatilho: 'cartao', chave, prio: 200_000_000 + base, queda: 0 }); }
    }
  }
  cands.sort((a, b) => a.prio - b.prio || b.queda - a.queda);
  const escolhidas: { oferta: string; chave: string }[] = [];
  for (const c of cands.slice(0, MAX_QUEDAS_POR_CICLO)) {
    const o = c.o;
    let cupom: { nome: string | null; finalCents: number; passo: string | null } | null = null;
    try {
      const r = await lookupItemCouponDetail(o.id, undefined, now);
      if (r && r.detail.finalCents > 0 && r.detail.finalCents < o.cents) cupom = { nome: r.detail.named ? r.detail.name : null, finalCents: r.detail.finalCents, passo: r.detail.activation || null };
    } catch { /* sem cupom */ }
    const bens = ((await beneficiosVivosPorOferta([o.id]).catch(() => new Map())).get(o.id) ?? []) as (Parameters<typeof rotuloBeneficioCartao>[0] & { needsConfirm: boolean; kind: string; finalPriceCents: number | null })[];
    const pagto = rotulosDePagamento(bens, o.cents, (o as { pixCents?: number | null }).pixCents);
    const cartoes = bens.filter((b) => b.kind === 'cartao_pct' || b.kind === 'pix_pct').map((b) => ({ rotulo: rotuloBeneficioCartao(b) ?? '', finalCents: b.finalPriceCents, needsConfirm: b.needsConfirm })).filter((b) => b.rotulo);
    const minimo14 = min14.has(o.masterId) && o.cents < (min14.get(o.masterId) as number);
    const t = textoQuedaSeguro({
      gatilho: c.gatilho, rede: o.rede, titulo: o.title || o.masterName, loja: o.loja, reputacao: (o as { reputacao?: string | null }).reputacao ?? null, cents: o.cents,
      anteriorCents: c.gatilho === 'queda' || c.gatilho === 'minimo' ? o.anteriorCents : null, anteriorEm: anterior ? new Date(anterior.inicio) : null,
      minimo14, url: o.url, leituraEm: o.checkedAt, cupom, cartoes, aVista: pagto.aVista, parcelado: pagto.parcelado, adTag: getAdTag(),
      fretePrazo: (await linhasFretePrazoPorOferta([o.id], now).catch(() => new Map<string, string>())).get(o.id) ?? 'Prazo ainda não lido',
    });
    if (t.text) { quedas.push({ oferta: o.id, text: t.text, url: o.url, gatilho: c.gatilho }); escolhidas.push({ oferta: o.id, chave: c.chave }); }
    else problemas.push(`card ${id12(o.id)}: ${t.problemas.join('; ')}`);
  }
  const p: SaidaPaineis = montarPaineis({ ofertas: comAnterior, inicio: now, adTag: getAdTag() });
  const precos: Record<string, number> = {};
  const itens: Record<string, string> = {};
  const idsCompletos = ofertas.map((o) => o.id);
  for (const o of ofertas) { precos[id12(o.id)] = o.cents; if (o.itemId) itens[id12(o.id)] = o.itemId; }
  const lista: ListaCongelada = {
    inicio: now.toISOString(), listas: p.paineis.map((x) => ({ key: x.key, rede: x.rede, text: x.text })), quedas, precos, itens, ids: idsCompletos, foraPorConfirmacao: foraDaLista,
    ativosMl: p.ativosMl, ativosAmazon: p.ativosAmazon, problemas: [...problemas, ...p.problemas].slice(0, 8),
  };
  if (gravarLista) {
    await gravar(JOB_LISTA, 'ok', Date.now() - t0, lista as unknown as Record<string, unknown>);
    for (const q of escolhidas) await gravar(JOB_QUEDA, 'ok', 0, q);
    await db.execute(sql`DELETE FROM collector_runs WHERE job = ${JOB_LISTA} AND started_at < (SELECT min(started_at) FROM (SELECT started_at FROM collector_runs WHERE job = ${JOB_LISTA} ORDER BY started_at DESC LIMIT 3) x)`).catch(() => undefined);
  }
  return lista;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function scrub(s: string, token: string): string { return s.split(token).join('***').replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot***').slice(0, 200); }

interface RespTg { ok: boolean; status: number; desc: string; messageId?: string; retryAfter?: number }
async function tg(token: string, metodo: string, payload: Record<string, unknown>): Promise<RespTg> {
  // R-70 / L4: nenhuma lista/painel sai com URL de loja que não seja link de afiliado do dono (padrão negado).
  if (metodo === 'sendMessage' || metodo === 'sendPhoto') {
    const botoes = ((payload.reply_markup as { inline_keyboard?: { url?: string }[][] } | undefined)?.inline_keyboard ?? []).flat().map((b) => b.url);
    const v = auditarUrlsDeMensagem({ texto: String(payload.text ?? payload.caption ?? ''), botoes });
    if (v.length) return { ok: false, status: 0, desc: `link_fora_do_padrao_afiliado: ${resumoViolacoes(v)}` };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const b = ((await res.json().catch(() => ({}))) ?? {}) as { ok?: boolean; description?: string; result?: { message_id?: number }; parameters?: { retry_after?: number } };
    return { ok: res.status === 200 && b.ok === true, status: res.status, desc: scrub(String(b.description ?? `HTTP ${res.status}`), token), messageId: b.result?.message_id != null ? String(b.result.message_id) : undefined, retryAfter: b.parameters?.retry_after };
  } catch (e) {
    return { ok: false, status: 0, desc: `rede: ${scrub(e instanceof Error ? e.message : 'falha', token)}` };
  }
}

async function lerEstado(alvo: Alvo): Promise<Estado & { legado: string[] }> {
  const r = (await db.execute<{ meta: { lista?: string; cursor?: number; ids?: (string | null)[]; apagar?: string[]; aberta?: boolean; pausa_ate?: string } | null }>(sql`
    SELECT meta FROM collector_runs WHERE job = ${jobDestino(alvo)} ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { lista?: string; cursor?: number; ids?: (string | null)[]; apagar?: string[]; aberta?: boolean; pausa_ate?: string } | null }[];
  const m = r[0]?.meta;
  // Painéis editados do desenho anterior (se existirem): entram na faxina da primeira lista. Só ids que o próprio painel guardou.
  let legado: string[] = [];
  if (!m) {
    const l = (await db.execute<{ meta: { paineis?: Record<string, { message_id: string }> } | null }>(sql`SELECT meta FROM collector_runs WHERE job = ${JOB_LEGADO(alvo)} ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { paineis?: Record<string, { message_id: string }> } | null }[];
    legado = Object.values(l[0]?.meta?.paineis ?? {}).map((x) => x.message_id);
  }
  return { lista: m?.lista ?? null, cursor: m?.cursor ?? 0, ids: m?.ids ?? [], apagar: m?.apagar ?? [], aberta: !!m?.aberta, pausaAte: m?.pausa_ate ? new Date(m.pausa_ate) : null, legado };
}

async function rodarAlvo(alvo: Alvo, L: ListaCongelada, now: Date, deadline: number): Promise<ResultadoAlvo> {
  const t0 = Date.now();
  const est = await lerEstado(alvo);
  if (est.pausaAte && est.pausaAte > now) return { alvo, acao: 'pausado' };
  if (est.lista === L.inicio && !est.aberta) return { alvo, acao: 'recente' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = alvo === 'privado' ? process.env.TELEGRAM_ALERT_CHAT_ID : undefined;
  if (!token || !chat) return { alvo, acao: 'sem_destino' };
  if (!L.listas.length && !L.quedas.length) { await gravar(jobDestino(alvo), 'error', Date.now() - t0, { tipo: 'sem_lista', problemas: L.problemas, lista: L.inicio, cursor: 0, ids: [], apagar: est.apagar, aberta: false }); return { alvo, acao: 'sem_lista' }; }

  let { cursor, ids, apagar } = est;
  if (est.lista !== L.inicio) {
    // Lista nova: o que já foi enviado de uma lista anterior (inclusive incompleta) e os painéis antigos entram na faxina.
    apagar = [...new Set([...apagar, ...ids.filter((x): x is string => !!x), ...est.legado])];
    ids = [];
    cursor = 0;
  }
  const Q = L.quedas.length;
  const total = Q + L.listas.length;
  const c = { chamadas: 0, enviados: 0, quedas: 0, cards: 0, apagados: 0, erros: 0 };
  const erros: string[] = [];
  let pausaAte: string | undefined;

  while (cursor < total && deadline - Date.now() >= MIN_CHAMADA_MS) {
    if (c.chamadas > 0) await dormir(ESPACO_MS);
    const ehQueda = cursor < Q;
    let r: RespTg;
    let textoEnviado = '';
    let botaoUrl: string | null = null;
    if (ehQueda) {
      // Card individual: o MESMO gerador dos grupos (loadOfferCardInput + renderOfferCard), foto real + legenda, com som e botão. Sem tempo = próximo minuto.
      if (deadline - Date.now() < 9000) break;
      const q = L.quedas[cursor];
      let png: Uint8Array | null = null;
      try {
        const { loadOfferCardInput, renderOfferCard } = await import('@/server/messaging/offer-card');
        const input = await loadOfferCardInput(q.oferta);
        png = input ? ((await renderOfferCard(input))?.png ?? null) : null;
      } catch (err) { console.error('[lista-impressoras] card falhou:', err instanceof Error ? err.message : err); }
      textoEnviado = q.text; botaoUrl = q.url ?? null;
      const sd = await sendTelegramGroupMessage({ token, chatId: chat, text: q.text, photo: png, silent: false, button: q.url ? { text: 'Ver oferta e comprar', url: q.url } : null, maxRetryAfterSec: 5 });
      r = { ok: sd.ok, status: sd.status ?? 0, desc: sd.error ?? '', messageId: sd.messageId, retryAfter: sd.retryAfterSec };
      if (sd.ok && sd.photoSent) c.cards++;
    } else {
      textoEnviado = L.listas[cursor - Q].text;
      r = await tg(token, 'sendMessage', { chat_id: chat, text: L.listas[cursor - Q].text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, disable_notification: true });
    }
    c.chamadas++;
    // AUD-26 (R-72): o texto e a URL do botão de CADA mensagem do painel privado ficam guardados (auditoria). Melhor esforço, nunca derruba o envio.
    await gravar('painel-impressoras-enviado', r.ok ? 'ok' : 'error', 0, { alvo, tipo: ehQueda ? 'queda' : 'lista', oferta: ehQueda ? L.quedas[cursor].oferta : null, texto: textoEnviado, botaoUrl, messageId: r.messageId ?? null, status: r.status }).catch(() => undefined);
    if (r.status === 429) { pausaAte = new Date(Date.now() + (r.retryAfter ?? 5) * 1000).toISOString(); break; }
    if (r.ok && r.messageId) {
      if (ehQueda) c.quedas++; else { ids[cursor - Q] = r.messageId; c.enviados++; }
    } else { c.erros++; if (erros.length < 3) erros.push(`${ehQueda ? 'queda' : 'parte'} ${cursor}: ${r.desc}`); }
    cursor++;
  }
  // Lista completa: apaga as mensagens da lista anterior (se o delete falhar por idade/permissão, segue).
  while (cursor >= total && !pausaAte && apagar.length && deadline - Date.now() >= MIN_CHAMADA_MS) {
    if (c.chamadas > 0) await dormir(ESPACO_MS);
    const id = apagar[0];
    const r = await tg(token, 'deleteMessage', { chat_id: chat, message_id: Number(id) });
    c.chamadas++;
    if (r.status === 429) { pausaAte = new Date(Date.now() + (r.retryAfter ?? 5) * 1000).toISOString(); break; }
    apagar.shift();
    if (r.ok) c.apagados++; else if (!/not found/i.test(r.desc) && erros.length < 3) erros.push(`apagar: ${r.desc}`);
  }
  const concluida = cursor >= total && apagar.length === 0;
  await gravar(jobDestino(alvo), c.erros ? 'error' : 'ok', Date.now() - t0, { tipo: 'lista', lista: L.inicio, cursor, ids, apagar, aberta: !concluida, pausa_ate: pausaAte, ...c, total, erros });
  return { alvo, acao: concluida ? (c.erros ? 'erro' : 'concluida') : 'em_andamento', ...c, partes: L.listas.length, cursor, erro: erros[0] };
}

/**
 * Entrada do cron. `budgetMs` = tempo que o ciclo permite. Nunca lança. Sem flag = não faz nada.
 * Gera a lista a cada 10 min (uma por ciclo, compartilhada pelos destinos) e a entrega com cursor.
 */
export async function atualizarPaineisImpressoras(now: Date = new Date(), opts: { budgetMs?: number; force?: boolean; alvos?: Alvo[] } = {}): Promise<ResultadoPaineis> {
  // 2026-11-25: impressoras fora do privado do dono (só volta com PRIVADO_IMPRESSORAS=on).
  if ((process.env.PRIVADO_IMPRESSORAS ?? '').toLowerCase() !== 'on') return { ligado: false, alvos: [] };
  const alvos = opts.alvos ?? alvosLigados();
  if (!alvos.length) return { ligado: false, alvos: [] };
  const deadline = Date.now() + (opts.budgetMs ?? 25_000);
  const out: ResultadoPaineis = { ligado: true, alvos: [] };
  try {
    let L = await ultimaLista();
    if (opts.force || !L || now.getTime() - new Date(L.inicio).getTime() >= INTERVALO_RODADA_MS) {
      L = await gerarLista(now, true);
      out.gerada = true;
    }
    if (!out.gerada && now.getTime() - new Date(L.inicio).getTime() > 60_000 && confirmacaoLigada()) {
      const estados = await Promise.all(alvos.map((x) => lerEstado(x)));
      const emAndamento = estados.some((e) => e.lista !== L!.inicio || e.aberta); // só regenera enquanto a entrega desta lista não terminou (evita lista nova a cada minuto)
      const mudou = emAndamento ? await mudouDesdeCongelamento(L).catch(() => 0) : 0;
      if (mudou > 0) { L = await gerarLista(now, true); out.gerada = true; out.problemas = [`lista regenerada no envio: ${mudou} oferta(s) mudaram depois do congelamento`]; }
    }
    out.ativosMl = L.ativosMl; out.ativosAmazon = L.ativosAmazon; out.quedas = L.quedas.length; out.problemas = L.problemas;
    for (const alvo of alvos) {
      try { out.alvos.push(await rodarAlvo(alvo, L, now, deadline)); }
      catch (e) { console.error('[lista-impressoras] falhou:', alvo, e instanceof Error ? e.message : e); out.alvos.push({ alvo, acao: 'erro', erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' }); }
    }
  } catch (e) {
    console.error('[lista-impressoras] falhou:', e instanceof Error ? e.message : e);
    out.alvos.push({ alvo: 'privado', acao: 'erro', erro: e instanceof Error ? e.message.slice(0, 120) : 'erro' });
  }
  return out;
}
