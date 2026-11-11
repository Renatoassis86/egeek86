import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { AGULHA } from '@/lib/coupons/agulha';

/**
 * BAIXA AUTOMÁTICA (ciclo fechado, sem passo manual). Roda a cada ciclo do Agente de Cupons (~5 min, dentro do cron group-messages).
 * Antes, o inventário só era baixado quando o Chrome enviava um lote; se o Chrome parasse, cupom vencido seguia "verificado" no
 * inventário. Agora o servidor baixa sozinho:
 *   1. prazo lido vencido -> 'vencido' (motivo prazo_lido_vencido);
 *   2. cupom de lista 'verificado' sem NENHUMA conferência há mais de LIST_ALIVE_MIN (12 h) -> 'nao_verificado' (motivo sem_conferencia_12h).
 *      Reversível: a próxima leitura da lista o verifica de novo pela regra normal (decideState). Não afeta o que já é bloqueado nas
 *      mensagens (a janela de mensagem é 120 min, bem menor).
 * Códigos do dono (manual_dono) não são tocados aqui: quem decide é o dono (encerrar/confirmar) e o guardião já os fecha por prazo.
 * O aviso "Cupom encerrado" nos grupos continua com o guardião (cupons já divulgados), que enxerga as duas baixas pelo estado/prazo.
 */
export interface BaixaResultado {
  vencidosPorPrazo: number;
  rebaixadosSemConferencia: number;
}

export async function baixarCuponsParados(now: Date = new Date(), dryRun = false): Promise<BaixaResultado> {
  const nowIso = now.toISOString();
  if (dryRun) {
    const a = (await db.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM coupon_items WHERE source_kind <> 'manual_dono' AND state IN ('nao_verificado', 'verificado')
        AND valid_until IS NOT NULL AND valid_until <= ${nowIso}::timestamptz`)) as unknown as { n: string }[];
    const b = (await db.execute<{ n: string }>(sql`
      SELECT count(*)::text AS n FROM coupon_items WHERE source_kind <> 'manual_dono' AND state = 'verificado'
        AND last_seen_at < ${nowIso}::timestamptz - make_interval(mins => ${AGULHA.LIST_ALIVE_MIN}::int)`)) as unknown as { n: string }[];
    return { vencidosPorPrazo: Number(a[0]?.n ?? 0), rebaixadosSemConferencia: Number(b[0]?.n ?? 0) };
  }
  const venc = (await db.execute<{ id: string }>(sql`
    UPDATE coupon_items SET state = 'vencido', state_reason = 'prazo_lido_vencido', verified_at = NULL, updated_at = now()
    WHERE source_kind <> 'manual_dono' AND state IN ('nao_verificado', 'verificado') AND valid_until IS NOT NULL AND valid_until <= ${nowIso}::timestamptz
    RETURNING id::text AS id`)) as unknown as { id: string }[];
  const reb = (await db.execute<{ id: string }>(sql`
    UPDATE coupon_items SET state = 'nao_verificado', state_reason = 'sem_conferencia_12h', verified_at = NULL, updated_at = now()
    WHERE source_kind <> 'manual_dono' AND state = 'verificado' AND last_seen_at < ${nowIso}::timestamptz - make_interval(mins => ${AGULHA.LIST_ALIVE_MIN}::int)
    RETURNING id::text AS id`)) as unknown as { id: string }[];
  return { vencidosPorPrazo: venc.length, rebaixadosSemConferencia: reb.length };
}
