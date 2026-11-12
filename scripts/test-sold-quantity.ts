// Teste puro de sold_quantity. FIXTURES = EXEMPLO no formato de /products/{id}/items (nao sao dados reais de mercado).
import assert from 'node:assert/strict';
import { extractSoldQuantity, parseMeliCatalogPage } from '@/lib/affiliate/master-consolidation';
import { soldQuantityWrites } from '@/lib/affiliate/sold-quantity';

const body = {
  paging: { total: 4, offset: 0, limit: 100 },
  results: [
    { item_id: 'MLB9000000001', seller_id: 1, price: 100, condition: 'new', sold_quantity: 42 }, // EXEMPLO
    { item_id: 'MLB9000000002', seller_id: 2, price: 110, condition: 'new' }, // EXEMPLO: sem o campo (caso real medido)
    { item_id: 'MLB9000000003', seller_id: 3, price: 120, condition: 'new', sold_quantity: '7' }, // EXEMPLO: string => ignora
    { item_id: 'MLB9000000004', seller_id: 4, price: 130, condition: 'new', sold_quantity: 0 }, // EXEMPLO: zero real
  ],
};
const page = parseMeliCatalogPage(body);
assert.deepEqual(page.items.map((i) => i.soldQuantity), [42, null, null, 0]);
assert.deepEqual(soldQuantityWrites(page.items), [
  { externalItemId: 'MLB9000000001', soldQuantity: 42 },
  { externalItemId: 'MLB9000000004', soldQuantity: 0 },
]);
// payload real medido (sem o campo): nenhuma gravacao
const semCampo = parseMeliCatalogPage({ paging: { total: 1, offset: 0, limit: 100 }, results: [{ item_id: 'MLB9000000005', seller_id: 5, price: 9, condition: 'new' }] });
assert.deepEqual(soldQuantityWrites(semCampo.items), []);
for (const bad of [undefined, null, NaN, -1, Infinity, 'x']) assert.equal(extractSoldQuantity(bad), null);
assert.equal(extractSoldQuantity(3.9), 3);
console.log('test-sold-quantity: OK');
