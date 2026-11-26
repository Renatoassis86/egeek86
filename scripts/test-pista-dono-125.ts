// R-125: pista de cupom do dono + veto de coleta automatica do Pelando (termos de uso, clausula 9).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { agregar, CANAIS_FASE1, urlPrevia } from '../src/lib/coupons/candidato';
import { candidatoDoDono, fonteSemColetaAutomatica, FONTE_DONO, FONTES_SEM_COLETA_AUTOMATICA } from '../src/lib/coupons/pista-dono';

const now = new Date('2026-11-26T12:00:00Z');

// candidato do dono: normaliza, fonte fixa, sem texto de terceiros
const c = candidatoDoDono({ codigo: ' meliagora ', rede: 'mercado-livre', valorPercentual: 10, minimoReais: 99.9, limiteReais: 30 }, now)!;
assert.equal(c.codigo, 'MELIAGORA');
assert.equal(c.fonte, FONTE_DONO);
assert.equal(c.valorTipo, 'percentual');
assert.equal(c.valorNum, 10);
assert.equal(c.minimoCents, 9990);
assert.equal(c.limiteCents, 3000);
assert.equal(c.escopoDito, 'desconhecido', 'escopo so quem diz e a loja');
assert.equal(c.esgotado, false);
assert.deepEqual(agregar([c])[0]!.fontes, ['dono']);

// entradas invalidas
assert.equal(candidatoDoDono({ codigo: 'abc' }, now), null, 'curto demais');
assert.equal(candidatoDoDono({ codigo: '123456' }, now), null, 'sem letra');
assert.equal(candidatoDoDono({ codigo: 'CORREEEE' }, now), null, 'grito de post');
assert.equal(candidatoDoDono({ codigo: 'ABCDE1', rede: 'pelando' }, now), null, 'rede desconhecida');
assert.equal(candidatoDoDono({ codigo: 'ABCDE1', valorPercentual: 250 }, now)!.valorNum, null, 'percentual absurdo ignorado');
assert.equal(candidatoDoDono({ codigo: 'ABCDE1' }, now)!.rede, 'mercado-livre', 'padrao ML');

// veto: o Pelando nunca e fonte automatica
assert.equal(fonteSemColetaAutomatica('https://www.pelando.com.br/d/algo-1234'), true);
assert.equal(fonteSemColetaAutomatica('https://api-web.pelando.com.br/x'), true);
assert.equal(fonteSemColetaAutomatica('https://t.me/s/sddescontos'), false);
for (const canal of CANAIS_FASE1) assert.equal(fonteSemColetaAutomatica(String(urlPrevia(canal))), false, `canal ${canal} nao e fonte vetada`);
assert.ok(FONTES_SEM_COLETA_AUTOMATICA.includes('pelando.com.br'));

// guarda: nenhum codigo de coleta (src/ e scripts/) pode buscar o Pelando
const raiz = path.resolve(__dirname, '..');
const aqui = path.basename(__filename);
const ignorar = new Set(['node_modules', '.next', '.git']);
const achados: string[] = [];
function varre(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignorar.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { varre(p); continue; }
    if (!/\.(ts|tsx|js|mjs)$/.test(e.name) || e.name === aqui || e.name === 'pista-dono.ts') continue;
    if (/pelando\.com\.br|pelando\.promo/i.test(fs.readFileSync(p, 'utf8'))) achados.push(path.relative(raiz, p));
  }
}
varre(path.join(raiz, 'src'));
varre(path.join(raiz, 'scripts'));
varre(path.join(raiz, 'public', 'loops'));
assert.deepEqual(achados, [], `R-125: arquivo menciona o Pelando como fonte: ${achados.join(', ')}`);

console.log('test-pista-dono-125: OK');
