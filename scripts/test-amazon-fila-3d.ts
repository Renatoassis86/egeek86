// Fila da coleta assistida da Amazon: impressoras 3D prioritarias na CABECA (combo primeiro), nos dois modos. Somente leitura no banco.
//   npx tsx --conditions react-server --env-file=.env.local scripts/test-amazon-fila-3d.ts
import { amazonDiscoverQueue, amazonDiscoverTotal, amazonRefreshQueue, amazonRefreshTotal } from '../src/server/collector/amazon-assisted';
let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
async function main() {
  for (const [modo, fila, tot] of [['refresh', amazonRefreshQueue, amazonRefreshTotal], ['discover', amazonDiscoverQueue, amazonDiscoverTotal]] as const) {
    const itens = await fila(0, 12);
    const q = itens.map((i) => i.q);
    check(`${modo}: 1o = P2S Combo`, q[0] === 'Bambu Lab P2S Combo', q.slice(0, 4));
    check(`${modo}: 2o = P1S Combo`, q[1] === 'Bambu Lab P1S Combo');
    check(`${modo}: 3o e 4o = A1 Combo e A1 Mini Combo`, q[2] === 'Bambu Lab A1 Combo' && q[3] === 'Bambu Lab A1 Mini Combo');
    check(`${modo}: avulsas depois dos combos`, q.indexOf('Bambu Lab P2S') > 3 && q.indexOf('Bambu Lab P1S') > q.indexOf('Bambu Lab P2S'));
    const pag2 = await fila(5, 5), pag1 = await fila(0, 10);
    check(`${modo}: paginacao por offset consistente`, JSON.stringify(pag2.map((i) => i.id)) === JSON.stringify(pag1.slice(5, 10).map((i) => i.id)));
    check(`${modo}: sem repetidos`, new Set(itens.map((i) => i.id)).size === itens.length);
    check(`${modo}: total cobre a cabeca`, (await tot()) >= 9, await tot());
    const so3d = await fila(0, 12, 'impressao3d');
    check(`${modo}: filtro de vertical 3D mantem a cabeca`, so3d[0]?.q === 'Bambu Lab P2S Combo');
  }
  console.log(`${total - fails}/${total} verdes`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
