# Ata do Conselho Geek: régua de destaque das mensagens (corte 3%, degraus, veredito, link curto, canal Destaques)

- **Data:** 2026-11-12
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados:** estatistico-senior, especialista-precos, engenheiro-backend, qa-verificador, seguranca-db, dba-postgres (pareceres independentes, em paralelo, rodada 1)

## Briefing
O dono aprovou no chat (2026-11-12): (1) corte de envio de 10% para 3% abaixo da média única; (2) régua de destaque com limites 3, 6, 12, 20 e 30%; (3) canal Telegram "Destaques" para os degraus 4 e 5; (4) degrau 1 limitado a 1/3 das mensagens da hora por grupo; (5) link curto do WhatsApp; (6) mesma régua no front (/black-friday, /ofertas) com veredito. Escala de calor já decidida com o conselho de cores (azul, verde, amarelo, laranja, vermelho), cor nunca sozinha. Regras em jogo: R-17 (uma média), R-19 (escada de amostra), R-21/R-22 (frescor e reconferência, não mudam), R-23/R-24 (régua e barreira de texto), R-25/R-35/R-36 (cartão, imagem, "afiliado"), R-03/R-05/R-38 (segredo, backup, banco). Rollout por chave, só Casa (`eletrodomesticos`) e `esporte`.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estatistico-senior | Aprova 3% só com veredito de indicadores reais e escada R-19 | Rótulo da janela = min(90, dias medidos); "Compre agora" exige >= 14 dias de histórico e >= 5 ofertas; piloto de 7 dias | dispersão por produto (CV/MAD) para calibrar 3% contra ruído |
| especialista-precos | Aprova com rótulo que descreva a queda, não "desconto" | Degrau 5 não pode ser a única defesa contra preço-erro (trava antes do envio); terço do degrau 1 adia, não descarta; "Compre agora" só com dado | taxa histórica de preço-erro > 30% |
| engenheiro-backend | Viável e de baixo risco | Régua por loja dentro de `effectiveMinBelow`; link curto no envio/persistência; Destaques como segundo `sendMessage` (não segunda linha); terço e prioridade no `applyLimits`; piso para não parar o grupo | volume real (dry-run) |
| qa-verificador | Só aceita com evidência executada | Testes das bordas, termos banidos, tamanhos, rollout "desligado = byte a byte", 15 min em produção; critérios de reversão (job > 45 s duas vezes, erro > 2%, termo banido, terço violado) | n/a |
| seguranca-db | Aprova com condições | Código aleatório (nunca derivado do `messageKey`), 404 sem corpo e sem cache, destino só do banco, `X-Robots-Tag`, `Referrer-Policy`, índice único parcial `CONCURRENTLY` separado, segredo fora de log | rate limit/WAF (a rota é pública) |
| dba-postgres | Migration segura e aditiva | 0050 no molde da 0049; `candidate->'regua'->>'degrau'` cobre a contagem sem coluna nova; HISTÓRICO REAL das duas lojas começa em 2026-11-08 (Casa) e 2026-11-11 (esporte): não existe mínima de 90 dias | cobertura de média: só 134/464 (Casa) e 93/466 (esporte) têm média única |

Medida do dba-postgres (SELECT somente leitura, hoje): com oferta fresca e média, Casa tem 127 produtos >= 3% (110 >= 10%) e esporte 85 (70 >= 10%); baixar a 3% soma ~32 produtos a mais (+18%), não uma enxurrada; distribuição por degrau (Casa 2/23/22/36/44, esporte 9/9/16/32/19 para 3-<6, 6-<12, 12-<20, 20-30, >30).

