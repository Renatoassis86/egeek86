/**
 * Teste da REGRA ÚNICA de item miúdo (src/lib/catalog/item-miudo.ts). Roda sem banco: npx tsx scripts/test-item-miudo.ts
 * Negativos: os casos reais do dono (2026-11-13: peças, cabos, grips, objetos de impressão 3D). Positivos: produto principal de cada departamento,
 * incluindo filamento, impressora 3D, livro barato e jogo barato (preço sozinho nunca decide).
 */
import { avaliarItemMiudo, ehItemMiudo, ehItemMiudoOuDuvida, type VereditoMiudo } from '../src/lib/catalog/item-miudo';
import { evaluateCatalogGate } from '../src/lib/catalog/gate';
import { classifyCatalogItem } from '../src/lib/catalog/dimensions';

let falhas = 0;
let total = 0;
function esperar(vertical: string, tipo: string, titulo: string, preco: number | null, esperado: VereditoMiudo) {
  total++;
  const r = avaliarItemMiudo(titulo, preco, tipo, vertical);
  const ok =
    r.veredito === esperado &&
    ehItemMiudo(titulo, preco, tipo, vertical) === (esperado === 'sim') &&
    ehItemMiudoOuDuvida(titulo, preco, tipo, vertical) === (esperado !== 'nao');
  if (!ok) {
    falhas++;
    console.error(`FALHOU [${esperado}] ${vertical}/${tipo} ${titulo} (${preco ?? 'sem preço'}) => ${r.veredito} ${r.motivo} ${r.termo ?? ''}`);
  }
}
const G = 'games';

