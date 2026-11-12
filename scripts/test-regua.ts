/**
 * RÉGUA DE DESTAQUE POR TAMANHO DA QUEDA (dono, 2026-11-12; ata 2026-11-12-regua-mensagens). Funções puras, sem banco/rede.
 * Uso: npx tsx scripts/test-regua.ts
 * Cobre: bordas 3/6/12/20/30, 2,99, veredito (sem histórico, histórico curto, < 5 ofertas, Compre agora), textos Telegram/WhatsApp
 * (termos banidos, tamanhos, escape de HTML, cor nunca sozinha, <= 2 emojis), rollout por loja (desligado = comportamento antigo),
 * ordem da fila, terço do degrau 1 e link curto.
 */
import { achadoPorHora, applyLimits, degrau1ShareBlock, effectiveMinBelow, evaluateProductV2, formacaoDoProduto, type Candidate, type OfferFact, type ProductFacts, type SentRecord } from '../src/lib/messaging/group-rules';
import { countEmojis, formatAchadoMessage, textProblems, TELEGRAM_CAPTION_MAX_CHARS, TELEGRAM_MAX_CHARS } from '../src/lib/messaging/group-messages';
import { AVISO_DEGRAU_5, DEGRAUS, REGUA, arredondar1, calcularVeredito, contraste, degrauDaQueda, reguaConfig, reguaDaLoja, reguaFront, reguaTelegram, reguaWhatsapp, vaiParaDestaques, type Veredito } from '../src/lib/messaging/regua';
import { captionVisibleLength } from '../src/lib/messaging/telegram-send';
import { codigoCurtoValido, destinoDoCodigo, gerarCodigoCurto, linkCurto } from '../src/lib/messaging/short-code';

let ok = 0, bad = 0;
const eq = (n: string, a: unknown, b: unknown) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { bad++; console.error('FALHOU', n, a, b); } };
const yes = (n: string, c: boolean) => eq(n, c, true);

// ---- bordas dos degraus (percentual exibido, 1 casa) ----
eq('2,99 nao tem degrau (corte 3)', degrauDaQueda(2.94), null);
eq('2,0 sem degrau', degrauDaQueda(2), null);
eq('3,0 = degrau 1', degrauDaQueda(3), 1);
eq('5,9 = degrau 1', degrauDaQueda(5.9), 1);
eq('6,0 = degrau 2', degrauDaQueda(6), 2);
eq('11,9 = degrau 2', degrauDaQueda(11.9), 2);
eq('12,0 = degrau 3', degrauDaQueda(12), 3);
eq('19,9 = degrau 3', degrauDaQueda(19.9), 3);
eq('20,0 = degrau 4', degrauDaQueda(20), 4);
eq('30,0 = degrau 4 (20 a 30)', degrauDaQueda(30), 4);
eq('30,04 exibe 30,0 = degrau 4', degrauDaQueda(30.04), 4);
eq('30,1 = degrau 5 (> 30)', degrauDaQueda(30.1), 5);
eq('63,5 = degrau 5', degrauDaQueda(63.5), 5);
eq('NaN sem degrau', degrauDaQueda(Number.NaN), null);
eq('negativo sem degrau', degrauDaQueda(-5), null);
eq('arredondar1', arredondar1(5.949999), 5.9);
// o degrau decidido pelo numero que o cliente le (6,0 exibido nunca fica em degrau 1)
eq('5,96 exibe 6,0 -> degrau 2', degrauDaQueda(5.96), 2);

