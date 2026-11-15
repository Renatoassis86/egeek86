/**
 * #117: paineis vivos das impressoras 3D (ML e Amazon). Puro (tamanho, escape, ordem do dono, frescor, barreira, Amazon separada, BRL).
 * --previa: monta com dados reais e imprime resumo + 1o painel de cada rede (nunca envia). --privado | --canal: roda de verdade (rodada com cursor).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-painel-impressoras-117.ts [--previa|--privado|--canal]
 */
import { alvosLigados, brl, MAX_QUEDAS_POR_CICLO, montarPaineis, ordenar, textoQuedaSeguro, type OfertaPainel } from '../src/lib/messaging/painel-impressoras';
import { decidir, quedaMinimaCents } from '../src/lib/coupons/monitor-preco-impressoras';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-15T15:30:00Z');
let seq = 0;
const of = (nome: string, cents: number, rede = 'mercado-livre', loja: string | null = 'Loja X', horas = 1, extra: Partial<OfertaPainel> = {}): OfertaPainel =>
  ({ masterId: `m-${nome}`, masterName: nome, rede, loja, cents, url: `https://exemplo.test/${rede}/${++seq}?a=1&b=2`, checkedAt: new Date(now.getTime() - horas * 3600_000), ...extra });

ok(brl(833000) === 'R$ 8.330,00', 'BRL');
ok(alvosLigados({}).length === 0 && alvosLigados({ PAINEL_IMPRESSORAS: '1' }).join() === 'privado' && alvosLigados({ PAINEL_IMPRESSORAS: 'privado' }).join() === 'privado' && alvosLigados({ PAINEL_IMPRESSORAS: 'canal' }).length === 0, 'flag: so o privado, canal nunca');

// Ordem do dono + do menor ao maior + destaque.
const mix = [
  of('Impressora 3d Bambu Lab A1 Mini', 150000), of('Impressora 3d Bambu Lab P1s Combo', 700000), of('Impressora 3D Bambu Lab P2S Combo de FDM', 900000),
  of('Impressora 3D Bambu Lab P2S Combo de FDM', 833000), of('Impressora 3d Anycubic Kobra X', 300000), of('Impressora 3d Bambu Lab A1 Combo', 400000),
  of('Impressora 3D Creality Ender 3', 200000), of('Impressora 3d Bambu Lab X2d', 1500000),
];
const r = montarPaineis({ ofertas: mix, inicio: now, adTag: '#publicidade' });
const t0 = r.paineis[0].text;
ok(r.paineis.length === 1 && r.paineis[0].rede === 'mercado-livre', 'um painel ML', r.paineis.length);
const ordem = ['P2S Combo', 'P1S Combo', 'A1 Combo', 'A1 Mini', 'Kobra', 'X2d', 'Ender 3'].map((k) => t0.lastIndexOf(k));
ok(ordem.every((v, i) => v >= 0 && (i === 0 || v > ordem[i - 1])), 'ordem do dono (combo primeiro, Kobra, Bambu, demais)', ordem);
ok(t0.indexOf('R$ 8.330,00</a>') < t0.indexOf('R$ 9.000,00</a>'), 'menor ao maior');
ok(t0.includes('⭐') && t0.includes('MENOR PREÇO'), 'destaque P2S/P1S Combo');
ok(t0.includes('#publicidade') && t0.includes('/mercado/impressao3d'), 'rodape');
ok(/Lista de impressoras 3D · Mercado Livre · [0-9]{2}:[0-9]{2} · parte 1[/]1/.test(t0) && !/Bras[ií]lia/i.test(t0), 'hora sem Brasília');
ok(!/amazon/i.test(t0), 'ML sem Amazon');
ok(/não é medido por nós/.test(t0) && !/chega em \d|entrega em \d|prazo de \d/i.test(t0), 'prazo não afirmado');

// Muitas ofertas: várias mensagens, todas < 4096, nenhuma linha perdida, numeração por seção.
const muitas = Array.from({ length: 600 }, (_, i) => of(i % 2 ? 'Impressora 3d Bambu Lab A1 Combo' : 'Impressora 3D Bambu Lab P2S Combo de FDM', 800000 + i * 100, 'mercado-livre', `Loja <${i}> & Cia`));
const g = montarPaineis({ ofertas: muitas, inicio: now, adTag: '#publicidade' });
ok(g.paineis.length > 3 && g.paineis.every((p) => p.text.length < 4096), 'cada mensagem < 4096', g.paineis.map((p) => p.text.length));
const linhas = g.paineis.map((p) => (p.text.match(/^\d+\. /gm) ?? []).length).reduce((a, b) => a + b, 0);
ok(linhas === 600, 'sem anúncio perdido', linhas);
ok(g.paineis.every((p) => textProblems(p.text, 'tg').length === 0), 'barreira limpa em todas');
ok(g.paineis[0].text.includes('&lt;') && g.paineis[0].text.includes('&amp;'), 'escape HTML');
ok(g.paineis.some((p) => p.text.includes('(continuação)')), 'continuação marcada');
ok(g.paineis.map((p) => p.key).join() === g.paineis.map((_, i) => `ml-${String(i).padStart(2, '0')}`).join(), 'chaves posicionais estáveis');

