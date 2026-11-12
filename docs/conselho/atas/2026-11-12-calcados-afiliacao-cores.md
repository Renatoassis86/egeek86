# Ata do Conselho Geek: calçados em Esporte, afiliação a lojas de calçado, cor de fundo por loja

- **Data:** 2026-11-12
- **Porte:** médio (3 pedidos do dono liberados: fila #38, #39, #40)
- **Presidente:** geek-lead
- **Convocados:** mesa fixa (estrategista-mercado, especialista-precos, gamer-veterano, qa-verificador) mais integrador-apis, engenheiro-coleta, guardiao-catalogo, designer-marca, engenheiro-frontend. Nesta execução os pareceres foram consolidados pelo presidente a partir das medições no banco, da pesquisa web delegada e do código; o `qa-verificador` roda ao final.

## Briefing
O dono (2026-11-12): (a) cor de fundo própria por loja nos cartões; (b) "nenhuma das três redes monitora tênis, chuteira, sapato": incluir todos os tipos de calçado em Esporte; (c) ver afiliação a Nike, Centauro, Adidas e outras de calçado, de preferência por API. Regras em jogo: sem dado fake, só API oficial ou coleta assistida, só novo e em linha, um jogo uma média (sem duplicata; variação de cor/tamanho não gera master), cotas (ML por Client ID, Shopee 8000/h) e orçamento único, nada destrutivo.

## Medição (#39, antes, somente leitura, 2026-11-12)
Ofertas cujo título é calçado de verdade (exclui raquete de tênis, bolsa, mochila, tênis de mesa), por rede:

| Rede | Ofertas ativas | Masters |
|---|---|---|
| Mercado Livre | 15 | 3 (todos chuteira, segmento `chuteira`, semeados) |
| Amazon | 1 | 1 |
| Shopee | 0 | 0 |
| Tênis (segmento `tenis`, qualquer rede) | 0 | 0 |

O achado do dono procede: a busca por "tênis" no banco devolve só raquetes e bolsas.

### Depois (mesmo dia, apply de `semear-vertical` com 200 chamadas ML, log de reversão `backup/logs/semear-vertical-2026-11-12T20-01-50-554Z.json`)

| Rede | Ofertas ativas | Masters |
|---|---|---|
| Mercado Livre | 43 (era 15) | 16 (era 3): 15 de chuteira, 1 de chinelo |
| Amazon | 1 | 1 |
| Shopee | 0 (cron de calçados só roda após o deploy; sem credencial local para dry-run) | 0 |
| Tênis ML | 0 | 0 (404 de catálogo sem vendedor) |

Rendimento 0,07 master por chamada; 57% dos candidatos eram catálogo sem vendedor (404). 13 masters novos, 28 ofertas, variações de cor/tamanho anexadas ao master existente (`planejado_anexar_cor_junta`), nenhuma duplicata de chave. Masters nascem em `review`.

## Causas medidas
1. **Mercado Livre, tênis:** o segmento `tenis` existe (domínio `MLB-SNEAKERS`) mas nunca foi semeado no apply; no dry-run de hoje 49 de 49 chamadas `/products/{id}/items` devolveram 404 (catálogo sem vendedor, o ML só expõe `items` quando há ganhador de catálogo). É limite do catálogo oficial, não do porteiro. Chuteira (`MLB-FOOTBALL_SHOES`) rende melhor (3 masters hoje, mais no dry-run).
2. **Chinelo, slide e sandália:** não existia segmento no ML (domínio `MLB-SANDALS_AND_CLOGS` medido hoje: 35 de 50 em "chinelo slide") nem na Shopee (slides estavam excluídos por `CALCADO_FORA`).
3. **Shopee:** `chuteira` estava explicitamente fora do recorte (`chuteira_fora_do_recorte`) e não havia chinelo/sandália; além disso a rota `discover-shopee-esporte` não está no `vercel.json` (decisão registrada como do dono) e não há credencial Shopee neste ambiente (dry-run local retorna `sem_credenciais`), então a semeadura Shopee só roda em produção.
4. **Amazon:** coleta assistida pela aba logada; a semeadura por categoria de calçado depende de abas e de tarefa do operador (fila #26/loops), sem mudar a cadência.
5. O porteiro de esporte e o escopo de compra (`escopo-compra.ts`) não barram calçado: não há piso para o tipo `tenis-calcado` (`tipos-produto.ts` já o reconhece) e a regra de demanda mínima foi aposentada.

## Decisão
1. **#39:** (i) novo segmento ML `sandalia-chinelo` (domínio medido, nicho exige marca esportiva, identidade marca+modelo+gênero, cor e tamanho fora da chave); (ii) Shopee passa a aceitar `chuteira` e `sandalia-chinelo` com léxico de linhas reais (Nike Mercurial/Phantom/Tiempo, Adidas Predator/Copa/F50/Adilette, Puma Future/Ultra/King, Mizuno Morelia, Umbro, Penalty, Havaianas...) e os termos de calçado vão à frente da fila de termos; (iii) semeadura ML de chuteira e chinelo via `semear-vertical.ts` (fila por tipo, orçamento próprio, cache de 404), masters nascem em `review` (invisíveis até o porteiro/aprovação); (iv) tênis ML segue na fila por tipo, mas o rendimento esperado é baixo pelo 404 de catálogo sem vendedor: reportar, não contornar com scraping nem com `/sites/MLB/search`. Sapato social e bota ficam de fora (não são Esporte; fora do recorte do dono "calçados para esporte").
2. **#40:** pesquisa registrada em `docs/03-metodologia/AFILIACAO_CALCADOS.md` com os passos do dono. Nenhum cadastro, conta ou aceite de termos feito pelo time.
3. **#38:** paleta abaixo, atrás da flag `CARD_COR_LOJA` (padrão ligado; `CARD_COR_LOJA=0` volta ao fundo único `#0B0908` sem deploy de código).

### Paleta (fundo do cartão por loja; texto creme `#F2E9D8`)
| Loja | Fundo | Contraste texto | Contraste secundário |
|---|---|---|---|
| Games | `#2B1760` violeta | 12,5 | 6,8 |
| Impressão 3D | `#0B3D40` petróleo | 9,9 | 5,4 |
| Tecnologia | `#0F2B6B` marinho | 11,0 | 6,0 |
| Livros | `#4D1239` ameixa | 11,9 | 6,5 |
| Casa/Eletrodomésticos | `#4D2D10` terra | 10,3 | 5,6 |
| Eletrônicos | `#33363D` grafite | 10,0 | 5,5 |
| Esporte | `#104522` pinho | 9,2 | 5,0 |

Critérios: tons escuros e dessaturados (premium dark, AA com folga, medido em `scripts/test-cor-loja.ts`, que também exige distância mínima entre lojas); a régua de calor usa cores saturadas em faixa e selo próprios no topo do cartão, então o fundo nunca disputa com 🟦🟩🟨🟧🟥; cantos retos; nenhuma imagem nova (só cor). Fora do escopo desta entrega: cartão de gráfico de preço (`price-card`, games) segue com fundo padrão; front web (listagens `/mercado`) fica como próxima etapa, pois o departamento ainda é fechado ao público (`MERCADO_UI`).

## Métrica de sucesso
- Calçados por rede e loja antes/depois (SELECT `scripts/medir-calcados.ts`), masters sem duplicata (`findExistingMasterProduct`/identidade).
- 7 cartões reais com fundo distinto e legível (render em `scripts/render-cards-lojas.ts`).
- Tabela de afiliação com passos do dono.

## Execução e verificação
- Executores: engenheiro-coleta, guardiao-catalogo, designer-marca, engenheiro-frontend, integrador-apis (pesquisa).
- QA: ver FLUXO_MESTRE e relatório final.

## Retrospectiva
Pendente: conferir em 24 h o número de masters de calçado por rede e se a Shopee de produção passou a criar `chuteira`/`sandalia-chinelo` em `review`.