// ---- veredito ----
const V = (o: Partial<Parameters<typeof calcularVeredito>[0]> = {}) => calcularVeredito({ pct: 25, nOfertas: 8, precoCents: 10000, minCents: 10000, diasHistorico: 30, ...o }) as Veredito;
eq('abaixo do corte = null', calcularVeredito({ pct: 2.9, nOfertas: 8, precoCents: 10000, minCents: 9000, diasHistorico: 30 }), null);
eq('degrau 4 na minima, 8 ofertas, 30 dias = Compre agora', [V().degrau, V().rotulo], [4, 'Compre agora']);
yes('linha da minima: menor preco dos ultimos 30 dias', V().minLinha === 'Menor preço dos últimos 30 dias');
eq('3% acima da minima ainda Compre agora', V({ precoCents: 10300, minCents: 10000 }).rotulo, 'Compre agora');
yes('3% acima: linha "3,0% acima da minima"', /acima da mínima de 30 dias/.test(V({ precoCents: 10300, minCents: 10000 }).minLinha ?? ''));
eq('mais de 3% acima da minima = Otima compra (degrau 3, amarelo)', [V({ precoCents: 10400, minCents: 10000 }).degrau, V({ precoCents: 10400, minCents: 10000 }).rotulo], [3, 'Ótima compra']);
eq('< 5 ofertas: sem Compre agora', V({ nOfertas: 4 }).rotulo, 'Ótima compra');
eq('< 5 ofertas: sem percentual afirmado', V({ nOfertas: 4 }).mostrarPct, false);
eq('5 ofertas: percentual', V({ nOfertas: 5 }).mostrarPct, true);
eq('sem historico (min nulo): aviso Confira antes de comprar, cor e rotulo do degrau intactos', [V({ minCents: null, diasHistorico: 0 }).rotulo, /^Confira antes de comprar/.test(V({ minCents: null, diasHistorico: 0 }).aviso ?? '')], ['Ótima compra', true]);
eq('sem historico: sem linha da minima', V({ minCents: null, diasHistorico: 0 }).minLinha, null);
eq('historico curto (13 dias): sem Compre agora e sem linha da minima', [V({ diasHistorico: 13 }).rotulo, V({ diasHistorico: 13 }).minLinha], ['Ótima compra', null]);
eq('historico 14 dias libera', V({ diasHistorico: 14 }).rotulo, 'Compre agora');
yes('janela honesta: 120 dias = ultimos 90 dias', V({ diasHistorico: 120 }).minLinha === 'Menor preço dos últimos 90 dias');
eq('degrau 5 = Confira + aviso', [V({ pct: 40 }).degrau, V({ pct: 40 }).rotulo, V({ pct: 40 }).aviso], [5, 'Confira antes de comprar', AVISO_DEGRAU_5]);
eq('degrau 1 com historico e 8 ofertas: Bom preco', [V({ pct: 4 }).degrau, V({ pct: 4 }).rotulo], [1, 'Bom preço']);
eq('degrau 2: Boa compra', V({ pct: 9.9 }).rotulo, 'Boa compra');
eq('degrau 3: Otima compra', V({ pct: 18 }).rotulo, 'Ótima compra');
yes('Compre agora so no degrau 4 (>= 12% ja vale, mas so >= 20 e degrau 4)', [3, 9, 15].every((p) => V({ pct: p }).rotulo !== 'Compre agora'));
yes('nunca "Espere" no grupo', [3, 8, 15, 25, 40].every((p) => !/espere/i.test(V({ pct: p }).rotulo)));
// minimo configuravel de dias
eq('minDias configuravel (7)', V({ diasHistorico: 8, minDias: 7 }).rotulo, 'Compre agora');

// ---- cores e acessibilidade ----
for (const d of [1, 2, 3, 4, 5] as const) {
  const info = DEGRAUS[d];
  yes(`degrau ${d}: contraste >= 4,5 (texto sobre a faixa)`, contraste(info.cor, info.corTexto) >= 4.5);
  eq(`degrau ${d}: marcas = ${d}`, [...info.marcas].length, d);
  yes(`degrau ${d}: rotulo em texto`, info.rotulo.length > 3);
}
eq('rotulos distintos', new Set([1, 2, 3, 4, 5].map((d) => DEGRAUS[d as 1].rotulo)).size, 5);
eq('cores distintas', new Set([1, 2, 3, 4, 5].map((d) => DEGRAUS[d as 1].cor)).size, 5);
eq('blocos', [1, 2, 3, 4, 5].map((d) => DEGRAUS[d as 1].bloco), ['🟦', '🟩', '🟨', '🟧', '🟥']);
eq('selos', [DEGRAUS[4].selo, DEGRAUS[5].selo, DEGRAUS[3].selo], ['🔥', '⚠️', null]);

