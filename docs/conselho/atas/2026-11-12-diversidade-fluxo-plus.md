# Ata do Conselho Geek: diversidade e quantidade do envio das lojas Plus ao Telegram

- **Data:** 2026-11-12
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados:** estrategista-mercado, especialista-precos, estatistico-senior, gamer-veterano, key-user-gamer, engenheiro-backend, qa-verificador (pareceres independentes em paralelo)

## Briefing
Diretriz do dono: "Flexibilizar para os itens das lojas Plus enviarem itens DIVERSOS para os grupos do Telegram. Continua chegando pouca quantidade e pouca variedade. Cadê as TVs? Só vou sossegar quando começar a ver itens diversos, não uma repetição do mesmo item." Inegociáveis em jogo: dado real, preço real conferido, só novo e em linha, nada de "% abaixo da média" sem amostra de 5 ofertas, sem a palavra "afiliado", 1 h entre reenvios do mesmo produto, nenhum dado fake, nada destrutivo, nada de escrita em produção. O papel de hoje está em `docs/03-metodologia/FLUXO_DE_ENVIO_TELEGRAM.md`.

Medição que abriu a reunião (2026-11-12, 1.120 masters aprovados das lojas Plus com oferta fresca): 114 (10%) produtos geravam candidato enviável; 418 (37%) têm 1 vendedor e nunca entravam no pool; 313 (28%) eram descartados porque a oferta mais barata não tem link oficial meli.la; 230 (21%) sem movimento nem média (menos de 3 ofertas). Nas últimas 24 h: 150 mensagens nas 6 lojas, todas pelo gatilho G2; air fryer 11 de 22 (casa), soundbar 13 de 28 e Smart TV 1 (eletroeletrônicos), filamento 20 de 37 (impressão 3D), RPG 16 de 19 (livros), placa de vídeo 25 de 36 (tecnologia).

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| estrategista-mercado | Favorável ao Achado e à cota; contra baixar a formação | Achado 3 por loja/dia (cerca de 18), teto 30% das mensagens; tipo <= 25% do dia, produto só volta em 24 h; pool de 60 para 90; atacar `link_pendente` em vez de relaxar o filtro | CTR e saídas por tipo; quantos `link_pendente` são recuperáveis |
| especialista-precos | Favorável ao Achado só como fato de preço | Texto sem comparação nem adjetivo; reconferência ao vivo; teto 1,10x do histórico próprio; fallback para a 2a oferta com link se estiver até 3% acima e sem dizer "menor"; G2 com >= 2 ofertas na formação | histórico próprio dos 1-vendedor; mediana por tipo |
| estatistico-senior | Favorável ao Achado como estatística de ordem | Dizer N; "% abaixo" só com n >= 5; média de 3 ofertas é frágil; teto 40% por tipo, 3 a 8 tipos por loja/dia; rodízio por semente do dia, nunca por ordem de ID; métricas: distintos, tipos, HHI < 0,25, repetição < 10%, cobertura | histórico de 14 dias; erro de coleta por loja |
| gamer-veterano | Favorável à variedade; Achado raro | Nenhum tipo > 25% e >= 5 tipos por loja/dia; Achado <= 1 em 4; criar o tipo "Cadeiras"; TV e monitor em destaque | cliques por tipo; tipos com oferta ativa |
| key-user-gamer | Favorável com volume baixo | 4 a 8 mensagens por dia por grupo, no máximo 2 por hora, tipo <= 30%, produto sem repetir em 7 dias; rótulo graduado, não repetir "na média ou abaixo" em tudo | saídas e silenciamentos por grupo |
| engenheiro-backend | Favorável com flag | Achado como gatilho novo (migration 0032 do CHECK) com fallback ao próximo `holder`; `tipo` no histórico; `tipoSpacingBlock` no `applyLimits`; grupo de Achado no pool com rodízio por tipo; não aumentar `MAX_SENDS_PER_RUN`; entrega em flag | taxa de erro de preço em 1-vendedor |
| qa-verificador | Favorável com testes primeiro | Linha de base 677/677; testes de contrato do Achado (sem %, abaixo, média, desconto, afiliado), cota de tipo, pool; dry real 24 h; alarmes (> 60 por hora, tipo > 40%, reenvio < 60 min, Achado sem reconferência) | Distribuição por tipo dos 1-vendedor |

