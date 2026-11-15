/** Testes dos cards v2 (fila #58). Puro + renderização sintética (sem banco, sem rede). npx tsx --conditions=react-server scripts/test-card-v2.ts */
import { CARD_V2_H, CARD_V2_W, V2_PAD, cardV2On, clampTitleNoCoverV2, clampTitleV2, endedLabelV2, geomV2, sideColumnV2, stageColorV2, tagPriceV2 } from '../src/lib/pricing/card-v2-model';

export {};
let total = 0;
let fails = 0;
function check(name: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) {
    fails++;
    console.log('FALHOU:', name, extra ?? '');
  }
}

async function main() {
  check('flag padrão OFF', !cardV2On({}) && !cardV2On({ GROUP_CARD_V2: 'off' }) && !cardV2On({ GROUP_CARD_V2: '' }));
  check('flag on', cardV2On({ GROUP_CARD_V2: 'on' }) && cardV2On({ GROUP_CARD_V2: ' ON ' }));

  const curto = clampTitleV2('PS5 Slim');
  check('título curto sem reticências, corpo maior', curto.text === 'PS5 Slim' && curto.font === 46);
  const longo = clampTitleV2('Console Sony PlayStation 5 Slim Digital 1TB Branco com Controle DualSense e Jogo Astro Bot Edição Especial Importado Lacrado');
  check('título longo cortado com reticências em até 88 caracteres', longo.text.endsWith('…') && longo.text.length <= 88 && !/\s…$/.test(longo.text), longo.text);
  const semEspaco = clampTitleV2('A'.repeat(200));
  check('palavra gigante não estoura', semEspaco.text.length <= 88);
  check('corpo diminui com o tamanho', clampTitleV2('x'.repeat(50)).font === 40 && clampTitleV2('x'.repeat(80)).font === 36);
  check('sem foto: até 104 caracteres', clampTitleNoCoverV2('palavra '.repeat(40)).text.length <= 104);

  for (const p of ['R$ 9,90', 'R$ 19,90', 'R$ 249,90', 'R$ 1.299,00', 'R$ 12.345,67', 'R$ 123.456,78']) {
    const t = tagPriceV2(p);
    const w = p.length * 0.64 * t.font;
    check(`etiqueta cabe: ${p}`, w + 2 * 38 <= t.tagW + 2 && t.tagW <= 640 && t.font >= 60, t);
    const sc = sideColumnV2(t.tagW, 'no Mercado Livre', 'Vendido por ' + 'LOJA'.repeat(8));
    check(`coluna da loja não estoura: ${p}`, (sc.sellerText?.length ?? 0) * sc.seller * 0.6 <= sc.colW + 4, sc);
  }
  const g = geomV2({ regua: false, hasCover: true });
  const gr = geomV2({ regua: true, hasCover: true });
  check('geometria cabe em 1350 e sem sobreposição', g.stageTop + g.stageH === g.tagTop && g.tagTop + g.tagH < g.insightTop && g.faixaTop + 24 < g.hairlineTop && g.footerTop + 32 <= CARD_V2_H - 16);
  check('régua tira área só da foto', gr.stageH === g.stageH - 60 && gr.tagTop === g.tagTop && gr.stageH > 600);
  check('título antes do quadro', g.titleTop + g.titleBlockH < g.stageTop && V2_PAD * 2 + g.stageW === CARD_V2_W);
  check('sem foto: quadro maior', geomV2({ regua: false, hasCover: false }).stageH > g.stageH);
  check('cor do quadro: branco', stageColorV2([255, 255, 255], [250, 251, 252]) === '#FFFFFF');
  check('cor do quadro: fundo uniforme escuro', stageColorV2([20, 20, 22], [24, 22, 20]) === '#161515', stageColorV2([20, 20, 22], [24, 22, 20]));
  check('cor do quadro: cantos diferentes => branco', stageColorV2([0, 0, 0], [255, 255, 255]) === '#FFFFFF');
  check('rótulo de cupom longo corta', endedLabelV2('x'.repeat(60)).text.length === 34 && endedLabelV2('ABC').font <= 72);

  // Renderização sintética (o fallback sem foto loga '[card-v2]': qualquer log desses é falha)
  let fallbackLogs = 0;
  const origErr = console.error;
  console.error = (...a: unknown[]) => {
    if (String(a[0]).includes('[card-v2]')) fallbackLogs++;
    origErr(...a);
  };
  const sharp = (await import('sharp')).default;
  const { coverFromBufferV2, drawOfferCardV2, drawEndedCouponCardV2 } = await import('../src/server/messaging/card-v2');
  const png = async (w: number, h: number, inner: { w: number; h: number; c: string } | null) => {
    let img = sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } });
    if (inner) img = img.composite([{ input: await sharp({ create: { width: inner.w, height: inner.h, channels: 3, background: inner.c } }).png().toBuffer(), left: Math.round((w - inner.w) / 2), top: Math.round((h - inner.h) / 2) }]);
    return img.png().toBuffer();
  };
  const sq = await coverFromBufferV2(await png(800, 800, { w: 300, h: 300, c: '#aa3322' }), 'image/png');
  check('borda branca recortada (quadrada)', !!sq.w && sq.w <= 330 && sq.w >= 290 && sq.stage === '#FFFFFF', sq.w);
  const vert = await coverFromBufferV2(await png(600, 1000, { w: 200, h: 700, c: '#2255aa' }), 'image/png');
  check('foto vertical recortada', !!vert.h && vert.h <= 730 && vert.w! < vert.h!);
  const hor = await coverFromBufferV2(await png(1000, 600, { w: 800, h: 200, c: '#22aa55' }), 'image/png');
  check('foto horizontal recortada', !!hor.w && hor.w <= 830 && hor.w > hor.h!);
  const tiny = await coverFromBufferV2(await png(800, 800, { w: 40, h: 40, c: '#000000' }), 'image/png');
  check('produto minúsculo: não recorta demais', (tiny.w ?? 0) >= 120);
  const dark = await coverFromBufferV2(await sharp(await png(800, 800, null)).negate().png().toBuffer(), 'image/png');
  check('foto toda uniforme não quebra', !!dark.uri);
  const bad = await coverFromBufferV2(Buffer.from('nao e imagem'), 'image/png');
  check('imagem ilegível devolve original sem lançar', bad.uri.startsWith('data:image/png') && bad.w === null);

  const base = { title: 'Console Sony PlayStation 5 Slim Digital 1TB Branco', platformLabel: 'PlayStation 5', store: 'Mercado Livre', sellerName: 'Loja Exemplo', isAmazon: false, vertical: 'games', priceCents: 349990, checkedAt: new Date(), imageUrl: null, today: '2026-11-15', stats: { recordCents: null, seriesFirstDay: null, measuredDays: 0, avgCents: null, distinctOffers: 0, prev: null } };
  const isPng = (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) && b.readUInt32BE(16) === CARD_V2_W && b.readUInt32BE(20) === CARD_V2_H;
  const cases: Array<[string, Parameters<typeof drawOfferCardV2>]> = [
    ['com foto', [base, sq, 'Menor preço desde 02/11']],
    ['sem foto', [base, null, null]],
    ['preço 4 dígitos', [{ ...base, priceCents: 1990 }, vert, null]],
    ['preço 6 dígitos', [{ ...base, priceCents: 1234567 }, hor, null]],
    ['título enorme', [{ ...base, title: 'Produto '.repeat(60) }, sq, null]],
    ['cupom', [{ ...base, simple: { withoutCouponCents: 399990, couponName: 'GEEK10' } }, sq, null]],
    ['régua', [{ ...base, regua: { degrau: 5, rotulo: 'Menor preço', cor: '#D62828', corTexto: '#FFFFFF', pctTexto: '20,1% abaixo da média das lojas', faixaTexto: 'Baseado em 12 ofertas' } }, sq, 'Caiu 12% desde ontem']],
  ];
  for (const [name, args] of cases) {
    const b = await drawOfferCardV2(...args);
    check(`PNG 1080x1350: ${name}`, isPng(b) && b.length > 8000, b.length);
  }
  const e = await drawEndedCouponCardV2({ storeSlug: 'inexistente', label: 'TODOSITE', networkName: 'Shopee', at: new Date() });
  check('cupom encerrado v2 PNG 1080x1350', isPng(e));
  check('nenhum card caiu no fallback sem foto', fallbackLogs === 0, fallbackLogs);
  console.log(`${total - fails}/${total} verificações ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
