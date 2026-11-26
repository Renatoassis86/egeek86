# Parecer independente, Rodada 1: benchmark Pelando (produto e UX)

Data: 2026-11-26. Membros reunidos: estrategista-mercado, gamer-veterano, key-user-gamer, engenheiro-frontend/designer-marca. Somente leitura; nada foi escrito no produto.

Legenda: [F] fato observado (WebFetch da home em 2026-11-26, CSS/HTML de pel_deal.html, ficha research/benchmarks/fichas/pelando.md de 2026-10-28) | [I] inferência | [H] hipótese a validar.
Limite: a home buscada hoje veio sem cards ("Você viu tudo em Destaques"); detalhes de card vêm da ficha de 28/10 e do HTML da página de oferta (temperatura, contagem de comentários, estados de voto). Mobile não reconferido hoje.

## Posição
Apoio com ressalvas à adoção seletiva: copiar os mecanismos de retorno e descoberta (alerta, "quentes", estado encerrado, notificação), nunca o motor de comunidade aberta. O Pelando vence em recorrência e alcance; nós vencemos em verdade do preço. O caminho é "Pelando com a régua do Arkos": o termômetro é calculado, não votado.

## 1. Mapa do Pelando por jornada
| Jornada | O que existe | Retenção/tráfego |
|---|---|---|
| Descobrir | Abas Destaques, Recentes, Quentes, Mais baratos, Comentadas, Discussões, Listas [F]; comunidades temáticas (Tech Lover, Mundo Gamer, Para meu lar...) [F]; atalhos de cupons por loja (Amazon, ML, AliExpress, Shopee, Magalu) [F]; busca de promoções, lojas, discussões [F] | Feed vivo + "Atualizar feed"; páginas de cupom por loja capturam SEO de cauda longa [I] |
| Avaliar | Temperatura com nível (cold/normal/hot) por card e por oferta [F]; "N viram agora" [F, ficha]; comentários que sinalizam cupom esgotado [F, ficha]; selo de loja verificada, medalha de autor [F, ficha]. Sem histórico de preço nem comparação entre lojas [F, ficha] | A prova social é o produto; custo de moderação alto [I] |
| Decidir | Cupom copiável + "Ir para loja" em largura total [F, ficha]; estado Expirado com "ver similares" [F, ficha] | Expirado mantém a URL viva e recircula tráfego [I] |
| Comprar | Saída por link afiliado [I]; cashback ("Cashback" no menu) [F]; Missão Black Friday [F] | Monetização por afiliado e cashback [I] |
| Acompanhar | Alertas (/meus-alertas, badge 9+) [F]; promoções salvas [F]; notificações [F]; app iOS/Android [F]; "Criar alerta: escolha o preço" [F, ficha] | Principal motor de retorno [I] |
| Participar | Postar, chat, comentários, discussões, perfis com medalhas [F]; Userback de ideias, "Fale com o Pelando" [F]; Código de Conduta [F]; grupos WhatsApp e redes sociais [F] | Gamificação e UGC geram conteúdo e hábito, mas dependem de massa crítica e moderação [I] |

## 2. Quem faz melhor
Nosso diferencial (já no repositório):
- Verdade do preço: média única por oferta/dia, selo e régua (`src/components/regua/regua-oferta.tsx`, `src/components/affiliate/price-metrics-v2-block.tsx`, `verificado-ha.tsx`), verdade viva na vitrine (`src/server/messaging/verdade-viva.ts`, `live-recheck.ts`).
- Histórico de preço e gráfico (`src/components/monitoring/price-chart-v2.tsx`, `price-history-chart.tsx`, `src/app/(detalhe)/ofertas/[slug]/product-price-chart-section.tsx`); o Pelando não tem [F, ficha].
- Comparação entre lojas e cesta (`camada-lojas.tsx`, `src/components/search/product-stores-table.tsx`, `/monitoramento/comparar`), cupons com prova no item e cofre de validação (`src/server/messaging/guardiao-cupons.ts`, `coupon-item-lookup.ts`, R-63 a R-68), isca filtrada (R-61), identidade de produto (região/geração/edição).
- Curadoria estreita (só novo, sem miúdos): menos ruído que um feed aberto.

