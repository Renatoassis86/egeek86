/**
 * Ampliar a AMOSTRA de ofertas por produto nas lojas que NAO sao Games, buscando na Shopee (Affiliate Open API oficial) a MESMA
 * midia/produto dos masters ja aprovados. Decisao do dono, 2026-11-11. Nunca cria master: so oferta em master existente.
 * Biblioteca COMPARTILHADA pela rota /api/cron/ampliar-amostra-shopee (roda dentro da Vercel, onde estao as chaves) e por
 * scripts/ampliar-amostra-shopee.ts (dry-run local). Sem filesystem: tudo que precisa persistir vai para collector_runs.meta
 * (job 'ampliar-amostra-shopee'), inclusive o registro de reversao (ids das ofertas criadas).
 *
 * Fluxo por master APROVADO (catalogGate approved/manual approved): consulta productOfferV2 por palavra-chave (marca+modelo; livros:
 * ISBN e depois titulo+autor) SEM shopId/shopName/priceDiscountRate (a busca devolve System Error 10000 com eles) -> filtros do anuncio
 * (offerLink oficial, foto, vendas, nota, preco: variacao nao descarta, entra com o menor) -> identidade FORTE (shopee-identity.ts) -> plausibilidade de
 * preco contra o proprio master -> consulta por itemId (confirma disponibilidade/preco e le a loja) -> oferta com affiliate_url =
 * offerLink oficial. Em duvida NAO cria. API instavel (erro repetido / so respostas vazias): PARA e documenta.
 * `--aceitar-cobertura` NAO e exposto: aceitarCobertura e sempre false.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { slugify } from '@/lib/slugify';
import { masterFromRow } from '@/server/collector/amazon-assisted';
import { buildShopeeQueries, filtroAnuncio, judgeShopee, prepareGeneric, LINK_OFICIAL } from '@/lib/affiliate/shopee-identity';
import { proximoOffset, TETO_HORARIO_PADRAO, type VerticalAlvo } from '@/lib/affiliate/ampliar-amostra-params';

export type Sql = postgres.Sql<{}>;
export const JOB_AMPLIAR = 'ampliar-amostra-shopee';
const SEARCH_FIELDS = 'itemId productName priceMin priceMax sales ratingStar imageUrl productLink offerLink';
const money = (c: number | null) => (c == null ? 'n/d' : `R$ ${(c / 100).toFixed(2)}`);
/** Agrupa motivos: no maximo `contador:razao` (tira o detalhe variavel apos o 2o ':'). */
const motivoCurto = (m: string) => m.split(':').slice(0, 2).join(':');
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface AmpliarOpts {
  apply: boolean;
  verticals: VerticalAlvo[];
  /** Masters testados por vertical (undefined = todos os elegiveis). */
  limitMasters?: number;
  offset: number;
  maxCalls: number;
  hourlyCap?: number;
  maxPorMaster?: number;
  minVendas?: number;
  minNota?: number;
  comLookup?: boolean;
  /** Testa um master so (diagnostico). */
  soMaster?: string;
  /** Nao chama a API: lista masters elegiveis e consultas. */
  soConsultas?: boolean;
  /** Instante (epoch ms) a partir do qual para de abrir trabalho novo (a rota usa ~50 s dos 60 s). */
  deadlineMs?: number;
  log?: (msg: string) => void;
  shouldStop?: () => boolean;
  /** Backup logico extra antes do 1o INSERT (o script grava NDJSON local; a rota nao tem filesystem e usa so collector_runs.meta). */
  onBeforeFirstInsert?: (sql: Sql, verticals: string[]) => Promise<string | null>;
}

export interface VerticalStats {
  masters: number;
  elegiveis: number;
  mastersTestados: number;
  mastersSemItem: number;
  itensLidos: number;
  paresAceitos: number;
  ofertasCriadas: number;
  duvidas: number;
  descartes: Record<string, number>;
  proximoOffset: number | null;
}
const novoStats = (): VerticalStats => ({ masters: 0, elegiveis: 0, mastersTestados: 0, mastersSemItem: 0, itensLidos: 0, paresAceitos: 0, ofertasCriadas: 0, duvidas: 0, descartes: {}, proximoOffset: null });

export interface Par {
  vertical: string;
  masterId: string;
  master: string;
  itemId: string;
  itemTitulo: string;
  precoCentavos: number;
  loja: string | null;
  shopId: string | null;
  vendas: number | null;
  consulta: string;
  motivo: string;
  score: number;
  referenciasDoMaster: number;
  link: string;
}

