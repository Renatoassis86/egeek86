# Ata do Conselho Geek: lojas (seções) com canal próprio

- **Data:** 2026-11-11 (Black Friday em 2026-11-27; congelamento de regras, coleta e esquema em 2026-11-20)
- **Porte:** grande (estrutural). SOMENTE LEITURA E PLANEJAMENTO: nenhum código, banco, Vercel, Telegram, commit ou deploy foi alterado. Chrome não foi usado.
- **Presidente:** geek-lead
- **Plano técnico:** `docs/plano-lojas-secoes-canais-2026-11-11.md`
- **Como os pareceres foram feitos (transparência):** nesta rodada o presidente redigiu os pareceres pela lente de cada especialista, depois de ler o código (`group-rules.ts`, `group-queue.ts`, `group-auto.ts`, `group-config.ts`, `group-automation-store.ts`, `coupon-lookup.ts`, `departamentos.ts`, webhook do Telegram) e as atas e ADRs 0008 e 0009. **Não houve subagentes independentes.** Antes da Fase 1, recomenda-se uma rodada com subagentes reais (dba-postgres, seguranca-db, integrador-apis, qa-verificador) sobre o plano.

Convenção: **[C]** visto no código, **[H]** hipótese a conferir, **[R]** recomendação.

## Briefing
Decisão do dono (11/11): estruturar o código para várias lojas (seções); cada uma com canal de Telegram (e grupo de WhatsApp assistido) próprio, sem misturar produtos e experiências. Games é a loja atual. Abrir Impressão 3D (impressora 3D, filamento, resina, peças/bico/mesa). Autorizada a leitura de cupom por anúncio no envio, só dos itens que vão à mensagem, pela aba logada do dono, com desenho compatível com "coleta só por API oficial" e a exceção da ADR 0009. Quer o processo o mais automatizado possível.

Estado do código [C]: um canal (`TELEGRAM_GROUP_CHAT_ID`), uma flag (`group_messages_auto`), tetos em `RULES` globais (400/dia, 60/hora, 1 min), histórico sem corte por loja, falha definitiva desliga a automação inteira, `telegramChatFor` por variável de ambiente (sem grupo, a linha expira; nunca cai em games), `RELEASED_VERTICALS = ['games']`.

## Pareceres (resumo)
| Membro | Posição | Recomendação |
|---|---|---|
| geek-lead | Conceito "loja" = canal + estado + ritmo + marca; qualidade de preço é global | Princípio "qualidade global, cadência por loja"; fases com games intocado até depois da Black Friday |
| arquiteto-next | Há registro de departamentos e flags `dept_<slug>` (visibilidade pública); canal é outro eixo | Tabela `store_sections` separada do registro público; vertical pertence a uma só loja |
| dba-postgres | Config em tabela, não em env; unicidade da vertical no banco; migração aditiva | `store_section_verticals` com PK em vertical; `group_messages.store_id` com backfill em lotes; rollback no padrão da 0031 |
| engenheiro-backend | `spacingState` e `planDaySlots` já aceitam caps por parâmetro; falta passar a config e cortar o histórico | `StoreLimits` + `loadSentHistory({storeId})`; detecção uma vez, `applyLimits` por loja; falha 403 pausa só a loja |
| integrador-apis | Bot não cria canal; `my_chat_member` chega só por webhook; `getUpdates` conflita com webhook | `setWebhook` com `allowed_updates` incluindo `message` (senão quebra o `/start`); verificação só por leitura; sem mensagem de teste |
| engenheiro-coleta | Semeadura depende de teto de 480 chamadas/dia compartilhado | `dailyCallBudget` por loja; cardápio no banco com o mesmo bloqueio de termos provisórios |
| guardiao-catalogo | Impressão 3D é nova vertical de verdade; identidade de filamento (material, diâmetro, peso) e peça (compatibilidade) é difícil | Vertical própria `impressao3d`; impressoras e filamento primeiro; peças e bicos na onda seguinte |
| cientista-dados-tempo-real | Frescor e reconfirmação não mudam por loja | Nenhum relaxamento de regra para "encher" canal; shadow com relatório diário |
| especialista-precos / estatistico-senior | Séries curtas em nichos novos geram pouco sinal | Aceitar canal quieto; só conteúdo real (resumo, radar, foto de preço) |
| seguranca-db | Leitura de cupom pela aba logada é superfície nova de risco e de conta | Primeiro API oficial; senão ADR 0010 com teto, token dedicado, parada em captcha, nunca bloquear o envio |
| estrategista-mercado | Canais separados aumentam retenção por interesse; cupom aumenta clique | Abrir primeiro as lojas com mais oferta real (livros, tecnologia, impressão 3D); esporte só com oferta |
| gamer-veterano / designer-marca | Games não pode perder identidade; marca por loja sem imagem nova | Tinta e rótulo por CSS; nenhuma imagem estática por loja (uma imagem, um lugar) |
| engenheiro-infra-sre | Mais um laço por loja no cron; falha isolada | Pausa por loja, alerta, medir duração do ciclo em shadow |
| qa-verificador | Risco de regressão do games perto da Black Friday | Teste dourado de paridade; teste de isolamento por loja; varredura de "afiliad"; regressão do `/start` |

