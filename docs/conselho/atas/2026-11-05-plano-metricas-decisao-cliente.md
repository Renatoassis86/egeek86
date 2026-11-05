# Ata: plano de métricas para decisão de compra (rodada 1)

Data: 2026-11-05. Presidente: geek-lead (síntese feita na sessão). Porte: grande.
Pergunta do responsável: qual plano de métricas é coerente com boas práticas, eficiente e eficaz na cobertura de preços e na decisão do cliente.
Membros: estrategista-mercado, especialista-precos, estatistico-senior, cientista-dados-tempo-real, gamer-veterano, key-user-gamer. Pareceres independentes, somente leitura.

## Acordos (6 de 6 ou quase)
1. Nenhum veredito (Bom/Menor/Acima) com histórico curto (<14 dias, <3 ofertas). Mostrar fatos brutos: preço agora, menor já visto com data e loja, dias de histórico.
2. Vendedor fraco fora do "menor de sempre/90d".
3. Sem previsão de preço, sem nota composta, sem "de/por" do vendedor, sem frete ou cupom estimado.
4. Alerta de preço ("avise quando cair a R$ X") é o maior ganho de retenção; usa price_min_events. (Produto, não métrica: decisão do dono.)
5. Cobertura e frescor visíveis ao cliente ("N lojas", "verificado há X h").
6. Topo da página responde antes de medir: uma frase de decisão; detalhes recolhidos.

## Divergências
- **D-A. Base do veredito.** Estatístico (veto): comparar o menor preço vigente com a série dos mínimos diários de 30 dias (Omnibus) e usar a distância à mediana das lojas só como descritor; a regra atual mede dispersão entre lojas, não desconto no tempo. Estrategista/especialista: mediana vigente entre lojas como âncora principal, funciona desde o dia 1. Decisão anterior do dono (2026-11-05): selo compara com a mediana.
- **D-B. Média e mediana no primeiro nível.** Gamer veterano e usuário final: escolher uma ou rebaixar a "Detalhes". Dono pediu média e mediana históricas.
- **D-C. Frescor.** Cientista de tempo real (veto): frescor por cotação (48h) mede o heartbeat de 24h; usar confirmação de preço. Regra vigente da ata: cotação 48h.
- **D-D. Limiar.** Estatístico e especialista: faixa relativa à dispersão robusta em vez de ±5% fixo; calibrar em backtest.
- **D-E. Legado.** Estatístico: oferta-dia é imune à frequência, então o legado pré-31/10 pode ser reaproveitado como qualidade inferior (hipótese a medir). Contraria D3 aprovada.

## Medições (cientista de tempo real, 2026-11-05)
2.531 produtos com oferta ativa; 1.016 (40%) com 3+ ofertas; 97% com uma única rede (ML), só 66 com 2+ redes. Frescor da checagem: p90 2,3 h. Nenhum produto com 14 dias; 714 com 5+ dias e 3 ofertas completas. Só 16 produtos vigiados a 5 min. Não há registro de execução dos crons. A oferta de 491 h é expirada, não ativa.

## Riscos
Viés de sobrevivência (falta histórico de status da oferta por dia); oferta-dias não independentes; "menor" por erro de anúncio (maldição do vencedor); cota da API do ML desconhecida; selo muda de -32,6% para -9,8% sem nota de transição.

## Plano proposto (a aprovar pelo dono)
1. Topo: frase de decisão + preço agora + cobertura; rótulos "Abaixo do usual / Preço normal / Acima do usual" (3 níveis); "Histórico curto" com saída útil; detalhes recolhidos; jargão só em tooltip.
2. Veredito novo só após backtest contra baseline "preço ≤ mínimo de 30 dias"; até lá, só descritores factuais.
3. Observabilidade: tabela collector_runs, last_price_confirmed_at, SLOs e alertas; cobertura por camadas (T0–T3).
4. Sombra por 3–5 dias antes de ligar; veredito só a partir de ~14/11.
5. Alerta de preço como fase seguinte.

## Fora de escopo
Previsão, sazonalidade modelada, nota única, média aparada/IC formal/bootstrap, matched model na tela, backfill pré-31/10 (salvo medição do legado), cadência global de 5 min, fontes sem API oficial.

## Vetos registrados
Estatístico: não ligar o veredito atual. Tempo real: não usar idade da cotação como frescor, não ligar sombra e selo juntos, não subir cadência sem ler a cota. Gamer veterano: nada de veredito com <14 dias ou <3 ofertas. Usuário final: não ligar PRICE_METRICS_V2 ao público sem frase de decisão, saída para histórico curto e menos jargão. Estrategista: veredito antigo não pode ficar visível com histórico curto.

## Decisões do responsável
- **D-A (2026-11-05): aprovada.** A mediana das lojas aparece como fato ("X% abaixo da mediana das lojas hoje"); o rótulo de juízo vem da série dos mínimos diários de 30 dias e só é liberado após backtest contra o baseline "preço ≤ mínimo de 30 dias".
- **D-B (2026-11-05): aprovada.** Topo: frase de decisão, preço agora e comparação com a mediana das lojas hoje. "Detalhes" recolhido: média histórica, mediana histórica e mínimos 30d/90d/de sempre com dias cobertos. Gráfico mantém as duas linhas de referência; a curva da média do dia fica atrás de um botão.
- **Alerta de preço (2026-11-05): aprovado no roadmap, fase própria, sem começar agora.** Canais pedidos pelo dono: e-mail, site (notificação no próprio site), Telegram e WhatsApp. Antes de executar: nova reunião do conselho com jurídico/segurança (consentimento e LGPD, opt-in/opt-out), integrador-apis (WhatsApp Business API oficial e custos; Telegram Bot; provedor de e-mail), dba/backend (assinaturas, fila, idempotência, limite de envios). Só API oficial.
- **Legado pré-31/10, medição feita (dba-postgres, somente leitura):** só 29% dos 763 produtos com 3+ ofertas têm dado legado; 5,9% (45) têm 14+ dias com 3+ ofertas; ganho real de elegibilidade ~52 produtos (7%); não existe histórico de status da oferta, e o viés de sobrevivência desloca o mínimo legado em mediana 12% (31% dos produtos afetados); diferença de mínimo entre regimes com p10 de -28%. Recomendação: NÃO usar no veredito, percentil, média, mediana, mín. 30d/90d; uso restrito (só "menor já visto" e contexto do gráfico, marcado "histórico antigo") apenas em produtos com 14+ dias com 3+ ofertas, sem lacuna >=7 dias e sem oferta inativa com legado. Reabrir em 14/11 ou quando o status diário da oferta existir. D3 mantida. Decisão do dono (2026-11-05): "Está bem" — D3 mantida, legado fora das medidas; reabrir em 14/11 ou quando o status diário da oferta existir.
