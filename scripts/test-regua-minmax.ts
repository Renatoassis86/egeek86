/**
 * R-44 (dono, 2026-11-12; ata 2026-11-12-regua-flexivel-min-max): elegibilidade pelo MENOR PREÇO REGISTRADO (união com o corte de 3%)
 * e linha de MÍNIMO e MÁXIMO registrados nas mensagens. Funções puras, sem banco/rede.
 * Uso: npx tsx scripts/test-regua-minmax.ts
 */
import { evaluateProductV2, detectMovement, type Candidate, type OfferFact, type ProductFacts } from '../src/lib/messaging/group-rules';
import { textProblems } from '../src/lib/messaging/group-messages';
import { calcularVeredito, faixaPreco, faixaTexto, noMenorRegistrado, reguaConfig, reguaFront, reguaTelegram, reguaWhatsapp, type Veredito } from '../src/lib/messaging/regua';
import { captionVisibleLength } from '../src/lib/messaging/telegram-send';

let ok = 0, bad = 0;
const eq = (n: string, a: unknown, b: unknown) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { bad++; console.error('FALHOU', n, JSON.stringify(a), JSON.stringify(b)); } };
const yes = (n: string, c: boolean) => eq(n, c, true);

// ---- configuração ----
eq('padrao: desligado', reguaConfig({}).elegivelMin, false);
eq('on liga', reguaConfig({ GROUP_REGUA_ELEGIVEL_MIN: 'on' }).elegivelMin, true);
eq('off desliga', reguaConfig({ GROUP_REGUA_ELEGIVEL_MIN: 'off' }).elegivelMin, false);
eq('dias da serie padrao 6', reguaConfig({}).elegivelMinDias, 6);
eq('dias da serie configuravel', reguaConfig({ GROUP_REGUA_ELEGIVEL_MIN_DIAS: '10' }).elegivelMinDias, 10);
eq('dias da serie invalido = padrao', reguaConfig({ GROUP_REGUA_ELEGIVEL_MIN_DIAS: 'x' }).elegivelMinDias, 6);
eq('minmax ligado por padrao; off desliga', [reguaConfig({}).minMaxOn, reguaConfig({ GROUP_REGUA_MINMAX: 'off' }).minMaxOn, reguaConfig({ GROUP_REGUA_MINMAX: 'on' }).minMaxOn], [true, false, true]);
eq('dias minmax padrao 7', reguaConfig({}).minMaxDias, 7);
eq('dias minmax configuravel', reguaConfig({ GROUP_REGUA_MINMAX_DIAS: '14' }).minMaxDias, 14);

// ---- noMenorRegistrado / faixaPreco ----
const dia = (i: number) => `2026-10-${String(i + 1).padStart(2, '0')}`;
const serie = (n: number, min: number, max?: number) => Array.from({ length: n }, (_, i) => ({ day: dia(i), minCents: min, ...(max ? { maxCents: max } : {}) }));
// serie com variacao real do menor preco diario (os 3 primeiros dias 12% acima do minimo)
const serieVar = (n: number, min: number, max?: number) => Array.from({ length: n }, (_, i) => ({ day: dia(i), minCents: i < 3 ? Math.round(min * 1.12) : min, ...(max ? { maxCents: max } : {}) }));
eq('no minimo: preco igual ao minimo', noMenorRegistrado(serie(10, 9000), 9000, 6, '2026-11-12').ok, true);
eq('no minimo: preco abaixo do minimo', noMenorRegistrado(serie(10, 9000), 8000, 6, '2026-11-12').ok, true);
eq('no minimo: 1 centavo acima NAO', noMenorRegistrado(serie(10, 9000), 9001, 6, '2026-11-12').ok, false);
eq('no minimo: serie curta (5 dias) NAO', noMenorRegistrado(serie(5, 9000), 8000, 6, '2026-11-12').ok, false);
eq('no minimo: sem serie NAO', noMenorRegistrado([], 8000, 6, '2026-11-12').ok, false);
eq('no minimo: serie nula NAO', noMenorRegistrado(null, 8000, 6).ok, false);
eq('no minimo: o dia de hoje nao conta na serie', noMenorRegistrado([...serie(5, 9000), { day: '2026-11-12', minCents: 7000 }], 8000, 6, '2026-11-12').ok, false);
eq('no minimo: SERIE PLANA (sem variacao) NAO libera, mesmo igual ao minimo', noMenorRegistrado(serie(10, 9000), 9000, 6, '2026-11-12', 5).ok, false);
eq('no minimo: serie com 12% de variacao libera', noMenorRegistrado(serieVar(10, 9000), 9000, 6, '2026-11-12', 5).ok, true);
eq('no minimo: variacao de 2% nao basta para o limite de 5%', noMenorRegistrado([...serie(5, 9000), ...serie(5, 9180)].map((x, i) => ({ ...x, day: dia(i) })), 9000, 6, '2026-11-12', 5).ok, false);
eq('no minimo: amplitude configuravel padrao 5, off em 0', [reguaConfig({}).elegivelMinAmplitudePct, reguaConfig({ GROUP_REGUA_ELEGIVEL_MIN_AMPL_PCT: '0' }).elegivelMinAmplitudePct, reguaConfig({ GROUP_REGUA_ELEGIVEL_MIN_AMPL_PCT: 'x' }).elegivelMinAmplitudePct], [5, 0, 5]);
eq('no minimo: preco zero NAO', noMenorRegistrado(serie(10, 9000), 0, 6).ok, false);

