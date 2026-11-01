# Ata do Conselho Geek: cartela de produtos, segmentação por dimensão e fotos

- **Data:** 2026-10-31
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados:** estrategista-mercado, especialista-precos, gamer-veterano, key-user-gamer, matematico-aplicado, qa-verificador (pareceres independentes, rodada 1)

## Briefing
Pedido do dono: (a) fotos de produto bem diagramadas em quadros, layout profissional; (b) cada campo de busca mostra só a sua dimensão (jogos só jogos, consoles só consoles, eletro só eletro), sem chaveiros e itens fora da cartela; (c) nos games, preferência a jogos, consoles e acessórios que se usam nos jogos.
Decisões: D1 fronteira das dimensões; D2 destino do que fica fora; D3 acessórios; D4 ordem na busca geral; D5 layout das fotos; D6 como corrigir os dados.

## Números reais medidos pelos membros (SELECT, 2026-10-31)
- 716 produtos públicos (549 game, 127 accessory, 40 console).
- Violações da cartela entre os públicos: 48 (6,7%) por regra de título (QA). Auditoria amostral n=250: 14 erros de dimensão, 5,6% (IC 95% de Wilson: 3,4% a 9,2%) (matemático).
- Itens na aba errada com item legítimo: 21 (game→console 5, game→accessory 9, console→accessory 4, accessory→console 3) (QA).
- A regra automática atual detecta só 2 dos 14 erros da amostra: recall de cerca de 14%, amostra pequena (matemático).
- 11 dos 40 consoles têm cara de bundle ou usado; cerca de 70 jogos com padrão de digital/código; 90 jogos (16%) sem formato e edição; GTIN vazio em 100% dos ativos (especialista-precos).
- 8 a 62 ofertas/produtos sem foto, conforme a contagem (QA: 8 produtos públicos; especialista: 62 de 2.490 ofertas).
- Chaveiro, funko, pelúcia, camiseta, caneca e amiibo: 0 ocorrências ativas hoje. O ruído real é pôster, figura, brinde, mangá, peça de reparo, cadeira e teclado (QA).

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha |
|---|---|---|
| estrategista-mercado | Apoio com ressalvas | Cartela estrita; não apagar o que sai (Colecionáveis é candidata futura); filtrar na leitura primeiro |
| especialista-precos | Apoio com ressalvas | Regra no nível do master_product, antes de média/menor preço; bundle e digital não entram na média |
| gamer-veterano | Apoio com ressalvas | Bundle console+jogo é console; Collector com disco é jogo; foto por aba (jogo ~3:4, console 4:3 ou 1:1, acessório 1:1) |
| key-user-gamer | Apoio com ressalvas | Cartela curta e rígida; chips com contagem por aba; mensagem "não monitoramos esse tipo" |
| matematico-aplicado | Apoio com ressalvas | Regras determinísticas primeiro, modelo só como sugestão; ranking S = R·W·A; auditoria n=250 |
| qa-verificador | Apoio, com critérios de aceite | Publicar primeiro só a camada de leitura; UPDATE só nos ~21 casos inequívocos, com backup e autorização |

## Consensos
1. **D1:** Jogos (mídia física, inclui edição de colecionador com disco), Consoles (o aparelho), Acessórios de uso no jogo (controle, headset, carregador/dock/bateria, cartão de memória/SSD, volante, arcade stick, case, base/cooler) com plataforma explícita. Fora: merchandise, peça de reparo, digital/código, usado, clone genérico, cadeira, teclado/mouse, DLC isolado.
2. **D2:** o que fica fora some das superfícies públicas, mas permanece no banco com motivo (`reason_code`). Nada é apagado. "Colecionáveis" e "Tecnologia" são dimensões futuras.
3. **D6:** primeiro a camada de leitura (reversível, sem gravar), depois UPDATE de `product_type` só nos casos inequívocos, com backup, dry-run e autorização. Nunca reclassificar sozinho por modelo.
4. **Regra única** em todas as superfícies (busca, autocomplete, chips, home, ranking, monitoramento, tabela, contadores), para os números não divergirem.

