/**
 * TESTE da PROMOÇÃO PRIME NA FINALIZAÇÃO (dono, 2026-11-14). Funções puras, SEM banco e SEM rede. Fixtures reais do caso Jogo Barato (14/11).
 * Uso: npx tsx --conditions=react-server scripts/test-promo-prime.ts
 *
 * Cobre: leitura da promoção (título "Jogos de ... com 25% OFF" + banner "Exclusivo para membros Prime"), preço derivado ao centavo (os 3 preços do
 * concorrente), regra de decisão (primeNaFinalizacao e as recusas), corpo do cupom (assinantes + prime_checkout), agulha (barra sem a flag, libera com ela),
 * texto da mensagem (Exclusivo Prime sempre visível), cota própria, ordem do front (desconto Prime ordena mas não vira selo) e linha da descoberta.
 */
import { cupomDoItem, parsePromoPage, precoComPromocao, primeNaFinalizacao, promoDescobertaLigada, promoPrimeLigada, promoPrimeMensagemLigada } from '../src/lib/coupons/amazon-promocoes';
import { evaluateAgulha } from '../src/lib/coupons/agulha';
import { agulhaRuleFromLabel } from '../src/lib/coupons/page-read';
import { buildGroupMessages } from '../src/lib/messaging/group-messages';
import { primePromoQuotaBlock, type SentRecord } from '../src/lib/messaging/group-rules';
import { selecionar, type Candidato, type ContextoAvaliacao } from '../src/lib/vitrines';
import { linhaDaPromocao } from '../src/server/collector/amazon-vitrine';

let fails = 0;
let total = 0;
function ok(c: boolean, n: string, extra?: unknown) {
  total++;
  if (!c) {
    fails++;
    console.error('FALHOU:', n, extra ?? '');
  }
}

const NOW = new Date('2026-11-14T18:00:00Z');
const BANNER = '[Exclusivo para membros Prime] Jogos de Nintendo Switch e Nintendo Switch 2 com 25% OFF De 10 de novembro de 2026 às 00:00 até 30 de novembro de 2026 às 23:59';
const TITULO = 'Jogos de Nintendo Switch e Nintendo Switch 2 com 25% OFF';

// 1. Leitura da promoção do concorrente
const r = parsePromoPage({ id: 'A1B2C3D4E5F6G7', titulo: TITULO, banner: BANNER }, NOW);
ok(r.ok, 'a promoção do Jogo Barato é lida', r);
if (r.ok) {
  const p = r.promo;
  ok(p.percentual === 25 && p.restricao === 'prime' && p.categoria === 'Games' && !p.soApp && p.minItens == null, 'regra lida: 25%, Prime, Games, sem quantidade mínima', p);
  ok(primeNaFinalizacao(p), 'primeNaFinalizacao = true para a promoção real');
  // 3. corpo do cupom
  const item = { asin: 'B0FK8D2W2C', offerId: '8aea2a30-6113-4445-996d-be6294505670' };
  const c = cupomDoItem(p, item, 'https://www.amazon.com.br/promotion/psp/A1B2C3D4E5F6G7', { primeCheckout: true }) as Record<string, unknown>;
  ok(c.publico === 'assinantes' && typeof c.publico_texto === 'string' && /Prime/.test(String(c.publico_texto)), 'cupom Prime: público assinantes com texto lido', c);
  ok((c.condicoes as Record<string, unknown>).prime_checkout === true && /Prime/.test(String(c.condicoes_texto)), 'cupom Prime: marca prime_checkout e condição escrita', c);
  const padrao = cupomDoItem(p, item, 'https://www.amazon.com.br/promotion/psp/A1B2C3D4E5F6G7') as Record<string, unknown>;
  ok(padrao.publico === 'todos' && !('publico_texto' in padrao) && !('prime_checkout' in (padrao.condicoes as object)), 'sem a opção, o cupom segue idêntico ao de antes (todos)', padrao);
}

