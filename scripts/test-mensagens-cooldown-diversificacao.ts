/**
 * Teste da R-47 (ata 2026-11-13-diversificacao-e-repeticao): cooldown unico por produto entre TODOS os gatilhos e cota por tipo tambem para alerta G2/OK2.
 * Funcoes puras: sem banco, sem rede. Uso: npx tsx scripts/test-mensagens-cooldown-diversificacao.ts (sai com codigo 1 se algo falhar).
 * Os valores sao entradas de teste de funcoes puras (nenhum dado e gravado nem exibido ao cliente).
 */
import {
  RULES,
  applyLimits,
  evaluateProductV2,
  masterCooldownBlock,
  masterCooldownHours,
  tipoCotaAlertaOn,
  tipoHourCount,
  tipoPorHora,
  type Candidate,
  type OfferFact,
  type ProductFacts,
  type SentRecord,
} from '../src/lib/messaging/group-rules';

let fails = 0;
let total = 0;
function ok(cond: boolean, name: string, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, extra ?? '');
  }
}
const MIN = 60_000;
const NOW = new Date('2026-11-12T15:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * MIN);
const rec = (over: Partial<SentRecord> & { sentAt: Date }): SentRecord => ({ masterProductId: 'm1', priceCents: 27465, trigger: 'G2', cls: 'alerta', vertical: 'games', tipo: null, ...over });
const base = { masterProductId: 'm1', priceCents: 27465, trigger: 'G2' as const, offerIds: ['o1'], couponRef: undefined, cls: 'alerta' as const };

// 1) Padroes e flags
ok(masterCooldownHours({}) === RULES.MASTER_COOLDOWN_H && RULES.MASTER_COOLDOWN_H === 8, 'padrao do cooldown = 8 h');
ok(masterCooldownHours({ GROUP_MASTER_COOLDOWN_H: '0' }) === 0 && masterCooldownHours({ GROUP_MASTER_COOLDOWN_H: 'off' }) === 0, 'GROUP_MASTER_COOLDOWN_H=0/off desliga');
ok(masterCooldownHours({ GROUP_MASTER_COOLDOWN_H: '12' }) === 12 && masterCooldownHours({ GROUP_MASTER_COOLDOWN_H: 'lixo' }) === 8, 'valor valido vale; lixo cai no padrao');
ok(tipoCotaAlertaOn({}) && !tipoCotaAlertaOn({ GROUP_TIPO_COTA_ALERTA: 'off' }), 'GROUP_TIPO_COTA_ALERTA=off desliga a cota para alerta');
ok(tipoPorHora({}) === 2 && tipoPorHora({ GROUP_TIPO_POR_HORA: '0' }) === 0 && tipoPorHora({ GROUP_TIPO_POR_HORA: '3' }) === 3, 'GROUP_TIPO_POR_HORA: padrao 2, 0 desliga, 3 vale');

// 2) O incidente: CUPOM e depois preco (G2) do mesmo master em minutos
const cupomEnviado = rec({ trigger: 'CUPOM', cls: 'cupom', sentAt: ago(12), couponOfferId: 'o1' });
ok(masterCooldownBlock({ ...base }, [cupomEnviado], NOW)?.startsWith('produto_em_cooldown_8h') === true, 'INCIDENTE: G2 do mesmo master 12 min depois de um CUPOM e barrado');
ok(masterCooldownBlock({ ...base, trigger: 'OK2' }, [cupomEnviado], NOW) != null && masterCooldownBlock({ ...base, trigger: 'AC' }, [cupomEnviado], NOW) != null, 'qualquer gatilho de preco (OK2, AC) tambem');
const precoEnviado = rec({ trigger: 'G2', sentAt: ago(30), couponOfferId: 'o1' });
const cupomC = { ...base, trigger: 'CUPOM' as const, couponRef: 'o1', cls: 'cupom' as const };
ok(masterCooldownBlock(cupomC, [precoEnviado], NOW) != null, 'CUPOM logo depois de preco que JA levou o mesmo cupom e barrado (uma mensagem so)');
ok(masterCooldownBlock(cupomC, [{ ...precoEnviado, couponOfferId: null }], NOW) != null, 'cupom novo a menos de 60 min do envio anterior: ainda barra');
ok(masterCooldownBlock(cupomC, [{ ...precoEnviado, couponOfferId: null, sentAt: ago(90) }], NOW) == null, 'cupom NOVO (nao divulgado antes) depois de 60 min libera: nao perde o cupom');
ok(masterCooldownBlock(cupomC, [{ ...precoEnviado, sentAt: ago(90) }], NOW) != null, 'cupom JA divulgado na mensagem de preco nao repete mesmo depois de 90 min');

// 3) Janela, G2>G2 (1.596 repeticoes em 24 h), borda
ok(masterCooldownBlock({ ...base }, [rec({ sentAt: ago(61) })], NOW) != null, 'G2>G2 61 min depois (antes liberava) agora barra');
ok(masterCooldownBlock({ ...base }, [rec({ sentAt: ago(7 * 60 + 59) })], NOW) != null, '7 h 59 min barra');
ok(masterCooldownBlock({ ...base }, [rec({ sentAt: ago(8 * 60 + 1) })], NOW) == null, '8 h 01 min libera');
ok(masterCooldownBlock({ ...base }, [rec({ masterProductId: 'outro', sentAt: ago(5) })], NOW) == null, 'outro master nao conta');
ok(masterCooldownBlock({ ...base }, [rec({ sentAt: ago(5) })], NOW, 0) == null, 'horas=0 (flag off) nao barra nada');
ok(masterCooldownBlock({ ...base }, [rec({ sentAt: ago(10 * 60) })], NOW, 12) != null, 'com 12 h, 10 h depois ainda barra');
ok(masterCooldownBlock({ ...base, trigger: 'RADAR' }, [rec({ sentAt: ago(5) })], NOW) == null && masterCooldownBlock({ ...base, trigger: 'G4' }, [rec({ sentAt: ago(5) })], NOW) == null, 'radar composto e resumo ficam fora');
ok(masterCooldownBlock({ ...base, cls: 'plataforma' }, [rec({ sentAt: ago(5) })], NOW) == null, 'plataforma fica fora');
ok(masterCooldownBlock({ ...base }, [rec({ sentAt: ago(5), itemOnly: true, trigger: 'RADAR', cls: 'radar' })], NOW) != null, 'item que apareceu num radar conta como ja divulgado');

// 4) Excecoes por mudanca material (contra o ULTIMO envio)
ok(masterCooldownBlock({ ...base, priceCents: 25000 }, [rec({ sentAt: ago(180) })], NOW) == null, 'queda adicional de 8,9% depois de 3 h libera');
ok(masterCooldownBlock({ ...base, priceCents: 25000 }, [rec({ sentAt: ago(90) })], NOW) != null, 'queda adicional dentro de 2 h ainda barra');
ok(masterCooldownBlock({ ...base, priceCents: 27000 }, [rec({ sentAt: ago(180) })], NOW) != null, 'queda de 1,7% (< 5%) nao basta');
ok(masterCooldownBlock({ ...base, regua: { degrau: 3 } as Candidate['regua'] }, [rec({ sentAt: ago(180), degrau: 2 })], NOW) == null, 'degrau mais forte (3 > 2) depois de 3 h libera');
ok(masterCooldownBlock({ ...base, regua: { degrau: 2 } as Candidate['regua'] }, [rec({ sentAt: ago(180), degrau: 2 })], NOW) != null, 'mesmo degrau nao basta');
ok(masterCooldownBlock({ ...base, regua: { degrau: 3 } as Candidate['regua'] }, [rec({ sentAt: ago(60), degrau: 2 })], NOW) != null, 'degrau mais forte antes de 2 h barra');

// 4b) Novo minimo (G1/OK1) mantem a excecao de 30 min, agora exigindo a queda minima
ok(masterCooldownBlock({ ...base, trigger: 'OK1', priceCents: 25000 }, [rec({ sentAt: ago(31) })], NOW) == null, 'OK1 com 8,9% menos depois de 31 min libera (excecao antiga mantida)');
ok(masterCooldownBlock({ ...base, trigger: 'OK1', priceCents: 27000 }, [rec({ sentAt: ago(31) })], NOW) != null, 'OK1 com queda < 5% nao libera');
ok(masterCooldownBlock({ ...base, trigger: 'G2', priceCents: 25000 }, [rec({ sentAt: ago(31) })], NOW) != null, 'G2 (nao e novo minimo) com 31 min segue barrado');

// 5) Integracao no plano (applyLimits) e envio manual
const offer: OfferFact = {
  offerId: 'a', priceCents: 280000, slug: 's', title: 'Soundbar JBL', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', sellerId: 's1', sellerReputation: '5_green', sellerTotalSales: 900,
  confirmedAt: ago(10), priceSince: ago(180), affiliateLinkPending: false, officialLink: true, affiliateUrl: 'https://meli.la/AbCd123', quarantined: false, missCount: 0, returnedAt: null,
};
const facts: ProductFacts = {
  masterProductId: 'sb1', masterName: 'Soundbar JBL Cinema', vertical: 'eletroeletronicos', productType: 'product', platformLabel: null, format: 'unknown', catalogGate: 'approved',
  offers: [offer], avg: null, minEvent: null, record: null, series: [], amazonSeries: [], tipo: 'soundbar', tipoMedianCents: 280000, tipoSample: 12,
};
const c0 = evaluateProductV2(facts, { now: NOW, maxAgeMin: 180, adTag: '#publicidade', amazonMaxAgeMin: 60, amazonPaused: false, achado: true }).candidates.find((c) => c.trigger === 'AC') as Candidate;
const mk = (over: Partial<Candidate>): Candidate => ({ ...c0, ...over, messageKey: over.messageKey ?? `k-${over.masterProductId}-${over.trigger}`, dedupKey: over.dedupKey ?? `${over.masterProductId}:${over.trigger}:w` });
const g2 = mk({ masterProductId: 'sb1', trigger: 'G2', cls: 'alerta', tipo: 'soundbar', moveScore: 20, priceCents: 80000 });
const sentSb = rec({ masterProductId: 'sb1', vertical: 'eletroeletronicos', tipo: 'soundbar', sentAt: ago(120), priceCents: 80000 });
let plan = applyLimits([g2], [sentSb], NOW);
ok(plan.next == null && plan.deferred.some((d) => /^produto_em_cooldown_8h/.test(d.reason)), 'plano: G2 do mesmo master 2 h depois e adiado por cooldown', plan.deferred);
plan = applyLimits([g2], [sentSb], NOW, { ignoreSpacing: true });
ok(plan.next?.masterProductId === 'sb1', 'envio manual do dono (ignoreSpacing) nao e travado pelo cooldown');
plan = applyLimits([g2], [], NOW);
ok(plan.next?.masterProductId === 'sb1', 'sem historico o G2 sai normalmente');

// 6) Cota por tipo para alerta G2 e teto horario
const hist: SentRecord[] = Array.from({ length: 10 }, (_, i) => rec({ masterProductId: `h${i}`, vertical: 'eletroeletronicos', tipo: i < 4 ? 'soundbar' : `t${i}`, sentAt: ago(120 + i * 30) }));
const sbG2 = mk({ masterProductId: 'sbx', trigger: 'G2', cls: 'alerta', tipo: 'soundbar', moveScore: 30, dedupKey: 'sbx:G2:w' });
const tvG2 = mk({ masterProductId: 'tvx', trigger: 'G2', cls: 'alerta', tipo: 'smart-tv', moveScore: 3, dedupKey: 'tvx:G2:w' });
plan = applyLimits([sbG2, tvG2], hist, NOW);
ok(plan.next?.masterProductId === 'tvx' && plan.deferred.some((d) => /^tipo_soundbar_acima_de_30pct/.test(d.reason)), 'R-47b: G2 de tipo acima de 30% cede a vez ao G2 de outro tipo (antes alerta era isento)', plan.next?.masterProductId);
plan = applyLimits([sbG2], hist, NOW);
ok(plan.next?.masterProductId === 'sbx', 'cota SUAVE: sem alternativa o tipo dominante ainda sai');
const sbOK1 = mk({ masterProductId: 'sby', trigger: 'OK1', cls: 'alerta', tipo: 'soundbar', moveScore: 9, dedupKey: 'sby:OK1:w' });
plan = applyLimits([sbOK1, tvG2], hist, NOW);
ok(plan.next?.masterProductId === 'sby', 'novo minimo (OK1) continua isento da cota de tipo');
const sbD4 = mk({ masterProductId: 'sbz', trigger: 'G2', cls: 'alerta', tipo: 'soundbar', moveScore: 25, dedupKey: 'sbz:G2:w', regua: { degrau: 4 } as Candidate['regua'] });
plan = applyLimits([sbD4, tvG2], hist, NOW);
ok(plan.next?.masterProductId === 'sbz', 'degrau 4 da regua (Compre agora) continua isento');
const offFlag = process.env.GROUP_TIPO_COTA_ALERTA;
process.env.GROUP_TIPO_COTA_ALERTA = 'off';
plan = applyLimits([sbG2, tvG2], hist, NOW);
ok(plan.next?.masterProductId === 'sbx', 'GROUP_TIPO_COTA_ALERTA=off volta ao comportamento anterior (alerta isento)');
if (offFlag === undefined) delete process.env.GROUP_TIPO_COTA_ALERTA;
else process.env.GROUP_TIPO_COTA_ALERTA = offFlag;
// teto por hora: 2 soundbars na ultima hora, share abaixo de 30%
const histH: SentRecord[] = [
  ...Array.from({ length: 12 }, (_, i) => rec({ masterProductId: `u${i}`, vertical: 'eletroeletronicos', tipo: `u${i}`, sentAt: ago(100 + i * 20) })),
  rec({ masterProductId: 'p1', vertical: 'eletroeletronicos', tipo: 'soundbar', sentAt: ago(10) }),
  rec({ masterProductId: 'p2', vertical: 'eletroeletronicos', tipo: 'soundbar', sentAt: ago(30) }),
];
ok(tipoHourCount('eletroeletronicos', 'soundbar', histH, NOW) === 2, 'tipoHourCount: 2 soundbars na ultima hora');
plan = applyLimits([sbG2, tvG2], histH, NOW);
ok(plan.next?.masterProductId === 'tvx' && plan.deferred.some((d) => d.messageKey === sbG2.messageKey), 'teto de 2 por hora por tipo: o terceiro soundbar cede a vez a outro tipo');

console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
