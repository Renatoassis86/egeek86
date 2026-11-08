# Pesquisa: termos de APIs, desconto falso e redes alternativas para histórico de preço

Data da pesquisa: 2026-11-08. Autor: pesquisador-benchmark (somente leitura de fontes públicas; nenhum código alterado).

AVISO: isto NÃO é aconselhamento jurídico. Os pontos marcados como "REVISÃO JURÍDICA" devem ser vistos por advogado antes da Black Friday 2026. Várias páginas oficiais bloquearam leitura automática (HTTP 403), então parte do conteúdo vem de resumos de busca e não de leitura direta do texto integral. Isso está sinalizado por item.

Legenda: confiança alta / média / baixa. "Confirmado" = li a página oficial. "Indireto" = vi só via resultado de busca ou terceiros.

---

## 1. Mercado Livre (API oficial)

Fonte principal: Termos e Condições de Uso, Developers Mercado Livre.
URL: https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes
Situação: a leitura direta devolveu 403 (três tentativas, variações de URL). O conteúdo abaixo vem do resumo do buscador sobre essa mesma página e da versão em inglês Global Selling (também 403 na leitura direta, citada via busca). Data/versão vigente: NÃO consegui confirmar (metadados inconsistentes).

| Tema | O que apurei | Confiança |
|---|---|---|
| Atualização do conteúdo (cláusula 5.3) | O desenvolvedor deve atualizar o "Conteúdo do Mercado Livre" exibido na aplicação pelo menos a cada 24 horas; segundo o resumo da versão em português, cai para 6 horas quando o conteúdo são anúncios (listagens) publicados no site. | Média (indireto, duas fontes; o 6h aparece só na versão PT) |
| Exibir conteúdo removido | A versão em inglês diz que a aplicação não pode exibir conteúdo removido do site há mais de 24 horas. | Média |
| Armazenar dados / prazo de retenção | Não encontrei cláusula que fixe prazo máximo de guarda nem que proíba expressamente guardar série histórica. A regra prática é a de atualização (24h / 6h) e a de não exibir o que foi removido. Guarda de histórico próprio e derivado (preço observado em data X) é ZONA CINZENTA. | Baixa para a conclusão "é permitido" |
| Exibir histórico a terceiros | Não encontrei cláusula específica. Ver zona cinzenta acima. Conteúdo de anúncio removido do site (item pausado/encerrado) não deve continuar sendo exibido como oferta ativa. | Baixa |
| Limite de chamadas | Os termos (versão inglesa) dizem que o ML pode limitar chamadas a seu critério, cobrar excedente ou interromper o acesso. | Média |
| Rate limit operacional | A página de erro 429 (https://developers.mercadolivre.com.br/pt-br/rate-limit-erro-429, "atualizada em 05/05/2026" segundo o buscador) orienta limite por Client ID e por endpoint, backoff exponencial com jitter, uso de multiget e possibilidade de pedir aumento de cota com evidência de uso. Não há número oficial fixo; números de terceiros (1.000/h, 1.500/min) são conflitantes e NÃO devem ser usados. | Média |
| Licença | Licença limitada, revogável, enquanto o desenvolvedor participar do programa; o ML não tem obrigação de manter a API. | Média |
| Uso comercial / atribuição / uso de imagens | NÃO consegui confirmar nenhuma exigência de atribuição, nem regra sobre imagens, nem restrição a uso comercial na leitura que fiz. | Não confirmado |
| Dados pessoais | A documentação de segurança do ML recomenda guardar só o estritamente necessário, apagar quando não for mais necessário e usar para a finalidade declarada (https://developers.mercadolivre.com.br/pt-br/seguranca-de-aplicacoes). Não afeta preço de produto, mas afeta qualquer dado de vendedor/comprador. | Média |

Referência cruzada: os termos do Mercado Pago (outro documento) permitem cópias intermediárias limitadas e tinham última modificação 14/08/2024 (https://www.mercadopago.com.br/developers/pt/docs/resources/legal/terms-and-conditions). Não aplicar ao ML sem confirmar.

Leitura para o egeek86 (hipótese, não fato):
- Mostrar o "preço atual" de um anúncio ML com dado mais velho que 6h (ou 24h) pode violar 5.3. O selo/preço ao vivo precisa de recoleta dentro dessa janela ou de aviso de "última verificação".
- O gráfico histórico é preço observado no passado, não "oferta ativa". Defensável, mas precisa ser apresentado como histórico, nunca como oferta vigente, e sem exibir anúncio já removido como disponível. Pergunta a fazer formalmente ao suporte do ML: "Podemos armazenar e exibir publicamente série histórica de preços de anúncios obtidos pela API?" Guardar a resposta por escrito.
- REVISÃO JURÍDICA: a conclusão sobre retenção e exibição histórica.

---

## 2. Shopee (programa de afiliados e Open Platform)

O que consegui ler de fato:
- Termos do Programa de Afiliados da Shopee Singapura (NÃO Brasil): https://help.shopee.sg/portal/4/article/77189. Leitura parcial (o texto corta na cláusula 6.4(d)). Pontos: afiliado recebe direito limitado e revogável de exibir links de afiliado; proibido alterar links ou criar obra derivada da PI da Shopee sem consentimento escrito (2.2); mídia aprovada não deve usar marcas/logos da Shopee (2.3(a)); proibido conduta enganosa (6.1); proibido uso de bots ou ferramentas automatizadas de consulta (6.4(b), contexto exato não visto); conteúdo não pode linkar para outros e-commerces (6.2(e)). Sem cláusula visível sobre API, cache, preços ou imagens. Data geral não encontrada. Confiança: média, e vale só para Singapura.
- A página do Brasil (https://shopee.com.br/blog/programa-de-afiliados-shopee/) cita proibições gerais (fraude, e-mail publicitário sem consentimento, abuso de busca) e remete aos Termos do programa. O texto dos Termos Brasil NÃO foi localizado.
- A política de proteção de dados da Shopee Open Platform (https://open.shopee.com/developer-guide/32, seção 10 sobre armazenamento, tratamento e descarte, itens 10.6 e 10.7) foi citada por terceiro; a página não pôde ser lida (bloqueio da ferramenta). Conteúdo NÃO confirmado.

Afiliado Open API (GraphQL):
- Endpoint BR segundo terceiros: https://open-api.affiliate.shopee.com.br/graphql; credenciais (App ID/Secret) liberadas no painel após aprovação do afiliado; assinatura SHA256; consulta de ofertas via productOfferV2 com campos de preço mínimo e taxa de desconto. Fonte: SDKs e repositórios de terceiros (ex.: https://www.nuget.org/packages/Shopee.Affiliate). Confiança: baixa a média; a documentação oficial não foi acessada.

| Pergunta | Resposta | Confiança |
|---|---|---|
| Pode armazenar e exibir preço histórico? | NÃO CONFIRMADO. Nenhuma fonte lida trata disso. | Não confirmado |
| Restrição de cache? | NÃO CONFIRMADO. | Não confirmado |
| Uso de imagens? | NÃO CONFIRMADO para o Brasil. A cláusula de PI de Singapura sugere que alterar material da Shopee exige consentimento. | Baixa |
| Divulgação de afiliado? | Termos SG exigem cumprir código de publicidade local e proíbem conduta enganosa; sem texto específico de divulgação visto. No Brasil, vale o CONAR (guia de publicidade por influenciadores) e o CDC; não verifiquei. | Baixa |

Ação: ler os Termos e Condições do programa e a documentação da Open API direto no painel de afiliado logado (affiliate.shopee.com.br), que as ferramentas daqui não acessam. REVISÃO JURÍDICA após leitura. Alerta de risco: o histórico Shopee é construído por nossas coletas; se a API não permitir persistência, o histórico dessa fonte precisa ser reavaliado.

---

## 3. Regras brasileiras sobre desconto falso e "preço de antes"

| Fonte | O que apurei | Confiança |
|---|---|---|
| Decreto 7.962/2013 (https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm), lido na íntegra pela ferramenta | Art. 2: sites devem informar de forma clara dados do fornecedor, características essenciais, custos adicionais (frete, seguro) e condições completas da oferta. Art. 4: atendimento facilitado. Art. 7: descumprimento sujeita às sanções do art. 56 do CDC. O decreto NÃO traz regra explícita sobre "preço de antes" ou histórico de preço. Aplica-se ao fornecedor (loja), não diretamente a um comparador/agregador; se o egeek86 vendesse, seria diferente. | Alta |
| CDC art. 37 (publicidade enganosa e abusiva) | Procon-RJ cita o art. 37 contra "maquiagem de preços" (subir preço antes e anunciar falso desconto) em recomendação aos fornecedores: https://www.rj.gov.br/procon/sites/default/files/arquivos_pagina/recomendacaoprocon.pdf. Via resumo de busca; não li o PDF. | Média |
| Senacon, guia/cartilha Black Friday 2024 e 2025 | Descreve a prática "o dobro da metade" e recomenda ao consumidor usar comparadores e sites que mostram histórico de preço. Isso é positivo para o egeek86: o próprio órgão recomenda a ferramenta. Ver https://agenciagov.ebc.com.br/noticias/202411/black-friday-saiba-como-identificar-descontos-enganosos. Edição 2026 NÃO localizada. | Média |
| Procons estaduais | Alguns pedem que o fornecedor guarde registro dos preços do período anterior à promoção. Goiás tem a Lei estadual 19.607/2017 exigindo divulgação de histórico de preço do produto promovido (via resumo de busca; texto da lei não lido). Outras leis estaduais podem existir (um PDF "Lei 11.142/2019" apareceu sem jurisdição clara; NÃO usar). | Baixa a média |
| Caso Renner 2019 (Procon-Criciúma) | Multa por etiquetas "de/por" confusas na Black Friday. Mostra que Procons autuam apresentação ambígua de desconto. Fonte: https://oimparcial.com.br/noticias/2019/11/renner-e-autuada-por-falsa-promocao-de-black-friday/ | Média |
| CONAR | NÃO encontrei decisão ou norma específica sobre "de/por" ou preço de referência. Não confirmado. | Não confirmado |

Implicações para o egeek86 (hipótese e recomendação, a validar):
1. Nosso histórico é um serviço de transparência apoiado pela Senacon, mas nós mesmos viramos "publicador" de afirmações de preço: se rotularmos "menor preço em 90 dias" ou "desconto real de X%", respondemos pela veracidade. Rótulos devem trazer a janela, a base (todas as ofertas ativas, média oferta-dia, ADR 0004) e a data da última coleta.
2. Nunca reproduzir como nosso o "preço de" informado pela loja; mostrar apenas o que medimos. Se citarmos o "de" da loja, marcar como "informado pela loja".
3. Cobertura incompleta: dizer "baseado nas lojas que monitoramos" evita a leitura de que cobrimos o mercado todo.
4. Se o histórico de um produto tem poucos dias, não afirmar "melhor preço do ano". Mostrar a extensão real da série.
5. Se apontarmos "Black Fraude" em lojas específicas, há risco de difamação/concorrência desleal. REVISÃO JURÍDICA antes de rotular loja nominalmente.
6. Links de afiliado: divulgar a relação comercial de forma clara (CDC art. 36 e 37 e Guia CONAR de publicidade digital; este último não verifiquei). REVISÃO JURÍDICA.

---

## 4. Redes alternativas

| Rede | Cadastro | API de preço? | Fonte | Confiança |
|---|---|---|---|---|
| Awin Brasil | Formulário online com dados e canal; depois aprovação conta e aprovação por anunciante. Termos próprios para publisher brasileiro em BRL (agosto 2025): https://www.awin.com/docs.awin.com/Legal/Publisher+Terms/2025/BR_PT-Awin-Brazil-Publisher-terms-August-2025.pdf (não li o conteúdo). Depósito de ~US$5 reembolsável citado só por terceiro. | Existem feeds de produto e API (token OAuth2), segundo terceiro; dados de preço dependem do anunciante aprovado e de seus termos. Não verifiquei documentação oficial. | divulganinja.com.br; apify (terceiros) | Baixa |
| Lomadee | Cadastro gratuito; registrar sites/redes. | API com x-api-key e escopos; doc oficial: https://docs.lomadee.com.br/api-reference/introduction (hospedagem migrando para api.lomadee.com.br). Terceiros relatam limite de 10 req/min e catálogo que inclui anunciantes não aprovados. Termos de uso dos dados de preço NÃO lidos. | docs.lomadee.com.br; ce-docs.keywordrush.com | Média (existência da API), baixa (limites) |
| Magalu (Parceiro Magalu) | Duas trilhas (divulgador PF, renda extra com CNPJ). | NÃO encontrei API pública de preço para afiliado; a API do Magalu achada é de marketplace/vendedor (https://api.magalu.com/). | divulganinja; ecommercenapratica (terceiros, sem data) | Baixa |
| Amazon Associates (PA-API 5.0) | Exige conta Associates ativa, cumprir Operating Agreement e pedir acesso à API (https://affiliate-program.amazon.com/help/node/topic/GVJ2BJP35457CLML, lido). Fontes secundárias falam em vendas qualificadas mínimas (3 em 180 dias, ou 10 em 30 dias numa versão mais nova) e perda de acesso após 30 dias sem vendas; terceiro diz que a PA-API está sendo substituída pela Creators API. Nada confirmado oficialmente. | Sim, preço e disponibilidade, porém a licença de PA-API historicamente limita armazenamento/cache de preço; NÃO confirmei o texto atual. | webservices.amazon.com/paapi5/documentation/register-for-pa-api.html; keywordrush.com | Baixa a média |
| AliExpress Portals | Conta de afiliado em portals.aliexpress.com; terceiros divergem sobre aprovação. | Sim: aliexpress.affiliate.product.query com filtro de preço (terceiros). Documentação oficial (openservice.aliexpress.com) não acessada. Relevância baixa para categorias BR (livros, eletro) e prazos de entrega. | rapidevelopers.com; rubydoc.info (terceiros) | Baixa |

Observação: nenhuma dessas redes tem cadastro "sem exigência" que dispense termos próprios sobre uso e retenção de preço. Antes de integrar, ler a licença de dados de cada uma com a mesma pergunta feita ao ML: pode armazenar e exibir série histórica?

---

## 5. Pendências (o que NÃO consegui confirmar)

1. Texto integral e data de versão dos Termos de Desenvolvedor do ML (403). Fazer leitura manual no navegador logado.
2. Termos do Programa de Afiliados Shopee Brasil e documentação da Affiliate Open API (cache, retenção, imagens, divulgação).
3. Política de dados da Shopee Open Platform, seção 10.
4. Qualquer posição do CONAR sobre "de/por".
5. Leis estaduais sobre histórico de preço além de Goiás; Guia Senacon 2026.
6. Licenças de dados de Awin, Lomadee, Amazon, AliExpress e Magalu.
7. Recolher a cláusula 5.3 do ML por leitura direta para confirmar 24h vs 6h.

## 6. Riscos e ações recomendadas

Riscos (ordem de gravidade):
1. Exibir preço de anúncio ML com idade acima de 6h/24h, ou anúncio já removido, como se vigente.
2. Guardar/exibir histórico Shopee sem permissão contratual confirmada.
3. Rótulos de "desconto real" ou "menor preço do ano" com série curta ou cobertura parcial.
4. Falta de divulgação clara de afiliado.
5. Dependência de uma única API cujos termos podem mudar sem aviso (ML não é obrigado a manter a API).

Ações:
1. Ler os termos ML e Shopee direto no navegador e anexar cópia datada em docs/ (print/PDF com data).
2. Enviar pergunta formal ao suporte do ML e ao suporte do programa de afiliados Shopee sobre armazenamento e exibição de histórico; guardar a resposta.
3. No front: mostrar "última verificação em hh:mm" em todo preço atual; esconder ou marcar como "encerrada" oferta que não recoletamos dentro da janela; separar visualmente "histórico" de "oferta ativa".
4. Padronizar rótulos com janela, base e data; não repetir o "preço de" da loja sem atribuição.
5. Incluir aviso de afiliado visível e texto "baseado nas lojas que monitoramos".
6. Revisão por advogado antes da Black Friday 2026 dos itens marcados REVISÃO JURÍDICA.
7. Só depois avaliar rede alternativa; começar por Lomadee e Awin (cadastro aberto), lendo a licença de dados antes de codificar.
