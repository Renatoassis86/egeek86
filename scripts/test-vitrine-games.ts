// Vitrine de jogos até R$ 250 no canal de games, a cada 30 min (dono, 2026-11-17).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VITRINE_CAPTION_MAX, diagnosticoCurto, escolherTop, escolherTopRodizio, familiaDe, janelaKey, montarLegenda, tituloCurto, visivel, vitrineLigada, type JogoVitrine } from '../src/lib/messaging/vitrine-games';

const j = (i: number, o: Partial<JogoVitrine> = {}): JogoVitrine => ({ masterId: `m${i}`, slug: `jogo-${i}`, titulo: `Jogo Exemplo Muito Longo Numero ${i} Edicao Especial Colecionador PS5`, plataforma: 'PlayStation 5', precoCentavos: 10000 + i, ofertas: 2, imagem: null, ...o });

assert.equal(tituloCurto('Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5', 24).length <= 24, true);
assert.equal(tituloCurto('Mortal Kombat 1 - PS5 Standard'), 'Mortal Kombat 1');
assert.equal(tituloCurto('Resident Evil 2 Ps5 Mídia Física'), 'Resident Evil 2');

// teto de R$ 250 inclusivo, preço > 0, um por produto
const lista = [j(1, { precoCentavos: 25000 }), j(2, { precoCentavos: 25001 }), j(3, { precoCentavos: 0 }), j(4), j(4)];
assert.deepEqual(escolherTop(lista).map((x) => x.masterId).sort(), ['m1', 'm4']);
// diagnóstico "abaixo do normal" abre; dentro disso, mais ofertas; sem histórico elegível não ganha a vaga por diagnóstico
const top = escolherTop([j(1, { ofertas: 9 }), j(2, { elegivel: true, veredito: 'below', ofertas: 2, deltaPct: 20 }), j(3, { elegivel: true, veredito: 'below', ofertas: 5, deltaPct: 10 }), j(4, { elegivel: false, veredito: 'below', ofertas: 7 })]);
assert.deepEqual(top.map((x) => x.masterId), ['m3', 'm2', 'm1', 'm4']);
assert.equal(escolherTop(Array.from({ length: 30 }, (_, i) => j(i + 1))).length, 10);

// rodízio: quem saiu nas últimas 3 vitrines descansa; quem nunca saiu entra; faltando gente, volta quem saiu há mais tempo
const tudo = Array.from({ length: 40 }, (_, i) => j(i + 1, { ofertas: 50 - i }));
const r1 = escolherTopRodizio(tudo, []).map((x) => x.masterId);
assert.deepEqual(r1, tudo.slice(0, 10).map((x) => x.masterId), 'sem histórico: os 10 principais');
const r2 = escolherTopRodizio(tudo, [r1]).map((x) => x.masterId);
assert.ok(r2.every((id) => !r1.includes(id)), 'a rodada seguinte não repete a anterior');
const r3 = escolherTopRodizio(tudo, [r2, r1]).map((x) => x.masterId);
assert.ok(r3.every((id) => !r1.includes(id) && !r2.includes(id)), 'duas rodadas de repouso');
const pouco = Array.from({ length: 12 }, (_, i) => j(i + 1));
const r4 = escolherTopRodizio(pouco, [['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'], ['m11', 'm12']]);
assert.equal(r4.length, 10, 'com poucos jogos completa com os que saíram há mais tempo');
assert.equal(new Set(r4.map((x) => x.masterId)).size, 10);

