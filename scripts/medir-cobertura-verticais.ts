/**
 * Medicao de cobertura de verticais no Mercado Livre e na Shopee (SOMENTE LEITURA, API oficial).
 * Autorizada pelo dono em 2026-11-08: teto de 60 chamadas ML e 3 chamadas Shopee, somados entre execucoes
 * (contador persistente em --estado, padrao scripts/.medicao-cobertura-estado.json fora do repo: ver ESTADO).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/medir-cobertura-verticais.ts --fase busca
 *   npx tsx --env-file=.env.local scripts/medir-cobertura-verticais.ts --fase detalhe   (/products/{id} + /products/{id}/items)
 *   npx tsx --env-file=.env.local scripts/medir-cobertura-verticais.ts --fase itens     (multiget /items?ids= por vertical)
 *   npx tsx --env-file=.env.local scripts/medir-cobertura-verticais.ts --fase shopee
 *
 * Regras: so leitura. O token ML e lido do banco por SELECT (system_config); se expirado o script PARA (renovar
 * regravaria o refresh_token rotativo no banco, o que e escrita). Nenhum token e impresso nem salvo. Nada e gravado
 * no banco. Nenhum dado e inventado: o que nao veio da API fica null/ausente.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const TETO_ML = 60;
const TETO_SHOPEE = 3;
const ESTADO = process.env.MEDICAO_ESTADO || path.resolve('scripts', '.medicao-cobertura-estado.json');
const SAIDA = process.env.MEDICAO_SAIDA || path.resolve('scripts', '.medicao-cobertura-bruto.json');

type Chamada = { n: number; rede: 'ml' | 'shopee'; endpoint: string; status: number | string; ms: number; headers?: Record<string, string> };
type Estado = { chamadas: Chamada[]; dados: Record<string, any> };

const VERTICAIS: { chave: string; grupo: string; q: string }[] = [
  { chave: 'notebook', grupo: 'tecnologia', q: 'notebook' },
  { chave: 'ssd', grupo: 'tecnologia', q: 'ssd 1tb' },
  { chave: 'placa-de-video', grupo: 'tecnologia', q: 'placa de video rtx' },
  { chave: 'impressora-3d', grupo: 'tecnologia', q: 'impressora 3d' },
  { chave: 'impressora', grupo: 'tecnologia', q: 'impressora multifuncional' },
  { chave: 'smart-tv', grupo: 'eletroeletronicos', q: 'smart tv 55' },
  { chave: 'soundbar', grupo: 'eletroeletronicos', q: 'soundbar' },
  { chave: 'livros', grupo: 'livros', q: 'livro 9788535914849' },
  { chave: 'geladeira', grupo: 'eletrodomesticos', q: 'geladeira frost free' },
  { chave: 'air-fryer', grupo: 'eletrodomesticos', q: 'air fryer' },
  { chave: 'maquina-de-lavar', grupo: 'eletrodomesticos', q: 'maquina de lavar roupa' },
  { chave: 'tenis-de-corrida', grupo: 'esporte', q: 'tenis de corrida' },
  { chave: 'bola', grupo: 'esporte', q: 'bola de futebol' },
];

// A busca do ML nao ordena por relevancia de forma confiavel (achado desta medicao): escolhe o 1o resultado do dominio esperado.
const DOMINIO: Record<string, RegExp> = {
  notebook: /NOTEBOOKS$/, ssd: /HARD_DRIVES_AND_SSDS/, 'placa-de-video': /GRAPHICS_CARDS/, 'impressora-3d': /3D_PRINTERS$/,
  impressora: /PRINTERS$/, 'smart-tv': /TELEVISIONS/, soundbar: /HOME_THEATERS|SOUNDBAR/, livros: /BOOKS/, geladeira: /REFRIGERATORS/,
  'air-fryer': /AIR_FRYERS/, 'maquina-de-lavar': /^MLB-WASHING_MACHINES/, 'tenis-de-corrida': /SNEAKERS/, bola: /FOOTBALL_BALLS/,
};

function carregar(): Estado {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return { chamadas: [], dados: {} };
  }
}
function salvar(e: Estado) {
  fs.writeFileSync(ESTADO, JSON.stringify(e, null, 2));
}
const estado = carregar();
const usadas = (rede: 'ml' | 'shopee') => estado.chamadas.filter((c) => c.rede === rede).length;

function sanitizaUrl(u: string) {
  return u.replace(/access_token=[^&]+/g, 'access_token=***');
}

let token = '';
async function lerToken() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ausente');
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const rows = await sql`select value from system_config where key = 'mercado_livre_oauth' limit 1`;
    const v = rows[0]?.value as { accessToken?: string; expiresAt?: number } | undefined;
    if (!v?.accessToken) throw new Error('ML: nenhum token salvo em system_config (OAuth nao concluido)');
    const restanteMin = Math.round(((v.expiresAt ?? 0) - Date.now()) / 60000);
    if (restanteMin < 3) throw new Error(`ML: access_token expirado ou a ${restanteMin} min de expirar; renovar grava no banco, entao o script PARA`);
    console.log(`token ML ok (expira em ~${restanteMin} min)`);
    token = v.accessToken;
  } finally {
    await sql.end();
  }
}

class TetoAtingido extends Error {}

async function ml(endpoint: string): Promise<{ status: number; json: any }> {
  if (usadas('ml') >= TETO_ML) throw new TetoAtingido(`teto de ${TETO_ML} chamadas ML atingido`);
  const t0 = Date.now();
  const n = usadas('ml') + 1;
  let status: number | string = 'rede';
  let json: any = null;
  let headers: Record<string, string> = {};
  try {
    const res = await fetch(`https://api.mercadolibre.com${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    status = res.status;
    for (const [k, v] of res.headers) if (/rate|limit|remaining|retry|reset|quota|x-request|x-ratelimit/i.test(k)) headers[k] = v;
    const txt = await res.text();
    try {
      json = JSON.parse(txt);
    } catch {
      json = { _raw: txt.slice(0, 200) };
    }
  } catch (e) {
    json = { _erro: (e as Error).message };
  }
  const ms = Date.now() - t0;
  estado.chamadas.push({ n, rede: 'ml', endpoint: sanitizaUrl(endpoint), status, ms, headers });
  salvar(estado);
  console.log(`ML #${n}/${TETO_ML} ${sanitizaUrl(endpoint)} -> ${status} (${ms} ms)`);
  if (status === 429) throw new TetoAtingido('429 recebido: parando');
  return { status: typeof status === 'number' ? status : 0, json };
}

const attrIds = (attrs: any[] | undefined) => (attrs ?? []).filter((a) => a?.value_name || a?.values?.some?.((v: any) => v?.name)).map((a) => a.id);

async function faseBusca() {
  for (const v of VERTICAIS) {
    if (estado.dados[v.chave]?.busca) continue;
    const r = await ml(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(v.q)}&limit=10`);
    const results: any[] = Array.isArray(r.json?.results) ? r.json.results : [];
    estado.dados[v.chave] = {
      ...(estado.dados[v.chave] ?? {}),
      grupo: v.grupo,
      q: v.q,
      busca: {
        status: r.status,
        paging: r.json?.paging ?? null,
        erro: r.status === 200 ? null : (r.json?.message ?? r.json?.error ?? r.json?._raw ?? r.json?._erro ?? null),
        chavesTopo: Object.keys(r.json ?? {}),
        chavesResultado: results[0] ? Object.keys(results[0]) : [],
        resultados: results.map((x) => ({ id: x.id, name: x.name, domain_id: x.domain_id, status: x.status, attrs: attrIds(x.attributes) })),
      },
    };
    salvar(estado);
  }
}

function resumirItens(catalogo: string, r: { status: number; json: any }) {
  const lst: any[] = Array.isArray(r.json?.results) ? r.json.results : [];
  const cont = <T,>(f: (x: any) => T) => {
    const m: Record<string, number> = {};
    for (const x of lst) m[String(f(x))] = (m[String(f(x))] ?? 0) + 1;
    return m;
  };
  const presente: Record<string, number> = {};
  for (const x of lst) for (const [k, val] of Object.entries(x)) if (val !== null && val !== undefined) presente[k] = (presente[k] ?? 0) + 1;
  return {
    catalogo,
    status: r.status,
    erro: r.status === 200 ? null : (r.json?.message ?? r.json?._raw ?? r.json?._erro ?? null),
    paging: r.json?.paging ?? null,
    total: lst.length,
    chavesTopo: Object.keys(r.json ?? {}),
    camposPresentes: presente,
    condicao: cont((x) => x.condition),
    listing_type: cont((x) => x.listing_type_id),
    lojaOficial: lst.filter((x) => x.official_store_id).length,
    comOriginalPrice: lst.filter((x) => x.original_price != null).length,
    comSalePrice: lst.filter((x) => x.sale_price != null).length,
    freteGratis: lst.filter((x) => x.shipping?.free_shipping).length,
    precoMin: lst.length ? Math.min(...lst.map((x) => Number(x.price))) : null,
    precoMax: lst.length ? Math.max(...lst.map((x) => Number(x.price))) : null,
    vendedoresDistintos: new Set(lst.map((x) => x.seller_id)).size,
    amostraChaves: lst[0] ? { shipping: lst[0].shipping ? Object.keys(lst[0].shipping) : null } : null,
    itemIds: lst.map((x) => x.item_id),
    sellerIds: Array.from(new Set(lst.map((x) => x.seller_id))).slice(0, 5),
  };
}

async function faseDetalhe() {
  for (const v of VERTICAIS) {
    const d = estado.dados[v.chave];
    if (!d?.busca?.resultados?.length) continue;
    const dom = DOMINIO[v.chave];
    const alvo = d.busca.resultados.find((x: any) => dom.test(String(x.domain_id))) ?? d.busca.resultados[0];
    d.dominioEsperadoEncontrado = dom.test(String(alvo.domain_id));
    if (!d.produto) {
      const r = await ml(`/products/${alvo.id}`);
      const j = r.json ?? {};
      d.produto = {
        id: alvo.id,
        status: r.status,
        name: j.name ?? null,
        domain_id: j.domain_id ?? null,
        chaves: Object.keys(j),
        atributosComValor: attrIds(j.attributes),
        gtin: (j.attributes ?? []).filter((a: any) => /GTIN|EAN|ISBN|MPN|SELLER_SKU|PART/i.test(a.id)).map((a: any) => ({ id: a.id, valor: a.value_name ?? null })),
        marcaModelo: (j.attributes ?? []).filter((a: any) => /^(BRAND|MODEL|LINE|AUTHOR|PUBLISHER|PLATFORM)$/.test(a.id)).map((a: any) => ({ id: a.id, valor: a.value_name ?? null })),
        buy_box_winner: j.buy_box_winner ? Object.keys(j.buy_box_winner) : null,
        qtdVariantesFamilia: Array.isArray(j.children_ids) ? j.children_ids.length : null,
        parent_id: j.parent_id ?? null,
      };
      salvar(estado);
    }
    if (!d.itens) {
      const r = await ml(`/products/${alvo.id}/items?limit=100`);
      d.itens = resumirItens(alvo.id, r);
      salvar(estado);
    }
  }
}


async function faseSegunda() {
  // Para verticais cujo 1o catalogo deu 404 "No winners found": tenta o proximo candidato do mesmo dominio (mais atributos).
  for (const v of VERTICAIS) {
    const d = estado.dados[v.chave];
    if (!d?.itens || d.itens.total > 0 || d.itens1 || d.segundaTentada) continue;
    const dom = DOMINIO[v.chave];
    const cand = d.busca.resultados
      .filter((x: any) => x.id !== d.itens.catalogo && dom.test(String(x.domain_id)))
      .sort((x: any, y: any) => y.attrs.length - x.attrs.length)[0];
    d.segundaTentada = true;
    if (!cand) continue;
    const r = await ml(`/products/${cand.id}/items?limit=100`);
    const novo = resumirItens(cand.id, r);
    d.itens1 = d.itens;
    d.itens = novo;
    d.candidato2 = { id: cand.id, name: cand.name, domain_id: cand.domain_id, attrs: cand.attrs };
    salvar(estado);
  }
}

async function faseItens() {
  for (const v of VERTICAIS) {
    const d = estado.dados[v.chave];
    if (!d?.itens?.itemIds?.length || d.itensDetalhe) continue;
    const ids: string[] = d.itens.itemIds.slice(0, 20);
    const r = await ml(`/items?ids=${ids.join(',')}`);
    const arr: any[] = Array.isArray(r.json) ? r.json : [];
    const corpos = arr.filter((x) => x?.code === 200).map((x) => x.body);
    const presente: Record<string, number> = {};
    for (const b of corpos) for (const [k, val] of Object.entries(b)) if (val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)) presente[k] = (presente[k] ?? 0) + 1;
    const contaAttr: Record<string, number> = {};
    for (const b of corpos) for (const a of attrIds(b.attributes)) contaAttr[a] = (contaAttr[a] ?? 0) + 1;
    const cont = (f: (x: any) => any) => {
      const m: Record<string, number> = {};
      for (const b of corpos) m[String(f(b))] = (m[String(f(b))] ?? 0) + 1;
      return m;
    };
    d.itensDetalhe = {
      status: r.status,
      consultados: ids.length,
      codigos: arr.reduce((m: Record<string, number>, x) => ((m[String(x?.code)] = (m[String(x?.code)] ?? 0) + 1), m), {}),
      camposPresentes: presente,
      atributosComValor: contaAttr,
      condicao: cont((b) => b.condition),
      status_anuncio: cont((b) => b.status),
      listing_type: cont((b) => b.listing_type_id),
      comEstoque: corpos.filter((b) => Number(b.available_quantity) > 0).length,
      estoqueMin: corpos.length ? Math.min(...corpos.map((b) => Number(b.available_quantity))) : null,
      estoqueMax: corpos.length ? Math.max(...corpos.map((b) => Number(b.available_quantity))) : null,
      comOriginalPrice: corpos.filter((b) => b.original_price != null).length,
      lojaOficial: corpos.filter((b) => b.official_store_id).length,
      gtinNoItem: corpos.filter((b) => (b.attributes ?? []).some((a: any) => /GTIN|EAN|ISBN/.test(a.id) && a.value_name)).length,
      comCatalogProductId: corpos.filter((b) => b.catalog_product_id).length,
      catalogListing: corpos.filter((b) => b.catalog_listing).length,
      tagsDistintas: Array.from(new Set(corpos.flatMap((b) => b.tags ?? []))).slice(0, 30),
      freteChaves: corpos[0]?.shipping ? Object.keys(corpos[0].shipping) : null,
      sellerIds: Array.from(new Set(corpos.map((b) => b.seller_id))).slice(0, 3),
    };
    salvar(estado);
  }
}

async function faseSonda() {
  // 1 chamada: multiget no formato que o coletor ja usa (attributes=id,title), ampliado com campos de interesse.
  const d = estado.dados['livros'];
  if (!d?.itens?.itemIds?.length || d.sonda) return;
  const ids: string[] = d.itens.itemIds.slice(0, 3);
  const r = await ml(`/items?ids=${ids.join(',')}&attributes=id,title,condition,available_quantity,status,catalog_product_id,original_price`);
  const arr: any[] = Array.isArray(r.json) ? r.json : [];
  d.sonda = {
    status: r.status,
    codigos: arr.map((x) => x?.code),
    camposDevolvidos: Array.from(new Set(arr.flatMap((x) => Object.keys(x?.body ?? {})))),
    amostraErro: arr.find((x) => x?.code !== 200)?.body ?? null,
  };
  salvar(estado);
}

async function faseUsuarios(max: number) {
  // Reputacao do vendedor: /users/{id} (1 chamada por vendedor). Usa poucas chamadas de proposito.
  let feitas = 0;
  for (const v of VERTICAIS) {
    const d = estado.dados[v.chave];
    const sid = d?.itensDetalhe?.sellerIds?.[0] ?? d?.itens?.sellerIds?.[0];
    if (!sid || d.usuario || feitas >= max) continue;
    const r = await ml(`/users/${sid}`);
    d.usuario = {
      status: r.status,
      erro: r.status === 200 ? null : (r.json?.message ?? r.json?._raw ?? null),
      chaves: Object.keys(r.json ?? {}),
      tem_seller_reputation: !!r.json?.seller_reputation,
      level_id: r.json?.seller_reputation?.level_id ?? null,
      power_seller_status: r.json?.seller_reputation?.power_seller_status ?? null,
      transactions_total: r.json?.seller_reputation?.transactions?.total ?? null,
    };
    feitas++;
    salvar(estado);
  }
}

async function faseShopee() {
  const { isShopeeAffiliateConfigured } = await import('../src/server/collector/sources/shopee-auth');
  if (!isShopeeAffiliateConfigured()) {
    estado.dados._shopee = { configurada: false, nota: 'SHOPEE_AFFILIATE_APP_ID/SECRET ausentes do ambiente (.env.local); nenhuma chamada feita' };
    salvar(estado);
    console.log('Shopee: credenciais ausentes; 0 chamadas gastas');
    return;
  }
  const { queryProductOffers } = await import('../src/server/collector/sources/shopee');
  const alvos = ['notebook', 'smart-tv', 'tenis-de-corrida'].map((c) => VERTICAIS.find((v) => v.chave === c)!);
  estado.dados._shopee = estado.dados._shopee?.configurada ? estado.dados._shopee : { configurada: true, consultas: {} };
  for (const v of alvos) {
    if (estado.dados._shopee.consultas[v.chave]) continue;
    if (usadas('shopee') >= TETO_SHOPEE) break;
    const t0 = Date.now();
    const n = usadas('shopee') + 1;
    try {
      const r = await queryProductOffers({ keyword: v.q, limit: 10, sortType: 2 });
      estado.chamadas.push({ n, rede: 'shopee', endpoint: `productOfferV2 keyword="${v.q}"`, status: 200, ms: Date.now() - t0 });
      const nos = r.nodes;
      estado.dados._shopee.consultas[v.chave] = {
        nos: nos.length,
        hasNextPage: r.hasNextPage,
        chaves: nos[0] ? Object.keys(nos[0]) : [],
        comPrecoMin: nos.filter((x) => x.priceMin).length,
        comSpread: nos.filter((x) => x.priceMax && x.priceMin && x.priceMax !== x.priceMin).length,
        comDesconto: nos.filter((x) => Number(x.priceDiscountRate) > 0).length,
        comShopId: nos.filter((x) => x.shopId).length,
        categoria: 'campo de categoria nao consta em SHOPEE_PRODUCT_OFFER_FIELDS (nao consultado: so os campos ja validados no adapter)',
        amostra: nos.slice(0, 3).map((x) => ({ itemId: x.itemId, shopId: x.shopId, priceMin: x.priceMin, priceMax: x.priceMax, sales: x.sales, nome: String(x.productName).slice(0, 70) })),
      };
    } catch (e: any) {
      estado.chamadas.push({ n, rede: 'shopee', endpoint: `productOfferV2 keyword="${v.q}"`, status: e?.httpStatus ?? 'erro', ms: Date.now() - t0 });
      estado.dados._shopee.consultas[v.chave] = { erro: String(e?.message ?? e).slice(0, 300), kind: e?.kind ?? null, code: e?.code ?? null };
      salvar(estado);
      console.log('Shopee erro:', e?.message);
      break; // nao tenta contornar
    }
    salvar(estado);
  }
}

async function main() {
  const fase = process.argv[process.argv.indexOf('--fase') + 1];
  console.log(`fase=${fase}; ML usadas=${usadas('ml')}/${TETO_ML}; Shopee usadas=${usadas('shopee')}/${TETO_SHOPEE}`);
  if (fase === 'shopee') return faseShopee();
  await lerToken();
  try {
    if (fase === 'busca') await faseBusca();
    else if (fase === 'detalhe') await faseDetalhe();
    else if (fase === 'sonda') await faseSonda();
    else if (fase === 'segunda') await faseSegunda();
    else if (fase === 'itens') await faseItens();
    else if (fase === 'usuarios') await faseUsuarios(Number(process.argv[process.argv.indexOf('--max') + 1] || 2));
    else throw new Error('fase invalida');
  } catch (e) {
    if (e instanceof TetoAtingido) console.log('PARADO:', e.message);
    else throw e;
  }
  fs.writeFileSync(SAIDA, JSON.stringify(estado.dados, null, 2));
  console.log(`fim; ML usadas=${usadas('ml')}/${TETO_ML}`);
}
main().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
