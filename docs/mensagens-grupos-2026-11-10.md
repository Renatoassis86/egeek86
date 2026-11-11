# Mensagens automáticas para grupos (construído em 2026-11-10)

Ata: `docs/conselho/atas/2026-11-10-mensagens-automaticas-para-grupos.md`. Tudo nasce **DESLIGADO**. Nada foi commitado, publicado, aplicado no banco nem enviado.

## O que foi criado ou alterado

Criados
- `src/lib/messaging/group-config.ts`: flags e tag de publicidade (funções puras).
- `src/lib/messaging/group-messages.ts`: os 6 modelos (menor preço registrado, abaixo da média, comparativo, resumo do dia, foto de preço, por departamento) em Telegram (HTML com escape) e WhatsApp (texto simples); link `/go/<slug>?s=<tg|wa>&m=<message_key>`; barreira de termos proibidos; `wa.me`.
- `src/lib/messaging/group-rules.ts`: gatilhos G1 a G6, filtros por oferta (região/edição no título, Amazon, Shopee, vendedor, frescor, reconfirmação de 15 min), limites anti-spam (3/dia, 6 de 20 a 27/11, 1/hora, silêncio 22h-8h Brasília, 48 h por produto com exceção de novo menor preço, rodízio de rede).
- `src/lib/messaging/telegram-send.ts`: envio ao Telegram com `fetch` injetável (400 de formatação reenvia em texto simples; 401/403/chat não encontrado não repetem; 429 respeita `retry_after`; token nunca devolvido nem logado).
- `src/server/messaging/group-offers.ts`: detector SOMENTE LEITURA (`detectGroupCandidates`) que devolve JSON com candidatos, motivo, texto pronto, bloqueios com motivo e o plano de limites.
- `src/server/messaging/group-queue.ts`: fila em `group_messages` (grava propostas, expira, aprova/rejeita, envia UMA aprovada com limites e revalidação).
- `src/server/messaging/group-view.ts`, `src/server/actions/group-messages.ts`, `src/components/admin/group-messages-panel.tsx`: tela e ações.
- `src/app/api/cron/group-messages/route.ts`: cron (NÃO está no `vercel.json`).
- `drizzle/migrations/0028_group_messages.sql` e `.rollback.sql` (NÃO aplicadas, NÃO no `_journal.json`, como 0019 a 0027) e `scripts/apply-group-messages.ts` (dry-run por padrão).
- `scripts/test-mensagens-grupo.ts` (216 verificações) e `scripts/telegram-teste.ts`.

Alterados
- `src/app/admin/mensagens/page.tsx`: passou a ter a fila de propostas no topo; o histórico "Mensagens divulgadas" continua abaixo, igual.
- `src/lib/affiliate/message-template.ts` (gerador do botão "Gerar mensagem WhatsApp" e do carrinho): removidos "De/por", "% OFF", "MENOR PREÇO JÁ REGISTRADO" sem janela e a palavra "afiliado" (inclusive no lembrete de link pendente); `listPriceCents` é ignorado; agora tem "Conferido em" e a janela do recorde quando o chamador informa `trackingSince`/`checkedAt` (campos opcionais novos).
- `package.json`: scripts `test:mensagens-grupo` e `telegram:teste`.

NÃO foi tocado: `src/app/go/[slug]/route.ts` (outro agente grava `s` e `m`), `vercel.json`, banco.

## Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `GROUP_MESSAGES_ENABLED` | ausente = desligado | Kill-switch. `1` ou `true` liga o cron e o envio. |
| `GROUP_MESSAGES_MODE` | `dry` | `dry` só detecta e grava propostas; só o valor exato `send` permite enviar no Telegram. |
| `GROUP_MESSAGES_AD_TAG` | `#publicidade` | Marcação de publicidade no fim da linha do link. Vazio, `none` ou `off` = sem marcação. Se o texto tiver "afiliad..." volta ao padrão. |
| `TELEGRAM_BOT_TOKEN` | ausente | Token do bot. Na Vercel como **Sensitive**. Nunca em ata, commit ou chat. |
| `TELEGRAM_GROUP_CHAT_ID` | ausente | Id do grupo/canal (começa com `-100`). |
| `CRON_SECRET` | já existe | Autentica o cron novo (Bearer). |

Sem token, sem chat id, sem flag ou em modo `dry`: nunca envia.

## Como ligar (passo a passo)