eq('faixa: < 7 dias = omitida', faixaPreco(serie(6, 9000, 12000), 9500), null);
eq('faixa: 7 dias com amplitude real', faixaPreco(serie(7, 9000, 12000), 9500), { minCents: 9000, maxCents: 12000, dias: 7 });
eq('faixa: sem max na serie usa o maior menor-do-dia', faixaPreco([...serie(6, 9000), { day: dia(6), minCents: 9800 }], 9500), { minCents: 9000, maxCents: 9800, dias: 7 });
eq('faixa: o preco de agora entra (e real)', faixaPreco(serie(7, 9000, 12000), 8000), { minCents: 8000, maxCents: 12000, dias: 7 });
eq('faixa: rotulo pelo intervalo de calendario (7 pontos em 42 dias corridos)', faixaPreco([0, 1, 2, 3, 4, 5, 11].map((i) => ({ day: dia(i), minCents: 9000, maxCents: 12000 })), 9500, 7, '2026-11-12')?.dias, 42);
eq('faixa: sem amplitude (min = max) = omitida', faixaPreco(serie(10, 9000), 9000), null);
eq('faixa: janela de 90 dias', faixaPreco(serie(120, 9000, 10000), 9500)?.dias, 90);
eq('faixa: configuravel (14)', faixaPreco(serie(10, 9000, 12000), 9500, 14), null);
eq('faixa: serie nula', faixaPreco(null, 9500), null);
eq('faixa: texto rotulado com a janela', faixaTexto({ minCents: 9000, maxCents: 12000, dias: 30 }), 'Mínimo R$ 90,00 · Máximo R$ 120,00 (últimos 30 dias)');

// ---- veredito via mínima ----
const VM = (o: Partial<Parameters<typeof calcularVeredito>[0]> = {}) => calcularVeredito({ pct: 1, nOfertas: 8, precoCents: 9000, minCents: 9000, diasHistorico: 10, viaMinima: true, ...o }) as Veredito;
eq('sem viaMinima, 1% = null (corte de 3%)', calcularVeredito({ pct: 1, nOfertas: 8, precoCents: 9000, minCents: 9000, diasHistorico: 10 }), null);
eq('viaMinima: degrau 1 Bom preco', [VM().degrau, VM().rotulo], [1, 'Bom preço']);
eq('viaMinima: sem percentual', VM().mostrarPct, false);
eq('viaMinima: preco ACIMA da media (pct negativo) tambem degrau 1', VM({ pct: -3 }).degrau, 1);
eq('viaMinima: linha da minima com a janela medida', VM().minLinha, 'Menor preço dos últimos 10 dias');
eq('viaMinima ignorada quando a queda ja passa de 3%', VM({ pct: 8 }).degrau, 2);
eq('viaMinima com queda >= 3%: percentual volta', VM({ pct: 8 }).mostrarPct, true);

