# Amazon Brasil — ficha de inventário

- Atualizado em: 2026-11-10
- Situação no egeek86: **não integrada** (0 ofertas no banco). Depende de conta apta, chave da Creators API e leitura dos termos brasileiros.
- Fontes: documentação oficial da Creators API (lida pelo Chrome em 2026-11-10) e a ata `docs/conselho/atas/2026-11-10-integracao-amazon-aliexpress.md`. Nenhuma credencial aqui.

## 1. Canal oficial
- **Creators API** (REST). Sucessora da PA-API 5.0, que está descontinuada: as chamadas devolvem HTTP 403 `AccessDeniedException` ("Product Advertising API is deprecated. Please migrate to Creators API"). Chaves da PA-API não servem. A página oficial atual não traz a data da descontinuação.
- Documentação: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
- Mercado: `www.amazon.com.br` está na lista de locales. As credenciais valem em todas as regiões, mas cada mercado exige partner tag e acesso aprovado.
- O stub antigo do repositório (variáveis `AMAZON_PA_API_*`) está desatualizado e só deve ser reescrito depois do acesso.

## 2. Pré-requisitos
- Conta de Associados com **aceitação final** no mercado. Só o **dono primário** da conta cria a aplicação.
- **Confirmado no painel brasileiro (2026-11-10, Ferramentas > API para Creators, https://associados.amazon.com.br/creatorsapi):** a tela mostra "❌ Ter uma conta de associado aprovada". A conta **ainda não está aprovada**. A FAQ da mesma tela exige **10 vendas qualificadas nos últimos 30 dias** para a PA API pela Creators API (a regra de 180 dias do pedido original não existe). Depois de criar a credencial, a análise leva até 48 h; o erro "AssociateNoteEligible" que persistir além disso indica que a conta não atende aos critérios.
- Estado da conta em 2026-11-10: 0 produtos enviados, 0 pedidos, 0 cliques, ganhos R$ 0,00 no mês. Sem vendas, a Creators API não libera.
- Quem ainda não tem vendas pode pedir acesso pelo formulário "Contact Us" do programa.
- Cadastro: Tools > Creators API > Create Application. Gera Credential ID, Secret e Version. No máximo 2 aplicações por loja e 2 credenciais por aplicação.
- Autenticação: OAuth 2.0, fluxo client credentials. A versão da credencial define o endpoint do token.

## 3. Cotas
- Inicial: 1 requisição por segundo (TPS) e 8.640 por dia (TPD), nos primeiros 30 dias.
- Depois: 1 TPD a cada 5 centavos de receita enviada atribuída; 1 TPS (teto 10) a cada US$ 4.320 em 30 dias.
- Sem venda qualificada por 30 dias seguidos o acesso cai (HTTP 429); volta em até 2 dias depois de novas vendas enviadas.
- Obrigatório: partner tag em todas as chamadas, conta primária e links devolvidos sem alterar parâmetros.
- Batch: `GetItems` até 10 ASIN por chamada (conta uma transação).

## 4. Operações e campos
- Operações: `SearchItems`, `GetItems`, `GetVariations`, `GetBrowseNodes`.
- Recursos de `GetItems`: `browseNodeInfo` (categorias, ranking de vendas), `images`, `itemInfo` (título, características, classificações, `externalIds`, fabricante, produto, técnico), `offersV2`, `parentASIN`.
- `externalIds` pode trazer EAN/GTIN. **Não confirmado**: precisa de chamada real.
- `currencyOfPreference` e `languagesOfPreference` aceitos. BRL como padrão do Brasil: **confirmar na chamada**.
- Identificador do produto: **ASIN**. `detailPageURL` já vem com o tag de afiliado.

## 5. OffersV2 (o ponto que define o desenho)
- Devolve **somente a oferta destacada** (Buy Box). Sem oferta destacada, a API indica fora de estoque.
- **Não existe**: lista de vendedores, contagem de ofertas, menor e maior preço, frete, elegibilidade Prime, avaliação do vendedor.
- Existe: preço (valor, moeda, formatado), preço por unidade, preço de referência (`savingBasis`: LIST_PRICE, LOWEST_PRICE, WAS_PRICE), economia (valor e %), disponibilidade (IN_STOCK, IN_STOCK_SCARCE, OUT_OF_STOCK, PREORDER, UNAVAILABLE, LEADTIME, AVAILABLE_DATE, UNKNOWN), condição (New, Used, Refurbished; subcondição inclui OpenBox), vendedor (id e nome), `isBuyBoxWinner`, `violatesMAP`, tipo (LIGHTNING_DEAL, SUBSCRIBE_AND_SAVE) e `dealDetails` (acesso, selo, início, fim, % reivindicado).
- O preço é o padrão para um endereço de entrega dentro do mercado e pode diferir do que o cliente vê.
- MAP: se o preço estiver abaixo do mínimo anunciado pelo fabricante, a API não o mostra.

## 6. Termos e regras (LIDOS em 2026-11-10, com o dono logado)
Fontes: Contrato Operacional (atualizado em 15/10/2025) https://associados.amazon.com.br/help/operating/agreement e Políticas do Programa (atualizadas em 14/04/2026) https://associados.amazon.com.br/help/operating/policies/ (Requisitos para Participação, Licença de PI, Diretrizes de Marcas). A Licença de PI foi lida só nos trechos sobre cache, extração e exibição de preço; o resto não foi lido.

**Cláusulas que conflitam com o que o egeek86 faz hoje:**
1. **Histórico e cache (Licença de PI, item 1(h))**: não se pode guardar nem fazer cache de imagem (só o link, por até 24 h). Outro "Conteúdo de Anúncio de Produtos" (inclui preço) pode ser guardado **por até 24 horas**, e deve ser atualizado e exibido de novo por chamada à API. **Só o ASIN pode ser guardado por prazo indeterminado.** Uma série histórica de preços da Amazon, como a que o egeek86 constrói, **não é permitida** por esta cláusula.
2. **Extração e análise (Licença de PI, 1(c)–(e))**: a licença exclui "mineração de dados, robôs ou ferramentas similares de coleta e extração de dados" e proíbe agregar, analisar, extrair ou redefinir os objetivos do Conteúdo de Anúncio de Produtos. A média multi-loja e os indicadores se enquadram em "agregar e analisar".
3. **Rastreamento e alerta de preço (Requisitos 6(y))**: "Salvo se de outra forma aprovado pela Amazon, seu Site não poderá ter recurso de rastreamento de preços e/ou de alerta de preços." O egeek86 tem vigia de preço e alerta de queda. Exige aprovação escrita da Amazon.
4. **Produtos de outros varejistas (Requisitos 6(z))**: proíbe exibir Conteúdo do Programa para anunciar produtos oferecidos em outros sites. Misturar a oferta da Amazon com Mercado Livre e Shopee numa mesma média é um risco direto.
5. **Preço exibido (Requisitos 2(b))**: só se mostra preço e disponibilidade se vierem de link da Amazon ou da API. Em comparação de preços com outras lojas, deve-se exibir o menor preço "novo" e, se fornecido, o menor "antigo" da Amazon.
6. **Carimbo de data e hora (Licença de PI)**: preço e disponibilidade devem trazer data e hora (ex.: "Preço na Amazon.com.br: R$ 32,77 (às 14:11 BRT)") quando atualizados com menos frequência que de hora em hora, e o aviso de que preços e disponibilidade podem mudar.
7. **Site para celular (Licença de PI, (d))**: proíbe o uso do conteúdo em site ou app "projetado ou destinado" a celular sem aprovação expressa e escrita da Amazon (site responsivo acessado por celular parece permitido; confirmar).
8. **Avaliações em estrelas (Requisitos 6(t))**: só com link obtido pela API.
9. **Remover o que a Amazon retirar (Requisitos 6(c))**: remover e destruir o Conteúdo do Programa que não esteja mais na Amazon ou que ela notifique.
10. **Aviso de remuneração (Contrato, cláusula 5)**: exige, em local claro e destacado, a frase "Como participante do Programa de Associados da Amazon, sou remunerado pelas compras qualificadas efetuadas". Violação é "descumprimento material". **O dono decidiu em 2026-11-10 que não precisa de aviso de comissão; para a Amazon o contrato exige. Risco de suspensão e de perda de comissões.**
11. **Links**: devem usar o tag (ID de Associado), não ser encurtados nem disfarçados (Requisitos 6(v), 6(w)); sem redirecionamento sem clique do cliente; sem anúncios pagos de busca com a palavra "amazon" ou outra marca da Amazon.
12. **Compras próprias**: proibido comprar pelo próprio link ou induzir amigos e parentes (Requisitos 6(u)).
13. **Rescisão**: qualquer parte pode rescindir a qualquer momento, com 7 dias de aviso; suspensão imediata em caso de violação material. A Amazon pode reter comissões.
14. **Arbitragem**: foro por arbitragem da CCI, em São Paulo, em inglês.

**Leitura do conselho a atualizar:** o parecer anterior dizia que o histórico "não estava confirmado". Agora está: pelo contrato brasileiro, **a Amazon não pode entrar na série histórica nem na média do egeek86 sem aprovação escrita da Amazon**. Só é permitido, em princípio, exibir o preço do momento, vindo da API, com carimbo de hora, e guardar o ASIN.

## 7. Implicações para o desenho
- Cada ASIN contribui com **uma oferta** (Buy Box) para a média oferta-dia (ADR 0004). Não dá para montar "todas as ofertas da Amazon" por produto.
- Gravar: preço (BRL explícito), condição, tipo de vendedor (Amazon x terceiro), disponibilidade, ASIN, hora da coleta. Só condição Nova entra na média.
- O preço não inclui frete (campo ausente).
- Identidade: `external_ref = amazon-<ASIN>`; casamento com o master por GTIN quando houver, senão `findExistingMasterProduct`. Nunca `platform = 'unknown'`.
- Mínimo de 3 referências antes de a Amazon virar menor preço público (parecer do conselho).
- Capacidade: 8.640 chamadas × 10 ASIN dá dezenas de milhares de produtos por dia na cota inicial.
- Kill-switch previsto: `COLLECT_AMAZON_ENABLED` (padrão desligado).

## 8. O que depende do dono
1. Obter a **aprovação da conta de Associados** (hoje reprovada no painel) e as **10 vendas qualificadas em 30 dias**. Sem isso a tela da Creators API não libera a criação da aplicação.
2. Decidir como tratar as cláusulas do item 6, em especial histórico, alerta de preço e mistura com outras lojas. A saída contratual é pedir **aprovação escrita da Amazon** pelo Fale Conosco do programa.
3. Se a conta for aprovada: criar a aplicação, guardar o Secret só na Vercel e me dizer só o nome das variáveis.

## 9. Status
Black Friday (27/11/2026): **não entra**. Não há como atender a regra de 10 vendas em 30 dias a tempo, e os termos barram histórico e média. Ponto de decisão de 17/11/2026: **recomendação do inventário: não seguir** com a Amazon como fonte de preço na média; manter a Amazon, se o dono quiser, apenas como destino de links de afiliado, com o aviso exigido e sem guardar preço.
