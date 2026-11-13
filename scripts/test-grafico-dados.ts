/**
 * TESTE DO CONTRATO DE DADOS DO GRÁFICO V2 (checklist #27, parte de dados). Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-grafico-dados.ts
 * Só SELECT (3 produtos reais, espaçados 2 s; teto de 8 s por consulta). Nada é gravado.
 * Invariantes: só dias medidos (sem interpolar), média oferta-dia única (= a do selo/cabeçalho V2), mínimos reais, eventos completos.
 */
import { carregarGraficoDados } from '../src/server/pricing/grafico-dados';
import { getPriceChartV2 } from '../src/server/pricing/price-chart-v2';
import { getPriceMetricsV2 } from '../src/server/pricing/price-metrics-v2';
import { addDays } from '../src/lib/pricing/daily-state';

let fails = 0;
let total = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  total++;
  if (!ok) {
    fails++;
    console.error(`FALHOU: ${name}`, detail ?? '');
  }
};
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRODUTOS: Array<[string, string]> = [
  ['Resident Evil Village PS5', 'b26889a8-b861-4dd0-932c-89d265b06fa2'],
  ['Switch 2 Pokémon Legends Z-A (1 oferta)', '062777d2-1c34-4d6e-b7c4-0688ca2ac231'],
  ['Metroid Prime 4 Switch 2', '49564a65-a1e3-48a1-9d84-694ed05d000b'],
];

(async () => {
  for (const [nome, id] of PRODUTOS) {
    const t = Date.now();
    const g = await carregarGraficoDados(id);
    const ms = Date.now() - t;
    check(`${nome}: devolve dados`, g != null);
    if (!g) continue;
    await pausa(2000);
    const v2 = await getPriceChartV2(id);
    await pausa(2000);
    const pm = await getPriceMetricsV2(id);

    // 1) Só dias medidos, ordenados, sem repetição, sem interpolar.
    const dias = g.dias.map((d) => d.dia);
    check(`${nome}: dias estritamente crescentes`, dias.every((d, i) => i === 0 || dias[i - 1] < d));
    check(`${nome}: todo dia tem menor preço e qualidade complete/partial`, g.dias.every((d) => d.minCents > 0 && (d.qualidade === 'complete' || d.qualidade === 'partial')));
    check(`${nome}: nenhum dia antes do regime`, g.dias.every((d) => d.dia >= g.inicioRegime));
    const medidosV2 = (v2?.days ?? []).filter((d) => (d.quality === 'complete' || d.quality === 'partial') && d.minCents != null).map((d) => d.day);
    check(`${nome}: mesmos dias medidos do gráfico V2 atual`, JSON.stringify(medidosV2) === JSON.stringify(dias), { v2: medidosV2.length, novo: dias.length });
    // buracos: todo dia sem medição está entre o primeiro e o último e NÃO está em dias
    check(`${nome}: dias sem medição não têm ponto`, g.diasSemMedicao.every((d) => !dias.includes(d) && d > dias[0] && d < dias[dias.length - 1]));
    check(`${nome}: dias + buracos cobrem o intervalo sem sobra`, dias.length + g.diasSemMedicao.length === (dias.length ? Math.round((new Date(`${dias[dias.length - 1]}T12:00:00Z`).getTime() - new Date(`${dias[0]}T12:00:00Z`).getTime()) / 86_400_000) + 1 : 0));

    // 2) Média: só com 3+ ofertas; média única = a do selo (averages.all) e a de refs do V2.
    check(`${nome}: média do dia só com 3 ou mais ofertas`, g.dias.every((d) => (d.nOfertas >= 3) === (d.mediaOfertaDiaCents != null) || d.mediaOfertaDiaCents == null));
    check(`${nome}: nenhuma média do dia com menos de 3 ofertas`, g.dias.every((d) => d.nOfertas >= 3 || d.mediaOfertaDiaCents == null));
    check(`${nome}: faixa alta >= menor do dia quando existe`, g.dias.every((d) => d.faixaAltaCents == null || d.faixaAltaCents >= d.minCents));
    check(`${nome}: ofertas na faixa <= ofertas do dia`, g.dias.every((d) => d.nOfertasNaFaixa <= Math.max(d.nOfertas, d.nOfertasNaFaixa) && d.nOfertasNaFaixa >= 0));
    const aviso = pm.averages.all;
    check(`${nome}: média 'Tudo' = média do selo (price-metrics-v2 averages.all)`, (aviso?.avgCents ?? null) === g.media.Tudo.avgCents, { selo: aviso?.avgCents, novo: g.media.Tudo.avgCents });
    check(`${nome}: média 'Tudo' = refs.Tudo do gráfico V2`, (v2?.refs.Tudo.avgCents ?? null) === g.media.Tudo.avgCents, { v2: v2?.refs.Tudo.avgCents, novo: g.media.Tudo.avgCents });
    check(`${nome}: média 3M = selo d90`, (pm.averages.d90?.avgCents ?? null) === g.media['3M'].avgCents, { selo: pm.averages.d90?.avgCents, novo: g.media['3M'].avgCents });
    check(`${nome}: média 1M = selo d30`, (pm.averages.d30?.avgCents ?? null) === g.media['1M'].avgCents, { selo: pm.averages.d30?.avgCents, novo: g.media['1M'].avgCents });

    // 3) Mínimos reais: o menor entre os menores do dia; nunca abaixo de nenhum dia medido.
    const menorDia = Math.min(...g.dias.map((d) => d.minCents));
    check(`${nome}: mínimo 'tudo' = menor dos dias medidos`, g.minimos.tudo?.cents === menorDia);
    check(`${nome}: mínimo da janela >= mínimo de sempre`, (['1D', '1S', '1M', '3M'] as const).every((k) => g.minimos[k] == null || (g.minimos[k]!.cents >= menorDia)));

    // 4) Eventos: todos os do V2, em ordem, com loja e rede; Amazon traz confirmação.
    check(`${nome}: mesmos eventos do gráfico V2 (${g.eventos.length})`, (v2?.events.length ?? 0) === g.eventos.length, { v2: v2?.events.length, novo: g.eventos.length });
    check(`${nome}: eventos em ordem de horário`, g.eventos.every((e, i) => i === 0 || g.eventos[i - 1].em <= e.em));
    check(`${nome}: todo evento tem valor, loja e rede`, g.eventos.every((e) => e.minCents > 0 && e.loja.length > 0 && e.rede.length > 0));
    check(`${nome}: evento da Amazon traz confirmadoEm; das demais redes não`, g.eventos.every((e) => (e.rede === 'amazon') === (e.confirmadoEm != null) || e.rede === 'amazon'));
    check(`${nome}: 'mesmoInstante' marca pares`, g.eventos.every((e, i) => !e.mesmoInstante || (g.eventos[i - 1]?.em === e.em || g.eventos[i + 1]?.em === e.em)));

    const amostraDia = g.dias[g.dias.length - 1];
    console.log(
      `${nome}: ${ms} ms | ${g.dias.length} dias medidos, ${g.diasSemMedicao.length} buracos, ${g.eventos.length} eventos | média Tudo ${g.media.Tudo.avgCents} (selo ${aviso?.avgCents}) | mín ${g.minimos.tudo?.cents} em ${g.minimos.tudo?.dia} | último dia ${amostraDia.dia}: mín ${amostraDia.minCents}, média ${amostraDia.mediaOfertaDiaCents}, n ${amostraDia.nOfertas}, composição ${amostraDia.composicao}`
    );
    void addDays;
    await pausa(2000);
  }
  console.log(`${total - fails}/${total} verificações ok`);
  process.exit(fails ? 1 : 0);
})();
