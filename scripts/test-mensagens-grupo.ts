/**
 * Teste das MENSAGENS PARA GRUPOS (ata 2026-11-10). Sem banco, sem rede, sem token.
 * Uso: npx tsx scripts/test-mensagens-grupo.ts   (sai com codigo 1 se algo falhar)
 * Fixtures: valores REAIS lidos no banco e registrados na ata (10/11/2026). Nenhum dado inventado.
 */
import {
  buildGroupMessages,
  buildGoLink,
  cleanProductName,
  escapeTelegramHtml,
  escapeWhatsapp,
  fmtBRL,
  makeMessageKey,
  productDisplayName,
  textProblems,
  waMeLink,
  type GroupMessageInput,
} from '../src/lib/messaging/group-messages';
import {
  applyLimits,
  buildDailySummary,
  dailyCap,
  evaluateProduct,
  isNightHour,
  priceWithinTolerance,
  productDedupBlock,
  titleIdentityBlock,
  type Candidate,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '../src/lib/messaging/group-rules';
import { buildWhatsappMessage, buildCartWhatsappMessage } from '../src/lib/affiliate/message-template';
import { canSendTelegram, getAdTag, getGroupMessagesMode, isGroupMessagesEnabled } from '../src/lib/messaging/group-config';
import { sendTelegramGroupMessage, type FetchLike } from '../src/lib/messaging/telegram-send';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}
function eq<T>(a: T, b: T, name: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b });
}

// Horas de referência (UTC) da ata: 10/11 21:41 local = 11/11 00:41 UTC
const T_TOMBA = new Date('2026-11-11T00:41:00Z');
const T_BIO = new Date('2026-11-11T00:06:00Z');
const T_CAPCOM = new Date('2026-11-11T00:05:00Z');
const NOW = new Date('2026-11-11T00:50:00Z'); // 10/11 21:50 local
const AD = '#publicidade';

// ---------------------------------------------------------------------------
// 1) Formato de dinheiro, escape, link
// ---------------------------------------------------------------------------
eq(fmtBRL(29199), 'R$ 291,99', 'fmtBRL 291,99');
eq(fmtBRL(315754), 'R$ 3.157,54', 'fmtBRL milhar');
eq(fmtBRL(100), 'R$ 1,00', 'fmtBRL 1,00');
eq(fmtBRL(5), 'R$ 0,05', 'fmtBRL 0,05');
ok(!fmtBRL(123456789).includes(' '), 'fmtBRL sem NBSP');
eq(escapeTelegramHtml('A & B <i>x</i>'), 'A &amp; B &lt;i&gt;x&lt;/i&gt;', 'escape HTML Telegram');
eq(escapeWhatsapp('Jogo *Top* _x_ ~y~ `z`'), 'Jogo Top x y z', 'escape WhatsApp remove formatadores');
eq(
  buildGoLink('tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894', 'wa', 'g1-261110-abc123'),
  'https://www.egeek86.com/go/tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894?s=wa&m=g1-261110-abc123',
  'link /go com s e m'
);
let threw = false;
try {
  buildGoLink('x', 'tg', 'ABC!');
} catch {
  threw = true;
}
ok(threw, 'message_key inválida lança');
const mk = makeMessageKey('G1', 'semente', NOW);
ok(/^[a-z0-9-]{3,40}$/.test(mk), 'message_key no padrão do /go', mk);
eq(makeMessageKey('G1', 'semente', NOW), mk, 'message_key determinística');
ok(waMeLink('a b\nc').startsWith('https://wa.me/?text=a%20b%0Ac'), 'wa.me sem número e com texto codificado');

// ---------------------------------------------------------------------------
// 2) Nome do produto
// ---------------------------------------------------------------------------
eq(productDisplayName('Jogo Biomutant Nintendo Switch Mídia Física', { platformLabel: 'Switch', format: 'physical' }), 'Biomutant (Switch, mídia física)', 'nome Biomutant');
eq(productDisplayName('Tomba! Edição Especial', { platformLabel: 'Switch', format: 'physical' }), 'Tomba! Edição Especial (Switch, mídia física)', 'nome Tomba');
ok(!/off/i.test(cleanProductName('God of War 50% OFF Imperdível PS5')), 'nome sem OFF/imperdível', cleanProductName('God of War 50% OFF Imperdível PS5'));
eq(productDisplayName('Console Nintendo Switch 2 Modelo Nacional de Tomada', { isGame: false }), 'Console Nintendo Switch 2 Modelo Nacional de Tomada', 'console não é limpo');

// ---------------------------------------------------------------------------
// 3) Modelos com os exemplos da ata
// ---------------------------------------------------------------------------
const tombaOffer = {
  slug: 'tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894',
  networkSlug: 'mercado-livre',
  networkName: 'Mercado Livre',
  priceCents: 29199,
  confirmedAt: T_TOMBA,
};
const m1: GroupMessageInput = {
  model: 'menor-preco', vertical: 'games', messageKey: 'g1-261110-000abc', adTag: AD,
  name: 'Tomba! Edição Especial (Switch, mídia física)', offer: tombaOffer, prevMinCents: 34990,
  trackingSince: new Date('2026-10-31T15:00:00Z'), avg: { cents: 43008, offers: 3 },
};
const r1 = buildGroupMessages(m1);
eq(r1.problems, [], 'M1 sem problemas');
ok(r1.telegram.includes('<b>Tomba! Edição Especial (Switch, mídia física)</b>'), 'M1 TG negrito no produto');
ok(r1.telegram.includes('<b>R$ 291,99</b> no Mercado Livre. Menor preço que registramos desde 31/10; o anterior era R$ 349,90.'), 'M1 TG linha de preço', r1.telegram);
ok(r1.telegram.includes('32% abaixo da média de R$ 430,08 (3 ofertas).'), 'M1 TG média', r1.telegram);
ok(r1.telegram.includes('Conferido em 10/11 às 21:41 (Brasília).'), 'M1 carimbo de Brasília', r1.telegram);
ok(r1.telegram.includes('<a href="https://www.egeek86.com/go/tomba-edicao-especial-nintendo-switch-jogo-fisico-2024-49100894?s=tg&amp;m=g1-261110-000abc">Ver a oferta</a> #publicidade'), 'M1 TG link s=tg&m= com & escapado', r1.telegram);
ok(r1.whatsapp.includes('*Tomba! Edição Especial (Switch, mídia física)*'), 'M1 WA negrito');
ok(!r1.whatsapp.includes('<'), 'M1 WA sem HTML');
ok(r1.whatsapp.endsWith('?s=wa&m=g1-261110-000abc #publicidade'), 'M1 WA link puro + tag', r1.whatsapp);
ok(!/R\$ 291,99.*R\$ 349,90.*por/.test(r1.whatsapp), 'M1 sem formato de/por');
ok(r1.whatsapp.split('\n').length <= 6, 'M1 curto');