## Divergências e réplica (rodada 2)
Sem réplica formal (nenhum parecer vetou); as tensões foram resolvidas assim:
1. **Rótulo "menor preço dos últimos 90 dias" x histórico real de 4 a 13 dias.** Estatístico e DBA contra afirmar 90 dias; o dono pediu o rótulo de 90 dias. Resolvido: a janela escrita é `min(90, dias medidos)` ("últimos N dias"), a linha da mínima só aparece com >= 14 dias, e "Compre agora" (degrau 4) exige >= 14 dias, >= 5 ofertas e preço na mínima ou até 3% acima; sem isso o degrau 4 vira 3 (amarelo, "Ótima compra"). **Efeito: nas duas lojas-piloto não há "Compre agora" e, portanto, nada no canal Destaques por degrau 4 até ~26/11 (Casa) e ~25/11 (esporte)**; degrau 5 continua exigindo aprovação humana (R-28). Constante `MIN_DIAS_HISTORICO` (ou `GROUP_REGUA_MIN_DIAS`) para o dono baixar se quiser. **Divergência com o pedido literal do dono, registrada para decisão dele.**
2. **Percentual com menos de 5 ofertas.** R-19 e estatístico: sem "%" com < 5 ofertas; o dono pede percentual sempre. Resolvido pelo código existente (caso PS5): < 5 ofertas = sem percentual e sem "abaixo da média", degrau limitado a 3, veredito cauteloso, e nunca "amostra pequena". A cor segue acompanhada do rótulo e das marcas ▼.
3. **Terço do degrau 1.** Backend e especialista-precos: não parar o grupo e adiar (não descartar). Resolvido: a primeira mensagem de degrau 1 da hora sempre passa; depois, `(d1+1)/(total+1) <= 1/3` (configurável em `GROUP_REGUA_D1_SHARE_PCT`). Com fila só de degrau 1 e uma já enviada na hora, o excedente espera.
4. **Vocabulário "Bom preço / Compre agora" (especialista-precos preferia rótulos mais neutros).** Mantido o do dono (decisão com o conselho de cores), com as travas que sustentam cada rótulo (veredito só de dado real, `BANNED` contra previsão e urgência artificial).
5. **Degrau 5 e preço-erro.** Já existe a trava humana (R-28: queda > 30% exige aprovação; > 45% retida); o texto traz o aviso de confirmar o anúncio. Nada novo além do aviso.
6. **Fase de formação.** Casa e esporte estão em formação até 2026-11-30 (média simples, sem "%"). Com a régua ligada, o produto que tem média única oferta-dia (>= 3 ofertas, >= 1 dia de série) sai da formação e passa a ser julgado pela régua; o produto sem média única continua na formação. Desligar a chave devolve tudo ao comportamento anterior.

## Decisão
Plano executado, na ordem:
1. Módulo único `src/lib/messaging/regua.ts` (degraus, veredito, textos Telegram e WhatsApp, front, configuração de rollout) com teste `scripts/test-regua.ts` (247 verificações).
2. Corte por loja em `effectiveMinBelow` (+ `formacaoDoProduto`), texto da régua em `finish`, prioridade do degrau e terço em `applyLimits` e `listPendingForSend`, `SentRecord.degrau` lido de `candidate.regua`.
3. Cartão com faixa de cor, rótulo e marcas desenhadas (`offer-card.tsx`), botão "Comprar agora".
4. Canal Destaques: segundo envio isolado depois do envio da loja, desligado sem `TELEGRAM_DESTAQUES_CHAT_ID`; resultado em `candidate.destaques`.
5. Link curto: migration 0050 (aditiva, aplicada com backup `docs/backups/short-code-apply-2026-11-12T17-07-20-731Z.json`), rota `/g/[code]`, código aleatório atribuído na gravação da linha `wa`.
6. Front: etiqueta, régua mínima/agora/média e seções por degrau em `/black-friday`; `OfferCard` (usado em /ofertas) mostra a etiqueta quando há média elegível.
7. `BANNED` ganhou "metodologia", "amostra pequena" e "(Brasília)".
- Rollout: `GROUP_REGUA_PCT_MIN=3` e `GROUP_REGUA_LOJAS=eletrodomesticos,esporte`. Reverter = apagar (ou zerar) `GROUP_REGUA_PCT_MIN` ou esvaziar `GROUP_REGUA_LOJAS` e redeploy; nenhuma migration a desfazer (a coluna `short_code` é inerte).
- Fica de fora: liberar as demais lojas (só após 24 h e decisão do dono), baixar o histórico mínimo, trava de dispersão (k x MAD) do estatístico (proposta para a próxima rodada), rate limit/WAF do `/g` (a rota é pública, como o `/go`).
- Decisão do responsável do projeto: aprovada no chat em 2026-11-12 (itens 1 a 6); pendentes dele: criar o canal Destaques e adicionar o bot, confirmar o terço do degrau 1, decidir sobre o histórico mínimo de 14 dias.

## Emendas do dono (chat, 2026-11-12, tarde)
1. Terço do degrau 1 só vale com oferta dos degraus 2 a 5 elegível esperando no grupo; sem ela, degrau 1 sem teto. Implementado em `applyLimits`.
2. Cores confirmadas (calor, vermelho no topo).
3. Produto sem média é oferta legítima: teto do Achado por hora e grupo vira `GROUP_AC_POR_HORA` (padrão 6, era 2) e a cota diária deixa de ser o limitante; Achado passa a dizer "Novo no monitoramento", sem comparação.

## Métrica de sucesso
Nas 2 lojas, por 15 min e depois por 24 h: envios por degrau, 0 termo banido, 0 mensagem fora de Casa/esporte, duração do job < 45 s, erro < 2%, degrau 1 <= 1/3 da hora por grupo, 0 divergência entre média da mensagem e do banco. Reversão imediata se qualquer um falhar.

## Execução e verificação
- Executores: geek-lead (código, documentação), qa-verificador (verificação independente), engenheiro-infra-sre (deploy via `vercel`).
- QA: ver seção "Verificação" abaixo (preenchida após o deploy).

## Retrospectiva
Preencher após as 24 h de produção.
