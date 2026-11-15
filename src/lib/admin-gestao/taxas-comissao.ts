/**
 * COMISSÃO PREVISTA (métrica INTERNA de gestão; tarefa #62, dono 2026-11-15).
 * USO EXCLUSIVO DO /admin. Nunca importar de página pública, rota pública, mensagem do Telegram, OG/card ou
 * consulta compartilhada com o público (scripts/test-comissao-admin.ts falha se isso acontecer).
 *
 * Módulo puro (sem banco, sem 'server-only'), versionado em código: mudar taxa = editar TABELA + subir VERSAO_TABELA.
 *
 * Fontes e confiança (pesquisa de 2026-11-15; nenhuma credencial lida):
 *  - Amazon: tabela oficial do Programa de Associados Brasil, https://associados.amazon.com.br/help/node/topic/GRXPHT8U84RAYDXZ
 *    (lida em 2026-11-15) -> 'confirmada'.
 *  - Mercado Livre: o painel de afiliados (afiliados.mercadolivre.com.br) é a tabela oficial, mas exige login (HTTP 403 sem sessão).
 *    Usadas faixas de referência de terceiros (divulganinja.com.br, 2026), ponto médio -> 'estimada'.
 *  - Shopee: a API de afiliados devolve a taxa por oferta, mas as credenciais são Sensitive na Vercel (indisponíveis aqui).
 *    Dado real que temos: 2.700 campanhas oficiais em shopee_campaigns com commission_rate_raw = 0.03 (3%).
 *    Demais categorias: referências de terceiros (divulganinja/cupomonline 2026) -> 'estimada'.
 *  - Magalu (Parceiro Magalu): teto de até 12% por categoria; faixas de terceiros -> 'estimada' até o dono logar no portal.
 */

export const VERSAO_TABELA = '2026-11-15';

export type Confianca = 'confirmada' | 'estimada';

export type CategoriaComissao =
  | 'jogos' | 'consoles' | 'acessorios-games' | 'livros' | 'eletronicos' | 'informatica'
  | 'eletrodomesticos' | 'esporte' | 'impressao3d' | 'outros';

export const ROTULO_CATEGORIA: Record<CategoriaComissao, string> = {
  jogos: 'Jogos', consoles: 'Consoles', 'acessorios-games': 'Acessórios de games', livros: 'Livros',
  eletronicos: 'Eletroeletrônicos', informatica: 'Tecnologia/Informática', eletrodomesticos: 'Eletrodomésticos',
  esporte: 'Esporte', impressao3d: 'Impressão 3D', outros: 'Outros',
};

export const ROTULO_REDE_COMISSAO: Record<string, string> = {
  amazon: 'Amazon', 'mercado-livre': 'Mercado Livre', shopee: 'Shopee', magalu: 'Magalu',
};

export interface TaxaComissao {
  rede: string;
  categoria: CategoriaComissao;
  /** Fração (0.08 = 8%). */
  taxa: number;
  confianca: Confianca;
  fonte: string;
  /** Data (YYYY-MM-DD) em que a taxa foi levantada. */
  data: string;
}

const AMZ_FONTE = 'Tabela oficial Associados Amazon BR (associados.amazon.com.br/help/node/topic/GRXPHT8U84RAYDXZ)';
const ML_FONTE = 'Faixas de referência 2026 (divulganinja.com.br/blog/quanto-mercado-livre-paga-afiliados-comissoes), ponto médio; a tabela oficial exige login no painel';
const SH_FONTE = 'Campanhas oficiais Shopee no banco (taxa 0.03) e referências de terceiros 2026; API por oferta indisponível sem credencial';
const MG_FONTE = 'Referências de terceiros 2026 (divulganinja.com.br/blog/quanto-magalu-paga-comissao-afiliados-2026); teto Parceiro Magalu 12%; confirmar no portal';
const D = '2026-11-15';

const amz = (categoria: CategoriaComissao, taxa: number): TaxaComissao => ({ rede: 'amazon', categoria, taxa, confianca: 'confirmada', fonte: AMZ_FONTE, data: D });
const ml = (categoria: CategoriaComissao, taxa: number): TaxaComissao => ({ rede: 'mercado-livre', categoria, taxa, confianca: 'estimada', fonte: ML_FONTE, data: D });
const sh = (categoria: CategoriaComissao, taxa: number): TaxaComissao => ({ rede: 'shopee', categoria, taxa, confianca: 'estimada', fonte: SH_FONTE, data: D });
const mg = (categoria: CategoriaComissao, taxa: number): TaxaComissao => ({ rede: 'magalu', categoria, taxa, confianca: 'estimada', fonte: MG_FONTE, data: D });

