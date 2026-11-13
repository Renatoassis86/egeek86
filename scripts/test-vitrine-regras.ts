/**
 * TESTE DAS REGRAS DAS VITRINES (checklist da nova versão, itens #7 e #8). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-vitrine-regras.ts
 * Sai com código 1 se algo FALHAR. O banco só recebe SELECT (sem DATABASE_URL a parte de banco é pulada) e NADA é gravado
 * (a parte de banco usa o calculo direto, nunca o snapshot persistido).
 *
 * (a) puras: destaques (queda de 5% a 50%, acima do normal exclui, vendedor fraco exclui, base curta exclui, leitura de 6 h),
 *     1 item por master, vitrine com menos de 4 itens some, quantidades 12/10/6/8, ordem por queda real, menor registrado
 *     corroborado, mudanças do menor preço, Plus sem selo nem média.
 * (b) estáticas: nenhum SELECT em affiliate_price_snapshots nos loaders, SET LOCAL statement_timeout em toda consulta, sem any.
 * (c) banco (SELECT): invariantes sobre as vitrines reais calculadas agora.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  VITRINE_REGRAS,
  ehEmbalagemAvulsa,
  selecionar,
  todasAsChaves,
  type Candidato,
  type ContextoAvaliacao,
  type VitrineChave,
} from '../src/lib/vitrines';

let fails = 0;
let total = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  total++;
  if (!ok) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
};

const AGORA = new Date('2026-11-13T15:00:00Z');
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();
const ctx: ContextoAvaliacao = { agora: AGORA, ocultos: new Set(), tipoEfetivo: new Map() };
let seq = 0;
const mk = (over: Partial<Candidato> = {}): Candidato => {
  seq++;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  return {
    masterProductId: id,
    offerId: `0000aaaa-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `jogo-${seq}`,
    tituloOferta: `Jogo Teste ${seq} PS5 Mídia Física`,
    nomeMaster: `Jogo Teste ${seq} PS5`,
    imagemUrl: 'https://exemplo.com/img.jpg',
    tipoDb: 'game',
    plataformaDb: 'ps5',
    formatoDb: 'physical',
    edicaoDb: 'full_game',
    precoCentavos: 15000,
    loja: 'Mercado Livre',
    lojaSlug: 'mercado-livre',
    lidoEm: horasAtras(1),
    ofertasAtivas: 3,
    lojasAtivas: 2,
    vendedoresProximos: 2,
    vendedor: { reputationLevel: '5_green', powerSellerStatus: 'gold', totalSales: 500 },
    stats: { avgCents: 20000, quoteCount: 10, historyDays: 30, lowConfidence: false, lowAllCents: 14800, lowAllAt: '2026-11-01T10:00:00Z', lowBadgeBlock: null },
    ...over,
  };
};
const comStats = (over: Partial<NonNullable<Candidato['stats']>>): Candidato['stats'] => ({ avgCents: 20000, quoteCount: 10, historyDays: 30, lowConfidence: false, lowAllCents: 14800, lowAllAt: '2026-11-01T10:00:00Z', lowBadgeBlock: null, ...over });
/** Console realista (regra única de console: preço compatível com o aparelho e título que o anuncia). */
const PRECO_CONSOLE = { precoCentavos: 350000, stats: { avgCents: 450000, quoteCount: 10, historyDays: 30, lowConfidence: false, lowAllCents: 346000, lowAllAt: '2026-11-01T10:00:00Z', lowBadgeBlock: null } } as const;
const quatro = (f: () => Candidato) => [f(), f(), f(), f()];
const itensIds = (chave: VitrineChave, xs: Candidato[]) => new Set(selecionar(chave, xs, ctx).itens.map((i) => i.masterProductId));

