/**
 * COLETOR DE PISTAS DE CUPOM DE PLATAFORMA (R-79). Atrás da flag CUPOM_PISTAS_COMUNIDADE (padrão DESLIGADA: sai sem fazer nada).
 * Só a prévia pública t.me/s/<canal> dos canais da Fase 1; no máximo 1 requisição por canal a cada 10 min (estado em cupom_pista_fonte);
 * User-Agent identificado; 429/403 pausa 6 h; erro/rede recua. Não segue links, não entra em grupo, não guarda texto, foto nem link alheio.
 * Escreve só em cupom_candidato: nunca toca preço, média, selo nem mensagem. Uma execução = uma passada (agendar de 10 em 10 min ou mais).
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/coletar-pistas-cupom.ts [--dry]   (--dry: lê e mostra, não grava candidatos)
 */
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { agregar, CANAIS_FASE1, extrairDaPrevia, pausaAposStatus, pistasLigadas, podeBuscarFonte, urlPrevia } from '../src/lib/coupons/candidato';
import { expirarVelhos, gravarAgregados } from '../src/server/coupons/candidatos';

const DRY = process.argv.includes('--dry');
const UA = 'egeek86-pistas/1.0 (leitura publica, 1 req por canal a cada 10 min)';

(async () => {
  if (!pistasLigadas()) { console.log('CUPOM_PISTAS_COMUNIDADE desligada: nada a fazer.'); process.exit(0); }
  const now = new Date();
  const todos = [];
  for (const canal of CANAIS_FASE1) {
    const url = urlPrevia(canal)!;
    const [f] = (await db.execute(sql`SELECT ultimo_acesso_em AS u, pausada_ate AS p, falhas_seguidas AS n FROM cupom_pista_fonte WHERE fonte = ${canal}`)) as unknown as { u: string | null; p: string | null; n: number }[];
    if (!podeBuscarFonte({ ultimoAcessoEm: f?.u ? new Date(f.u) : null, pausadaAte: f?.p ? new Date(f.p) : null }, new Date())) { console.log(`${canal}: aguardando intervalo/pausa`); continue; }
    let status = 0;
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      status = r.status;
      const html = r.ok ? await r.text() : '';
      const cands = html ? extrairDaPrevia(html, canal) : [];
      const pausa = pausaAposStatus(status, new Date());
      await db.execute(sql`INSERT INTO cupom_pista_fonte (fonte, ultimo_acesso_em, ultimo_status, pausada_ate, falhas_seguidas, posts_lidos, codigos_extraidos)
        VALUES (${canal}, now(), ${status}, ${pausa ? pausa.toISOString() : null}::timestamptz, ${r.ok ? 0 : 1}, ${(html.match(/tgme_widget_message_wrap/g) ?? []).length}, ${cands.length})
        ON CONFLICT (fonte) DO UPDATE SET ultimo_acesso_em = now(), ultimo_status = EXCLUDED.ultimo_status, pausada_ate = EXCLUDED.pausada_ate,
          falhas_seguidas = CASE WHEN ${r.ok} THEN 0 ELSE cupom_pista_fonte.falhas_seguidas + 1 END, posts_lidos = EXCLUDED.posts_lidos, codigos_extraidos = EXCLUDED.codigos_extraidos`);
      console.log(`${canal}: HTTP ${status}, ${cands.length} candidatos extraídos`);
      todos.push(...cands);
    } catch (e) {
      await db.execute(sql`INSERT INTO cupom_pista_fonte (fonte, ultimo_acesso_em, ultimo_status, falhas_seguidas) VALUES (${canal}, now(), 0, 1)
        ON CONFLICT (fonte) DO UPDATE SET ultimo_acesso_em = now(), ultimo_status = 0, falhas_seguidas = cupom_pista_fonte.falhas_seguidas + 1`);
      console.error(`${canal}: falha de rede (${e instanceof Error ? e.name : 'erro'})`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  const ags = agregar(todos);
  console.log(`${ags.length} candidatos únicos (rede+código)`);
  if (DRY) { for (const a of ags) console.log(`  [dry] ${a.rede} ${a.codigo} ${a.valorTipo ?? '?'} ${a.valorNum ?? '?'} min=${a.minimoCents ?? '?'} lim=${a.limiteCents ?? '?'} escopo=${a.escopoDito} fontes=${a.fontes.join('+')}${a.esgotadoVistoEm ? ' ESGOTADO' : ''}`); process.exit(0); }
  console.log('gravado:', JSON.stringify(await gravarAgregados(ags)), 'expirados:', await expirarVelhos(now));
  process.exit(0);
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
