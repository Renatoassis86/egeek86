# Auditoria "dados e decisão em tempo real" (2026-11-16)

**Pedido do dono:** "dados e decisão em tempo real; não faz sentido enviar dados velhos e passados, isso prejudica o modelo de negócio; a ideia é pegar a oportunidade e enviar os dados e indicadores necessários para a decisão. Cuidado para não deixar processos e códigos inacabados; implementar por etapas; antes, o relatório."
**Método:** conselho com 4 frentes independentes e só de leitura (coleta, cadeia de decisão e indicadores, mensagens e canal, Guia Mestre versus código). Marcas: MEDIDO (SELECT em 16/11 à noite), CÓDIGO, NÃO VERIFICADO. Nada foi alterado no código nesta etapa.

## 1. Veredito em uma tabela

| Camada | Em tempo real e correto? | Medida |
|---|---|---|
| **Preço dito nas mensagens do canal** | **Sim** | 657 enviadas em 24 h; conferido ao vivo (mediana e p90 de 0 min), 0 passaram de 60 min, divergência máxima de 1%; em amostra de 140 (últimas 6 h), 138 batem com o banco |
| **Coleta, Mercado Livre games e tecnologia** | Sim | mediana 18 a 30 min, p90 46 a 67 min |
| **Coleta, ML eletroeletrônicos** (8.163 ofertas) | **Não** | mediana 116 min, p90 179 min; fila vencida de 5,9 a 6,7 mil; erros de socket |
| **Coleta, Shopee fora de games** | **Não** | esporte com 92 h; 99% das execuções do `collect-shopee` terminam por orçamento de tempo |
| **Coleta, Amazon** | **Não** (exceto a cabeça das impressoras) | 25 de ~2.600 ofertas (1%) com leitura de até 45 min; mediana de 65 h |
| **Amazon no site** | **Não** | 295 de 320 ofertas clicáveis (92%) com leitura de mais de 45 min; mediana 14,4 h, p90 21,9 h |
| **Indicadores (média, mínima, selo)** | **Parcial** | recálculo no prazo (mediana 26 min); mas 736 dias passados abertos e média ausente em 70% dos produtos de hoje |
| **Decisão: o que o robô escolhe enviar** | **Parcial** | 53% do volume é o aviso "Em monitoramento", sem média, mínima nem desconto; quedas fortes retidas ou expiradas |

## 2. O que está bom (com a medida)
- A **reconferência ao vivo antes do envio funciona**: o preço do texto é o preço do momento. A divergência do caso P2S era de **entrega e de leitura velha da Amazon**, não do mecanismo geral.
- O recálculo de indicadores e snapshots está no ciclo previsto (estado diário, mediana de 26 min).
- A cabeça das impressoras 3D na Amazon (R-81) está fresca: ~20 min.

## 3. O que fere a regra do dono (por gravidade)

**G1. O site mostra preço velho da Amazon.** O limite de 45 min (R-81) só existe em mensagem e lista do privado (`confirmacao-preco.ts`). No site vale 24 h (`departamentos.ts:41`, `offer-card-model.ts:22`, `amazon-mode.ts:21`). A mensagem barra o preço que o site exibe: é a mesma raiz do erro do Telegram × página (R-86).

**G2. Há vários limites de idade para o mesmo dado, em arquivos diferentes** (CÓDIGO):
- Amazon: 45 min (`confirmacao-preco.ts`), 40 min no envio e 60 min na detecção (`group-rules.ts:138-139`, não leem `AMAZON_FRESCOR_MIN`); R-21 e o SLO da seção 12 ainda dizem 40.
- Clicável: 24 h no departamento (`departamentos.ts`), **168 h na vitrine** (`vitrines/regras.ts:33`), 7 dias em `public-offers.ts` e `daily-state.ts`; card de 6 h; página do produto de **48 h** (`parecer-produto.ts:231`).
- Cupom: 3 constantes (120 min, 120 min, 24 h); recheck de 30 min em 3 lugares; "6 h" espelhado à mão.

**G3. Cobertura de coleta.** ML eletroeletrônicos (fila vencida e erro de socket em `collect-vertical:eletroeletronicos`), Shopee fora de games (esporte 92 h) e Amazon fora das impressoras 3D não geram oportunidade em tempo real. A R-81 documenta "ciclo de 2 h" para a Amazon; o medido é 65 h (CÓDIGO × MEDIDO).