// Frescor: > 24 h fica de fora e é contado.
const f = montarPaineis({ ofertas: [of('Impressora 3d Bambu Lab A1', 900000), of('Impressora 3d Bambu Lab A1', 100000, 'mercado-livre', 'Velha', 30)], inicio: now, adTag: '' });
ok(f.ativosMl === 1 && f.omitidasVelhas === 1 && !f.paineis[0].text.includes('R$ 1.000,00'), 'frescor 24 h', f);

// Amazon em mensagem própria, com carimbo, sem outra loja; ML nunca cita Amazon.
const a = montarPaineis({ ofertas: [of('Impressora 3D Bambu Lab P2S Combo', 850000, 'amazon', null), of('Impressora 3D Bambu Lab P2S Combo', 833000)], inicio: now, adTag: '#publicidade' });
const am = a.paineis.find((p) => p.rede === 'amazon');
const ml = a.paineis.find((p) => p.rede === 'mercado-livre');
ok(!!am && !!ml && a.problemas.length === 0, 'duas redes, sem problema', a.problemas);
ok(/Preço na Amazon em \d{2}\/\d{2} às \d{2}:\d{2}/.test(am!.text) && !/mercado ?livre|shopee/i.test(am!.text), 'Amazon com carimbo e sem outra loja');
ok(!/amazon/i.test(ml!.text), 'ML sem menção à Amazon');

// Cupom / cartão no resumo; tipo desconhecido nunca "ative".
const c = montarPaineis({ ofertas: [of('Impressora 3D Bambu Lab P2S Combo', 900000, 'mercado-livre', 'L', 1, { cupomFinalCents: 850000, cupomNome: 'R$ 50 OFF em HD', beneficios: [{ rotulo: 'Itaú Mastercard 15%', needsConfirm: true }] })], inicio: now, adTag: '' });
ok(c.paineis[0].text.includes('R$ 50 OFF em HD') && c.paineis[0].text.includes('R$ 8.500,00') && c.paineis[0].text.includes('Itaú Mastercard 15%') && c.paineis[0].text.includes('a confirmar no carrinho'), 'cupom nomeado e cartão a confirmar');
const c2 = montarPaineis({ ofertas: [of('Impressora 3D Bambu Lab P2S Combo', 900000, 'mercado-livre', 'L', 1, { cupomFinalCents: 850000 })], inicio: now, adTag: '' });
ok(c2.paineis[0].text.includes('com cupom') && !/ative/i.test(c2.paineis[0].text), 'cupom sem nome: rótulo do valor, sem "ative"');

// Barreira: loja vetada sai, painel segue.
const b = montarPaineis({ ofertas: [of('Impressora 3d Bambu Lab A1', 800000, 'mercado-livre', 'Loja Afiliada'), of('Impressora 3d Bambu Lab A1', 900000)], inicio: now, adTag: '' });
ok(b.ativosMl === 1 && !/Afiliada/.test(b.paineis[0].text), 'loja vetada sai');
ok(ordenar(of('x', 1), of('x', 2)) < 0, 'ordenar');

// Lista: cabeçalho "Lista de impressoras 3D · HH:MM · parte i/N" em toda mensagem; resumo de 1 linha por item.
ok(g.paineis.every((p, i) => p.text.includes(`parte ${i + 1}/${g.paineis.length}`) && /Lista de impressoras 3D · Mercado Livre · \d{2}:\d{2}/.test(p.text)), 'cabeçalho com parte i/N');
const rs = montarPaineis({ ofertas: [of('Impressora 3d Bambu Lab A1', 90000, 'mercado-livre', 'L', 1, { anteriorCents: 100000, minimo14: true, beneficios: [{ rotulo: 'Itaú Mastercard 15%', needsConfirm: true }] })], inicio: now, adTag: '' });
ok(rs.paineis[0].text.includes('↓ 10% (era R$ 1.000,00)') && rs.paineis[0].text.includes('novo mínimo de 14 dias') && rs.paineis[0].text.includes('(a confirmar no carrinho)'), 'resumo: queda, mínimo, cartão', rs.paineis[0].text);
const alta = montarPaineis({ ofertas: [of('Impressora 3d Bambu Lab A1', 110000, 'mercado-livre', 'L', 1, { anteriorCents: 100000 })], inicio: now, adTag: '' });
ok(alta.paineis[0].text.includes('↑ 10%'), 'resumo: alta');
const am3 = montarPaineis({ ofertas: [of('Impressora 3d Bambu Lab A1', 90000, 'amazon', 'Amazon.com.br')], inicio: now, adTag: '#publicidade' });
ok(am3.paineis.length === 1 && /Preço na Amazon em [0-9]{2}[/][0-9]{2} às [0-9]{2}:[0-9]{2}/.test(am3.paineis[0].text) && !/Amazon.com/.test(am3.paineis[0].text), 'Amazon: carimbo em todas as partes, loja não aparece');

