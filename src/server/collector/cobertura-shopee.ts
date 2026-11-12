/**
 * COBERTURA SHOPEE por LISTAGEM (dono, 2026-11-12: "a Shopee traga TODOS os produtos que trabalhamos", todas as lojas: games e Plus).
 * Só API OFICIAL de afiliados (productOfferV2 por productCatId / shopId, sortType 2 = mais vendidos). Sem scraping, sem endpoint interno.
 * Roda dentro da Vercel (as chaves só existem lá), pela rota /api/cron/cobertura-shopee, DESLIGADA por padrão (SHOPEE_COBERTURA_ATIVA=1).
 *
 * CORREÇÃO DE DIRETRIZ DO DONO (2026-11-12): "em nenhuma loja recusar item por variação de preço; pegar TODOS os itens para o banco de pesquisa e
 * monitoramento. A regra dos 10% abaixo da média é só para LANÇAR MENSAGENS." Então: variação de preço NÃO descarta (entra com o menor preço, marcada);
 * poucas vendas NÃO descarta (sinal de relevância); item sem master equivalente CRIA o master (review, dedup, porteiro/escopo, dúvida -> fila).
 *
 * Por anúncio listado: filtros do anúncio (link oficial, foto, nota; vendas só como sinal) -> já cadastrado? (pula)
 *   -> Games: dedup do banco (título+plataforma, findExistingMasterProduct); sem master equivalente CRIA (porteiro gamer entryGateAttributes)
 *   -> demais lojas: casamento com os masters APROVADOS da loja (shopee-identity.ts: modelo/ISBN/campos; a mesma regra da ampliação);
 *      sem candidato ou "é outro produto" -> decidirMasterNovo (shopee-master-novo.ts): dedup contra TODOS os masters, porteiro/escopo, criação em review
 *   -> aceito (identidade forte): consulta por itemId e cria a oferta ATIVA; preço fora da faixa 0,35x-3x da mediana: entra QUARENTENADA (fora de média e vitrine)
 *   -> dúvida (identidade, chave fraca, master em revisão, ambíguo): oferta em RASCUNHO + pergunta na fila de classificação; nunca direto para a média
 *   -> condição/acessório/digital/fora de linha: só conta (identidade, não preço).
 * Orçamento por execução (páginas, chamadas, tempo, dúvidas, teto horário), PRIMEIRO 10030 PARA, cursor por fonte em system_config.
 * Sem `apply` nada é gravado (dry-run), nem o cursor. Registro de reversão em collector_runs.meta (job 'cobertura-shopee').
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { slugify } from '@/lib/slugify';
import { masterFromRow } from '@/server/collector/amazon-assisted';
import { filtroAnuncio, LINK_OFICIAL, sinalVendas } from '@/lib/affiliate/shopee-identity';
import {
  avancarCursor, casarItem, COBERTURA_LIMITES, criarIndice, destinoDoCasamento, fontesDe, lerConfigCobertura, paradaPorErro, proximaFonte, resumirCategorias,
  type CursorMapa, type IndiceMasters, type LojaCobertura, type MotivoParada, type ResumoCategoria,
} from '@/lib/affiliate/shopee-cobertura';
import { decidirMasterNovo, ehLojaPlus, type DecisaoMasterNovo, type IndiceDedup, type MarcasConhecidas, type PropostaMaster } from '@/lib/affiliate/shopee-master-novo';
import type { ShopeeOfferNode } from '@/server/collector/sources/shopee';
import { gravarVariacaoOferta } from '@/server/collector/shopee-variacao-store';
import { carregarIndiceDedup, carregarMarcasConhecidas, criarMasterGame, criarMasterPlus } from '@/server/collector/shopee-master-novo-store';
import { carregarItensShopee, carregarMasters, precosReferencia, type Sql } from '@/server/collector/ampliar-amostra-shopee';
import { enfileirarDuvidaShopee } from '@/server/collector/shopee-fila';

export const JOB_COBERTURA = 'cobertura-shopee';
export const CURSOR_KEY_COBERTURA = 'cobertura_shopee_cursor';
/** Sem shopId/shopName/priceDiscountRate na listagem: a busca por palavra devolve System Error 10000 com eles (medido em 2026-11-11); a loja vem do lookup por itemId. */
const LIST_FIELDS = 'itemId productName priceMin priceMax sales ratingStar imageUrl productLink offerLink';
const LIST_FIELDS_COM_CAT = `${LIST_FIELDS} productCatIds`;
/** Dono (2026-11-12): vendas NÃO barram a entrada (0 = sem piso); `sinalVendas` registra a relevância. */
const MIN_VENDAS = 0;
const MIN_NOTA = 4;
const MAX_POR_MASTER = 3;

const money = (c: number | null) => (c == null ? 'n/d' : `R$ ${(c / 100).toFixed(2)}`);

export interface OpcoesCobertura {
  apply: boolean;
  lojas: LojaCobertura[];
  paginas: number;
  maxCalls: number;
  maxDuvidas: number;
  /** Teto de masters NOVOS por execução (freio de volume; também vale no dry-run). */
  maxMastersNovos?: number;
  fonte: string | null;
  deadlineMs: number;
  hourlyCap?: number;
  /** Configuração (se ausente, lê constante + env SHOPEE_COBERTURA_CONFIG). */
  configJson?: string;
  log?: (m: string) => void;
}

