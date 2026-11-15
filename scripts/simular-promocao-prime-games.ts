/**
 * SIMULAÇÃO ponta a ponta (só SELECT, não grava nada) da promoção Prime dos jogos A2B9F6KRH7YF1H (dono, 2026-11-14).
 * Monta o corpo que o loop mandaria (cards = ofertas Amazon ativas de games de Switch/Switch 2 do banco, com os preços REAIS de prateleira),
 * roda a leitura da promoção SEM departamento no título (como a Amazon entrega: "25% de desconto em 1 item(ns)"), a inferência da categoria pelos itens,
 * a trava de departamento, o preço derivado e a mensagem CUPOM "Exclusivo Prime" (texto, cota e bloqueios).
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/simular-promocao-prime-games.ts
 */
import { connect } from './_dup-shared';
import {
  categoriaPelosItens, cupomDoItem, departamentoCompativel, parsePromoCards, parsePromoPage, precoComPromocao, primeNaFinalizacao,
} from '../src/lib/coupons/amazon-promocoes';
import { buildGroupMessages } from '../src/lib/messaging/group-messages';
import { primePromoQuotaBlock, type SentRecord } from '../src/lib/messaging/group-rules';

const ASINS_DO_CONCORRENTE = ['B0FK8D2W2C', 'B0FK7YV5RB', 'B0G88JLN1K', 'B0H8Q6S9H3']; // Pac-Man Switch, Pac-Man Switch 2, Mega Man Star Force, Octopath II