## Divergências e réplica
1. **Config em tabela contra variáveis de ambiente por loja** (infra preferia env pela simplicidade; dba e backend, tabela). Réplica: o chat id é descoberto em tempo de execução e editado no admin sem deploy. **Resolvido: tabela**; env só como fallback do games na transição.
2. **Estado como coluna contra feature flag.** O dono pediu flag; a flag já tem cache de 30 s e padrão de kill-switch [C]. **Resolvido: flag por loja** (`group_messages_auto:<slug>`), estado efetivo = mínimo entre global e loja; `stage` é só andamento do onboarding.
3. **Cupom assistido** (seguranca-db e integrador-apis contra; estrategista a favor). **Resolvido:** conferir API oficial primeiro; se não houver, emenda à ADR 0009 como ADR 0010, com teto diário, só itens enfileirados, sem ler preço, envio nunca espera.
4. **Peças de impressora agora ou depois** (dono autorizou; guardiao-catalogo vê risco de identidade). **Resolvido:** entram no cardápio, mas depois de impressoras e filamento passarem em shadow.
5. **Fundação antes ou depois do congelamento de 20/11.** Migração aditiva e inerte cabe até 17/11 com QA; qualquer alteração do caminho de envio do games só depois de 28/11. Decisão do dono (pergunta 1).
6. **Detecção por loja ou compartilhada.** Compartilhada (custo); aplicação de limites por loja.

## Decisões do conselho (consultivas)
- Adotar o modelo de loja do plano (tabelas, flag por loja, limites por loja, roteamento por vertical única).
- Games vira a loja `games` com os valores de hoje gravados explicitamente (paridade provada por teste dourado).
- Onboarding: dono cria o canal, adiciona o bot e confirma; o resto é do sistema, com checklist de prontidão e botão "ligar" do dono.
- Impressão 3D com vertical própria.
- Sem mensagem de teste em canal; sem fallback para o canal de games; sem WhatsApp automático.
- Decisão estrutural: ADR 0010 (lojas/seções e canal por loja) a escrever na Fase 1, e ADR 0011 (cupom por anúncio) só se não houver API oficial. Numeração a conferir.

## Perguntas ao dono (uma por vez, com recomendação)
A fila abaixo está em ordem; **só a 1 é feita agora**.

