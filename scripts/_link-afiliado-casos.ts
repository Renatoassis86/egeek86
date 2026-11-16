// Casos de referência da regra R-70 (compartilhados entre o teste puro, a conferência SQL da migration 0063 e o medidor).
// [url, rede, válido?]
export const CASOS_LINK: [string, string, boolean][] = [
  ['https://www.amazon.com.br/dp/B0ABC12345?tag=manusmonteiro-20', 'amazon', true],
  ['https://amazon.com.br/dp/B0ABC12345?th=1&tag=manusmonteiro-20&psc=1', 'amazon', true],
  ['https://www.amazon.com.br/dp/B0ABC12345', 'amazon', false],
  ['https://www.amazon.com.br/dp/B0ABC12345?tag=outrapessoa-20', 'amazon', false],
  ['https://www.amazon.com.br/dp/B0ABC12345?tag=manusmonteiro-20&tag=outrapessoa-20', 'amazon', false],
  ['https://www.amazon.com.br/dp/B0ABC12345?tag=manusmonteiro-200', 'amazon', false],
  ['http://www.amazon.com.br/dp/B0ABC12345?tag=manusmonteiro-20', 'amazon', false],
  ['https://a.co/d/abc1234', 'amazon', false],
  ['https://amzn.to/3abcdef', 'amazon', false],
  ['https://www.amazon.com/dp/B0ABC12345?tag=manusmonteiro-20', 'amazon', false],
  ['https://meli.la/1AbCdEf', 'mercado-livre', true],
  ['https://www.mercadolivre.com.br/p/MLB12345678', 'mercado-livre', false],
  ['https://produto.mercadolivre.com.br/MLB-1234567890-x?matt_tool=23952458', 'mercado-livre', true],
  ['https://www.mercadolivre.com.br/p/MLB12345678?matt_tool=23952458', 'mercado-livre', true],
  ['https://www.mercadolivre.com.br/p/MLB12345678?matt_tool=99999999', 'mercado-livre', false],
  ['https://www.mercadolivre.com.br/p/MLB12345678?matt_tool=239524580', 'mercado-livre', false],
  ['https://meli.la/', 'mercado-livre', false],
  ['https://s.shopee.com.br/AbC123', 'shopee', true],
  ['https://shopee.com.br/product/1/2', 'shopee', false],
  ['https://s.shopee.com.br/', 'shopee', false],
  ['https://www.magazineluiza.com.br/produto/p/1/', 'magalu', false],
  ['https://s.shopee.com.br/AbC123', 'amazon', false], // link válido de OUTRA rede não vale na rede errada
  ['https://meli.la/1AbCdEf', 'rede-nova-hipotetica', false],
  ['https://www.rede-nova.com/p/1?tag=manusmonteiro-20', 'rede-nova-hipotetica', false],
];