## Divergências e réplica (rodada 2)
Não houve réplica formal: as divergências eram de parâmetro, não de princípio, e foram resolvidas pelo presidente com o dado medido. Todas ficam registradas:

| Ponto | Posições | Decisão |
|---|---|---|
| Teto do Achado | estrategista 30% e 3/loja/dia; precos 25% do orçamento e 2/h; estatístico 30%; gamer 25%; key-user 6 mensagens/dia/grupo no total | **25% das mensagens da loja em 24 h, mínimo de 3 por dia, 2 por hora.** O teto de 6 por dia do key-user não foi adotado: contraria a diretriz do dono de mais quantidade (vai ao dono como pergunta) |
| Cota de tipo | 25% (estrategista, gamer), 30% (key-user), 40% (estatístico) | **30%, suave:** só vale com alternativa de outro tipo na fila e depois de 6 envios na loja; alerta de queda real não é freado (QA e backend: não parar o canal) |
| Repetição do mesmo produto | G2 1 h (regra do dono); Achado 24 h (estrategista, gamer, estatístico), 7 dias (key-user) | **G2 mantém 1 h; Achado 24 h** |
| Baixar mínimos da formação | precos: G2 com >= 2 ofertas; estrategista, estatístico, QA: manter | **Mantidos** (3 ofertas, 2 lojas na formação, 3 lojas e 10% depois de 30/11, 5 ofertas para afirmar %). Média de 2 ofertas nunca é "abaixo da média" (veto do estatístico) |
| Fallback de link | precos: ate 3%, sem "menor"; backend: com limite de diferença; estrategista: resolver o link, não relaxar o filtro | **Fallback só no Achado, até 3% acima da mais barata, sem a palavra "menor"**; resolver a cobertura de link vai ao dono (P1) |
| Plausibilidade | precos: 0,35x a 3x da mediana; estatístico: 0,5x a 2x quando n < 8; ágio de vendedor único | **Faixa do TIPO 0,5x a 2,5x (amostra >= 5 masters), histórico próprio <= 1,10x e >= 0,5x (com >= 3 dias), mais a faixa 0,35x a 3x das ofertas.** Tipo "outros" não vale |
| Migration x reaproveitar G3 | backend: migration 0032 com guarda; reaproveitar G3 polui telemetria | **Migration 0032 NÃO aplicada + guarda `groupMessagesAchadoReady()` + kill-switch `GROUP_ACHADO=off`** |
| Foto/cartão do Achado | não debatido | Sem cartão (o cartão calcula média e histórico próprios e poderia comparar); pendência |

## Decisão
Plano executado nesta data, em ordem:
1. Documentar o papel (`FLUXO_DE_ENVIO_TELEGRAM.md`) e medir o funil real por loja e por tipo (`scripts/medir-funil-plus.ts`, `medir-funil-plus-tipo.ts`, `medir-links-plus.ts`).
2. Gatilho **AC "Achado"**: preço atual confirmado de produto sem média/1 vendedor, sem comparação e sem alegar desconto; portões: oferta válida com link, identidade, reputação, faixa do tipo, histórico próprio, plausibilidade, frescor, dedup 24 h, cota por loja; só ML/Shopee; não vale para games.
3. **Pool por rodízio de tipo** (`pool-diversidade.ts`): 75 por loja (até 30 de eventos) + 30 de Achado, tipos menos enviados primeiro, determinístico por hora; games 220 inalterado; teto do ciclo 900.
4. **Plano de envio:** cota de tipo 30% suave, cota do Achado por loja, rodízio do tipo menos enviado (o Achado nunca passa na frente de um insight com comparação), dedup 24 h para AC.
5. **Migration 0032** preparada, não aplicada; Achado desligado até o CHECK aceitar `AC`.
6. Testes: novo `scripts/test-mensagens-diversidade.ts` (81 verificações) e os três existentes (677) sem regressão; `npx tsc --noEmit` limpo.

Fica de fora: baixar mínimos da formação; subir `MAX_SENDS_PER_RUN`; cartão/foto do Achado; tipo "Cadeiras"; qualquer envio ou escrita em produção.

