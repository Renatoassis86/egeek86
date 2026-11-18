// Metodologia Chrome (dono, 2026-11-18): todo loop injetado manda batimento de saude; o vigia le o banco; a rota e protegida e limitada.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const LOOPS: Array<[string, string]> = [['amazon-assistida', '__amza'], ['cupons-24h', '__cup'], ['ml-cupons-item', '__mlc'], ['ml-links-ui', '__mll'], ['shopee-cupons', '__shp']];
for (const [nome, glob] of LOOPS) {
  const s = fs.readFileSync(`public/loops/${nome}.js`, 'utf8');
  assert.ok(s.includes('BATIMENTO-GERAL v1'), `${nome}: sem batimento de saude`);
  assert.ok(s.includes(`NOME = '${nome}'`) && s.includes(`GLOBAL = '${glob}'`), `${nome}: batimento com nome/global errados`);
  // a configuracao e apagada da window na partida: o batimento TEM de usar CFG/TOKEN da closure (foi o erro da 1a versao: nenhum batimento chegava)
  assert.ok(s.includes("if (!CFG.api || !TOKEN) return;") && s.includes("Bearer ' + TOKEN") && !s.includes("window['__AMZA_CFG']") && !/window\['__[A-Z]+_CFG'\]/.test(s.slice(s.indexOf('BATIMENTO-GERAL v1'))), `${nome}: batimento le a configuracao da window (ja apagada)`);
  assert.ok(s.includes('/api/ingest/loop-saude') && s.includes('lagMs') && s.includes('visibilityState'), `${nome}: batimento sem lag/visibilidade`);
  assert.ok(!s.includes(`Bearer ' + CFG.token + '`) || s.includes('catch(function () {})'), `${nome}: batimento pode derrubar o loop`);
  new Function(s); // sintaxe valida
}
const route = fs.readFileSync('src/app/api/ingest/loop-saude/route.ts', 'utf8');
assert.ok(route.includes('couponGuard(request, rede)') && route.includes("interval '4 minutes'") && route.includes('text.length > 1_000'), 'rota protegida (origem+token), limitada a 1 linha/4 min e a 1 KB');
for (const [nome] of LOOPS) assert.ok(route.includes(`'${nome}'`), `rota nao aceita o loop ${nome}`);
const vigia = fs.readFileSync('scripts/vigia-loops.ts', 'utf8');
assert.ok(vigia.includes("LIKE 'loop:%'") && vigia.includes('REINJETAR'), 'vigia le o banco e diz o que reinjetar');
assert.ok(fs.readFileSync('docs/03-metodologia/CHROME_METODOLOGIA.md', 'utf8').includes('Batimento'), 'metodologia documentada');
console.log('test-chrome-loops: OK');
