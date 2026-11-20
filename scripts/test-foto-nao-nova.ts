// R-108: teste PURO (sem rede, sem banco) das regras e do contrato de saida do modelo de foto "nao nova".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FOTO_NAO_NOVA_VERSAO, NOMES_FEATURES, decidirFotoNaoNova, dHash, distanciaHash, ehPele, extrairFeatures, metricas, normalizarVetor, podeMarcar,
  pontuarVetor, sinaisTexto, treinarLogistico, type ModeloLogistico,
} from '../src/lib/catalog/foto-nao-nova';

// pele x nao pele
assert.ok(ehPele(224, 172, 140));
assert.ok(!ehPele(250, 250, 250));
assert.ok(!ehPele(20, 60, 200));

// features: imagem toda branca = fundo de estudio, sem pele; imagem com mancha de pele no centro
const L = 24;
const branca = new Uint8Array(L * L * 3).fill(255);
const fb = extrairFeatures(branca, L, { w: 1200, h: 1200 });
assert.equal(fb.pele, 0);
assert.ok(fb.bordaBranca > 0.99);
assert.equal(fb.aspecto, 1);
const comMao = new Uint8Array(L * L * 3).fill(255);
for (let y = 6; y < 18; y++) for (let x = 6; x < 18; x++) { const o = (y * L + x) * 3; comMao[o] = 224; comMao[o + 1] = 172; comMao[o + 2] = 140; }
const fm = extrairFeatures(comMao, L, { w: 800, h: 600 });
assert.ok(fm.pele > 0.2 && fm.peleCentro > 0.5 && fm.peleMancha > 0.2, 'mancha de pele central');
assert.ok(Math.abs(fm.aspecto - 800 / 600) < 1e-9);
assert.deepEqual(Object.keys(fm).sort(), [...NOMES_FEATURES].sort());
assert.throws(() => extrairFeatures(new Uint8Array(5), L, { w: 1, h: 1 }));

// hash perceptual
const h1 = dHash(new Uint8Array(9 * 8 * 3).map((_, i) => (i % 27 < 12 ? 10 : 240)));
assert.equal(h1.length, 16);
assert.equal(distanciaHash(h1, h1), 0);
assert.equal(distanciaHash('0000000000000000', 'ffffffffffffffff'), 64);

// texto
assert.ok(sinaisTexto('Jogo Mario Kart 8 Switch Usado').usado);
assert.ok(sinaisTexto('Lote 5 jogos PS4').lote);
assert.ok(!sinaisTexto('The Legend of Zelda Tears of the Kingdom Switch Lacrado').usado);
assert.ok(sinaisTexto('Jogo X', 'Games Usados RJ').revendedor);

// modelo: dois grupos separaveis em 4 dimensoes; o treino e determinista e separa
const X: number[][] = [], y: number[] = [];
for (let i = 0; i < 40; i++) { const t = i % 2; X.push(normalizarVetor([t ? 1 : -1, 0.1 * (i % 5), 0.3, t ? 0.5 : -0.5])); y.push(t); }
const t1 = treinarLogistico(X, y), t2 = treinarLogistico(X, y);
assert.deepEqual(t1, t2, 'treino determinista');
const modelo: ModeloLogistico = { versao: FOTO_NAO_NOVA_VERSAO, encoder: 'teste', dim: 4, ...t1, limiarAlto: 0.85, limiarMedio: 0.6 };
const pos = pontuarVetor(modelo, X[1]!), neg = pontuarVetor(modelo, X[0]!);
assert.ok(pos > 0.85 && neg < 0.15, `separa (${pos}, ${neg})`);
assert.throws(() => pontuarVetor(modelo, [1, 2]), /dimensoes/);
const mt = metricas(y, X.map((x) => pontuarVetor(modelo, x)), 0.5);
assert.equal(mt.fp + mt.fn, 0);
assert.equal(mt.precisao, 1);

// decisao: contrato de saida e regras duras
const chaves = ['faixa', 'motivo', 'pontuacao', 'razoes', 'regraDura', 'versao'];
const alto = decidirFotoNaoNova(modelo, { embedding: X[1]! });
assert.deepEqual(Object.keys(alto).sort(), chaves);
assert.equal(alto.faixa, "alto");
assert.equal(alto.motivo, 'foto_com_mao');
assert.ok(alto.pontuacao >= 0 && alto.pontuacao <= 1);
assert.equal(decidirFotoNaoNova(modelo, { embedding: X[0]! }).faixa, 'baixo');
assert.equal(decidirFotoNaoNova(modelo, { embedding: X[0]! }).motivo, null);
// imagem ilegivel nunca marca
const sem = decidirFotoNaoNova(modelo, { embedding: null });
assert.equal(sem.faixa, 'baixo'); assert.equal(sem.regraDura, 'sem_imagem');
// foto igual a capa oficial nunca marca, mesmo com embedding de "mao"
const oficial = decidirFotoNaoNova(modelo, { embedding: X[1]!, distCapaOficial: 3 });
assert.equal(oficial.faixa, 'baixo'); assert.equal(oficial.regraDura, 'capa_oficial');
// 3 capas na cena = alto com motivo de varios jogos; 2 capas nao basta
const pilha = decidirFotoNaoNova(modelo, { embedding: X[0]!, capasNaCena: 4 });
assert.equal(pilha.faixa, 'alto'); assert.equal(pilha.motivo, 'foto_com_varios_jogos');
assert.equal(decidirFotoNaoNova(modelo, { embedding: X[0]!, capasNaCena: 2 }).faixa, 'baixo');
// o modelo de foto sozinho nunca usa texto 'usado' para marcar (o porteiro de usado ja cuida)
assert.equal(decidirFotoNaoNova(modelo, { embedding: X[0]!, texto: sinaisTexto('Jogo Usado') }).faixa, 'baixo');
// fundo branco de estudio limita a no maximo 'medio'
const estudio = decidirFotoNaoNova(modelo, { embedding: X[1]!, features: fb });
assert.ok(estudio.pontuacao <= modelo.limiarAlto);

// padrao negado: decisao humana e rejeicao nunca sao tocadas
assert.equal(podeMarcar({}), true);
assert.equal(podeMarcar({ manual: 'approved' }), false);
assert.equal(podeMarcar({ manual: 'rejected' }), false);
assert.equal(podeMarcar({ verdict: 'rejected' }), false);
assert.equal(podeMarcar({ verdict: 'approved' }), true);

// guarda estatica: o script de producao nunca apaga e so grava quarentena com guarda
const src = fs.readFileSync('scripts/foto-nao-nova.ts', 'utf8');
assert.ok(!/\bDELETE\s+FROM\b/i.test(src), 'nunca apaga');
assert.ok(/quarantined_at IS NULL/.test(src), 'so quarentena quem ainda nao esta');
assert.ok(/podeMarcar/.test(src), 'respeita decisao humana');
assert.ok(/DRY-RUN/.test(src) && /--apply/.test(src), 'dry-run por padrao');

// o modelo gravado, se existir, tem o contrato esperado
if (fs.existsSync('src/lib/catalog/foto-nao-nova-modelo.json')) {
  const m = JSON.parse(fs.readFileSync('src/lib/catalog/foto-nao-nova-modelo.json', 'utf8')) as ModeloLogistico;
  assert.equal(m.dim, 512); assert.equal(m.pesos.length, 512); assert.equal(m.media.length, 512); assert.equal(m.desvio.length, 512);
  assert.ok(m.limiarAlto >= m.limiarMedio, 'alto >= medio');
}
console.log('test-foto-nao-nova: OK');
