# ADR 0011: Validação de identidade em rodadas e cerca estatística

Data: 2026-11-11. Status: **PROPOSTO (rascunho, não aceito; depende do dono).** Ata: `docs/conselho/atas/2026-11-11-time-identidade-itens.md`. Estende o ADR 0006 e propõe emenda ao ADR 0004. Nenhum ADR aceito foi alterado.

## Contexto
Medido em 2026-11-11 (SELECT): em 1.633 masters com 3 ou mais ofertas ativas, 15% a 40% por departamento têm razão máximo/mínimo > 2 (games/jogo: 212 de 661). Casos: PS5 Slim Digital (R$ 3.725 a valores sentinela), Resident Evil Generation Pack Ns2 (R$ 439,90 a R$ 990). A média mistura pacote, edição, modelo e revendedor inflado, e o selo herda a poluição.

## Decisão proposta
1. Toda média pública exige veredito de identidade `validada` sobre a assinatura atual do conjunto de ofertas (hash de chave + ids). Estados: `validada`, `em_revisao`, `reprovada`, `nao_calculavel`.
2. Rodadas: R1 chave determinística por departamento; R2 auditoria cega (sem preço e sem a chave); R3 dispersão (ratio, IQR/mediana, gap bimodal, média x mediana); R4 confirmação de atributos pela API oficial. Segundo auditor quando houver discordância, confiança média/baixa, mais de 30 ofertas ou mensagem automática.
3. Separação de funções: quem classifica não audita; quem vê preço não classifica; preço alarma, não prova.
4. Oferta nova entra provisória (visível, fora da média) até as rodadas incrementais. Revalidação completa a cada 7 dias (24 h para masters com mensagem automática).
5. Cerca de Tukey em log-preço, só depois da identidade validada e com 5 ou mais ofertas aceitas: oferta acima/abaixo da cerca fica visível e marcada, sai da média, do selo e da mensagem; mediana exibida junto. Com menos de 5, vale o piso/teto de plausibilidade (ADR 0002).
6. Média não validada: sem selo, sem percentual contra a média, sem mensagem automática baseada na média; mostra "Preço em revisão" e as ofertas reais com preço e horário.
7. Emenda proposta ao ADR 0004 (Emenda 2026-11-05, item 3): "média do dia = média simples dos preços oferta-dia das ofertas vigentes **de identidade validada e dentro da cerca**". Parágrafo proposto para a regra "Um jogo, uma média só" em `AGENTS.md`: "A média só usa ofertas de identidade validada em rodadas independentes; oferta fora da cerca estatística fica visível, fora da média, e a mediana é exibida junto." (edição do `AGENTS.md` é do dono).

## Consequências
- Menos selos no curto prazo (médias em revisão ficam sem selo), mais confiança; o número de médias "validadas" vira indicador de saúde.
- Custo de classificação e auditoria (a estimar em piloto com PS5).
- Reversível: tabela de veredito é aditiva e a leitura fica atrás de flag de três estados (desligada, sombra, ligada); backup e log reversível em toda alteração de master/oferta.

## Alternativas descartadas
Usar só a cerca estatística (esconde mistura em vez de separar); validar por preço (circular); revisão manual de tudo (não escala).

## Pendências para aceitar
Decisões D1 a D5 da ata; calibração dos limiares com amostra rotulada; piloto PS5 e Resident Evil em simulação; confirmação independente do `qa-verificador` e do `estatistico-senior`.
