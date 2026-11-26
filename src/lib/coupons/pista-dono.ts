// PURO (sem 'server-only', sem banco). R-125: pista de cupom informada pelo dono, e lista de fontes de terceiros que a coleta NUNCA le sozinha.
import { normalizarCodigo, type Candidato, type RedeCandidato } from './candidato';

/** Fonte gravada em cupom_candidato.fontes para tudo que o dono digita. Nunca o nome do site onde ele viu. */
export const FONTE_DONO = 'dono';

/** Sites de comunidade/terceiros que NAO podem ser lidos por rotina automatica (termos de uso; R-125). A pista chega so pela mao do dono. */
export const FONTES_SEM_COLETA_AUTOMATICA = ['pelando.com.br', 'api-web.pelando.com.br', 'pelando.promo'] as const;

const REDES: readonly RedeCandidato[] = ['mercado-livre', 'shopee', 'amazon', 'magalu', 'outra'];

export type EntradaPistaDono = { codigo: string; rede?: string | null; valorPercentual?: number | null; minimoReais?: number | null; limiteReais?: number | null; restrito?: boolean };

/** Monta o candidato de uma pista do dono. Devolve null se o codigo ou a rede nao servem. Nada do texto/foto/link de terceiros entra. */
export function candidatoDoDono(e: EntradaPistaDono, now: Date): Candidato | null {
  const codigo = normalizarCodigo(e.codigo);
  if (!codigo) return null;
  const rede = (e.rede ?? 'mercado-livre') as RedeCandidato;
  if (!REDES.includes(rede)) return null;
  const pct = e.valorPercentual != null && Number.isFinite(e.valorPercentual) && e.valorPercentual > 0 && e.valorPercentual <= 100 ? e.valorPercentual : null;
  const cents = (r: number | null | undefined) => (r != null && Number.isFinite(r) && r > 0 ? Math.round(r * 100) : null);
  return {
    rede, codigo, valorTipo: pct != null ? 'percentual' : null, valorNum: pct, minimoCents: cents(e.minimoReais), limiteCents: cents(e.limiteReais),
    escopoDito: 'desconhecido', restrito: !!e.restrito, esgotado: false, fonte: FONTE_DONO, vistoEm: now,
  };
}

/** True quando o texto (url, host, nome de fonte) aponta para um site que a coleta automatica nao pode ler. */
export function fonteSemColetaAutomatica(valor: string): boolean {
  const v = String(valor ?? '').toLowerCase();
  return FONTES_SEM_COLETA_AUTOMATICA.some((f) => v.includes(f));
}
