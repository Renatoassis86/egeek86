/**
 * Testes da CRIACAO de produto novo a partir de itens da Shopee (correcao de diretriz do dono, 2026-11-12). Puros: sem banco/rede.
 * Os titulos sao ENTRADAS de teste das funcoes puras (padrao de anuncio de marketplace); nao sao dados da plataforma.
 * Uso: npx tsx scripts/test-shopee-master-novo.ts
 */
import { decidirMasterNovo, IndiceDedup, propostaMasterNovo } from '../src/lib/affiliate/shopee-master-novo';
import { destinoDoCasamento, rejeicaoEhCondicao, criarIndice, casarItem } from '../src/lib/affiliate/shopee-cobertura';
import { marcaVariacao, precoEhAPartirDe, variacaoColunasLigada } from '../src/lib/affiliate/shopee-variacao';
import type { MasterIdentity } from '../src/lib/affiliate/amazon-identity';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }

const marcas = new Set(['samsung', 'philips', 'nike', 'mondial', 'anker', 'elgin']);
const item = (titulo: string, priceCents = 100000, hasImage = true) => ({ titulo, priceCents, hasImage });

// --- proposta: condicao/acessorio/digital barram (identidade, nao preco) ---
for (const [loja, t] of [
  ['eletroeletronicos', 'Smart TV Samsung 50 UN50DU7700 usada'], ['tecnologia', 'Notebook Samsung NP550XDA recondicionado'],
  ['eletroeletronicos', 'Suporte de parede para TV Samsung 50 UN50DU7700'], ['livros', 'Habitos Atomicos James Clear PDF'],
  ['eletrodomesticos', 'Air Fryer Mondial AFN-40-BI modelo antigo'],
] as const) {
  const r = decidirMasterNovo(loja, item(t), marcas, new IndiceDedup());
  check(`condicao/acessorio/digital nao cria master: ${t}`, r.acao === 'descartar', r);
}

// --- chave forte (marca conhecida + codigo de modelo) ---
{
  const r = propostaMasterNovo('eletroeletronicos', 'Smart TV Samsung 50 Crystal UHD 4K UN50DU7700 Bivolt', marcas);
  check('TV com marca real e codigo => chave forte brand_model', r.ok && r.proposta.forca === 'forte' && r.proposta.keyKind === 'brand_model' && /^bm:\|brand=samsung\|model=/.test(r.proposta.chave), r);
  check('TV: atributos de catalogo so o que o titulo diz (BRAND/MODEL)', r.ok && Object.keys(r.proposta.catalogAttributes).sort().join() === 'BRAND,MODEL');
}
{
  const r = propostaMasterNovo('eletroeletronicos', 'Fone bluetooth sem fio com microfone', marcas);
  check('sem marca conhecida nem codigo => chave FRACA (titulo)', r.ok && r.proposta.forca === 'fraca' && r.proposta.keyKind === 'title' && r.proposta.chave.startsWith('titulo:'), r);
}
{
  const r = propostaMasterNovo('tecnologia', 'Fone Xyzabc modelo ABC123', marcas);
  check('marca fora da tabela brands nao vira marca forte', r.ok && r.proposta.forca === 'fraca', r);
}
{
  const r = propostaMasterNovo('livros', 'Livro Habitos Atomicos James Clear 978-85-508-0756-0 Capa Comum', marcas);
  check('livro com ISBN-13 valido => chave forte isbn e gtin', r.ok && r.proposta.forca === 'forte' && r.proposta.keyKind === 'isbn' && r.proposta.gtin === '9788550807560', r);
  const f = propostaMasterNovo('livros', 'Livro Habitos Atomicos James Clear', marcas);
  check('livro sem ISBN => fraca (nunca inventa ISBN)', f.ok && f.proposta.forca === 'fraca' && f.proposta.gtin === null, f);
  const falso = propostaMasterNovo('livros', 'Livro 9781234567890 teste', marcas);
  check('ISBN com digito verificador invalido nao vale', falso.ok && falso.proposta.gtin === null);
}
{
  const r = propostaMasterNovo('esporte', 'Tênis Nike Pegasus 41 Masculino Corrida', marcas);
  check('esporte: marca+modelo+genero do lexico => forte', r.ok && r.proposta.forca === 'forte' && r.proposta.esporte !== null, r);
  const rep = propostaMasterNovo('esporte', 'Tênis Nike Pegasus 41 Masculino primeira linha', marcas);
  check('esporte: replica nao cria', !rep.ok, rep);
}

