/**
 * Testes da identidade da coleta assistida da Amazon (sem banco, sem rede). Uso: npx tsx scripts/test-amazon-identidade.ts
 */
import { judgeGame, judgeGeneric, prepareGame, prepareGeneric, buildQueryFor, type AmzCand, type MasterIdentity } from '../src/lib/affiliate/amazon-identity';
import { capFor, cycleMinutes, DEFAULT_CYCLE_BUDGET, REFRESH_WEIGHT, DISCOVER_WEIGHT } from '../src/lib/affiliate/amazon-budget';
import { VERTICALS } from '../src/lib/catalog/verticais';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const cand = (t: string, over: Partial<AmzCand> = {}): AmzCand => ({ a: 'B0ABCDEFGH', t, p: 'R$ 1.000,00', l: null, s: 0, ...over });
const M = (o: Partial<MasterIdentity> & Pick<MasterIdentity, 'vertical' | 'name'>): MasterIdentity => ({ gen: null, segment: null, brand: null, gtin: null, mpn: null, cat: null, ...o });
const out = (m: MasterIdentity, c: AmzCand) => judgeGeneric(prepareGeneric(m), c);

// --- Games (lógica original preservada + só produto novo e em linha) ---
const g = prepareGame({ name: 'Resident Evil Village', gen: 'ps5' })!;
check('game: PS5 igual aceita', judgeGame(g, cand('Resident Evil Village - PS5 Mídia Física')).outcome === 'accept');
check('game: outra plataforma rejeita', judgeGame(g, cand('Resident Evil Village - PS4')).outcome === 'reject');
check('game: usado => condição', judgeGame(g, cand('Resident Evil Village PS5 usado')).counter === 'rejeitado_condicao');
check('game: patrocinado fora', judgeGame(g, cand('Resident Evil Village PS5', { s: 1 })).counter === 'patrocinado');
check('game: sem preço inválido', judgeGame(g, cand('Resident Evil Village PS5', { p: null })).counter === 'invalido');
check('game: retrô (PS3) => fora_de_linha_ou_retro', judgeGame(g, cand('Resident Evil Village PS3')).counter === 'fora_de_linha_ou_retro');
check('game: master PS3 não prepara (fora de linha)', prepareGame({ name: 'God of War III', gen: 'ps3' }) === null);
check('game: master Xbox One não prepara', prepareGame({ name: 'Halo Infinite', gen: 'xbox_one' }) === null);
const gx = prepareGame({ name: 'Halo Infinite Xbox Series', gen: 'xbox_series' })!;
check('game: título Xbox One e Series segue moderno', judgeGame(gx, cand('Halo Infinite Xbox Series X|S e Xbox One')).counter !== 'fora_de_linha_ou_retro');
check('game: Xbox 360 puro retrô', judgeGame(gx, cand('Halo 3 Xbox 360')).counter === 'fora_de_linha_ou_retro');
check('game: Wii retrô', judgeGame(g, cand('Mario Kart Wii')).counter === 'fora_de_linha_ou_retro');

