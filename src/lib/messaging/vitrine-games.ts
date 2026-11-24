// PURO (sem banco, sem rede, sem relógio). Vitrine de jogos até R$ 250 no canal de games, a cada 30 minutos (dono, 2026-11-17):
// UMA mensagem com capa premium dos 10 principais, nome e breve diagnóstico de cada um. Só dado real; diagnóstico só com histórico elegível (R-91).
import { classificar } from '@/lib/ranking-busca';
import type { VerdictKind } from '@/lib/affiliate/price-verdict';
import { condicaoNaoNova } from '@/lib/pricing/condicao-nao-nova';
import { sinaisTexto } from '@/lib/catalog/foto-nao-nova';
import { jogoSoMidia, naoEhJogoPorTexto } from '@/lib/catalog/jogo-novo-texto';

export const VITRINE_TETO_CENTAVOS = 25_000;
/** Texto do teto para legendas, capa e paginas (derivado da constante: trocar o teto muda tudo). */
export const VITRINE_TETO_TEXTO = `R$ ${VITRINE_TETO_CENTAVOS / 100}`;
export const VITRINE_TOP = 10;
export const VITRINE_INTERVALO_MIN = 30;
/** Limite de legenda do Telegram contado depois do HTML interpretado. */
export const VITRINE_CAPTION_MAX = 1024;

export interface JogoVitrine {
  masterId: string;
  /** Oferta que define preco, link e imagem do cartao (R-118: e ela que e verificada ao vivo). */
  ofertaId?: string;
  slug: string;
  titulo: string;
  plataforma: string;
  /** Geração da plataforma (ps4, ps5, xbox_one, xbox_series, xbox_360, switch_1, switch_2). */
  gen?: string | null;
  precoCentavos: number;
  ofertas: number;
  imagem: string | null;
  /** Veredito contra a média única; só vale com histórico elegível. */
  veredito?: VerdictKind | null;
  elegivel?: boolean;
  /** % abaixo (positivo) ou acima (negativo) da média única. */
  deltaPct?: number | null;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Título curto e limpo para a lista: tira plataforma e ruídos comuns, corta em `max` caracteres sem partir palavra. */
export function tituloCurto(t: string, max = 34): string {
  let s = t
    .replace(/\s*[-–|:]\s*(ps\s?[45]|playstation\s?[45]|xbox[\w\s]*|nintendo switch\s?2?|switch\s?2?|pc)\b.*$/i, '')
    .replace(/^\s*(jogo|game)\s+/i, '')
    .replace(/\b(ps\s?[45]|playstation\s?[45]|xbox\s?(one|series\s?[xs]?|360)?|nintendo switch\s?2?|switch\s?2?)\b/gi, ' ')
    .replace(/\b(m[ií]dia f[ií]sica|lacrado|novo|original|lan[cç]amento|standard( edition)?|sony|nintendo|cd projekt red|edi[cç][aã]o padr[aã]o|jogo em)\b/gi, ' ')
    .replace(/[()[\]]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–|:,\s]+|[-–|:,\s]+$/g, '')
    .trim();
  if (!s) s = t.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.55 ? cut.slice(0, sp) : cut).trim()}…`;
}

export function reais(c: number): string {
  return `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Diagnóstico curto. Sem histórico elegível NÃO há diagnóstico: "Novo em monitoramento" (1 oferta) ou "Em monitoramento" (mais de uma). */
export function diagnosticoCurto(j: Pick<JogoVitrine, 'ofertas' | 'elegivel' | 'veredito' | 'deltaPct'>): { texto: string; diagnostico: boolean } {
  const c = classificar({ nOfertas: j.ofertas, elegivel: !!j.elegivel, veredito: j.veredito ?? null });
  if (!c.diagnostico) return { texto: c.rotulo, diagnostico: false };
  const pct = j.deltaPct != null && Math.abs(j.deltaPct) >= 1 ? ` (${j.deltaPct > 0 ? '−' : '+'}${Math.abs(Math.round(j.deltaPct))}%)` : '';
  return { texto: `${c.rotulo}${pct}`, diagnostico: true };
}

