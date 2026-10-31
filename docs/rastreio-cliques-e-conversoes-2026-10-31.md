# Rastreio de cliques e conversões (2026-10-31)

Objetivo do dono: saber (1) quantas pessoas clicaram nos nossos links e (2) quantas compras saíram deles. "Vendas do item" não interessam. Regra de fundo: só API oficial, sem scraping, sem login automatizado na conta do dono, sem dado inventado.

## 1. O que está confirmado e o que não está

Legenda: CONFIRMADO = fonte oficial lida; PARCIAL = fonte de terceiro ou help center sem detalhe; NÃO CONFIRMADO = não achei fonte.

### Shopee (Affiliate Open API, GraphQL em `open-api.affiliate.shopee.com.br/graphql`)

| Item | Estado | Fonte / observação |
|---|---|---|
| Existem relatórios de conversão e de conversão validada | PARCIAL | Help center da Shopee (help.shopee.sg, "API Access") diz que a API cobre offer list, short link, conversion report e validated report, sem campos. |
| `conversionReport`: args `purchaseTimeStart/End` (Unix), `orderStatus` (UNPAID/PENDING/COMPLETED/CANCELLED), `buyerType`, `device`, `scrollId`, `limit` | PARCIAL | Documentação de terceiros (affiliateshopee.com.br/documentacao), que se declara não oficial. A página oficial (affiliate.shopee.com.br/open_api) exige login e não pôde ser lida. |
| Nós: `conversionId`, `purchaseTime`, `clickTime`, `totalCommission`, `utmContent`, `orders{orderId, orderStatus, items{itemId, itemName, itemPrice, qty, itemTotalCommission, attributionType}}` | PARCIAL | Idem. |
| `validatedReport`: só `validationId` e `limit`, sem filtro de data; traz `netCommission`, `refundAmount` | PARCIAL | Idem. Não importamos esse relatório ainda (precisa saber o `validationId` de cada ciclo). |
| Paginação por `scrollId`, válido ~30 s | PARCIAL | Idem. |
| Janela máxima de tempo, teto de `limit`, rate limit exato | NÃO CONFIRMADO | Não documentado nas fontes lidas. Código fatia em 1 dia e usa limit 50. Erros conhecidos: 10030 (rate limit), 11001 (parâmetro). |
| subIds identificam o clique | PARCIAL | `generateShortLink` aceita até 5 subIds (já usado em `shopee-auth.ts`); eles voltam como `utmContent` na conversão. Não achei filtro por subId no relatório. |
| Credenciais funcionam | NÃO CONFIRMADO | Nenhuma chamada real foi feita; credenciais só existem na Vercel. |

Atenção: `attributionType` por item existe, mas seus valores não estão documentados. Uma compra pode incluir itens que o comprador não clicou (mesma loja, mesma sessão). O código atribui por `itemId`, grava o `attributionType` bruto e não o interpreta. Antes de tratar "conversão por produto" como verdade, olhar os valores reais.

### Mercado Livre

| Item | Estado |
|---|---|
| API oficial de relatório de afiliado (cliques, vendas, comissões) | NÃO CONFIRMADO. Developers do ML documenta billing/conciliação de vendedor, não afiliado. Nenhuma fonte oficial achada. Tratar como inexistente até prova em contrário. |
| Painel de afiliados mostra cliques, vendas, comissões pendentes/aprovadas, filtro por período, status, canal/campanha/link | PARCIAL (blogs de terceiros; página oficial `mercadolivre.com.br/l/acompanhe-suas-metricas` bloqueou a leitura com 403). |
| Painel exporta CSV/XLSX | NÃO CONFIRMADO. Nenhuma fonte menciona exportação. O dono precisa abrir o painel e dizer se há botão de exportar. |
| Colunas do relatório | NÃO CONFIRMADO. Os apelidos no importador são palpites (ver `ML_DEFAULT_COLUMN_ALIASES`). |
| Tag de rastreio por link (`matt_tool`, `matt_word`) | NÃO CONFIRMADO por fonte oficial. Um blog diz que o relatório separa cliques e vendas por link/campanha, o que sugere atribuição por link, mas não achei o mecanismo oficial. Se o painel permitir um nome por link/etiqueta, usar uma etiqueta por canal (ex.: `site-egeek`) já separa o tráfego do site do resto. Por produto só funciona se a coluna de item/anúncio existir no relatório. |

