// R-92: a cabeça da passada rápida da Amazon inclui masters das verticais liberadas (banco real, só leitura). Roda no portão completo.
import assert from 'node:assert/strict';
(async () => {
  const { amazonCabecaQueue, cabecaLiberadasMax } = await import('../src/server/collector/amazon-assisted');
  assert.equal(cabecaLiberadasMax({}), 25);
  assert.equal(cabecaLiberadasMax({ AMAZON_CABECA_LIBERADAS: '0' }), 0);
  assert.equal(cabecaLiberadasMax({ AMAZON_CABECA_LIBERADAS: '99' }), 25);
  delete process.env.AMAZON_MENSAGENS_VERTICAIS;
  const base = await amazonCabecaQueue();
  process.env.AMAZON_MENSAGENS_VERTICAIS = 'eletrodomesticos';
  const com = await amazonCabecaQueue();
  assert.ok(com.items.length >= base.items.length, 'liberar só acrescenta');
  assert.ok(com.items.length <= base.items.length + 25, 'no máximo 25 a mais');
  const ids = new Set(com.items.map((i) => i.id));
  assert.equal(ids.size, com.items.length, 'sem repetidos');
  for (const i of com.items) assert.ok(i.q && i.q.length > 3, 'cada item tem busca');
  console.log(`test-amazon-cabeca-liberadas-r92: OK (sem liberação ${base.items.length} itens; com eletrodomesticos ${com.items.length})`);
  process.exit(0);
})();