/**
 * Os 10 principais: primeiro quem tem diagnóstico "abaixo do normal", dentro disso quem tem mais ofertas (mais lojas = mais procura; evita premiar só a maior queda, que pode ser anomalia), depois a maior queda,
 * depois o menor preço e o id (desempate estável). Só jogo até R$ 250 com preço > 0; um por produto.
 */
export function escolherTop(jogos: readonly JogoVitrine[], n = VITRINE_TOP): JogoVitrine[] {
  const vistos = new Set<string>();
  const ok = jogos.filter((j) => j.precoCentavos > 0 && j.precoCentavos <= VITRINE_TETO_CENTAVOS && !vistos.has(j.masterId) && !!vistos.add(j.masterId));
  const abaixo = (j: JogoVitrine) => (j.elegivel && j.veredito === 'below' ? 1 : 0);
  return ok
    .slice()
    .sort((a, b) => abaixo(b) - abaixo(a) || b.ofertas - a.ofertas || (b.deltaPct ?? 0) - (a.deltaPct ?? 0) || a.precoCentavos - b.precoCentavos || a.masterId.localeCompare(b.masterId))
    .slice(0, n);
}


/** Rodadas (vitrines de 30 min) em que um jogo descansa depois de aparecer: 3 = 1h30 fora da capa (dono, 2026-11-17: "rodizio entre os jogos menores de 200"). */
export const VITRINE_REPOUSO_RODADAS = 3;

/**
 * RODIZIO entre todos os jogos até R$ 250. `recentes` = masters de cada vitrine já enviada, da mais nova para a mais antiga.
 * Quem não saiu nas últimas VITRINE_REPOUSO_RODADAS vitrines (ou nunca saiu) concorre pela ordem de qualidade de `escolherTop`; faltando gente,
 * completa com quem saiu há mais tempo. Assim todos passam pela capa e os melhores voltam primeiro.
 */
function rodizioSimples(jogos: readonly JogoVitrine[], recentes: ReadonlyArray<readonly string[]>, n = VITRINE_TOP, repouso = VITRINE_REPOUSO_RODADAS): JogoVitrine[] {
  const ordenados = escolherTop(jogos, jogos.length);
  const ultima = new Map<string, number>();
  recentes.forEach((ids, i) => { for (const id of ids) if (!ultima.has(id)) ultima.set(id, i); });
  const descansados = ordenados.filter((j) => !ultima.has(j.masterId) || (ultima.get(j.masterId) as number) >= repouso);
  if (descansados.length >= n) return descansados.slice(0, n);
  const tomados = new Set(descansados.map((j) => j.masterId));
  const resto = ordenados.filter((j) => !tomados.has(j.masterId)).sort((a, b) => (ultima.get(b.masterId) ?? 99) - (ultima.get(a.masterId) ?? 99));
  return [...descansados, ...resto].slice(0, n);
}

/** Famílias que saem SEMPRE juntas na mesma vitrine (dono, 2026-11-17): PlayStation, Xbox, Nintendo Switch 1 e Nintendo Switch 2. */
export const VITRINE_FAMILIAS = ['playstation', 'xbox', 'switch_1', 'switch_2'] as const;
export type FamiliaVitrine = (typeof VITRINE_FAMILIAS)[number];
/** Vagas por família nos 10 da capa (soma 10). Família sem jogo cede as vagas às demais. */
export const VITRINE_COTAS: Record<FamiliaVitrine, number> = { playstation: 4, xbox: 2, switch_1: 2, switch_2: 2 };
export function familiaDe(gen: string | null | undefined): FamiliaVitrine | null {
  if (gen === 'ps4' || gen === 'ps5') return 'playstation';
  if (gen === 'xbox_one' || gen === 'xbox_series' || gen === 'xbox_360') return 'xbox';
  if (gen === 'switch_1') return 'switch_1';
  if (gen === 'switch_2') return 'switch_2';
  return null;
}