export interface OfertaCriada {
  masterId: string;
  offerId: string;
  itemId: string;
  priceCents: number;
  title: string;
  vertical: string;
}

export interface AmpliarResultado {
  apply: boolean;
  runId: string | null;
  verticals: string[];
  /** erro_auth | erro_access | erro_rate_limit | api_instavel_erros_seguidos | api_instavel_so_respostas_vazias | teto_de_chamadas | orcamento_de_tempo | orcamento_horario_esgotado | interrompido | null */
  parou: string | null;
  /** Erro da API Shopee que causou a parada fatal (ex.: 10020 = auth). Nunca escondido. */
  erroApi: { kind: string; code: number | null; httpStatus: number | null; message: string } | null;
  chamadas: { usadas: number; teto: number; erros: number; errosPor: Record<string, number>; ultimaHora: number };
  porVertical: Record<string, VerticalStats>;
  pares: Par[];
  amostrasDescarte: Record<string, Array<Record<string, unknown>>>;
  duvidas: Array<Record<string, unknown>>;
  offersCreated: string[];
  applied: OfertaCriada[];
  backup: string | null;
}

export interface MasterRow {
  id: string;
  name: string;
  vertical: string;
  gen: string | null;
  gtin: string | null;
  mpn: string | null;
  manufacturer: string | null;
  brand_name: string | null;
  segment: string | null;
  cat: unknown;
  n_ativas: number;
  n_shopee: number;
}

export async function carregarMasters(sql: Sql, vertical: string, soMaster?: string): Promise<MasterRow[]> {
  // Aprovado por INCLUSAO (mesmo predicado de masterAprovadoSql): verdict approved OU manual approved, e manual != rejected.
  // Ordem por id: estavel entre lotes (paginacao por offset); a contagem de ofertas muda quando se grava.
  return sql<MasterRow[]>`
    select m.id::text as id, m.name, m.vertical, m.game_platform_gen as gen, m.gtin, m.mpn, m.manufacturer, b.name as brand_name,
           m.attributes->'vertical'->>'segment' as segment, m.attributes->'vertical'->'catalogAttributes' as cat,
           count(o.id) filter (where o.status = 'active' and o.quarantined_at is null)::int as n_ativas,
           count(o.id) filter (where o.status = 'active' and o.quarantined_at is null and n.slug = 'shopee')::int as n_shopee
    from master_products m
    left join brands b on b.id = m.brand_id
    left join affiliate_offers o on o.master_product_id = m.id
    left join affiliate_networks n on n.id = o.network_id
    where m.vertical = ${vertical}
      and (m.attributes -> 'catalogGate' ->> 'verdict' = 'approved' or m.attributes -> 'catalogGate' ->> 'manual' = 'approved')
      and coalesce(m.attributes -> 'catalogGate' ->> 'manual', '') <> 'rejected'
      and (m.attributes ->> 'mergedInto') is null
      ${soMaster ? sql`and m.id = ${soMaster}::uuid` : sql``}
    group by m.id, b.name
    order by m.id`;
}

/** external_ref shopee-<itemId> -> master (para nao reanexar item que ja esta em algum master). */
export async function carregarItensShopee(sql: Sql, networkId: string): Promise<Map<string, string>> {
  const rows = await sql<{ external_ref: string; master_product_id: string }[]>`
    select external_ref, master_product_id::text as master_product_id from affiliate_offers
    where network_id = ${networkId} and external_ref like 'shopee-%'`;
  return new Map(rows.map((r) => [r.external_ref, r.master_product_id]));
}

export async function precosReferencia(sql: Sql, masterId: string): Promise<number[]> {
  const rows = await sql<{ p: string }[]>`
    select current_price_cents::text as p from affiliate_offers
    where master_product_id = ${masterId}::uuid and status = 'active' and current_price_cents > 0 and quarantined_at is null`;
  return rows.map((r) => Number(r.p));
}

/** Chamadas a Shopee feitas por este job na ultima hora (somadas de collector_runs.meta.calls; persistente entre execucoes). */
export async function chamadasUltimaHora(sql: Sql): Promise<number> {
  const [r] = await sql<{ n: string }[]>`
    select coalesce(sum(coalesce((meta->>'calls')::int, 0)), 0)::text as n from collector_runs
    where job = ${JOB_AMPLIAR} and started_at > now() - interval '1 hour'`;
  return Number(r?.n ?? 0);
}

