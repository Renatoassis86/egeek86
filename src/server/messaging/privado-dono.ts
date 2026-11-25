import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classificarTipo } from '@/lib/catalog/tipos-produto';
import { sendTelegramMessage } from '@/server/notifications/send-telegram';

/**
 * Chat PRIVADO do dono (TELEGRAM_ALERT_CHAT_ID) — decisão do dono 2026-11-25: as impressoras SAEM do privado; ele só recebe
 * (1) filamentos, (2) jogos de Nintendo Switch bem abaixo da média, (3) consoles bem abaixo da média.
 * Reaproveita a mensagem JÁ ENVIADA ao canal (passou por link de afiliado, preço fresco, diagnóstico): o privado só espelha, nunca compõe preço.
 * Dedup: collector_runs job 'privado-dono' (meta.gm = id da mensagem). Janela: 25 min. "Bem abaixo da média" = >= PRIVADO_DONO_MIN_PCT (padrão 15) abaixo da média.
 * Flag PRIVADO_DONO=off desliga. Nunca lança; nunca imprime token nem chat id.
 */
const JOB = 'privado-dono';
const MAX_POR_CICLO = 5;

export interface CandidatoPrivado { id: string; vertical: string; nome: string; tipoProduto: string | null; plataforma: string | null; preco: number; media: number | null; texto: string }
export type MotivoPrivado = 'filamento' | 'jogo_switch' | 'console';

export function motivoPrivado(c: Pick<CandidatoPrivado, 'vertical' | 'nome' | 'tipoProduto' | 'plataforma' | 'preco' | 'media'>, minPct = 15): MotivoPrivado | null {
  if (c.vertical === 'impressao3d') return classificarTipo('impressao3d', c.nome) === 'filamentos' ? 'filamento' : null;
  if (c.vertical !== 'games') return null;
  const abaixo = c.media && c.media > 0 && c.preco > 0 ? ((c.media - c.preco) / c.media) * 100 : 0;
  if (abaixo < minPct) return null;
  if (c.tipoProduto === 'console') return 'console';
  if (c.tipoProduto === 'game' && (c.plataforma === 'switch_1' || c.plataforma === 'switch_2')) return 'jogo_switch';
  return null;
}

export async function espelharNoPrivado(now: Date = new Date()): Promise<{ ligado: boolean; enviados: number; motivos: MotivoPrivado[] }> {
  const vazio = { ligado: false, enviados: 0, motivos: [] as MotivoPrivado[] };
  if ((process.env.PRIVADO_DONO ?? '').toLowerCase() === 'off') return vazio;
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  if (!chat || !process.env.TELEGRAM_BOT_TOKEN) return vazio;
  try {
    const minPct = Number(process.env.PRIVADO_DONO_MIN_PCT) > 0 ? Number(process.env.PRIVADO_DONO_MIN_PCT) : 15;
    const rows = (await db.execute(sql`
      SELECT gm.id::text AS id, m.vertical, m.name AS nome, m.product_type::text AS tipo_produto, m.game_platform_gen::text AS plataforma,
             gm.price_cents_detected::text AS preco, gm.avg_cents::text AS media, gm.text_body AS texto
      FROM group_messages gm JOIN master_products m ON m.id = gm.master_product_id
      WHERE gm.channel = 'tg' AND gm.status = 'enviada' AND gm.sent_at > ${new Date(now.getTime() - 25 * 60_000).toISOString()}::timestamptz
        AND m.vertical IN ('games', 'impressao3d')
        AND NOT EXISTS (SELECT 1 FROM collector_runs r WHERE r.job = ${JOB} AND r.meta->>'gm' = gm.id::text AND r.started_at > now() - interval '2 days')
      ORDER BY gm.sent_at LIMIT 60`)) as unknown as { id: string; vertical: string; nome: string; tipo_produto: string | null; plataforma: string | null; preco: string; media: string | null; texto: string | null }[];
    const out = { ligado: true, enviados: 0, motivos: [] as MotivoPrivado[] };
    for (const r of rows) {
      if (out.enviados >= MAX_POR_CICLO) break;
      const motivo = motivoPrivado({ vertical: r.vertical, nome: r.nome, tipoProduto: r.tipo_produto, plataforma: r.plataforma, preco: Number(r.preco), media: r.media ? Number(r.media) : null }, minPct);
      if (!motivo || !r.texto) continue;
      const res = await sendTelegramMessage(chat, r.texto);
      if (res.ok) {
        out.enviados++; out.motivos.push(motivo);
        await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta) VALUES (${JOB}, 'telegram', now(), now(), 0, 'ok', ${JSON.stringify({ gm: r.id, motivo })}::jsonb)`);
      }
    }
    return out;
  } catch (e) {
    console.error('[privado-dono] falhou:', e instanceof Error ? e.message : e);
    return vazio;
  }
}
