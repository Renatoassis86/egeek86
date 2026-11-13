import 'server-only';
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getCurrentProfile } from '@/lib/auth/require-admin';
import { isAdminRole } from '@/components/layout/shell-viewer';
import { COOKIE_VISITANTE_HOME, escolherVersaoHome, parsePercentual } from '@/lib/redesenho-home';

/**
 * Percentual da nova home, lido em TEMPO DE EXECUCAO (sem deploy).
 * Fonte 1: linha `redesenho_home` de `feature_flags` (enabled + rollout_percentage). Editar a linha liga, desliga ou
 * muda o percentual em ate 30 s (cache por instancia). Linha com enabled=false = 0%.
 * Fonte 2 (so se a linha nao existe): env REDESENHO_HOME. Na Vercel, mudar env so vale apos novo deploy.
 * Erro ou demora acima de 1,5 s: mantem o ultimo valor bom em memoria ou 0 (home atual). Nunca bloqueia a pagina.
 */
const CHAVE = 'redesenho_home';
const TTL_MS = 30_000;
const TETO_LEITURA_MS = 1_500;
let cache: { at: number; valor: number } | null = null;

async function lerLinha(): Promise<number | null> {
  const linhas = await db.execute<{ enabled: boolean; rollout_percentage: number | null }>(
    sql`SELECT enabled, rollout_percentage FROM feature_flags WHERE key = ${CHAVE} LIMIT 1`
  );
  const l = linhas[0];
  if (!l) return null;
  return l.enabled ? parsePercentual(l.rollout_percentage ?? 0) : 0;
}

export async function getPercentualRedesenhoHome(): Promise<number> {
  const agora = Date.now();
  if (cache && agora - cache.at < TTL_MS) return cache.valor;
  try {
    const linha = await Promise.race([
      lerLinha(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('leitura da flag estourou o teto')), TETO_LEITURA_MS)),
    ]);
    const valor = linha ?? parsePercentual(process.env.REDESENHO_HOME);
    cache = { at: agora, valor };
    return valor;
  } catch (e) {
    console.error('[redesenho-home] falha ao ler a flag, mantendo o ultimo valor', e);
    // mantem o ultimo bom por mais um ciclo curto para nao martelar o banco; sem valor bom, 0
    cache = { at: agora, valor: cache?.valor ?? 0 };
    return cache.valor;
  }
}

/** Qual home renderizar nesta requisicao. So consulta a sessao quando ha ?v= (evita leitura de auth extra). */
export async function resolverVersaoHome(v: string | string[] | undefined): Promise<1 | 2> {
  const forcar = typeof v === 'string' ? v : null;
  let admin = false;
  if (forcar === '1' || forcar === '2') {
    const perfil = await getCurrentProfile();
    admin = isAdminRole(perfil?.role);
  }
  const percentual = await getPercentualRedesenhoHome();
  const visitanteId = (await cookies()).get(COOKIE_VISITANTE_HOME)?.value ?? null;
  return escolherVersaoHome({ percentual, visitanteId, forcar, admin });
}