// ---------------------------------------------------------------------------
// (a) puras
// ---------------------------------------------------------------------------
{
  const bons = quatro(() => mk());
  const r = selecionar('destaques', bons, ctx);
  check('destaques: 4 itens elegíveis aparecem', r.itens.length === 4, r.itens.length);
  check('destaques: posição abaixo e média preenchida', r.itens.every((i) => i.posicao.tipo === 'abaixo' && i.media?.centavos === 20000), r.itens[0]);
  check('destaques: href aponta para /ofertas/<slug>', r.itens.every((i) => i.href === `/ofertas/${i.slug}`));
  check('destaques: lidoEm preenchido (R-39)', r.itens.every((i) => /^\d{4}-\d{2}-\d{2}T/.test(i.lidoEm)));

  // Exclusões individuais: cada uma isolada entre 4 itens bons; o item ruim não pode aparecer e os 4 bons continuam.
  const excl: Array<[string, Candidato]> = [
    ['acima do normal', mk({ precoCentavos: 26000 })],
    ['em linha (queda < 5%) fora dos destaques', mk({ precoCentavos: 19500 })],
    ['queda acima de 50%', mk({ precoCentavos: 9000 })],
    ['base curta (4 cotações)', mk({ stats: comStats({ quoteCount: 4 }) })],
    ['base curta (13 dias)', mk({ stats: comStats({ historyDays: 13 }) })],
    ['sem estatística', mk({ stats: null })],
    ['vendedor fraco (vermelho)', mk({ vendedor: { reputationLevel: '1_red', powerSellerStatus: null, totalSales: 3 } })],
    ['leitura com mais de 6 h', mk({ lidoEm: horasAtras(7) })],
    ['sem leitura', mk({ lidoEm: null })],
    ['plataforma unknown', mk({ plataformaDb: 'unknown', tituloOferta: 'Jogo Sem Plataforma Midia Fisica', nomeMaster: 'Jogo Sem Plataforma' })],
    ['Xbox One no banco', mk({ plataformaDb: 'xbox_one', tituloOferta: 'Jogo Teste Xbox One Midia Fisica' })],
    ['Xbox 360 no banco', mk({ plataformaDb: 'xbox_360', tituloOferta: 'Jogo Teste Xbox 360 Midia Fisica' })],
    ['Xbox One só no título', mk({ plataformaDb: 'xbox_series', tituloOferta: 'Jogo Teste Xbox One Midia Fisica' })],
    ['Open Box', mk({ tituloOferta: 'Jogo Teste PS5 Open Box Mídia Física' })],
    ['usado', mk({ tituloOferta: 'Jogo Teste PS5 Usado Mídia Física' })],
    ['retrô (PS2)', mk({ plataformaDb: 'unknown', tituloOferta: 'Jogo Teste PlayStation 2 Midia Fisica', nomeMaster: 'Jogo Teste PS2' })],
    ['sem imagem', mk({ imagemUrl: null })],
    ['DLC', mk({ edicaoDb: 'dlc' })],
    ['preço zero', mk({ precoCentavos: 0 })],
  ];
  for (const [nome, ruim] of excl) {
    const r2 = itensIds('destaques', [...bons, ruim]);
    check(`destaques exclui: ${nome}`, !r2.has(ruim.masterProductId) && r2.size === 4, { tem: r2.has(ruim.masterProductId), n: r2.size });
  }
  const fraco = mk({ vendedor: { reputationLevel: null, powerSellerStatus: null, totalSales: null } });
  check('vendedor sem dado (Shopee) NÃO é fraco', itensIds('destaques', [...bons, fraco]).has(fraco.masterProductId));
  const hide = mk({});
  const ctxOculto: ContextoAvaliacao = { ...ctx, ocultos: new Set([hide.masterProductId]) };
  check('porteiro oculto exclui (contexto)', !selecionar('destaques', [...bons, hide], ctxOculto).itens.some((i) => i.masterProductId === hide.masterProductId));
  const moved = mk({ tipoDb: 'game', tituloOferta: 'Console PlayStation 5 Digital', nomeMaster: 'Console PlayStation 5 Digital', ...PRECO_CONSOLE });
  const ctxMov: ContextoAvaliacao = { ...ctx, tipoEfetivo: new Map([[moved.masterProductId, 'console']]) };
  check('tipo efetivo do porteiro manda sobre o gravado', selecionar('plataforma:ps5:consoles', [moved, ...quatro(() => mk({ tipoDb: 'console', formatoDb: 'unknown', tituloOferta: 'Console PS5 Slim 1TB', nomeMaster: 'Console PS5 Slim 1TB', ...PRECO_CONSOLE }))], ctxMov).itens.some((i) => i.masterProductId === moved.masterProductId));

  // Vitrine com menos de 4 itens some.
  check('vitrine com 3 itens some', selecionar('destaques', quatro(() => mk()).slice(0, 3), ctx).itens.length === 0);
  check('vitrine com 3 itens: elegíveis contados', selecionar('destaques', quatro(() => mk()).slice(0, 3), ctx).elegiveis === 3);
  check('vitrine com 0 itens some', selecionar('destaques', [], ctx).itens.length === 0);

  // 1 item por master.
  const m1 = mk();
  const dup = { ...m1, offerId: 'x-2', slug: 'dup-2', precoCentavos: 14000 };
  const rDup = selecionar('destaques', [m1, dup, ...quatro(() => mk())], ctx);
  check('1 item por master', rDup.itens.filter((i) => i.masterProductId === m1.masterProductId).length === 1, rDup.itens.length);

  // Quantidades.
  const muitos = Array.from({ length: 30 }, () => mk());
  check('destaques cortam em 12', selecionar('destaques', muitos, ctx).itens.length === VITRINE_REGRAS.DESTAQUES);
  check('faixa de jogos corta em 10', selecionar('plataforma:ps5:jogos', muitos, ctx).itens.length === VITRINE_REGRAS.JOGOS_POR_FAIXA);
  const consoles = Array.from({ length: 12 }, () => mk({ tipoDb: 'console', formatoDb: 'unknown', tituloOferta: 'Console PlayStation 5 Slim', nomeMaster: 'Console PS5 Slim', ...PRECO_CONSOLE }));
  // Regra única de console (dono, 2026-11-13): peça, base, motor, frontal, adesivo, cartela e jogo NUNCA entram na faixa de consoles.
  const ruins = ['Motor 5,9v para Playstation e DVD', 'Frontal PS5 Slim e Fat Spider-Man 3D', 'Base Horizontal para Playstation 5', 'Motor RF-300 para robótica', '10 Cartelas Abraçadeira 5 Pçs 15,8mm', 'Splatoon 3 adesivos personagens'];
  for (const t of ruins) {
    const ruim = mk({ tipoDb: 'console', formatoDb: 'unknown', tituloOferta: t, nomeMaster: t, ...PRECO_CONSOLE });
    const sel = selecionar('plataforma:ps5:consoles', [ruim, ...consoles.slice(0, 4)], ctx);
    check(`faixa de consoles exclui peça: ${t}`, !sel.itens.some((i) => i.masterProductId === ruim.masterProductId) && sel.itens.length === 4, { n: sel.itens.length, motivos: sel.motivos });
  }
  const barato = mk({ tipoDb: 'console', formatoDb: 'unknown', tituloOferta: 'Console PlayStation 5 Slim', nomeMaster: 'Console PS5 Slim', precoCentavos: 9000 });
  check('faixa de consoles exclui "console" por R$ 90 (preço incompatível)', !selecionar('plataforma:ps5:consoles', [barato, ...consoles.slice(0, 4)], ctx).itens.some((i) => i.masterProductId === barato.masterProductId));
  check('faixa de consoles corta em 6', selecionar('plataforma:ps5:consoles', consoles, ctx).itens.length === VITRINE_REGRAS.CONSOLES_POR_FAIXA);
  check('consoles não entram na faixa de jogos', selecionar('plataforma:ps5:jogos', [...consoles, ...quatro(() => mk())], ctx).itens.every((i) => i.tipo === 'jogo'));
  const acess = Array.from({ length: 12 }, () => mk({ tipoDb: 'accessory', formatoDb: 'unknown', tituloOferta: 'Controle DualSense PS5 Branco', nomeMaster: 'Controle DualSense PS5' }));
  check('acessórios cortam em 8', selecionar('acessorios', acess, ctx).itens.length === VITRINE_REGRAS.ACESSORIOS);
  check('acessórios só têm acessório', selecionar('acessorios', [...acess, ...muitos], ctx).itens.every((i) => i.tipo === 'acessorio'));

  // Faixa: leitura de até 24 h vale (destaques exige 6 h); em linha vale na faixa e não nos destaques.
  const velhos = quatro(() => mk({ lidoEm: horasAtras(20) }));
  check('faixa aceita leitura de 20 h', selecionar('plataforma:ps5:jogos', velhos, ctx).itens.length === 4);
  check('destaques recusam leitura de 20 h', selecionar('destaques', velhos, ctx).itens.length === 0);
  const velhos2 = quatro(() => mk({ lidoEm: horasAtras(30) }));
  check('faixa recusa leitura de 30 h', selecionar('plataforma:ps5:jogos', velhos2, ctx).itens.length === 0);
  const linha = quatro(() => mk({ precoCentavos: 19500 }));
  check('faixa aceita "em linha"', selecionar('plataforma:ps5:jogos', linha, ctx).itens.length === 4 && selecionar('plataforma:ps5:jogos', linha, ctx).itens.every((i) => i.posicao.tipo === 'em_linha'));
  check('faixa exclui "acima do normal"', selecionar('plataforma:ps5:jogos', quatro(() => mk({ precoCentavos: 26000 })), ctx).itens.length === 0);
  check('jogo digital fica fora da faixa de jogos', selecionar('plataforma:ps5:jogos', quatro(() => mk({ formatoDb: 'digital', tituloOferta: 'Jogo Digital PS5 Chave' })), ctx).itens.length === 0);

  // Ordem: maior queda primeiro, empate pelo menor preço.
  const o1 = mk({ precoCentavos: 16000 }); // 20%
  const o2 = mk({ precoCentavos: 12000 }); // 40%
  const o3 = mk({ precoCentavos: 14000 }); // 30%
  const o4 = mk({ precoCentavos: 18000 }); // 10%
  const ord = selecionar('destaques', [o1, o2, o3, o4], ctx).itens.map((i) => i.masterProductId);
  check('ordem por maior queda real', ord.join() === [o2, o3, o1, o4].map((c) => c.masterProductId).join(), ord);
  const t1 = mk({ precoCentavos: 15000, stats: comStats({ avgCents: 20000 }) });
  const t2 = mk({ precoCentavos: 30000, stats: comStats({ avgCents: 40000 }) }); // mesma queda, preço maior
  const ord2 = selecionar('destaques', [t2, t1, o1, o4], ctx).itens.map((i) => i.masterProductId);
  check('desempate pelo menor preço', ord2.indexOf(t1.masterProductId) < ord2.indexOf(t2.masterProductId), ord2);

  // Menor registrado: no menor (régua 3%) E corroborado (2 vendedores em +-10%).
  const mr = quatro(() => mk({ precoCentavos: 15000, stats: comStats({ lowAllCents: 14800 }), vendedoresProximos: 2 }));
  check('menor registrado: 4 corroborados aparecem', selecionar('menor-registrado', mr, ctx).itens.length === 4);
  const semCorr = mk({ precoCentavos: 15000, stats: comStats({ lowAllCents: 14800 }), vendedoresProximos: 1 });
  check('menor registrado exige corroboração', !itensIds('menor-registrado', [...mr, semCorr]).has(semCorr.masterProductId));
  const longe = mk({ precoCentavos: 16000, stats: comStats({ lowAllCents: 14800 }), vendedoresProximos: 3 });
  check('menor registrado exige estar na régua de 3%', !itensIds('menor-registrado', [...mr, longe]).has(longe.masterProductId));
  const bloq = mk({ precoCentavos: 15000, stats: comStats({ lowAllCents: 14800, lowBadgeBlock: 'low_confidence' }), vendedoresProximos: 3 });
  check('menor registrado respeita o bloqueio do selo', !itensIds('menor-registrado', [...mr, bloq]).has(bloq.masterProductId));

  // Embalagem / acessório com nome de jogo.
  check('encarte de jogo é embalagem', ehEmbalagemAvulsa('Encarte Original God of War Ragnarok PS4', 'acessorio'));
  check('capa de jogo é embalagem', ehEmbalagemAvulsa('Capa Jogo Zelda Breath of the Wild Switch', 'acessorio'));
  check('caixa vazia de jogo é embalagem', ehEmbalagemAvulsa('Caixa Vazia Mario Kart 8 Switch', 'acessorio'));
  check('capa protetora de controle NÃO é embalagem', !ehEmbalagemAvulsa('Capa protetora de silicone para controle PS5 DualSense', 'acessorio'));
  check('caixa de som NÃO é embalagem', !ehEmbalagemAvulsa('Caixa de som Bluetooth Gamer RGB', 'acessorio'));
  check('jogo com "caixa" no nome não é barrado', !ehEmbalagemAvulsa('Jogo Caixa de Pandora PS5 Midia Fisica', 'jogo'));
  const emb = mk({ tipoDb: 'accessory', formatoDb: 'unknown', tituloOferta: 'Encarte Zelda Switch Original', nomeMaster: 'Encarte Zelda' });
  check('acessório com encarte fica fora da vitrine', !itensIds('acessorios', [...acess, emb]).has(emb.masterProductId));
  const cap = mk({ precoCentavos: 12000, tipoDb: 'accessory', formatoDb: 'unknown', tituloOferta: 'Capa Protetora Silicone Controle PS5', nomeMaster: 'Capa Controle PS5' });
  check('capa protetora de controle é item miúdo: fora (dono, 2026-11-13)', !itensIds('acessorios', [...acess, cap]).has(cap.masterProductId));

  // Chaves e quantidades de vitrine.
  const chaves = todasAsChaves();
  check('18 chaves de vitrine', chaves.length === 18, chaves.length);
  check('chaves únicas', new Set(chaves).size === chaves.length);
  check('limites: 12/8/10/6/8/6/6', VITRINE_REGRAS.DESTAQUES === 12 && VITRINE_REGRAS.MUDANCAS === 8 && VITRINE_REGRAS.JOGOS_POR_FAIXA === 10 && VITRINE_REGRAS.CONSOLES_POR_FAIXA === 6 && VITRINE_REGRAS.ACESSORIOS === 8 && VITRINE_REGRAS.COLECIONAVEIS === 6 && VITRINE_REGRAS.PLUS_DEPARTAMENTOS === 6);
  check('pisos: 5 cotações, 14 dias, queda 5% a 50%, mínimo 4 itens', VITRINE_REGRAS.PISO_COTACOES === 5 && VITRINE_REGRAS.PISO_DIAS === 14 && VITRINE_REGRAS.QUEDA_MIN_PCT === 5 && VITRINE_REGRAS.QUEDA_MAX_PCT === 50 && VITRINE_REGRAS.MIN_ITENS === 4);
}

