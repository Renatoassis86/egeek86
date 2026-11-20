/**
 * R-107 (dono, 2026-11-20): métricas de decisão de compra (parcelamento, Pix, frete grátis) na mensagem. Funções puras, sem banco/rede.
 * Uso: npx tsx --conditions=react-server scripts/test-metricas-compra.ts
 * Cobre: formatação das 3 linhas (Telegram e WhatsApp), ausência sem prova, janela de frescor por rede, coerência com o preço atual,
 * "sem juros" só provado, Pix só lido e dentro da razão, limites de tamanho (4096 / legenda 1024), teto de emojis, rótulo (nada de frete sem flag).
 */
import { compraLines, formatAchadoMessage, formatOfferMessage, formatPrecoAgoraMessage, countEmojis, MAX_EMOJIS_PER_MESSAGE, TELEGRAM_CAPTION_MAX_CHARS, TELEGRAM_MAX_CHARS, textProblems, type MsgOffer } from '../src/lib/messaging/group-messages';
import { metricasDaLinha, parcelaDoLeitor, parseParcelaTexto, provarMetricas, frescorMetricasMin, type MetricasLinha } from '../src/lib/messaging/metricas-compra';
import { captionVisibleLength } from '../src/lib/messaging/telegram-send';

let ok = 0, bad = 0;
const eq = (n: string, a: unknown, b: unknown) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { bad++; console.error('FALHOU', n, JSON.stringify(a), JSON.stringify(b)); } };
const yes = (n: string, c: boolean) => eq(n, c, true);

const NOW = new Date('2026-11-20T15:00:00Z');
const minAtras = (m: number) => new Date(NOW.getTime() - m * 60_000);
const vazia: MetricasLinha = { installmentsQty: null, installmentCents: null, installmentsNoInterest: null, installmentsSeenAt: null, pixCents: null, pixSeenAt: null, freeShipping: null, shippingSeenAt: null };
const ENV = {} as Record<string, string | undefined>;
const ctx = (amazon: boolean, priceCents: number, env: Record<string, string | undefined> = ENV) => ({ amazon, priceCents, now: NOW, env });

// ---- prova: parcelas ----
const parc = (over: Partial<MetricasLinha>): MetricasLinha => ({ ...vazia, installmentsQty: 7, installmentCents: 5513, installmentsNoInterest: true, installmentsSeenAt: minAtras(10), ...over });
let m = provarMetricas(parc({}), ctx(false, 38590));
eq('7x 55,13 = 385,91 fecha com 385,90 (sem juros provado)', m?.parcelas, { qty: 7, cents: 5513, semJuros: true });
m = provarMetricas(parc({ installmentsNoInterest: false }), ctx(false, 38590));
eq('texto sem "sem juros": mostra parcelas, nunca sem juros', m?.parcelas?.semJuros, false);
m = provarMetricas(parc({ installmentsNoInterest: null }), ctx(false, 38590));
eq('sem informação de juros: não afirma sem juros', m?.parcelas?.semJuros, false);
m = provarMetricas(parc({}), ctx(false, 30000));
eq('preço atual caiu (total 1,29x): parcela segue coerente, mas "sem juros" some', m?.parcelas?.semJuros, false);
m = provarMetricas(parc({}), ctx(false, 90000));
eq('parcela de outro preço (total abaixo do atual) é descartada', m, null);
m = provarMetricas(parc({ installmentsQty: 1 }), ctx(false, 5513));
eq('1x não é parcelamento', m, null);
m = provarMetricas(parc({ installmentsQty: 30 }), ctx(false, 165390));
eq('30x fora da faixa 2..24', m, null);
m = provarMetricas(parc({ installmentsQty: 10, installmentCents: 84591, installmentsNoInterest: false }), ctx(false, 84591 * 10));
eq('10x com total = preço mas texto sem "sem juros": não afirma sem juros', m?.parcelas?.semJuros, false);
m = provarMetricas(parc({ installmentsSeenAt: minAtras(70) }), ctx(true, 38590));
eq('parcela da Amazon lida há 70 min: fora da janela de 60 min', m, null);

