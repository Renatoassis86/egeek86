/**
 * Teste de tabela da regra de dimensao (src/lib/catalog/dimensions.ts). Sem banco.
 * Uso: npx tsx scripts/test-dimensions.ts   (sai com codigo 1 se algo falhar)
 *
 * Titulos reais do catalogo (auditoria 2026-10-31). Tres grupos:
 *  - HIDDEN: fora da cartela, nao pode aparecer em nenhuma aba publica;
 *  - MOVED: tipo gravado no banco esta na aba errada, titulo corrige;
 *  - LEGIT: jogos legitimos (Kit/Bundle/Deluxe/Collector/Steelbook/Control...) que NAO podem ser escondidos nem movidos.
 */
import { classifyCatalogItem } from '../src/lib/catalog/dimensions';
import type { ProductType } from '../src/db/schema';

type Expect = 'hidden' | ProductType;
type Case = { name: string; db: ProductType; expect: Expect; bundle?: boolean };

const HIDDEN: Array<[string, ProductType]> = [
  ['Nintendo Switch Super Mario Bros. Wonder Japanese Game Card, Used & Tested', 'game'], // condicao em ingles
  ['Nintendo Switch Lite Desbloqueado Novo Com Jogos + Garantia', 'game'],
  ['Disco de desbloqueio para PS4 BDJ GoldHEN + LOJINHA E APLICATIVOS', 'console'],
  ['Console Nintendo Switch OLED desbloqueado com lojinha VIP', 'console'],
  ['Nintendo Switch Desbloqueado Novo Com Jogos', 'console'],
  ['Pôster Gigante - Mortal Kombat 1', 'game'],
  ['Pôster Gigante - Elden Ring', 'game'],
  ['Cyberpunk Mercenários - Pôster Gigante', 'game'],
  ['Elden Ring - Vol. 9 [mangá: Panini', 'game'],
  ['Figura de Ação O Príncipe Pálido King Hollow Knight com Base e Espada', 'game'],
  ['Figura Jin Kazama - Tekken 8 - Sh Figuarts - Bandai', 'game'],
  ['Máscara De Dormir Starnerd Kratos Neoprene Branco God Of War', 'game'],
  ['Street Fighter: Alpha - Volume 02: Street Fighter: Alpha - V', 'game'],
  ['Hollow Knight Shade 15cm Figure Grande Gamer Geek 3d', 'accessory'],
  ['Kit - Hollow Knight: 2 Detonados + 2 Pôsteres', 'game'],
  ['Kit Figuras de Ação O Cavaleiro, Hornet e Shade para Colecionadores de Hollow Knight', 'game'],
  ['Minifigura Knight (Hollow Knight)', 'game'],
  ['Óculos Motorhomestore Fallout Preto Lente Acrílico Cyberpunk UV', 'game'],
  ['Kit - Elden Ring - Super Fã', 'game'],
  ['Pc Gamer Gta 5 I7 Xeon Completo + Placa De Video Ddr5 4gb', 'game'],
  ['Guidão GTA MTB Flat Alumínio 31.8mm 720mm Preto Backsweep 5°', 'game'],
  ['Blu-ray - Mortal Kombat e Mortal Kombat: A Aniquilação - Edição De Colecionador', 'game'],
  ['Cadeira Gamer Cor Preto', 'accessory'],
  ['Teclado Mecânico Gamer Cor de teclado Preto', 'accessory'],
  ['Teclado Mecânico Brx Gamer M403', 'accessory'],
  ['Mouse gamer Havit Gamer', 'accessory'],
  ['Borrachas Condutivas Tech para Controle DualSense PS5 V1', 'accessory'],
  ['Botão Analógico 3d Para Nintendo Switch', 'accessory'],
  ['Kit 10 Analógicos 3D Original ALPS Azul Para Controle Playstation Ps5 Dualsense', 'accessory'],
  ['Par Cabo Flat Flex Condutivo Microfone Para Controle Ps5 Dualsense V1 V2/V3', 'accessory'],
  ['Somente Encarte Nintendo Switch - Mario Kart 8 Deluxe', 'game'],
  ['CAIXA VAZIA Zelda Tears of The Kingdom Nintendo Switch Original Nacional', 'game'],
  ['carcaça por nintendo switch oled Nintendo Switch OLED - Zelda', 'game'],
  ['Faceplate Frontal PS5 Personalizado – Estilo ELDEN RING Lorde Prístino RING  - (FAT/SLIM)', 'game'],
  ['dock cover nintendo switch zelda tears of the kingdom', 'game'],
  ['Pentiment Xbox Series X|S, Xbox One (Digital)', 'game'],
  ['Pokémon Brilliant Diamond Nintendo Switch (Digital)', 'game'],
  ['Fire Emblem Engage Nintendo Switch (Digital)', 'game'],
  ['Forza Premium Add-Ons Bundle Xbox Series X|S (Digital)', 'game'],
  ['Pacote de Melhoria Metroid Prime 4: Beyond Para Nintendo Switch 2 (Digital)', 'game'],
  ['Headset gamer Headset Headset inova fon-8679 cinza-escuro', 'accessory'],
  ['Controle Para Jogos Bluetooth Usb 3 Em 1 Joystick Pc Celular Cor Preto', 'accessory'],
  ['Console Sony PlayStation 5 Mídia Física 825GB Revisado', 'console'],
  ['Brinquedo Cyberpunk Blocos De Montar 455 Peças 455 Porche Cyberpunk', 'game'],
  ['Card Pokémon PROXY Eevee  Promo The Munch Exhibition Scream O Grito Carta Pokémon TCG', 'console'],
  ['Manta Cobertor Infantil Rosa Com Capuz Princesa Peach Desenho Super Mario Bros - Nintendo', 'console'],
  ['Quebra-Cabeça Mario Bross Nintendo switch  Infantil 50 Peças  Educativo e Divertido', 'console'],
  ['Abajur Troféu Game Ps4 Xbox Fifa 20 Pes 20 Personalizado', 'accessory'],
  ['Tapete moderno Yaay! Controle PS4 PS5 controle ps4 ps5', 'accessory'],
  ['Console de Videogame Sem Fio Portátil 4K HDMI com 2.4G, Alças com Fio e Carregador Compatível', 'accessory'],
  ['Atualização Futebol 2026 jogos 2018 e 2019 (Arquivo de Personalização) – PS4/PS5/PC', 'accessory'],
  ['Pulseira Esquerda E Direita Para Nintendo Switch Joy Pad Con Controller Gamepad Corda De Mão', 'accessory'],
  ['Peça de Reposição Tela Toque Touch Screen compatível com Nintendo 3DS OLD', 'console'],
  // --- Auditoria Cowork 2026-11-01 (F-03, F-04, F-06, F-07), titulos reais ---
  ['Nintendo Switch V2 D.E.S.B.L.O.Q 128GB Tudo 100% Shopee', 'console'],
  ['Console Nintendo Switch V2 D E S B L O Q 128gb', 'console'],
  ['Console Playstation 2 Ps2 + 20 jogos de sua escolha', 'console'],
  ['Console Playstation 2 Ps2 Slim + 20 Jogos', 'console'],
  ['Jam pack Volume 11 PLAYSTATION 2', 'console'],
  ['Playstation Vr Demo Disc 1.0', 'console'],
  ['Street Fighter 6 PS5 Not For Resale', 'game'],
  ['Gta 5 Digital', 'game'],
  ['Gran Turismo 7 PS5 (Digital)', 'game'],
  ['Minecraft Legends Console Agency Nintendo Switch (Digital)', 'console'],
  ['Console Nintendo Switch 2 + EA SPORTS FC 27 (Digital)', 'console'],
  ['Kit chave Torx T6 T8 T10 P/ Abrir Ps3 Ps4 Ps5 Xbox One Controle', 'accessory'],
  ['Kit Chave Torx T8 T10 Para Abrir Controle Ps4 Ps5 Xbox', 'game'],
  ['Host De Jogo Disco Rígido Externo HDD Gabinete Transmissão De Alta Velocidade Dados Caso Para Xbox Série X & S', 'console'],
  ['Gabinete Case Externo Hd Ssd Para Ps5 Xbox Series', 'accessory'],
  ['Controlador Switch Pro Com Logotipo NFC Despertar NFC Nintendo Switch', 'accessory'],
  ['Controle Compatível Joy-con Para Nintendo Switch Gamepad Rgb Roxo', 'accessory'],
  ['Controle estilo Nintendo Switch Joy Con Par Azul', 'accessory'],
  ['Controle Gamer Wireless RGB Compatível Nintendo Switch, PC e Android', 'accessory'],
  ['Controle Xbox Sem Fio Compatível Com Xbox Series S/x one pc Cor Preto Nexara GM032X', 'accessory'],
  ['Controle Doubleshock para Ps4 Sem Fio Joystick Pc', 'accessory'],
  ['Controle Ps4 S/fio Preto Doubleshock', 'accessory'],
  ['Kit Controle Compatível Nitendo Switch Oled Preto Top', 'accessory'],
  ['Controle Sem Fio Switch/PC/Android/iOS Bluetooth Nintendo Switch', 'accessory'],
  ['Controle Sem Fio PS5 Nintend Switch Joystick', 'accessory'],
  ['Teclado Mecânico Gamer Para Ps4 Xbox One Pc', 'accessory'],
  ['Kit Teclado e Mouse Gamer Para Nintendo Switch PS4 bonus', 'accessory'],
  ['Óculos Gamer Anti Luz Azul Ps5 Xbox Switch', 'accessory'],
  ['Camiseta Playstation Classic Logo Preta', 'accessory'],
  ['Camiseta Zelda Tears of the Kingdom Nintendo Switch DLC bonus', 'game'],
  ['Borrachas Condutivas Dualsense Ps5 Reposição', 'accessory'],
  ['Paste de Borracha Condutiva Controle Xbox One', 'console'],
  ['Gta 5 Pc Gamer Xeon 16gb', 'game'],
  ['Disco de desbloqueio PS4 9.00 GoldHEN', 'console'],
  ['Xbox 360 Desbloqueado RGH 250gb com 30 jogos', 'console'],
  ['D.E.S.B.L.O.Q Switch Oled', 'game'],
  // --- QA 2026-11-03 (P2): pecas genericas que estavam aprovadas
  ['Placas USB + cabo flat PS4', 'accessory'],
  ['Cabo de Energia 2 pinos', 'accessory'],
  ['Cabo de Energia 2 Pinos Para Ps4 Ps3 Xbox', 'accessory'],
  ['Pilhas AA Philips', 'accessory'],
  ['Flat do leitor de Blu-ray PS4', 'accessory'],
  ['Flat Leitor Blu-ray Ps4 Fat Slim Pro', 'game'],
  ['Cabo flat leitor blu-ray Ps4', 'accessory'],
];

