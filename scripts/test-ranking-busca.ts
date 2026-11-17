// Seção da home "compare preços" (dono, 2026-11-17): termos da busca, classificação igual à dos canais e posição da seção.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classificar, tokensDaBusca } from '../src/lib/ranking-busca';

assert.deepEqual(tokensDaBusca('Air Fryer 5L'), ['air', 'fryer', '5l']);
assert.deepEqual(tokensDaBusca('  Câmera  Fotográfica! '), ['camera', 'fotografica']);
assert.deepEqual(tokensDaBusca('a'), [], 'um caractere não busca');
assert.deepEqual(tokensDaBusca("%'; DROP--"), ['drop'], 'símbolos saem');
assert.equal(tokensDaBusca('a b c d e f g h').length, 6, 'no máximo 6 termos');

assert.equal(classificar({ nOfertas: 1, elegivel: false }).rotulo, 'Novo em monitoramento');
assert.equal(classificar({ nOfertas: 3, elegivel: false }).rotulo, 'Em monitoramento');
assert.equal(classificar({ nOfertas: 3, elegivel: false, veredito: 'below' }).diagnostico, false, 'sem histórico elegível não há diagnóstico (R-91)');
assert.equal(classificar({ nOfertas: 3, elegivel: true, veredito: 'insufficient' }).diagnostico, false);
const d = classificar({ nOfertas: 6, elegivel: true, veredito: 'below' });
assert.ok(d.diagnostico && d.rotulo === 'Abaixo do normal');

const home = fs.readFileSync('src/app/(shop)/page.tsx', 'utf8');
assert.ok(home.indexOf('<RankingBuscaSection />') > home.indexOf('<Benefits />') && home.indexOf('<RankingBuscaSection />') < home.indexOf('<NewsletterCTA />'), 'a seção é a PENÚLTIMA da home');
const q = fs.readFileSync('src/server/queries/ranking-busca.ts', 'utf8');
assert.ok(q.includes('eligibleOfferSql') && q.includes('linkPublicavelFilter') && q.includes("o.status = 'active'"), 'só oferta ativa, elegível e com link de afiliado publicável (R-70)');
assert.ok(q.includes('ORDER BY o.current_price_cents ASC'), 'ranking do menor ao maior preço');
console.log('test-ranking-busca: OK');
