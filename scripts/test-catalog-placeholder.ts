/**
 * Teste da selecao do placeholder de catalogo (src/lib/affiliate/catalog-placeholder.ts). Sem banco.
 * Uso: npx tsx scripts/test-catalog-placeholder.ts   (codigo 1 se falhar)
 */
import assert from 'node:assert/strict';
import { pickCatalogPlaceholder } from '../src/lib/affiliate/catalog-placeholder';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const A = { id: 'ph-A', externalRef: 'MLB29750744' };
const B = { id: 'ph-B', externalRef: 'MLB42707534' };
const C = { id: 'ph-C', externalRef: 'MLB57372578' };

t('Mario: 3 grupos, 3 placeholders -> cada um grava so no seu', () => {
  const all = [A, B, C];
  assert.equal(pickCatalogPlaceholder(all, 'MLB29750744')?.id, 'ph-A');
  assert.equal(pickCatalogPlaceholder(all, 'MLB42707534')?.id, 'ph-B');
  assert.equal(pickCatalogPlaceholder(all, 'MLB57372578')?.id, 'ph-C');
});

t('Mario real: 3 grupos, 1 placeholder -> so o catalogo dono grava; os outros 2 nao gravam em placeholder alheio', () => {
  const all = [A];
  assert.equal(pickCatalogPlaceholder(all, 'MLB29750744')?.id, 'ph-A');
  assert.equal(pickCatalogPlaceholder(all, 'MLB42707534'), null);
  assert.equal(pickCatalogPlaceholder(all, 'MLB57372578'), null);
});

t('placeholder unico (caso comum, 1 catalogo) continua sendo escolhido', () => {
  assert.equal(pickCatalogPlaceholder([A], 'MLB29750744')?.id, 'ph-A');
});

t('sem placeholder algum -> null', () => {
  assert.equal(pickCatalogPlaceholder([], 'MLB29750744'), null);
});

t('placeholder legado com external_ref nulo nunca casa', () => {
  assert.equal(pickCatalogPlaceholder([{ id: 'x', externalRef: null }], 'MLB29750744'), null);
  assert.equal(pickCatalogPlaceholder([{ id: 'x', externalRef: null }], ''), null);
});

t('nenhuma sobrescrita cruzada: cada placeholder e escolhido por exatamente 1 grupo', () => {
  const all = [A, B, C];
  const groups = ['MLB29750744', 'MLB42707534', 'MLB57372578'];
  const hits = new Map<string, number>();
  for (const g of groups) { const p = pickCatalogPlaceholder(all, g); if (p) hits.set(p.id, (hits.get(p.id) ?? 0) + 1); }
  for (const c of all) assert.equal(hits.get(c.id), 1);
});

console.log(`${n} testes ok`);
