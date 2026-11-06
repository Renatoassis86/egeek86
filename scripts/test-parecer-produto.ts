/**
 * Teste puro do contrato `ParecerProduto` (src/lib/pricing/parecer-produto.ts): estados, nunca juízo, <3 ofertas/<14 dias,
 * 1 loja, sem dado, textos proibidos, paridade com a fonte. Sem banco, sem rede.
 * Uso: npx tsx scripts/test-parecer-produto.ts   (sai com código 1 se algo falhar)
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { join } from 'node:path';
import { verificadoHaTexto } from '../src/lib/pricing/verificado-ha';
import { PARECER_PERCENTUAL_EXTREMO } from '../src/lib/pricing/price-metrics-config';
import { PriceChartV2 } from '../src/components/monitoring/price-chart-v2';
import { buildChartModel, computePeriodRef, CHART_TFS, TF_DAYS, isChartMeasuredDay } from '../src/lib/pricing/chart-model';
import { FRESH_MAX_AGE_MS } from '../src/lib/pricing/daily-state';
import { AGGREGATE_CEILING_MEDIAN_MULTIPLE, PLAUSIBILITY_FLOOR_PERCENT } from '../src/lib/affiliate/price-verdict';
import { buildLojasHoje, contarForaDaFaixa, linhasReservadas, LOJAS_LINHAS_VISIVEIS, ofertaFresca, type OfertaLojaInput } from '../src/lib/pricing/lojas-hoje';
import { computeLiveMinFromOffers, type LiveOfferInput } from '../src/lib/pricing/daily-state';
import { storesToday } from '../src/lib/pricing/price-verdict-v2';
import { chartLiveProps, resumoGrafico } from '../src/lib/pricing/chart-props';
import type { ChartInput } from '../src/lib/pricing/chart-model';
import { GRAFICO_MIN_DIAS, buildParecerProduto, dataHoraSP, textoUltimaMudanca, textoLojas, TEXTOS_PROIBIDOS, PARECER_TITULO, type ParecerFonte, type ParecerProduto } from '../src/lib/pricing/parecer-produto';
import { ProductCardV1, AvisoTransicaoSelo } from '../src/components/affiliate/product-card-v1';
import { compareToStoresMedian } from '../src/lib/pricing/price-verdict-v2';
import { VERDICT_JUDGEMENT_ENABLED } from '../src/lib/pricing/price-metrics-config';

/** formatBRL usa espaço sem quebra (NBSP): normaliza para comparar com texto literal. */
const n = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');

let fails = 0;
let total = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  total++;
  if (!cond) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
}

const NOW = { cents: 34990, store: 'Loja A (Mercado Livre)', lastChangeAt: null, prevCents: null, quotedAt: '2026-11-05T10:00:00.000Z', checkedAt: '2026-11-05T12:00:00.000Z', tiedOffers: 1, freshOffers: 3, weakSeller: false };
const lowAll = (cents: number, day = '2026-11-01') => ({ cents, day, store: 'Loja B (Mercado Livre)', coverageDays: 5 });

function fonte(over: Partial<ParecerFonte> & { count?: number; median?: number | null; networks?: string[] } = {}): ParecerFonte {
  const extra = { lastEvent: over.lastEvent, dataBase: over.dataBase, measuredDaysTotal: over.measuredDaysTotal, outOfBandOffers: over.outOfBandOffers };
  const count = over.count ?? 3;
  const median = over.median === undefined ? (count >= 3 ? 38000 : null) : over.median;
  const now = over.now === undefined ? NOW : over.now;
  return {
    now,
    stores: { count, medianCents: median, networks: over.networks ?? ['Mercado Livre'] },
    storesComparison: over.storesComparison === undefined ? compareToStoresMedian(now?.cents ?? null, median) : over.storesComparison,
    trackingDays: over.trackingDays ?? 5,
    firstDay: over.firstDay === undefined ? '2026-10-31' : over.firstDay,
    lows: over.lows ?? { d30: null, d90: null, all: null },
    ...(extra.lastEvent !== undefined ? { lastEvent: extra.lastEvent } : {}),
    ...(extra.dataBase !== undefined ? { dataBase: extra.dataBase } : {}),
    ...(extra.measuredDaysTotal !== undefined ? { measuredDaysTotal: extra.measuredDaysTotal } : {}),
    ...(extra.outOfBandOffers !== undefined ? { outOfBandOffers: extra.outOfBandOffers } : {}),
  };
}

/** Todo texto que o cartão pode exibir a partir do contrato. */
function textosDe(p: ParecerProduto): string {
  return [p.titulo, p.rotuloEstado, p.comparacao?.frase, p.comparacao?.apoio, p.cobertura.lojasTexto, p.cobertura.acompanhamentoTexto, p.cobertura.linha, p.menorRegistrado?.texto, p.ultimaMudanca?.texto, p.preco?.empateTexto, ...p.camada.sabemos, ...p.camada.falta, p.camada.lojasHoje?.texto, p.camada.qualidade.rotulo, p.camada.qualidade.resumo, ...(p.camada.metodo?.blocos.flatMap((b) => [b.titulo, b.texto]) ?? []), ...(p.camada.metodo?.avisos ?? [])]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase();
}

// --- estados ---
{
  const f = buildParecerProduto(fonte({ count: 3 }));
  check('3 lojas + comparação => fato', f.estado === 'fato', f.estado);
  check('fato: rótulo', f.rotuloEstado === 'Comparado com as lojas de hoje');
  check('fato: comparação 8% abaixo', f.comparacao?.direcao === 'abaixo' && f.comparacao.percentual === 8 && f.comparacao.frase === '8% abaixo do valor do meio entre as lojas hoje', f.comparacao);
  check('fato: apoio com valor do meio e vendedores', f.comparacao?.apoio.includes('380,00') === true && f.comparacao.apoio.endsWith('entre 3 vendedores no Mercado Livre.'), f.comparacao?.apoio);
  check('fato: sem "menor desde"', f.menorRegistrado === null);
  const a = buildParecerProduto(fonte({ count: 4, median: 30000 }));
  check('acima do valor do meio', a.comparacao?.direcao === 'acima' && a.comparacao.frase === '17% acima do valor do meio entre as lojas hoje', a.comparacao?.frase);
  const p = buildParecerProduto(fonte({ count: 3, median: 35000 }));
  check('menos de 1% => praticamente igual', p.comparacao?.direcao === 'proximo' && p.comparacao.frase.startsWith('Praticamente igual ao valor do meio'), p.comparacao?.frase);
  const e = buildParecerProduto(fonte({ count: 3, median: 34990 }));
  check('igual', e.comparacao?.direcao === 'igual' && e.comparacao.frase === 'No mesmo valor do meio entre as lojas hoje');
  const m = buildParecerProduto(fonte({ count: 3, networks: ['Mercado Livre', 'Shopee'] }));
  check('mais de uma rede => "N lojas"', m.cobertura.lojasTexto === '3 lojas' && m.comparacao?.apoio.endsWith('entre 3 lojas.') === true, m.cobertura.lojasTexto);
}

// --- uma só menção às lojas em `fato` (sem duplicar), uma linha de cobertura por estado ---
{
  const f = buildParecerProduto(fonte({ count: 4 }));
  check('fato: linha de cobertura só com acompanhamento', f.cobertura.linha === 'Acompanhando há 5 dias (desde 31/10)', f.cobertura.linha);
  const g = buildParecerProduto(fonte({ count: 2 }));
  check('formação: linha com acompanhamento e lojas', g.cobertura.linha === 'Acompanhando há 5 dias (desde 31/10) · 2 vendedores no Mercado Livre', g.cobertura.linha);
  const tag = (p: ParecerProduto) => renderToStaticMarkup(createElement(ProductCardV1, { parecer: p, produtoNome: 'Produto de teste' }));
  const conta = (html: string, t: string) => html.split(t).length - 1;
  const htmlFato = tag(f);
  check('DOM fato: "vendedores no Mercado Livre" aparece UMA vez', conta(htmlFato, 'vendedores no Mercado Livre') === 1, conta(htmlFato, 'vendedores no Mercado Livre'));
  const htmlFormacao = tag(g);
  check('DOM formação: "vendedores no Mercado Livre" aparece UMA vez', conta(htmlFormacao, 'vendedores no Mercado Livre') === 1);
  const semDado = tag(buildParecerProduto(fonte({ now: null, count: 0, trackingDays: 0, firstDay: null })));
  for (const [nome, html] of [['fato', htmlFato], ['formação', htmlFormacao], ['sem dado', semDado]] as const) {
    const low = html.toLowerCase();
    for (const proibido of TEXTOS_PROIBIDOS) check(`DOM ${nome} sem "${proibido}" (texto, aria-label, title)`, !low.includes(proibido));
    check(`DOM ${nome}: título e botão acessível`, html.includes('O que sabemos hoje') && html.includes('aria-label="Abrir detalhes do preço de Produto de teste"'));
    check(`DOM ${nome}: sem title, sem cor semântica`, !low.includes(' title=') && !/accent-(success|danger|hype)/.test(low));
  }
  check('DOM: slot do juízo oculto e vazio', htmlFato.includes('data-slot="juizo" hidden=""></div>'));
}