const bio: GroupMessageInput = {
  model: 'abaixo-media', vertical: 'games', messageKey: 'g2-261110-000def', adTag: AD,
  name: 'Biomutant (Switch, mídia física)',
  offer: { slug: 'jogo-biomutant-nintendo-switch-midia-fisica-281736848', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 22700, confirmedAt: T_BIO },
  avg: { cents: 33003, offers: 4 },
};
const r2 = buildGroupMessages(bio);
ok(r2.whatsapp.includes('*R$ 227,00* no Mercado Livre, 31% abaixo da média de R$ 330,03 (4 ofertas).'), 'M2 WA texto', r2.whatsapp);
ok(r2.whatsapp.includes('Conferido em 10/11 às 21:06 (Brasília).'), 'M2 carimbo');
eq(r2.problems, [], 'M2 sem problemas');

const m3: GroupMessageInput = {
  model: 'comparativo', vertical: 'games', messageKey: 'g3-261110-000ghi', adTag: AD,
  name: 'Nintendo Switch Sports (Switch, mídia física)',
  cheap: { slug: 'jogo-nintendo-switch-sports-midia-fisica-shopee-e3a58b', networkSlug: 'shopee', networkName: 'Shopee', priceCents: 22999, confirmedAt: new Date('2026-11-11T00:54:00Z') },
  other: { slug: 'nintendo-switch-sports-fisico-3003300345', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 32000, confirmedAt: new Date('2026-11-11T00:30:00Z'), offersCount: 6, maxCents: 52600 },
  avg: { cents: 36705, offers: 9 },
};
const r3 = buildGroupMessages(m3);
ok(r3.telegram.includes('<b>R$ 229,99</b> na Shopee') && !r3.telegram.includes('R$ 320,00') && !r3.telegram.includes('Mercado Livre'), 'M3 TG só o menor preço, sem o preço de cada loja', r3.telegram);
ok(r3.telegram.includes('<b>Menor preço:</b> entre as lojas que monitoramos hoje') && r3.telegram.includes('<b>Média das lojas:</b> R$ 367,05'), 'M3 TG menor preço do monitoramento e média', r3.telegram);
ok(r3.telegram.includes('Conferido em 10/11 às 21:30 (Brasília).'), 'M3 usa a conferência mais antiga', r3.telegram);
ok(!r3.telegram.includes('/go/'), 'M3 TG sem URL no texto (link no botão)');
ok(r3.whatsapp.includes('https://www.egeek86.com/go/jogo-nintendo-switch-sports-midia-fisica-shopee-e3a58b?s=wa&m=g3-261110-000ghi'), 'M3 WA link da oferta mais barata', r3.whatsapp);

const items = [
  { name: 'Tomba! Edição Especial', platformLabel: 'Switch', offer: tombaOffer, avg: { cents: 43008, offers: 3 } },
  { name: 'Biomutant', platformLabel: 'Switch', offer: bio.model === 'abaixo-media' ? bio.offer : tombaOffer, avg: { cents: 33003, offers: 4 } },
  {
    name: 'Capcom Fighting Collection', platformLabel: 'Switch',
    offer: { slug: 'capcom-fighting-collection-para-nintendo-switch-fisico-3003664742', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 24340, confirmedAt: T_CAPCOM },
    avg: { cents: 34715, offers: 7 },
  },
];
const m4: GroupMessageInput = { model: 'resumo-dia', vertical: 'games', messageKey: 'g4-261110-000jkl', adTag: AD, items };
const r4 = buildGroupMessages(m4);
ok(r4.whatsapp.startsWith('*3 jogos de Switch abaixo da média hoje* (Mercado Livre)'), 'M4 cabeçalho', r4.whatsapp);
ok(r4.whatsapp.includes('3. Capcom Fighting Collection: *R$ 243,40* (30% abaixo da média)'), 'M4 item 3', r4.whatsapp);
ok(r4.whatsapp.includes('Preços conferidos entre 21:05 e 21:41 de 10/11 (Brasília). #publicidade'), 'M4 rodapé', r4.whatsapp);
eq(r4.problems, [], 'M4 sem problemas');
threw = false;
try {
  buildGroupMessages({ ...m4, items: [items[0]] } as GroupMessageInput);
} catch {
  threw = true;
}
ok(threw, 'M4 com 1 item lança (não envia)');