// ---- textos ----
const faixa = { minCents: 9000, maxCents: 12000, dias: 30 };
const T = (v: Veredito, over: Record<string, unknown> = {}) => ({ veredito: v, titulo: 'Smart TV 55 Exemplo', meta: null, precoCents: 9000, mediaCents: 10000, loja: 'Magalu', plataforma: null, carimbo: 'Conferido em 12/11 às 15:00 #publicidade', marca: 'Espaço Geek 86 · slogan', link: 'https://www.egeek86.com/g/aB3dE', faixa, ...over });
const tg = reguaTelegram(T(VM()));
const wa = reguaWhatsapp(T(VM()));
yes('telegram traz minimo e maximo rotulados', tg.includes('Mínimo R$ 90,00 · Máximo R$ 120,00 (últimos 30 dias)'));
yes('whatsapp traz minimo e maximo rotulados', wa.includes('Mínimo R$ 90,00 · Máximo R$ 120,00 (últimos 30 dias)'));
yes('via minima: texto neutro, sem "% abaixo da media"', !/% abaixo da média/.test(tg) && !/% abaixo da média/.test(wa));
yes('via minima: sem % OFF, sem de/por, sem afiliado', !/% ?off|de R\$ .* por R\$|afiliad/i.test(tg + wa));
yes('via minima: diz que e o menor preco', tg.includes('Menor preço dos últimos 10 dias') || tg.includes('Menor preço'));
eq('telegram sem problema de texto', textProblems(tg, 'tg'), []);
eq('whatsapp sem problema de texto', textProblems(wa, 'wa'), []);
yes('sem faixa: a linha some', !/Mínimo R\$/.test(reguaTelegram(T(VM(), { faixa: null }))) && !/Mínimo R\$/.test(reguaWhatsapp(T(VM(), { faixa: null }))));
const longo = T(VM(), { titulo: 'A'.repeat(400), meta: 'M'.repeat(300), loja: 'L'.repeat(200), plataforma: 'P'.repeat(200) });
yes('pior caso: legenda <= 1024 com a faixa', captionVisibleLength(reguaTelegram(longo)) <= 1024);
yes('pior caso: WhatsApp <= 7 linhas', reguaWhatsapp(longo).split('\n').length <= 7);
const v4 = calcularVeredito({ pct: 27, nOfertas: 8, precoCents: 7300, minCents: 7300, diasHistorico: 30 }) as Veredito;
yes('degrau 4 tambem leva a faixa', reguaTelegram(T(v4)).includes('Máximo R$ 120,00'));

// ---- front ----
eq('front: maximo so com amplitude real', [reguaFront({ precoCents: 8200, mediaCents: 10000, minCents: 8000, maxCents: 12000, diasHistorico: 30, nOfertas: 8 }).maxi, reguaFront({ precoCents: 8200, mediaCents: 10000, minCents: 8000, maxCents: 8000, diasHistorico: 30, nOfertas: 8 }).maxi, reguaFront({ precoCents: 8200, mediaCents: 10000, minCents: 8000, diasHistorico: 30, nOfertas: 8 }).maxi], [12000, null, null]);

// ---- detectMovement: preço no mínimo ----
const hist = serieVar(10, 9000);
eq('flag desligada: preco igual ao minimo nao dispara', detectMovement(hist, 9000, '2026-11-12'), []);
eq('flag ligada: preco igual ao minimo = T2 com nearPct 0', detectMovement(hist, 9000, '2026-11-12', { noMinimo: true }).map((h) => [h.kind, h.nearPct]), [['T2', 0]]);
eq('flag ligada: 3% abaixo do minimo (nao chega a OK1) = T2 nearPct 0', detectMovement(hist, 8730, '2026-11-12', { noMinimo: true }).map((h) => [h.kind, h.nearPct]), [['T2', 0]]);
eq('flag ligada: 6% abaixo = OK1, sem T2 extra', detectMovement(hist, 8460, '2026-11-12', { noMinimo: true }).map((h) => h.kind), ['OK1']);
eq('flag ligada: 1% acima do minimo segue T2 normal (nearPct 1)', detectMovement(hist, 9090, '2026-11-12', { noMinimo: true }).map((h) => [h.kind, Math.round((h.nearPct ?? 0) * 10) / 10]), [['T2', 1]]);
eq('flag ligada: serie curta (5 dias) nao dispara', detectMovement(serie(5, 9000), 9000, '2026-11-12', { noMinimo: true }), []);
eq('flag ligada: serie plana nao dispara com amplitude minima de 5%', detectMovement(serie(10, 9000), 9000, '2026-11-12', { noMinimo: true, amplitudeMinPct: 5 }), []);
eq('flag ligada: serie com variacao dispara com amplitude minima de 5%', detectMovement(serieVar(10, 9000), 9000, '2026-11-12', { noMinimo: true, amplitudeMinPct: 5 }).map((h) => h.kind), ['T2']);

