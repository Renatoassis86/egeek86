/**
 * Medidor de VARIEDADE do envio (R-110). SOMENTE LEITURA, leve (uma consulta, janela curta, LIMIT, statement_timeout).
 * Lista por loja: envios, tipos distintos, participacao de cada tipo, e envios/h. O tipo vem de candidate->>'tipo'
 * gravado na proposta; se ausente, cai no tipo do master (join por PK, so dos ids da janela).
 *   npx tsx --env-file=.env.local scripts/medir-variedade-envio.ts [horas=1]
 * Nunca imprime credenciais.
 */
import { connect } from './_dup-shared';

export interface LinhaEnvio { vertical: string; tipo: string | null }
export function resumoVariedade(rows: LinhaEnvio[], horas: number) {
  const por = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = por.get(r.vertical) ?? por.set(r.vertical, new Map()).get(r.vertical)!;
    const t = r.tipo ?? '(sem tipo)';
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...por.entries()].map(([loja, m]) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      loja, envios: total, por_hora: +(total / horas).toFixed(1), tipos_distintos: m.size,
      maior_tipo: `${top[0][0]} ${Math.round((top[0][1] / total) * 100)}%`,
      tipos: top.map(([t, n]) => `${t}:${n}`).join(' '),
    };
  }).sort((a, b) => b.envios - a.envios);
}

async function main() {
  const horas = Math.max(0.25, Math.min(6, Number(process.argv[2]) || 1));
  const sql = connect();
  try {
    await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '15s'`;
      const rows = await tx<LinhaEnvio[]>`
        SELECT vertical::text AS vertical, COALESCE(candidate ->> 'tipo', 'plat:' || (candidate ->> 'platformLabel')) AS tipo
        FROM group_messages
        WHERE status = 'enviada' AND sent_at >= now() - (${horas}::float * interval '1 hour')
        LIMIT 3000`;
      console.log(`== Variedade de envio, ultimas ${horas} h (${rows.length} envios)`);
      console.table(resumoVariedade([...rows], horas));
    });
  } finally { await sql.end({ timeout: 5 }); }
}
if (process.argv[1]?.includes('medir-variedade-envio')) main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