const m5: GroupMessageInput = {
  model: 'foto-preco', vertical: 'games', messageKey: 'g5-261110-000mno', adTag: AD,
  name: 'Nintendo Switch 2 (modelo nacional)',
  offer: { slug: 'console-nintendo-switch-2-modelo-nacional-de-tomada-3246949086', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 315754, confirmedAt: new Date('2026-11-11T01:21:00Z') },
  top: [315754, 323144, 327095], medianCents: 439900, offersCount: 62,
  record: { cents: 290632, since: new Date('2026-10-31T15:00:00Z') },
};
const r5 = buildGroupMessages(m5);
ok(r5.telegram.includes('<b>Foto de preço, 10/11: Nintendo Switch 2 (modelo nacional)</b>'), 'M5 título', r5.telegram);
ok(r5.telegram.includes('<b>Os menores:</b> R$ 3.157,54, R$ 3.231,44 e R$ 3.270,95') && r5.telegram.includes('Mediana de 62 ofertas:</b> R$ 4.399,00'), 'M5 três menores', r5.telegram);
ok(r5.telegram.includes('<b>Menor registrado:</b> R$ 2.906,32 (desde 31/10)'), 'M5 recorde com janela');
ok(r5.telegram.includes('Black Friday (27/11)'), 'M5 BF');
ok(!/desconto|abaixo/i.test(r5.telegram), 'M5 não afirma desconto', r5.telegram);
const r5b = buildGroupMessages({ ...m5, baseline: { day: '10/11', lowestCents: 315754 } } as GroupMessageInput);
ok(r5b.whatsapp.includes('menor preço era R$ 3.157,54'), 'M5 comparada com a foto');
const r5c = buildGroupMessages({ ...m5, record: null } as GroupMessageInput);
ok(!r5c.whatsapp.includes('Menor preço que registramos'), 'M5 variável vazia remove a linha');

const m6: GroupMessageInput = {
  model: 'departamento', vertical: 'tecnologia', messageKey: 'g6-261110-000pqr', adTag: AD,
  name: 'SSD Kingston NV3 1 TB (M.2 NVMe)', departmentLabel: 'Tecnologia',
  offer: { slug: 'ssd-kingston-nv3-1-tb-m-2-nvme-pcie-4-0-x4-para-pc-e-ps5-3336424216', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 104900, confirmedAt: new Date('2026-11-11T01:02:00Z') },
  others: { minCents: 106896, maxCents: 157798 }, avg: null,
};
const r6 = buildGroupMessages(m6);
ok(r6.whatsapp.startsWith('[Tecnologia] *SSD Kingston NV3 1 TB (M.2 NVMe)*'), 'M6 rótulo do departamento', r6.whatsapp);
ok(r6.whatsapp.includes('(outras de R$ 1.068,96 a R$ 1.577,98)'), 'M6 faixa');
ok(!r6.whatsapp.includes('abaixo da média'), 'M6 sem média: linha some');

// Amazon nunca
threw = false;
try {
  buildGroupMessages({ ...bio, offer: { ...(bio as any).offer, networkSlug: 'amazon', networkName: 'Amazon' } });
} catch {
  threw = true;
}
ok(threw, 'Amazon lança erro');

// ---------------------------------------------------------------------------
// 4) Termos proibidos em todas as saídas e escape
// ---------------------------------------------------------------------------
for (const [nm, r] of Object.entries({ r1, r2, r3, r4, r5, r6 })) {
  for (const ch of ['telegram', 'whatsapp'] as const) {
    const t = r[ch];
    ok(!/afiliad/i.test(t), `${nm}/${ch} sem "afiliado"`);
    ok(!/de\s*\/\s*por/i.test(t) && !/\bDe\s+~?R\$/.test(t), `${nm}/${ch} sem De/por`);
    ok(!/%\s*off/i.test(t), `${nm}/${ch} sem % OFF`);
    ok(!/amazon/i.test(t), `${nm}/${ch} sem Amazon`);
    ok(!/undefined|NaN/.test(t), `${nm}/${ch} sem variável vazia`);
  }
}
const evil = buildGroupMessages({ ...bio, name: 'Jogo <script> & "aspas" *negrito* (Switch)' } as GroupMessageInput);
ok(evil.telegram.includes('&lt;script&gt; &amp; "aspas"'), 'título hostil escapado no Telegram', evil.telegram);
ok(!evil.whatsapp.includes('*negrito*'), 'título hostil sem formatador no WhatsApp');
ok(textProblems('Compre já, imperdível!', 'wa').length > 0, 'barreira pega "imperdível"');
ok(textProblems('Link de afiliado', 'wa').length > 0, 'barreira pega "afiliado"');
ok(textProblems('De R$ 100,00 por R$ 80,00', 'wa').length > 0, 'barreira pega De/por');
ok(textProblems('x'.repeat(5000), 'tg').length > 0, 'barreira pega texto > 4096 no Telegram');
// Título de marketplace com "30% OFF" não vira texto reprovado
const dirty = buildGroupMessages({ ...bio, name: productDisplayName('God of War 30% OFF Imperdível', { platformLabel: 'PS5', format: 'physical' }) } as GroupMessageInput);
eq(dirty.problems, [], 'título com OFF é limpo antes de sair');

// ---------------------------------------------------------------------------
// 5) Tag de publicidade configurável
// ---------------------------------------------------------------------------
eq(getAdTag({}), '#publicidade', 'tag padrão');
eq(getAdTag({ GROUP_MESSAGES_AD_TAG: '' }), '', 'tag vazia = sem marcação');
eq(getAdTag({ GROUP_MESSAGES_AD_TAG: ' #publi ' }), '#publi', 'tag customizada');
eq(getAdTag({ GROUP_MESSAGES_AD_TAG: '#link de afiliado' }), '#publicidade', 'tag com "afiliado" cai no padrão');
eq(getAdTag({ GROUP_MESSAGES_AD_TAG: 'none' }), '', 'tag none = sem marcação');
const noTag = buildGroupMessages({ ...bio, adTag: '' } as GroupMessageInput);
ok(noTag.whatsapp.endsWith('m=g2-261110-000def'), 'sem tag: nada pendurado no link', noTag.whatsapp);
ok(!noTag.whatsapp.includes('#'), 'sem tag: sem hashtag');
ok(r2.whatsapp.includes('#publicidade'), 'com tag: #publicidade presente');

