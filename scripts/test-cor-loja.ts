/** Teste puro da paleta por loja: contraste AA com texto/secundário/dourado, distinção entre lojas, afastamento da régua. npx tsx scripts/test-cor-loja.ts */
import { COR_FUNDO_LOJA, contraste, FUNDO_PADRAO } from '../src/lib/pricing/cor-loja';
import { OFFER_CARD_COLORS as C } from '../src/lib/pricing/offer-card-model';
let fails = 0;
const ck = (n: string, ok: boolean, d?: unknown) => { if (!ok) { fails++; console.error('FALHOU:', n, d ?? ''); } };
const lojas = Object.entries(COR_FUNDO_LOJA);
ck('7 lojas', lojas.length === 7);
for (const [k, v] of lojas) {
  ck(`${k} texto AA`, contraste(v, C.text) >= 7, contraste(v, C.text));
  ck(`${k} secundário AA`, contraste(v, C.secondary) >= 4.5, contraste(v, C.secondary));
  ck(`${k} dourado AA`, contraste(v, C.gold) >= 4.5, contraste(v, C.gold));
  ck(`${k} painel (surface) distinguível do fundo`, v.toLowerCase() !== C.surface.toLowerCase());
  console.log(k.padEnd(18), v, 'texto', contraste(v, C.text).toFixed(1), 'sec', contraste(v, C.secondary).toFixed(1), 'ouro', contraste(v, C.gold).toFixed(1));
}
const vs = lojas.map(([, v]) => v);
ck('cores distintas', new Set(vs).size === 7);
const dist = (a: string, b: string) => [1, 3, 5].reduce((s, i) => s + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) ck(`dist ${lojas[i][0]}-${lojas[j][0]}`, dist(vs[i], vs[j]) >= 40, dist(vs[i], vs[j]));
ck('padrão preservado', FUNDO_PADRAO === C.canvas);
console.log(fails ? `${fails} falhas` : 'OK');
process.exit(fails ? 1 : 0);
