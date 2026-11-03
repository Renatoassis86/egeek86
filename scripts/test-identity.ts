/**
 * Teste de tabela da IDENTIDADE DO PRODUTO (src/lib/affiliate/dedup.ts, offer-identity.ts). Sem banco.
 * Uso: npx tsx scripts/test-identity.ts   (sai com codigo 1 se algo falhar)
 *
 * Regra mae (decisao do dono, 2026-11-03): separar tudo, juntar so o identico.
 * Casos reais da auditoria de pureza (docs/amostra-pureza-cesta-2026-11-03.xlsx, abas
 * testes-de-identidade e ofertas-suspeitas) e falsos positivos legitimos.
 */
import { isSameProduct, normalizeTitle, numeralsOf } from '../src/lib/affiliate/dedup';
import { evaluateOfferIdentity, offerTitleFlags, type OfferIdentityReason } from '../src/lib/affiliate/offer-identity';
import { reconcilePlatform, readPlatform } from '../src/lib/catalog/platform';
import { derivePlatformFromTitle, mentionsMultipleGenerations } from '../src/lib/affiliate/game-classification';

let fail = 0;
let total = 0;
function check(ok: boolean, label: string, extra = ''): void {
  total++;
  if (!ok) {
    fail++;
    console.log(`FALHA ${label}${extra ? ' | ' + extra : ''}`);
  }
}

