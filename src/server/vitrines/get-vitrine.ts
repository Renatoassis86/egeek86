import 'server-only';
import { createPersistedQuery } from '@/lib/cache/server-cache';
import { VITRINE_REGRAS, chaveValida, selecionar, todasAsChaves, type VitrineChave, type VitrineResultado } from '@/lib/vitrines';
import { contextoDoPool, lerPoolVitrines } from './pool';
import { carregarEventos, montarMudancas } from './mudancas';
import { carregarPlus } from './plus';

/**
 * LOADER DAS VITRINES (checklist #7). `getVitrine(chave)` é uma consulta PERSISTIDA (showcase_snapshot) com a regra R-49:
 *  - lê o ÚLTIMO resultado bom (até 24 h de idade) e serve na hora; vencido (10 min) uma instância recalcula por trás;
 *  - sem nenhum resultado, espera no máximo 4 s (teto de página) e falha: quem chama esconde o bloco, nunca mostra zero;
 *  - o recálculo usa o pool único (1 leitura em lote) e a estatística pré-calculada; nenhuma varredura de cotação.
 * Nada é inventado: sem dado suficiente, `visivel: false`.
 */

const MOTIVO_POUCOS = `menos de ${VITRINE_REGRAS.MIN_ITENS} itens elegíveis`;

export async function calcularVitrine(chave: VitrineChave): Promise<VitrineResultado> {
  const calculadoEm = new Date().toISOString();
  const vazia = (candidatos: number, elegiveis: number, motivoOculta: string): VitrineResultado => ({ chave, itens: [], visivel: false, calculadoEm, funil: { candidatos, elegiveis }, motivoOculta });
  if (chave === 'colecionaveis') {
    // Não há tipo "colecionável" na cartela pública (merchandise está escondido por regra). Sem dado, o bloco some; nada é improvisado.
    return vazia(0, 0, 'sem fonte de dados: colecionável não é tipo público do catálogo');
  }
  if (chave === 'plus') {
    const { itens, elegiveis } = await carregarPlus();
    return itens.length ? { chave, itens, visivel: true, calculadoEm, funil: { candidatos: elegiveis, elegiveis }, motivoOculta: null } : vazia(elegiveis, elegiveis, MOTIVO_POUCOS);
  }
  const pool = await lerPoolVitrines();
  const ctx = contextoDoPool(pool, new Date());
  if (chave === 'mudancas') {
    const eventos = await carregarEventos();
    const m = montarMudancas(eventos, pool.candidatos, ctx);
    return m.itens.length ? { chave, itens: m.itens, visivel: true, calculadoEm, funil: { candidatos: eventos.length, elegiveis: m.elegiveis }, motivoOculta: null } : vazia(eventos.length, m.elegiveis, MOTIVO_POUCOS);
  }
  const s = selecionar(chave, pool.candidatos, ctx);
  return s.itens.length ? { chave, itens: s.itens, visivel: true, calculadoEm, funil: { candidatos: pool.candidatos.length, elegiveis: s.elegiveis }, motivoOculta: null } : vazia(pool.candidatos.length, s.elegiveis, MOTIVO_POUCOS);
}

export const getVitrineCached = createPersistedQuery(async (chave: VitrineChave) => calcularVitrine(chave), ['vitrine-v1'], {
  revalidate: 120,
  maxStaleSeconds: 24 * 3600,
  coldTimeoutSeconds: 4,
  persist: { maxAgeSeconds: 600, maxStaleSeconds: 24 * 3600 },
});

function oculta(chave: VitrineChave, motivo: string): VitrineResultado {
  return { chave, itens: [], visivel: false, calculadoEm: new Date().toISOString(), funil: { candidatos: 0, elegiveis: 0 }, motivoOculta: motivo };
}

/**
 * Lê uma vitrine. Falha de leitura (sem snapshot e banco lento) devolve vitrine OCULTA com o motivo, nunca erro nem zero inventado.
 * Chave inválida também volta oculta.
 */
export async function getVitrine(chave: VitrineChave): Promise<VitrineResultado> {
  if (!chaveValida(chave)) return oculta(chave, 'chave inválida');
  try {
    return await getVitrineCached(chave);
  } catch (e) {
    console.error(`[vitrine] ${chave} indisponível:`, e instanceof Error ? e.message : e);
    return oculta(chave, 'indisponível (leitura lenta e sem resultado anterior)');
  }
}

/** Várias vitrines em paralelo (cada uma com seu teto). */
export async function getVitrines(chaves: readonly VitrineChave[]): Promise<Record<string, VitrineResultado>> {
  const rs = await Promise.all(chaves.map((c) => getVitrine(c)));
  return Object.fromEntries(rs.map((r) => [r.chave, r]));
}

/**
 * Para o cron de pré-aquecimento (`/api/cron/refresh-snapshots`, fora desta pasta): recalcula e grava as 18 vitrines em sequência, com
 * o pool lido UMA vez (cache em memória de 2 min). Falha de uma vitrine não impede as demais. Devolve as que falharam.
 */
export async function atualizarTodasVitrines(chaves: readonly VitrineChave[] = todasAsChaves()): Promise<{ ok: number; falhas: string[] }> {
  const falhas: string[] = [];
  for (const c of chaves) {
    try {
      await getVitrineCached.refresh(c);
    } catch (e) {
      falhas.push(`${c}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: chaves.length - falhas.length, falhas };
}
