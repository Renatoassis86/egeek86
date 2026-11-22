// R-117: verdade viva (preco + disponibilidade) na vitrine. Teste puro.
import assert from 'node:assert/strict';
import { VIVO_JANELA_VITRINE_MIN, decidirVivo, escolherVerificados, validarLeituraPagina, vivoLigado, type DecisaoVivo, type LeituraViva } from '../src/lib/messaging/verdade-viva';

const O = { janelaMin: VIVO_JANELA_VITRINE_MIN, tetoCents: 25_000 };
const ok = (p: number, idade = 1): LeituraViva => ({ estado: 'ok', precoCents: p, idadeMin: idade, fonte: 't' });
const motivo = (d: DecisaoVivo) => (d.ok ? 'ok' : d.motivo);

// esgotado e nao verificavel nunca passam
assert.equal(motivo(decidirVivo(13990, { estado: 'esgotado', idadeMin: 1, fonte: 't' }, O)), 'esgotado');
assert.equal(motivo(decidirVivo(13990, { estado: 'nao_verificavel', motivo: 'x' }, O)), 'nao_verificavel');
// leitura velha (> 15 min) nao vale; 15 min vale
assert.equal(motivo(decidirVivo(13990, ok(13990, 16), O)), 'leitura_velha');
assert.equal(motivo(decidirVivo(13990, ok(13990, 15), O)), 'ok');
// preco vivo manda: o caso do dono (banco 139,90, vivo 119,62 = 14,5% de diferenca)
const d = decidirVivo(13990, ok(11962), O);
assert.ok(d.ok && d.usouVivo && d.precoCents === 11962 && d.divergenciaPct > 14);
// ate 2% de diferenca: nao e divergencia relevante, mas ainda exibe o preco vivo
const d2 = decidirVivo(10000, ok(10150), O);
assert.ok(d2.ok && !d2.usouVivo && d2.precoCents === 10150);
// vivo acima do teto de R$ 250 sai; preco invalido sai
assert.equal(motivo(decidirVivo(24000, ok(26000), O)), 'preco_vivo_acima_do_teto');
assert.equal(motivo(decidirVivo(24000, ok(0), O)), 'preco_invalido');

(async () => {
  // reposicao: os 6 primeiros nao passam; entram os proximos 4 verificados
  const cands = Array.from({ length: 20 }, (_, i) => i);
  const ver = async (i: number): Promise<DecisaoVivo> => (i < 6 ? { ok: false, motivo: i % 2 ? 'esgotado' : 'nao_verificavel' } : { ok: true, precoCents: 1000 + i, usouVivo: false, divergenciaPct: 0, fonte: 't' });
  const r = await escolherVerificados(cands, ver, 4, { lote: 3 });
  assert.deepEqual(r.escolhidos.map((x) => x.item), [6, 7, 8, 9]);
  assert.equal(r.barrados.esgotado, 3);
  assert.equal(r.barrados.nao_verificavel, 3);
  // nunca completa com item nao verificado: maxChecagens curto
  const r2 = await escolherVerificados(cands, ver, 10, { lote: 4, maxChecagens: 8 });
  assert.equal(r2.checados, 8);
  assert.equal(r2.escolhidos.length, 2);
  assert.ok(r2.cortadoPorOrcamento);
  // erro na verificacao = nao verificavel (nunca lista)
  const r3 = await escolherVerificados([1, 2], async () => { throw new Error('rede'); }, 2);
  assert.equal(r3.escolhidos.length, 0);
  assert.equal(r3.barrados.nao_verificavel, 2);
  // validacao da leitura de pagina
  const id = 'ded37404-142d-430e-8e46-94bb9b3232ff';
  assert.equal(validarLeituraPagina({ offer_id: id, disponivel: false }).ok, true);
  assert.equal(validarLeituraPagina({ offer_id: id, disponivel: true }).ok, false, 'disponivel exige preco');
  assert.equal(validarLeituraPagina({ offer_id: id, disponivel: true, preco_cents: 11962 }).ok, true);
  assert.equal(validarLeituraPagina({ offer_id: 'x', disponivel: true, preco_cents: 11962 }).ok, false);
  assert.equal(vivoLigado({}), true);
  assert.equal(vivoLigado({ VITRINE_VIVO: 'off' }), false);
  console.log('test-verdade-viva: OK');
})();