// ---------------------------------------------------------------------------
// A. Mesmo produto? [A, B, mesmo?, tipo] (tipo opcional: evita inferir pelo titulo)
// ---------------------------------------------------------------------------
type Pair = [string, string, boolean, string?];
const PAIRS: Pair[] = [
  // --- capacidade (825GB x 1TB) e console de nucleo vazio
  ['Console PlayStation 5 Slim 825GB', 'Console PlayStation 5 Slim 1TB', false],
  ['Nintendo Switch OLED 64GB', 'Nintendo Switch OLED 256GB', false],
  ['Console Xbox Series S 512GB', 'Console Xbox Series S 512GB', true], // controle: antes nem ele mesmo casava
  ['Console Xbox Series S 512GB', 'Console Xbox Series S 512GB Branco', true],
  ['Console Sony PlayStation 5 Slim Edicao Digital Branco 825GB', 'Console Sony PlayStation 5 Slim Edicao Digital Branco 1TB', false],
  ['Console PlayStation 5 Slim 1TB', 'Console PlayStation 5 Slim 1000GB', true],
  ['Cartão de Memória SD 128GB Switch', 'Cartão de Memória SD 256GB Switch', false],
  ['Console PlayStation 5 Slim', 'Console PlayStation 5 Slim 1TB', true], // capacidade ausente de um lado nao separa
  // --- Series S x X, modelo
  ['Console Xbox Series S 512GB', 'Console Xbox Series X 1TB', false],
  ['Console Microsoft Xbox Series S 512GB Branco', 'Console Microsoft Xbox Series X 1TB Branco', false],
  ['Console Xbox Series X', 'Console Xbox Series X 1TB', true],
  ['Console Xbox One S 1TB', 'Console Xbox One X 1TB', false],
  ['Console PlayStation 5 Slim', 'Console PlayStation 5 Pro', false],
  ['Console PlayStation 5 Slim Digital', 'Console PlayStation 5 Slim com Leitor de Disco', false],
  ['Console Nintendo Switch Lite', 'Console Nintendo Switch', false],
  ['Console Nintendo Switch OLED', 'Console Nintendo Switch', false],
  ['Console Nintendo Switch 2', 'Console Nintendo Switch', false],
  ['Console PlayStation 5 Slim', 'Console PlayStation 5 Slim + 2 Jogos', false],
  ['Controle DualSense PS5', 'Controle DualSense Edge PS5', false],
  // --- cor comum JUNTA; edicao limitada separa
  ['Console PlayStation 5 Slim Branco', 'Console PlayStation 5 Slim Preto', true],
  ['Controle DualSense PS5 Branco', 'Controle DualSense PS5 Cosmic Red', true],
  ['Controle Sem Fio Sony DualSense PS5 Original Lacrado Garantia Branco', 'Controle Sem Fio Sony DualSense PS5 Original Lacrado Garantia Preto', true],
  ['Controle Sem Fio Horipad Gray Para Nintendo Switch 1 E 2', 'Controle Sem Fio Horipad Blue Para Nintendo Switch 1 E 2', true],
  ['Joy-Con Par Neon Vermelho e Azul Nintendo Switch', 'Joy-Con Par Cinza Nintendo Switch', true],
  ['Controle DualSense PS5 Branco', 'Controle DualSense PS5 Edição Limitada 30º Aniversário', false],
  ['Console PlayStation 5 Slim 1TB', 'Console PlayStation 5 Slim 1TB Edição Limitada Astro Bot', false],
  ['Console Nintendo Switch OLED', 'Console Nintendo Switch OLED Edição Zelda Tears of the Kingdom', false],
  ['Controle Stelf Xbox Series com Grip - 2 Paddles (Black)', 'Controle Stelf Xbox Series com Grip - 4 Paddles (White)', false],
  ['Controle Stelf Xbox Series - Sem paddles (White)', 'Controle Stelf Xbox Series - Sem paddles (Black)', true],
  // --- marca de acessorio e original x paralelo
  ['Controle Sem Fio PS5 Sony Dualsense', 'Controle Sem Fio PS5 Dobe Dualsense', false],
  ['Headset Gamer PS5 HyperX Cloud', 'Headset Gamer PS5 Redragon Cloud', false],
  ['Controle Xbox Series Original Microsoft', 'Controle Xbox Series Paralelo', false],
  // --- edicoes
  ['Resident Evil Village PS5', 'Resident Evil Village Gold Edition PS5', false],
  ['God of War Ragnarok PS5', 'God of War Ragnarok Edição Especial PS5', false],
  ['Assassins Creed Valhalla Xbox One Mídia Física', 'Assassins Creed Valhalla Edição Completa Xbox One Mídia Física', false],
  ['Hogwarts Legacy PS5', 'Hogwarts Legacy Edição Limitada PS5', false],
  ['Hogwarts Legacy PS5', 'Hogwarts Legacy Deluxe Edition PS5', false],
  ['Mario Kart 8 Deluxe Switch', 'Mario Kart World Switch 2', false],
  ['Mario Kart 8 Deluxe Switch', 'Mario Kart 8 Deluxe Nintendo Switch Físico Lacrado', true],
  // --- relancamentos sao produtos proprios
  ['The Last of Us Part II PS4', 'The Last of Us Part II Greatest Hits PS4', false],
  ['God of War PS4', 'God of War Platinum PS4', false],
  ['Gran Turismo 7 PS4', "Gran Turismo 7 Player's Choice PS4", false],
  ['Call of Duty Modern Warfare PS3', 'Call of Duty Modern Warfare Essentials PS3', false],
  ['Super Mario Party Switch', 'Super Mario Party Nintendo Selects Switch', false],
  ['God of War III PS3', 'God of War III Relançamento PS3', false],
  ['Gran Turismo 7 PS4', 'Gran Turismo 7 PS4 Greatest Hits', false],
  // --- geracoes: PS4 x PS5 sao jogos diferentes; cross-gen nao funde com nenhum
  ['Jogo FIFA 24 PS4', 'Jogo FIFA 24 PS5', false],
  ['EA FC 25 PS4 PS5', 'EA FC 25 PS5', false],
  ['EA FC 25 PS4 PS5', 'EA FC 25 PS4', false],
  ['EA FC 25 PS4 PS5', 'EA FC 25 PS4 PS5', true],
  ['Forza Horizon 5 Xbox One Xbox Series X', 'Forza Horizon 5 Xbox Series X', false],
  ['EA FC 25 PS4 (compatível com PS5)', 'EA FC 25 PS4', true], // compatibilidade nao e segunda geracao
  ['Jogo Mafia 2 Xbox 360 Xbox One', 'Jogo Mafia 2 Xbox 360', false],
  // --- numeral / romano / ano unificados
  ['EA Sports FC 24 PS5', 'EA Sports FC 2024 PS5', true],
  ['Resident Evil 4 PS5', 'Resident Evil IV PS5', true],
  ['Final Fantasy VII Rebirth PS5', 'Final Fantasy VIII Rebirth PS5', false],
  ['Mortal Kombat 11 PS4', 'Mortal Kombat 1 PS4', false],
  ['Mortal Kombat 11 PS4', 'Mortal Kombat XI PS4', true],
  ['Grand Theft Auto V PS4', 'Grand Theft Auto 5 PS4', true],
  ['Final Fantasy X HD Remaster PS4', 'Final Fantasy 10 HD Remaster PS4', true],
  ['Mario + Rabbids Kingdom Battle Switch', 'Mario x Rabbids Kingdom Battle Switch', true], // o "x" no meio do nome nao e romano 10
  ['Dead Rising 3 Xbox One', 'Dead Rising 4 Xbox One', false],
  ['Yakuza Kiwami Switch', 'Yakuza Kiwami 2 Switch', false],
  // --- formato, regiao, idioma, condicao
  ['Jogo Hogwarts Legacy PS5 Mídia Física', 'Jogo Hogwarts Legacy PS5 Mídia Digital', false],
  ['Jogo Hogwarts Legacy PS5 Mídia Física', 'Jogo Hogwarts Legacy PS5 Mídia Física USA', false],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 EUR', false],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Importado', false],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Japão', false],
  ['God of War Remastered PS4', 'God Of War Remastered Playstation 4 Euro Standard (Físico)', false],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Dublado em Português', true],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Legendado Brasil Nacional', true],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Usado', false],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Seminovo', false],
  ['Jogo Hogwarts Legacy PS5', 'Jogo Hogwarts Legacy PS5 Open Box', false],
  ['Console PlayStation 5 Slim 1TB', 'Console PlayStation 5 Slim 1TB Open Box', false],
  ['Console PlayStation 5 Slim 1TB', 'Console PlayStation 5 Slim 1TB Revisado', false],
  // --- conteudo: remake, remaster, HD, collection, trilogia, DLC, bundle
  ['The Last of Us PS4', 'The Last of Us Remastered PS4', false],
  ['Resident Evil 3 PS5', 'Resident Evil 3 Remake PS5', false],
  ['Metal Gear Solid PS3', 'Metal Gear Solid HD Collection PS3', false],
  ['Jogo The Walking Dead: A Telltale Game Series - Xbox One', 'Jogo The Walking Dead Collection Telltale Series Xbox One', false],
  ['Crash Bandicoot 4 PS4', 'Crash Bandicoot N. Sane Trilogy PS4', false],
  ['Ghost of Tsushima PS5', "Ghost of Tsushima Director's Cut PS5", false],
  ['Hogwarts Legacy PS5', 'Hogwarts Legacy Season Pass PS5', false],
  ['Mortal Kombat 1 PS5', 'Mortal Kombat 1 PS5 + Kombat Pack', false],
  ['Fortnite V-Bucks 1000 Xbox', 'Fortnite V-Bucks 2800 Xbox', false],
  ['Cabo USB-C para Controle PS5', 'Kit 2 Cabos USB-C para Controle PS5', false],
  ['Grip Silicone Controle PS5 Par', 'Grip Silicone Controle PS5 4 Pares', false],
  // --- jogo: cor no nome e parte do titulo (NAO e removida em jogo)
  ['Pokémon Red Switch', 'Pokémon Blue Switch', false, 'game'],
  ['Pokémon Sword Switch', 'Pokémon Shield Switch', false, 'game'],
  // --- identicos de verdade (controles)
  ['Resident Evil Village PS5', 'Resident Evil Village PS5 Mídia Física Lacrado Pronta Entrega', true],
  ['Resident Evil Village PS5', 'Jogo Resident Evil Village Ps5 Físico', true],
  ['Nintendo Switch Sports Nintendo Switch (digital)', 'Nintendo Switch® Sports Nintendo Switch (Digital)', true], // ® nao separa

];
for (const [a, b, same, type] of PAIRS) {
  const na = normalizeTitle(a, { productType: type });
  const nb = normalizeTitle(b, { productType: type });
  const got = isSameProduct(na, nb);
  check(got === same, `identidade esperado=${same ? 'MESMO' : 'SEPARA'} obtido=${got ? 'MESMO' : 'SEPARA'}`, `${a}  x  ${b}`);
}