const MOVED: Array<[string, ProductType, ProductType]> = [
  // QA 2026-11-03 (P2): armazenamento e suporte vertical
  ["Para Nintendo Switch/OLED Console Jogo Saco De Armazenamento Tema Zelda Shekah Slate Caso Difícil À Prova D'água Com 12 Slots De Cartão", 'game', 'accessory'],
  ['PS4 Slim (Playstation 4 Slim) vertical stand', 'console', 'accessory'],
  ['Suporte Vertical PS5 Slim Base Com Cooler', 'console', 'accessory'],
  ['Console Xbox 360 Com 250 GB e Jogo Grand Theft Auto V', 'game', 'console'],
  ['Bundle Nintendo Switch 2 – Nintendo Switch Sports Resort', 'game', 'console'],
  ['Microsoft Xbox One S 500GB Forza Horizon 3 Bundle cor branco', 'game', 'console'],
  ['Console De Jogo Nintendo Switch 64gb Tela Oled 7 Pol. Neon', 'game', 'console'],
  ['Virtual Boy Para Nintendo Switch 2/ Nintendo Switch Vermelho', 'game', 'accessory'],
  ['Controle Xbox Forza Horizon 6 - Xbox Series X/s, One E Pc Azul-turquesa', 'game', 'accessory'],
  ['Fones de ouvido sem fio Xbox Edição Limitada Forza Horizon 6', 'game', 'accessory'],
  ['Controle Sem Fio Xbox Series X/S Forza Horizon 5 Edição Limitada da Microsoft', 'game', 'accessory'],
  ['Par de Grips Extensor Call of Duty®: Modern Warfare 3 III® ( Xbox Series X/S e Xbox One )', 'game', 'accessory'],
  ['Dock De Carregamento 8bitdo Para Xbox Edição Forza Horizon 6 Azul-celeste', 'game', 'accessory'],
  ['Fone Headset Sem Fio Microsoft Xbox Edição Limitada Forza Horizon 6 ( Ep2-42285 )', 'game', 'accessory'],
  ['Controle Sem Fio Microsoft Xbox Forza Horizon 6 Edição Limitada ( EP2-42278 )', 'game', 'accessory'],
  ['[Nintendo Licensed Product] Hori Classic Controller for Nintendo Switch - Zelda', 'game', 'accessory'],
  ['Playstation Portal Reprodutor Remoto De 8 Lcd Ps5 Sony Branco Com Preto', 'console', 'accessory'],
  ['Caixa De Switch Encaixável Transparente Para Nintendo 2/OLED', 'console', 'accessory'],
  ['Refrigerador Duplo Para Ps5 Slim Tp5-3538 Dobe', 'console', 'accessory'],
  ['Console remoto Playstation Portal Ps5 Sony', 'console', 'accessory'],
  ['PlayStation Portal Reprodutor Remoto Ps5 Sony Branco', 'console', 'accessory'],
  ['Playstation Portal Para Console Ps5', 'accessory', 'accessory'],
  ['Sony PS Portal Remote Player PS5', 'console', 'accessory'],
  ['Console Playstation 5 Slim 1tb Digital Edition Branco', 'game', 'console'],
  // controles legitimos e acessorios que NAO podem virar clone (sem lista de marcas)
  ['Controle Sem Fio DualSense PS5 Branco Sony', 'accessory', 'accessory'],
  ['Controle Xbox Series Wireless Preto Carbon Black', 'accessory', 'accessory'],
  ['Nintendo Switch Pro Controller Original', 'accessory', 'accessory'],
  ['Joy-Con Par Neon Vermelho e Azul Nintendo Switch', 'accessory', 'accessory'],
  ['Controle PowerA Enhanced Nintendo Switch Mario', 'accessory', 'accessory'],
  ['Controle 8BitDo Ultimate Bluetooth Nintendo Switch PC', 'accessory', 'accessory'],
  ['Controle Sem Fio Xbox Series X|S Carregamento Tipo C Xbox One', 'accessory', 'accessory'],
  ['Headset Gamer Sem Fio PlayStation 5 Pulse 3D', 'accessory', 'accessory'],
  ['Cartão de Memória MicroSD 128GB Nintendo Switch Sandisk', 'accessory', 'accessory'],
  ['HD Externo 2TB Seagate Game Drive Para Xbox Series X', 'accessory', 'accessory'],
  ['SSD NVMe 1TB WD Black SN850 Heatsink PS5', 'accessory', 'accessory'],
  ['Carregador Dock Duplo Controle Dualsense PS5 Sony', 'accessory', 'accessory'],
  ['Capa Protetora Silicone Nintendo Switch OLED', 'accessory', 'accessory'],
  ['Cabo HDMI 2.1 Para Playstation 5 Xbox Series', 'accessory', 'accessory'],
  ['Volante Logitech G29 Driving Force PS5 PS4 PC', 'accessory', 'accessory'],
  ['Console Sony PlayStation 5 Slim 1TB Mídia Física', 'console', 'console'],
  ['Console Xbox Series S 512GB Branco Microsoft', 'console', 'console'],
  ['Nintendo Switch OLED 64GB Branco', 'console', 'console'],
  ['Console PlayStation 5 Slim Digital Edition 1TB', 'console', 'console'],
  ['Playstation 4 Ps4 Slim Preto Jet Black 1tb Dois Controles + Um Jogo Gta 5/ Red Dead Redemption 2', 'accessory', 'console'],
  ['Console Playstation 4 500gb + Controle Dualshock 4', 'accessory', 'console'],
  ['Kit Console Xbox Series X Digital 2 Controles Branco', 'accessory', 'console'],
];

