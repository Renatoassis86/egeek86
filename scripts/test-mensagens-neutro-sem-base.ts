/**
 * Teste do gatilho N1 'Preço agora' (decisão do dono, 2026-11-13): produto SEM base de preço (sem média elegível) vai em mensagem NEUTRA,
 * atrás da flag GROUP_NEUTRO_SEM_BASE (desligada por padrão). Funções puras: sem banco, sem rede, sem token.
 * Uso: npx tsx scripts/test-mensagens-neutro-sem-base.ts (sai com código 1 se algo falhar).
 * Cobre: flag desligada = nada muda; candidato neutro só SEM média elegível; texto nunca de queda/média/menor preço; filtros de identidade,
 * frescor, link, plataforma, fora de linha; Amazon fora; cota de 1 por hora e 6 por dia por canal; dedup de 24 h.
 */
import {
  RULES,
  applyLimits,
  evaluateProductV2,
  neutroLimites,
  neutroQuotaBlock,
  neutroSemBaseLigado,
  productDedupBlock,
  type Candidate,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '../src/lib/messaging/group-rules';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}

const H = 3600_000;
const MIN = 60_000;
const NOW = new Date('2026-11-12T15:00:00Z'); // 12:00 em Brasília
const AD = '#publicidade';
const base = { now: NOW, maxAgeMin: 180, adTag: AD, amazonMaxAgeMin: 60, amazonPaused: false };
const ctxOff = { ...base, achado: false };
const ctxOn = { ...base, achado: false, neutro: true };

function offer(over: Partial<OfferFact> & { offerId: string; priceCents: number }): OfferFact {
  return {
    slug: `slug-${over.offerId}`, title: 'Smart TV Samsung 50 Crystal UHD 4K', networkSlug: 'mercado-livre', networkName: 'Mercado Livre',
    sellerId: `s-${over.offerId}`, sellerReputation: '5_green', sellerTotalSales: 900,
    confirmedAt: new Date(NOW.getTime() - 10 * MIN), priceSince: new Date(NOW.getTime() - 3 * H),
    affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null, ...over,
  };
}
function prod(over: Partial<ProductFacts> = {}): ProductFacts {
  return {
    masterProductId: 'tv1', masterName: 'Smart TV Samsung 50 Crystal UHD 4K', vertical: 'eletroeletronicos', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
    offers: [offer({ offerId: 'a', priceCents: 280000 })],
    avg: null, minEvent: null, record: null, series: [], amazonSeries: [],
    tipo: 'smart-tv', tipoMedianCents: 280000, tipoSample: 12,
    ...over,
  };
}
const n1 = (r: ReturnType<typeof evaluateProductV2>) => r.candidates.find((c) => c.trigger === 'N1');
const n1Blocked = (r: ReturnType<typeof evaluateProductV2>) => r.blocked.find((b) => b.trigger === 'N1');
const ELIG_AVG = { cents: 330000, distinctOffers: 4, offerDays: 20, spanDays: 15, eligible: true };

// ---------------------------------------------------------------------------
// 1) Flag: desligada por padrão; só on/1/true liga
for (const v of [undefined, '', 'off', '0', 'false', 'ON ', 'sim', 'send'])
  ok(neutroSemBaseLigado({ GROUP_NEUTRO_SEM_BASE: v }) === (v === 'ON '), `flag valor ${JSON.stringify(v)}`);
ok(neutroSemBaseLigado({}) === false, 'flag ausente = desligada');
ok(neutroSemBaseLigado({ GROUP_NEUTRO_SEM_BASE: 'on' }) && neutroSemBaseLigado({ GROUP_NEUTRO_SEM_BASE: '1' }) && neutroSemBaseLigado({ GROUP_NEUTRO_SEM_BASE: 'true' }), 'on/1/true ligam');

