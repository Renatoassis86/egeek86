// BATIMENTO E VIGIA do loop de leitura de cupom 24 h (aba logada do dono, scripts/chrome/cupons-24h.js). Módulo PURO (sem banco, sem rede):
// valida o batimento recebido, decide quando uma rede está "sem leitura" e monta o aviso interno. Nada aqui inventa dado: batimento é só
// "o loop está vivo e o que fez no ciclo"; a ausência dele é o sinal.
import type { PageNetwork } from './page-read';

/** Sem batimento "ok" por mais que isto = rede sem leitura (pedido do dono, 2026-11-11). */
export const HEARTBEAT_STALE_MIN = 60;
/** No máximo 1 aviso por rede neste intervalo (sem spam). */
export const HEARTBEAT_ALERT_GAP_MIN = 6 * 60;
/** Rede sem nenhum batimento há mais dias que isto = loop desativado de propósito: o vigia não avisa (o painel segue mostrando a idade). */
export const HEARTBEAT_WATCH_DAYS = 7;
export const HEARTBEAT_JOB = 'cupons-batimento';
export const VIGIA_JOB = 'cupons-vigia';
/** Evento gravado na auditoria (collector_runs.meta.evento) quando o vigia detecta a rede parada. */
export const EVENTO_REDE_SEM_LEITURA = 'rede_sem_leitura';

export type HeartbeatEstado = 'ok' | 'pausado' | 'parado';
export const HEARTBEAT_ESTADOS: readonly HeartbeatEstado[] = ['ok', 'pausado', 'parado'];
/** Parada pedida por quem opera (stop()): não é falha, o vigia não avisa. */
export const MOTIVO_OPERADOR = 'operador';

export interface Heartbeat {
  rede: PageNetwork;
  estado: HeartbeatEstado;
  /** Código curto (a-z0-9_:-), sem texto livre. */
  motivo: string | null;
  ciclo: number;
  fila: number;
  lidas: number;
  enviadas: number;
  descartadas: number;
  erros: number;
  versao: string | null;
}

export type HeartbeatParse = { ok: true; value: Heartbeat } | { ok: false; reason: 'corpo_invalido' | 'estado_invalido' };

const cnt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1_000_000, Math.max(0, Math.trunc(v))) : 0);
const code = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return /^[a-z0-9_:.-]{1,60}$/.test(s) ? s.slice(0, max) : null;
};

/** Valida o corpo do POST. Só números pequenos e códigos curtos entram; qualquer outro campo é ignorado (nunca vira texto livre no banco). */
export function parseHeartbeat(rede: PageNetwork, body: unknown): HeartbeatParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'corpo_invalido' };
  const b = body as Record<string, unknown>;
  if (!(HEARTBEAT_ESTADOS as readonly unknown[]).includes(b.estado)) return { ok: false, reason: 'estado_invalido' };
  return {
    ok: true,
    value: {
      rede, estado: b.estado as HeartbeatEstado, motivo: code(b.motivo, 40), ciclo: cnt(b.ciclo), fila: cnt(b.fila), lidas: cnt(b.lidas),
      enviadas: cnt(b.enviadas), descartadas: cnt(b.descartadas), erros: cnt(b.erros), versao: code(b.versao, 20),
    },
  };
}

export interface RedeBatimento {
  rede: string;
  /** Último batimento de qualquer estado. */
  ultimoEm: Date | null;
  ultimoEstado: HeartbeatEstado | null;
  ultimoMotivo: string | null;
  ultimoCiclo: number | null;
  /** Último batimento com estado 'ok' (o loop leu/consultou a fila de fato). */
  ultimoOkEm: Date | null;
  /** Último aviso do vigia para esta rede. */
  ultimoAvisoEm: Date | null;
}

export type VigiaAcao = 'em_dia' | 'avisar' | 'aviso_recente' | 'nunca_iniciou' | 'inativo_ha_dias' | 'parado_pelo_operador';
export interface VigiaDecisao {
  rede: string;
  acao: VigiaAcao;
  /** Minutos desde o último batimento ok (null = nunca). */
  idadeOkMin: number | null;
  idadeUltimoMin: number | null;
}

const minutos = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 60_000);