## Divergências e resolução
- **Bundle console+jogo.** Gamer-veterano e matemático: é console (o preço é do aparelho). Especialista-precos: não pode entrar na média/menor preço do console puro (distorce). Estrategista: console só se o item principal é o console. Resolução proposta: aparece na aba Consoles com selo "Bundle" e **fora** do cálculo de média e menor preço do console puro. Lote de jogos fica como jogo, com flag `bundle`, fora da média de jogo único. **Pendente de decisão do dono.**
- **Foto 1:1 único vs proporção por aba.** Estrategista, QA: 1:1 com contain. Gamer-veterano, key-user, especialista-precos: Jogos em 4:5 (capa vertical), Consoles e Acessórios em 1:1, sem misturar proporções na mesma grade. Resolução proposta: Jogos 4:5, demais 1:1 (o componente já suporta as duas). **Pendente de decisão do dono.**
- **Ordem na busca geral.** Estrategista, key-user: seções separadas com chips de contagem. Matemático: ranking S = R·W(d)·A com W(jogo)=1, console 0,85, acessório 0,7 (pesos são hipótese; pedir A/B). Gamer-veterano: a consulta que cita o console ou o acessório traz essa dimensão primeiro. Resolução proposta: chips com contagem; dentro de cada aba, relevância e depois disponibilidade; preferência jogo > console > acessório só para empate e consulta ambígua.
- **Fila de revisão humana.** Custa tempo do dono; reduzir a revisão sobe o erro residual (matemático).

## Itens de curadoria para o dono
PlayStation Portal (acessório?), edição de colecionador sem mídia (fora), DLC/add-on (fora), amiibo e steelbook sem jogo (fora agora, "Colecionáveis" no futuro), cadeira gamer e teclado (vão para Tecnologia no futuro).

## Plano proposto (em ordem)
1. Regra única de dimensão no código, com teste de tabela de pelo menos 60 títulos reais (48 ocultos, 21 movidos, 30 jogos legítimos com Kit/Bundle/Deluxe/Collector). Ampliar as regras de fora-da-cartela (hoje o recall é baixo).
2. CSV com ocultos e movidos para o dono revisar.
3. Foto: quadro com proporção por aba, `onError` com placeholder, `aspect-ratio` reservado.
4. Build, QA com os 10 critérios de aceite do qa-verificador, publicar só a camada de leitura.
5. Verificar em produção as buscas zelda, switch, controle, resident evil, headset e os contadores.
6. UPDATE de `product_type` dos ~21 casos inequívocos, só com backup e autorização.
7. Auditoria amostral n=250 após a publicação.

## Métricas de sucesso
- Itens fora da cartela na vitrine: 0 (hoje 48). Erro de dimensão nos públicos ≤ 1% (hoje 5,6%).
- Contadores iguais em todas as telas. Zero master duplicado. CLS 0 nos cards.
- Busca sem resultado não sobe. Taxa de clique por busca acompanhada antes e depois.

## Decisão do responsável do projeto (2026-10-31)
- **Bundle de console com jogo:** aprovado como proposto. Aparece na aba Consoles com selo "Bundle", fora da média e do menor preço do console puro.
- **Fotos:** aprovado Jogos em 4:5 e Consoles/Acessórios em 1:1, sem misturar proporções na mesma grade.
- **Pendente:** curadoria dos itens listados acima (PlayStation Portal, colecionável sem mídia, DLC, amiibo, cadeira/teclado). Enquanto não houver decisão, vale a posição do conselho: ficam fora da vitrine, sem apagar nada.

## Execução e verificação
- Executores: guardiao-catalogo (regra de dimensão, relatório), engenheiro-frontend (fotos).
- QA: pendente.

## Retrospectiva
Preencher depois de entrar no ar.
