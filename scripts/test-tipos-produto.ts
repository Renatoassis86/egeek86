/**
 * Testes puros (sem banco, sem rede) do classificador de tipo de produto por departamento.
 * FIXTURES: títulos abaixo são EXEMPLOS DE TESTE, escritos só para exercitar as regras; não são dados de catálogo.
 * Uso: npx tsx scripts/test-tipos-produto.ts   (sai com código 1 se algo falhar)
 */
import { classificarTipo, contarTipos, normalizarTipo, normalizarTitulo, rotuloTipo, TIPOS_POR_DEPT } from '../src/lib/catalog/tipos-produto';

let fails = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (!cond) {
    fails++;
    console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}
const eq = (dept: string, titulo: string, esperado: string) => check(`${dept}: "${titulo}"`, classificarTipo(dept, titulo) === esperado, classificarTipo(dept, titulo));

// [FIXTURE] Eletrônicos
eq('eletroeletronicos', 'Smart TV Marca X 50" 4K', 'smart-tv');
eq('eletroeletronicos', 'Televisão LED 32 polegadas', 'smart-tv');
eq('eletroeletronicos', 'Cabo HDMI 2m para TV e PC', 'cabos-acessorios');
eq('eletroeletronicos', 'Soundbar 2.1 com subwoofer para Smart TV', 'soundbar');
eq('eletroeletronicos', 'Fone Ouvido Bluetooth com caixinha de carregar', 'fones');
eq('eletroeletronicos', 'Carregador USB-C 20w', 'carregadores');
eq('eletroeletronicos', 'Câmera de Segurança Wifi Externa', 'camera-seguranca');
eq('eletroeletronicos', 'Câmera Ação 4K à prova dágua', 'camera-acao');
eq('eletroeletronicos', 'Projetor Full HD portátil', 'projetor');
eq('eletroeletronicos', 'Objeto sem tipo conhecido', 'outros');
// [FIXTURE] Casa
eq('eletrodomesticos', 'Fritadeira Air Fryer Forno Oven 12L', 'air-fryer');
eq('eletrodomesticos', 'Forno Air Fryer Oven 12L', 'air-fryer');
eq('eletrodomesticos', 'Forno Elétrico de Bancada 44 litros', 'forno');
eq('eletrodomesticos', 'Geladeira Frost Free Duplex 400l', 'geladeira-freezer');
eq('eletrodomesticos', 'Freezer Horizontal 300 litros', 'geladeira-freezer');
eq('eletrodomesticos', 'Fogão 4 Bocas', 'fogao-cooktop');
eq('eletrodomesticos', 'Cooktop Indução 2 Bocas', 'fogao-cooktop');
eq('eletrodomesticos', 'Ar-condicionado Split Inverter 9000 Btus', 'ar-condicionado');
eq('eletrodomesticos', 'Máquina Lavadora de Roupas 12kg', 'lavadora-secadora');
eq('eletrodomesticos', 'Robô Aspirador', 'robo-aspirador');
eq('eletrodomesticos', 'Micro-ondas 30 Litros', 'micro-ondas');
// [FIXTURE] Tecnologia
eq('tecnologia', 'Notebook Gamer 16GB com SSD', 'notebook');
eq('tecnologia', 'SSD NVMe 1tb para notebook', 'ssd-hd');
eq('tecnologia', 'Monitor Full HD 24 polegadas', 'monitor');
eq('tecnologia', 'Placa de Vídeo RTX 5060 8GB', 'placa-de-video');
eq('tecnologia', 'Mouse Gamer sem fio', 'mouse');
eq('tecnologia', 'Teclado Mecânico RGB', 'teclado');
eq('tecnologia', 'Headset Gamer com fio', 'headset');
// [FIXTURE] Esporte
eq('esporte', 'Raquete Tênis Adulto', 'raquete');
eq('esporte', 'Bola Futebol Campo', 'bola');
eq('esporte', 'Esteira Ergométrica Elétrica', 'esteira-eliptico');
eq('esporte', 'Tênis de corrida masculino', 'tenis-corrida');
eq('esporte', 'Bicicleta Aro 29 21 Marchas', 'bicicleta');
eq('esporte', 'Halter Emborrachado 10kg', 'halter-peso');
// [FIXTURE] Impressão 3D
eq('impressao3d', 'Filamento PLA 1kg 1.75mm para impressora 3D', 'filamentos');
eq('impressao3d', 'Resina para Impressora 3D 1kg', 'resinas');
eq('impressao3d', 'Impressora 3D FDM Autolevel', 'impressoras');
eq('impressao3d', 'Bico Nozzle 0.4mm', 'pecas');
// [FIXTURE] Livros
eq('livros', 'Pathfinder RPG Livro de Regras', 'rpg');
eq('livros', 'Introdução à Programação com Python', 'programacao');
eq('livros', 'Título sem assunto reconhecível', 'outros');
// [FIXTURE] regexes frágeis corrigidos (ata 2026-11-12, R7)
eq('esporte', 'Protetor Solar FPS 60 Esportivo', 'outros');
eq('esporte', 'Protetor Bucal Esportivo Boxe', 'protecao');
eq('esporte', 'Protetor de Canela Futebol', 'protecao');
eq('esporte', 'Saco de Pancada Boxe 90cm', 'artes-marciais');
eq('esporte', 'Saco de Dormir Termico', 'camping');
eq('esporte', 'Mala de Academia Esportiva 40L', 'bolsas-mochilas');
eq('esporte', 'Mala de Viagem Rigida 20kg', 'outros');
eq('eletrodomesticos', 'Ferro de Passar a Vapor 1200w', 'ferro-passar');
eq('eletrodomesticos', 'Ferro de Solda 60w', 'outros');
eq('eletroeletronicos', 'Capa para Kindle 11 geracao', 'cabos-acessorios');
eq('tecnologia', 'Kindle 11 geracao com capa', 'tablet-leitor');
eq('tecnologia', 'Smartphone Samsung Galaxy A16 128gb', 'celular');
eq('tecnologia', 'Smartwatch Amazfit Bip 5', 'relogios');
eq('eletroeletronicos', 'Smart TV 50 4K com suporte de parede', 'smart-tv');
eq('eletroeletronicos', 'Soundbar Premium com capa de protecao', 'soundbar');
eq('eletroeletronicos', 'Suporte de Parede para TV 32 a 65', 'cabos-acessorios');
eq('impressao3d', 'Mesa de Escritorio Gamer', 'outros');
eq('impressao3d', 'Mesa Aquecida Magnetica Ender 3', 'pecas');
eq('impressao3d', 'Fita de Enfeite Decorativa', 'outros');
eq('impressao3d', 'Fita Kapton 20mm', 'pecas');
// Departamento sem lista => outros
eq('games', 'Smart TV', 'outros');