// 2) FLAG DESLIGADA = nenhuma mudança: o resultado é idêntico com `neutro` ausente, false, e nunca há N1
const cenarios: ProductFacts[] = [
  prod(),
  prod({ avg: ELIG_AVG, offers: [offer({ offerId: 'a', priceCents: 280000 }), offer({ offerId: 'b', priceCents: 300000 }), offer({ offerId: 'c', priceCents: 310000 })] }),
  prod({ offers: [offer({ offerId: 'a', priceCents: 280000 }), offer({ offerId: 'b', priceCents: 290000 }), offer({ offerId: 'c', priceCents: 300000 })] }),
  prod({ masterProductId: 'g1', vertical: 'games', productType: 'game', platformLabel: 'PS5', tipo: null, tipoMedianCents: null, platMedianCents: 25000, platSample: 20, semMedia: true, offers: [offer({ offerId: 'g', priceCents: 24900, title: 'EA Sports FC 26 PS5' })], masterName: 'EA Sports FC 26 PS5' }),
];
for (const [i, p] of cenarios.entries()) {
  const a = JSON.stringify(evaluateProductV2(p, ctxOff));
  const b = JSON.stringify(evaluateProductV2(p, { ...ctxOff, neutro: false }));
  const c = JSON.stringify(evaluateProductV2(p, { ...base, achado: false, neutro: undefined }));
  ok(a === b && a === c, `flag desligada idêntica (cenário ${i})`);
  ok(!JSON.parse(a).candidates.some((x: Candidate) => x.trigger === 'N1') && !JSON.parse(a).blocked.some((x: { trigger: string }) => x.trigger === 'N1'), `flag desligada não gera nem bloqueia N1 (cenário ${i})`);
}
// com a flag ligada, os candidatos que NÃO são N1 continuam iguais (N1 só acrescenta)
for (const [i, p] of cenarios.entries()) {
  const off = evaluateProductV2(p, ctxOff).candidates.map((c) => JSON.stringify(c));
  const on = evaluateProductV2(p, ctxOn).candidates.filter((c) => c.trigger !== 'N1').map((c) => JSON.stringify(c));
  ok(JSON.stringify(off) === JSON.stringify(on), `flag ligada não altera os outros candidatos (cenário ${i})`);
}

// 3) Candidato neutro SÓ sem média elegível
const r1 = evaluateProductV2(prod(), ctxOn);
const c1 = n1(r1) as Candidate;
ok(!!c1, 'sem média elegível gera N1', r1.blocked);
ok(c1.sendable && c1.status === 'auto' && !c1.held, 'N1 enviável, automático e não retido', c1);
ok(c1.cls === 'insight' && c1.avgCents === null && c1.belowAvgPct === null && c1.dropPct === null, 'N1 sem média, sem % e sem queda');
ok(c1.regua === undefined, 'N1 não carrega régua de degraus');
ok(c1.priceCents === 280000, 'N1 usa o preço lido');
const comMedia = evaluateProductV2(prod({ avg: ELIG_AVG }), ctxOn);
ok(!n1(comMedia), 'COM média elegível não gera N1');
ok(!comMedia.blocked.some((b) => b.trigger === 'N1'), 'COM média elegível nem passa pelo N1 (régua/G1/G2 seguem exclusivos)');
const mediaInelegivel = evaluateProductV2(prod({ avg: { ...ELIG_AVG, eligible: false } }), ctxOn);
ok(!!n1(mediaInelegivel), 'média NÃO elegível (menos de 5 cotações/14 dias) gera N1');

