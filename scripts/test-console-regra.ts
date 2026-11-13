/**
 * Teste da REGRA ÚNICA de console (src/lib/catalog/console-videogame.ts). Roda sem banco: npx tsx scripts/test-console-regra.ts
 * Casos reais do dono (2026-11-13) como negativos; aparelhos reais como positivos.
 */
import { evaluateCatalogGate } from '../src/lib/catalog/gate';
import { classifyCatalogItem } from '../src/lib/catalog/dimensions';
import { avaliarConsoleVideoGame, ehConsoleDeVideoGame, type VereditoConsole } from '../src/lib/catalog/console-videogame';

let falhas = 0;
let total = 0;
function esperar(titulo: string, preco: number | null, esperado: VereditoConsole, forte?: boolean) {
  total++;
  const r = avaliarConsoleVideoGame(titulo, preco);
  const ok = r.veredito === esperado && (forte === undefined || r.forte === forte) && ehConsoleDeVideoGame(titulo, preco) === (esperado === 'sim');
  if (!ok) {
    falhas++;
    console.error(`FALHOU [${esperado}${forte === undefined ? '' : forte ? '/forte' : '/fraco'}] ${titulo} (${preco ?? 'sem preço'}) => ${r.veredito}/${r.forte ? 'forte' : 'fraco'} ${r.motivo} ${r.termo ?? ''}`);
  }
}

// --- NEGATIVOS: os casos que apareceram na home (dono, 2026-11-13) ---
esperar('Motor 5,9v para Playstation e DVD', 4000, 'nao', true);
esperar('Frontal PS5 Slim e Fat Spider-Man 3D', 8000, 'nao', true);
esperar('Base Horizontal para Playstation 5', 5000, 'nao', true);
esperar('Motor RF-300 para robótica', 3000, 'nao', true);
esperar('10 Cartelas Abraçadeira 5 Pçs 15,8mm 5/8 Multiuso Resistente', 2490, 'nao', true);
esperar('Splatoon 3 adesivos personagens', 3000, 'nao', true);
// --- NEGATIVOS: peças/acessórios/jogos que citam a plataforma ---
esperar('GTA Placas Frontais De Reposição Para Console PlayStation 5 E PS5 Pro Slim Disc Edition', 9000, 'nao', true);
esperar('Adesivo Ps4 Slim Joker Coringa Batman', 2841, 'nao', true);
esperar('4 Grip Edição Zelda + Tela de Vidro Touch para Nintendo Switch', 9790, 'nao', true);
esperar('5 Cabos flats tipo J para PS2 Séries 90000 Slim', 4000, 'nao', true);
esperar('Acessórios para Sistema de Refrigeração / Cooler Externo a USB para PS5', 5121, 'nao', true);
esperar('Controle DualSense PS5 Branco', 45000, 'nao', true);
esperar('Sony DualSense Controle sem fio PS5', 39900, 'nao', true);
esperar('Nintendo Switch Pro Controller', 39900, 'nao', true);
esperar('Capa protetora para Nintendo Switch OLED', 4900, 'nao', true);
esperar('Suporte vertical para PS5 Slim', 9900, 'nao', true);
esperar('Cabo HDMI 2.1 para Xbox Series X', 6900, 'nao', true);
esperar('Headset Gamer para PS5 e Xbox Series', 29900, 'nao', true);
esperar('Jogo God of War Ragnarok PS5 Mídia Física', 19900, 'nao');
esperar('2K Sid Meier\'S Civilization Vii - Playstation 5', 16110, 'nao');
esperar('Mario Kart World Nintendo Switch 2', 34900, 'nao');
esperar('EA Sports FC 26 Xbox Series X', 29900, 'nao');
esperar('Revista Oficial PlayStation Brasil Nº 290 Elden Ring PS5 PS4', 3000, 'nao', true);
esperar('Chave Dag Não Dorme-Da AI: Os Arquivos Somnium PS5', 26000, 'nao');
esperar('Playstation Plus Essential 12 meses', 20000, 'nao', true);
// --- NEGATIVOS: retrô e fora de linha ---
esperar('Console Xbox One S 1TB', 150000, 'nao', true);
esperar('Xbox 360 Slim 250GB', 90000, 'nao', true);
esperar('Playstation 2 Slim Desbloqueado', 80000, 'nao', true);
esperar('Console Game Stick 10000 jogos retro', 15000, 'nao', true);
// --- NEGATIVOS por preço (aparelho citado, preço impossível) ---
esperar('Console PlayStation 5 Slim Digital 1TB', 2000, 'nao');
// --- AMBÍGUOS: vão para o dono ---
esperar('Console Híbrido Portátil Marca Desconhecida Tela 7 polegadas', 80000, 'ambiguo');
esperar('Console PlayStation 5 Slim Digital 1TB', 100000, 'ambiguo');
// --- POSITIVOS: aparelhos reais ---
esperar('Console PlayStation 5 Slim Digital 1TB Branco', 369900, 'sim');
esperar('Sony PlayStation 5 Pro 2TB Console', 649900, 'sim');
esperar('Console PS5 Slim Disco 1TB com Controle DualSense', 429900, 'sim');
esperar('Playstation 5 Slim + Jogo EA FC 26 Bundle', 459900, 'sim');
esperar('Console Xbox Series S 512GB Branco', 279900, 'sim');
esperar('Microsoft Xbox Series X 1TB Preto', 449900, 'sim');
esperar('Nintendo Switch 2 Console', 449900, 'sim');
esperar('(Nintendo Switch 2 tela LCD, 256GB) Novos, Lacrados', 432500, 'sim');
esperar('Console Nintendo Switch OLED Branco', 199900, 'sim');
esperar('Nintendo Switch Lite Azul', 159900, 'sim');
esperar('Console Nintendo Switch 32GB Neon V2', 179900, 'sim');
esperar('Steam Deck OLED 512GB', 399900, 'sim');
esperar('ASUS ROG Ally X 1TB', 599900, 'sim');
esperar('Lenovo Legion Go 512GB', 449900, 'sim');
esperar('Console PS4 Slim 1TB Novo Lacrado', 199900, 'sim');
esperar('Videogame Sony PlayStation 5 Slim', 349900, 'sim');
esperar('PS5 Slim Digital', null, 'sim');