// ---- prova: Pix ----
const pix = (over: Partial<MetricasLinha>): MetricasLinha => ({ ...vazia, pixCents: 35889, pixSeenAt: minAtras(5), ...over });
m = provarMetricas(pix({}), ctx(true, 38590));
eq('Pix lido (93%) sobre o cheio, leitura de 5 min na Amazon', m?.pixCents, 35889);
m = provarMetricas(pix({ pixSeenAt: minAtras(70) }), ctx(true, 38590));
eq('Pix da Amazon com 70 min: fora da janela de 60 min', m, null);
m = provarMetricas(pix({ pixSeenAt: minAtras(50) }), ctx(false, 38590));
eq('Pix de outra rede com 50 min: dentro de 12 h', m?.pixCents, 35889);
m = provarMetricas(pix({ pixCents: 20000 }), ctx(false, 38590));
eq('Pix a 52% do preço: implausível, descartado', m, null);
m = provarMetricas(pix({ pixCents: 38590 }), ctx(false, 38590));
eq('Pix igual ao preço não informa nada', m, null);
m = provarMetricas(pix({ pixCents: 36000 }), ctx(false, 33000));
eq('preço caiu abaixo do Pix gravado: descartado', m, null);
m = provarMetricas(pix({ pixSeenAt: null }), ctx(false, 38590));
eq('Pix sem data de leitura: sem prova', m, null);

// ---- prova: frete ----
const fr = (over: Partial<MetricasLinha>): MetricasLinha => ({ ...vazia, freeShipping: true, shippingSeenAt: minAtras(30), ...over });
m = provarMetricas(fr({ shippingSeenAt: minAtras(60) }), ctx(false, 10000));
eq('frete grátis ML lido há 1 h', m?.freteGratis, true);
m = provarMetricas(fr({ shippingSeenAt: minAtras(13 * 60) }), ctx(false, 10000));
eq('frete lido há 13 h: fora da janela de 12 h', m, null);
m = provarMetricas(fr({ shippingSeenAt: minAtras(70) }), ctx(true, 10000));
eq('frete da Amazon lido há 60 min: fora dos 45 min', m, null);
m = provarMetricas(fr({}), ctx(true, 10000));
eq('frete da Amazon lido há 30 min: vale', m?.freteGratis, true);
m = provarMetricas(fr({ freeShipping: false }), ctx(false, 10000));
eq('flag false: nada aparece', m, null);
m = provarMetricas(fr({ freeShipping: null }), ctx(false, 10000));
eq('flag nula: nada aparece', m, null);
m = provarMetricas(fr({ shippingSeenAt: new Date(NOW.getTime() + 3600_000) }), ctx(false, 10000));
eq('leitura do futuro: recusada', m, null);
eq('sem linha: null', provarMetricas(null, ctx(false, 10000)), null);
eq('METRICAS_COMPRA=off desliga tudo', provarMetricas(fr({}), ctx(false, 10000, { METRICAS_COMPRA: 'off' })), null);
eq('frescor padrão: Amazon 60 (a do preço, R-101), demais 720 min', [frescorMetricasMin(true, ENV), frescorMetricasMin(false, ENV)], [60, 720]);
eq('frescor da Amazon segue AMAZON_FRESCOR_MIN', frescorMetricasMin(true, { AMAZON_FRESCOR_MIN: '30' }), 30);

// ---- linha crua do banco ----
const cru = metricasDaLinha({ installments_qty: 7, installment_cents: '5513', installments_no_interest: true, installments_seen_at: '2026-11-20T14:50:00Z', pix_cents: null, free_shipping: true, shipping_seen_at: new Date('2026-11-20T14:00:00Z') });
eq('linha crua: números, booleanos e datas', [cru.installmentsQty, cru.installmentCents, cru.installmentsNoInterest, cru.pixCents, cru.freeShipping], [7, 5513, true, null, true]);
eq('linha sem as colunas (migração não aplicada): nada aparece', provarMetricas(metricasDaLinha({}), ctx(false, 10000)), null);

// ---- leitura do texto/leitor ----
eq('texto "em até 12x de R$ 793,32"', parseParcelaTexto('em até 12x de R$ 793,32'), { qty: 12, cents: 79332, semJuros: false });
eq('texto com sem juros e milhar', parseParcelaTexto('10x de R$ 1.845,91 sem juros'), { qty: 10, cents: 184591, semJuros: true });
eq('texto sem parcela: null', parseParcelaTexto('Frete grátis'), null);
eq('leitor: par válido', parcelaDoLeitor({ n: 7, c: 5513, sj: 1 }), { qty: 7, cents: 5513, semJuros: true });
eq('leitor: par com n=1', parcelaDoLeitor({ n: 1, c: 5513 }), null);
eq('leitor: par com valor fracionado', parcelaDoLeitor({ n: 7, c: 55.13 }), null);
eq('leitor: par lixo', parcelaDoLeitor('7x'), null);