// ---------------------------------------------------------------------------
// B. Numerais unificados (usado por dedup e relink)
// ---------------------------------------------------------------------------
const NUM: Array<[string, string[]]> = [
  ['resident evil iv', ['4']],
  ['resident evil 4', ['4']],
  ['ea fc 2024', ['24']],
  ['ea fc 24', ['24']],
  ['final fantasy xvi', ['16']],
  ['gta v', ['5']],
  ['mario x rabbids', []],
  ['dragon quest xi', ['11']],
];
for (const [core, want] of NUM) {
  const got = numeralsOf(core);
  check(JSON.stringify(got) === JSON.stringify(want), `numerais de "${core}"`, `obtido ${JSON.stringify(got)}`);
}

// ---------------------------------------------------------------------------
// C. Geracao e plataforma
// ---------------------------------------------------------------------------
check(mentionsMultipleGenerations('EA FC 25 PS4 PS5'), 'cross-gen PS4+PS5');
check(mentionsMultipleGenerations('Forza Horizon 5 Xbox One / Series X|S'), 'cross-gen Xbox One + Series');
check(mentionsMultipleGenerations('Zelda Nintendo Switch e Nintendo Switch 2'), 'cross-gen Switch 1 + 2');
check(!mentionsMultipleGenerations('EA FC 25 PS4 (compatível com PS5)'), 'compatibilidade nao e cross-gen');
check(!mentionsMultipleGenerations('God of War Ragnarok PS5'), 'geracao unica');
check(!mentionsMultipleGenerations('Controle Xbox Series X|S'), 'Series X|S e uma geracao so');
check(derivePlatformFromTitle('EA FC 25 PS4 (retrocompatível com PS5)') === 'ps4', 'plataforma do disco com compatibilidade');
check(!mentionsMultipleGenerations('Jogo Original Battlefield 3 Xbox 360 Roda no Xbox One e Series X Mídia Física'), 'disco 360 que roda no One/Series');
check(!mentionsMultipleGenerations('Jogo Original Metal Gear Rising Xbox 360 (Retrocompatível com One/Series X)'), 'retrocompatível com One/Series entre parênteses');
check(mentionsMultipleGenerations('NBA 2k23 Xbox one lacrado novo Xbox one séries x'), 'Xbox one + séries x é cross-gen');
check(mentionsMultipleGenerations('Halo Infinite Xbox Série X|S, Xbox One e PC (Digital)'), 'Série X|S + One é cross-gen');
check(mentionsMultipleGenerations('Jogo Tales Of Arise Xbox One / Series Mídia Física'), 'Xbox One / Series (sem X/S) é cross-gen');
check(mentionsMultipleGenerations('Dragon Ball Fighter Z - XBOX One/Series - Original'), 'XBOX One/Series colado é cross-gen');
check(!mentionsMultipleGenerations('Jogo The Walking Dead: A Telltale Game Series - Xbox One'), 'Series de nome de coleção não é geração');
check(!mentionsMultipleGenerations('Micro Machines World Series (mídia Física) - Xbox One'), 'World Series não é geração');
check(derivePlatformFromTitle('Cabo HDMI Compatível com PS5') === 'ps5', 'alvo de compatibilidade de acessório continua sendo a plataforma');
check(derivePlatformFromTitle('Controle Compatível Xbox Series X') === 'xbox_series', 'controle compatível com Xbox Series');
check(derivePlatformFromTitle('Jogo Playstatio 2 God of War') === 'unknown', 'PS2 nao tem valor no enum, mas nao quebra');

