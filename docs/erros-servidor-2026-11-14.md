# Falhas recorrentes de jobs (investigação de 2026-11-14)

Fonte: `collector_runs` das últimas 24 h.

| Job | O que aparece | Causa | O que foi feito |
|---|---|---|---|
| `cobertura-shopee` | ~15 'error' em 24 h, a cada rodada (22 e 52) | Shopee devolve 10030 (rate limit) depois de 8 a 16 chamadas; o job para de propósito, salva o cursor e retoma na rodada seguinte, mas gravava `status='error'` | `rate_limit` agora fecha como `partial` (continua em `stopped_because='rate_limit'`). Teste `test-shopee-cobertura` 48/48. **Fica:** a cota está sempre esgotada nas rodadas; vale espaçar a cobertura ou dar a ela cota própria (decisão do dono) |
| `refresh-snapshots:stats` | 25 linhas 'running' sem fim, quase sempre as das :30 | Orçamento de 240 s + o último lote passa do teto de 300 s da função; a Vercel mata e o `run.finish` nunca roda | Orçamento do `part=stats` baixado para 190 s (`route.ts`). **Fica:** as linhas 'running' antigas (desde 13/11) são resíduo, sem efeito; limpar com UPDATE é decisão do dono |
| `group-messages` | 3 'error' em 24 h (03:16, 12:00/12:03 e 15:01) | `Failed query` transitório em UPDATE/SELECT da fila (instantes de carga no banco); a execução seguinte, 5 minutos depois, voltou ao normal | Nada a corrigir com segurança; a mensagem de erro do driver não traz a causa (timeout ou conexão). Sugestão: registrar `err.cause` no meta |
| `cupons-batimento` | 2 'error' às 14:47 | Não é falha: é o fim de uma execução manual dos loops (`estado: parado`, `motivo: operador`) quando reinjetei os scripts | Nenhuma |
| `cupons-vigia` | 1 'error' às 13:25 | Alerta `rede_sem_leitura` (Chrome sem ler cupom há 62 min) que não saiu: `semEnvio: canal_interno_nao_configurado` | **Ação do dono:** configurar o canal interno de aviso, para o alerta chegar quando os loops do Chrome param |

Arquivos alterados: `src/server/collector/cobertura-shopee.ts`, `src/app/api/cron/refresh-snapshots/route.ts`.
