/**
 * Descoberta por promoção da Amazon: master novo APROVADO segue para oferta ativa (decisão do dono, 2026-11-14); usado e retrô continuam barrando; nada é gravado (dry-run).
 * Usa o banco só para LER (dedup/porteiro). Sem DATABASE_URL, pula. Rode: npx tsx --conditions=react-server --env-file=.env.local scripts/test-promo-descoberta-ativa.ts
 */
let falhas = 0;
const ok = (c: boolean, nome: string, extra?: unknown) => { if (c) console.log('ok  ', nome); else { falhas++; console.log('FALHA', nome, extra ?? ''); } };

async function main() {
  if (!process.env.DATABASE_URL) { console.log('INFO: sem DATABASE_URL, teste pulado'); return; }
  const { descobrirPelaPromocao } = await import('../src/server/collector/amazon-vitrine');
  const tag = 'teste-20';
  // Títulos inventados (nunca existem no banco): o dedup não acha master e o porteiro decide.
  const novoOk = { asin: 'B0TESTE0001', titulo: 'Zyxwv Quest Chronicles Remastered - Nintendo Switch 2', priceCents: 24990, listCents: 29990 };
  const usado = { asin: 'B0TESTE0002', titulo: 'Zyxwv Quest Chronicles Usado Seminovo - Nintendo Switch 2', priceCents: 12990, listCents: null };
  const retro = { asin: 'B0TESTE0003', titulo: 'Zyxwv Quest Chronicles - Xbox 360', priceCents: 9990, listCents: null };
  const acess = { asin: 'B0TESTE0004', titulo: 'Capa Protetora Zyxwv para Nintendo Switch 2', priceCents: 4990, listCents: null };

  const st = await descobrirPelaPromocao([novoOk, usado, retro, acess], { tag, apply: false });
  ok(st.cartoes === 4, 'lê os 4 cards', st.cartoes);
  ok(st.masters_novos === 1, 'só o jogo novo vira master novo', st);
  ok((st.novos_ativos ?? 0) === 1, 'master novo aprovado segue para oferta ATIVA (não rascunho)', st);
  ok(st.rascunhos_novos === 0, 'nenhum rascunho para o aprovado', st);
  ok(st.previstos.length === 1 && /ativa/.test(st.previstos[0]!.destino), 'destino previsto: ativa', st.previstos);
  const motivos = Object.keys(st.descartados).join(',');
  ok(/condicao_ou_acessorio/.test(motivos), 'usado e acessório barram (condicao_ou_acessorio)', st.descartados);
  ok(Object.values(st.descartados).reduce((a, b) => a + b, 0) === 3, 'usado, retrô (Xbox 360) e acessório: os 3 são barrados e nenhum vira master', st.descartados);
  ok(st.erros === 0, 'sem erros', st.erros);

  // R2-1 (dono, 2026-11-14): o caminho geral da vitrine também deixa de manter master novo 'sempre em revisão': sem a opção o padrão é ATIVAR.
  // Só `ativarNovoAprovado: false` volta ao comportamento antigo (rascunho).
  const { ingestAmazonVitrine, PROMO_DESCOBERTA_QUERY, linhaDaPromocao } = await import('../src/server/collector/amazon-vitrine');
  const geral = await ingestAmazonVitrine([linhaDaPromocao([novoOk])], { tag, apply: false, consultaFixa: PROMO_DESCOBERTA_QUERY });
  ok((geral.stats.novos_ativos ?? 0) === 1 && geral.stats.rascunhos_novos === 0, 'R2-1: sem a opção o master novo aprovado também segue para oferta ativa', geral.stats);
  const antigo = await ingestAmazonVitrine([linhaDaPromocao([novoOk])], { tag, apply: false, consultaFixa: PROMO_DESCOBERTA_QUERY, ativarNovoAprovado: false });
  ok((antigo.stats.novos_ativos ?? 0) === 0 && antigo.stats.rascunhos_novos === 1, 'ativarNovoAprovado:false volta ao rascunho (comportamento antigo)', antigo.stats);
  if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
  console.log('\ntudo ok');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
