// ORDEM DA FILA DE LEITURA DE CUPOM PARA AS IMPRESSORAS 3D PRIORITÁRIAS (dono, 2026-11-15, #112). PURO: sem banco, sem rede.
//   Ordem fixa do dono: P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo; depois P2S, P1S, A1, A1 Mini; por último Kobra (SEMPRE o combo primeiro).
//   Rodízio: oferta nunca lida primeiro (na ordem do dono, mais barata antes); depois a leitura mais velha; nunca antes da cadência
//   (30 min nas impressoras prioritárias; Kobra e outros Bambu 60 min). Prioridade 0 (cupom divulgado aberto)
//   continua na frente: encerrar um cupom não espera. As impressoras vêm logo depois (antes das mensagens prontas) e ocupam no máximo 50% das vagas; sem aumentar a carga.
import { posicaoPrioridade3d, POSICAO_NAO_PRIORIDADE_3D } from '@/lib/messaging/prioridade-3d';

export const CADENCIA_IMPRESSORA_MIN = 30;
export const CADENCIA_IMPRESSORA_SECUNDARIA_MIN = 60;
export const FRACAO_MAX_IMPRESSORAS = 0.5;

export interface LinhaFila {
  prio: number;
  vertical: string;
  name: string;
  /** centavos */
  price: number;
  /** minutos desde a última leitura; null = nunca lida */
  ageMin: number | null;
  /** posição no SQL (prioridade, ticket alto, leitura mais velha): desempate estável */
  seq: number;
  /** a regra de cadência/idade já cumprida pela regra antiga (45/90 min) */
  devidaPadrao: boolean;
}

export function cadenciaImpressoraMin(pos: number): number {
  return pos < 8 ? CADENCIA_IMPRESSORA_MIN : CADENCIA_IMPRESSORA_SECUNDARIA_MIN;
}

export function ordenarFila<T extends LinhaFila>(rows: readonly T[], n: number, env: Record<string, string | undefined> = process.env): T[] {
  const comPos = rows.map((r) => ({ r, pos: posicaoPrioridade3d(r.vertical, r.name, 'impressora-3d', env) }));
  const ehImp = (x: { r: T; pos: number }) => x.pos < POSICAO_NAO_PRIORIDADE_3D && x.r.prio >= 1;
  // elegível: impressora prioritária segue a cadência própria; as demais seguem a regra antiga
  const elegiveis = comPos.filter((x) => (ehImp(x) ? x.r.ageMin == null || x.r.ageMin >= cadenciaImpressoraMin(x.pos) : x.r.devidaPadrao));
  const topo = elegiveis.filter((x) => x.r.prio <= 0).sort((a, b) => a.r.seq - b.r.seq);
  const imps = elegiveis
    .filter(ehImp)
    .sort((a, b) =>
      Number(b.r.ageMin == null) - Number(a.r.ageMin == null) || // nunca lida primeiro
      (a.r.ageMin == null ? a.pos - b.pos || a.r.price - b.r.price : b.r.ageMin! - a.r.ageMin! || a.pos - b.pos) || // depois a mais velha
      a.r.seq - b.r.seq,
    );
  const resto = elegiveis.filter((x) => x.r.prio >= 1 && !ehImp(x)).sort((a, b) => a.r.seq - b.r.seq);
  const capImp = Math.max(0, Math.min(imps.length, Math.ceil(n * FRACAO_MAX_IMPRESSORAS)));
  // Dentro do corte das impressoras, a ordem final respeita o modelo do dono (combo primeiro), e o rodízio decide QUAIS entram.
  const escolhidas = imps.slice(0, capImp).sort((a, b) => a.pos - b.pos || a.r.seq - b.r.seq);
  const out = [...topo, ...escolhidas, ...resto, ...imps.slice(capImp)];
  return out.slice(0, n).map((x) => x.r);
}
