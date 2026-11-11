/** Teste curto: parse de parametros da rota ampliar-amostra-shopee e paginacao por lotes (funcoes puras, sem banco/rede). */
import { parseParametrosRota, proximoOffset } from '../src/lib/affiliate/ampliar-amostra-params';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const P = (o: Record<string, string>) => parseParametrosRota((k) => o[k] ?? null);

const d = P({ vertical: 'esporte' });
check('padroes', d.ok && d.params.limitMasters === 15 && d.params.offset === 0 && d.params.maxCalls === 90 && !d.params.apply && d.params.rollback === null, d);
check('sem vertical => erro', !P({}).ok && (P({}) as any).erro === 'vertical_obrigatoria');
check('vertical invalida', (P({ vertical: 'games' }) as any).erro === 'vertical_invalida:games');
check('limitMasters limitado a 40', (P({ vertical: 'livros', limitMasters: '999' }) as any).params.limitMasters === 40);
check('limitMasters minimo 1', (P({ vertical: 'livros', limitMasters: '0' }) as any).params.limitMasters === 1);
check('maxCalls limitado a 150', (P({ vertical: 'livros', maxCalls: '9999' }) as any).params.maxCalls === 150);
check('numero invalido', (P({ vertical: 'livros', offset: '-1' }) as any).erro === 'offset_invalido');
check('apply so com 1', (P({ vertical: 'livros', apply: '1' }) as any).params.apply === true && (P({ vertical: 'livros', apply: 'true' }) as any).params.apply === false);
check('lista de verticais sem repeticao', JSON.stringify((P({ vertical: 'livros, esporte,livros' }) as any).params.verticals) === '["livros","esporte"]');
check('rollback dispensa vertical', (P({ rollback: '42', apply: '1' }) as any).params.rollback === '42');
check('rollback invalido', (P({ rollback: '4;2' }) as any).erro === 'rollback_invalido');

check('offset: dry-run avanca pelos consumidos', proximoOffset(0, 15, 0, 100) === 15);
check('offset: continua do offset', proximoOffset(15, 15, 0, 100) === 30);
check('offset: fim da lista => null', proximoOffset(90, 10, 0, 100) === null);
check('offset: apply, saturados saem da lista e deslocam', proximoOffset(15, 15, 4, 100) === 26);
check('offset: parada no meio (consumidos < limite)', proximoOffset(0, 7, 0, 100) === 7);
check('offset: nunca negativo', proximoOffset(0, 2, 5, 100) === 0);

console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
