// Puro (sem banco, sem rede): ESCOPO DE COMPRA REAL das lojas Plus (ata do Conselho 2026-11-12, docs/conselho/atas/2026-11-12-escopo-lojas-plus.md).
// Camada de VITRINE separada do porteiro: decide se um master aprovado aparece em vitrines, faixas da home, mensagens e
// "menor preço do dia". NUNCA apaga master, NUNCA altera o porteiro. A decisão vira uma MARCA REVERSÍVEL
// (attributes.vertical.foraDeEscopo) gravada por scripts/aplicar-escopo-compra.ts; o item segue aprovado, coletado,
// no dedup e pesquisável.
//
// FLAG: PLUS_ESCOPO_VITRINE=0 desliga os leitores (a marca no banco é ignorada). Reverter de vez = apagar a marca (rollback do script).

export const VERSAO_REGRA_ESCOPO = 1;
export const ESCOPO_VITRINE_ATIVO = process.env.PLUS_ESCOPO_VITRINE !== '0';

/** Ticket alto (centavos): acima disso o item NUNCA é barrado por demanda nem por piso (R3). */
export const TICKET_ALTO_CENTS = 30_000;
/** Preço acima de N x a mediana do tipo vai para revisão de dado e sai das vitrines (R5). */
export const MULTIPLO_ANOMALIA = 10;
/** R5 so dispara tambem com preco absoluto acima disto (centavos, R$50.000): sem isso, produto caro legitimo de tipo barato (cafeteira superautomatica, cooktop) seria tratado como erro de dado. */
export const ANOMALIA_PRECO_ABSOLUTO_MIN_CENTS = 5_000_000;
/** (Aposentado em 2026-11-12, ver escopoCompra) Sinal de demanda (R3): ofertas ativas >= 3 OU vendedores distintos >= 2. */
export const DEMANDA_MIN_OFERTAS = 3;
export const DEMANDA_MIN_VENDEDORES = 2;
/** Vendas totais do vendedor (porte do vendedor, NÃO demanda do item) só substituem o sinal em fones/mouse/headset. */
export const VENDAS_VENDEDOR_AUXILIAR = 1000;
const TIPOS_VENDAS_AUXILIAR = new Set(['eletroeletronicos:fones', 'tecnologia:mouse', 'tecnologia:headset']);
/** Exceção ao piso (R4): item abaixo do piso permanece com >= 5 ofertas e >= 3 vendedores. */
export const EXCECAO_PISO_OFERTAS = 5;
export const EXCECAO_PISO_VENDEDORES = 3;

/** R1: tipos excluídos por inteiro (departamento:tipo). */
export const TIPOS_EXCLUIDOS: ReadonlySet<string> = new Set(['eletroeletronicos:cabos-acessorios']);

/** R2: piso por tipo, em centavos. Chave 'departamento:tipo'; '*' do departamento = demais tipos. Ausência = sem piso. */
const PISOS_CENTS: Readonly<Record<string, number>> = {
  'eletroeletronicos:carregadores': 10_000,
  'eletroeletronicos:fones': 8_000,
  'eletroeletronicos:*': 10_000,
  'eletrodomesticos:*': 10_000,
  'tecnologia:mouse': 8_000,
  'tecnologia:teclado': 8_000,
  'tecnologia:headset': 8_000,
  'esporte:bola': 6_000,
  'esporte:protecao': 5_000,
  'esporte:fitness': 5_000,
  'esporte:garrafas': 5_000,
  'esporte:meias-roupas': 5_000,
  'esporte:bones': 5_000,
  'impressao3d:pecas': 5_000,
};

/** Sem exigência de demanda mesmo abaixo de R$300: livros e Impressão 3D (filamento, resina, impressora). */
function isentoDeDemanda(dept: string, tipo: string): boolean {
  if (dept === 'livros') return true;
  if (dept === 'impressao3d') return tipo !== 'pecas';
  return false;
}

