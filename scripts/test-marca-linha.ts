/** C5 (2026-11-14): "modelo fraco" afrouxado para marca reconhecida + linha (ou código no título). npx tsx scripts/test-marca-linha.ts */
import { avaliarModelo, marcaReconhecida, linhaValida, codigoNoTitulo } from '../src/lib/catalog/marca-linha';

let ok = 0, falhas = 0;
function t(nome: string, cond: boolean) { if (cond) ok++; else { falhas++; console.error('FALHOU:', nome); } }

t('modelo com dígito continua ok', avaliarModelo({ marca: 'Electrolux', modelo: 'STK15', nome: 'Aspirador Vertical Electrolux STK15' }).veredito === 'ok');
t('marca + linha libera', avaliarModelo({ marca: 'Amazfit', modelo: null, linha: 'Bip', nome: 'Smartwatch Amazfit Bip U Black' }).via === 'marca_mais_linha');
t('código no título libera (modelo sem dígito no cadastro)', avaliarModelo({ marca: 'Agratto', modelo: 'Split', nome: 'Ar Condicionado Split Frio 9000 Btus Facst9f-02 Agratto' }).veredito === 'ok');
t('sem marca nunca libera', avaliarModelo({ marca: '', modelo: 'X1', nome: 'Fritadeira X1' }).veredito === 'sem_marca');
t('marca genérica nunca libera', avaliarModelo({ marca: 'Genérico', modelo: null, linha: 'Pro', nome: 'Genérico Pro Fritadeira' }).veredito === 'modelo_fraco');
t('marca que não aparece no título não é reconhecida', !marcaReconhecida('Philips', 'Fritadeira Elétrica Industrial 10L'));
t('"desconhecido" é lixo', !linhaValida('desconhecido', 'Acme'));
t('linha igual à marca não vale', !linhaValida('Acme', 'Acme'));
t('só resolução "4K" não é linha', !linhaValida('4K', 'Acme'));
t('sem linha nem código fica fraco', avaliarModelo({ marca: 'Casita', modelo: null, nome: 'Cafeteira Expresso Casita 6 Xícaras Alumínio 300ml' }).veredito === 'modelo_fraco');
t('medida não é código (16000Pa 110v 2tb)', codigoNoTitulo('Aspirador 16000Pa 110v 2tb Portátil') === null);
t('código alfanumérico é código', codigoNoTitulo('Mouse Gamer KD-951 Preto') === 'kd 951' || codigoNoTitulo('Mouse Gamer KD951 Preto') === 'kd951');

console.log(`test-marca-linha: ${ok}/${ok + falhas} ok`);
if (falhas) process.exit(1);