// --- TV: mesma marca/série/modelo, polegadas separam ---
const tv50 = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', name: 'Smart Tv 50 4k Uhd Samsung Un50du7700', brand: 'Samsung', cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' } });
const r1 = out(tv50, cand('Samsung Smart TV 50" Crystal UHD 4K UN50DU7700 Bivolt'));
check('tv: mesmo modelo 50" aceita', r1.outcome === 'accept', r1);
check('tv: 55" mesma série rejeita', out(tv50, cand('Samsung Smart TV 55" Crystal UHD 4K UN55DU7700 Bivolt')).outcome === 'reject');
check('tv: código com sufixo regional aceita', out(tv50, cand('Samsung Smart TV 50 polegadas UN50DU7700GXZD Bivolt 4K')).outcome === 'accept');
check('tv: sem voltagem no título => draft (dúvida)', out(tv50, cand('Samsung Smart TV 50" 4K UN50DU7700')).outcome === 'draft');
check('tv: outra marca rejeita', out(tv50, cand('LG Smart TV 50" 4K 50UT8050 Bivolt')).outcome === 'reject');
check('tv: recondicionada => condição', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt recondicionada')).counter === 'rejeitado_condicao');
check('tv: modelo antigo => fora_de_linha_ou_retro', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt modelo antigo')).counter === 'fora_de_linha_ou_retro');
check('tv: geração anterior => fora_de_linha_ou_retro', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt geração anterior')).counter === 'fora_de_linha_ou_retro');
check('tv: kit com suporte => composição', out(tv50, cand('Kit Samsung Smart TV 50" UN50DU7700 Bivolt com suporte')).counter === 'rejeitado_composicao');
check('tv: patrocinado fora', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt', { s: 1 })).counter === 'patrocinado');
check('tv: cor não separa', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt Preta')).outcome === 'accept');
check('tv: open box => condição', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt Open Box')).counter === 'rejeitado_condicao');
check('tv: importado => condição', out(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt importado')).counter === 'rejeitado_condicao');

// --- Placa de vídeo: variante Ti separa ---
const gpu = M({ vertical: 'tecnologia', segment: 'placa-de-video', name: 'Placa De Vídeo Gpu 12gb Dual Asus Geforce Rtx 5070 Oc', brand: 'Asus', cat: { BRAND: 'Asus', MODEL: 'RTX 5070', MEMORY_SIZE: '12 GB' } });
check('gpu: Ti é outro produto', out(gpu, cand('Placa de Vídeo ASUS Dual GeForce RTX 5070 Ti OC 12GB')).outcome === 'reject');
check('gpu: mesmo modelo nunca rejeita', out(gpu, cand('Placa de Vídeo ASUS Dual GeForce RTX 5070 OC 12GB GDDR7')).outcome !== 'reject', out(gpu, cand('Placa de Vídeo ASUS Dual GeForce RTX 5070 OC 12GB GDDR7')));
check('gpu: 5060 rejeita', out(gpu, cand('Placa de Vídeo ASUS Dual GeForce RTX 5060 OC 12GB')).outcome === 'reject');

// --- SSD: capacidade separa ---
const ssd = M({ vertical: 'tecnologia', segment: 'ssd', name: 'Ssd Kingston Nv2 1tb M.2 Nvme', brand: 'Kingston', cat: { BRAND: 'Kingston', MODEL: 'SNV2S/1000G' } });
check('ssd: 2TB rejeita', out(ssd, cand('SSD Kingston NV2 2TB M.2 NVMe')).outcome === 'reject');
check('ssd: 1TB não rejeita', out(ssd, cand('SSD Kingston NV2 1TB M.2 NVMe')).outcome !== 'reject', out(ssd, cand('SSD Kingston NV2 1TB M.2 NVMe')));

// --- Eletrodoméstico: voltagem e capacidade ---
const fry = M({ vertical: 'eletrodomesticos', segment: 'air-fryer', name: 'Fritadeira Air Fryer Elétrica Libell 5l Preto', brand: 'Libell', cat: { BRAND: 'Libell', MODEL: 'LFEA05.0', VOLTAGE: '127V' } });
check('airfryer: 220V rejeita', out(fry, cand('Fritadeira Elétrica Air Fryer Libell 5L LFEA05.0 220V')).outcome === 'reject');
const fOk = out(fry, cand('Fritadeira Elétrica Air Fryer Libell 5L LFEA05.0 127V'));
check('airfryer: 127V aceita', fOk.outcome === 'accept', fOk);
check('airfryer: 4L rejeita', out(fry, cand('Fritadeira Elétrica Air Fryer Libell 4L 127V')).outcome === 'reject');
check('airfryer: sem voltagem => draft', out(fry, cand('Fritadeira Elétrica Air Fryer Libell 5L LFEA05.0')).outcome === 'draft');

// --- Tênis: marca+modelo+gênero; tamanho e cor NÃO separam ---
const tenis = M({ vertical: 'esporte', segment: 'tenis', name: 'Tênis Nike Pegasus 41 Masculino', brand: 'Nike', cat: { BRAND: 'Nike', MODEL: 'Pegasus 41', GENDER: 'Masculino' } });
const t1 = out(tenis, cand('Tênis Nike Pegasus 41 Masculino Preto Tamanho 42'));
check('tênis: tamanho e cor juntos (mesmo master)', t1.outcome === 'accept', t1);
check('tênis: outro tamanho/cor também aceita', out(tenis, cand('Tênis Nike Pegasus 41 Masculino Azul Tam. 38')).outcome === 'accept');
check('tênis: feminino rejeita', out(tenis, cand('Tênis Nike Pegasus 41 Feminino Rosa')).outcome === 'reject');
check('tênis: Pegasus 40 rejeita', out(tenis, cand('Tênis Nike Pegasus 40 Masculino')).outcome === 'reject');
check('tênis: marca diferente rejeita', out(tenis, cand('Tênis Adidas Pegasus 41 Masculino')).outcome === 'reject');
check('tênis: sem gênero no título => draft', out(tenis, cand('Tênis Nike Pegasus 41 Corrida')).outcome === 'draft');
check('tênis: kit 2 pares => composição', out(tenis, cand('Kit 2 Pares Tênis Nike Pegasus 41 Masculino')).counter === 'rejeitado_composicao');

// --- Livros: ISBN ---
const isbn = '9786587951430';
const livro = M({ vertical: 'livros', segment: 'livros', name: 'Vaesen Rpg: A Saga Da Montanha Perdida (suplemento)', gtin: isbn, cat: { GTIN: isbn, AUTHOR: 'Retropunk', BOOK_TITLE: 'Vaesen: A Saga da Montanha Perdida', BOOK_PUBLISHER: 'Retropunk' } });
check('livro: ISBN-13 no título igual aceita', out(livro, cand('Vaesen: A Saga da Montanha Perdida ISBN 978-65-87951-43-0')).reason === 'isbn_igual');
check('livro: ISBN-13 diferente rejeita', out(livro, cand('Vaesen: Livro de Regras 9786587951409')).outcome === 'reject');
check('livro: ASIN B0 sem ISBN, com autor e editora, aceita pelo fallback', out(livro, cand('Vaesen: A Saga da Montanha Perdida - Retropunk')).outcome === 'accept');
check('livro: ASIN B0 sem editora/autor => draft', out(livro, cand('Vaesen: A Saga da Montanha Perdida')).outcome === 'draft');
check('livro: ebook rejeita', out(livro, cand('Vaesen: A Saga da Montanha Perdida eBook Kindle')).counter === 'rejeitado_composicao');
check('livro: busca por ISBN', buildQueryFor(livro) === isbn);

// --- Impressão 3D: filamento (cor junta) ---
const fil = M({ vertical: 'impressao3d', segment: 'filamento-3d', name: 'Filamento Pla 1,75mm 1kg 3d Fila Preto', brand: '3D Fila', cat: { BRAND: '3D Fila' } });
const f1 = out(fil, cand('Filamento PLA 1.75mm 1kg 3D Fila Azul'));
check('filamento: outra cor aceita (cor junta)', f1.outcome === 'accept', f1);
check('filamento: PETG rejeita', out(fil, cand('Filamento PETG 1.75mm 1kg 3D Fila')).outcome === 'reject');
check('filamento: 2,85mm rejeita', out(fil, cand('Filamento PLA 2.85mm 1kg 3D Fila')).outcome === 'reject');
check('filamento: 5 rolos => composição', out(fil, cand('Kit 5 Filamento PLA 1.75mm 1kg 3D Fila')).counter === 'rejeitado_composicao');

// --- Busca ---
check('busca: TV usa marca+código', buildQueryFor(tv50).startsWith('Samsung UN50DU7700'), buildQueryFor(tv50));
check('busca: tênis sem cor', !/preto/i.test(buildQueryFor(M({ vertical: 'esporte', segment: 'tenis', name: 'Tênis Nike Pegasus 41 Preto', brand: 'Nike' }))));

// --- Orçamento do ciclo ---
check('orçamento: ciclo <= 40 min', cycleMinutes(DEFAULT_CYCLE_BUDGET) <= 40, cycleMinutes(DEFAULT_CYCLE_BUDGET));
check('orçamento: refresh cheio + discover cabem', capFor('refresh', 0, {}) + capFor('discover', capFor('refresh', 0, {}), {}) <= DEFAULT_CYCLE_BUDGET);
check('orçamento: sem refresh, discover usa o orçamento', capFor('discover', 0, {}) === DEFAULT_CYCLE_BUDGET);
check('pesos cobrem todas as verticais', VERTICALS.every((v) => REFRESH_WEIGHT[v] > 0 && DISCOVER_WEIGHT[v] > 0));

console.log(`${total - fails}/${total} verdes`);
process.exit(fails ? 1 : 0);
