/**
 * Teste do NOME DO CUPOM na mensagem (ordem do dono, 2026-11-12). Funcoes puras: SEM banco, SEM rede. Fixtures marcadas como tais.
 * Uso: npx tsx --conditions=react-server scripts/test-cupom-nome.ts
 */
import { cleanCouponText, resolveCouponUse, sanitizeCouponCode, sanitizeCouponName } from '../src/lib/coupons/coupon-name';
import { normalizePageRow } from '../src/lib/coupons/page-read';
import { buildGroupMessages, textProblems, withCouponBlock, type CouponInfo } from '../src/lib/messaging/group-messages';

let fails = 0;
let total = 0;
function ok(c: boolean, n: string, extra?: unknown) {
  total++;
  if (!c) {
    fails++;
    console.error(`FALHOU: ${n}`, extra ?? '');
  }
}

// sanitizacao
ok(cleanCouponText('25% OFF em TV') === '25% de desconto em TV', '% OFF reescrito');
ok(cleanCouponText('R$ 100 OFF em TV Toshiba') === 'R$ 100 OFF em TV Toshiba', 'R$ OFF preservado (nome da loja)');
ok(cleanCouponText('<b>x</b>') === null && cleanCouponText('veja https://x.com') === null && cleanCouponText('cupom afiliado') === null && cleanCouponText('a'.repeat(200)) === null, 'marcacao, link, termo proibido e tamanho recusados');
ok(sanitizeCouponName('Cupom do anúncio') === null && sanitizeCouponName('R$ 778,04 com Cupom') === null && sanitizeCouponName('Cupom') === null, 'rotulos genericos nao sao nome');
ok(sanitizeCouponCode('primeblack20') === 'PRIMEBLACK20' && sanitizeCouponCode('CUPOM') === null && sanitizeCouponCode('1234') === null && sanitizeCouponCode('AB') === null && sanitizeCouponCode('A B C D') === null, 'codigo validado');

// (a) com nome / codigo
const a1 = resolveCouponUse({ net: 'amazon', code: 'PRIMEBLACK20', offCents: 2000, pct: 10 });
ok(a1.name === 'PRIMEBLACK20' && a1.code === 'PRIMEBLACK20' && a1.named && a1.howTo[1].includes('PRIMEBLACK20'), 'Amazon com codigo: nome=codigo e passo digita o codigo', a1);
const a2 = resolveCouponUse({ net: 'mercado-livre', listTitle: 'R$ 100 OFF', listScope: 'Em TV Toshiba', ativacao: 'EU_QUERO', offCents: 10000, pct: 8 });
ok(a2.name === 'R$ 100 OFF em TV Toshiba' && a2.named && a2.howTo[1] === 'Em Cupons, ative o cupom R$ 100 OFF em TV Toshiba', 'ML nome da lista + escopo', a2);
const a3 = resolveCouponUse({ net: 'mercado-livre', pageName: '10% OFF', listTitle: 'R$ 5 OFF', offCents: 500, pct: 5 });
ok(a3.name === '10% de desconto', 'nome lido na pagina tem prioridade sobre a lista', a3);
const a4 = resolveCouponUse({ net: 'mercado-livre', listTitle: '5% OFF', listScope: 'Em produtos selecionados', offCents: 500, pct: 5 });
ok(a4.name === '5% de desconto', 'escopo "selecionados" nao entra no nome', a4);
// (b) sem nome
const b1 = resolveCouponUse({ net: 'mercado-livre', offCents: 10000, pct: 8, ativacao: 'EU_QUERO' });
ok(!b1.named && b1.name === 'R$ 100,00 de desconto' && b1.howTo.length === 3 && b1.howTo[1] === 'Em Cupons, ative o cupom de R$ 100,00', 'ML sem nome: rotulo do valor e passo a passo', b1);
const b2 = resolveCouponUse({ net: 'amazon', offCents: 2000, pct: 10 });
ok(!b2.named && b2.howTo[1].startsWith('Clique em Aplicar o cupom de R$ 20,00') && b2.activation.startsWith('1. Abra o anúncio; 2.'), 'Amazon sem nome: Aplicar cupom abaixo do preco', b2);
const b3 = resolveCouponUse({ net: 'mercado-livre', offCents: 1000, pct: 5, ativacao: 'AUTOMATIC' });
ok(b3.howTo[1].includes('sozinho'), 'ML AUTOMATIC: nao precisa ativar', b3);
const b4 = resolveCouponUse({ net: 'mercado-livre', offCents: 1000, pct: 10, rule: { kind: 'percentual', valueNum: 10 } });
ok(b4.name === '10% de desconto', 'regra lida vira rotulo', b4);

