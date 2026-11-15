/**
 * Testes da identidade da coleta assistida da Amazon (sem banco, sem rede). Uso: npx tsx scripts/test-amazon-identidade.ts
 */
import { consultaImpressoraBambu, normalizaTituloImpressora, judgeGame, judgeGeneric, prepareGame, prepareGeneric, buildQueryFor, type AmzCand, type MasterIdentity } from '../src/lib/affiliate/amazon-identity';
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

// --- Impressora Bambu Lab (tarefa #59): consulta curta por modelo, variantes separadas ---
const b3d = (name: string) => buildQueryFor(M({ vertical: 'impressao3d', name, brand: 'Bambu Lab' }));
check('bambu: P1S solo sem ruido', b3d('Impressora 3d Bambu Lab Fechada P1s') === 'Bambu Lab P1S', b3d('Impressora 3d Bambu Lab Fechada P1s'));
check('bambu: P1S Combo', b3d('Impressora 3d Bambu Lab P1s Combo') === 'Bambu Lab P1S Combo');
check('bambu: P2S Combo', b3d('Impressora 3D Bambu Lab P2S Combo de FDM Automática,') === 'Bambu Lab P2S Combo');
check('bambu: P2S solo', b3d('Impressora 3D Bambu Lab P2s') === 'Bambu Lab P2S');
check('bambu: A1 Mini nao vira A1', b3d('Impressora 3d Bambu Lab A1 Mini') === 'Bambu Lab A1 Mini');
check('bambu: A1 Mini Combo', b3d('Impressora 3d Bambu Lab A1 Mini Combo - A1MC') === 'Bambu Lab A1 Mini Combo');
check('bambu: A1 Combo', b3d('Impressora 3d - Bambu Lab A1 Combo') === 'Bambu Lab A1 Combo');
check('bambu: A1 solo', b3d('Impressora 3D Bambu Lab A1, Bivolt') === 'Bambu Lab A1');
check('bambu: kit extrusor nao e impressora', consultaImpressoraBambu({ vertical: 'impressao3d', name: 'Kit Extrusor Original Bambu Lab Impressora 3D A1/A1Mini' }, 'Bambu Lab') === null);
check('bambu: filamento fora', consultaImpressoraBambu({ vertical: 'impressao3d', name: 'Filamento PLA Bambu Lab para impressora A1' }, 'Bambu Lab') === null);
check('bambu: outra marca segue o fluxo normal', consultaImpressoraBambu({ vertical: 'impressao3d', name: 'Impressora 3D Creality K1 Combo' }, 'Creality') === null);
check('bambu: so na vertical impressao3d', consultaImpressoraBambu({ vertical: 'tecnologia', name: 'Impressora Bambu Lab P1S' }, 'Bambu Lab') === null);

// --- Impressora Bambu Lab, titulos reais da Amazon (#59, 2026-11-15): P2SC/P1SC, "+ AMS 2 Pro", Gabinete Fechado, Bico 0,4mm; combo separa, tensao nao ---
const bm = (name: string, model: string) => M({ vertical: 'impressao3d', segment: 'impressora-3d', name, brand: 'Bambu Lab', cat: { BRAND: 'Bambu Lab', MODEL: model } });
const mP2SC = bm('Impressora 3D Bambu Lab P2S Combo de FDM Automática,', 'P2S Combo'), mP2S = bm('Impressora 3D Bambu Lab P2s', 'P2S');
const mP1SC = bm('Impressora 3d Bambu Lab P1s Combo', 'P1S-COMBO'), mP1S = bm('Impressora 3d Bambu Lab Fechada P1s', 'P1S');
const tP2SC = 'Impressora 3D Bambu Lab P2S Combo 110V Cinza com AMS 2 Pro, CoreXY, Volume 256x256x256mm, Gabinete Fechado, Bico 0,4mm';
check('amazon P2S Combo 110V (B0GP9LBGY7) entra no master P2S Combo', out(mP2SC, cand(tP2SC)).outcome === 'accept', out(mP2SC, cand(tP2SC)));
check('P2S Combo NAO entra no master P2S avulso (combo separa)', out(mP2S, cand(tP2SC)).outcome === 'reject');
check('P2S Combo NAO entra no P1S Combo', out(mP1SC, cand(tP2SC)).outcome === 'reject');
check('P2SC P2S+AMS Combo 220V entra no P2S Combo (tensao nao separa)', out(mP2SC, cand('Bambu Lab Impressora 3D P2SC P2S+AMS Combo 220V')).outcome === 'accept');
check('P2SC AMS 2 Pro 127V entra no P2S Combo', out(mP2SC, cand('Bambu Lab Impressora 3D P2SC AMS 2 Pro 127V')).outcome === 'accept');
check('P2S 110V avulsa segue no P2S avulso', out(mP2S, cand('Bambu Lab Impressora 3D P2S 110V')).outcome === 'accept');
check('P1S+AMS Combo P1SC Bivolt entra no P1S Combo', out(mP1SC, cand('Bambu Lab Impressora 3D P1S+AMS Combo P1SC Bivolt')).outcome === 'accept');
check('P1S-Combo 127/220V entra no P1S Combo', out(mP1SC, cand('Impressora 3D Bambu Lab P1S-Combo 127/220V')).outcome === 'accept');
check('P1S Combo NAO entra no P1S avulso', out(mP1S, cand('Bambu Lab Impressora 3D P1S+AMS Combo P1SC Bivolt')).outcome === 'reject');
check('AMS 2 Pro avulso (acessorio) segue fora', out(mP2SC, cand('Bambu Lab AMS 2 Pro para Impressora 3D P2S')).outcome === 'reject');
check('AMS 2 Pro avulso sem impressora segue fora', out(mP2S, cand('Bambu Lab AMS 2 Pro Sistema de Multimaterial')).outcome === 'reject');
check('bico 0,4mm avulso (peca) segue fora', out(mP2S, cand('Bico 0,4mm para Impressora 3D Bambu Lab P2S')).outcome === 'reject');
check('normaliza: titulo que nao e impressora fica intacto', normalizaTituloImpressora('Bambu Lab AMS 2 Pro') === 'Bambu Lab AMS 2 Pro');

// --- Orçamento do ciclo ---
check('orçamento: ciclo <= 40 min', cycleMinutes(DEFAULT_CYCLE_BUDGET) <= 40, cycleMinutes(DEFAULT_CYCLE_BUDGET));
check('orçamento: refresh cheio + discover cabem', capFor('refresh', 0, {}) + capFor('discover', capFor('refresh', 0, {}), {}) <= DEFAULT_CYCLE_BUDGET);
check('orçamento: sem refresh, discover usa o orçamento', capFor('discover', 0, {}) === DEFAULT_CYCLE_BUDGET);
check('pesos cobrem todas as verticais', VERTICALS.every((v) => REFRESH_WEIGHT[v] > 0 && DISCOVER_WEIGHT[v] > 0));

console.log(`${total - fails}/${total} verdes`);
process.exit(fails ? 1 : 0);