// --- avisos que o cartão substitui (decisão da Fase 1): sealTransition mantido; weakNotice só onde se aplica ---
{
  const aviso = renderToStaticMarkup(createElement(AvisoTransicaoSelo));
  check('aviso de transição do selo existe e mantém o texto', aviso.includes('Método atualizado: cada oferta vale 1 por dia. O selo pode diferir do que você viu antes.'));
  const pageSrc = readFileSync(join(__dirname, '../src/app/(detalhe)/ofertas/[slug]/page.tsx'), 'utf8');
  const ramoCartao = pageSrc.slice(pageSrc.indexOf('{v2 && parecer ? ('), pageSrc.indexOf(') : v2 ? ('));
  check('página: aviso de transição renderizado no ramo do cartão', ramoCartao.includes('sealTransition && <AvisoTransicaoSelo />'));
  check('página: ramo do cartão sem Card em volta (sem borda dupla)', !ramoCartao.includes('<Card'));
  const low = { d30: null, d90: null, all: lowAll(32990) };
  const com = buildParecerProduto({ ...fonte({ count: 2, lows: low }), weakNotice: 'footer' });
  check('weakNotice footer + "menor desde" visível => aviso no cartão', com.menorIgnoraBaixaReputacao === true);
  const prom = buildParecerProduto({ ...fonte({ count: 2, lows: low }), weakNotice: 'prominent' });
  check('weakNotice prominent + "menor desde" => aviso do menor registrado', prom.menorIgnoraBaixaReputacao === true);
  const semMenor = buildParecerProduto({ ...fonte({ count: 2, lows: { d30: null, d90: null, all: lowAll(36000) } }), weakNotice: 'prominent' });
  check('sem "menor desde" visível => sem aviso pendurado', semMenor.menorIgnoraBaixaReputacao === false);
  const none = buildParecerProduto({ ...fonte({ count: 2, lows: low }), weakNotice: 'none' });
  check('weakNotice none => sem aviso', none.menorIgnoraBaixaReputacao === false);
  const htmlAviso = renderToStaticMarkup(createElement(ProductCardV1, { parecer: com, produtoNome: 'X' }));
  check('DOM: aviso do menor registrado aparece', htmlAviso.includes('O menor registrado ignora vendedor de baixa reputação.'));
}