// ---- ponta a ponta (V2): gate de 3% + união com o mínimo ----
const HOJE = new Date('2026-11-12T15:00:00Z');
const mkOffer = (id: string, price: number): OfferFact => ({
  offerId: id, priceCents: price, slug: `s-${id}`, title: 'Smart TV 55 Exemplo', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
  sellerId: `v-${id}`, sellerReputation: '5_green', sellerTotalSales: 500,
  confirmedAt: new Date(HOJE.getTime() - 5 * 60_000), priceSince: new Date(HOJE.getTime() - 3 * 3600_000),
  affiliateLinkPending: false, quarantined: false, missCount: 0, returnedAt: null,
});
const mkProd = (vertical: string, offers: OfferFact[], over: Partial<ProductFacts> = {}): ProductFacts => ({
  masterProductId: `p-${vertical}`, masterName: 'Smart TV 55 Exemplo', vertical, productType: 'general', platformLabel: null, format: 'unknown', catalogGate: 'approved',
  offers, avg: { cents: 10000, distinctOffers: 6, offerDays: 40, spanDays: 16, eligible: true }, minEvent: null, record: null, series: serieVar(20, 9950, 12000), amazonSeries: [], ...over,
});
const ctx = { now: HOJE, maxAgeMin: 180, adTag: '#publicidade', minBelowAvgPct: undefined as number | undefined };
const ofertas = (preco: number) => [mkOffer('a', preco), mkOffer('b', 10000), mkOffer('c', 10200), mkOffer('d', 10100), mkOffer('e', 10500), mkOffer('f', 11000)];
const run = (vertical: string, preco: number, over: Partial<ProductFacts> = {}): Candidate[] => evaluateProductV2(mkProd(vertical, ofertas(preco), over), ctx).candidates;
const sendable = (cs: Candidate[]) => cs.find((c) => c.sendable && c.status === 'auto');
const guarda = { p: process.env.GROUP_REGUA_PCT_MIN, l: process.env.GROUP_REGUA_LOJAS, m: process.env.GROUP_REGUA_ELEGIVEL_MIN };
const setEnv = (pct: string | null, lojas: string | null, min: string | null) => {
  for (const [k, v] of [['GROUP_REGUA_PCT_MIN', pct], ['GROUP_REGUA_LOJAS', lojas], ['GROUP_REGUA_ELEGIVEL_MIN', min]] as const) { if (v == null) delete process.env[k]; else process.env[k] = v; }
};

// preco 9800: 2% abaixo da media (10000), abaixo do menor registrado (9950), serie de 20 dias.
setEnv('3', 'esporte', null);
eq('regua ligada, flag desligada: 2% abaixo da media NAO envia', !!sendable(run('esporte', 9800)), false);
setEnv('3', 'esporte', 'on');
const c1 = sendable(run('esporte', 9800));
yes('flag ligada: 2% abaixo da media mas no menor registrado ENVIA', !!c1);
eq('flag ligada: entra no degrau 1 (Bom preco)', c1?.regua?.degrau, 1);
yes('flag ligada: texto neutro (sem percentual, sem desconto)', !!c1 && !/% abaixo da média/.test(c1.texts.telegram) && !/% ?off|afiliad/i.test(c1.texts.telegram + c1.texts.whatsapp));
yes('flag ligada: texto traz o minimo e o maximo', !!c1 && /Mínimo R\$ \d/.test(c1.texts.telegram) && /Máximo R\$ \d/.test(c1.texts.telegram) && /Máximo R\$ \d/.test(c1.texts.whatsapp));
eq('flag ligada: sem problema de texto', c1?.textProblems, []);
yes('flag ligada: marcado como via minima na regua', c1?.regua?.viaMinima === true);
// preco ACIMA do menor registrado: continua barrado
eq('flag ligada: acima do menor registrado (9960 > 9950) NAO envia', !!sendable(run('esporte', 9960)), false);
// serie curta: continua barrado
eq('flag ligada: serie de 4 dias NAO libera', !!sendable(run('esporte', 9800, { series: serieVar(4, 9950, 12000) })), false);
// sem serie: continua barrado
eq('flag ligada: sem serie NAO libera', !!sendable(run('esporte', 9800, { series: [] })), false);
// loja nao liberada na regua (livros): a uniao vale, texto de sempre, sem blocos de cor
setEnv('3', 'esporte', 'on');
const cl = sendable(run('livros', 9800));
yes('loja fora da regua tambem libera pelo minimo, sem blocos de cor', !!cl && cl.regua === undefined && !/[🟦🟩🟨🟧🟥]/u.test(cl.texts.telegram));
// com a flag desligada o comportamento e o de antes (byte a byte nos textos)
setEnv('3', 'esporte', null);
const antes = run('esporte', 9300).map((c) => c.texts.telegram);
setEnv('3', 'esporte', 'on');
const depois = run('esporte', 9300).map((c) => c.texts.telegram);
eq('queda de 7% (ja elegivel): flag ligada nao muda o texto da regua alem da faixa', antes.map((t) => t.replace(/\n\nMínimo R\$[^\n]*/, '')), depois.map((t) => t.replace(/\n\nMínimo R\$[^\n]*/, '')));
setEnv(guarda.p ?? null, guarda.l ?? null, guarda.m ?? null);

console.log(`${ok}/${ok + bad} verificações ok (R-44: menor registrado e mínimo/máximo)`);
process.exit(bad ? 1 : 0);