export interface StatsLoja {
  lidos: number;
  jaCadastrados: number;
  descartes: Record<string, number>;
  aceitos: number;
  duvidas: number;
  criadas: number;
  duvidasEnfileiradas: number;
  /** Itens lidos com faixa AMPLA de preço entre variações (antes eram descartados; agora entram com o menor preço). */
  variacaoAmpla: number;
  /** Itens com poucas vendas (sinal de relevância; não descarta). */
  poucasVendasSinal: number;
  /** Masters novos criados (apply) ou planejados (dry-run). */
  mastersNovos: number;
  /** Ofertas que ENTRARIAM/entraram no banco (ativas + dúvidas + masters novos), base da simulação por 100 itens lidos. */
  entram: number;
  /** Ofertas com preço fora da faixa de plausibilidade: entram quarentenadas (fora de média e vitrine). */
  quarentenadas: number;
}
const novoStats = (): StatsLoja => ({ lidos: 0, jaCadastrados: 0, descartes: {}, aceitos: 0, duvidas: 0, criadas: 0, duvidasEnfileiradas: 0, variacaoAmpla: 0, poucasVendasSinal: 0, mastersNovos: 0, entram: 0, quarentenadas: 0 });

export interface ResultadoCobertura {
  modo: 'dry-run' | 'apply';
  runId: string | null;
  parou: MotivoParada | 'erro_interno' | 'orcamento_horario_esgotado';
  erroApi: { kind: string; code: number | null; message: string } | null;
  chamadas: { usadas: number; teto: number; ultimaHora: number; erros: number };
  fontes: Array<{ chave: string; loja: string; paginaLida: number | null; itens: number; temProxima: boolean }>;
  porLoja: Record<string, StatsLoja>;
  amostras: Array<Record<string, unknown>>;
  duvidas: Array<Record<string, unknown>>;
  offersCreated: string[];
  draftOffers: string[];
  /** Masters criados nesta execução (reversão: só apaga os que ficaram sem oferta). */
  mastersCreated: string[];
  /** Ofertas quarentenadas por preço fora da faixa. */
  quarentenadas: string[];
  /** Marca de variação de preço por oferta (auditoria; as colunas só existem depois da migration 0047). */
  variantes: Array<Record<string, unknown>>;
  cursor: CursorMapa;
  avisos: string[];
}

export async function chamadasCoberturaUltimaHora(sql: Sql): Promise<number> {
  const [r] = await sql<{ n: string }[]>`
    select coalesce(sum(coalesce((meta->>'calls')::int, 0)), 0)::text as n from collector_runs
    where job = ${JOB_COBERTURA} and started_at > now() - interval '1 hour'`;
  return Number(r?.n ?? 0);
}