/** Decide, por rede, se o vigia avisa. Pura. Pausa longa (captcha/login) sem batimento ok também vira aviso. */
export function decidirVigia(r: RedeBatimento, now: Date): VigiaDecisao {
  const idadeUltimoMin = r.ultimoEm ? minutos(now, r.ultimoEm) : null;
  const idadeOkMin = r.ultimoOkEm ? minutos(now, r.ultimoOkEm) : null;
  const base = { rede: r.rede, idadeOkMin, idadeUltimoMin };
  if (!r.ultimoEm) return { ...base, acao: 'nunca_iniciou' };
  if (idadeUltimoMin! > HEARTBEAT_WATCH_DAYS * 1440) return { ...base, acao: 'inativo_ha_dias' };
  if (r.ultimoEstado === 'parado' && r.ultimoMotivo === MOTIVO_OPERADOR) return { ...base, acao: 'parado_pelo_operador' };
  // A referência é o último batimento ok; se nunca houve ok mas há batimento (só pausas), conta a partir do primeiro sinal de vida.
  const ref = idadeOkMin ?? idadeUltimoMin!;
  if (ref <= HEARTBEAT_STALE_MIN) return { ...base, acao: 'em_dia' };
  if (r.ultimoAvisoEm && minutos(now, r.ultimoAvisoEm) < HEARTBEAT_ALERT_GAP_MIN) return { ...base, acao: 'aviso_recente' };
  return { ...base, acao: 'avisar' };
}

const NOME_REDE: Record<string, string> = { amazon: 'Amazon', shopee: 'Shopee' };

/** Texto do aviso interno (equipe/dono). Só fatos medidos; HTML escapado não é necessário (sem texto livre). */
export function mensagemRedeSemLeitura(d: VigiaDecisao, r: RedeBatimento): string {
  const nome = NOME_REDE[d.rede] ?? d.rede;
  const h = (m: number | null) => (m == null ? 'nunca' : m < 90 ? `${m} min` : `${Math.round(m / 60)} h`);
  const motivo = r.ultimoEstado && r.ultimoEstado !== 'ok' ? ` Último estado: ${r.ultimoEstado}${r.ultimoMotivo ? ` (${r.ultimoMotivo})` : ''}.` : '';
  return `Cupom na agulha: ${nome} sem leitura há ${h(d.idadeOkMin ?? d.idadeUltimoMin)} (limite ${HEARTBEAT_STALE_MIN} min).${motivo} Abra a aba logada da ${nome} e confira o loop (window.__cup.status()); runbook em docs/03-metodologia/CUPOM_NA_AGULHA.md. Próximo aviso desta rede só em ${HEARTBEAT_ALERT_GAP_MIN / 60} h.`;
}

export interface VigiaDeps {
  redes: readonly string[];
  now: Date;
  lerBatimentos: () => Promise<RedeBatimento[]>;
  /** Grava a auditoria 'rede_sem_leitura' (uma linha por aviso decidido). */
  registrar: (d: VigiaDecisao, enviado: boolean, motivoNaoEnviado: string | null) => Promise<void>;
  /** null/ausente = canal interno não configurado (só registra). Devolve true se o envio foi aceito. */
  enviar?: ((texto: string) => Promise<boolean>) | null;
}

export interface VigiaResultado {
  decisoes: VigiaDecisao[];
  avisados: string[];
  registrados: number;
}

/** Passo do agente de cupons: confere os batimentos, avisa (no máximo 1 por rede a cada 6 h) e registra. Nunca lança. */
export async function rodarVigia(deps: VigiaDeps): Promise<VigiaResultado> {
  const out: VigiaResultado = { decisoes: [], avisados: [], registrados: 0 };
  let linhas: RedeBatimento[] = [];
  try {
    linhas = await deps.lerBatimentos();
  } catch {
    return out;
  }
  for (const rede of deps.redes) {
    const r = linhas.find((l) => l.rede === rede) ?? { rede, ultimoEm: null, ultimoEstado: null, ultimoMotivo: null, ultimoCiclo: null, ultimoOkEm: null, ultimoAvisoEm: null };
    const d = decidirVigia(r, deps.now);
    out.decisoes.push(d);
    if (d.acao !== 'avisar') continue;
    let enviado = false;
    let semEnvio: string | null = null;
    if (!deps.enviar) semEnvio = 'canal_interno_nao_configurado';
    else {
      try {
        enviado = await deps.enviar(mensagemRedeSemLeitura(d, r));
        if (!enviado) semEnvio = 'envio_recusado';
      } catch {
        semEnvio = 'falha_no_envio';
      }
    }
    try {
      // Registra sempre (inclusive sem canal): é o que impede novo aviso por 6 h e deixa o rastro na auditoria.
      await deps.registrar(d, enviado, semEnvio);
      out.registrados++;
    } catch {
      // auditoria é opcional
    }
    if (enviado) out.avisados.push(rede);
  }
  return out;
}

/** Linha do painel: situação do batimento de uma rede. */
export type SituacaoBatimento = 'em_dia' | 'sem_leitura' | 'pausado' | 'parado' | 'nunca';
export function situacaoBatimento(r: RedeBatimento, now: Date): SituacaoBatimento {
  if (!r.ultimoEm) return 'nunca';
  if (r.ultimoEstado === 'parado') return 'parado';
  const ref = r.ultimoOkEm ?? r.ultimoEm;
  if (minutos(now, ref) > HEARTBEAT_STALE_MIN) return 'sem_leitura';
  return r.ultimoEstado === 'pausado' ? 'pausado' : 'em_dia';
}
