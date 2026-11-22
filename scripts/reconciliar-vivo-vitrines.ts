/**
 * R-118: passada leve de verdade viva nos candidatos das 5 vitrines de games (30 mais baratos de cada plataforma, ja filtrados pelas 3 camadas de jogo novo).
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/reconciliar-vivo-vitrines.ts
 * Para cada candidato: Mercado Livre = API oficial (ativo/estoque/preco; grava `oferta_verificacao_viva`); Shopee = so vale leitura de PAGINA recente (sem ela, nao verificavel);
 * Amazon = coleta (R-81). Imprime por plataforma e por rede: verificados, preco vivo diferente de mais de 2%, esgotados, nao verificaveis. Nao expira nada sozinho (a Shopee so expira pela rota
 * /api/ingest/disponibilidade-viva, com leitura de pagina). Consultas leves; ML limitado a 30 candidatos por plataforma.
 */
(async () => {
  const { carregarJogosVitrine } = await import('../src/server/messaging/vitrine-games');
  const { VITRINE_PLATAFORMAS, escolherMenores, VITRINE_TETO_CENTAVOS } = await import('../src/lib/messaging/vitrine-games');
  const { prepararVerificacaoViva } = await import('../src/server/messaging/verdade-viva');
  const { db } = await import('../src/lib/db');
  const { sql } = await import('drizzle-orm');
  const c = await carregarJogosVitrine();
  const por = VITRINE_PLATAFORMAS.map((p) => ({ p, lista: escolherMenores(c.jogos, p.gens, 30) }));
  const todos = por.flatMap((x) => x.lista);
  const rede = new Map<string, string>();
  const ids = todos.map((j) => j.ofertaId).filter((x): x is string => !!x);
  for (const r of (await db.execute(sql`SELECT o.id::text AS id, n.slug AS rede FROM affiliate_offers o JOIN affiliate_networks n ON n.id = o.network_id WHERE o.id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`)) as unknown as { id: string; rede: string }[]) rede.set(r.id, r.rede);
  const verificar = await prepararVerificacaoViva(todos, VITRINE_TETO_CENTAVOS);
  const out: Record<string, Record<string, number>> = {};
  const amostra: string[] = [];
  for (const { p, lista } of por) {
    for (let i = 0; i < lista.length; i += 5) {
      const lote = lista.slice(i, i + 5);
      const rs = await Promise.all(lote.map((j) => verificar(j)));
      lote.forEach((j, k) => {
        const r = rs[k]!;
        const chave = `${p.key}/${rede.get(j.ofertaId ?? '') ?? '?'}`;
        const o = (out[chave] ??= { candidatos: 0, verificado: 0, preco_vivo_diferente: 0, esgotado: 0, nao_verificavel: 0, leitura_velha: 0, outros: 0 });
        o.candidatos++;
        if (r.ok) { o.verificado++; if (r.usouVivo) { o.preco_vivo_diferente++; amostra.push(`${chave} banco ${j.precoCentavos} vivo ${r.precoCents}`); } }
        else if (r.motivo === 'esgotado' || r.motivo === 'nao_verificavel' || r.motivo === 'leitura_velha') o[r.motivo]++;
        else o.outros++;
      });
    }
  }
  console.log(JSON.stringify(out, null, 1));
  console.log('divergencias de preco > 2%:', amostra.slice(0, 15));
  process.exit(0);
})();
