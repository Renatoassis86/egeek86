/**
 * #119: confirmação fresca de preço antes de mensagem/lista, troca de anúncio não é queda, link no mesmo anúncio do preço.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-confirmacao-preco-119.ts
 */
import { decidirTrocaDeAnuncio, avaliarConfirmacao, CONFIRMACAO, confirmacaoLigada, itemIdDaUrl, mesmoAnuncio, planejarLinkDoAnuncio, quedaDoMesmoAnuncio } from '../src/lib/messaging/confirmacao-preco';
import { runLivePhase, type LiveTarget } from '../src/lib/messaging/live-recheck';

process.env.AMAZON_FORA_DAS_MENSAGENS = '0'; // contencao #120 (Amazon fora das mensagens) e de outra frente: estes testes cobrem as regras de confirmacao em si
let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-15T21:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const base = { uso: 'queda' as const, rede: 'mercado-livre', status: 'active', now };

// Janelas
ok(avaliarConfirmacao({ ...base, confirmedAt: ago(10) }).ok, 'queda: 10 min ok');
ok(avaliarConfirmacao({ ...base, confirmedAt: ago(61) }).motivo === 'confirmacao_velha', 'queda: 61 min barra');
ok(avaliarConfirmacao({ ...base, uso: 'lista', confirmedAt: ago(61) }).ok, 'lista: 61 min ok');
ok(avaliarConfirmacao({ ...base, uso: 'lista', confirmedAt: ago(361) }).motivo === 'confirmacao_velha', 'lista: 361 min barra');
ok(avaliarConfirmacao({ ...base, confirmedAt: null }).motivo === 'sem_confirmacao', 'nunca confirmado (caso A1 Combo)');
ok(avaliarConfirmacao({ ...base, rede: 'amazon', confirmedAt: ago(100) }).ok && !avaliarConfirmacao({ ...base, rede: 'amazon', confirmedAt: ago(131) }).ok, 'Amazon: janela do ciclo da coleta assistida');
ok(CONFIRMACAO.QUEDA_MIN === 60 && CONFIRMACAO.LISTA_MIN === 360, 'limites do dono');
// Status e sumiço
ok(avaliarConfirmacao({ ...base, status: 'expired', confirmedAt: ago(1) }).motivo === 'oferta_inativa', 'expirada barra');
ok(avaliarConfirmacao({ ...base, quarantined: true, confirmedAt: ago(1) }).motivo === 'em_quarentena', 'quarentena barra');
ok(avaliarConfirmacao({ ...base, missCount: 1, confirmedAt: ago(1) }).motivo === 'sumiu_da_api', 'anúncio sumiu da última coleta (pausado) barra');
// Link x anúncio
ok(avaliarConfirmacao({ ...base, confirmedAt: ago(1), priceItemId: 'MLB5563781513', linkItemId: 'MLB-5563781513' }).ok, 'mesmo anúncio com e sem hífen');
ok(avaliarConfirmacao({ ...base, confirmedAt: ago(1), priceItemId: 'MLB111111111', linkItemId: 'MLB5563781513' }).motivo === 'link_de_outro_anuncio', 'link de outro anúncio barra');
ok(avaliarConfirmacao({ ...base, confirmedAt: ago(1), priceItemId: null, linkItemId: 'MLB5563781513' }).ok, 'anúncio do preço desconhecido: não inventa barreira');
// Flag
ok(avaliarConfirmacao({ ...base, confirmedAt: null }, false).ok, 'flag desligada = comportamento antigo');
ok(confirmacaoLigada({}) && !confirmacaoLigada({ CONFIRMACAO_PRECO_MENSAGEM: '0' }) && !confirmacaoLigada({ CONFIRMACAO_PRECO_MENSAGEM: 'off' }), 'flag: ligada por padrão, 0/off desliga');
// Troca de anúncio não é queda
ok(!quedaDoMesmoAnuncio('MLB5563781513', 'MLB7000000001'), 'troca de anúncio: sem queda');
ok(quedaDoMesmoAnuncio('MLB5563781513', 'MLB5563781513') && quedaDoMesmoAnuncio(null, 'MLB7000000001') && quedaDoMesmoAnuncio('MLB1', null), 'mesmo anúncio ou desconhecido: queda possível');
ok(mesmoAnuncio('MLB-1234567', 'MLB1234567') && !mesmoAnuncio(null, 'MLB1234567') && !mesmoAnuncio('', ''), 'mesmoAnuncio');
// URL
ok(itemIdDaUrl('https://produto.mercadolivre.com.br/MLB-5563781513?matt_tool=1') === 'MLB5563781513' && itemIdDaUrl('https://meli.la/2DjU21f') === null && itemIdDaUrl('https://www.mercadolivre.com.br/p/MLB53254557') === null, 'itemIdDaUrl');
// Plano de link
const p1 = planejarLinkDoAnuncio({ affiliateUrl: 'https://meli.la/2DjU21f', linkItemId: 'MLB5563781513', itemPrecificado: 'MLB7000000001', toolId: '23952458' });
ok(!!p1 && p1.affiliateUrl === 'https://produto.mercadolivre.com.br/MLB-7000000001?matt_tool=23952458' && p1.linkItemId === 'MLB7000000001' && !p1.pending, 'relink para o anúncio certo', p1);
ok(planejarLinkDoAnuncio({ affiliateUrl: 'https://meli.la/2DjU21f', linkItemId: null, itemPrecificado: 'MLB7000000001', toolId: 'x' }) === null, 'meli.la sem registro: não toca');
ok(planejarLinkDoAnuncio({ affiliateUrl: 'https://meli.la/x', linkItemId: 'MLB5563781513', itemPrecificado: 'MLB5563781513', toolId: 'x' }) === null, 'mesmo anúncio: não toca');
ok(planejarLinkDoAnuncio({ affiliateUrl: 'https://produto.mercadolivre.com.br/MLB-5563781513', linkItemId: null, itemPrecificado: 'MLB7000000001', toolId: null })?.pending === true, 'sem tool id: link pendente');