// ---------------------------------------------------------------------------
// D. Condicao e rechecagem da oferta contra o master
// ---------------------------------------------------------------------------
const FLAGS: Array<[string, 'new' | 'open_box' | 'used', boolean]> = [
  ['Jogo Hogwarts Legacy PS5 Open Box', 'open_box', false],
  ['Console PlayStation 5 Slim 1TB (Open-Box)', 'open_box', false],
  ['Jogo God of War PS4 Usado', 'used', false],
  ['Console Xbox Series S Seminovo', 'used', false],
  ['Jogo Mario Kart 8 Deluxe Switch Lacrado', 'new', false],
  ['EA FC 25 PS4 PS5', 'new', true],
  ['EA FC 25 PS4 (compatível com PS5)', 'new', false],
];
for (const [title, cond, cross] of FLAGS) {
  const f = offerTitleFlags(title);
  check(f.condition === cond && f.crossGen === cross, `flags de "${title}"`, `obtido ${f.condition}/${f.crossGen}`);
}

// [titulo da oferta, nome do master, tipo, esperado]
type O = [string, string, string, OfferIdentityReason];
const OFFERS: O[] = [
  // --- os contaminados da auditoria (titulos reais; sheet ofertas-suspeitas)
  ['Console Playstation 5 Digital Slim 1TB', 'Console PlayStation 5 Slim Digital 825GB', 'console', 'divergencia'],
  ['Controle Stelf Xbox Series com Grip (Black) Elite', 'Controle Stelf Xbox Series com Grip - 2 Paddles (Black)', 'accessory', 'divergencia'],
  ['Jogo The Walking Dead Collection Telltale Series Xbox One', 'Jogo The Walking Dead: A Telltale Game Series - Xbox One', 'game', 'divergencia'],
  ['Jogo The Legend of Zelda: Breath of the Wild Edição Especial para Nintendo Switch', 'The Legend of Zelda Breath of The Wild Switch Midia Fisica', 'game', 'divergencia'],
  ['Mario Kart World (Digital) — Mercado Livre', 'Mario Kart World (Switch 2)', 'game', 'divergencia'],
  ['Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 26 + God Raganarok + Gta 5', 'Sony Playstation 4 1 tera Ps4 + Ea Fc Fifa 26 + God Raganarok + Gta 5', 'console', 'divergencia'],
  ['Jogo Grand Theft Auto V - Gta 5 Ps3 Midia Fisica', 'Jogo Grand Theft Auto V Gta 5 Xbox X Midia Fisica', 'game', 'divergencia'],
  ['Jogo Nintendo Land Nintendo Wii U Midia Fisica Nintendo', 'Jogo Metroid Other M Nintendo Wii Mídia Física', 'game', 'divergencia'],
  ['Dead Rising 4 - XBOX ONE/SERIES X - Original', 'Dead Rising 3 - XBOX ONE/SERIES X - Original', 'game', 'geracao_ambigua'],
  ['Yakuza Kiwami 2 - Nintendo Switch 2 FÍSICO', 'Yakuza Kiwami - Nintendo Switch 2', 'game', 'divergencia'],
  ['Jogo Nintendo Switch Moving Out 2 Fisico', 'Moving Out - Nintendo Switch', 'game', 'divergencia'],
  ['Turok - Nintendo Switch Limited Run', 'Turok 3 Nintendo Switch Limited Run', 'game', 'divergencia'],
  ['Call of Duty: Infinite Warfare - Xbox One', 'Call of Duty Modern Warfare 2 - Xbox One', 'game', 'divergencia'],
  ['Controle Sem Fio Horipad Blue Para Nintendo Switch', 'Controle Sem Fio Horipad Gray Para Nintendo Switch', 'accessory', 'ok'], // cor comum junta
  ['Direct from Japan Final Fantasy VII Remake Intergrade PS5', 'Final Fantasy VII Remake Intergrade - PS5', 'game', 'divergencia'],
  // --- Open Box / usado / cross-gen: fora da cesta
  ['Console PlayStation 5 Slim 1TB Open Box', 'Console PlayStation 5 Slim 1TB', 'console', 'open_box'],
  ['Jogo God of War PS4 Seminovo', 'God of War PS4', 'game', 'used'],
  ['EA FC 25 PS4 PS5', 'EA FC 25 PS5', 'game', 'geracao_ambigua'],
  // --- falsos positivos legitimos: tem que ficar na cesta
  ['Controle Sem Fio DualSense PS5 Branco Sony', 'Controle DualSense PS5', 'accessory', 'ok'],
  ['Nintendo Switch Pro Controller Original', 'Controle Nintendo Switch Pro Controller', 'accessory', 'ok'],
  ['Console Nintendo Switch OLED 64GB Neon', 'Console Nintendo Switch OLED', 'console', 'ok'],
  ['Console Microsoft Xbox Series X 1TB Preto', 'Console Xbox Series X 1TB', 'console', 'ok'],
  ['Console Xbox Series X', 'Console Xbox Series X 1TB', 'console', 'ok'],
  ['Resident Evil 4 Gold Edition PS5 Mídia Física Lacrado', 'Resident Evil 4 Gold Edition PS5', 'game', 'ok'],
  ['Jogo Resident Evil Village Gold Edition Ps5 Original', 'Resident Evil Village Gold Edition – PS5 (Original)', 'game', 'ok'],
  ['Resident Evil Viii Village Gold Edition Ps5', 'Resident Evil Village Gold Edition – PS5 (Original)', 'game', 'ok'], // mesmo jogo escrito com o numeral
  ['Mario Kart 8 Deluxe Nintendo Switch Físico Lacrado Frete Grátis', 'Mario Kart 8 Deluxe Switch', 'game', 'ok'],
  ['Jogo Hogwarts Legacy Deluxe Edition PS5', 'Hogwarts Legacy Deluxe Edition PS5', 'game', 'ok'],
  ['EA Sports FC 2024 PS5', 'EA Sports FC 24 PS5', 'game', 'ok'],
  ['Jogo Resident Evil IV PS5', 'Resident Evil 4 PS5', 'game', 'ok'],
  ['EA FC 25 PS4 (compatível com PS5) Mídia Física', 'EA FC 25 PS4', 'game', 'ok'],
  ['Jogo PS4 Yakuza 6 The Song Of Life SEGA Físico', 'Yakuza 6: The Song of Life - PS4 - Original', 'game', 'ok'], // SEGA e editora, nao plataforma
  ['Controle Sem Fio DualSense Compatível PS4 e PS5 Branco', 'Controle DualSense PS5', 'accessory', 'ok'], // acessório cita 2 gerações por compatibilidade
  ['Cabo Carregador Controle PS5 Xbox One Series X Tipo C', 'Cabo Carregador Controle PS5 Xbox Series X Tipo C', 'accessory', 'ok'],

];
// Achados do parecer do guardião-catalogo (2026-11-03): oferta "padrão" silenciosa, modelos de acessório, subtítulos, condição
OFFERS.push(
  ['Zelda Tears of the Kingdom Nintendo Switch', 'Zelda Tears of the Kingdom Edição Colecionador Switch', 'game', 'divergencia'],
  ['Gran Turismo 7 PS4 Mídia Física', 'Gran Turismo 7 Greatest Hits PS4', 'game', 'divergencia'],
  ['Hogwarts Legacy PS5', 'Hogwarts Legacy Deluxe PS5', 'game', 'divergencia'],
  ['Console PS5 Slim 1TB Disc Edition Com Leitor', 'Console PS5 Slim Digital 1TB', 'console', 'divergencia'],
  ['Headset Logitech G733', 'Headset Logitech G435', 'accessory', 'divergencia'],
  ['Headset Redragon Pandora H350', 'Headset Redragon Zeus X H510', 'accessory', 'divergencia'],
  ['Headset HyperX Cloud II Wireless', 'Headset HyperX Cloud II', 'accessory', 'divergencia'],
  ['Console PS5 Slim 1TB Com Defeito', 'Console PS5 Slim 1TB', 'console', 'used'],
  ['Controle DualSense PS5 Sucata', 'Controle DualSense PS5', 'accessory', 'used'],
  ['Console PS5 Slim 1TB + Jogo', 'Console PS5 Slim 1TB', 'console', 'divergencia'],
  ['Persona 5 Royal PS4', 'Persona 5 PS4', 'game', 'divergencia'],
  ['Elden Ring Shadow of the Erdtree PS5', 'Elden Ring PS5', 'game', 'divergencia'],
  ['God of War Ragnarok PS4', 'God of War PS4', 'game', 'divergencia'],
  ['Minecraft Legends Switch', 'Minecraft Switch', 'game', 'divergencia'],
  ['Console Xbox Series 1TB', 'Console Xbox Series S 512GB', 'console', 'divergencia'],
  // legítimos que não podem sair da cesta
  ['Controle Xbox Series Sem Fio + Pilhas', 'Controle Xbox Series', 'accessory', 'ok'],
  ['Nintendo Switch Pro Controller', 'Controle Pro Nintendo Switch', 'accessory', 'ok'],
  ["Assassins Creed Valhalla Xbox One", "Assassin's Creed Valhalla Xbox One", 'game', 'ok'],
  ['GTA V PS4', 'Grand Theft Auto V PS4', 'game', 'ok'],
  ['COD MW3 PS4', 'Call of Duty Modern Warfare 3 PS4', 'game', 'ok'],
  ['The Legend of Zelda Breath of the Wild Switch', 'Zelda Breath of the Wild Switch', 'game', 'ok'],
  ['Jogo Hogwarts Legacy PS5 Sem Juros Apenas Hoje Lançamento 2024', 'Hogwarts Legacy PS5', 'game', 'ok'],
  ['Headset HyperX Cloud II 7.1', 'Headset HyperX Cloud II', 'accessory', 'ok'],
  ['Console Nintendo Switch Oled 64GB', 'Nintendo Switch OLED', 'console', 'ok'],
  ['NBA 2K 25 PS5', 'NBA 2K25 PS5', 'game', 'ok'],
  ['RE4 PS5', 'Resident Evil 4 PS5', 'game', 'ok'],
  ['Pokémon Escarlate Switch', 'Pokémon Scarlet Switch', 'game', 'ok'],
);
for (const [offer, master, type, want] of OFFERS) {
  const r = evaluateOfferIdentity(offer, { name: master, productType: type });
  check(r.reason === want, `oferta esperado=${want} obtido=${r.reason}`, `"${offer}" no master "${master}" [${r.summary}]`);
  check(r.excluded === (want !== 'ok'), `oferta excluida=${want !== 'ok'}`, `"${offer}"`);
}

