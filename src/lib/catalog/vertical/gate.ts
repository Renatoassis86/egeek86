// Sem 'server-only': função pura, importável por coletor, scripts tsx e testes.
// NÃO importa nem altera src/lib/catalog/gate.ts (porteiro gamer, ADR 0005 intacto).
import { domainMatches, segmentByKey, type NonGamesVertical, type SegmentConfig } from './config';
import { foldText, type IdentityResult } from './identity';
import { scopeIssue } from './scope';

/**
 * PORTEIRO POR DEPARTAMENTO (ADR 0008 item 4): `gateFor(vertical)`.
 *
 * Regras:
 *  - EVIDÊNCIA POSITIVA: só `approved` quando (a) o domain_id do catálogo pertence ao segmento, (b) a identidade é
 *    forte e (c) nenhum léxico de fora-do-escopo dispara. Faltou qualquer uma => `review` (invisível até um humano).
 *  - `rejected` só para o que é definitivamente não-original/não-novo (usado, recondicionado, Open Box, importado,
 *    réplica), vindo da identidade. NUNCA rejeita por "ser de outra vertical": isso é `review` (fora de escopo), e o
 *    porteiro gamer, por sua vez, nunca vê esses masters como `rejected` (ele nem é chamado para eles).
 *  - Mesmo `approved` aqui é só SUGESTÃO: a semeadura grava `catalogGate.verdict = 'review'` (rede de segurança do
 *    ADR 0008) e `catalogGate.suggested` com o parecer deste porteiro.
 */

export const VERTICAL_GATE_VERSION = 1;

export type VerticalGateVerdict = 'approved' | 'review' | 'rejected';
export type VerticalGateCategory = 'ok' | 'not_original' | 'used' | 'out_of_scope' | 'unverified';

export interface VerticalGateInput {
  /** Segmento avaliado (chave de config.ts). */
  segment: string;
  name: string;
  domainId: string | null;
  identity: IdentityResult;
  /** Títulos de ofertas, quando houver (o anúncio pode dizer mais que o catálogo). */
  offerTitles?: string[];
  /** Veredito humano gravado (vence o automático, exceto não-original determinístico). */
  manual?: VerticalGateVerdict | null;
}

export interface VerticalGateResult {
  verdict: VerticalGateVerdict;
  category: VerticalGateCategory;
  reason: string;
  matched: string | null;
  version: number;
  vertical: NonGamesVertical;
}

export interface VerticalGate {
  vertical: NonGamesVertical;
  evaluate(input: VerticalGateInput): VerticalGateResult;
}

/** Léxico de FORA-DO-ESCOPO por departamento (acessório/consumível/brinde que o domínio às vezes deixa passar). */
const OUT_OF_SCOPE: Record<NonGamesVertical, RegExp> = {
  tecnologia: /\b(capa|bolsa|mochila|pelicula|kit de limpeza|garantia estendida)\b/,
  eletroeletronicos: /\b(controle remoto|suporte|rack|painel|capa|cabo|adaptador|pelicula|antena)\b/,
  livros: /\b(caderno|agenda|planner|fichario|marca pagina|poster|camiseta|caneca|luminaria|papelaria)\b/,
  eletrodomesticos: /\b(peca|pecas|reposicao|mangueira|capa|acessorio|acessorios)\b/,
  esporte: /\b(balao|bexiga|chaveiro|mochila|bomba|miniatura|pelucia|brinquedo|inflavel|calcador|meiao)\b/,
  // Impressão 3D (inerte: sem segmento no cardápio ainda). Peças/bicos entram só numa onda posterior, com compatibilidade escrita.
  impressao3d: /\b(capa|bolsa|mochila|garantia estendida|miniatura pronta|action figure|estatueta)\b/,
};

function evaluateFor(vertical: NonGamesVertical, input: VerticalGateInput): VerticalGateResult {
  const mk = (verdict: VerticalGateVerdict, category: VerticalGateCategory, reason: string, matched: string | null = null): VerticalGateResult => ({
    verdict,
    category,
    reason,
    matched,
    version: VERTICAL_GATE_VERSION,
    vertical,
  });
  const seg: SegmentConfig | undefined = segmentByKey(input.segment);
  if (!seg || seg.vertical !== vertical) return mk('review', 'out_of_scope', 'segmento_nao_pertence_ao_departamento', input.segment);

  // 1. Não-original / não-novo: definitivo (override manual nunca libera cópia/usado determinístico).
  if (input.identity.status === 'rejected') {
    const used = /usado|condicao|recondicionado|open_box|reembalado|avariado/.test(input.identity.reason);
    return mk('rejected', used ? 'used' : 'not_original', input.identity.reason, input.identity.matched);
  }
  // 2. Decisão humana vence o automático (exceto o acima).
  if (input.manual) return mk(input.manual, 'ok', 'decisao_manual');

  // 3. Fora de domínio: review (nunca rejected).
  if (!domainMatches(seg, input.domainId)) return mk('review', 'out_of_scope', 'dominio_fora_do_segmento', input.domainId);

  // 4. Léxico de fora do escopo no nome do catálogo ou nos anúncios.
  const re = OUT_OF_SCOPE[vertical];
  for (const t of [input.name, ...(input.offerTitles ?? [])]) {
    const m = re.exec(foldText(t));
    if (m) return mk('review', 'out_of_scope', 'lexico_fora_do_escopo', m[0]);
  }

  // 4b. Pacote de 2+ produtos ou acessório/peça (nome do catálogo e anúncios): scope.ts.
  for (const t of [input.name, ...(input.offerTitles ?? [])]) {
    const issue = scopeIssue(input.segment, t);
    if (issue) return mk('review', 'out_of_scope', issue.reason, issue.matched);
  }

  // 5. Evidência positiva: identidade forte.
  if (input.identity.status !== 'strong') return mk('review', 'unverified', input.identity.reason, input.identity.missing.join(',') || null);
  if (!input.name.trim()) return mk('review', 'unverified', 'sem_nome');
  return mk('approved', 'ok', `evidencia_positiva:${input.identity.keyKind}`);
}

const cache = new Map<NonGamesVertical, VerticalGate>();

/** Porteiro do departamento. `games` não tem porteiro aqui: o gamer segue src/lib/catalog/gate.ts. */
export function gateFor(vertical: NonGamesVertical): VerticalGate {
  let g = cache.get(vertical);
  if (!g) {
    g = { vertical, evaluate: (input) => evaluateFor(vertical, input) };
    cache.set(vertical, g);
  }
  return g;
}

/** Valor gravado em master_products.attributes.catalogGate (compatível com PersistedGate do porteiro gamer). */
export interface PersistedVerticalGate {
  verdict: 'review';
  category: 'unverified';
  reason: string;
  matched: string | null;
  version: number;
  at: string;
  /** Parecer do porteiro do departamento (só sugestão; o veredito gravado é sempre review). */
  suggested: VerticalGateVerdict;
  suggestedReason: string;
}

/** Rede de segurança do ADR 0008: o master da semeadura SEMPRE nasce em `review` (invisível), qualquer que seja o parecer. */
export function reviewGateFor(r: VerticalGateResult, at: string): PersistedVerticalGate {
  return {
    verdict: 'review',
    category: 'unverified',
    reason: 'semeadura_vertical_aguardando_conferencia',
    matched: r.matched,
    version: r.version,
    at,
    suggested: r.verdict,
    suggestedReason: r.reason,
  };
}
