// RÉGUA DE DESTAQUE POR TAMANHO DA QUEDA (dono, 2026-11-12). MÓDULO ÚNICO: Telegram, WhatsApp, cartão de imagem e front usam este arquivo.
// PURO: sem banco, sem relógio, sem server-only. A configuração de rollout lê process.env na hora da chamada (nunca no import).
// Ata: docs/conselho/atas/2026-11-12-regua-mensagens.md. Regras R-23/R-24 do FLUXO_MESTRE.
//
// Escala de CALOR (sem semáforo invertido): 1 azul, 2 verde, 3 amarelo, 4 laranja, 5 vermelho.
// A COR NUNCA FICA SOZINHA: todo degrau leva o percentual (quando a amostra permite), o veredito em TEXTO e as marcas ▼.
// O veredito sai SÓ de indicadores reais do banco: queda sobre a média única, distância da mínima registrada e número de ofertas.
// Sem previsão, sem urgência artificial, sem "de/por", sem "% OFF", sem "amostra pequena" ao cliente.
import { escapeTelegramHtml, escapeWhatsapp, fmtBRL } from '@/lib/messaging/group-messages';

// ---------------------------------------------------------------------------
// Configuração (rollout por chave; reverter = mudar a variável)
// ---------------------------------------------------------------------------
export const REGUA = {
  /** Limites de queda (% abaixo da média única) que separam os degraus. */
  LIMITES: [3, 6, 12, 20, 30] as const,
  /** Corte de envio quando a régua está ligada para a loja (era 10). */
  PCT_MIN_PADRAO: 3,
  /** Amostra mínima para AFIRMAR "X% abaixo da média" (R-19; MIN_AVG_OFFERS_CLAIM). Abaixo: veredito cauteloso, sem percentual e sem "Compre agora". */
  MIN_OFERTAS_PCT: 5,
  /** Histórico mínimo (dias medidos) para falar da mínima e para "Compre agora" (R-19: 14 dias para veredito). */
  MIN_DIAS_HISTORICO: 14,
  /** Janela da mínima (dias). O rótulo usa min(janela, dias medidos): nunca "90 dias" com menos de 90 dias de histórico. */
  JANELA_MINIMA_DIAS: 90,
  /** "Compre agora": preço na mínima ou até este % acima dela. */
  PERTO_DA_MINIMA_PCT: 3,
  /** Degrau 1 no máximo 1/3 das mensagens da hora em cada grupo (configurável por GROUP_REGUA_D1_SHARE_PCT). */
  D1_SHARE_PCT_PADRAO: 100 / 3,
  /** Degraus que vão também ao canal Destaques. */
  DESTAQUES_DEGRAU_MIN: 4,
  /** Dias medidos mínimos para mostrar mínimo e máximo registrados nas mensagens (R-44; abaixo disso a linha é omitida). */
  MINMAX_MIN_DIAS: 7,
} as const;

export interface ReguaConfig {
  /** Corte (% abaixo da média) das lojas liberadas. 0 = régua desligada. */
  pctMin: number;
  /** Departamentos (vertical) liberados. */
  lojas: ReadonlySet<string>;
  /** Teto do degrau 1 na hora, em % das mensagens do grupo. */
  d1SharePct: number;
  /** Dias mínimos de histórico para a mínima. */
  minDias: number;
  /** R-44 (dono, 2026-11-12): elegível para mensagem também o preço no menor já registrado (união com o corte de %). GROUP_REGUA_ELEGIVEL_MIN=on. */
  elegivelMin: boolean;
  /** Dias de série mínimos (sem hoje) para valer "no menor registrado" (GROUP_REGUA_ELEGIVEL_MIN_DIAS; padrão 6 = MOVE_MIN_DAYS - 1). */
  elegivelMinDias: number;
  /** Amplitude mínima da série (maior menor-do-dia sobre o menor, em %) para valer "no menor registrado": série plana não informa nada (parecer do estatístico). GROUP_REGUA_ELEGIVEL_MIN_AMPL_PCT. */
  elegivelMinAmplitudePct: number;
  /** Dias medidos mínimos para a linha "Mínimo/Máximo" (GROUP_REGUA_MINMAX_DIAS). */
  minMaxDias: number;
  /** Linha "Mínimo/Máximo" nas mensagens; GROUP_REGUA_MINMAX=off a remove (reversão sem deploy de código). */
  minMaxOn: boolean;
}

