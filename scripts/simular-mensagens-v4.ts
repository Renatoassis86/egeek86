/**
 * SIMULAÇÃO EM SECO da mensagem v4 (R-114). NÃO envia nada, NÃO grava nada: lê poucos produtos que acabam de sair em cada loja
 * (consulta leve em group_messages), roda o detector SÓ para eles e imprime o texto final do Telegram por estado e por loja.
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/simular-mensagens-v4.ts [saida.md]
 * Sem argumento, imprime no terminal. Nunca imprime token nem connection string.
 */
import fs from 'node:fs';
import { connect } from './_dup-shared';

const LOJAS = ['games', 'tecnologia', 'eletroeletronicos', 'livros', 'eletrodomesticos', 'esporte', 'impressao3d', 'beleza', 'brinquedos'];
const POR_CLASSE = 4;

(async () => {
  const sql = connect();
  const ids: string[] = [];
  try {
    await sql`SET statement_timeout = 8000`;
    for (const v of LOJAS) {
      // Três classes por loja (janela de 12 h, consulta leve): produto novo, produto já acompanhado (achado) e mensagem de preço (G2/OK/T).
      const classes = [
        sql`trigger = 'AC' AND text_body LIKE '%Novo no monitoramento%'`,
        sql`trigger = 'AC' AND text_body NOT LIKE '%Novo no monitoramento%'`,
        sql`trigger IN ('G2','OK1','OK2','T2')`,
      ];
      for (const [k, cl] of classes.entries()) {
        // Mensagem de preço (G2/OK/T) é rara e é onde nasce o Diagnóstico: janela maior e mais produtos.
        const r = k === 2
          ? await sql`SELECT DISTINCT master_product_id::text AS id FROM (SELECT master_product_id FROM group_messages WHERE channel='tg' AND status='enviada' AND vertical=${v} AND sent_at > now() - interval '48 hours' AND master_product_id IS NOT NULL AND ${cl} ORDER BY sent_at DESC LIMIT 60) x LIMIT 18`
          : await sql`SELECT master_product_id::text AS id FROM group_messages WHERE channel='tg' AND status='enviada' AND vertical=${v} AND sent_at > now() - interval '12 hours' AND master_product_id IS NOT NULL AND ${cl} ORDER BY sent_at DESC LIMIT ${POR_CLASSE}`;
        ids.push(...r.map((x) => String(x.id)));
      }
    }
  } finally {
    await sql.end();
  }
  const { detectGroupCandidates } = await import('../src/server/messaging/group-offers');
  const det = await detectGroupCandidates({ productIds: [...new Set(ids)], verticals: LOJAS, history: [], includePlatform: false, cupom: false, neutro: true, achado: true, maxAgeMin: 600, amazonMaxAgeMin: 600 });
  const estadoDe = (t: string) => (/<b>Novo no monitoramento<\/b>/.test(t) ? 'Novo no monitoramento' : /<b>Diagnóstico de compra<\/b>/.test(t) ? 'Diagnóstico de compra' : /<b>Em monitoramento<\/b>/.test(t) ? 'Em monitoramento' : 'outro');
  const out: string[] = [];
  const contagem: Record<string, number> = {};
  const usados = new Map<string, number>();
  for (const c of det.candidates) {
    if (!c.sendable) continue;
    const t = c.texts.telegram;
    const est = estadoDe(t);
    contagem[est] = (contagem[est] ?? 0) + 1;
    if (est === 'outro') continue;
    const k = `${c.vertical}|${est}`;
    const n = usados.get(k) ?? 0;
    if (n >= 2) continue;
    usados.set(k, n + 1);
    out.push(`### ${c.vertical} · ${est} · ${c.trigger} · ${c.networkName}\n\n\`\`\`\n${t.replace(/<\/?(b|i|code|blockquote)>/g, '').replace(/<a href="([^"]*)">([^<]*)<\/a>/g, '$2 [$1]').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')}\n\`\`\`\n\nComprimento visível: ${t.replace(/<[^>]+>/g, '').length} caracteres.\n`);
  }
  out.sort();
  const head = `# Mensagens v4: amostras em seco (2026-11-22)\n\nSimulação SEM envio: candidatos reais gerados agora pelo detector para produtos que saíram nas últimas 3 h em cada loja. Os textos estão sem as marcas HTML do Telegram (negrito/itálico), para leitura; o HTML real usa só \`<b>\` e \`<i>\`. Contagem de candidatos enviáveis por estado nesta simulação: ${JSON.stringify(contagem)}.\n\n`;
  const body = head + out.join('\n');
  if (process.argv[2]) fs.writeFileSync(process.argv[2], body, 'utf8');
  else console.log(body);
  console.log(JSON.stringify({ candidatos: det.candidates.length, enviaveis: det.candidates.filter((c) => c.sendable).length, contagem }));
  process.exit(0);
})().catch((e) => { console.error(String((e as Error).message).slice(0, 300)); process.exit(1); });
