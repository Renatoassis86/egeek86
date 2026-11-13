// Sem 'server-only': regras PURAS das vitrines (checklist #7 e #8). Testadas por scripts/test-vitrine-regras.ts e test-vitrine-plataforma.ts.
import { INLINE_BAND_PERCENT, MIN_HISTORY_DAYS_FOR_VERDICT, MIN_QUOTES_FOR_VERDICT, computeVerdict, sellerTier, type SellerSignals } from '@/lib/affiliate/price-verdict';
import { offerTitleFlags } from '@/lib/affiliate/offer-identity';
import { avaliarConsoleVideoGame, ehConsoleDeVideoGame } from '@/lib/catalog/console-videogame';
import { legacyPlatformLabel, readPlatform, titleIsLegacyPlatformOnly } from '@/lib/catalog/platform';
import type { GamePlatformGen } from '@/db/schema';
import type { FaixaTipo, MenorRegistrado, PlataformaVitrine, PosicaoMedia, VitrineChave, VitrineItem } from './tipos';

/** Quantidades e pisos da nova landing (PROPOSTA_NOVA_VERSAO.md seção 3; D2 do dono). Um lugar só. */
export const VITRINE_REGRAS = {
  /** Vitrine com menos itens elegíveis some. Nunca se preenche com item fraco. */
  MIN_ITENS: 4,
  DESTAQUES: 12,
  MUDANCAS: 8,
  JOGOS_POR_FAIXA: 10,
  CONSOLES_POR_FAIXA: 6,
  MENOR_REGISTRADO: 8,
  ACESSORIOS: 8,
  COLECIONAVEIS: 6,
  PLUS_DEPARTAMENTOS: 6,
  /** Piso do indicador: 5 cotações e 14 dias (mesma definição de `checkEligibility`). */
  PISO_COTACOES: MIN_QUOTES_FOR_VERDICT,
  PISO_DIAS: MIN_HISTORY_DAYS_FOR_VERDICT,
  /** Queda mínima para valer como "abaixo da média" (fora da faixa "em linha") e máxima antes de virar suspeita. */
  QUEDA_MIN_PCT: INLINE_BAND_PERCENT,
  QUEDA_MAX_PCT: 50,
  /** Idade máxima da leitura do preço. Destaques: 6 h; demais vitrines: 24 h. */
  LEITURA_MAX_HORAS_DESTAQUE: 6,
  LEITURA_MAX_HORAS: 24,
  /** Menor registrado: régua de 3% sobre o menor registrado e corroboração por 2 vendedores em +-10%. */
  REGUA_REGISTRADO_PCT: 3,
  BANDA_CORROBORACAO_PCT: 10,
  /** Mudanças do menor preço: queda mínima sobre o evento anterior e janela. */
  MUDANCA_QUEDA_MIN_PCT: 5,
  MUDANCA_JANELA_HORAS: 24,
} as const;

export type MotivoExclusao =
  | 'porteiro_oculto'
  | 'tipo_fora_da_cartela'
  | 'console_nao_e_aparelho'
  | 'plataforma_unknown'
  | 'plataforma_fora_de_linha'
  | 'retro_ou_legado'
  | 'condicao_nao_nova'
  | 'edicao_nao_jogo'
  | 'formato_nao_fisico'
  | 'embalagem_com_nome_de_jogo'
  | 'sem_imagem'
  | 'sem_preco'
  | 'vendedor_fraco'
  | 'leitura_velha'
  | 'sem_base_de_preco'
  | 'acima_do_normal'
  | 'queda_acima_do_teto'
  | 'queda_abaixo_do_minimo'
  | 'fora_da_vitrine'
  | 'nao_esta_no_menor_registrado'
  | 'sem_corroboracao';

/** Linha do pool (uma por produto: a oferta pública mais barata + agregados). Origem: src/server/vitrines/pool.ts. */
export interface Candidato {
  masterProductId: string;
  offerId: string;
  slug: string;
  tituloOferta: string;
  nomeMaster: string;
  imagemUrl: string | null;
  tipoDb: 'game' | 'console' | 'accessory';
  plataformaDb: GamePlatformGen;
  formatoDb: string;
  edicaoDb: string;
  precoCentavos: number;
  loja: string;
  lojaSlug: string;
  /** ISO da última leitura de preço (last_price_confirmed_at, senão last_checked_at). */
  lidoEm: string | null;
  ofertasAtivas: number;
  lojasAtivas: number;
  /** Vendedores distintos com oferta pública dentro de +-10% do menor preço, contando o próprio. */
  vendedoresProximos: number;
  vendedor: SellerSignals | null;
  stats: StatsCandidato | null;
}

