# Relatório: Open API e termos do Programa de Afiliados Shopee — o que vale para o egeek86

- Data da leitura: 10/11/2026, na conta de afiliado já logada no Chrome, somente leitura.
- Nada foi alterado. Não cliquei em Redefinir, Salvar nem Sair. Nenhum link foi gerado. App ID e senha da API: [oculto].
- Não saí do domínio shopee.com.br: todas as páginas lidas estão em affiliate.shopee.com.br e help.shopee.com.br.
- Este relatório não é parecer jurídico. Onde há dúvida de interpretação, ela está marcada como "ambíguo".

## 0. Páginas lidas

| # | Arquivo | Página | URL | Data de atualização |
|---|---|---|---|---|
| 1 | 01-open-api-pagina-da-conta.md | Abrir API (conta) | https://affiliate.shopee.com.br/open_api | não informada |
| 2 | 02-open-api-home.md | Open API Platform | https://affiliate.shopee.com.br/open_api/home | não informada |
| 3 | 03-open-api-document-overview.md | Open API Document — Overview | https://affiliate.shopee.com.br/open_api/document?type=overview | não informada |
| 4 | 04-open-api-document-authentication.md | Authentication | https://affiliate.shopee.com.br/open_api/document?type=authentication | não informada |
| 5 | 05-open-api-document-request-response.md | Request and Response | https://affiliate.shopee.com.br/open_api/document?type=request_response | não informada |
| 6 | 06-api-list-shopee-offer.md | Get Shopee Offer List | https://affiliate.shopee.com.br/open_api/list?type=shopee_offer | não informada |
| 7 | 07-api-list-brand-shop-offer.md | Get Brand (Shop) Offer List | https://affiliate.shopee.com.br/open_api/list?type=brand_offer | não informada |
| 8 | 08-api-list-product-offer.md | Get Product Offer List | https://affiliate.shopee.com.br/open_api/list?type=product_offer | não informada |
| 9 | 09-api-list-product-feed.md | Product Feed (lista e detalhe) + página "Feed de produto" | /open_api/list?type=product_feed_offer · ?type=product_feed_offer_detail · /creative/product_feed | lançamento em 2026-03-05 |
| 10 | 10-api-list-short-link.md | Get Short Link | https://affiliate.shopee.com.br/open_api/list?type=short_link | não informada |
| 11 | 11-api-list-relatorios-conversao-validado.md | Conversion Report e Validated Report | ?type=conversion_report · ?type=validation_report | não informada |
| 12 | 12-api-list-new-version-update.md | New Version Update | ?type=update_instructions | última entrada 2026-03-05 |
| 13 | 13-termos-e-condicoes-programa-de-afiliados.md | Programa de Afiliados Shopee — Termos e Condições (integral) | https://help.shopee.com.br/portal/10/article/124094-Programa-de-Afiliados-da-Shopee-Termos-e-Condi%C3%A7%C3%B5es | 09/09/2026 |
| 14 | 14-guia-conar-2026-identificacao-publicitaria.md | Guia CONAR 2026 para Influenciadores e Afiliados (integral) | https://help.shopee.com.br/portal/10/article/196794-... | não informada |
| 15 | 15-boas-praticas-para-o-afiliado.md | Boas práticas para o Afiliado Shopee (integral, tabelas em imagem transcritas) | https://help.shopee.com.br/portal/10/article/124391-... | não informada |
| 16 | 16-outras-paginas-regras-e-politicas.md | Lista "Regras e Políticas", Conta sinalizada, Comissão Extra | https://help.shopee.com.br/portal/10/category/16768-.../17352-... | não informada |
| 17 | 17-termos-de-servico-shopee-trechos.md | Termos de Serviço da Shopee (trechos) | https://help.shopee.com.br/portal/4/article/77113 | 25/09/2026 |
| 18 | 18-politica-de-privacidade-shopee-trechos.md | Política de Privacidade da Shopee (trechos) | https://help.shopee.com.br/portal/4/article/77068 | 26/06/2026 |

## 1. Limites de uso

