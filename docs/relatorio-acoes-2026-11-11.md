# Relatório de ações: o que foi pedido em 11/11/2026 e o que falta

Atualizado ao fim da tarde de 11/11. Marcação: FEITO (no ar), EM ANDAMENTO, PENDENTE (com quem e o quê).

## A. Mensagens do Telegram (canal de games)
| # | Pedido do dono | Estado |
|---|---|---|
| A1 | Canal movimentado, envio automático, sem pausa | FEITO. Estado `on`, cron a cada minuto. Ritmo caiu quando o ML passou a exigir link oficial (ver B). |
| A2 | Card junto da mensagem, sem card errado | FEITO. Capa só se a imagem é da mesma loja; 1.104 ofertas com imagem de outra loja corrigidas (backup em docs/backups). Cards agora também nas mensagens de plataforma; se a legenda passar de 1024 caracteres o bloco "Monitoramento" sai e o card continua. |
| A3 | Sem segundo card truncado | FEITO. Sem URL no texto do Telegram e pré-visualização desligada. |
| A4 | Botão de compra visível | FEITO. Botão "Ver oferta e comprar" (inline). |
| A5 | Mensagem enxuta, por tópicos, com respiro | FEITO (formato v4). Destaque: preço, cupom, variação vs média; monitoramento só no fim. |
| A6 | Menor preço registrado com destaque e "melhor momento de compra" | FEITO. Cabeçalho "MENOR PREÇO REGISTRADO" e frase com a data de início da série. |
| A7 | Indicadores de decisão (variação vs média, histórico, leitura) | FEITO. Leitura descritiva por critério fixo. Frase "hora de comprar" segue bloqueada pelo filtro. |
| A8 | Só o menor preço do monitoramento, sem preço de cada loja | FEITO. |
| A9 | Black Friday só em novembro, como indicador | FEITO. Tópico "Black Friday" no bloco de monitoramento, só em novembro/2026. Mensagem avulsa P5 desligada. Depois de 30/11 volta o padrão sem nada a fazer. |
| A10 | Cupom nas mensagens | PENDENTE (parcial). Leitura geral de cupons do ML roda (2.623 verificados), mas quase nenhum casa com ofertas de games (cupons são de loja ou de categoria). Falta leitura de cupom por anúncio (ver passo 5). |
| A11 | Radar no formato novo | PENDENTE (baixa prioridade). |
| A12 | Amazon pode entrar na média quando for o mesmo produto | PENDENTE. Exige mudar o cálculo da média única (ADR 0004) e manter o carimbo de horário da Amazon nas mensagens. Passar pelo conselho antes. |

## B. Links oficiais de afiliado (ML)
- FEITO: fila corrigida (pula vendedor vermelho/laranja, usa o anúncio vencedor); sucesso subiu de 11% para ~82%.
- FEITO: mensagem do ML só sai se a oferta tem link `meli.la`.
- EM ANDAMENTO: laço na aba do Chrome gera ~1.200 a 2.400 links/hora; faltam ~9.000.
- PENDENTE (dono): manter PC sem suspender, Chrome aberto e logado. Se parar, me avisar para reinjetar.
- PENDENTE: testar se link com parâmetros de rastreio na URL credita a comissão (dispensaria o Chrome).

## C. Coleta
- EM ANDAMENTO: Amazon (ciclos de ~28 min), cupons do ML (ciclos de ~7 min), links do ML. Todos dependem do Chrome do dono.
- PENDENTE: Shopee cupons; AliExpress e Magalu não integrados.

## D. Lojas (uma por área, cada uma com canal)
- FEITO: roteamento por área no envio (sem fallback para games); plano e ata (docs/plano-lojas-secoes-canais-2026-11-11.md).
- EM ANDAMENTO: migrações 0032 (lojas) e 0033 (Impressão 3D) com backup e rollback testado (engenheiro de backend).
- PENDENTE (dono): criar o canal de cada loja, adicionar o bot como administrador, avisar o nome do canal.
- PENDENTE: aprovar catálogo em bloco por área (hoje 0 aprovados fora de games), semear Impressão 3D, links oficiais, modo sombra e depois ligar.
- PENDENTE: limites por loja e testes de paridade; games só migra depois de 28/11.

## E. Front público
- FEITO: leilão, usados e Hype Zone fechados ao público (só admin), backup em docs/backups/leilao-usados-2026-11-11/. Trava movida para o layout para responder 404 de verdade.
- PENDENTE: abrir os departamentos (MERCADO_UI, flags dept_*, 3+ produtos aprovados, 360/768/1280 px, noindex).
- PENDENTE: responsividade mobile/iPad (docs/plano-mobile-ipad-2026-11-11.md) e PWA mínimo até 18/11. Decisão do dono pendente.
- PENDENTE: confirmar `/ranking`, `/entrar?role=colecionador` e a imagem solta `loja-retro.png`.

## F. WhatsApp
- FEITO: botão "Compartilhar card + texto no WhatsApp" em /admin/mensagens (envio continua manual). Falta testar no celular.

## Passo a passo (ordem)
1. Hoje: conferir o deploy e uma mensagem real no formato v4 no canal (eu).
2. Hoje: terminar a fundação das lojas e conferir contagens antes/depois (eu).
3. Hoje (dono): criar o canal de Impressão 3D e adicionar o bot. Depois Tecnologia e Livros.
4. 12/11: aprovar catálogo em bloco (dry-run, depois apply com backup); semear Impressão 3D; links oficiais por prioridade.
5. 12 a 14/11: cupom por anúncio (API oficial primeiro; senão leitura pela aba logada só dos itens que vão para mensagem, até 150/dia).
6. 13 a 17/11: modo sombra das lojas novas; abrir os departamentos para admin em preview.
7. 12 a 20/11: responsividade e PWA mínimo (se aprovado).
8. 17 a 20/11: Amazon na média (conselho + teste de paridade), radar novo.
9. 23/11: ligar as lojas que passarem no checklist. 27/11 Black Friday.