// --- ressalvas do QA (Fase 1) e Fase 2: última mudança, empate, percentual extremo, verificado há, camada ---
{
  const ev = { at: '2026-11-03T19:10:00.000Z', cents: 7662, prevCents: 7800, store: 'AVANTEELETRONICOS (Mercado Livre)', matchesNow: true };
  check('hora em São Paulo (UTC-3)', dataHoraSP('2026-11-03T19:10:00.000Z').dm === '03/11' && dataHoraSP('2026-11-03T19:10:00.000Z').hm === '16:10', dataHoraSP('2026-11-03T19:10:00.000Z'));
  check('hora: 00:05 local não vira 24:05', dataHoraSP('2026-11-04T03:05:00.000Z').hm === '00:05', dataHoraSP('2026-11-04T03:05:00.000Z'));
  const f = buildParecerProduto(fonte({ count: 3, lastEvent: ev }));
  check('última mudança: texto completo (horário, valor, loja, antes)', n(f.ultimaMudanca?.texto) === 'Última mudança do menor preço: R$ 76,62 em 03/11 às 16:10, loja AVANTEELETRONICOS (Mercado Livre) (antes R$ 78,00)', f.ultimaMudanca?.texto);
  check('última mudança: valores brutos preservados', f.ultimaMudanca?.cents === 7662 && f.ultimaMudanca.antesCents === 7800 && f.ultimaMudanca.loja === 'AVANTEELETRONICOS (Mercado Livre)');
  check('última mudança: primeiro registro e sem loja', n(textoUltimaMudanca({ cents: 7662, at: ev.at, store: null, prevCents: null })) === 'Última mudança do menor preço: R$ 76,62 em 03/11 às 16:10 (primeiro registro)');
  check('sem evento => ultimaMudanca null (lacuna, nada inventado)', buildParecerProduto(fonte({ count: 3 })).ultimaMudanca === null && buildParecerProduto(fonte({ count: 3, lastEvent: null })).ultimaMudanca === null);
  const html = renderToStaticMarkup(createElement(ProductCardV1, { parecer: f, produtoNome: 'P' }));
  check('DOM: última mudança (evento do preço atual) aparece no cartão (fato e formação)', n(html).includes('Última mudança do menor preço: R$ 76,62 em 03/11 às 16:10') && renderToStaticMarkup(createElement(ProductCardV1, { parecer: buildParecerProduto(fonte({ count: 1, lastEvent: ev })), produtoNome: 'P' })).includes('loja AVANTEELETRONICOS'));
  check('camada: cada informação uma vez (preço e evento só nos painéis, não na lista)', !f.camada.sabemos.some((t) => /Preço agora|Última mudança|Último evento/.test(t)), f.camada.sabemos);
  check('evento do preço atual: eDoPrecoAtual', f.ultimaMudanca?.eDoPrecoAtual === true);

  // M1 (QA Fase 2): evento que NÃO é do menor preço atual (Balan: agora R$ 65,45, evento R$ 65,57; Elden Ring: evento de oferta expirada).
  const balan = buildParecerProduto(fonte({ count: 3, now: { ...NOW, cents: 6545 }, lastEvent: { at: '2026-11-02T13:00:00.000Z', cents: 6557, prevCents: 6700, store: 'Loja X (Mercado Livre)', matchesNow: false } }));
  check('Balan: não afirma "última mudança" do preço atual', n(balan.ultimaMudanca?.texto) === 'Último evento registrado do menor preço: R$ 65,57 em 02/11 às 10:00, loja Loja X (Mercado Livre) (antes R$ 67,00)', balan.ultimaMudanca?.texto);
  check('Balan: evento continua visível (regra do dono) e marcado como não atual', balan.ultimaMudanca !== null && balan.ultimaMudanca.eDoPrecoAtual === false && balan.ultimaMudanca.cents === 6557);
  check('Balan: preço agora segue R$ 65,45 e o texto do evento não o contradiz', balan.preco?.cents === 6545 && !n(balan.ultimaMudanca?.texto).includes('Última mudança'));
  const elden = buildParecerProduto(fonte({ count: 1, lastEvent: { at: '2026-11-01T11:30:00.000Z', cents: 25990, prevCents: null, store: null, matchesNow: false } }));
  check('Elden-like (oferta expirada, sem loja, primeiro registro)', n(elden.ultimaMudanca?.texto) === 'Último evento registrado do menor preço: R$ 259,90 em 01/11 às 08:30 (primeiro registro)', elden.ultimaMudanca?.texto);
  const htmlBalan = renderToStaticMarkup(createElement(ProductCardV1, { parecer: balan, produtoNome: 'P' }));
  check('DOM Balan: cartão diz "Último evento registrado" e não "Última mudança"', n(htmlBalan).includes('Último evento registrado do menor preço: R$ 65,57 em 02/11') && !htmlBalan.includes('Última mudança do menor preço'));
  check('camada Balan: mesmo texto no painel (contrato único)', balan.ultimaMudanca?.texto.startsWith('Último evento registrado') === true);

  const emp = buildParecerProduto(fonte({ count: 3, now: { ...NOW, store: null, tiedOffers: 3 } }));
  check('empate: "3 ofertas com este mesmo preço"', emp.preco?.empateTexto === '3 ofertas com este mesmo preço' && renderToStaticMarkup(createElement(ProductCardV1, { parecer: emp, produtoNome: 'P' })).includes('3 ofertas com este mesmo preço'), emp.preco);
  check('sem empate: sem texto', buildParecerProduto(fonte({ count: 3 })).preco?.empateTexto === null);
  check('loja conhecida com empate: loja prevalece', buildParecerProduto(fonte({ count: 3, now: { ...NOW, tiedOffers: 2 } })).preco?.empateTexto === null);

  check('config: limite do percentual extremo = 50', PARECER_PERCENTUAL_EXTREMO === 50);
  const ext = buildParecerProduto(fonte({ count: 3, median: 100000, now: { ...NOW, cents: 40000 } }));
  check('60% abaixo => percentualExtremo', ext.comparacao?.percentual === 60 && ext.percentualExtremo === true, ext.comparacao);
  check('exatamente 50% abaixo => não extremo (limite é "mais de 50")', buildParecerProduto(fonte({ count: 3, median: 100000, now: { ...NOW, cents: 50000 } })).percentualExtremo === false);
  check('60% ACIMA => não extremo', buildParecerProduto(fonte({ count: 3, median: 50000, now: { ...NOW, cents: 80000 } })).percentualExtremo === false);
  check('sem comparação => false', buildParecerProduto(fonte({ count: 2 })).percentualExtremo === false);
  check('percentual extremo não muda o texto', ext.comparacao?.frase === '60% abaixo do valor do meio entre as lojas hoje' && !textosDe(ext).includes('extremo'));

  const t0 = new Date('2026-11-05T10:00:00.000Z').getTime();
  check('verificado há: 2h31 => "há 2 h"', verificadoHaTexto('2026-11-05T10:00:00.000Z', t0 + (2 * 60 + 31) * 60_000) === 'verificado há 2 h');
  check('verificado há: 59 min e 30 s => "há 59 min"', verificadoHaTexto('2026-11-05T10:00:00.000Z', t0 + 59 * 60_000 + 30_000) === 'verificado há 59 min');
  check('verificado há: 10 s => "há 1 min"', verificadoHaTexto('2026-11-05T10:00:00.000Z', t0 + 10_000) === 'verificado há 1 min');
  check('verificado há: 49h => "há 2 dias"', verificadoHaTexto('2026-11-05T10:00:00.000Z', t0 + 49 * 3_600_000) === 'verificado há 2 dias');
  check('verificado há: relógio atrasado nunca negativo', verificadoHaTexto('2026-11-05T10:00:00.000Z', t0 - 5 * 60_000) === 'verificado há 1 min');

  // Camada: painéis com base mínima.
  const um = buildParecerProduto(fonte({ count: 1, trackingDays: 1, firstDay: '2026-11-05', dataBase: { level: 'small', measuredDays30: 0, stores: 1, range: null } }));
  check('camada: 1 loja => painel de lojas oculto (null)', um.camada.lojasHoje === null);
  check('camada: formação diz o que falta, sem prazo', um.camada.falta.some((t) => t.startsWith('Ainda não dá para dizer se este preço é bom')) && um.camada.falta.some((t) => t.includes('histórico ainda é curto (1 dia acompanhado)')));
  check('camada: nunca promete prazo', ![...um.camada.falta, ...um.camada.sabemos].some((t) => /previs|liberad|em breve|dias para|até \d/i.test(t)));
  check('camada: qualidade pequena', um.camada.qualidade.rotulo === 'Base de dados pequena' && um.camada.qualidade.nivel === 'small');
  const tres = buildParecerProduto(fonte({ count: 3, dataBase: { level: 'medium', measuredDays30: 5, stores: 3, range: null } }));
  check('camada: 3 lojas => painel de lojas com valor do meio', tres.camada.lojasHoje?.quantidade === 3 && tres.camada.lojasHoje.valorDoMeioTexto?.includes('380,00') === true && tres.camada.lojasHoje.texto === '3 vendedores no Mercado Livre');
  check('camada: 2 lojas => painel de lojas sem valor do meio', buildParecerProduto(fonte({ count: 2 })).camada.lojasHoje?.valorDoMeioTexto === null);
  check('camada: sem dataBase => "sem dado"', buildParecerProduto(fonte({ count: 3 })).camada.qualidade.rotulo === 'Base de dados sem dado');
  const semPreco = buildParecerProduto(fonte({ now: null, count: 0, trackingDays: 0, firstDay: null }));
  check('camada: sem preço diz o porquê', semPreco.preco === null && semPreco.camada.falta[0] === 'Sem preço verificado hoje, não há o que comparar.');
  check('camada: sempre diz que não opina', [um, tres, semPreco].every((p) => p.camada.falta.at(-1) === 'Não emitimos opinião sobre o preço (se é bom ou ruim): esse método ainda está em validação.'));
  check('camada: paridade com o cartão (mesmo preço, loja, N)', tres.preco?.cents === 34990 && tres.preco.loja === 'Loja A (Mercado Livre)' && tres.camada.sabemos.some((t) => t.includes('3 vendedores no Mercado Livre')));

  // Fontes da camada: sem termos proibidos, sem cor semântica, sem raio, sem imagem, dialog real, sem gráfico.
  const lerFonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
  const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const visivelDe = (src: string) => {
    const semC = semComentarios(src).replace(/^import .*$/gm, '').replace(/import\(['"][^'"]*['"]\)/g, '');
    const lit = [...semC.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)].map((m) => m[2]);
    const jsx = [...semC.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
    return [...lit, ...jsx].join(' | ').toLowerCase();
  };
  for (const rel of ['src/components/affiliate/camada-produto.tsx', 'src/components/affiliate/camada-gatilho.tsx', 'src/components/ui/camada-sobreposta.tsx']) {
    const v = visivelDe(lerFonte(rel));
    for (const proibido of TEXTOS_PROIBIDOS) check(`${rel} sem "${proibido}"`, !v.includes(proibido));
    check(`${rel} sem cor semântica, raio ou imagem`, !/accent-(success|danger|hype)|rounded|border-radius|<img|sceneimage|productimage/.test(semComentarios(lerFonte(rel)).toLowerCase()));
    check(`${rel} sem gráfico (Fase 3)`, !/lightweight-charts|price-chart|<canvas|<svg/.test(lerFonte(rel)));
  }
  const sob = lerFonte('src/components/ui/camada-sobreposta.tsx');
  check('camada: <dialog> nativo com showModal e Esc (cancel) tratado', sob.includes('<dialog') && sob.includes('showModal()') && sob.includes('onCancel'));
  check('camada: role="dialog" e aria-modal explícitos', sob.includes('role="dialog"') && sob.includes('aria-modal="true"'));
  check('camada: contêiner rolável focável e nomeado', sob.includes('tabIndex={0}') && sob.includes('aria-label="Conteúdo da camada"'));
  check('camada: FLIP em WAAPI com getBoundingClientRect, só transform/opacity', sob.includes('.animate(') && sob.includes('getBoundingClientRect') && !/(left|top|width|height):\s*\[/.test(sob));
  check('camada: reduced-motion = fade de 100 ms', sob.includes('prefers-reduced-motion: reduce') && sob.includes('DUR_REDUZIDO = 100'));
  check('camada: foco devolvido, rolagem travada sem salto', sob.includes('retornoFoco') && sob.includes('scrollbarGutter') && sob.includes("overflow = 'hidden'"));
  const gat = lerFonte('src/components/affiliate/camada-gatilho.tsx');
  check('gatilho: aria-expanded e aria-controls reais', gat.includes('aria-expanded={aberta}') && gat.includes('aria-controls={aberta ? id : undefined}'));
  check('gatilho: camada por importação dinâmica (só ao abrir)', gat.includes('dynamic(carregar, { ssr: false })') && gat.includes("import('@/components/affiliate/camada-produto')") && gat.includes('{aberta && ('));
  const cart = lerFonte('src/components/affiliate/product-card-v1.tsx');
  check('cartão: sem botão morto (aria-disabled removido)', !cart.includes('aria-disabled') && !cart.includes('indisponivel'));
  check('cartão: alvo do "i" de 24 px', cart.includes('size-6'));
  const prod = lerFonte('src/components/affiliate/camada-produto.tsx');
  check('camada: botão de comprar usa o link de saída e rel sponsored', prod.includes('rel="noopener noreferrer nofollow sponsored"') && prod.includes('compraHref'));
  check('camada: título do painel acompanha o texto (evento atual x registrado)', prod.includes("ultimaMudanca.eDoPrecoAtual ? 'Última mudança do menor preço' : 'Último evento do menor preço'"));
  check('camada: slot de alerta oculto, sem botão', prod.includes('data-slot="alerta-preco"') && !/avisar|avise/i.test(visivelDe(prod)));
}


// --- Fase 3, painel 1: gráfico dentro da camada (base mínima, paridade por construção, sob demanda, neutro) ---
{
  const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const visivelDe = (src: string) => {
    const semC = semComentarios(src).replace(/^import .*$/gm, '').replace(/import\(['"][^'"]*['"]\)/g, '');
    const lit = [...semC.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)].map((m) => m[2]);
    const jsx = [...semC.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
    return [...lit, ...jsx].join(' | ').toLowerCase();
  };
  const dias = (n: number) => buildParecerProduto(fonte({ count: 3, trackingDays: n, measuredDaysTotal: n, firstDay: n > 0 ? '2026-10-31' : null }));
  check('gráfico: 0 dia => painel oculto', dias(0).camada.graficoDisponivel === false);
  check('gráfico: 1 dia => painel oculto (o gráfico só desenha com 2+)', dias(1).camada.graficoDisponivel === false);
  check('gráfico: 2 dias => painel disponível', dias(2).camada.graficoDisponivel === true);
  check('gráfico: 30 dias => painel disponível', dias(30).camada.graficoDisponivel === true);
  check('gráfico: base mínima é constante exportada = 2', GRAFICO_MIN_DIAS === 2);
  check('gráfico: sem preço mas com histórico => ainda disponível (o histórico é fato)', buildParecerProduto(fonte({ now: null, count: 0, trackingDays: 5, measuredDaysTotal: 5 })).camada.graficoDisponivel === true);

  // Paridade: página e camada usam o MESMO mapeamento (`chartLiveProps`) e a mesma função de dados (`getPriceChartV2`).
  const v2 = { now: { ...NOW }, lows: { d30: null, d90: null, all: lowAll(32990) }, weakNotice: 'footer' as const };
  const live = chartLiveProps(v2);
  check('paridade: current vem de now (preço, checagem, cotação, loja)', live.current?.cents === 34990 && live.current.checkedAt === NOW.checkedAt && live.current.quotedAt === NOW.quotedAt && live.current.store === NOW.store);
  check('paridade: lowAll e weakNotice repassados', live.lowAll?.cents === 32990 && live.lowAll.day === '2026-11-01' && live.weakNotice === 'footer');
  check('paridade: sem v2 => tudo vazio e aviso none', chartLiveProps(null).current === null && chartLiveProps(null).lowAll === null && chartLiveProps(null).weakNotice === 'none');
  const lerFonte2 = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
  const secao = lerFonte2('src/app/(detalhe)/ofertas/[slug]/product-price-chart-section.tsx');
  const rota = lerFonte2('src/app/api/produtos/[id]/grafico/route.ts');
  check('paridade: seção da página usa chartLiveProps e getPriceChartV2', secao.includes('chartLiveProps(v2)') && secao.includes('getPriceChartV2(masterProductId)'));
  check('paridade: rota da camada usa chartLiveProps e getPriceChartV2/getPriceMetricsV2', rota.includes('chartLiveProps(v2)') && rota.includes('getPriceChartV2(id)') && rota.includes('getPriceMetricsV2(id)'));
  check('rota: só com as duas flags (404 senão), UUID validado, cache HTTP curto', rota.includes('isProductCardV1Enabled()') && rota.includes('isPriceMetricsV2Enabled()') && rota.includes('status: 404') && rota.includes('UUID.test(id)') && rota.includes('s-maxage=60'));
  check('rota: erro tratado (500 sem cache) e só leitura (sem escrita)', rota.includes('status: 500') && rota.includes("'no-store'") && !/\.(insert|update|delete)\(|INSERT |UPDATE |DELETE /.test(rota));

  // Resumo textual para leitor de tela: só o medido.
  const dia = (day: string, min: number | null, quality: 'complete' | 'partial' | 'gap' | 'legacy') => ({ day, minCents: min, avgCents: min, medianCents: min, nOffers: 3, quality, anchorAt: null });
  const entrada = { days: [dia('2026-10-25', 9999, 'legacy'), dia('2026-11-01', 7800, 'complete'), dia('2026-11-02', null, 'gap'), dia('2026-11-03', 7662, 'partial')], events: [{ at: '2026-11-03T19:10:00.000Z', minCents: 7662, prevMinCents: 7800, store: 'X', weak: false }], lastQuoteAt: null, refs: {}, legacyDays: 1 } as unknown as ChartInput;
  const resumo = n(resumoGrafico(entrada));
  check('resumo: só dias medidos (ignora legacy e lacuna), faixa e eventos', resumo === 'Histórico do menor preço: 2 dias medidos, de 01/11 a 03/11. Menor preço diário entre R$ 76,62 e R$ 78,00. 1 mudança registrada do menor preço.', resumo);
  check('resumo: nada medido => null (sem texto inventado)', resumoGrafico({ ...entrada, days: [dia('2026-10-25', 9999, 'legacy')] }) === null);

  // Painel e chart: sob demanda, neutro, sem termos proibidos.
  const gr = lerFonte2('src/components/affiliate/camada-grafico.tsx');
  const prodSrc = lerFonte2('src/components/affiliate/camada-produto.tsx');
  const chartSrc = lerFonte2('src/components/monitoring/price-chart-v2.tsx');
  check('painel: dados por fetch só ao montar (camada aberta), gráfico por importação dinâmica', gr.includes('fetch(`/api/produtos/${produtoId}/grafico`') && gr.includes("import('@/components/monitoring/price-chart-v2')") && gr.includes('ssr: false'));
  check('painel: skeleton com altura mínima reservada, erro tratado com nova tentativa', gr.includes('min-h-[24rem]') && gr.includes('aria-busy="true"') && gr.includes('role="alert"') && gr.includes('Tentar de novo'));
  check('painel: gráfico em modo neutro e resumo para leitor de tela', gr.includes('neutro />') && gr.includes('className="sr-only"'));
  check('painel: só aparece com base mínima (contrato)', prodSrc.includes('camada.graficoDisponivel && produtoId'));
  check('painel: o pacote inicial do cartão não importa o gráfico (só a camada dinâmica)', !lerFonte2('src/components/affiliate/product-card-v1.tsx').includes('price-chart-v2') && !lerFonte2('src/components/affiliate/camada-gatilho.tsx').includes("price-chart-v2'") );
  check('gráfico: modo neutro troca verde/vermelho (marcadores, barra, lista de eventos)', chartSrc.includes('const upColor = neutro ? palette.text : palette.up') && chartSrc.includes('!neutro && down ?') && !chartSrc.includes('fill={palette.up}') && !chartSrc.includes('stroke={palette.down}'));
  const vg = visivelDe(gr);
  for (const proibido of TEXTOS_PROIBIDOS) check(`painel do gráfico sem "${proibido}"`, !vg.includes(proibido));
  check('painel do gráfico: sem prazo prometido', !/volte|previs|em breve|liberad/i.test(vg));
  check('painel do gráfico: sem raio, imagem ou cor semântica', !/accent-(success|danger|hype)|rounded|<img/.test(semComentarios(gr).toLowerCase()));
}


// --- Fase 3, painel 2: "Lojas de hoje" (mesmas regras do preço agora; sob demanda; altura previsível) ---
{
  const lerF = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
  const semCom = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const visivelL = (src: string) => {
    const semC = semCom(src).replace(/^import .*$/gm, '');
    const lit = [...semC.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)].map((m) => m[2]);
    const jsx = [...semC.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
    return [...lit, ...jsx].join(' | ').toLowerCase();
  };
  const agora = new Date('2026-11-05T12:00:00.000Z');
  const h = (horas: number) => new Date(agora.getTime() - horas * 3_600_000);
  const of = (id: string, cents: number, over: Partial<OfertaLojaInput> = {}): OfertaLojaInput => ({
    offerId: id,
    networkId: 'net-ml',
    sellerId: `s-${id}`,
    priceCents: cents,
    quotedAt: h(2),
    checkedAt: h(1),
    vendedor: `Vendedor ${id}`,
    rede: 'Mercado Livre',
    baixaReputacao: false,
    ...over,
  });

  const base = [of('c', 8000), of('a', 7500), of('b', 7800), of('d', 9000)];
  const r = buildLojasHoje(base, agora);
  check('lojas: ordenadas pelo menor preço', r.linhas.map((l) => l.cents).join(',') === '7500,7800,8000,9000', r.linhas.map((l) => l.cents));
  check('lojas: preço, vendedor e rede em cada linha', r.linhas[0].cents === 7500 && r.linhas[0].vendedor === 'Vendedor a' && r.linhas[0].rede === 'Mercado Livre');
  check('lojas: total e lojas distintas', r.total === 4 && r.lojasDistintas === 4);

  // Frescor: mesma regra do preço agora (cotação E checagem <= 48 h; preço > 0; nunca cotada/checada fora).
  const velhas = [of('a', 7500), of('b', 7800, { quotedAt: h(49) }), of('c', 8000, { checkedAt: h(50) }), of('d', 0), of('e', 8100, { quotedAt: null }), of('f', 8200, { checkedAt: null })];
  const rv = buildLojasHoje(velhas, agora);
  check('lojas: fora as ofertas sem frescor, sem preço ou sem cotação/checagem', rv.total === 1 && rv.linhas.length === 1 && rv.linhas[0].cents === 7500, rv);

  // Invariantes com o "preço agora" e com o cartão (sem recalcular de forma divergente).
  const casos: Array<[string, OfertaLojaInput[]]> = [
    ['4 lojas', base],
    ['frescor misto', velhas],
    ['mesmo vendedor 2 ofertas', [of('a', 7500, { sellerId: 's-x' }), of('b', 7600, { sellerId: 's-x' }), of('c', 7700)]],
    ['outlier baixo (faixa plausível)', [of('a', 1000), of('b', 7800), of('c', 8000), of('d', 8200)]],
    ['sem vendedor (rede única)', [of('a', 7500, { sellerId: null, vendedor: null }), of('b', 7800, { sellerId: null, vendedor: null, networkId: 'net-sh', rede: 'Shopee' })]],
    ['vazio', []],
  ];
  for (const [nome, lista] of casos) {
    const rr = buildLojasHoje(lista, agora);
    const live = computeLiveMinFromOffers(lista, agora);
    check(`invariante total == freshOffers do preço agora: ${nome}`, rr.total === (live?.freshOffers ?? 0), { total: rr.total, fresh: live?.freshOffers });
    const lojas = storesToday(lista.filter((o) => ofertaFresca(o, agora)).map((o) => ({ storeKey: o.sellerId ?? o.networkId ?? o.offerId, priceCents: o.priceCents })));
    check(`invariante lojasDistintas == storesToday (cartão): ${nome}`, rr.lojasDistintas === lojas.storeCount);
    check(`ordenação crescente: ${nome}`, rr.linhas.every((l, i, a) => i === 0 || a[i - 1].cents <= l.cents));
  }
  const dup = buildLojasHoje(casos[2][1], agora);
  check('mesmo vendedor: 3 ofertas listadas, 2 lojas distintas', dup.total === 3 && dup.lojasDistintas === 2 && dup.linhas.length === 3, dup);
  const out = buildLojasHoje(casos[3][1], agora);
  check('outlier: aparece na lista, marcado fora da faixa, fora da contagem de lojas', out.linhas[0].cents === 1000 && out.linhas[0].foraDaFaixa === true && out.lojasDistintas === 3 && out.linhas.slice(1).every((l) => !l.foraDaFaixa), out);
  const sv = buildLojasHoje(casos[4][1], agora);
  check('sem vendedor: null (nada inventado)', sv.linhas.every((l) => l.vendedor === null) && sv.lojasDistintas === 2);
  const fraco = buildLojasHoje([of('a', 7500, { baixaReputacao: true }), of('b', 7600)], agora);
  check('baixa reputação repassada', fraco.linhas[0].baixaReputacao === true && fraco.linhas[1].baixaReputacao === false);
  check('vazio => sem linhas, sem totais inventados', buildLojasHoje([], agora).total === 0 && buildLojasHoje([], agora).linhas.length === 0);

  // Reserva de altura: linhas fixas.
  check('reserva: 0, 5, 8 ofertas', linhasReservadas(0) === 0 && linhasReservadas(5) === 5 && linhasReservadas(8) === 8);
  check('reserva: mais de 8 => 8 visíveis + 1 linha do "ver as outras"', linhasReservadas(9) === 9 && linhasReservadas(71) === 9 && LOJAS_LINHAS_VISIVEIS === 8);

  // Contrato: base mínima e quantidade de ofertas esperadas.
  const c3 = buildParecerProduto(fonte({ count: 3, now: { ...NOW, freshOffers: 7 } }));
  check('contrato: painel de lojas só com 2+ lojas e com `ofertas` = freshOffers', c3.camada.lojasHoje?.ofertas === 7 && buildParecerProduto(fonte({ count: 1 })).camada.lojasHoje === null && buildParecerProduto(fonte({ count: 0, now: null })).camada.lojasHoje === null);

  // Fontes: rota, servidor, componente, ordem dos painéis.
  const rotaL = lerF('src/app/api/produtos/[id]/lojas/route.ts');
  const srvL = lerF('src/server/pricing/lojas-hoje.ts');
  const cmpL = lerF('src/components/affiliate/camada-lojas.tsx');
  const prodL = lerF('src/components/affiliate/camada-produto.tsx');
  const sobL = lerF('src/components/ui/camada-sobreposta.tsx');
  const gL = lerF('src/components/affiliate/camada-grafico.tsx');
  check('rota lojas: flags (404), UUID, cache 60 s, erro 500 sem cache, só leitura', rotaL.includes('isProductCardV1Enabled()') && rotaL.includes('isPriceMetricsV2Enabled()') && rotaL.includes('status: 404') && rotaL.includes('UUID.test(id)') && rotaL.includes('s-maxage=60') && rotaL.includes('status: 500') && rotaL.includes("'no-store'") && !/\.(insert|update|delete)\(|INSERT |UPDATE |DELETE /.test(rotaL));
  check('servidor: mesmas consultas do preço agora (loadLiveOffers + loadOfferMeta), cache de 60 s, server-only, sem SQL próprio', srvL.includes("import 'server-only'") && srvL.includes('loadLiveOffers') && srvL.includes('loadOfferMeta') && srvL.includes('revalidate: 60') && !/\bsql`/i.test(semCom(srvL)) && !/SELECT /.test(semCom(srvL)));
  const metrics = lerF('src/server/pricing/price-metrics-v2.ts');
  check('consulta única: loadLiveOffers filtra ativa, preço > 0, 48 h e eligibleOfferSql (placeholder e rascunho ficam fora)', /export async function loadLiveOffers[\s\S]*?status = 'active' AND o\.current_price_cents > 0[\s\S]*?\$\{eligibleOfferSql\('o'\)\}/.test(metrics));
  check('consulta única: loadOfferMeta também usa eligibleOfferSql', /export async function loadOfferMeta[\s\S]*?\$\{eligibleOfferSql\('o'\)\}/.test(metrics));
  check('componente: fetch só ao montar, skeleton por linhas fixas (h-14), erro com nova tentativa', cmpL.includes('fetch(`/api/produtos/${produtoId}/lojas`') && cmpL.includes('h-14') && cmpL.includes('linhasReservadas(ofertasEsperadas)') && cmpL.includes('role="alert"') && cmpL.includes('Tentar de novo'));
  const vL = visivelL(cmpL);
  for (const proibido of TEXTOS_PROIBIDOS) check(`componente de lojas sem "${proibido}"`, !vL.includes(proibido));
  check('componente de lojas: neutro, sem raio, sem imagem, sem botão de alerta', !/accent-(success|danger|hype)|rounded|<img/.test(semCom(cmpL).toLowerCase()) && !/avisar|avise/.test(vL));
  check('componente de lojas: não importa regra de preço (só tipos e formatação)', !cmpL.includes('daily-state') && !cmpL.includes('price-verdict'));
  const ordem = [...prodL.matchAll(/data-panel="([a-z-]+)"/g)].map((m) => m[1]);
  check('painéis: gráfico é o ÚLTIMO (nada abaixo para deslocar) e lojas vem antes dele', ordem.at(-1) === 'grafico' && ordem.indexOf('lojas') > -1 && ordem.indexOf('lojas') < ordem.indexOf('grafico'), ordem);
  check('painel de lojas: só com base mínima (contrato) e com o id do produto', prodL.includes('camada.lojasHoje &&') && prodL.includes('<CamadaLojas produtoId={produtoId}'));
  check('caixa da camada com altura fixa no desktop quando há gráfico', prodL.includes('alturaFixa={Boolean(camada.graficoDisponivel && produtoId)}') && sobL.includes("alturaFixa ? 'md:h-[calc(100dvh-64px)]'"));
  check('gráfico: sem reserva gigante (min 24 rem), painel final', gL.includes("const CAIXA = 'min-h-[24rem]'") && !gL.includes('--grafico-h'));
}


// --- Correções do QA da Fase 3 (R1 a R4) ---
{
  const lerR = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
  const semComR = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // R1: o painel do gráfico depende de DIAS MEDIDOS, não de dias de calendário.
  const repro = buildParecerProduto(fonte({ count: 3, trackingDays: 6, firstDay: '2026-10-31', measuredDaysTotal: 1 }));
  check('R1: 6 dias de calendário e 1 medido (produto b96c28a9) => painel oculto', repro.camada.graficoDisponivel === false);
  check('R1: 0 e 1 dia medido => oculto, 2 => disponível, 30 => disponível', [0, 1].every((m) => buildParecerProduto(fonte({ count: 3, trackingDays: 30, measuredDaysTotal: m })).camada.graficoDisponivel === false) && [2, 3, 30].every((m) => buildParecerProduto(fonte({ count: 3, trackingDays: 30, measuredDaysTotal: m })).camada.graficoDisponivel === true));
  check('R1: sem a contagem no DTO => oculto (nunca presume dado)', buildParecerProduto(fonte({ count: 3, trackingDays: 30 })).camada.graficoDisponivel === false);
  check('R1: calendário longo não basta (30 dias de calendário, 1 medido)', buildParecerProduto(fonte({ count: 3, trackingDays: 30, measuredDaysTotal: 1 })).camada.graficoDisponivel === false);
  const dia = (day: string, minCents: number | null, quality: 'complete' | 'partial' | 'gap' | 'legacy') => ({ day, minCents, avgCents: minCents, medianCents: minCents, nOffers: 3, quality, anchorAt: null });
  const dias = [dia('2026-10-25', 5000, 'legacy'), dia('2026-11-01', 8000, 'complete'), dia('2026-11-02', null, 'gap'), dia('2026-11-03', 8100, 'partial'), dia('2026-11-04', null, 'partial'), dia('2026-11-05', 7900, 'complete')];
  const entradaR = { days: dias, events: [], lastQuoteAt: '2026-11-05T14:00:00.000Z', refs: {} as ChartInput['refs'], legacyDays: 1 } as ChartInput;
  const modeloR = buildChartModel(entradaR, 'Tudo', new Date('2026-11-05T15:00:00.000Z').getTime());
  check('R1: a contagem do painel é a MESMA do gráfico (isChartMeasuredDay == measuredDays do modelo)', dias.filter(isChartMeasuredDay).length === modeloR.measuredDays && modeloR.measuredDays === 3, { n: dias.filter(isChartMeasuredDay).length, m: modeloR.measuredDays });
  const srvM = lerR('src/server/pricing/price-metrics-v2.ts');
  check('R1: o servidor conta com isChartMeasuredDay (mesma regra) e a chave de cache foi renovada', srvM.includes('measuredDaysTotal: measured.filter(isChartMeasuredDay).length') && srvM.includes("'price-metrics-v2-8'"));
  check('R1: o contrato não usa mais trackingDays para o gráfico', !/graficoDisponivel: dias >=/.test(lerR('src/lib/pricing/parecer-produto.ts')) && lerR('src/lib/pricing/parecer-produto.ts').includes('(fonte.measuredDaysTotal ?? 0) >= GRAFICO_MIN_DIAS'));

  // R2/R3/S3: gráfico neutro (camada) x gráfico da página (inalterado), renderizados de verdade.
  const pdays = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((day) => ({ day, members: { a: 8000, b: 8200, c: 8500 }, minCents: 8000 }));
  const refs = Object.fromEntries(CHART_TFS.map((tf) => [tf, computePeriodRef(pdays, TF_DAYS[tf])])) as ChartInput['refs'];
  const entradaG: ChartInput = {
    days: pdays.map((d) => dia(d.day, 8000, 'complete')),
    events: [{ at: '2026-11-03T13:00:00.000Z', minCents: 8000, prevMinCents: 8300, store: 'Loja A (Mercado Livre)', weak: false }],
    lastQuoteAt: '2026-11-05T14:00:00.000Z',
    refs,
    legacyDays: 0,
  };
  const live = { current: { cents: 8000, checkedAt: '2026-11-05T14:00:00.000Z', quotedAt: '2026-11-05T14:00:00.000Z', store: 'Loja A (Mercado Livre)' }, lowAll: null, weakNotice: 'none' as const };
  const html = (neutro: boolean) => n(renderToStaticMarkup(createElement(PriceChartV2, { input: entradaG, nowIso: '2026-11-05T15:00:00.000Z', ...live, ...(neutro ? { neutro: true, medianaLojasHoje: 8200 } : {}) })));
  const camadaH = html(true);
  const paginaH = html(false);
  check('R2: camada (neutro) mostra a mediana das lojas hoje e o valor', camadaH.includes('Mediana das lojas hoje') && camadaH.includes('R$ 82,00'));
  check('R2: camada (neutro) NÃO mostra a mediana histórica por padrão', !camadaH.includes('Mediana histórica') && !camadaH.includes('Média histórica'));
  check('R2: página (não neutro) continua com a mediana histórica e sem "lojas hoje"', paginaH.includes('Mediana histórica do período') && !paginaH.includes('lojas hoje'));
  check('R2: a linha de referência da camada vem da prop, não do histórico (sem a prop, nenhuma linha de mediana)', !n(renderToStaticMarkup(createElement(PriceChartV2, { input: entradaG, nowIso: '2026-11-05T15:00:00.000Z', ...live, neutro: true }))).includes('Mediana'));
  const chartSrc2 = lerR('src/components/monitoring/price-chart-v2.tsx');
  check('R2: mediana histórica atrás de "Camadas" só no neutro', chartSrc2.includes("...(neutro ? ([['medianHist', 'Mediana histórica']] as const) : [])") && chartSrc2.includes('medianHist: false'));
  check('R3: no neutro o terciário vira secundário (variável) e o eixo usa o secundário', camadaH.includes('--color-text-tertiary:var(--color-text-secondary)') && camadaH.includes('fill="var(--color-text-secondary)"'));
  check('R3: a página não ganha nenhuma dessas mudanças', !paginaH.includes('--color-text-tertiary:var(--color-text-secondary)') && !paginaH.includes('fill="var(--color-text-secondary)"'));
  check('S3: alvos de toque de 44 px só no neutro', camadaH.includes('min-h-11') && !camadaH.includes('min-h-8') && paginaH.includes('min-h-8') && !paginaH.includes('min-h-11'));
  check('chart-model: o parâmetro extra não muda o modelo sem valores extras', JSON.stringify(buildChartModel(entradaG, '1M', new Date('2026-11-05T15:00:00.000Z').getTime()).y) === JSON.stringify(buildChartModel(entradaG, '1M', new Date('2026-11-05T15:00:00.000Z').getTime(), undefined, []).y));
  const comExtra = buildChartModel(entradaG, '1M', new Date('2026-11-05T15:00:00.000Z').getTime(), { avgDay: false, avgHistorical: false }, [20000]);
  check('chart-model: valor extra amplia o eixo para caber a linha de referência', (comExtra.y?.hi ?? 0) >= 20000);

  // R3: contraste calculado com os tokens reais de globals.css (WCAG 2.x).
  const css = lerR('src/app/globals.css');
  const bloco = (sel: string) => css.slice(css.indexOf(sel));
  const tok = (b: string, nome: string) => (b.match(new RegExp(`${nome}:\\s*(#[0-9A-Fa-f]{6})`)) as RegExpMatchArray)[1];
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const razao = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const [tema, sel] of [['escuro', '[data-theme="dark"] {'], ['claro', '[data-theme="light"] {']] as const) {
    const b = bloco(sel);
    const sec = tok(b, '--color-text-secondary');
    for (const fundo of ['--color-bg-elevated', '--color-bg-surface', '--color-bg-inset']) {
      const r = razao(sec, tok(b, fundo));
      check(`R3: secundário sobre ${fundo} no tema ${tema} >= 4,5:1 (medido ${r.toFixed(2)})`, r >= 4.5, r);
    }
  }

  // R4: existência por chave primária antes das métricas; negativo no CDN; nada em memória; proxy fora dessas rotas.
  const existe = lerR('src/server/pricing/produto-existe.ts');
  check('R4: existência = 1 consulta leve por chave primária, sem cache em memória', /FROM master_products WHERE id = \$\{masterProductId\}::uuid LIMIT 1/.test(existe) && !existe.includes('createCachedQuery') && existe.includes("import 'server-only'"));
  for (const [rota, getter] of [['src/app/api/produtos/[id]/grafico/route.ts', 'getPriceChartV2(id)'], ['src/app/api/produtos/[id]/lojas/route.ts', 'getLojasHoje(id)']] as const) {
    const r = lerR(rota);
    const iEx = r.indexOf('await produtoExiste(id)');
    const iGet = r.indexOf(getter);
    check(`R4: ${rota.split('/').slice(-2, -1)[0]}: existência checada ANTES das métricas`, iEx > 0 && iGet > iEx, { iEx, iGet });
    check(`R4: ${rota.split('/').slice(-2, -1)[0]}: 404 e 400 com cache negativo de CDN (s-maxage=300), sem memória`, r.includes("status: 404, headers: NEGATIVO") && r.includes('status: 400, headers: NEGATIVO') && r.includes("s-maxage=300"));
  }
  const proxySrc = lerR('src/proxy.ts');
  const px = (proxySrc.match(/'(\/\(\(\?![^']*)'/) as RegExpMatchArray)[1].replace(/\\\\/g, '\\');
  const re = new RegExp(`^${px}$`);
  check('R4: o proxy (updateSession) não roda nas rotas /api/produtos (sem Set-Cookie, sem chamada ao Supabase Auth)', !re.test('/api/produtos/c2f08e2b-a175-4bfc-ad31-4a82a97ceb8c/grafico') && !re.test('/api/produtos/c2f08e2b-a175-4bfc-ad31-4a82a97ceb8c/lojas'));
  check('R4: o proxy continua valendo para páginas e demais rotas', re.test('/ofertas/algum-produto') && re.test('/api/search') && re.test('/admin/x') && !re.test('/api/webhooks/telegram'));

  // S1: rótulo de loja genérico.
  check('S1: "menor já visto" sem metadados não diz mais só "Loja"', srvM.includes("?.label ?? 'Loja não identificada', coverageDays"));
}


// --- Fase 3, painel 3: "Qualidade e método" (explica de onde vem o número; só o que o DTO expõe) ---
{
  const lerM = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');
  const base = buildParecerProduto({ ...fonte({ count: 3, trackingDays: 5, measuredDaysTotal: 5, dataBase: { level: 'medium', measuredDays30: 4, stores: 3, range: null } }), legacyDays: 0 });
  const m = base.camada.metodo;
  check('método: existe com preço, dias e lojas', m != null && m.blocos.length === 5);
  const tit = (mm: typeof m) => (mm ? mm.blocos.map((b) => b.titulo) : []);
  check('método: títulos dos blocos', tit(m).join(' | ') === 'De onde vem o preço agora | O que conta como loja | O número de cada dia | Há quanto tempo acompanhamos | Dias medidos', tit(m));
  const txt = (mm: typeof m, t: string) => mm?.blocos.find((b) => b.titulo === t)?.texto ?? '';
  check('método: preço agora = menor preço de oferta ativa verificada nas últimas 48 horas (da constante de frescor)', txt(m, 'De onde vem o preço agora').includes('menor preço entre as ofertas') && txt(m, 'De onde vem o preço agora').includes('últimas 48 horas') && FRESH_MAX_AGE_MS === 48 * 3_600_000);
  check('método: loja = vendedor distinto, e o texto de hoje é o mesmo do cartão', txt(m, 'O que conta como loja').includes('Cada vendedor diferente conta como uma loja') && txt(m, 'O que conta como loja').endsWith(`Hoje: ${base.cobertura.lojasTexto}.`));
  check('método: dado do dia = cada oferta vale 1 por dia, com o valor do meio explicado', txt(m, 'O número de cada dia').includes('cada oferta vale 1 por dia') && txt(m, 'O número de cada dia').includes('metade ficou abaixo, metade acima'));
  check('método: acompanhamento é o mesmo texto do cartão e cita a data de corte do regime', txt(m, 'Há quanto tempo acompanhamos').startsWith(base.cobertura.acompanhamentoTexto) && txt(m, 'Há quanto tempo acompanhamos').includes('anteriores a 31/10/2026'));
  check('método: sem dias legados, não cita legado; com legado, cita a quantidade', !txt(m, 'Há quanto tempo acompanhamos').includes('nessa situação') && txt(buildParecerProduto({ ...fonte({ count: 3, measuredDaysTotal: 5 }), legacyDays: 2 }).camada.metodo, 'Há quanto tempo acompanhamos').includes('este produto tem 2 dias nessa situação'));
  check('método: dias medidos e dias com 3+ lojas (do DTO)', txt(m, 'Dias medidos') === '5 dias com preço medido, e 4 dias dos últimos 30 com preço de 3 ou mais lojas (o mínimo para comparar entre lojas).', txt(m, 'Dias medidos'));
  check('método: sem a contagem de dias medidos no DTO, o bloco some (nada presumido)', !tit(buildParecerProduto(fonte({ count: 3 })).camada.metodo).includes('Dias medidos'));
  check('método: 1 dia medido no singular', txt(buildParecerProduto(fonte({ count: 3, measuredDaysTotal: 1 })).camada.metodo, 'Dias medidos') === '1 dia com preço medido.');

  // Avisos só quando valem para o produto.
  const av = (mm: typeof m) => (mm ? mm.avisos : []);
  check('aviso: poucos dias medidos (<14)', av(m).some((t) => t.startsWith('Poucos dias medidos (5)')) && !av(buildParecerProduto(fonte({ count: 3, measuredDaysTotal: 20 })).camada.metodo).some((t) => t.startsWith('Poucos dias')));
  check('aviso: 1 loja só', av(buildParecerProduto(fonte({ count: 1, measuredDaysTotal: 5 })).camada.metodo).includes('Só uma loja tem preço verificado hoje: não há como comparar com outras lojas.') && !av(m).some((t) => t.startsWith('Só uma loja')));
  check('aviso: 2 lojas', av(buildParecerProduto(fonte({ count: 2, measuredDaysTotal: 5 })).camada.metodo).some((t) => t.startsWith('Só duas lojas') && t.includes('precisa de 3 ou mais')));
  // Item 1 (QA): o aviso da faixa plausível só existe quando há oferta DE FATO fora da faixa para o produto.
  const comFora = (k: number | undefined) => av(buildParecerProduto(fonte({ count: 3, now: { ...NOW, freshOffers: 7 }, measuredDaysTotal: 5, ...(k === undefined ? {} : { outOfBandOffers: k }) })).camada.metodo).find((t) => /fora do normal/.test(t)) ?? '';
  check('aviso: faixa plausível NÃO aparece sem oferta fora da faixa (0), nem sem a contagem no DTO', comFora(0) === '' && comFora(undefined) === '');
  check('aviso: faixa plausível NÃO aparece só porque há 3+ ofertas', av(buildParecerProduto(fonte({ count: 4, now: { ...NOW, freshOffers: 9 }, measuredDaysTotal: 20, outOfBandOffers: 0 })).camada.metodo).length === 0);
  const faixa1 = comFora(1);
  check('aviso: 1 oferta fora da faixa (singular, limites vêm das constantes da regra)', faixa1.startsWith('Há 1 oferta com preço muito fora do normal') && faixa1.includes(`abaixo de ${PLAUSIBILITY_FLOOR_PERCENT}%`) && faixa1.includes(`acima de ${AGGREGATE_CEILING_MEDIAN_MULTIPLE} vezes`) && faixa1.includes('ela aparece na lista de lojas, marcada, mas não entra na contagem de lojas nem no valor do meio'), faixa1);
  const faixa3 = comFora(3);
  check('aviso: 3 ofertas fora da faixa (plural)', faixa3.startsWith('Há 3 ofertas com preço muito fora do normal') && faixa3.includes('elas aparecem na lista de lojas, marcadas, mas não entram'), faixa3);
  check('aviso: sem preço agora, sem aviso de faixa', av(buildParecerProduto(fonte({ now: null, count: 0, trackingDays: 3, measuredDaysTotal: 3, outOfBandOffers: 2 })).camada.metodo).every((t) => !/fora do normal/.test(t)));

  // Item 2 (QA): "o menor preço registrado ignora..." só quando a linha "Menor preço registrado" está visível (mesma condição do cartão).
  const lowsVisiveis = { d30: null, d90: null, all: lowAll(32990) };
  const comLinha = buildParecerProduto({ ...fonte({ count: 2, trackingDays: 5, measuredDaysTotal: 5, lows: lowsVisiveis }), weakNotice: 'footer' });
  const semLinha = buildParecerProduto({ ...fonte({ count: 3, measuredDaysTotal: 5 }), weakNotice: 'footer' });
  const AVISO_FRACO = 'O "menor preço registrado" ignora vendedores de baixa reputação.';
  check('aviso: menor registrado visível + weakNotice => aviso aparece e a linha do cartão também', comLinha.menorRegistrado !== null && comLinha.menorIgnoraBaixaReputacao === true && av(comLinha.camada.metodo).includes(AVISO_FRACO));
  check('aviso: menor registrado AUSENTE (null) => sem o aviso (a linha não existe)', semLinha.menorRegistrado === null && semLinha.menorIgnoraBaixaReputacao === false && !av(semLinha.camada.metodo).includes(AVISO_FRACO));
  check('aviso: em `fato` a linha do menor registrado não existe, então o aviso também não', !av(buildParecerProduto({ ...fonte({ count: 3, trackingDays: 5, measuredDaysTotal: 5, lows: lowsVisiveis }), weakNotice: 'prominent' }).camada.metodo).includes(AVISO_FRACO));
  check('aviso: weakNotice none => sem o aviso mesmo com a linha visível', !av(buildParecerProduto({ ...fonte({ count: 2, trackingDays: 5, measuredDaysTotal: 5, lows: lowsVisiveis }), weakNotice: 'none' }).camada.metodo).includes(AVISO_FRACO));
  check('aviso: o aviso e a linha do cartão saem da MESMA variável (nunca divergem)', lerM('src/lib/pricing/parecer-produto.ts').includes('menorIgnoraBaixaReputacao: menorIgnoraFraco') && lerM('src/lib/pricing/parecer-produto.ts').includes('if (!LOWS_INCLUDE_WEAK_SELLER && menorIgnoraFraco)'));
  check('aviso: baixa reputação no menor preço agora', av(buildParecerProduto(fonte({ count: 3, now: { ...NOW, weakSeller: true }, measuredDaysTotal: 5 })).camada.metodo).some((t) => t.startsWith('O menor preço agora é de um vendedor de baixa reputação')) && !av(m).some((t) => /baixa reputação/.test(t)));

  // Item 4 (QA): dia sem cotação vale o último preço por até 48 horas.
  check('método: "número de cada dia" diz que sem cotação no dia vale o último preço por até 48 horas', txt(m, 'O número de cada dia').endsWith('Se ela não teve cotação naquele dia, vale o último preço dela por até 48 horas.') && txt(m, 'O número de cada dia').includes('cada oferta vale 1 por dia'), txt(m, 'O número de cada dia'));

  // Item 3 (QA): uma única régua de frescor para a contagem de lojas e o preço agora.
  const hoje = new Date('2026-11-05T12:00:00.000Z');
  const hh = (horas: number) => new Date(hoje.getTime() - horas * 3_600_000);
  const velhaCotacao: LiveOfferInput[] = [
    { offerId: 'a', networkId: 'n', sellerId: 's1', priceCents: 8000, quotedAt: hh(2), checkedAt: hh(1) },
    { offerId: 'b', networkId: 'n', sellerId: 's2', priceCents: 8100, quotedAt: hh(60), checkedAt: hh(1) },
    { offerId: 'c', networkId: 'n', sellerId: 's3', priceCents: 8200, quotedAt: null, checkedAt: hh(1) },
  ];
  const liveV = computeLiveMinFromOffers(velhaCotacao, hoje);
  check('frescor: o preço agora só enxerga 1 das 3 ofertas (cotação velha ou ausente fica fora)', liveV?.freshOffers === 1);
  check('frescor: a contagem de lojas com o MESMO filtro também enxerga 1 (antes contava 3)', storesToday(velhaCotacao.filter((o) => ofertaFresca(o, hoje)).map((o) => ({ storeKey: o.sellerId as string, priceCents: o.priceCents }))).storeCount === 1 && storesToday(velhaCotacao.map((o) => ({ storeKey: o.sellerId as string, priceCents: o.priceCents }))).storeCount === 3);
  check('frescor: o servidor filtra por ofertaFresca antes de contar lojas e redes', lerM('src/server/pricing/price-metrics-v2.ts').includes('const freshLive = liveOffers.filter((o) => ofertaFresca(o, now));') && lerM('src/server/pricing/price-metrics-v2.ts').includes('const storeOffers = freshLive.map('));
  const ofr = (id: string, cents: number): LiveOfferInput => ({ offerId: id, networkId: 'n', sellerId: `s-${id}`, priceCents: cents, quotedAt: hh(2), checkedAt: hh(1) });
  check('faixa: contarForaDaFaixa usa a mesma régua do painel de lojas (outlier baixo = 1; sem outlier = 0; menos de 3 ofertas = 0)', contarForaDaFaixa([ofr('a', 1000), ofr('b', 7800), ofr('c', 8000), ofr('d', 8200)], hoje) === 1 && contarForaDaFaixa([ofr('a', 7500), ofr('b', 7800), ofr('c', 8000)], hoje) === 0 && contarForaDaFaixa([ofr('a', 1000), ofr('b', 7800)], hoje) === 0);
  check('faixa: o DTO expõe a contagem e a chave de cache foi renovada', lerM('src/server/pricing/price-metrics-v2.ts').includes('outOfBandOffers: contarForaDaFaixa(liveOffers, now)') && lerM('src/server/pricing/price-metrics-v2.ts').includes("'price-metrics-v2-8'"));

  // Ocultar quando não há o que dizer.
  check('método: sem preço, sem dias e sem lojas => oculto (null)', buildParecerProduto(fonte({ now: null, count: 0, trackingDays: 0, firstDay: null })).camada.metodo === null);
  check('método: só com preço (sem dias) já explica', buildParecerProduto(fonte({ count: 1, trackingDays: 0, firstDay: null })).camada.metodo !== null && buildParecerProduto(fonte({ now: null, count: 0, trackingDays: 3 })).camada.metodo !== null);

  // Linguagem simples e termos proibidos em TODO o texto do painel.
  const todos = [base, buildParecerProduto(fonte({ count: 1, measuredDaysTotal: 1 })), buildParecerProduto({ ...fonte({ count: 2, now: { ...NOW, weakSeller: true, freshOffers: 3 }, measuredDaysTotal: 3 }), weakNotice: 'prominent', legacyDays: 1 })]
    .map((p) => (p.camada.metodo ? [...p.camada.metodo.blocos.flatMap((b) => [b.titulo, b.texto]), ...p.camada.metodo.avisos].join(' | ') : ''))
    .join(' || ')
    .toLowerCase();
  for (const proibido of [...TEXTOS_PROIBIDOS, 'oferta-dia', 'oferta dia', 'mediana', 'backtest', 'quarentena', 'api']) check(`método: sem "${proibido}" (linguagem simples)`, !todos.includes(proibido), proibido);

  // Componente: estático (sem fetch, altura previsível), tom secundário, antes do gráfico.
  const prodM = lerM('src/components/affiliate/camada-produto.tsx');
  const ordemM = [...prodM.matchAll(/data-panel="([a-z-]+)"/g)].map((x) => x[1]);
  check('método: painel sem busca de dados (vem do contrato, não desloca) e só quando há conteúdo', prodM.includes('{camada.metodo && (') && !prodM.includes('fetch(') && !prodM.includes('useEffect'));
  check('método: o gráfico segue como ÚLTIMO painel e o método vem antes', ordemM.at(-1) === 'grafico' && ordemM.indexOf('qualidade') > -1 && ordemM.indexOf('qualidade') < ordemM.indexOf('grafico'), ordemM);
  const blocoPainel = prodM.slice(prodM.indexOf('{camada.metodo && ('), prodM.indexOf('{camada.graficoDisponivel && produtoId'));
  check('método: sem tom terciário, sem cor semântica, sem raio, sem botão', !/tertiary|accent-(success|danger|hype)|rounded|<button/.test(blocoPainel) && blocoPainel.includes('--color-text-secondary'));
  const htmlM = n(renderToStaticMarkup(createElement(ProductCardV1, { parecer: base, produtoNome: 'P' })));
  check('método: o cartão não carrega o painel (só a camada)', !htmlM.includes('De onde vem o preço agora'));
}


// --- formação: menos de 3 lojas, 1 loja, vendedor fraco ---
{
  const f2 = buildParecerProduto(fonte({ count: 2 }));
  check('2 lojas => formação, sem comparação', f2.estado === 'formacao' && f2.comparacao === null);
  check('2 lojas: texto "2 vendedores no Mercado Livre"', f2.cobertura.lojasTexto === '2 vendedores no Mercado Livre', f2.cobertura.lojasTexto);
  const f1 = buildParecerProduto(fonte({ count: 1, trackingDays: 1, firstDay: '2026-11-05' }));
  check('1 loja => "só 1 loja monitorada"', f1.cobertura.lojasTexto === 'só 1 loja monitorada');
  check('1 dia => singular', f1.cobertura.acompanhamentoTexto === 'Acompanhando há 1 dia (desde 05/11)', f1.cobertura.acompanhamentoTexto);
  check('formação: rótulo', f1.rotuloEstado === 'Ainda juntando histórico');
  const fw = buildParecerProduto(fonte({ count: 3, storesComparison: null, now: { ...NOW, weakSeller: true } }));
  check('vendedor fraco (sem comparação) => formação + aviso', fw.estado === 'formacao' && fw.baixaReputacao === true && fw.comparacao === null);
  check('contagem 1 com rede qualquer continua "só 1 loja"', textoLojas(1, ['Shopee']) === 'só 1 loja monitorada');
  check('rede desconhecida => "N lojas"', textoLojas(4, undefined) === '4 lojas');
}

// --- dias acompanhados e "menor desde" ---
{
  const f = buildParecerProduto(fonte({ count: 2, lows: { d30: null, d90: null, all: lowAll(32990) } }));
  check('acompanhando há 5 dias (desde 31/10)', f.cobertura.acompanhamentoTexto === 'Acompanhando há 5 dias (desde 31/10)', f.cobertura.acompanhamentoTexto);
  check('menor desde 01/11 quando menor < agora e 2+ dias', f.menorRegistrado?.cents === 32990 && f.menorRegistrado.dia === '01/11' && n(f.menorRegistrado.texto) === 'Menor preço registrado em 01/11: R$ 329,90 · Loja B (Mercado Livre)', f.menorRegistrado?.texto);
  const g = buildParecerProduto(fonte({ count: 2, lows: { d30: null, d90: null, all: lowAll(34990) } }));
  check('menor igual ao agora => omitido', g.menorRegistrado === null);
  const h = buildParecerProduto(fonte({ count: 2, lows: { d30: null, d90: null, all: lowAll(36000) } }));
  check('menor registrado acima do agora => omitido (nunca "menor" falso)', h.menorRegistrado === null);
  const i = buildParecerProduto(fonte({ count: 2, trackingDays: 1, lows: { d30: null, d90: null, all: lowAll(32990) } }));
  check('1 dia medido => sem "menor desde"', i.menorRegistrado === null);
}

// --- sem dado ---
{
  const s = buildParecerProduto(fonte({ now: null, count: 0, median: null, trackingDays: 0, firstDay: null, storesComparison: null }));
  check('sem preço: preco null, formação', s.preco === null && s.estado === 'formacao');
  check('sem dado: texto de ausência (nunca zero)', s.cobertura.acompanhamentoTexto === 'Sem dias medidos ainda' && s.cobertura.desde === null && s.cobertura.lojasTexto === 'nenhuma loja com preço verificado hoje', s.cobertura);
  const mediana = buildParecerProduto(fonte({ now: null, count: 5, median: 38000, storesComparison: null }));
  check('sem preço agora, mesmo com lojas: sem comparação', mediana.estado === 'formacao' && mediana.comparacao === null);
}

// --- nunca juízo; <3 ofertas / <14 dias ---
{
  check('config: juízo desligado por padrão', VERDICT_JUDGEMENT_ENABLED === false);
  const casos: Array<[string, ParecerFonte]> = [
    ['5 dias, 3 lojas', fonte({ count: 3, trackingDays: 5 })],
    ['13 dias, 3 lojas', fonte({ count: 3, trackingDays: 13 })],
    ['30 dias, 8 lojas', fonte({ count: 8, trackingDays: 30, median: 36000 })],
    ['1 loja', fonte({ count: 1 })],
    ['2 lojas', fonte({ count: 2, trackingDays: 20 })],
    ['sem dado', fonte({ now: null, count: 0, trackingDays: 0, firstDay: null })],
  ];
  for (const [nome, f] of casos) {
    for (const judgementEnabled of [false, true]) {
      const p = buildParecerProduto(f, { judgementEnabled });
      check(`nunca juízo: ${nome} (juízo ligado=${judgementEnabled})`, p.estado !== 'juizo' && p.juizo === null, p.estado);
      check(`título fixo: ${nome}`, p.titulo === PARECER_TITULO && p.titulo === 'O que sabemos hoje');
    }
  }
  const rotulosJuizo = ['abaixo do usual', 'preço normal', 'acima do usual', 'menor preço do período', 'compre', 'aproveite', 'vale a pena', 'oportunidade'];
  for (const [nome, f] of casos) {
    const t = textosDe(buildParecerProduto(f));
    for (const r of rotulosJuizo) check(`sem rótulo de juízo "${r}": ${nome}`, !t.includes(r), t);
  }
}

// --- textos proibidos (contrato + componente) ---
{
  const todos = [fonte({ count: 3 }), fonte({ count: 2 }), fonte({ count: 1 }), fonte({ now: null, count: 0, trackingDays: 0, firstDay: null })].map((f) => textosDe(buildParecerProduto(f))).join(' ');
  for (const proibido of TEXTOS_PROIBIDOS) check(`contrato sem "${proibido}"`, !todos.includes(proibido), todos);
  const comp = readFileSync(join(__dirname, '../src/components/affiliate/product-card-v1.tsx'), 'utf8');
  // Só o que o usuário vê: remove comentários antes de procurar (o cabeçalho cita o guia).
  const semComentario = comp.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^import .*$/gm, '');
  // Literais de texto e texto JSX (identificadores e caminhos de import não são o que o usuário vê).
  const literais = [...semComentario.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)].map((m) => m[2]);
  const jsx = [...semComentario.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  const visivel = [...literais, ...jsx].join(' | ').toLowerCase();
  for (const proibido of TEXTOS_PROIBIDOS) check(`componente sem "${proibido}"`, !visivel.includes(proibido));
  check('componente sem botão de alerta/avisar', !/avisar|avise|alerta de pre/.test(visivel.replace(/data-slot="alerta-preco"/g, '')));
  check('componente sem cor semântica (success/danger/hype)', !/accent-(success|danger|hype)|text-(green|red|amber)/.test(visivel));
  check('componente sem raio', !/rounded|border-radius/.test(visivel));
  check('componente sem imagem', !/<img|next\/image|sceneimage|productimage/.test(visivel));
  check('componente: foco dourado 2px', comp.includes('outline-2') && comp.includes('--color-border-focus'));
}

console.log(fails === 0 ? `OK: ${total} verificações` : `${fails} de ${total} falharam`);
process.exit(fails === 0 ? 0 : 1);