/**
 * Vitrine com as 4 famílias SEMPRE presentes: cada família escolhe os seus pelo rodízio (cota própria) e as vagas que sobrarem
 * (família sem jogo até R$ 250) vão para os melhores das outras. Na capa, os jogos ficam agrupados na ordem PlayStation, Xbox, Switch 1, Switch 2.
 * Sem nenhum jogo com geração conhecida, cai no rodízio simples.
 */
export function escolherTopRodizio(jogos: readonly JogoVitrine[], recentes: ReadonlyArray<readonly string[]>, n = VITRINE_TOP, repouso = VITRINE_REPOUSO_RODADAS): JogoVitrine[] {
  const porFamilia = new Map<FamiliaVitrine, JogoVitrine[]>();
  for (const j of jogos) {
    const f = familiaDe(j.gen);
    if (f) (porFamilia.get(f) ?? porFamilia.set(f, []).get(f)!).push(j);
  }
  if (!porFamilia.size) return rodizioSimples(jogos, recentes, n, repouso);
  const escolhidos: JogoVitrine[] = [];
  for (const f of VITRINE_FAMILIAS) {
    const lista = porFamilia.get(f);
    if (lista) escolhidos.push(...rodizioSimples(lista, recentes, VITRINE_COTAS[f], repouso));
  }
  const falta = n - escolhidos.length;
  if (falta > 0) {
    const ja = new Set(escolhidos.map((j) => j.masterId));
    escolhidos.push(...rodizioSimples(jogos.filter((j) => !ja.has(j.masterId) && familiaDe(j.gen)), recentes, falta, repouso));
  }
  const ordem = (j: JogoVitrine) => VITRINE_FAMILIAS.indexOf(familiaDe(j.gen) as FamiliaVitrine);
  return escolhidos.slice(0, n).sort((a, b) => ordem(a) - ordem(b));
}

/** Legenda HTML do Telegram (<= 1024 caracteres visíveis). `link(i)` devolve o link de saída (/go) do jogo i. */
export function montarLegenda(top: readonly JogoVitrine[], hora: string, link: (i: number) => string): string {
  const monta = (max: number) => {
    const linhas = top.map((j, i) => {
      const d = diagnosticoCurto(j);
      return `${i + 1}. <a href="${esc(link(i))}">${esc(tituloCurto(j.titulo, max))}</a> · ${esc(j.plataforma)} · <b>${reais(j.precoCentavos)}</b>\n    ${d.diagnostico ? '' : ''}${esc(d.texto)}`;
    });
    return [`<b>🎮 Jogos até ${VITRINE_TETO_TEXTO} · ${esc(hora)}</b>`, '', ...linhas, '', 'Atualizada a cada 30 min. O diagnóstico só aparece com histórico suficiente.'].join('\n');
  };
  let out = monta(34);
  for (const max of [30, 26, 22, 18]) {
    if (visivel(out) <= VITRINE_CAPTION_MAX) break;
    out = monta(max);
  }
  return out;
}

export function visivel(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').length;
}

/** Chave da janela de 30 minutos (America/Sao_Paulo é irrelevante: usa UTC, só precisa ser estável): uma vitrine por janela. */
export function janelaKey(now: Date, intervaloMin = VITRINE_INTERVALO_MIN): string {
  const slot = Math.floor(now.getTime() / (intervaloMin * 60_000));
  return `vg-${slot}`;
}

export function vitrineLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.VITRINE_GAMES ?? '').trim());
}

