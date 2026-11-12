/**
 * Testes das regras de identidade, exclusão e dedup da descoberta Shopee de ESPORTE (sem banco, sem rede).
 * Títulos no padrão real de anúncio de tênis, roupa e acessório esportivo da Shopee.
 * Uso: npx tsx scripts/test-shopee-esporte.ts   (sai com código 1 se algo falhar)
 */
import { avaliarTituloEsporte, generoDe, IndiceMasters, iscaNoLote, prep, termosEsporte, SEGMENTOS_ESPORTE_COM_GENERO } from '../src/lib/catalog/vertical/esporte-shopee';
import { avaliarCandidato, type CandidatoMaster } from '../src/lib/catalog/aprovacao-nicho';

let falhas = 0;
let total = 0;
function check(nome: string, ok: boolean, extra?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.log(`FALHA: ${nome}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`);
  }
}

/** Esperado ACEITO com esta chave. */
function aceita(titulo: string, chave: string) {
  const r = avaliarTituloEsporte(titulo);
  check(`aceita: ${titulo}`, r.ok && r.chave === chave, r.ok ? r.chave : { motivo: r.motivo, detalhe: r.detalhe });
}
/** Esperado NEGADO com este motivo. */
function nega(titulo: string, motivo: string) {
  const r = avaliarTituloEsporte(titulo);
  check(`nega (${motivo}): ${titulo}`, !r.ok && r.motivo === motivo, r.ok ? r.chave : { motivo: r.motivo, detalhe: r.detalhe });
}

// ---------------------------------------------------------------- normalização e gênero
check('prep: decimal e hífen', prep('Gel-Nimbus 25 / Runfalcon 3.0') === 'gel nimbus 25 runfalcon 3p0', prep('Gel-Nimbus 25 / Runfalcon 3.0'));
check('prep: 990v6 separa a versão', prep('New Balance 990v6') === 'new balance 990 v6', prep('New Balance 990v6'));
check('gênero masculino', generoDe('Tênis Masculino') === 'masculino');
check('gênero feminino', generoDe('Legging Feminina') === 'feminino');
check('gênero unissex explícito', generoDe('Boné Unissex') === 'unissex');
check('masculino + feminino no título = unissex', generoDe('Tênis Masculino Feminino') === 'unissex');
check('infantil vence', generoDe('Tênis Infantil Masculino') === 'infantil');
check('menina = infantil', generoDe('Camiseta Menina') === 'infantil');
check('"women" não é "men"', generoDe('Nike Women Running') === 'feminino');
check('sem gênero no título = null', generoDe('Tênis Nike Revolution 7') === null);