/**
 * Desfaz so as ofertas criadas (e suas cotacoes); NUNCA toca masters. Restringe a ofertas da rede Shopee com external_ref shopee-%.
 * Sem apply, apenas conta o que seria apagado.
 */
export async function desfazerOfertas(sql: Sql, ids: string[], apply: boolean): Promise<{ solicitadas: number; encontradas: number; apagadas: number }> {
  if (ids.length === 0) return { solicitadas: 0, encontradas: 0, apagadas: 0 };
  const found = await sql<{ id: string }[]>`
    select o.id::text as id from affiliate_offers o join affiliate_networks n on n.id = o.network_id
    where o.id in ${sql(ids)} and n.slug = 'shopee' and o.external_ref like 'shopee-%'`;
  const alvo = found.map((r) => r.id);
  if (!apply || alvo.length === 0) return { solicitadas: ids.length, encontradas: alvo.length, apagadas: 0 };
  await sql.begin(async (tx) => {
    await tx`delete from affiliate_price_snapshots where offer_id in ${tx(alvo)}`;
    await tx`delete from affiliate_offers where id in ${tx(alvo)}`;
  });
  return { solicitadas: ids.length, encontradas: alvo.length, apagadas: alvo.length };
}

/** Rollback de uma execucao registrada em collector_runs (meta.offersCreated). Marca meta.rolledBackAt ao aplicar. */
export async function desfazerRun(sql: Sql, runId: string, apply: boolean) {
  const [run] = await sql<{ meta: unknown }[]>`select meta from collector_runs where id = ${runId}::bigint and job = ${JOB_AMPLIAR}`;
  if (!run) return { ok: false as const, erro: 'run_nao_encontrado' };
  const meta = (typeof run.meta === 'string' ? JSON.parse(run.meta) : run.meta) as { offersCreated?: string[]; rolledBackAt?: string } | null;
  if (meta?.rolledBackAt) return { ok: false as const, erro: 'run_ja_desfeito', rolledBackAt: meta.rolledBackAt };
  const ids = meta?.offersCreated ?? [];
  const r = await desfazerOfertas(sql, ids, apply);
  if (apply && ids.length > 0) {
    const novo = JSON.stringify({ ...meta, rolledBackAt: new Date().toISOString(), rolledBack: r.apagadas });
    await sql`update collector_runs set meta = ${novo}::text::jsonb where id = ${runId}::bigint`;
  }
  return { ok: true as const, apply, runId, ...r };
}