// 2. Preço derivado ao centavo (os preços que o concorrente divulgou)
ok(precoComPromocao(16990, 25) === 12742, 'Mega Man Star Force: 169,90 -> 127,42', precoComPromocao(16990, 25));
ok(precoComPromocao(15990, 25) === 11992, 'Pac-Man World 2: 159,90 -> 119,92', precoComPromocao(15990, 25));
ok(precoComPromocao(29990, 25) === 22492, 'Octopath Traveler II: 299,90 -> 224,92', precoComPromocao(29990, 25));

// 4. Recusas da regra de decisão
const recusa = (titulo: string, banner: string) => {
  const x = parsePromoPage({ id: 'ZZZZZZZZZZ01', titulo, banner }, NOW);
  return x.ok ? primeNaFinalizacao(x.promo) : 'nao_leu';
};
const DATA = 'De 10 de novembro de 2026 às 00:00 até 30 de novembro de 2026 às 23:59';
ok(recusa('Exclusivo Prime: Compre 4 Livros e leve 10% off', `[Exclusivo para membros Prime] Exclusivo Prime: Compre 4 Livros e leve 10% off ${DATA}`) === false, 'Prime + compre N: recusada');
ok(recusa('Exclusivo Prime: 20% off em Moda', `[Exclusivo para membros Prime] Exclusivo Prime: 20% off em Moda ${DATA}`) === false, 'Prime em departamento não mapeado: recusada');
ok(recusa('Só no app: 15% off em Suplementos', `Só no app: 15% off em Suplementos ${DATA}`) === false, 'não é Prime: a regra Prime não se aplica');
ok(recusa('Seguir a loja: 10% off em Livros', `Seguir a loja: 10% off em Livros ${DATA}`) === false, 'seguir a loja: recusada');
ok(recusa(TITULO, '[Exclusivo para membros Prime] ' + TITULO) === 'nao_leu', 'sem validade lida: nada é lido');
ok(recusa('Jogos de Nintendo Switch com 25% OFF', `[Exclusivo para membros Prime] Jogos de Nintendo Switch com 25% OFF De 1 de outubro de 2026 até 5 de novembro de 2026 às 23:59`) === 'nao_leu', 'promoção encerrada: nada é lido');
// "Relógios": a trava de departamento antiga continua valendo
const rel = parsePromoPage({ id: 'ZZZZZZZZZZ02', titulo: 'Só no app: 20% off em Relógios', banner: `Só no app: 20% off em Relógios ${DATA}` }, NOW);
ok(rel.ok && rel.promo.categoria === 'Relógios', 'o título "off em <categoria>" continua lendo a categoria (sem regressão)', rel);

// 5. Agulha: barra sem a flag, libera com ela
const label = 'Promoção Amazon: Exclusivo Prime: 25% de desconto';
const ruleLida = agulhaRuleFromLabel(label);
const agulha = (permitir: boolean) =>
  evaluateAgulha({
    source: 'item', now: NOW, offer: { network: 'amazon', vertical: 'games', priceCents: 15990 }, verifiedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    priceWithCents: 11992, priceSeenCents: 15990, label, validUntil: '2026-11-30T23:59:00-03:00', rule: ruleLida, permitirPrimeNaFinalizacao: permitir,
  });
const sem = agulha(false);
const com = agulha(true);
ok(!sem.ok && sem.reason === 'publico_restrito', 'agulha barra "Exclusivo Prime" sem a flag (comportamento de antes)', sem);
ok(com.ok && com.finalPriceCents === 11992, 'agulha libera com a flag e confere o preço final (119,92)', com);
const errado = evaluateAgulha({
  source: 'item', now: NOW, offer: { network: 'amazon', vertical: 'games', priceCents: 15990 }, verifiedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  priceWithCents: 9000, priceSeenCents: 15990, label, validUntil: '2026-11-30T23:59:00-03:00', rule: ruleLida, permitirPrimeNaFinalizacao: true,
});
ok(!errado.ok, 'com a flag, preço final incoerente com os 25% ainda é barrado', errado);