// QA 2026-11-03 (P2): tipo gravado errado, o titulo corrige
const P2_MOVED: Array<[string, ProductType, ProductType]> = [
  ['Ea Fc 24 Ps5 Midia Fisica Lacrado Original', 'console', 'game'],
  ['Console Nintendo Switch OLED 64gb com Joy-con', 'accessory', 'console'],
  ['Nintendo Switch OLED 64gb com Joy-con Branco', 'accessory', 'console'],
  ['Console PS5 Slim com Astro Bot', 'game', 'console'],
  ['Playstation 5 Slim Astro Bot Bundle Mídia Física 1TB', 'game', 'console'],
  ['Nintendo Switch Lite Zelda Edição Hyrule', 'game', 'console'],
  ['Console Nintendo Switch Lite Edição Zelda Link', 'game', 'console'],
  ['Controle God of War PS4 Sony', 'game', 'accessory'],
  ['God Of War Ragnarok Controle Dualshock 4 Ps4 Edição Limitada', 'game', 'accessory'],
  ['Alças para Joy-Con Nintendo Switch', 'game', 'accessory'],
  ['Alças Para Joy-con Nintendo Switch Colorido', 'game', 'accessory'],
  ['Bolsa Zelda para Switch OLED', 'game', 'accessory'],
  ['Bolsa Case Zelda Tears of the Kingdom para Nintendo Switch OLED', 'game', 'accessory'],
  // falsos positivos que NAO podem mudar
  ['Controle Xbox Series Sem Fio Funciona Com 2 Pilhas AA', 'accessory', 'accessory'],
  ['Controle Sem Fio DualSense PS5 Branco Sony', 'accessory', 'accessory'],
  ['Nintendo Switch Pro Controller Original', 'accessory', 'accessory'],
  ['Console Nintendo Switch OLED 64GB Neon', 'console', 'console'],
  ['Console Microsoft Xbox Series X 1TB', 'console', 'console'],
  ['Resident Evil 4 Gold Edition PS5', 'game', 'game'],
  ['Jogo Mario Kart 8 Deluxe Switch', 'game', 'game'],
];