// Queda individual.
const q = textoQuedaSeguro({ rede: 'mercado-livre', titulo: 'Impressora 3D Bambu Lab P2S Combo <FDM>', loja: 'LOJA X', reputacao: '98% de avaliações positivas', cents: 800000, anteriorCents: 833000, minimo14: true, url: 'https://meli.la/abc', leituraEm: now,
  cupom: { nome: 'R$ 20 OFF em LOJA', finalCents: 780000, passo: 'ative em Cupons' }, cartoes: [{ rotulo: 'Itaú Mastercard 15%', finalCents: 680000, needsConfirm: true }], adTag: '#publicidade' });
ok(!!q.text && q.text.length < 4096, 'queda cabe', q.problemas);
ok(q.text!.includes('queda de 4%') && q.text!.includes('R$ 8.330,00') && q.text!.includes('novo mínimo de 14 dias') && q.text!.includes('&lt;FDM&gt;'), 'queda: preços, %, mínimo, escape');
ok(q.text!.includes('Cupom R$ 20 OFF em LOJA') && q.text!.includes('R$ 6.800,00') && q.text!.includes('a confirmar no carrinho'), 'queda: cupom e cartão');
ok(q.text!.includes('Frete e prazo: a data aparece na página da loja') && !/chega em \d|entrega em \d/i.test(q.text!), 'queda: prazo não inventado');
const qa = textoQuedaSeguro({ rede: 'amazon', titulo: 'Impressora 3D Bambu Lab A1', loja: null, cents: 150000, anteriorCents: 200000, minimo14: false, url: 'https://amzn.to/x', leituraEm: now, adTag: '#publicidade' });
ok(!!qa.text && /Preço na Amazon em \d{2}\/\d{2} às \d{2}:\d{2}/.test(qa.text) && !/mercado ?livre|shopee/i.test(qa.text), 'queda Amazon: carimbo, sem outra loja', qa.problemas);
ok(!textoQuedaSeguro({ rede: 'mercado-livre', titulo: 'Bambu garantido', loja: null, cents: 1, anteriorCents: 2, minimo14: false, url: null, leituraEm: now, adTag: '' }).text, 'queda: termo proibido barra');
const dec = (cents: number, min14: number | null, ult: Date | null = null) => decidir({ atual: { chave: 'x', rotulo: 'x', cents, rede: 'mercado-livre', loja: null, slug: '' }, base: { cents: 833000, rede: 'mercado-livre' }, min14, ultimoAvisoEm: ult, now });
ok(MAX_QUEDAS_POR_CICLO === 6 && quedaMinimaCents(833000) === 16660 && dec(833000 - 16660, null) === 'queda' && dec(833000 - 16659, null) === 'nada', 'limites: 6 por ciclo, 2% ou R$ 50');
ok(dec(833000 - 10000, 840000) === 'minimo', 'decidir: novo mínimo com queda menor que 2%');
ok(dec(833000 - 30000, null, new Date(now.getTime() - 3600_000)) === 'nada' && dec(833000 - 30000, null, new Date(now.getTime() - 3 * 3600_000)) === 'queda', 'cooldown de 2 h');

async function modo(m: string) {
  const mod = await import('../src/server/messaging/painel-impressoras');
  if (m === '--previa') {
    const L = await mod.gerarLista(new Date(), false);
    console.log(`ML ${L.ativosMl} | Amazon ${L.ativosAmazon} | partes ${L.listas.length} | quedas ${L.quedas.length} | problemas ${L.problemas.length}`);
    console.log('tamanhos:', L.listas.map((p) => `${p.key}:${p.text.length}`).join(' '));
    if (L.problemas.length) console.log('PROBLEMAS:', L.problemas.slice(0, 5));
    console.log('\n===== ml-00 =====\n' + L.listas[0]?.text.slice(0, 2400));
    const am2 = L.listas.find((p) => p.rede === 'amazon');
    if (am2) console.log('\n===== ' + am2.key + ' =====\n' + am2.text.slice(0, 1500));
  }
}
async function main() {
  const m = process.argv[2];
  if (m) await modo(m);
  if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
  console.log('OK painel-impressoras #117');
  process.exit(0);
}
void main();
export {};
