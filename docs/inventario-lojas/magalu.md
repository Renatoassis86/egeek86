# Magalu — ficha de inventário

- Atualizado em: 2026-11-10
- Situação no egeek86: **não integrado**. 0 ofertas no banco. Sem coleta ativa.
- Fontes: `docs/divida-coleta-sem-api-oficial.md`, `docs/auditoria-egeek86.md`, `docs/inventario-funcionalidades-2026-11-01.md`. **Nenhuma página oficial do Magalu foi lida nesta frente**; o que segue é o que já estava registrado no repositório.

## 1. Canal oficial
- A Developers API do Magalu foi avaliada como **só para vendedor** (marketplace). Não há API de descoberta de produtos para afiliado conhecida.
- **Não pesquisado**: se o programa de afiliados do Magalu (Parceiro Magalu) oferece API, feed ou links por API. Pendente.

## 2. Código existente (dívida)
- `src/server/collector/discover-magalu-products.ts` faz **raspagem HTML da busca pública**. Fica atrás de `MAGALU_PUBLIC_SCRAPING_ENABLED=true` e está **desligado**. Regra de 2026-10-28: coleta só por API oficial; este código é dívida a revisar (`docs/divida-coleta-sem-api-oficial.md`).
- A descoberta existe, mas a loja não aparece no site (apenas Mercado Livre e Shopee são reais).

## 3. Observação sobre números antigos
O site chegou a citar contagens de ofertas Magalu e Amazon sem origem no banco. A auditoria de 2026-11-01 confirmou que eram constantes de código, não dados reais. Nenhuma menção a essas lojas deve voltar sem oferta fresca (veto do QA).

## 4. Termos, cotas, campos
Não lidos. Todos pendentes.

## 5. Decisão do dono em 2026-11-10 sobre raspagem
O dono permitiu raspagem assistida pelo Claude no Chrome, **com ele logado e presente**, onde não houver API. Isso reverte a regra de 28/10 e precisa ser registrado como emenda em ata e ADR antes de código. Para o Magalu, primeiro confirmar se há API ou feed de afiliado.

## 6. O que depende do dono
1. Dizer se tem conta no programa de afiliados do Magalu e liberar o Chrome para eu ler a página do programa.
2. Confirmar a emenda da regra de coleta (raspagem assistida).
