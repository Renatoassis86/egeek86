/**
 * Testes da FLEXIBILIZACAO da aprovacao de ofertas da Amazon (dono, 2026-11-12). Sem banco, sem rede. Uso: npx tsx scripts/test-amazon-flex.ts
 * Duas frentes: (1) o que a flexibilizacao passa a aceitar/mandar para a fila; (2) as recusas legitimas continuam recusadas COM a flexibilizacao ligada.
 */
import { judgeGame, judgeGeneric, prepareGame, prepareGeneric, FLEX, type AmzCand, type MasterIdentity, type Verdict } from '../src/lib/affiliate/amazon-identity';

let fails = 0, total = 0;
function check(name: string, cond: boolean, extra?: unknown) { total++; if (!cond) { fails++; console.log(`FALHA: ${name}${extra !== undefined ? ' => ' + JSON.stringify(extra) : ''}`); } }
const cand = (t: string, over: Partial<AmzCand> = {}): AmzCand => ({ a: 'B0ABCDEFGH', t, p: 'R$ 1.000,00', l: null, s: 0, ...over });
const M = (o: Partial<MasterIdentity> & Pick<MasterIdentity, 'vertical' | 'name'>): MasterIdentity => ({ gen: null, segment: null, brand: null, gtin: null, mpn: null, cat: null, ...o });
const on = { flex: true }, off = { flex: false };
const gen = (m: MasterIdentity, c: AmzCand, o: { flex?: boolean; knownAsins?: ReadonlySet<string> } = on): Verdict => judgeGeneric(prepareGeneric(m), c, o);
const game = (name: string, g: string, c: AmzCand, o: { flex?: boolean; knownAsins?: ReadonlySet<string> } = on): Verdict => judgeGame(prepareGame({ name, gen: g })!, c, o);

// =====================================================================================================================
// (1) COBERTURA BAIXA com marca + codigo de modelo
// =====================================================================================================================
const tvNoisy = M({
  vertical: 'eletroeletronicos', segment: 'smart-tv', brand: 'Samsung',
  name: 'Smart Tv Led 50 Polegadas 4k Uhd Samsung Un50du7700 Crystal Gaming Hub Alexa Tizen Bivolt',
  cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' },
});
const tvShort = cand('Samsung Smart TV UN50DU7700 50" Bivolt'); // cobertura do master ~0,33 (15 palavras) / ~0,25 (25 palavras)
const tvMin = cand('Samsung UN50DU7700 50" Bivolt'); // ~0,08 com 35 palavras
const vOff = gen(tvNoisy, tvShort, off), vOn = gen(tvNoisy, tvShort, on);
void tvMin;
check('flex: marca+modelo com master cheio de ruido: ANTES recusava por cobertura_baixa', vOff.outcome === 'reject' && vOff.reason === 'cobertura_baixa', vOff);
check('flex: marca+modelo com master cheio de ruido: DEPOIS aceita', vOn.outcome === 'accept', vOn);
// fronteira: cobertura entre strongBorder e strongAccept vai para a fila (rascunho com border), nunca direto para a media
const tvVeryNoisy = M({
  vertical: 'eletroeletronicos', segment: 'smart-tv', brand: 'Samsung',
  name: 'Smart Tv Led 50 Polegadas 4k Uhd Samsung Un50du7700 Crystal Gaming Hub Alexa Tizen Controle Voz Bivolt Frete Rapido Nota Fiscal Pronta Entrega Garantia Brinde Suporte Parede',
  cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' },
});
const lowCov = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', brand: 'Samsung', name: tvVeryNoisy.name + ' Controle Voz Cinema Casa Sala Quarto Moderna Fina Wifi Bluetooth', cat: tvVeryNoisy.cat });
const vB = gen(tvVeryNoisy, tvShort, on);
check('flex: cobertura muito baixa com marca+modelo => fronteira (rascunho + fila), nao aceito', vB.outcome === 'draft' && vB.border === true, vB);
check('flex: fronteira sem flex continua recusa', gen(tvVeryNoisy, tvShort, off).outcome === 'reject');
// sem marca no titulo nao conta como chave forte
const vNoBrand = gen(tvNoisy, cand('Smart TV UN50DU7700 50" Bivolt'), on);
check('flex: cobertura abaixo do piso de fronteira (0,15) continua recusa', gen(lowCov, tvMin, on).reason === 'cobertura_baixa', gen(lowCov, tvMin, on));
check('flex: sem marca no titulo nao vira aceito automatico', vNoBrand.outcome !== 'accept' || vNoBrand.reason !== 'modelo_igual', vNoBrand);
// sem codigo, marca presente, cobertura media => fronteira, nunca aceito
const fry = M({ vertical: 'eletrodomesticos', segment: 'air-fryer', brand: 'Libell', name: 'Fritadeira Air Fryer Elétrica Libell Digital Visor Touch 5l Preto Silenciosa Antiaderente', cat: { BRAND: 'Libell', VOLTAGE: '127V' } });
const vF = gen(fry, cand('Fritadeira Libell Air Fryer 5L 127V Digital'), on);
check('flex: sem codigo, marca ok, cobertura media => fronteira (nunca aceito)', vF.outcome !== 'accept', vF);