Pelando faz melhor:
- Recorrência: alertas, notificações, app, salvos [F].
- Sensação de "agora": temperatura, "viram agora", feed com tempo [F].
- Estado de oferta terminada que recircula tráfego [F, ficha]. Nós temos `src/app/(shop)/oferta-encerrada/page.tsx`; [I] conferir se oferece alternativa.
- Alcance e SEO de cupom por loja; comunidade como cobertura (pega o que o robô não vê) [I].
- Onboarding com login social (Google One Tap, informado no briefing).

## 3. Funcionalidades candidatas
Esforço P/M/G. Conflito = risco com regras do dono.

| # | Candidata | Valor para gamer/maker | Esf. | Já existe / dependências | Risco de conflito |
|---|---|---|---|---|---|
| 1 | Alerta de preço-alvo por produto (avisar ao chegar a R$ X ou à mínima) no Telegram e no site | Maior alavanca de retorno; o gamer espera o preço certo | M | `src/server/actions/price-watches.ts`, `src/components/geek-deals/watch-toggle-button.tsx`, `telegram-link-button.tsx`, `notification-preference-toggle.tsx`, `src/app/(shop)/conta`, `src/components/conta/profile-hub-tabs.tsx`, `src/components/monitoring/watchlist-panel.tsx`; falta gatilho com preço-alvo e envio individual | Médio: R-70 (link do dono), carga do envio (memória "análise pesada derruba o envio"), só leitura fresca (R-81/R-90), sem isca (R-61) |
| 2 | Alerta por tema/palavra-chave ("PS5 jogos até 100") | Cobre quem não sabe o produto exato | M | Base do #1; `src/components/search/*`; NLP de cesta (mensagem v4, `src/lib/messaging/mensagem-v4.ts`) | Médio: "sem miúdos" (filamento a granel é limite, validar com o dono) |
| 3 | Aba "Mais quentes" curada | Descoberta imediata das melhores quedas | P | `/ofertas`, `src/components/vitrines/*`, `monitoring/top-movers-table.tsx`, `/ranking`, `/hype-zone` | Baixo; não expor critérios internos |
| 4 | Temperatura calculada (desconto vs média única + variação 7d + frescor) | Evidência no lugar do voto; entendível sem explicação | M | `price-metrics-v2-block.tsx`, `regua-oferta.tsx`, `src/server/pricing/price-daily.ts`; ficha propõe fórmula auditável | Médio: R-71 a R-75 (rótulo verdadeiro, base única, dia fechado); média provisória aceita na beta |
| 5 | Página de oferta com histórico em primeiro plano | Responde "vale?" em 5 s | P/M | `src/app/(detalhe)/ofertas/[slug]`, `camada-grafico.tsx`, `camada-lojas.tsx`, `camada-gatilho.tsx` | Baixo; atenção ao tipo de preço Amazon (cheio x Pix, R-69) |
| 6 | Estado "Encerrada" com "mesmo produto em outra loja" e "avise-me quando voltar" | Recircula tráfego e alimenta o #1 | P | `src/app/(shop)/oferta-encerrada/page.tsx`, `src/server/messaging/ended-coupon-card.tsx` | Baixo; só sugerir anúncio ativo, novo e verificado |
| 7 | Resumo diário/semanal "o que caiu hoje" (Telegram, e-mail opt-in) | Hábito sem app | M | `src/components/geek-deals/weekly-promos-section.tsx`, `src/server/messaging/group-auto.ts`, canais existentes | Médio: mensagem v4, contatos só em /contatos, não abrir canais novos |
| 8 | Notificação push no navegador para os alertas do #1 | Substitui o app sem custo de loja | M | Service worker/PWA não identificado [I, verificar]; precedente de consentimento em `whatsapp-cart-consent-toggle.tsx` | Médio: LGPD/consentimento |
| 9 | Página de cupons por loja (Amazon, ML, Shopee, Magalu), só com prova | SEO + utilidade | M | `src/components/affiliate/coupon-carousel.tsx`, `src/server/actions/campaign-coupons.ts`, `guardiao-cupons.ts` | Alto se relaxar: R-63 a R-68, R-79, R-70 |
| 10 | Prova social medida ("N acompanham", "N cliques hoje") | Substitui "viram agora" sem inventar | P | Tabela de acompanhados (price-watches), contador de `src/app/go/[slug]` | Baixo; mostrar só acima de limiar; nunca inflar |
| 11 | Relato fechado ("preço errado / acabou") sem comentário público | Cobertura de erros sem UGC aberto | P/M | `src/components/survey/*`, `src/app/(shop)/pesquisa`, `src/server/actions/fila-classificacao.ts` | Baixo se o relato vai só ao admin |
| 12 | Login social (Google) para destravar alertas | Menos atrito | M | `src/app/login`, `src/app/entrar`, `src/app/auth` | Baixo; avaliar LGPD |

