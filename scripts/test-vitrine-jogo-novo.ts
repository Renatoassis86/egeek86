// R-116: so jogo NOVO na vitrine de jogos (dono, 2026-11-22), teto R$ 250. Teste puro (sem banco, sem rede).
import assert from 'node:assert/strict';
import { VITRINE_TETO_CENTAVOS, VITRINE_TETO_TEXTO, barraOfertaVitrine, condicaoSuspeita, escolherMenores, montarJogosVitrine, montarLegenda, montarLegendaPlataforma, type OfertaVitrine } from '../src/lib/messaging/vitrine-games';

const o = (i: number, preco: number, p: Partial<OfertaVitrine> = {}): OfertaVitrine => ({
  ofertaId: `o${i}`, masterId: `m${i}`, slug: `s${i}`, tituloOferta: `Jogo Novo ${i} PS5 Lacrado`, vendedor: 'Loja Oficial', masterNome: `Jogo Novo ${i}`, gen: 'ps5', plataforma: 'PlayStation 5',
  precoCentavos: preco, imagem: `https://img/${i}.jpg`, ofertasDoMaster: 2, fotoFaixa: 'baixo', fotoIdadeDias: 1, ...p,
});

// teto de 250 inclusivo
assert.equal(VITRINE_TETO_CENTAVOS, 25_000);
assert.equal(VITRINE_TETO_TEXTO, 'R$ 250');
{
  const { jogos } = montarJogosVitrine([o(1, 25_000), o(2, 25_001), o(3, 0), o(4, 24_999)]);
  assert.deepEqual(jogos.map((j) => j.masterId).sort(), ['m1', 'm4'], 'R$ 250,00 entra; R$ 250,01 e preco 0 nao');
}
// textos derivados do teto
assert.match(montarLegendaPlataforma([], '10:00', 'PlayStation 5', false, () => ''), /Jogos até R\$ 250/);
assert.match(montarLegenda([], '10:00', () => ''), /Jogos até R\$ 250/);

// camada (a): condicao no titulo/vendedor
const barrados = [
  'God of War Ragnarok PS5 Usado', 'Jogo PS5 Seminovo em otimo estado', 'Mario Kart Switch Caixa Aberta', 'Zelda Switch sem lacre', 'Jogo PS4 lacre rompido',
  'Lote 3 jogos PS4', 'Kit com 5 jogos Switch', 'Cartucho solto Switch Mario', 'Somente o disco PS5', 'Jogo PS5 Open Box', 'FIFA 24 PS4 sem caixa', 'Jogo PS5 com marcas de uso',
];
for (const t of barrados) assert.ok(condicaoSuspeita(t), `deveria barrar: ${t}`);
const livres = ['Elden Ring PS5 Mídia Física Lacrado', 'Zelda Breath of the Wild Switch Mundo Aberto', 'Hogwarts Legacy Xbox Series X', 'Jogo PS5 Novo Lacrado Mídia Física', 'Mario Kart 8 Deluxe Nintendo Switch'];
for (const t of livres) assert.equal(condicaoSuspeita(t), null, `nao deveria barrar: ${t}`);
// revendedor de usados anunciando "midia fisica" sem lacre
assert.equal(condicaoSuspeita('Jogo PS5 Mídia Física', 'Jogo', 'Games Usados Center'), 'revendedor_sem_lacre');
assert.equal(condicaoSuspeita('Jogo PS5 Mídia Física Lacrado', 'Jogo', 'Games Usados Center'), null, 'lacrado de revendedor passa pela camada (a); a foto decide');
assert.equal(condicaoSuspeita('Jogo PS5 Mídia Física', 'Jogo', 'Loja Oficial'), null, 'midia fisica de loja comum nao barra');
{
  const r = montarJogosVitrine([o(1, 5000, { tituloOferta: 'Jogo PS5 Usado' }), o(2, 6000)]);
  assert.deepEqual(r.jogos.map((j) => j.masterId), ['m2']);
  assert.equal(r.barradas.condicao, 1);
}

// camada (b): foto suspeita (alto e medio) e quarentena
assert.equal(barraOfertaVitrine(o(1, 100, { fotoFaixa: 'alto' })), 'foto_suspeita');
assert.equal(barraOfertaVitrine(o(1, 100, { fotoFaixa: 'medio' })), 'foto_suspeita', 'medio = suspeita: a vitrine e mais rigorosa que o envio');
assert.equal(barraOfertaVitrine(o(1, 100, { fotoFaixa: 'baixo' })), null);
assert.equal(barraOfertaVitrine(o(1, 100, { quarentena: true })), 'quarentena');

// camada (c): padrao negado sem pontuacao, sem imagem ou pontuacao velha
assert.equal(barraOfertaVitrine(o(1, 100, { fotoFaixa: null })), 'foto_sem_pontuacao');
assert.equal(barraOfertaVitrine(o(1, 100, { fotoFaixa: undefined })), 'foto_sem_pontuacao');
assert.equal(barraOfertaVitrine(o(1, 100, { imagem: null })), 'foto_sem_pontuacao');
assert.equal(barraOfertaVitrine(o(1, 100, { fotoIdadeDias: 15 })), 'foto_sem_pontuacao');
assert.equal(barraOfertaVitrine(o(1, 100, { fotoIdadeDias: 14 })), null);

// reposicao: os 10 mais baratos sao suspeitos -> entram os proximos 10 elegiveis, em ordem de preco
{
  const lista: OfertaVitrine[] = [];
  for (let i = 1; i <= 10; i++) lista.push(o(i, 1000 + i * 100, { fotoFaixa: i % 2 ? 'alto' : 'medio' }));
  for (let i = 11; i <= 14; i++) lista.push(o(i, 1000 + i * 100, { fotoFaixa: null }));
  for (let i = 15; i <= 30; i++) lista.push(o(i, 1000 + i * 100));
  const { jogos, barradas } = montarJogosVitrine(lista);
  const top = escolherMenores(jogos, ['ps5']);
  assert.deepEqual(top.map((j) => j.masterId), ['m15', 'm16', 'm17', 'm18', 'm19', 'm20', 'm21', 'm22', 'm23', 'm24']);
  assert.equal(barradas.foto_suspeita, 10);
  assert.equal(barradas.foto_sem_pontuacao, 4);
}
// master com varias ofertas: a barrada nunca define preco, slug nem imagem; entra a proxima elegivel do mesmo master
{
  const { jogos } = montarJogosVitrine([o(1, 3000, { ofertaId: 'a', slug: 'barata', fotoFaixa: 'alto', imagem: 'https://img/maoo.jpg' }), o(1, 4000, { ofertaId: 'b', slug: 'boa' })]);
  assert.equal(jogos.length, 1);
  assert.equal(jogos[0].precoCentavos, 4000);
  assert.equal(jogos[0].slug, 'boa');
  assert.equal(jogos[0].imagem, 'https://img/1.jpg');
}
// padrao negado total: nenhuma pontuada = vitrine vazia da plataforma (nao envia ninguem em duvida)
assert.equal(escolherMenores(montarJogosVitrine([o(1, 1000, { fotoFaixa: null }), o(2, 2000, { fotoFaixa: null })]).jogos, ['ps5']).length, 0);
console.log('test-vitrine-jogo-novo: OK');