// ---- mensagem ----
const AD = '#publicidade';
const base = (compra: MsgOffer['compra'], over: Partial<MsgOffer> = {}): MsgOffer => ({ slug: 'x', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 38590, confirmedAt: NOW, affiliateUrl: 'https://meli.la/abc', compra, ...over });
const msg = (o: MsgOffer, ch: 'tg' | 'wa') => formatOfferMessage({ model: 'media', vertical: 'games', messageKey: 'g2-261120-abc123', adTag: AD, name: 'Jogo X', offer: o, avg: { cents: 45000, offers: 6 }, seriesDays: 9 }, ch);
const all = { parcelas: { qty: 7, cents: 5513, semJuros: true }, pixCents: 35889, freteGratis: true as const };
const tg = msg(base(all), 'tg');
yes('Telegram: linha de parcelas com sem juros provado', tg.includes('💳 <b>R$ 385,90</b> em até 7x de R$ 55,13 sem juros'));
yes('Telegram: linha do Pix com valor lido', tg.includes('⚡ <b>R$ 358,89</b> no Pix'));
yes('Telegram: linha de frete', tg.includes('🚚 Frete grátis'));
yes('ordem: preço, parcelas, Pix, frete', tg.indexOf('R$ 385,90') < tg.indexOf('💳') && tg.indexOf('💳') < tg.indexOf('⚡') && tg.indexOf('⚡') < tg.indexOf('🚚'));
const wa = msg(base(all), 'wa');
yes('WhatsApp: mesmas 3 linhas, sem HTML', wa.includes('💳 *R$ 385,90* em até 7x de R$ 55,13 sem juros') && wa.includes('⚡ *R$ 358,89* no Pix') && wa.includes('🚚 Frete grátis') && !/<b>/.test(wa));
yes('mensagem sem prova: nenhuma das 3 linhas e nenhum placeholder', !/💳|⚡|🚚|Pix|parcel/i.test(msg(base(null), 'tg')));
const so = msg(base({ pixCents: 35889 }), 'tg');
yes('só Pix provado: só a linha do Pix', so.includes('⚡') && !so.includes('💳') && !so.includes('🚚'));
const cj = msg(base({ parcelas: { qty: 12, cents: 35000, semJuros: false } }), 'tg');
yes('parcelas com juros: "em até 12x de R$ 350,00" sem afirmar sem juros', cj.includes('💳 em até 12x de R$ 350,00') && !/sem juros/i.test(cj));
const dup = msg(base({ freteGratis: true }, { freeShipping: true }), 'tg');
yes('frete não duplica com o selo antigo', !/Frete:/.test(dup) && dup.includes('🚚 Frete grátis'));
yes('selo antigo continua sem a métrica nova', msg(base(null, { freeShipping: true }), 'tg').includes('Frete:'));
yes('emojis das métricas não estouram o teto de 2', countEmojis(tg) <= MAX_EMOJIS_PER_MESSAGE);
const puro = { b: (s: string) => s, t: (s: string) => s, link: (u: string) => u };
eq('linhas puras: 3 linhas', compraLines(base(all), puro).length, 3);
yes('tamanhos: Telegram < 4096 e legenda < 1024', tg.length < TELEGRAM_MAX_CHARS && captionVisibleLength(tg) < TELEGRAM_CAPTION_MAX_CHARS);
eq('textProblems limpo', textProblems(tg, 'tg'), []);
const amz = formatOfferMessage({ model: 'media', vertical: 'games', messageKey: 'g2-261120-abc123', adTag: AD, name: 'Console', offer: base({ pixCents: 35889, freteGratis: true }, { networkSlug: 'amazon', networkName: 'Amazon', storeName: 'Amazon', affiliateUrl: 'https://www.amazon.com.br/dp/B0TESTE123?tag=x-20' }), avg: { cents: 45000, offers: 6, scope: 'market' }, seriesDays: 9 } as never, 'tg');
yes('Amazon: carimbo mantido e métricas presentes', /Preço na Amazon em \d{2}\/\d{2} às \d{2}:\d{2}/.test(amz) && amz.includes('⚡') && amz.includes('🚚'));
eq('Amazon: sem problema de texto', textProblems(amz, 'tg'), []);
const ach = formatAchadoMessage({ model: 'achado', vertical: 'games', messageKey: 'g2-261120-abc123', adTag: AD, name: 'Jogo X', offer: base({ freteGratis: true }), offersCount: 6 } as never, 'tg');
yes('achado (outra rede): métrica presente', ach.includes('🚚 Frete grátis'));
const pa = formatPrecoAgoraMessage({ model: 'preco-agora', vertical: 'games', messageKey: 'g2-261120-abc123', adTag: AD, name: 'Jogo X', offer: base({ freteGratis: true }) } as never, 'tg');
yes('preço agora: métrica logo abaixo do preço', pa.includes('🚚 Frete grátis'));
yes('valores só numéricos: nada de HTML vindo do dado', !/[<>]/.test(compraLines(base({ parcelas: { qty: 7, cents: 5513, semJuros: true }, pixCents: 35889 }), puro).join('')));

console.log(`${ok} ok, ${bad} falhas`);
process.exit(bad ? 1 : 0);
