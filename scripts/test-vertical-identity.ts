/**
 * Testes unitarios da fundacao de coleta/semeadura por vertical (sem banco, sem rede):
 * identidade, porteiro, config, paginacao (caso 206) e planejador de semeadura com cliente ML falso.
 * Uso: npx tsx scripts/test-vertical-identity.ts   (sai com codigo 1 se algo falhar)
 */
import fs from 'node:fs';
import path from 'node:path';
import { domainMatches, isVerticalEnabled, killSwitchEnvName, MAX_REFRESH_MIN, refreshMinutesFor, seedOrder, SEGMENTS, segmentByKey, segmentsOf } from '../src/lib/catalog/vertical/config';
import { evaluateIdentity, extractGtins, isbn10to13, isIsbn13, isValidGtin, normalizeTitleKey, rejectionOf, type MlCatalogPayload } from '../src/lib/catalog/vertical/identity';
import { gateFor, reviewGateFor } from '../src/lib/catalog/vertical/gate';
import { fetchVerticalCatalog, VerticalPagingError, type FetchRawPage } from '../src/lib/catalog/vertical/paging';
import { createMlClient, CallBudgetExceeded, RateLimited } from '../src/lib/catalog/vertical/ml-api';
import { accessoryIssue, colorlessTitleKey, comboIssue, scopeIssue, splitPlus } from '../src/lib/catalog/vertical/scope';
import { planSeed,type ExistingLookup } from '../src/lib/catalog/vertical/seed-plan';
import { VERTICALS } from '../src/lib/catalog/verticais';

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

/** Gera um GTIN valido a partir do prefixo (sem o digito verificador). */
function gtin(prefix: string): string {
  const nums = prefix.split('').map(Number).reverse();
  const sum = nums.reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return prefix + String((10 - (sum % 10)) % 10);
}
const attr = (id: string, v: string): { id: string; value_name: string } => ({ id, value_name: v });
const P = (over: Partial<MlCatalogPayload> & { id: string }): MlCatalogPayload => ({ name: 'x', domain_id: 'MLB-BOOKS', attributes: [], ...over });

const livros = segmentByKey('livros')!;
const placa = segmentByKey('placa-de-video')!;
const tenis = segmentByKey('tenis-de-corrida')!;
const geladeira = segmentByKey('geladeira')!;
const ssd = segmentByKey('ssd')!;

// --- GTIN / ISBN ---
const isbn = gtin('978853591484');
check('isValidGtin aceita GTIN-13 valido', isValidGtin(isbn), isbn);
check('isValidGtin rejeita digito errado', !isValidGtin(isbn.slice(0, 12) + String((Number(isbn[12]) + 1) % 10)));
check('isValidGtin rejeita tamanho 10', !isValidGtin('1234567890'));
check('isIsbn13 exige 978/979', isIsbn13(isbn) && !isIsbn13(gtin('789123456789')));
check('isbn10to13 converte ISBN-10 valido (0306406152 -> 9780306406157)', isbn10to13('0306406152') === '9780306406157', isbn10to13('0306406152'));
check('isbn10to13 rejeita ISBN-10 invalido', isbn10to13('0306406153') === null);
check('extractGtins junta GTIN em lista e ignora invalido', JSON.stringify(extractGtins(P({ id: 'a', attributes: [attr('GTIN', `${isbn}, 12345`)] }))) === JSON.stringify([isbn]));

// --- Livros: so ISBN-13 ---
let r = evaluateIdentity(P({ id: 'MLB1', attributes: [attr('GTIN', isbn)] }), livros);
check('livro com ISBN-13 valido => strong isbn:', r.status === 'strong' && r.key === `isbn:${isbn}` && r.keyKind === 'isbn', r);
r = evaluateIdentity(P({ id: 'MLB1', attributes: [attr('GTIN', gtin('789123456789'))] }), livros);
check('livro com GTIN que nao e ISBN => review (nunca strong)', r.status === 'review' && r.key === null, r);
r = evaluateIdentity(P({ id: 'MLB1', attributes: [attr('GTIN', gtin('978972213226'))] }), livros);
check('livro com ISBN de Portugal (978-972) => rejected isbn_importado', r.status === 'rejected' && r.reason === 'isbn_importado', r);
r = evaluateIdentity(P({ id: 'MLB1', attributes: [attr('GTIN', gtin('978655000001'))] }), livros);
check('livro com ISBN brasileiro 978-65 => strong', r.status === 'strong', r);
r = evaluateIdentity(P({ id: 'MLB1', attributes: [attr('BRAND', 'Editora X'), attr('MODEL', 'Y')] }), livros);
check('livro sem GTIN nao cai em marca+modelo => review', r.status === 'review', r);

// --- Dominio ---
r = evaluateIdentity(P({ id: 'MLB2', name: 'Notebook Acer', domain_id: 'MLB-NOTEBOOKS', attributes: [attr('GTIN', gtin('789123456789'))] }), ssd);
check('busca "ssd" que trouxe notebook => off_domain', r.status === 'off_domain', r);
r = evaluateIdentity(P({ id: 'MLB3', name: 'Balao', domain_id: 'MLB-BALLOONS', attributes: [attr('GTIN', gtin('789123456780'))] }), segmentByKey('bola')!);
check('busca "bola" que trouxe balao => off_domain', r.status === 'off_domain', r);
check('impressora 3D nao entra em impressora', !domainMatches(segmentByKey('impressora')!, 'MLB-3D_PRINTERS') && domainMatches(segmentByKey('impressora-3d')!, 'MLB-3D_PRINTERS'));
check('domainMatches null => false', !domainMatches(livros, null));