export interface StatsCandidato {
  avgCents: number | null;
  quoteCount: number;
  historyDays: number;
  lowConfidence: boolean;
  lowAllCents: number | null;
  lowAllAt: string | null;
  lowBadgeBlock: string | null;
}

export interface ContextoAvaliacao {
  agora: Date;
  /** Masters fora da cartela pública (porteiro/dimensão). */
  ocultos: ReadonlySet<string>;
  /** Tipo efetivo quando difere do gravado (src/server/queries/catalog-dimensions.ts). */
  tipoEfetivo: ReadonlyMap<string, 'game' | 'console' | 'accessory'>;
}

export interface Avaliado {
  candidato: Candidato;
  tipo: 'jogo' | 'console' | 'acessorio';
  plataforma: PlataformaVitrine;
  posicao: PosicaoMedia;
  /** Queda sobre a média, em pontos percentuais (positivo = abaixo da média; 0 sem base). */
  quedaPct: number;
  idadeHoras: number | null;
  item: VitrineItem;
}

export type ResultadoAvaliacao = { ok: true; avaliado: Avaliado } | { ok: false; motivo: MotivoExclusao };

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

function limpar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Console/portátil de PC: o enum game_platform_gen não tem PC, então o rótulo vem do título (só tipo console). */
const PC_PORTATIL_RE = /\b(steam deck|rog ally|rog xbox ally|legion go|msi claw|ayaneo|ayn odin|steam machine)\b/;

export function ehPortatilPc(titulo: string): boolean {
  return PC_PORTATIL_RE.test(limpar(titulo));
}

/** Xbox One, Xbox 360 e variações no título: fora de linha, nunca na vitrine (mesmo que o banco diga outra coisa). */
const XBOX_FORA_DE_LINHA_RE = /\bxbox ?(one|360)\b|\bx360\b|\bxone\b|\bxb1\b/;

export function mencionaXboxForaDeLinha(titulo: string): boolean {
  return XBOX_FORA_DE_LINHA_RE.test(limpar(titulo));
}

/** Embalagem avulsa com nome de jogo: encarte, capa, caixa, estojo, manual, pôster, lacre. */
const EMBALAGEM_RE = /\b(encarte|encartes|capa|capas|caixa|caixas|estojo|estojos|manual|poster|lacre)\b/;
/** Capa/caixa legítima de acessório de hardware (capa protetora de controle, case de console, caixa de som...). */
const HARDWARE_LEGITIMO_RE = /\b(protetora|protetor|silicone|bolsa|maleta|mochila|caixa de som|caixas de som|soundbar|suporte|carregador)\b/;
/** Em jogo e console, só a embalagem declarada como item avulso barra. */
const EMBALAGEM_AVULSA_RE = /\b(encarte|capa (de|do|da|para) (jogo|game|dvd|blu ?ray)|so a capa|apenas a capa|somente a capa|caixa vazia|caixa vazio|case vazio|case vazia|box vazio|box vazia|sem (o )?(jogo|disco|midia))\b/;

/**
 * Embalagem/encarte/capa/caixa vendida como produto (acessório "de jogo" sem ser hardware). Em acessório, qualquer uma das palavras
 * barra, exceto quando o título é claramente hardware (capa protetora de controle, caixa de som...).
 */
export function ehEmbalagemAvulsa(titulo: string, tipo: 'jogo' | 'console' | 'acessorio'): boolean {
  const t = limpar(titulo);
  if (tipo === 'acessorio') return EMBALAGEM_RE.test(t) && !HARDWARE_LEGITIMO_RE.test(t);
  return EMBALAGEM_AVULSA_RE.test(t);
}

// ---------------------------------------------------------------------------
// Plataforma
// ---------------------------------------------------------------------------

