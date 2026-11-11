import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { affiliateNetworks, affiliateOffers, systemConfig } from '@/db/schema';
import { slugify } from '@/lib/slugify';
import { reviewGateFor, VERTICAL_GATE_VERSION } from '@/lib/catalog/vertical/gate';
import { CATEGORIAS_MEDIDAS } from '@/lib/catalog/vertical/esporte-shopee-lexico';
import { avaliarTituloEsporte, IndiceMasters, iscaNoLote, termosEsporte, type EsporteOk } from '@/lib/catalog/vertical/esporte-shopee';
import { fetchShopeeGraphQL, generateShopeeAffiliateLink, isShopeeAffiliateConfigured, ShopeeApiError } from './sources/shopee-auth';
import { parseShopeeNode, queryProductOffers, shopeePublicUrl, type ShopeeOfferNode } from './sources/shopee';
import { createShopeePacer } from './shopee-pacing';
import { getMasterReferencePrices, isImplausiblyHigh, isImplausiblyLow } from './price-plausibility';
import { recordPriceSnapshot } from './record-price-snapshot';
import { ensureShopeeNetwork } from './discover-shopee-products';

/**
 * DESCOBERTA SHOPEE DO DEPARTAMENTO ESPORTE (tênis, roupas esportivas e acessórios), SÓ pela Affiliate Open API oficial
 * (productOfferV2 por palavra-chave). Decisão do dono (2026-11-11): o catálogo oficial do ML devolve quase zero para essas
 * categorias. Sem credenciais não chama nada. Sem `apply` NÃO escreve em lugar nenhum (dry-run: lê a API e o banco).
 *
 * Regras (ver src/lib/catalog/vertical/esporte-shopee.ts):
 *  - só produto NOVO, EM LINHA e ORIGINAL de marca; identidade forte = marca + modelo/linha + gênero lidos do título contra um léxico fechado;
 *  - um produto = um master: dedup por chave de identidade, por (segmento, marca, modelo, gênero) e por título contra os masters existentes
 *    (inclusive os semeados pelo ML); modelo que é prefixo do existente vai para conferência, nunca vira master duplicado;
 *  - master nasce com catalogGate 'review' (invisível) e sugestão 'approved'; quem libera é scripts/aprovar-masters-nicho.ts (critérios v2);
 *  - oferta com link de afiliado oficial (generateShortLink; se falhar, o offerLink oficial do próprio anúncio; senão URL pública + pendente).
 *
 * Orçamento por execução: termos, páginas, chamadas (busca + links), masters, ofertas e tempo. Ritmo pelo pacer da Shopee; o primeiro
 * 10030 PARA a execução (o cursor não avança além do termo interrompido).
 */

export const CURSOR_KEY = 'discover_shopee_esporte_cursor';
export const LAST_RUN_KEY = 'discover_shopee_esporte_last_run';

export const LIMITES_PADRAO = {
  termos: 8,
  paginas: 2,
  maxChamadas: 150,
  maxMasters: 40,
  maxOfertas: 120,
  orcamentoMs: 240_000,
  minVendas: 5,
  minNota: 4.0,
} as const;

export const LIMITES_MAXIMOS = { termos: 30, paginas: 4, maxChamadas: 400, maxMasters: 200, maxOfertas: 400, orcamentoMs: 270_000 } as const;

export interface DiscoverEsporteOptions {
  /** false (padrão) = dry-run: nada é gravado e nenhum link é gerado. */
  apply: boolean;
  termos?: number;
  paginas?: number;
  /** Posição inicial na lista de termos; ausente = cursor persistido. */
  from?: number;
  /** Termo único (teste dirigido). Não mexe no cursor. */
  q?: string;
  /** productCatId medido (só dígitos). */
  catId?: string;
  maxChamadas?: number;
  maxMasters?: number;
  maxOfertas?: number;
  orcamentoMs?: number;
  minVendas?: number;
  minNota?: number;
  /** 'offer' = usa o offerLink do anúncio em vez de gastar uma chamada de generateShortLink por oferta. */
  link?: 'short' | 'offer';
}

interface Amostra {
  titulo: string;
  detalhe?: string | null;
  precoCentavos?: number;
  chave?: string;
}