// --- NEGATIVOS: games (grips, cabos, peças, bases, dock, carregador, adaptador, decoração) ---
esperar(G, 'accessory', 'Par de Grip Silicone Cor Solida Para Controles PS5/ PS4/ XBOX/ SERIES/ SWITCH 2', 500, 'sim');
esperar(G, 'accessory', '2 Pares 4 Unidades De Grip Borracha de Silicone Para Analógicos de Controles de PS5, PS4', 1300, 'sim');
esperar(G, 'accessory', 'Grip Thumb Stick PS4 PS5 Switch 2 Xbox Silicone Antiderrapante 2 Un', 1200, 'sim');
esperar(G, 'accessory', 'Cabo Carregador Controle PS4 DualShock 4 KNUP Micro USB V8 1,5m Dados e Carga', 1200, 'sim');
esperar(G, 'accessory', 'Cabo De Alimentação Energia E Força Para Ps3 E Ps4 Original', 800, 'sim');
esperar(G, 'accessory', 'Cabo Hdmi 4k 1m 2m 3m 2.0 Ultrahd 120hz Ps5 Ps4 Xbox Premium compacto Banhando a Ouro', 3100, 'sim');
esperar(G, 'accessory', 'Parafusos Em Forma De Y Para Console De Jogos , Controlador De Parafuso Nintendo Switch OLED', 1400, 'sim');
esperar(G, 'accessory', 'Adaptador P3 Para P2 Controle Xbox Ps4 Microfone Celular Cor Preto', 1400, 'sim');
esperar(G, 'accessory', 'Conector P2 do Controle do Xbox One S e Series Entrada / Saida De Audio Original', 1500, 'sim');
esperar(G, 'accessory', 'Base Carregador Controle Xbox Series S X Branco 2 Baterias', 10200, 'sim');
esperar(G, 'accessory', 'Dock Nintendo Switch Adaptador Portátil HDMI USB', 5900, 'sim');
esperar(G, 'accessory', 'Base Horizontal para Playstation 5', 5000, 'sim');
esperar(G, 'accessory', 'Carregador Duplo Para Controle Ps5 Com Indicador De Carga', 8700, 'sim');
esperar(G, 'accessory', 'Bateria Recarregável para Controle X-Box Series S/X Com Cabo USB-C 3M de Nylon', 6300, 'sim');
esperar(G, 'accessory', 'DPAD para controle Nintendo Switch joy-con joycon d pad', 600, 'sim');
esperar(G, 'accessory', 'Joy-Con Strap NINTENDO SWITCH', 11700, 'sim');
esperar(G, 'accessory', 'Porta Controle XBOX/PS5 DualSense | Organizador para 2 Controles', 3000, 'sim');
esperar(G, 'accessory', 'Kontrol Freek Fps Tmartn Signature Edition Para Controle de Xbox One e Series S/X', 4000, 'sim');
esperar(G, 'game', 'letreiro gamer GTA 6 , rockstar, grand theft auto, enfeite de mesa, Vice City, PS5', 4700, 'sim');
esperar(G, 'game', 'Expositor de Cartuchos Nintendo Switch com Capacidade 12 ou 24 Jogos', 1600, 'sim');
esperar(G, 'game', 'Stand Nintendo Switch (Todas as Versões)', 3000, 'sim');
esperar(G, 'game', 'Splatoon 3 adesivos personagens', 3000, 'sim');
esperar(G, 'console', 'Motor 5,9v para Playstation e DVD', 4000, 'sim');
esperar(G, 'console', 'Base Horizontal para Playstation 5', 5000, 'sim');
// --- NEGATIVOS: demais departamentos ---
esperar('eletroeletronicos', 'general', 'Syncwire SW-HD075 Cabo HDMI 4K Cabo HDMI 2.0 Cabo HDMI de alta velocidade de 10 pés', 800, 'sim');
esperar('eletroeletronicos', 'general', 'Carregador Usb-c Ec 10 Power 20w Intelbras Branco', 4500, 'sim');
esperar('eletroeletronicos', 'general', 'Hub USB 3.0 (4 Portas) Expansor até 5Gbps', 1900, 'sim');
esperar('impressao3d', 'general', '10 pçs/lote Ferramenta de limpeza de bocal de impressora 3D - Peças de impressora 0,15 0,2 0,25', 1800, 'sim');
esperar('impressao3d', 'general', 'Kit de Ferramentas de Rebarbação com 10 Lâminas e 6 Limas para Impressora 3D', 13200, 'sim');
esperar('impressao3d', 'general', 'Bico Nozzle 0.4mm latão para impressora 3D Ender 3', 1500, 'sim');
esperar('impressao3d', 'general', 'Miniatura impressa em 3D dragão articulado', 4500, 'sim');
esperar('impressao3d', 'general', 'Suporte de filamento para impressora 3D impresso em 3D', 2500, 'sim');
esperar('eletrodomesticos', 'general', 'Resistência para chuveiro Lorenzetti 220V peça de reposição', 3000, 'sim');
esperar('eletrodomesticos', 'general', 'Refil filtro de água para purificador Electrolux', 5500, 'sim');
esperar('esporte', 'general', 'Suporte organizador de barras e anilhas, aço', 17400, 'sim');
esperar('livros', 'general', 'Caderno Brochura Tilibra 96 folhas', 1500, 'sim');
// --- AMBÍGUOS (fora do site até o dono decidir; nunca aprovados automaticamente) ---
esperar('tecnologia', 'general', 'Mouse Pad Grande 90x40 cm com Base Antiderrapante', 2100, 'ambiguo');
esperar('tecnologia', 'general', 'Pen Drive Cruzer Blade, SanDisk, 64GB', 6000, 'ambiguo');
esperar('esporte', 'general', 'Garrafa Squeeze TIBA Fun 300 ml', 1100, 'ambiguo');
esperar('esporte', 'general', 'Corda de Pular de PVC', 1000, 'ambiguo');
esperar('esporte', 'general', 'Vitamina B12 60 cápsulas', 2300, 'ambiguo');
esperar('eletroeletronicos', 'general', 'Power Bank Portátil 10000mah Usb', 2500, 'ambiguo');
esperar(G, 'accessory', 'Acessório sem nome claro para o seu videogame', 3000, 'ambiguo');
// --- POSITIVOS: produto principal de cada departamento (preço sozinho nunca decide) ---
esperar(G, 'game', 'God of War III', 1000, 'nao');
esperar(G, 'game', 'Resident Evil Village - PS5 Mídia Física', 2300, 'nao');
esperar(G, 'console', 'Console PlayStation 5 Slim Digital 1TB', 330000, 'nao');
esperar(G, 'console', 'Xbox Series S 512GB', 220000, 'nao');
esperar(G, 'console', 'Deracine: Playstation Vr - Playstation 4', 26000, 'nao');
esperar('eletroeletronicos', 'general', 'Carregador Portátil Power Bank 20000mah Multi - Cb174 Preto', 21800, 'nao');
esperar(G, 'accessory', 'Controle sem fio PlayStation DualSense Branco', 41600, 'nao');
esperar(G, 'accessory', 'Controle Xbox Wireless Controller Electric Volt para Xbox Series X e Windows', 46000, 'nao');
esperar(G, 'accessory', 'Headset Gamer Redragon Zeus Lite Preto P3 H510-LT', 13000, 'nao');
esperar(G, 'accessory', 'Volante Gamer NBCP R808B de 1080° com Caixa de Marchas e Pedais para PC PS4 Xbox', 109400, 'nao');
esperar(G, 'accessory', 'Controle Ps5 com Grip 2 Paddles (Black)', 70500, 'nao');
esperar(G, 'accessory', 'Pro Controller Nintendo Switch Zelda Controle Sem Fio Linha Premium', 16600, 'nao');
esperar('impressao3d', 'general', 'Filamento PETG Masterprint de 1.75mm e 1kg', 5700, 'nao');
esperar('impressao3d', 'general', 'Filamento PLA SILK Masterprint 1.75mm Brilhante 1kg', 8900, 'nao');
esperar('impressao3d', 'general', 'Filamento Pla 1kg 1,75mm Impressão 3D Para Impressora 3D', 6000, 'nao');
esperar('impressao3d', 'general', 'SUNLU Resina padrão, resina de cura de luz UV de 405 nm para impressora LCD 3D', 9900, 'nao');
esperar('impressao3d', 'general', 'Impressora 3D Creality K1 Max 30x30x30cm 600mm/s', 499900, 'nao');
esperar('impressao3d', 'general', 'Impressora 3d Elegoo Neptune 4 Kliper Firmware com bico e mesa aquecida', 230900, 'nao');
esperar('livros', 'general', 'Tormenta Rpg - So Aventuras - Vol.4', 1100, 'nao');
esperar('livros', 'general', 'Memórias do subsolo', 1500, 'nao');
esperar('livros', 'general', 'Livro Caderno de Receitas da Vovó, de Maria Souza, Editora Globo', 2900, 'nao');
esperar('tecnologia', 'general', 'Mouse Gamer Redragon Cobra V3, RGB, PMW3327, 10000 DPI', 8500, 'nao');
esperar('tecnologia', 'general', 'Fonte ATX 200W PWS-2003 20+4P FK420P Fortrek', 5100, 'nao');
esperar('tecnologia', 'general', 'Switch Gigabit MS105G Mercusys de 5 portas Ethernet RJ45', 6000, 'nao');
esperar('tecnologia', 'general', 'Notebook Lenovo IdeaPad 15 com mouse e mochila', 250000, 'nao');
esperar('eletrodomesticos', 'general', 'Chaleira Elétrica 2 Litros 220V 1500W em Aço Inox, Base Giratória 360°', 3100, 'nao');
esperar('eletrodomesticos', 'general', 'Electrolux Ferro de passar seco e vapor, base antiaderente, cabo 1,35m', 8000, 'nao');
esperar('eletrodomesticos', 'general', 'Air Fryer Oven 12L 1200W 3 em 1 Mini Forno Elétrico 220V', 26500, 'nao');
esperar('eletroeletronicos', 'general', 'Smart TV 50 polegadas 4K com controle remoto e suporte de mesa', 180000, 'nao');
esperar('eletroeletronicos', 'general', 'Fone de Ouvido Bluetooth Sem Fio com cabo USB-C e estojo', 2000, 'nao');
esperar('eletroeletronicos', 'general', 'Caixa de Som Bluetooth JBL Flip 6', 80000, 'nao');
esperar('esporte', 'general', 'Tênis Nike Revolution 7 Masculino', 29900, 'nao');
esperar('esporte', 'general', 'Bola Futebol Campo cor07', 2500, 'nao');
esperar('esporte', 'general', 'Canivete Tático 16cm Compacto Aço Inoxidável Cabo Antiderrapante', 1700, 'nao');
esperar('esporte', 'general', 'Bicicleta Aro 29 com motor elétrico 350W', 500000, 'nao');

