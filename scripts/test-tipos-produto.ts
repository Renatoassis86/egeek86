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
eq('eletrodomesticos', 'Robô Aspirador', 'aspirador');
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
eq('esporte', 'Tênis de corrida masculino', 'tenis-calcado');
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
eq('esporte', 'Saco de Pancada Boxe 90cm', 'fitness');
eq('esporte', 'Saco de Dormir Termico', 'outros');
eq('esporte', 'Mala de Academia Esportiva 40L', 'bolsas-mochilas');
eq('esporte', 'Mala de Viagem Rigida 20kg', 'outros');
eq('eletrodomesticos', 'Ferro de Passar a Vapor 1200w', 'ferro-passar');
eq('eletrodomesticos', 'Ferro de Solda 60w', 'outros');
eq('eletroeletronicos', 'Capa para Kindle 11 geracao', 'cabos-acessorios');
eq('eletroeletronicos', 'Kindle 11 geracao com capa', 'tablet-leitor');
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