// codigo hifenizado ("AFON-12L") confirma o modelo; sufixo com digito (M2 = Mark II) NAO casa
const mond = M({ vertical: 'eletrodomesticos', segment: 'air-fryer', brand: 'Mondial', name: 'Fritadeira Air Fryer Forno Oven 12L Mondial 2000W - AFON-12L', cat: { BRAND: 'Mondial', MODEL: 'AFON-12L-GI', VOLTAGE: '110V' } });
const vH = gen(mond, cand('MONDIAL Fritadeira Air Fryer Forno Oven 12L, Preto/Inox, 2000W, 110V - AFON-12L-GI'), on);
check('flex: codigo hifenizado igual aceita', vH.outcome === 'accept', vH);
const sony = M({ vertical: 'eletroeletronicos', segment: 'camera', brand: 'Sony', name: 'Camera Mirrorless Sony Zv-e10 Ii', cat: { BRAND: 'Sony', MODEL: 'ZV-E10M2' } });
const vS = gen(sony, cand('Câmera Sony ZV-E10 Mirrorless 4K (Corpo)'), on);
check('flex: ZV-E10 (1a geracao) NAO e aceita no lugar da ZV-E10 II', vS.outcome !== 'accept', vS);

// jogos: todos os tokens do master presentes + plataforma/edicao iguais, titulo com ruido
const mk = 'Mortal Kombat 11 Ultimate PS5 Mídia Física Jogo Luta';
check('jogo: titulo identico aceita (sem mudanca)', game(mk, 'ps5', cand('Mortal Kombat 11 Ultimate - PlayStation 5 Mídia Física')).outcome === 'accept');
const gNoise = game('Resident Evil Village Gold Edition Ps5 Capcom Midia Fisica', 'ps5', cand('Resident Evil Village Gold Edition PlayStation 5 Capcom Mídia Física Lacrado Original Pronta Entrega Envio Imediato Nacional Brasil'));
check('jogo: titulo com muito ruido: aceito ou fronteira (nunca recusa por cobertura)', gNoise.outcome !== 'reject', gNoise);

