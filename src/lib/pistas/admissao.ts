// Sem 'server-only': modulo PURO (sem banco, sem rede), importavel por rota, script tsx e teste.
/**
 * R-112 (ata 2026-11-20 "pistas autonomas", Fase 1, SOMBRA): FUNCAO DE ADMISSAO por canal. Dado um candidato ja detectado, diz se a pista
 * ENVIARIA ou DESCARTARIA e por que. Nao envia nada e nao altera o envio atual: na sombra so grava a decisao (pista_decisao).
 *
 * Ordem (a primeira que barra vence): 1) gates inegociaveis (reaproveitados de group-rules / link-afiliado / confirmacao-preco / nao-ofertavel,
 * IMPORTADOS, nunca copiados): produto unico, produto novo e em linha, item barrado, preco-isca, revisao humana, preco fresco (R-81/R-101),
 * link de afiliado do dono (R-70); 2) repeticao do master (masterSemNovidadeBlock, janela de pelo menos 24 h); 3) vagas: tipo/hora (TIPO_MAX_PER_HOUR
 * ou teto especial R-106), marca/hora, canal/hora com PISO (vaga garantida) e TETO (a sobra so passa com oferta fresca).
 */
import {
  iscaSuspeita, isOutOfLine, masterRepeatHoursFor, masterSemNovidadeBlock, tipoPorHora, tipoTetoHoraEspecial,
  type Candidate, type SentRecord,
} from '@/lib/messaging/group-rules';
import { orcamentoFrescor } from '@/lib/frescor/orcamento';
import { linkAfiliadoDe } from '@/lib/affiliate/link-afiliado';
import { naoOfertavel } from '@/lib/catalog/nao-ofertavel';

export const PISTA_PISO_PADRAO = 12;
export const PISTA_TETO_PADRAO = 30;
export const PISTA_MARCA_PADRAO = 3;
export const PISTA_FRESCA_MIN_PADRAO = 20;
export const PISTA_REPETICAO_MIN_H = 24;

export interface PistaConfig {
  /** Vagas por hora garantidas ao canal (entra qualquer oferta que passe nos gates). */
  pisoHora: number;
  /** Maximo por hora do canal. Entre piso e teto so entra oferta fresca. */
  tetoHora: number;
  /** Maximo por hora de uma mesma marca no canal. */
  marcaHora: number;
  /** "Oferta fresca" da sobra: preco confirmado ha no maximo isto (min). */
  frescaMin: number;
  env: Record<string, string | undefined>;
}