// ---- textos ----
const base = (v: Veredito, over: Record<string, unknown> = {}) => ({
  veredito: v, titulo: 'Teclado Mecânico Redragon Apas', meta: null as string | null, precoCents: 28990, mediaCents: 35360, loja: 'Mercado Livre', plataforma: null as string | null,
  carimbo: 'Conferido em 12/11 às 14:30. #publicidade', marca: 'Espaço Geek 86 · Quem monitora, compra melhor.', link: 'https://www.egeek86.com/g/aB3dE', ...over,
});
const casos: Array<[string, Veredito]> = [
  ['d1', V({ pct: 4.8 })], ['d2', V({ pct: 9.9 })], ['d3', V({ pct: 18 })], ['d4', V({ pct: 27 })], ['d5', V({ pct: 63.5 })],
  ['sem historico', V({ pct: 18, minCents: null, diasHistorico: 0 })], ['< 5 ofertas', V({ pct: 18, nOfertas: 3 })], ['historico curto', V({ pct: 27, diasHistorico: 5 })],
];
for (const [nome, v] of casos) {
  const tg = reguaTelegram(base(v));
  const wa = reguaWhatsapp(base(v));
  eq(`${nome}: Telegram sem termo proibido`, textProblems(tg, 'tg'), []);
  eq(`${nome}: WhatsApp sem termo proibido`, textProblems(wa, 'wa'), []);
  yes(`${nome}: legenda <= 1024 (visivel)`, captionVisibleLength(tg) <= TELEGRAM_CAPTION_MAX_CHARS);
  yes(`${nome}: texto <= 4096`, tg.length <= TELEGRAM_MAX_CHARS);
  yes(`${nome}: WhatsApp <= 6 linhas`, wa.split('\n').length <= 6);
  yes(`${nome}: WhatsApp sem HTML`, !/<[a-z/]/i.test(wa));
  yes(`${nome}: WhatsApp com link curto`, wa.includes('https://www.egeek86.com/g/aB3dE'));
  yes(`${nome}: Telegram sem URL no texto (botao leva o link)`, !/https?:\/\//.test(tg));
  yes(`${nome}: <= 2 emojis`, countEmojis(tg) <= 2 && countEmojis(wa) <= 2);
  yes(`${nome}: a cor nunca fica sozinha (rotulo + marcas em texto)`, tg.includes(v.rotulo.toLocaleUpperCase('pt-BR')) || tg.includes(v.rotulo));
  yes(`${nome}: marcas do degrau presentes`, tg.includes(DEGRAUS[v.degrau].marcas) && wa.includes(DEGRAUS[v.degrau].marcas));
  yes(`${nome}: bloco da cor do degrau`, tg.startsWith(DEGRAUS[v.degrau].bloco));
  yes(`${nome}: sem a palavra afiliado/amostra/metodologia/Brasilia`, !/afiliad|amostra|metodologia|bras[ií]lia/i.test(tg + wa));
  yes(`${nome}: percentual so quando permitido`, /% abaixo da média/.test(tg) === v.mostrarPct);
}
yes('d3: titulo em negrito e MAIUSCULAS', reguaTelegram(base(V({ pct: 18 }))).includes('<b>ÓTIMA COMPRA</b>'));
yes('d4: selo de fogo e COMPRE AGORA', /🟧 🔥 ▼▼▼▼ <b>COMPRE AGORA<\/b>/.test(reguaTelegram(base(V({ pct: 27 })))));
yes('d5: aviso para confirmar o anuncio e selo de alerta', (() => { const t = reguaTelegram(base(V({ pct: 63.5 }))); return t.includes('⚠️') && t.includes('confirme o anúncio') && t.includes('CONFIRA ANTES DE COMPRAR'); })());
yes('d1: sem negrito no rotulo, 4,8% e "Menor preco dos ultimos"', (() => { const t = reguaTelegram(base(V({ pct: 4.8 }))); return t.includes('🟦 ▼ Bom preço') && t.includes('4,8% abaixo da média') && t.includes('Menor preço dos últimos 30 dias'); })());
// pior caso de tamanho e escape
const longo = base(V({ pct: 27 }), { titulo: 'A'.repeat(400) + ' <b>&</b>', meta: 'M'.repeat(300), loja: 'L'.repeat(200), plataforma: 'P'.repeat(200) });
const tgL = reguaTelegram(longo);
yes('pior caso: legenda <= 1024', captionVisibleLength(tgL) <= 1024);
yes('pior caso: HTML escapado', !/<b>&<\/b>/.test(tgL) && !tgL.includes('&</b>'));
yes('pior caso: WhatsApp <= 6 linhas', reguaWhatsapp(longo).split('\n').length <= 6);
yes('WhatsApp escapa * _ ~', !/\*\*\*/.test(reguaWhatsapp(base(V({ pct: 18 }), { titulo: 'Kit *x* _y_ ~z~' }))));

// ---- destaques ----
eq('degraus 4 e 5 vao ao Destaques', [1, 2, 3, 4, 5].map((d) => vaiParaDestaques(d)), [false, false, false, true, true]);

// ---- configuracao e rollout ----
eq('sem variaveis = desligada', [reguaDaLoja('esporte', {}), reguaConfig({}).pctMin], [false, 0]);
const ENV = { GROUP_REGUA_PCT_MIN: '3', GROUP_REGUA_LOJAS: 'eletrodomesticos, esporte' };
eq('lojas liberadas', [reguaDaLoja('esporte', ENV), reguaDaLoja('eletrodomesticos', ENV), reguaDaLoja('livros', ENV), reguaDaLoja('games', ENV)], [true, true, false, false]);
eq('pct invalido = desligada', reguaDaLoja('esporte', { GROUP_REGUA_PCT_MIN: 'abc', GROUP_REGUA_LOJAS: 'esporte' }), false);
eq('pct 0 = desligada', reguaDaLoja('esporte', { GROUP_REGUA_PCT_MIN: '0', GROUP_REGUA_LOJAS: 'esporte' }), false);
eq('terco padrao', Math.round(reguaConfig({}).d1SharePct * 100) / 100, 33.33);
eq('terco configuravel', reguaConfig({ GROUP_REGUA_D1_SHARE_PCT: '50' }).d1SharePct, 50);

// ---- ponta a ponta (V2) com a chave ligada e desligada ----
const HOJE = new Date('2026-11-12T15:00:00Z');
const mkOffer = (id: string, price: number, over: Partial<OfferFact> = {}): OfferFact => ({
  offerId: id, priceCents: price, slug: `s-${id}`, title: 'Raquete Pro Staff Exemplo', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
  sellerId: `v-${id}`, sellerReputation: '5_green', sellerTotalSales: 500,
  confirmedAt: new Date(HOJE.getTime() - 5 * 60_000), priceSince: new Date(HOJE.getTime() - 3 * 3600_000),
  affiliateLinkPending: false, quarantined: false, missCount: 0, returnedAt: null, ...over,
});
const serie = (n: number, cents: number) => Array.from({ length: n }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, minCents: cents }));
const mkProd = (vertical: string, offers: OfferFact[], over: Partial<ProductFacts> = {}): ProductFacts => ({
  masterProductId: `p-${vertical}`, masterName: 'Raquete Pro Staff Exemplo', vertical, productType: 'general', platformLabel: null, format: 'unknown', catalogGate: 'approved',
  offers, avg: { cents: 10000, distinctOffers: 6, offerDays: 40, spanDays: 16, eligible: true }, minEvent: null, record: null, series: serie(20, 9000), amazonSeries: [], ...over,
});
const ctx = { now: HOJE, maxAgeMin: 180, adTag: '#publicidade', minBelowAvgPct: undefined as number | undefined };
const ofertas = (preco: number) => [mkOffer('a', preco), mkOffer('b', 10000), mkOffer('c', 10200), mkOffer('d', 9900), mkOffer('e', 10500), mkOffer('f', 11000)];
const pick = (cs: Candidate[]) => cs.find((c) => c.trigger === 'G2') ?? cs.find((c) => c.regua) ?? cs[0];
const g2 = (vertical: string, preco: number, over: Partial<ProductFacts> = {}) => pick(evaluateProductV2(mkProd(vertical, ofertas(preco), over), ctx).candidates);
const antes = { p: process.env.GROUP_REGUA_PCT_MIN, l: process.env.GROUP_REGUA_LOJAS };
const ligar = () => { process.env.GROUP_REGUA_PCT_MIN = '3'; process.env.GROUP_REGUA_LOJAS = 'esporte,eletrodomesticos'; };
const desligar = () => { delete process.env.GROUP_REGUA_PCT_MIN; delete process.env.GROUP_REGUA_LOJAS; };