| Item | O que a documentação diz | Fonte |
|---|---|---|
| Limite por hora | "The current system limit is 8000 times/hour." | Overview (arquivo 03) |
| Por segundo / por minuto | **Não documentado.** A página só fala em 8000/hora. | — |
| Por aplicativo ou por conta | **Não especificado.** A frase fala em "the system limits the number of API calls". Ambíguo se o limite é por App ID, por afiliado ou global. | Overview |
| Código de erro de limite | **10030** — "Trigger traffic limiting / The number of requests exceeds the threshold" (Request and Response); "10030 Rate limit exceeded" (tabelas de erro das APIs). | arquivos 05, 07, 08 |
| O que fazer ao receber o erro | "If the limit is exceeded, the system will refuse to process the request. The client needs to wait for the next time window to resend the request." A documentação não informa o tamanho da janela nem cabeçalho Retry-After. | Overview |
| Itens por página — relatórios | "the maximum number of data returned per page is 500" (Conversion e Validated Report, com scrollId) | arquivos 03 e 11 |
| Paginação dos relatórios | scrollId vale uma vez e por 30 segundos; "The query without scrollid requires an interval of longer than 30 seconds." | arquivos 03 e 11 |
| Itens por página — feed | getItemFeedData: "maximum allowed value is 500", paginação por offset/hasMore | arquivo 09 |
| Itens por página — productOfferV2, shopOfferV2, shopeeOfferV2 | Parâmetros `page` e `limit` existem (exemplo 10), **máximo não documentado**. | arquivos 06–08 |
| Janela do relatório de conversão | "The available querying data time range is Recent 3 Months." | Overview |
| Tolerância de horário na assinatura | "The difference between the timestamp of the request and the server time cannot exceed 10 minutes" | Authentication |

Leitura prática: 8000/hora é cerca de 2,2 requisições por segundo em média. Sem limite por segundo documentado, o seguro é espaçar as chamadas (por exemplo, no máximo 2 por segundo) e tratar 10030 com espera e nova tentativa.

## 2. Operações disponíveis (GraphQL)

Endpoint único: `POST https://open-api.affiliate.shopee.com.br/graphql`, `Content-Type: application/json`, corpo `{ "query", "operationName"?, "variables"? }`. Autenticação por cabeçalho `Authorization: SHA256 Credential={AppId}, Timestamp={unix}, Signature={sha256(AppId+Timestamp+Payload+Secret)}` em hexadecimal minúsculo, onde Payload é o corpo JSON exato enviado.

| Operação | Tipo | Parâmetros | Campos devolvidos (principais) |
|---|---|---|---|
| **productOfferV2** | query | shopId, itemId, productCatId, listType + matchId (só juntos), keyword, sortType (1 relevância, 2 vendidos, 3 preço desc, 4 preço asc, 5 comissão), page, limit, isAMSOffer, isKeySeller | nodes: itemId, productName, priceMin, priceMax, price (a ser removido), priceDiscountRate, sales, ratingStar, imageUrl, shopId, shopName, shopType, productCatIds, commissionRate, sellerCommissionRate, shopeeCommissionRate, commission, productLink, offerLink, periodStartTime, periodEndTime; pageInfo: page, limit, hasNextPage |
| shopOfferV2 (Brand/Shop Offer) | query | shopId, keyword, shopType, isKeySeller, sortType, sellerCommCoveRatio, page, limit | commissionRate, imageUrl, offerLink, originalLink, shopId, shopName, ratingStar, shopType, remainingBudget, periodStartTime, periodEndTime, sellerCommCoveRatio, bannerInfo |
| shopeeOfferV2 | query | keyword, sortType, page, limit | commissionRate, imageUrl, offerLink, originalLink, offerName, offerType, categoryId, collectionId, periodStartTime, periodEndTime |
| listItemFeeds | query | feedMode (FULL ou DELTA) | feeds: datafeedId, datafeedName, referenceId, description, totalCount, date, feedMode |
| getItemFeedData | query | datafeedId, offset, limit (máx. 500) | rows: columns (JSON em texto, colunas não documentadas), updateType (NEW, UPDATE, DELETE); pageInfo: offset, limit, totalCount, hasMore |
| **generateShortLink** | mutation | input: originUrl (obrigatório), subIds (até 5) | shortLink |
| conversionReport | query | intervalos de compra e conclusão, filtros de loja, pedido, produto, categoria, status, comprador, dispositivo, fraude, campanha; limit; scrollId | cliques, compras, comissões (Shopee, vendedor, total, líquida), utmContent (sub ids), pedidos e itens |
| validatedReport | query | validationId, limit, scrollId | mesmos blocos do conversionReport, já validados |