/**
 * Plataforma da vitrine. Regra de leitura (readPlatform: banco manda, título corrige quando prova) e depois:
 * 'unknown' nunca entra; Xbox One/360 e legado/retrô nunca entram. Devolve o motivo quando barra.
 */
export function plataformaDaVitrine(
  plataformaDb: GamePlatformGen,
  titulo: string,
  tipo: 'jogo' | 'console' | 'acessorio'
): { ok: true; plataforma: PlataformaVitrine } | { ok: false; motivo: MotivoExclusao } {
  if (titleIsLegacyPlatformOnly(titulo)) return { ok: false, motivo: 'retro_ou_legado' };
  if (mencionaXboxForaDeLinha(titulo)) return { ok: false, motivo: 'plataforma_fora_de_linha' };
  const lida = readPlatform(plataformaDb, titulo).platform;
  if (lida === 'xbox_one' || lida === 'xbox_360') return { ok: false, motivo: 'plataforma_fora_de_linha' };
  if (lida === 'unknown') {
    if (tipo === 'console' && ehPortatilPc(titulo) && !legacyPlatformLabel(titulo)) return { ok: true, plataforma: 'pc' };
    return { ok: false, motivo: 'plataforma_unknown' };
  }
  return { ok: true, plataforma: lida };
}

// ---------------------------------------------------------------------------
// Avaliação de um candidato
// ---------------------------------------------------------------------------

export function horasDesde(iso: string | null, agora: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (agora.getTime() - t) / 3_600_000 : null;
}

const TIPO_PUBLICO = { game: 'jogo', console: 'console', accessory: 'acessorio' } as const;

export interface OpcoesAvaliacao {
  /** Exige base de preço (5 cotações e 14 dias), veredito não "acima" e queda até 50%. Padrão true; as mudanças do menor preço dispensam. */
  exigirBase?: boolean;
}

/**
 * Elegibilidade de UM produto para qualquer vitrine de produto (checklist #8). Não decide quantidade nem ordem:
 * isso é de `selecionar`. Devolve o item pronto (ou o motivo da exclusão, para o funil de auditoria).
 */
