/**
 * Teste da MENSAGEM V4 (R-114, dono, 2026-11-22). Puro: sem banco, sem rede, sem token. Uso: npx tsx scripts/test-mensagem-v4.ts
 * Cobre: 3 estados x redes (Mercado Livre, Shopee, Amazon) x canais; link de afiliado no CORPO (linha própria, texto puro); comparação com a
 * média em todo estado menos "Novo no monitoramento"; segmentação (categoria/tipo/marca/plataforma/condição Novo); legenda <= 1024;
 * só produto NOVO (última barreira) e flag de desligamento MENSAGEM_V4=off; integração pelo avaliador (evaluateProductV2).
 */
import { RULES, evaluateProductV2, type Candidate, type OfferFact, type ProductFacts } from '../src/lib/messaging/group-rules';
import { textProblems, type MsgOffer } from '../src/lib/messaging/group-messages';
import {
  ROTULO_ESTADO,
  V4_ORCAMENTO_LEGENDA,
  bloqueioCondicaoNaoNova,
  comporMensagemV4,
  estadoDaMensagem,
  linkDeCompraDoTexto,
  marcaParaExibicao,
  mensagemV4Ligada,
  textoComparacaoMedia,
  type EstadoMensagem,
  type MensagemV4Input,
} from '../src/lib/messaging/mensagem-v4';
import { captionVisibleLength } from '../src/lib/messaging/telegram-send';
import { ehLinkAfiliadoValido } from '../src/lib/affiliate/link-afiliado';

void RULES;
let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}

const NOW = new Date('2026-11-22T15:00:00Z');
const MIN = 60_000;
const H = 3600_000;

// ---------------------------------------------------------------------------
// Ofertas por rede (link curto do dono quando existe)
// ---------------------------------------------------------------------------
const REDES: Array<{ nome: string; offer: MsgOffer; amz: boolean }> = [
  { nome: 'Mercado Livre', amz: false, offer: { slug: 'ml-1', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 89900, confirmedAt: NOW, affiliateUrl: 'https://meli.la/1AbCdEf', storeName: 'Loja X', seller: { reputation: '5_green', totalSales: 12000 }, compra: { parcelas: { qty: 10, cents: 8990, semJuros: true }, pixCents: 85000, freteGratis: true } } },
  { nome: 'Shopee', amz: false, offer: { slug: 'sp-1', networkSlug: 'shopee', networkName: 'Shopee', priceCents: 89900, confirmedAt: NOW, affiliateUrl: 'https://s.shopee.com.br/7AfJlFGdn4', storeName: 'Clicou Shops' } },
  { nome: 'Amazon', amz: true, offer: { slug: 'az-1', networkSlug: 'amazon', networkName: 'Amazon', priceCents: 89900, confirmedAt: NOW, affiliateUrl: 'https://www.amazon.com.br/dp/B0ABC12345?tag=manusmonteiro-20' } },
];