## 2. Cliques: como `/go/[slug]` registra hoje

Arquivo: `src/app/go/[slug]/route.ts`. Tabela: `analytics_events` (`src/db/schema/analytics.ts`), evento `affiliate_click`.

- Grava: `properties {offerId, networkId, slug, priceCentsAtClick, linkPending}`, `context {referer, userAgent}`, `created_at`.
- Não grava: IP (bom: nenhum dado pessoal em claro), `user_id`, `anonymous_id`, `session_id`. As colunas existem, ficam vazias.
- Sem deduplicação: cada GET insere uma linha. Bot, pré-visualização de link (WhatsApp/Telegram/Facebook) e recarga contam como clique. Isso infla o número bruto.
- Cliques com `linkPending=true` apontam para a página pública da loja e nunca comissionam.

### Query nova: `src/server/queries/affiliate-clicks.ts`

`getClickTotals`, `getClicksByDay`, `getClicksByProduct`, `getClicksByStore`, `getClicksBySource`, todas por intervalo `{from, to}`. Cada uma devolve:

- `totalClicks`: linhas brutas;
- `botClicks`: user-agent vazio ou com padrão de bot/preview/crawler;
- `validClicks`: não-bot e 1 por (oferta, user-agent, janela de 30 min), o que absorve recarga e duplo clique;
- `uniqueVisitorsApprox`: distintos por `md5(user-agent)` entre os válidos;
- `pendingLinkClicks`: válidos em ofertas sem link de afiliado.

Dias sem clique não são preenchidos com zero (a regra de dado sintético vale; quem desenhar o gráfico decide como mostrar a lacuna). Fuso do dia: America/Sao_Paulo. Produto = `master_product` (soma todas as lojas do mesmo jogo). Loja = rede de afiliados da oferta (`affiliate_networks`). Fonte = host do `Referer` classificado (direto, próprio, google, redes sociais, mensageiros, vídeo, outro).

Limitações honestas:
- "Único" é aproximação. Sem id anônimo, duas pessoas com o mesmo navegador/aparelho viram uma, e a mesma pessoa em dois navegadores vira duas. Tende a subestimar.
- Referer ausente vira "direto" (apps, privacidade, https para http).
- A soma de únicos entre fontes é um teto, não um total exato.

### Proposta (não implementada, mexe em `/go`): unicidade real
No `/go`, ler/gerar um cookie anônimo (`eg_aid`, uuid aleatório, `HttpOnly`, `SameSite=Lax`) e gravar em `analytics_events.anonymous_id`, com `sessionId` por 30 min. Não identifica ninguém, só distingue navegadores. Exige conferir consentimento/política de privacidade. Opcional: gravar `utm_*` da URL de origem em `context`.

## 3. Conversões

### Tabela `affiliate_conversions` (migration NÃO aplicada, fora do journal)
- `drizzle/migrations/0021_affiliate_conversions.PENDING.sql` e `0021_affiliate_conversions.rollback.sql`.
- Idempotência: `UNIQUE (source, external_id)`. Shopee: `conversionId:orderId:itemId`. ML: coluna de id da conversão, ou `pedido:item`, ou hash do conteúdo sem o status (o status muda entre exportações).
- Reimportar atualiza status e valores (um pedido PENDING vira COMPLETED/CANCELLED); não duplica.
- Atribuição: `offer_id` e `master_product_id` só preenchidos quando o dado traz o item e ele casa com `affiliate_offers.external_ref` (Shopee `shopee-<itemId>`, ML `MLB<id>`). Sem item, fica NULL e `attribution_method='none'`. Nunca se adivinha por título ou data. Não há schema Drizzle para a tabela (SQL cru no importador), para evitar conflito com um futuro `drizzle-kit generate`.
- RLS ligado, sem policies, `REVOKE` de anon/authenticated (padrão da 0019).
- Para aplicar: revisar, renomear para `0021_affiliate_conversions.sql`, registrar no journal, aplicar com o fluxo normal. A aplicação é decisão do dono.