// --- decisao: porteiro/escopo (aprovacao-nicho) decide ativa x fila; master SEMPRE em revisao e feito no store ---
{
  const r = decidirMasterNovo('eletroeletronicos', item('Smart TV Samsung 50 Crystal UHD 4K UN50DU7700 Bivolt', 189900), marcas, new IndiceDedup());
  check('TV nova forte com voltagem => cria com oferta ATIVA', r.acao === 'criar' && r.oferta === 'ativa' && r.sugestaoPorteiro === 'approved', r);
}
{
  const r = decidirMasterNovo('eletrodomesticos', item('Fritadeira Eletrica Mondial AFN-40-BI 4L', 29900), marcas, new IndiceDedup());
  check('eletrodomestico forte mas SEM voltagem => cria e a oferta vai para a FILA', r.acao === 'criar' && r.oferta === 'duvida' && r.motivosPorteiro.includes('voltagem_mista') === false, r);
}
{
  const r = decidirMasterNovo('tecnologia', item('Mouse sem fio gamer RGB 12000 dpi'), marcas, new IndiceDedup());
  check('chave fraca: cria em revisao e a oferta SEMPRE vai para a fila, nunca ativa', (r.acao === 'criar' && r.oferta === 'duvida') || r.acao === 'descartar', r);
}
{
  const r = decidirMasterNovo('eletroeletronicos', item('Smart TV Samsung 50 UN50DU7700 Bivolt', 189900, false), marcas, new IndiceDedup());
  check('sem foto nunca vira master', r.acao === 'descartar', r);
}
{
  const r = decidirMasterNovo('tecnologia', item('Brinquedo miniatura robo Samsung XR12345'), marcas, new IndiceDedup());
  check('brinquedo/miniatura e definitivo (porteiro)', r.acao === 'descartar', r);
}

// --- dedup: um produto, um master (inclusive masters em revisao e planejados na rodada) ---
{
  const idx = new IndiceDedup([{ id: 'm1', name: 'Smart Tv 50 Samsung Un50du7700', chave: 'bm:|brand=samsung|model=un50du7700', gtin: null }]);
  const r = decidirMasterNovo('eletroeletronicos', item('Smart TV Samsung 50 Crystal UHD UN50DU7700 Bivolt', 189900), marcas, idx);
  check('mesma chave de identidade => ANEXA ao master existente (nao duplica), oferta ativa', r.acao === 'anexar' && r.masterId === 'm1' && r.via === 'chave' && r.oferta === 'ativa', r);
}
{
  const idx = new IndiceDedup([{ id: 'm2', name: 'Fone Bluetooth Sem Fio Com Microfone', chave: null, gtin: null }]);
  const r = decidirMasterNovo('eletroeletronicos', item('Fone bluetooth sem fio com microfone preto'), marcas, idx);
  check('titulo igual (cor junta) => anexa mas como DUVIDA', r.acao !== 'criar', r);
}
{
  const idx = new IndiceDedup([{ id: 'm3', name: 'Livro Habitos Atomicos', chave: 'isbn:9788550807560', gtin: '9788550807560' }]);
  const r = decidirMasterNovo('livros', item('Habitos Atomicos James Clear 9788550807560 Alta Books', 4500), marcas, idx);
  check('livro: mesmo ISBN => anexa', r.acao === 'anexar' && r.masterId === 'm3', r);
}
{
  const idx = new IndiceDedup();
  const a = decidirMasterNovo('eletroeletronicos', item('Smart TV Samsung 55 Crystal UHD 4K UN55DU7700 Bivolt', 289900), marcas, idx);
  check('1o item cria', a.acao === 'criar');
  if (a.acao === 'criar') idx.adicionar(a.proposta, 'planejado:1');
  const b = decidirMasterNovo('eletroeletronicos', item('TV Samsung 55 polegadas UN55DU7700 Bivolt Crystal 4K', 279900), marcas, idx);
  check('2o item do mesmo modelo na mesma rodada NAO cria outro master', b.acao === 'anexar' && b.masterId === 'planejado:1', b);
}

