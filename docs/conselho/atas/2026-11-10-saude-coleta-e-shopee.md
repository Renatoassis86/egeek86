# Ata: saúde da coleta por rede, indicadores e Shopee (2026-11-10)

Porte: médio. Presidente: geek-lead (síntese do orquestrador). Pareceres independentes, só leitura: cientista-dados-tempo-real (saúde da coleta), estatistico-senior (indicadores), integrador-apis (Shopee e conformidade), qa-verificador (catálogo). Conselho consultivo; decisão de negócio é do dono.

## Pergunta
Os motores de extração, análise e indicadores continuam coerentes, por tipo de loja e vertical?

## Acordos
- **Mercado Livre games: saudável.** 576 rodadas/24 h todas ok, ~450 snapshots/h, 10.205 ofertas ativas 100% frescas em 6 h; 11 erros (10 deles 429). Fila de 9.178 devidas, mais velha ~3 h.
- **Verticais novas: saudáveis e pequenas.** 171 ofertas ativas, 35 masters, 0 erros, fila vazia. O gargalo é descoberta, não coleta. Esporte: sem rodada, oferta nem master.
- **Indicadores coerentes:** recálculo manual bateu 15/15 (média, mediana, mín, máx). price_daily_* atualizados hoje.
- **Catálogo coerente:** sem GTIN duplicado, sem vertical divergente, sem imagem repetida, sem vazamento (171 ofertas não-games dão 404; 0 "afiliad"); testes 20 PASS / 152/152 / tsc limpo.
- **Shopee: crítico.** 288/288 rodadas em 48 h pararam por 429 (~107 de 600 consultas); 709 snapshots/24 h; fila ~4.048.

## Pontos de atenção (não bloqueantes)
1. 26 ofertas gamer fora de 0,35x–3x a mediana ainda sem quarentena (o coletor gamer não tem a guarda das verticais); podem gerar menor preço falso.
2. 68 eventos de menor preço com min = prev_min; 936 masters com oferta ativa sem evento; 87% dos eventos são `reconstructed`.
3. 681 de 2.613 masters gamer com oferta ativa sem linha em price_daily_state; mediana de 2 dias medidos por master; 18 linhas abertas de dias passados (sem recálculo possível: ver ensaio de 10/11).
4. Quebra de série em 05/11 (de 768 para 607 masters com média; composition_flag 449 contra 113–156) por viés de seleção da emenda ADR 0004.
5. Magalu e Amazon não aparecem na coleta. Esporte descoberto.
6. Explicados: os 9 `general` da linha de base eram masters não-games; 8 masters gamer sem veredito seguem o desenho da descoberta (sem sinal de risco = sem veredito).

## Shopee: o que a documentação diz (docs/termos-shopee-2026-11-10/relatorio.md)
Limite documentado 8.000/h (por segundo e por app não documentados; erro 10030); Product Feed FULL/DELTA recomendado desde 2026-03-05; productOfferV2 sem máximo de `limit` documentado; sem cláusula sobre guardar/exibir histórico de preços.

## Divergência
O relatório da raspagem trata o nome "Shopee" na mídia (T&C 2.3(a)) como ambiguidade leve; o integrador lê o texto como proibição literal. Resolver com resposta escrita da Shopee e decisão do dono. O documento de integração do zip NÃO é adotado (não leu o código, grava "menor preço do dia" contra o ADR 0004, propõe tabelas paralelas, variável com nome errado, histórico da Shopee fora da média quebra "um jogo, uma média"): arquivado como `integracao-proposta-NAO-ADOTADA.md`.

## Decisões do dono pendentes
1. Texto do aviso de publicidade junto ao botão (proposta: "Podemos receber comissão se você comprar", sem a palavra "afiliado") para cumprir CONAR/CDC.
2. A Shopee entra na média e no histórico públicos? (sem isso a média deixa de ser "todas as lojas").
3. Enviar as perguntas à Shopee: pode exibir o nome/logo "Shopee"; pode guardar e exibir histórico; limite por segundo e por App ID; `limit` máximo; janela do 10030; consultar a cada 30 min é aceitável; colunas do feed e estoque.
4. Confirmar no portal que o domínio do site está cadastrado como mídia aprovada.
5. Autorizar o novo desenho do coletor Shopee (abaixo).

## Plano proposto (aguarda autorização)
1. **Coletor Shopee:** limitador de taxa persistido (<= 2 chamadas/s, <= 6.000/h, pausa após 10030), cadência por camadas (menor preço do master ou a <10% dele: 30 min; intermediárias: 3 h; cauda: 12 h), drenagem única do backlog, teste de `productOfferV2` com vários itens da mesma loja; uma chamada a `listItemFeeds` para medir o feed. Sem tabelas novas.
2. **Guarda de plausibilidade gamer:** quarentena dos 26 outliers e aplicação da regra 0,35x–3x também ao coletor gamer, depois de ensaio.
3. **Eventos:** investigar os 68 eventos min=prev e os 936 masters sem evento; usar variação das ofertas casadas no selo quando `composition_flag`.
4. **Verticais:** continuar semeadura em rodadas espaçadas (bola, notebook, geladeira, livros), esporte por último; vigiar os indicadores das verticais.
5. Calendário: 27/11 Black Friday; página pública só após decisão do dono e revisão jurídica.