### Shopee por API (pronto, nunca executado)
- `src/server/affiliate-reports/shopee-api.ts`: `fetchShopeeConversions(lookbackDays)`; `normalizeShopeeConversionNode` é pura.
- Rota `GET /api/cron/import-shopee-conversions?days=7` (CRON_SECRET; 503 sem credenciais). NÃO agendada em `vercel.json`.
- Primeira execução: rodar manualmente com `days=1`, conferir se a resposta bate com o schema assumido (se o campo `nodes` ou algum campo não existir, o erro aparece explícito) e se há `attributionType` com valores além de um.
- Depois de validado, agendar 1x/dia com janela de 7 a 14 dias, porque o status do pedido muda dias depois da compra.

### Mercado Livre por CSV (Plano B seguro)
- `src/server/affiliate-reports/` (`csv.ts`, `normalize.ts`, `ml-csv.ts`, `store.ts`) e a ação de admin `importMlAffiliateReport(formData)` em `src/server/actions/affiliate-reports.ts` (protegida por `requireAdmin`; ainda sem tela).
- Parser: BOM, delimitador `;` `,` ou tab, aspas, valores "R$ 1.234,56", datas dd/mm/aaaa e ISO (sem fuso = Brasília), status em PT normalizado. Cabeçalho achado nas 15 primeiras linhas por apelidos; se não reconhecer, devolve as colunas lidas e pede o mapeamento (`columnMap`: campo para nome da coluna).
- Relatório de rejeitadas: cada linha recusada volta com número da linha, motivo e conteúdo (data inválida, valor ilegível, linha de total, repetida no arquivo).
- XLSX não é lido (sem dependência instalada): salvar como CSV UTF-8. Se o painel só exportar XLSX, adicionar `exceljs` e converter a primeira aba em linhas antes do `parseMlAffiliateReport`.
- O Mercado Livre não tem automação de login nossa: o dono baixa o arquivo e envia.

## 4. Fluxo diário recomendado

1. Shopee (automático, após validar): cron diário chama a rota; janela móvel de 7 a 14 dias.
2. ML (manual, 2 min): o dono exporta o relatório do painel de afiliados (período: últimos 30 dias, para pegar mudanças de status) e envia pela ação de admin. Idempotente: reenviar o mesmo período é seguro. Frequência sugerida: semanal; diária só se o volume justificar.
3. Cliques: já são coletados continuamente; a leitura usa a query nova.
4. Cruzar: cliques válidos x conversões por rede e, onde houver atribuição, por produto. Mostrar sempre quantas conversões ficaram sem atribuição.

## 5. Limitações

- Conversão não é causada, necessariamente, pelo clique no nosso site: o painel do ML pode atribuir por janela de cookie, e a Shopee por `attributionType`. Taxa "cliques para compras" é indicativa, não exata.
- Sem tag por link no ML, não dá para separar as vendas do site das vindas de outros canais do dono, a menos que o painel permita etiquetar o link.
- Comissão `pending` é estimativa. Só `completed` deve ser tratado como receita, e a Shopee pode ainda reduzir via `validatedReport`/reembolso.
- Dados reais só: tabela vazia mostra vazio.

## 6. O que o dono precisa fazer

1. No painel de afiliados do ML: dizer se existe botão de exportar (CSV/XLSX), exportar um arquivo de exemplo e passar só os nomes das colunas (sem dados pessoais). Isso fecha o mapeamento.
2. Perguntar/verificar no painel do ML se é possível etiquetar o link por canal; se sim, criar uma etiqueta para o site.
3. Autorizar a aplicação da migration 0021.
4. Garantir `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_APP_SECRET` e `CRON_SECRET` e autorizar a primeira chamada de teste à Shopee.
5. Decidir sobre o cookie anônimo no `/go` (unicidade real) e sobre a política de privacidade.