Observações sobre os campos de preço:
- `priceMin` e `priceMax` são **texto** na moeda local (ex.: "45.99"). O produto pode ter variações com preços diferentes; não existe campo de preço por variação.
- `price` está marcado "(To Be Removed)".
- Não há campo de estoque nem de frete.
- A Shopee recomenda, desde 2026-03-05, usar o **Product Feed** (FULL na primeira carga, DELTA diário) para manter catálogo, e trocar os links pelo "product_short link" que vem no feed.

## 3. Termos sobre armazenar, exibir e republicar dados

Resposta curta: **nenhuma página lida autoriza ou proíbe expressamente guardar histórico de preços nem fala em prazo de retenção para dados de produto.** Há cláusulas que, lidas literalmente, criam risco. Por isso a recomendação é pedir confirmação por escrito à Shopee antes de publicar histórico.

**a) Podemos guardar histórico de preços?**
- Não há cláusula sobre isso na documentação da API nem nos Termos do Programa.
- Os Termos de Serviço proíbem monitorar ou copiar conteúdo com robôs sem consentimento: "você concorda que não usará nenhum robô, spider ou qualquer outro dispositivo automático ou processo manual para monitorar ou copiar nosso Conteúdo, sem o nosso consentimento prévio por escrito" (Termos de Serviço, 3.1, https://help.shopee.com.br/portal/4/article/77113).
- A Open API é o canal oficial que a Shopee oferece ao afiliado para receber esses dados. A atualização de 2026-03-05 diz que o feed serve para "populate your database for the first time" e "Use 'DELTA' files every day" (https://affiliate.shopee.com.br/open_api/list?type=update_instructions). Isso indica que **guardar o catálogo atual** é esperado.
- **Ambíguo:** se guardar a série histórica de preços (e não só o estado atual) está coberto por esse uso.

**b) Podemos mostrar variação de preço ao público?**
- Os Termos de Serviço dizem: "Você concorda em não copiar, distribuir, republicar, transmitir, exibir publicamente, executar publicamente, modificar, adaptar, alugar, vender ou criar trabalhos derivados de qualquer parte dos Serviços, do Site ou de seu Conteúdo." (3.1, mesma URL). "Conteúdo" inclui "dados, textos, imagens [...] produtos (incluindo nomes, marcas e imagens)" (1.1).
- Os Termos do Programa tratam como confidencial "qualquer dado (incluindo dados de conteúdo e análises de conteúdo) compartilhado pela Shopee e/ou seus parceiros (incluindo Meta) em conexão com os programas da Shopee" (6.1(d), https://help.shopee.com.br/portal/10/article/124094-Programa-de-Afiliados-da-Shopee-Termos-e-Condi%C3%A7%C3%B5es).
- Exceção que joga a favor: não é confidencial a informação que tenha sido "publicamente conhecidas e geralmente disponibilizadas antes do momento da divulgação" (6.2(a)). O preço exibido na loja é público.
- **Ambíguo:** a exceção 6.2(a) cobre o preço do dia, mas não fica claro se cobre a série histórica e os indicadores calculados a partir de dados da API (média, mínimo, variação), que podem ser lidos como "análises de conteúdo".

**c) Por quanto tempo podemos manter os dados?**
- **Não há prazo** para dados de produto em nenhuma página lida.
- Para dados pessoais de usuários Shopee (que a API de produtos não entrega, mas os relatórios de conversão entregam em parte, como pedidos), vale a regra de "Parte Receptora": "permitir que a Shopee ou o Usuário cujos dados pessoais a Parte Receptora tenha coletado (a 'Parte Divulgadora') remova seus dados coletados do banco de dados da Parte Receptora" (Política de Privacidade, 8.6, https://help.shopee.com.br/portal/4/article/77068; igual em Termos de Serviço, 2.2).

**d) Há exigência de atualizar ou apagar dados?**
- Não há exigência explícita de atualizar preço em prazo determinado.
- Indiretamente: os Termos do Programa proíbem "divulgar informações falsas, enganosas ou não verificadas" (4.3(j)), e as Boas Práticas pedem para não usar "informações desatualizadas sobre os produtos". Um preço velho mostrado como atual pode ser enquadrado aí.
- Ao sair do programa: "o Afiliado deverá cessar imediatamente todo o uso dos Links de Afiliado da Shopee e deixará de se representar como um Afiliado da Shopee" (7.4).
- A Shopee pode pedir a retirada de conteúdo: "solicitar que os Links de Afiliado e/ou a Mídia de Afiliado sejam removidos ou retirados imediatamente" (5.2(a)), e o afiliado "deverão agir imediatamente após a solicitação da Shopee" (4.1).

## 4. Regras do programa que afetam um site de comparação de preços

| Tema | Regra (trecho exato) | Fonte | Impacto no egeek86 |
|---|---|---|---|
| Site como mídia | "A Mídia de Afiliado pode incluir mídias sociais e sites [...] mediante aprovação da Shopee" | T&C 2.3(a) | O site precisa estar cadastrado e aprovado como mídia. |
| Marca Shopee na mídia | A Mídia Social Aprovada deve "não conter as marcas, nomes ou logotipos da Shopee, nem exibir conteúdo enganoso" | T&C 2.3(a) | **Ambíguo** para sites: a frase fala em "Mídia Social Aprovada". Exibir o nome "Shopee" como loja de origem da oferta é o mínimo de transparência; logotipo é mais arriscado. Confirmar com a Shopee. |
| Link de afiliado | licença para "exibir os Links de Afiliado em sua Mídia de Afiliado [...] não deverá [...] alterar, modificar ou criar trabalhos derivados dos Links de Afiliado" | T&C 2.2 | Não reescrever nem encurtar o link por conta própria; o redirecionador `/go/` só pode encaminhar ao link gerado pela Shopee, sem alterá-lo. |
| Atribuição | "o período de atribuição [...] será de 7 (sete) dias e será considerado o último clique" | T&C 3.11 | A comissão é do último clique em até 7 dias. |
| Base da comissão | "excluindo quaisquer descontos, taxas de envio, taxas de cupons e outros abatimentos" | T&C 1.7 | Valor líquido da compra. |
| Mídia paga | proibido "fazer anúncios pagos em search ou shopping, como Google Ads e Bing Ads, para promover links de afiliados"; mídia paga só em "Instagram Ads, Facebook Ads, TikTok Ads e Pinterest Ads" | T&C 4.3(i) e 2.3(b) | Nada de Google Ads com link de afiliado. |
| Palavra-chave "Shopee" | proibido usar "palavra-chave SEM [...] usando a marca Shopee" sem consentimento | T&C 4.3(c) | Se fizer anúncio de busca do próprio site, "Shopee" entra como palavra-chave negativa. |
| SEO | proibido "indexar URLs da Shopee com o ID de afiliado na UTM por meio do Google Search Console ou qualquer outro mecanismo de indexação" | T&C 4.3(k) | Manter `/go/` fora do índice (robots.txt já bloqueia `/go/`) e links com `rel="nofollow sponsored"`. |
| Cookies | só definir cookies "se os Links de Afiliado forem visíveis [...] e o usuário clicar voluntária e conscientemente"; proibidos iFrames, pop-up, redirecionamento automático | T&C 4.4 | Nada de pré-carregar, abrir em iframe ou redirecionar sem clique. |
| Raspagem | proibido "usar qualquer meio ou forma automatizada de sucateamento, ou outros métodos de extração de dados para acessar, consultar, coletar ou usar a propriedade intelectual da Shopee" | T&C 4.3(d); ToS 3.1 | Coletar só pela Open API. Raspagem do site da Shopee viola os termos. |
| Imagens | a lista de PI em 4.3(d) inclui "logotipo, visuais-chave, materiais criativos" | T&C 4.3(d) | Usar a `imageUrl` devolvida pela API; não copiar banners. |
| Informação enganosa | proibido "divulgar informações falsas, enganosas ou não verificadas (fake news)" | T&C 4.3(j) | Preço desatualizado ou isca exibido como oferta é risco direto. |
| Declarações públicas | o afiliado não deve "emitir qualquer comunicado de imprensa ou fazer declarações públicas [...] a menos que aprovados pela Shopee" | T&C 6.3 | Não divulgar a parceria como "parceria oficial". |
| Identificação como afiliado | "Se o conteúdo gera comissão ou qualquer benefício financeiro, ele deve ser identificado como publicidade." | Guia CONAR 2026 | **Conflita com a regra interna do egeek86 de nunca mostrar "afiliado" ao cliente.** O guia trata de redes sociais, mas a lógica vale para o site: é preciso aviso claro de que o site pode receber comissão. |
| Visibilidade do aviso | "Não esconda o aviso no final da legenda, em letras pequenas" | Guia CONAR 2026 | Aviso perto do botão "Ir à loja", não só nos Termos. |
| Compras próprias | sem comissão em compras em que "o Afiliado tenha comprado Produtos através de Links de Afiliados" e em compras "com a intenção de revenda" | T&C 3.6(c) e (f) | Não testar o fluxo comprando pelo próprio link. |
| Rescisão | a Shopee pode rescindir "a qualquer momento, com ou sem motivo" | T&C 7.2 | Ter plano B de lojas e não depender só da Shopee. |
| Alterações | "Os Termos e Condições e/ou Termos de Serviço modificados entram em vigor mediante a publicação." | T&C 5.3 | Rever os termos periodicamente (estes são de 09/09/2026). |

## 5. O que não consegui ler ou ficou ambíguo

**Não encontrado:**
- Não há página de "termos de uso da API" separada. A documentação da Open API não traz cláusulas de uso dos dados; os termos aplicáveis são os do Programa e os Termos de Serviço.
- Não há limite por segundo ou por minuto, nem definição se o limite de 8000/hora é por aplicativo.
- Não há máximo documentado de `limit` em productOfferV2, shopOfferV2 e shopeeOfferV2.
- As colunas do JSON `columns` do Product Feed não estão documentadas.

**Não lido ou lido em parte:**
- **Termos de Serviço (86 mil caracteres) e Política de Privacidade (39 mil caracteres):** foram carregados inteiros e varridos por palavras-chave, mas salvei apenas os trechos pertinentes, não o texto integral. O motivo é que o seu computador não estava conectado a esta sessão para receber os arquivos direto, e transcrever tudo à mão aumentaria o risco de erro de cópia. Os trechos estão marcados como tal e trazem a URL.
- **Imagens não transcritas:** o "Passo 2" do artigo "Conta sinalizada" está em imagem e não foi transcrito. As tabelas de "Boas práticas" também são imagens, mas foram transcritas por leitura visual.
- **Artigos da lista "Regras e Políticas" não abertos:** Menores de idade, Novo Modelo Fiscal da Comissão Extra, Novo valor mínimo de comissões, Produtos de saúde em vídeos e lives, Bens e Serviços Restritos. Nenhum deles trata de dados ou de sites de comparação, a julgar pelo título.
- **Links não abertos:** "View details" do histórico de versões (ocultos), "Ver Link" do Feed de produto (não aberto para não gerar nem baixar nada) e o explorer da API (exige chamada autenticada).

**Ambíguo:**
- Se histórico e indicadores calculados com dados da API contam como "análises de conteúdo" confidenciais (T&C 6.1(d)).
- Se a regra de "não conter marcas, nomes ou logotipos da Shopee" (2.3(a)) vale para sites ou só para redes sociais.
- O Guia CONAR é dirigido a redes sociais. A obrigação de identificar publicidade num site comparador decorre da mesma lógica, mas não é dita textualmente para sites.

**Recomendação:** mandar à Shopee, pelo formulário de contato do programa, três perguntas por escrito:
1. Se o site pode guardar e exibir histórico de preços obtido pela Open API.
2. Se pode exibir o nome "Shopee" como loja de origem.
3. Qual é o limite por segundo e por aplicativo.

Guarde a resposta junto destes arquivos.