// Normalização
check('normaliza acento, caixa e pontuação', normalizarTitulo('Ar-Condicionado Çá!') === ' ar condicionado ca ', normalizarTitulo('Ar-Condicionado Çá!'));

// Contagem: só tipos com produto, decrescente, 'outros' por último
const c = contarTipos('eletroeletronicos', ['Smart TV A', 'Smart TV B', 'Soundbar C', 'Coisa X']);
check('contagem só com produtos', c.map((x) => x.slug).join(',') === 'smart-tv,soundbar,outros', c);
check('contagem soma = total', c.reduce((a, x) => a + x.n, 0) === 4);
check('sem títulos => sem tipos', contarTipos('esporte', []).length === 0);

// Parâmetro da URL
check('tipo válido', normalizarTipo('eletroeletronicos', 'smart-tv') === 'smart-tv');
check('tipo válido em caixa alta', normalizarTipo('eletroeletronicos', 'Smart-TV') === 'smart-tv');
check('tipo de outro departamento é recusado', normalizarTipo('esporte', 'smart-tv') === null);
check('tipo lixo é recusado', normalizarTipo('esporte', "bola'; drop table") === null);
check('tipo não-string é recusado', normalizarTipo('esporte', ['bola']) === null);
check('outros é aceito', normalizarTipo('esporte', 'outros') === 'outros');
check('rótulo de tipo', rotuloTipo('eletroeletronicos', 'smart-tv') === 'Smart TV');