export async function ampliarAmostraShopee(sql: Sql, opts: AmpliarOpts): Promise<AmpliarResultado> {
  const log = opts.log ?? (() => {});
  const APPLY = opts.apply;
  const MAX_POR_MASTER = Math.max(1, opts.maxPorMaster ?? 3);
  // Dono (2026-11-12): poucas vendas NÃO barra a entrada (0 = sem piso); passar minVendas explícito reativa o piso.
  const MIN_VENDAS = Math.max(0, opts.minVendas ?? 0);
  const MIN_NOTA = Math.max(0, Math.min(5, opts.minNota ?? 4));
  const HOURLY_CAP = Math.min(8000, Math.max(1, opts.hourlyCap ?? TETO_HORARIO_PADRAO));
  const COM_LOOKUP = opts.comLookup ?? true;
  const verticals = opts.verticals;
  const startedMs = Date.now();
  const expirou = () => opts.deadlineMs != null && Date.now() >= opts.deadlineMs;

  const { isShopeeAffiliateConfigured, ShopeeApiError } = await import('@/server/collector/sources/shopee-auth');
  if (!opts.soConsultas && !isShopeeAffiliateConfigured()) {
    throw new Error('Shopee: credenciais ausentes (SHOPEE_AFFILIATE_APP_ID/SECRET); nada executado');
  }
  const { queryProductOffers, parseShopeeNode } = await import('@/server/collector/sources/shopee');
  const { createShopeePacer } = await import('@/server/collector/shopee-pacing');
  const { isImplausiblyHigh, isImplausiblyLow } = await import('@/server/collector/price-plausibility');

  const ultimaHora = await chamadasUltimaHora(sql);
  const restaHora = Math.max(0, HOURLY_CAP - ultimaHora);
  const teto = opts.soConsultas ? 0 : Math.min(opts.maxCalls, restaHora);
  log(`ampliar-amostra-shopee: modo=${APPLY ? 'APPLY (GRAVA)' : 'DRY-RUN (nada e gravado)'} verticais=${verticals.join(',')} max-calls=${teto}${teto < opts.maxCalls ? ` (pedido ${opts.maxCalls}; limitado pelo teto horario: ${ultimaHora}/${HOURLY_CAP} na ultima hora)` : ''} ` +
    `max-por-master=${MAX_POR_MASTER} min-vendas=${MIN_VENDAS} min-nota=${MIN_NOTA} lookup=${COM_LOOKUP}`);

  const res: AmpliarResultado = {
    apply: APPLY,
    runId: null,
    verticals,
    parou: null,
    erroApi: null,
    chamadas: { usadas: 0, teto, erros: 0, errosPor: {}, ultimaHora },
    porVertical: {},
    pares: [],
    amostrasDescarte: {},
    duvidas: [],
    offersCreated: [],
    applied: [],
    backup: null,
  };
  if (!opts.soConsultas && teto <= 0) {
    res.parou = 'orcamento_horario_esgotado';
    log(`orcamento horario esgotado (${ultimaHora}/${HOURLY_CAP}); nada executado, 0 chamadas`);
    // registra a tentativa (sem chamadas) para auditoria
    await registrarRun(sql, res, startedMs, true);
    return res;
  }

  const pacer = createShopeePacer();
  const chamadas = res.chamadas;
  const amostra = (motivo: string, d: Record<string, unknown>) => {
    const a = (res.amostrasDescarte[motivo] ??= []);
    if (a.length < 6) a.push(d);
  };

  /** Uma chamada com retry curto (a API e intermitente: System Error 10000). Cada tentativa e cobrada. Lanca se esgotar. */
  async function chamar(q: Parameters<typeof queryProductOffers>[0]): Promise<{ nodes: any[]; hasNextPage: boolean }> {
    const esperas = [1000, 2500, 5000];
    for (let i = 0; ; i++) {
      if (chamadas.usadas >= teto) throw Object.assign(new Error('teto_de_chamadas'), { teto: true });
      if (expirou()) throw Object.assign(new Error('orcamento_de_tempo'), { tempo: true });
      await pacer.wait();
      chamadas.usadas++;
      try {
        return await queryProductOffers(q);
      } catch (e) {
        const err = e as InstanceType<typeof ShopeeApiError>;
        const classe = err instanceof ShopeeApiError ? `${err.kind}${err.code ? `_${err.code}` : ''}` : 'outro';
        chamadas.erros++;
        chamadas.errosPor[classe] = (chamadas.errosPor[classe] ?? 0) + 1;
        if (err instanceof ShopeeApiError) {
          if (err.kind === 'rate_limit') {
            pacer.onRateLimit();
            throw err; // PRIMEIRO 10030 para (ordem do dono, 2026-11-12): a janela de 1 h do limite precisa passar; o offset segue de onde parou

          }
          if (err.kind === 'auth' || err.kind === 'access' || err.kind === 'params') throw err; // nao adianta repetir
        }
        if (i >= esperas.length || opts.shouldStop?.() || expirou()) throw err;
        await sleep(esperas[i]);
      }
    }
  }

  let runId: string | null = null;
  let recordPriceSnapshot: typeof import('@/server/collector/record-price-snapshot').recordPriceSnapshot | null = null;
  try {
    const [net] = await sql<{ id: string }[]>`select id from affiliate_networks where slug = 'shopee' limit 1`;
    if (!net) throw new Error('rede shopee nao cadastrada em affiliate_networks');
    const itensExistentes = await carregarItensShopee(sql, net.id);
    log(`ofertas Shopee ja cadastradas (qualquer master): ${itensExistentes.size}`);
    // O registro da execucao abre ANTES de qualquer INSERT de oferta: o registro de reversao precisa existir mesmo se a funcao morrer.
    runId = await registrarRun(sql, res, startedMs, false);
    res.runId = runId;
    if (APPLY) recordPriceSnapshot = (await import('@/server/collector/record-price-snapshot')).recordPriceSnapshot;

    let errosSeguidos = 0;
    let vaziasSeguidas = 0;
    let algumaVezVeioItem = false;

    verticalLoop: for (const vert of verticals) {
      const st = (res.porVertical[vert] = novoStats());
      const todos = await carregarMasters(sql, vert, opts.soMaster);
      st.masters = todos.length;
      const elegiveis = todos.filter((m) => m.n_shopee < MAX_POR_MASTER);
      st.elegiveis = elegiveis.length;
      const masters = elegiveis.slice(opts.offset, opts.limitMasters ? opts.offset + opts.limitMasters : undefined);
      log(`--- ${vert}: masters aprovados=${st.masters}; elegiveis=${st.elegiveis}; a testar nesta rodada=${masters.length}`);
      let consumidos = 0; // masters concluidos nesta rodada (base do proximo offset)
      let saturados = 0; // masters que chegaram ao maximo por master (saem da lista elegivel)
      const fechaOffset = () => {
        st.proximoOffset = proximoOffset(opts.offset, consumidos, saturados, st.elegiveis);
      };

      for (const row of masters) {
        if (opts.shouldStop?.()) {
          res.parou = 'interrompido';
          fechaOffset();
          break verticalLoop;
        }
        if (expirou()) {
          res.parou = 'orcamento_de_tempo';
          fechaOffset();
          break verticalLoop;
        }
        const master = masterFromRow(row as any);
        if (!master) {
          st.descartes['master_invalido'] = (st.descartes['master_invalido'] ?? 0) + 1;
          consumidos++;
          continue;
        }
        const ctx = prepareGeneric(master);
        const consultas = buildShopeeQueries(master);
        st.mastersTestados++;
        if (opts.soConsultas) {
          if (st.mastersTestados <= 12) log(`  CONSULTA [${vert}] ${row.name.slice(0, 70)} (ofertas ativas=${row.n_ativas}, shopee=${row.n_shopee}) => ${JSON.stringify(consultas)} | marca=${ctx.brand ?? 'n/d'} codigos=${ctx.codes.join(',') || '-'}`);
          if (ctx.codes.length) st.descartes['_masters_com_codigo_de_modelo'] = (st.descartes['_masters_com_codigo_de_modelo'] ?? 0) + 1;
          consumidos++;
          continue;
        }

        // ---- 1. busca (reserva so quando a principal nao trouxe par aceitavel) ----
        const aceitos: Array<{ node: any; parsed: any; verdict: ReturnType<typeof judgeShopee>; q: string }> = [];
        let leuAlgum = false;
        try {
          for (const q of consultas) {
            const r = await chamar({ keyword: q, page: 1, limit: 50, sortType: 1, fields: SEARCH_FIELDS });
            errosSeguidos = 0;
            if (r.nodes.length > 0) {
              leuAlgum = true;
              algumaVezVeioItem = true;
              vaziasSeguidas = 0;
            }
            st.itensLidos += r.nodes.length;
            const vistosNoMaster = new Set<string>();
            for (const raw of r.nodes) {
              const parsed = parseShopeeNode(raw);
              if ('rejected' in parsed) {
                const k = `preco:${parsed.rejected}`;
                st.descartes[k] = (st.descartes[k] ?? 0) + 1;
                continue;
              }
              const node = parsed.node;
              if (vistosNoMaster.has(node.itemId)) continue;
              vistosNoMaster.add(node.itemId);
              const falha = filtroAnuncio({ sales: node.sales, imageUrl: node.imageUrl, offerLink: node.offerLink, ratingStar: raw?.ratingStar }, { minVendas: MIN_VENDAS, minNota: MIN_NOTA });
              if (falha) {
                st.descartes[`anuncio:${falha}`] = (st.descartes[`anuncio:${falha}`] ?? 0) + 1;
                continue;
              }
              const v = judgeShopee(ctx, { itemId: node.itemId, title: node.productName, priceCents: node.priceCents }, { aceitarCobertura: false });
              if (v.outcome === 'accept') aceitos.push({ node, parsed, verdict: v, q });
              else if (v.outcome === 'doubt') {
                st.duvidas++;
                const k = motivoCurto(v.motivo);
                st.descartes[k] = (st.descartes[k] ?? 0) + 1;
                if (res.duvidas.length < 400) res.duvidas.push({ vertical: vert, masterId: row.id, master: row.name, itemId: node.itemId, titulo: node.productName, preco: node.priceCents, motivo: v.motivo, score: Number(v.score.toFixed(2)) });
              } else {
                const k = motivoCurto(v.motivo);
                st.descartes[k] = (st.descartes[k] ?? 0) + 1;
                amostra(k, { vertical: vert, master: row.name.slice(0, 80), item: node.productName.slice(0, 110), preco: money(node.priceCents), motivo: v.motivo });
              }
            }
            if (aceitos.length > 0) break;
            if (r.nodes.length === 0) vaziasSeguidas++;
          }
        } catch (e) {
          if ((e as any)?.teto || (e as any)?.tempo) {
            res.parou = (e as any).teto ? 'teto_de_chamadas' : 'orcamento_de_tempo';
            st.mastersTestados--; // este master nao foi concluido
            fechaOffset();
            break verticalLoop;
          }
          errosSeguidos++;
          log(`  ERRO busca master ${row.id}: ${(e as Error).message.slice(0, 160)} (seguidos=${errosSeguidos})`);
          if (e instanceof ShopeeApiError) {
            res.erroApi = { kind: e.kind, code: e.code, httpStatus: e.httpStatus, message: e.message.slice(0, 300) };
            if (e.kind === 'rate_limit' || e.kind === 'auth' || e.kind === 'access') {
              res.parou = `erro_${e.kind}`;
              st.mastersTestados--;
              fechaOffset();
              break verticalLoop;
            }
          }
          if (errosSeguidos >= 5) {
            res.parou = 'api_instavel_erros_seguidos';
            fechaOffset();
            break verticalLoop;
          }
          consumidos++;
          continue;
        }
        if (!algumaVezVeioItem && vaziasSeguidas >= 25) {
          res.parou = 'api_instavel_so_respostas_vazias';
          fechaOffset();
          break verticalLoop;
        }
        if (!leuAlgum) st.mastersSemItem++;
        if (aceitos.length === 0) {
          consumidos++;
          continue;
        }

        // ---- 2. plausibilidade de preco, dedup, melhores por score, uma por loja ----
        const refs = await precosReferencia(sql, row.id);
        aceitos.sort((a, b) => b.verdict.score - a.verdict.score || (b.node.sales ?? 0) - (a.node.sales ?? 0));
        const lojasUsadas = new Set<string>();
        let criadosNoMaster = 0;
        let gravadosNoMaster = 0;
        const vagas = MAX_POR_MASTER - row.n_shopee;
        for (const a of aceitos) {
          if (criadosNoMaster >= vagas) break;
          let node = a.node;
          const ref = `shopee-${node.itemId}`;
          const donoAtual = itensExistentes.get(ref);
          if (donoAtual) {
            const k = donoAtual === row.id ? 'item_ja_cadastrado_neste_master' : 'item_ja_em_outro_master';
            st.descartes[k] = (st.descartes[k] ?? 0) + 1;
            continue;
          }
          // ---- 3. consulta por itemId: confirma disponibilidade/preco e le a loja ----
          if (COM_LOOKUP) {
            try {
              const r = await chamar({ itemId: node.itemId, limit: 5 });
              const m = r.nodes.find((n) => String(n?.itemId) === node.itemId);
              if (!m) {
                st.descartes['lookup:nao_retornado'] = (st.descartes['lookup:nao_retornado'] ?? 0) + 1;
                continue;
              }
              const p2 = parseShopeeNode(m);
              if ('rejected' in p2) {
                st.descartes[`lookup:${p2.rejected}`] = (st.descartes[`lookup:${p2.rejected}`] ?? 0) + 1;
                continue;
              }
              node = { ...node, priceCents: p2.node.priceCents, listPriceCents: p2.node.listPriceCents, shopId: p2.node.shopId, shopName: p2.node.shopName, offerLink: node.offerLink && LINK_OFICIAL.test(node.offerLink) ? node.offerLink : p2.node.offerLink };
            } catch (e) {
              if ((e as any)?.teto || (e as any)?.tempo) {
                res.parou = (e as any).teto ? 'teto_de_chamadas' : 'orcamento_de_tempo';
                fechaOffset();
                break verticalLoop;
              }
              if (e instanceof ShopeeApiError) {
                res.erroApi = { kind: e.kind, code: e.code, httpStatus: e.httpStatus, message: e.message.slice(0, 300) };
                if (e.kind === 'auth' || e.kind === 'access' || e.kind === 'rate_limit') {
                  res.parou = `erro_${e.kind}`;
                  fechaOffset();
                  break verticalLoop;
                }
              }
              st.descartes['lookup:erro_api'] = (st.descartes['lookup:erro_api'] ?? 0) + 1;
              continue;
            }
          }
          if (!node.offerLink || !LINK_OFICIAL.test(node.offerLink)) {
            st.descartes['anuncio:sem_offerlink_oficial'] = (st.descartes['anuncio:sem_offerlink_oficial'] ?? 0) + 1;
            continue;
          }
          const lojaKey = node.shopId ?? '';
          if (lojaKey && lojasUsadas.has(lojaKey)) {
            st.descartes['mesma_loja_no_master'] = (st.descartes['mesma_loja_no_master'] ?? 0) + 1;
            continue;
          }
          // Faixa de plausibilidade (0,35x a 3x a mediana): fora dela o item ENTRA no banco QUARENTENADO (fora de média e vitrine), não é descartado.
          const foraDaFaixa = isImplausiblyLow(node.priceCents, refs) || isImplausiblyHigh(node.priceCents, refs);
          if (foraDaFaixa) {
            const k = isImplausiblyLow(node.priceCents, refs) ? 'preco:baixo_demais_vs_master_quarentenado' : 'preco:alto_demais_vs_master_quarentenado';
            st.descartes[k] = (st.descartes[k] ?? 0) + 1;
            amostra(k, { vertical: vert, master: row.name.slice(0, 80), item: node.productName.slice(0, 110), preco: money(node.priceCents), refs: refs.length });
          }
          st.paresAceitos++;
          if (lojaKey) lojasUsadas.add(lojaKey);
          criadosNoMaster++;
          itensExistentes.set(ref, row.id);
          res.pares.push({
            vertical: vert,
            masterId: row.id,
            master: row.name,
            itemId: node.itemId,
            itemTitulo: node.productName,
            precoCentavos: node.priceCents,
            loja: node.shopName,
            shopId: node.shopId,
            vendas: node.sales,
            consulta: a.q,
            motivo: a.verdict.motivo,
            score: Number(a.verdict.score.toFixed(2)),
            referenciasDoMaster: refs.length,
            link: node.offerLink,
          });
          log(`  PAR [${vert}] ${row.name.slice(0, 70)} <=> ${node.productName.slice(0, 90)} | ${money(node.priceCents)} | ${a.verdict.motivo} | vendas=${node.sales ?? 'n/d'} | loja=${node.shopName ?? 'n/d'}`);

          // ---- 4. grava (apply) ----
          if (!APPLY) continue;
          if (opts.onBeforeFirstInsert && !res.backup) {
            res.backup = await opts.onBeforeFirstInsert(sql, Array.from(new Set(verticals)));
            if (res.backup) log(`BACKUP LOGICO gravado antes do primeiro INSERT: ${res.backup}`);
          }
          try {
            const slug = slugify(`${node.productName.slice(0, 100)}-shopee-${randomUUID().slice(0, 6)}`);
            const [o] = await sql<{ id: string }[]>`
              insert into affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, store_name,
                                            external_ref, current_price_cents, status, published_at, last_checked_at, vertical)
              values (${row.id}::uuid, ${net.id}, ${node.productName.slice(0, 200)}, ${slug}, ${node.offerLink}, false, ${node.imageUrl}, ${node.shopName},
                      ${ref}, 0, 'active', now(), now(), ${vert})
              on conflict (network_id, external_ref) where external_ref is not null and seller_id is null do nothing
              returning id::text as id`;
            if (!o) {
              st.descartes['gravacao:oferta_ja_existe'] = (st.descartes['gravacao:oferta_ja_existe'] ?? 0) + 1;
              continue;
            }
            // Registro de reversao primeiro (id ja no collector_runs), depois a cotacao.
            res.offersCreated.push(o.id);
            res.applied.push({ masterId: row.id, offerId: o.id, itemId: node.itemId, priceCents: node.priceCents, title: node.productName.slice(0, 200), vertical: vert });
            await flushMeta(sql, runId, res, startedMs);
            const wrote = await recordPriceSnapshot!({ offerId: o.id, priceCents: node.priceCents, listPriceCents: node.listPriceCents, source: 'api' });
            try {
              await sql`update affiliate_offers set last_price_confirmed_at = now() where id = ${o.id}::uuid`;
            } catch {
              // coluna de confirmacao opcional em ambientes antigos
            }
            if (foraDaFaixa) await sql`update affiliate_offers set quarantined_at = now(), updated_at = now() where id = ${o.id}::uuid`;
            st.ofertasCriadas++;
            gravadosNoMaster++;
            log(`    CRIADA oferta=${o.id} snapshot=${wrote}`);
          } catch (e) {
            st.descartes['gravacao:erro'] = (st.descartes['gravacao:erro'] ?? 0) + 1;
            log(`    ERRO ao gravar item ${node.itemId}: ${(e as Error).message.slice(0, 160)}`);
          }
        }
        if (gravadosNoMaster > 0 && row.n_shopee + gravadosNoMaster >= MAX_POR_MASTER) saturados++;
        consumidos++;
      }
      fechaOffset();
      log(`${vert}: testados=${st.mastersTestados} sem_item=${st.mastersSemItem} lidos=${st.itensLidos} pares=${st.paresAceitos} criadas=${st.ofertasCriadas} duvidas=${st.duvidas} proximoOffset=${st.proximoOffset ?? 'fim'} chamadas_ate_agora=${chamadas.usadas}`);
    }
  } catch (e) {
    res.parou = res.parou ?? 'erro_interno';
    await registrarFim(sql, runId, res, startedMs, e as Error);
    throw e;
  }
  await registrarFim(sql, runId, res, startedMs, null);
  log(`TOTAL: chamadas=${chamadas.usadas}/${teto} erros_api=${chamadas.erros} ${JSON.stringify(chamadas.errosPor)} parou=${res.parou ?? '-'} pares=${res.pares.length} ${APPLY ? `ofertas_criadas=${res.offersCreated.length}` : 'NADA GRAVADO (dry-run)'}`);
  return res;
}