Ordem sugerida: 3, 6, 5 (P, ganham rápido); depois 1 e 4; depois 7, 8, 10.

## 4. O que NÃO copiar
- UGC aberto (postar ofertas, comentários, chat, discussões): moderação cara; risco de isca e de link de afiliado alheio (R-70, R-61); quebra "só novo", "sem miúdos" e "foto real" (foto de usuário vem com mão/usado). Substituir pelo relato fechado (#11).
- Votação como métrica de qualidade: manipulável; a temperatura é calculada (#4).
- Gamificação (medalhas, níveis): sem massa crítica e sem retorno para canal curado [I].
- Cashback: risco regulatório, fiscal e financeiro; conflita com link do dono (R-70) e com termos dos programas de afiliados [I, validar jurídico].
- Cupom sem prova (de comunidade ou concorrente): só pista (R-79).
- App nativo: custo alto; web push e Telegram cobrem [I].
- Comunidades por tema como produto: já existem 7 canais por vertical; não propor abrir novos.
- Mostrar regras internas (ordem, critério, metodologia) no front sem o dono pedir.

## 5. Três fluxos prioritários
### A. Alerta por produto no Telegram
1. Em `/ofertas/[slug]` e no card: botão "Avisar quando baixar" (sino) ao lado do "acompanhar" atual. Painel curto: "Avisar quando chegar a [R$ campo, sugerido = mínima 90d] ou quando bater a mínima". Mostra preço atual e mínima.
2. Sem login: Google/e-mail. Sem Telegram vinculado: "Conectar Telegram" (`telegram-link-button`). Confirmação: "Pronto. Você será avisado aqui."
3. Disparo (mensagem v4): título, preço atual, "R$ X abaixo da média", link do dono no corpo, estado "voltou/mínima". Só com leitura fresca (R-81/R-90) e sem isca.
4. Gestão em `/conta`: lista de alertas, pausar, apagar. Métricas: alertas ativos por usuário, cliques por alerta, reabertura.

### B. Página de oferta com histórico
Topo: foto real (contain), título, loja, preço grande e "R$ X abaixo da média de 90 dias" (selo `regua-oferta`). Abaixo, em ordem: "Ir para a loja" (largura total no mobile, 44 px mínimo) + "Avisar quando baixar"; gráfico 30/90/365 com menor preço marcado; tabela "mesmo produto em outras lojas" (só novo, mesma identidade); cupom provado se houver, com "verificado há X"; "quem acompanha: N" só acima do limiar. Se encerrada: faixa cinza "Oferta encerrada" + "mesmo produto em outra loja" + "avise-me quando voltar". Cantos retos, tema escuro padrão, sem texto de metodologia.

### C. "Mais quentes" curado
Em `/ofertas`, abas: Quentes (padrão), Mais baratos, Recentes, Em monitoramento. "Quentes" ordena pelo termômetro calculado e mostra três níveis (morno, quente, muito quente) com rótulo textual, nunca contagem de votos. Card: foto, preço, queda vs média, loja, "coletado há X" (Amazon), "avisar" e "ir". Só leitura fresca; sai por pausa, estoque ou não vendido (R-90). Mobile: abas rolantes e tab bar Início/Quentes/Alertas/Conta.

## Pontos de validação
- [H] Alertas elevam recorrência: medir alertas criados por visitante e reabertura por mensagem.
- [H] Temperatura calculada é entendida sem explicação (testar em `/pesquisa`).
- Verificar se há service worker/PWA para web push (#8).
- Perguntar ao dono: alerta por tema (#2) e filamento em volume.
- Jurídico: cashback e e-mail marketing (LGPD).

## Regras do dono respeitadas
Só novo e em linha; sem miúdos/retrô/usado; foto real; regras internas fora do front; contatos só em /contatos; links de afiliado do dono (R-70); preço só com prova e leitura fresca.
