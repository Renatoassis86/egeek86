# Ata: indicadores de decisão do cartão de produto vs. assimetria de informação (2026-11-06)

Porte: médio. Presidente: geek-lead (síntese feita pelo orquestrador). Pareceres independentes, em paralelo: estrategista-mercado, especialista-precos, gamer-veterano, estatistico-senior, key-user-gamer, qa-verificador. Conselho consultivo; decisão de negócio é do responsável.

## Pergunta
Que indicadores o cartão "O que sabemos hoje" + camada devem mostrar para o comprador gamer decidir com menos assimetria de informação? O que entra na 1ª abertura, o que espera histórico, o que não construir?

## Acordos (6 de 6)
- **1ª abertura (já construído):** preço agora com loja e "verificado há X h"; comparação com o valor do meio (mediana) das lojas hoje, sempre com N; Lojas de hoje (2+ vendedores); "Acompanhando há N dias"; gráfico de dias medidos (2+) sem interpolar; Qualidade e método (recolhido).
- **Falta e é a prioridade de maior retorno: identidade da mídia no cabeçalho** (plataforma, físico/digital, edição). Citada por 5 de 6. Só exibir o que o dado sustenta; ausente = "não informado".
- **Esperam histórico:** mín/máx 30 e 90 dias; juízo Bom/Menor/Acima (14 dias + backtest ~14/11); alerta de preço (fase própria, LGPD).
- **Não construir:** nota composta, previsão, "melhor momento", frete estimado, preço de lançamento estimado, "de/por" copiado do anúncio, score próprio de vendedor.
- **Linhas vermelhas comuns:** sem dado fake/interpolado; um jogo, uma média; sem veredito, cor semântica ou "compre" antes do backtest; sem "afiliado"; cantos quadrados; só API oficial.

## Divergências e nuances
- **Rótulo de extremos:** estatístico exige cobertura >= 70% dos dias da janela para chamar de "30 dias" (~21/11) e "90 dias" (fim de janeiro); antes, "menor desde DD/MM". Demais pareceres aceitam ~14-17/11. Prevalece o mais rígido (é regra de honestidade do rótulo).
- **Mediana:** estatístico: com 2 vendedores mostrar só os valores, sem mediana nem %; com 3+ mostrar faixa e N. QA: `fato` só com 3+ vendedores. Trocar "mediana" por "valor do meio" no texto principal (key-user-gamer).
- **Reputação do vendedor:** key-user-gamer quer o aviso binário atual na abertura; estrategista e QA: só o aviso, nunca número ou nota. Sem divergência de fundo.
- **Identidade da mídia:** QA condiciona ao tratamento dos ~1.248 jogos de formato `unknown` (senão afirmaria "Físico" sem base); estrategista cita cobertura de formato/plataforma > 97% e edição ~70%; gamer-veterano e estatístico alertam para edição desconhecida em ~30% e região inexistente como dado. Resolução: exibir por campo e só onde há dado.
- **Última mudança do menor preço:** regra do dono; QA diz não verificável enquanto os eventos estavam parados.
- **Gamer-veterano vs. possível juízo na 1ª abertura:** registrado, sem conflito (juízo está proibido até o backtest).
- Efeito de composição (oferta que entra/sai muda a mediana sem o preço mudar): estatístico pede aviso; o piloto multi-catálogo também invalida comparação antes/depois.

## Fato novo medido durante a reunião
Os eventos de menor preço **voltaram** após `PRICE_DAILY_SHADOW=1`: último evento 2026-11-06 22:55 UTC; 21 eventos nas últimas 2 h. Pré-condição 1 do QA atendida para o fluxo novo; as lacunas por produto e os 9-10 sem evento seguem pendentes.

## Decisão proposta (aguarda o responsável)
1. **1ª abertura = o que já está construído** + **identidade da mídia no cabeçalho** (nova fase), por campo e só com dado.
2. **Mín/máx** com rótulo do período efetivo; "30/90 dias" só com cobertura >= 70%.
3. **Juízo** só após backtest; **alerta** em fase própria.
4. **Pré-condições para ligar PRODUCT_CARD_V1 e PRICE_METRICS_V2 ao público (QA):** (a) eventos recentes [ok]; (b) paralelo SQL em 30+ produtos com diferença zero em preço, mediana, lojas, dias; (c) zero duplicata entre os produtos exibidos; (d) suíte test-parecer-produto verde; (e) produtos do piloto de coleta fora da 1ª abertura ou escopo congelado; (f) QA no navegador (2 temas, mobile); (g) autorização do dono com reversão testada.
5. Fora de escopo: nota composta, previsão, frete, preço de lançamento, score de vendedor.

## Dados que ainda faltam
% de produtos com 3+ vendedores e cobertura >= 70% dos dias; cobertura real de edição/formato (`unknown` ~1.248); se a API oficial expõe reputação/frete; teste de 5 s com 5 gamers (depende de revisão jurídica); taxa de abertura da camada.

## Retrospectiva
Preencher após a abertura: o comprador entende em 5 s? paralelo SQL fechou com diferença zero?

## Execução: identidade da mídia (2026-11-06)
Autorizada pelo responsável. `src/lib/pricing/identidade-midia.ts` (função pura) + `scripts/test-identidade-midia.ts` (12 checagens). A camada mostra Formato, Plataforma e Conteúdo, cada um com valor ou "não informado" (nunca afirma sobre `unknown`), mais a regra de identidade das médias em uma linha. Console/acessório: um item. Rótulo "Conteúdo" (jogo completo/DLC/pacote/bundle) porque edição de colecionador, região e lacre NÃO existem como dado. Aparece só com PRODUCT_CARD_V1 ligada. Não verificado em navegador; sem commit/deploy.