// --- INTEGRAÇÃO com o porteiro: item miúdo inequívoco nunca é aprovado ---
{
  const g = evaluateCatalogGate({ name: 'Par de Grip Silicone Para Controles PS5 PS4 XBOX', productType: 'accessory', medianPriceCents: 500 });
  total++;
  if (g.verdict !== 'rejected' || !g.reason.startsWith('item_miudo')) {
    falhas++;
    console.error(`FALHOU porteiro: grip => ${g.verdict} ${g.reason}`);
  }
  const ok = evaluateCatalogGate({ name: 'Controle sem fio PlayStation DualSense Branco', productType: 'accessory', medianPriceCents: 41600 });
  total++;
  if (ok.verdict === 'rejected') {
    falhas++;
    console.error(`FALHOU porteiro: controle legítimo rejeitado (${ok.reason})`);
  }
  const d = classifyCatalogItem('Cabo Carregador Controle PS4 DualShock 4 KNUP Micro USB', 'accessory');
  total++;
  if (!String(d.reason ?? '').startsWith('item_miudo')) {
    falhas++;
    console.error(`FALHOU dimensions: cabo deveria sair da cartela (${d.dimension} ${d.reason})`);
  }
}

console.log(`${total - falhas}/${total} casos`);
process.exit(falhas === 0 ? 0 : 1);