interface Planejado {
  acao: 'criar_master' | 'anexar_a_master_existente';
  chave: string;
  masterNome: string;
  masterExistente?: string;
  titulo: string;
  precoCentavos: number;
  loja: string | null;
  itemId: string;
  via?: string;
}

export interface DiscoverEsporteSummary {
  modo: 'dry-run' | 'apply';
  skipped?: 'sem_credenciais';
  termosPlanejados: string[];
  termosBuscados: number;
  paginasBuscadas: number;
  chamadas: { busca: number; links: number; total: number };
  encontrados: number;
  /** Contagem por motivo (descartes e decisões). */
  contadores: Record<string, number>;
  mastersCriados: number;
  mastersPlanejados: number;
  ofertasCriadas: number;
  ofertasPlanejadas: number;
  anexadasAMasterExistente: number;
  parou: string | null;
  cursor: { inicio: number; proximo: number; total: number; persistido: boolean };
  limites: Record<string, number | string>;
  amostras: Record<string, Amostra[]>;
  planejados: Planejado[];
  criados: Array<{ masterId: string; offerId: string; chave: string; nomeMaster: string; novoMaster: boolean }>;
  erros: string[];
  ms: number;
}

const MAX_AMOSTRAS = 8;
const MAX_PLANEJADOS = 80;
const LINK_OFICIAL = /^https:\/\/([a-z0-9-]+\.)*(shopee\.com\.br|shp\.ee)\//i;

const clamp = (v: number | undefined, def: number, max: number) => Math.min(Math.max(1, Math.floor(Number.isFinite(v as number) ? (v as number) : def)), max);

async function lerCursor(): Promise<number> {
  try {
    const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, CURSOR_KEY)).limit(1);
    const n = Number((row?.value as { next?: number } | undefined)?.next);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

async function gravarConfig(key: string, value: Record<string, unknown>, description: string): Promise<void> {
  try {
    await db.insert(systemConfig).values({ key, value, description }).onConflictDoUpdate({ target: systemConfig.key, set: { value, updatedAt: new Date() } });
  } catch (e) {
    console.error(`discover-shopee-esporte: falha ao gravar ${key}`, (e as Error).message);
  }
}

interface Candidato {
  node: ShopeeOfferNode;
  av: EsporteOk;
  nota: number | null;
}