async function lerCursor(sql: Sql): Promise<CursorMapa> {
  try {
    const [r] = await sql<{ value: unknown }[]>`select value from system_config where key = ${CURSOR_KEY_COBERTURA}`;
    const v = typeof r?.value === 'string' ? JSON.parse(r.value) : r?.value;
    return v && typeof v === 'object' ? (v as CursorMapa) : {};
  } catch {
    return {};
  }
}
async function gravarCursor(sql: Sql, c: CursorMapa): Promise<void> {
  await sql`insert into system_config (key, value, description) values (${CURSOR_KEY_COBERTURA}, ${JSON.stringify(c)}::text::jsonb, 'Cursor (página por fonte) da cobertura Shopee por listagem.')
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export async function coberturaShopee(sql: Sql, o: OpcoesCobertura): Promise<ResultadoCobertura> {
  const log = o.log ?? (() => {});
  const { isShopeeAffiliateConfigured, ShopeeApiError } = await import('@/server/collector/sources/shopee-auth');
  if (!isShopeeAffiliateConfigured()) throw new Error('Shopee: credenciais ausentes (SHOPEE_AFFILIATE_APP_ID/SECRET); nada executado');
  const { queryProductOffers, parseShopeeNode } = await import('@/server/collector/sources/shopee');
  const { createShopeePacer } = await import('@/server/collector/shopee-pacing');
  const { isImplausiblyHigh, isImplausiblyLow } = await import('@/server/collector/price-plausibility');
  const { recordPriceSnapshot } = await import('@/server/collector/record-price-snapshot');

  const hourlyCap = o.hourlyCap ?? COBERTURA_LIMITES.tetoHorarioPadrao;
  const ultimaHora = await chamadasCoberturaUltimaHora(sql);
  const teto = Math.max(0, Math.min(o.maxCalls, hourlyCap - ultimaHora));
  const startedMs = Date.now();
  const res: ResultadoCobertura = {
    modo: o.apply ? 'apply' : 'dry-run', runId: null, parou: null, erroApi: null,
    chamadas: { usadas: 0, teto, ultimaHora, erros: 0 }, fontes: [], porLoja: {}, amostras: [], duvidas: [],
    offersCreated: [], draftOffers: [], mastersCreated: [], quarentenadas: [], variantes: [], cursor: {}, avisos: [],
  };
  const stats = (loja: string) => (res.porLoja[loja] ??= novoStats());
  const descarta = (loja: string, k: string) => {
    const s = stats(loja);
    s.descartes[k] = (s.descartes[k] ?? 0) + 1;
  };
  const amostra = (d: Record<string, unknown>) => {
    if (res.amostras.length < 25) res.amostras.push(d);
  };

  const { cfg, invalidas } = lerConfigCobertura(o.configJson ?? process.env.SHOPEE_COBERTURA_CONFIG);
  if (invalidas.length) res.avisos.push(`config_invalida:${invalidas.join(',')}`);
  let fontes = fontesDe(cfg, o.lojas);
  if (o.fonte) fontes = fontes.filter((f) => f.chave === o.fonte);
  if (fontes.length === 0) {
    res.parou = 'sem_fontes';
    res.avisos.push('Nenhuma categoria/loja configurada. Rode ?probe=cat para medir os productCatIds que a API devolve, confira e preencha SHOPEE_COBERTURA_CONFIG (ver docs/cobertura-shopee-2026-11-12.md).');
    return res;
  }
  if (teto <= 0) {
    res.parou = 'orcamento_horario_esgotado';
    return res;
  }

  const [net] = await sql<{ id: string }[]>`select id from affiliate_networks where slug = 'shopee' limit 1`;
  if (!net) throw new Error('rede shopee nao cadastrada em affiliate_networks');
  const existentes = await carregarItensShopee(sql, net.id);
  const cursor = await lerCursor(sql);
  res.cursor = cursor;

  // Índices por loja (só das lojas que têm fonte nesta rodada). Games usa o dedup do banco, sem índice.
  const indices = new Map<string, IndiceMasters>();
  const masterNome = new Map<string, string>();
  for (const loja of new Set(fontes.map((f) => f.loja))) {
    if (loja === 'games') continue;
    const rows = await carregarMasters(sql, loja);
    const lista = rows.flatMap((r) => {
      const identity = masterFromRow(r as any);
      if (!identity) return [];
      masterNome.set(r.id, r.name);
      return [{ id: r.id, identity, nShopee: r.n_shopee }];
    });
    indices.set(loja, criarIndice(lista));
    log(`loja ${loja}: ${lista.length} masters aprovados no indice`);
  }

  // Dedup para master novo: TODOS os masters da vertical (aprovados e em revisão). Marcas reais da tabela brands.
  const dedups = new Map<string, IndiceDedup>();
  let marcas: MarcasConhecidas = new Set();
  for (const loja of new Set(fontes.map((f) => f.loja))) {
    if (loja === 'games') continue;
    dedups.set(loja, await carregarIndiceDedup(sql, loja));
  }
  if (dedups.size > 0) marcas = await carregarMarcasConhecidas(sql);
  const tetoMastersNovos = o.maxMastersNovos ?? COBERTURA_LIMITES.mastersNovosPadrao;
  let mastersNovosNaRodada = 0;
  let planejadoSeq = 0;

  const pacer = createShopeePacer();
  let errosSeguidos = 0;
  let runId: string | null = null;
  const abrirRun = async () => {
    const [r] = await sql<{ id: string }[]>`
      insert into collector_runs (job, network, started_at, status, meta)
      values (${JOB_COBERTURA}, 'shopee', ${new Date(startedMs).toISOString()}::timestamptz, 'running', ${JSON.stringify({ apply: o.apply, calls: 0 })}::text::jsonb)
      returning id::text as id`;
    return r?.id ?? null;
  };
  const metaAtual = (extra?: Record<string, unknown>) => ({
    apply: o.apply, calls: res.chamadas.usadas, parou: res.parou, erroApi: res.erroApi, offersCreated: res.offersCreated, draftOffers: res.draftOffers,
    mastersCreated: res.mastersCreated, quarentenadas: res.quarentenadas, variantes: res.variantes,
    fontes: res.fontes, ...extra,
  });
  const fecharRun = async (erro?: Error) => {
    if (!runId) return;
    try {
      const fatal = erro != null || res.parou === 'rate_limit' || res.parou === 'auth' || res.parou === 'access' || res.parou === 'erros_seguidos';
      await sql`update collector_runs set finished_at = now(), duration_ms = ${Date.now() - startedMs}, status = ${fatal ? 'error' : res.parou ? 'partial' : 'ok'},
        checked = ${res.chamadas.usadas}, errors = ${res.chamadas.erros}, offers_created = ${res.offersCreated.length}, stopped_because = ${res.parou},
        meta = ${JSON.stringify(metaAtual(erro ? { erro: erro.message.slice(0, 200) } : undefined))}::text::jsonb where id = ${runId}::bigint`;
    } catch (e) {
      console.error('[cobertura-shopee] falha ao fechar collector_runs', (e as Error).message);
    }
  };
  const flush = async () => {
    if (!runId) return;
    await sql`update collector_runs set meta = ${JSON.stringify(metaAtual({ parcialAte: new Date().toISOString() }))}::text::jsonb,
      offers_created = ${res.offersCreated.length}, checked = ${res.chamadas.usadas} where id = ${runId}::bigint`;
  };

  async function chamar(q: Parameters<typeof queryProductOffers>[0]) {
    if (res.chamadas.usadas >= teto) throw Object.assign(new Error('teto_de_chamadas'), { parada: 'teto_de_chamadas' as const });
    if (Date.now() >= o.deadlineMs) throw Object.assign(new Error('orcamento_de_tempo'), { parada: 'orcamento_de_tempo' as const });
    await pacer.wait();
    res.chamadas.usadas++;
    try {
      const r = await queryProductOffers(q);
      errosSeguidos = 0;
      return r;
    } catch (e) {
      res.chamadas.erros++;
      errosSeguidos++;
      if (e instanceof ShopeeApiError) {
        res.erroApi = { kind: e.kind, code: e.code, message: e.message.slice(0, 300) };
        if (e.kind === 'rate_limit') pacer.onRateLimit();
      }
      const parada = paradaPorErro(e instanceof ShopeeApiError ? e.kind : null, errosSeguidos);
      if (parada) throw Object.assign(e as Error, { parada });
      throw e;
    }
  }


  // ---- resolução do destino de um item ----
  type Resolucao =
    | { tipo: 'descartar'; motivo: string }
    | { tipo: 'existente'; masterId: string; masterNome: string; oferta: 'ativa' | 'duvida'; motivo: string; score: number }
    | { tipo: 'novo'; oferta: 'ativa' | 'duvida'; motivo: string; nome: string; score: number; plus?: PropostaMaster; sugestao?: 'approved' | 'review'; jogo?: JogoNovo };
  type ResolucaoMaster = Exclude<Resolucao, { tipo: 'descartar' }>;

  const resolver = async (loja: LojaCobertura, node: ShopeeOfferNode): Promise<Resolucao> => {
    if (loja === 'games') {
      const m = await casarJogo(sql, node.productName, node.priceCents);
      if ('motivo' in m) return { tipo: 'descartar', motivo: m.motivo };
      if ('masterId' in m) {
        return { tipo: 'existente', masterId: m.masterId, masterNome: '', oferta: m.aprovado ? 'ativa' : 'duvida', motivo: m.aprovado ? 'dedup_titulo_plataforma' : 'master_games_em_revisao', score: 1 };
      }
      return { tipo: 'novo', oferta: m.novo.aprovado ? 'ativa' : 'duvida', motivo: m.novo.aprovado ? 'master_novo:games_porteiro_aprovou' : 'master_novo:games_porteiro_revisao', nome: m.novo.titulo, score: 1, jogo: m.novo };
    }
    const d = casarItem(indices.get(loja)!, { itemId: node.itemId, title: node.productName, priceCents: node.priceCents }, loja);
    const dest = destinoDoCasamento(d);
    if (dest.destino === 'descartar') return { tipo: 'descartar', motivo: dest.motivo };
    if (d.destino === 'aceito') return { tipo: 'existente', masterId: d.masterId, masterNome: masterNome.get(d.masterId) ?? '', oferta: 'ativa', motivo: d.verdict.motivo, score: d.verdict.score };
    if (d.destino === 'duvida') return { tipo: 'existente', masterId: d.masterId, masterNome: masterNome.get(d.masterId) ?? '', oferta: 'duvida', motivo: d.motivo, score: d.verdict.score };
    // Sem master equivalente (ou "é outro produto"): o produto passa a ser CRIADO, depois da dedup e do porteiro/escopo.
    if (!ehLojaPlus(loja)) return { tipo: 'descartar', motivo: 'loja_sem_criacao_de_produto' };
    const dec: DecisaoMasterNovo = decidirMasterNovo(loja, { titulo: node.productName, priceCents: node.priceCents, hasImage: !!node.imageUrl }, marcas, dedups.get(loja)!);
    if (dec.acao === 'descartar') return { tipo: 'descartar', motivo: `novo:${dec.motivo}` };
    if (dec.acao === 'anexar') return { tipo: 'existente', masterId: dec.masterId, masterNome: dec.masterNome, oferta: dec.oferta, motivo: dec.motivo, score: 0.8 };
    return { tipo: 'novo', oferta: dec.oferta, motivo: dec.motivo, nome: dec.proposta.nome, score: 0.6, plus: dec.proposta, sugestao: dec.sugestaoPorteiro };
  };

  /** Apply: devolve o id do master (cria o novo, sempre em revisão, e o registra na dedup e no registro de reversão). */
  const garantirMaster = async (rs: ResolucaoMaster, node: ShopeeOfferNode, loja: LojaCobertura): Promise<string> => {
    if (rs.tipo === 'existente') return rs.masterId;
    let id: string;
    if (rs.plus) {
      id = await criarMasterPlus(sql, rs.plus, { imageUrl: node.imageUrl, itemId: node.itemId, sugestao: rs.sugestao ?? 'review', motivo: rs.motivo, runId });
      dedups.get(loja)?.adicionar(rs.plus, id);
    } else {
      id = await criarMasterGame({ ...rs.jogo!, itemId: node.itemId, imageUrl: node.imageUrl, runId });
    }
    res.mastersCreated.push(id);
    masterNome.set(id, rs.nome);
    mastersNovosNaRodada++;
    stats(loja).mastersNovos++;
    await flush(); // registro de reversão do master antes da oferta
    return id;
  };

  /** Marca de variação de preço: sempre no registro da execução; nas colunas da oferta só com a migration 0047 aplicada e SHOPEE_VARIANTE_COLUNAS=1. */
  const registrarVariacao = async (offerId: string, n: ShopeeOfferNode, loja: string) => {
    if (n.variantSpread == null) return;
    if (res.variantes.length < 500) res.variantes.push({ offerId, itemId: n.itemId, loja, spread: n.variantSpread, min: n.variantMinCents, max: n.variantMaxCents, ampla: n.variantAmbigua });
    await gravarVariacaoOferta(offerId, n);
  };

  try {
    runId = await abrirRun();
    res.runId = runId;
    log(`cobertura-shopee: modo=${res.modo} fontes=${fontes.length} teto=${teto} (hora: ${ultimaHora}/${hourlyCap}) paginas=${o.paginas}`);

    let paginasLidas = 0;
    let duvidasEnfileiradas = 0;
    laco: while (paginasLidas < o.paginas) {
      const fonte = proximaFonte(fontes, cursor);
      if (!fonte) break;
      const cur = cursor[fonte.chave] ?? { page: 1, voltas: 0 };
      let r;
      try {
        r = await chamar({
          ...(fonte.tipo === 'categoria' ? { productCatId: fonte.id } : { shopId: fonte.id }),
          sortType: 2, page: cur.page, limit: 50, fields: LIST_FIELDS,
        });
      } catch (e) {
        res.parou = (e as { parada?: MotivoParada }).parada ?? 'erros_seguidos';
        if (!(e as { parada?: MotivoParada }).parada) res.avisos.push(`erro_nao_classificado:${(e as Error).message.slice(0, 120)}`);
        break laco;
      }
      paginasLidas++;
      cursor[fonte.chave] = avancarCursor(cur, { temProxima: r.hasNextPage, vazia: r.nodes.length === 0 });
      res.fontes.push({ chave: fonte.chave, loja: fonte.loja, paginaLida: cur.page, itens: r.nodes.length, temProxima: r.hasNextPage });
      const st = stats(fonte.loja);

      for (const raw of r.nodes) {
        st.lidos++;
        const parsed = parseShopeeNode(raw);
        if ('rejected' in parsed) { descarta(fonte.loja, `preco:${parsed.rejected}`); continue; }
        let node = parsed.node;
        if (node.variantAmbigua) st.variacaoAmpla++; // NÃO descarta (dono, 2026-11-12): entra com o menor preço, marcado
        const ref = `shopee-${node.itemId}`;
        if (existentes.has(ref)) { st.jaCadastrados++; continue; }
        const falha = filtroAnuncio({ sales: node.sales, imageUrl: node.imageUrl, offerLink: node.offerLink, ratingStar: raw?.ratingStar }, { minVendas: MIN_VENDAS, minNota: MIN_NOTA });
        if (falha) { descarta(fonte.loja, `anuncio:${falha}`); continue; }
        if (sinalVendas(node.sales) === 'poucas_vendas') st.poucasVendasSinal++;

        // ---- casamento: master existente, master NOVO ou descarte por condição ----
        const rs = await resolver(fonte.loja, node);
        if (rs.tipo === 'descartar') {
          descarta(fonte.loja, rs.motivo);
          if (fonte.loja !== 'games') amostra({ loja: fonte.loja, item: node.productName.slice(0, 100), motivo: rs.motivo });
          continue;
        }
        const novo = rs.tipo === 'novo';
        if (novo && mastersNovosNaRodada >= tetoMastersNovos) { descarta(fonte.loja, 'novo:limite_de_masters_da_rodada'); continue; }

        // ---- preço fora da faixa 0,35x-3x da mediana do produto: ENTRA quarentenado (fora de média e vitrine); só vale para master existente ----
        let foraDaFaixa = false;
        if (rs.tipo === 'existente') {
          const refs = await precosReferencia(sql, rs.masterId);
          foraDaFaixa = isImplausiblyLow(node.priceCents, refs) || isImplausiblyHigh(node.priceCents, refs);
        }
        const planejarNovo = () => {
          mastersNovosNaRodada++;
          st.mastersNovos++;
          if (rs.tipo === 'novo' && rs.plus) dedups.get(fonte.loja)?.adicionar(rs.plus, `planejado:${++planejadoSeq}`);
        };
        const aposCriar = async (offerId: string) => {
          if (foraDaFaixa) {
            await sql`update affiliate_offers set quarantined_at = now(), updated_at = now() where id = ${offerId}::uuid`;
            res.quarentenadas.push(offerId);
            st.quarentenadas++;
          }
          await registrarVariacao(offerId, node, fonte.loja);
        };

        if (rs.oferta === 'duvida') {
          st.duvidas++;
          if (res.duvidas.length < 100) res.duvidas.push({ loja: fonte.loja, masterId: rs.tipo === 'existente' ? rs.masterId : null, master: rs.tipo === 'existente' ? (masterNome.get(rs.masterId) || rs.masterNome || null) : rs.nome, masterNovo: novo, itemId: node.itemId, titulo: node.productName, preco: money(node.priceCents), variacao: node.variantSpread, motivo: rs.motivo });
          if (!o.apply) {
            st.entram++;
            if (novo) planejarNovo();
            if (foraDaFaixa) st.quarentenadas++;
            continue;
          }
          if (duvidasEnfileiradas >= o.maxDuvidas) { descarta(fonte.loja, 'duvida:acima_do_limite_da_rodada'); continue; }
          try {
            const masterId = await garantirMaster(rs, node, fonte.loja);
            const nomeM = masterNome.get(masterId) ?? (rs.tipo === 'novo' ? rs.nome : rs.masterNome);
            const q = await enfileirarDuvidaShopee(sql, {
              networkId: net.id, masterId, masterNome: nomeM, vertical: fonte.loja, itemId: node.itemId, titulo: node.productName,
              priceCents: node.priceCents, listPriceCents: node.listPriceCents, imageUrl: node.imageUrl, shopName: node.shopName, offerLink: node.offerLink!,
              motivo: rs.motivo, score: rs.score, fonte: fonte.chave, masterNovo: novo,
              variacao: node.variantSpread ? { variantMinCents: node.variantMinCents!, variantMaxCents: node.variantMaxCents!, variantSpread: node.variantSpread } : null,
            });
            if (q) {
              existentes.set(ref, masterId);
              res.draftOffers.push(q.offerId);
              duvidasEnfileiradas++;
              st.duvidasEnfileiradas++;
              st.entram++;
              await aposCriar(q.offerId);
              await flush();
            }
          } catch (e) {
            descarta(fonte.loja, 'gravacao:erro');
            log(`ERRO ao enfileirar ${node.itemId}: ${(e as Error).message.slice(0, 120)}`);
          }
          continue;
        }

        // ---- aceito: confirma por itemId (disponibilidade, preço e loja) e cria a oferta ativa ----
        st.aceitos++;
        if (rs.tipo === 'existente') {
          const ativas = await sql<{ n: number }[]>`select count(*)::int as n from affiliate_offers o join affiliate_networks n on n.id = o.network_id
            where o.master_product_id = ${rs.masterId}::uuid and n.slug = 'shopee' and o.status = 'active' and o.quarantined_at is null`;
          if ((ativas[0]?.n ?? 0) >= MAX_POR_MASTER) { descarta(fonte.loja, 'master_ja_tem_o_maximo_de_ofertas_shopee'); continue; }
        }
        if (!o.apply) {
          st.entram++;
          if (novo) planejarNovo();
          if (foraDaFaixa) st.quarentenadas++;
          amostra({ loja: fonte.loja, par: node.productName.slice(0, 90), master: (rs.tipo === 'existente' ? masterNome.get(rs.masterId) ?? rs.masterId : `NOVO: ${rs.nome}`).slice(0, 70), preco: money(node.priceCents), variacao: node.variantSpread, foraDaFaixa: foraDaFaixa || undefined, motivo: rs.motivo });
          continue;
        }
        try {
          const l = await chamar({ itemId: node.itemId, limit: 5 });
          const m = l.nodes.find((n) => String(n?.itemId) === node.itemId);
          const p2 = m ? parseShopeeNode(m) : null;
          if (!p2 || 'rejected' in p2) { descarta(fonte.loja, 'lookup:indisponivel'); continue; }
          node = { ...p2.node, productName: node.productName, imageUrl: node.imageUrl ?? p2.node.imageUrl, offerLink: node.offerLink && LINK_OFICIAL.test(node.offerLink) ? node.offerLink : p2.node.offerLink };
          if (!node.offerLink || !LINK_OFICIAL.test(node.offerLink)) { descarta(fonte.loja, 'anuncio:sem_offerlink_oficial'); continue; }
          const masterId = await garantirMaster(rs, node, fonte.loja);
          const slug = slugify(`${node.productName.slice(0, 100)}-shopee-${randomUUID().slice(0, 6)}`);
          const [of] = await sql<{ id: string }[]>`
            insert into affiliate_offers (master_product_id, network_id, title, slug, affiliate_url, affiliate_link_pending, image_url, store_name,
                                          external_ref, current_price_cents, status, published_at, last_checked_at, vertical)
            values (${masterId}::uuid, ${net.id}, ${node.productName.slice(0, 200)}, ${slug}, ${node.offerLink}, false, ${node.imageUrl}, ${node.shopName},
                    ${ref}, 0, 'active', now(), now(), ${fonte.loja})
            on conflict (network_id, external_ref) where external_ref is not null and seller_id is null do nothing
            returning id::text as id`;
          if (!of) { descarta(fonte.loja, 'gravacao:oferta_ja_existe'); continue; }
          res.offersCreated.push(of.id);
          existentes.set(ref, masterId);
          await flush(); // registro de reversão primeiro, depois a cotação
          await recordPriceSnapshot({ offerId: of.id, priceCents: node.priceCents, listPriceCents: node.listPriceCents, source: 'api' });
          try { await sql`update affiliate_offers set last_price_confirmed_at = now() where id = ${of.id}::uuid`; } catch { /* coluna opcional */ }
          await aposCriar(of.id);
          st.criadas++;
          st.entram++;
        } catch (e) {
          if ((e as { parada?: MotivoParada }).parada) { res.parou = (e as { parada: MotivoParada }).parada; break laco; }
          descarta(fonte.loja, 'gravacao:erro');
          log(`ERRO ao criar ${node.itemId}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
    }
    if (o.apply) await gravarCursor(sql, cursor).catch((e) => res.avisos.push(`cursor_nao_gravado:${(e as Error).message.slice(0, 80)}`));
  } catch (e) {
    res.parou = res.parou ?? 'erro_interno';
    await fecharRun(e as Error);
    throw e;
  }
  await fecharRun();
  return res;
}