1. **Calendário.** Posso preparar a fundação inerte (migrações 0032 e 0033, sem mudar nenhum envio) até 17/11 e deixar toda mudança no caminho de envio (limites e roteamento por loja) para depois de 28/11? **Recomendo sim:** o congelamento de 20/11 protege a Black Friday, e a fundação inerte não altera o games.
2. Limites iniciais das lojas novas: 60 por dia, 12 por hora, 3 min de dia e 5 min de noite, 10 sonoras. **Recomendo** esse padrão por 14 dias e subir pelos números reais.
3. Impressão 3D como vertical própria (migração no esquema) e não como "tecnologia"? **Recomendo vertical própria**, para o canal não misturar.
4. Peças e bicos de impressora: entram depois de impressoras e filamento passarem em shadow? **Recomendo sim.**
5. Cupom por anúncio: aceita a ADR 0011 (exceção assistida, teto de 150 leituras por dia, parada em captcha), caso a API oficial não exponha cupom? **Recomendo sim, após conferir a API.**
6. Nomes, slugs e endereços públicos dos canais (ex.: `t.me/egeek86_impressao3d`) e se cada canal é público ou privado.
7. Critérios do dono para aprovar catálogo em bloco de uma loja nova (mínimo de ofertas, de lojas, foto).
8. Número mínimo de masters aprovados para uma loja poder sair do shadow (N do checklist).

## Execução e verificação
Nada executado nesta ata. Quando autorizado: Fase 0 (medições, sem escrita), depois fases do plano, cada uma com `qa-verificador` (typecheck, build, testes, isolamento, varredura da palavra proibida, imagens únicas) antes de concluir, e a skill `checklist-publicacao`. Dado real, hipótese e recomendação estão marcados no plano; nenhum dado sintético foi criado.

---

# Adendo 1 (2026-11-11, tarde): decisão do dono de NÃO esperar

**Decisão do dono (via coordenador):** implementar já as outras lojas; a loja de games continua intocada no caminho de envio até haver paridade comprovada; refinar também o que falta no games. Sem escrita em produção e sem Chrome nesta etapa (só plano). Plano completo: `docs/plano-lojas-secoes-canais-2026-11-11.md`, Parte II.

**Fatos medidos [D, coordenador]:** front público não mostra outras lojas (`MERCADO_UI` desligado, nenhuma linha `dept_<slug>`); 0 masters aprovados fora de games (eletrodomésticos 11, esporte 4, livros 79, tecnologia 55, eletroeletrônicos 14, todos sem `catalogGate` approved); links oficiais ML no games 722 de 9.977. Já existem: `telegramChatFor` por vertical sem fallback, botão de compartilhar card+texto no WhatsApp, mensagem por tópicos com indicadores.

## Pareceres do adendo (mesma ressalva: lente do presidente, sem subagentes)
| Membro | Posição | Recomendação |
|---|---|---|
| arquiteto-next / engenheiro-backend | Duas vias no ciclo: games legado, `runStoreCycles` para as demais; funções compartilhadas só com parâmetro opcional | Chave `store_path:games` (padrão legado); teste de paridade de 48 ciclos para trocar |
| qa-verificador | Achei três acoplamentos que quebram o games quando a 1ª loja nova enviar: histórico de envio global, trava de proposta aberta por gatilho global, pausa global em falha | Corrigir de forma neutra (filtro por vertical/loja) ANTES da 1ª mensagem de loja nova; teste dourado |
| guardiao-catalogo | O gargalo é o porteiro: 0 aprovados fora de games bloqueia tudo (`porteiro_review`) | Aprovação em bloco com critérios por vertical, backup e log; campos obrigatórios por vertical; Impressão 3D: material, diâmetro e massa separam filamento; peças só com compatibilidade escrita |
| integrador-apis / engenheiro-coleta | Teto de 480 chamadas/dia é compartilhado; ADR 0009 cobre links ML | Orçamento por loja; fila de links por prioridade; ordem: lojas que vão a shadow primeiro |
| seguranca-db | Cupom por anúncio e links por aba logada são risco contratual; setWebhook é escrita em produção | Autorização explícita por escrita; ADR 0011 só se não houver API oficial |
| engenheiro-frontend / designer-marca / engenheiro-performance-web | Departamento só aparece com trava mestra + flag + >= 3 masters visíveis; 0 imagens para esses nichos | Abrir primeiro só para administradores em preview; tinta por CSS; 360/768/1280; HTML < 400 KB; estados vazios honestos |
| key-user-gamer / gamer-veterano | Games não pode perder foco nem qualidade enquanto os nichos sobem | Itens do games que não mudam regra andam já; radar novo atrás de flag e shadow |
| estrategista-mercado | Comissão depende de link oficial: 7% no games é a maior alavanca imediata | C1 antes de qualquer estética; abrir lojas na ordem de oferta real |
| especialista-precos | Nenhum relaxamento de regra para encher canal | Canal quieto é aceitável |