// as 4 famílias saem SEMPRE juntas: PlayStation 4, Xbox 2, Switch 1 2, Switch 2 2 (dono, 2026-11-17)
const ORD = ['playstation', 'xbox', 'switch_1', 'switch_2'];
const gens = ['ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch_1', 'switch_2'];
const mix = Array.from({ length: 60 }, (_, i) => j(i + 1, { gen: gens[i % 6], ofertas: 90 - i }));
const fam = (arr: JogoVitrine[]) => arr.map((x) => familiaDe(x.gen));
const f1 = escolherTopRodizio(mix, []);
assert.equal(f1.length, 10);
assert.deepEqual(ORD.map((f) => fam(f1).filter((x) => x === f).length), [4, 2, 2, 2]);
assert.deepEqual(fam(f1).map((x) => ORD.indexOf(x as string)), fam(f1).map((x) => ORD.indexOf(x as string)).sort((a, b) => a - b), 'agrupados por família');
const f2 = escolherTopRodizio(mix, [f1.map((x) => x.masterId)]);
assert.ok(f2.every((x) => !f1.some((y) => y.masterId === x.masterId)), 'rodízio também por família');
const semXbox = mix.filter((x) => familiaDe(x.gen) !== 'xbox');
const f3 = escolherTopRodizio(semXbox, []);
assert.equal(f3.length, 10);
assert.equal(fam(f3).filter((x) => x === 'xbox').length, 0, 'sem jogo de Xbox até R$ 250, as vagas vão às outras');
assert.ok(['playstation', 'switch_1', 'switch_2'].every((f) => fam(f3).includes(f as never)));
assert.equal(familiaDe('xbox_360'), 'xbox');
assert.equal(familiaDe('unknown'), null);

// diagnóstico só com histórico elegível (R-91)
assert.equal(diagnosticoCurto({ ofertas: 1, elegivel: false }).texto, 'Novo em monitoramento');
assert.equal(diagnosticoCurto({ ofertas: 4, elegivel: false, veredito: 'below', deltaPct: 30 }).texto, 'Em monitoramento');
assert.equal(diagnosticoCurto({ ofertas: 4, elegivel: true, veredito: 'below', deltaPct: 30 }).texto, 'Abaixo do normal (−30%)');
assert.equal(diagnosticoCurto({ ofertas: 4, elegivel: true, veredito: 'above', deltaPct: -12 }).texto, 'Acima do normal (+12%)');

// legenda cabe em 1024 caracteres visíveis mesmo com títulos longos, e todo link é do site (/go)
const dez = Array.from({ length: 10 }, (_, i) => j(i + 1, { elegivel: true, veredito: 'below', deltaPct: 25 }));
const leg = montarLegenda(dez, '21:05', (i) => `https://www.egeek86.com/go/jogo-${i + 1}?s=tg&m=vg-1-${i + 1}`);
assert.ok(visivel(leg) <= VITRINE_CAPTION_MAX, `legenda ${visivel(leg)} <= 1024`);
assert.equal((leg.match(/href="https:\/\/www\.egeek86\.com\/go\//g) ?? []).length, 10);
assert.ok(!/<a href="https:\/\/(?!www\.egeek86\.com)/.test(leg), 'nenhum link fora do site');

// uma vitrine por janela de 30 min
assert.equal(janelaKey(new Date('2026-11-17T21:00:00Z')), janelaKey(new Date('2026-11-17T21:29:59Z')));
assert.notEqual(janelaKey(new Date('2026-11-17T21:00:00Z')), janelaKey(new Date('2026-11-17T21:30:00Z')));
assert.equal(vitrineLigada({}), true);
assert.equal(vitrineLigada({ VITRINE_GAMES: 'off' }), false);

const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8')) as { crons: { path: string; schedule: string }[] };
assert.ok(cfg.crons.some((c) => c.path.startsWith('/api/cron/vitrine-games') && c.schedule === '*/30 * * * *'), 'cron de 30 em 30 minutos');
const srv = fs.readFileSync('src/server/messaging/vitrine-games.ts', 'utf8');
assert.ok(srv.includes('aptaSql()') && srv.includes("'amazon' OR o.last_checked_at > now() - make_interval(mins => ${amazonFrescorMin()}::int)") && srv.includes('silent: true'), 'só oferta apta, Amazon com a janela de preço das outras lojas (R-101), envio silencioso');
console.log('test-vitrine-games: OK');
