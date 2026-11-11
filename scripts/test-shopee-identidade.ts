/**
 * Testes da identidade forte da ampliacao de amostra Shopee (sem banco, sem rede).
 * Uso: npx tsx scripts/test-shopee-identidade.ts   (sai com codigo 1 se algo falhar)
 * Os titulos abaixo sao ENTRADAS de teste da funcao pura (padrao de anuncio de marketplace); nao sao dados da plataforma.
 */
import { buildShopeeQueries, filtroAnuncio, judgeShopee, prepareGeneric, type ShopeeCand } from '../src/lib/affiliate/shopee-identity';
import type { MasterIdentity } from '../src/lib/affiliate/amazon-identity';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const cand = (title: string, priceCents = 100000): ShopeeCand => ({ itemId: '123', title, priceCents });
const M = (o: Partial<MasterIdentity> & Pick<MasterIdentity, 'vertical' | 'name'>): MasterIdentity => ({ gen: null, segment: null, brand: null, gtin: null, mpn: null, cat: null, ...o });
const j = (m: MasterIdentity, c: ShopeeCand, opts = {}) => judgeShopee(prepareGeneric(m), c, opts);

// --- TV (modelo com codigo) ---
const tv = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', name: 'Smart Tv 50 4k Uhd Samsung Un50du7700', brand: 'Samsung', cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' } });
check('tv: mesmo modelo, bivolt => accept forte', (() => { const v = j(tv, cand('Smart TV Samsung 50" Crystal UHD 4K UN50DU7700 Bivolt')); return v.outcome === 'accept' && v.forte; })());
check('tv: 55 pol outra serie => reject', j(tv, cand('Smart TV Samsung 55" Crystal UHD 4K UN55DU7700 Bivolt')).outcome === 'reject');
check('tv: sem voltagem => doubt (nao cria)', j(tv, cand('Smart TV Samsung 50" 4K UN50DU7700')).outcome === 'doubt');
check('tv: outra marca => reject', j(tv, cand('Smart TV LG 50" 4K 50UT8050 Bivolt')).outcome === 'reject');
check('tv: recondicionada => reject condicao', j(tv, cand('Smart TV Samsung 50" UN50DU7700 Bivolt recondicionada')).motivo.startsWith('rejeitado_condicao'));
check('tv: usada => reject', j(tv, cand('Smart TV Samsung 50" UN50DU7700 Bivolt usada')).outcome === 'reject');
check('tv: importada/internacional => reject', j(tv, cand('Smart TV Samsung 50" UN50DU7700 Bivolt importada')).outcome === 'reject');
check('tv: modelo antigo => fora_de_linha', j(tv, cand('Smart TV Samsung 50" UN50DU7700 Bivolt modelo antigo')).motivo.startsWith('fora_de_linha_ou_retro'));
check('tv: kit => reject composicao', j(tv, cand('Kit Smart TV Samsung 50" UN50DU7700 Bivolt com suporte')).outcome === 'reject');
check('tv: suporte de parede avulso => reject acessorio', j(tv, cand('Suporte de parede para TV Samsung 50 UN50DU7700')).outcome === 'reject');
check('tv: controle remoto avulso => reject acessorio', j(tv, cand('Controle remoto TV Samsung UN50DU7700 Bivolt')).motivo.includes('acessorio'));
check('tv: replica/paralelo => reject nao original', j(tv, cand('Smart TV Samsung 50" UN50DU7700 Bivolt paralelo')).outcome === 'reject');
check('tv: preco zero invalido', j(tv, cand('Smart TV Samsung 50" UN50DU7700 Bivolt', 0)).outcome === 'reject');

// --- Sem codigo de modelo: cobertura NAO basta ---
const fryer = M({ vertical: 'eletrodomesticos', segment: 'fritadeira-eletrica', name: 'Fritadeira Eletrica Air Fryer Mondial 4L Preta', brand: 'Mondial', cat: { BRAND: 'Mondial' } });
const vf = j(fryer, cand('Fritadeira Eletrica Air Fryer Mondial 4L Preta', 29900));
check('cobertura sem codigo => doubt por padrao', vf.outcome === 'doubt' && !vf.forte, vf);
const vf2 = j(fryer, cand('Fritadeira Eletrica Air Fryer Mondial 4L Preta', 29900), { aceitarCobertura: true });
check('cobertura sem codigo aceita so com a opcao explicita (e nunca "forte")', vf2.outcome === 'accept' && !vf2.forte, vf2);
check('capacidade diferente (6L) => reject', j(fryer, cand('Fritadeira Eletrica Air Fryer Mondial 6L Preta', 39900), { aceitarCobertura: true }).outcome === 'reject');
check('outra marca => reject', j(fryer, cand('Fritadeira Eletrica Air Fryer Philco 4L Preta', 39900), { aceitarCobertura: true }).outcome === 'reject');