1. No Telegram, abra o @BotFather, envie `/newbot`, escolha nome e usuário. Guarde o token (não cole em nenhum lugar público).
2. Crie o grupo ou canal e adicione o bot como **administrador** (no canal, com permissão de postar mensagens).
3. Descobrir o chat id sem expor o token: mande uma mensagem qualquer no grupo e, no navegador do dono, abra `https://api.telegram.org/bot<TOKEN>/getUpdates` (troque `<TOKEN>`). Procure `"chat":{"id":-100...`. Esse número é o `TELEGRAM_GROUP_CHAT_ID`. Não compartilhe a URL pronta.
4. No `.env.local` (teste local) ponha `TELEGRAM_BOT_TOKEN` e `TELEGRAM_GROUP_CHAT_ID` e rode `npm run telegram:teste`. Envia UMA mensagem "Teste do bot do Espaço Geek 86" e imprime só o resultado (sem token).
5. Na Vercel (projeto egeek86), cadastre as duas variáveis (token como Sensitive). Ainda mantenha `GROUP_MESSAGES_ENABLED` ausente.
6. Aplicar a migration (com backup antes e aprovação do dono): `npx tsx --env-file=.env.local scripts/apply-group-messages.ts` (dry-run) e depois `--apply`.
7. Dono autoriza incluir o cron no `vercel.json` (sugestão `*/15 * * * *` em `/api/cron/group-messages`).
8. **Dry de 7 dias**: `GROUP_MESSAGES_ENABLED=1`, `GROUP_MESSAGES_MODE=dry`. O cron grava propostas; a equipe confere 50 mensagens contra o banco (0 divergência) em `/admin/mensagens`.
9. Só então `GROUP_MESSAGES_MODE=send`. Mesmo assim o cron só envia propostas **aprovadas** na tela, 1 por execução, respeitando os limites.
10. WhatsApp é sempre assistido: na tela, Copiar ou "Enviar no WhatsApp" (abre `wa.me/?text=`, sem número; o dono escolhe o grupo) e depois "Já enviei no WhatsApp (registrar)".

## Reversão

- Desligar na hora: remova `GROUP_MESSAGES_ENABLED` (ou ponha `0`). O cron passa a responder `skipped` sem ler o banco; o envio fica travado.
- Tirar o cron: remova a entrada do `vercel.json`.
- Banco: `npx tsx --env-file=.env.local scripts/apply-group-messages.ts --rollback` (executa `0028_group_messages.rollback.sql`, que só remove `group_messages`).
- Código: remover os arquivos criados; restaurar `message-template.ts`, `page.tsx` de `/admin/mensagens` e `package.json` (as alterações são pequenas e listadas acima).

## Fatos que a equipe precisa saber

- **A média elegível só existe a partir de 14/11.** O detector usa a MESMA média do selo e do gráfico (`price_daily_state.members` via `computePeriodMetrics`, janela de 30 dias). Essa série só começa em 31/10 (`PRICE_DAILY_REGIME_START`), então hoje nenhum produto tem os 14 dias exigidos e G1/G2 ficam bloqueados com o motivo `sem_media_elegivel`. A ata mediu 22 produtos com média elegível usando `price_daily_offer` (desde 24/10), base diferente da do selo (ex.: Tomba pela ata R$ 430,08; pela base do selo hoje R$ 473,70). Foi mantida a base do selo para evitar duas médias. G3 (comparativo) e G5 (foto de preço) já funcionam hoje.
- Frescor usa `last_price_confirmed_at`. A "reconfirmação de 15 min" é aproximada por `last_price_confirmed_at - last_price_change_at >= 15 min` (o snapshot só é gravado quando o preço muda, então não dá para contar coletas).
- Telegram usa `parse_mode: HTML` (decisão da ata e do `send-telegram.ts`; HTML tem escape mais simples que MarkdownV2). O texto do WhatsApp é simples, sem HTML.
- "(N ofertas)" na linha da média (a ata dizia "lojas"): a média conta ofertas distintas, não lojas.
- Estados da tabela: `proposta`, `aprovada`, `enviada`, `rejeitada`, `expirada` e `erro` (acrescentado para falha definitiva de envio, ex.: 403).

## Pendências

- `/go` precisa aceitar `s` e `m` (outro agente) e filtrar prévias de WhatsApp/Telegram.
- G6 só sai quando os nichos forem liberados no porteiro e no `/go`; hoje é marcado como não enviável.
- Baseline da foto de preço (24/11 e 27/11): o modelo aceita `baseline`, mas o detector ainda não lê a foto de 10/11 de lugar nenhum (precisa de leitura da primeira proposta G5 gravada).
- Janelas de publicação (12h, 17h30, 20h) e o resumo do dia às 12h não estão agendados: hoje vale silêncio + limites; o G4 é montado quando houver 2 ou mais itens G1/G2.
- Migrar o `avgPriceCents` do botão "Gerar mensagem WhatsApp" para a média por oferta-dia, e acrescentar a tag de publicidade nesse fluxo antigo.
- Revisão jurídica da frase de publicidade.
