// GUIA DAS IMPRESSORAS 3D PRIORITARIAS (dono, 2026-11-15, #111). PURO: sem banco e sem rede (a consulta fica em src/server/queries/guia-3d.ts).
// Ordem fixa: SEMPRE a impressora COM COMBO primeiro (P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo), depois as sem combo
// (P2S, P1S, A1, A1 Mini), por ultimo a Anycubic Kobra. Mostra o MENOR preco de cada modelo entre as lojas que tem oferta elegivel agora;
// loja sem oferta aparece como "sem oferta nesta loja agora" (nada inventado). Identidade: combo e avulsa NUNCA se misturam; A1 != A1 Mini.
import { ehPrioridade3d, MODELOS_GUIA_3D, modeloGuia3d, type ModeloGuia3d } from '@/lib/messaging/prioridade-3d';

export type RedeGuia = 'mercado-livre' | 'amazon' | 'shopee';
export const REDES_GUIA: readonly RedeGuia[] = ['mercado-livre', 'amazon', 'shopee'];
export const ROTULO_REDE_GUIA: Record<RedeGuia, string> = { 'mercado-livre': 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee' };

/** Uma linha por (master, rede): a oferta elegivel mais barata daquela loja (ja filtrada por eligibleOfferSql/quarentena/frescor na consulta). */
export interface LinhaGuia3d {
  masterId: string;
  masterSlug: string;
  nome: string;
  imagem: string | null;
  rede: RedeGuia;
  precoCents: number;
  verificadoEm: string;
  ofertaSlug: string;
  /** Id da oferta (para ligar cupom e desconto de cartao lidos na pagina). Opcional: testes antigos nao o enviam. */
  offerId?: string;
}

/** Cupom e desconto de cartao LIDOS na pagina do anuncio (#112). Nunca inventado: sem leitura valida, sem aviso. */
export interface AvisoOfertaGuia {
  /** "Cupom: R$ 100 OFF (preco com cupom R$ 7.990,00)" ou null. */
  cupom: string | null;
  /** "Desconto no cartao: Itau Mastercard 15% (a confirmar no carrinho)", "Pagamento: 10x de R$ 845,91 sem juros"... */
  cartoes: string[];
}

export interface LojaGuia {
  rede: RedeGuia;
  redeNome: string;
  precoCents: number;
  verificadoEm: string;
  ofertaSlug: string;
  offerId?: string;
  aviso?: AvisoOfertaGuia;
}

export interface ItemGuia3d {
  /** Slug estavel do modelo (ou do master, para Kobra). */
  slug: string;
  rotulo: string;
  /** Titulo real do anuncio/master de onde sai a foto e o link do detalhe. */
  nome: string;
  combo: boolean;
  familia: ModeloGuia3d['familia'];
  masterId: string | null;
  masterSlug: string | null;
  imagem: string | null;
  /** Uma entrada por loja que TEM oferta elegivel agora (a mais barata de cada). */
  lojas: LojaGuia[];
  /** Redes sem oferta elegivel agora: a tela escreve "sem oferta nesta loja agora" (Shopee so quando ha oferta). */
  semOferta: RedeGuia[];
  /** Menor preco do modelo entre as lojas (null = nenhuma oferta agora). */
  menor: LojaGuia | null;
}

export const MAX_KOBRA_GUIA = 4;

function lojaDe(l: LinhaGuia3d): LojaGuia {
  return { rede: l.rede, redeNome: ROTULO_REDE_GUIA[l.rede], precoCents: l.precoCents, verificadoEm: l.verificadoEm, ofertaSlug: l.ofertaSlug, offerId: l.offerId };
}

function melhorPorRede(linhas: readonly LinhaGuia3d[]): { lojas: LojaGuia[]; vencedora: LinhaGuia3d | null } {
  const porRede = new Map<RedeGuia, LinhaGuia3d>();
  for (const l of linhas) {
    const atual = porRede.get(l.rede);
    if (!atual || l.precoCents < atual.precoCents || (l.precoCents === atual.precoCents && l.verificadoEm > atual.verificadoEm)) porRede.set(l.rede, l);
  }
  const lojas = REDES_GUIA.filter((r) => porRede.has(r)).map((r) => lojaDe(porRede.get(r)!));
  let venc: LinhaGuia3d | null = null;
  for (const l of porRede.values()) if (!venc || l.precoCents < venc.precoCents || (l.precoCents === venc.precoCents && l.verificadoEm > venc.verificadoEm)) venc = l;
  return { lojas, vencedora: venc };
}

function semOfertaDe(lojas: readonly LojaGuia[]): RedeGuia[] {
  const tem = new Set(lojas.map((l) => l.rede));
  // ML e Amazon sempre aparecem (com o aviso quando faltam); Shopee so quando ha oferta.
  return (['mercado-livre', 'amazon'] as RedeGuia[]).filter((r) => !tem.has(r));
}

function montarItem(slug: string, rotulo: string, meta: Pick<ItemGuia3d, 'combo' | 'familia'>, linhas: readonly LinhaGuia3d[]): ItemGuia3d {
  const { lojas, vencedora } = melhorPorRede(linhas);
  const comFoto = vencedora?.imagem ? vencedora : linhas.find((l) => l.imagem) ?? vencedora;
  const menor = lojas.reduce<LojaGuia | null>((m, l) => (!m || l.precoCents < m.precoCents ? l : m), null);
  return {
    slug, rotulo, nome: vencedora?.nome ?? rotulo, ...meta,
    masterId: vencedora?.masterId ?? null, masterSlug: vencedora?.masterSlug ?? null,
    imagem: comFoto?.imagem ?? null,
    lojas, semOferta: semOfertaDe(lojas), menor,
  };
}

/**
 * Monta a guia na ordem do dono. Os 8 modelos aparecem SEMPRE (mesmo sem oferta agora, com aviso); a Kobra entra por master (modelos diferentes
 * nunca se misturam), do menor para o maior preco, ate MAX_KOBRA_GUIA, e so os que tem oferta.
 */
export function montarGuia3d(linhas: readonly LinhaGuia3d[]): ItemGuia3d[] {
  const validas = linhas.filter((l) => l.precoCents > 0 && ehPrioridade3d('impressao3d', l.nome));
  const out: ItemGuia3d[] = MODELOS_GUIA_3D.map((m) =>
    montarItem(m.slug, m.rotulo, { combo: m.combo, familia: m.familia }, validas.filter((l) => modeloGuia3d(l.nome)?.slug === m.slug))
  );
  const kobras = new Map<string, LinhaGuia3d[]>();
  for (const l of validas) {
    if (modeloGuia3d(l.nome) || !/\b(?:kobra|anycubic)\b/i.test(l.nome)) continue;
    const arr = kobras.get(l.masterId);
    if (arr) arr.push(l);
    else kobras.set(l.masterId, [l]);
  }
  const itensKobra = [...kobras.values()]
    .map((ls) => montarItem(`kobra-${ls[0].masterSlug}`, ls[0].nome, { combo: /\bcombo\b/i.test(ls[0].nome), familia: 'kobra' }, ls))
    .filter((i) => i.menor)
    .sort((a, b) => a.menor!.precoCents - b.menor!.precoCents)
    .slice(0, MAX_KOBRA_GUIA);
  return out.concat(itensKobra);
}

/** Variacao do preco atual sobre o menor registrado, em % inteira (positivo = acima do registrado). null sem registro valido. Texto factual, sem selo. */
export function variacaoSobreRegistrado(atualCents: number, registradoCents: number | null | undefined): number | null {
  if (!registradoCents || registradoCents <= 0 || !atualCents || atualCents <= 0) return null;
  return Math.round(((atualCents - registradoCents) / registradoCents) * 100);
}

/** Flag de rollback das 3 secoes e da guia na pagina publica da Impressao 3D (padrao LIGADA; DEPT_3D_SECOES=off volta a pagina anterior). */
export function secoes3dLigada(env: Record<string, string | undefined> = process.env): boolean {
  return (env.DEPT_3D_SECOES ?? '').toLowerCase() !== 'off';
}

/** Linhas de aviso (cupom e cartao) de uma oferta, na ordem de exibicao; vazio = nada a mostrar. */
export function linhasAviso(a: AvisoOfertaGuia | null | undefined): string[] {
  if (!a) return [];
  return [...(a.cupom ? [a.cupom] : []), ...a.cartoes];
}

export function avisosCupomLigados(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GUIA_3D_CUPONS ?? '').toLowerCase() !== 'off';
}
