/**
 * Teste offline da integracao Shopee Affiliate Open API (sem rede, sem banco, sem credencial real).
 * Uso: npx tsx --conditions=react-server scripts/test-shopee.ts   (sai com codigo 1 se algo falhar)
 * Valida: assinatura SHA256 (AppID+Timestamp+Payload+Secret), formato do header Authorization,
 * classificacao de erros, parse de preco/no, regra de variacao ambigua e external_ref.
 * As credenciais abaixo sao FICTICIAS de teste e nunca saem da maquina.
 */
import { createHash } from 'node:crypto';

process.env.SHOPEE_AFFILIATE_APP_ID = '123456';
process.env.SHOPEE_AFFILIATE_APP_SECRET = 'segredo-de-teste';

let fails = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok || extra === undefined ? '' : ' -> ' + JSON.stringify(extra)}`);
}

async function main() {
  const auth = await import('../src/server/collector/sources/shopee-auth');
  const shopee = await import('../src/server/collector/sources/shopee');

  const realFetch = globalThis.fetch;
  let captured: { url: string; init: RequestInit } | null = null;
  const respond = (status: number, body: unknown) => {
    globalThis.fetch = (async (url: any, init: any) => {
      captured = { url: String(url), init };
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
    }) as typeof fetch;
  };

  // --- assinatura
  respond(200, { data: { productOfferV2: { nodes: [], pageInfo: { hasNextPage: false } } } });
  const data = await auth.fetchShopeeGraphQL('query { x }', { a: 1 });
  check('fetchShopeeGraphQL devolve data', !!data?.productOfferV2);
  const headers = (captured!.init.headers ?? {}) as Record<string, string>;
  const m = /^SHA256 Credential=(\d+), Timestamp=(\d+), Signature=([0-9a-f]{64})$/.exec(headers.Authorization ?? '');
  check('header Authorization no formato oficial', !!m);
  if (m) {
    const expected = createHash('sha256').update(`${m[1]}${m[2]}${captured!.init.body}${'segredo-de-teste'}`).digest('hex');
    check('assinatura = SHA256(AppID+Timestamp+Payload+Secret) sobre o corpo exato enviado', expected === m[3]);
    check('timestamp em segundos (10 digitos) e recente', m[2].length === 10 && Math.abs(Date.now() / 1000 - Number(m[2])) < 5);
  }
  check('endpoint oficial', captured!.url === 'https://open-api.affiliate.shopee.com.br/graphql', captured!.url);
  check('metodo POST e JSON', captured!.init.method === 'POST' && headers['Content-Type'] === 'application/json');

  // --- erros
  async function errOf(status: number, body: unknown) {
    respond(status, body);
    try {
      await auth.fetchShopeeGraphQL('query { x }');
      return null;
    } catch (e) {
      return e as InstanceType<typeof auth.ShopeeApiError>;
    }
  }
  let e = await errOf(200, { errors: [{ message: 'Invalid Signature', extensions: { code: 10020 } }] });
  check('10020 => auth e fatal para o lote', e?.kind === 'auth' && e.isFatalForBatch);
  e = await errOf(200, { errors: [{ message: 'rate limit', extensions: { code: 10030 } }] });
  check('10030 => rate_limit e fatal', e?.kind === 'rate_limit' && e.isFatalForBatch);
  e = await errOf(429, 'Too Many Requests');
  check('HTTP 429 => rate_limit', e?.kind === 'rate_limit');
  e = await errOf(200, { errors: [{ message: 'param', extensions: { code: 11001 } }] });
  check('11001 => params e NAO fatal', e?.kind === 'params' && !e.isFatalForBatch);
  e = await errOf(200, { errors: [{ message: 'erro 10033 sem extensions' }] });
  check('codigo extraido da mensagem (10033 => access)', e?.kind === 'access');
  e = await errOf(200, {});
  check('resposta sem data => erro (nunca dado parcial)', e != null);
  e = await errOf(500, 'boom');
  check('HTTP 500 => http', e?.kind === 'http');

  // --- sem credencial
  const savedId = process.env.SHOPEE_AFFILIATE_APP_ID;
  delete process.env.SHOPEE_AFFILIATE_APP_ID;
  check('sem credencial: isShopeeAffiliateConfigured=false', auth.isShopeeAffiliateConfigured() === false);
  check('sem credencial: generateShopeeAffiliateLink => null (nunca link fabricado)', (await auth.generateShopeeAffiliateLink('https://shopee.com.br/product/1/2')) === null);
  process.env.SHOPEE_AFFILIATE_APP_ID = savedId;

  // --- link de afiliado so da API oficial
  respond(200, { data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/abc' } } });
  check('generateShortLink devolve o shortLink da API', (await auth.generateShopeeAffiliateLink('https://shopee.com.br/product/1/2')) === 'https://s.shopee.com.br/abc');
  const sent = JSON.parse(String(captured!.init.body));
  check('originUrl repassada e subIds <= 5', sent.variables.input.originUrl === 'https://shopee.com.br/product/1/2' && sent.variables.input.subIds.length <= 5);
  respond(200, { data: { generateShortLink: { shortLink: 'http://evil.example/x' } } });
  check('shortLink nao-https => null', (await auth.generateShopeeAffiliateLink('https://shopee.com.br/product/1/2')) === null);
  respond(200, { errors: [{ message: 'x', extensions: { code: 11000 } }] });
  const origErr = console.error;
  console.error = () => {};
  check('falha da mutation => null (nao fabrica link)', (await auth.generateShopeeAffiliateLink('https://shopee.com.br/product/1/2')) === null);
  console.error = origErr;

  // --- paginacao e limites
  respond(200, { data: { productOfferV2: { nodes: [{ itemId: 1 }], pageInfo: { hasNextPage: true } } } });
  const page = await shopee.queryProductOffers({ keyword: 'ps5', page: 3, limit: 500, sortType: 2 });
  const body = JSON.parse(String(captured!.init.body));
  check('limit travado em 50', body.variables.limit === 50);
  check('page e keyword repassados como variaveis', body.variables.page === 3 && body.variables.keyword === 'ps5');
  check('hasNextPage lido', page.hasNextPage === true);
  let threw = false;
  try {
    await shopee.queryProductOffers({ itemId: '1; drop' });
  } catch {
    threw = true;
  }
  check('itemId nao numerico rejeitado (sem injecao na query)', threw);
  respond(200, { data: { productOfferV2: { nodes: [{ itemId: 99 }, { itemId: 7 }], pageInfo: { hasNextPage: false } } } });
  const lk = await shopee.lookupShopeeItem('7');
  check('lookup so aceita o no com itemId pedido (no sem preco => unavailable)', lk.status === 'unavailable');
  // --- listagem por categoria / loja (descoberta pela API oficial)
  respond(200, { data: { productOfferV2: { nodes: [{ itemId: 1 }], pageInfo: { hasNextPage: true } } } });
  await shopee.queryProductOffers({ productCatId: '100012', sortType: 2, page: 2, limit: 50, fields: 'itemId productName productCatIds' });
  let q = JSON.parse(String(captured!.init.body)).query as string;
  check('categoria: productCatId e sortType entram na query como literais', /productCatId: 100012/.test(q) && /sortType: 2/.test(q), q);
  check('categoria: sem keyword a variavel vai null e page repassada', JSON.parse(String(captured!.init.body)).variables.keyword === null && JSON.parse(String(captured!.init.body)).variables.page === 2);
  check('categoria: campos pedidos substituem o padrao', /productCatIds/.test(q) && !/priceDiscountRate/.test(q));
  await shopee.queryProductOffers({ shopId: '84499012', sortType: 2 });
  q = JSON.parse(String(captured!.init.body)).query as string;
  check('loja: shopId entra na query', /shopId: 84499012/.test(q) && !/productCatId/.test(q), q);
  let threwCat = false;
  try {
    await shopee.queryProductOffers({ productCatId: '1; drop' });
  } catch {
    threwCat = true;
  }
  check('productCatId nao numerico rejeitado', threwCat);
  globalThis.fetch = realFetch;

  // --- parse de preco e no
  check('"129.90" => 12990', shopee.parseShopeePriceToCents('129.90') === 12990);
  check('"1299,90" (virgula) => 129990', shopee.parseShopeePriceToCents('1299,90') === 129990);
  check('"0" => null', shopee.parseShopeePriceToCents('0') === null);
  check('vazio => null', shopee.parseShopeePriceToCents('') === null);
  check('"abc" => null', shopee.parseShopeePriceToCents('abc') === null);
  check('"-5" => null', shopee.parseShopeePriceToCents('-5') === null);
  const ok = shopee.parseShopeeNode({ itemId: 5, shopId: 9, shopName: 'Loja', productName: 'Jogo X', priceMin: '100.00', priceMax: '105.00', imageUrl: 'https://img', productLink: 'https://shopee.com.br/p', offerLink: 'https://s.shopee.com.br/o' });
  check('no valido (spread 5%) usa priceMin e guarda priceMax como lista', 'node' in ok && ok.node.priceCents === 10000 && ok.node.listPriceCents === 10500);
  const amb = shopee.parseShopeeNode({ itemId: 5, productName: 'X', priceMin: '10.00', priceMax: '50.00' });
  check('variacao 10 a 50 => ambiguous_price (nao grava)', 'rejected' in amb && amb.rejected === 'ambiguous_price');
  check('sem nome => no_name', (shopee.parseShopeeNode({ itemId: 1, priceMin: '5' }) as any).rejected === 'no_name');
  check('sem preco => no_price', (shopee.parseShopeeNode({ itemId: 1, productName: 'A', priceMin: null }) as any).rejected === 'no_price');
  const solo = shopee.parseShopeeNode({ itemId: 1, productName: 'A', priceMin: '20.00' });
  check('so priceMin => preco unico sem listPrice', 'node' in solo && solo.node.priceCents === 2000 && solo.node.listPriceCents === null);

  // --- external_ref e URL publica
  check('external_ref shopee-123', shopee.shopeeItemIdFromRef('shopee-123') === '123');
  check('external_ref invalido => null', shopee.shopeeItemIdFromRef('MLB123') === null && shopee.shopeeItemIdFromRef('shopee-12a') === null);
  check('URL publica usa productLink shopee.com.br', shopee.shopeePublicUrl({ itemId: '2', shopId: '1', productLink: 'https://shopee.com.br/x-i.1.2' }) === 'https://shopee.com.br/x-i.1.2');
  check('productLink de outro dominio e ignorado', shopee.shopeePublicUrl({ itemId: '2', shopId: '1', productLink: 'https://evil.com/x' }) === 'https://shopee.com.br/product/1/2');

  console.log(fails ? `\n${fails} FALHA(S)` : '\nTodos os testes passaram');
  process.exit(fails ? 1 : 0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
