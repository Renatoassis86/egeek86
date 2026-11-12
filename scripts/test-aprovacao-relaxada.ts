/**
 * Teste de REGRESSAO da aprovacao relaxada das lojas Plus (dono, 2026-11-12). Sem banco, sem rede.
 *   npx tsx scripts/test-aprovacao-relaxada.ts   (codigo 1 se algo falhar)
 * Garante as duas pontas: itens legitimos que o v2 recusava por excesso de rigor passam; acessorio, usado, brinquedo,
 * duplicata, sem foto, sem oferta clicavel e identidade fraca CONTINUAM recusados (e nao vao para a fila).
 */
import { amplitudeNucleo, avaliarCandidato, MOTIVOS_DA_FILA, type CandidatoMaster } from '../src/lib/catalog/aprovacao-nicho';
import { gateFor } from '../src/lib/catalog/vertical/gate';
import type { IdentityResult } from '../src/lib/catalog/vertical/identity';

let fails = 0;
let total = 0;
function check(nome: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${nome}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

const base = (over: Partial<CandidatoMaster> = {}): CandidatoMaster => ({
  id: 'x', name: 'Air Fryer Britania 5,5L 1500W Antiaderente BFR50 127V', vertical: 'eletrodomesticos', gtin: '7891234567895', mpn: null, hasImage: true,
  gate: { verdict: 'review', suggested: 'approved' }, catalogAttributes: { MODEL: 'BFR50', BRAND: 'Britania' }, segment: 'air-fryer',
  precosClicaveis: [30000, 31000, 32000, 33000], ofertasAtivas: 4, ofertasQuarentena: 0, titulosOfertas: ['Air Fryer Britania BFR50 127V'], nomeDuplicado: false, ...over,
});
const V2 = { relaxado: false };
const V3 = { relaxado: true };

// --- Linha de base: candidato limpo passa nas duas versoes ---
check('base v2 aprova', avaliarCandidato(base(), V2).aprovavel);
check('base v3 aprova', avaliarCandidato(base(), V3).aprovavel);

// --- R1 amplitude do nucleo ---
const pontas = [2900, 4300, 4500, 4600, 4700, 4800, 4900, 5000, 5200, 12600]; // pontas fora da curva, miolo estreito
check('R1 v2 reprova dispersao so nas pontas', avaliarCandidato(base({ vertical: 'livros', gtin: '9788535914849', catalogAttributes: { BOOK_PUBLISHER: 'X' }, precosClicaveis: pontas }), V2).motivos.some((m) => m.startsWith('amplitude')));
check('R1 v3 aprova dispersao so nas pontas', avaliarCandidato(base({ vertical: 'livros', gtin: '9788535914849', catalogAttributes: { BOOK_PUBLISHER: 'X' }, precosClicaveis: pontas }), V3).aprovavel);
check('R1 v3 reprova dispersao no miolo (precos bimodais 100 e 300)', avaliarCandidato(base({ precosClicaveis: [10000, 10000, 10000, 30000, 30000, 30000] }), V3).motivos.includes('amplitude_acima_de_2.5'));
check('R1 menos de 4 ofertas continua estrito (100 e 260)', avaliarCandidato(base({ precosClicaveis: [10000, 26000] }), V3).motivos.includes('amplitude_acima_de_2.5'));
check('R1 teto de 6x no total mesmo com miolo estreito', avaliarCandidato(base({ precosClicaveis: [5000, 30000, 31000, 32000, 33000, 34000, 35000, 36000] }), V3).motivos.some((m) => m === 'amplitude_total_acima_de_6' || m === 'outliers_acima_de_25pct' || m.startsWith('amplitude')));
check('R1 mais de 25% fora da faixa 0,35x-3x continua em revisao', avaliarCandidato(base({ precosClicaveis: [1000, 1100, 30000, 31000, 32000, 33000, 120000, 130000] }), V3).aprovavel === false);
const nu = amplitudeNucleo([100, 100, 100, 100, 100, 100, 100, 100, 100, 1]);
check('amplitudeNucleo descarta 10% de cada ponta (8+)', nu.amplitude === 1, nu);

// --- R2 livro com ISBN tolera quarentena ---
const livro = (over: Partial<CandidatoMaster> = {}) => base({ vertical: 'livros', name: 'Tormenta Alpha', gtin: '9788583650270', catalogAttributes: { BOOK_PUBLISHER: 'Jambo' }, segment: 'livros', precosClicaveis: [9000, 9500, 9900], ofertasAtivas: 3, ofertasQuarentena: 4, ...over });
check('R2 v2 reprova livro com 57% de quarentena', avaliarCandidato(livro(), V2).motivos.includes('quarentena_acima_de_30pct'));
check('R2 v3 aprova livro ISBN com 57% de quarentena e 3 clicaveis', avaliarCandidato(livro(), V3).aprovavel);
check('R2 v3 reprova livro ISBN com 80% de quarentena', avaliarCandidato(livro({ ofertasAtivas: 2, ofertasQuarentena: 8 }), V3).motivos.includes('quarentena_acima_de_30pct'));
check('R2 v3 reprova livro ISBN com so 1 clicavel', avaliarCandidato(livro({ precosClicaveis: [9000], ofertasAtivas: 1, ofertasQuarentena: 2 }), V3).motivos.includes('quarentena_acima_de_30pct'));
check('R2 nao vale para outro departamento', avaliarCandidato(base({ ofertasAtivas: 3, ofertasQuarentena: 4 }), V3).motivos.includes('quarentena_acima_de_30pct'));
check('R2 nao vale sem ISBN (GTIN comum em livro)', avaliarCandidato(livro({ gtin: '7891234567895' }), V3).motivos.includes('quarentena_acima_de_30pct'));

// --- R3 voltagem ---
const semVolt = { name: 'Air Fryer Mondial AFN-40 Preta', catalogAttributes: { MODEL: 'AFN-40' } };
check('R3 v2 reprova voltagem ausente no nome', avaliarCandidato(base(semVolt), V2).motivos.includes('voltagem_ausente'));
check('R3 v3 aceita voltagem lida nos anuncios (todos 220V)', avaliarCandidato(base({ ...semVolt, titulosOfertas: ['Air Fryer Mondial AFN-40 220V', 'Mondial AFN-40 220 V'] }), V3).aprovavel);
check('R3 v3 reprova voltagem mista nos anuncios (110 e 220)', avaliarCandidato(base({ ...semVolt, titulosOfertas: ['AFN-40 110V', 'AFN-40 220V'] }), V3).motivos.includes('voltagem_mista'));
check('R3 v3 reprova air fryer sem voltagem em lugar nenhum e manda para a fila', (() => { const a = avaliarCandidato(base({ ...semVolt, titulosOfertas: ['Air Fryer Mondial AFN-40'] }), V3); return a.motivos.includes('voltagem_ausente') && a.fila; })());
const fogao = { name: 'Fogão 4 Bocas New Sirius Braslar Branco', segment: 'fogao', catalogAttributes: { MODEL: 'New Sirius' }, titulosOfertas: ['Fogão 4 Bocas Braslar Branco'] };
check('R3 v3 fogao a gas dispensa voltagem', avaliarCandidato(base(fogao), V3).aprovavel);
check('R3 v2 fogao a gas ainda exige voltagem', avaliarCandidato(base(fogao), V2).motivos.includes('voltagem_ausente'));
check('R3 fogao eletrico/inducao continua exigindo voltagem', avaliarCandidato(base({ ...fogao, name: 'Cooktop Inducao 4 Bocas Midea', segment: 'cooktop' }), V3).motivos.includes('voltagem_ausente'));
check('R3 geladeira sem voltagem continua em revisao', avaliarCandidato(base({ ...semVolt, segment: 'geladeira', name: 'Geladeira Frost Free Electrolux', titulosOfertas: ['Geladeira Frost Free Electrolux'] }), V3).aprovavel === false);

// --- R4 genero ---
const manguito = (name: string, over: Partial<CandidatoMaster> = {}) => base({ vertical: 'esporte', name, segment: 'roupa-de-compressao', catalogAttributes: { MODEL: 'Manga', BRAND: 'N1 Sport' }, ...over });
check('R4 v2 reprova manguito sem genero', avaliarCandidato(manguito('Manguito Volei Manga Compressao N1 Sport'), V2).motivos.includes('genero_ausente'));
check('R4 v3 aprova manguito (unissex de uso)', avaliarCandidato(manguito('Manguito Volei Manga Compressao N1 Sport'), V3).aprovavel);
check('R4 v3 continua exigindo genero em regata', avaliarCandidato(manguito('Regata Under Armour Tech'), V3).motivos.includes('genero_ausente'));

// --- O QUE NAO RELAXA (regressao): continua recusado e NAO vai para a fila ---
const naoRelaxa: Array<[string, Partial<CandidatoMaster>, string]> = [
  ['usado no nome', { name: 'Air Fryer Britania BFR50 127V usada' }, 'nao_e_produto_novo'],
  ['seminovo no anuncio', { titulosOfertas: ['Air Fryer BFR50 127V seminovo'] }, 'nao_e_produto_novo'],
  ['open box no anuncio', { titulosOfertas: ['Air Fryer BFR50 127V open box'] }, 'nao_e_produto_novo'],
  ['brinquedo', { name: 'Brinquedo Infantil Geladeira Duplex Zuca Toys 220V' }, 'brinquedo_ou_miniatura'],
  ['miniatura', { titulosOfertas: ['Miniatura de fogão 220V'] }, 'brinquedo_ou_miniatura'],
  ['sem foto', { hasImage: false }, 'sem_foto'],
  ['sem oferta clicavel', { precosClicaveis: [] }, 'sem_oferta_clicavel'],
  ['nome duplicado', { nomeDuplicado: true }, 'nome_duplicado'],
  ['sem evidencia do porteiro', { gate: { verdict: 'review', suggested: 'review' } }, 'sem_evidencia_positiva_do_porteiro'],
  ['nome generico', { name: 'Smart TV' }, 'nome_generico'],
];
for (const [nome, over, motivo] of naoRelaxa) {
  const a = avaliarCandidato(base(over), V3);
  check(`NAO relaxa: ${nome} => ${motivo}`, a.motivos.includes(motivo) && !a.aprovavel, a.motivos);
  check(`NAO relaxa: ${nome} nao vai para a fila`, a.fila === false, a);
}
check('NAO relaxa: rejeitado pelo dono nunca aprovavel', avaliarCandidato(base({ gate: { verdict: 'rejected', suggested: 'approved' } }), V3).aprovavel === false);
check('NAO relaxa: ja aprovado nao reaparece como aprovavel', avaliarCandidato(base({ gate: { verdict: 'approved', suggested: 'approved' } }), V3).aprovavel === false);
check('NAO relaxa: identidade fraca (sem modelo) vai para a fila, nao aprova', (() => { const a = avaliarCandidato(base({ catalogAttributes: {}, mpn: null }), V3); return !a.aprovavel && a.motivos.includes('identidade_fraca') && a.fila; })());
check('NAO relaxa: marca generica (TWS / Fone de Ouvido) nao aprova', (() => { const a = avaliarCandidato(base({ vertical: 'eletroeletronicos', name: 'Fone Ouvido Bluetooth Sem Fio Touch', segment: 'fone-de-ouvido', catalogAttributes: { BRAND: 'TWS', MODEL: 'i12' } }), V3); return !a.aprovavel && a.motivos.includes('marca_generica'); })());
check('MOTIVOS_DA_FILA nao contem motivos definitivos', !['nao_e_produto_novo', 'sem_foto', 'nome_duplicado', 'sem_oferta_clicavel', 'brinquedo_ou_miniatura', 'sem_evidencia_positiva_do_porteiro', 'nome_generico', 'rejeitado_pelo_dono', 'ja_aprovado'].some((m) => MOTIVOS_DA_FILA.has(m)));

// --- Resposta 'sim' do dono resolve so os motivos de julgamento ---
const incerto = base({ catalogAttributes: {}, name: 'Air Fryer Qualquer Marca Preta 4L' });
check('confirmadoDono resolve identidade fraca/voltagem', avaliarCandidato(incerto, { relaxado: true, confirmadoDono: true }).aprovavel);
check('confirmadoDono NAO libera usado', avaliarCandidato({ ...incerto, name: 'Air Fryer Qualquer Marca usada' }, { relaxado: true, confirmadoDono: true }).aprovavel === false);
check('confirmadoDono NAO libera sem oferta clicavel', avaliarCandidato({ ...incerto, precosClicaveis: [] }, { relaxado: true, confirmadoDono: true }).aprovavel === false);

// --- Porteiro do departamento: brinquedo/miniatura em loja Plus vai para revisao ---
const forte: IdentityResult = { status: 'strong', key: 'gtin:7891234567895', keyKind: 'gtin', gtins: ['7891234567895'], mpn: null, brand: 'X', model: 'Y', reason: 'ok', missing: [], matched: null } as unknown as IdentityResult;
const gE = gateFor('eletrodomesticos');
const seg = 'geladeira';
const r1 = gE.evaluate({ segment: seg, name: 'Brinquedo Infantil Geladeira Duplex Zuca Toys', domainId: 'MLB-REFRIGERATORS', identity: forte });
check('porteiro eletrodomesticos: brinquedo nao e aprovado', r1.verdict !== 'approved', r1);
const r2 = gE.evaluate({ segment: seg, name: 'Geladeira Frost Free Electrolux 380L', domainId: 'MLB-REFRIGERATORS', identity: forte });
check('porteiro eletrodomesticos: geladeira normal segue aprovada (sem regressao)', r2.verdict === 'approved', r2);

console.log(`\n${total - fails}/${total} verificacoes passaram`);
if (fails) process.exit(1);