function entrada(estado: EstadoMensagem, offer: MsgOffer, amz: boolean, over: Partial<MensagemV4Input> = {}): MensagemV4Input {
  const semMedia = estado === 'novo';
  return {
    estado,
    vertical: 'tecnologia',
    titulo: 'Mouse Gamer Logitech G203 Lightsync',
    tipoLabel: 'Mouse',
    marca: 'Logitech',
    plataforma: null,
    formato: null,
    offer,
    messageKey: 'ac-261122-abc123',
    adTag: '#publicidade',
    avg: semMedia ? null : amz ? { cents: 102000, offers: 6, scope: 'market' } : { cents: 102000, offers: 6 },
    veredito: estado === 'diagnostico' ? { degrau: 2, rotulo: 'Boa compra' } : null,
    faixa: estado === 'novo' ? null : { minCents: 88000, maxCents: 120000, dias: 21 },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1) 3 estados x 3 redes x 2 canais
// ---------------------------------------------------------------------------
const ESTADOS: EstadoMensagem[] = ['novo', 'monitoramento', 'diagnostico'];
for (const estado of ESTADOS) {
  for (const rede of REDES) {
    for (const canal of ['tg', 'wa'] as const) {
      const id = `${estado}/${rede.nome}/${canal}`;
      const t = comporMensagemV4(entrada(estado, rede.offer, rede.amz), canal);
      ok(!!t, `${id}: compõe`);
      if (!t) continue;
      const linhas = t.split('\n');
      ok(t.includes(ROTULO_ESTADO[estado]), `${id}: rótulo do estado`, t);
      // Os outros estados NÃO aparecem
      for (const e2 of ESTADOS) if (e2 !== estado) ok(!t.includes(ROTULO_ESTADO[e2]), `${id}: sem o rótulo de ${e2}`, t);
      // Link de afiliado do dono NO CORPO, em linha própria, texto puro
      const url = rede.offer.affiliateUrl as string;
      const esperado = canal === 'tg' ? url.replace(/&/g, '&amp;') : url;
      ok(linhas.includes(esperado), `${id}: link do dono em linha própria`, t);
      ok(!/<a\s+href="[^"]*(meli\.la|s\.shopee|amazon\.com\.br)/i.test(t), `${id}: link de compra nunca como âncora escondida`, t);
      ok(ehLinkAfiliadoValido(url, rede.offer.networkSlug), `${id}: link passa no padrão R-70`);
      // Comparação com a média: todo estado menos o novo
      const comMedia = /abaixo da (média|mediana)[^\n]* de R\$ 1\.020,00/.test(t);
      if (estado === 'novo') ok(!/média|mediana/i.test(t), `${id}: novo NÃO compara com a média`, t);
      else ok(comMedia && /11,9% abaixo da média (das lojas|do mercado) de R\$ 1\.020,00/.test(t), `${id}: compara com a média (11,9% abaixo)`, t);
      // Segmentação
      ok(/Categoria: Tecnologia · Tipo: Mouse/.test(t), `${id}: categoria e tipo`, t);
      ok(/Marca: Logitech · Condição: Novo/.test(t), `${id}: marca e condição Novo`, t);
      // Preço e carimbo
      ok(/R\$ 899,00/.test(t), `${id}: preço`);
      ok(rede.amz ? /Preço na Amazon em 22\/11 às \d\d:\d\d, sujeito a alteração/.test(t) : /Conferido em 22\/11 às \d\d:\d\d/.test(t), `${id}: carimbo`, t);
      ok(/#publicidade/.test(t), `${id}: #publicidade`);
      // Barreira de termos e Amazon sem outra loja
      ok(textProblems(t, canal).length === 0, `${id}: passa em textProblems`, textProblems(t, canal));
      // Sem metodologia nem regra interna
      ok(!/metodologia|amostra|MIN_|régua|regua|oferta-dia|n_offers|%\s*off/i.test(t), `${id}: sem metodologia`, t);
      // Legenda de foto
      if (canal === 'tg') ok(captionVisibleLength(t) <= 1024, `${id}: legenda <= 1024 (${captionVisibleLength(t)})`);
    }
  }
}

// Diagnóstico traz o veredito da régua; os outros não
{
  const t = comporMensagemV4(entrada('diagnostico', REDES[0].offer, false), 'tg') as string;
  ok(/🟩 ▼▼ <b>Boa compra<\/b>/.test(t), 'diagnóstico mostra o veredito da régua', t);
  ok(!/Boa compra/.test(comporMensagemV4(entrada('monitoramento', REDES[0].offer, false), 'tg') as string), 'monitoramento não mostra veredito');
}

// ---------------------------------------------------------------------------
// 2) R-107: Pix, parcelas e frete só com prova (o que vem em offer.compra)
// ---------------------------------------------------------------------------
{
  const t = comporMensagemV4(entrada('monitoramento', REDES[0].offer, false), 'tg') as string;
  ok(/💳 <b>R\$ 899,00<\/b> em até 10x de R\$ 89,90 sem juros/.test(t) && /⚡ <b>R\$ 850,00<\/b> no Pix/.test(t) && /🚚 Frete grátis/.test(t), 'métricas R-107 presentes', t);
  const sem = comporMensagemV4(entrada('monitoramento', REDES[1].offer, false), 'tg') as string;
  ok(!/💳|⚡|🚚/.test(sem), 'sem prova = sem linha de métrica (Shopee de teste)', sem);
}

// ---------------------------------------------------------------------------
// 3) Comparação com a média: texto
// ---------------------------------------------------------------------------
ok(textoComparacaoMedia(90000, { cents: 100000, offers: 6 }, false) === '10,0% abaixo da média das lojas de R$ 1.000,00', 'abaixo da média');
ok(textoComparacaoMedia(100000, { cents: 100000, offers: 6 }, false) === 'no nível da média das lojas de R$ 1.000,00', 'no nível');
ok(textoComparacaoMedia(110000, { cents: 100000, offers: 6 }, false) === '10,0% acima da média das lojas de R$ 1.000,00', 'acima da média');
ok(textoComparacaoMedia(90000, null, false) === null, 'sem média = null');
ok(textoComparacaoMedia(90000, { cents: 100000, offers: 6 }, true) === null, 'Amazon sem escopo não usa a média das outras lojas');
ok(/mediana de 14 dias deste anúncio/.test(textoComparacaoMedia(90000, { cents: 100000, offers: 1, scope: 'own', days: 14 }, true) ?? ''), 'Amazon própria: mediana do anúncio');
{
  const t = comporMensagemV4(entrada('monitoramento', REDES[0].offer, false, { avg: null }), 'tg') as string;
  ok(!/m[ée]dia/i.test(t) && !/Vs\./.test(t), 'em monitoramento sem média OMITE a linha por completo (nada sobre média; dono 2026-11-22)', t);
  ok(/Comprar/.test(t) && /Situação|Vendedor|R\$/.test(t), 'sem média: mantém preço, link no corpo e demais campos', t);
  const ac = comporMensagemV4(entrada('monitoramento', REDES[0].offer, false, { avg: null, diagnostico: 'em linha com o preço habitual de R$ 200,00 (mediana de 10 dias de coleta)' }), 'tg') as string;
  ok(/Vs\. histórico do produto:<\/b> em linha com o preço habitual/.test(ac), 'achado com histórico próprio compara com ele', ac);
}

// ---------------------------------------------------------------------------
// 4) Link: o do dono quando válido; senão o /go do site; nunca link de terceiro
// ---------------------------------------------------------------------------
const mlBase = REDES[0].offer;
ok(linkDeCompraDoTexto(mlBase, 'tg', 'ac-261122-abc123') === 'https://meli.la/1AbCdEf', 'ML: meli.la do dono');
ok(linkDeCompraDoTexto({ ...mlBase, affiliateUrl: null }, 'tg', 'ac-261122-abc123') === 'https://www.egeek86.com/go/ml-1?s=tg&m=ac-261122-abc123', 'sem link do dono: /go do site');
ok(linkDeCompraDoTexto({ ...mlBase, affiliateUrl: 'https://produto.mercadolivre.com.br/MLB-1?matt_tool=999&matt_word=outro' }, 'tg', 'ac-261122-abc123')?.startsWith('https://www.egeek86.com/go/') === true, 'URL com marca de terceiro: nunca vai (cai no /go)');
ok(linkDeCompraDoTexto({ ...mlBase, affiliateUrl: 'https://a.co/d/xyz' }, 'tg', 'ac-261122-abc123')?.startsWith('https://www.egeek86.com/go/') === true, 'a.co sem tag do dono: nunca vai');
ok(linkDeCompraDoTexto({ ...REDES[2].offer, affiliateUrl: 'https://www.amazon.com.br/dp/B0ABC12345?tag=alheia-20' }, 'tg', 'ac-261122-abc123')?.startsWith('https://www.egeek86.com/go/') === true, 'Amazon com tag alheia: nunca vai');
ok(linkDeCompraDoTexto({ ...REDES[1].offer, affiliateUrl: 'http://s.shopee.com.br/x' }, 'tg', 'ac-261122-abc123')?.startsWith('https://www.egeek86.com/go/') === true, 'http sem TLS: cai no /go');
ok(linkDeCompraDoTexto({ ...mlBase, slug: 'tem espaco', affiliateUrl: null }, 'tg', 'ac-261122-abc123') === null && comporMensagemV4(entrada('novo', { ...mlBase, slug: 'tem espaco', affiliateUrl: null }, false), 'tg') === null, 'sem link possível: não compõe (mantém o formato anterior)');

// ---------------------------------------------------------------------------
// 5) Legenda de 1024: título enorme + todas as métricas + cupom da Shopee
// ---------------------------------------------------------------------------
{
  const longo = 'Smart TV Samsung 65 Polegadas Crystal UHD 4K Gaming Hub Alexa Built In Tizen Wi-Fi HDR Preto Edição Especial '.repeat(2).trim();
  const t = comporMensagemV4(entrada('diagnostico', { ...mlBase, shopeeCampaignUrl: undefined, storeName: 'Magazine Loja Oficial Eletronicos' }, false, { titulo: longo.slice(0, 190), marca: 'Samsung' }), 'tg') as string;
  ok(captionVisibleLength(t) <= 1024, `título grande cabe na legenda (${captionVisibleLength(t)})`);
  ok(t.split('\n').includes('https://meli.la/1AbCdEf') && /R\$ 899,00/.test(t) && /#publicidade/.test(t), 'no corte, o link, o preço e o #publicidade ficam');
  const apertado = comporMensagemV4(entrada('diagnostico', mlBase, false), 'tg', 560) as string;
  ok(apertado.split('\n').includes('https://meli.la/1AbCdEf') && /#publicidade/.test(apertado), 'orçamento apertado: link e #publicidade nunca saem');
  ok(captionVisibleLength(apertado) < captionVisibleLength(comporMensagemV4(entrada('diagnostico', mlBase, false), 'tg') as string), 'orçamento apertado corta linhas acessórias');
  ok(V4_ORCAMENTO_LEGENDA + 75 < 1024, 'orçamento deixa folga para a linha do grupo de WhatsApp');
}

// ---------------------------------------------------------------------------
// 6) Games: plataforma, formato e tipo; sem marca
// ---------------------------------------------------------------------------
{
  const t = comporMensagemV4(entrada('novo', REDES[1].offer, false, { vertical: 'games', titulo: 'Pac-Man World Re-Pac', tipoLabel: 'Jogo', marca: null, plataforma: 'Switch', formato: 'physical' }), 'tg') as string;
  ok(/<b>Pac-Man World Re-Pac \(Switch\)<\/b>/.test(t), 'games: início = "Nome do jogo (Console)"', t);
  ok(!/Categoria:|Tipo:|Plataforma:|Formato:|Condição:|Marca:|Black Friday/.test(t), 'games: sem linhas de segmentação nem Black Friday', t);
}
ok(marcaParaExibicao('tecnologia', 'Mouse Gamer Logitech G203') === 'Logitech', 'marca do dicionário');
ok(marcaParaExibicao('tecnologia', 'Notebook HP 15 Core i5') === 'HP', 'marca curta em maiúsculas');
ok(marcaParaExibicao('tecnologia', 'Cabo genérico sem marca conhecida') === null, 'sem marca conhecida: nenhuma (não inventa)');
ok(marcaParaExibicao('games', 'God of War PS5') === null, 'games sem marca');

// ---------------------------------------------------------------------------
// 7) Mapa de estados (os que o sistema já tem)
// ---------------------------------------------------------------------------
ok(estadoDaMensagem({ model: 'achado', novo: true }) === 'novo', 'achado novo');
ok(estadoDaMensagem({ model: 'achado', novo: false }) === 'monitoramento', 'achado antigo');
ok(estadoDaMensagem({ model: 'preco-agora' }) === 'monitoramento', 'preço agora (sem base)');
ok(estadoDaMensagem({ model: 'media', veredito: { rotulo: 'Em monitoramento' } }) === 'monitoramento', 'régua: média provisória = Em monitoramento');
ok(estadoDaMensagem({ model: 'movimento', veredito: { rotulo: 'Ótima compra' } }) === 'diagnostico', 'régua: degrau = Diagnóstico');
ok(estadoDaMensagem({ model: 'media', emFormacao: true, avg: { cents: 1, offers: 9 }, seriesDays: 30 }) === 'monitoramento', 'formação = Em monitoramento');
ok(estadoDaMensagem({ model: 'media', avg: { cents: 100, offers: 6 }, seriesDays: 20 }) === 'diagnostico', 'sem régua com base = Diagnóstico');
ok(estadoDaMensagem({ model: 'media', avg: { cents: 100, offers: 3 }, seriesDays: 20 }) === 'monitoramento', 'sem régua, poucas ofertas = Em monitoramento');
ok(estadoDaMensagem({ model: 'movimento', avg: { cents: 100, offers: 6 }, seriesDays: 5 }) === 'monitoramento', 'sem régua, pouco histórico = Em monitoramento');
ok(estadoDaMensagem({ model: 'movimento', avg: null, seriesDays: 30 }) === 'monitoramento', 'sem média = Em monitoramento');

// ---------------------------------------------------------------------------
// 8) Só produto NOVO: última barreira
// ---------------------------------------------------------------------------
const NAO_NOVOS = [
  'Mario Vs Donkey Kong Nintendo Switch - Novo/Caixa Aberta',
  'iPhone 13 128GB Seminovo Excelente',
  'Notebook Dell Inspiron Usado',
  'PlayStation 5 Recondicionado Garantia',
  'Smart TV 50 Open Box',
  'Open-Box Fone JBL',
  'Geladeira Brastemp Modelo Vitrine',
  'Câmera Canon Mostruário',
  'Jogo PS5 sem lacre',
  'Console com lacre aberto',
  'Celular Samsung de segunda mão',
  'Notebook para retirada de peças',
  'Liquidificador com defeito',
  'Fone Pre-Owned',
];
for (const t of NAO_NOVOS) ok(bloqueioCondicaoNaoNova(t) != null, `barra não novo: ${t}`);
const NOVOS = ['Mouse Gamer Logitech G203', 'Expositor de Vitrine para Loja Acrílico', 'Estante Vitrine Branca', 'Jogo God of War Ragnarok PS5 Mídia Física Lacrado', 'Pac-Man World Re-Pac', 'Livro O Usado e o Novo (capa dura)'.replace('Usado', 'Passado'), 'Serum Facial Renovador Retinol 15ml'];
for (const t of NOVOS) ok(bloqueioCondicaoNaoNova(t) == null, `não barra produto novo: ${t}`);
ok(bloqueioCondicaoNaoNova('Mouse', 'Mouse Logitech Usado') != null, 'olha também o título da oferta');

// ---------------------------------------------------------------------------
// 9) Flag de desligamento
// ---------------------------------------------------------------------------
for (const v of ['off', 'OFF', '0', 'false', 'nao', 'não']) ok(!mensagemV4Ligada({ MENSAGEM_V4: v }), `MENSAGEM_V4=${v} desliga`);
for (const v of [undefined, '', 'on', '1', 'true']) ok(mensagemV4Ligada({ MENSAGEM_V4: v }), `MENSAGEM_V4=${String(v)} liga`);

// ---------------------------------------------------------------------------
// 10) Integração com o avaliador: finish() grava a v4 (ou o formato anterior com a flag off) e barra o usado
// ---------------------------------------------------------------------------
const base = { now: NOW, maxAgeMin: 180, adTag: '#publicidade', amazonMaxAgeMin: 60, amazonPaused: false, achado: true };
function offer(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Fone Bluetooth JBL Tune 520BT', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 900,
    confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 3 * H), createdAt: new Date(NOW.getTime() - 2 * H),
    affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null, ...over,
  };
}
function prod(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'fone1', masterName: 'Fone Bluetooth JBL Tune 520BT', vertical: 'eletroeletronicos', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
    offers: [offer({ offerId: 'a', priceCents: 28000 })], avg: null, minEvent: null, record: null, series: [], amazonSeries: [],
    tipo: 'fones', tipoMedianCents: 28000, tipoSample: 12, primeiraVezDoProdutoAt: new Date(NOW.getTime() - 2 * H),
    ...over,
  };
}
const achado = (r: ReturnType<typeof evaluateProductV2>) => r.candidates.find((c) => c.trigger === 'AC') as Candidate | undefined;
{
  const prev = process.env.MENSAGEM_V4;
  delete process.env.MENSAGEM_V4;
  const r = evaluateProductV2(prod(), base);
  const c = achado(r);
  ok(!!c, 'achado gerado', r.blocked);
  if (c) {
    ok(c.sendable, 'achado enviável', c);
    ok(/<b>Novo no monitoramento<\/b>/.test(c.texts.telegram), 'produto recém-entrado = Novo no monitoramento', c.texts.telegram);
    ok(c.texts.telegram.split('\n').includes('https://meli.la/AbCd123'), 'link do dono no corpo (tg)', c.texts.telegram);
    ok(c.texts.whatsapp.split('\n').includes('https://meli.la/AbCd123'), 'link do dono no corpo (wa)');
    ok(!/média/i.test(c.texts.telegram.replace(/Vs\. média/g, '')) && !/Vs\. média/.test(c.texts.telegram), 'novo não compara com a média', c.texts.telegram);
    ok(/Condição: Novo/.test(c.texts.telegram) && /Categoria: Eletroeletrônicos/.test(c.texts.telegram) && /Marca: JBL/.test(c.texts.telegram), 'segmentação no texto gravado', c.texts.telegram);
    ok(captionVisibleLength(c.texts.telegram) <= 1024, 'legenda <= 1024');
  }
  // antigo (produto já acompanhado): Em monitoramento
  const velho = evaluateProductV2(prod({ primeiraVezDoProdutoAt: new Date(NOW.getTime() - 5 * 86_400_000) }), base);
  const cv = achado(velho);
  ok(!!cv && /<b>Em monitoramento<\/b>/.test(cv.texts.telegram) && !/ainda não há média/.test(cv.texts.telegram), 'produto já acompanhado = Em monitoramento, sem a frase de ausência de média (a linha "Vs. média" entra sozinha quando há média)', cv?.texts.telegram);
  // flag off = formato anterior (rótulo antigo sem segmentação, sem link "Comprar" em linha própria de URL pura)
  process.env.MENSAGEM_V4 = 'off';
  const off = achado(evaluateProductV2(prod(), base));
  ok(!!off && !/Condição: Novo/.test(off.texts.telegram) && /Novo no monitoramento/.test(off.texts.telegram), 'MENSAGEM_V4=off devolve o formato anterior', off?.texts.telegram);
  if (prev === undefined) delete process.env.MENSAGEM_V4;
  else process.env.MENSAGEM_V4 = prev;
  // usado/open box/caixa aberta: nunca enviável, com a v4 ligada ou desligada
  for (const flag of [undefined, 'off']) {
    if (flag) process.env.MENSAGEM_V4 = flag;
    else delete process.env.MENSAGEM_V4;
    for (const [nome, over] of [
      ['master "Caixa Aberta"', { masterName: 'Fone JBL Tune 520BT Novo/Caixa Aberta' }],
      ['master "Usado"', { masterName: 'Fone JBL Tune 520BT Usado' }],
      ['oferta "Open Box"', { offers: [offer({ offerId: 'a', priceCents: 28000, title: 'Fone JBL Tune 520BT Open Box' })] }],
      ['oferta "Seminovo"', { offers: [offer({ offerId: 'a', priceCents: 28000, title: 'Fone JBL Tune 520BT Seminovo' })] }],
      ['oferta "Recondicionado"', { offers: [offer({ offerId: 'a', priceCents: 28000, title: 'Fone JBL Tune 520BT Recondicionado' })] }],
    ] as Array<[string, Partial<ProductFacts>]>) {
      const res = evaluateProductV2(prod(over), base);
      ok(!res.candidates.some((x) => x.sendable), `não novo não sai (${nome}, v4 ${flag ?? 'on'})`, res.candidates.map((x) => [x.trigger, x.sendable, x.notSendableReason]));
    }
  }
  if (prev === undefined) delete process.env.MENSAGEM_V4;
  else process.env.MENSAGEM_V4 = prev;
  // console de PS4 gravado como jogo
  const ps4 = evaluateProductV2(prod({ vertical: 'games', productType: 'game', platformLabel: 'PS4', masterName: 'Console Playstation 4 E Jogo God Of War Ragnarok Sony Cor Preto', tipo: null, offers: [offer({ offerId: 'a', priceCents: 249900, title: 'Console Playstation 4 E Jogo God Of War' })] }), base);
  ok(!ps4.candidates.some((x) => x.sendable), 'console de PS4 (mesmo gravado como jogo) não sai', ps4.candidates.map((x) => [x.trigger, x.sendable]));
}

console.log(`test-mensagem-v4: ${total - fails}/${total} OK`);
if (fails) process.exit(1);
