// Contrato `ParecerProduto` (Fases 1 e 2 do cartão-pai, ata 2026-11-05): o objeto ÚNICO que alimenta o cartão "O que sabemos hoje"
// e a camada que cresce dele (e, na Fase 3, o BI). Módulo PURO: sem banco, sem server-only. A interface nunca recalcula: só apresenta este objeto.
//
// Regras fechadas (ata e guia visual):
//  - Estados `formacao` | `fato` | `juizo`. O estado `juizo` existe no TIPO (slot reservado), mas esta fase NUNCA o emite:
//    nenhum rótulo de juízo é produzido, nem com VERDICT_JUDGEMENT_ENABLED ligado, enquanto o backtest não liberar.
//  - `fato` só com 3+ lojas distintas hoje e comparação disponível (valor do meio entre as lojas hoje). Senão `formacao`.
//  - Sem dado fake: lacuna é `null`/texto de ausência, nunca zero nem preenchimento.
//  - Toda mudança do menor preço fica visível (AGENTS.md): `ultimaMudanca` com horário, valor e loja.
//  - Textos proibidos: "parecer" e "afiliado/afiliada/affiliate" (ver `TEXTOS_PROIBIDOS`).
import { formatBRL } from '@/lib/format';
import { DATA_BASE_LABEL, MIN_STORES_FOR_MEDIAN, type DataBaseLevel } from '@/lib/pricing/price-verdict-v2';
import { JUDGEMENT_MEASURED_WINDOW_DAYS, PARECER_PERCENTUAL_EXTREMO } from '@/lib/pricing/price-metrics-config';
import type { PriceMetricsV2 } from '@/server/pricing/price-metrics-v2';

export const PARECER_TITULO = 'O que sabemos hoje';
export const ROTULO_FORMACAO = 'Ainda juntando histórico';
/** Base mínima para o painel do gráfico: o gráfico V2 só desenha com 2 ou mais dias MEDIDOS (complete/partial; dias de calendário sem medição não contam). Sem a contagem no DTO, o painel fica oculto. */
export const GRAFICO_MIN_DIAS = 2;
export const ROTULO_FATO = 'Comparado com as lojas de hoje';

/** Termos que não podem aparecer em nenhum texto visível, aria-label ou title do cartão e da camada (sem acentos, minúsculo). */
export const TEXTOS_PROIBIDOS = ['parecer', 'afiliad', 'affiliate'] as const;

export type ParecerEstado = 'formacao' | 'fato' | 'juizo';

/** Subconjunto de `PriceMetricsV2` que o contrato lê (facilita o teste puro sem montar o DTO inteiro). */
export type ParecerFonte = Pick<PriceMetricsV2, 'now' | 'stores' | 'storesComparison' | 'trackingDays' | 'firstDay' | 'lows'> &
  Partial<Pick<PriceMetricsV2, 'weakNotice' | 'lastEvent' | 'dataBase' | 'measuredDaysTotal'>>;

