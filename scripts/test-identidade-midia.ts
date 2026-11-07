/** Teste de src/lib/pricing/identidade-midia.ts. Sem banco, sem rede. Uso: npx tsx scripts/test-identidade-midia.ts */
import { buildIdentidadeMidia, REGRA_IDENTIDADE } from '../src/lib/pricing/identidade-midia';
import { TEXTOS_PROIBIDOS } from '../src/lib/pricing/parecer-produto';

let fails = 0, total = 0;
const check = (n: string, c: boolean, d?: unknown) => { total++; if (!c) { fails++; console.error('FALHOU:', n, d ?? ''); } };

const full = buildIdentidadeMidia({ productType: 'game', gameFormat: 'physical', gamePlatformGen: 'ps5', gameEditionType: 'full_game' });
check('jogo completo: 3 itens', full.itens.length === 3);
check('formato físico', full.itens[0].valor === 'Físico');
check('plataforma PS5', full.itens[1].valor === 'PlayStation 5');
check('conteúdo jogo completo', full.itens[2].valor === 'Jogo completo');

const unk = buildIdentidadeMidia({ productType: 'game', gameFormat: 'unknown', gamePlatformGen: 'unknown', gameEditionType: 'unknown' });
check('tudo desconhecido: valores null (nunca afirma)', unk.itens.every((i) => i.valor === null), unk);
check('desconhecido nunca vira texto de rótulo', JSON.stringify(unk).indexOf('não identificad') < 0);

const parcial = buildIdentidadeMidia({ productType: 'game', gameFormat: 'unknown', gamePlatformGen: 'switch_1', gameEditionType: 'unknown' });
check('parcial: só a plataforma tem valor', parcial.itens.map((i) => i.valor).join('|') === '|Nintendo Switch|');

const digital = buildIdentidadeMidia({ productType: 'game', gameFormat: 'digital', gamePlatformGen: 'xbox_series', gameEditionType: 'dlc' });
check('digital e DLC', digital.itens[0].valor === 'Digital' && digital.itens[2].valor === 'DLC');

const con = buildIdentidadeMidia({ productType: 'console', gameFormat: 'unknown', gamePlatformGen: 'ps5', gameEditionType: 'unknown' });
check('console: 1 item "Console"', con.itens.length === 1 && con.itens[0].rotulo === 'Console' && con.itens[0].valor === 'PlayStation 5');
const acc = buildIdentidadeMidia({ productType: 'accessory', gameFormat: 'unknown', gamePlatformGen: 'unknown', gameEditionType: 'unknown' });
check('acessório sem plataforma: 1 item null', acc.itens.length === 1 && acc.itens[0].valor === null);

check('regra presente em todos', [full, unk, con, acc].every((x) => x.regra === REGRA_IDENTIDADE));
const txt = JSON.stringify([full, unk, con]).toLowerCase();
check('sem texto proibido', TEXTOS_PROIBIDOS.every((t) => !txt.includes(t)), txt);

console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