// --- Rejeicao ---
for (const [nome, t] of [
  ['usado', 'Playstation Usado'],
  ['seminovo', 'Notebook Seminovo i5'],
  ['recondicionado', 'Notebook Recondicionado Dell'],
  ['open box', 'Geladeira Open Box Brastemp'],
  ['reembalado', 'Smart TV Reembalada 55'],
  ['importado', 'Livro Importado em Ingles'],
  ['vitrine', 'Fogao de Vitrine'],
] as const) {
  const rr = evaluateIdentity(P({ id: 'MLB9', name: t, domain_id: 'MLB-BOOKS', attributes: [attr('GTIN', isbn)] }), livros);
  check(`rejeita ${nome} mesmo com ISBN valido`, rr.status === 'rejected', rr);
}
check('ITEM_CONDITION usado rejeita', rejectionOf(P({ id: 'a', name: 'Livro bom', attributes: [attr('ITEM_CONDITION', 'Usado')] }))?.reason === 'condicao_nao_nova');
check('livro novo normal nao e rejeitado', rejectionOf(P({ id: 'a', name: 'Dom Casmurro - Machado de Assis' })) === null);
check('"nova edicao" nao dispara usado', rejectionOf(P({ id: 'a', name: 'Livro Nova Edicao Revisada' })) === null);

// --- Placa de video: GTIN > MPN > marca+modelo+serie+edicao+memoria ---
const gpuAttrs = [attr('BRAND', 'ASUS'), attr('SERIES', 'RTX 4060'), attr('MODEL', 'Dual'), attr('EDITION', 'OC'), attr('MEMORY_SIZE', '8 GB')];
const gpu = (extra: ReturnType<typeof attr>[] = [], name = 'Placa de Video'): MlCatalogPayload => P({ id: 'MLBG', name, domain_id: 'MLB-GRAPHICS_CARDS', attributes: [...gpuAttrs, ...extra] });
r = evaluateIdentity(gpu([attr('GTIN', gtin('471234567890'))]), placa);
check('placa com GTIN => gtin:', r.status === 'strong' && r.keyKind === 'gtin', r);
r = evaluateIdentity(gpu([attr('MPN', 'DUAL-RTX4060-O8G')]), placa);
check('placa sem GTIN com MPN+marca => mpn:', r.status === 'strong' && r.keyKind === 'mpn' && r.key === 'mpn:asus|dual rtx4060 o8g', r);
r = evaluateIdentity(gpu(), placa);
check('placa sem GTIN/MPN com serie+edicao+memoria => bm:', r.status === 'strong' && r.keyKind === 'brand_model' && /series=rtx 4060/.test(r.key!) && /memory_size=8 gb/.test(r.key!), r);
const semEdicao = P({ id: 'MLBG2', domain_id: 'MLB-GRAPHICS_CARDS', attributes: gpuAttrs.filter((a) => a.id !== 'EDITION') });
r = evaluateIdentity(semEdicao, placa);
check('placa sem EDITION => review listando o que falta', r.status === 'review' && r.missing.includes('EDITION') && r.key === null, r);
const outraMemoria = evaluateIdentity(P({ id: 'MLBG3', domain_id: 'MLB-GRAPHICS_CARDS', attributes: gpuAttrs.map((a) => (a.id === 'MEMORY_SIZE' ? attr('MEMORY_SIZE', '16 GB') : a)) }), placa);
check('memoria diferente => chave diferente (variantes nao juntam)', outraMemoria.key !== evaluateIdentity(gpu(), placa).key);

// --- Voltagem separa (geladeira) ---
const gel = (volt: string): MlCatalogPayload => P({ id: 'MLBF', domain_id: 'MLB-REFRIGERATORS', attributes: [attr('BRAND', 'Electrolux'), attr('MODEL', 'DF44'), attr('VOLTAGE', volt)] });
check('geladeira 110V e 220V sem GTIN => chaves diferentes', evaluateIdentity(gel('110V'), geladeira).key !== evaluateIdentity(gel('220V'), geladeira).key);
check('geladeira mesma voltagem => mesma chave (cor nao separa; ordem de atributos nao importa)', evaluateIdentity(gel('220V'), geladeira).key === evaluateIdentity({ ...gel('220V'), attributes: [...gel('220V').attributes!].reverse() }, geladeira).key);

// --- Tenis: nunca forte ---
r = evaluateIdentity(P({ id: 'MLBT', name: 'Tenis Asics', domain_id: 'MLB-SNEAKERS', attributes: [attr('GTIN', gtin('789123456789')), attr('BRAND', 'Asics'), attr('MODEL', 'Gel')] }), tenis);
check('tenis, mesmo com GTIN, so revisao (key null)', r.status === 'review' && r.key === null, r);

// --- Titulo normalizado ---
check('normalizeTitleKey ignora acento, caixa, pontuacao e ordem', normalizeTitleKey('Soundbar JBL, 2.1 Canais') === normalizeTitleKey('canais 2.1 soundbar jbl'));
check('normalizeTitleKey separa produtos diferentes', normalizeTitleKey('Livro A') !== normalizeTitleKey('Livro B'));

