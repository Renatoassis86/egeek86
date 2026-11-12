/**
 * Testes da cobertura Shopee por listagem (config, parametros, cursor, casamento anuncio->master, medicao de categorias). Puros: sem banco/rede.
 * Os titulos sao ENTRADAS de teste da funcao pura (padrao de anuncio de marketplace); nao sao dados da plataforma.
 * Uso: npx tsx scripts/test-shopee-cobertura.ts
 */
import {
  avancarCursor, casarItem, coberturaLigada, criarIndice, fontesDe, lerConfigCobertura, PAGINAS_MAX_POR_FONTE, paradaPorErro, parseParametrosCobertura,
  emDescanso, proximaFonte, resumirCategorias, type CursorMapa,
} from '../src/lib/affiliate/shopee-cobertura';
import type { MasterIdentity } from '../src/lib/affiliate/amazon-identity';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const P = (o: Record<string, string>) => parseParametrosCobertura((k) => o[k] ?? null);

// --- config: nasce vazia (nenhum id inventado) e valida entradas ---
check('config padrao vazia', (() => { const { cfg } = lerConfigCobertura(undefined); return cfg.categorias.length === 0 && cfg.lojas.length === 0; })());
{
  const { cfg, invalidas } = lerConfigCobertura(JSON.stringify({
    categorias: [{ catId: '100012', loja: 'games' }, { catId: 'abc', loja: 'livros' }, { catId: '5', loja: 'inexistente' }, { catId: '99999999999', loja: 'livros' }],
    lojas: [{ shopId: '84499012', loja: 'esporte' }, { shopId: 'x', loja: 'esporte' }],
  }));
  check('config: so entradas validas passam', cfg.categorias.length === 1 && cfg.lojas.length === 1, cfg);
  check('config: invalidas listadas (inclui Int32 estourado)', invalidas.length === 4, invalidas);
}
check('config: JSON quebrado cai para vazio e avisa', (() => { const r = lerConfigCobertura('{x'); return r.cfg.categorias.length === 0 && r.invalidas[0] === 'env_json_invalido'; })());

// --- interruptor e parametros ---
check('desligada por padrao', !coberturaLigada(undefined) && !coberturaLigada('0') && !coberturaLigada('true') && coberturaLigada('1'));
const d = P({});
check('padroes: dry-run, 4 paginas, 120 chamadas, 40 duvidas, 30 masters novos', d.ok && !d.params.apply && d.params.paginas === 4 && d.params.maxCalls === 120 && d.params.maxDuvidas === 40 && d.params.maxMastersNovos === 30, d);
check('maxMasters: limite 120 e 0 permitido (so anexar, sem criar)', (P({ maxMasters: '999' }) as any).params.maxMastersNovos === 120 && (P({ maxMasters: '0' }) as any).params.maxMastersNovos === 0 && (P({ maxMasters: 'x' }) as any).erro === 'maxMasters_invalido');
check('apply so com 1; dry=1 vence', (P({ apply: '1' }) as any).params.apply === true && (P({ apply: '1', dry: '1' }) as any).params.apply === false && (P({ apply: 'true' }) as any).params.apply === false);
check('limites: pages<=10, maxCalls<=350, maxDuvidas<=150', (() => { const r = P({ pages: '99', maxCalls: '9999', maxDuvidas: '999' }) as any; return r.params.paginas === 10 && r.params.maxCalls === 350 && r.params.maxDuvidas === 150; })());
check('loja invalida', (P({ loja: 'celulares' }) as any).erro === 'loja_invalida:celulares');
check('lojas sem repeticao', JSON.stringify((P({ loja: 'games, livros,games' }) as any).params.lojas) === '["games","livros"]');
check('fonte valida/invalida', (P({ fonte: 'cat:100012' }) as any).params.fonte === 'cat:100012' && (P({ fonte: 'cat:1;2' }) as any).erro === 'fonte_invalida');
check('numero invalido', (P({ pages: '-1' }) as any).erro === 'pages_invalido');
check('probe=cat', (P({ probe: 'cat' }) as any).params.probe === true);