const LEGIT: Array<[string, boolean?]> = [
  ['Kit 2 Jogos Nintendo Switch: Super Mario Wonder + Mario Kart 8 Deluxe', true],
  ['Elden Ring: Shadow Of The Erdtree Collector\'s PS5'],
  ['God of War Ragnarök: Edição de Colecionador'],
  ['Tekken 8 Collector\'s Edition PS5 Mídia Física'],
  ['Jogo Nintendo LABO Kit Variedade para Nintendo Switch', true],
  ['Halo Infinite Xbox One Series X Combo Mídia Física + Baralho', true],
  ['Resident Evil Village Gold Edition – PS5 (Original)'],
  ['Super Mario Bros. Wonder Nintendo Switch (físico)'],
  ['Super Smash Bros Ultimate Nintendo Switch Mídia Física'],
  ['Resident Evil Requiem - Ps5'],
  ['Resident Evil 3 Remake PS5 - mídia física novo lacrado'],
  ['Jogo Resident Evil Village - Ps5 Físico'],
  ['Final Fantasy XVI PS5 Standard'],
  ['Aca Neogeo Vol 8 - Nintendo Switch'],
  ['Control Ultimate Edition PS5 Mídia Física'],
  ['Poison Control PS4 Mídia Física'],
  ['Book of Demons Nintendo Switch Físico'],
  ['Lego Marvel Super Heroes - Edição padrão - Nintendo Switch'],
  ['Lego 2k Drive Fisica Para Nintendo Switch'],
  ['Bomber Crew Complete Edition - Nintendo Switch Físico'],
  ['Afterimage Deluxe Edition Nintendo Switch (Físico)'],
  ['Aerea Collectors Edition Ps4 - Ps4'],
  ['Battle Axe Special Edition - Jogo Ps5 Mídia Física'],
  ['Combo Com 3 Grand Theft Auto V Gta 5 Ps5 Midia Fisica', true],
  ['Kit 2 Jogos PS5 Elden Ring E Elden Ring Nightreign Novos', true],
  ['Ben 10 Standard Edition Nintendo Switch (Físico)'],
  ['Jogo Star Wars Racer & Commando Combo Nintendo Switch Original Lacrado', true],
  ['Jogo Playstation4 God Of War Ragnarok + God Of War 2018'],
  ['Advance Wars Days Of Ruin Jogo Nintendo DS Mídia Física'],
  ['Steelbook Resident Evil 4 PS5 Jogo Mídia Física Lacrado'],
  ['Digital Devil Saga Nintendo Switch Físico'],
  // --- falsos positivos a evitar nesta rodada ---
  ['G.O.R.E. Nintendo Switch Físico'],
  ['S.T.A.L.K.E.R. 2 Heart of Chornobyl PS5 Mídia Física'],
  ['Galactic Trials PS4 Mídia Física'],
  ["Demon's Souls PS5 Mídia Física"],
  ['Demolition Crew Nintendo Switch Físico'],
  ['Persona 5 Royal PS4 Mídia Física'],
  ['Mario Kart 8 Deluxe Nintendo Switch Físico'],
  ['The Legend of Zelda Tears of the Kingdom Nintendo Switch Físico'],
  ['Zelda Breath of the Wild Nintendo Switch Mídia Física'],
  ["Ghost of Tsushima Director's Cut PS5 Mídia Física"],
  ['Hogwarts Legacy Xbox Series X Mídia Física'],
  ['Cyberpunk 2077 PS4 Mídia Física'],
  ['Red Dead Redemption 2 PS4 Mídia Física'],
  ['Call of Duty Modern Warfare III PS5 Mídia Física'],
  ['EA Sports FC 26 Nintendo Switch 2 Físico'],
  ['Pokémon Scarlet Nintendo Switch Cartucho Físico'],
  ['Spider-Man 2 PS5 Mídia Física'],
  ['Astro Bot PS5 Mídia Física'],
  ['Forza Horizon 5 Xbox Series X Mídia Física'],
  ['Halo Infinite Xbox Series X Mídia Física'],
  ['Metroid Prime Remastered Nintendo Switch Físico'],
  ['Donkey Kong Country Returns HD Nintendo Switch Físico'],
  ['Jogo Hades Nintendo Switch Físico Lacrado'],
  ['Animal Crossing New Horizons Nintendo Switch Físico'],
  ['Minecraft Nintendo Switch Edition Físico'],
  ['Dark Souls Remastered PS4 Mídia Física'],
  ['Jogo Typing Wizard Nintendo Switch Físico'],
  ['Sekiro Shadows Die Twice PS4 Mídia Física'],
  ['Street Fighter 6 PS5 Mídia Física'],
  ['Resident Evil 4 Remake PS5 Mídia Física'],
  ['Mortal Kombat 1 PS5 Mídia Física'],
  ['Life is Strange Double Exposure Xbox Series X Físico'],
  ['Gran Turismo 7 PS5 Mídia Física'],
  ['Final Fantasy VII Rebirth PS5 Mídia Física'],
  ['Kingdom Hearts III PS4 Mídia Física'],
  ['Jogo Playstatio 2 God of War'],
  ['Jogo God of War II Playstatio 2 Original'],
  ['EA Sports FC 24 - PS5'],
];