// ---------------------------------------------------------------------------
// collector_runs (escrita direta: nao depende da flag COLLECTOR_RUNS, porque o registro de reversao e obrigatorio)
// ---------------------------------------------------------------------------
function metaDe(res: AmpliarResultado, extra?: Record<string, unknown>) {
  return {
    apply: res.apply,
    verticals: res.verticals,
    calls: res.chamadas.usadas,
    parou: res.parou,
    erroApi: res.erroApi,
    pares: res.pares.length,
    // Registro de reversao e backup logico: so INSERTs de ofertas (e cotacoes); estas linhas bastam para desfazer.
    offersCreated: res.offersCreated,
    applied: res.applied,
    ...extra,
  };
}

async function registrarRun(sql: Sql, res: AmpliarResultado, startedMs: number, encerrada: boolean): Promise<string | null> {
  try {
    const meta = JSON.stringify(metaDe(res));
    const [r] = await sql<{ id: string }[]>`
      insert into collector_runs (job, network, started_at, finished_at, duration_ms, status, stopped_because, meta)
      values (${JOB_AMPLIAR}, 'shopee', ${new Date(startedMs).toISOString()}::timestamptz, ${encerrada ? sql`now()` : sql`null`}, ${encerrada ? Date.now() - startedMs : null},
              ${encerrada ? 'partial' : 'running'}, ${encerrada ? res.parou : null}, ${meta}::text::jsonb)
      returning id::text as id`;
    res.runId = r?.id ?? null;
    return res.runId;
  } catch (e) {
    if (res.apply) throw new Error(`collector_runs indisponivel; sem registro de reversao nao grava: ${(e as Error).message.slice(0, 120)}`);
    console.error('[ampliar-amostra-shopee] falha ao registrar collector_runs', (e as Error).message);
    return null;
  }
}

