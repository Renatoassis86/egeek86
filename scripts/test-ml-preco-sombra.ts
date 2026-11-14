/**
 * Testes do modelo em MODO SOMBRA do preço da mensagem (src/lib/messaging/ml-preco.ts). Puro: sem banco, sem rede.
 *   npx tsx scripts/test-ml-preco-sombra.ts
 */
import { FEATURE_NAMES, MODELO, extrairFeatures, mlSombraAtivo, pontuar, scoreSombra, type EntradaML, type Modelo } from '../src/lib/messaging/ml-preco';

let ok = 0;
let falhas = 0;
function esperar(nome: string, cond: boolean, detalhe = '') {
  if (cond) ok++;
  else {
    falhas++;
    console.log(`FALHA: ${nome} ${detalhe}`);
  }
}

const AT = new Date('2026-11-14T12:00:00Z');
const min = (m: number) => new Date(AT.getTime() - m * 60_000);
const base: EntradaML = {
  priceCents: 851_322,
  avgCents: 1_040_023,
  networkSlug: 'mercado-livre',
  trigger: 'G2',
  at: AT,
  points: [],
  listPriceCents: 989_910,
  listingIdTrusted: false,
  sellerTotalSales: 1200,
  sellerRepVerde: true,
};
// Caso P2S Combo: 9.399,00 e 8.513,22 alternando a cada ~16 s por horas.
const oscilante: EntradaML = {
  ...base,
  points: Array.from({ length: 12 }, (_, i) => ({ at: min(120 - i * 10), priceCents: i % 2 === 0 ? 939_900 : 851_322 })),
};

// atributos
const x = extrairFeatures(base);
esperar('vetor tem o tamanho dos nomes', x.length === FEATURE_NAMES.length);
esperar('determinístico', JSON.stringify(extrairFeatures(base)) === JSON.stringify(extrairFeatures({ ...base })));
esperar('todos finitos', x.every((v) => Number.isFinite(v)));
const xo = extrairFeatures(oscilante);
esperar('oscilante: trocas24h > 0', xo[FEATURE_NAMES.indexOf('trocas24h')]! > 0);
esperar('oscilante: flag oscilando', xo[FEATURE_NAMES.indexOf('oscilando')] === 1);
esperar('estável: sem oscilar', x[FEATURE_NAMES.indexOf('oscilando')] === 0);
esperar('ML sem id do anúncio marcado', x[FEATURE_NAMES.indexOf('ml_sem_id_anuncio')] === 1);
esperar('ML com id confiável não marca', extrairFeatures({ ...base, listingIdTrusted: true })[FEATURE_NAMES.indexOf('ml_sem_id_anuncio')] === 0);
esperar('Shopee nunca marca ml_sem_id', extrairFeatures({ ...base, networkSlug: 'shopee' })[FEATURE_NAMES.indexOf('ml_sem_id_anuncio')] === 0);
// sem olhar o futuro: pontos depois da decisão não contam
const comFuturo: EntradaML = { ...oscilante, points: [...oscilante.points, { at: new Date(AT.getTime() + 60_000), priceCents: 1 }] };
esperar('ignora snapshot futuro', JSON.stringify(extrairFeatures(comFuturo)) === JSON.stringify(xo));
// sem média / sem lista
const semMedia = extrairFeatures({ ...base, avgCents: null, listPriceCents: null });
esperar('sem_media marcado', semMedia[FEATURE_NAMES.indexOf('sem_media')] === 1);
esperar('sem lista marcado', semMedia[FEATURE_NAMES.indexOf('tem_lista')] === 0);
esperar('ticket em log10', Math.abs(x[FEATURE_NAMES.indexOf('ticket_log10')]! - Math.log10(8513.22)) < 1e-9);

// modelo
esperar('modelo carregado tem versão', typeof MODELO.versao === 'string' && MODELO.versao.length > 0);
if (MODELO.tipo !== 'nenhum') esperar('nomes do modelo = nomes do código', JSON.stringify(MODELO.nomes) === JSON.stringify([...FEATURE_NAMES]));
const nenhum: Modelo = { versao: 'nenhum', tipo: 'nenhum', treinadoEm: null };
esperar('modelo nenhum não pontua', pontuar(nenhum, x) === null && scoreSombra(base, nenhum) === null);
const p = pontuar(MODELO, x);
esperar('p em [0,1]', MODELO.tipo === 'nenhum' || (p != null && p >= 0 && p <= 1), String(p));
esperar('vetor incompatível devolve null', MODELO.tipo === 'nenhum' || pontuar(MODELO, x.slice(1)) === null);
const s = scoreSombra(base, MODELO, AT);
esperar('score sombra com forma esperada', MODELO.tipo === 'nenhum' || (!!s && s.v === MODELO.versao && s.p >= 0 && s.p <= 1 && typeof s.alto === 'boolean' && s.em === AT.toISOString()));
// logística sintética: peso positivo em 'oscilando' => oscilante pontua mais alto
const d = FEATURE_NAMES.length;
const iOsc = FEATURE_NAMES.indexOf('oscilando');
const sintetico: Modelo = {
  versao: 'teste',
  tipo: 'logistica',
  nomes: [...FEATURE_NAMES],
  media: new Array<number>(d).fill(0),
  desvio: new Array<number>(d).fill(1),
  pesos: FEATURE_NAMES.map((_, i) => (i === iOsc ? 2 : 0)),
  vies: -1,
  limiar: 0.5,
  treinadoEm: null,
  metricas: null,
};
const pe = pontuar(sintetico, x)!;
const po = pontuar(sintetico, xo)!;
esperar('caso P2S pontua mais alto que estável (modelo sintético)', po > pe, `${po} vs ${pe}`);
esperar('alto reflete o limiar', scoreSombra(oscilante, sintetico, AT)!.alto === true && scoreSombra(base, sintetico, AT)!.alto === false);
// nunca lança
esperar('entrada quebrada não lança', (() => { try { scoreSombra({ ...base, at: new Date('x') }, sintetico); return true; } catch { return false; } })());

// flag
esperar('flag padrão desligada', mlSombraAtivo({}) === false);
esperar('flag off', mlSombraAtivo({ GROUP_ML_SOMBRA: 'off' }) === false);
esperar('flag on', mlSombraAtivo({ GROUP_ML_SOMBRA: 'on' }) === true);
esperar('flag ON em maiúsculas', mlSombraAtivo({ GROUP_ML_SOMBRA: ' ON ' }) === true);

console.log(`test-ml-preco-sombra: ${ok}/${ok + falhas} ok`);
if (falhas) process.exit(1);