// 6. Mensagem: "Exclusivo Prime" sempre visível, sem "% OFF"
const offer = { slug: 'pac-man', networkSlug: 'amazon', networkName: 'Amazon', priceCents: 15990, affiliateUrl: 'https://www.amazon.com.br/dp/B0FK8D2W2C?tag=x', title: 'Pac-Man World 2: Re-Pac - Nintendo Switch', confirmedAt: NOW } as never;
const offerML = { slug: 'pac-ml', networkSlug: 'mercado-livre', networkName: 'Mercado Livre', priceCents: 15990, affiliateUrl: 'https://meli.la/AbCd123', title: 'Pac-Man World 2: Re-Pac - Nintendo Switch', confirmedAt: NOW } as never;
const cm = (prime: boolean, o: never = offer) =>
  buildGroupMessages({
    model: 'cupom', name: 'Pac-Man World 2: Re-Pac - Nintendo Switch', offer: o, adTag: '#publicidade', messageKey: 'k-prime',
    coupon: { name: prime ? 'Exclusivo Prime: 25% de desconto' : 'CUPOM25: 25% de desconto', offCents: 3998, pct: 25, finalCents: 11992, ruleKnown: true, activation: 'a', named: true, howTo: prime ? ['Abra o anúncio (precisa ser membro Prime)', 'O desconto entra na finalização do pedido', 'Confira o preço final antes de pagar'] : ['Abra o anúncio', 'Ative o cupom', 'Confira o preço final antes de pagar'], exclusivePrime: prime, readAt: NOW },
  } as never);
const mp = cm(true);
const mn = cm(false, offerML);
let amazonSemPrime = false;
try { cm(false); } catch { amazonSemPrime = true; }
ok(amazonSemPrime, 'cupom da Amazon SEM a marca Prime continua barrado na mensagem (comportamento de antes)');
ok(/Preço na Amazon em/.test(mp.telegram) && /sujeito a alteração/.test(mp.telegram), 'mensagem Prime da Amazon leva o carimbo "sujeito a alteração"', mp.telegram);
ok(mp.problems.length === 0, 'mensagem Prime passa na barreira de termos', mp.problems);
ok(/Exclusivo Prime/.test(mp.telegram) && /finalização do pedido/.test(mp.telegram) && /com a promoção Prime/.test(mp.telegram) && /R\$\s?119,92/.test(mp.telegram), 'Telegram diz Exclusivo Prime, momento do desconto e o preço derivado', mp.telegram);
ok(/Exclusivo Prime/.test(mp.whatsapp) && !/% OFF/i.test(mp.telegram + mp.whatsapp), 'WhatsApp também diz Exclusivo Prime e não há "% OFF"', mp.whatsapp);
ok(!/Exclusivo Prime/.test(mn.telegram) && /com o cupom/.test(mn.telegram), 'sem a marca, a mensagem de cupom segue idêntica à de antes', mn.telegram);

// 7. Cota própria baixa
const reg = (min: number): SentRecord => ({ masterProductId: 'm', priceCents: 1, sentAt: new Date(NOW.getTime() - min * 60_000), trigger: 'CUPOM', primePromo: true });
ok(primePromoQuotaBlock([reg(10)], NOW, {}) === null, 'cota: 1 na última hora ainda pode');
ok(primePromoQuotaBlock([reg(10), reg(20)], NOW, {}) === 'promo_prime_maximo_2_por_hora', 'cota: 2 na hora bloqueia');
ok(primePromoQuotaBlock(Array.from({ length: 8 }, (_, i) => reg(70 + i * 60)), NOW, {}) === 'promo_prime_maximo_8_por_dia', 'cota: 8 em 24 h bloqueia');
ok(primePromoQuotaBlock([reg(10), reg(20)], NOW, { GROUP_PROMO_PRIME_POR_HORA: '5' }) === null, 'cota: env sobrescreve o limite por hora');
ok(primePromoQuotaBlock([{ ...reg(10), primePromo: false }, { ...reg(20), primePromo: false }], NOW, {}) === null, 'cota: cupom comum não conta na cota Prime');