// ---------------------------------------------------------------- tênis (aceitos)
aceita('Tênis Nike Revolution 7 Masculino Preto Corrida Academia', 'bm:tenis|brand=nike|model=revolution 7|gender=masculino');
aceita('Tênis Nike Revolution 7 Masculino Azul Caminhada', 'bm:tenis|brand=nike|model=revolution 7|gender=masculino'); // cor junta
aceita('Tênis Adidas Runfalcon 3.0 Feminino Rosa', 'bm:tenis|brand=adidas|model=runfalcon 3p0|gender=feminino');
aceita('Tênis Asics Gel-Nimbus 25 Masculino Corrida', 'bm:tenis|brand=asics|model=gel nimbus 25|gender=masculino');
aceita('Tênis Olympikus Corre Supra Masculino', 'bm:tenis|brand=olympikus|model=corre supra|gender=masculino');
aceita('Tênis Mizuno Wave Prophecy 12 Masculino Corrida', 'bm:tenis|brand=mizuno|model=wave prophecy 12|gender=masculino');
aceita('Tênis Skechers Go Walk 6 Feminino Caminhada', 'bm:tenis|brand=skechers|model=go walk 6|gender=feminino');
aceita('Tênis Vans Old Skool Preto e Branco Unissex Skate', 'bm:tenis|brand=vans|model=old skool|gender=unissex');
aceita('Tênis New Balance 574 Masculino Casual', 'bm:tenis|brand=new balance|model=574|gender=masculino');
aceita('Tênis New Balance 990v6 Masculino', 'bm:tenis|brand=new balance|model=990 v6|gender=masculino');
aceita('Tênis Nike Pegasus 41 Masculino Tamanho 42', 'bm:tenis|brand=nike|model=pegasus 41|gender=masculino'); // tamanho não vira versão
aceita('Tênis Nike Revolution 7 Masculino Tam 38 ao 44 Original', 'bm:tenis|brand=nike|model=revolution 7|gender=masculino');
aceita('Tênis Nike Air Max 90 Masculino Original Lacrado', 'bm:tenis|brand=nike|model=air max 90|gender=masculino');
aceita('Tênis Nike Air Force 1 07 Feminino Branco', 'bm:tenis|brand=nike|model=air force 1|gender=feminino');
aceita('Tênis Nike Dunk Low Masculino Casual', 'bm:tenis|brand=nike|model=dunk low|gender=masculino');
aceita('Tênis Under Armour Charged Assert 10 Masculino Treino', 'bm:tenis|brand=under armour|model=charged assert 10|gender=masculino'); // modelo composto é linha própria do léxico

// ---------------------------------------------------------------- roupa esportiva e acessórios (aceitos)
aceita('Camiseta Nike Park 20 Dri-Fit Masculina Treino', 'bm:camisa-de-time|brand=nike|model=park 20|gender=masculino');
aceita('Short Nike Challenger Masculino Corrida', 'bm:short|brand=nike|model=challenger|gender=masculino');
aceita('Bermuda Nike Challenger Masculina', 'bm:short|brand=nike|model=challenger|gender=masculino'); // short e bermuda = mesmo segmento
aceita('Legging Nike Pro Feminina Cintura Alta', 'bm:legging|brand=nike|model=pro|gender=feminino');
aceita('Regata Under Armour Tech Masculina Academia', 'bm:regata|brand=under armour|model=tech|gender=masculino');
aceita('Jaqueta Corta Vento Adidas Tiro 23 Masculina', 'bm:agasalho|brand=adidas|model=tiro 23|gender=masculino');
aceita('Camisa de Compressão Under Armour HeatGear Masculina Manga Longa', 'bm:roupa-de-compressao|brand=under armour|model=heatgear|gender=masculino');
aceita('Camisa Flamengo I 2024/2025 Adidas Torcedor Masculina', 'bm:camisa-de-time|brand=adidas|model=flamengo titular 2024-2025|gender=masculino');
aceita('Camisa Palmeiras II 24/25 Puma Feminina', 'bm:camisa-de-time|brand=puma|model=palmeiras reserva 2024-2025|gender=feminino');
aceita('Boné Nike Heritage86 Aba Curva Preto', 'bm:bone|brand=nike|model=heritage86');
aceita('Mochila Nike Brasilia 9.5 Treino 24L', 'bm:mochila-esportiva|brand=nike|model=brasilia 9p5|cap=24l');
aceita('Meia Nike Everyday Cushioned Cano Médio Unissex', 'bm:meia-esportiva|brand=nike|model=everyday cushioned');

// ---------------------------------------------------------------- exclusões: não novo / fora de linha
nega('Tênis Nike Air Max 90 Masculino Usado', 'usado');
nega('Tênis Nike Revolution 7 Masculino Seminovo', 'usado');
nega('Tênis Nike Air Max 90 Masculino Outlet', 'open_box');
nega('Tênis Nike Air Force 1 Retrô Masculino', 'fora_de_linha');
nega('Tênis Nike Pegasus 38 Modelo Antigo Masculino', 'fora_de_linha');
nega('Tênis Nike Revolution 7 Importado Masculino', 'importado');
nega('Tênis Nike Revolution 6 Recondicionado Masculino', 'recondicionado');

