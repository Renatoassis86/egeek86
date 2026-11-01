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
];

const MOVED: Array<[string, ProductType, ProductType]> = [
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
  ['Host De Jogo Disco Rígido Externo HDD Gabinete Transmissão De Alta Velocidade Dados Caso Para Xbox Série X & S', 'console', 'accessory'],
  ['Refrigerador Duplo Para Ps5 Slim Tp5-3538 Dobe', 'console', 'accessory'],
  ['Playstation 4 Ps4 Slim Preto Jet Black 1tb Dois Controles + Um Jogo Gta 5/ Red Dead Redemption 2', 'accessory', 'console'],
  ['Console Playstation 4 500gb + Controle Dualshock 4', 'accessory', 'console'],
  ['Kit Console Xbox Series X Digital 2 Controles Branco', 'accessory', 'console'],
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
];

const cases: Case[] = [
  ...HIDDEN.map(([name, db]): Case => ({ name, db, expect: 'hidden' })),
  ...MOVED.map(([name, db, to]): Case => ({ name, db, expect: to })),
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
console.log(`${cases.length} casos (${HIDDEN.length} ocultos, ${MOVED.length} movidos, ${LEGIT.length} legitimos); falhas: ${fail}`);
process.exit(fail ? 1 : 0);