// ---------------------------------------------------------------------------
// P. Plataforma reconciliada com o titulo (QA rodada 4, P1-A, 2026-11-03)
// ---------------------------------------------------------------------------
const RECON: Array<[string, string, string]> = [
  // [gravada, titulo, esperada]: titulo so com legado => 'unknown' (enum nao tem Wii/PS2)
  ['switch_1', 'Jogo Nintendo Wii : Sonic Unleashed', 'unknown'],
  ['ps4', 'Memory Card 16mb Para Playstation 2 - Ps2- Console Salvar', 'unknown'],
  ['ps4', 'Console Sony Playstation Portatil Psp Cor Psp-3000 Gold', 'unknown'],
  // titulo com UMA geracao moderna diferente da gravada vence
  ['ps5', 'Street Fighter 30 Anniversary Collection Ps4 Midia Fisica', 'ps4'],
  // nao troca: estruturado confere, compatibilidade, cross-gen, moderna + legada
  ['ps5', 'God of War Ragnarok PS5', 'ps5'],
  ['ps4', 'Jogo PS4 Midia Fisica Compativel com PS5', 'ps4'],
  ['xbox_series', 'Soul Hackers 2 Xbox One - Xbox X - Midia Fisica', 'xbox_one'],
  ['ps5', 'Controle PS5 DualSense compativel com PS3', 'ps5'],
  ['switch_1', 'Mario Kart 8 Deluxe Nintendo Switch', 'switch_1'],
  ['unknown', 'Jogo Wii Sports', 'unknown'],
];
for (const [db, title, want] of RECON) {
  const got = reconcilePlatform(db as never, title);
  check(got === want, `reconcilePlatform esperado=${want} obtido=${got}`, `[${db}] "${title}"`);
}
check(readPlatform('switch_1' as never, 'Jogo Nintendo Wii : Sonic Unleashed').legacyLabel === 'Wii', 'readPlatform rotulo Wii');

console.log(`${total} verificacoes (${PAIRS.length} pares de identidade, ${NUM.length} numerais, ${FLAGS.length} condicoes, ${OFFERS.length} ofertas); falhas: ${fail}`);
process.exit(fail ? 1 : 0);
