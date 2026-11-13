/**
 * Testes do LEITOR DE PROMOÇÕES DA AMAZON (2026-11-12). SEM rede e SEM banco.
 * Uso: npx tsx --conditions=react-server scripts/test-amazon-promocoes.ts  (código 1 se algo falhar)
 * Fixtures REAIS lidas pela aba logada do dono (somente leitura) em scripts/fixtures/amazon-cupons/. Cobre: título/validade/restrições,
 * cards, contrato de /api/ingest/cupons (validateCoupon), agulha (preço derivado, validade, público) e a lógica pura do loop.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {
  brlCents, cardEhDaLista, confirmarNoItem, cupomDoItem, departamentoCompativel, verticaisDaCategoria, fonteUrl, nomeDaPromocao, parsePromoCards, parsePromoPage, parseValidade, precoCasa, precoComPromocao, type PromoPayload,
} from '../src/lib/coupons/amazon-promocoes';
import { validateCoupon } from '../src/server/coupons/normalize';
import { evaluateAgulha } from '../src/lib/coupons/agulha';

let fails = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}
const fx = (n: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures/amazon-cupons', n), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = createRequire(__filename)(path.resolve(__dirname, 'chrome/amazon-promocoes.js'));
const NOW = new Date('2026-11-12T18:00:00Z');

async function main() {
  // ---------------- regra, validade, restrição ----------------
  const sup = fx('psp-app-suplementos.json');
  const r = parsePromoPage(sup.promo as PromoPayload, NOW);
  check('Suplementos: lida (15%, só app, categoria Suplementos)', r.ok && r.promo.percentual === 15 && r.promo.soApp && r.promo.categoria === 'Suplementos' && r.promo.restricao === null, r);
  check('Suplementos: fim = hora dos termos (23:59 BRT = 02:59Z do dia seguinte)', r.ok && r.promo.validUntil === '2026-12-01T02:59:00.000Z', r.ok && r.promo.validUntil);
  check('Suplementos: início do banner (09:00 BRT = 12:00Z)', r.ok && r.promo.validFrom === '2026-11-03T12:00:00.000Z', r.ok && r.promo.validFrom);
  check('Suplementos: termos curtos (vendido pela Amazon; só físico)', r.ok && r.promo.termosCurtos.length === 2, r.ok && r.promo.termosCurtos);

  const semTermos = parsePromoPage({ ...sup.promo, termos: '' }, NOW);
  check('Data sem hora e sem termos: conservador (00:00 BRT do último dia)', semTermos.ok && semTermos.promo.validUntil === '2026-11-30T03:00:00.000Z' && /sem hora lida/.test(semTermos.promo.validityRaw), semTermos);
  check('Hora do termos de OUTRO dia não é usada', (() => {
    const x = parseValidade(sup.promo.banner, 'expirando às 23:59 do dia 15 de Novembro de 2026');
    return x.until === '2026-11-30T03:00:00.000Z';
  })());
  const prime1 = fx('psp-prime-20pct-1item.json');
  const p1 = parsePromoPage(prime1.promo, NOW);
  check('20% em 1 item (banner com hora 23:55): fim 02:55Z; Prime => restrita', p1.ok && p1.promo.validUntil === '2026-11-19T02:55:00.000Z' && p1.promo.restricao === 'prime' && p1.promo.minItens === 1, p1);
  const liv = fx('psp-prime-livros-4.json');
  const pl = parsePromoPage(liv.promo, NOW);
  check('Compre 4 livros Prime: restrita, 4 itens', pl.ok && pl.promo.restricao === 'prime' && pl.promo.minItens === 4, pl);
  const depois = parsePromoPage(sup.promo, new Date('2026-12-01T03:00:00Z'));
  check('Promoção vencida pela validade lida = recusada', !depois.ok && depois.reason === 'promocao_encerrada', depois);
  check('Sem validade lida = recusada (nunca inferida)', (() => { const x = parsePromoPage({ id: 'A2G3U1520PCGB0', titulo: 'Só no app: 10% off em Panelas', banner: 'Só no app: 10% off em Panelas', termos: '' }, NOW); return !x.ok && x.reason === 'sem_validade_lida'; })());
  check('Título sem % = recusado', (() => { const x = parsePromoPage({ id: 'A2G3U1520PCGB0', titulo: 'Leve 3 pague 2 em Livros', banner: 'De terça-feira 3 de novembro de 2026 às 09:00 BRT até segunda-feira 30 de novembro de 2026', termos: '' }, NOW); return !x.ok && x.reason === 'sem_percentual'; })());

  // classificação dos títulos reais
  const BANNER = 'De terça-feira 3 de novembro de 2026 às 09:00 BRT até segunda-feira 30 de novembro de 2026';
  const cls = (t: string) => { const x = parsePromoPage({ id: 'A2G3U1520PCGB0', titulo: t, banner: `${t} ${BANNER}`, termos: '' }, NOW); return x.ok ? { pct: x.promo.percentual, app: x.promo.soApp, res: x.promo.restricao, cat: x.promo.categoria } : x.reason; };
  const esperado: Record<string, unknown> = {
    'Só no app: 20% off em Limpeza': { pct: 20, app: true, res: null, cat: 'Limpeza' },
    'Só no app - 15% off em Alimentos e Bebidas': { pct: 15, app: true, res: null, cat: 'Alimentos e Bebidas' },
    'App only: 20% off em 2 Bebidas Alcoólicas': { pct: 20, app: true, res: 'quantidade', cat: null },
    'Exclusivo Prime: Economize 25% em 2 itens': { pct: 25, app: false, res: 'prime', cat: null },
    'Exclusivo Prime: Só no app - 20% off em Futebol': { pct: 20, app: true, res: 'prime', cat: 'Futebol' },
    'Exclusivo Prime: A partir de R$10: Compre 6 e ganhe 30% OFF': { pct: 30, app: false, res: 'prime', cat: null },
    'Só no app: 50% off em Construção': { pct: 50, app: true, res: null, cat: 'Construção' },
    'Só no app: 15% off em Brinquedos e Jogos': { pct: 15, app: true, res: null, cat: 'Brinquedos e Jogos' },
  };
  for (const [t, esp] of Object.entries(esperado)) { const got = cls(t); check(`título real: ${t}`, JSON.stringify(got) === JSON.stringify(esp), got); }
  check('Título "Compre 6 e ganhe" sem Prime = quantidade', (() => { const x = cls('A partir de R$10: Compre 6 e ganhe 30% OFF') as { res: string }; return x.res === 'quantidade'; })());
  check('"Leve 10% off" NÃO é quantidade; "off em 24 horas" também não', (() => { const a = cls('Leve 10% off em Livros') as { res: unknown }; const b = cls('Só no app: 15% off em 24 horas') as { res: unknown }; return a.res === null && b.res === null; })(), [cls('Leve 10% off em Livros'), cls('Só no app: 15% off em 24 horas')]);
  check('Título "seguir a loja" = restrita', (() => { const x = cls('Siga a loja e seguir ganha 10% off') as { res: string }; return x.res === 'seguir_loja'; })());

  // ---------------- cards ----------------
  const cards = parsePromoCards([...sup.itens, { a: 'b07y8k3qsk', p: '1,00' }, { a: 'curto', p: '1,00' }, { a: 'B0AAAAAAAA', p: 'sem preço' }, ...liv.itens]);
  check('cards: 3 + 3 válidos; repetido, ASIN inválido e sem preço descartados', cards.length === 6 && cards[0].asin === 'B07Y8K3QSK' && cards[0].priceCents === 43106, cards.map((c) => c.asin));
  check('cards: preço anterior só quando maior', cards.find((c) => c.asin === '655552894X')?.listCents === 1990 && cards[0].listCents === null);
  check('brlCents: milhar e centavos', brlCents('1.234,56') === 123456 && brlCents('R$ 431,06') === 43106 && brlCents('abc') === null);
  check('precoCasa: ±30% do banco', precoCasa(43106, 40000) && !precoCasa(43106, 20000) && !precoCasa(1000, 0));
  check('preço derivado da regra: 431,06 com 15% = 366,40 (arredondado à loja)', precoComPromocao(43106, 15) === 36640, precoComPromocao(43106, 15));

  // ---------------- contrato /api/ingest/cupons + agulha ----------------
  if (!r.ok) throw new Error('fixture inválida');
  const corpo = cupomDoItem(r.promo, { asin: 'B07Y8K3QSK', offerId: '11111111-2222-4333-8444-555555555555' }, fonteUrl(r.promo.id));
  const ctx = { network: 'amazon' as const, batchSourceUrl: fonteUrl(r.promo.id), readAt: NOW.toISOString(), readAccount: null };
  const v = validateCoupon(corpo, ctx);
  check('cupom do item passa no contrato (validateCoupon) com escopo produto', v.ok && v.coupon.scopeKind === 'produto' && v.coupon.scope.item_ids?.[0] === 'B07Y8K3QSK' && v.coupon.validitySource === 'texto_da_pagina' && v.coupon.audience === 'todos', v);
  const v2 = validateCoupon(cupomDoItem({ ...r.promo, termosCurtos: [] }, { asin: 'B07Y8K3QSK', offerId: '11111111-2222-4333-8444-555555555555' }, fonteUrl(r.promo.id)), ctx);
  check('hash de dedup não depende dos termos (lidos às vezes, às vezes não)', v.ok && v2.ok && v.coupon.dedupHash === v2.coupon.dedupHash);
  const v3 = validateCoupon(cupomDoItem(r.promo, { asin: 'B0D1YMVG66', offerId: '11111111-2222-4333-8444-555555555556' }, fonteUrl(r.promo.id)), ctx);
  check('ASIN diferente = cupom diferente (estável mesmo se os outros cards mudarem)', v.ok && v3.ok && v.coupon.dedupHash !== v3.coupon.dedupHash);
  check('texto do cupom sem "% off" cru nem "afiliado"', v.ok && !/% ?off/i.test(nomeDaPromocao(r.promo.titulo)) && !/afiliad/i.test(JSON.stringify(corpo)), nomeDaPromocao(r.promo.titulo));
  check('nome da promoção reescrito', nomeDaPromocao('Só no App: 15% off em Suplementos') === 'Só no App: 15% de desconto em Suplementos', nomeDaPromocao('Só no App: 15% off em Suplementos'));

  const rule = { kind: 'percentual' as const, valueNum: 15, minOrderCents: null, maxDiscountCents: null, validUntil: r.promo.validUntil, state: 'verificado', audience: 'todos', eligibleOnReadAccount: null, scopeKind: 'produto' as const, conditionsRaw: 'x' };
  const ag = evaluateAgulha({ source: 'loja_categoria', now: NOW, offer: { network: 'amazon', vertical: 'casa', priceCents: 43106 }, verifiedAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(), validUntil: r.promo.validUntil, rule });
  check('agulha (Amazon, lista): passa com leitura fresca; preço final derivado 15%', ag.ok && ag.finalPriceCents === 36640, ag);
  const agVelha = evaluateAgulha({ source: 'loja_categoria', now: NOW, offer: { network: 'amazon', vertical: 'casa', priceCents: 43106 }, verifiedAt: new Date(NOW.getTime() - 200 * 60_000).toISOString(), validUntil: r.promo.validUntil, rule });
  check('agulha: leitura de 200 min = descartada (frescor 120)', !agVelha.ok && agVelha.reason === 'leitura_antiga', agVelha);
  const agVenc = evaluateAgulha({ source: 'loja_categoria', now: new Date('2026-12-01T02:50:00Z'), offer: { network: 'amazon', vertical: 'casa', priceCents: 43106 }, verifiedAt: '2026-12-01T02:40:00Z', validUntil: r.promo.validUntil, rule });
  check('agulha: faltando < 15 min para o fim = descartada', !agVenc.ok && agVenc.reason === 'validade_proxima_do_fim', agVenc);
  const agPub = evaluateAgulha({ source: 'loja_categoria', now: NOW, offer: { network: 'amazon', vertical: 'casa', priceCents: 43106 }, verifiedAt: NOW.toISOString(), validUntil: r.promo.validUntil, rule: { ...rule, audience: 'assinantes' } });
  check('agulha: público restrito (Prime) = descartado', !agPub.ok && agPub.reason === 'publico_restrito', agPub);

  // texto da mensagem (lookup do servidor)
  const { amazonPromoText } = await import('../src/server/messaging/coupon-lookup');
  const t = amazonPromoText({ conditionsRaw: String(corpo.condicoes_texto), valueNum: 15 });
  check('mensagem: nome = título da promoção; condição diz "só pelo app" e que não há código', t.name === 'Só no App: 15% de desconto em Suplementos', t);
  const t2 = amazonPromoText({ conditionsRaw: String(corpo.condicoes_texto), valueNum: 15, termos: 'vale só para itens vendidos pela Amazon.com.br (não por vendedores parceiros)' });
  check('mensagem: termo "vendidos pela Amazon" só aparece quando lido; senão manda conferir', /vendidos pela Amazon\.com\.br \(não/.test(t2.conditions) && /Confira no anúncio se o item é vendido/.test(t.conditions) && !/não por vendedores/.test(t.conditions));
  check('mensagem: sem palavra "afiliado"', !/afiliad/i.test(t.conditions + t.name));

  // ---------------- lógica pura do loop ----------------
  check('loop: ids de promoção do HTML (sem repetir)', JSON.stringify(L.idsDePromocao('<a href="/promotion/psp/A2G3U1520PCGB0?ref=x">a</a><a href="https://www.amazon.com.br/promotion/psp/A29MK98EPUD5DV">b</a>/promotion/psp/A2G3U1520PCGB0')) === '["A2G3U1520PCGB0","A29MK98EPUD5DV"]');
  check('loop: título restrito (Prime, compre N, em 2 itens, seguir)', L.tituloRestrito('Exclusivo Prime: 20% off em Automotivo', '') && L.tituloRestrito('App only: 20% off em 2 Bebidas Alcoólicas', '') && L.tituloRestrito('Compre 3 e ganhe 15% off', '') && L.tituloRestrito('x', 'seguir a loja') && !L.tituloRestrito('Leve 10% off em Livros', ''));
  check('loop: título livre não é restrito', !L.tituloRestrito('Só no app: 20% off em Limpeza', 'Só no app: 20% off em Limpeza De terça-feira') && !L.tituloRestrito('20% de desconto em 1 item(ns)', ''));
  check('loop: preço whole+fraction', L.precoDe('1.234', '56') === '1234,56' && L.precoDe('13', '9') === '13,90' && L.precoDe('', '90') === null);
  check('loop: bloqueios', L.detectarBloqueio({ status: 429 }) === 'http_429' && L.detectarBloqueio({ pathname: '/errors/validateCaptcha' }) === 'captcha' && L.detectarBloqueio({ texto: 'Fazer login', temCards: false }) === 'login' && L.detectarBloqueio({ texto: 'Fazer login', temCards: true }) === null);
  check('loop: política nunca para (teto 30 min)', [1, 2, 3, 9].every((n) => ['captcha', 'servidor_instavel', 'xyz'].every((k) => { const p = L.politica(k, n); return p.acao === 'pausar' && p.min <= 30; })));
  check('loop: cfg válida e token curto/host errado recusados', L.validarCfg({ api: 'https://www.egeek86.com', token: 'k'.repeat(40), enviar: true }, 'www.amazon.com.br').ok && !L.validarCfg({ api: 'https://x.com', token: 'curto' }, 'www.amazon.com.br').ok && !L.validarCfg({ api: 'https://x.com', token: 'k'.repeat(40) }, 'shopee.com.br').ok);
  check('loop: cfg não devolve token em mensagem de erro', !JSON.stringify(L.validarCfg({ api: 'http://x', token: 'segredo'.repeat(10) }, 'www.amazon.com.br')).includes('segredo'));
  check('loop: cópia em scripts/chrome idêntica à de public/loops', fs.readFileSync(path.resolve(__dirname, 'chrome/amazon-promocoes.js'), 'utf8') === fs.readFileSync(path.resolve(__dirname, '../public/loops/amazon-promocoes.js'), 'utf8'));

  // ---------------- incidente 2026-11-13: Relógios x Resident Evil 2 ----------------
  // Cadeias de ancestrais REAIS lidas em /promotion/psp/A2N6WD5SKSR3G5 (69 cards na lista, 12 em 2 carrosséis rhf).
  const ancLista = [{ tag: 'DIV', id: '' }, { tag: 'LI', cls: 'productGrid' }, { tag: 'UL', id: 'productInfoList', cls: 'a-unordered-list' }, { tag: 'DIV', id: 'productInfoList_gridItem' }, { tag: 'DIV', id: 'promotionShoppingPageGlobalContainer' }, { tag: 'DIV', id: 'a-page' }];
  const ancRhf = [{ tag: 'DIV', id: 'CardInstance4d3H1iLjoCEehzzEI9m-2w', cls: 'a-carousel-card' }, { tag: 'RHF-SHOVELER', id: '' }, { tag: 'RHF-CONTAINER', id: 'rhf-container' }, { tag: 'DIV', id: 'a-page' }];
  const ancRhfDentroDaLista = [...ancRhf, { tag: 'UL', id: 'productInfoList' }];
  check('leitor: card da lista da regra (#productInfoList) entra', cardEhDaLista(ancLista) && L.cardEhDaLista(ancLista));
  check('leitor: card do carrossel rhf (recomendados/histórico) NÃO entra', !cardEhDaLista(ancRhf) && !L.cardEhDaLista(ancRhf));
  check('leitor: carrossel nunca entra, nem aninhado na lista; sem lista = nada entra', !cardEhDaLista(ancRhfDentroDaLista) && !L.cardEhDaLista(ancRhfDentroDaLista) && !cardEhDaLista([{ tag: 'DIV', id: 'a-page' }]) && !L.cardEhDaLista([]));
  check('departamento: jogo (games) numa promoção de Relógios NÃO casa', !departamentoCompativel('Relógios', 'games'));
  check('departamento: relógio inteligente (tecnologia) numa promoção de Relógios casa', departamentoCompativel('Relógios', 'tecnologia') && departamentoCompativel('relogios', 'eletroeletronicos'));
  check('departamento: jogo em Beleza/Suplementos/Pets/Moda/Cozinha/Esportes NÃO casa', ['Beleza Premium', 'Suplementos', 'Pets', 'Moda Feminina', 'Cozinha', 'Esportes', 'Artigos Esportivos', 'Fitness', 'Alimentos e Bebidas', 'Brinquedos e Jogos'].every((c) => !departamentoCompativel(c, 'games')));
  check('departamento: bola de vôlei (esporte) em Artigos Esportivos casa; mesa digitalizadora (tecnologia) em Acessórios Tech casa', departamentoCompativel('Artigos Esportivos', 'esporte') && departamentoCompativel('Acessórios Tech', 'tecnologia'));
  check('departamento: eletroportáteis/cozinha casam com eletrodomesticos (Casa), não com games', departamentoCompativel('Eletroportáteis', 'eletrodomesticos') && departamentoCompativel('Cozinha', 'eletrodomesticos') && !departamentoCompativel('Cozinha', 'games') && departamentoCompativel('Eletrônicos', 'eletroeletronicos'));
  check('departamento: jogo em Games casa', departamentoCompativel('Games', 'games') && departamentoCompativel('Jogos de Video Games', 'games'));
  check('departamento: em dúvida não casa (categoria nula, não mapeada, vertical vazia)', !departamentoCompativel(null, 'games') && !departamentoCompativel('Departamento Novo', 'games') && !departamentoCompativel('Games', null) && verticaisDaCategoria('Pets').length === 0);

  const ESP = { asin: 'B099TBWMWC', promoId: 'A2N6WD5SKSR3G5', percentual: 20 };
  const base = { asin: 'B099TBWMWC', psp: [] as string[], blocos: '', preco: '431,06' };
  check('item: página sem link nem selo da promoção = NÃO confirma', (() => { const x = confirmarNoItem(base, ESP, 43106); return !x.ok && x.motivo === 'sem_confirmacao_na_pagina'; })());
  check('item: link da MESMA promoção confirma; preço final derivado do desconto', (() => { const x = confirmarNoItem({ ...base, psp: ['A2N6WD5SKSR3G5'] }, ESP, 43106); return x.ok && x.evidencia === 'link_da_promocao' && x.finalCents === 34485 && !x.finalLido; })());
  check('item: link de OUTRA promoção não confirma', !confirmarNoItem({ ...base, psp: ['A30F87IW26XFD9'] }, ESP, 43106).ok);
  check('item: selo com o mesmo percentual confirma; percentual diferente não', confirmarNoItem({ ...base, blocos: 'Só no app: 20% off em Relógios' }, ESP, 43106).ok && !confirmarNoItem({ ...base, blocos: 'Economize 15% off' }, ESP, 43106).ok && !confirmarNoItem({ ...base, blocos: '120% de desconto' }, ESP, 43106).ok);
  check('item: preço final exibido incoerente com o desconto é recusado; coerente é aceito', (() => {
    const bad = confirmarNoItem({ ...base, psp: ['A2N6WD5SKSR3G5'], precoFinal: '400,00' }, ESP, 43106);
    const ok = confirmarNoItem({ ...base, psp: ['A2N6WD5SKSR3G5'], precoFinal: '344,85' }, ESP, 43106);
    return !bad.ok && bad.motivo === 'preco_final_incoerente' && ok.ok && ok.finalLido;
  })());
  check('item: ASIN diferente, sem preço e preço que não casa com a oferta são recusados', !confirmarNoItem({ ...base, asin: 'B0FC3219FN', psp: ['A2N6WD5SKSR3G5'] }, ESP, 43106).ok && !confirmarNoItem({ ...base, preco: '', psp: ['A2N6WD5SKSR3G5'] }, ESP, 43106).ok && !confirmarNoItem({ ...base, preco: '100,00', psp: ['A2N6WD5SKSR3G5'] }, ESP, 43106).ok);

  console.log(`\n${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
