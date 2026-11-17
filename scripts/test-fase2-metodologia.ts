// Fase 2 da metodologia (#136, R-83/R-84): hooks de repositório e Action do portão existem e chamam o portão e a guarda do congelado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pre = fs.readFileSync('.githooks/pre-commit', 'utf8');
const push = fs.readFileSync('.githooks/pre-push', 'utf8');
assert.ok(pre.includes('npm run congelado') && pre.includes('exit 1'), 'pre-commit barra congelado');
assert.ok(push.includes('npm run gate') && push.includes('exit 1'), 'pre-push roda o portão e barra se vermelho');
const act = fs.readFileSync('.github/workflows/gate.yml', 'utf8');
assert.ok(/on:\s*\n\s*push:/.test(act) && act.includes('pull_request'), 'Action roda em push e PR');
assert.ok(act.includes('npm run gate') && act.includes('npm run congelado'), 'Action roda portão e guarda');
assert.ok(!/secrets\./.test(act), 'Action do portão não usa secrets');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
assert.ok(pkg.scripts.gate && pkg.scripts.congelado, 'scripts gate e congelado existem');
console.log('test-fase2-metodologia: OK');