**G4. A decisão do robô.** O aviso "Em monitoramento" (349 de 657) sai sem indicador algum e espera na fila mediana de 121 min (p90 342 min). Na fila de 24 h, 4.468 propostas expiraram por TTL de 6 h, incluindo quedas fortes (40 a 50% sobre a média) retidas **sem motivo registrado**. Cupom sai sem validade. Isso é "dado velho vencendo a oportunidade".

**G5. Indicadores.** `dia_passado_aberto = 736` (683 nunca recalculados depois de virar o dia; causa em `price-daily.ts:225`); média nula em 3.803 de 5.447 produtos (70%); 4 ofertas de vendedor fraco dentro da média (r2-4). Não verifiquei se há selo "compra boa" sem média (teste de paridade R-86 ainda não existe).

**G6. Governança.** Não existe regra de estoque no Guia; o SLO "frescor da Amazon no envio" não tem medidor; só o showcase tem alarme de snapshot; documentação defasada (26 crons e não 24; `collect-shopee` a cada 5 min e não 10); `FRETE_PRAZO_IMPRESSORAS` desligada por padrão (a captura da Amazon pelo loop 1.3.0 funciona; a flag liga a captura do ML no servidor).

## 4. Plano por etapas (cada uma com critério de aceite; nenhuma deixa ponta solta)

| Etapa | O que | Risco | Aceite |
|---|---|---|---|
| **E1** | **Medidor de frescor** (script + invariantes no portão completo): idade p50/p90 do preço exibido por rede e superfície, e do preço enviado | zero | números de G1 a G4 reproduzidos sozinhos; entra na linha de base |
| **E2** | **Orçamento único de frescor** em código (`src/lib/frescor/orcamento.ts`); migrar Amazon 40/45/60 para um valor; teste do portão falha se houver literal de idade fora do arquivo | baixo | `AMAZON_FRESCOR_MIN` governa envio, lista, card e detecção; nenhum literal fora |
| **E3** | **Site da Amazon com a mesma regra** (45 min) por flag reversível; sem leitura fresca, a oferta mostra "visto há X" ou sai da vitrine | médio | teste falha com Amazon de 2 h no card; amostra de produção com `>45 min` caindo para ~0 |
| **E4** | **Mensagens**: motivo gravado em `retida`/`expirada`; TTL por gatilho (aviso de monitoramento 90 min); **prioridade das quedas fortes** sobre o aviso; cupom com validade ou sem envio | médio | 0 retidas sem nota; queda forte do surgimento ao envio abaixo de 10 min |
| **E5** | **Cobertura**: causa dos erros de socket em eletroeletrônicos; cadência da fila vencida; **decisão do dono** sobre Shopee fora de games; ampliar a cabeça da Amazon (ex.: aspiradores da Casa) com ofertas vendáveis | médio | mediana de eletroeletrônicos abaixo de 45 min; Amazon vendável com leitura de até 45 min acima de 60% |
| **E6** | **Dados**: reprocesso dos 736 dias (script R-74, backup e rollback) e fechamento do dia anterior no job; teste de paridade preço × média × selo × link (#133) | médio | `dia_passado_aberto = 0`; paridade 0 divergências; 0 "compra boa" sem média |
| **E7** | **Guia Mestre e SLOs**: R-89, SLOs com medidor, documentação dos crons, regra de estoque | zero | seção 12 com medidor para cada SLO |

**Não fazer:** afrouxar o 45 min da Amazon; desligar a contenção da Amazon inteira; encurtar o limite do ML e da Shopee de 24 h para 45 min sem medir a taxa de coleta; aumentar `maxDuration` ou frequência dos crons antes de resolver os erros de socket; reescrever dias fechados sem backup; um único número para tudo (24 h clicável, 7 dias de série e 45 min de preço têm funções diferentes).

## 5. Decisões que dependem do dono
1. **A vitrine do site deve cair de 168 h para 24 h?** (hoje contradiz a R-56 e a regra do tempo real.)
2. **Amazon no site:** quando o preço passa de 45 min, mostrar "visto há X" ou tirar a oferta da vitrine? (recomendo o "visto há X" até a cobertura crescer.)
3. **Shopee fora de games** (esporte, casa, tecnologia): incluir na coleta ou assumir explicitamente que fica fora da divulgação.
4. **O aviso "Em monitoramento"** (53% do volume, sem indicador): manter com TTL curto, só enviar com média, ou rebaixar atrás das quedas fortes?
5. Aprovar a **E1** (medidor, zero risco) como primeira etapa.
