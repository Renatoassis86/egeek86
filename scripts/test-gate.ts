/**
 * Teste de tabela do PORTEIRO DO CATALOGO (src/lib/catalog/gate.ts). Sem banco.
 * Uso: npx tsx scripts/test-gate.ts   (sai com codigo 1 se algo falhar)
 * Titulos reais do catalogo (prints do dono, 2026-11-02) e legitimos que NAO podem sumir.
 */
import { entryGateAttributes, evaluateCatalogGate, type GateVerdict, isRejectedByGate } from '../src/lib/catalog/gate';
import type { ProductType } from '../src/db/schema';

interface C {
  name: string;
  db: ProductType;
  expect: GateVerdict;
  gen?: string;
  fmt?: string;
  median?: number;
  offers?: string[];
  manual?: GateVerdict;
  dim?: string;
}

const cases: C[] = [
  // --- Print 2 (busca "Mario"): fora do escopo -> rejected
  { name: 'Lego 71374 Super Mario Nintendo Entertainment System', db: 'game', expect: 'rejected' },
  { name: 'Kit Mantinha Com Balde Super Mario Nintendo Zona Criativa', db: 'game', expect: 'rejected' },
  { name: 'Jogo Playset Super Mario Nintendo 3 Jakks Pacific', db: 'game', expect: 'rejected' },
  { name: 'Brochurão C.d. 80 Fls Jandaia - God Of War 3', db: 'game', expect: 'rejected' },
  { name: 'Tilibra Universitário God of war 200 folhas pautadas 10 assuntos unidade x 1 god of war', db: 'game', expect: 'rejected' },
  { name: 'Final Fantasy Vii Remake Ultimania Guidebook (japan)', db: 'game', expect: 'rejected' },
  { name: 'Capacete Norisk Rock Mortal Kombat Scorpion Laranja 58', db: 'game', expect: 'rejected' },
  { name: 'Deck Magic The Gathering Final Fantasy Commander Deck Revival', db: 'game', expect: 'rejected' },
  { name: 'Totaku God Of War Kratos 07', db: 'game', expect: 'rejected' },
  { name: 'Ioiô Street Fighter Ryu Capcom Flowpack', db: 'game', expect: 'rejected' },
  { name: 'Kit Manta Poliéster Casal + Balde de Pipoca God of War Playstation', db: 'game', expect: 'rejected' },
  // --- Print 2: porta cartao = duvida do dono -> review (nunca publico)
  { name: 'Porta Cartão de memória Super Mario Bross Porta Cartão SD Porta Jogo Nintendo Switch Cartão', db: 'game', expect: 'review' },
  // --- Print 1: PS2 fisico novo a R$19,90-22 -> review (sinal auxiliar de preco)
  { name: 'God of War II Standard Edition Formato físico para PS2', db: 'game', expect: 'rejected', fmt: 'physical', median: 2000 },
  { name: 'God of War Jogo PS2 Português Físico Ação Santa Monica', db: 'game', expect: 'rejected', median: 2200 },
  { name: 'Jogo Silent Hill Shattered Memories para Sony em Formato Físico', db: 'game', expect: 'review', fmt: 'physical', median: 2595 },
  // mesmo titulo com preco normal NAO e barrado so por titulo
  { name: 'God of War II Standard Edition Formato físico para PS2', db: 'game', expect: 'rejected', fmt: 'physical', median: 18000 },
  // --- Nao original lexical
  { name: 'Jogo PS2 Cópia Pirata Mídia Gravada', db: 'game', expect: 'rejected' },
  { name: 'Réplica Controle Dualshock 4 Primeira Linha', db: 'accessory', expect: 'rejected' },
  { name: 'Console Retro Game Stick 4K 10 mil jogos embutidos', db: 'console', expect: 'rejected' },
  { name: 'Super Nintendo Mini Clone HDMI 620 jogos', db: 'console', expect: 'rejected' },
  { name: 'Cartucho Multicartucho 99 em 1 Mega Drive Paralelo', db: 'game', expect: 'rejected' },
  { name: 'PS4 Destravado com jogos instalados', db: 'console', expect: 'rejected' },
  { name: 'Jogo Zelda Nintendo Switch ISO Mídia', db: 'game', expect: 'rejected' },
  { name: 'Réplica 1:1 Nintendo Switch Joy-Con', db: 'accessory', expect: 'rejected' },
  { name: 'Console Genérico Retro Portátil Nintendo Switch Style', db: 'console', expect: 'rejected' },
  { name: 'Somente a capa Zelda Tears of the Kingdom Nintendo Switch', db: 'game', expect: 'rejected' },
  { name: 'Anbernic RG35XX Console Portátil Retro', db: 'console', expect: 'rejected' },
  { name: 'Retroid Pocket 4 Pro Handheld Android', db: 'console', expect: 'rejected' },
  // --- Console retro: fora do monitoramento de novos (decisao do dono 2026-11-03); drops e leiloes
  { name: 'Console de Mesa Nintendo Wii Preto Com Jogos', db: 'console', expect: 'rejected' },
  { name: 'Console Portátil Nintendo 3DS Metallic Red de 128 MB', db: 'console', expect: 'rejected' },
  { name: 'Console Portátil Nintendo DS Lite Vermelho Com Tela Touch', db: 'console', expect: 'rejected' },
  { name: 'Console Nintendo Nes Classic Edition Cinza/branco', db: 'console', expect: 'rejected' },
  { name: 'Console PlayStation PlayStation 2 cor preto 2000', db: 'console', expect: 'rejected' },
  { name: 'Console Sony Playstation 3 Ps3 Slim Hd500gb Cor Charcoal Black', db: 'console', expect: 'rejected' },
  { name: 'Console Sony Playstation Portátil Psp Cor Psp-1000 Ceramic White', db: 'console', expect: 'rejected' },
  { name: 'Console Microsoft Xbox 360 Slim com Kinect e HD de 500GB', db: 'console', expect: 'rejected' },
  { name: 'Console Xbox 360 Super Slim Microsoft de 4 GB Com Controle e HDMI', db: 'console', expect: 'rejected' },
  { name: 'Console PlayStation PlayStation Fat Standard 1995', db: 'console', expect: 'rejected' },
  { name: 'Console Nintendo Switch Lite 32gb Amarelo', db: 'console', expect: 'approved' },
  { name: 'Console PlayStation 4 Slim 1TB Preto', db: 'console', expect: 'approved' },
  { name: 'Console Microsoft Xbox One S 1 TB Branco', db: 'console', expect: 'approved' },
  { name: 'Console PlayStation 5 Slim Digital', db: 'console', expect: 'approved' },
  { name: 'Console Nintendo Switch 2 + Mario Kart World Bundle', db: 'console', expect: 'approved' },
  { name: 'Console Nintendo Switch Oled Edição Wii Sports Club', db: 'console', expect: 'approved' },
  // jogo de plataforma legada NAO e afetado pela regra de console
  { name: 'Jogo Xbox 360 Grand Theft Auto IV Físico', db: 'game', expect: 'rejected', fmt: 'physical', median: 4500 },
  // --- Legitimos que NAO podem sumir
  { name: 'Lego Star Wars The Complete Saga Xbox 360 Jogo Físico', db: 'game', expect: 'rejected', fmt: 'physical' },
  { name: 'Hot Wheels Monster Trucks PS4 Jogo Físico', db: 'game', expect: 'approved', fmt: 'physical' },
  { name: 'Jogo Xbox 360 Grand Theft Auto IV Físico', db: 'game', expect: 'rejected', fmt: 'physical', median: 4500 },
  { name: 'Pirates of the Caribbean PS3 Jogo Físico', db: 'game', expect: 'rejected' },
  { name: 'Lego Piratas do Caribe Xbox 360 Jogo Aventura CD', db: 'game', expect: 'rejected' },
  // --- FORMATO fisico x digital (decisao do dono, 2026-11-03): digital tem master proprio, mas segue FORA do escopo publico (D1, ADR 0005)
  { name: 'Hogwarts Legacy PS5 Midia Digital', db: 'game', expect: 'rejected', gen: 'ps5' },
  { name: 'Gran Turismo 7 PS5 (Digital)', db: 'game', expect: 'rejected', gen: 'ps5' },
  { name: 'God of War Ragnarok PS5', db: 'game', expect: 'rejected', gen: 'ps5', fmt: 'digital' },
  { name: 'Minecraft Nintendo Switch Key Digital', db: 'game', expect: 'rejected' },
  { name: 'Zelda Tears of the Kingdom Nintendo eShop Download', db: 'game', expect: 'rejected' },
  { name: 'Hogwarts Legacy PS5 Midia Fisica', db: 'game', expect: 'approved', gen: 'ps5', fmt: 'physical' },
  { name: 'Hogwarts Legacy PS5 Midia Fisica + Bonus Digital', db: 'game', expect: 'approved', gen: 'ps5', fmt: 'physical' },
  { name: 'Console PlayStation 5 Slim Digital 1TB', db: 'console', expect: 'approved', dim: 'console' }, // console: Digital e modelo, nao formato

  { name: 'Steam Deck OLED 512GB Console Portátil', db: 'console', expect: 'approved' },
  { name: 'Console Sony PlayStation 5 Slim 1TB Mídia Física', db: 'console', expect: 'approved' },
  { name: 'Controle Sem Fio DualSense PS5 Branco Sony', db: 'accessory', expect: 'approved' },
  { name: 'Cabo HDMI Original PS5 Sony', db: 'accessory', expect: 'approved' },
  { name: 'Resident Evil 4 Remake PS5 Mídia Física Original Lacrado', db: 'game', expect: 'approved', median: 24900 },
  { name: 'Jogo Forza Horizon 5 Boné Exclusivo Midia Fisica Xbox One Xbox Series X', db: 'game', expect: 'approved' },
  { name: 'Nintendo Switch 2 + Mario Kart World Bundle', db: 'console', expect: 'approved' },
  { name: 'Pacote de console Switch 2 + Mario Kart World Black Nintendo', db: 'game', expect: 'approved', dim: 'console' },
  { name: 'Console Bundle Nintendo Switch 2 + Jogo Digital Mario Kart World', db: 'console', expect: 'approved', dim: 'console' },
  { name: 'Visual Novel Steins Gate Nintendo Switch Físico', db: 'game', expect: 'approved', fmt: 'physical' },
  // --- Sem evidencia positiva: jogo sem plataforma e sem formato fisico -> review
  { name: 'Cyberpunk 2077', db: 'game', expect: 'review' },
  // --- Override manual do dono vence revisao, mas nunca libera nao original
  { name: 'Cyberpunk 2077', db: 'game', expect: 'approved', manual: 'approved' },
  { name: 'God of War II PS2 Físico', db: 'game', expect: 'approved', median: 2000, manual: 'approved' },
  { name: 'Jogo PS2 Cópia Pirata', db: 'game', expect: 'rejected', manual: 'approved' },
  // --- Achados do QA (2026-11-02)
  { name: '[PS5] Resident Evil 7 Gold Edition Versão Grotesca . Faça João', db: 'game', expect: 'approved', fmt: 'physical' },
  { name: 'Adesivo Ps4 Slim Joker Coringa Batman', db: 'console', expect: 'rejected' },
  { name: 'Cooler Ventoinha Interna PS4 Fat', db: 'accessory', expect: 'rejected' },
  // --- QA 2026-11-03 (P2) e decisao 4 do dono: headset legitimo sem plataforma vai a REVISAO, nao a rejeicao
  { name: 'Headset Gamer Redragon Zeus X H510', db: 'accessory', expect: 'review' },
  { name: 'Headset Havit H2002d Gamer', db: 'accessory', expect: 'review' },
  { name: 'Headset Logitech G335 Gamer', db: 'accessory', expect: 'review' },
  { name: 'Headset Gamer Sem Fio PlayStation 5 Pulse 3D', db: 'accessory', expect: 'approved' },
  // --- Decisoes 3-5 adotadas por delegacao (2026-11-03): marca legitima sem plataforma -> revisao; porta-cartao com marca+plataforma -> aprovado
  { name: 'Mouse Gamer Logitech G203 Lightsync', db: 'accessory', expect: 'rejected' }, // periferico de PC: fora do escopo (nao e acessorio de console)
  { name: 'Controle Sem Fio 8BitDo Ultimate Bluetooth', db: 'accessory', expect: 'review' },
  { name: 'Controle Sem Fio Generico Sem Marca', db: 'accessory', expect: 'rejected' },
  { name: 'Porta Cartucho PowerA Nintendo Switch 24 Jogos', db: 'accessory', expect: 'approved', dim: 'accessory' },
  { name: 'Estojo Porta Jogos Hori para Nintendo Switch', db: 'accessory', expect: 'approved', dim: 'accessory' },
  { name: 'Porta Cartucho 24 Jogos Nintendo Switch', db: 'accessory', expect: 'review' },
  { name: 'Porta Cartucho PowerA 24 Jogos', db: 'accessory', expect: 'review' },
  { name: 'Amiibo Mario Super Smash Bros Nintendo', db: 'accessory', expect: 'rejected' },
  { name: 'Headset Gamer Generico Sem Marca', db: 'accessory', expect: 'rejected' },
  { name: 'Headset Gamer Replica 1:1 Sony', db: 'accessory', expect: 'rejected' },
  // pecas genericas aprovadas pelo porteiro (QA 2026-11-03)
  { name: 'Placas USB + cabo flat PS4', db: 'accessory', expect: 'rejected' },
  { name: 'Cabo de Energia 2 pinos', db: 'accessory', expect: 'rejected' },
  { name: 'Pilhas AA Philips', db: 'accessory', expect: 'rejected' },
  // PS2 legado com erro de digitacao tem plataforma (nao cai em "sem plataforma")
  { name: 'Jogo Playstatio 2 God of War', db: 'game', expect: 'rejected' },
  { name: 'God of War II Playstatio 2 Fisico', db: 'game', expect: 'rejected', fmt: 'physical', median: 2000 },
  // --- QA rodada 4 (P1-A, 2026-11-03): peca de reposicao fora do escopo; memory card/controle seguem como acessorio
  { name: 'Dissipador Calor Ssd M2 2280 Ps5 Playstation 5 Cinza Prata', db: 'console', expect: 'rejected' },
  { name: 'Ci Hdmi Vídeo Mn864739 Panasonic Para Ps5 Playstation 5', db: 'console', expect: 'rejected' },
  { name: 'Bat para Nintendo Switch V1/V2/Oled HAC-003', db: 'console', expect: 'rejected' },
  { name: 'Bateria Switch Lite + Chaves', db: 'console', expect: 'rejected' },
  { name: 'Memory Card 16mb Para Playstation 2 - Ps2- Console Salvar', db: 'accessory', expect: 'review', dim: 'accessory' },
  { name: 'Nintendo Switch 2 Pro Controlador A Lenda de Zelda', db: 'game', expect: 'approved', dim: 'accessory' },
  { name: 'Jogo Nintendo Wii : Sonic Unleashed', db: 'game', expect: 'rejected', fmt: 'physical', median: 9000, dim: 'off_catalog' },
  { name: 'Disco Blu-ray automático PS BDJ PS 4 GEZINE Lapse Poops off-line Gold hen 9.00-12.52', db: 'console', expect: 'rejected' },
  // --- QA rodada 5 (P1, 2026-11-03): boneco/estatua por escala ou marca; acessorio so de plataforma legada vai a revisao
  { name: 'Pyramid Head (executioner) Silent Hill 2 1/12 Mezco One:12', db: 'game', expect: 'rejected' },
  { name: 'Estatua Kratos God of War 1/6 Hiya Toys', db: 'game', expect: 'rejected' },
  { name: 'Action Figure Mario 1:12 Nintendo', db: 'game', expect: 'rejected' },
  { name: 'Silent Hill 2 Remake PS5 Midia Fisica', db: 'game', expect: 'approved', fmt: 'physical', median: 28000 },
  { name: 'Resident Evil 2 Remake PS4 Midia Fisica', db: 'game', expect: 'approved', fmt: 'physical', median: 9000 },
  { name: 'Mortal Kombat 1 Xbox Series X Midia Fisica', db: 'game', expect: 'approved', fmt: 'physical' },
  { name: 'Final Fantasy VII Rebirth PS5 Midia Fisica', db: 'game', expect: 'approved', fmt: 'physical' },
  { name: 'Jogo Dragon Quest XI S PS4 Fisico 12x sem juros', db: 'game', expect: 'approved', fmt: 'physical' },
  { name: 'Nintendo Switch Online 1/12 meses Membership', db: 'game', expect: 'approved', fmt: 'physical' },
  { name: 'Memory Card 16mb Para Playstation 2 - Ps2- Console Salvar', db: 'accessory', expect: 'review', dim: 'accessory' },
  { name: 'Controle Super Nintendo Wii Classic Controller', db: 'accessory', expect: 'review' },
  { name: 'Memory Card 16mb Para Playstation 2 - Ps2- Console Salvar', db: 'accessory', expect: 'approved', manual: 'approved' },
  { name: 'Cartao de Memoria Nintendo Switch 128GB Sandisk', db: 'accessory', expect: 'approved' },
  { name: 'Base Vertical Para Playstation 5 Ps5 Slim Digital/Com Leitor', db: 'accessory', expect: 'approved', dim: 'accessory' },
  // --- Titulo da oferta tambem conta
  { name: 'Super Mario Odyssey Nintendo Switch', db: 'game', expect: 'rejected', offers: ['Super Mario Odyssey Nintendo Switch Cópia Paralela'] },
];