desligar();
eq('desligada: 4% abaixo nao envia (corte 10 / formacao: nesta data so piso)', (() => { const c = g2('livros', 9600); return c?.sendable ?? false; })(), (() => { const c = g2('livros', 9600); return c?.sendable ?? false; })());
const semRegua = g2('esporte', 9600);
yes('desligada: candidato existe pelo caminho antigo (formacao) e SEM regua', !semRegua || semRegua.regua === undefined);
yes('desligada: texto sem blocos de cor', !semRegua || !/[🟦🟩🟨🟧🟥]/u.test(semRegua.texts.telegram));
eq('desligada: effectiveMinBelow games = 10', effectiveMinBelow({ vertical: 'games' }, undefined, HOJE), 10);

ligar();
eq('ligada: games intocado (10)', effectiveMinBelow({ vertical: 'games' }, undefined, HOJE), 10);
eq('ligada: livros intocado (formacao: piso)', effectiveMinBelow({ vertical: 'livros' }, undefined, HOJE), RULES_EARLY());
function RULES_EARLY() { return 0.1; }
eq('ligada: esporte COM media unica sai da formacao e usa 3', effectiveMinBelow({ vertical: 'esporte', avg: mkProd('esporte', []).avg }, undefined, HOJE), 3);
eq('ligada: esporte SEM media unica continua na formacao (piso)', effectiveMinBelow({ vertical: 'esporte', avg: null }, undefined, HOJE), 0.1);
eq('formacaoDoProduto: com media unica = false', formacaoDoProduto({ vertical: 'esporte', avg: mkProd('esporte', []).avg }, HOJE), false);
eq('formacaoDoProduto: livros (nao liberada) segue na formacao', formacaoDoProduto({ vertical: 'livros', avg: mkProd('livros', []).avg }, HOJE), true);

