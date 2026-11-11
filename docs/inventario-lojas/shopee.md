# Shopee — ficha de inventário

- Atualizado em: 2026-11-10
- Situação no egeek86: **integrado e coletando**. Cerca de 1.150 ofertas ativas (medição de 2026-11-10), 86% checadas em 30 min e 100% em 60 min.
- Fonte detalhada: `docs/termos-shopee-2026-11-10/` (18 documentos + `relatorio.md`), lidos pelo Chrome na conta de afiliado. Chave e senha da API **nunca** neste arquivo.
- O dono decidiu em 2026-11-10: **Shopee entra na média e no histórico públicos**; não enviar as perguntas à Shopee; não redefinir a senha da API.

## 1. Canal oficial
- **Shopee Affiliate Open API (GraphQL)**: `POST https://open-api.affiliate.shopee.com.br/graphql`.
- Painel: https://affiliate.shopee.com.br/open_api
- Autenticação: cabeçalho `Authorization: SHA256 Credential={AppId}, Timestamp={unix}, Signature={sha256(AppId+Timestamp+Payload+Secret)}`; tolerância de horário de 10 minutos.
- Variáveis na Vercel: `SHOPEE_AFFILIATE_APP_SECRET` (e as de App ID).

## 2. Operações
- `productOfferV2` (ofertas de produto: preço mínimo e máximo, vendas, nota, imagem, loja, comissão, `productLink`, `offerLink`), `shopOfferV2`, `shopeeOfferV2`.
- Product Feed: `listItemFeeds` (FULL ou DELTA) e `getItemFeedData` (até 500 por página). Lançado em 2026-03-05; a Shopee recomenda FULL na primeira carga e DELTA diário. **Não adotado** pelo egeek86; medir com 1 chamada antes.
- `generateShortLink` (mutation, até 5 subIds).
- Relatórios: `conversionReport`, `validatedReport` (janela de 3 meses; páginas de 500 com `scrollId` de 30 s).
- Preço vem como **texto** (`priceMin`, `priceMax`); sem preço por variação, sem estoque, sem frete. `price` está marcado "a ser removido".

## 3. Cotas
- **8.000 chamadas por hora** (documentado).
- Por segundo, por minuto e por aplicativo: **não documentado**. Erro de limite: **10030**.
- Máximo de `limit` nas listas de ofertas: não documentado (usa-se 10 por página).
- Nosso ritmo (`shopee-pacing.ts`): espaço de 600 ms a 2.000 ms entre chamadas, dobra no 10030, espera 8 s e tenta uma vez; 2 consultas simultâneas.
- Coleta: `collect-shopee` (cron `*/5`), rodadas de ~242 s com 164 a 222 consultas, 0 erros; ainda `partial` por orçamento de tempo, não por limite.

## 4. Termos (T&C do Programa, 09/09/2026)
- Site como mídia: exige aprovação da Shopee (2.3(a)). **O dono informou em 2026-11-10 que o domínio não precisa de aprovação.**
- Raspagem proibida (4.3(d); ToS 3.1): coleta só pela Open API.
- Link de afiliado não pode ser alterado (2.2). Atribuição: 7 dias, último clique (3.11).
- Cookies e redirecionamento só depois de clique voluntário; sem iframe nem pop-up (4.4).
- Sem anúncios pagos de busca com link de afiliado (4.3(i)); sem a marca Shopee como palavra-chave (4.3(c)); sem indexar URLs com ID de afiliado (4.3(k)).
- Informação enganosa ou desatualizada é risco (4.3(j)).
- A Shopee pode rescindir a qualquer momento (7.2).
- **Histórico de preços**: nenhuma cláusula autoriza ou proíbe. A exceção de confidencialidade 6.2(a) cobre informação pública, mas é ambíguo se cobre série histórica e indicadores calculados (6.1(d)).
- Nome e logo "Shopee": 2.3(a) fala em "Mídia Social Aprovada"; ambíguo para sites.
- Guia CONAR 2026: conteúdo que gera comissão deve ser identificado como publicidade. **O dono decidiu em 2026-11-10 que não precisa de aviso de comissão; risco aceito, conflita com o guia.**
- Perguntas redigidas à Shopee em `docs/perguntas-shopee-2026-11-10.md`. **O dono decidiu não enviar.**

## 5. Implicações
- Cada anúncio vira uma oferta. Guarda de plausibilidade (0,35x a 3x a mediana das outras ofertas, com 2 ou mais referências) rejeita e coloca em quarentena.
- Imagem: usar a `imageUrl` da API; não copiar banners.