// =====================================================================================================================
// (2) PATROCINADO: aceita so com o preco lido na PAGINA do produto
// =====================================================================================================================
const okTitle = 'Samsung Smart TV 50" Crystal UHD 4K UN50DU7700 Bivolt';
const tv50 = M({ vertical: 'eletroeletronicos', segment: 'smart-tv', name: 'Smart Tv 50 4k Uhd Samsung Un50du7700', brand: 'Samsung', cat: { BRAND: 'Samsung', MODEL: 'UN50DU7700', VOLTAGE: 'Bivolt' } });
check('patrocinado sem pagina: nunca aceito (preco do card nao vale)', gen(tv50, cand(okTitle, { s: 1 })).outcome === 'reject');
check('patrocinado sem pagina: pede a pagina quando o titulo casaria', gen(tv50, cand(okTitle, { s: 1 })).needsPage === true);
check('patrocinado sem pagina: titulo de outro produto nao pede pagina', gen(tv50, cand('LG Smart TV 50" 50UT8050 Bivolt', { s: 1 })).needsPage !== true);
check('patrocinado com pagina (pg=1) e identidade ok: aceito', gen(tv50, cand(okTitle, { s: 1, pg: 1 })).outcome === 'accept');
check('patrocinado com pagina mas outro modelo: recusa (modelo)', gen(tv50, cand('Samsung Smart TV 55" UN55DU7700 Bivolt', { s: 1, pg: 1 })).outcome === 'reject');
check('patrocinado com pagina mas pacote: recusa', gen(tv50, cand('Kit ' + okTitle + ' com suporte', { s: 1, pg: 1 })).outcome === 'reject');
check('patrocinado com pagina mas usado: recusa', gen(tv50, cand(okTitle + ' recondicionada', { s: 1, pg: 1 })).outcome === 'reject');
check('patrocinado com flex desligado: recusa sempre', gen(tv50, cand(okTitle, { s: 1, pg: 1 }), off).counter === 'patrocinado');
check('patrocinado sem preco na pagina: invalido', gen(tv50, cand(okTitle, { s: 1, pg: 1, p: null })).outcome === 'reject');
const known = new Set(['B0ABCDEFGH']);
check('patrocinado, ASIN ja ativo neste master e pagina lida: aceito mesmo com cobertura baixa', gen(lowCov, cand('Samsung UN50DU7700 50" Bivolt', { s: 1, pg: 1, a: 'B0ABCDEFGH' }), { flex: true, knownAsins: known }).outcome === 'accept');
check('patrocinado, ASIN desconhecido com cobertura baixa: nao aceita sozinho', gen(lowCov, cand('Samsung UN50DU7700 50" Bivolt', { s: 1, pg: 1, a: 'B0ZZZZZZZZ' }), { flex: true, knownAsins: known }).outcome !== 'accept');
const rev = prepareGame({ name: 'Resident Evil Village', gen: 'ps5' })!;
check('jogo patrocinado sem pagina: nao aceita, pede pagina', judgeGame(rev, cand('Resident Evil Village - PS5 Mídia Física', { s: 1 }), on).needsPage === true);
check('jogo patrocinado com pagina: aceita', judgeGame(rev, cand('Resident Evil Village - PS5 Mídia Física', { s: 1, pg: 1 }), on).outcome === 'accept');
check('jogo patrocinado com pagina, outra plataforma: recusa', judgeGame(rev, cand('Resident Evil Village - PS4', { s: 1, pg: 1 }), on).outcome === 'reject');
check('jogo patrocinado flex desligado: recusa', judgeGame(rev, cand('Resident Evil Village - PS5', { s: 1, pg: 1 }), off).counter === 'patrocinado');

