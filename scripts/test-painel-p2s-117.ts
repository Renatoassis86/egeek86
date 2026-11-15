/**
 * #117: painel vivo do P2S Combo. Puro (tamanho, escape, ordem, frescor, barreira, BRL, Amazon fora).
 * --previa: monta com dados reais e IMPRIME (nunca envia). --privado: envia/edita no chat do dono (job de teste). --canal: usa o canal (so com a flag/autorizacao).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-painel-p2s-117.ts [--previa|--privado|--canal]
 */
import { montarPainel, brl, escolherLinks, painelLigado, type OfertaPainel } from '../src/lib/messaging/painel-p2s';
import { textProblems } from '../src/lib/messaging/group-messages';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const now = new Date('2026-11-15T15:30:00Z');
const of = (cents: number, rede = 'mercado-livre', loja: string | null = 'Loja X', horas = 1, extra: Partial<OfertaPainel> = {}): OfertaPainel =>
  ({ rede, loja, cents, url: `https://exemplo.test/${rede}/${cents}?a=1&b=2`, checkedAt: new Date(now.getTime() - horas * 3600_000), ...extra });

ok(brl(833000) === 'R$ 8.330,00', 'BRL', brl(833000));
ok(painelLigado({}) === false && painelLigado({ P2S_PAINEL_CANAL: '1' }) === true, 'flag');

const muitas = Array.from({ length: 49 }, (_, i) => of(800000 + i * 1000, i % 3 ? 'mercado-livre' : 'shopee', `Loja <${i}> & Cia`));
const p = montarPainel({ ofertas: muitas, now, adTag: '#publicidade' });
ok(!!p.text && p.text.length < 4096, 'tamanho < 4096', p.text?.length);
ok(p.text!.includes('Loja &lt;0&gt; &amp; Cia'), 'escape HTML');
ok(p.text!.includes('a=1&amp;b=2'), 'escape href');
ok(p.links >= 5 && p.links <= 8, 'links 5 a 8', p.links);
ok(p.text!.indexOf('R$ 8.000,00') < p.text!.indexOf('R$ 8.010,00'), 'ordem por preço');
ok(p.text!.includes('#publicidade') && p.text!.includes('/mercado/impressao3d'), 'rodapé');
ok(textProblems(p.text!, 'tg').length === 0, 'barreira limpa');
ok(!/Bras[ií]lia/i.test(p.text!) && !/afiliad/i.test(p.text!), 'sem termos vetados');
ok(/conferido às \d{2}:\d{2}/.test(p.text!), 'hora');

// Frescor: >24 h fica de fora e é contado.
const f = montarPainel({ ofertas: [of(900000), of(800000, 'shopee', 'Velha', 30)], now, adTag: '#publicidade' });
ok(f.ativos === 1 && f.omitidasVelhas === 1 && f.text!.includes('R$ 9.000,00') && !f.text!.includes('R$ 8.000,00'), 'frescor', f);
ok(f.text!.includes('1 anúncio sem leitura'), 'contagem das velhas');
ok(montarPainel({ ofertas: [of(800000, 'shopee', 'Velha', 30)], now, adTag: '' }).text === null, 'sem fresco = sem texto');

// Amazon nunca aparece.
const a = montarPainel({ ofertas: [of(700000, 'amazon', 'Amazon'), of(900000)], now, adTag: '#publicidade' });
ok(!/amazon/i.test(a.text ?? ''), 'Amazon fora do texto público');
ok(a.ativos === 1, 'Amazon fora da contagem');

// Cupom: nome quando houver, rótulo quando não; cartão com "a confirmar".
const c1 = montarPainel({ ofertas: [of(900000, 'mercado-livre', 'L', 1, { cupomFinalCents: 850000, cupomNome: 'R$ 50 OFF em HD' })], now, adTag: '' });
ok(c1.text!.includes('🎟️') && c1.text!.includes('R$ 50 OFF em HD') && c1.text!.includes('R$ 8.500,00'), 'cupom nomeado', c1.text);
const c2 = montarPainel({ ofertas: [of(900000, 'mercado-livre', 'L', 1, { cupomFinalCents: 850000 })], now, adTag: '' });
ok(c2.text!.includes('com cupom') && !/ative/i.test(c2.text!), 'cupom sem nome e sem "ative"');
const c3 = montarPainel({ ofertas: [of(900000, 'mercado-livre', 'L', 1, { beneficios: [{ rotulo: 'Itaú Mastercard 15%', needsConfirm: true }] })], now, adTag: '' });
ok(c3.text!.includes('💳') && c3.text!.includes('Itaú Mastercard 15%') && c3.text!.includes('a confirmar no carrinho'), 'cartão a confirmar');
ok(!/prazo de \d|chega em \d|entrega em \d/i.test(p.text!), 'sem prazo afirmado');

// Barreira: nome de loja proibido sai do texto, o painel segue.
const b = montarPainel({ ofertas: [of(800000, 'mercado-livre', 'Loja Afiliada'), of(900000)], now, adTag: '' });
ok(b.ativos === 1 && !/Afiliada/.test(b.text ?? ''), 'loja vetada sai', b);
ok(escolherLinks([of(1), of(2, 'shopee')]).length === 2, 'links mistura redes');

async function modo(m: string) {
  const { atualizarPainelP2s, montarPainelAgora } = await import('../src/server/messaging/painel-p2s');
  if (m === '--previa') {
    const r = await montarPainelAgora(new Date());
    console.log(r.text ?? `SEM TEXTO: ${r.problemas.join('; ')}`);
    console.log(`\n[ativos=${r.ativos} velhas=${r.omitidasVelhas} links=${r.links} chars=${r.text?.length}]`);
  } else if (m === '--privado' || m === '--canal') {
    const r = await atualizarPainelP2s(new Date(), { alvo: m === '--canal' ? 'canal' : 'privado', force: true, ignorarFlag: true });
    console.log({ ...r, text: undefined });
  }
}
async function main() {
  const m = process.argv[2];
  if (m) await modo(m);
  if (fails) { console.error(`${fails} falha(s)`); process.exit(1); }
  console.log('OK painel-p2s #117');
  process.exit(0);
}
void main();
export {};