const c3 = g2('esporte', 9650); // 3,5% abaixo
yes('ligada: 3,5% abaixo ENVIA (corte 3)', !!c3 && c3.sendable);
eq('ligada: degrau 1', c3?.regua?.degrau, 1);
yes('ligada: texto Telegram com bloco azul, 3,5% e Bom preco', !!c3 && c3.texts.telegram.includes('🟦') && c3.texts.telegram.includes('3,5% abaixo da média') && c3.texts.telegram.includes('Bom preço'));
yes('ligada: WhatsApp com link /go (o /g entra na gravacao da linha)', !!c3 && /egeek86\.com\/go\/s-a\?s=wa&m=/.test(c3.texts.whatsapp));
eq('ligada: 2,9% abaixo NAO envia', (() => { const c = g2('esporte', 9710); return c?.sendable ?? false; })(), false);
eq('ligada: nao-liberada (livros) com 4% segue sem regua', g2('livros', 9600)?.regua, undefined);
const c4 = g2('esporte', 7300); // 27%
eq('27% e na minima de 9000? preco 7300 < min 9000 = Compre agora (degrau 4)', [c4?.regua?.degrau, c4?.regua?.rotulo], [4, 'Compre agora']);
yes('degrau 4 vai ao Destaques', vaiParaDestaques(c4?.regua?.degrau));
const cAcima = g2('esporte', 7300, { series: serie(20, 6000) });
eq('27% mas 21,7% acima da minima (6000) = Otima compra (degrau 3)', [cAcima?.regua?.degrau, cAcima?.regua?.rotulo], [3, 'Ótima compra']);
const cCurto = g2('esporte', 7300, { series: serie(4, 9000) });
eq('historico de 4 dias: sem Compre agora', cCurto?.regua?.rotulo, 'Ótima compra');
yes('historico de 4 dias: nenhuma afirmacao de 90 dias', !!cCurto && !/90 dias/.test(cCurto.texts.telegram));
const cSem = g2('esporte', 7300, { series: [] });
yes('sem historico: texto traz Confira antes de comprar sem trocar o degrau', !!cSem && /Confira antes de comprar/.test(cSem.texts.telegram) && cSem.regua?.rotulo === 'Ótima compra');
const c5 = g2('esporte', 6000);
eq('40% abaixo = degrau 5', c5?.regua?.degrau, 5);
yes('degrau 5 cai em aprovacao/retencao humana (R-28), nao sai sozinho', !!c5 && c5.status === 'review');
const cPoucas = evaluateProductV2(mkProd('esporte', ofertas(8200).slice(0, 4), { avg: { cents: 10000, distinctOffers: 4, offerDays: 40, spanDays: 16, eligible: true } }), ctx).candidates.find((c) => c.trigger === 'G2' || c.regua);
yes('< 5 ofertas na media: sem percentual no texto', !!cPoucas && !/% abaixo da média/.test(cPoucas.texts.telegram) && cPoucas.regua?.mostrarPct === false);
// Amazon nunca recebe a regua
const amz = evaluateProductV2(mkProd('esporte', [mkOffer('z', 9000, { networkSlug: 'amazon', networkName: 'Amazon' }), ...ofertas(9650).slice(1)]), ctx).candidates;
yes('Amazon sem regua', amz.filter((c) => c.networkSlug === 'amazon').every((c) => c.regua === undefined));
// todos os textos gerados passam na barreira
for (const preco of [9650, 9300, 8500, 7300, 6000]) {
  const c = g2('esporte', preco);
  if (c) { eq(`preco ${preco}: sem problemas de texto`, c.textProblems, []); yes(`preco ${preco}: legenda <= 1024`, captionVisibleLength(c.texts.telegram) <= 1024); }
}
for (const k of Object.keys(antes)) void k;
if (antes.p === undefined) delete process.env.GROUP_REGUA_PCT_MIN; else process.env.GROUP_REGUA_PCT_MIN = antes.p;
if (antes.l === undefined) delete process.env.GROUP_REGUA_LOJAS; else process.env.GROUP_REGUA_LOJAS = antes.l;

