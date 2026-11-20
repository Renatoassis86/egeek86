/**
 * R-112: preenche group_messages.tipo das ultimas 48 h a partir do tipo gravado no candidato (o do master na hora da proposta) ou, se ausente, de
 * classificarTipo(vertical, nome). LEVE: lotes de 200 ids, consulta por status (usa o indice status+created_at), pausa entre lotes e conferencia do
 * envio (enviadas nos ultimos 10 min) a cada 5 lotes; aborta se o envio cair a zero ou se um lote passar de 3 s. Idempotente (so tipo IS NULL).
 *   npx tsx --env-file=.env.local scripts/backfill-tipo-group-messages.ts [--apply] [--horas=48]
 * Games nao tem taxonomia: fica NULL (o medidor usa plat:<plataforma>).
 */
import { connect } from './_dup-shared';
import { classificarTipo } from '../src/lib/catalog/tipos-produto';

const APPLY = process.argv.includes('--apply');
const HORAS = Math.min(72, Number((process.argv.find((a) => a.startsWith('--horas=')) ?? '').slice(8)) || 48);
const HORAS_OUTROS = Math.min(HORAS, Number((process.argv.find((a) => a.startsWith('--horas-outros=')) ?? '').slice(15)) || 12); // so enviada precisa das 48 h (medidor/paridade); o resto, 12 h (menos escrita na tabela quente)
const STATUS = ['enviada', 'expirada', 'rejeitada', 'retida', 'erro', 'proposta_auto', 'aprovada', 'proposta', 'simulada'];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sql = connect();
  let feitas = 0, lotes = 0;
  const ultimosMs: number[] = [];
  try {
    await sql`SET statement_timeout = '8s'`;
    const envio = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM group_messages WHERE status='enviada' AND created_at >= now() - interval '6 hours' AND sent_at >= now() - interval '10 minutes'`)[0].n;
    const base = await envio();
    console.log(`envio base (10 min): ${base}; apply=${APPLY}; janela ${HORAS} h`);
    for (const st of STATUS) {
      for (;;) {
        const t0 = Date.now();
        const rows = await sql<{ id: string; vertical: string; tipo_c: string | null; nome_c: string | null }[]>`
          SELECT id::text, vertical::text, candidate->>'tipo' AS tipo_c, candidate->>'name' AS nome_c FROM group_messages
          WHERE status = ${st} AND created_at >= now() - ((CASE WHEN ${st} = 'enviada' THEN ${HORAS}::int ELSE ${HORAS_OUTROS}::int END) * interval '1 hour') AND tipo IS NULL AND vertical <> 'games' LIMIT 200`;
        if (!rows.length) break;
        const porTipo = new Map<string, string[]>();
        let semTipo = 0;
        for (const r of rows) {
          const t = r.tipo_c || (r.nome_c ? classificarTipo(r.vertical, r.nome_c) : null);
          if (!t) { semTipo++; continue; }
          (porTipo.get(t) ?? porTipo.set(t, []).get(t)!).push(r.id);
        }
        if (!APPLY) { console.log(`dry-run ${st}: ${rows.length} linhas sem tipo no 1o lote (${porTipo.size} tipos, ${semTipo} sem tipo possivel)`); break; }
        if (!porTipo.size) { console.log(`${st}: restante sem tipo possivel (${semTipo}); segue`); break; }
        const ids = [...porTipo.values()].flat();
        const tipos = [...porTipo.entries()].flatMap(([t, l]) => l.map(() => t));
        await sql`UPDATE group_messages g SET tipo = v.t FROM (SELECT unnest(${ids}::uuid[]) AS id, unnest(${tipos}::text[]) AS t) v WHERE g.id = v.id AND g.tipo IS NULL`;
        feitas += rows.length - semTipo; lotes++;
        const ms = Date.now() - t0; ultimosMs.push(ms);
        if (ms > 3000) { console.log(`lote lento (${ms} ms): abortando por seguranca`); return; }
        if (lotes % 5 === 0) {
          const e = await envio();
          console.log(`lote ${lotes}: feitas=${feitas} envio(10 min)=${e}`);
          if (base > 0 && e === 0) { console.log('envio caiu a zero: abortando'); return; }
        }
        if (semTipo === rows.length) break;
        await esperar(1200);
      }
    }
    console.log(`fim: lotes=${lotes} linhas preenchidas=${feitas} max lote=${Math.max(0, ...ultimosMs)} ms; envio(10 min) agora=${await envio()}`);
  } finally { await sql.end({ timeout: 5 }); }
}
main().catch((e) => { console.error(String((e as Error)?.message ?? e).slice(0, 300)); process.exit(1); });
