# Quarentena em lote: preço implausível e título de risco (2026-11-15)

Decisão 3 do dono (`docs/decisoes-dono-2026-11-15.md`), achado A4 da auditoria (`docs/auditoria-2026-11-15/02-vulnerabilidades.md`).
Sem barreira de extração: o preço continua LIDO e gravado em `affiliate_price_snapshots` (1.142 cotações das ofertas quarentenadas preservadas). A quarentena
(`affiliate_offers.quarantined_at`) só tira a oferta da vitrine, das médias/selo, das mensagens, da busca/página de produto e da comissão prevista.

## Resultado do lote

Base: 32.245 ofertas ativas fora de quarentena. Quarentenadas: **169** (0 puladas pela guarda otimista). Segunda execução do dry-run: 0 pendentes.

| Motivo | Ofertas |
|---|---|
| preço acima do teto absoluto (R$ 150 mil) | 10 |
| preço acima do teto do tipo | 12 |
| preço irrisório (abaixo de R$ 3,00) | 3 |
| acima de 300% da mediana do master (3+ ofertas) | 9 |
| abaixo de 35% da mediana do master (3+ ofertas) | 15 |
| título de risco: destravado/desbloqueado/modificado/tinfoil | 66 |
| título de risco: jogos a escolha / milhares de jogos / N em 1 | 34 |
| título de risco: não original (réplica, pirata, paralelo...) | 11 |
| título de risco: console modificado / clone de hardware | 9 |

Exemplos de preço: câmera Canon G3 X a R$ 7.770.000 (2 ofertas), projetor Samsung a R$ 2,9 mi, lava-louças a R$ 1,8 mi, Smart TV 32" a R$ 1,2 mi, Galaxy A21s a R$ 995 mil,
Switch 2 a R$ 447.009, PS5 comemorativo a R$ 20-23 mil, Xbox Series X a R$ 15-19,9 mil, "Jogos xbox" a R$ 1,00 (isca de download pirata).
Exemplos de título: Switch OLED "Desbloqueado/Kamikaze/Tinfoil" (Shopee).

NÃO quarentenados (caros legítimos, revisados): drones DJI profissionais até R$ 74 mil, câmeras mirrorless até R$ 36 mil, impressoras 3D Bambu até R$ 36 mil,
receivers Marantz/Denon, osciloscópio Rigol, Switch 2 edição Zelda (R$ 8-12 mil de mercado, master tipado como jogo mas tratado como console).
Dos 126 masters afetados, 101 ficam sem oferta ativa; 91 já estavam escondidos pelo porteiro (master rejeitado) e **10 visíveis hoje somem da vitrine**.
Título de risco com decisão humana (`catalogGate.manual`): 0 casos (nenhum foi tocado). As 120 ofertas por título pertencem TODAS a masters que o porteiro já rejeitou (nenhum título de risco estava visível); a quarentena as tira também da comissão
e das referências de preço, onde o veredito do master não pesava. Os 10 masters visíveis que somem são por preço.

## Comissão prevista do admin (`src/server/queries/admin-comissao.ts`, filtro `quarantined_at IS NULL` confirmado)

| | Antes | Depois |
|---|---|---|
| Ofertas contadas | 32.245 | 32.076 |
| Soma dos preços | R$ 66.318.322 | R$ 37.848.078 |
| Comissão prevista | R$ 2.413.241 | R$ 1.618.765 |
| Taxa média ponderada | 3,64% | 4,28% |

Maior preço ativo restante: R$ 74.284 (drone profissional). Ofertas acima de R$ 30 mil: 41 (todas caras por natureza); abaixo de R$ 5: 8 (grips de R$ 3,99 a R$ 4,99, itens miúdos que são do porteiro, não desta regra).

## Regras (puras, testadas: `npm run test:quarentena-preco`, 23 grupos)