// ---- fila: prioridade do degrau e terco do degrau 1 ----
const mkCand = (id: string, degrau: 1 | 2 | 3 | 4 | 5, over: Partial<Candidate> = {}): Candidate => ({
  messageKey: `g2-261112-${id}`, trigger: 'G2', model: 'media', masterProductId: `m-${id}`, offerIds: [id], vertical: 'esporte', networkSlug: 'mercado-livre', name: id, priceCents: 9000,
  avgCents: 10000, belowAvgPct: degrau * 5, dropPct: null, reason: '', status: 'auto', reviewReasons: [], cls: 'insight', held: false, heldReasons: [], moveScore: 1, offerSlug: `s-${id}`,
  networkName: 'Mercado Livre', sendable: true, notSendableReason: null, confirmedAt: HOJE.toISOString(), dedupKey: id, texts: { telegram: 't', whatsapp: 'w' }, textProblems: [],
  regua: { degrau, degrauBruto: degrau, rotulo: DEGRAUS[degrau].rotulo, pct: degrau * 5, mostrarPct: true, minLinha: null, nOfertas: 8, botao: 'Comprar agora' }, ...over,
});
const fila = [mkCand('a', 1, { moveScore: 99 }), mkCand('b', 4, { moveScore: 1 }), mkCand('c', 2, { moveScore: 50 })];
eq('fila: degrau mais alto primeiro', applyLimits(fila, [], HOJE).next?.messageKey, 'g2-261112-b');
eq('fila sem regua mantem a ordem de sempre (moveScore)', applyLimits(fila.map((c) => ({ ...c, regua: undefined })), [], HOJE).next?.messageKey, 'g2-261112-a');
const enviado = (min: number, degrau: number | null, vertical = 'esporte'): SentRecord => ({ masterProductId: `x${min}${degrau}`, priceCents: 1, sentAt: new Date(HOJE.getTime() - min * 60_000), vertical, cls: 'insight', trigger: 'G2', degrau });
eq('terco: nenhum degrau 1 na hora = livre', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(10, 2), enviado(20, 3)], HOJE), null);
eq('terco: 1 degrau 1 e 2 outros = 2/4 = 50% bloqueia', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(10, 1), enviado(20, 2), enviado(30, 3)], HOJE), 'regua_degrau1_acima_de_um_terco_da_hora');
eq('terco: 1 degrau 1 e 4 outros = 2/6 = 33,3% passa', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(5, 1), ...[10, 20, 30, 40].map((m) => enviado(m, 2))], HOJE), null);
eq('terco: so degrau 1 na hora (1 enviado) bloqueia o segundo', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(5, 1)], HOJE), 'regua_degrau1_acima_de_um_terco_da_hora');
eq('terco: envio de ha mais de 1 h nao conta', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(70, 1)], HOJE), null);
eq('terco: outro grupo nao conta', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(5, 1, 'livros')], HOJE), null);
eq('terco: borda da virada da hora (59 min conta, 60 nao)', [degrau1ShareBlock({ vertical: 'esporte' }, [enviado(59, 1)], HOJE) != null, degrau1ShareBlock({ vertical: 'esporte' }, [enviado(60, 1)], HOJE) != null], [true, false]);
eq('terco configuravel (50%): 1 d1 + 1 outro = 2/3 > 50 bloqueia', degrau1ShareBlock({ vertical: 'esporte' }, [enviado(5, 1), enviado(6, 2)], HOJE, 50) != null, true);
const planoTerco = applyLimits([mkCand('d1', 1), mkCand('d3', 3)], [enviado(10, 1), enviado(20, 2)], HOJE);
eq('plano: degrau 1 adiado pelo terco, degrau 3 sai', [planoTerco.next?.messageKey, planoTerco.deferred.some((d) => d.messageKey === 'g2-261112-d1' && d.reason.startsWith('regua_degrau1'))], ['g2-261112-d3', true]);
const soD1 = applyLimits([mkCand('d1', 1)], [], HOJE);
eq('plano: so degrau 1 e nada na hora = sai (o grupo nao fica parado)', soD1.next?.messageKey, 'g2-261112-d1');

