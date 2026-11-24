// R-119: regras duras de texto (so midia = nao novo; nao-jogo fora) e profundidade da vitrine (10 por plataforma). Teste puro.
import assert from 'node:assert/strict';
import { jogoSoMidia, motivoJogoNaoNovoOuNaoJogo, naoEhJogoPorTexto } from '../src/lib/catalog/jogo-novo-texto';
import { condicaoSuspeita, escolherMenores, montarJogosVitrine, type OfertaVitrine } from '../src/lib/messaging/vitrine-games';

// exemplos dos prints do dono
assert.ok(jogoSoMidia('Metroid Prime Remastered (Apenas Cartucho) Switch'), 'Metroid Prime Remastered (Apenas Cartucho)');
assert.ok(naoEhJogoPorTexto('Pacote Hori Pokémon Trainer Pokéball Nintendo Switch'), 'pacote Hori');
assert.ok(condicaoSuspeita('Metroid Prime Remastered (Apenas Cartucho) Switch', 'Metroid Prime Remastered', 'DANY STORE GAMES LTDA'));
assert.ok(condicaoSuspeita('Pacote Hori Pokémon Trainer Pokéball Nintendo Switch', 'Pacote Hori Pokémon Trainer'));

// so midia / sem caixa em PT, EN e ES
const soMidia = [
  'Jogo Original Zoo Tycoon (Somente Disco) xbox one', 'Zelda Switch só o cartucho', 'Mario Kart cartucho solto', 'Jogo PS4 disco solto', 'Jogo PS5 sem caixa', 'Jogo Switch sem case',
  'Jogo Switch mídia solta', 'Jogo Switch sem capa', 'Jogo Xbox só mídia', 'Jogo PS4 sem manual', 'Pokemon Switch loose cartridge', 'Zelda Switch cart only', 'FIFA PS4 disc only',
  'Mario Switch sin caja', 'Zelda Switch solo cartucho', 'Jogo PS4 caixa aberta', 'Jogo PS5 sem lacre', 'God of War PS4 apenas o disco', 'Jogo Switch no box', 'Jogo Switch without case',
];
for (const t of soMidia) assert.ok(jogoSoMidia(t), `deveria ser nao novo: ${t}`);

// jogos legitimos nao podem ser barrados (capa oficial, lacrado, estudio)
const jogos = [
  'Metroid Prime Remastered Nintendo Switch Mídia Física Lacrado', 'Control Ultimate Edition PS5', 'Hogwarts Legacy Xbox Series X', 'Jogo Hotel Transylvania PS4 Novo Lacrado',
  'Cold Case Files PS4', 'The Legend of Zelda: Tears of the Kingdom Switch', 'Jogo de console PS5 Elden Ring', 'Bluey The Videogame Switch Midia Fisica', 'Uma Aventura Lego VideoGame Lego Movie Xbox One',
  'Persona 5 Tactica - Nintendo Switch Físico', 'Mario Kart 8 Deluxe Nintendo Switch',
];
for (const t of jogos) assert.equal(motivoJogoNaoNovoOuNaoJogo(t), null, `jogo legitimo barrado: ${t}`);

// nao e jogo
const naoJogo = [
  'Controle Arcade HORI Fighting Stick Xbox', 'Joystick Sem Fio PS4', 'Headset Gamer', 'Amiibo Mario Switch', 'Figura de Ação Hollow Knight', 'Pelúcia Pikachu', 'Cartão Presente PSN R$ 100',
  'Gift Card Nintendo eShop', 'Assinatura Game Pass 3 meses', 'Nintendo Switch Online 12 meses', 'Console PS4 500GB', 'Bolsa para Nintendo Switch', 'Estojo de transporte para Switch', 'Case protetora Switch',
  'Película de vidro Switch', 'Carregador PS5 dock', 'Cabo HDMI PS5', 'Pôster Gigante - Elden Ring', 'Jogo God Of War - Pc Mídia Digital', 'Pokémon Sword Expansion Pass (Digital)', 'Código digital Minecraft Xbox',
  'Suporte para controle PS5', 'Mochila Nintendo Switch', 'Grip Joy-Con Switch',
];
for (const t of naoJogo) assert.ok(naoEhJogoPorTexto(t), `deveria ser nao-jogo: ${t}`);

// profundidade: 10 por plataforma quando existem 10 elegiveis, mesmo com muitos barrados no topo
const o = (i: number, preco: number, p: Partial<OfertaVitrine> = {}): OfertaVitrine => ({
  ofertaId: `o${i}`, masterId: `m${i}`, slug: `s${i}`, tituloOferta: `Jogo ${i} Switch Lacrado`, vendedor: 'Loja', masterNome: `Jogo ${i}`, gen: 'switch_1', plataforma: 'Nintendo Switch',
  precoCentavos: preco, imagem: `https://i/${i}.jpg`, ofertasDoMaster: 1, fotoFaixa: 'baixo', fotoIdadeDias: 1, ...p,
});
const lista: OfertaVitrine[] = [];
for (let i = 1; i <= 40; i++) lista.push(o(i, 2000 + i * 100, i <= 25 ? { tituloOferta: i % 2 ? 'Jogo Switch (Apenas Cartucho)' : 'Pacote Hori Switch', fotoFaixa: i % 3 ? 'medio' : 'baixo' } : {}));
const { jogos: elegiveis } = montarJogosVitrine(lista);
const top = escolherMenores(elegiveis, ['switch_1'], 80);
assert.equal(top.length, 15, 'os 15 elegiveis (26..40) aparecem; o corte em 10 acontece depois da verificacao viva');
assert.deepEqual(top.slice(0, 3).map((j) => j.masterId), ['m26', 'm27', 'm28']);
console.log('test-jogo-novo-texto: OK');