interface JogoNovo {
  titulo: string;
  productType: string;
  classified: Record<string, unknown>;
  gateAttributes: Record<string, unknown>;
  aprovado: boolean;
}
type ResultadoJogo = { masterId: string; aprovado: boolean } | { novo: JogoNovo } | { motivo: string };

/**
 * Games: mesma regra da descoberta gamer (título+plataforma normalizados, `findExistingMasterProduct`). Master existente aprovado => oferta ativa;
 * em revisão => dúvida (fila); rejeitado pelo dono => fora. Sem master equivalente => master NOVO (dono, 2026-11-12), com o porteiro gamer
 * (`entryGateAttributes`): aprovado nasce aprovado; revisão nasce em revisão (oferta em rascunho + fila); rejeitado não nasce.
 */
/** `formatoPadrao` (Amazon): título de jogo sem a palavra 'digital' vale mídia física (mesma suposição do julgamento da Amazon); sem isso a dedup não acha o master físico existente e criaria duplicata. */
export async function casarJogo(sql: Sql, titulo: string, priceCents: number, opts: { formatoPadrao?: 'physical' } = {}): Promise<ResultadoJogo> {
  const { isNonProductAccessory, isUsedCondition } = await import('@/server/collector/discover-products');
  const { resolveProductTypeFromTitle } = await import('@/lib/affiliate/product-type-classifier');
  const { derivePlatformFromTitle, resolveGameFormat } = await import('@/lib/affiliate/game-classification');
  const { classifyFromAttributes } = await import('@/server/collector/sources/mercado-livre-classify');
  const { findExistingMasterProduct } = await import('@/lib/affiliate/dedup');
  const { rejectionOf } = await import('@/lib/catalog/vertical/identity');
  const { entryGateAttributes } = await import('@/lib/catalog/gate');
  if (isNonProductAccessory(titulo) || isUsedCondition(titulo)) return { motivo: 'condicao_ou_acessorio' };
  if (rejectionOf({ id: 'x', name: titulo })) return { motivo: 'fora_de_linha_ou_condicao' };
  const productType = await resolveProductTypeFromTitle(titulo, priceCents);
  if (!productType) return { motivo: 'tipo_fora_de_escopo' };
  const cls = classifyFromAttributes([], titulo);
  let plataforma = cls.gamePlatformGen;
  if (plataforma === 'unknown') plataforma = derivePlatformFromTitle(titulo);
  if (plataforma === 'unknown' && productType !== 'accessory') return { motivo: 'sem_plataforma' };
  let formato = productType === 'game' ? resolveGameFormat(titulo, cls.gameFormat) : cls.gameFormat;
  if (productType === 'game' && opts.formatoPadrao && (formato as string) === 'unknown' && !/\bdigital\b/i.test(titulo)) formato = opts.formatoPadrao as typeof formato;
  const existente = await findExistingMasterProduct(titulo, plataforma, { productType, gameFormat: productType === 'game' ? formato : null });
  if (existente) {
    const [g] = await sql<{ v: string | null; manual: string | null }[]>`
      select attributes->'catalogGate'->>'verdict' as v, attributes->'catalogGate'->>'manual' as manual from master_products where id = ${existente.id}::uuid`;
    if (g?.v === 'rejected' || g?.manual === 'rejected') return { motivo: 'master_games_rejeitado' };
    const aprovado = g?.manual === 'approved' || !g?.v || g.v === 'approved';
    return { masterId: String(existente.id), aprovado };
  }
  // Sem master equivalente: cria, se o porteiro gamer não rejeita.
  const gateAttributes = entryGateAttributes(titulo, productType);
  const verdict = (gateAttributes as { catalogGate?: { verdict?: string } }).catalogGate?.verdict ?? 'approved';
  if (verdict === 'rejected') return { motivo: 'games_porteiro_rejeitou' };
  return { novo: { titulo, productType, classified: { ...cls, gamePlatformGen: plataforma, gameFormat: formato }, gateAttributes, aprovado: verdict === 'approved' } };
}