export function avaliarCandidato(c: Candidato, ctx: ContextoAvaliacao, opts: OpcoesAvaliacao = {}): ResultadoAvaliacao {
  const exigirBase = opts.exigirBase !== false;
  if (ctx.ocultos.has(c.masterProductId)) return { ok: false, motivo: 'porteiro_oculto' };
  const tipoDb = ctx.tipoEfetivo.get(c.masterProductId) ?? c.tipoDb;
  const tipo = TIPO_PUBLICO[tipoDb];
  if (!tipo) return { ok: false, motivo: 'tipo_fora_da_cartela' };
  if (!(c.precoCentavos > 0)) return { ok: false, motivo: 'sem_preco' };
  // Console = SÓ video game (regra única, dono 2026-11-13): motor, base, frontal, adesivo, cartela, jogo e acessório nunca entram.
  if (tipo === 'console') {
    const doOferta = avaliarConsoleVideoGame(c.tituloOferta, c.precoCentavos);
    // O nome do master precisa ser o aparelho; o título da oferta, ruidoso, só barra quando prova peça/acessório.
    if (!ehConsoleDeVideoGame(c.nomeMaster || c.tituloOferta, c.precoCentavos) || (doOferta.veredito === 'nao' && doOferta.forte)) {
      return { ok: false, motivo: 'console_nao_e_aparelho' };
    }
  }

  const plat = plataformaDaVitrine(c.plataformaDb, `${c.tituloOferta} ${c.nomeMaster}`.trim(), tipo);
  if (!plat.ok) return { ok: false, motivo: plat.motivo };

  // Só produto novo: Open Box, usado, seminovo, recondicionado e loose ficam fora (defesa em profundidade; o SQL já filtra).
  if (offerTitleFlags(c.tituloOferta, tipoDb).condition !== 'new') return { ok: false, motivo: 'condicao_nao_nova' };
  if (tipo === 'jogo' && (c.edicaoDb === 'dlc' || c.edicaoDb === 'upgrade_pack')) return { ok: false, motivo: 'edicao_nao_jogo' };
  if (ehEmbalagemAvulsa(c.tituloOferta, tipo)) return { ok: false, motivo: 'embalagem_com_nome_de_jogo' };

  if (!c.imagemUrl || !/^https?:\/\//i.test(c.imagemUrl)) return { ok: false, motivo: 'sem_imagem' };
  if (sellerTier(c.vendedor) === 'low') return { ok: false, motivo: 'vendedor_fraco' };

  const verdict = c.stats
    ? computeVerdict({ currentCents: c.precoCentavos, avgCents: c.stats.avgCents, quoteCount: c.stats.quoteCount, historyDays: c.stats.historyDays, lowConfidence: c.stats.lowConfidence })
    : null;
  let posicao: PosicaoMedia = { tipo: 'sem_base' };
  let quedaPct = 0;
  if (verdict && verdict.kind !== 'insufficient' && verdict.deltaPercent != null) {
    const abaixo = -verdict.deltaPercent;
    posicao = verdict.kind === 'below' ? { tipo: 'abaixo', pct: abaixo } : verdict.kind === 'above' ? { tipo: 'acima', pct: -abaixo } : { tipo: 'em_linha', pct: Math.abs(abaixo) };
    quedaPct = abaixo;
  }
  if (exigirBase) {
    if (posicao.tipo === 'sem_base') return { ok: false, motivo: 'sem_base_de_preco' };
    if (posicao.tipo === 'acima') return { ok: false, motivo: 'acima_do_normal' };
    if (quedaPct > VITRINE_REGRAS.QUEDA_MAX_PCT) return { ok: false, motivo: 'queda_acima_do_teto' };
  }

  const st = c.stats;
  const media = st && st.avgCents != null && st.avgCents > 0 && posicao.tipo !== 'sem_base' ? { centavos: Math.round(st.avgCents), cotacoes: st.quoteCount, dias: st.historyDays } : null;
  const menorRegistrado: MenorRegistrado | null =
    st && st.lowAllCents != null && st.lowAllAt != null
      ? {
          centavos: st.lowAllCents,
          em: st.lowAllAt,
          noMenor: posicao.tipo !== 'sem_base' && st.lowBadgeBlock == null && c.precoCentavos <= st.lowAllCents * (1 + VITRINE_REGRAS.REGUA_REGISTRADO_PCT / 100),
          corroborado: c.vendedoresProximos >= 2,
        }
      : null;

  const item: VitrineItem = {
    masterProductId: c.masterProductId,
    offerId: c.offerId,
    slug: c.slug,
    href: `/ofertas/${c.slug}`,
    titulo: c.nomeMaster || c.tituloOferta,
    imagemUrl: c.imagemUrl,
    tipo,
    plataforma: plat.plataforma,
    precoCentavos: c.precoCentavos,
    loja: c.loja,
    lojaSlug: c.lojaSlug,
    lidoEm: c.lidoEm ?? '',
    ofertasAtivas: c.ofertasAtivas,
    lojasAtivas: c.lojasAtivas,
    media,
    posicao,
    menorRegistrado,
    evento: null,
    departamento: null,
  };
  return { ok: true, avaliado: { candidato: c, tipo, plataforma: plat.plataforma, posicao, quedaPct, idadeHoras: horasDesde(c.lidoEm, ctx.agora), item } };
}

// ---------------------------------------------------------------------------
// Seleção por vitrine
// ---------------------------------------------------------------------------

export interface Selecao {
  itens: VitrineItem[];
  /** Quantos passaram no filtro da vitrine antes do corte de quantidade. */
  elegiveis: number;
  motivos: Partial<Record<MotivoExclusao, number>>;
}

function contar(m: Partial<Record<MotivoExclusao, number>>, k: MotivoExclusao) {
  m[k] = (m[k] ?? 0) + 1;
}

/** Maior queda real primeiro; empate pelo menor preço; depois id (ordem estável). */
export function ordenarPorQueda(a: Avaliado, b: Avaliado): number {
  return b.quedaPct - a.quedaPct || a.candidato.precoCentavos - b.candidato.precoCentavos || (a.candidato.masterProductId < b.candidato.masterProductId ? -1 : 1);
}

/** Um item por master (o pool já traz 1 por master; a trava garante mesmo se vier repetido). */
export function umPorMaster<T extends { candidato: Candidato }>(xs: T[]): T[] {
  const vistos = new Set<string>();
  return xs.filter((x) => {
    if (vistos.has(x.candidato.masterProductId)) return false;
    vistos.add(x.candidato.masterProductId);
    return true;
  });
}

/** Quantidade de itens por chave. */
export function limiteDaChave(chave: VitrineChave): number {
  if (chave === 'destaques') return VITRINE_REGRAS.DESTAQUES;
  if (chave === 'mudancas') return VITRINE_REGRAS.MUDANCAS;
  if (chave === 'menor-registrado') return VITRINE_REGRAS.MENOR_REGISTRADO;
  if (chave === 'acessorios') return VITRINE_REGRAS.ACESSORIOS;
  if (chave === 'colecionaveis') return VITRINE_REGRAS.COLECIONAVEIS;
  if (chave === 'plus') return VITRINE_REGRAS.PLUS_DEPARTAMENTOS;
  return chave.endsWith(':consoles') ? VITRINE_REGRAS.CONSOLES_POR_FAIXA : VITRINE_REGRAS.JOGOS_POR_FAIXA;
}

export function parseFaixa(chave: VitrineChave): { plataforma: PlataformaVitrine; tipo: FaixaTipo } | null {
  const m = /^plataforma:([a-z0-9_]+):(jogos|consoles)$/.exec(chave);
  return m ? { plataforma: m[1] as PlataformaVitrine, tipo: m[2] as FaixaTipo } : null;
}

/**
 * Filtro e ordenação de cada vitrine de PRODUTO (destaques, faixas de plataforma, menor registrado, acessórios).
 * Vitrine com menos de MIN_ITENS elegíveis volta com `itens` vazio (o bloco some).
 */
export function selecionar(chave: VitrineChave, candidatos: readonly Candidato[], ctx: ContextoAvaliacao): Selecao {
  const motivos: Partial<Record<MotivoExclusao, number>> = {};
  const faixa = parseFaixa(chave);
  const bons: Avaliado[] = [];
  const maxH = chave === 'destaques' ? VITRINE_REGRAS.LEITURA_MAX_HORAS_DESTAQUE : VITRINE_REGRAS.LEITURA_MAX_HORAS;
  for (const c of candidatos) {
    const r = avaliarCandidato(c, ctx, { exigirBase: true });
    if (!r.ok) {
      contar(motivos, r.motivo);
      continue;
    }
    const a = r.avaliado;
    if (a.idadeHoras == null || a.idadeHoras > maxH || a.idadeHoras < -0.1) {
      contar(motivos, 'leitura_velha');
      continue;
    }
    if (chave === 'destaques') {
      if (a.posicao.tipo !== 'abaixo' || a.quedaPct < VITRINE_REGRAS.QUEDA_MIN_PCT) {
        contar(motivos, 'queda_abaixo_do_minimo');
        continue;
      }
    } else if (faixa) {
      if (faixa.tipo === 'jogos' && !(a.tipo === 'jogo' && a.candidato.formatoDb === 'physical')) {
        contar(motivos, a.tipo === 'jogo' ? 'formato_nao_fisico' : 'fora_da_vitrine');
        continue;
      }
      if (faixa.tipo === 'consoles' && a.tipo !== 'console') {
        contar(motivos, 'fora_da_vitrine');
        continue;
      }
      if (a.plataforma !== faixa.plataforma) {
        contar(motivos, 'fora_da_vitrine');
        continue;
      }
    } else if (chave === 'acessorios') {
      if (a.tipo !== 'acessorio') {
        contar(motivos, 'fora_da_vitrine');
        continue;
      }
    } else if (chave === 'menor-registrado') {
      const mr = a.item.menorRegistrado;
      if (!mr || !mr.noMenor) {
        contar(motivos, 'nao_esta_no_menor_registrado');
        continue;
      }
      if (!mr.corroborado) {
        contar(motivos, 'sem_corroboracao');
        continue;
      }
    } else {
      contar(motivos, 'fora_da_vitrine');
      continue;
    }
    bons.push(a);
  }
  const ordenados = umPorMaster(bons.sort(ordenarPorQueda));
  const elegiveis = ordenados.length;
  if (elegiveis < VITRINE_REGRAS.MIN_ITENS) return { itens: [], elegiveis, motivos };
  return { itens: ordenados.slice(0, limiteDaChave(chave)).map((a) => a.item), elegiveis, motivos };
}
