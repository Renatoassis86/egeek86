/**
 * Gatilho anti-isca de benefício de cartão (2026-11-16, "Itaú Mastercard 15%" da Amazon). Puro.
 * Uso: npx tsx scripts/test-beneficio-cartao-120.ts
 */
import { beneficioVerificado, parseCardBenefit, parseCardBenefits, rotuloBeneficioCartao, textoFrontBeneficio, tiposLiberados } from '../src/lib/coupons/card-benefit';
import { textoQueda } from '../src/lib/messaging/painel-impressoras';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }

// O caso real: texto do widget de marketing + preço à vista no Pix de R$ 7.901,18
const ita = parseCardBenefit('Use seu cartão Itaú Mastercard e ganhe 15% off! Saiba mais.', 790118);
ok(!!ita && ita.kind === 'cartao_pct' && ita.pct === 15 && ita.issuer === 'Itaú Mastercard', 'o texto continua sendo interpretado (para auditoria)', ita);
ok(ita?.finalPriceCents === null, 'NUNCA deriva preço final (R$ 6.716,00 era empilhado sobre o preço do Pix)', ita?.finalPriceCents);
ok(!!ita && !beneficioVerificado(ita), 'desconto de cartão % é NÃO VERIFICADO por padrão');
for (const t of ['5% OFF no Pix', 'R$ 46,65 de cashback em Meli Dólar com seu Cartão de Crédito Mercado Pago']) {
  const b = parseCardBenefit(t, 100000);
  ok(!!b && !beneficioVerificado(b) && b.finalPriceCents === null, `não verificado e sem preço final: ${t}`, b);
}
// O que a página imprime junto do preço do próprio item é verificado
const par = parseCardBenefit('ou em até 12x de R$ 731,61 sem juros (total parcelado R$ 8.779,10)', 790118);
ok(!!par && par.kind === 'parcelas' && par.installments === 12 && par.installmentCents === 73161 && beneficioVerificado(par), 'parcelado impresso pela página: verificado', par);
ok(rotuloBeneficioCartao(par!) === '12x de R$ 731,61 sem juros', 'rótulo do parcelado', rotuloBeneficioCartao(par!));
const vista = parseCardBenefit('10% off à vista no Pix e NuPay [Débito ou Limite Adicional]', 790118);
ok(!!vista && vista.kind === 'preco_a_vista' && vista.issuer === 'Pix' && beneficioVerificado(vista) && vista.finalPriceCents === null, 'qualificador "à vista no Pix": verificado e sem preço derivado', vista);
ok(rotuloBeneficioCartao(vista!) === 'à vista no Pix' && (textoFrontBeneficio(vista!) ?? '').includes('à vista no Pix'), 'rótulo "à vista no Pix"', rotuloBeneficioCartao(vista!));
// Liberação por escopo (g): só com a variável; o padrão não libera o cartão
ok(tiposLiberados({}).join() === 'parcelas,preco_a_vista', 'padrão: só parcelas e preço à vista');
ok(beneficioVerificado({ kind: 'cartao_pct' }, tiposLiberados({ CARD_BENEFITS_TIPOS: 'parcelas,preco_a_vista,cartao_pct' })), 'liberação explícita por tipo existe (reativação por escopo, nunca global)');
// Invariante: com a lista inteira lida da página do P2S, nenhum benefício verificado carrega desconto empilhado
const todos = parseCardBenefits(['Use seu cartão Itaú Mastercard e ganhe 15% off! Saiba mais.', '10% off à vista no Pix e NuPay [Débito ou Limite Adicional]', 'ou em até 12x de R$ 731,61 sem juros'], 790118);
const saem = todos.filter((b) => beneficioVerificado(b));
ok(todos.length === 3 && saem.length === 2 && saem.every((b) => b.finalPriceCents === null && b.kind !== 'cartao_pct'), 'da página real saem só o à vista e o parcelado, sem preço derivado', saem.map((b) => b.kind));

// Mensagem/card: preço de destaque rotulado e parcelado da página (Amazon)
const t = textoQueda({ gatilho: 'queda', rede: 'amazon', titulo: 'Impressora 3D Bambu Lab P2S Combo', loja: null, cents: 790118, anteriorCents: 810000, minimo14: false, url: 'https://exemplo.test', leituraEm: new Date('2026-11-16T01:00:00Z'), aVista: 'à vista no Pix', parcelado: '12x de R$ 731,61 sem juros', cartoes: [], fretePrazo: 'x', adTag: '' });
ok(t.includes('R$ 7.901,18</b> à vista no Pix') && t.includes('ou 12x de R$ 731,61 sem juros') && !/6\.716|Itaú|15%/.test(t), 'card: "à vista no Pix" e parcelado da página; nada de Itaú nem R$ 6.716', t);

console.log(fails ? `${fails} falha(s)` : 'OK: gatilho anti-isca de benefício de cartão');
process.exit(fails ? 1 : 0);