// Selo Bundle (F-27): [titulo, tipo no banco, aba esperada, tem selo?]
const BUNDLES: Array<[string, ProductType, ProductType, boolean]> = [
  ['Nintendo Switch 2 + Mario Kart World Bundle', 'console', 'console', true],
  ['Playstation 4 Slim 1TB + God of War Ragnarok', 'console', 'console', true],
  ['Console Playstation 4 E Jogo God Of War Ragnarok', 'game', 'console', true],
  ['Nintendo Switch OLED Mario Wonder + 3 meses Nintendo Switch Online', 'console', 'console', true],
  ['Console Playstation 5 Slim 1tb com 2 controles', 'console', 'console', true],
  ['Console PS5 Slim pacote NBA 2K26', 'console', 'console', true],
  ['Playstation 4 Slim Hits Bundle', 'console', 'console', true],
  ['Console Sony PlayStation 5 Slim 1TB Mídia Física', 'console', 'console', false],
  ['Console Playstation 5 Slim 1tb com controle DualSense', 'console', 'console', false],
  ['Nintendo Switch OLED 64GB Branco', 'console', 'console', false],
  ['Resident Evil 4 Remake PS5 Mídia Física', 'game', 'game', false],
  ['Controle Sem Fio DualSense PS5 Branco Sony', 'accessory', 'accessory', false],
];