// --- pacotes, grafias e casos de borda vistos no catálogo real ---
esperar('Bundle Nintendo Switch 2 + Mario Kart World Preto', 449900, 'sim');
esperar('Bundle GTA VI + PlayStation 5 Slim Disk Pacote Astro Bot e Gran Turismo 7', 565091, 'sim');
esperar('Pacote Playstation 5: console colorido Nba 2k26', 467357, 'sim');
esperar('Pacote de Acessórios Esportivos Com Estação Organizadora Para Console Nintendo Switch', 15279, 'nao', true);
esperar('GagaKing Pacote com 2 Volantes para Nintendo Switch 2 Joy Con', 14800, 'nao', true);
esperar('Lançamento Xbox Series X 1TB - NOVO, ORIGINAL, LACRADO! + NF', 778900, 'sim');
esperar('Microsoft Consola Xbox Series X 1TB (RRT-00010)', 807500, 'sim');
esperar('Console Mídia Física Com God Of War Ragnarok Playstation 5 Cor Branco', 529900, 'sim');
esperar('Playstation Ps5 Slim Disc de 1 TB, pacote Fortnite, console branco', 599999, 'sim');
esperar('Playstation Portal Reprodutor Remoto De 8 Lcd Ps5 Sony', 158375, 'ambiguo');
esperar('PlayStation VR2 Branco Para Playstation 5 CFI-ZVR1WX', 549900, 'nao', true);
esperar('Console Sony PlayStation CFI-2015A Slim', 349900, 'sim');
esperar('Mica para Console Nintendo Transparente Switch', null, 'nao', true);
esperar('Tela Display Lcd Para Nintendo Switch V1', 24999, 'nao', true);
esperar('Caixa De Switch Encaixável Transparente Para Nintendo 2/OLED', 13100, 'nao', true);

esperar('Console PlayStation 5 Slim 1 TB Digital Edição Limitada do 30º Aniversário', 550000, 'sim');
esperar('Xbox Serie S | 2 Controles | 500gb | Cor Branco | Bluetooth | Microsoft | Console', 499900, 'sim');
esperar('Hub USB De 6 Portas Com Luz RGB Para Console PlayStation 5 Slim/Pro', null, 'nao', true);
esperar('Console Playstation 5 Portatil 30 Anos Cinza', 199900, 'ambiguo');
esperar('Unidade de leitor de disco para console digital Sony Playstation 5 Ps5', 77999, 'nao', true);

// --- INTEGRAÇÃO: porteiro do catálogo e dimensão efetiva (tipo gravado 'console') ---
const doCatalogo = ['Motor 5,9v para Playstation e DVD', 'Frontal PS5 Slim e Fat Spider-Man 3D', 'Base Horizontal para Playstation 5', 'Motor RF-300 para robótica', '10 Cartelas Abraçadeira 5 Pçs 15,8mm 5/8 Multiuso Resistente', 'Splatoon 3 adesivos personagens', 'Console Xbox One S 1TB'];
for (const t of doCatalogo) {
  total++;
  const g = evaluateCatalogGate({ name: t, productType: 'console' });
  const d = classifyCatalogItem(t, 'console', null);
  if (g.verdict !== 'rejected' || (d.dimension === 'console' && !/xbox one/i.test(t))) {
    falhas++;
    console.error(`FALHOU porteiro/dimensão deveria barrar: ${t} => gate ${g.verdict} (${g.reason}), dimensão ${d.dimension}`);
  }
}
for (const t of ['Console PlayStation 5 Slim Digital 1TB Branco', 'Console Xbox Series S 512GB Branco', 'Nintendo Switch OLED Branco', 'Steam Deck OLED 512GB']) {
  total++;
  const g = evaluateCatalogGate({ name: t, productType: 'console' });
  const d = classifyCatalogItem(t, 'console', null);
  if (g.verdict !== 'approved' || d.dimension !== 'console') {
    falhas++;
    console.error(`FALHOU porteiro/dimensão deveria liberar: ${t} => gate ${g.verdict} (${g.reason}), dimensão ${d.dimension}`);
  }
}

console.log(`test-console-regra: ${total - falhas}/${total} ok`);
if (falhas > 0) process.exit(1);
