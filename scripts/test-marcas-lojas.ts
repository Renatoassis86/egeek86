// Dono, 2026-11-18: principais marcas por loja (variedade de marcas e preferencia). So ORDEM da fila de envio.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COTA_MARCA_HORAS, MARCAS_POR_LOJA, marcaDoItem, padraoMarcasLoja } from '../src/lib/messaging/marcas-lojas';
import { normalizaNome } from '../src/lib/messaging/cota-item';

const m = (v: string, nome: string) => marcaDoItem(v, normalizaNome(nome));
assert.equal(m('esporte', 'Bola de Futebol Campo Penalty Matis'), 'penalty');
assert.equal(m('esporte', 'Tênis Nike Revolution 7'), 'nike');
assert.equal(m('eletrodomesticos', 'Fritadeira Elétrica Air Fryer Mondial 4L'), 'mondial');
assert.equal(m('tecnologia', 'Mouse Gamer Logitech G502'), 'logitech');
assert.equal(m('beleza', 'Sérum Medicube Zero Pore'), 'medicube');
assert.equal(m('beleza', "Shampoo L'Oréal Paris Elseve"), 'l oreal');
assert.equal(m('livros', 'Livro Intrínseca Box Percy Jackson'), 'intrinseca');
assert.equal(m('impressao3d', 'Impressora 3D Bambu Lab A1 Mini'), 'bambu lab');
assert.equal(m('beleza', 'Batom MAC Ruby Woo'), 'mac');
assert.equal(m('tecnologia', 'Notebook Apple Macbook Air M2'), 'apple', 'macbook NAO e a marca "mac" da Beleza (palavra inteira)');
assert.equal(m('esporte', 'Bola de Praia Inflavel Generica'), null, 'sem marca do dicionario = sem marca');
assert.equal(m('desconhecida', 'qualquer coisa'), null);
assert.equal(padraoMarcasLoja('desconhecida'), null);
assert.equal(COTA_MARCA_HORAS, 6);
for (const v of ['tecnologia', 'eletroeletronicos', 'eletrodomesticos', 'esporte', 'livros', 'impressao3d', 'beleza', 'games']) assert.ok((MARCAS_POR_LOJA[v] ?? []).length >= 8, `${v}: pelo menos 8 marcas principais`);
const q = fs.readFileSync('src/server/messaging/group-queue.ts', 'utf8');
assert.ok(q.includes('marca6 AS MATERIALIZED') && /b\.fam_sent6 ASC, b\.marca_sent6 ASC, b\.pop DESC/.test(q), 'variedade de marcas na ordem: depois da cota de familia, antes da popularidade');
console.log('test-marcas-lojas: OK');
