/**
 * Regressao da cobertura por produto do dono (#57, 2026-11-16): Electrolux Ergorapido PTEC101 (aspirador sem fio) e cadeirinha Safety 1st Orbital 360
 * na loja Casa. Sem banco, sem rede.  npx tsx scripts/test-cobertura-itens-dono-2026-11-16.ts
 */
import { avaliarCandidato, type CandidatoMaster } from '../src/lib/catalog/aprovacao-nicho';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';
import { segmentByKey } from '../src/lib/catalog/vertical/config';
import { scopeIssue } from '../src/lib/catalog/vertical/scope';
import { ehItemMiudo } from '../src/lib/catalog/item-miudo';

let fails = 0, total = 0;
const check = (n: string, c: boolean, e?: unknown) => { total++; if (!c) { fails++; console.log(`FALHA: ${n}${e !== undefined ? ' => ' + JSON.stringify(e) : ''}`); } };

const seg = segmentByKey('cadeirinha-auto');
check('segmento cadeirinha-auto existe na Casa', !!seg && seg.vertical === 'eletrodomesticos');
check('cadeirinha: dominio do ML aceito', !!seg && seg.domains.some((d) => d.test('MLB-BABY_CAR_SEATS')) && !seg.domains.some((d) => d.test('MLB-BABY_STROLLERS')));
check('cadeirinha: termos reais (marca + produto)', !!seg && seg.terms.some((t) => /safety 1st/.test(t)) && seg.terms.some((t) => /bebe conforto/.test(t)) && seg.terms.length >= 30);

const asp = segmentByKey('aspirador-de-po');
const termos = asp?.terms ?? [];
check('aspirador: termos por modelo (ergorapido, ptec101)', termos.some((t) => /ptec101/.test(t)) && termos.some((t) => /ergorapido/.test(t)));
check('aspirador: com fio, sem fio, vertical e portatil', ['com fio', 'sem fio', 'vertical', 'portatil'].every((k) => termos.some((t) => t.includes(k))));

const NOME_ASP = 'Aspirador de Pó Vertical Sem Fio 3 em 1 Electrolux Ergorapido Experience Cyclonic Power 30 min Azul PTEC101 Bivolt';
const NOME_CAD = 'Cadeira Orbital 360 I-size, Black, Safety 1st';
check('tipo: ergorapido = aspirador', classificarTipo('eletrodomesticos', NOME_ASP) === 'aspirador');
check('tipo: Orbital 360 (cadeira para auto) = cadeirinha-auto', classificarTipo('eletrodomesticos', 'Cadeira para Auto Safety 1st Orbital 360 Preta') === 'cadeirinha-auto');
check('tipo: cadeirinha / bebe conforto', classificarTipo('eletrodomesticos', 'Bebê Conforto Chicco Keyfit 30 Isofix') === 'cadeirinha-auto' && classificarTipo('eletrodomesticos', 'Cadeirinha para Carro Burigotto Matrix') === 'cadeirinha-auto');
check('escopo: cadeirinha de verdade passa', scopeIssue('cadeirinha-auto', 'Cadeira Para Auto Safety 1st Orbital 360 I-size Preta') === null);
check('escopo: capa/protetor/espelho de cadeirinha fora', ['Capa Protetora para Cadeirinha de Carro', 'Espelho Retrovisor para Bebe Conforto', 'Protetor de Encosto de Banco Cadeirinha'].every((n) => scopeIssue('cadeirinha-auto', n) !== null));
check('escopo: cadeira de alimentacao e de escritorio fora', ['Cadeira de Alimentacao Bebe Papinha', 'Cadeira de Escritorio Presidente'].every((n) => scopeIssue('cadeirinha-auto', n) !== null));
check('nao e item miudo (R$ 1.424,90)', !ehItemMiudo(NOME_CAD, 142490, 'general', 'eletrodomesticos') && !ehItemMiudo(NOME_ASP, 51290, 'general', 'eletrodomesticos'));

const cand = (over: Partial<CandidatoMaster>): CandidatoMaster => ({
  id: 'x', name: NOME_CAD, vertical: 'eletrodomesticos', gtin: null, mpn: 'IMP02675', hasImage: true, gate: { verdict: 'review', suggested: 'approved' },
  catalogAttributes: { MODEL: 'Ever Safe', BRAND: 'Safety', ALPHANUMERIC_MODEL: 'IMP02675' }, segment: 'cadeirinha-auto', precosClicaveis: [142490, 149990, 176500, 179990],
  ofertasAtivas: 4, ofertasQuarentena: 0, titulosOfertas: [NOME_CAD], nomeDuplicado: false, ...over,
});
for (const relaxado of [false, true]) {
  const r = avaliarCandidato(cand({}), { relaxado });
  check(`aprovacao (relaxado=${relaxado}): cadeirinha sem voltagem NAO e barrada`, !r.motivos.includes('voltagem_ausente'), r.motivos);
  const r2 = avaliarCandidato(cand({ segment: 'air-fryer' }), { relaxado });
  check(`aprovacao (relaxado=${relaxado}): eletrodomestico eletrico sem voltagem continua barrado`, r2.motivos.includes('voltagem_ausente'), r2.motivos);
}
console.log(`${total - fails}/${total} verificacoes passaram`);
process.exit(fails ? 1 : 0);
