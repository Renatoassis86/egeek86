/**
 * Testes do LOOP DE CUPOM 24 H (2026-11-11). SEM rede e SEM banco.
 * Uso: npx tsx --conditions=react-server scripts/test-cupons-24h.ts  (código 1 se algo falhar)
 * Cobre: batimento (validação, guard de origem+token), vigia (60 min, 1 aviso por rede a cada 6 h, parada do operador, registro) e a lógica
 * pura do leitor (scripts/chrome/cupons-24h.js: ids do produto, nunca sp_detail*, consolidação de selos, lista de cupons, link curto da
 * Shopee, bloqueios e recuo). Os textos abaixo são FIXTURES de teste escritas à mão para exercitar a lógica; NÃO são leituras reais de loja.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  HEARTBEAT_ALERT_GAP_MIN, HEARTBEAT_STALE_MIN, decidirVigia, mensagemRedeSemLeitura, parseHeartbeat, rodarVigia, situacaoBatimento,
  type RedeBatimento, type VigiaDecisao,
} from '../src/lib/coupons/heartbeat';

let fails = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`);
}

const NOW = new Date('2026-11-11T15:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const base = (over: Partial<RedeBatimento> = {}): RedeBatimento => ({ rede: 'amazon', ultimoEm: ago(5), ultimoEstado: 'ok', ultimoMotivo: null, ultimoCiclo: 3, ultimoOkEm: ago(5), ultimoAvisoEm: null, ...over });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = createRequire(__filename)(path.resolve(__dirname, 'chrome/cupons-24h.js'));

async function main() {
  // ---------------- batimento: validação ----------------
  const bom = parseHeartbeat('amazon', { estado: 'ok', ciclo: 4, fila: 15, lidas: 12, enviadas: 12, descartadas: 3, erros: 0, versao: '1.0.0', token: 'segredo', extra: 'x'.repeat(5000) });
  check('batimento válido; campo desconhecido (token/extra) é ignorado', bom.ok && bom.value.ciclo === 4 && bom.value.lidas === 12 && !('token' in bom.value) && !('extra' in bom.value), bom);
  check('estado inválido recusado', !parseHeartbeat('amazon', { estado: 'vivo' }).ok);
  check('corpo não objeto recusado', !parseHeartbeat('amazon', null).ok && !parseHeartbeat('amazon', [1]).ok && !parseHeartbeat('amazon', 'x').ok);
  const sujo = parseHeartbeat('shopee', { estado: 'pausado', motivo: 'Texto livre com <script>', ciclo: -5, fila: 1e12, lidas: 'dez' });
  check('motivo com texto livre vira null; números saneados', sujo.ok && sujo.value.motivo === null && sujo.value.ciclo === 0 && sujo.value.fila === 1_000_000 && sujo.value.lidas === 0, sujo);
  const cod = parseHeartbeat('shopee', { estado: 'parado', motivo: 'captcha_seguidos' });
  check('motivo em código curto é aceito', cod.ok && cod.value.motivo === 'captcha_seguidos');

  // ---------------- guard (origem + token) ----------------
  const { couponGuard } = await import('../src/server/coupons/ingest-guard');
  const TOKEN = 'k'.repeat(40);
  process.env.COUPON_INGEST_TOKEN = TOKEN;
  const req = (origin: string, tok: string | null) =>
    ({ headers: new Headers({ origin, ...(tok ? { authorization: `Bearer ${tok}` } : {}) }) }) as unknown as import('next/server').NextRequest;
  check('guard: aba da Amazon + token certo libera', couponGuard(req('https://www.amazon.com.br', TOKEN), 'amazon') === null);
  check('guard: aba da Shopee + token certo libera', couponGuard(req('https://shopee.com.br', TOKEN), 'shopee') === null);
  check('guard: origem cruzada (Amazon fala da Shopee) = 403', couponGuard(req('https://www.amazon.com.br', TOKEN), 'shopee')?.status === 403);
  check('guard: origem desconhecida = 403', couponGuard(req('https://evil.example', TOKEN), 'amazon')?.status === 403);
  check('guard: token errado = 401', couponGuard(req('https://www.amazon.com.br', 'z'.repeat(40)), 'amazon')?.status === 401);
  check('guard: sem token = 401', couponGuard(req('https://www.amazon.com.br', null), 'amazon')?.status === 401);
  delete process.env.COUPON_INGEST_TOKEN;
  delete process.env.ASSISTED_INGEST_TOKEN;
  delete process.env.AMAZON_INGEST_TOKEN;
  check('guard: servidor sem token configurado = 503 (kill-switch)', couponGuard(req('https://www.amazon.com.br', TOKEN), 'amazon')?.status === 503);

  // ---------------- vigia: decisão ----------------
  check('vigia: batimento ok há 5 min = em dia', decidirVigia(base(), NOW).acao === 'em_dia');
  check(`vigia: exatamente ${HEARTBEAT_STALE_MIN} min ainda em dia`, decidirVigia(base({ ultimoOkEm: ago(60), ultimoEm: ago(60) }), NOW).acao === 'em_dia');
  check('vigia: 61 min sem batimento ok = avisar', decidirVigia(base({ ultimoOkEm: ago(61), ultimoEm: ago(61) }), NOW).acao === 'avisar');
  check('vigia: nunca houve batimento = nunca_iniciou (não avisa)', decidirVigia(base({ ultimoEm: null, ultimoOkEm: null, ultimoEstado: null }), NOW).acao === 'nunca_iniciou');
  check('vigia: último sinal há mais de 7 dias = inativo (não avisa)', decidirVigia(base({ ultimoEm: ago(8 * 1440), ultimoOkEm: ago(8 * 1440) }), NOW).acao === 'inativo_ha_dias');
  check('vigia: parada pedida pelo operador não avisa', decidirVigia(base({ ultimoOkEm: ago(300), ultimoEm: ago(2), ultimoEstado: 'parado', ultimoMotivo: 'operador' }), NOW).acao === 'parado_pelo_operador');
  check('vigia: parada por captcha avisa depois de 60 min sem ok', decidirVigia(base({ ultimoOkEm: ago(130), ultimoEm: ago(70), ultimoEstado: 'parado', ultimoMotivo: 'captcha_seguidos' }), NOW).acao === 'avisar');
  check('vigia: pausa curta (30 min) com batimentos de pausa não avisa', decidirVigia(base({ ultimoOkEm: ago(40), ultimoEm: ago(10), ultimoEstado: 'pausado', ultimoMotivo: 'captcha' }), NOW).acao === 'em_dia');
  check('vigia: pausa longa (só pausas, ok há 3 h) avisa', decidirVigia(base({ ultimoOkEm: ago(180), ultimoEm: ago(20), ultimoEstado: 'pausado', ultimoMotivo: 'captcha' }), NOW).acao === 'avisar');
  check(`vigia: aviso há 5 h (< ${HEARTBEAT_ALERT_GAP_MIN / 60} h) = aviso_recente, sem novo aviso`, decidirVigia(base({ ultimoOkEm: ago(200), ultimoEm: ago(200), ultimoAvisoEm: ago(5 * 60) }), NOW).acao === 'aviso_recente');
  check('vigia: aviso há 6 h 1 min libera novo aviso', decidirVigia(base({ ultimoOkEm: ago(500), ultimoEm: ago(500), ultimoAvisoEm: ago(6 * 60 + 1) }), NOW).acao === 'avisar');
  check('painel: situação em dia / sem leitura / pausado / parado / nunca',
    situacaoBatimento(base(), NOW) === 'em_dia' && situacaoBatimento(base({ ultimoOkEm: ago(90), ultimoEm: ago(90) }), NOW) === 'sem_leitura'
    && situacaoBatimento(base({ ultimoEstado: 'pausado' }), NOW) === 'pausado' && situacaoBatimento(base({ ultimoEstado: 'parado' }), NOW) === 'parado'
    && situacaoBatimento(base({ ultimoEm: null, ultimoOkEm: null }), NOW) === 'nunca');
  const msg = mensagemRedeSemLeitura(decidirVigia(base({ ultimoOkEm: ago(130), ultimoEm: ago(130) }), NOW), base({ ultimoOkEm: ago(130), ultimoEm: ago(130) }));
  check('mensagem do aviso cita a rede, o tempo e o limite, sem a palavra proibida', /Amazon/.test(msg) && /2 h/.test(msg) && /60 min/.test(msg) && !/afiliad/i.test(msg), msg);

  // ---------------- vigia: execução com dependências falsas ----------------
  const registros: { rede: string; enviado: boolean; motivo: string | null }[] = [];
  const enviados: string[] = [];
  const linhas = [base({ rede: 'amazon', ultimoOkEm: ago(130), ultimoEm: ago(130) }), base({ rede: 'shopee', ultimoOkEm: ago(3), ultimoEm: ago(3) })];
  const deps = (over: Partial<Parameters<typeof rodarVigia>[0]> = {}): Parameters<typeof rodarVigia>[0] => ({
    redes: ['amazon', 'shopee'], now: NOW, lerBatimentos: async () => linhas,
    registrar: async (d: VigiaDecisao, enviado, motivo) => { registros.push({ rede: d.rede, enviado, motivo }); },
    enviar: async (t) => { enviados.push(t); return true; }, ...over,
  });
  let r = await rodarVigia(deps());
  check('execução: avisa só a rede parada e registra rede_sem_leitura', r.avisados.join() === 'amazon' && enviados.length === 1 && registros.length === 1 && registros[0].rede === 'amazon' && registros[0].enviado, { r, registros });
  registros.length = 0; enviados.length = 0;
  linhas[0] = base({ rede: 'amazon', ultimoOkEm: ago(400), ultimoEm: ago(400), ultimoAvisoEm: ago(30) });
  r = await rodarVigia(deps());
  check('execução: segunda passada dentro de 6 h não repete (sem spam)', r.avisados.length === 0 && enviados.length === 0 && registros.length === 0);
  linhas[0] = base({ rede: 'amazon', ultimoOkEm: ago(400), ultimoEm: ago(400) });
  r = await rodarVigia(deps({ enviar: null }));
  check('execução: sem canal interno configurado, registra com motivo e não avisa', r.avisados.length === 0 && registros.length === 1 && !registros[0].enviado && registros[0].motivo === 'canal_interno_nao_configurado', registros);
  registros.length = 0;
  r = await rodarVigia(deps({ enviar: async () => { throw new Error('telegram fora'); } }));
  check('execução: falha no envio não lança e fica registrada', registros.length === 1 && registros[0].motivo === 'falha_no_envio' && r.avisados.length === 0);
  r = await rodarVigia(deps({ lerBatimentos: async () => { throw new Error('tabela ausente'); } }));
  check('execução: collector_runs ausente = nada acontece, sem erro', r.decisoes.length === 0);
  r = await rodarVigia(deps({ lerBatimentos: async () => [] }));
  check('execução: rede sem nenhuma linha = nunca_iniciou (não avisa)', r.decisoes.every((d) => d.acao === 'nunca_iniciou') && r.avisados.length === 0);

  // ---------------- leitor: lógica pura (fixtures) ----------------
  const ASIN = 'B0TESTE001'; // FIXTURE
  check('centsFrom lê R$ 1.234,56 e R$20', P.centsFrom('R$ 1.234,56') === 123456 && P.centsFrom('de R$20') === 2000 && P.centsFrom('sem preço') === null);
  const anc = ['centerCol', 'ppd'];
  check('ids do próprio produto são aceitos', P.idProprioAmazon('couponsInBuybox_feature_div', anc, ASIN) && P.idProprioAmazon('couponBadgeRegularVpc', anc, ASIN) && P.idProprioAmazon('couponTextpctch123', anc, ASIN));
  check('NUNCA sp_detail*: id de outro produto recusado', !P.idProprioAmazon('sp_detail2_couponBadge', anc, ASIN) && !P.idProprioAmazon('couponBadgeRegularVpc', ['sp_detail_thematic'], ASIN) && !P.idProprioAmazon('couponBadgeRegularVpc', ['a-carousel-viewport'], ASIN));
  check('id com ASIN de outro produto recusado; com o mesmo aceito', !P.idProprioAmazon('couponTextpctchB0OUTRO999', anc, ASIN) && P.idProprioAmazon(`couponTextpctch${ASIN}`, anc, ASIN));
  check('id fora da lista (couponBadgeSubtext, promoPriceBlock) recusado', !P.idProprioAmazon('couponBadgeSubtext', anc, ASIN) && !P.idProprioAmazon('promoPriceBlockMessage_feature_div', anc, ASIN));
  const selos = P.selosAmazon([
    { id: 'couponsInBuybox_feature_div', texto: 'Economize 10% ao aplicar o cupom Termos', ancestorIds: anc },
    { id: 'couponBadgeRegularVpc', texto: 'Economize 10% ao aplicar o cupom', ancestorIds: ['couponsInBuybox_feature_div'] },
    { id: 'sp_detail_couponBadge', texto: 'Cupom de 50% de outro produto', ancestorIds: [] },
    { id: 'couponTextpctch1', texto: 'Exclusivo Prime', ancestorIds: anc },
  ], ASIN);
  check('selos: mantém o texto mais completo, descarta duplicata contida, outro produto e texto sem "cupom"', selos.length === 1 && selos[0] === 'Economize 10% ao aplicar o cupom Termos', selos);
  check('selo "Cupom Exclusivo Prime" é lido (o servidor é quem recusa)', P.selosAmazon([{ id: 'couponTextpctch1', texto: 'Cupom exclusivo Prime de 5%', ancestorIds: anc }], ASIN).length === 1);

  const url = P.descobrirUrlCupons([{ text: 'Mais vendidos', href: '/gp/bestsellers' }, { text: ' Cupons ', href: '/promocoes/cupons?ref=nav' }], 'https://www.amazon.com.br');
  check('descobre a URL de cupons pelo texto do menu (FIXTURE)', url === 'https://www.amazon.com.br/promocoes/cupons?ref=nav', url);
  check('descoberta ignora links de fora da Amazon e menu sem cupons', P.descobrirUrlCupons([{ text: 'Cupons', href: 'https://outro.com/cupons' }, { text: 'Ofertas', href: '/deals' }], 'https://www.amazon.com.br') === null);
  const lista = P.parseListaCupons([
    { href: '/Produto-X/dp/B0AAAAAAAA/ref=cm', texto: 'Produto X Economize 15% com cupom. Aplicar' },
    { href: '/dp/B0BBBBBBBB', texto: 'Produto sem selo nenhum' },
    { href: '/dp/B0AAAAAAAA', texto: 'Repetido: cupom de R$ 10' },
    { href: '/gp/product/B0CCCCCCCC', texto: 'Cupom de R$ 20 em compras acima de R$ 100.' },
  ]);
  check('lista de cupons: só cards com cupom escrito, ASIN do link, sem repetir', lista.length === 2 && lista[0].asin === 'B0AAAAAAAA' && lista[1].asin === 'B0CCCCCCCC' && /cupom/i.test(lista[0].label), lista);
  const ord = P.ordenarFila([{ ref: 'B0XXXXXXXX' }, { ref: 'b0cccccccc' }, { ref: 'B0YYYYYYYY' }], ['B0CCCCCCCC']);
  check('fila reordenada: ASIN da lista oficial vai para a frente, ordem relativa mantida', ord.map((i: { ref: string }) => i.ref).join() === 'b0cccccccc,B0XXXXXXXX,B0YYYYYYYY');

  const curto = P.limparUrlShopee('https://s.shopee.com.br/AbCdEf');
  check('Shopee: link curto de afiliado é marcado como curto', curto.curto === true);
  const normal = P.limparUrlShopee('https://shopee.com.br/produto-i.123.4567890123?utm_source=x&af_siteid=1&sp_atk=abc&xptdk=z');
  check('Shopee: link normal perde parâmetros de rastreio/afiliado', normal.curto === false && !/utm_|af_|xptdk/.test(normal.url) && /i\.123\.4567890123/.test(normal.url), normal);
  check('Shopee: domínio de fora recusado', P.limparUrlShopee('https://evil.example/x').url === null);
  check('Shopee: itemId extraído das duas formas de URL', P.itemIdShopee('https://shopee.com.br/x-i.123.4567890123') === '4567890123' && P.itemIdShopee('https://shopee.com.br/product/123/4567890123') === '4567890123' && P.itemIdShopee('https://shopee.com.br/') === null);
  const vs = P.selosShopee(['R$10 OFF Mín. gasto R$99', 'Frete grátis para você', '10% OFF Máx. R$ 20 Voucher da loja', 'x'.repeat(300)]);
  check('Shopee: rótulo de voucher ganha prefixo "Voucher" e frete grátis/ruído fica fora', vs.length === 2 && vs.every((s: string) => /voucher/i.test(s)), vs);
  check('Shopee: preço = primeiro valor R$ lido', P.precoShopee(['', 'R$ 89,90 - R$ 120,00']) === 8990 && P.precoShopee(['sem preço']) === null);

  check('bloqueio: 429 e 403 do site', P.detectarBloqueio({ status: 429 }) === 'http_429' && P.detectarBloqueio({ status: 403 }) === 'http_403');
  check('bloqueio: captcha por rota e por texto', P.detectarBloqueio({ pathname: '/errors/validateCaptcha' }) === 'captcha' && P.detectarBloqueio({ texto: 'Digite os caracteres que você vê abaixo' }) === 'captcha');
  check('bloqueio: login por rota; "faça login" do menu NÃO bloqueia quando o preço foi lido', P.detectarBloqueio({ pathname: '/ap/signin' }) === 'login' && P.detectarBloqueio({ texto: 'Olá, faça login', temPreco: true }) === null && P.detectarBloqueio({ texto: 'Fazer login para continuar', temPreco: false }) === 'login');
  check('sem bloqueio em página normal', P.detectarBloqueio({ pathname: '/dp/B0TESTE001', texto: 'Produto bom R$ 10', temPreco: true }) === null);

  const seq = [1, 2, 3, 4, 9].map((n) => P.politica('captcha', n));
  check('recuo: captcha pausa 15, 30 e fica em 30 min (teto)', seq.every((p: { acao: string }) => p.acao === 'pausar') && seq.map((p: { min: number }) => p.min).join() === '15,30,30,30,30', seq);
  const tipos = ['captcha', 'login', 'token_recusado', 'origem_recusada', 'popup_bloqueado', 'http_403', 'http_429', 'servidor_desligado', 'servidor_instavel', 'qualquer_outro'];
  check('NENHUM LOOP PARA: nenhum tipo, em nenhuma ocorrência, devolve parar; teto de recuo 30 min', tipos.every((t) => [1, 2, 5, 50, 500].every((n) => { const p = P.politica(t, n); return p.acao === 'pausar' && p.min >= 1 && p.min <= 30; })));
  check('servidor desligado (503) recua e retoma', P.politica('servidor_desligado', 1).acao === 'pausar' && P.politica('servidor_desligado', 1).min === 10);
  check('pausa entre itens respeita o piso mínimo', P.pausaEntreItens([1000, 2000], 0, 4000) === 4000 && P.pausaEntreItens([6000, 11000], 1, 4000) === 11000 && P.pausaEntreItens([6000, 11000], 0, 4000) === 6000);

  const ok = P.validarCfg({ api: 'https://site.example/', token: 't'.repeat(40), rede: 'amazon', enviar: true }, 'www.amazon.com.br');
  check('cfg válida: api sem barra final, enviar só com true estrito, link curto da Shopee pulado por padrão', ok.ok && ok.cfg.api === 'https://site.example' && ok.cfg.enviar === true && ok.cfg.shopeeLinkCurto === 'pular' && ok.cfg.lote === 15);
  check('cfg: enviar "true" (string) não liga a gravação', P.validarCfg({ api: 'https://s.example', token: 't'.repeat(40), rede: 'amazon', enviar: 'true' }, 'www.amazon.com.br').cfg.enviar === false);
  check('cfg inválida: aba errada, token curto, api sem https, rede desconhecida', !P.validarCfg({ api: 'https://s.example', token: 't'.repeat(40), rede: 'shopee' }, 'www.amazon.com.br').ok && !P.validarCfg({ api: 'https://s.example', token: 'curto', rede: 'amazon' }, 'www.amazon.com.br').ok && !P.validarCfg({ api: 'http://s.example', token: 't'.repeat(40), rede: 'amazon' }, 'www.amazon.com.br').ok && !P.validarCfg({ api: 'https://s.example', token: 't'.repeat(40), rede: 'ml' }, 'www.amazon.com.br').ok);
  check('cfg inválida não ecoa o token na mensagem', !JSON.stringify(P.validarCfg({ api: 'ftp://x', token: 'SEGREDOSEGREDOSEGREDOSEGREDOSEGREDO12', rede: 'amazon' }, 'www.amazon.com.br')).includes('SEGREDO'));

  // o arquivo do loop não pode carregar credencial nem armazenamento persistente
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.resolve(__dirname, 'chrome/cupons-24h.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  check('loop: sem localStorage/sessionStorage/IndexedDB/cookie e sem prompt()', !/localStorage|sessionStorage|indexedDB|document\.cookie|\bprompt\(/.test(src));
  check('loop: nunca usa seletor sp_detail como fonte de selo', !/querySelector(All)?\([^)]*sp_detail/.test(src));

  console.log(`\n${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
