# Rollout da home nova: plano e rollback (2026-11-15)

Decisão do dono: 10% em 19/11, 50% em 21/11, 100% em 22/11 de 2026. Nada foi ligado até aqui (a linha `redesenho_home` nem existe; efetivo 0%).

## Como é controlado
Linha `redesenho_home` de `feature_flags` (`enabled` + `rollout_percentage`), lida por `src/server/redesenho-home.ts` com cache de 30 s por instância; `enabled=false` = 0%. O visitante cai sempre no mesmo grupo (cookie `eg_v`). `?v=2`/`?v=1` só para admin. Sem deploy. Não existe agendador por data no sistema.

## Comandos (dry-run por padrão)
```
npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --etapa 10            # simula
npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --etapa 10 --apply    # aplica (recusa antes de 19/11 00:00 BRT)
npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --etapa 50 --apply    # a partir de 21/11
npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --etapa 100 --apply   # a partir de 22/11
```
**ROLLBACK imediato** (home atual em até 30 s): `npx tsx --env-file=.env.local scripts/rollout-home-nova.ts --rollback --apply`
(equivale a `UPDATE feature_flags SET enabled=false, rollout_percentage=0 WHERE key='redesenho_home'`).
Salvaguardas: backup em `docs/backups/rollout-home-nova-backup-<ts>.json`, log em `docs/backups/rollout-home-nova-log.ndjson`, recusa antes da data (`--ignorar-data` só com ordem do dono), recusa baixar percentual fora do `--rollback`, idempotente, e o arquivo `docs/backups/rollout-home-nova-PAUSA` segura qualquer avanço (criar quando o QA falhar; apagar libera).

## Verificar antes de CADA etapa (Playwright, `scripts/qa-visual-home.mjs`, home com `REDESENHO_HOME_DEV=100`, local)
1. Home nova em 390x844 e 844x390, tema claro e escuro (cookie `theme`): status 200, sem estouro horizontal, sem imagem quebrada, sem erro de console.
2. Hero e CTA visíveis na primeira tela; vitrines por plataforma (faixas vazias ficam ocultas); faixa Geek Plus sem selo; contagem da Black Friday (até 27/11 23:59) sem salto de layout.
3. Contraste e legibilidade no escuro (texto, preços, selos, ícone de busca no cabeçalho); alvos de toque >= 44 px.
4. `/plus`, `/ofertas`, `/mercado/<dept>` e `/contatos` (390 e escuro): sem regressão; Telegram/WhatsApp só em /contatos.
5. Produção: `curl` em `/` retorna 200 e `/?v=2` como visitante comum NÃO força a home nova; a home atual (grupo de controle) segue idêntica.
6. Do degrau anterior (obrigatório para 50 e 100): 5xx = 0 novos, LCP e CLS da home nova sem piora contra a atual, cliques de saída (/go) por visita sem queda. Piorou: criar o arquivo de PAUSA e/ou rodar o rollback.

## Proposta de agendamento (não configurada: não há agendador por data; eu não agendei)
Três tarefas no Agendador de Tarefas do Windows (ou rotinas `/schedule`), 09:00 BRT, cada uma rodando a etapa com `--apply`: 19/11 `--etapa 10`, 21/11 `--etapa 50`, 22/11 `--etapa 100`. Antes de cada uma, às 08:00, rodar o QA acima; falhou, criar o arquivo de PAUSA. O guarda de data torna seguro disparar cedo; o rollback é um comando só. Computador precisa estar ligado e sem repouso (C16).