// --- Porteiro por vertical ---
const g = gateFor('livros');
let id = evaluateIdentity(P({ id: 'MLB1', name: 'Dom Casmurro', attributes: [attr('GTIN', isbn)] }), livros);
let gv = g.evaluate({ segment: 'livros', name: 'Dom Casmurro', domainId: 'MLB-BOOKS', identity: id });
check('porteiro aprova com evidencia positiva (dominio + identidade forte)', gv.verdict === 'approved' && gv.category === 'ok', gv);
id = evaluateIdentity(P({ id: 'MLB1', name: 'Usado', attributes: [attr('GTIN', isbn)] }), livros);
gv = g.evaluate({ segment: 'livros', name: 'Livro Usado', domainId: 'MLB-BOOKS', identity: id });
check('porteiro rejeita usado', gv.verdict === 'rejected' && gv.category === 'used', gv);
id = evaluateIdentity(P({ id: 'MLB1', name: 'x', attributes: [] }), livros);
gv = g.evaluate({ segment: 'livros', name: 'Livro sem ISBN', domainId: 'MLB-BOOKS', identity: id });
check('sem identidade forte => review (nao aprova)', gv.verdict === 'review', gv);
gv = g.evaluate({ segment: 'livros', name: 'Notebook', domainId: 'MLB-NOTEBOOKS', identity: evaluateIdentity(P({ id: 'z', domain_id: 'MLB-NOTEBOOKS', attributes: [attr('GTIN', isbn)] }), livros) });
check('OUTRA VERTICAL/dominio nunca e rejected: vira review', gv.verdict === 'review' && gv.category === 'out_of_scope', gv);
gv = g.evaluate({ segment: 'livros', name: 'Caderno Universitario', domainId: 'MLB-BOOKS', identity: evaluateIdentity(P({ id: 'z', attributes: [attr('GTIN', isbn)] }), livros) });
check('lexico fora do escopo => review', gv.verdict === 'review' && gv.reason === 'lexico_fora_do_escopo', gv);
gv = g.evaluate({ segment: 'placa-de-video', name: 'x', domainId: 'MLB-GRAPHICS_CARDS', identity: id });
check('segmento de outro departamento => review, nunca rejected', gv.verdict === 'review', gv);
check('gateFor devolve o mesmo objeto (cache)', gateFor('tecnologia') === gateFor('tecnologia'));
const rg = reviewGateFor(g.evaluate({ segment: 'livros', name: 'Dom Casmurro', domainId: 'MLB-BOOKS', identity: evaluateIdentity(P({ id: 'z', attributes: [attr('GTIN', isbn)] }), livros) }), '2026-11-08T00:00:00Z');
check('master da semeadura SEMPRE nasce em review (rede de seguranca), com sugestao do porteiro', rg.verdict === 'review' && rg.suggested === 'approved', rg);