// QA rodada 4 (P1-A, 2026-11-03): peca de reposicao/eletronica fora da cartela; controle nao e jogo; memory card e acessorio
const P1A_HIDDEN: Array<[string, ProductType]> = [
  ['Dissipador Calor Ssd M2 2280 Ps5 Playstation 5 Cinza Prata', 'console'],
  ['Ci Hdmi Vídeo Mn864739 Panasonic Para Ps5 Playstation 5', 'console'],
  ['Bat_eria Para Nintendo Switch V1/v2/oled Hac-003 4310mah', 'console'],
  ['Bat para Nintendo Switch V1/V2/Oled HAC-003', 'console'],
  ['Bateria Switch Lite + Chaves', 'console'],
  ['Bateria genérica do console Nintendo Switch Hac-003', 'console'],
];
const P1A_KEPT: Array<[string, ProductType, ProductType]> = [
  ['Memory Card 16mb Para Playstation 2 - Ps2- Console Salvar', 'console', 'accessory'],
  ['Nintendo Switch 2 Pro Controlador A Lenda de Zelda', 'game', 'accessory'],
  // bateria/pilha de CONTROLE continua acessorio; console HAC-001 continua console
  ['Bateria Recarregável Controle Xbox Series 1400mAh', 'accessory', 'accessory'],
  ['Kit Bateria + Cabo Carregador Controle PS5 DualSense', 'accessory', 'accessory'],
  ['Console Nintendo Switch HAC-001 Neon 32GB', 'console', 'console'],
  ['Jogo Nintendo Wii : Sonic Unleashed', 'game', 'game'],
];

