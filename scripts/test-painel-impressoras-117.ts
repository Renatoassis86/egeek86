/**
 * #117: paineis vivos das impressoras 3D (ML e Amazon). Puro (tamanho, escape, ordem do dono, frescor, barreira, Amazon separada, BRL).
 * --previa: monta com dados reais e imprime resumo + 1o painel de cada rede (nunca envia). --privado | --canal: roda de verdade (rodada com cursor).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-painel-impressoras-117.ts [--previa|--privado|--canal]
 */
import { alvosLigados, brl, montarPaineis, ordenar, type OfertaPainel } from '../src/lib/messaging/painel-impressoras';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-15T15:30:00Z');
let seq = 0;
const of = (nome: string, cents: number, rede = 'mercado-livre', loja: string | null = 'Loja X', horas = 1, extra: Partial<OfertaPainel> = {}): OfertaPainel =>
  ({ masterId: `m-${nome}`, masterName: nome, rede, loja, cents, url: `https://exemplo.test/${rede}/${++seq}?a=1&b=2`, checkedAt: new Date(now.getTime() - horas * 3600_000), ...extra });

ok(brl(833000) === 'R$ 8.330,00', 'BRL');
ok(alvosLigados({}).length === 0 && alvosLigados({ PAINEL_IMPRESSORAS: '1' }).join() === 'canal,privado' && alvosLigados({ PAINEL_IMPRESSORAS: 'privado' }).join() === 'privado', 'flag');

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
ok(/conferido às \d{2}:\d{2}/.test(t0) && !/Bras[ií]lia/i.test(t0), 'hora sem Brasília');
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

async function modo(m: string) {
  const mod = await import('../src/server/messaging/painel-impressoras');
  if (m === '--previa') {
    const r = await mod.montarPaineisAgora(new Date());
    console.log(`ML ${r.ativosMl} anúncios em ${r.modelosMl} modelos | Amazon ${r.ativosAmazon} em ${r.modelosAmazon} | velhas ${r.omitidasVelhas} | painéis ${r.paineis.length} | problemas ${r.problemas.length}`);
    console.log('tamanhos:', r.paineis.map((p) => `${p.key}:${p.text.length}`).join(' '));
    if (r.problemas.length) console.log('PROBLEMAS:', r.problemas.slice(0, 5));
    console.log('\n===== ml-00 =====\n' + r.paineis[0]?.text.slice(0, 2600));
    const am2 = r.paineis.find((p) => p.rede === 'amazon');
    if (am2) console.log('\n===== ' + am2.key + ' =====\n' + am2.text.slice(0, 1800));
  } else if (m === '--privado' || m === '--canal') {
    const alvo = m === '--canal' ? 'canal' : 'privado';
    for (let i = 0; i < 12; i++) {
      const r = await mod.atualizarPaineisImpressoras(new Date(), { budgetMs: 50_000, force: i === 0, alvos: [alvo] });
      console.log(JSON.stringify(r.alvos));
      if (r.alvos[0]?.acao !== 'em_andamento' && r.alvos[0]?.acao !== 'pausado') break;
      if (r.alvos[0]?.acao === 'pausado') await new Promise((res) => setTimeout(res, 10_000));
    }
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