export async function discoverShopeeEsporte(opts: DiscoverEsporteOptions): Promise<DiscoverEsporteSummary> {
  const t0 = Date.now();
  const L = {
    termos: clamp(opts.termos, LIMITES_PADRAO.termos, LIMITES_MAXIMOS.termos),
    paginas: clamp(opts.paginas, LIMITES_PADRAO.paginas, LIMITES_MAXIMOS.paginas),
    maxChamadas: clamp(opts.maxChamadas, LIMITES_PADRAO.maxChamadas, LIMITES_MAXIMOS.maxChamadas),
    maxMasters: clamp(opts.maxMasters, LIMITES_PADRAO.maxMasters, LIMITES_MAXIMOS.maxMasters),
    maxOfertas: clamp(opts.maxOfertas, LIMITES_PADRAO.maxOfertas, LIMITES_MAXIMOS.maxOfertas),
    orcamentoMs: clamp(opts.orcamentoMs, LIMITES_PADRAO.orcamentoMs, LIMITES_MAXIMOS.orcamentoMs),
    minVendas: Math.max(0, Math.floor(opts.minVendas ?? LIMITES_PADRAO.minVendas)),
    minNota: Math.max(0, Math.min(5, opts.minNota ?? LIMITES_PADRAO.minNota)),
  };
  const apply = opts.apply === true;
  const lista = opts.q ? [opts.q] : termosEsporte();
  const total = lista.length;
  const inicio = opts.q ? 0 : opts.from != null ? Math.max(0, Math.floor(opts.from)) % total : (await lerCursor()) % total;
  const nTermos = Math.min(L.termos, total);
  const termos = Array.from({ length: nTermos }, (_, i) => lista[(inicio + i) % total]);

  const resumo: DiscoverEsporteSummary = {
    modo: apply ? 'apply' : 'dry-run',
    termosPlanejados: termos,
    termosBuscados: 0,
    paginasBuscadas: 0,
    chamadas: { busca: 0, links: 0, total: 0 },
    encontrados: 0,
    contadores: {},
    mastersCriados: 0,
    mastersPlanejados: 0,
    ofertasCriadas: 0,
    ofertasPlanejadas: 0,
    anexadasAMasterExistente: 0,
    parou: null,
    cursor: { inicio, proximo: inicio, total, persistido: false },
    limites: { ...L, link: opts.link ?? 'short', catId: opts.catId ?? '' },
    amostras: {},
    planejados: [],
    criados: [],
    erros: [],
    ms: 0,
  };
  if (!isShopeeAffiliateConfigured()) {
    resumo.skipped = 'sem_credenciais';
    resumo.ms = Date.now() - t0;
    return resumo;
  }

  const bump = (k: string, n = 1) => {
    resumo.contadores[k] = (resumo.contadores[k] ?? 0) + n;
  };
  const amostra = (k: string, a: Amostra) => {
    const arr = (resumo.amostras[k] ??= []);
    if (arr.length < MAX_AMOSTRAS) arr.push(a);
  };

  const deadline = t0 + L.orcamentoMs;
  const pacer = createShopeePacer();
  const aguardar = async () => {
    await pacer.wait();
  };

  try {
    // Índice dos masters de esporte já existentes (criados pelo ML ou por esta descoberta).
    const indice = new IndiceMasters();
    const linhas = await db.execute<{ id: string; name: string; seg: string | null; ik: string | null; cat: Record<string, unknown> | null }>(sql`
      select id::text as id, name, attributes -> 'vertical' ->> 'segment' as seg, attributes -> 'vertical' ->> 'identityKey' as ik,
             attributes -> 'vertical' -> 'catalogAttributes' as cat
      from master_products where vertical = 'esporte' and (attributes ->> 'mergedInto') is null`);
    for (const r of linhas) indice.add({ id: r.id, name: r.name, segmento: r.seg, identityKey: r.ik, catalogAttributes: r.cat });

    let networkId: string | null = null;
    if (apply) networkId = (await ensureShopeeNetwork()).id;
    else {
      const [n] = await db.select({ id: affiliateNetworks.id }).from(affiliateNetworks).where(eq(affiliateNetworks.slug, 'shopee')).limit(1);
      networkId = n?.id ?? null;
    }

    const vistos = new Set<string>();
    let planejadoSeq = 0;
    let parar = false;
    let termosConcluidos = 0;

    for (const termo of termos) {
      if (parar) break;
      // ---- 1. busca (paginada, com orçamento e pacer) ----
      const brutos: any[] = [];
      let termoCompleto = true;
      for (let pagina = 1; pagina <= L.paginas; pagina++) {
        if (resumo.chamadas.total >= L.maxChamadas) {
          resumo.parou = 'limite_de_chamadas';
          parar = true;
          termoCompleto = false;
          break;
        }
        if (Date.now() > deadline) {
          resumo.parou = 'orcamento_de_tempo';
          parar = true;
          termoCompleto = false;
          break;
        }
        await aguardar();
        resumo.chamadas.busca++;
        resumo.chamadas.total++;
        try {
          const res = await queryProductOffers({ fields: 'itemId productName priceMin priceMax sales ratingStar imageUrl productLink offerLink', keyword: termo, page: pagina, limit: 50, sortType: 2, ...(opts.catId ? { productCatId: opts.catId } : {}) });
          resumo.paginasBuscadas++;
          brutos.push(...res.nodes);
          if (!res.hasNextPage) break;
        } catch (err) {
          termoCompleto = false;
          if (err instanceof ShopeeApiError) {
            if (err.kind === 'rate_limit') {
              pacer.onRateLimit();
              resumo.parou = 'rate_limit_10030';
              parar = true;
            } else if (err.isFatalForBatch) {
              resumo.parou = `erro_${err.kind}`;
              parar = true;
            }
          }
          resumo.erros.push(`busca "${termo}" p${pagina}: ${(err as Error).message.slice(0, 200)}`);
          break;
        }
      }
      if (parar && !termoCompleto && brutos.length === 0) break;
      resumo.termosBuscados++;
      resumo.encontrados += brutos.length;

      // ---- 2. leitura e avaliação de identidade (puro) ----
      const candidatos: Candidato[] = [];
      for (const raw of brutos) {
        const parsed = parseShopeeNode(raw);
        if ('rejected' in parsed) {
          bump(`preco_${parsed.rejected}`);
          continue;
        }
        const node = parsed.node;
        if (vistos.has(node.itemId)) {
          bump('repetido_na_execucao');
          continue;
        }
        vistos.add(node.itemId);
        const av = avaliarTituloEsporte(node.productName);
        if (!av.ok) {
          bump(av.motivo);
          amostra(av.motivo, { titulo: node.productName, detalhe: av.detalhe, precoCentavos: node.priceCents });
          continue;
        }
        const nota = Number(raw?.ratingStar);
        const notaOk = Number.isFinite(nota) && nota > 0 ? nota : null;
        if ((node.sales ?? 0) < L.minVendas) {
          bump('poucas_vendas');
          continue;
        }
        if (notaOk != null && notaOk < L.minNota) {
          bump('nota_baixa');
          continue;
        }
        if (!node.imageUrl) {
          bump('sem_foto');
          continue;
        }
        if (av.pisoCentavos && node.priceCents < av.pisoCentavos) {
          bump('preco_abaixo_do_piso');
          amostra('preco_abaixo_do_piso', { titulo: node.productName, precoCentavos: node.priceCents, chave: av.chave });
          continue;
        }
        candidatos.push({ node, av, nota: notaOk });
      }
      if (candidatos.length === 0) {
        if (termoCompleto) termosConcluidos++;
        continue;
      }

      // ---- 3. ofertas que já existem (uma consulta por termo) ----
      const refs = candidatos.map((c) => `shopee-${c.node.itemId}`);
      const jaExistem = new Set(
        (await db.select({ r: affiliateOffers.externalRef }).from(affiliateOffers).where(inArray(affiliateOffers.externalRef, refs))).map((x) => x.r)
      );
      const grupoPrecos = new Map<string, number[]>();
      for (const c of candidatos) grupoPrecos.set(c.av.chave, [...(grupoPrecos.get(c.av.chave) ?? []), c.node.priceCents]);

      // ---- 4. decisão por candidato (mais vendidos primeiro) ----
      candidatos.sort((a, b) => (b.node.sales ?? 0) - (a.node.sales ?? 0));
      for (const c of candidatos) {
        if (Date.now() > deadline) {
          resumo.parou = 'orcamento_de_tempo';
          parar = true;
          termoCompleto = false;
          break;
        }
        if (resumo.ofertasCriadas + resumo.ofertasPlanejadas >= L.maxOfertas) {
          resumo.parou = 'limite_de_ofertas';
          parar = true;
          termoCompleto = false;
          break;
        }
        const { node, av } = c;
        if (jaExistem.has(`shopee-${node.itemId}`)) {
          bump('oferta_ja_existe');
          continue;
        }
        const achado = indice.buscar(av);
        if (achado?.tipo === 'ambiguo') {
          bump('possivel_duplicata_conferir');
          amostra('possivel_duplicata_conferir', { titulo: node.productName, detalhe: `existente: ${achado.name} (modelo ${achado.modelo})`, chave: av.chave });
          continue;
        }
        const existenteId = achado?.tipo === 'existente' && !achado.id.startsWith('planejado:') ? achado.id : null;

        // Isca: contra as cotações do master existente (>= 2) ou, sem referência, contra o lote da busca.
        let isca = false;
        if (existenteId) {
          const ref = await getMasterReferencePrices(existenteId);
          isca = isImplausiblyLow(node.priceCents, ref) || isImplausiblyHigh(node.priceCents, ref);
          if (!isca && ref.length < 2) isca = iscaNoLote(node.priceCents, grupoPrecos.get(av.chave) ?? []);
        } else {
          isca = iscaNoLote(node.priceCents, grupoPrecos.get(av.chave) ?? []);
        }
        if (isca) {
          bump('preco_isca');
          amostra('preco_isca', { titulo: node.productName, precoCentavos: node.priceCents, chave: av.chave });
          continue;
        }
        const novoMaster = !achado;
        if (novoMaster && resumo.mastersCriados + resumo.mastersPlanejados >= L.maxMasters) {
          bump('limite_de_masters');
          resumo.parou = resumo.parou ?? 'limite_de_masters';
          continue;
        }

        if (!apply) {
          const id = novoMaster ? `planejado:${++planejadoSeq}` : achado!.id;
          if (novoMaster) {
            indice.adicionar(av, id);
            resumo.mastersPlanejados++;
          } else if (existenteId) resumo.anexadasAMasterExistente++;
          resumo.ofertasPlanejadas++;
          if (resumo.planejados.length < MAX_PLANEJADOS) {
            resumo.planejados.push({
              acao: novoMaster ? 'criar_master' : 'anexar_a_master_existente',
              chave: av.chave,
              masterNome: novoMaster ? av.nomeMaster : achado!.name,
              ...(achado ? { masterExistente: achado.id } : {}),
              titulo: node.productName,
              precoCentavos: node.priceCents,
              loja: node.shopName,
              itemId: node.itemId,
              ...(achado?.tipo === 'existente' ? { via: achado.via } : {}),
            });
          }
          continue;
        }

        // ---- 5. grava (apply): link oficial, master (se novo) + oferta numa transação, depois a cotação ----
        try {
          const publicUrl = shopeePublicUrl(node);
          let afiliado: string | null = null;
          const usarOffer = opts.link === 'offer';
          if (!usarOffer) {
            if (resumo.chamadas.total >= L.maxChamadas) {
              resumo.parou = 'limite_de_chamadas';
              parar = true;
              termoCompleto = false;
              break;
            }
            await aguardar();
            resumo.chamadas.links++;
            resumo.chamadas.total++;
            afiliado = await generateShopeeAffiliateLink(publicUrl);
          }
          const oficial = node.offerLink && LINK_OFICIAL.test(node.offerLink) ? node.offerLink : null;
          const url = afiliado ?? oficial ?? publicUrl;
          const pendente = !afiliado && !oficial;

          const res = await db.transaction(async (tx) => {
            let masterId = existenteId;
            if (!masterId) {
              const now = new Date().toISOString();
              const attributes = {
                catalogGate: reviewGateFor(
                  { verdict: 'approved', category: 'ok', reason: 'evidencia_positiva:brand_model_shopee', matched: null, version: VERTICAL_GATE_VERSION, vertical: 'esporte' },
                  now
                ),
                vertical: {
                  segment: av.segmento,
                  identityKey: av.chave,
                  keyKind: 'brand_model',
                  domainId: null,
                  parentId: null,
                  gtins: [],
                  source: 'discover-shopee-esporte',
                  titleDerived: true,
                  seededAt: now,
                  catalogAttributes: av.catalogAttributes,
                },
              };
              const base = slugify(av.nomeMaster);
              for (const slug of [base, `${base}-${randomUUID().slice(0, 6)}`]) {
                const inserted = await tx.execute<{ id: string }>(sql`
                  insert into master_products (name, slug, manufacturer, default_images, attributes, vertical, product_type, is_verified)
                  values (${av.nomeMaster}, ${slug}, ${av.marca.display}, ${JSON.stringify(node.imageUrl ? [node.imageUrl] : [])}::jsonb, ${JSON.stringify(attributes)}::jsonb, 'esporte', 'general'::product_type, false)
                  on conflict (slug) do nothing
                  returning id::text as id`);
                if (inserted[0]?.id) {
                  masterId = inserted[0].id;
                  break;
                }
              }
              if (!masterId) throw new Error('slug_do_master_em_conflito');
            }
            const [oferta] = await tx
              .insert(affiliateOffers)
              .values({
                masterProductId: masterId,
                vertical: 'esporte',
                networkId: networkId!,
                title: node.productName,
                slug: slugify(`${node.productName.slice(0, 100)}-shopee-${randomUUID().slice(0, 6)}`),
                affiliateUrl: url,
                affiliateLinkPending: pendente,
                imageUrl: node.imageUrl,
                storeName: node.shopName,
                externalRef: `shopee-${node.itemId}`,
                currentPriceCents: 0, // 0 = "ainda não coletado"; recordPriceSnapshot grava o preço real e o 1º snapshot
                status: 'active',
                publishedAt: new Date(),
                lastCheckedAt: new Date(),
              })
              .returning({ id: affiliateOffers.id });
            return { masterId, offerId: oferta.id };
          });

          await recordPriceSnapshot({ offerId: res.offerId, priceCents: node.priceCents, listPriceCents: node.listPriceCents, source: 'api' });
          if (novoMaster) {
            indice.adicionar(av, res.masterId!);
            resumo.mastersCriados++;
          } else resumo.anexadasAMasterExistente++;
          resumo.ofertasCriadas++;
          if (pendente) bump('link_pendente');
          else if (!afiliado) bump('link_offerlink_oficial');
          if (resumo.criados.length < 200) resumo.criados.push({ masterId: res.masterId!, offerId: res.offerId, chave: av.chave, nomeMaster: av.nomeMaster, novoMaster });
        } catch (e) {
          bump('erro_ao_gravar');
          resumo.erros.push(`item ${node.itemId}: ${(e as Error).message.slice(0, 200)}`);
        }
      }
      if (termoCompleto) termosConcluidos++;
    }

    // ---- cursor e registro da execução (só no apply e fora de termo dirigido) ----
    resumo.cursor.proximo = (inicio + termosConcluidos) % total;
    if (apply && !opts.q && opts.from == null) {
      await gravarConfig(CURSOR_KEY, { next: resumo.cursor.proximo, total, at: new Date().toISOString() }, 'Cursor da descoberta Shopee de esporte (discover-shopee-esporte.ts).');
      resumo.cursor.persistido = true;
    }
  } catch (e) {
    resumo.erros.push(`erro global: ${(e as Error).message.slice(0, 300)}`);
    resumo.parou = resumo.parou ?? 'erro_global';
  }

  resumo.ms = Date.now() - t0;
  if (apply) {
    await gravarConfig(
      LAST_RUN_KEY,
      {
        at: new Date().toISOString(),
        termos: resumo.termosPlanejados,
        contadores: resumo.contadores,
        mastersCriados: resumo.mastersCriados,
        ofertasCriadas: resumo.ofertasCriadas,
        anexadas: resumo.anexadasAMasterExistente,
        chamadas: resumo.chamadas,
        parou: resumo.parou,
        erros: resumo.erros.length,
        masterIdsCriados: resumo.criados.filter((c) => c.novoMaster).map((c) => c.masterId),
        ms: resumo.ms,
      },
      'Resumo da última execução real da descoberta Shopee de esporte.'
    );
  }
  return resumo;
}