// contrato do POST: name/code opcionais e validados
const row = (coupons: unknown) => normalizePageRow('amazon', { ref: 'B0TESTE001', price_seen_cents: 10000, coupons }, { externalRef: 'amazon-B0TESTE001', priceCents: 10000 });
const r1 = row([{ label: 'Aplicar cupom de R$ 20', code: 'PRIMEBLACK20', name: '<script>' }, { label: 'Aplicar cupom de R$ 20' }]);
ok(r1.ok && r1.coupons[0].code === 'PRIMEBLACK20' && r1.coupons[0].name === null && r1.coupons[1].code === null, 'POST: code valido passa, name com marcacao descartado, ausente = null', r1);

// mensagens
const NOW = new Date('2026-11-12T15:00:00Z');
const base: CouponInfo = {
  code: 'R$ 100 OFF em TV Toshiba',
  conditions: 'Desconto de R$ 100,00 (8%): você paga R$ 1.150,00. Como usar: 1. Abra o anúncio; 2. Em Cupons, ative o cupom R$ 100 OFF em TV Toshiba; 3. Finalize a compra. Preço lido na página do anúncio',
  expiresAt: null,
  verifiedAt: NOW.toISOString(),
  unnamed: false,
  typedCode: null,
};
const txt = 'Titulo\n\nR$ 1.150,00 no Mercado Livre\n\n• Vendedor: X\n\nhttps://egeek86.com/go/abc';
const tg = withCouponBlock(txt, base, 'tg', NOW);
ok(tg.includes('CUPOM:') && tg.includes('R$ 100 OFF em TV Toshiba') && !tg.includes('<code>R$ 100'), 'bloco: nome em destaque, sem monospace de nao-codigo', tg);
ok(!/Cupom do an/.test(tg) && textProblems(tg, 'tg').length === textProblems(txt, 'tg').length, 'bloco sem "Cupom do anuncio" e sem problema novo');
const tgCode = withCouponBlock(txt, { ...base, code: 'Black Friday Geek', typedCode: 'PRIMEBLACK20' }, 'tg', NOW);
ok(tgCode.includes('Black Friday Geek') && tgCode.includes('<code>PRIMEBLACK20</code>'), 'bloco: nome + codigo digitavel em monospace', tgCode);
const wa = withCouponBlock(txt, { ...base, code: 'R$ 20,00 de desconto', unnamed: true }, 'wa', NOW);
ok(wa.includes('R$ 20,00 de desconto') && wa.includes('Como usar: 1. Abra o anúncio') && !wa.includes('<'), 'bloco sem nome (b): valor + passo a passo, sem HTML', wa);

const offer = { slug: 's', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 125000, affiliateUrl: 'https://meli.la/AbCd123', title: 'Smart TV Toshiba 50', confirmedAt: NOW } as never;
const cm = (c: object) =>
  buildGroupMessages({ model: 'cupom', name: 'Smart TV Toshiba 50', offer, adTag: '#publicidade', messageKey: 'k1', coupon: { name: 'x', offCents: 10000, pct: 8, finalCents: 115000, ruleKnown: false, activation: 'a', readAt: NOW, ...c } } as never);
const m1 = cm({ name: 'R$ 100 OFF em TV Toshiba', named: true, howTo: ['Abra o anúncio', 'Em Cupons, ative o cupom R$ 100 OFF em TV Toshiba', 'Finalize a compra'] });
ok(m1.problems.length === 0 && m1.telegram.includes('Cupom:') && m1.telegram.includes('R$ 100 OFF em TV Toshiba') && m1.telegram.includes('Como usar:') && m1.telegram.includes('3. Finalize a compra'), 'mensagem (a) ML: nome + como usar', m1.telegram + m1.problems.join());
const m2 = cm({ name: 'R$ 100,00 de desconto', named: false, howTo: ['Abra o anúncio', 'Em Cupons, ative o cupom de R$ 100,00', 'Finalize a compra'] });
ok(m2.problems.length === 0 && m2.telegram.includes('Cupom:') && m2.telegram.includes('1. Abra o anúncio; 2. Em Cupons, ative o cupom de R$ 100,00; 3. Finalize a compra.') && !/Cupom do an/.test(m2.telegram), 'mensagem (b): valor + passos', m2.telegram);
const m3 = cm({ name: 'PRIMEBLACK20', code: 'PRIMEBLACK20', named: true, howTo: ['Abra o anúncio e adicione ao carrinho', 'No campo de cupom, digite o código PRIMEBLACK20', 'Finalize a compra'] });
ok(m3.telegram.includes('<code>PRIMEBLACK20</code>') && /Código:[*]? PRIMEBLACK20/.test(m3.whatsapp), 'mensagem (a) codigo: Codigo em monospace', m3.telegram);
ok(!/afiliad|% OFF/i.test(m1.telegram + m2.telegram + m3.telegram + m1.whatsapp), 'sem "afiliado" e sem "% OFF"');

console.log(fails ? `${fails} FALHA(S) de ${total}` : `${total}/${total} ok`);
process.exit(fails ? 1 : 0);