// ---------------------------------------------------------------- exclusões: réplica/falsificado
nega('Tênis Nike Air Max 90 Réplica Masculino', 'nao_original');
nega('Tênis Nike Air Max 90 Masculino Tailandês', 'replica_ou_falsificado');
nega('Tênis Nike Air Max 90 Masculino 1:1 Premium', 'replica_ou_falsificado');
nega('Tênis Estilo Nike Air Max 90 Masculino', 'replica_ou_falsificado');
nega('Tênis Inspirado Adidas Samba Unissex', 'replica_ou_falsificado');
nega('Camisa Flamengo I 2024 Adidas Versão Jogador Masculina', 'replica_ou_falsificado');
nega('Camisa Corinthians I 2024 Nike Primeira Linha Masculina', 'nao_original');

// ---------------------------------------------------------------- exclusões: lote, kit, combo
nega('Kit 3 Pares Meia Nike Everyday Cano Médio', 'lote_ou_kit');
nega('Kit Meias Esportivas Masculina Sem Marca', 'lote_ou_kit');
nega('Conjunto Nike Dri-Fit Camiseta e Short Masculino', 'lote_ou_kit');
nega('Combo 2 Camisetas Nike Park 20 Masculina', 'lote_ou_kit');
nega('Lote 10 Bonés Nike Atacado', 'lote_ou_kit');
nega('Tênis Nike Revolution 7 Masculino + Meia Brinde', 'combo_pacote');

// ---------------------------------------------------------------- exclusões: identidade incompleta e ambígua
nega('Tênis Esportivo Masculino Corrida Confortável Academia', 'sem_marca');
nega('Camiseta Dry Fit Masculina Treino Academia', 'sem_marca');
nega('Tênis Nike Revolution 7', 'sem_genero');
nega('Tênis Nike Masculino Casual Original', 'sem_modelo');
nega('Camisa Corinthians 2024 Nike Torcedor Masculina', 'sem_modelo'); // time sem o uniforme (I/II/III)
nega('Camisa Flamengo Adidas I Torcedor Masculina', 'sem_temporada');
nega('Tênis Nike Air Max 90 Air Force 1 Masculino', 'multiplos_modelos');
nega('Tênis Nike e Adidas Masculino', 'multiplas_marcas');
nega('Mochila Nike Brasilia Treino', 'sem_capacidade');

// ---------------------------------------------------------------- exclusões: fora do recorte / acessório
// Calçados além do tênis (2026-11-12): chuteira, chinelo/slide e sandália entram; sem gênero/modelo continuam negados.
for (const t of ['Chuteira Nike Mercurial Society Masculina', 'Chinelo Slide Nike Victori One Masculino', 'Chuteira Society Umbro Score Masculina']) {
  const r = avaliarTituloEsporte(t);
  check(`aceita calçado: ${t}`, r.ok, r.ok ? r.chave : { motivo: r.motivo, detalhe: r.detalhe });
}
nega('Chuteira Nike Mercurial Society', 'sem_genero');
nega('Chuteira Society Masculina Campo Original', 'sem_marca');
nega('Pantufa Nike Victori One Slide Masculino', 'fora_do_nicho'); // chinelo/slide agora entram (2026-11-12); pantufa segue fora
nega('Palmilha Gel Para Tênis Nike Esportivo', 'acessorio_ou_peca');
nega('Bota Nike Masculina Coturno', 'fora_do_recorte');
nega('Tênis Nike Bota Cano Alto Masculino', 'fora_do_nicho');
nega('Cueca Nike Boxer Masculina', 'fora_do_recorte');