/**
 * MEDIÇÃO (somente leitura, <= 8 chamadas): descobre quais campos extras a Open API aceita em ProductOfferV2 (categoria, tipo de loja,
 * comissão). Cada campo candidato vai numa consulta própria: o erro de um não derruba os outros e a mensagem de "campo inexistente"
 * costuma sugerir o nome certo. Com isso o dono preenche CATEGORIAS_MEDIDAS em esporte-shopee-lexico.ts.
 */
export async function medirCamposShopee(termo = 'tenis nike'): Promise<{ base: unknown; campos: Array<{ campo: string; ok: boolean; amostra?: unknown; erro?: string }> }> {
  if (!isShopeeAffiliateConfigured()) return { base: 'sem_credenciais', campos: [] };
  const pacer = createShopeePacer();
  const consulta = (campo: string) => `query M($keyword: String) { productOfferV2(keyword: $keyword, page: 1, limit: 3, sortType: 2) { nodes { itemId productName ${campo} } } }`;
  const rodar = async (campo: string) => {
    await pacer.wait();
    try {
      const data = await fetchShopeeGraphQL<{ productOfferV2?: { nodes?: unknown[] } }>(consulta(campo), { keyword: termo });
      return { ok: true as const, amostra: data?.productOfferV2?.nodes ?? [] };
    } catch (e) {
      return { ok: false as const, erro: (e as Error).message.slice(0, 300) };
    }
  };
  const base = await rodar('');
  const campos: Array<{ campo: string; ok: boolean; amostra?: unknown; erro?: string }> = [];
  if (base.ok === false && /10030|rate/i.test(base.erro)) return { base, campos };
  for (const campo of ['productCatIds', 'productCatId', 'shopType', 'commissionRate', 'priceDiscountRate']) {
    const r = await rodar(campo);
    campos.push({ campo, ...r });
    if (!r.ok && /10030|rate/i.test(r.erro)) break;
  }
  return { base, campos };
}

export { CATEGORIAS_MEDIDAS };
