/** #119: ritmo global das leituras (puro) e defesa contra meta corrompido (incidente de 58 MB / 3,6 milhões de chaves). */
import { bloquear, ESTADO_ZERO, metaParaGravar, reservar, RITMO_CFG, sanearMeta } from '../src/lib/links/ritmo';

let fails = 0;
function ok(c: boolean, n: string, x?: unknown) { if (!c) { fails++; console.error('FALHOU:', n, x ?? ''); } }
const T = 1_800_000_000_000;

// Saneamento: formatos corrompidos
const zero = JSON.stringify(ESTADO_ZERO);
ok(JSON.stringify(sanearMeta('{"prox":123,"bloqueado_ate":456}')) === JSON.stringify({ ...ESTADO_ZERO, prox: 123, bloqueadoAte: 456 }), 'string jsonb válida vira objeto');
ok(JSON.stringify(sanearMeta('não é json')) === zero, 'string inválida: zera');
ok(JSON.stringify(sanearMeta([1, 2, 3])) === zero && JSON.stringify(sanearMeta(null)) === zero && JSON.stringify(sanearMeta(42)) === zero, 'array, null, número: zera');
const gigante: Record<string, number> = {};
for (let i = 0; i < 5000; i++) gigante[`k${i}`] = i;
ok(JSON.stringify(sanearMeta(gigante)) === zero, 'objeto gigante (5 mil chaves): zera');
ok(JSON.stringify(sanearMeta('x'.repeat(5000))) === zero, 'string enorme: zera sem parse');
const chars: Record<string, string> = {};
for (let i = 0; i < 80; i++) chars[String(i)] = 'a'; // meta virado em "objeto de caracteres"
ok(JSON.stringify(sanearMeta(chars)) === zero, 'objeto de caracteres: zera');
ok(sanearMeta({ prox: 'abc', bloqueado_ate: -5, janela_n: 1e20 }).prox === 0 && sanearMeta({ bloqueado_ate: -5 }).bloqueadoAte === 0, 'valores não numéricos ou fora da faixa viram 0');
// O que se grava: só 6 chaves, nunca o meta lido
const g = metaParaGravar({ ...ESTADO_ZERO, prox: 5 });
ok(Object.keys(g).length === 6 && JSON.stringify(g).length < 200, 'grava só 6 chaves numéricas');
const lixo = sanearMeta({ prox: 9, intruso: 'x'.repeat(1000), outro: { a: 1 } });
ok(Object.keys(metaParaGravar(lixo)).length === 6 && !JSON.stringify(metaParaGravar(lixo)).includes('intruso'), 'chaves estranhas não passam para a gravação');

// Ritmo: 4 s globais
const r1 = reservar(ESTADO_ZERO, T);
ok(r1.ok && r1.esperaMs === 0, 'primeira leitura sem espera');
const r2 = r1.ok ? reservar(r1.estado, T + 1000) : null;
ok(!!r2 && r2.ok && r2.esperaMs === 3000, 'segunda: espera até completar 4 s', r2);
// Teto por janela de 10 min
let e = { ...ESTADO_ZERO };
let aceitas = 0;
for (let i = 0; i < 200; i++) { const r = reservar(e, T + i * 1000); if (r.ok) { e = r.estado; aceitas++; } }
ok(aceitas === RITMO_CFG.JANELA_MAX, `teto de ${RITMO_CFG.JANELA_MAX} leituras por 10 min`, aceitas);
const depois = reservar(e, T + 11 * 60_000);
ok(depois.ok, 'nova janela libera');
// Recuo crescente 15 -> 30 -> 60 min
const b1 = bloquear(ESTADO_ZERO, T);
ok(b1.bloqueadoAte === T + 15 * 60_000 && !reservar(b1, T + 60_000).ok, 'primeiro captcha: recuo de 15 min');
const b2 = bloquear(b1, T + 20 * 60_000);
ok(b2.bloqueadoAte === T + 20 * 60_000 + 30 * 60_000, 'segundo seguido: 30 min');
const b3 = bloquear(b2, T + 60 * 60_000);
ok(b3.bloqueadoAte === T + 60 * 60_000 + 60 * 60_000, 'terceiro: 60 min');
const b4 = bloquear(b3, T + 200 * 60_000);
ok(b4.bloqueadoAte === T + 200 * 60_000 + 60 * 60_000, 'quarto: continua 60 min');
const b5 = bloquear(b4, T + 200 * 60_000 + 7 * 3_600_000);
ok(b5.bloqueadoAte === T + 200 * 60_000 + 7 * 3_600_000 + 15 * 60_000, 'depois de 6 h sem bloqueio: volta a 15 min');

console.log(fails ? `${fails} falha(s)` : 'OK: ritmo #119');
process.exit(fails ? 1 : 0);