// 4) Texto: neutro, com preço, loja e horário de leitura; nunca queda/média/menor preço/selo
const tg = c1.texts.telegram;
const wa = c1.texts.whatsapp;
const NEG = /%|abaixo|m[eé]dia|menor|queda|caiu|desconto|economi|oferta imperd|bom pre[cç]o|boa compra|compre agora|novo no monitoramento|afiliad|comiss/i;
for (const [canal, t] of [['tg', tg], ['wa', wa]] as const) {
  ok(/Preço agora:/.test(t), `texto ${canal} tem "Preço agora:"`, t);
  ok(/R\$\s?2\.800,00/.test(t), `texto ${canal} tem o preço`, t);
  ok(/Mercado Livre/.test(t), `texto ${canal} tem a loja`, t);
  ok(/lido às 11:50/.test(t), `texto ${canal} tem o horário real da leitura (11:50 de Brasília)`, t);
  ok(!NEG.test(t.replace(/https?:\/\/\S+/g, '')), `texto ${canal} sem queda/média/menor/%/selo`, t);
  ok(textProblems(t, canal === 'tg' ? 'tg' : 'wa').length === 0, `texto ${canal} passa nas barreiras`, textProblems(t, canal === 'tg' ? 'tg' : 'wa'));
}
ok(/#publicidade/.test(tg), 'etiqueta de divulgador presente');

// 5) Filtros: o N1 só sai se o produto passou em TUDO
const bloqueia = (over: Partial<ProductFacts>, motivo: RegExp | null, nome: string) => {
  const r = evaluateProductV2(prod(over), ctxOn);
  ok(!n1(r), `N1 não sai: ${nome}`, r.candidates.map((c) => c.trigger));
  if (motivo) ok(r.blocked.some((b) => motivo.test(b.reasons.join(' '))), `motivo registrado: ${nome}`, r.blocked);
};
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, identidade: 'incerta' })] }, /identidade_incerta|sem_oferta_ml_ou_shopee_valida/, 'identidade incerta');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, confirmedAt: new Date(NOW.getTime() - 5 * H) })] }, null, 'oferta velha (5 h)');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, affiliateLinkPending: true })] }, null, 'link pendente');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, sellerReputation: '1_red' })] }, null, 'vendedor com reputação ruim');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, quarantined: true })] }, null, 'quarentena');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, avgExcluded: true })] }, null, 'fora da média');
bloqueia({ catalogGate: 'review' }, null, 'porteiro em revisão');
bloqueia({ catalogGate: 'rejected' }, null, 'porteiro rejeitado');
bloqueia({ vertical: 'nao-liberada' }, null, 'departamento não liberado');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, priceSince: new Date(NOW.getTime() - 5 * MIN), confirmedAt: new Date(NOW.getTime() - 4 * MIN) })] }, null, 'preço não reconfirmado em 15 min');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 15000 })] }, /fora_da_faixa|abaixo_de|preco_/, 'preço sentinela (0,05x do tipo)');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 900000 })] }, /fora_da_faixa/, 'preço absurdo (3x do tipo)');
bloqueia({ tipo: null, tipoMedianCents: null, tipoSample: 0 }, /sem_referencia_de_plausibilidade/, 'sem nenhuma referência de plausibilidade');
bloqueia({ offers: [offer({ offerId: 'a', priceCents: 280000, networkSlug: 'amazon', networkName: 'Amazon', affiliateUrl: 'https://amzn.to/x' })] }, null, 'Amazon fora do N1');
// games: plataforma desconhecida e fora de linha
const gm = (over: Partial<ProductFacts> = {}) => prod({ masterProductId: 'g1', vertical: 'games', productType: 'game', platformLabel: 'PS5', tipo: null, tipoMedianCents: null, platMedianCents: 25000, platSample: 20, semMedia: true, masterName: 'EA Sports FC 26 PS5', offers: [offer({ offerId: 'g', priceCents: 24900, title: 'EA Sports FC 26 PS5' })], ...over });
ok(!!n1(evaluateProductV2(gm(), ctxOn)), 'games em linha, sem média, dentro da faixa da plataforma: N1 sai');
ok(!n1(evaluateProductV2(gm({ platformLabel: null }), ctxOn)), 'games sem plataforma: sem N1');
ok(!n1(evaluateProductV2(gm({ platformLabel: 'Xbox One' }), ctxOn)), 'games fora de linha (Xbox One): sem N1');
ok(!n1(evaluateProductV2(gm({ offers: [offer({ offerId: 'g', priceCents: 2000, title: 'EA Sports FC 26 PS5' })] }), ctxOn)), 'games com preço sentinela: sem N1');
// outro gatilho enviável do mesmo produto tem prioridade (sem duplicar)
const comAchado = evaluateProductV2(prod(), { ...ctxOn, achado: true });
ok(comAchado.candidates.some((c) => c.trigger === 'AC' && c.sendable) && !n1(comAchado), 'se o Achado já é enviável, o N1 não duplica');