// ---------------------------------------------------------------------------
// 6) Configuração / kill-switch
// ---------------------------------------------------------------------------
ok(!isGroupMessagesEnabled({}), 'desligado por padrão');
ok(isGroupMessagesEnabled({ GROUP_MESSAGES_ENABLED: '1' }), 'ligado com 1');
eq(getGroupMessagesMode({}), 'dry', 'modo padrão dry');
eq(getGroupMessagesMode({ GROUP_MESSAGES_MODE: 'SEND ' }), 'send', 'modo send');
eq(getGroupMessagesMode({ GROUP_MESSAGES_MODE: 'qualquer' }), 'dry', 'modo desconhecido = dry');
ok(!canSendTelegram({}).ok, 'sem nada não envia');
ok(!canSendTelegram({ GROUP_MESSAGES_ENABLED: '1', GROUP_MESSAGES_MODE: 'send', TELEGRAM_BOT_TOKEN: 't' }).ok, 'sem chat id não envia');
ok(!canSendTelegram({ GROUP_MESSAGES_ENABLED: '1', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_GROUP_CHAT_ID: '-1' }).ok, 'modo dry não envia');
ok(!canSendTelegram({ GROUP_MESSAGES_MODE: 'send', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_GROUP_CHAT_ID: '-1' }).ok, 'sem flag não envia');
ok(canSendTelegram({ GROUP_MESSAGES_ENABLED: '1', GROUP_MESSAGES_MODE: 'send', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_GROUP_CHAT_ID: '-1' }).ok, 'tudo ligado envia');

// ---------------------------------------------------------------------------
// 7) Gatilhos
// ---------------------------------------------------------------------------
const H = 3600_000;
function offer(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Jogo Tomba Edicao Especial Nintendo Switch Fisico', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 826,
    confirmedAt: new Date(NOW.getTime() - 10 * 60_000), priceSince: new Date(NOW.getTime() - 3 * H),
    affiliateLinkPending: false, quarantined: false, ...over,
  };
}
function product(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'p1', masterName: 'Tomba! Edição Especial', vertical: 'games', productType: 'game', platformLabel: 'Switch', format: 'physical', catalogGate: 'approved',
    offers: [offer({ offerId: 'a', priceCents: 29199 }), offer({ offerId: 'b', priceCents: 45000 }), offer({ offerId: 'c', priceCents: 47000 })],
    avg: { cents: 43008, distinctOffers: 3, offerDays: 43, spanDays: 17, eligible: true },
    minEvent: { at: new Date(NOW.getTime() - H), minCents: 29199, prevMinCents: 34990, offerId: 'a' },
    record: { since: new Date('2026-10-31T15:00:00Z'), minCents: 29199 },
    ...over,
  };
}
const ctx = { now: NOW, maxAgeMin: 120, adTag: AD };

// G1 positivo (Tomba: queda 16,6% e 32% abaixo da média)
let ev = evaluateProduct(product(), ctx);
ok(ev.candidates.some((c) => c.trigger === 'G1' && c.status === 'auto' && c.sendable), 'G1 Tomba passa', ev);
const g1 = ev.candidates.find((c) => c.trigger === 'G1');
ok(!!g1 && g1.belowAvgPct === 32 && g1.reason.includes('Novo menor preço registrado'), 'G1 com motivo e % de média');
ok(!!g1 && g1.texts.whatsapp.includes(`m=${g1.messageKey}`) && g1.texts.telegram.includes(`m=${g1.messageKey}`), 'G1 message_key nos dois links');
ok(ev.candidates.filter((c) => c.trigger === 'G2').length === 0, 'G1 não duplica como G2');

