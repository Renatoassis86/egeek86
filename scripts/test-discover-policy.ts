/**
 * Teste de tabela da política conservadora da descoberta (src/server/collector/discover-policy.ts). Sem banco, sem rede.
 * Uso: npx tsx scripts/test-discover-policy.ts   (sai com código 1 se algo falhar)
 */
import { entryGateAttributes } from '../src/lib/catalog/gate';
import {
  ABSURD_HIGH_CENTS,
  attachPriceVerdict,
  buildNewMasterAttributes,
  DEFAULT_LIMITS,
  discoveryDoubts,
  medianOf,
  resolveLimits,
} from '../src/server/collector/discover-policy';

let fail = 0;
let total = 0;
function eq(name: string, got: unknown, want: unknown) {
  total++;
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    fail++;
    console.log(`FALHA ${name}\n  got:  ${g}\n  want: ${w}`);
  }
}

const base = { kindSource: 'category' as const, productType: 'game' as const, platform: 'ps5', gameFormat: 'physical', sellerPricesCents: [25000, 26000, 27000] };

// --- dúvidas
eq('sem dúvida', discoveryDoubts(base), []);
eq('classificador', discoveryDoubts({ ...base, kindSource: 'classifier' }), ['tipo_por_classificador_estatistico']);
eq('termo de busca', discoveryDoubts({ ...base, kindSource: 'term' }), ['tipo_pelo_termo_de_busca']);
eq('título é sinal aceito', discoveryDoubts({ ...base, kindSource: 'title' }), []);
eq('plataforma desconhecida (jogo)', discoveryDoubts({ ...base, platform: 'unknown' }), ['plataforma_desconhecida']);
eq('plataforma desconhecida (acessório ok)', discoveryDoubts({ ...base, productType: 'accessory', platform: 'unknown', gameFormat: 'unknown' }), []);
eq('formato digital', discoveryDoubts({ ...base, gameFormat: 'digital' }), ['formato_digital']);
eq('formato desconhecido', discoveryDoubts({ ...base, gameFormat: 'unknown' }), ['formato_desconhecido']);
eq('formato desconhecido console ok', discoveryDoubts({ ...base, productType: 'console', gameFormat: 'unknown' }), []);
eq('preço absurdo', discoveryDoubts({ ...base, sellerPricesCents: [ABSURD_HIGH_CENTS, ABSURD_HIGH_CENTS + 1] }), ['preco_absurdo_alto']);
eq('isca vs vendedores (3+)', discoveryDoubts({ ...base, sellerPricesCents: [1000, 25000, 26000, 27000] }), ['menor_preco_isca_vs_vendedores']);
eq('isca precisa de 3+ vendedores', discoveryDoubts({ ...base, sellerPricesCents: [1000, 25000] }), []);
eq('várias dúvidas', discoveryDoubts({ ...base, kindSource: 'classifier', gameFormat: 'unknown' }), ['tipo_por_classificador_estatistico', 'formato_desconhecido']);

eq('plataforma só do termo', discoveryDoubts({ ...base, productType: 'console', gameFormat: 'unknown', platformFromTerm: true }), ['plataforma_pelo_termo_de_busca']);

// --- preço ao anexar a master existente
eq('anexa sem referências', attachPriceVerdict(100, []), 'ok');
eq('anexa com 1 referência', attachPriceVerdict(100, [20000]), 'ok');
eq('anexa normal', attachPriceVerdict(22000, [20000, 25000, 30000]), 'ok');
eq('anexa isca (<35%)', attachPriceVerdict(5000, [20000, 25000, 30000]), 'low');
eq('anexa limite exato 35%', attachPriceVerdict(8750, [25000, 25000]), 'ok');
eq('anexa absurdo (>3x)', attachPriceVerdict(90000, [20000, 25000, 30000]), 'high');
eq('mediana par', medianOf([1, 3]), 2);
eq('mediana vazia', medianOf([]), null);

// --- atributos do master novo (integra com o porteiro real)
const NOW = '2026-11-03T12:00:00.000Z';
const okTitle = 'Jogo Resident Evil 4 Remake Ps5 Mídia Física Lacrado';
const gateOk = entryGateAttributes(okTitle, 'game', { gameFormat: 'physical', gamePlatformGen: 'ps5', medianPriceCents: 19900 });
const a1 = buildNewMasterAttributes(gateOk, [], 'doubt', NOW) as any;
eq('aprovado sem dúvida: sem catalogGate', a1.catalogGate, undefined);
eq('aprovado sem dúvida: rastro', a1.discovery, { source: 'discover-products', at: NOW, doubts: [], bornAs: 'approved' });

const a2 = buildNewMasterAttributes(gateOk, ['formato_desconhecido'], 'doubt', NOW) as any;
eq('dúvida => review', a2.catalogGate.verdict, 'review');
eq('dúvida => motivo', a2.catalogGate.reason, 'descoberta_duvida:formato_desconhecido');
eq('dúvida => nasce review', a2.discovery.bornAs, 'review');

const a3 = buildNewMasterAttributes(gateOk, [], 'review_all', NOW) as any;
eq('review_all força review', a3.catalogGate.verdict, 'review');
eq('review_all motivo', a3.catalogGate.reason, 'descoberta_duvida:modo_review_all');

// review do próprio porteiro (piso de preço de mídia física PS2) é preservado
const gateRev = entryGateAttributes('God of War II Standard Edition Formato físico para PS2', 'game', { gameFormat: 'physical', medianPriceCents: 2000 });
const a4 = buildNewMasterAttributes(gateRev, ['formato_desconhecido'], 'doubt', NOW) as any;
eq('review do porteiro preservado', a4.catalogGate.reason, (gateRev.catalogGate as any).reason);
eq('review do porteiro: bornAs', a4.discovery.bornAs, 'review');

// --- limites
eq('limites padrão', resolveLimits(), DEFAULT_LIMITS);
eq('teto duro de masters', resolveLimits({ maxNewMasters: 9999 }).maxNewMasters, 50);
eq('lixo => padrão', resolveLimits({ maxNewMasters: 'abc' }).maxNewMasters, DEFAULT_LIMITS.maxNewMasters);
eq('zero masters permitido (só anexar)', resolveLimits({ maxNewMasters: 0 }).maxNewMasters, 0);
eq('negativo => 0', resolveLimits({ maxNewMasters: -5 }).maxNewMasters, 0);
eq('modo inválido => doubt', resolveLimits({ mode: 'xyz' }).mode, 'doubt');
eq('modo review_all', resolveLimits({ mode: 'review_all' }).mode, 'review_all');
eq('termos teto', resolveLimits({ termsPerRun: 99 }).termsPerRun, 10);

console.log(fail === 0 ? `OK: ${total} verificações, 0 falha` : `${fail} FALHA(S) de ${total}`);
process.exit(fail === 0 ? 0 : 1);
