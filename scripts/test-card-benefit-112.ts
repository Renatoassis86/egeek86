/** Benefício de cartão (#112): npx tsx scripts/test-card-benefit-112.ts */
import { parseCardBenefit, parseCardBenefits, textoFrontBeneficio } from '../src/lib/coupons/card-benefit';
let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const seen = 845910;
const b1 = parseCardBenefit('Use seu cartão Itaú Mastercard e ganhe 15% off! Saiba mais.', seen);
ok(b1?.kind === 'cartao_pct' && b1.issuer === 'Itaú Mastercard' && b1.pct === 15 && b1.needsConfirm, 'itaú', b1);
ok(b1?.finalPriceCents === null, 'NUNCA deriva preço final (2026-11-16: empilhava sobre o preço já com desconto de Pix)', b1?.finalPriceCents);
ok(parseCardBenefit('Use seu cartão Itaú Mastercard e ganhe 15% off!', null)?.finalPriceCents === null, 'sem base lida: sem preço final');
ok(textoFrontBeneficio(b1!) === 'Desconto no cartão: Itaú Mastercard 15% (a confirmar no carrinho)', 'texto do front', textoFrontBeneficio(b1!));
const p = parseCardBenefit('em até 10x de R$ 845,91 sem juros', seen);
ok(p?.kind === 'parcelas' && p.installments === 10 && p.installmentCents === 84591 && p.noInterest && p.finalPriceCents === null, 'parcelas sem juros', p);
const p2 = parseCardBenefit('18x R$ 547,33 com cartão Mercado Pago', 833000);
ok(p2?.installments === 18 && p2.installmentCents === 54733 && p2.issuer === 'Mercado Pago' && !p2.noInterest, 'parcelas no cartão MP (juros não afirmados)', p2);
const c = parseCardBenefit('R$ 46,65 de cashback em Meli Dólar com seu Cartão de Crédito Mercado Pago', 833000);
ok(c?.kind === 'cashback' && c.cashbackCents === 4665 && c.issuer === 'Mercado Pago', 'cashback', c);
const x = parseCardBenefit('5% OFF no Pix', 100000);
ok(x?.kind === 'pix_pct' && x.pct === 5 && x.finalPriceCents === null, 'pix (sem preço derivado)', x);
const capd = parseCardBenefit('Use seu cartão Itaú Mastercard e ganhe 15% off, até R$ 300', seen);
ok(capd?.capCents === 30000 && capd.finalPriceCents === null, 'teto lido continua lido, sem preço derivado', capd);
ok(parseCardBenefit('Cupom disponível', seen) === null && parseCardBenefit('Use seu cartão X e ganhe 90% off', seen) === null && parseCardBenefit('', seen) === null, 'lixo descartado');
ok(parseCardBenefits(['Use seu cartão Itaú Mastercard e ganhe 15% off!', 'Use seu cartão Itaú Mastercard e ganhe 15% off! Saiba mais.', 'x'], seen).length === 1, 'dedup por chave');
console.log(fails ? `FALHAS ${fails}` : 'OK');
process.exit(fails ? 1 : 0);