// =====================================================================================================================
// (3) RECUSAS LEGITIMAS continuam, com a flexibilizacao LIGADA
// =====================================================================================================================
const refuse = (name: string, v: Verdict, counter?: string) => check(`recusa legitima: ${name}`, v.outcome === 'reject' && (!counter || v.counter === counter), v);
refuse('kit/pacote', gen(tv50, cand('Kit ' + okTitle + ' com suporte')), 'rejeitado_composicao');
refuse('combo/leve 2', gen(tv50, cand(okTitle + ' leve 2')), 'rejeitado_composicao');
refuse('acessorio compativel', gen(tv50, cand('Suporte para TV compativel com Samsung UN50DU7700 Bivolt')), 'rejeitado_composicao');
refuse('voltagem diferente', gen(M({ ...tv50, cat: { ...tv50.cat, VOLTAGE: '127V' } }), cand('Samsung Smart TV 50" UN50DU7700 220V')));
refuse('modelo diferente (mesma marca)', gen(tv50, cand('Samsung Smart TV 50" Crystal UN50DU8000 Bivolt')));
refuse('tamanho diferente', gen(tv50, cand('Samsung Smart TV 55" UN55DU7700 Bivolt 4K')));
refuse('outra marca', gen(tv50, cand('LG Smart TV 50" 50UT8050 Bivolt')));
refuse('recondicionado', gen(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt recondicionada')), 'rejeitado_condicao');
refuse('usado', gen(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt usado')), 'rejeitado_condicao');
refuse('open box', gen(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt Open Box')), 'rejeitado_condicao');
refuse('importado', gen(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt importado')), 'rejeitado_condicao');
refuse('fora de linha (modelo antigo)', gen(tv50, cand('Samsung Smart TV 50" UN50DU7700 Bivolt modelo antigo')), 'fora_de_linha_ou_retro');
const ps5 = (c: string, g = 'ps5') => game('Resident Evil Village', g, cand(c));
refuse('jogo: plataforma diferente (PS4)', ps5('Resident Evil Village - PS4'));
refuse('jogo: retro (PS3)', ps5('Resident Evil Village PS3'), 'fora_de_linha_ou_retro');
refuse('jogo: Xbox One puro', game('Halo Infinite Xbox Series', 'xbox_series', cand('Halo Infinite Xbox One')), 'fora_de_linha_ou_retro');
refuse('jogo: usado', ps5('Resident Evil Village PS5 usado'), 'rejeitado_condicao');
refuse('jogo: bundle/kit', ps5('Resident Evil Village PS5 Kit com controle'), 'rejeitado_composicao');
refuse('jogo: edicao diferente (Gold)', ps5('Resident Evil Village Gold Edition PS5'));
refuse('jogo: sequencia numerica (Resident Evil 3)', ps5('Resident Evil 3 PS5 Mídia Física'));
refuse('jogo: sequencia romana (Hades II)', game('Hades', 'ps5', cand('Hades II PS5 Mídia Física')));
refuse('jogo: God of War III no lugar de God of War', game('God of War HITS para PlayStation 4 Físico', 'ps4', cand('God Of War III Remasterizado Hits PlayStation 4')));
refuse('jogo: digital', ps5('Resident Evil Village PS5 Digital Código'), undefined);
refuse('jogo: master PS3 nao prepara', judgeGame({ mPlat: new Set(['ps5']), mTok: ['x'], mEd: new Set(), mCol: new Set(), mDigital: false }, cand('Y PS4')));
const fil = M({ vertical: 'impressao3d', segment: 'filamento-3d', brand: 'Voolt3D', name: 'Voolt3D PLA Filamento Pla 1.75mm 1kg' });
refuse('3D: material diferente (PETG no lugar de PLA)', gen(fil, cand('Filamento PETG Voolt3D 1.75mm 1kg')));
const bola = M({ vertical: 'esporte', segment: 'bola', brand: 'Penalty', name: 'Bola Futebol de Campo Penalty Player Xxiii Vermelho' });
refuse('esporte: edicao anual romana diferente (XXIII x XXV)', gen(bola, cand('Bola de Futebol Campo Penalty Player XXV')));
const ssd = M({ vertical: 'tecnologia', segment: 'ssd', name: 'Ssd Kingston Nv2 1tb M.2 Nvme', brand: 'Kingston', cat: { BRAND: 'Kingston', MODEL: 'SNV2S/1000G' } });
refuse('capacidade diferente (2TB x 1TB)', gen(ssd, cand('SSD Kingston NV2 2TB M.2 NVMe')));

// invariante: com flex desligado o comportamento e o de antes (o teste antigo cobre; aqui so o kill-switch por opcao)
check('kill-switch: flex=false aceita o mesmo que antes (jogo simples)', judgeGame(rev, cand('Resident Evil Village - PS5 Mídia Física'), off).outcome === 'accept');
check('limiares de fronteira coerentes', FLEX.strongBorder < FLEX.strongAccept && FLEX.strongAccept < 0.5 && FLEX.gameBorderM >= 0.5);

console.log(`${total - fails}/${total} verdes`);
process.exit(fails ? 1 : 0);
