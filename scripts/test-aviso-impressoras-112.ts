/**
 * #112: aviso privado, gravação de benefício de cartão e aviso no front. Puro + (com --db) ponta a ponta com benefício TEMPORÁRIO (apagado no fim).
 * Uso: NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/test-aviso-impressoras-112.ts [--db]
 * O envio é sempre dry-run aqui (COLLECTOR_ALERTS forçado a 0): nunca manda mensagem.
 */
import { textoAvisoImpressora, avisoImpressoraLigado } from '../src/lib/coupons/aviso-impressoras';
import { linhasAviso } from '../src/lib/catalog/guia-3d';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }

const t = textoAvisoImpressora({ tipo: 'cartao', chave: 'x', modelo: 'Bambu Lab P2S Combo', rede: 'Amazon', titulo: 'Itaú Mastercard 15%', regra: 'Use seu cartão Itaú Mastercard e ganhe 15% off', validade: 'não informada na página', link: 'https://www.amazon.com.br/dp/B0GP9LBGY7', anuncioCents: 845910, finalCents: 719023, confirmar: true });
ok(/Desconto no cartão novo: Bambu Lab P2S Combo/.test(t) && /a confirmar no carrinho/.test(t) && /Validade: não informada/.test(t) && /Link: https:/.test(t), 'texto do aviso', t);
ok(!/comiss/i.test(t), 'sem aviso de comissão');
ok(!/<script/i.test(textoAvisoImpressora({ tipo: 'cupom', chave: 'y', modelo: '<script>', rede: 'ML', titulo: 'a', regra: 'b', validade: 'c', link: null, anuncioCents: 100, finalCents: null, confirmar: false })), 'escapa HTML');
ok(avisoImpressoraLigado({}) && !avisoImpressoraLigado({ PRINTER_COUPON_ALERT: 'off' }), 'flag padrão ligada, off desliga');
ok(linhasAviso(null).length === 0 && linhasAviso({ cupom: null, cartoes: [] }).length === 0, 'sem aviso: nada na tela');
ok(linhasAviso({ cupom: 'Cupom: X', cartoes: ['Desconto no cartão: Y'] }).join('|') === 'Cupom: X|Desconto no cartão: Y', 'ordem cupom e cartão');
ok(textProblems('Desconto no cartão: Itaú Mastercard 15% (a confirmar no carrinho)', 'tg').filter((p) => /termo proibido/.test(p)).length === 0, 'copy sem termo proibido');

async function db() {
  process.env.COLLECTOR_ALERTS = '0';
  const { connect } = await import('./_dup-shared');
  const sql = connect();
  const alvo = await sql`SELECT o.id::text id, o.current_price_cents p FROM affiliate_offers o JOIN master_products m ON m.id=o.master_product_id
    WHERE o.status='active' AND o.quarantined_at IS NULL AND o.vertical='impressao3d' AND m.name ~* 'bambu' AND m.name ~* 'combo' AND m.name ~* '(p2s|p1s)' ORDER BY o.current_price_cents LIMIT 1`;
  if (!alvo[0]) { console.log('nenhuma oferta ativa de P2S/P1S Combo: pulando o ponta a ponta'); await sql.end(); return; }
  const id = alvo[0].id as string; const preco = Number(alvo[0].p);
  const { gravarBeneficiosCartao } = await import('../src/server/coupons/card-benefits');
  const { alertarCuponsImpressoras } = await import('../src/server/coupons/aviso-impressoras');
  const { avisosDeOfertas } = await import('../src/server/queries/avisos-impressoras-3d');
  try {
    const n = await gravarBeneficiosCartao(id, 'amazon-pagina', ['Use seu cartão Itaú Mastercard e ganhe 15% off! Saiba mais.', 'em até 10x de R$ 845,91 sem juros'], preco);
    ok(n === 2, 'gravou 2 benefícios', n);
    await gravarBeneficiosCartao(id, 'amazon-pagina', ['Use seu cartão Itaú Mastercard e ganhe 15% off! Saiba mais.'], preco);
    const c = await sql`SELECT count(*)::int n FROM offer_card_benefits WHERE offer_id=${id}::uuid`;
    ok(c[0].n === 2, 'releitura não duplica', c[0].n);
    const av = await avisosDeOfertas([id]);
    console.log('aviso na tela:', JSON.stringify(av.get(id)));
    ok(!!av.get(id)?.cartoes.some((x) => /Desconto no cartão: Itaú Mastercard 15% \(a confirmar no carrinho\)/.test(x)), 'front mostra o cartão');
    const r = await alertarCuponsImpressoras();
    console.log('aviso privado (dry-run):', r.dryRun, 'enviaria', r.enviaria);
    ok(r.dryRun && r.enviados === 0, 'dry-run não envia');
    ok(r.enviaria >= 1 && r.avisos.some((x) => /Itaú Mastercard 15%/.test(x)), 'avisaria o cartão novo');
    const ainda = await sql`SELECT count(*)::int n FROM offer_card_benefits WHERE offer_id=${id}::uuid AND alerted_at IS NOT NULL`;
    ok(ainda[0].n === 0, 'dry-run não marca como avisado');
  } finally {
    await sql`DELETE FROM offer_card_benefits WHERE offer_id=${id}::uuid AND source='amazon-pagina' AND last_seen_at > now() - interval '10 minutes'`;
    await sql.end();
  }
}

(async () => {
  if (process.argv.includes('--db')) await db();
  console.log(fails ? `FALHAS ${fails}` : 'OK');
  process.exit(fails ? 1 : 0);
})();