// --- fontes e cursor (descoberta por categoria) ---
const { cfg } = lerConfigCobertura(JSON.stringify({
  categorias: [{ catId: '100', loja: 'games' }, { catId: '200', loja: 'livros' }, { catId: '300', loja: 'livros' }],
  lojas: [{ shopId: '55', loja: 'games' }],
}));
check('fontes: todas / filtro por loja', fontesDe(cfg).length === 4 && fontesDe(cfg, ['livros']).length === 2 && fontesDe(cfg, ['games']).map((f) => f.chave).join() === 'cat:100,shop:55');
check('cursor: avanca a pagina', avancarCursor(undefined, { temProxima: true, vazia: false }).page === 2);
check('cursor: fim da lista recomeca na 1 e conta a volta', (() => { const c = avancarCursor({ page: 7, voltas: 0 }, { temProxima: false, vazia: false }); return c.page === 1 && c.voltas === 1; })());
check('cursor: pagina vazia recomeca', avancarCursor({ page: 3, voltas: 2 }, { temProxima: true, vazia: true }).voltas === 3);
check('cursor: teto de paginas recomeca', avancarCursor({ page: PAGINAS_MAX_POR_FONTE, voltas: 0 }, { temProxima: true, vazia: false }).page === 1);
{
  const fontes = fontesDe(cfg);
  const cursor: CursorMapa = {};
  const ordem: string[] = [];
  for (let i = 0; i < 8; i++) {
    const f = proximaFonte(fontes, cursor)!;
    ordem.push(f.chave);
    cursor[f.chave] = avancarCursor(cursor[f.chave], { temProxima: true, vazia: false }, new Date(2026, 10, 12, 10, i));
  }
  check('fontes em rodizio (espalha, nao esgota uma por vez)', new Set(ordem.slice(0, 4)).size === 4 && ordem.slice(0, 4).join() === ordem.slice(4).join(), ordem);
  check('sem fontes => null', proximaFonte([], {}) === null);
  // fonte com 2+ falhas 10000 descansa 6 h e depois volta
  const agora = new Date('2026-11-12T18:30:00Z');
  const cur: CursorMapa = { [fontes[0].chave]: { page: 1, voltas: 0, falhas: 2, atualizadoEm: '2026-11-12T18:00:00Z' } };
  check('fonte com 2 falhas recentes descansa', emDescanso(cur[fontes[0].chave], agora) && proximaFonte(fontes, cur, agora)!.chave !== fontes[0].chave);
  check('1 falha nao descansa', !emDescanso({ page: 1, voltas: 0, falhas: 1, atualizadoEm: '2026-11-12T18:00:00Z' }, agora));
  check('descanso acaba em 6 h', !emDescanso(cur[fontes[0].chave], new Date('2026-11-13T00:01:00Z')));
  check('todas em descanso => null', proximaFonte([fontes[0]], cur, agora) === null);
}

// --- parada por erro: PRIMEIRO 10030 para ---
check('10030 para na hora', paradaPorErro('rate_limit', 1) === 'rate_limit');
check('auth/access param', paradaPorErro('auth', 1) === 'auth' && paradaPorErro('access', 1) === 'access');
check('erro generico: so a partir de 5 seguidos', paradaPorErro('unknown', 4) === null && paradaPorErro('unknown', 5) === 'erros_seguidos');