// Troca de anúncio no coletor (anúncios irmãos de catálogos diferentes)
const tr = (over: object) => decidirTrocaDeAnuncio({ itemAtual: 'MLB1', precoAtualCents: 400000, confirmadoEm: ago(20), itemNovo: 'MLB2', precoNovoCents: 450000, now, ...over });
ok(tr({}) === 'ignorar_irmao', 'irmão mais caro com o preso lido há 20 min: ignora (sem vai e volta)');
ok(tr({ precoNovoCents: 380000 }) === 'gravar', 'irmão mais barato: oferta segue o menor anúncio do vendedor');
ok(tr({ confirmadoEm: ago(240) }) === 'gravar', 'preso sem leitura há 4 h (provável pausado): irmão assume');
ok(tr({ confirmadoEm: null }) === 'gravar' && tr({ itemAtual: null }) === 'gravar' && tr({ itemNovo: 'MLB-1' }) === 'gravar', 'sem confirmação, sem anúncio preso ou mesmo anúncio: grava');

// Porteiro único das mensagens de grupo/canal: link de outro anúncio expira a mensagem (sem consultar rede).
const alvo: LiveTarget = { offerId: 'o1', role: 'original', networkSlug: 'mercado-livre', externalRef: 'MLB53254557', externalItemId: 'MLB7000000001', linkItemId: 'MLB5563781513', affiliateUrl: 'https://meli.la/2DjU21f', sellerExternalId: '3488297246', storedPriceCents: 351992, confirmedAt: ago(1), detectedPriceCents: 351992, listingIdTrusted: true };
(async () => {
  const r = await runLivePhase({ now, targets: [alvo], mode: 'single', humanApproved: false, deps: { fetchImpl: async () => { throw new Error('não deveria consultar'); } } as never });
  ok(!r.ok && /link_de_outro_anuncio/.test(r.reason ?? ''), 'live-recheck: link de outro anúncio expira', r.reason);
  const r2 = await runLivePhase({ now, targets: [{ ...alvo, linkItemId: 'MLB7000000001' }], mode: 'single', humanApproved: false, deps: {} });
  ok(r2.ok, 'live-recheck: link do mesmo anúncio e preço fresco segue', r2.reason);
  // Anúncio fora dos vencedores (pausado) com preço velho: reconferência acusa
  const catalogo = async () => ({ status: 200, json: async () => ({ results: [{ item_id: 'MLB9', price: 3900, condition: 'new', seller_id: 1 }] }) });
  const r3 = await runLivePhase({ now, targets: [{ ...alvo, linkItemId: 'MLB7000000001', confirmedAt: ago(90) }], mode: 'single', humanApproved: false, deps: { fetchImpl: catalogo as never, meliToken: async () => 't' } });
  ok(!r3.ok && /ml_anuncio_fora_dos_vencedores/.test(r3.reason ?? ''), 'live-recheck: anúncio pausado (fora dos vencedores) expira', r3.reason);
  console.log(fails ? `${fails} falha(s)` : 'OK: confirmação de preço #119');
  process.exit(fails ? 1 : 0);
})();
export {};
