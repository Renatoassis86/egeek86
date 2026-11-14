# AliExpress — ficha de inventário

- Atualizado em: 2026-11-10
- Situação no egeek86: **não integrado** (0 ofertas). Nenhuma página oficial foi lida: exigem login e JavaScript.
- Fonte: ata `docs/conselho/atas/2026-11-10-integracao-amazon-aliexpress.md` (pesquisa do integrador-apis). **Os métodos e parâmetros vêm de fonte não oficial** (SDK `ae_sdk` em unpkg e listagens de terceiros) e precisam ser confirmados com credencial real.

## 1. Canal oficial
- **AliExpress Affiliate API**, pela Open Platform. Pontos de entrada: https://portals.aliexpress.com (programa de afiliados) e https://openservice.aliexpress.com/doc/api.htm (documentação).
- Métodos citados (não oficiais): `aliexpress.affiliate.product.query`, `aliexpress.affiliate.productdetail.get`, `aliexpress.affiliate.hotproduct.query`, `aliexpress.affiliate.link.generate`.
- `tracking_id` obrigatório. Uma página antiga de ajuda do Portals indicava App Key, secretKey, teto de fluxo de 5.000 e `localCurrency` com BRL.
- Existe programa de afiliados no Brasil (por redes de terceiros); duração do cookie divergente (30 x 3 dias).

## 2. Pré-requisitos
- Cadastro no AliExpress Portals e cadastro do domínio do site.
- Pedir acesso à Affiliate API na Open Platform; recebe App Key, Secret e `tracking_id`. Aprovação pode levar dias. **Não confirmado** para conta brasileira.

## 3. Cotas e campos
- Limites, QPS e cotas: **não lidos**.
- Esquema da resposta: **não lido** (preço original e promocional, moeda, imposto, frete, vendedor, estoque).
- Parâmetros a testar: `ship_to_country=BR`, `target_currency=BRL`.
- GTIN: **não confirmado**.

## 4. Termos
Nenhum termo oficial foi lido. **Não confirmado**: guardar histórico, cache, exibir média, uso de nome e logo.

## 5. Riscos de comparabilidade (conselho, 2026-11-10)
- Produto importado: imposto de importação, prazo e frete diferentes dos nacionais.
- O preço pode não incluir imposto declarado.
- Vendedores terceiros, risco de falsificado; jogo físico no AliExpress não é comparável com o nacional.
- Decisão do conselho (pendente do dono): AliExpress em **série "Importado" separada**, fora da média nacional e fora de jogo físico. Exige emenda de ADR e coluna de origem no banco.

## 6. Esforço e ordem
Cerca de 9 dias de código, mais 1,5 dia de coluna de origem e filtro de média. Só depois da Amazon estável, com credencial, termos lidos e a decisão da série "Importado". Piloto de 50 itens, sem cron, medindo % com preço em BRL com imposto declarado e sem master duplicado.

## 7. O que depende do dono
1. Cadastrar no Portals, registrar o domínio e pedir acesso à Affiliate API.
2. Guardar o Secret só na Vercel.
3. Entrar logado com o Chrome liberado para eu ler documentação e termos.

## 8. Status
Black Friday (27/11/2026): **não entra**.
