/**
 * Chave unica do marketplace (leiloes, Hype Zone, drops, vendedor/colecionador).
 *
 * Decisao do dono (2026-11-11): leilao e venda de usados ficam SO PARA O DONO por
 * enquanto. O MVP publico e precos, pesquisa e insights. Com `false`, as rotas
 * respondem 404 a visitantes (admin continua acessando por URL direta), as server
 * actions recusam quem nao e admin e a navegacao/home/rodape escondem os links.
 *
 * Para reabrir: troque para `true` (e revise os textos de /sobre e /termos).
 * Backup do codigo e dos dados: docs/backups/leilao-usados-2026-11-11/.
 */
export const MARKETPLACE_PUBLIC = false;