/** Rollback de uma execução: apaga SÓ ofertas criadas (ativas e rascunhos de dúvida), suas cotações e perguntas pendentes. Nunca toca masters. */
export async function desfazerCobertura(sql: Sql, runId: string, apply: boolean) {
  const [run] = await sql<{ meta: unknown }[]>`select meta from collector_runs where id = ${runId}::bigint and job = ${JOB_COBERTURA}`;
  if (!run) return { ok: false as const, erro: 'run_nao_encontrado' };
  const meta = (typeof run.meta === 'string' ? JSON.parse(run.meta) : run.meta) as { offersCreated?: string[]; draftOffers?: string[]; mastersCreated?: string[]; rolledBackAt?: string } | null;
  if (meta?.rolledBackAt) return { ok: false as const, erro: 'run_ja_desfeito', rolledBackAt: meta.rolledBackAt };
  const ids = [...(meta?.offersCreated ?? []), ...(meta?.draftOffers ?? [])];
  const masters = meta?.mastersCreated ?? [];
  if (ids.length === 0 && masters.length === 0) return { ok: true as const, apply, runId, solicitadas: 0, apagadas: 0 };
  const found = ids.length === 0 ? [] : await sql<{ id: string }[]>`
    select o.id::text as id from affiliate_offers o join affiliate_networks n on n.id = o.network_id
    where o.id in ${sql(ids)} and n.slug = 'shopee' and o.external_ref like 'shopee-%'`;
  const alvo = found.map((r) => r.id);
  if (apply && alvo.length > 0) {
    await sql.begin(async (tx) => {
      await tx`delete from identity_review_items where offer_id in ${tx(alvo)} and status = 'pending'`;
      await tx`delete from affiliate_price_snapshots where offer_id in ${tx(alvo)}`;
      await tx`delete from affiliate_offers where id in ${tx(alvo)}`;
    });
  }
  // Masters criados por ESTA execução: só apaga os que ficaram sem nenhuma oferta e ainda carregam a marca desta execução (nunca toca master antigo).
  let mastersApagados = 0;
  const mastersAlvo = masters.length
    ? (
        await sql<{ id: string }[]>`
        select m.id::text as id from master_products m
        where m.id in ${sql(masters)} and m.attributes -> 'shopeeCriacao' ->> 'runId' = ${runId}
          and not exists (select 1 from affiliate_offers o where o.master_product_id = m.id and not (o.id::text = any(${alvo}::text[])))`
      ).map((r) => r.id)
    : [];
  if (apply && mastersAlvo.length > 0) {
    await sql`delete from master_products where id in ${sql(mastersAlvo)}`;
    mastersApagados = mastersAlvo.length;
  }
  if (apply) {
    const novo = JSON.stringify({ ...meta, rolledBackAt: new Date().toISOString(), rolledBack: alvo.length, mastersRolledBack: mastersApagados });
    await sql`update collector_runs set meta = ${novo}::text::jsonb where id = ${runId}::bigint`;
  }
  return { ok: true as const, apply, runId, solicitadas: ids.length, encontradas: alvo.length, apagadas: apply ? alvo.length : 0, mastersEncontrados: mastersAlvo.length, mastersApagados };
}

