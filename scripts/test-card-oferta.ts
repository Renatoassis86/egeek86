/**
 * Testes do CARD DE OFERTA (src/lib/pricing/offer-card-model.ts + src/server/messaging/offer-card.tsx).
 * Parte 1: lógica pura (insight por prioridade, truncagem, moeda, carimbo, geometria). Sem banco.
 * Parte 2: contra o banco (SOMENTE LEITURA): gera 4 cards REAIS (ML menor registrado, ML queda do dia, sem capa, Amazon com carimbo).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-card-oferta.ts [pasta-de-saida]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import {
  INSIGHT_MAX_CHARS,
  OFFER_GEOM,
  buildOfferAlt,
  chooseInsight,
  coverBox,
  fitInsight,
  formatMoney,
  formatReaisRounded,
  isFreshForCard,
  priceFontSize,
  stampLine,
  storePhrase,
  truncateTitle,
  type OfferCardInput,
  type OfferCardStats,
} from '../src/lib/pricing/offer-card-model';

let fails = 0;
let total = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
}

const NOW = new Date('2026-11-11T12:00:00-03:00');
const baseStats: OfferCardStats = { recordCents: 30000, seriesFirstDay: '2026-10-31', measuredDays: 8, avgCents: 35000, distinctOffers: 6, prev: { cents: 31000, day: '2026-11-10' } };
const mk = (priceCents: number, over: Partial<OfferCardInput> = {}, st: Partial<OfferCardStats> = {}): OfferCardInput => ({
  title: 'Ghost of Yotei', platformLabel: 'PlayStation 5', store: 'Mercado Livre', isAmazon: false, priceCents, checkedAt: new Date('2026-11-11T11:40:00-03:00'),
  imageUrl: null, today: '2026-11-11', stats: { ...baseStats, ...st }, ...over,
});

function pure() {
  check('moeda milhar', formatMoney(123456) === 'R$ 1.234,56' && formatMoney(18700) === 'R$ 187,00' && formatMoney(5) === 'R$ 0,05');
  check('reais arredondado', formatReaisRounded(18734) === 'R$ 187' && formatReaisRounded(123456) === 'R$ 1.235', [formatReaisRounded(18734), formatReaisRounded(123456)]);
  check('carimbo', stampLine(new Date('2026-11-11T12:41:00Z')) === 'Conferido em 11/11 às 09:41', stampLine(new Date('2026-11-11T12:41:00Z')));
  check('loja', storePhrase('Mercado Livre') === 'no Mercado Livre' && storePhrase('Amazon') === 'na Amazon' && storePhrase('Shopee') === 'na Shopee' && storePhrase('Foo') === 'em Foo');
  const t = truncateTitle('Jogo The Legend Of Zelda Echoes Of Wisdom Nintendo Switch Mídia Física Lacrado Edição Padrão Brasil', 78);
  check('truncagem', Array.from(t).length <= 78 && t.endsWith('…'), t);
  check('truncagem curta', truncateTitle('Zelda', 78) === 'Zelda');

  // Prioridade 1: novo menor registrado (vence queda e média)
  let i = chooseInsight(mk(28000));
  check('1 novo menor', i?.kind === 'new_record' && i.text === 'Menor preço desde 31/10', i);
  check('1 exige série >= 3 dias', chooseInsight(mk(28000, {}, { measuredDays: 2, prev: null, avgCents: null }))?.kind !== 'new_record');
  check('1 não vale para Amazon', chooseInsight(mk(28000, { isAmazon: true }, { prev: null }))?.kind !== 'new_record');
  // Prioridade 2: queda >= 5% (preço acima do recorde para não cair na 1)
  i = chooseInsight(mk(33000, {}, { prev: { cents: 36300, day: '2026-11-10' } }));
  check('2 queda 9% desde ontem', i?.kind === 'drop' && i.text === 'Caiu 9% desde ontem', i);
  i = chooseInsight(mk(33000, {}, { prev: { cents: 36300, day: '2026-11-07' } }));
  check('2 queda desde data', i?.text === 'Caiu 9% desde 07/11', i);
  check('2 queda < 5% não vale', chooseInsight(mk(33000, {}, { prev: { cents: 34000, day: '2026-11-10' }, avgCents: null, recordCents: 20000 })) === null);
  i = chooseInsight(mk(9000, { isAmazon: true, store: 'Amazon' }, { prev: { cents: 10000, day: '2026-11-10' } }));
  check('2 vale para Amazon (histórico dela)', i?.kind === 'drop' && i.text === 'Caiu 10% desde ontem', i);
  // Prioridade 3: abaixo da média >= 10%
  i = chooseInsight(mk(31500, {}, { prev: null }));
  check('3 abaixo da média', i?.kind === 'below_avg' && i.text === 'R$ 35 abaixo da média das lojas', i);
  check('3 exige 3 ofertas', chooseInsight(mk(31500, {}, { prev: null, distinctOffers: 2 }))?.kind !== 'below_avg');
  check('3 menos de 10% não vale', chooseInsight(mk(32000, {}, { prev: null, recordCents: 20000 })) === null);
  check('3 não vale para Amazon', chooseInsight(mk(31500, { isAmazon: true }, { prev: null })) === null);
  // Prioridade 4: perto do menor
  i = chooseInsight(mk(30600, {}, { prev: null, avgCents: null }));
  check('4 perto do menor', i?.kind === 'near_record' && i.text === 'A 2% do menor preço registrado', i);
  check('4 igual ao menor', chooseInsight(mk(30000, {}, { prev: null, avgCents: null }))?.kind === 'equal_record');
  check('4 longe do menor omite', chooseInsight(mk(32000, {}, { prev: null, avgCents: null })) === null);
  // Sem dado: omitir
  check('omite sem estatística', chooseInsight(mk(32000, {}, { recordCents: null, seriesFirstDay: null, measuredDays: 0, avgCents: null, distinctOffers: 0, prev: null })) === null);
  check('preço inválido', chooseInsight(mk(0)) === null);
  i = chooseInsight(mk(31500, {}, { prev: { cents: 35000, day: '2026-11-10' } }));
  check('prioridade queda > média', i?.kind === 'drop', i);
  // Nada de promessa, % OFF, de/por ou "afiliado"
  const texts = [chooseInsight(mk(28000)), chooseInsight(mk(33000, {}, { prev: { cents: 36300, day: '2026-11-10' } })), chooseInsight(mk(31500, {}, { prev: null })), chooseInsight(mk(30600, {}, { prev: null, avgCents: null }))].map((x) => x?.text ?? '');
  check('sem palavras proibidas', texts.every((x) => !/off|de r\$|por r\$|afiliad|vai |subir/i.test(x)), texts);
  check('insight cabe em uma linha', texts.every((x) => (fitInsight(x) ?? '').length <= INSIGHT_MAX_CHARS));
  // Frescor
  check('fresco ML', isFreshForCard(100, new Date('2026-11-11T10:00:00-03:00'), false, NOW));
  check('velho ML', !isFreshForCard(100, new Date('2026-11-11T05:00:00-03:00'), false, NOW));
  check('Amazon 24h', isFreshForCard(100, new Date('2026-11-10T20:00:00-03:00'), true, NOW) && !isFreshForCard(100, new Date('2026-11-10T10:00:00-03:00'), true, NOW));
  // Geometria
  const g = OFFER_GEOM;
  const box = coverBox();
  check('painel dentro do quadrado', g.panel.x >= 0 && g.panel.x + g.panel.w <= 1080 && g.panel.y + g.panel.h < g.titleTop);
  check('capa dentro do painel', box.x > g.panel.x && box.x + box.w < g.panel.x + g.panel.w && box.y + box.h < g.panel.y + g.panel.h);
  check('título 2 linhas antes do preço', g.titleTop + 2 * g.titleLine <= g.priceTop);
  check('preço antes do insight antes do rodapé', g.priceTop + g.priceBoxH <= g.insightTop + 10 && g.insightTop + g.insightFont < g.footerTop);
  check('rodapé dentro do quadrado', g.footerTop + 40 <= 1080 - 20);
  const f = priceFontSize('R$ 249,90', 'no Mercado Livre');
  check('preço de 9 caracteres fica grande', f.price >= 110 && f.price <= 140, f);
  const f2 = priceFontSize('R$ 12.345,67', 'no Mercado Livre');
  check('preço longo cabe', f2.price * 12 * 0.6 + 16 * 30 * 0.56 + 24 <= g.contentW, f2);
  check('alt', buildOfferAlt(mk(28000), 'Menor preço desde 31/10').includes('R$ 280,00 no Mercado Livre'));
}

async function withDb(outDir: string) {
  const { db } = await import('../src/lib/db');
  const { loadOfferCardInput, renderOfferCard } = await import('../src/server/messaging/offer-card');
  mkdirSync(outDir, { recursive: true });
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const seen = new Set<string>();

  async function pick(label: string, ids: string[], accept: (i: OfferCardInput) => boolean): Promise<void> {
    for (const id of ids) {
      if (seen.has(id)) continue;
      const input = await loadOfferCardInput(id);
      if (!input || !accept(input)) continue;
      const card = await renderOfferCard(input);
      if (!card) continue;
      seen.add(id);
      const ins = chooseInsight(input);
      const file = join(outDir, `card-${label}-${id.slice(0, 8)}.png`);
      writeFileSync(file, card.png);
      check(`${label}: PNG 1080x1080`, card.png.subarray(0, 4).equals(PNG) && card.png.readUInt32BE(16) === 1080 && card.png.readUInt32BE(20) === 1080);
      console.log(`${label}: ${file}\n   insight=${ins ? `${ins.kind} | ${ins.text}` : '(omitido)'} | preço=${formatMoney(input.priceCents)} ${input.store} | capa=${input.imageUrl ? 'sim' : 'não'}`);
      return;
    }
    check(`${label}: candidato encontrado`, false);
  }

  const ml = async (extra: ReturnType<typeof sql>, limit = 250) =>
    (
      await db.execute<Record<string, unknown>>(sql`
      SELECT o.id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
      WHERE n.slug = 'mercado-livre' AND o.status = 'active' AND o.last_price_confirmed_at > now() - interval '5 hours' ${extra}
      ORDER BY o.last_price_change_at DESC NULLS LAST LIMIT ${limit}`)
    ).map((r) => String(r.id));

  await pick('ml-menor-registrado', await ml(sql`AND coalesce(o.image_url,'') <> '' AND o.current_price_cents > 0`, 1500), (i) => chooseInsight(i)?.kind === 'new_record' && !!i.imageUrl);
  await pick('ml-queda-do-dia', await ml(sql`AND coalesce(o.image_url,'') <> '' AND o.previous_price_cents > o.current_price_cents * 1.05`), (i) => chooseInsight(i)?.kind === 'drop' && !!i.imageUrl);
  await pick('ml-sem-capa', await ml(sql`AND coalesce(o.image_url,'') = ''`), (i) => !i.imageUrl);
  const amz = (
    await db.execute<Record<string, unknown>>(sql`
    SELECT o.id FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id
    WHERE n.slug = 'amazon' AND o.status = 'active' AND o.last_price_confirmed_at > now() - interval '20 hours'
    ORDER BY (o.previous_price_cents > o.current_price_cents) DESC, o.current_price_cents DESC LIMIT 200`)
  ).map((r) => String(r.id));
  await pick('amazon', amz, (i) => i.isAmazon);

  const ai = await Promise.all(amz.slice(0, 40).map((id) => loadOfferCardInput(id)));
  check('Amazon: insight só de queda própria ou omitido', ai.every((x) => !x || [null, 'drop'].includes(chooseInsight(x)?.kind ?? null)));
  check('uuid inválido -> null', (await loadOfferCardInput('nao-e-uuid')) === null);
  check('oferta inexistente -> null', (await loadOfferCardInput('00000000-0000-4000-8000-000000000000')) === null);
  const any = await loadOfferCardInput((await ml(sql`AND coalesce(o.image_url,'') <> ''`, 30)).find((x) => !seen.has(x)) ?? '');
  if (any) {
    const card = await renderOfferCard({ ...any, imageUrl: 'https://invalid.invalid/capa.jpg' });
    check('capa inacessível -> card sem capa', !!card && card.png.length > 5000);
    if (card) writeFileSync(join(outDir, 'card-capa-falhou.png'), card.png);
  }
}

async function main() {
  pure();
  const outDir = process.argv[2] ?? 'C:\\Users\\Usuario\\AppData\\Local\\Temp\\claude\\ca796e41c2dd1ba9\\2d5f1fda-9c18-4791-bdfb-30851cbacab9\\scratchpad\\cards-oferta';
  if (process.env.DATABASE_URL) await withDb(outDir);
  else console.log('DATABASE_URL ausente: parte 2 (banco) ignorada');
  console.log(`\n${total - fails}/${total} verificações ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