// 6) Cota por canal: 1 por hora e 6 por dia
const rec = (trigger: string, minAgo: number, vertical = 'eletroeletronicos', id = `p${minAgo}`): SentRecord =>
  ({ trigger, cls: 'insight', vertical, masterProductId: id, priceCents: 100000, sentAt: new Date(NOW.getTime() - minAgo * MIN), sound: false, tipo: null } as unknown as SentRecord);
ok(RULES.N1_MAX_PER_HOUR === 1 && RULES.N1_MAX_PER_DAY === 6, 'limites de RULES: 1/h e 6/dia');
ok(neutroQuotaBlock('eletroeletronicos', [], NOW) === null, 'sem histórico: pode');
ok(/n1_maximo_1_por_hora/.test(neutroQuotaBlock('eletroeletronicos', [rec('N1', 30)], NOW) ?? ''), '1 na última hora bloqueia o próximo');
ok(neutroQuotaBlock('eletroeletronicos', [rec('N1', 90)], NOW) === null, 'há mais de 1 h: libera');
ok(neutroQuotaBlock('eletroeletronicos', [rec('N1', 30, 'games')], NOW) === null, 'cota é por canal: outra loja não conta');
ok(neutroQuotaBlock('eletroeletronicos', [rec('AC', 10), rec('G2', 5)], NOW) === null, 'outros gatilhos não consomem a cota do N1');
const seis = [90, 200, 300, 400, 500, 600].map((m) => rec('N1', m));
ok(/n1_cota_diaria_do_canal_6_de_6/.test(neutroQuotaBlock('eletroeletronicos', seis, NOW) ?? ''), '6 em 24 h bloqueia o sétimo');
ok(neutroQuotaBlock('eletroeletronicos', seis.slice(0, 5), NOW) === null, '5 em 24 h ainda libera o sexto');
ok(neutroQuotaBlock('eletroeletronicos', [rec('N1', 25 * 60)], NOW) === null, 'envio de mais de 24 h não conta');
// o ambiente só pode BAIXAR
ok(neutroLimites({ GROUP_N1_POR_HORA: '5', GROUP_N1_POR_DIA: '50' }).porHora === 1 && neutroLimites({ GROUP_N1_POR_DIA: '50' }).porDia === 6, 'ambiente não consegue subir as cotas');
ok(neutroLimites({ GROUP_N1_POR_DIA: '3' }).porDia === 3, 'ambiente pode baixar a cota diária');
ok(neutroLimites({ GROUP_N1_POR_DIA: 'x' }).porDia === 6 && neutroLimites({ GROUP_N1_POR_HORA: '0' }).porHora === 1, 'valor inválido volta ao padrão');
// applyLimits aplica a cota e o dedup de 24 h
const plano1 = applyLimits([c1], [rec('N1', 20)], NOW);
ok(plano1.next === null && plano1.deferred.some((d) => /n1_maximo_1_por_hora/.test(d.reason)), 'applyLimits adia o N1 acima de 1/h', plano1.deferred);
const plano2 = applyLimits([c1], [], NOW);
ok(plano2.next?.trigger === 'N1', 'applyLimits libera o N1 dentro da cota', plano2.deferred);
ok(/produto_ja_enviado|achado_produto_ja_enviado/.test(productDedupBlock(c1, [{ ...rec('N1', 600, 'eletroeletronicos', c1.masterProductId) }], NOW) ?? ''), 'mesmo produto não repete em 24 h');
ok(productDedupBlock(c1, [rec('N1', 25 * 60, 'eletroeletronicos', c1.masterProductId)], NOW) === null, 'depois de 24 h pode repetir');

console.log(fails ? `\n${fails} FALHA(S) em ${total} verificações.` : `\nOK: ${total} verificações do gatilho N1 'Preço agora'.`);
process.exit(fails ? 1 : 0);