// --- destino depois do casamento ---
check('rejeicaoEhCondicao: condicao/composicao/fora de linha/invalido', ['rejeitado_condicao:condicao', 'rejeitado_composicao:acessorio', 'fora_de_linha_ou_retro:x', 'invalido:sem_preco'].every(rejeicaoEhCondicao));
check('rejeicaoEhCondicao: sem_match (outro produto) NAO e condicao', !rejeicaoEhCondicao('sem_match:isbn_diferente') && !rejeicaoEhCondicao('sem_match:polegadas'));
const M = (o: Partial<MasterIdentity> & Pick<MasterIdentity, 'vertical' | 'name'>): MasterIdentity => ({ gen: null, segment: null, brand: null, gtin: null, mpn: null, cat: null, ...o });
const tv = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', name: 'Smart Tv 50 4k Uhd Samsung Un50du7700', brand: 'Samsung', cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' } });
const idx = criarIndice([{ id: 'tv-1', identity: tv, nShopee: 0 }]);
const cas = (t: string) => destinoDoCasamento(casarItem(idx, { itemId: '1', title: t, priceCents: 150000 }, 'eletroeletronicos'));
check('sem candidato => NOVO master (antes: sem_master_candidato descartava)', cas('Smart TV LG 43 4K 43UT8050 Bivolt').destino === 'novo_master');
check('mesmo modelo => anexa', cas('Smart TV Samsung 50" Crystal UHD 4K UN50DU7700 Bivolt').destino === 'anexar');
check('mesmo modelo sem voltagem => duvida (fila)', cas('Smart TV Samsung 50" 4K UN50DU7700').destino === 'duvida');
check('outro tamanho da mesma marca (outro produto) => NOVO master, nao descarta', ['novo_master', 'descartar'].includes(cas('Smart TV Samsung 55" Crystal UHD 4K UN55DU7700 Bivolt').destino) && cas('Smart TV Samsung 55" Crystal UHD 4K UN55DU7700 Bivolt').destino === 'novo_master', cas('Smart TV Samsung 55" Crystal UHD 4K UN55DU7700 Bivolt'));
check('usada continua descartada', cas('Smart TV Samsung 50" UN50DU7700 Bivolt usada').destino === 'descartar');

// --- marca de variacao ---
check('marcaVariacao: preco unico => null', marcaVariacao({ variantMinCents: null, variantMaxCents: null, variantSpread: null, variantAmbigua: false }) === null);
check('marcaVariacao: faixa ampla', (() => { const m = marcaVariacao({ variantMinCents: 1000, variantMaxCents: 5000, variantSpread: 5, variantAmbigua: true }); return !!m && m.ampla && m.variantMinCents === 1000; })());
check('precoEhAPartirDe: so acima de 1,1', precoEhAPartirDe(5) && precoEhAPartirDe(1.11) && !precoEhAPartirDe(1.1) && !precoEhAPartirDe(null));
check('colunas de variacao so com SHOPEE_VARIANTE_COLUNAS=1', variacaoColunasLigada('1') && !variacaoColunasLigada(undefined) && !variacaoColunasLigada('true'));

console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