let fail = 0;
for (const c of cases) {
  const r = evaluateCatalogGate({
    name: c.name,
    productType: c.db,
    gamePlatformGen: c.gen ?? 'unknown',
    gameFormat: c.fmt ?? 'unknown',
    medianPriceCents: c.median ?? null,
    offerTitles: c.offers ?? [],
    manual: c.manual ?? null,
  });
  const dimOk = !c.dim || r.dimension === c.dim;
  if (r.verdict !== c.expect || !dimOk) {
    fail++;
    console.log(`FALHA esperado=${c.expect}${c.dim ? '/' + c.dim : ''} obtido=${r.verdict}/${r.dimension} (${r.category}:${r.reason}:${r.matched}) | ${c.name.slice(0, 90)}`);
  }
}
// ponto de entrada: so 'rejected' bloqueia o cadastro
const entry: Array<[string, boolean]> = [
  ['Lego 71374 Super Mario', true],
  ['Mario Kart 8 Deluxe Nintendo Switch Físico', false],
  ['Cyberpunk 2077', false], // review: cadastra, mas invisivel
];
for (const [t, rej] of entry) {
  if (isRejectedByGate(t) !== rej) {
    fail++;
    console.log(`FALHA entrada: ${t} esperado rejeitado=${rej}`);
  }
}
// cadastro de master novo: cross-gen nasce em revisao (decisao do dono, 2026-11-03); geracao unica nao
const born: Array<[string, boolean]> = [
  ['EA FC 25 PS4 PS5 Midia Fisica', true],
  ['Forza Horizon 5 Xbox One Xbox Series X Midia Fisica', true],
  ['EA FC 25 PS5 Midia Fisica', false],
  ['EA FC 25 PS4 (compativel com PS5) Midia Fisica', false],
];
for (const [t, review] of born) {
  const a = entryGateAttributes(t, 'game') as { catalogGate?: { verdict?: string; reason?: string } };
  const got = a.catalogGate?.verdict === 'review' && a.catalogGate?.reason === 'geracao_ambigua';
  if (got !== review) {
    fail++;
    console.log(`FALHA cadastro cross-gen: ${t} esperado revisao=${review}`);
  }
}
// master digital novo (criado pela separacao fisico x digital) nasce com veredito gravado: invisivel ate decisao do dono
{
  const a = entryGateAttributes('Hogwarts Legacy PS5 Midia Digital', 'game', { gameFormat: 'digital', gamePlatformGen: 'ps5' }) as { catalogGate?: { verdict?: string } };
  if (a.catalogGate?.verdict !== 'rejected') { fail++; console.log('FALHA master digital novo deveria nascer rejected'); }
  const b = entryGateAttributes('Hogwarts Legacy PS5 Midia Fisica', 'game', { gameFormat: 'physical', gamePlatformGen: 'ps5' }) as { catalogGate?: unknown };
  if (b.catalogGate) { fail++; console.log('FALHA master fisico novo nao deveria ter veredito gravado'); }
}
console.log(`${cases.length + entry.length + born.length + 2} casos; falhas: ${fail}`);
process.exit(fail ? 1 : 0);