async function main() {
  const sql = connect();
  try {
    const NOW = new Date();
    const offers = await sql<{ id: string; asin: string; titulo: string; preco: number; vertical: string | null; plat: string | null; mid: string | null }[]>`
      SELECT o.id::text AS id, replace(o.external_ref, 'amazon-', '') AS asin, left(o.title, 80) AS titulo, o.current_price_cents::int AS preco,
             COALESCE(o.vertical, mp.vertical) AS vertical, mp.game_platform_gen::text AS plat, o.master_product_id::text AS mid
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id LEFT JOIN master_products mp ON mp.id = o.master_product_id
      WHERE n.slug = 'amazon' AND o.status = 'active' AND o.current_price_cents > 0 AND mp.vertical = 'games' AND mp.game_platform_gen::text IN ('switch_1', 'switch_2')
        AND COALESCE(mp.attributes -> 'catalogGate' ->> 'verdict', '') <> 'rejected'
      ORDER BY (replace(o.external_ref, 'amazon-', '') = ANY(${ASINS_DO_CONCORRENTE})) DESC, o.id LIMIT 55`;
    const ruido = await sql<{ asin: string; vertical: string | null; preco: number }[]>`
      SELECT replace(o.external_ref, 'amazon-', '') AS asin, COALESCE(o.vertical, mp.vertical) AS vertical, o.current_price_cents::int AS preco
      FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id LEFT JOIN master_products mp ON mp.id = o.master_product_id
      WHERE n.slug = 'amazon' AND o.status = 'active' AND COALESCE(o.vertical, mp.vertical) = 'tecnologia' LIMIT 3`;
    console.log(`cards simulados: ${offers.length} de games Switch/Switch 2 + ${ruido.length} de tecnologia (ruído). Dos 4 ASINs do concorrente no banco: ${offers.filter((o) => ASINS_DO_CONCORRENTE.includes(o.asin)).length}`);

    const brl = (c: number) => (c / 100).toFixed(2).replace('.', ',');
    const cards = [...offers.map((o) => ({ a: o.asin, t: o.titulo, p: brl(o.preco), l: '' })), ...ruido.map((o) => ({ a: o.asin, t: 'x', p: brl(o.preco), l: '' }))];
    const ok = (c: boolean, n: string, extra?: unknown) => console.log(`${c ? 'ok  ' : 'FALHA'} ${n}${!c && extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''}`);

    // 1. leitura da promoção como a Amazon entrega (sem departamento no título, sem validade lida)
    const lido = parsePromoPage({ id: 'A2B9F6KRH7YF1H', titulo: '25% de desconto em 1 item(ns)', banner: '[Exclusivo para membros Prime] 25% de desconto em 1 item(ns)', termos: '' }, NOW);
    if (!lido.ok) { console.log('FALHA leitura', lido); process.exitCode = 1; return; }
    let p = lido.promo;
    ok(p.restricao === 'prime' && p.percentual === 25 && p.validadeDesconhecida, 'leitura: Prime, 25%, validade desconhecida (registrada, sem prazo inventado)', p);
    ok(p.categoria === null && !primeNaFinalizacao(p), 'sem departamento no título/banner, a regra sozinha NÃO aceita (era o motivo de não gravar)');

    // 2. categoria pelos ASINs casados
    const cs = parsePromoCards(cards);
    const casadas = cs.map((c) => offers.find((o) => o.asin === c.asin) ?? ruido.find((o) => o.asin === c.asin)).filter(Boolean) as { vertical: string | null }[];
    const inf = categoriaPelosItens(casadas.map((o) => o.vertical));
    ok(!!inf && inf.categoria === 'Games', `categoria inferida pelos itens: ${inf ? `${inf.categoria} (${Math.round(inf.share * 100)}% de ${inf.casados} casados)` : 'nenhuma'}`, inf);
    if (!inf) { process.exitCode = 1; return; }
    p = { ...p, categoria: inf.categoria };
    ok(primeNaFinalizacao(p), 'com a categoria inferida, primeNaFinalizacao = true');

    // 3. trava de departamento por item + preço derivado
    const aceitas = cs.map((c) => ({ c, o: offers.find((x) => x.asin === c.asin) ?? ruido.find((x) => x.asin === c.asin)! as never as (typeof offers)[number] })).filter((x) => departamentoCompativel(p.categoria, x.o.vertical));
    ok(aceitas.length === offers.length, `trava de departamento: ${aceitas.length} games aceitos, ${cs.length - aceitas.length} de tecnologia barrados (esperado ${offers.length}/${ruido.length})`);
    console.log('\nASIN        plataforma  prateleira   com 25% Prime   título');
    const alvo = aceitas.filter((x) => ASINS_DO_CONCORRENTE.includes(x.o.asin));
    for (const x of alvo.concat(aceitas.filter((y) => !ASINS_DO_CONCORRENTE.includes(y.o.asin)).slice(0, 3))) {
      console.log(`${x.o.asin}  ${String(x.o.plat).padEnd(9)}  R$ ${brl(x.o.preco).padStart(7)}   R$ ${brl(precoComPromocao(x.o.preco, 25)).padStart(7)}      ${x.o.titulo.slice(0, 55)}`);
    }
    const esperado: Record<string, string> = { B0FK8D2W2C: '119,92', B0FK7YV5RB: '119,92', B0G88JLN1K: '127,42', B0H8Q6S9H3: '224,92' };
    for (const x of alvo) {
      const f = brl(precoComPromocao(x.o.preco, 25));
      const e = esperado[x.o.asin];
      // O Pac-Man Switch 2 está a 159,89 no banco (o concorrente mostrou 119,92 sobre 159,90): ±1 centavo na prateleira.
      ok(Math.abs(precoComPromocao(x.o.preco, 25) - Number(e.replace(',', '')) ) <= 1, `preço derivado ${x.o.asin} = R$ ${f} (concorrente ${e})`);
    }
    ok(alvo.length === 4, 'os 4 itens do concorrente que já existem no banco entram na promoção', alvo.map((a) => a.o.asin));

    // 4. corpo do cupom + mensagem
    const x0 = alvo.find((a) => a.o.asin === 'B0FK8D2W2C')!;
    const cupom = cupomDoItem(p, { asin: x0.o.asin, offerId: x0.o.id }, 'https://www.amazon.com.br/promotion/psp/A2B9F6KRH7YF1H', { primeCheckout: true }) as Record<string, unknown>;
    ok(cupom.publico === 'assinantes' && cupom.validade_origem === 'ausente' && (cupom.condicoes as Record<string, unknown>).validade_desconhecida === true, 'cupom gravado: assinantes, prime_checkout, validade ausente + aviso (nada inventado)', cupom);
    const final = precoComPromocao(x0.o.preco, 25);
    const msg = buildGroupMessages({
      model: 'cupom', name: x0.o.titulo, offer: { slug: 'pac-man', networkSlug: 'amazon', networkName: 'Amazon', priceCents: x0.o.preco, affiliateUrl: `https://www.amazon.com.br/dp/${x0.o.asin}?tag=x`, title: x0.o.titulo, confirmedAt: NOW } as never,
      adTag: '#publicidade', messageKey: 'sim-prime',
      coupon: { name: 'Exclusivo Prime: 25% de desconto', offCents: x0.o.preco - final, pct: 25, finalCents: final, ruleKnown: true, activation: 'a', named: true, howTo: ['Abra o anúncio (precisa ser membro Prime)', 'O desconto entra na finalização do pedido'], exclusivePrime: true },
    } as never);
    console.log('\n--- mensagem (Telegram) ---\n' + msg.telegram.replace(/<[^>]+>/g, ''));
    ok(/Exclusivo Prime/.test(msg.telegram) && /finalização do pedido/.test(msg.telegram) && /sujeito a alteração/.test(msg.telegram) && !/% OFF/i.test(msg.telegram) && msg.problems.length === 0, 'mensagem: Exclusivo Prime, finalização, carimbo "sujeito a alteração", sem "% OFF", sem problemas', msg.problems);

    // 5. cota própria
    const reg = (min: number): SentRecord => ({ masterProductId: 'm', priceCents: 1, sentAt: new Date(NOW.getTime() - min * 60_000), trigger: 'CUPOM', primePromo: true });
    ok(primePromoQuotaBlock([], NOW, {}) === null && primePromoQuotaBlock([reg(5), reg(15)], NOW, {}) === 'promo_prime_maximo_2_por_hora', 'cota: 2 por hora e 8 por dia (sem envios, libera; 2 na hora, bloqueia)');
    console.log('\nBloqueios herdados da fila (fora de linha, porteiro, usado, foto com mão, preço oscilando, frescor Amazon 60 min, confirmação na página do item em 120 min) não foram alterados; a mensagem só sai depois de o loop __cup/__promo confirmar o item na página.');
  } finally {
    await sql.end();
  }
}
main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : e); process.exit(1); });
export {};
