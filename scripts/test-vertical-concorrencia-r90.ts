// E5 (#146): concorrência do coletor de verticais configurável (toca o módulo do banco; roda no portão completo).
import assert from 'node:assert/strict';

// E5: concorrência do coletor de verticais é configurável, com padrão 4 e limites 1..8.
import { catalogConcurrency } from '../src/lib/catalog/vertical/concorrencia';
assert.equal(catalogConcurrency({}), 4);
assert.equal(catalogConcurrency({ VERTICAL_CATALOG_CONCURRENCY: '6' }), 6);
assert.equal(catalogConcurrency({ VERTICAL_CATALOG_CONCURRENCY: '0' }), 4);
assert.equal(catalogConcurrency({ VERTICAL_CATALOG_CONCURRENCY: '99' }), 4);
console.log('test-vertical-concorrencia-r90: OK');
