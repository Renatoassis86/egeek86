// Vitrine de jogos até R$ 200 no canal de games, a cada 30 min (dono, 2026-11-17).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VITRINE_CAPTION_MAX, diagnosticoCurto, escolherTop, janelaKey, montarLegenda, tituloCurto, visivel, vitrineLigada, type JogoVitrine } from '../src/lib/messaging/vitrine-games';

const j = (i: number, o: Partial<JogoVitrine> = {}): JogoVitrine => ({ masterId: `m${i}`, slug: `jogo-${i}`, titulo: `Jogo Exemplo Muito Longo Numero ${i} Edicao Especial Colecionador PS5`, plataforma: 'PlayStation 5', precoCentavos: 10000 + i, ofertas: 2, imagem: null, ...o });

assert.equal(tituloCurto('Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5', 24).length <= 24, true);
assert.equal(tituloCurto('Mortal Kombat 1 - PS5 Standard'), 'Mortal Kombat 1');
assert.equal(tituloCurto('Resident Evil 2 Ps5 Mídia Física'), 'Resident Evil 2');

// teto de R$ 200 inclusivo, preço > 0, um por produto
const lista = [j(1, { precoCentavos: 20000 }), j(2, { precoCentavos: 20001 }), j(3, { precoCentavos: 0 }), j(4), j(4)];
assert.deepEqual(escolherTop(lista).map((x) => x.masterId).sort(), ['m1', 'm4']);
// diagnóstico "abaixo do normal" abre; dentro disso, mais ofertas; sem histórico elegível não ganha a vaga por diagnóstico
const top = escolherTop([j(1, { ofertas: 9 }), j(2, { elegivel: true, veredito: 'below', ofertas: 2, deltaPct: 20 }), j(3, { elegivel: true, veredito: 'below', ofertas: 5, deltaPct: 10 }), j(4, { elegivel: false, veredito: 'below', ofertas: 7 })]);
assert.deepEqual(top.map((x) => x.masterId), ['m3', 'm2', 'm1', 'm4']);
assert.equal(escolherTop(Array.from({ length: 30 }, (_, i) => j(i + 1))).length, 10);

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
assert.ok(srv.includes('aptaSql()') && srv.includes("'amazon' OR o.last_checked_at > now() - interval '45 minutes'") && srv.includes('silent: true'), 'só oferta apta, Amazon com preço fresco de 45 min, envio silencioso');
console.log('test-vitrine-games: OK');