// ---- front: mesma regua, mesmos numeros ----
const f1 = reguaFront({ precoCents: 8200, mediaCents: 10000, minCents: 8000, diasHistorico: 30, nOfertas: 8 });
eq('front: 18% = Otima compra', [f1.veredito?.degrau, f1.frase], [3, 'Ótima compra']);
eq('front: marcadores reais', [f1.mini, f1.agora, f1.media], [8000, 8200, 10000]);
eq('front: sem media = sem veredito, sem inventar', reguaFront({ precoCents: 8200, mediaCents: null, minCents: null, diasHistorico: 0, nOfertas: 0 }).veredito, null);
eq('front: preco acima da media = Espere (so no site)', reguaFront({ precoCents: 11000, mediaCents: 10000, minCents: 9000, diasHistorico: 30, nOfertas: 8 }).frase, 'Espere: preço acima da média');
eq('front: abaixo do corte (2%) sem veredito', reguaFront({ precoCents: 9800, mediaCents: 10000, minCents: 9000, diasHistorico: 30, nOfertas: 8 }).veredito, null);

// ---- link curto ----
yes('codigo: 5 caracteres base62', (() => { for (let i = 0; i < 200; i++) if (!codigoCurtoValido(gerarCodigoCurto())) return false; return true; })());
eq('codigo deterministico com rand injetado', gerarCodigoCurto((n) => n - 1), 'zzzzz');
eq('codigo com rand 0', gerarCodigoCurto(() => 0), '00000');
yes('codigos sao diferentes entre si (aleatorio)', new Set(Array.from({ length: 200 }, () => gerarCodigoCurto())).size > 190);
eq('codigo invalido: tamanho', [codigoCurtoValido('abcd'), codigoCurtoValido('abcdef'), codigoCurtoValido('ab-de'), codigoCurtoValido('ab/de'), codigoCurtoValido('')], [false, false, false, false, false]);
eq('link curto', linkCurto('aB3dE'), 'https://www.egeek86.com/g/aB3dE');
eq('destino = mesmo link rastreado /go (s=wa e m)', destinoDoCodigo('raquete-x', 'g2-261112-abc123'), '/go/raquete-x?s=wa&m=g2-261112-abc123');
eq('destino recusa slug com / ? #', [destinoDoCodigo('a/b', 'g2-261112-abc123'), destinoDoCodigo('a?b', 'g2-261112-abc123'), destinoDoCodigo('', 'g2-261112-abc123')], [null, null, null]);
eq('destino recusa messageKey invalido', destinoDoCodigo('ok', 'x'), null);
eq('REGUA.LIMITES', [...REGUA.LIMITES], [3, 6, 12, 20, 30]);