// --- Config ---
check('todas as verticais da config existem na lista fixa do CHECK (VERTICALS)', SEGMENTS.every((s) => (VERTICALS as readonly string[]).includes(s.vertical)));
check('nenhum segmento usa games', SEGMENTS.every((s) => s.vertical !== ('games' as string)));
const ordem = seedOrder().map((s) => s.key);
check('semeadura: livros, placa de video, impressora primeiro', ordem.slice(0, 3).join() === 'livros,placa-de-video,impressora', ordem);
// Ampliacao 2026-11-10: os 13 segmentos originais mantem a ordem medida (pior por ultimo DENTRO deles); os novos vem depois.
check('semeadura: entre os 13 originais, tenis, maquina de lavar, impressora 3D por ultimo', ['tenis-de-corrida', 'maquina-de-lavar', 'impressora-3d'].every((k) => ordem.indexOf(k) >= 10 && ordem.indexOf(k) < 13), ordem);
check('ranks unicos', new Set(SEGMENTS.map((s) => s.seedRank)).size === SEGMENTS.length);
check('segmentsOf agrupa por departamento (13 originais + 13 novos da ampliacao)', segmentsOf('tecnologia').length === 12 && segmentsOf('esporte').length === 4 && segmentsOf('livros').length === 1 && segmentsOf('eletroeletronicos').length === 4 && segmentsOf('eletrodomesticos').length === 5);
check('kill-switch desligado por padrao', !isVerticalEnabled('livros', {}));
check('kill-switch so liga com 1/true', isVerticalEnabled('livros', { VERTICAL_LIVROS_ENABLED: '1' }) && isVerticalEnabled('livros', { VERTICAL_LIVROS_ENABLED: 'true' }) && !isVerticalEnabled('livros', { VERTICAL_LIVROS_ENABLED: '0' }) && !isVerticalEnabled('livros', { VERTICAL_LIVROS_ENABLED: 'sim' }) && !isVerticalEnabled('livros', { VERTICAL_LIVROS_ENABLED: '' }));
check('nome do kill-switch', killSwitchEnvName('eletroeletronicos') === 'VERTICAL_ELETROELETRONICOS_ENABLED');
check('refresh: livros 60 min; tecnologia 30 min', refreshMinutesFor('livros', {}) === 60 && refreshMinutesFor('tecnologia', {}) === 30);
check('refresh: override respeitado e limitado pelo teto de 6 h dos termos do ML', refreshMinutesFor('livros', { VERTICAL_LIVROS_REFRESH_MIN: '10' }) === 10 && refreshMinutesFor('livros', { VERTICAL_LIVROS_REFRESH_MIN: '9999' }) === MAX_REFRESH_MIN);
check('porteiro por vertical NAO importa o porteiro gamer (gate.ts)', ['gate.ts', 'identity.ts', 'config.ts', 'seed-plan.ts', 'paging.ts'].every((f) => !/@\/lib\/catalog\/gate['"]|from ['"]\.\.\/gate['"]/.test(fs.readFileSync(path.resolve('src/lib/catalog/vertical', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))));

// --- Pacotes/combos (achado do dry-run 2): "+" so conta com 2+ produtos ou produto + acessorio ---
const combos: Array<[string, string]> = [
  ['soundbar', 'Soundbar Samsung Hw-b450f + Soundbar Hw-b400f'],
  ['soundbar', 'Soundbar Samsung Hw-b650f + Soundbar Hw-b400f Preto'],
  ['soundbar', 'Soundbar Samsung Hw-b450f + Hw-b400f'],
  ['smart-tv', 'Samsung Smart Tv 55 4k U8000h + Samsung Smart Tv 32 Hd.'],
  ['smart-tv', 'Samsung Smart Tv 55 4k U8000h + Smart Tv 43 Qled Fhd Q5f.'],
  ['smart-tv', 'Samsung Smart Tv 55 Miniled 4k M75h + Samsung Smart Tv 43 Qled Full Hd Q5f'],
  ['smart-tv', 'Smart Tv 43 Lg + Suporte de Parede'],
  ['bola', 'Bola Futebol Campo Nike + Bomba de Ar'],
  ['bola', 'Kit 2 Bolas de Futebol Campo'],
  ['air-fryer', 'Air Fryer Mondial 4l Combo com Assadeira'],
  ['ssd', 'Ssd Kingston 1tb + Hd Seagate 2tb'],
];
for (const [seg, nome] of combos) check(`combo detectado [${seg}]: ${nome}`, comboIssue(seg, nome)?.reason === 'combo_pacote', comboIssue(seg, nome));
const naoCombos: Array<[string, string]> = [
  ['smart-tv', 'Smart Tv Samsung 55 Crystal 4k Uhd Hdr10+ Wi-fi'],
  ['smart-tv', 'Samsung Galaxy S23+ 256gb'],
  ['soundbar', 'Soundbar Samsung Hw-b450f Dolby Atmos + Dts:x 2.1 Canais'],
  ['soundbar', 'Kit Home Theater 5.1 Samsung Ht-j5500'],
  ['soundbar', 'Soundbar Jbl Bar 2.1 Deep Bass Wi-fi + Bluetooth'],
  ['placa-de-video', 'Placa de Video Rtx 4060 8gb Dual + Gddr6'],
  ['placa-de-video', 'Placa de Video Asus Dual Rtx 4060 Oc Edition 8gb'],
  ['livros', 'Dungeons & Dragons - Livro do Jogador'],
  ['livros', 'Livro Harry Potter + A Pedra Filosofal'],
  ['air-fryer', 'Air Fryer Philips Walita Pro 6.2l Com Cesto Removivel'],
  ['impressora', 'Impressora Multifuncional Epson Ecotank L3250 Wi-fi'],
  ['bola', 'Bola de Futebol Campo Nike Pitch Number 5'],
];
for (const [seg, nome] of naoCombos) check(`NAO e combo [${seg}]: ${nome}`, comboIssue(seg, nome) === null, comboIssue(seg, nome));
check('splitPlus: sinal colado (S23+, Hdr10+) nao separa', splitPlus('Galaxy S23+ 256gb').length === 1 && splitPlus('A + B').length === 2);

// --- Acessorio/peca dentro do dominio do aparelho ---
const acessorios: Array<[string, string]> = [
  ['air-fryer', 'Assadeira Forma Air Fryer Philips Walita Preto'],
  ['air-fryer', 'Cesto para Air Fryer Mondial 4l'],
  ['air-fryer', 'Papel Forro Descartavel para Fritadeira Air Fryer'],
  ['smart-tv', 'Tela Hdr da Smart TV LG 50uk6090pua Led Uhd 4k Smart TV de 50 polegadas'],
  ['smart-tv', 'Controle Remoto Samsung Smart Tv'],
  ['smart-tv', 'Samsung Controle Remoto Tv 4k'],
  ['smart-tv', 'Capa Protetora para Smart Tv 55'],
  ['soundbar', 'Suporte para Soundbar Samsung'],
  ['bola', 'Bomba de Ar para Bola de Futebol'],
  ['bola', 'Bolsa Porta Bola Futebol'],
  ['notebook', 'Carregador para Notebook Dell Inspiron'],
  ['impressora', 'Cartucho de Tinta para Impressora Epson'],
  ['impressora-3d', 'Filamento Pla 1kg para Impressora 3d'],
  ['ssd', 'Case para Ssd Nvme M2'],
];
for (const [seg, nome] of acessorios) check(`acessorio detectado [${seg}]: ${nome}`, accessoryIssue(seg, nome)?.reason === 'acessorio_ou_peca', accessoryIssue(seg, nome));
const aparelhos: Array<[string, string]> = [
  ['air-fryer', 'Air Fryer Philips Walita Pro 6.2l Com Cesto Removivel'],
  ['air-fryer', 'Fritadeira Air Fryer Forno Oven 12l Mondial'],
  ['air-fryer', 'Philips Walita Airfryer Forma Antiaderente 4.1l'],
  ['smart-tv', 'Smart Tv 55 Tela Plana Led Samsung Crystal 4k'],
  ['smart-tv', 'Tv Tela 4k Lg 50 Polegadas Smart'],
  ['smart-tv', 'Samsung Smart Tv 55 4k U8000h'],
  ['soundbar', 'Soundbar Samsung Hw-b450f para Tv 2.1 Canais'],
  ['soundbar', 'Home Theater Samsung Ht-j5500 com Subwoofer'],
  ['bola', 'Bola Futebol Campo cor01'],
  ['bola', 'Bola de Futebol Campo Vinil Vermelho Costurada'],
  ['notebook', 'Notebook Acer Aspire 5 Tela 15.6 Intel Core i5'],
  ['placa-de-video', 'Placa de Video Asus Dual Geforce Rtx 4060 8gb Ventilador Duplo'],
  ['impressora', 'Impressora Multifuncional Hp Smart Tank 584 com Tinta'],
  ['ssd', 'Ssd Kingston Nv2 1tb Nvme M2'],
  ['livros', 'Capa Dura - Dom Casmurro'],
];
for (const [seg, nome] of aparelhos) check(`aparelho legitimo NAO e acessorio [${seg}]: ${nome}`, scopeIssue(seg, nome) === null, scopeIssue(seg, nome));

// Integracao com a identidade: pacote e acessorio viram REVISAO (nunca strong, nunca rejected), mesmo com GTIN valido.
const tvSeg = segmentByKey('smart-tv')!;
const afrSeg = segmentByKey('air-fryer')!;
const tvPay = (name: string): MlCatalogPayload => P({ id: 'MLBTV', name, domain_id: 'MLB-TELEVISIONS', attributes: [attr('GTIN', gtin('789103326472')), attr('BRAND', 'Samsung')] });
r = evaluateIdentity(tvPay('Samsung Smart Tv 55 4k U8000h + Samsung Smart Tv 32 Hd.'), tvSeg);
check('identidade: combo de TVs com GTIN valido => review combo_pacote', r.status === 'review' && r.reason === 'combo_pacote' && r.key === null, r);
r = evaluateIdentity(P({ id: 'MLBAF', name: 'Assadeira Forma Air Fryer Philips Walita Preto', domain_id: 'MLB-AIR_FRYERS', attributes: [attr('GTIN', gtin('422245952761'))] }), afrSeg);
check('identidade: assadeira no dominio AIR_FRYERS => review acessorio_ou_peca', r.status === 'review' && r.reason === 'acessorio_ou_peca' && r.matched === 'assadeira', r);
r = evaluateIdentity(tvPay('Tela Hdr da Smart TV LG 50uk6090pua Led Uhd 4k'), tvSeg);
check('identidade: tela de reposicao no dominio TELEVISIONS => review', r.status === 'review' && r.reason === 'acessorio_ou_peca', r);
r = evaluateIdentity(tvPay('Smart Tv Samsung 55 Crystal 4k U8000h'), tvSeg);
check('identidade: TV legitima continua strong gtin:', r.status === 'strong' && r.keyKind === 'gtin', r);
r = evaluateIdentity(tvPay('Smart Tv Samsung 55 Usado + Samsung Smart Tv 32'), tvSeg);
check('identidade: usado continua rejected antes do escopo', r.status === 'rejected', r);
gv = gateFor('eletroeletronicos').evaluate({ segment: 'smart-tv', name: 'Smart Tv Samsung 55', domainId: 'MLB-TELEVISIONS', identity: evaluateIdentity(tvPay('Smart Tv Samsung 55 Crystal 4k'), tvSeg), offerTitles: ['Smart Tv 55 Samsung + Smart Tv 32 Lg'] });
check('porteiro: titulo de ANUNCIO com pacote => review out_of_scope', gv.verdict === 'review' && gv.reason === 'combo_pacote', gv);

// --- Cor junta (regra do dono, exceto tenis) ---
const bolaSeg = segmentByKey('bola')!;
check('bola: COLOR fora de keyExtras (cor nao separa produto)', !bolaSeg.profile.keyExtras.includes('COLOR'));
check('so o tenis tem COLOR na config, e e review_only', SEGMENTS.filter((s) => s.profile.keyExtras.includes('COLOR') || s.profile.fallbackAttrs.includes('COLOR')).every((s) => s.key === 'tenis-de-corrida' && s.profile.strategy === 'review_only'));
const bolaPay = (cor: string): MlCatalogPayload => P({ id: 'MLBB', name: 'Bola Futebol Campo', domain_id: 'MLB-FOOTBALL_BALLS', attributes: [attr('BRAND', 'FLAR IMPORT'), attr('MODEL', 'Numero 5'), attr('COLOR', cor)] });
check('bola sem GTIN: cores diferentes => MESMA chave bm', evaluateIdentity(bolaPay('Cor 01'), bolaSeg).key === evaluateIdentity(bolaPay('Cor 10'), bolaSeg).key && evaluateIdentity(bolaPay('Cor 01'), bolaSeg).keyKind === 'brand_model');
check('colorlessTitleKey: cor01/cor10/cor07 colapsam', colorlessTitleKey('Bola Futebol Campo cor01') === colorlessTitleKey('Bola Futebol Campo cor10') && colorlessTitleKey('Bola Futebol Campo cor07') === colorlessTitleKey('Bola Futebol Campo cor 10'));
check('colorlessTitleKey: nomes de cor colapsam, modelo continua separando', colorlessTitleKey('Soundbar X Preto') === colorlessTitleKey('Soundbar X Branca') && colorlessTitleKey('Soundbar X1 Preto') !== colorlessTitleKey('Soundbar X2 Preto'));

// --- Paginacao (caso 206) ---
const mkItem = (i: number, extra: Record<string, unknown> = {}) => ({ item_id: `MLB${i}`, seller_id: 1000 + i, price: 100 + i, condition: 'new', original_price: null, ...extra });
const pager = (pages: Array<{ status: number; body: unknown } | Error>): FetchRawPage & { calls: number } => {
  let n = 0;
  const f = (async () => {
    const p = pages[Math.min(n, pages.length - 1)];
    n++;
    f.calls = n;
    if (p instanceof Error) throw p;
    return p;
  }) as unknown as FetchRawPage & { calls: number };
  f.calls = 0;
  return f;
};
const run = async () => {
  let o = await fetchVerticalCatalog('C1', pager([{ status: 404, body: { message: 'No winners found' } }]));
  check('404 na 1a pagina => empty (sem retentar: 1 chamada)', o.kind === 'empty' && o.calls === 1, o);

  o = await fetchVerticalCatalog('C2', pager([{ status: 200, body: { results: [mkItem(1), mkItem(2)], paging: { total: 2, offset: 0, limit: 100 } } }]));
  check('200 completo => complete com 2 itens', o.kind === 'complete' && o.items.length === 2, o);

  o = await fetchVerticalCatalog('C3', pager([{ status: 206, body: { results: [mkItem(1), mkItem(2), mkItem(3)], paging: { total: 4, offset: 0, limit: 100 } } }, { status: 206, body: { results: [], paging: { total: 4, offset: 3, limit: 100 } } }]));
  check('206 com total 4 e 3 itens (achado da soundbar) => PARTIAL, nao falha eterna', o.kind === 'partial' && o.items.length === 3 && o.total === 4 && o.seen === 3, o);

  o = await fetchVerticalCatalog('C4', pager([{ status: 200, body: { results: [mkItem(1), mkItem(2)], paging: { total: 3, offset: 0, limit: 2 } } }, { status: 200, body: { results: [mkItem(3)], paging: { total: 3, offset: 2, limit: 2 } } }]), { pageSize: 2 });
  check('2 paginas somam 3 itens => complete', o.kind === 'complete' && o.items.length === 3 && o.calls === 2, o);

  const falha = async (pages: Parameters<typeof pager>[0], opts = {}) => {
    try {
      await fetchVerticalCatalog('CX', pager(pages), opts);
      return null;
    } catch (e) {
      return e instanceof VerticalPagingError ? e.kind : 'outro:' + (e as Error).message;
    }
  };
  check('itens sem paging => falha fechada paging-ausente', (await falha([{ status: 200, body: { results: [mkItem(1)] } }])) === 'paging-ausente');
  check('paging.offset diferente do pedido => paging-inconsistente', (await falha([{ status: 200, body: { results: [mkItem(1)], paging: { total: 1, offset: 5, limit: 100 } } }])) === 'paging-inconsistente');
  check('mais itens que o total => paging-inconsistente', (await falha([{ status: 200, body: { results: [mkItem(1), mkItem(2)], paging: { total: 1, offset: 0, limit: 100 } } }])) === 'paging-inconsistente');
  check('total muda entre paginas => paging-inconsistente', (await falha([{ status: 200, body: { results: [mkItem(1)], paging: { total: 3, offset: 0, limit: 1 } } }, { status: 200, body: { results: [mkItem(2)], paging: { total: 4, offset: 1, limit: 1 } } }], { pageSize: 1 })) === 'paging-inconsistente');
  check('HTTP 500 depois de 1 retry => pagina-falhou', (await falha([{ status: 500, body: null }])) === 'pagina-falhou');
  check('erro de rede => pagina-falhou (nada gravado)', (await falha([new Error('ECONNRESET')])) === 'pagina-falhou');
  check('teto de paginas => teto-paginas', (await falha([{ status: 200, body: { results: [mkItem(1)], paging: { total: 99, offset: 0, limit: 1 } } }], { pageSize: 1, maxPages: 1 })) === 'teto-paginas');
  let cobradas = 0;
  check('orcamento esgotado => orcamento (antes da chamada)', (await falha([{ status: 200, body: { results: [], paging: { total: 0, offset: 0, limit: 100 } } }], { charge: () => cobradas++ < 0 })) === 'orcamento');
  o = await fetchVerticalCatalog('C5', pager([{ status: 200, body: { results: [mkItem(1, { condition: 'used' })], paging: { total: 1, offset: 0, limit: 100 } } }]));
  check('so usado no catalogo => complete SEM itens novos (usado fora)', o.kind === 'complete' && o.items.length === 0, o);
  o = await fetchVerticalCatalog('C6', pager([{ status: 200, body: { results: [], paging: { total: 0, offset: 0, limit: 100 } } }]));
  check('200 vazio com total 0 => empty', o.kind === 'empty');
  o = await fetchVerticalCatalog('C7', pager([{ status: 206, body: { results: [], paging: { total: 3, offset: 0, limit: 100 } } }]));
  check('206 sem nenhum item e total>0 => partial indeterminado (0 itens, nao e "sem vendedor")', o.kind === 'partial' && o.items.length === 0 && o.seen === 0, o);

  // --- Cliente ML com teto ---
  const fakeFetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
  const cl = createMlClient({ token: 'SEGREDO', maxCalls: 2, fetchImpl: fakeFetch });
  await cl.get('/a?access_token=SEGREDO');
  await cl.get('/b');
  let estourou = false;
  try {
    await cl.get('/c');
  } catch (e) {
    estourou = e instanceof CallBudgetExceeded;
  }
  check('cliente ML respeita o teto de chamadas (a 3a nao sai)', estourou && cl.used() === 2);
  check('log do cliente nao contem o token', !JSON.stringify(cl.history()).includes('SEGREDO'));
  const cl429 = createMlClient({ token: 't', maxCalls: 5, fetchImpl: (async () => new Response('{}', { status: 429 })) as typeof fetch });
  let rl = false;
  try {
    await cl429.get('/x');
  } catch (e) {
    rl = e instanceof RateLimited;
  }
  check('429 interrompe', rl);

  // --- Planejador de semeadura com cliente ML FALSO (dados do teste, nao de producao) ---
  const isbnA = gtin('978850000001');
  const isbnB = gtin('978850000002');
  const isbnDup = gtin('978850000003');
  const search = {
    paging: { total: 6, offset: 0, limit: 10 },
    results: [
      { id: 'MLB-A', name: 'Livro A', domain_id: 'MLB-BOOKS', attributes: [attr('GTIN', isbnA)] },
      { id: 'MLB-MORTO', name: 'Livro Morto', domain_id: 'MLB-BOOKS', attributes: [attr('GTIN', isbnB)] },
      { id: 'MLB-LIXO', name: 'Mochila', domain_id: 'MLB-BACKPACKS', attributes: [attr('GTIN', gtin('789000000001'))] },
      { id: 'MLB-USADO', name: 'Livro Usado Raro', domain_id: 'MLB-BOOKS', attributes: [attr('GTIN', gtin('978000000004'))] },
      { id: 'MLB-DUP', name: 'Livro Ja Cadastrado', domain_id: 'MLB-BOOKS', attributes: [attr('GTIN', isbnDup)] },
      { id: 'MLB-SEMISBN', name: 'Livro Sem ISBN', domain_id: 'MLB-BOOKS', attributes: [] },
    ],
  };
  const chamadas: string[] = [];
  const fake = (async (url: string) => {
    const ep = String(url).replace('https://api.mercadolibre.com', '');
    chamadas.push(ep);
    const j = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (ep.startsWith('/products/search')) return j(200, search);
    if (ep === '/products/MLB-MORTO/items?limit=100') return j(404, { message: 'No winners found' });
    if (ep === '/products/MLB-A/items?limit=100') return j(200, { results: [mkItem(1), mkItem(2, { condition: 'used' }), mkItem(3, { original_price: 150 })], paging: { total: 3, offset: 0, limit: 100 } });
    if (ep === '/products/MLB-A') return j(200, { id: 'MLB-A', name: 'Livro A Completo', domain_id: 'MLB-BOOKS', attributes: [attr('GTIN', isbnA), attr('AUTHOR', 'Fulano')], pictures: [{ secure_url: 'https://x/y.jpg' }] });
    return j(500, {});
  }) as unknown as typeof fetch;
  const lookup: ExistingLookup = {
    byCatalogId: async () => null,
    byGtins: async (g) => (g.includes(isbnDup) ? { id: 'M1', name: 'Livro Ja Cadastrado' } : null),
    byIdentityKey: async () => null,
    byTitleKey: async () => null,
  };
  const cli = createMlClient({ token: 't', maxCalls: 12, fetchImpl: fake });
  const rep = await planSeed(cli, segmentByKey('livros')!, lookup, { termsLimit: 1 });
  check('seed: 1 candidato planejado (o livro A)', rep.plans.length === 1 && rep.plans[0].catalogId === 'MLB-A', rep.plans.map((p) => p.catalogId));
  check('seed: usa o nome e a imagem do DETALHE, so anuncios novos (2 de 3), menor preco real', rep.plans[0].name === 'Livro A Completo' && rep.plans[0].sellers === 2 && rep.plans[0].priceMinCents === 10100 && rep.plans[0].pictures[0] === 'https://x/y.jpg', rep.plans[0]);
  check('seed: original_price do anuncio mais barato fica NULL quando a API nao devolveu', rep.plans[0].bestOriginalPriceCents === null, rep.plans[0].bestOriginalPriceCents);
  check('seed: dominio fora, usado e duplicata de GTIN nao viram master', (rep.counts.dominio_fora_do_segmento ?? 0) === 1 && (rep.counts['rejeitado_usado'] ?? 0) === 1 && (rep.counts.ja_existe_gtin ?? 0) === 1, rep.counts);
  check('seed: catalogo morto (404) descartado sem retentar', rep.counts.sem_vendedor_404 === 1 && chamadas.filter((c) => c.includes('MLB-MORTO')).length === 1, chamadas);
  check('seed: sem ISBN vai para revisao, nao cria master', rep.reviews.length === 1 && rep.reviews[0].catalogId === 'MLB-SEMISBN', rep.reviews);
  check('seed: 4 chamadas (1 busca + A items + A detalhe + MORTO items; duplicata, lixo e usado custam 0)', cli.used() === 4, chamadas);
  check('seed: nunca chama a busca aberta /sites/MLB/search nem o multiget /items?ids=', chamadas.every((c) => !c.startsWith('/sites/') && !c.startsWith('/items')), chamadas);
  check('seed: porteiro sugere approved mas o master vai nascer em review (reviewGateFor)', rep.plans[0].gate.verdict === 'approved');

  const cli2 = createMlClient({ token: 't', maxCalls: 2, fetchImpl: fake });
  const rep2 = await planSeed(cli2, segmentByKey('livros')!, lookup, { termsLimit: 1 });
  check('seed: com teto de 2 chamadas para ao faltar folga para /items + detalhe', rep2.stoppedBecause === 'teto_de_chamadas' && cli2.used() <= 2, { s: rep2.stoppedBecause, u: cli2.used() });

  // --- Semeadura: variantes de cor, combos e acessorios vao para REVISAO; aparelhos legitimos seguem planejados ---
  const bolaAttrs = (g: string, cor: string, modelo = 'Numero 5', brand = 'FLAR IMPORT') => [attr('GTIN', g), attr('BRAND', brand), attr('MODEL', modelo), attr('COLOR', cor)];
  const catB: Record<string, { name: string; attrs: ReturnType<typeof attr>[] }> = {
    'MLB-B1': { name: 'Bola Futebol Campo cor01', attrs: bolaAttrs(gtin('789261566663'), 'Cor 01') },
    'MLB-B2': { name: 'Bola Futebol Campo cor10', attrs: bolaAttrs(gtin('789942336728'), 'COR 10') },
    'MLB-B3': { name: 'Bola Futebol Campo cor07', attrs: bolaAttrs(gtin('789467492547'), 'Cor 07') },
    'MLB-B4': { name: 'Bola Futebol Campo Vinil Vermelho Costurada', attrs: bolaAttrs(gtin('790812428226'), 'Vermelho', 'Couro Sintetico', 'DNE') },
    'MLB-B5': { name: 'Bola Futebol Campo Nike + Bomba de Ar', attrs: bolaAttrs(gtin('789000000011'), 'Branco', 'Pitch', 'Nike') },
    'MLB-B6': { name: 'Bomba de Ar para Bola de Futebol', attrs: bolaAttrs(gtin('789000000012'), 'Preto', 'Bomba', 'Nike') },
  };
  const searchB = { paging: { total: 6, offset: 0, limit: 10 }, results: Object.entries(catB).map(([cid, c]) => ({ id: cid, name: c.name, domain_id: 'MLB-FOOTBALL_BALLS', attributes: c.attrs })) };
  const chamadasB: string[] = [];
  const fakeB = (async (url: string) => {
    const ep = String(url).replace('https://api.mercadolibre.com', '');
    chamadasB.push(ep);
    const j = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    if (ep.startsWith('/products/search')) return j(200, searchB);
    const mi = /^\/products\/(MLB-B\d)\/items/.exec(ep);
    if (mi) return j(200, { results: [mkItem(Number(mi[1].slice(-1))), mkItem(Number(mi[1].slice(-1)) + 50)], paging: { total: 2, offset: 0, limit: 100 } });
    const md = /^\/products\/(MLB-B\d)$/.exec(ep);
    if (md) return j(200, { id: md[1], name: catB[md[1]].name, domain_id: 'MLB-FOOTBALL_BALLS', attributes: catB[md[1]].attrs });
    return j(500, {});
  }) as unknown as typeof fetch;
  const lookupVazio: ExistingLookup = { byCatalogId: async () => null, byGtins: async () => null, byIdentityKey: async () => null, byTitleKey: async () => null };
  const repB = await planSeed(createMlClient({ token: 't', maxCalls: 40, fetchImpl: fakeB }), bolaSeg, lookupVazio, { termsLimit: 1 });
  check('bolas: planeja so cor01 (base) e o modelo realmente diferente (2 masters, nao 4)', repB.plans.map((p) => p.catalogId).sort().join() === 'MLB-B1,MLB-B4', repB.plans.map((p) => p.catalogId));
  const rv = repB.reviews.filter((x) => x.reason === 'variante_de_cor_do_mesmo_modelo');
  check('bolas: cor10 e cor07 vao para revisao apontando o catalogo-base MLB-B1', rv.length === 2 && rv.every((x) => x.relatedCatalogId === 'MLB-B1') && repB.counts.revisao_variante_de_cor === 2, repB.reviews);
  check('bolas: pacote (bola + bomba) e acessorio (bomba) vao para revisao, nao viram master', repB.reviews.some((x) => x.catalogId === 'MLB-B5' && x.reason === 'combo_pacote') && repB.reviews.some((x) => x.catalogId === 'MLB-B6' && x.reason === 'acessorio_ou_peca'), repB.reviews);
  check('bolas: combo/acessorio custam 0 chamadas (barrados na busca)', !chamadasB.some((c) => c.includes('MLB-B5') || c.includes('MLB-B6')), chamadasB);
};

run()
  .then(() => {
    console.log(`${total - fails}/${total} verificacoes passaram`);
    if (fails > 0) process.exit(1);
  })
  .catch((e) => {
    console.error('ERRO NO TESTE:', e);
    process.exit(1);
  });