// G1: queda 5% (< 8%) cai para G2
ev = evaluateProduct(product({ minEvent: { at: new Date(NOW.getTime() - H), minCents: 29199, prevMinCents: 30700, offerId: 'a' } }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G1'), 'G1 não passa com queda < 8%');
ok(ev.candidates.some((c) => c.trigger === 'G2'), 'mesmo produto vira G2 (>= 15% abaixo da média)');
// G2: 14% abaixo da média não passa
ev = evaluateProduct(product({ minEvent: null, offers: [offer({ offerId: 'a', priceCents: 37000 }), offer({ offerId: 'b', priceCents: 45000 }), offer({ offerId: 'c', priceCents: 47000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G2'), 'G2 não passa com 14% abaixo da média');
// G2 acima de 40% => revisão humana
ev = evaluateProduct(product({ minEvent: null, offers: [offer({ offerId: 'a', priceCents: 22000 }), offer({ offerId: 'b', priceCents: 45000 }), offer({ offerId: 'c', priceCents: 47000 })] }), ctx);
const g2r = ev.candidates.find((c) => c.trigger === 'G2');
ok(!!g2r && g2r.status === 'review' && g2r.reviewReasons.some((r) => r.includes('45pct')), 'G2 > 45% (onda 2; era 40%) vai para revisão humana', g2r?.reviewReasons);
// Menos de 3 lojas
ev = evaluateProduct(product({ offers: [offer({ offerId: 'a', priceCents: 29199 }), offer({ offerId: 'b', priceCents: 45000 })] }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G1' || c.trigger === 'G2'), 'sem 3 lojas não dispara');
// Média não elegível
ev = evaluateProduct(product({ avg: { cents: 43008, distinctOffers: 3, offerDays: 4, spanDays: 17, eligible: false } }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G1' || c.trigger === 'G2'), 'média não elegível não dispara');
// Caso Shopee "Original japonês": a oferta mais barata tem região no título
const jp = offer({ offerId: 'jp', priceCents: 20990, networkSlug: 'shopee', networkName: 'Shopee', title: 'Super Mario 3D World + Fury World Nintendo Switch (Original japonês)' });
ev = evaluateProduct(
  product({
    masterName: 'Super Mario 3D World + Bowser\'s Fury',
    offers: [jp, offer({ offerId: 'a', priceCents: 32669, title: 'Super Mario 3D World Bowsers Fury Switch' }), offer({ offerId: 'b', priceCents: 33000, title: 'Super Mario 3D World Bowsers Fury Switch' }), offer({ offerId: 'c', priceCents: 34000, title: 'Super Mario 3D World Bowsers Fury Switch' })],
    minEvent: { at: new Date(NOW.getTime() - H), minCents: 20990, prevMinCents: 32669, offerId: 'jp' },
    avg: { cents: 32669, distinctOffers: 4, offerDays: 30, spanDays: 15, eligible: true },
  }),
  ctx
);
ok(!ev.candidates.some((c) => c.trigger === 'G1'), 'caso Shopee japonês não gera falsa queda');
ok(ev.blocked.some((b) => b.trigger === 'G1' && b.reasons.some((r) => r.includes('regiao_no_titulo'))), 'bloqueio registra região no título', ev.blocked);
ok(titleIdentityBlock('Jogo X (Original japonês) Switch', 'X') === 'regiao_no_titulo', 'região japonês');
ok(titleIdentityBlock('Jogo X Import US NTSC', 'X') === 'regiao_no_titulo', 'região NTSC');
ok(titleIdentityBlock('Jogo X Open Box', 'X') === 'condicao_nao_nova_no_titulo', 'open box');
ok(String(titleIdentityBlock('Jogo X Edição Colecionador', 'X')).startsWith('edicao_diferente_no_titulo'), 'edição colecionador não casa com a base');
ok(titleIdentityBlock('Jogo X Edição Colecionador', 'X Edição Colecionador') === null, 'edição igual ao master passa');
// Amazon excluída
ev = evaluateProduct(product({ offers: [offer({ offerId: 'am', priceCents: 8399, networkSlug: 'amazon', networkName: 'Amazon' }), ...product().offers] }), ctx);
ok(ev.candidates.every((c) => !c.offerIds.includes('am')), 'Amazon nunca é oferta da mensagem');
ok(!ev.candidates.some((c) => c.trigger === 'G1'), 'G1 não usa evento da Amazon (a mais barata é bloqueada)');
ok(ev.candidates.every((c) => !/amazon/i.test(c.texts.telegram + c.texts.whatsapp)), 'texto sem Amazon');
// Shopee só com aprovação
ev = evaluateProduct(product({ offers: [offer({ offerId: 'sp', priceCents: 25000, networkSlug: 'shopee', networkName: 'Shopee' }), offer({ offerId: 'b', priceCents: 45000 }), offer({ offerId: 'c', priceCents: 47000 })], minEvent: null }), ctx);
const sp = ev.candidates.find((c) => c.offerIds[0] === 'sp');
ok(!!sp && !sp.reviewReasons.includes('shopee_so_com_aprovacao_humana'), 'onda 2: Shopee sem queda > 20% não exige aprovação só por ser Shopee (a reconferência ao vivo é obrigatória no envio)', sp);
// Link pendente / quarentena / preço velho / não reconfirmado
for (const [nm, ov] of [
  ['link pendente', { affiliateLinkPending: true }],
  ['quarentena', { quarantined: true }],
  ['preço de 3 h', { confirmedAt: new Date(NOW.getTime() - 3 * H) }],
  ['sem confirmação', { confirmedAt: null }],
  ['preço novo (< 15 min)', { priceSince: new Date(NOW.getTime() - 12 * 60_000) }],
  ['vendedor vermelho', { sellerReputation: '1_red' }],
] as Array<[string, Partial<OfferFact>]>) {
  ev = evaluateProduct(product({ offers: [offer({ offerId: 'a', priceCents: 29199, ...ov }), offer({ offerId: 'b', priceCents: 45000 }), offer({ offerId: 'c', priceCents: 47000 })] }), ctx);
  ok(!ev.candidates.some((c) => c.trigger === 'G1' && c.offerIds[0] === 'a'), `G1 bloqueado: ${nm}`);
}
// ML sem reputação => revisão
ev = evaluateProduct(product({ offers: [offer({ offerId: 'a', priceCents: 29199, sellerReputation: null }), offer({ offerId: 'b', priceCents: 45000 }), offer({ offerId: 'c', priceCents: 47000 })] }), ctx);
ok(ev.candidates.find((c) => c.trigger === 'G1')?.status === 'review', 'ML sem reputação vai para revisão');
// Porteiro / plataforma
ev = evaluateProduct(product({ catalogGate: 'review' }), ctx);
ok(ev.candidates.length === 0, 'porteiro review bloqueia');
ev = evaluateProduct(product({ platformLabel: null }), ctx);
ok(ev.candidates.length === 0, 'plataforma desconhecida bloqueia');

// G3
const g3p = product({
  minEvent: null, avg: { cents: 36705, distinctOffers: 9, offerDays: 91, spanDays: 18, eligible: true },
  offers: [
    offer({ offerId: 'x', priceCents: 22999, networkSlug: 'shopee', networkName: 'Shopee' }),
    offer({ offerId: 'y', priceCents: 32000 }),
    offer({ offerId: 'y2', priceCents: 40000 }),
    offer({ offerId: 'y3', priceCents: 52600 }),
  ],
});
ev = evaluateProduct(g3p, ctx);
const g3 = ev.candidates.find((c) => c.trigger === 'G3');
ok(!!g3 && g3.offerIds.join() === 'x,y' && !g3.reviewReasons.includes('shopee_so_com_aprovacao_humana'), 'G3 Shopee x ML: Shopee deixa de exigir aprovação só por ser Shopee', g3);
ok(!!g3 && g3.texts.whatsapp.includes('*Menor preço:*') && !g3.texts.whatsapp.includes('Mercado Livre:'), 'G3 só o menor preço, sem listar as duas lojas');

// G5
const many = Array.from({ length: 25 }, (_, i) => offer({ offerId: `m${i}`, priceCents: 315754 + i * 8000, title: 'Console Nintendo Switch 2 Modelo Nacional', sellerId: `s${i}` }));
ev = evaluateProduct(product({ masterName: 'Console Nintendo Switch 2 Modelo Nacional de Tomada', productType: 'console', platformLabel: 'Switch 2', offers: many, minEvent: null, avg: null }), ctx);
const g5 = ev.candidates.find((c) => c.trigger === 'G5');
ok(!!g5 && g5.sendable && g5.texts.telegram.includes('Foto de preço, 10/11'), 'G5 gera foto de preço', ev.blocked);
ok(!!g5 && g5.belowAvgPct === null, 'G5 não afirma desconto');
ev = evaluateProduct(product({ productType: 'console', offers: many.slice(0, 10), minEvent: null, avg: null }), ctx);
ok(!ev.candidates.some((c) => c.trigger === 'G5'), 'G5 exige >= 20 ofertas');

// G6: departamento não liberado
ev = evaluateProduct(product({ vertical: 'tecnologia', productType: 'tecnologia', platformLabel: null, minEvent: null }), ctx);
const g6 = ev.candidates.find((c) => c.trigger === 'G6');
ok(!!g6 && !g6.sendable && String(g6.notSendableReason).includes('departamento_em_review'), 'G6 marcado como não enviável', ev);
ok(!!g6 && g6.texts.whatsapp.startsWith('[Tecnologia]'), 'G6 rótulo');

// G4 (resumo)
const sumFacts = new Map<string, ProductFacts>();
const sumCands: Candidate[] = [];
for (const [id, price, avgc] of [['t', 29199, 43008], ['b', 22700, 33003], ['c', 24340, 34715]] as Array<[string, number, number]>) {
  const pf = product({ masterProductId: id, masterName: id, offers: [offer({ offerId: `${id}1`, priceCents: price, title: id }), offer({ offerId: `${id}2`, priceCents: avgc, title: id }), offer({ offerId: `${id}3`, priceCents: avgc + 500, title: id })], avg: { cents: avgc, distinctOffers: 3, offerDays: 30, spanDays: 20, eligible: true }, minEvent: null });
  sumFacts.set(id, pf);
  sumCands.push(...evaluateProduct(pf, ctx).candidates.filter((c) => c.trigger === 'G2'));
}
const g4 = buildDailySummary(sumCands, sumFacts, ctx);
ok(!!g4 && g4.trigger === 'G4' && g4.offerIds.length === 3, 'G4 junta 3 itens', g4);
ok(buildDailySummary(sumCands.slice(0, 1), sumFacts, ctx) === null, 'G4 com 1 item não existe');

// ---------------------------------------------------------------------------
// 8) Limites anti-spam
// ---------------------------------------------------------------------------
const midday = new Date('2026-11-11T15:00:00Z'); // 12:00 local
const cand = (id: string, net = 'mercado-livre', trig: Candidate['trigger'] = 'G2', pct = 20): Candidate => ({
  messageKey: `g2-261111-${id}`, trigger: trig, model: 'abaixo-media', masterProductId: id, offerIds: [`o${id}`], vertical: 'games', networkSlug: net, name: id,
  priceCents: 10000, avgCents: 12500, belowAvgPct: pct, dropPct: null, reason: 'x', status: 'auto', reviewReasons: [], sendable: true, notSendableReason: null,
  confirmedAt: midday.toISOString(), dedupKey: `${id}:${trig}:w`, texts: { telegram: 't', whatsapp: 'w' }, textProblems: [],
  cls: 'alerta', held: false, heldReasons: [], moveScore: pct, offerSlug: `s${id}`, networkName: 'Mercado Livre',
});
// Política v2: NÃO existe mais silêncio noturno; a noite só tira o som (isNightHour).
ok(isNightHour(new Date('2026-11-11T01:00:00Z')), 'noite às 22h local (01h UTC)');
ok(isNightHour(new Date('2026-11-11T10:59:00Z')), 'noite às 7h59 local');
ok(!isNightHour(new Date('2026-11-11T11:00:00Z')), 'dia às 8h local');
ok(isNightHour(new Date('2026-11-11T09:00:00Z')), 'noite às 6h local');
eq(isNightHour(new Date('2026-11-11T00:50:00Z')), false, '21h50 local ainda não é noite');
eq(dailyCap(new Date('2026-11-12T15:00:00Z')), 400, 'teto normal 400/dia (dono, 2026-11-11)');
eq(dailyCap(new Date('2026-11-20T15:00:00Z')), 400, 'teto 400/dia em 20/11');
eq(dailyCap(new Date('2026-11-27T15:00:00Z')), 400, 'teto 400/dia em 27/11');
eq(dailyCap(new Date('2026-11-28T15:00:00Z')), 400, 'teto 400/dia em 28/11');
let plan = applyLimits([cand('1')], [], new Date('2026-11-11T01:00:00Z'));
ok(plan.next?.masterProductId === '1' && plan.nextSound === false, 'à noite o alerta SAI, mas silencioso (sem som)', plan);
plan = applyLimits([cand('1')], [], midday);
ok(plan.next?.masterProductId === '1' && plan.nextSound === true, 'de dia e sem histórico: envia COM som');
const sent = (id: string, hoursAgo: number, net = 'mercado-livre', price = 10000, extra: Partial<SentRecord> = {}): SentRecord => ({
  masterProductId: id, priceCents: price, sentAt: new Date(midday.getTime() - hoursAgo * H), networkSlug: net, cls: 'alerta', sound: true, ...extra,
});
plan = applyLimits([cand('1')], [sent('9', 0.005)], midday);
ok(plan.next === null && plan.deferred[0]?.reason.startsWith('intervalo_minimo_'), 'intervalo mínimo de 1 min entre mensagens', plan);
plan = applyLimits([cand('1')], [sent('9', 0.5)], midday);
ok(plan.next?.masterProductId === '1', 'depois de 30 min o alerta cabe de novo');
const full = Array.from({ length: 60 }, (_, i) => sent(`h${i}`, 0.3 + i * 0.01, 'shopee', 1, { cls: 'insight', sound: false }));
plan = applyLimits([cand('1')], full, new Date(midday.getTime()));
ok(plan.next === null && plan.deferred[0]?.reason === 'teto_horario_60', 'teto de 60 por hora', plan);
const bfNow = new Date('2026-11-21T15:00:00Z');
const bfHist = Array.from({ length: 31 }, (_, i) => ({ masterProductId: `h${i}`, priceCents: 1, sentAt: new Date(bfNow.getTime() - (i + 1) * 180_000), networkSlug: 'shopee', cls: 'insight' as const, sound: false }));
plan = applyLimits([cand('1')], bfHist, bfNow);
ok(plan.next?.masterProductId === '1', 'semana da BF: 31 enviados ainda cabem (teto 400)', plan);
// dedup 48 h
plan = applyLimits([cand('1')], [sent('1', 1)], midday);
ok(plan.next === null && plan.deferred[0]?.reason.startsWith('produto_ja_enviado'), 'dedup por produto (90 min)', plan);
plan = applyLimits([cand('1')], [sent('1', 1.6)], midday);
ok(plan.next?.masterProductId === '1', 'após 90 min o produto pode voltar');
eq(productDedupBlock({ masterProductId: '1', priceCents: 9400, trigger: 'G1' }, [sent('1', 0.6, 'mercado-livre', 10000)], midday), null, 'novo menor preço (menor que o enviado) repete depois de 30 min');
eq(productDedupBlock({ masterProductId: '1', priceCents: 9400, trigger: 'OK1' }, [sent('1', 0.6, 'mercado-livre', 10000)], midday), null, 'OK1 (novo mínimo) também repete depois de 30 min');
ok(productDedupBlock({ masterProductId: '1', priceCents: 9400, trigger: 'G1' }, [sent('1', 0.3, 'mercado-livre', 10000)], midday) !== null, 'antes de 30 min não repete');
ok(productDedupBlock({ masterProductId: '1', priceCents: 10000, trigger: 'G1' }, [sent('1', 0.6, 'mercado-livre', 10000)], midday) !== null, 'sem preço menor que o enviado não repete');
ok(productDedupBlock({ masterProductId: '1', priceCents: 9400, trigger: 'G2' }, [sent('1', 0.6, 'mercado-livre', 10000)], midday) !== null, 'só G1/OK1 repetem antes de 90 min');
// rodízio (alertas com 20 min de intervalo da última)
plan = applyLimits([cand('1', 'mercado-livre', 'G1', 40), cand('2', 'shopee', 'G2', 35)], [sent('9', 2, 'mercado-livre', 10000, { vertical: 'games' })], midday);
eq(plan.next?.masterProductId, '2', 'diversidade (desempate): troca a rede da última quando o movimento é parecido (>= 70%)');
plan = applyLimits([cand('1', 'mercado-livre', 'G1', 40), cand('2', 'shopee', 'G2', 20)], [sent('9', 2, 'mercado-livre')], midday);
eq(plan.next?.masterProductId, '1', 'diversidade só desempata: movimento bem menor não passa na frente');
plan = applyLimits([cand('1', 'mercado-livre', 'G1', 40), cand('2', 'mercado-livre', 'G2', 20)], [], midday);
eq(plan.next?.masterProductId, '1', 'prioridade G1 antes de G2');
// revisão humana e retida nunca saem sozinhas
plan = applyLimits([{ ...cand('1'), status: 'review' }], [], midday);
ok(plan.next === null, 'candidato em revisão não entra no envio automático');
plan = applyLimits([{ ...cand('1'), held: true }], [], midday);
ok(plan.next === null, 'candidato retido não entra no envio automático');
ok(priceWithinTolerance(10000, 10150) && !priceWithinTolerance(10000, 10300), 'revalidação: preço dentro de 2%');

// ---------------------------------------------------------------------------
// 8b) Gerador legado (drawer "Gerar mensagem WhatsApp") sem De/por, % OFF e "afiliado"
// ---------------------------------------------------------------------------
const legacyInput = {
  title: 'Biomutant (Switch, mídia física)', networkName: 'Mercado Livre', currentPriceCents: 22700, listPriceCents: 40000, avgPriceCents: 33003,
  lowestEverCents: 22700, lowestEverAt: NOW, trackingSince: new Date('2026-10-31T15:00:00Z'), checkedAt: T_BIO,
  coupon: { code: 'GEEK10', discountType: 'percentage', discountValue: '10' }, shortLink: 'https://www.egeek86.com/go/x?s=wa&m=abc-123', siteUrl: 'https://www.egeek86.com', affiliateLinkPending: false,
};
const legacy = buildWhatsappMessage(legacyInput);
ok(!/afiliad/i.test(legacy) && !/%\s*off/i.test(legacy) && !/\bDe\s+~?R\$/.test(legacy) && !legacy.includes('~'), 'legado: sem afiliado, % OFF, De/por', legacy);
ok(!legacy.includes('R$ 400,00'), 'legado: ignora o preço "de" manual');
ok(legacy.includes('31% abaixo da média de R$ 330,03.') && legacy.includes('Menor preço que registramos desde 31/10.') && legacy.includes('Conferido em 10/11 às 21:06 (Brasília).'), 'legado: média, janela e carimbo', legacy);
ok(!/afiliad/i.test(buildWhatsappMessage({ ...legacyInput, affiliateLinkPending: true })), 'legado: lembrete pendente sem "afiliado"');
ok(!/afiliad|% ?off/i.test(buildCartWhatsappMessage('Ana', [legacyInput], 'https://www.egeek86.com')), 'legado: carrinho limpo');

// ---------------------------------------------------------------------------
// 9) Envio no Telegram (fetch injetado, sem rede e sem token real)
// ---------------------------------------------------------------------------
const TOKEN = '123456:SEGREDO-DE-TESTE';
function fakeFetch(responses: Array<{ status: number; body: any }>) {
  const calls: Array<{ url: string; body: any }> = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    const r = responses.shift() ?? { status: 200, body: { ok: true, result: { message_id: 1 } } };
    return { status: r.status, json: async () => r.body } as any;
  };
  return { f, calls };
}
async function tgTests() {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => void sleeps.push(ms);
  const base = { token: TOKEN, chatId: '-1001', sleep };

  let h = fakeFetch([{ status: 200, body: { ok: true, result: { message_id: 77 } } }]);
  let r = await sendTelegramGroupMessage({ ...base, text: '<b>oi</b>', fetchImpl: h.f });
  ok(r.ok && r.messageId === '77' && h.calls.length === 1 && h.calls[0].body.parse_mode === 'HTML', 'Telegram: envio ok com HTML', r);
  ok(h.calls[0].url.endsWith('/sendMessage') && h.calls[0].body.chat_id === '-1001', 'Telegram: sendMessage no chat certo');

  h = fakeFetch([
    { status: 400, body: { ok: false, error_code: 400, description: "Bad Request: can't parse entities: Unsupported start tag" } },
    { status: 200, body: { ok: true, result: { message_id: 5 } } },
  ]);
  r = await sendTelegramGroupMessage({ ...base, text: '<b>oi</b> https://x.com/a?b=1', plainText: 'oi https://x.com/a?b=1', fetchImpl: h.f });
  ok(r.ok && h.calls.length === 2 && !('parse_mode' in h.calls[1].body) && h.calls[1].body.text === 'oi https://x.com/a?b=1', '400 de parse: reenvia em texto simples', { r, calls: h.calls.length });

  h = fakeFetch([{ status: 403, body: { ok: false, error_code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' } }]);
  r = await sendTelegramGroupMessage({ ...base, text: 'x', fetchImpl: h.f });
  ok(!r.ok && r.retryable === false && h.calls.length === 1, '403: erro sem tentar de novo', r);
  h = fakeFetch([{ status: 400, body: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } }]);
  r = await sendTelegramGroupMessage({ ...base, text: 'x', fetchImpl: h.f });
  ok(!r.ok && r.retryable === false && h.calls.length === 1, 'chat não encontrado: erro sem retry', r);

  h = fakeFetch([
    { status: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3', parameters: { retry_after: 3 } } },
    { status: 200, body: { ok: true, result: { message_id: 9 } } },
  ]);
  r = await sendTelegramGroupMessage({ ...base, text: 'x', fetchImpl: h.f });
  ok(r.ok && h.calls.length === 2 && sleeps.includes(3000), '429: respeita retry_after e reenvia', { r, sleeps });
  h = fakeFetch([{ status: 429, body: { ok: false, error_code: 429, parameters: { retry_after: 3000 } } }]);
  r = await sendTelegramGroupMessage({ ...base, text: 'x', fetchImpl: h.f });
  ok(!r.ok && r.retryable === true && h.calls.length === 1, '429 com espera longa: não trava a função, volta para tentar depois', r);

  const boom: FetchLike = async () => {
    throw new Error(`falha em https://api.telegram.org/bot${TOKEN}/sendMessage`);
  };
  r = await sendTelegramGroupMessage({ ...base, text: 'x', fetchImpl: boom });
  ok(!r.ok && !JSON.stringify(r).includes('SEGREDO-DE-TESTE'), 'erro de rede nunca devolve o token', r);
  h = fakeFetch([{ status: 401, body: { ok: false, error_code: 401, description: 'Unauthorized' } }]);
  r = await sendTelegramGroupMessage({ ...base, text: 'x', fetchImpl: h.f });
  ok(!r.ok && r.retryable === false && !JSON.stringify(r).includes('SEGREDO'), '401: sem retry e sem token', r);

  r = await sendTelegramGroupMessage({ token: '', chatId: '-1', text: 'x', fetchImpl: fakeFetch([]).f });
  ok(!r.ok && r.skipped === true, 'sem token: nunca chama a rede');
  const h2 = fakeFetch([]);
  r = await sendTelegramGroupMessage({ token: TOKEN, chatId: '', text: 'x', fetchImpl: h2.f });
  ok(!r.ok && h2.calls.length === 0, 'sem chat id: nunca chama a rede');
  r = await sendTelegramGroupMessage({ ...base, text: 'x'.repeat(5000), fetchImpl: h2.f });
  ok(!r.ok && h2.calls.length === 0, 'texto > 4096: não envia');
}

tgTests()
  .then(() => {
    console.log(`${total - fails}/${total} verificações ok`);
    if (fails) {
      console.error(`${fails} falha(s)`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