// ---------------------------------------------------------------- dedup contra masters existentes (ML e Shopee)
const indice = new IndiceMasters();
indice.add({
  id: 'ml-1', name: 'Tênis Nike Revolution 7 Masculino Preto', segmento: 'tenis',
  identityKey: 'bm:tenis|brand=nike|model=revolution 7|gender=masculino|line=revolution',
  catalogAttributes: { BRAND: 'Nike', MODEL: 'Revolution 7', GENDER: 'Masculino', LINE: 'Revolution' },
});
indice.add({
  id: 'ml-2', name: 'Tênis Nike Air Max 90 Essential Masculino', segmento: 'tenis',
  catalogAttributes: { BRAND: 'Nike', MODEL: 'Air Max 90 Essential', GENDER: 'Masculino' },
});
indice.add({ id: 'ml-3', name: 'Camisa Flamengo I 2024/2025 Adidas Torcedor Masculina', segmento: 'camisa-de-time', catalogAttributes: { BRAND: 'Adidas', MODEL: 'Camisa 1 Torcedor', GENDER: 'Masculino' } });
indice.add({ id: 'ml-4', name: 'Tênis Adidas Samba OG Masculino', segmento: 'tenis', catalogAttributes: { BRAND: 'Adidas', MODEL: 'Samba OG', GENDER: 'Masculino' } });

const ok = (t: string) => {
  const r = avaliarTituloEsporte(t);
  if (!r.ok) throw new Error(`esperava aceito: ${t} (${r.motivo})`);
  return r;
};
const b1 = indice.buscar(ok('Tênis Nike Revolution 7 Masculino Azul Corrida'));
check('dedup: mesmo modelo/gênero do ML anexa ao master do ML (cor junta)', b1?.tipo === 'existente' && b1.id === 'ml-1', b1);
const b2 = indice.buscar(ok('Tênis Nike Revolution 7 Feminino Rosa'));
check('dedup: gênero diferente = outro produto (não anexa)', b2 === null, b2);
const b3 = indice.buscar(ok('Tênis Nike Air Max 90 Masculino Original'));
check('dedup: "Air Max 90" x existente "Air Max 90 Essential" vai para conferência (não cria, não anexa)', b3?.tipo === 'ambiguo' && b3.id === 'ml-2', b3);
const b4 = indice.buscar(ok('Camisa Flamengo I 2024/2025 Adidas Masculina Oficial'));
check('dedup: camisa de time casa pelo nome mesmo com MODEL do ML diferente', b4?.tipo === 'existente' && b4.id === 'ml-3', b4);
const b5 = indice.buscar(ok('Tênis Adidas Samba Masculino Original'));
check('dedup: "Samba" x existente "Samba OG" não é o mesmo texto de modelo: conferência', b5?.tipo === 'ambiguo' || b5 === null, b5);
const b6 = indice.buscar(ok('Tênis Puma Suede Masculino Casual'));
check('dedup: marca sem master existente = cria', b6 === null, b6);
const novo = ok('Tênis Puma Suede Masculino Casual');
indice.adicionar(novo, 'planejado:1');
const b7 = indice.buscar(ok('Tênis Puma Suede Masculino Preto Skate'));
check('dedup: segunda oferta do mesmo produto na MESMA execução anexa ao master planejado', b7?.tipo === 'existente' && b7.id === 'planejado:1', b7);
const b8 = indice.buscar(novo);
check('dedup: chave idêntica casa por chave', b8?.tipo === 'existente' && b8.via === 'chave', b8);

// ---------------------------------------------------------------- isca de preço
check('isca no lote: < 35% da mediana com 3+ anúncios', iscaNoLote(3000, [3000, 12000, 13000, 12500]) === true);
check('isca no lote: preço normal passa', iscaNoLote(11000, [11000, 12000, 13000, 12500]) === false);
check('isca no lote: sem 3 anúncios não julga', iscaNoLote(1000, [1000, 12000]) === false);