- `src/lib/pricing/plausibilidade-tipo.ts`: piso R$ 3,00; teto geral R$ 150 mil; teto por tipo (games/game 8 mil, console 15 mil, acessório 10 mil, esporte 30 mil, livros 5 mil,
  eletrodomésticos 40 mil, tecnologia 60 mil, impressão 3D 45 mil, eletroeletrônicos 60 mil); "caro por natureza" (drone, câmera, receiver, impressora 3D, TV, notebook...) pula o teto do tipo
  e fica só com o teto geral e a faixa relativa; console nunca é "caro por natureza"; faixa relativa 35%-300% da mediana das OUTRAS ofertas (exige 2+ referências = 3+ ofertas no master).
- `src/lib/catalog/titulo-risco.ts`: reaproveita os motivos do porteiro (`evaluateCatalogGate`, categoria `not_original`: destravado_modificado, console_modificado, pirata_copia, replica_1_1, paralelo,
  midia_iso_gravada, repro_cartucho, milhares_de_jogos, cartucho_n_em_1, jogos_a_escolha, clone_hardware, desbloqueio). Fora de games só o inequívoco (falsificado, réplica, primeira linha,
  pirata, tinfoil, devboard), porque celular "desbloqueado" e impressora com "cópia" são legítimos. Controle compatível (`clone_controle_*`) NÃO é risco desta quarentena.

## Motivo gravado (migration 0052)

`affiliate_offers.quarantine_reason text NULL` (`drizzle/migrations/0052_oferta_quarantine_reason.sql`, fora do journal como 0044-0048; aplicada com `scripts/aplicar-migration-0052.ts --apply`,
backup do esquema em `docs/backups/migration-0052-esquema-antes-*.json`; rollback `0052_oferta_quarantine_reason.rollback.sql`). Não entrou no schema Drizzle de propósito (só SQL cru lê/grava; nenhum `select *` quebra).
O lote grava o motivo com o sufixo ` [lote 2026-11-15]`.

## Prevenção na coleta (flag `QUARENTENA_PRECO_TIPO`, ligada por padrão; `=0` desliga)

- `recordPriceSnapshot` (caminho único de ML, Amazon, Shopee e verticais): depois de gravar a leitura, `src/server/collector/quarentena-preco-tipo.ts` marca quarentena se o preço está fora do piso/teto do tipo
  ou acima de 3x a mediana do master; solta sozinho só a quarentena que ELE gravou (`quarantine_reason` começando em `preco_`) quando o preço volta à faixa. Melhor esforço (nunca derruba a coleta).
- `collect-shopee-prices`, `amazon-vitrine` e `collect-vertical`: antes descartavam a leitura implausível (e a Shopee a contava como "falta", podendo expirar a oferta). Com a flag ligada gravam o preço e quarentenam com motivo.
- `collect-vertical` não solta mais quarentena que tenha motivo gravado (a liberação genérica ignora o lote e o gancho).
- A faixa "abaixo de 35%" não é aplicada pelo gancho em ML games para não esconder promoção real; continua nos coletores que já a usavam e no lote.

## Como reverter

```
# dry-run do rollback / aplicar
npx tsx --env-file=.env.local scripts/quarentena-lote-preco-risco-2026-11-15.ts --rollback docs/backups/quarentena-lote-log-2026-11-15T11-40-59-456Z.json
npx tsx --env-file=.env.local scripts/quarentena-lote-preco-risco-2026-11-15.ts --rollback docs/backups/quarentena-lote-log-2026-11-15T11-40-59-456Z.json --apply
```
Só reverte quem ainda tem a marca do lote (`quarantine_reason` igual à gravada); restaura `quarantined_at = NULL` e o `updated_at` anterior. Backup do estado anterior:
`docs/backups/quarentena-lote-backup-2026-11-15T11-40-59-456Z.ndjson`. Para desligar só a prevenção: `QUARENTENA_PRECO_TIPO=0`. Nada foi apagado.
