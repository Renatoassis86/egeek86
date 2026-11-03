# Ata do Conselho Geek: quarentena de preços e decisões pendentes

- **Data:** 2026-11-03
- **Porte:** médio (dado reversível, regra de indicador, sem decisão nova de negócio)
- **Presidente:** geek-lead (ata registrada pelo guardiao-catalogo)
- **Convocados:** guardiao-catalogo (catálogo, porteiro, identidade), dba-postgres (migration, índice), especialista-precos e estatistico-senior (regra de quarentena e ADR 0004); qa-verificador na verificação
- **Delegação:** o dono mandou "fazer tudo o que falta". Onde a decisão é dele, **adotada por delegação em 2026-11-03, reversível**, a recomendação já registrada.

## Decisões (todas adotadas por delegação, reversíveis)
1. **Quarentena (inventário §4, item 8):** coluna `affiliate_offers.quarantined_at` (migration 0023, aditiva, índice parcial, rollback). Entram as 83 ofertas `nivel=quarentena` do CSV de 2026-11-01, revalidadas ao vivo, mais 1 oferta nova de R$ 2.285.000 achada na varredura. As 26 `nivel=revisao` ficam de fora (preço baixo plausível). Divergência assumida com o pedido literal "109": 109 era o total do CSV (quarentena + revisão).
2. **ADR 0004 (item 9):** aceita por delegação: cotação por oferta por dia, valor do dia = mediana diária, guardando último/mín/máx/n; mínimo histórico segue no snapshot bruto. Código NÃO implementado (exige tabela e 7 dias de sombra; medições do estatístico e do DBA divergem no Switch 2).
3. **Porteiro 1 a 7:** confirmadas contra o código; implementado o que faltava (ver ADR 0005, emenda).
4. **Remake:** separa do original só quando o original existe na mesma plataforma; exceção curta RE2/RE3 em PS4/PS5 (ADR 0006, emenda). Nenhuma oferta precisou ser movida.
5. **P2 do QA:** saco de armazenamento Zelda e suporte vertical como acessório; condição "Used" em inglês; faceta "Outras plataformas" para a soma bater; fusão do Zelda BOTW legado.

## Dados medidos
- Backup `backup-pre-fusao.mjs` rodado antes de gravar (22 s; 6.333 masters, 17.651 ofertas).
- Quarentena: 83 + 1 ofertas, log `backup/dados/quarentena-log-2026-11-03T15-37-31-093Z.json` e `quarentena-log-rescan-2026-11-03T15-50-54-654Z.json`. Verificado: 0 oferta quarentenada em `public_offers`; PS4 Slim 1TB com máximo R$ 3.900 (antes R$ 2.285.000).
- Fusão: 5 masters arquivados, 23 + 1 ofertas reapontadas, log `merge-log-2026-11-03T15-43-44-556Z.json`.
- Porteiro: veredito regravado em 59 masters, tipo de 2 masters; log `catalog-gate-log-2026-11-03T15-46-55-820Z.json`.
- Testes: gate 99, dimensões 255, identidade 275 verificações, todos com 0 falha; `tsc` limpo (fora de `.next/types`).

## Riscos e pendências (não escondidos)
- 30 ofertas ativas adicionais acima de 3x ou abaixo de 0,35x da mediana (varredura `--rescan`); não aplicadas por serem juízo estatístico fora da lista do dono. Rodar `quarentena-precos-absurdos.ts --rescan` (dry-run) para ver a lista.
- Consultas de `src/server/queries/affiliate.ts` (linhas ~180, 276, 315, 493, 1068, 1247) e as rotas `/ofertas/[slug]` e `/go/[slug]` filtram só `status = 'active'`: acrescentar `quarantined_at IS NULL` (nota ao dono dessa frente; não editado por instrução).
- Migration 0023 aplicada ao banco; o número 0022 ficou livre para a outra frente. O journal do drizzle não lista 0019 em diante (migrations manuais), então não foi alterado.
- Quebra de série em média/máximo dos produtos com oferta quarentenada.
- Veredito persistido do porteiro só muda com `apply-catalog-gate.ts`; novos masters já nascem com a regra nova.

## Reversão
Quarentena: `scripts/quarentena-precos-absurdos.ts --revert <log>`. Fusão: `scripts/revert-merge-masters.ts <log>`. Porteiro/tipo: `scripts/apply-catalog-gate.ts --revert <log>`. Migration: `drizzle/migrations/0023_affiliate_offers_quarantine.rollback.sql`.