function inteiro(raw: string | undefined, min: number, max: number, padrao: number): number {
  const n = Number((raw ?? '').trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
}

/** PISTA_PISO_HORA (1..60, padrao 12), PISTA_TETO_HORA (>= piso, ate 120, padrao 30), PISTA_MARCA_HORA (1..30, padrao 3), PISTA_FRESCA_MIN (5..60, padrao 20). */
export function pistaConfig(env: Record<string, string | undefined> = process.env): PistaConfig {
  const pisoHora = inteiro(env.PISTA_PISO_HORA, 1, 60, PISTA_PISO_PADRAO);
  const teto = inteiro(env.PISTA_TETO_HORA, 1, 120, PISTA_TETO_PADRAO);
  return {
    pisoHora,
    tetoHora: Math.max(teto, pisoHora),
    marcaHora: inteiro(env.PISTA_MARCA_HORA, 1, 30, PISTA_MARCA_PADRAO),
    frescaMin: inteiro(env.PISTA_FRESCA_MIN, 5, 60, PISTA_FRESCA_MIN_PADRAO),
    env,
  };
}

/** Canais do piloto em sombra: PISTA_SOMBRA='livros,impressao3d'. 'off'/vazio/ausente = nenhum. */
export function canaisSombra(env: Record<string, string | undefined> = process.env): string[] {
  const raw = (env.PISTA_SOMBRA ?? '').trim().toLowerCase();
  if (!raw || /^(off|0|false|nao|não)$/.test(raw)) return [];
  return raw.split(/[\s,;]+/).filter((c) => /^[a-z0-9-]{3,40}$/.test(c));
}

/** Inicio da hora (UTC) da decisao: a "janela" dos contadores. */
export function horaBucket(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
}

/** Contadores da hora corrente ANTES desta decisao. */
export interface EstadoContadores {
  /** Envios (simulados ou reais) do canal na hora. */
  canalHora: number;
  /** Envios do mesmo tipo na hora. */
  tipoHora: number;
  /** Envios da mesma marca na hora (0 se sem marca). */
  marcaHora: number;
}

/** O que a admissao precisa do candidato (subconjunto de Candidate + fatos da oferta). */
export type MasterPista = Pick<Candidate, 'masterProductId' | 'vertical' | 'name' | 'priceCents' | 'trigger' | 'offerIds' | 'networkSlug' | 'held' | 'dropPct' | 'belowAvgPct' | 'sendable' | 'notSendableReason' | 'status' | 'confirmedAt'>
  & Partial<Pick<Candidate, 'cls' | 'couponRef' | 'regua' | 'platformLabel'>> & {
    /** false = a oferta/produto NAO e novo (usado, open box, recondicionado, foto de mao). true/undefined = sem prova contraria. */
    condicaoNova?: boolean | null;
    /** false = oferta inativa (pausada, sem estoque) ou em quarentena (preco, foto nao nova). */
    ofertaViva?: boolean | null;
    /** product_type do master (games: console fora de linha etc.). */
    productType?: string | null;
    /** Link de afiliado da oferta principal (affiliate_url) e se esta pendente. null/ausente = sem link. */
    affiliateUrl?: string | null;
    affiliateLinkPending?: boolean | null;
  };

export interface EntradaAdmissao {
  canal: string;
  tipo: string | null;
  marca: string | null;
  master: MasterPista;
  agora: Date;
  estado: EstadoContadores;
  /** Historico de envios (reais + simulados) das ultimas 24 h ou mais, para a repeticao do master. */
  historico: SentRecord[];
  config: PistaConfig;
}

export type Decisao = 'enviaria' | 'descartaria';
export interface ResultadoAdmissao {
  decisao: Decisao;
  motivo: string;
  /** Envios do canal na hora antes desta decisao (a cota usada). */
  cotaUsada: number;
  /** Para 'enviaria': vaga do piso ou sobra fresca. */
  faixa?: 'piso' | 'sobra';
}

const SEM_PRODUTO_UNICO = new Set(['G4', 'RADAR']);

/** Idade (min) da confirmacao de preco; null = sem prova. */
export function idadeConfirmacaoMin(confirmedAt: string | null | undefined, agora: Date): number | null {
  if (!confirmedAt) return null;
  const t = Date.parse(confirmedAt);
  return Number.isFinite(t) ? Math.max(0, (agora.getTime() - t) / 60_000) : null;
}

/** Idade maxima do preco dito (R-81 / R-101 / orcamento de frescor): Amazon = AMAZON_FRESCOR_MIN; cupom de item = cupomItemMin; demais = quedaMin. */
export function limiteFrescorMin(m: Pick<MasterPista, 'networkSlug' | 'trigger'>, env: Record<string, string | undefined>): number {
  const o = orcamentoFrescor(env);
  if (m.networkSlug === 'amazon') return o.amazonDizerMin;
  if (m.trigger === 'CUPOM') return o.cupomItemMin;
  return o.quedaMin;
}

function descarta(motivo: string, cotaUsada: number): ResultadoAdmissao {
  return { decisao: 'descartaria', motivo, cotaUsada };
}

/** Gates inegociaveis. Devolve o motivo do bloqueio ou null. Ordem fixa e testada. */
export function gatesInegociaveis(i: Pick<EntradaAdmissao, 'master' | 'agora' | 'config'>): string | null {
  const m = i.master;
  if (SEM_PRODUTO_UNICO.has(m.trigger) || m.cls === 'plataforma' || !m.masterProductId) return 'sem_produto_unico';
  if (m.condicaoNova === false) return 'condicao_nao_nova';
  if (m.ofertaViva === false) return 'oferta_inativa_ou_em_quarentena';
  if (isOutOfLine({ vertical: m.vertical, platformLabel: m.platformLabel ?? null, productType: m.productType ?? null })) return 'fora_de_linha_ou_retro';
  const barrado = naoOfertavel(m.vertical, m.name);
  if (barrado) return `item_barrado_${barrado.replace(/\s+/g, '_').slice(0, 30)}`;
  if (iscaSuspeita(m)) return 'preco_isca_suspeito';
  if (!m.sendable) return `nao_enviavel_${(m.notSendableReason ?? 'sem_motivo').replace(/[^a-z0-9_]+/gi, '_').slice(0, 40)}`;
  if (m.status === 'review') return 'exige_revisao_humana';
  const idade = idadeConfirmacaoMin(m.confirmedAt, i.agora);
  if (idade == null) return 'sem_prova_de_preco_fresco';
  const lim = limiteFrescorMin(m, i.config.env);
  if (idade > lim) return `preco_velho_${Math.floor(idade)}min_acima_de_${lim}`;
  const link = linkAfiliadoDe({ redeSlug: m.networkSlug, affiliateUrl: m.affiliateUrl, affiliateLinkPending: m.affiliateLinkPending });
  if (!link) return 'sem_link_de_afiliado_valido';
  return null;
}

export function admitir(i: EntradaAdmissao): ResultadoAdmissao {
  const { master: m, estado: e, config: c } = i;
  const cota = e.canalHora;
  const gate = gatesInegociaveis(i);
  if (gate) return descarta(gate, cota);

  // Repeticao do master: janela do projeto (R-77), nunca abaixo de 24 h na pista.
  const h = masterRepeatHoursFor(m.vertical, c.env);
  const horas = Math.max(h > 0 ? h : PISTA_REPETICAO_MIN_H, PISTA_REPETICAO_MIN_H);
  const rep = masterSemNovidadeBlock(m, i.historico, i.agora, horas);
  if (rep) return descarta(rep, cota);

  // Vaga por tipo (so onde ha taxonomia): teto especial (R-106) ou TIPO_MAX_PER_HOUR.
  if (i.tipo) {
    const esp = tipoTetoHoraEspecial(m.vertical, i.tipo, c.env);
    const limTipo = esp ? esp.porHora : tipoPorHora(c.env);
    if (e.tipoHora >= limTipo) return descarta(`teto_tipo_${i.tipo}_${limTipo}_por_hora`, cota);
  }
  if (i.marca && e.marcaHora >= c.marcaHora) return descarta(`teto_marca_${i.marca.replace(/\s+/g, '_')}_${c.marcaHora}_por_hora`, cota);

  // Cota do canal: piso = vaga garantida; sobra = so oferta fresca; teto = fim.
  if (e.canalHora >= c.tetoHora) return descarta(`teto_canal_${c.tetoHora}_por_hora`, cota);
  if (e.canalHora < c.pisoHora) return { decisao: 'enviaria', motivo: 'ok_piso_do_canal', cotaUsada: cota, faixa: 'piso' };
  const idade = idadeConfirmacaoMin(m.confirmedAt, i.agora) as number;
  if (idade <= c.frescaMin) return { decisao: 'enviaria', motivo: 'ok_sobra_oferta_fresca', cotaUsada: cota, faixa: 'sobra' };
  return descarta(`acima_do_piso_sem_oferta_fresca_${Math.floor(idade)}min`, cota);
}