type Env = Record<string, string | undefined>;

/** Lê as chaves de rollout. GROUP_REGUA_PCT_MIN (ex.: 3) e GROUP_REGUA_LOJAS (ex.: eletrodomesticos,esporte). Qualquer valor inválido = desligado. */
export function reguaConfig(env: Env = process.env): ReguaConfig {
  const pct = Number(String(env.GROUP_REGUA_PCT_MIN ?? '').replace(',', '.'));
  const lojas = new Set(
    String(env.GROUP_REGUA_LOJAS ?? '')
      .split(/[,\s;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  const share = Number(String(env.GROUP_REGUA_D1_SHARE_PCT ?? '').replace(',', '.'));
  const dias = Number(String(env.GROUP_REGUA_MIN_DIAS ?? ''));
  const eDias = Number(String(env.GROUP_REGUA_ELEGIVEL_MIN_DIAS ?? ''));
  const mmDias = Number(String(env.GROUP_REGUA_MINMAX_DIAS ?? ''));
  const ampl = Number(String(env.GROUP_REGUA_ELEGIVEL_MIN_AMPL_PCT ?? '').replace(',', '.'));
  return {
    elegivelMin: /^(on|1|true|sim)$/i.test(String(env.GROUP_REGUA_ELEGIVEL_MIN ?? '').trim()),
    elegivelMinDias: Number.isInteger(eDias) && eDias >= 1 && eDias <= 90 ? eDias : 6,
    elegivelMinAmplitudePct: Number.isFinite(ampl) && ampl >= 0 && ampl <= 100 && String(env.GROUP_REGUA_ELEGIVEL_MIN_AMPL_PCT ?? '').trim() !== '' ? ampl : 5,
    minMaxOn: !/^(off|0|false|nao|não)$/i.test(String(env.GROUP_REGUA_MINMAX ?? '').trim()),
    minMaxDias: Number.isInteger(mmDias) && mmDias >= 1 && mmDias <= 90 ? mmDias : REGUA.MINMAX_MIN_DIAS,
    pctMin: Number.isFinite(pct) && pct > 0 && pct < 100 ? pct : 0,
    lojas,
    d1SharePct: Number.isFinite(share) && share > 0 && share <= 100 ? share : REGUA.D1_SHARE_PCT_PADRAO,
    minDias: Number.isInteger(dias) && dias >= 1 && dias <= 90 ? dias : REGUA.MIN_DIAS_HISTORICO,
  };
}

/** A régua está ligada para este departamento? */
export function reguaDaLoja(vertical: string, env: Env = process.env): boolean {
  const c = reguaConfig(env);
  return c.pctMin > 0 && c.lojas.has(vertical);
}

// ---------------------------------------------------------------------------
// Degraus
// ---------------------------------------------------------------------------
export type Degrau = 1 | 2 | 3 | 4 | 5;

export interface DegrauInfo {
  degrau: Degrau;
  /** Rótulo do veredito do degrau (texto, nunca só cor). */
  rotulo: string;
  /** Bloco de cor do Telegram/WhatsApp. */
  bloco: string;
  /** Nome da cor em português (alt text). */
  corNome: string;
  /** Cor da faixa (fundo) e do texto sobre ela. */
  cor: string;
  corTexto: string;
  /** Marcas ▼ (1 a 5). */
  marcas: string;
  /** Selo extra do degrau, quando houver. */
  selo: string | null;
  /** Título em negrito e MAIÚSCULAS (3, 4 e 5). */
  destaque: boolean;
}

export const DEGRAUS: Record<Degrau, DegrauInfo> = {
  1: { degrau: 1, rotulo: 'Bom preço', bloco: '🟦', corNome: 'azul', cor: '#3B82F6', corTexto: '#0B0908', marcas: '▼', selo: null, destaque: false },
  2: { degrau: 2, rotulo: 'Boa compra', bloco: '🟩', corNome: 'verde', cor: '#22C55E', corTexto: '#0B0908', marcas: '▼▼', selo: null, destaque: false },
  3: { degrau: 3, rotulo: 'Ótima compra', bloco: '🟨', corNome: 'amarela', cor: '#EAB308', corTexto: '#0B0908', marcas: '▼▼▼', selo: null, destaque: true },
  4: { degrau: 4, rotulo: 'Compre agora', bloco: '🟧', corNome: 'laranja', cor: '#F97316', corTexto: '#0B0908', marcas: '▼▼▼▼', selo: '🔥', destaque: true },
  5: { degrau: 5, rotulo: 'Confira antes de comprar', bloco: '🟥', corNome: 'vermelha', cor: '#EF4444', corTexto: '#0B0908', marcas: '▼▼▼▼▼', selo: '⚠️', destaque: true },
};

export const AVISO_DEGRAU_5 = 'Preço muito abaixo do normal: confirme o anúncio (modelo, vendedor e frete) antes de comprar.';
/** Sem histórico de preço (mínima nula): o veredito do dono é "Confira antes de comprar"; vai em texto, sem trocar a cor nem as marcas do degrau (cor e rótulo não se contradizem). */
export const AVISO_SEM_HISTORICO = 'Confira antes de comprar: ainda não há histórico de preço deste produto.';

/** Arredonda a queda a 1 casa: o degrau é decidido pelo MESMO número que o cliente lê (cor e percentual nunca se contradizem). */
export function arredondar1(pct: number): number {
  return Math.round(pct * 10) / 10;
}

/** Queda (% abaixo da média) -> degrau pelo percentual exibido. < 3 ou inválido = null. Bordas: 3, 6, 12 e 20 entram no degrau de cima; 30,0 ainda é degrau 4; acima de 30 é 5. */
export function degrauDaQueda(pct: number): Degrau | null {
  if (!Number.isFinite(pct)) return null;
  const p = arredondar1(pct);
  const [a, b, c, d, e] = REGUA.LIMITES;
  if (p < a) return null;
  if (p < b) return 1;
  if (p < c) return 2;
  if (p < d) return 3;
  if (p <= e) return 4;
  return 5;
}

// ---------------------------------------------------------------------------
// Veredito (só indicadores reais)
// ---------------------------------------------------------------------------
export interface VereditoInput {
  /** Queda sobre a média única, em % (bruta). */
  pct: number;
  /** Ofertas que formam a média (n_offers). */
  nOfertas: number;
  /** Preço da oferta, centavos. */
  precoCents: number;
  /** Menor preço da janela (centavos) e dias medidos nela; null = sem histórico. */
  minCents: number | null;
  diasHistorico: number;
  /** Mínimo de dias (reguaConfig.minDias). */
  minDias?: number;
  /** R-44: elegível só por estar no menor preço registrado (sem queda de 3% sobre a média). Vira degrau 1, texto neutro, sem percentual. */
  viaMinima?: boolean;
}

export interface Veredito {
  /** Degrau que VALE (colore, ordena a fila e define o canal). */
  degrau: Degrau;
  /** Degrau pelo tamanho da queda, antes das travas de cautela. */
  degrauBruto: Degrau;
  rotulo: string;
  /** Queda arredondada a 1 casa. */
  pct: number;
  /** O texto pode afirmar "X% abaixo da média" (>= 5 ofertas). */
  mostrarPct: boolean;
  /** Veredito cauteloso (poucas ofertas, histórico curto ou ausente). Nunca vira texto "amostra pequena". */
  cautela: boolean;
  /** Linha da mínima ("Menor preço dos últimos N dias" ou "X% acima da mínima de N dias"); null = não afirmar. */
  minLinha: string | null;
  /** O preço está na mínima da janela ou até 3% acima, com histórico suficiente. */
  naMinima: boolean;
  /** Aviso extra (degrau 5). */
  aviso: string | null;
  nOfertas: number;
  /** Janela efetiva da mínima, em dias (min(90, dias medidos)); 0 se sem histórico. */
  janelaDias: number;
}

const pct1 = (x: number) => x.toFixed(1).replace('.', ',');

/**
 * Veredito de uma oferta. null = abaixo do corte de 3% (não há degrau).
 *  - degrau 5 (> 30%): sempre "Confira antes de comprar" + aviso.
 *  - histórico ausente (min nulo): aviso "Confira antes de comprar" em texto (decisão do dono); a cor e o rótulo continuam os do degrau.
 *  - "Compre agora" (degrau 4): queda >= 12% (já vale), >= 5 ofertas, histórico >= 14 dias e preço na mínima ou até 3% acima. Faltando um, vira degrau 3.
 *  - < 5 ofertas: sem percentual, sem "Compre agora".
 * "Espere" só existe no site (preço acima da média); aqui nunca.
 */
export function calcularVeredito(i: VereditoInput): Veredito | null {
  const daQueda = degrauDaQueda(i.pct);
  // R-44: sem queda de 3% sobre a média mas no menor preço registrado = degrau 1 neutro (nunca promete desconto).
  const viaMinima = daQueda == null && i.viaMinima === true;
  const bruto: Degrau | null = daQueda ?? (viaMinima ? 1 : null);
  if (bruto == null) return null;
  const minDias = i.minDias ?? REGUA.MIN_DIAS_HISTORICO;
  const pct = arredondar1(i.pct);
  const poucas = !(i.nOfertas >= REGUA.MIN_OFERTAS_PCT);
  const temMin = i.minCents != null && i.minCents > 0;
  const histOk = temMin && i.diasHistorico >= minDias;
  const janelaDias = temMin ? Math.min(REGUA.JANELA_MINIMA_DIAS, Math.max(0, Math.floor(i.diasHistorico))) : 0;

  let minLinha: string | null = null;
  let naMinima = false;
  if (viaMinima && temMin && i.precoCents <= (i.minCents as number)) {
    // Elegível por ser o menor preço já registrado: a janela escrita é a medida (nunca mais do que os dias reais).
    minLinha = `Menor preço dos últimos ${janelaDias} dias`;
    naMinima = true;
  } else if (histOk && i.minCents != null) {
    const acima = ((i.precoCents - i.minCents) / i.minCents) * 100;
    if (i.precoCents <= i.minCents) {
      minLinha = `Menor preço dos últimos ${janelaDias} dias`;
      naMinima = true;
    } else {
      minLinha = `${pct1(arredondar1(acima))}% acima da mínima de ${janelaDias} dias`;
      naMinima = acima <= REGUA.PERTO_DA_MINIMA_PCT;
    }
  }

  let degrau: Degrau = bruto;
  if (degrau === 4 && !(naMinima && !poucas)) degrau = 3;
  if (poucas && degrau === 4) degrau = 3;
  const base = DEGRAUS[degrau];
  const rotulo = base.rotulo;
  const cautela = poucas || !histOk || degrau === 5;
  return {
    degrau,
    degrauBruto: bruto,
    rotulo,
    pct,
    mostrarPct: !poucas && !viaMinima,
    cautela,
    minLinha,
    naMinima,
    aviso: degrau === 5 ? AVISO_DEGRAU_5 : !temMin ? AVISO_SEM_HISTORICO : null,
    nOfertas: i.nOfertas,
    janelaDias,
  };
}

/** Resumo gravado no candidato (JSON em group_messages.candidate.regua): tudo o que a fila e o envio precisam, sem recalcular. */
export interface ReguaInfo {
  degrau: Degrau;
  degrauBruto: Degrau;
  rotulo: string;
  pct: number;
  mostrarPct: boolean;
  minLinha: string | null;
  nOfertas: number;
  /** Texto do botão do Telegram. */
  botao: string;
  /** Mínimo e máximo registrados (R-44); ausente = histórico insuficiente. */
  faixa?: FaixaPreco | null;
  /** Elegível só pelo menor preço registrado (sem queda de 3% sobre a média). */
  viaMinima?: boolean;
}
export const BOTAO_COMPRAR = 'Comprar agora';

export function reguaInfoDe(v: Veredito, faixa?: FaixaPreco | null, viaMinima?: boolean): ReguaInfo {
  return { degrau: v.degrau, degrauBruto: v.degrauBruto, rotulo: v.rotulo, pct: v.pct, mostrarPct: v.mostrarPct, minLinha: v.minLinha, nOfertas: v.nOfertas, botao: BOTAO_COMPRAR, ...(faixa ? { faixa } : {}), ...(viaMinima ? { viaMinima: true } : {}) };
}

/** O candidato também vai ao canal Destaques? (degraus 4 e 5.) */
export function vaiParaDestaques(degrau: number | null | undefined): boolean {
  return degrau != null && degrau >= REGUA.DESTAQUES_DEGRAU_MIN;
}

// ---------------------------------------------------------------------------
// R-44: menor preço registrado (elegibilidade) e faixa mínimo/máximo (texto)
// ---------------------------------------------------------------------------
export interface PontoDia {
  day: string;
  minCents: number;
  /** Maior cotação plausível do dia (price_daily_state.max_cents); ausente = só o menor do dia. */
  maxCents?: number;
}

export interface FaixaPreco {
  minCents: number;
  maxCents: number;
  /** Dias medidos na janela (nunca mais que 90). */
  dias: number;
}

/**
 * Mínimo e máximo REGISTRADOS do produto na janela (até 90 dias medidos), com o preço de agora incluído (é um preço real observado).
 * null = histórico insuficiente (< minDias dias medidos) ou sem amplitude (mínimo = máximo): a linha é omitida, nunca preenchida.
 */
export function faixaPreco(serie: readonly PontoDia[] | null | undefined, precoCents: number, minDias: number = REGUA.MINMAX_MIN_DIAS, hoje?: string): FaixaPreco | null {
  if (!serie || !(precoCents > 0)) return null;
  const pts = serie.filter((x) => x.minCents > 0 && (hoje == null || x.day < hoje)).slice(-REGUA.JANELA_MINIMA_DIAS);
  if (pts.length < Math.max(1, minDias)) return null;
  const minCents = Math.min(precoCents, ...pts.map((x) => x.minCents));
  const maxCents = Math.max(precoCents, ...pts.map((x) => Math.max(x.minCents, x.maxCents ?? 0)));
  if (!(maxCents > minCents)) return null;
  // Rótulo pelo intervalo de CALENDÁRIO (do primeiro dia medido até hoje, no máximo 90): com falhas de coleta, "N dias medidos" cobriria mais dias.
  const dias = hoje ? Math.min(REGUA.JANELA_MINIMA_DIAS, Math.max(pts.length, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${pts[0].day}T12:00:00Z`)) / 86_400_000))) : pts.length;
  return { minCents, maxCents, dias };
}

/** Texto único da faixa (Telegram, WhatsApp, cartão): rotulado com a janela real. */
export function faixaTexto(f: FaixaPreco): string {
  return `Mínimo ${fmtBRL(f.minCents)} · Máximo ${fmtBRL(f.maxCents)} (últimos ${f.dias} dias)`;
}

/**
 * O preço está no menor já registrado (preço <= menor preço diário dos dias anteriores) com série suficiente? Só dado real.
 * `serie` = dias anteriores a hoje; `hoje` ('YYYY-MM-DD') exclui o dia corrente. Pura: a chave (cfg.elegivelMin) é de quem chama.
 */
export function noMenorRegistrado(serie: readonly PontoDia[] | null | undefined, precoCents: number, minDiasSerie: number, hoje?: string, amplitudeMinPct = 0): { ok: boolean; minCents: number | null; dias: number } {
  if (!serie || !(precoCents > 0)) return { ok: false, minCents: null, dias: 0 };
  const pts = serie.filter((x) => x.minCents > 0 && (hoje == null || x.day < hoje)).slice(-REGUA.JANELA_MINIMA_DIAS);
  if (pts.length < Math.max(1, minDiasSerie)) return { ok: false, minCents: null, dias: pts.length };
  const minCents = Math.min(...pts.map((x) => x.minCents));
  // Série PLANA (preço constante) tem "preço <= mínimo" verdadeiro todo dia e não informa nada: exige variação real do menor preço diário.
  const topo = Math.max(...pts.map((x) => x.minCents));
  const variou = amplitudeMinPct <= 0 || (topo / minCents - 1) * 100 >= amplitudeMinPct;
  return { ok: variou && precoCents <= minCents, minCents, dias: pts.length };
}

// ---------------------------------------------------------------------------
// Texto das mensagens (Telegram HTML e WhatsApp)
// ---------------------------------------------------------------------------
export interface ReguaTextoInput {
  veredito: Veredito;
  /** Nome do produto e meta (já limpos). */
  titulo: string;
  meta?: string | null;
  precoCents: number;
  /** Média única (centavos) usada na queda. */
  mediaCents: number;
  /** Loja (rede) e, se houver, a plataforma/loja do vendedor. */
  loja: string;
  plataforma?: string | null;
  /** Carimbo "Conferido em dd/mm às hh:mm" já com a tag de publicidade. */
  carimbo: string;
  /** Linha de marca: "Espaço Geek 86 · slogan". */
  marca: string;
  /** Link do botão/WhatsApp (rastreado ou curto). Telegram não leva URL no texto. */
  link?: string | null;
  /** Mínimo e máximo registrados (R-44); null/ausente = linha omitida. */
  faixa?: FaixaPreco | null;
}

function cabecalho(v: Veredito, canal: 'tg' | 'wa'): string {
  const d = DEGRAUS[v.degrau];
  const nome = v.rotulo;
  const txt = d.destaque ? nome.toLocaleUpperCase('pt-BR') : nome;
  const selo = d.selo;
  const negrito = d.destaque || v.degrau >= 2;
  const rotulo = canal === 'tg' ? (negrito ? `<b>${escapeTelegramHtml(txt)}</b>` : escapeTelegramHtml(txt)) : negrito ? `*${txt}*` : txt;
  return [d.bloco, selo, d.marcas, rotulo].filter(Boolean).join(' ');
}

function linhaQueda(v: Veredito, mediaCents: number): string | null {
  if (!v.mostrarPct) return null;
  return `${pct1(v.pct)}% abaixo da média das lojas (${fmtBRL(mediaCents)})`;
}

function limpa(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Telegram (HTML). Cabe na legenda de 1024 caracteres do cartão e no texto de 4096. Sem URL (o link vai no botão). */
export function reguaTelegram(i: ReguaTextoInput): string {
  const v = i.veredito;
  const titulo = limpa(i.titulo, 110);
  const meta = i.meta ? limpa(i.meta, 60) : '';
  const loja = limpa(i.loja, 40);
  const plat = i.plataforma ? limpa(i.plataforma, 30) : '';
  const lojaLinha = plat ? `${loja} · ${plat}` : loja;
  const linhas: Array<string | null> = [
    cabecalho(v, 'tg'),
    `<b>${escapeTelegramHtml(titulo)}</b>${meta ? ` <i>${escapeTelegramHtml(meta)}</i>` : ''}`,
    `<b>${fmtBRL(i.precoCents)}</b>`,
    linhaQueda(v, i.mediaCents) ? escapeTelegramHtml(linhaQueda(v, i.mediaCents) as string) : null,
    v.minLinha ? escapeTelegramHtml(v.minLinha) : null,
    i.faixa ? escapeTelegramHtml(faixaTexto(i.faixa)) : null,
    v.aviso ? `<i>${escapeTelegramHtml(v.aviso)}</i>` : null,
    escapeTelegramHtml(lojaLinha),
    `<i>${escapeTelegramHtml(i.carimbo)}</i>\n<i>${escapeTelegramHtml(i.marca)}</i>`,
  ];
  return linhas.filter((l): l is string => !!l && l.trim() !== '').join('\n\n');
}

/** WhatsApp (*negrito*, texto puro). No máximo 6 linhas, com o link curto. */
export function reguaWhatsapp(i: ReguaTextoInput): string {
  const v = i.veredito;
  const titulo = escapeWhatsapp(limpa(i.titulo, 90));
  const loja = escapeWhatsapp(limpa(i.loja, 30));
  const queda = v.mostrarPct ? ` · ${pct1(v.pct)}% abaixo da média` : '';
  const l1 = `${cabecalho(v, 'wa')}${queda}`;
  const l2 = `*${titulo}*`;
  const l3 = `*${fmtBRL(i.precoCents)}* ${loja}${v.minLinha ? ` · ${escapeWhatsapp(v.minLinha)}` : ''}`;
  const l4 = [i.faixa ? escapeWhatsapp(faixaTexto(i.faixa)) : null, v.aviso ? escapeWhatsapp(v.aviso) : null].filter(Boolean).join('\n') || null;
  const l5 = i.link ? `Comprar agora: ${i.link}` : null;
  const l6 = `_${escapeWhatsapp(i.carimbo)} · ${escapeWhatsapp(i.marca)}_`;
  return [l1, l2, l3, l4, l5, l6].filter((l): l is string => !!l && l.trim() !== '').join('\n');
}

// ---------------------------------------------------------------------------
// Front (mesma régua, mesmos números): etiqueta e régua mínima / agora / média
// ---------------------------------------------------------------------------
export interface ReguaFrontInput {
  precoCents: number;
  mediaCents: number | null;
  minCents: number | null;
  /** Maior preço registrado (R-44); null = não mostrar. */
  maxCents?: number | null;
  diasHistorico: number;
  nOfertas: number;
}

export interface ReguaFront {
  veredito: Veredito | null;
  /** Marcadores da régua (valores reais): só os que existem. */
  mini: number | null;
  /** Maior já visto (R-44), só com amplitude real. */
  maxi: number | null;
  agora: number;
  media: number | null;
  /** "Espere": só no site; preço acima da média. */
  espere: boolean;
  /** Frase de veredito para o cliente (texto, nunca só cor). */
  frase: string;
}

/** Veredito do front: os mesmos degraus, com "Espere" quando o preço está acima da média. Sem média = sem veredito (nada inventado). */
export function reguaFront(i: ReguaFrontInput, minDias: number = REGUA.MIN_DIAS_HISTORICO): ReguaFront {
  const media = i.mediaCents != null && i.mediaCents > 0 ? i.mediaCents : null;
  const mini = i.minCents != null && i.minCents > 0 ? i.minCents : null;
  const maxi = i.maxCents != null && i.maxCents > 0 && mini != null && i.maxCents > mini ? i.maxCents : null;
  const base: ReguaFront = { veredito: null, mini, maxi, agora: i.precoCents, media, espere: false, frase: '' };
  if (media == null || !(i.precoCents > 0)) return base;
  const pct = ((media - i.precoCents) / media) * 100;
  if (pct < 0) return { ...base, espere: arredondar1(-pct) >= 3, frase: arredondar1(-pct) >= 3 ? 'Espere: preço acima da média' : '' };
  const v = calcularVeredito({ pct, nOfertas: i.nOfertas, precoCents: i.precoCents, minCents: i.minCents, diasHistorico: i.diasHistorico, minDias });
  if (!v) return base;
  return { ...base, veredito: v, frase: v.rotulo };
}

/** Contraste WCAG entre duas cores #RRGGBB (para teste de acessibilidade). */
export function contraste(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