export function pisoCents(dept: string, tipo: string): number | null {
  return PISOS_CENTS[`${dept}:${tipo}`] ?? PISOS_CENTS[`${dept}:*`] ?? null;
}

export type MotivoForaEscopo = 'tipo_excluido' | 'abaixo_do_piso' | 'sem_demanda' | 'preco_anomalo';

export interface EntradaEscopo {
  departamento: string;
  tipo: string;
  /** Mediana (centavos) dos preços das ofertas ativas/clicáveis do master. null = sem preço => não decide (dentro). */
  precoMedianoCents: number | null;
  nOfertas: number;
  nVendedores: number;
  /** Maior total_sales entre os vendedores das ofertas (porte do vendedor). Opcional. */
  maxVendasVendedor?: number | null;
  /** Mediana (centavos) do tipo na loja, para a checagem de anomalia (R5). Opcional. */
  medianaTipoCents?: number | null;
}

export interface ResultadoEscopo {
  dentro: boolean;
  motivo: MotivoForaEscopo | null;
  /** true => vai para a fila "revisar escopo/dado" (preço absurdo), além de sair das vitrines. */
  revisao: boolean;
  versaoRegra: number;
}

const ok = (): ResultadoEscopo => ({ dentro: true, motivo: null, revisao: false, versaoRegra: VERSAO_REGRA_ESCOPO });
const fora = (motivo: MotivoForaEscopo, revisao = false): ResultadoEscopo => ({ dentro: false, motivo, revisao, versaoRegra: VERSAO_REGRA_ESCOPO });

/** Função pura das 7 regras da ata. Games e departamentos desconhecidos: sempre dentro. */
const DEPTS_PLUS = new Set(['eletroeletronicos', 'eletrodomesticos', 'tecnologia', 'esporte', 'impressao3d', 'livros']);

export function escopoCompra(e: EntradaEscopo): ResultadoEscopo {
  if (!DEPTS_PLUS.has(e.departamento)) return ok();
  const chave = `${e.departamento}:${e.tipo}`;
  // R1: tipo excluído por inteiro (o preço não importa).
  if (TIPOS_EXCLUIDOS.has(chave)) return fora('tipo_excluido');
  const preco = e.precoMedianoCents;
  if (preco === null || !Number.isFinite(preco) || preco <= 0) return ok();
  // R5: preço absurdo frente ao tipo (ex.: lavadora-secadora de R$1,8 milhão) => revisão de dado, fora das vitrines.
  if (e.medianaTipoCents && e.medianaTipoCents > 0 && preco > MULTIPLO_ANOMALIA * e.medianaTipoCents && preco >= ANOMALIA_PRECO_ABSOLUTO_MIN_CENTS) return fora('preco_anomalo', true);
  // R3: ticket alto nunca é barrado.
  if (preco >= TICKET_ALTO_CENTS) return ok();
  // R2 + R4: piso por tipo, com exceção de demanda observada.
  const piso = pisoCents(e.departamento, e.tipo);
  if (piso !== null && preco < piso && !(e.nOfertas >= EXCECAO_PISO_OFERTAS && e.nVendedores >= EXCECAO_PISO_VENDEDORES)) return fora('abaixo_do_piso');
  // R3 (sinal de demanda: >= 3 ofertas OU >= 2 vendedores) FOI APOSENTADA em 2026-11-12 por ordem do dono: "produto unico NAO e motivo para nao traze-lo".
  // Nenhum minimo de ofertas/vendedores barra o produto (cadastro, aprovacao ou vitrine). Constantes DEMANDA_* seguem exportadas so por compatibilidade.
  void isentoDeDemanda; void TIPOS_VENDAS_AUXILIAR;
  return ok();
}

/** Mediana simples (usada para o preço do master e a mediana do tipo). */
export function mediana(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Forma gravada em master_products.attributes.vertical.foraDeEscopo. */
export interface MarcaForaEscopo {
  motivo: MotivoForaEscopo;
  tipo: string;
  versaoRegra: number;
  em: string;
  precoMedianoCents: number | null;
  revisao: boolean;
}