/**
 * MEDIÇÃO de categorias (somente leitura, <= `maxCalls` chamadas): para cada loja, busca por palavra dos masters mais ofertados e agrega os
 * `productCatIds` que a PRÓPRIA API devolve. Serve para o dono conferir (guia seller.shopee.com.br/edu/category-guide) e só então preencher a
 * configuração. Se a API recusar o campo, o erro volta no resultado. Não grava nada.
 */
export async function medirCategoriasCobertura(sql: Sql, lojas: LojaCobertura[], maxCalls = 24): Promise<{ porLoja: Record<string, ResumoCategoria[]>; chamadas: number; erros: string[] }> {
  const { isShopeeAffiliateConfigured, ShopeeApiError } = await import('@/server/collector/sources/shopee-auth');
  if (!isShopeeAffiliateConfigured()) return { porLoja: {}, chamadas: 0, erros: ['sem_credenciais'] };
  const { queryProductOffers } = await import('@/server/collector/sources/shopee');
  const { createShopeePacer } = await import('@/server/collector/shopee-pacing');
  const { buildShopeeQueries } = await import('@/lib/affiliate/shopee-identity');
  const pacer = createShopeePacer();
  const out: Record<string, ResumoCategoria[]> = {};
  const erros: string[] = [];
  let chamadas = 0;
  const alvo = lojas.length ? lojas : (['games', 'eletrodomesticos', 'eletroeletronicos', 'esporte', 'impressao3d', 'livros', 'tecnologia'] as LojaCobertura[]);
  const porLoja = Math.max(1, Math.floor(maxCalls / alvo.length));
  for (const loja of alvo) {
    const termos: string[] = [];
    if (loja === 'games') termos.push('jogo ps5', 'jogo nintendo switch', 'console playstation 5');
    else {
      const ms = (await carregarMasters(sql, loja)).sort((a, b) => b.n_ativas - a.n_ativas).slice(0, porLoja);
      for (const m of ms) {
        const id = masterFromRow(m as any);
        if (id) termos.push(buildShopeeQueries(id)[0]);
      }
    }
    const nodes: any[] = [];
    for (const t of termos.slice(0, porLoja)) {
      if (chamadas >= maxCalls) break;
      await pacer.wait();
      chamadas++;
      try {
        const r = await queryProductOffers({ keyword: t, page: 1, limit: 20, sortType: 2, fields: LIST_FIELDS_COM_CAT });
        nodes.push(...r.nodes);
      } catch (e) {
        erros.push(`${loja}:${(e as Error).message.slice(0, 140)}`);
        if (e instanceof ShopeeApiError && e.isFatalForBatch) return { porLoja: out, chamadas, erros };
      }
    }
    out[loja] = resumirCategorias(nodes).slice(0, 15);
  }
  return { porLoja: out, chamadas, erros };
}
