// R-82: camadas de fonte do preco da Amazon (resolver puro). Rode: npx tsx scripts/test-precos-fontes-82.ts
import { asinDaUrl, concordam, decidirPrecoAmazon, type LeituraExterna, type Par } from '../src/lib/precos-fontes/resolver';
let falhas = 0;
const ok = (c: unknown, nome: string) => { if (!c) { falhas++; console.error('FALHOU:', nome); } };
const now = new Date('2026-11-16T12:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const chromeFresco: Par = { precoCents: 877910, pixCents: 790118, lidoEm: ago(10) };
const chromeVelho: Par = { precoCents: 877910, pixCents: 790118, lidoEm: ago(230) };
const k = (p: number | null, px: number | null, min: number, extra: Partial<LeituraExterna> = {}): LeituraExterna => ({ fonte: 'keepa', precoCents: p, pixCents: px, lidoEm: ago(min), ...extra });

ok(concordam({ precoCents: 790118, pixCents: null }, { precoCents: 877910, pixCents: 790118 }, 0.015), 'preco da fonte bate com o Pix do par');
ok(!concordam({ precoCents: 949905, pixCents: null }, { precoCents: 849990, pixCents: 807490 }, 0.015), 'R$ 9.499 nao bate com 8.499/8.074 (caso P2S Combo)');

let d = decidirPrecoAmazon(chromeFresco, [], now);
ok(d.ok && d.fonte === 'chrome' && d.unicaFonte, 'so Chrome fresco: ok');
d = decidirPrecoAmazon(chromeVelho, [], now);
ok(!d.ok && d.motivo === 'sem_leitura_fresca', 'so Chrome velho: nao diz');
d = decidirPrecoAmazon(null, [], now);
ok(!d.ok && d.motivo === 'sem_leitura_fresca', 'nada: nao diz');

// Queda de camada: Chrome parado, Keepa concorda com o par conhecido: segura
d = decidirPrecoAmazon(chromeVelho, [k(790118, null, 20)], now);
ok(d.ok && d.fonte === 'keepa' && d.chromeVelhoConfirmadoPorExterna && d.unicaFonte, 'Chrome velho + Keepa concordando: ok pela Keepa');
// O caso do dono: a pagina subiu, o Chrome velho tem o par antigo, a Keepa le o preco novo: BLOQUEIA
d = decidirPrecoAmazon({ precoCents: 849990, pixCents: 807490, lidoEm: ago(70) }, [k(949905, null, 15)], now);
ok(!d.ok && d.motivo === 'divergente', 'preco subiu (R$ 9.499) e o par antigo e 8.499/8.074: divergente, nao publica');
// As duas frescas e concordando: validacao cruzada
d = decidirPrecoAmazon(chromeFresco, [k(877910, 790118, 5)], now);
ok(d.ok && d.validadaPor.includes('keepa') && d.validadaPor.includes('chrome') && !d.unicaFonte && !d.chromeVelhoConfirmadoPorExterna, 'Chrome + Keepa concordam: validado por duas');
// As duas frescas e discordando: bloqueia
d = decidirPrecoAmazon(chromeFresco, [k(949905, null, 5)], now);
ok(!d.ok && d.motivo === 'divergente', 'Chrome fresco x Keepa fresca discordam: bloqueia');
// Externa velha e ignorada
d = decidirPrecoAmazon(chromeFresco, [k(949905, null, 300)], now);
ok(d.ok && d.fonte === 'chrome', 'Keepa velha (300 min) e ignorada');
// Sem par conhecido
d = decidirPrecoAmazon(null, [k(790118, null, 5)], now);
ok(!d.ok && d.motivo === 'sem_par_conhecido', 'externa sozinha, sem par do Chrome: nao diz (tipo do preco desconhecido, R-69)');
// Indisponivel na fonte
d = decidirPrecoAmazon(chromeFresco, [k(null, null, 5, { disponivel: false })], now);
ok(!d.ok && d.motivo === 'indisponivel_na_fonte', 'fonte diz indisponivel: bloqueia');
// Camada oficial na frente
d = decidirPrecoAmazon(chromeFresco, [k(877910, null, 5), { fonte: 'creators_api', precoCents: 877910, pixCents: 790118, lidoEm: ago(2) }], now);
ok(d.ok && d.fonte === 'creators_api', 'oficial na frente quando concorda');
d = decidirPrecoAmazon(chromeFresco, [k(877910, null, 5), { fonte: 'creators_api', precoCents: 999900, pixCents: null, lidoEm: ago(2) }], now);
ok(!d.ok && d.motivo === 'divergente', 'oficial discorda do par: bloqueia (nunca escolhe lado as cegas)');
// ASIN
ok(asinDaUrl('https://www.amazon.com.br/dp/B0GPFC29F2?tag=manusmonteiro-20') === 'B0GPFC29F2' && asinDaUrl('https://www.amazon.com.br/gp/product/b0g87m7v8z/ref=x') === 'B0G87M7V8Z' && asinDaUrl('https://a.co/d/x') === null, 'ASIN da URL');
if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1); }
console.log('OK: camadas de fonte do preco da Amazon (R-82)');
