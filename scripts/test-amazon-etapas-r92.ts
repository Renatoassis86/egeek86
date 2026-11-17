// R-92 (dono, 2026-11-17): liberação ESCALONADA da Amazon nas mensagens por vertical. Padrão = nada liberado (falha fechada).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { amazonLiberadaNaVertical, amazonVerticaisLiberadas, avaliarConfirmacao, redeForaDasMensagens } from '../src/lib/messaging/confirmacao-preco';

assert.equal(amazonVerticaisLiberadas({}).size, 0, 'padrão: nenhuma vertical');
const E = { AMAZON_MENSAGENS_VERTICAIS: 'eletrodomesticos, Tecnologia;esporte' };
assert.deepEqual([...amazonVerticaisLiberadas(E)].sort(), ['eletrodomesticos', 'esporte', 'tecnologia']);
assert.equal(amazonLiberadaNaVertical('eletrodomesticos', E), true);
assert.equal(amazonLiberadaNaVertical('TECNOLOGIA', E), true, 'sem diferença de caixa');
assert.equal(amazonLiberadaNaVertical('games', E), false);
assert.equal(amazonLiberadaNaVertical(null, E), false, 'sem vertical = contida (falha fechada)');
assert.equal(amazonLiberadaNaVertical('eletrodomesticos', {}), false);

// contenção: Amazon só passa na vertical liberada; ML/Shopee nunca são "fora"
assert.equal(redeForaDasMensagens('amazon', {}, 'eletrodomesticos'), true, 'sem liberação, contida');
assert.equal(redeForaDasMensagens('amazon', E, 'eletrodomesticos'), false);
assert.equal(redeForaDasMensagens('amazon', E, 'games'), true);
assert.equal(redeForaDasMensagens('amazon', E), true, 'chamador sem vertical continua contido');
assert.equal(redeForaDasMensagens('mercado-livre', E, 'games'), false);
assert.equal(redeForaDasMensagens('amazon', { ...E, AMAZON_FORA_DAS_MENSAGENS: '0' }, 'games'), false, 'flag geral desligada libera tudo (comportamento antigo)');

// portão de preço: liberar a vertical NÃO dispensa o preço fresco (R-81, 45 min)
const now = new Date('2026-11-17T18:00:00Z');
const base = { uso: 'queda' as const, rede: 'amazon', status: 'active', now, vertical: 'eletrodomesticos' };
const antes = process.env.AMAZON_MENSAGENS_VERTICAIS;
process.env.AMAZON_MENSAGENS_VERTICAIS = 'eletrodomesticos';
try {
  assert.equal(avaliarConfirmacao({ ...base, confirmedAt: new Date(now.getTime() - 10 * 60_000) }).ok, true, 'leitura de 10 min passa');
  const velha = avaliarConfirmacao({ ...base, confirmedAt: new Date(now.getTime() - 90 * 60_000) });
  assert.equal(velha.ok, false, 'leitura de 90 min NÃO passa mesmo na vertical liberada');
  assert.notEqual(velha.motivo, 'amazon_fora_das_mensagens');
  assert.equal(avaliarConfirmacao({ ...base, vertical: 'games', confirmedAt: new Date(now.getTime() - 10 * 60_000) }).motivo, 'amazon_fora_das_mensagens', 'vertical não liberada segue contida');
} finally {
  if (antes === undefined) delete process.env.AMAZON_MENSAGENS_VERTICAIS; else process.env.AMAZON_MENSAGENS_VERTICAIS = antes;
}

// Guardas de código: nenhum ponto do SQL volta ao bloqueio global sem a vertical.
const go = fs.readFileSync('src/server/messaging/group-offers.ts', 'utf8');
assert.ok(!/\$\{amazonForaDasMensagens\(\) \? sql`AND o\.network_id NOT IN/.test(go), 'o filtro de Amazon do SQL passa pelo helper por vertical');
assert.ok(go.includes("amazonContidaSql('m.vertical')") && go.includes("amazonContidaSql('o.vertical')"), 'helper usado nos dois SQL');
const lr = fs.readFileSync('src/lib/messaging/live-recheck.ts', 'utf8');
assert.ok(lr.includes('redeForaDasMensagens(t.networkSlug, process.env, t.vertical)'), 'reconferência usa a vertical');
console.log('test-amazon-etapas-r92: OK');