// ---------------------------------------------------------------- piso de preço e atributos gravados
const rev = ok('Tênis Nike Revolution 7 Masculino Preto');
check('piso de preço do tênis definido', rev.pisoCentavos > 0, rev.pisoCentavos);
const time = ok('Camisa Flamengo I 2024/2025 Adidas Torcedor Masculina');
check('camisa de time tem piso maior que camisa comum', time.pisoCentavos > ok('Camiseta Nike Park 20 Dri-Fit Masculina').pisoCentavos, [time.pisoCentavos]);
check('catalogAttributes traz BRAND, MODEL e GENDER (exigidos pela aprovação v2)', rev.catalogAttributes.BRAND === 'Nike' && rev.catalogAttributes.MODEL === 'Revolution 7' && rev.catalogAttributes.GENDER === 'Masculino', rev.catalogAttributes);
check('nome do master legível e sem cor', rev.nomeMaster === 'Tênis Nike Revolution 7 Masculino', rev.nomeMaster);
check('nome do master da camisa de time', time.nomeMaster === 'Camisa Adidas Flamengo I 2024-2025 Masculino', time.nomeMaster);

// ---------------------------------------------------------------- integração com a aprovação em bloco (critérios v2 do esporte)
const cand = (a: ReturnType<typeof ok>, nome = a.nomeMaster, extra: Partial<CandidatoMaster> = {}): CandidatoMaster => ({
  id: 'x', name: nome, vertical: 'esporte', gtin: null, mpn: null, hasImage: true,
  gate: { verdict: 'review', suggested: 'approved' }, catalogAttributes: a.catalogAttributes,
  precosClicaveis: [24900], ofertasAtivas: 1, ofertasQuarentena: 0, titulosOfertas: ['Tênis Nike Revolution 7 Masculino Preto'],
  nomeDuplicado: false, segment: a.segmento, manufacturer: a.marca.display, ...extra,
});
check('aprovação v2: master Shopee de tênis completo é aprovável', avaliarCandidato(cand(rev)).aprovavel === true, avaliarCandidato(cand(rev)));
check('aprovação v2: sem foto não aprova', avaliarCandidato(cand(rev, undefined, { hasImage: false })).motivos.includes('sem_foto'));
check('aprovação v2: dispersão > 2,5x não aprova', avaliarCandidato(cand(rev, undefined, { precosClicaveis: [10000, 30000] })).motivos.includes('amplitude_acima_de_2.5'));
const reg = ok('Regata Under Armour Tech Masculina Academia');
check('aprovação v2: regata (segmento novo) exige gênero e passa com ele', avaliarCandidato(cand(reg)).aprovavel === true, avaliarCandidato(cand(reg)));
check(
  'aprovação v2: regata sem gênero no atributo nem no nome é barrada',
  avaliarCandidato(cand(reg, 'Regata Under Armour Tech', { catalogAttributes: { BRAND: 'Under Armour', MODEL: 'Tech' } })).motivos.includes('genero_ausente')
);
check('segmentos novos exigem gênero na aprovação', ['regata', 'short', 'legging', 'agasalho', 'tenis', 'camisa-de-time', 'roupa-de-compressao'].every((k) => SEGMENTOS_ESPORTE_COM_GENERO.includes(k)));

// ---------------------------------------------------------------- termos de busca
const termos = termosEsporte();
check('termos: lista grande, única e sem vazio', termos.length > 150 && new Set(termos).size === termos.length && termos.every((t) => t.trim() === t && t.length > 3), termos.length);
check('termos: calçados (chuteira e chinelo) vêm primeiro, depois o amplo por marca', termos[0] === 'chuteira nike campo' && termos.includes('tenis nike masculino') && termos.some((t) => t.startsWith('chinelo ')), termos[0]);
check('termos: incluem modelo específico e camisa de time', termos.includes('tenis nike revolution') && termos.includes('camisa flamengo oficial'));
check('termos: nenhum com "+" literal da sintaxe do léxico', termos.every((t) => !t.includes('+') && !t.includes('|')));

console.log(`\n${total - falhas}/${total} verificações passaram.`);
process.exit(falhas ? 1 : 0);