// ---------------------------------------------------------------------------------------------------------------------
// VITRINE POR PLATAFORMA (dono, 2026-11-20): uma mensagem e um cartão para CADA plataforma, sempre os 10 MENORES preços até R$ 250.
// Switch 1, Switch 2, Xbox (One e Series juntos), PlayStation 5 e PlayStation 4. `VITRINE_POR_PLATAFORMA=off` volta à vitrine única de 4 famílias.
// ---------------------------------------------------------------------------------------------------------------------
export interface PlataformaVitrine {
  key: 'switch_1' | 'switch_2' | 'xbox' | 'ps5' | 'ps4';
  rotulo: string;
  /** Gerações do catálogo que entram nesta plataforma. */
  gens: readonly string[];
}
export const VITRINE_PLATAFORMAS: readonly PlataformaVitrine[] = [
  { key: 'switch_1', rotulo: 'Nintendo Switch', gens: ['switch_1'] },
  { key: 'switch_2', rotulo: 'Nintendo Switch 2', gens: ['switch_2'] },
  { key: 'xbox', rotulo: 'Xbox One / Series', gens: ['xbox_one', 'xbox_series'] },
  { key: 'ps5', rotulo: 'PlayStation 5', gens: ['ps5'] },
  { key: 'ps4', rotulo: 'PlayStation 4', gens: ['ps4'] },
];

/**
 * MINIMO DE JOGOS POR CARTAO (dono, 2026-11-23): a vitrine de uma plataforma so sai com os 10 menores precos; "menos de dez nao e admitido".
 * Unica excecao: o Nintendo Switch 2, que tem poucos jogos novos ate o teto e sai com quantos houver (>= 1); o cartao dele se ajusta a quantidade.
 */
export const VITRINE_SEM_MINIMO: readonly PlataformaVitrine['key'][] = ['switch_2'];
export function minimoJogosPlataforma(key: PlataformaVitrine['key']): number {
  return VITRINE_SEM_MINIMO.includes(key) ? 1 : VITRINE_TOP;
}

export function vitrinePorPlataformaLigada(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|off|false|nao|não)$/i.test((env.VITRINE_POR_PLATAFORMA ?? '').trim());
}

/** Os `n` MENORES preços da plataforma (até R$ 250, preço > 0, um por produto). Desempate: mais ofertas, depois id (ordem estável). */
export function escolherMenores(jogos: readonly JogoVitrine[], gens: readonly string[], n = VITRINE_TOP): JogoVitrine[] {
  const vistos = new Set<string>();
  return jogos
    .filter((j) => !!j.gen && gens.includes(j.gen) && j.precoCentavos > 0 && j.precoCentavos <= VITRINE_TETO_CENTAVOS && !vistos.has(j.masterId) && !!vistos.add(j.masterId))
    .sort((a, b) => a.precoCentavos - b.precoCentavos || b.ofertas - a.ofertas || a.masterId.localeCompare(b.masterId))
    .slice(0, n);
}

/** "O menor preço" / "Os 4 menores preços": concordância correta quando o Switch 2 sai com poucos jogos. */
export function menoresTexto(n: number): string {
  return n === 1 ? 'O menor preço' : `Os ${n} menores preços`;
}

