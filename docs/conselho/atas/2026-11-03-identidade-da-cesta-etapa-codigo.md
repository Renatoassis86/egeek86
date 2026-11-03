# Ata do Conselho Geek: identidade da cesta, etapa 1 (código)

- Data: 2026-11-03. Porte: grande. Presidente: geek-lead. Sem escrita em dados de produção, sem migration, sem commit/deploy.
- Pareceres desta rodada: guardiao-catalogo (parecer independente sobre 330 pares de títulos reais; 6 achados P1 e 10 P2, a maioria corrigida e virada teste de regressão), qa-verificador (tsc, testes, SQL por EXPLAIN, revisão da coleta; aprovado, ressalvas P2 abaixo). Estatístico, engenheiro-backend, integrador-apis e gamer-veterano: pareceres da ata de 2026-11-03 (pureza) reaproveitados; não foram reconvocados nesta rodada.
- Decisões do dono aplicadas: ver `docs/modelo-indicadores.md` seção 11 e ADR 0006.
- Ressalvas do QA: oferta nova sem título do vendedor entra `active` naquele ciclo; placeholder não recebe preço quando todos os anúncios são excluídos mas é carimbado como checado; `draft` por identidade não volta sozinha; multiget do ML sem timeout (+1 chamada por grupo).
- Pendências do dono: ver relatório final.

## Etapa 2: dados (executada em 2026-11-03, sem migration, sem commit/deploy)

Autorização: dono (chat), aprovação em bloco do reversível com backup e log. Pareceres: guardiao-catalogo (critério de identidade e de criação de master), dba-postgres (transação, contagens). Verificação final: qa-verificador pendente de acionamento pelo coordenador.

**Antes:** 17.620 ofertas (9.540 ativas), 3.274.905 cotações, 6.320 masters (6.194 ativos). Backup renovado às 08:36 (master_products 6.320, affiliate_offers 17.620, watches, products; `backup/dados/*.ndjson`).

**Achado que limita o eixo B:** a API oficial do ML (`/items` e `/items/{id}`) responde 403 (`access_denied`) para anúncios de outros vendedores, com e sem token; o catálogo `/products/{id}/items` não traz título. Logo a leitura do título do vendedor (decisão 2) não funciona hoje: a coleta cai sempre em "falha aberta" e 9.092 ofertas seguem com título herdado do master. As 390 ofertas ativas sob masters cross-gen (295 do ML) não podem ser atribuídas a uma geração sem inventar dado; ficam fora das médias pelo filtro SQL de título (`offerIdentityVisibleSql`), sem escrita. Os atributos de plataforma do catálogo ML são inconsistentes (ex.: Halo Infinite "Microsoft"), por isso não foram usados.

**Aplicado:**
- C/B (ofertas com título próprio divergente, 62): 9 movidas para master existente de destino idêntico único; 11 masters novos criados (nome limpo, plataforma resolvida, porteiro aprovado, nenhum 'unknown') com 11 ofertas movidas; 28 ofertas para `draft` (em revisão, fora dos indicadores); 14 deixadas ativas (ruído do motor: "formato físico", Super Mario Bros U Deluxe; e RE3 "Remake" ausente no nome do master, decisão pendente do dono). Total: 20 movidas, 28 em draft. Log: `backup/dados/identidade-etapa2-log-2026-11-03T11-44-12-902Z.json`.
- D (duplicatas): 48 grupos, 68 masters arquivados (`mergedInto`), 199 ofertas reapontadas, 0 watches, pela rotina existente com filtro estrito extra (compareIdentity sem divergência, mesma plataforma, geração, formato, marcadores, e capacidade conhecida em console). Log: `backup/dados/merge-log-2026-11-03T11-45-29-834Z.json`. Cores comuns fundidas por regra do dono. Não fundidos (54): `docs/identidade-etapa2-duplicatas-nao-fundidas-2026-11-03.txt`.
- E (Open Box/usado): 9 usados ativos e 0 Open Box; já excluídos pelo SQL de título; nenhuma escrita.

**Verificação:** ofertas e cotações iguais dentro de cada transação (conferido por oferta movida; ofertas 17.621 antes e depois; cotações das ofertas afetadas idênticas). Os totais globais subiram só pela coleta viva (21 ofertas novas e cotações novas depois das 09:30 UTC). 0 master novo com 'unknown'. Pureza: 10 contaminados da auditoria com 0 oferta divergente ativa fora do filtro (antes: 10 contaminados em 354 = 139 puros, 204 suspeitos, 10 contaminados; amostra de 30 depois: 0 ofertas divergentes ativas). Limite: "PS5 Slim Digital 825GB" ainda tem 153 ofertas visíveis, pois o título herdado esconde capacidade 1TB. Masters que ficam sem oferta nos indicadores: 138 (114 com nome cross-gen; dry-run dizia 150): `docs/identidade-etapa2-masters-sem-oferta-visivel-2026-11-03.csv`. Em revisão: `docs/identidade-etapa2-ofertas-em-revisao-2026-11-03.csv`. test-identity (247), test-dimensions (239), test-gate (68): 0 falhas; tsc sem erro novo (só `.next/types`).

**Desfazer:**
- Ofertas/masters criados: `npx tsx scripts/revert-identidade-etapa2.ts backup/dados/identidade-etapa2-log-2026-11-03T11-44-12-902Z.json`
- Fusões: `npx tsx scripts/revert-identidade-etapa2.ts --merge-log backup/dados/merge-log-2026-11-03T11-45-29-834Z.json`
(`revert` ainda não foi executado/testado em produção; masters criados são arquivados, nunca apagados.) `apply-identidade-etapa2.ts` fica como registro; depende de um plano gerado em memória pelo motor e não é re-executável sem ele.
