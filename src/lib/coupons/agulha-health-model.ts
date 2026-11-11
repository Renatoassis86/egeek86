// Modelo PURO do indicador "cobertura de cupom na agulha por loja" (sem banco). O servidor entrega contagens medidas; aqui só
// se calculam percentuais, semáforo e rótulos. Nada é estimado: divisão por zero = null (sem dado), nunca 0% inventado.

export type MotivoSemCupom =
  | 'com_cupom'
  | 'nao_consultou'
  | 'sem_leitura_2h'
  | 'lida_sem_cupom'
  | 'cupom_lido_reprovado'
  | 'rede_sem_leitura_autorizada';

export const MOTIVO_LABEL: Record<MotivoSemCupom, string> = {
  com_cupom: 'Saiu com cupom',
  nao_consultou: 'Tipo de mensagem sem cupom (resumo, radar, plataforma)',
  sem_leitura_2h: 'Anúncio sem leitura de cupom nas 2 h anteriores',
  lida_sem_cupom: 'Lido a tempo, a loja não mostrava cupom',
  cupom_lido_reprovado: 'Cupom lido, mas reprovado (exige seguir a loja, preço mudou ou regra incoerente)',
  rede_sem_leitura_autorizada: 'Rede sem leitura autorizada (Amazon, Shopee)',
};

export interface CoberturaLinha {
  network: string;
  vertical: string;
  /** Ofertas elegíveis a mensagem e a leitura (ativas, fora de quarentena; no ML: o mais barato de cada produto com link oficial). */
  ofertasAlvo: number;
  /** Alvo lido (com ou sem cupom) nas últimas 2 h. */
  lidas2h: number;
  /** Alvo com cupom hoje na agulha (leitura positiva <= 2 h, sem leitura nova negativa, sem "seguir a loja", preço com cupom < preço atual e lido sobre o preço de agora). */
  naAgulha: number;
  /** Alvo com cupom visto nas últimas 24 h (potencial) mas fora da agulha agora (leitura envelheceu). */
  cupomVelho: number;
  /** Idade da leitura mais recente de cupom por anúncio, em minutos (null = nunca). */
  ultimaLeituraMin: number | null;
}

export interface ListasLinha {
  network: string;
  vivos: number;
  conferidos12h: number;
  ultimaLeituraMin: number | null;
}

export interface MensagensLinha {
  network: string;
  vertical: string;
  enviadas: number;
  porMotivo: Partial<Record<MotivoSemCupom, number>>;
}

export const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export type Semaforo = 'verde' | 'amarelo' | 'vermelho' | 'cinza';

/**
 * Semáforo da LEITURA (não do cupom): quanto do alvo foi lido nas últimas 2 h. Verde >= 60%, amarelo >= 25%, vermelho abaixo; cinza sem alvo.
 * Os cortes são operacionais (meta de cobertura de leitura), não estatísticos; ficam aqui, num lugar só, para o dono ajustar.
 */
export function semaforoLeitura(l: Pick<CoberturaLinha, 'ofertasAlvo' | 'lidas2h'>): Semaforo {
  const p = pct(l.lidas2h, l.ofertasAlvo);
  if (p == null) return 'cinza';
  return p >= 60 ? 'verde' : p >= 25 ? 'amarelo' : 'vermelho';
}

export function idadeLabel(min: number | null): string {
  if (min == null) return 'nunca';
  if (min < 90) return `${min} min`;
  if (min < 2880) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}