- Decisão do responsável do projeto: **pendente** (ver perguntas abaixo). O código está pronto e inofensivo: sem a migration 0032 nada muda em produção, exceto o pool maior e o rodízio de tipo nos G2 já existentes.

### Perguntas ao dono (uma por vez, com recomendação)
1. **Link oficial (maior alavanca):** priorizar a geração de links meli.la pelos tipos ausentes (Smart TV, geladeira, esporte, tipos com 0 envio em 24 h)? Hoje 65% a 75% das ofertas ML das lojas Plus não têm link; 9 das 11 TVs de 1 vendedor têm o único anúncio sem link e nenhum gatilho pode citá-las. Recomendação: sim, fila de links ordenada por tipo menos enviado.
2. **Ligar o Achado:** aplicar a migration 0032 (com backup de `group_messages`), rodar 24 h em modo `shadow` e então `on`? Recomendação: sim.
3. **Volume:** aceita o Achado até 25% das mensagens de cada loja (mínimo 3 por dia, 2 por hora)? Pareceres de usuário pedem 4 a 8 mensagens por dia por grupo; a diretriz atual (sem teto) prevalece, mas o risco é de saídas do grupo. Recomendação: aceitar e vigiar saídas por 7 dias.
4. **Virada de 30/11:** manter a data de corte da formação? O G2 das lojas Plus cai muito quando entram 3 lojas, média oferta-dia e régua de 10%. Recomendação: manter, remedir na véspera e, se preciso, adiar a corte.

## Métrica de sucesso
Por loja Plus, por dia, em 7 e 14 dias: produtos distintos, tipos distintos (meta >= 5 onde houver candidato), participação do tipo líder (meta <= 30%; hoje livros 84%, tecnologia 69%, impressão 3D 54%, casa 50%, eletroeletrônicos 46%), HHI de tipos (< 0,25), repetição do mesmo produto por dia (< 10%), share de mensagens por loja, share do Achado (<= 25%), cobertura de masters elegíveis em 7 dias (>= 50%); guarda-chuva: saídas do grupo sem alta, zero reclamação de preço divergente, retirada de ofertas <= 5%. Alarmes: > 60 mensagens por hora num chat, um tipo > 40% em 24 h, reenvio < 60 min, texto com termo proibido, Achado sem reconferência.

Projeção medida (simulação em leitura, candidatos e histórico reais de 2026-11-12, primeira volta do plano): enviáveis Plus 114 -> 297 produtos; pool 360 -> 629; sem nenhum gatilho 648 -> 27; plano simulado de 44 mensagens com 2 a 7 tipos distintos por loja e Achado = 2 por loja (limite por hora); Smart TV 1 -> 2 enviáveis, geladeira 1 -> 5. O teto desse ganho é a cobertura de link (pendência 1).

## Execução e verificação
- Executores: geek-lead (código, testes, documentos); pareceres dos 7 membros.
- QA (qa-verificador, independente): `npx tsc --noEmit` limpo; test:mensagens-grupo 228/228, motor-v2 216/216, onda2 233/233, diversidade 81/81. Veredito: **aprovado com ressalvas**. Ressalvas tratadas: (1) rodízio de tipo passava o Achado na frente de insight com comparação -> corrigido (chave transitiva: Achado depois de insight real) e testado; (2) ordem relativa games x Plus -> games mantém tipo nulo e ordem própria; (3) tempo de detecção ~37 a 40 s a partir da máquina local (igual antes: 37 s; +1,3 s do pool novo) -> conferir na Vercel antes de elevar mais o pool; (4) texto do Achado agora diz "no Mercado Livre e na Shopee" (a contagem exclui Amazon e Magalu). Ressalvas abertas: um dia em `shadow` depois da 0032.
- Arquivos: `src/lib/messaging/group-rules.ts`, `group-messages.ts`, `pool-diversidade.ts` (novo), `src/server/messaging/group-offers.ts`, `group-queue.ts`, `drizzle/migrations/0046_group_messages_achado.sql` e `.rollback.sql`, `scripts/test-mensagens-diversidade.ts`, `scripts/medir-funil-plus.ts`, `medir-funil-plus-tipo.ts`, `medir-links-plus.ts`, `simular-plano-diversidade.ts`, `package.json` (`test:mensagens-diversidade`).

## Retrospectiva
<preencher após entrar no ar: métrica atingida? lições?>