// [FIXTURE] Ciência e tecnologia industrial (#60)
eq('tecnologia', 'Microscópio Biológico Binocular 1600x', 'instrumentos-opticos');
eq('tecnologia', 'Telescópio Refrator 70mm com Tripé', 'instrumentos-opticos');
eq('tecnologia', 'Multímetro Digital True RMS', 'medicao-eletrica');
eq('tecnologia', 'Fonte de Bancada Ajustável 30V 10A', 'medicao-eletrica');
eq('tecnologia', 'Osciloscópio Digital 2 Canais 100MHz', 'medicao-eletrica');
eq('tecnologia', 'Paquímetro Digital 150mm Inox', 'medicao-precisao');
eq('tecnologia', 'Termômetro Infravermelho Laser Industrial', 'medicao-precisao');
eq('tecnologia', 'Arduino Uno R3 Original', 'prototipagem');
eq('tecnologia', 'Raspberry Pi 5 8GB', 'prototipagem');
eq('tecnologia', 'Estação de Solda Digital 936 com Ar Quente', 'estacao-solda');
eq('tecnologia', 'Scanner 3D Portátil Revopoint', 'fabricacao-digital');
eq('tecnologia', 'Gravadora a Laser 40W Atomstack', 'fabricacao-digital');
eq('tecnologia', 'Máquina CNC 3018 Router', 'fabricacao-digital');
eq('tecnologia', 'Cricut Maker 3 Plotter de Recorte', 'fabricacao-digital');
eq('tecnologia', 'NAS Synology 2 baias DS224+', 'nas-servidor');
eq('tecnologia', 'Scanner de Mesa Epson A4', 'scanner');
eq('tecnologia', 'Fonte ATX 750W 80 Plus Gold', 'placa-mae-gabinete');
eq('tecnologia', 'Smartphone Galaxy A55 128GB nas cores preto', 'celular');
// [FIXTURE] R-108 (2026-11-20, variedade): tipos novos que antes caiam em 'outros' ou dentro de um tipo grande (um turno só no rodízio)
eq('eletrodomesticos', 'Aspirador de Pó Vertical Sem Fio Wap Ciclone', 'aspirador-sem-fio');
eq('eletrodomesticos', 'Aspirador de Pó Sem Fio Dyson V8', 'aspirador-sem-fio');
eq('eletrodomesticos', 'Aspirador de Pó Electrolux 1400w', 'aspirador');
eq('eletrodomesticos', 'Aspirador de Pó Robô Xiaomi Robot Vacuum', 'robo-aspirador');
eq('eletrodomesticos', 'Extratora Portátil Spot Cleaner W3 WAP', 'extratora-limpeza');
eq('eletrodomesticos', 'Panela Elétrica de Arroz Mondial 10 Xícaras', 'panela-eletrica');
eq('eletrodomesticos', 'Sanduicheira Grill Mondial Premium', 'sanduicheira-grill');
eq('eletrodomesticos', 'Chaleira Elétrica Oster 1,7L', 'chaleira-eletrica');
eq('eletrodomesticos', 'Cafeteira Expresso Nespresso Vertuo', 'cafeteira');
eq('eletrodomesticos', 'Máquina de Pão Britânia Padeira', 'maquina-pao');
eq('eletrodomesticos', 'Batedeira Planetária Philco 5L', 'batedeira');
eq('eletrodomesticos', 'Liquidificador Oster 1400w', 'liquidificador');
eq('eletrodomesticos', 'Processador de Alimentos Philips Walita', 'processador-alimentos');
eq('eletrodomesticos', 'Espremedor de Frutas Mondial', 'espremedor-suco');
eq('eletrodomesticos', 'Coifa de Parede 60cm Electrolux', 'coifa-depurador');
eq('eletrodomesticos', 'Fogão 5 Bocas Consul', 'fogao-cooktop');
eq('eletrodomesticos', 'Umidificador de Ar Ultrassônico', 'umidificador');
eq('eletrodomesticos', 'Purificador de Ar Philips com Filtro HEPA', 'purificador');
eq('eletrodomesticos', 'Climatizador Evaporativo Ventisol', 'climatizador');
eq('eletrodomesticos', 'Ar Condicionado Portátil 12000 Btus', 'climatizador');
eq('eletrodomesticos', 'Ar Condicionado Split Inverter 12000 Btus', 'ar-condicionado');
eq('eletrodomesticos', 'Adega Climatizada 12 Garrafas Dako', 'adega-cervejeira');
eq('eletrodomesticos', 'Frigobar 120L Consul', 'geladeira-freezer');
eq('eletrodomesticos', 'Vaporizador de Roupas Portátil Mondial', 'vaporizador-roupas');
eq('eletrodomesticos', 'Balança Digital Corporal Bioimpedância Xiaomi', 'balanca-digital');
eq('eletrodomesticos', 'Ventilador de Teto Ventisol 3 Pás', 'ventilador-teto');
eq('esporte', 'Bola de Basquete Spalding TF-1000', 'bola-quadra');
eq('esporte', 'Bola de Vôlei Mikasa V200W', 'bola-quadra');
eq('esporte', 'Bola de Futebol Campo Penalty', 'bola');
eq('esporte', 'Bola de Pilates 65cm com Bomba', 'bola-pilates');
eq('esporte', 'Chuteira Society Nike', 'chuteira');
eq('esporte', 'Chinelo Slide Havaianas', 'chinelo-sandalia');
eq('esporte', 'Tênis Casual Masculino Olympikus', 'tenis-calcado');
eq('esporte', 'Kimono Jiu Jitsu Koral Trançado', 'artes-marciais');
eq('esporte', 'Luva de Boxe Everlast 12oz', 'artes-marciais');
eq('esporte', 'Cama Elástica 305 Bel Fix', 'cama-elastica');
eq('esporte', 'Jaqueta Corta Vento Nike', 'jaqueta-esportiva');
eq('esporte', 'Rede de Vôlei Oficial 9,5m', 'rede-quadra');
eq('esporte', 'Tabela de Basquete Infantil Ajustável', 'rede-quadra');
eq('esporte', 'Raquete de Badminton Yonex', 'badminton');
eq('esporte', 'Raquete de Ping Pong Butterfly', 'tenis-de-mesa');
eq('esporte', 'Raquete de Beach Tennis Wilson', 'raquete-beach-tennis');
eq('esporte', 'Raquete de Tênis Head Gravity', 'raquete');
eq('esporte', 'Barraca de Camping 4 Pessoas Nautika', 'camping');
eq('esporte', 'Bastão de Caminhada Trekking Dobrável', 'trilha-camping');
eq('esporte', 'Skate Completo Iniciante Maple', 'skate');
eq('esporte', 'Patins Inline Oxer Ajustável', 'patins');
eq('esporte', 'Patinete Elétrico Xiaomi', 'patinete');
eq('esporte', 'Capacete de Ciclismo MTB Absolute', 'ciclismo-capacete-roupa');
eq('esporte', 'Bicicleta Aro 29 Caloi', 'bicicleta');
eq('eletroeletronicos', 'Fone de Ouvido Bluetooth TWS JBL Wave', 'fones-tws');
eq('eletroeletronicos', 'Fone de Ouvido Bluetooth Sony WH-1000XM5', 'fones');
eq('eletroeletronicos', 'Caixa de Som Amplificada JBL Partybox 110', 'caixa-amplificada');
eq('eletroeletronicos', 'Caixa de Som Bluetooth JBL Flip 6', 'caixa-de-som');
eq('eletroeletronicos', 'Gimbal DJI Osmo Mobile 6', 'gimbal');
eq('eletroeletronicos', 'Lente Canon EF 50mm f/1.8', 'lente-camera');
eq('eletroeletronicos', 'Lente de Contato Colorida', 'outros');
eq('eletroeletronicos', 'Rádio Portátil AM FM Philco', 'radio-portatil');
eq('eletroeletronicos', 'Babá Eletrônica com Câmera Motorola', 'baba-eletronica');
eq('eletroeletronicos', 'Smart TV 55 Polegadas Samsung 4K', 'smart-tv');
eq('livros', 'Naruto Gold Vol. 1 Panini', 'manga');
eq('livros', 'Mangá Jujutsu Kaisen Vol 3', 'manga');
eq('livros', 'HQ Batman Ano Um Panini', 'hq-manga');
eq('livros', 'Harry Potter e a Pedra Filosofal', 'fantasia-ficcao');
eq('livros', 'A Paciente Silenciosa Suspense', 'policial-suspense');
eq('livros', 'Diário de um Banana Vol 1', 'infantojuvenil');
eq('livros', 'Bíblia de Estudo NVI Capa Dura', 'biblia-teologia');
eq('livros', 'Pai Rico, Pai Pobre', 'financas-negocios');
eq('livros', 'Dom Casmurro Machado de Assis', 'classicos');
eq('livros', 'Sapiens Uma Breve História da Humanidade', 'biografia-ciencia');
eq('livros', 'Design Gráfico Fundamentos', 'artes-design');
eq('livros', 'Romance de Época Contemporâneo', 'romance');
eq('beleza', 'Protetor Solar Facial FPS 60 Bioré', 'protetor-solar');
eq('beleza', 'Secador de Cabelo Taiff 2000w', 'secador-prancha');
eq('beleza', 'Prancha Alisadora Babyliss', 'secador-prancha');
eq('beleza', 'Barbeador Elétrico Philips Série 5000', 'barbeador-aparador');
eq('beleza', 'Shampoo Tsubaki Premium Repair 450ml', 'shampoo-condicionador');
eq('beleza', 'Máscara Capilar Kérastase Nutritive', 'cabelo');
eq('beleza', 'Perfume Dior Sauvage Eau de Toilette Masculino', 'perfume-masculino');
eq('beleza', 'Perfume Carolina Herrera Good Girl Feminino', 'perfume-feminino');
eq('beleza', 'Perfume Importado Coleção Árabe', 'perfumaria');
eq('beleza', 'Hidratante Corporal Nivea Body Milk', 'hidratante-corporal');
// Integridade: slugs únicos por departamento, nenhum chamado 'outros'
for (const [d, defs] of Object.entries(TIPOS_POR_DEPT)) {
  const slugs = defs.map((x) => x.slug);
  check(`slugs únicos em ${d}`, new Set(slugs).size === slugs.length);
  check(`sem slug 'outros' em ${d}`, !slugs.includes('outros'));
}

if (fails) {
  console.log(`${fails} falha(s)`);
  process.exit(1);
}
console.log('OK: classificador de tipos');