/** Legenda HTML da vitrine de UMA plataforma (<= 1024 caracteres visíveis). A plataforma só aparece em cada linha quando o grupo mistura gerações (Xbox One / Series). */
export function montarLegendaPlataforma(top: readonly JogoVitrine[], hora: string, rotulo: string, misto: boolean, link: (i: number) => string): string {
  const monta = (max: number) => {
    const linhas = top.map((j, i) => {
      const d = diagnosticoCurto(j);
      const plat = misto ? ` · ${esc(j.plataforma)}` : '';
      return `${i + 1}. <a href="${esc(link(i))}">${esc(tituloCurto(j.titulo, max))}</a>${plat} · <b>${reais(j.precoCentavos)}</b>
    ${esc(d.texto)}`;
    });
    return [`<b>🎮 Jogos até ${VITRINE_TETO_TEXTO} · ${esc(rotulo)} · ${esc(hora)}</b>`, menoresTexto(top.length), '', ...linhas, '', 'Atualizada a cada 30 min. O diagnóstico só aparece com histórico suficiente.'].join('\n');
  };
  let out = monta(34);
  for (const max of [30, 26, 22, 18]) {
    if (visivel(out) <= VITRINE_CAPTION_MAX) break;
    out = monta(max);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// R-116, SO JOGO NOVO NA VITRINE (dono, 2026-11-22). A vitrine e mais rigorosa que o envio normal: padrao negado em 3 camadas.
//   (a) condicao/titulo/vendedor da OFERTA (usado, seminovo, aberto, sem lacre, lote, midia solta, revendedor de midia sem lacre);
//   (b) oferta em quarentena (R-109: foto_nao_nova/foto_com_mao; ja fora de `aptaSql`) e foto 'alto' OU 'medio' (suspeita) na tabela de pontuacao;
//   (c) oferta sem pontuacao de foto (ou velha) tambem fica de fora: sem prova de foto, nao entra.
// A pontuacao (CLIP local) roda em script agendado fora do envio (scripts/foto-vitrine-pontuar.ts); a vitrine so le o resultado.
// ---------------------------------------------------------------------------------------------------------------------
export type FaixaFoto = 'alto' | 'medio' | 'baixo';
/** Validade de uma pontuacao de foto: a imagem de uma URL raramente muda; 14 dias. */
export const VITRINE_FOTO_VALIDADE_DIAS = 14;

export interface OfertaVitrine {
  ofertaId: string;
  masterId: string;
  slug: string;
  /** Titulo do ANUNCIO (nao o do master). */
  tituloOferta: string;
  vendedor?: string | null;
  masterNome: string;
  gen: string | null;
  plataforma: string;
  precoCentavos: number;
  imagem: string | null;
  /** Total de ofertas aptas do master (diagnostico), antes de qualquer filtro desta vitrine. */
  ofertasDoMaster: number;
  /** Pontuacao de foto gravada pelo script; null = sem pontuacao. */
  fotoFaixa?: FaixaFoto | null;
  /** Idade da pontuacao em dias; ausente = valida. */
  fotoIdadeDias?: number | null;
  /** Oferta em quarentena (defesa em profundidade: `aptaSql` ja a exclui). */
  quarentena?: boolean;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const RE_NAO_NOVO_VITRINE = new RegExp([
  '\\b(usad[oa]s?|seminov[oa]s?|semi[ -]nov[oa]s?|recondicionad[oa]s?|renovad[oa]s?|segunda mao|de segunda|pouco usad[oa]|como novo|quase novo|bem conservad[oa])\\b',
  '\\bsem\\s+(o\\s+|a\\s+)?(lacre|lacrad[oa]|caixa|estojo|capa|encarte|manual|embalagem)\\b',
  '\\b(lacre|caixa|embalagem|estojo|jogo|midia)\\s+(aberta|aberto|violad[oa]|rompid[oa]|rasgad[oa])\\b',
  '\\b(aberto|aberta)\\s+(sem uso|so para|apenas para|para teste)\\b',
  '\\b(so|somente|apenas)\\s+(o\\s+|a\\s+)?(disco|cartucho|midia)\\b',
  '\\b(disco|cartucho|midia|jogo)\\s+solt[oa]\\b',
  '\\b(lote|variedades?|colecao de jogos|kit (com )?\\d+ jogos|\\d+ jogos|combo de jogos|pacote de jogos)\\b',
  '\\b(retirad[oa] de|com marcas? de uso|com arranh|riscad[oa]|com defeito|testad[oa] e funcionando)\\b',
].join('|'));
const RE_REVENDEDOR = /\b(usados|games usados|seminovos|troca|sebo|retro)\b/;

/** Camada (a): o titulo do anuncio ou o vendedor declaram/sugerem que o jogo nao e novo e lacrado. Devolve o motivo ou null. */
export function condicaoSuspeita(tituloOferta: string, masterNome = '', vendedor: string | null = ''): string | null {
  const t = semAcento(`${tituloOferta} ${masterNome}`);
  const v = semAcento(vendedor ?? '');
  if (condicaoNaoNova(tituloOferta)) return 'open_box_vitrine';
  const soMidia = jogoSoMidia(tituloOferta); // R-119: apenas cartucho / sem caixa / midia solta = nao novo
  if (soMidia) return `so_midia:${soMidia}`;
  const naoJogo = naoEhJogoPorTexto(tituloOferta); // R-119: so JOGO entra (acessorio, pacote, cartao presente, assinatura, console, DLC, codigo)
  if (naoJogo) return `nao_jogo:${naoJogo}`;
  const sx = sinaisTexto(tituloOferta, vendedor ?? '');
  if (sx.usado) return 'usado';
  if (sx.lote) return 'lote';
  const m = RE_NAO_NOVO_VITRINE.exec(t);
  if (m) return `texto:${m[0].slice(0, 30)}`;
  // revendedor de usados anunciando "midia fisica" sem nenhuma palavra de produto novo/lacrado
  if ((RE_REVENDEDOR.test(v) || sx.revendedor) && /\bmidia fisica\b/.test(t) && !/\b(lacrad[oa]|lacre|novo|nova|sealed)\b/.test(t)) return 'revendedor_sem_lacre';
  return null;
}

export type CamadaBarra = 'condicao' | 'quarentena' | 'foto_suspeita' | 'foto_sem_pontuacao';

/** Camadas (a), (b) e (c) para UMA oferta. null = elegivel. Padrao negado: sem pontuacao de foto = barrada. */
export function barraOfertaVitrine(o: Pick<OfertaVitrine, 'tituloOferta' | 'masterNome' | 'vendedor' | 'quarentena' | 'fotoFaixa' | 'fotoIdadeDias' | 'imagem'>): CamadaBarra | null {
  if (condicaoSuspeita(o.tituloOferta, o.masterNome, o.vendedor ?? '')) return 'condicao';
  if (o.quarentena) return 'quarentena';
  if (!o.imagem || !o.fotoFaixa) return 'foto_sem_pontuacao';
  if (o.fotoIdadeDias != null && o.fotoIdadeDias > VITRINE_FOTO_VALIDADE_DIAS) return 'foto_sem_pontuacao';
  if (o.fotoFaixa !== 'baixo') return 'foto_suspeita'; // 'alto' e 'medio' (suspeita) ficam fora: a vitrine e mais rigorosa que o envio
  return null;
}

/**
 * Ofertas aptas -> jogos da vitrine. Cada master vale pelo MENOR preco entre as ofertas que passaram nas 3 camadas
 * (oferta barrada nunca define preco, slug nem imagem do cartao). Se a mais barata for barrada, entra a proxima elegivel.
 */
export function montarJogosVitrine(ofertas: readonly OfertaVitrine[]): { jogos: JogoVitrine[]; barradas: Record<CamadaBarra, number> } {
  const barradas: Record<CamadaBarra, number> = { condicao: 0, quarentena: 0, foto_suspeita: 0, foto_sem_pontuacao: 0 };
  const melhor = new Map<string, OfertaVitrine>();
  for (const o of ofertas) {
    if (!(o.precoCentavos > 0) || o.precoCentavos > VITRINE_TETO_CENTAVOS) continue;
    const b = barraOfertaVitrine(o);
    if (b) { barradas[b]++; continue; }
    const atual = melhor.get(o.masterId);
    if (!atual || o.precoCentavos < atual.precoCentavos || (o.precoCentavos === atual.precoCentavos && o.ofertaId < atual.ofertaId)) melhor.set(o.masterId, o);
  }
  const jogos: JogoVitrine[] = [...melhor.values()].map((o) => ({
    masterId: o.masterId, ofertaId: o.ofertaId, gen: o.gen, slug: o.slug, titulo: o.masterNome, plataforma: o.plataforma, precoCentavos: o.precoCentavos, ofertas: o.ofertasDoMaster, imagem: o.imagem,
  }));
  return { jogos, barradas };
}