export const TABELA: readonly TaxaComissao[] = [
  // Amazon: Games e Consoles 8%, Livros 10%, Eletrônicos/Informática/Celulares/TV e Áudio/Eletrodomésticos/Esportes 8%, Outros 7%.
  amz('jogos', 0.08), amz('consoles', 0.08), amz('acessorios-games', 0.08), amz('livros', 0.10), amz('eletronicos', 0.08),
  amz('informatica', 0.08), amz('eletrodomesticos', 0.08), amz('esporte', 0.08), amz('impressao3d', 0.08), amz('outros', 0.07),
  // Mercado Livre: Livros/Games/Brinquedos 4-12 (8); Eletrônicos e Informática 1-4 (2,5); Eletrodomésticos 3-7 (5); Esportes 4-10 (7).
  ml('jogos', 0.08), ml('consoles', 0.08), ml('acessorios-games', 0.08), ml('livros', 0.08), ml('eletronicos', 0.025),
  ml('informatica', 0.025), ml('eletrodomesticos', 0.05), ml('esporte', 0.07), ml('impressao3d', 0.025), ml('outros', 0.04),
  // Shopee: 3% medido nas campanhas oficiais; esporte e eletro conforme referências (estimadas).
  sh('jogos', 0.03), sh('consoles', 0.03), sh('acessorios-games', 0.03), sh('livros', 0.03), sh('eletronicos', 0.04),
  sh('informatica', 0.04), sh('eletrodomesticos', 0.04), sh('esporte', 0.06), sh('impressao3d', 0.04), sh('outros', 0.03),
  // Magalu: games 3-8 (5,5); eletrônicos 1-4 (2,5); demais 4.
  mg('jogos', 0.055), mg('consoles', 0.055), mg('acessorios-games', 0.055), mg('livros', 0.04), mg('eletronicos', 0.025),
  mg('informatica', 0.025), mg('eletrodomesticos', 0.04), mg('esporte', 0.04), mg('impressao3d', 0.025), mg('outros', 0.04),
];

/** Rede sem linha na tabela (Kabum, AliExpress...): fallback estimado de 3%. */
const FALLBACK = { taxa: 0.03, confianca: 'estimada' as Confianca, fonte: 'Rede sem tabela levantada; valor conservador padrão', data: D };

export function taxaPara(rede: string, categoria: CategoriaComissao): TaxaComissao {
  const t = TABELA.find((x) => x.rede === rede && x.categoria === categoria);
  return t ?? { rede, categoria, ...FALLBACK };
}

/** Categoria de comissão a partir do departamento e do tipo do master (product_type em games; segmento nos demais). */
export function categoriaComissao(vertical: string | null | undefined, tipo: string | null | undefined): CategoriaComissao {
  switch (vertical) {
    case 'games': return tipo === 'console' ? 'consoles' : tipo === 'accessory' ? 'acessorios-games' : 'jogos';
    case 'livros': return 'livros';
    case 'eletroeletronicos': return 'eletronicos';
    case 'tecnologia': return 'informatica';
    case 'eletrodomesticos': return 'eletrodomesticos';
    case 'esporte': return 'esporte';
    case 'impressao3d': return 'impressao3d';
    default: return 'outros';
  }
}

export interface ComissaoOferta {
  taxa: number;
  /** Centavos de R$ (arredondado). */
  cents: number;
  confianca: Confianca;
  rede: string;
  categoria: CategoriaComissao;
}

export function comissaoOferta(rede: string, vertical: string | null | undefined, tipo: string | null | undefined, precoCents: number): ComissaoOferta {
  const categoria = categoriaComissao(vertical, tipo);
  const t = taxaPara(rede, categoria);
  const preco = Number.isFinite(precoCents) && precoCents > 0 ? precoCents : 0;
  return { taxa: t.taxa, cents: Math.round(preco * t.taxa), confianca: t.confianca, rede, categoria };
}

export interface OfertaParaProduto { precoCents: number; comissao: ComissaoOferta }
export interface ComissaoProduto {
  /** Comissão da oferta de menor preço. */
  menor: ComissaoOferta | null;
  minCents: number | null;
  maxCents: number | null;
  minTaxa: number | null;
  maxTaxa: number | null;
  ofertas: number;
  estimada: boolean;
}

export function comissaoProduto(ofertas: OfertaParaProduto[]): ComissaoProduto {
  const v = ofertas.filter((o) => o.precoCents > 0);
  if (v.length === 0) return { menor: null, minCents: null, maxCents: null, minTaxa: null, maxTaxa: null, ofertas: 0, estimada: false };
  const menor = v.reduce((a, b) => (b.precoCents < a.precoCents ? b : a));
  const cents = v.map((o) => o.comissao.cents);
  const taxas = v.map((o) => o.comissao.taxa);
  return {
    menor: menor.comissao, minCents: Math.min(...cents), maxCents: Math.max(...cents),
    minTaxa: Math.min(...taxas), maxTaxa: Math.max(...taxas), ofertas: v.length,
    estimada: v.some((o) => o.comissao.confianca === 'estimada'),
  };
}

export interface GrupoAgregado { chave: string; ofertas: number; precoCents: number; comissaoCents: number; ofertasEstimadas: number }
export interface GrupoResumo extends GrupoAgregado { taxaMedia: number | null; pctEstimada: number | null }

/** Acumula (soma de preços e de comissões) por chave; a taxa média é ponderada pelo preço. `n` = ofertas representadas; precoCents e c.cents já são totais. */
export function acumular(grupos: Map<string, GrupoAgregado>, chave: string, precoCents: number, comissaoCents: number, estimada: boolean, n = 1): void {
  const g = grupos.get(chave) ?? { chave, ofertas: 0, precoCents: 0, comissaoCents: 0, ofertasEstimadas: 0 };
  g.ofertas += n;
  g.precoCents += precoCents;
  g.comissaoCents += comissaoCents;
  if (estimada) g.ofertasEstimadas += n;
  grupos.set(chave, g);
}

export function resumir(grupos: Map<string, GrupoAgregado>): GrupoResumo[] {
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      taxaMedia: g.precoCents > 0 ? g.comissaoCents / g.precoCents : null,
      pctEstimada: g.ofertas > 0 ? g.ofertasEstimadas / g.ofertas : null,
    }))
    .sort((a, b) => b.comissaoCents - a.comissaoCents);
}

export const pctTexto = (taxa: number | null): string => (taxa == null ? '—' : `${(taxa * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
