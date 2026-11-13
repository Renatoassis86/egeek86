// Sem 'server-only': tipos e lógica pura, importáveis pelo front, pelos loaders e pelos testes.

/** Plataformas aceitas nas vitrines. 'pc' é rótulo de vitrine (o enum do banco não tem PC; ver docs). Xbox One, 360 e 'unknown' nunca entram. */
export type PlataformaVitrine = 'ps5' | 'ps4' | 'switch_2' | 'switch_1' | 'xbox_series' | 'pc';

export type TipoVitrine = 'jogo' | 'console' | 'acessorio' | 'colecionavel' | 'plus';

/** Vitrines sem plataforma. As faixas de plataforma usam `chaveFaixa(...)`. */
export type VitrineBase = 'destaques' | 'mudancas' | 'menor-registrado' | 'acessorios' | 'colecionaveis' | 'plus';

export type FaixaTipo = 'jogos' | 'consoles';

/** Ex.: 'destaques', 'plataforma:ps5:jogos', 'plataforma:switch_2:consoles'. */
export type VitrineChave = VitrineBase | `plataforma:${PlataformaVitrine}:${FaixaTipo}`;

/** Como o preço está contra a média única do produto (mesma média do selo). */
export type PosicaoMedia =
  | { tipo: 'abaixo'; pct: number }
  | { tipo: 'em_linha'; pct: number }
  | { tipo: 'acima'; pct: number }
  /** Base curta (menos de 5 cotações ou 14 dias) ou produto muito disperso: sem afirmação de posição. */
  | { tipo: 'sem_base' };

export interface MediaProduto {
  /** Média única do produto, em centavos. */
  centavos: number;
  /** Cotações que sustentam a média (mesma contagem do piso de 5). */
  cotacoes: number;
  /** Dias de histórico (do primeiro ao último preço lido). */
  dias: number;
}

export interface MenorRegistrado {
  centavos: number;
  /** ISO da primeira cotação com esse preço. */
  em: string;
  /** O preço agora está no menor registrado (régua de 3%) com vendedor confiável e histórico elegível. */
  noMenor: boolean;
  /** Pelo menos 2 vendedores distintos dentro de 10% do preço agora. */
  corroborado: boolean;
}

/** Mudança do menor preço do produto (price_min_events, ADR 0004). */
export interface EventoMenorPreco {
  /** ISO do momento da mudança. */
  em: string;
  /** Novo menor preço, centavos. */
  centavos: number;
  /** Menor preço anterior, centavos. */
  antesCentavos: number;
  /** Queda percentual sobre o anterior (positivo). */
  quedaPct: number;
  /** Loja que passou a deter o menor preço. null = não se sabe (evento antigo sem oferta). */
  loja: string | null;
}

/** Um cartão de vitrine. Tudo serializável em JSON (passa pelo snapshot persistido). Nada aqui é inventado: campo ausente = null. */
export interface VitrineItem {
  masterProductId: string;
  /** null só nas vitrines Plus (cartão de departamento, sem oferta única). */
  offerId: string | null;
  /** Slug da oferta (rota /ofertas/[slug]). */
  slug: string;
  href: string;
  titulo: string;
  imagemUrl: string | null;
  tipo: TipoVitrine;
  /** null só nas vitrines Plus (departamentos). */
  plataforma: PlataformaVitrine | null;
  /** Menor preço agora entre as ofertas públicas, centavos. */
  precoCentavos: number;
  loja: string;
  lojaSlug: string;
  /** ISO da última leitura de preço (R-39: mostrar "lido às HH:MM"). */
  lidoEm: string;
  ofertasAtivas: number;
  lojasAtivas: number;
  /** Plus: sempre null (sem selo nem média até 27/11, R-36). */
  media: MediaProduto | null;
  posicao: PosicaoMedia;
  menorRegistrado: MenorRegistrado | null;
  /** Só na vitrine 'mudancas'. */
  evento: EventoMenorPreco | null;
  /** Só na vitrine 'plus': slug do departamento (impressao3d, tecnologia, livros, eletrodomesticos, eletroeletronicos, esporte). */
  departamento: string | null;
}

export interface VitrineResultado {
  chave: VitrineChave;
  /** Vazia (e `visivel` false) quando não há itens elegíveis suficientes. */
  itens: VitrineItem[];
  /** false = o bloco some (menos de VITRINE_MIN_ITENS elegíveis). Nunca se preenche com item fraco. */
  visivel: boolean;
  /** ISO de quando o resultado foi calculado. */
  calculadoEm: string;
  /** Contagens reais do funil, para auditoria. */
  funil: { candidatos: number; elegiveis: number };
  /** Por que o bloco está oculto, quando estiver. */
  motivoOculta: string | null;
}

export function chaveFaixa(plataforma: PlataformaVitrine, tipo: FaixaTipo): VitrineChave {
  return `plataforma:${plataforma}:${tipo}`;
}

export const PLATAFORMAS_VITRINE: readonly PlataformaVitrine[] = ['ps5', 'ps4', 'switch_2', 'switch_1', 'xbox_series', 'pc'];

/** As 4 faixas da landing com as sub-abas (primeira = padrão). */
export const FAIXAS_PLATAFORMA: ReadonlyArray<{ id: 'playstation' | 'nintendo' | 'xbox' | 'pc'; rotulo: string; subabas: ReadonlyArray<{ plataforma: PlataformaVitrine; rotulo: string }> }> = [
  { id: 'playstation', rotulo: 'PlayStation', subabas: [{ plataforma: 'ps5', rotulo: 'PS5' }, { plataforma: 'ps4', rotulo: 'PS4' }] },
  { id: 'nintendo', rotulo: 'Nintendo', subabas: [{ plataforma: 'switch_2', rotulo: 'Switch 2' }, { plataforma: 'switch_1', rotulo: 'Switch' }] },
  { id: 'xbox', rotulo: 'Xbox', subabas: [{ plataforma: 'xbox_series', rotulo: 'Xbox Series' }] },
  { id: 'pc', rotulo: 'PC e portáteis', subabas: [{ plataforma: 'pc', rotulo: 'PC e portáteis' }] },
];

export function todasAsChaves(): VitrineChave[] {
  const faixas = PLATAFORMAS_VITRINE.flatMap((p) => [chaveFaixa(p, 'jogos'), chaveFaixa(p, 'consoles')]);
  return ['destaques', 'mudancas', ...faixas, 'menor-registrado', 'acessorios', 'colecionaveis', 'plus'];
}

export function chaveValida(v: unknown): v is VitrineChave {
  return typeof v === 'string' && (todasAsChaves() as string[]).includes(v);
}