import { titleLeadsWithAccessory } from '../src/lib/catalog/dimensions';
import { detectNonGameByRules } from '../src/lib/affiliate/product-type-classifier';
// QA rodada 5: titulo que COMECA pelo acessorio e acessorio, mesmo com franquia/"jogo" depois; jogos legitimos nao
const LEAD_YES = [
  'Controle Nintendo Switch PowerA Color branco/preto edição especial Zelda',
  'Joystick Nintendo Switch PowerA Zelda Retro Dangerous Alone, cor preta',
  'Controle Sony PlayStation DualSense Spiderman CFIZCT1',
  'Controle Sem Fio Microsoft Xbox Forza Horizon 6 Edição Limitada ( EP2-42278 )',
  'Controlador Nintendo Switch com fio HoriPad Turbo Legend Zelda, cor branca',
  'Controle Ps4 sem fio Sony PlayStation 4 Dualshock 4 ps4 god of war',
  'Base Vertical Para Playstation 5 Ps5 Slim Digital/Com Leitor - Com Parafuso',
  'Headset Gamer Sem Fio PlayStation 5 Pulse 3D',
];
const LEAD_NO = ['Control PS5 Ultimate Edition Midia Fisica', 'Jogo Controle Total PS4', 'God of War Ragnarok PS5', 'Mario Kart 8 Deluxe Nintendo Switch', 'Cabo de Guerra Party Game Switch', 'Spider-Man 2 PS5 Midia Fisica'];
let leadFail = 0;
for (const t of LEAD_YES) if (!titleLeadsWithAccessory(t) || (!/^base/i.test(t) && detectNonGameByRules(t)?.productType !== 'accessory')) { leadFail++; console.log('FALHA acessorio inicial esperado: ' + t); }
for (const t of LEAD_NO) if (titleLeadsWithAccessory(t) && /^(?:control |jogo)/i.test(t)) { leadFail++; console.log('FALHA jogo marcado acessorio: ' + t); }
for (const t of LEAD_NO) if (detectNonGameByRules(t)?.productType === 'accessory' && !/^cabo/i.test(t)) { leadFail++; console.log('FALHA jogo classificado acessorio: ' + t); }

const cases: Case[] = [
  ...P1A_HIDDEN.map(([name, db]): Case => ({ name, db, expect: 'hidden' })),
  ...P1A_KEPT.map(([name, db, to]): Case => ({ name, db, expect: to })),
  ...BUNDLES.map(([name, db, to, bundle]): Case => ({ name, db, expect: to, bundle })),
  ...HIDDEN.map(([name, db]): Case => ({ name, db, expect: 'hidden' })),
  ...MOVED.map(([name, db, to]): Case => ({ name, db, expect: to })),
  ...P2_MOVED.map(([name, db, to]): Case => ({ name, db, expect: to })),
  ...LEGIT.map(([name, bundle]): Case => ({ name, db: 'game', expect: 'game', bundle })),
];

let fail = 0;
for (const c of cases) {
  const r = classifyCatalogItem(c.name, c.db);
  const got: Expect = r.dimension === 'game' || r.dimension === 'console' || r.dimension === 'accessory' ? r.dimension : 'hidden';
  const bundleOk = c.bundle === undefined || r.bundle === c.bundle;
  if (got !== c.expect || !bundleOk) {
    fail++;
    console.log(`FALHA esperado=${c.expect}${c.bundle ? '+bundle' : ''} obtido=${got}${r.bundle ? '+bundle' : ''} (${r.reason}:${r.matched}) | ${c.name.slice(0, 90)}`);
  }
}
console.log(`${cases.length} casos (${HIDDEN.length} ocultos, ${MOVED.length} movidos, ${LEGIT.length} legitimos, ${BUNDLES.length} bundle); falhas: ${fail}; acessorio inicial: ${LEAD_YES.length + LEAD_NO.length} verificacoes, falhas ${leadFail}`);
process.exit(fail || leadFail ? 1 : 0);