## Divergências do adendo e réplica
1. **Esperar a Black Friday (recomendação anterior) contra implementar já (dono).** Decisão do dono prevalece. O risco é contido assim: o games não muda de via; só esquema aditivo até 17/11; depois do congelamento (20/11) só flags.
2. **Ligar lojas novas antes ou depois de 27/11.** Possível em 23/11 apenas para quem passar no checklist; quem não passar abre depois. Sem exceção de qualidade.
3. **Front público das lojas antes da Black Friday.** estrategista: sim, para comissão extra; performance e designer: só se os testes passarem e sem peso novo. Resolvido: abertura por flag em 23/11 condicionada ao teste; decisão D8.

## Ordem resumida (detalhe no plano)
11/11 medições e decisões; 12/11 migrações em cópia e fila de links; 13/11 aplicar migrações (autorizado); 14/11 limites por loja e correções neutras; 15/11 admin Lojas e dry-run de semeadura; 16/11 setWebhook (autorizado), apply de semeadura, aprovação em bloco; 17/11 shadow; 18 e 19/11 cupom por anúncio e front só para administradores; 20/11 congelamento; 23/11 `on` e abertura pública por flag; 27/11 monitorar.

## Decisões do dono (uma por vez, com recomendação)
**Fila substituída. Só a D1 é feita agora.**
- **D1 (agora). Autoriza aplicar em produção, em 13/11, as migrações aditivas 0032 (lojas) e 0033 (vertical `impressao3d`), com backup lógico antes e rollback testado em cópia?** Recomendo sim: nada do envio do games lê as tabelas novas, e é a única forma de caber antes do congelamento de esquema de 20/11.
- D2. Limites das lojas novas: 60/dia, 12/hora, 3 min de dia, 5 de noite, 10 sonoras. Recomendo esse padrão por 14 dias.
- D3. Nomes, slugs e endereços dos canais (público ou privado) e a ordem de abertura. Recomendo Impressão 3D, Livros, Tecnologia primeiro; Eletroeletrônicos e Eletrodomésticos depois; Esporte só quando houver oferta.
- D4. Critérios da aprovação em bloco (tabela por vertical do plano) e termos de busca de Impressão 3D. Recomendo aprovar os critérios como estão e peças só após o dry-run das demais.
- D5. Autorizar `setWebhook` com `my_chat_member` (re-incluindo `message`). Recomendo sim, em 16/11, com teste de regressão do `/start`.
- D6. Cupom por anúncio: ADR 0011 (exceção assistida, 150 leituras/dia, parada em captcha) se não houver API oficial. Recomendo sim, após a conferência de 11/11.
- D7. Radar do games no formato novo, atrás de flag e com 3 dias de shadow. Recomendo sim, ligando só se o shadow for limpo, até 19/11; senão após a Black Friday.
- D8. Abrir departamentos no site público antes da Black Friday? Recomendo só para os que tiverem >= 3 masters aprovados e teste verde, por flag em 23/11, primeiro com audiência de administradores.
- D9. Aceita que os links ML de lojas novas entrem na lista pública "Minhas recomendações" do perfil do dono? Recomendo avaliar o perfil antes; se incomodar, gerar links das lojas novas depois da Black Friday ou só dos itens em mensagem.
- D10. Games trocar para a via por loja: recomendo só depois de 28/11 e do teste de paridade de 48 ciclos.

## Verificação
Nada executado. Cada dia do plano termina com `qa-verificador` (typecheck, build, testes de isolamento e dourado, varredura da palavra proibida, imagens únicas) e a skill `checklist-publicacao`.