// ---------------------------------------------------------------------------
// (b) estáticas
// ---------------------------------------------------------------------------
const ROOT = process.cwd();
const dirServer = path.join(ROOT, 'src/server/vitrines');
const dirLib = path.join(ROOT, 'src/lib/vitrines');
const lerDir = (d: string) => fs.readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => ({ f, s: fs.readFileSync(path.join(d, f), 'utf8') }));
for (const { f, s } of [...lerDir(dirServer), ...lerDir(dirLib)]) {
  const semComentario = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check(`${f}: sem any`, !/:\s*any\b|<any>|\bas any\b/.test(semComentario));
  check(`${f}: sem escrita no banco (INSERT/UPDATE/DELETE)`, !/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM)\b/i.test(semComentario));
  check(`${f}: nenhuma varredura de cotação (affiliate_price_snapshots)`, !/affiliate_price_snapshots/.test(semComentario));
}
const pool = fs.readFileSync(path.join(dirServer, 'pool.ts'), 'utf8');
const mud = fs.readFileSync(path.join(dirServer, 'mudancas.ts'), 'utf8');
check('pool: SET LOCAL statement_timeout', /SET LOCAL statement_timeout/.test(pool));
check('pool: SET LOCAL lock_timeout', /SET LOCAL lock_timeout/.test(pool));
check('mudanças: SET LOCAL statement_timeout', /SET LOCAL statement_timeout/.test(mud));
check('pool: cadastro só por PK (ANY de ids), sem varredura de master', /o\.id = ANY\(/.test(pool));
check('pool: lê a estatística pré-calculada, não recalcula', /product_price_stats/.test(pool) && !/statsAggCtes|priceQuotesCtes|q_all/.test(pool));
const getv = fs.readFileSync(path.join(dirServer, 'get-vitrine.ts'), 'utf8');
check('getVitrine: consulta persistida com teto de 3 a 5 s e maxStale de 24 h', /createPersistedQuery/.test(getv) && /coldTimeoutSeconds:\s*4/.test(getv) && /maxStaleSeconds:\s*24 \* 3600/.test(getv));
check('getVitrine: falha vira vitrine oculta, nunca erro', /catch \(e\)[\s\S]*oculta\(/.test(getv));

// ---------------------------------------------------------------------------
// (c) banco (SELECT)
// ---------------------------------------------------------------------------
async function banco() {
  if (!process.env.DATABASE_URL) {
    console.log('INFO: sem DATABASE_URL, parte de banco pulada');
    return;
  }
  const { calcularVitrine } = await import('../src/server/vitrines/get-vitrine');
  const { limiteDaChave } = await import('../src/lib/vitrines');
  const t0 = Date.now();
  const res = [];
  for (const k of todasAsChaves()) res.push(await calcularVitrine(k));
  console.log(`INFO: 18 vitrines calculadas em ${Date.now() - t0} ms`);
  const xboxAntigo = /xbox ?(one|360)\b|\bx360\b|\bxone\b/i;
  const usado = /open ?box|\busad[oa]s?\b|seminov|recondicionad|\bloose\b/i;
  let totalItens = 0;
  for (const r of res) {
    const n = r.itens.length;
    totalItens += n;
    check(`[${r.chave}] visível sse tem >= 4 itens`, r.visivel === (n >= VITRINE_REGRAS.MIN_ITENS), { n, visivel: r.visivel });
    check(`[${r.chave}] no máximo ${limiteDaChave(r.chave)} itens`, n <= limiteDaChave(r.chave), n);
    check(`[${r.chave}] 1 item por master`, new Set(r.itens.map((i) => i.masterProductId)).size === n);
    check(`[${r.chave}] oculta tem motivo`, r.visivel || !!r.motivoOculta);
    for (const i of r.itens) {
      check(`[${r.chave}] ${i.masterProductId.slice(0, 8)}: imagem, preço e horário`, !!i.imagemUrl && i.precoCentavos > 0 && !Number.isNaN(Date.parse(i.lidoEm)), i);
      check(`[${r.chave}] ${i.masterProductId.slice(0, 8)}: sem Xbox One/360, usado ou Open Box no título`, !xboxAntigo.test(i.titulo) && !usado.test(i.titulo), i.titulo);
      if (r.chave !== 'plus') check(`[${r.chave}] ${i.masterProductId.slice(0, 8)}: plataforma conhecida`, i.plataforma != null);
      if (r.chave === 'plus') check(`[plus] ${i.departamento}: sem selo nem média`, i.media == null && i.menorRegistrado == null && i.posicao.tipo === 'sem_base');
      if (r.chave === 'destaques') {
        check(`[destaques] ${i.masterProductId.slice(0, 8)}: abaixo da média entre 5% e 50%`, i.posicao.tipo === 'abaixo' && i.posicao.pct >= 5 && i.posicao.pct <= 50, i.posicao);
        check(`[destaques] ${i.masterProductId.slice(0, 8)}: base de 5 cotações e 14 dias`, !!i.media && i.media.cotacoes >= 5 && i.media.dias >= 14, i.media);
        check(`[destaques] ${i.masterProductId.slice(0, 8)}: leitura de até 6 h`, (Date.now() - Date.parse(i.lidoEm)) / 3_600_000 <= 6.1, i.lidoEm);
      } else if (r.chave !== 'plus' && r.chave !== 'mudancas') {
        check(`[${r.chave}] ${i.masterProductId.slice(0, 8)}: nunca acima do normal e com base`, i.posicao.tipo === 'abaixo' || i.posicao.tipo === 'em_linha', i.posicao);
        check(`[${r.chave}] ${i.masterProductId.slice(0, 8)}: leitura de até 24 h`, (Date.now() - Date.parse(i.lidoEm)) / 3_600_000 <= 24.1, i.lidoEm);
      }
      if (r.chave === 'mudancas') {
        check(`[mudancas] ${i.masterProductId.slice(0, 8)}: evento com horário, valor e loja`, !!i.evento && !!i.evento.loja && i.evento.centavos < i.evento.antesCentavos && i.evento.quedaPct >= 5 && i.evento.quedaPct <= 50, i.evento);
        check(`[mudancas] ${i.masterProductId.slice(0, 8)}: dentro de 24 h`, !!i.evento && (Date.now() - Date.parse(i.evento.em)) / 3_600_000 <= 24.5, i.evento);
      }
      if (r.chave === 'menor-registrado') check(`[menor-registrado] ${i.masterProductId.slice(0, 8)}: no menor e corroborado`, !!i.menorRegistrado?.noMenor && !!i.menorRegistrado?.corroborado, i.menorRegistrado);
    }
  }
  const por = Object.fromEntries(res.map((r) => [r.chave, r.itens.length]));
  console.log('INFO: itens por vitrine', JSON.stringify(por));
  check('há ao menos uma vitrine visível com dado real', totalItens > 0);
  const mud = res.find((r) => r.chave === 'mudancas');
  if (mud && mud.visivel) check('mudanças em ordem do mais recente', mud.itens.every((x, i, a) => i === 0 || Date.parse(a[i - 1]!.evento!.em) >= Date.parse(x.evento!.em)));
  const col = res.find((r) => r.chave === 'colecionaveis');
  check('colecionáveis: sem fonte de dados, oculta e sem item inventado', !!col && !col.visivel && col.itens.length === 0);
}

banco()
  .catch((e) => {
    fails++;
    console.error('FALHOU: parte de banco', e instanceof Error ? e.message : e, (e as { cause?: { message?: string } }).cause?.message ?? '');
  })
  .finally(() => {
    console.log(`${total - fails}/${total} verificações passaram`);
    process.exit(fails ? 1 : 0);
  });