// --- casamento anuncio -> master (todas as lojas) ---
const M = (o: Partial<MasterIdentity> & Pick<MasterIdentity, 'vertical' | 'name'>): MasterIdentity => ({ gen: null, segment: null, brand: null, gtin: null, mpn: null, cat: null, ...o });
const tv = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', name: 'Smart Tv 50 4k Uhd Samsung Un50du7700', brand: 'Samsung', cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' } });
const livro = M({ vertical: 'livros', segment: 'livros', name: 'Livro Hábitos Atômicos James Clear', gtin: '9788550807560', cat: { AUTHOR: 'James Clear', BOOK_TITLE: 'Hábitos Atômicos', BOOK_PUBLISHER: 'Alta Books' } });
const fritadeira = M({ vertical: 'eletrodomesticos', segment: 'fritadeira-eletrica', name: 'Fritadeira Eletrica Air Fryer Mondial 4L Preta', brand: 'Mondial', cat: { BRAND: 'Mondial' } });
const tenis = M({ vertical: 'esporte', segment: 'tenis', name: 'Tênis Nike Pegasus 41 Masculino', brand: 'Nike', cat: { BRAND: 'Nike', MODEL: 'Pegasus 41', GENDER: 'Masculino' } });
const idx = criarIndice([
  { id: 'tv-1', identity: tv, nShopee: 0 }, { id: 'livro-1', identity: livro, nShopee: 0 },
  { id: 'fry-1', identity: fritadeira, nShopee: 0 }, { id: 'tenis-1', identity: tenis, nShopee: 0 },
]);
const item = (title: string, priceCents = 100000) => ({ itemId: '1', title, priceCents });
check('indice conta masters', idx.total === 4);
check('TV: mesmo modelo => aceito forte no master certo', (() => { const r = casarItem(idx, item('Smart TV Samsung 50" Crystal UHD 4K UN50DU7700 Bivolt'), 'eletroeletronicos'); return r.destino === 'aceito' && r.masterId === 'tv-1'; })());
check('TV: casamento respeita a loja (mesmo titulo em outra loja nao casa)', casarItem(idx, item('Smart TV Samsung 50" Crystal UHD 4K UN50DU7700 Bivolt'), 'livros').destino === 'sem_candidato');
check('TV: sem voltagem => DUVIDA (vai p/ fila, nao p/ media)', casarItem(idx, item('Smart TV Samsung 50" 4K UN50DU7700'), 'eletroeletronicos').destino === 'duvida');
check('TV: 55 polegadas outra serie => nao casa/rejeita', ['rejeitado', 'sem_candidato'].includes(casarItem(idx, item('Smart TV Samsung 55" UN55DU7700 Bivolt'), 'eletroeletronicos').destino));
check('TV usada => rejeitada por condicao', (() => { const r = casarItem(idx, item('Smart TV Samsung 50" UN50DU7700 Bivolt usada'), 'eletroeletronicos'); return r.destino === 'rejeitado' && /condicao|fora_de_linha/.test(r.motivo); })());
check('Livro: ISBN-13 no titulo (com hifens) => aceito', (() => { const r = casarItem(idx, item('Hábitos Atômicos James Clear 978-85-508-0756-0 Capa Comum', 4500), 'livros'); return r.destino === 'aceito' && r.masterId === 'livro-1'; })());
check('Livro: titulo+autor sem ISBN/editora => duvida', casarItem(idx, item('Livro Hábitos Atômicos James Clear', 4500), 'livros').destino === 'duvida');
check('Livro: ebook nunca aceito', casarItem(idx, item('Hábitos Atômicos James Clear PDF', 900), 'livros').destino !== 'aceito');
check('Fritadeira sem codigo: cobertura de titulo e so DUVIDA, nunca aceito', casarItem(idx, item('Fritadeira Eletrica Air Fryer Mondial 4L Preta', 29900), 'eletrodomesticos').destino === 'duvida');
check('Fritadeira 6L (capacidade diferente) nao e aceita', casarItem(idx, item('Fritadeira Eletrica Air Fryer Mondial 6L Preta', 39900), 'eletrodomesticos').destino !== 'aceito');
check('Tenis: genero errado nunca aceito', casarItem(idx, item('Tênis Nike Pegasus 41 Feminino', 79900), 'esporte').destino !== 'aceito');
check('Tenis: replica nunca aceita', casarItem(idx, item('Tênis Nike Pegasus 41 Masculino primeira linha', 19900), 'esporte').destino !== 'aceito');
check('Anuncio sem relacao: sem candidato', casarItem(idx, item('Capa de celular transparente'), 'eletroeletronicos').destino === 'sem_candidato');
{
  // dois masters aceitos para o mesmo anuncio => ambiguo => duvida
  const b = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', name: 'Smart Tv 50 Samsung Un50du7700', brand: 'Samsung', cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' } });
  const idx2 = criarIndice([{ id: 'a', identity: tv, nShopee: 0 }, { id: 'b', identity: b, nShopee: 0 }]);
  const r = casarItem(idx2, item('Smart TV Samsung 50" Crystal UHD 4K UN50DU7700 Bivolt'), 'eletroeletronicos');
  check('dois masters para o mesmo anuncio => DUVIDA ambigua (nunca escolhe sozinho)', r.destino === 'duvida' && /ambiguo/.test((r as any).motivo), r);
}

// --- medicao de categorias: agrega o que a propria API devolve ---
{
  const r = resumirCategorias([
    { productCatIds: [100012, 100068, 100259], productName: 'A' },
    { productCatIds: [100012, 100068, 100259], productName: 'B' },
    { productCatIds: [100012, 100068, 0], productName: 'C' },
    { productCatIds: [], productName: 'D' },
    { productName: 'E' },
  ]);
  check('probe: agrega por caminho, ignora zeros e vazios, ordena por frequencia', r.length === 2 && r[0].caminho === '100012>100068>100259' && r[0].itens === 2 && r[1].caminho === '100012>100068' && r[0].nivelFinal === '100259', r);
}

console.log(`${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
