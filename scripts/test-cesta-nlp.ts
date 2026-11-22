/**
 * R-115: testes puros da modelagem de cesta por modelo (NLP leve). Sem banco, sem rede.
 * Casos rotulados à mão em 4 amostras sorteadas (console/Switch, impressora 3D, fone, TV, notebook/mouse, livro, air fryer):
 * scripts/fixtures-cesta-nlp/casos-rotulados.json. Metas: nenhuma fusão errada entre os pares marcados como iguais (precisão >= 0,97),
 * nenhum par diferente aplicável (>= 0,97) e equivalência (o que já está certo não muda).
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Motor, extrairAtributos, julgarAtributos, cestaNlpModo, LIMIAR_APLICAR, conflitosEntre } from '../src/lib/catalog/cesta-nlp';

let ok = 0;
const t = (nome: string, f: () => void) => { f(); ok++; console.log('  ok', nome); };
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures-cesta-nlp', 'casos-rotulados.json'), 'utf8')) as {
  fusao: Array<{ tipo: string; master: string; oferta: string; igual: boolean }>;
  divisao: Array<{ tipo: string; a: string; b: string; igual: boolean }>;
};
const motor = new Motor([...fx.fusao.flatMap((c) => [c.master, c.oferta]), ...fx.divisao.flatMap((c) => [c.a, c.b])]);
const duro = (m: string, o: string) => julgarAtributos(motor.atributos(o), motor.atributos(m), motor.indice).conflitos.some((c) => c.duro);
const eixos = (m: string, o: string) => julgarAtributos(motor.atributos(o), motor.atributos(m), motor.indice).conflitos.filter((c) => c.duro).map((c) => c.eixo);

console.log('Atributos');
t('voltagem 110 x 220 separa (decisão do dono)', () => {
  assert.deepEqual(extrairAtributos('Impressora 3D Bambu Lab P2S Combo 110V').voltagens, ['110']);
  assert.deepEqual(extrairAtributos('Impressora 3D Bambu Lab P2SC - P2S + AMS (Combo) - 220V').voltagens, ['220']);
  assert.ok(eixos('Impressora 3D Bambu Lab P2S Combo 110V', 'Impressora 3D Bambu Lab P2SC - P2S + AMS (Combo) - 220V').includes('voltagem'));
});
t('127V e 110V são o mesmo lado da rede', () => {
  assert.ok(!duro('Impressora 3D Bambu Lab P2S Combo 127V', 'Impressora 3D Bambu Lab P2S Combo 110V'));
});
t('cor junta', () => {
  assert.ok(!duro('Console Nintendo Switch Lite 32gb Azul Turquesa', 'Console Portátil Nintendo Switch Lite de 32 GB, Cinza'));
  assert.ok(!duro('Headset Gamer Sem Fio Logitech G522 LIGHTSPEED - Branco', 'Headset Gamer Sem Fio Logitech G G522 LIGHTSPEED, Preto'));
});
t('capacidade do PS5 não separa (825GB = 1TB, decisão 2026-11-03); Slim x Pro separa', () => {
  assert.ok(!duro('Console PlayStation 5 Slim Digital', 'Console PlayStation® 5 Slim Edição Digital 825 GB Branco - Sony'));
  assert.ok(!duro('Console PlayStation 5 Slim Digital 825GB', 'Console PlayStation 5 Slim Digital 1TB'));
  assert.ok(duro('Console PlayStation 5 Slim Digital', 'Console PlayStation 5 Pro 2TB'));
});
t('capacidade de outros aparelhos separa (Xbox, celular)', () => {
  assert.ok(duro('Smartphone Samsung Galaxy A56 5G 256GB 8GB RAM', 'Smartphone Samsung Galaxy A56 5G 128GB 8GB RAM'));
  assert.ok(duro('Tablet Xiaomi Redmi Pad 2 (256) - Versão Global', 'Tablet Xiaomi Redmi Pad 2 (128) - Versão Global'));
});
t('polegadas e código de TV separam', () => {
  assert.ok(duro('Smart TV Samsung 55" Mini LED 4K M75H', 'Samsung Smart TV 65" Mini LED 4K M75H'));
  assert.ok(duro('Smart TV TCL 85" QLED 4K P7K', 'Smart TV TCL 85 Polegadas QLED 4K P8L 85P8L'));
  assert.ok(!duro('Smart TV Samsung UN50DU7700GXZD 50" 4K Crystal', 'Samsung Smart TV 50" UHD 4K 50DU7700 - Processador Crystal 4K'));
});
t('acessório/peça nunca entra na cesta do console ou do aparelho', () => {
  assert.ok(eixos('Console PlayStation 5 Slim Digital', 'Escudo Anti-Poeira para PS5 Slim com Plugues de Silicone e Rede de Malha para Console Digital/Disco').includes('papel'));
  assert.ok(eixos('Impressora 3d Bambu Lab X2d', 'Filtro de Ar Ultra HEPA H13 com Carvão Ativado para Impressoras 3D Bambu Lab X2D').includes('papel'));
  assert.ok(duro('Fritadeira Air Fryer Mondial Oven Digital 127v', 'MOTOR 127V 35W FRITADEIRA AIR FRYER MONDIAL'));
});
t('combo/bundle x avulso separa', () => {
  assert.ok(duro('Impressora 3d Bambu Lab A1', 'Impressora 3d Bambu Lab A1 Combo'));
  assert.ok(!duro('Impressora 3d - Bambu Lab A1 Combo', 'Bambu Lab A1 Combo Ams Lite Impressora 3d'));
  assert.ok(!duro('Impressora 3d Fdm Aberta A1 Bambu Lab Sem AMS', 'Impressora 3d Bambu Lab A1'));
});
t('região/importado separa; "PaL" (marca/cor) não é região', () => {
  assert.ok(duro('Impressora 3D Bambu Lab P2S Combo', 'Impressora 3D Bambu Lab P2S Combo 110V Plug EU Cinza'));
  assert.ok(!duro('Filamento PLA 1.75mm 1kg - Printalot', 'Filamento PLA Azul PaL 1,75mm 1Kg - PrintaLot'));
});
t('código de modelo curto e variante separam (Galaxy A17 x A56; S25+ x S25 Edge; Tune Buds x Tune Flex)', () => {
  assert.ok(duro('Celular Samsung Galaxy A56 5g Preto', 'Celular Samsung Galaxy A17 5G, 128GB, 4GB, 50MP'));
  assert.ok(duro('Samsung Galaxy S25+ 512GB, 12GB', 'Samsung Galaxy S25 Edge 5G, 512GB, 12GB'));
  assert.ok(duro('Fone De Ouvido JBL Tune Buds Sem Fio', 'JBL, Fone de Ouvido Bluetooth, Tune Flex 2, Sem Fio'));
});
t('jogo: sequência e plataforma separam (Resident Evil 7 x 4; PS4 x PS5)', () => {
  assert.ok(duro('Resident Evil 4 Gold Edition Ps5 Fisico', 'Resident Evil 7 Gold Edition Ps5 Lacrado'));
  assert.ok(duro('Resident Evil 4 Mídia Física Para PS4/PS5', 'Resident Evil 4 Jogo PS5'));
  assert.ok(!duro('Final Fantasy VII Intergrade PS5 Midia Fisica', 'Final Fantasy 7 Vii Intergrade Ps5 Midia Fisica Lacrado'));
});
t('Open Box/vitrine/desbloqueado = não novo', () => {
  assert.equal(extrairAtributos('Console PS5 Open Box').naoNovo, true);
  assert.equal(extrairAtributos('Nintendo Switch OLED Desbloqueado Tinfoil').naoNovo, true);
  assert.equal(extrairAtributos('Console PlayStation 5 Slim Digital').naoNovo, false);
});
t('pack e medida separam', () => {
  assert.ok(duro('Bola de Vôlei Mikasa V360W', 'Kit 3 Bolas de Vôlei Mikasa V360W'));
  assert.ok(duro('Filamento PLA 1kg Voolt3D', 'Filamento PLA 500g Voolt3D'));
});
t('livro: ISBN igual é evidência forte; ISBN diferente separa', () => {
  const j = julgarAtributos(extrairAtributos('Livro Dom Casmurro ISBN 9788535902778'), extrairAtributos('Dom Casmurro 978-85-359-0277-8'), motor.indice);
  assert.ok(j.conflitos.every((c) => c.eixo !== 'isbn'));
  assert.ok(conflitosEntre(extrairAtributos('Livro X ISBN 9788535902778'), extrairAtributos('Livro X ISBN 9788532530787')).conflitos.some((c) => c.eixo === 'isbn' && c.duro));
});

console.log('Fusão (oferta x produto da cesta), casos rotulados à mão');
let tp = 0, fp = 0, fn = 0, tn = 0;
const falsos: string[] = [];
for (const c of fx.fusao) {
  const pred = duro(c.master, c.oferta);
  if (pred && !c.igual) tp++; else if (pred && c.igual) { fp++; falsos.push(`FP ${c.master.slice(0, 50)} | ${c.oferta.slice(0, 60)} | ${eixos(c.master, c.oferta).join(',')}`); } else if (!pred && !c.igual) fn++; else tn++;
}
const prec = tp / Math.max(1, tp + fp), rev = tp / Math.max(1, tp + fn);
console.log(`  casos=${fx.fusao.length} tp=${tp} fp=${fp} fn=${fn} tn=${tn} precisao=${prec.toFixed(3)} revocacao=${rev.toFixed(3)}`);
t('nenhuma oferta certa é tirada da cesta (equivalência: o que já está certo não muda)', () => assert.equal(fp, 0, falsos.join('\n')));
t('precisão da fusão >= 0,97', () => assert.ok(prec >= 0.97));
t('revocação da fusão >= 0,60 (o resto vira dúvida/revisão, nunca ação)', () => assert.ok(rev >= 0.6, String(rev)));

console.log('Divisão (par de masters), casos rotulados à mão');
let dtp = 0, dfp = 0, dfn = 0, dtn = 0, sugTp = 0, sugFp = 0;
const dfalsos: string[] = [];
for (const c of fx.divisao) {
  const j = julgarAtributos(motor.atributos(c.a), motor.atributos(c.b), motor.indice);
  const aplic = j.veredito === 'igual' && j.confianca >= LIMIAR_APLICAR;
  const sug = j.veredito === 'igual';
  if (sug && c.igual) sugTp++; else if (sug && !c.igual) sugFp++;
  if (aplic && c.igual) dtp++; else if (aplic && !c.igual) { dfp++; dfalsos.push(`${c.a.slice(0, 50)} | ${c.b.slice(0, 50)} | ${j.confianca}`); } else if (!aplic && c.igual) dfn++; else dtn++;
}
console.log(`  pares=${fx.divisao.length} aplicaveis(>=0,97): tp=${dtp} fp=${dfp} fn=${dfn} | sugeridos(>=0,90): tp=${sugTp} fp=${sugFp}`);
t('nenhuma fusão errada de masters em confiança >= 0,97', () => assert.equal(dfp, 0, dfalsos.join('\n')));

console.log('Segurança');
t('modo padrão é sugerir; CESTA_NLP=off desliga; aplicar só com pedido explícito', () => {
  assert.equal(cestaNlpModo({}), 'sugerir');
  assert.equal(cestaNlpModo({ CESTA_NLP: 'off' }), 'off');
  assert.equal(cestaNlpModo({ CESTA_NLP: 'aplicar' }), 'aplicar');
});
t('títulos idênticos são sempre "igual" (equivalência)', () => {
  for (const c of fx.fusao.slice(0, 60)) {
    const j = julgarAtributos(motor.atributos(c.master), motor.atributos(c.master), motor.indice);
    assert.ok(!j.conflitos.some((x) => x.duro), c.master);
  }
});
console.log(`\n${ok} verificações ok`);