// --- Livros: ISBN ---
const livro = M({ vertical: 'livros', segment: 'livros', name: 'Livro Hábitos Atômicos James Clear', gtin: '9788550807560', cat: { AUTHOR: 'James Clear', BOOK_TITLE: 'Hábitos Atômicos', BOOK_PUBLISHER: 'Alta Books' } });
check('livro: ISBN igual no titulo => accept forte', (() => { const v = j(livro, cand('Livro Hábitos Atômicos James Clear 9788550807560 Capa Comum', 4500)); return v.outcome === 'accept' && v.forte; })());
check('livro: ISBN diferente => reject', j(livro, cand('Livro Hábitos Atômicos James Clear 9788550801483', 4500)).outcome === 'reject');
check('livro: sem ISBN no titulo, sem editora => doubt', j(livro, cand('Livro Hábitos Atômicos James Clear', 4500)).outcome === 'doubt');
check('livro: titulo+autor+editora => accept forte', j(livro, cand('Hábitos Atômicos James Clear Alta Books', 4500)).forte === true);
check('livro: PDF/ebook => reject', j(livro, cand('Hábitos Atômicos James Clear PDF', 900)).outcome === 'reject');
check('livro: usado => reject', j(livro, cand('Livro Hábitos Atômicos James Clear usado', 2000)).outcome === 'reject');
check('livro: box/kit => reject', j(livro, cand('Kit Livro Hábitos Atômicos James Clear + caderno', 9000)).outcome === 'reject');
check('livro: volume diferente nao aceita', j(M({ vertical: 'livros', segment: 'livros', name: 'Livro Naruto Vol 2 Masashi Kishimoto', cat: { AUTHOR: 'Masashi Kishimoto' } }), cand('Naruto Vol 3 Masashi Kishimoto Panini', 3000)).outcome !== 'accept');

// --- Esporte: genero separa ---
const tenis = M({ vertical: 'esporte', segment: 'tenis', name: 'Tênis Nike Pegasus 41 Masculino', brand: 'Nike', cat: { BRAND: 'Nike', MODEL: 'Pegasus 41', GENDER: 'Masculino' } });
check('tenis: genero feminino => reject', j(tenis, cand('Tênis Nike Pegasus 41 Feminino', 79900)).outcome === 'reject');
check('tenis: outra geracao (40) => reject', j(tenis, cand('Tênis Nike Pegasus 40 Masculino', 79900)).outcome === 'reject');
check('tenis: replica 1a linha => reject', j(tenis, cand('Tênis Nike Pegasus 41 Masculino primeira linha', 19900)).outcome === 'reject');

// --- Impressao 3D: filamento por campos ---
const fil = M({ vertical: 'impressao3d', segment: 'filamento-3d', name: 'Filamento PLA 1,75mm 1kg Voolt3D Preto', brand: 'Voolt3D', cat: { BRAND: 'Voolt3D' } });
check('filamento: mesmos campos => accept forte', (() => { const v = j(fil, cand('Filamento PLA Voolt3D 1.75mm 1kg Branco', 8900)); return v.outcome === 'accept' && v.forte; })(), j(fil, cand('Filamento PLA Voolt3D 1.75mm 1kg Branco', 8900)));
check('filamento: PETG => reject', j(fil, cand('Filamento PETG Voolt3D 1.75mm 1kg', 8900)).outcome === 'reject');
check('filamento: 500g => reject', j(fil, cand('Filamento PLA Voolt3D 1.75mm 500g', 5900)).outcome === 'reject');
check('filamento: outra marca => reject', j(fil, cand('Filamento PLA Creality 1.75mm 1kg', 8900)).outcome === 'reject');
check('filamento: bico/hotend avulso => reject', j(fil, cand('Bico hotend para filamento PLA Voolt3D 1.75mm 1kg', 3000)).outcome === 'reject');

// --- Filtros de anuncio ---
const ok = { sales: 20, imageUrl: 'https://down-br.img.susercontent.com/x', offerLink: 'https://s.shopee.com.br/abc', ratingStar: '4.8' };
check('anuncio ok', filtroAnuncio(ok, { minVendas: 3, minNota: 4 }) === null);
check('anuncio sem offerLink', filtroAnuncio({ ...ok, offerLink: null }, { minVendas: 3, minNota: 4 }) === 'sem_offerlink_oficial');
check('anuncio offerLink de outro dominio', filtroAnuncio({ ...ok, offerLink: 'https://evil.example/x' }, { minVendas: 3, minNota: 4 }) === 'sem_offerlink_oficial');
check('anuncio poucas vendas', filtroAnuncio({ ...ok, sales: 0 }, { minVendas: 3, minNota: 4 }) === 'poucas_vendas');
check('anuncio nota baixa', filtroAnuncio({ ...ok, ratingStar: '3.2' }, { minVendas: 3, minNota: 4 }) === 'nota_baixa');
check('anuncio sem nota nao reprova', filtroAnuncio({ ...ok, ratingStar: undefined }, { minVendas: 3, minNota: 4 }) === null);

// --- Consultas ---
check('query tv inclui marca e modelo', /samsung/i.test(buildShopeeQueries(tv)[0]) && /UN50DU7700/i.test(buildShopeeQueries(tv)[0]), buildShopeeQueries(tv));
check('query livro: 1a = ISBN, 2a = titulo+autor', (() => { const q = buildShopeeQueries(livro); return q[0] === '9788550807560' && q.length === 2 && /James Clear/.test(q[1]); })(), buildShopeeQueries(livro));

console.log(fails === 0 ? `OK: ${total} verificacoes` : `${fails} FALHA(S) de ${total}`);
process.exit(fails === 0 ? 0 : 1);