async function flushMeta(sql: Sql, runId: string | null, res: AmpliarResultado, startedMs: number) {
  if (!runId) return;
  const meta = JSON.stringify(metaDe(res, { parcialAte: new Date().toISOString(), duracaoMs: Date.now() - startedMs }));
  await sql`update collector_runs set meta = ${meta}::text::jsonb, offers_created = ${res.offersCreated.length}, checked = ${res.chamadas.usadas} where id = ${runId}::bigint`;
}

async function registrarFim(sql: Sql, runId: string | null, res: AmpliarResultado, startedMs: number, erro: Error | null) {
  if (!runId) return;
  try {
    const fatal = erro != null || (res.parou != null && /^(erro_|api_instavel)/.test(res.parou));
    const status = fatal ? 'error' : res.parou ? 'partial' : 'ok';
    const meta = JSON.stringify(metaDe(res, erro ? { erro: erro.message.slice(0, 200) } : undefined));
    await sql`
      update collector_runs set finished_at = now(), duration_ms = ${Date.now() - startedMs}, status = ${status},
        checked = ${res.chamadas.usadas}, errors = ${res.chamadas.erros}, offers_created = ${res.offersCreated.length},
        stopped_because = ${res.parou}, meta = ${meta}::text::jsonb
      where id = ${runId}::bigint`;
  } catch (e) {
    console.error('[ampliar-amostra-shopee] falha ao fechar collector_runs', (e as Error).message);
  }
}
