/**
 * VARREDURA DO GATILHO DE PRECO-ISCA (Fluxo Mestre R-61). Padrao: dry-run (so conta). --apply marca e poe em quarentena (motivo preco_isca_...) as ofertas
 * vigentes cujo preco e isca e solta as que nao se sustentam. Com GATILHO_PRECO_ISCA=0 + --apply, SOLTA tudo (reversao). Nunca apaga cotacao.
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/varrer-preco-isca.ts [--apply]
 * Auditoria: SELECT * FROM preco_isca_marcas ORDER BY marcado_em DESC;  e  SELECT id, title FROM affiliate_offers WHERE quarantine_reason = 'preco_isca_abaixo_dos_outros_anuncios';
 */
(async () => {
  const apply = process.argv.includes('--apply');
  const { varrerIsca } = await import('../src/server/pricing/preco-isca');
  const v = await varrerIsca(apply);
  console.log(apply ? 'APLICADO' : 'DRY-RUN', JSON.stringify({ ligado: v.ligado, avaliadas: v.avaliadas, novasIscas: v.novasIscas, quarentenasSoltas: v.quarentenasSoltas, exemplos: v.exemplos }));
  process.exit(0);
})().catch((e) => { console.error('FALHA:', e instanceof Error ? e.message : e); process.exit(1); });
