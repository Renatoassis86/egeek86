# Inventário de lojas e portais (2026-11-10)

Uma ficha por loja: canal oficial, pré-requisitos, cotas, campos, termos, implicações para o egeek86 e pendências do dono. Nenhuma ficha traz credenciais. O que não foi lido ou confirmado está marcado como tal.

| Loja | Situação | Canal oficial | Ofertas ativas | Cota documentada | Termos sobre histórico | Ficha |
|---|---|---|---|---|---|---|
| Mercado Livre | Integrado, coletando a cada 5 min | API oficial com OAuth + PKCE | ~9.900 (games) | Não documentada; 300 ofertas por rodada, 0 erros e 0 respostas 429 | Não lidos | [mercado-livre.md](mercado-livre.md) |
| Shopee | Integrado, coletando a cada 5 min | Open API GraphQL | ~1.150 | 8.000 chamadas por hora; resto não documentado | Sem cláusula; ambíguo | [shopee.md](shopee.md) |
| Amazon BR | Não integrado; conta **não aprovada** para a API | Creators API (PA-API morta) | 0 | 1 por segundo e 8.640 por dia | **Lidos: proíbem histórico (cache de até 24 h), rastreio e alerta de preço sem aprovação escrita** | [amazon.md](amazon.md) |
| AliExpress | Não integrado | Affiliate API (fonte não oficial) | 0 | Não lida | Não lidos | aliexpress.md (arquivado em docs/arquivo/aliexpress.md) |
| Magalu | Não integrado; raspagem desligada | Nenhuma conhecida para afiliado | 0 | — | — | [magalu.md](magalu.md) |

## Como cada loja entra na média (ADR 0004)
- Cada oferta ativa vale 1 por dia, com o preço do dia igual à mediana das cotações dela.
- Mercado Livre: várias ofertas por produto (um vendedor cada).
- Shopee: um anúncio por oferta.
- Amazon: uma oferta por ASIN (Buy Box), sem frete. Só condição Nova.
- AliExpress: série "Importado" separada (proposta do conselho, aguarda o dono).

## Decisões do dono registradas em 2026-11-10
- Shopee entra na média e no histórico públicos.
- Não enviar as perguntas à Shopee. Não redefinir a senha da API.
- O domínio não precisa de aprovação; não precisa de aviso de comissão; não precisa dos termos.
- Raspagem assistida permitida onde não houver API, com o dono logado e presente. Aguarda registro como emenda na ata e no ADR.
- Não sabe onde está o segundo agendador do ML.

## Riscos aceitos (anotados, não resolvidos)
- Amazon: o Operating Agreement exige aviso de remuneração em local destacado. Sem ele há risco de suspensão do programa.
- Shopee: o guia CONAR 2026 pede identificar conteúdo com comissão como publicidade.
- Shopee: histórico e indicadores calculados podem ser lidos como "análises de conteúdo" confidenciais (6.1(d)). Sem resposta escrita da Shopee.

## Pendências por ordem
1. Amazon: conta, chave e leitura do contrato brasileiro (ponto de decisão em 17/11/2026).
2. AliExpress: cadastro no Portals e pedido de acesso à Affiliate API.
3. Magalu: pesquisar se o Parceiro Magalu tem API ou feed.
4. Registrar a emenda da regra de coleta (raspagem assistida).
5. Ler e arquivar os termos de Mercado Livre e Amazon, quando o dono quiser.

Black Friday (27/11/2026): só Mercado Livre e Shopee.

## Catálogo por loja
O catálogo de tudo o que vendemos, por loja (Games, Impressão 3D, Tecnologia, Livros, Casa e eletrodomésticos, Eletrônicos, Esporte), vive em **/admin/catalogo** (só admin, números ao vivo, histórico diário de 14 dias) e tem retrato versionado em [../inventario-catalogo/README.md](../inventario-catalogo/README.md) com um CSV por loja. Consultar e regerar (`scripts/gerar-inventario-catalogo.ts`) quando lojas, produtos ou fontes mudarem.