export interface ParecerProduto {
  estado: ParecerEstado;
  /** Sempre "O que sabemos hoje" nesta fase. */
  titulo: string;
  /** Rótulo curto do estado, no canto da linha de título. */
  rotuloEstado: string;
  /** Preço agora (menor preço elegível vigente). null = nenhuma oferta verificada nas últimas 48 h. */
  preco: {
    cents: number;
    /** Loja que detém o preço. null = empate sem como afirmar qual loja. */
    loja: string | null;
    /** Empate: "N ofertas com este mesmo preço" quando a loja não pode ser afirmada (como no bloco anterior). null caso contrário. */
    empateTexto: string | null;
    /** Instante ISO da última checagem. O "há X h" é calculado no CLIENTE a partir dele. */
    verificadoEmIso: string;
  } | null;
  /** Estado `fato`: preço agora contra o valor do meio entre as lojas hoje. null nos demais estados. */
  comparacao: {
    direcao: 'abaixo' | 'igual' | 'proximo' | 'acima';
    /** Percentual inteiro, em módulo (a direção vem em `direcao`). */
    percentual: number;
    valorDoMeioCents: number;
    /** Frase única e factual do cartão (sem cor, sem juízo). */
    frase: string;
    /** Linha de apoio: "Valor do meio: R$ X, entre N vendedores no Mercado Livre." */
    apoio: string;
  } | null;
  /**
   * SINALIZADOR para decisão do dono (nenhum texto muda): a comparação está mais de `PARECER_PERCENTUAL_EXTREMO` % (50) ABAIXO do
   * valor do meio. Costuma indicar anúncio errado, kit incompleto ou produto diferente. false sem comparação.
   */
  percentualExtremo: boolean;
  cobertura: {
    /** Lojas distintas hoje (vendedores distintos, como o código conta). */
    lojas: number;
    /** "só 1 loja monitorada" | "N vendedores no Mercado Livre" | "N lojas" | "nenhuma loja com preço verificado hoje". */
    lojasTexto: string;
    diasAcompanhados: number;
    /** "DD/MM" do primeiro dia medido; null sem dado. */
    desde: string | null;
    /** "Acompanhando há N dias (desde DD/MM)" ou texto de ausência. */
    acompanhamentoTexto: string;
    /**
     * Linha de cobertura do cartão (uma só, sem repetir informação). `formacao`: acompanhamento + lojas.
     * `fato`: só o acompanhamento, porque a quantidade de lojas já está na linha de apoio da comparação.
     */
    linha: string;
  };
  /** Só em `formacao`, com 2+ dias medidos e menor registrado abaixo do preço agora: "Menor preço registrado em DD/MM". */
  menorRegistrado: { cents: number; dia: string; loja: string; texto: string } | null;
  /**
   * Último evento gravado do menor preço (horário, valor e loja; regra do dono). null = nenhum evento (lacuna, nunca inventado).
   * `texto` = "Última mudança do menor preço: R$ X em DD/MM às HH:mm, loja Y (antes R$ Z)" quando o evento é do menor preço atual;
   * senão "Último evento registrado do menor preço: ..." (nunca afirma que aquele valor é o preço agora; o evento continua visível).
   */
  ultimaMudanca: { cents: number; atIso: string; loja: string | null; antesCents: number | null; texto: string; /** O evento é do menor preço ATUAL (`matchesNow`). false: o menor preço atual é de outra oferta e o texto diz só "último evento registrado". */ eDoPrecoAtual: boolean } | null;
  /** Quem detém o preço agora é vendedor de baixa reputação (aviso neutro). */
  baixaReputacao: boolean;
  /**
   * "Menor preço registrado" ignora vendedor de baixa reputação e essa regra de fato mudou um mínimo: o cartão avisa, em uma linha.
   * Só existe com `menorRegistrado` visível (o aviso "abaixo do menor de 30 dias" não se aplica: o cartão não mostra o menor de 30 dias).
   */
  menorIgnoraBaixaReputacao: boolean;
  /** Conteúdo da camada (Fase 2), do mesmo objeto: a interface não recalcula nada. */
  camada: {
    /** "O que sabemos": fatos de hoje, uma frase por linha. */
    sabemos: string[];
    /** "O que ainda não dá para afirmar" e por quê, sem prometer prazo. */
    falta: string[];
    /** Só com 2+ lojas distintas hoje; null caso contrário (painel oculto). */
    lojasHoje: { quantidade: number; texto: string; valorDoMeioTexto: string | null; /** Ofertas frescas elegíveis (= `now.freshOffers`): o painel reserva essa quantidade de linhas e o teste confere com a rota. */ ofertas: number } | null;
    /** Qualidade do dado: nível da base e resumo. */
    qualidade: { nivel: DataBaseLevel; rotulo: string; resumo: string };
    /** "Como calculamos", em frases curtas. */
    comoCalculamos: string[];
    /** Painel do gráfico (Fase 3): só com 2+ dias MEDIDOS (`measuredDaysTotal`, mesma fonte do gráfico). false = painel oculto. */
    graficoDisponivel: boolean;
  };
  /** Slot do juízo: SEMPRE null nesta fase (desligado até o backtest). */
  juizo: null;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/** "YYYY-MM-DD" -> "DD/MM". */
export function diaMes(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

const TZ = 'America/Sao_Paulo';
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Instante ISO -> { dm: "DD/MM", hm: "HH:mm" } no fuso de São Paulo (determinístico, sem depender do fuso do servidor). */
export function dataHoraSP(iso: string): { dm: string; hm: string } {
  const p = Object.fromEntries(fmtDataHora.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { dm: `${p.day}/${p.month}`, hm: `${p.hour}:${p.minute}` };
}

/** Texto de lojas: "vendedores" quando a rede é única (a verdade), "lojas" quando há mais de uma rede. */
export function textoLojas(count: number, networks: string[] | undefined): string {
  if (count <= 0) return 'nenhuma loja com preço verificado hoje';
  if (count === 1) return 'só 1 loja monitorada';
  if (networks && networks.length === 1) return `${count} vendedores no ${networks[0]}`;
  return `${count} lojas`;
}

function fraseComparacao(direcao: 'abaixo' | 'igual' | 'proximo' | 'acima', percentual: number): string {
  if (direcao === 'igual') return 'No mesmo valor do meio entre as lojas hoje';
  if (direcao === 'proximo') return 'Praticamente igual ao valor do meio entre as lojas hoje (menos de 1% de diferença)';
  return `${percentual}% ${direcao === 'abaixo' ? 'abaixo' : 'acima'} do valor do meio entre as lojas hoje`;
}

/** "Última mudança do menor preço: R$ X em DD/MM às HH:mm, loja Y (antes R$ Z)". Sem loja, omite a loja; sem valor anterior, "(primeiro registro)". */
export function textoUltimaMudanca(e: { cents: number; at: string; store: string | null; prevCents: number | null }, eDoPrecoAtual = true): string {
  const { dm, hm } = dataHoraSP(e.at);
  const loja = e.store ? `, loja ${e.store}` : '';
  const antes = e.prevCents != null ? ` (antes ${formatBRL(e.prevCents)})` : ' (primeiro registro)';
  return `${eDoPrecoAtual ? 'Última mudança do menor preço' : 'Último evento registrado do menor preço'}: ${formatBRL(e.cents)} em ${dm} às ${hm}${loja}${antes}`;
}

/**
 * Monta o contrato a partir do DTO de `getPriceMetricsV2`. Função pura, determinística e sem escrita.
 * `juizo` nunca é emitido (ver cabeçalho): o argumento `judgementEnabled` existe só para o teste provar que, mesmo ligado, nada muda.
 */
export function buildParecerProduto(fonte: ParecerFonte, _opts: { judgementEnabled?: boolean } = {}): ParecerProduto {
  const { now, stores, storesComparison: cmp } = fonte;
  const lojasTexto = textoLojas(stores.count, stores.networks);

  const comparavel = now != null && stores.count >= MIN_STORES_FOR_MEDIAN && stores.medianCents != null && cmp != null;
  const estado: ParecerEstado = comparavel ? 'fato' : 'formacao';

  const DIRECAO = { below: 'abaixo', equal: 'igual', near: 'proximo', above: 'acima' } as const;
  const direcao = cmp ? DIRECAO[cmp.direction] : null;
  const comparacao: ParecerProduto['comparacao'] =
    comparavel && cmp && direcao && stores.medianCents != null
      ? {
          direcao,
          percentual: Math.abs(cmp.percent),
          valorDoMeioCents: stores.medianCents,
          frase: fraseComparacao(direcao, Math.abs(cmp.percent)),
          apoio: `Valor do meio: ${formatBRL(stores.medianCents)}, entre ${lojasTexto}.`,
        }
      : null;
  const percentualExtremo = comparacao != null && comparacao.direcao === 'abaixo' && comparacao.percentual > PARECER_PERCENTUAL_EXTREMO;

  const desde = fonte.firstDay ? diaMes(fonte.firstDay) : null;
  const dias = fonte.trackingDays;
  const acompanhamentoTexto = desde && dias > 0 ? `Acompanhando há ${dias} ${plural(dias, 'dia', 'dias')} (desde ${desde})` : 'Sem dias medidos ainda';

  const low = fonte.lows.all;
  const menorRegistrado: ParecerProduto['menorRegistrado'] =
    estado === 'formacao' && low && dias >= 2 && now != null && low.cents < now.cents
      ? { cents: low.cents, dia: diaMes(low.day), loja: low.store, texto: `Menor preço registrado em ${diaMes(low.day)}: ${formatBRL(low.cents)} · ${low.store}` }
      : null;

  const ev = fonte.lastEvent ?? null;
  const ultimaMudanca: ParecerProduto['ultimaMudanca'] = ev
    ? { cents: ev.cents, atIso: ev.at, loja: ev.store, antesCents: ev.prevCents, texto: textoUltimaMudanca({ cents: ev.cents, at: ev.at, store: ev.store, prevCents: ev.prevCents }, ev.matchesNow), eDoPrecoAtual: ev.matchesNow }
    : null;

  const empateTexto = now && now.store == null && now.tiedOffers > 1 ? `${now.tiedOffers} ofertas com este mesmo preço` : null;
  const baixaReputacao = now?.weakSeller === true;

  // --- camada (Fase 2) ---
  const sabemos: string[] = [];
  // Preço agora e última mudança do menor preço têm painel próprio na camada: cada informação aparece uma vez.
  sabemos.push(stores.count === 1 ? 'Só 1 loja monitorada com preço verificado hoje.' : stores.count <= 0 ? 'Nenhuma loja com preço verificado hoje.' : `Preço verificado hoje em ${lojasTexto}.`);
  sabemos.push(`${acompanhamentoTexto}.`);
  if (comparacao) sabemos.push(`${comparacao.frase}.`);
  if (menorRegistrado) sabemos.push(`${menorRegistrado.texto}.`);

  const falta: string[] = [];
  if (!now) falta.push('Sem preço verificado hoje, não há o que comparar.');
  else if (stores.count < MIN_STORES_FOR_MEDIAN) falta.push('Ainda não dá para dizer se este preço é bom: comparar com o valor do meio exige preço de 3 ou mais lojas hoje.');
  else if (!comparacao) falta.push('O menor preço é de vendedor de baixa reputação: não comparamos em percentual com o valor do meio entre as lojas.');
  if (dias < JUDGEMENT_MEASURED_WINDOW_DAYS) falta.push(`O histórico ainda é curto (${dias} ${plural(dias, 'dia acompanhado', 'dias acompanhados')}): não dá para dizer qual é o preço usual deste produto.`);
  falta.push('Não emitimos opinião sobre o preço (se é bom ou ruim): esse método ainda está em validação.');

  const lojasHoje: ParecerProduto['camada']['lojasHoje'] =
    stores.count >= 2 ? { quantidade: stores.count, texto: lojasTexto, valorDoMeioTexto: comparacao ? formatBRL(comparacao.valorDoMeioCents) : null, ofertas: now?.freshOffers ?? stores.count } : null;

  const nivel: DataBaseLevel = fonte.dataBase?.level ?? 'none';
  const diasBase = fonte.dataBase?.measuredDays30 ?? 0;
  const qualidade = {
    nivel,
    rotulo: `Base de dados ${DATA_BASE_LABEL[nivel].toLowerCase()}`,
    resumo:
      nivel === 'none'
        ? 'Ainda não há dado suficiente para avaliar a base.'
        : `${diasBase} ${plural(diasBase, 'dia', 'dias')} com 3 ou mais lojas, ${stores.count} ${plural(stores.count, 'loja distinta', 'lojas distintas')} hoje.`,
  };

  const comoCalculamos = [
    'O preço agora é o menor preço entre as ofertas ativas e verificadas nas últimas 48 horas.',
    'O valor do meio é a mediana dos menores preços de cada loja hoje. Só existe com 3 ou mais lojas e muda a cada coleta.',
    'Cada oferta vale 1 por dia nas medidas de histórico. Dados anteriores a 31/10/2026 ficam fora, porque foram coletados em outro regime.',
  ];

  return {
    estado,
    titulo: PARECER_TITULO,
    rotuloEstado: estado === 'fato' ? ROTULO_FATO : ROTULO_FORMACAO,
    preco: now ? { cents: now.cents, loja: now.store, empateTexto, verificadoEmIso: now.checkedAt } : null,
    comparacao,
    percentualExtremo,
    cobertura: { lojas: stores.count, lojasTexto, diasAcompanhados: dias, desde, acompanhamentoTexto, linha: estado === 'fato' ? acompanhamentoTexto : `${acompanhamentoTexto} · ${lojasTexto}` },
    menorRegistrado,
    ultimaMudanca,
    baixaReputacao,
    menorIgnoraBaixaReputacao: menorRegistrado != null && fonte.weakNotice != null && fonte.weakNotice !== 'none',
    camada: { sabemos, falta, lojasHoje, qualidade, comoCalculamos, graficoDisponivel: (fonte.measuredDaysTotal ?? 0) >= GRAFICO_MIN_DIAS },
    juizo: null,
  };
}