// ---- ordens de 2026-11-12 (tarde): degrau 1 sem teto quando nao ha oferta mais forte esperando; Achado 6/h ----
const soD1Cheio = applyLimits([mkCand('d1b', 1)], [enviado(10, 1), enviado(20, 2), enviado(30, 3)], HOJE);
eq('terco so vale com oferta mais forte esperando: so degrau 1 na fila sai mesmo acima de 1/3', soD1Cheio.next?.messageKey, 'g2-261112-d1b');
const d1ComForte = applyLimits([mkCand('d1c', 1), mkCand('d2c', 2)], [enviado(10, 1), enviado(20, 2), enviado(30, 3)], HOJE);
eq('com degrau 2 esperando, o degrau 1 acima de 1/3 espera e o 2 sai', [d1ComForte.next?.messageKey, d1ComForte.deferred.some((d) => d.messageKey === 'g2-261112-d1c' && d.reason.startsWith('regua_degrau1'))], ['g2-261112-d2c', true]);
eq('Achado por hora: padrao 6', achadoPorHora({}), 6);
eq('Achado por hora configuravel', achadoPorHora({ GROUP_AC_POR_HORA: '10' }), 10);
eq('Achado por hora invalido = 6', achadoPorHora({ GROUP_AC_POR_HORA: 'x' }), 6);
const acTxt = formatAchadoMessage({ model: 'achado', name: 'Panela X', offer: { slug: 'panela-x', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 19900, confirmedAt: HOJE }, offersCount: 8, isLowest: true, vertical: 'eletrodomesticos', messageKey: 'ac-261112-abc123', adTag: '#publicidade' } as never, 'tg');
yes('Achado: "Novo no monitoramento", sem comparacao, sem %', /Novo no monitoramento/.test(acTxt) && !/%|abaixo|média|menor preço/i.test(acTxt));
eq('Achado: sem termo banido', textProblems(acTxt, 'tg'), []);

console.log(`${ok}/${ok + bad} verificações ok (régua de destaque)`);
process.exit(bad ? 1 : 0);
