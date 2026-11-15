/**
 * #117: apaga do canal Impressao 3D SOMENTE os paineis que o proprio painel postou (ids em collector_runs, job painel-impressoras-canal).
 * Nunca toca em mensagens do fluxo normal. Nao imprime token nem ids. Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/apagar-paineis-canal-117.ts [--apply]
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getStoreByVertical, chatForStore } from '@/server/stores';

async function main() {
  const apply = process.argv.includes('--apply');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const st = await getStoreByVertical('impressao3d', { fresh: true });
  const chat = st ? chatForStore(st) : undefined;
  const rows = (await db.execute<{ meta: { paineis?: Record<string, { message_id: string }>; lista?: string; ids?: (string | null)[] } | null }>(sql`
    SELECT meta FROM collector_runs WHERE job = 'painel-impressoras-canal' ORDER BY started_at DESC LIMIT 1`)) as unknown as { meta: { paineis?: Record<string, { message_id: string }>; ids?: (string | null)[] } | null }[];
  const m = rows[0]?.meta;
  const ids = [...Object.values(m?.paineis ?? {}).map((x) => x.message_id), ...((m?.ids ?? []).filter(Boolean) as string[])];
  console.log(`painéis do canal registrados: ${ids.length}${apply ? '' : ' (dry-run)'}`);
  if (!apply || !token || !chat) { process.exit(0); }
  let apagados = 0, falhas = 0;
  const restantes: string[] = [];
  for (const id of ids) {
    for (let t = 0; t < 3; t++) {
      const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, message_id: Number(id) }) });
      const b = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; parameters?: { retry_after?: number } };
      if (b.ok || /not found/i.test(b.description ?? '')) { apagados++; break; }
      if (res.status === 429) { await new Promise((r) => setTimeout(r, ((b.parameters?.retry_after ?? 3) + 1) * 1000)); continue; }
      falhas++; restantes.push(id); break;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  await db.execute(sql`INSERT INTO collector_runs (job, network, started_at, finished_at, duration_ms, status, meta)
    VALUES ('painel-impressoras-canal', 'telegram', now(), now(), 0, 'ok', ${JSON.stringify({ tipo: 'canal_desativado', paineis: {}, rodada: { inicio: new Date().toISOString(), cursor: 0, aberta: false }, apagados, falhas, restantes })}::jsonb)`);
  console.log({ apagados, falhas });
  process.exit(0);
}
void main();
export {};
