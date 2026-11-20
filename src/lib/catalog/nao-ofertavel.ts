// Sem 'server-only': função PURA (sem banco, sem rede). R-108 (dono, 2026-11-20, variedade): o que NUNCA é oferta da loja, mesmo com tipo "outros".
//
// Medido em 24 h no Esporte: 3 envios, 230 propostas expiradas e 74 pendentes de coldre, algema, munição e bornal tático (128 masters aprovados), e na Casa
// fritador/tacho industrial, cesta de fritura e robô de piscina. Não são produto de esporte nem eletrodoméstico de casa; ocupavam o turno de "outros" do rodízio.
// Vale para o que ENTRA (porteiro do departamento, gate.ts) e para o pool de envio (pool-diversidade.ts). Só texto; não decide preço nem estoque.
import { normalizarTitulo } from '@/lib/catalog/tipos-produto';

const r = (src: string) => new RegExp(src);

const FORA: Record<string, RegExp> = {
  // Armaria e equipamento tático/hardware: não é esporte do dia a dia.
  esporte: r(
    ' (coldre|coldres|holster|algema|algemas|municao|municoes|cartucho|cartuchos|revolver|revolveres|beretta|glock|taurus|imbel|molle|balistico|balistica|' +
      'airsoft|paintball|espingarda|carabina|chumbinho|baleiro|bandoleira|porta carregador|velado|fiel retratil|embuchamento|aco zincado|aco inox 304) ',
  ),
  // Equipamento de restaurante/lanchonete e itens que não são eletrodoméstico de casa.
  eletrodomesticos: r(
    ' (tacho|tachos|fritador|fritadores|frita rapido|chapeira|pasteleiro|gastronomica|gastronomicas|gastronomico|lanchonete|hamburgueria|restaurante|industrial|industriais|feirante|' +
      'escumadeira|caminhao|motorhome|onibus|robo de piscina|limpa piscina|pelucia|oculos vr) | frigideira (profunda|tempura|com pinca) | cesta (de|para) (fritura|batata|batatas|drenagem) ',
  ),
};

/** Termo que tira o título da oferta da loja (ou null). `vertical` sem regra = sempre null. */
export function naoOfertavel(vertical: string, nome: string): string | null {
  const re = FORA[vertical];
  if (!re) return null;
  const m = re.exec(normalizarTitulo(nome));
  return m ? m[0].trim() : null;
}
