# Ciclo 07: páginas de produto de TODOS os departamentos e reconferência de AUD-14

Rota real: `/mercado/<departamento>/<slug>` (bloco "Menor preço por loja", `detalheDepartamento`); `/monitoramento/comparar/<id>` é só de games. `scripts/auditoria-informacao/ciclo07.ts`: 10 masters aleatórios aprovados por departamento (60), preço por loja da página x menor preço ativo fora de quarentena no banco.

## Resultado
- eletrodomesticos 10/10, eletroeletronicos 10/10, impressao3d 10/10, livros 10/10, tecnologia 10/10, esporte 9/10 (1 página sem o bloco). Games (ciclo 05): 5/5. **0 divergências de preço** entre página e banco.
- "Verificado há" da página usa `last_checked_at`; comparado com `last_price_confirmed_at` nas ofertas ativas: 0 casos com diferença maior que 24 h (máx. 11 h no ML). Honesto.
- AUD-14 reconferido com SELECT atual: as mesmas 10 ofertas (Open Box 1, Vitrine 2, Outlet 7) continuam ativas, sem quarentena, gate aprovado. O dry-run do script tinha bug de regex (`\m` dentro de template JS); corrigido, agora lista as 3 Open Box/Vitrine.

## Achado
| Id | Sev. | Achado |
|---|---|---|
| AUD-28 | BAIXA | Uma página de departamento (esporte, chuteira Mizuno Alpha) sem o bloco de preços apesar de >= 2 ofertas ativas fora de quarentena: o master aparece em listagem mas a página não mostra loja (provável filtro de frescor/clicável diferente da listagem). |
