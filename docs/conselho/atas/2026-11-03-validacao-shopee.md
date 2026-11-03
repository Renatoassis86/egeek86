# Ata curta: validação da integração Shopee (2026-11-03)

Pauta: validar a integração Shopee pendente (API oficial, GraphQL assinado, sem scraping, sem dado fake). Porte: médio, auditoria mais pequenas correções. Participação: engenheiro de coleta (executor), com a competência de integrador de APIs. Conselho consultivo; decisões de negócio abaixo ficam com o responsável.

Achados:
- Código e assinatura corretos (38 verificações offline, 0 falhas). Cron roda em produção a cada 10 min com HTTP 200.
- Validação ao vivo (campos, latência, cota) não foi possível: a credencial só existe como variável Sensitive da Vercel, não no `.env.local`. Evidência indireta forte de que funciona: 6.178 snapshots por API, 4.372 links curtos oficiais, 740 snapshots em 24 h.
- Dados: 773 ofertas ativas, sem duplicata de oferta, sem oferta sem master, sem link de afiliado fora da API oficial, nenhuma palavra "afiliado" na UI pública.
- Problemas: cobertura (~100 ofertas por tick, 470 ativas fora da janela de 30 min); 3.486 expiradas sem revisita desde 31/10; ~19% da cota gasta em ofertas de masters rejeitados pelo gate; 209 jogos com título "mídia física" e formato `unknown`; 10 masters duplicados segundo o dedup; títulos crus com emoji.

Decisões do executor (reversíveis, sem dado gravado):
1. Log do resumo no cron `collect-shopee` para medir a causa da cobertura.
2. Novos masters de jogo Shopee gravam `gameFormat` provado pelo título.
3. Teste offline `scripts/test-shopee.ts`.

Pendente para decisão do responsável: reservar fatia da cota para revisitar expiradas e rebaixar ofertas de masters rejeitados (altera consumo de cota, decidir após ler o novo log); regra de variação de preço ambígua (R2); backfill de `game_format` nos ~209 masters (exige backup ≤ 12 h e log); encaminhar os 10 masters duplicados ao agente de dedup; localizar quem dispara a descoberta Shopee (não está no `vercel.json`).

Fora do escopo, não alterado: dedup, offer-identity, gate, dimensions, `vercel.json`, migrations. Sem commit, sem deploy. Detalhes e evidências em `docs/validacao-shopee-2026-11-03.md`.
