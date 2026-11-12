# Ata curta: Telegram sem teto diário (2026-11-11)

Ordem do dono: "como regra, enviar a quantidade de mensagens que o Telegram permitir, para todas as lojas. Se for ilimitado, mande ilimitado."

## Fato
O Telegram não limita mensagens por dia. Limita a taxa: ~1 mensagem/s por chat, ~20/min por grupo, ~30/s no total do bot, com HTTP 429 e `parameters.retry_after`. O teto global de 400/dia (408 enviadas, 74 na fila) era nosso, não do Telegram.

## Decisão
- `DAILY_CAP`, `DAILY_CAP_BLACK_FRIDAY`, `HOURLY_CAP`, `NIGHT_ALERT_CAP` e `CLASS_CAP` valem `NO_CAP` (1.000.000, efetivamente infinito). O conceito segue em `applyLimits(..., { caps })` para WhatsApp, envio manual e testes.
- Espaçamento global de 1 min removido do envio. Agora é por CHAT/loja (`chatSpacingBlock`): 3 s entre mensagens do mesmo chat (`SPACING_CHAT_SEC`) e no máximo 20 por minuto por chat. Uma loja não bloqueia a outra.
- 429: o sender espera até 8 s (`maxRetryAfterSec`); acima disso devolve a linha à fila SEM gastar tentativa (nada foi enviado, então não duplica nem vira 'erro').
- Cron: esvazia a fila em laço dentro de 38 s (`SEND_BUDGET_MS`), até 60 envios por execução, relendo o histórico a cada envio; lê até 300 linhas da fila. Parada em falha/429 longo. `maxDuration` continua 60 s.
- Mantidas todas as regras de qualidade: preço real e reconferência ao vivo, validade (proposta > 6 h expira), 1 h entre reenvios do mesmo produto, só novo e em linha, régua de média, noite sem som, sem a palavra "afiliado".

## Riscos
- Volume muito alto de mensagens: risco de saturar o canal e de saída de inscritos; o freio por queda de membros (`memberBrake`) continua ativo.
- Banco: a linha da loja games (migração 0032) ainda guarda 400/60; não alterada (sem escrita em produção).
- Throughput real depende do tempo de reconferência ao vivo (até 8 s por mensagem) e do cartão (até 8 s).