// 8. Flags desligadas por padrão
ok(!promoPrimeLigada({}) && !promoDescobertaLigada({}) && !promoPrimeMensagemLigada({}), 'as 3 flags nascem desligadas');
ok(promoPrimeLigada({ PROMO_PRIME_DERIVADA: 'on' }) && promoDescobertaLigada({ PROMO_DESCOBERTA: 'on' }) && promoPrimeMensagemLigada({ GROUP_PROMO_PRIME: 'on' }), 'as 3 flags ligam com on');

// 9. Front: o desconto Prime ordena, mas a posição e o selo seguem só a média
const ctx: ContextoAvaliacao = { agora: NOW, ocultos: new Set(), tipoEfetivo: new Map() };
let seq = 0;
const mk = (over: Partial<Candidato> = {}): Candidato => {
  seq++;
  return {
    masterProductId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`, offerId: `0000aaaa-0000-4000-8000-${String(seq).padStart(12, '0')}`, slug: `jogo-${seq}`,
    tituloOferta: `Jogo Teste ${seq} Nintendo Switch 2 Mídia Física`, nomeMaster: `Jogo Teste ${seq} Nintendo Switch 2`, imagemUrl: 'https://exemplo.com/img.jpg',
    tipoDb: 'game', plataformaDb: 'switch_2', formatoDb: 'physical', edicaoDb: 'full_game', precoCentavos: 30000, loja: 'Amazon', lojaSlug: 'amazon',
    lidoEm: new Date(NOW.getTime() - 3_600_000).toISOString(), ofertasAtivas: 1, lojasAtivas: 1, vendedoresProximos: 1, vendedor: null, stats: null, ...over,
  };
};
// 12 itens com queda real pequena e 1 sem base mas com promoção Prime de 25%: o da promoção precisa entrar nos 10 da faixa
const comQueda = Array.from({ length: 12 }, (_, i) =>
  mk({ precoCentavos: 19000 - i, stats: { avgCents: 20000, quoteCount: 10, historyDays: 30, lowConfidence: false, lowAllCents: 18000, lowAllAt: '2026-11-01T10:00:00Z', lowBadgeBlock: null } }),
);
const semPromo = mk({ precoCentavos: 15990 });
const comPromo = mk({ precoCentavos: 15990, promoPrime: { pct: 25, finalCentavos: 11992, validaAte: '2026-11-30T23:59:00-03:00', confirmadoEm: NOW.toISOString() } });
const antes = selecionar('plataforma:switch_2:jogos', [...comQueda, semPromo], ctx);
const depois = selecionar('plataforma:switch_2:jogos', [...comQueda, comPromo], ctx);
ok(!antes.itens.some((i) => i.masterProductId === semPromo.masterProductId), 'sem promoção, o item sem base fica fora dos 10 (o caso de hoje)', antes.itens.length);
const item = depois.itens.find((i) => i.masterProductId === comPromo.masterProductId);
ok(!!item && depois.itens[0]?.masterProductId === comPromo.masterProductId, 'com promoção Prime confirmada, o item vai para o topo da faixa', depois.itens.map((i) => i.titulo));
ok(!!item && item.posicao.tipo === 'sem_base' && item.media === null && item.promoPrime?.finalCentavos === 11992, 'o item segue SEM selo e SEM média (preço de prateleira), com o preço derivado separado', item);
ok(!!item && item.precoCentavos === 15990, 'o preço do cartão continua sendo o de prateleira', item?.precoCentavos);

// 10. Descoberta: linha da vitrine a partir dos cards novos da promoção
const linha = linhaDaPromocao([{ asin: 'B0H2NCHDPH', titulo: 'Granblue Fantasy: Relink - Endless Ragnarok - Nintendo Switch 2', priceCents: 30790, listCents: 34990 }]);
ok(linha.r.length === 1 && linha.r[0].a === 'B0H2NCHDPH' && linha.r[0].p === 'R$ 307,90' && linha.r[0].l === 'R$ 349,90' && linha.r[0].s === 0, 'linha da descoberta: ASIN, preço e lista em BRL, não patrocinado', linha);

console.log(fails ? `${fails} FALHA(S) de ${total}` : `${total}/${total} ok`);
process.exit(fails ? 1 : 0);
