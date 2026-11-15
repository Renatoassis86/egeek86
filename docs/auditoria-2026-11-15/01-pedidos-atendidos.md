# Auditoria 2026-11-15, painel 1: pedidos do dono atendidos e mudanças causadas

Papéis: qa-verificador, guardiao-catalogo, gamer-veterano (Conselho Geek, fila #64a). Método: somente leitura (git, código, SELECT em transação `read only`, `curl` público, testes tsx locais). Nada foi escrito em produção. Janela: 2026-11-10 a 2026-11-15 04:40 BRT. Banco medido em 2026-11-15 ~04:40 BRT.

Legenda: ATENDIDO, PARCIAL, NÃO ATENDIDO, EM ANDAMENTO. NÃO VERIFICADO = não consegui provar daqui (ex.: variáveis da Vercel são "Sensitive" e não estão no `.env.local`; estado dos flags de produção só consta em documentos).

## 0. Placar

| Status | Qtde | Pedidos |
|---|---|---|
| ATENDIDO | 10 | 1, 2, 5, 6, 9, 10, 12 (código; flag a confirmar), 13, 15, 16 |
| PARCIAL | 8 | 3, 4, 7, 8, 14, 19, 21, 22 (backup ok, atas do Conselho faltam) |
| EM ANDAMENTO | 2 | 11, 20 |
| NÃO ATENDIDO | 2 | 18 (não iniciado, fila), 17 (pausado por ordem do dono; conta como aguardando, não como falha) |

Total: 22 pedidos. Testes tsx rodados agora: `test-comissao-admin`, `test-card-v2`, `test-guardiao-cupons`, `test-promo-prime` com 0 linhas `FALHA`. `typecheck/build` não foram rodados nesta auditoria (há 4 arquivos modificados e não commitados de outros agentes no working tree).

Estado medido do sistema (SELECT): masters `approved` 6.005 ok + 1.902 unverified; `rejected` 2.704; `review` 319; ofertas ativas Amazon 2.801, Mercado Livre 24.398 (+114 em quarentena), Shopee 4.073 (+100 em quarentena); 2.889 mensagens enviadas nas últimas 48 h.

## 1. Pedido a pedido

### 1. Imagem do Observatório cortada e bloco Sobre sem imagem. ATENDIDO
- Evidência: commit 8bdc640 (`src/components/home/secoes/teaser-inteligencia.tsx:109,115`, `aspect-[3/2]` + `object-contain`); commit f86ee69 (`src/app/(shop)/sobre/page.tsx:290-292`, `/images/sobre/loja-retro.webp`, arquivo existe em `public/images/sobre/`).
- Mudança: só CSS/markup; sem dado. Risco: `object-contain` deixa faixas vazias se a imagem trocar de proporção.
- Faltou: nada. Verificação visual em produção não repetida por mim.

### 2. Só console em linha e novo; console = só videogame. ATENDIDO com resíduo
- Evidência: commits 1143ac5 (regra `console-videogame`, 43 masters, `aplicar-limpeza-console-2026-11-13T13-08-43-376Z`), d852720 (PS4 fora de linha, 47 masters, log `aplicar-limpeza-console-2026-11-14T11-49-34-728Z.json`, rollback no próprio script). SELECT: console PS4/Xbox One S/360/PS3 com veredito `rejected` = 89; motivos `console_fora_de_linha` 76, `console_nao_e_aparelho:*` 18+8+4, `bateria_reposicao_console` 6.
- Dado alterado: 90 masters `approved` para `rejected` (backups NDJSON em `docs/backups/`). Jogos de PS4 mantidos (C1).
- Resíduos medidos: (a) 2 jogos tipados `console` e aprovados por `auto:r2-11` (Exoprimal PS4 com 4 ofertas, Doom PS4 com 2); (b) "Fonte Cabo Adaptador Ps2" tipado console, sem `catalogGate` e com 1 oferta ativa; (c) 7 masters `console` sem veredito. A decisão C10 ("50 jogos tipados como console") foi tratada por regra, mas o R2-11 reintroduziu 2 deles.
- Efeito no usuário: vitrine de consoles mais curta (156 consoles `approved`). Risco: regex de nome (`playstation 4|ps4`) pode barrar bundle de PS5 que cite PS4.

### 3. Foto com mão = seminovo; depois regra por OFERTA, só mão real. PARCIAL
- Evidência: bde88bd/dc649c0 (82+3 masters rejeitados por `foto_com_mao`), 94a2844 (9 por `sinal_de_uso`), depois 517d4c9 (`scripts/reclassificar-foto-mao-por-oferta.ts`, mapa por URL `docs/backups/foto-mao-real-por-url-2026-11-15.json`). SELECT: masters com motivo `foto_com_mao` hoje = 0 (todos reavaliados, 84); `sinal_de_uso` = 9 (mantidos); 99 ofertas em quarentena (97 Shopee, 2 ML), todas ainda ativas e em quarentena; log `foto-mao-oferta-log-2026-11-15T06-42-09-729Z.json` com rollback.
- Mudança: ofertas com mão real saem das médias, selo, vitrines e histórico; o master volta. Arte de caixa ilustrada (Switch Lite) não conta (caso b0996ccb restaurado em `corrigir-itens-jogobarato`).
- Faltou: (a) automação: oferta nova com mão real só entra em quarentena se alguém classificar a foto por URL em tamanho cheio; nenhum job faz isso (`scripts/reclassificar...` é manual); (b) `affiliate_offers` não tem coluna de motivo da quarentena, então 99 de foto, ~115 de preço implausível e outras são indistinguíveis no banco (só o log diz); (c) 36 itens por miniatura (C14) foram revistos no mapa por URL, sem prova no banco além do mapa.
- Risco de regressão: reativar quarentena em massa por engano (sem motivo gravado).

### 4. Checklist e motor de perguntas (C1-C15, B1, R2-1 a R2-17). PARCIAL (29 de 34 ações vistas no código/banco; 5 parciais)
Cada resposta virou ação? Resumo com evidência:
- C1 (PS4 jogos mantidos) ok. C2 ok (9 `sinal_de_uso`, commit 94a2844). C3 ok: modelo sombra `6c153eb` (AP 0,40 vs 0,20; só registra em `candidate.mlSombra`). C4 ok: N1 ligada, migração 0051 com backup `group-messages-antes-0051-2026-11-14T17-31-24-679Z.ndjson`; 31 N1 enviadas em 48 h. C5 ok: 64 masters aprovados, 18 por afrouxamento (9100468). C6 ok no código (`rodizio-expirados.ts`, 155e607); efeito não medido: ML ainda tem 7.860 ofertas `expired` e 1.353 `paused`. C8 ok (D1+D3, ver 21). C9 ok (vitrines completam com Amazon como oferta). C10 ok: 176 revisões ambíguas por regra (`revisoes-ambiguas-log`, 121 rejeitados e 43 aprovados `bloco:c10`). C11 ok (`docs/redesenho-site/QA-visual-2026-11-14.md`, 30 combinações Playwright). C12 ok (ver 19). C14 ok.
- C7 PARCIAL: leitura de cupom por anúncio no ML voltou (1.342 `offer_coupon_reads` em 48 h, última 04:20), mas a tabela de campanhas `coupon_items` do ML está parada desde 2026-11-12 08:48 (3.610 `nao_verificado`, 1.012 `vencido`). `CUPOMPRAHOME` não confirmado no banco.
- C13 PARCIAL: GTIN/MPN aplicado em 32 masters (6 lotes, 2 últimos com 0 gravados); 24 rascunhos arquivados; pares por chave forte gerados, mas nenhuma fusão desses pares aparece nos backups (`merge-duplicate-masters --pairs` não consta em `docs/backups`).
- C15 PARCIAL: `cobertura-shopee` tinha 29% de erro nas últimas 24 h (9 de 31, todas `rate_limit`) mas 0 erros desde ~10:00 BRT de 14/11 (recuperou depois de R2-7); `group-messages` 1,4% de erro (20 de 1.402/24 h, "envio interrompido: confira o canal"); `refresh-snapshots:stats` 7 erros (6 são as 24 linhas limpas).
- B1 ok (ver 5).
- R2-1 ok no código (4f9cc40) mas ver contradição na seção 3 (275 masters novos parados em `review`). R2-2 ok (regras.ts:25, sem teto). R2-3 ok, depois reduzido a 24 h (ver 21). R2-4 ok (4.417 ofertas `vendedor-fraco` com `avg_excluded_at`, backfill de 1.541 produtos, 6.152 dias recalculados, backup `medias-vendedor-fraco-*`). R2-5 sem mudança. R2-6 ok (`nao_identificado`, 1.489 liberados incluem os dessa classe). R2-7 ok (cron a cada 10 min, medido). R2-8 ok (24 linhas, `limpeza-running-presos`), mas ver risco: 31 `collect-prices` + 31 `collect-shopee` + 11 `showcase` + 7 `vitrines` + 7 `discover` seguem `running` desde 10 a 13/11. R2-9 PARCIAL (`?key=` ainda aceito, só instrumentado; `keyNaUrlAceita()` em `src/lib/auth/cron-auth.ts:11-34`; `/api/health` e webhook ML ainda leem `?key=`). R2-10 PARCIAL (rota `loja-teste` removida: produção devolve 404 agora; rate limit por firewall da Vercel só consta em documento, NÃO VERIFICADO). R2-11 ok (1.489 `auto:r2-11`, log `r2-revisao-log-2026-11-15T00-57-26-659Z.json`). R2-12 PARCIAL (quarentena só na Amazon assistida, `amazon-assisted.ts:223-262`; Shopee/ML ainda descartam como `miss`, `collect-shopee-prices.ts:213`). R2-13 ok (`usado-lido-na-pagina.ts`). R2-14 ok no código; estado da flag NÃO VERIFICADO. R2-15 ok (fd928fe). R2-16 ok (12 masters `auto:r2-16`). R2-17 ok em departamentos; ver 21.

### 5. Prioridade para impressoras 3D Kobra e Bambu. ATENDIDO
- Evidência: cff20f8, `src/lib/messaging/prioridade-3d.ts`, `group-rules.ts:2328`. SELECT 48 h: de 247 mensagens de Impressão 3D, 44 são Bambu e 28 Kobra/Anycubic (29%); 3D responde por 8,5% das 2.889 enviadas. Ofertas ativas aprovadas na vertical: ML 1.599, Amazon 171, Shopee 13.
- Mudança: 3D na frente da fila e isenta da cota suave de tipo (efeito colateral: 66 reenvios do mesmo master em menos de 8 h, a maioria em gatilhos P1-P4 de plataforma; cooldown R-47 de 8 h tem 112 exceções em 2.881, 3,9%).
- Faltou: Shopee quase vazia em 3D (13 ofertas ativas na vertical inteira) e primeiro ciclo do cron `ampliar-amostra-shopee` terminou em `erro_rate_limit` (04:33 hoje).

### 6. Preço da mensagem diferente do site. ATENDIDO
- Evidência: 2556b66 (`price-guard.ts`: `preco_oscilando`, `link_sem_conferencia`), `live-recheck.ts`, ba01641 (N1 neutra), investigação `docs/investigacao-preco-mensagem-vs-site-2026-11-14.md`. SELECT 48 h: 2.867 de 2.888 enviadas com `recheck_price_cents`, 1.050 com `live_price_cents`; 0 com divergência de recheck maior que 2%; 0 enviadas com termo proibido (comissão, amostra, metodologia, "(Bras"). Bloqueios medidos: 384+180 `link_sem_conferencia: ml_vende`, 7 `preco_oscilando`, 737+44+11 "já não vale".
- Mudança: menos mensagens (a maioria das propostas expira: 8.719 AC, 5.226 G2 expiradas contra 1.096 AC e 1.510 G2 enviadas). Custo: a conferência ao vivo derruba cerca de 700 propostas/48 h por `ml_vende`/`http_`; olhar se `ml_vende` é falso positivo (P1).
- Faltou: causa estrutural citada na investigação (94,7% das ofertas ML sem `external_item_id`) segue como plano.

### 7. Jogo Barato: promoção Prime 25% na finalização. PARCIAL
- Evidência: 21e0f43 (regra, front, mensagem CUPOM, descoberta), b0c08f1 (loop lê cartões Prime), 957beb1, `docs/inventario-motivos-jogos-promocao-2026-11-14.md` (7 motivos M1-M7), 37/37 testes e agora 0 falhas.
- Medido no banco: `coupon_items` da Amazon = 6 linhas (1 verificado, 5 não verificados), nenhuma com Prime ou "finalização"; nenhum job `amazon-promocoes` em `collector_runs` (zero execuções desde sempre); 0 mensagens com "Exclusivo Prime" em 48 h; Amazon CUPOM = 0. Ou seja, o código existe, mas nenhum jogo em promoção Prime chegou ao front ou à mensagem. O estado das flags `PROMO_PRIME_DERIVADA`, `PROMO_DESCOBERTA`, `GROUP_PROMO_PRIME` (checklist R2-14 diz que `GROUP_PROMO_PRIME` foi ligada) é NÃO VERIFICADO.
- Faltou: reinjetar o laço `public/loops/amazon-promocoes.js` na aba da Amazon (depende do Chrome do dono), ligar e medir. É o pedido central do dono de 14/11 e continua sem efeito visível.

### 8. Política: só usado/retrô barra; grupos só de iguais; indicadores intactos; barreira nova só com aval. PARCIAL
- Evidência: memória `unica-restricao-usado-retro-barreira-so-com-aval`; R2-1/6/11 (4f9cc40); `docs/inventario-barreiras-extracao-2026-11-14.md`. Aprovações em bloco: 4.260 `q4q5`, 1.489 `r2-11`, 273 `plus-v3`.
- Contradições medidas: (a) 319 masters em `review`, dos quais 275 `semeadura_vertical_aguardando_conferencia` e 278 criados nas últimas 24 h (218 por semeadura, 55+4+1 por Shopee) estão fora do catálogo visível. O R2-11 foi uma liberação única, não regra permanente: a entrada continua com revisão obrigatória para semeadura; (b) frescor de 24 h para clicar (ver 21) é barreira que o dono aprovou; (c) o piso de 5 cotações/14 dias continua escondendo itens (esperado, é indicador).
- Faltou: regra permanente "master de semeadura com chave forte nasce aprovado" (já vale para Amazon e Shopee de chave forte, não para o ramo `semear-vertical`).

### 9. Rodapé sem aviso de comissão; cartões de departamento clicáveis; cache de 5 min. ATENDIDO
- Evidência: 74aa63c (`site-footer.tsx` -3 linhas; `src/app/(detalhe)/mercado/[vertical]/loading.tsx`), b0570b0 (carrinho, página do produto, tabela de lojas), d5fa77d (`src/server/queries/departamento.ts:176,246,402`, `revalidate: 300`).
- Mudança: `CommissionNotice` não é mais usado em nenhuma tela (só a definição). Produção: `/` 200, `/mercado/impressao3d` 200 em 4,8 s e home em 6,8 s no frio.
- Risco jurídico (P1): o aviso de divulgação de afiliado saiu de todas as telas de compra; `/sobre` e `/termos` ainda citam comissão. O acordo da Amazon (Associates) e o CDC/CONAR pedem divulgação clara; `docs/revisao-legal-lgpd-comissao-2026-11-03.md` marca "revisão jurídica pendente". A decisão é do dono, mas precisa de ciência explícita do risco.

### 10. Bambu A1/P1S/P2S (#59). ATENDIDO (com pendência declarada)
- Evidência: dddade3, `bambu-59-log-2026-11-15T06-45-16-109Z.json` (1 oferta movida do master errado, 1 rascunho). SELECT: os 8 masters aprovados; ofertas ativas por modelo (ML/Shopee/Amazon): A1 Combo 235/3/2, A1 91/1/1, A1 Mini 100/1/2, A1 Mini Combo 72/1/1, P1S 5/0/1, P1S Combo 25/3/0, P2S 6/0/0, P2S Combo 42/3/0.
- Faltou (declarado): Amazon sem oferta em P2S, P2S Combo, P1S Combo; Shopee depende do cron. Achado novo: "Kit Extrusor Original Bamboo Lab" (peça) aprovado e visível na vertical de impressoras, contra a regra de itens miúdos.

### 11. Ciência e tecnologia industrial (#60). EM ANDAMENTO
- Evidência: 9d44af3 (16 segmentos, 7 tipos, `config-ciencia.ts`, `scope-ciencia.ts`), mapa `docs/mapa-categorias-ciencia-tecnologia-2026-11-15.md`. Fila ainda diz "fila".
- Medido: masters novos de microscópio, multímetro, Arduino, telescópio, CNC, osciloscópio criados hoje = 0; em Tecnologia já havia 46 com "microsc" e 53 com "multímetro", Arduino/ESP32/Raspberry = 0. A semeadura ainda não rodou para os segmentos novos (entram em `review`, ver riscos).
- Faltou: rodar, aprovar sem barreira nova e medir antes/depois; atualizar o estado na fila.

### 12. Cards v2 (#58). ATENDIDO no código; flag a confirmar
- Evidência: 134770b (`src/server/messaging/card-v2.tsx`, `card-v2-model.ts`, amostras em `docs/amostras-cards/`, `test-card-v2` sem falhas). A fila diz padrão OFF; o enunciado do dono diz que está ligada: NÃO VERIFICADO (variável Sensitive). Commit seguinte "#65 cards sem capa e fundo interno branco" indica novo defeito aberto.
- Mudança: com a flag, todos os cards de imagem (oferta, preço, cupom encerrado, perfil) mudam layout e fonte (Inter). Risco: texto cortado em nomes longos de produto real; fonte Inter precisa estar empacotada no runtime serverless.

### 13. Cupom encerrado com nome (#56). ATENDIDO
- Evidência: 1de00bb (`ended-coupon-card.tsx`, `guardiao-cupons.ts`, `baixa.ts`, flag `GROUP_ENDED_COUPON_DETAIL`), `test-guardiao-cupons` sem falhas. SELECT `coupon_announcements`: 3 anúncios com `end_notified_at` (último 04:09 hoje); 32 encerrados (28 `venceu`, 3 `sumiu_da_pagina`, 1 `oferta_inativa`).
- Faltou: prova de que a mensagem enviada carrega o nome do cupom (nenhuma `group_messages` com o texto novo em 48 h; só 3 avisos).

### 14. Auditoria de cobertura por produto (#57) e 3 itens do Jogo Barato. PARCIAL
- Evidência: 55b6cbb, `docs/inventario-itens-concorrente.md`, `docs/inventario-itens-jogobarato-shopee-2026-11-15.md`, d9e7d1f, script `corrigir-itens-jogobarato-2026-11-15.ts` com log. Efeitos: master `b0996ccb` (Switch Lite) devolvido a `approved` (8 ofertas Shopee e 12 ML visíveis), `4704eddc` retipado de game para console, 1 oferta com mão real em quarentena, 5 masters sem veredito aprovados pelo porteiro.
- Faltou: item 3 (Switch 2 + Mario Kart + NSO a R$ 3.999) não confirmado, só hipótese (R$ 4.199 menos teto de R$ 200 do voucher); leitor de voucher da Shopee não existe (`offer_coupon_reads` Shopee = 0). Causa geral "master `catalogGate` NULL" (104 masters) segue sem regra de saneamento. O inventário de motivos Prime (item 7) é a mesma causa geral não encerrada.

### 15. Consolidação de duplicados Switch 2 + Mario Kart. ATENDIDO com resíduo
- Evidência: 33deb9f (`scripts/consolidar-switch2-mkw-2026-11-15.ts`, log `consolidar-switch2-mkw-log-2026-11-15T07-35-13-185Z.json`, `merged: 2` com `374675ec` e `4013d841` arquivados no canônico `4704eddc`, backups de `price_daily_offer` e `price_daily_state`, redirect do comparar). SELECT: canônico com 42 ofertas ativas.
- Resíduo: 7 masters "Console Nintendo Switch 2 + Mario Kart World" com 1 oferta cada continuam separados (um é "Jogo Digital", pode ser diferente por regra). Gerar nova rodada por título/GTIN e decidir.

### 16. Comissão prevista só no admin (#62). ATENDIDO
- Evidência: d8bac6d, `src/lib/admin-gestao/taxas-comissao.ts`, `src/app/admin/comissao/page.tsx`, `src/server/queries/admin-comissao.ts`, teste de privacidade que varre módulos públicos. Sem coluna nova no banco (cálculo na leitura, nenhuma migração). Referências só em 3 arquivos de admin. Taxas: Amazon confirmada; ML, Shopee e Magalu estimadas.
- Risco: se uma tela pública importar `admin-gestao`, o teste pega; só roda no CI local (não há pre-push ainda, #24).

### 17. Magalu (#61). NÃO ATENDIDO por decisão do dono (pausado)
- Evidência: 7b0c69f, nada parcial no repositório. Dependências: login do dono no portal Parceiro Magalu, slug da loja, tabela de comissões. Sem efeito no sistema (a taxa estimada do Magalu existe só na tabela de comissão).

### 18. Loja de impressão 3D em 3 seções (#63). NÃO ATENDIDO
- Evidência: só o texto da fila (1405116); nenhum código em `src/app/(detalhe)/mercado/[vertical]/page.tsx` com seções Impressoras/Filamentos/Demais itens. Fila diz "fila". Coerente com a regra de não interromper o que está em andamento.

### 19. Rollout da home nova adiantado (10/50/100). PARCIAL
- Evidência: 6904c91 e d5fa77d (`scripts/rollout-home-nova.ts`, dry-run, backup, rollback, PAUSA, recusa antes da data; log `docs/backups/rollout-home-nova-log.ndjson` registra `recusado_antes_da_data`), `docs/rollout-home-nova-plano.md`. SELECT `feature_flags`: a linha `redesenho_home` não existe, efetivo 0%.
- Faltou: não existe agendador; 19/11, 21/11 e 22/11 dependem de alguém rodar `--etapa N --apply` (plano propõe 3 tarefas do Windows, não criadas). Congelamento 23 a 28/11 ok no plano. Risco: pico da Black Friday sem rollback treinado.

### 20. Relatórios de 6 em 6 horas e vigia dos loops (nenhum loop pode parar). EM ANDAMENTO
- Evidência: commits a57580b, f76befb, ee78a7d, 61613f3 (loops pausam e retomam), memória `loops-nunca-param`. SELECT 30 h: `amazon-assistida` rodou em todas as horas; vazão caiu de 54-72/h (noite de 13/11) para 5-34/h com padrão alternado 7/34 desde 14/11 05:00; `ml-links-assistida` 973 e `cupons-assistida` 66 em 48 h; `agente-cupons` 540. O laço `amazon-promocoes` nunca registrou execução (item 7).
- Não há arquivo de relatório de 6 h no repositório nem agendador que o emita: NÃO VERIFICADO (se existe, vive na sessão do operador). Quebra conhecida: checklist A4/C16 (Chrome dormindo parou os loops por 2 h 20 em 14/11) segue dependendo do dono.

### 21. Regras R2/seguranca/frescor. PARCIAL
- Frescor ML/Shopee 24 h: ATENDIDO (9c53d0e, `departamentos.ts:37` `OFERTA_CLICAVEL_MAX_HORAS = 24`, "visto há X" após 6 h). Contradição aberta: `regras.ts:29` ainda cita 7 dias e R2-3/e74f2aa dizia 7 dias; `OFFER_FRESHNESS_DAYS` = 7 segue no indicador. Decisão vigente: 24 h para clicar, 7 dias para a série.
- Teto de queda removido: ATENDIDO (`regras.ts:25`). Vendedor fraco só fora da média: ATENDIDO (4.417 ofertas; 4.435 ML ativas com `avg_excluded_at`, 18% das ativas do ML, efeito grande nas medianas).
- Preço implausível em quarentena: PARCIAL (só Amazon, ver R2-12).
- Botões de canal fora da home: PARCIAL. `contatos.tsx` ainda aparece na composição da home? A home em produção não tem botões de canal, mas o rodapé mantém o ícone social `t.me/espacogeek86` (`site-footer.tsx`, `newsletter.tsx`) enquanto o canal da memória e `contatos.tsx` é `t.me/egeek86`: handles diferentes (P2).
- Segurança D1/D3: ATENDIDO (produção entrega HSTS, X-Frame-Options, CSP enforce parcial `frame-ancestors/object-src/base-uri` e CSP completa em Report-Only). Falta promover o Report-Only. D3 corrigiu comparação em tempo constante e erros vazando `e.message`. R2-9/R2-10: ver item 4.
- R2-7 ok. R2-8 ok. R2-9 parcial. R2-10 parcial.

### 22. Conselho Geek em toda tarefa; aprovação ampla com backup. PARCIAL
- Backup e log: ATENDIDO. 149 arquivos em `docs/backups/`; cada correção aplicada tem NDJSON + log + rollback em script (console, itens miúdos, foto, q4q5, r2, vendedor fraco, consolidação, Bambu, GTIN).
- Conselho: `docs/conselho/atas/` tem 46 atas, a última de 2026-11-13. Não há ata para as tarefas de 14/11 e 15/11 (#50 a #62: segurança, AliExpress, N1, foto por oferta, cards v2, Bambu, ciência, comissão, Prime), o que contraria a regra "toda tarefa passa pelo Conselho". A #64 abre agora essa rodada.

## 2. Mudanças causadas no sistema (consolidado)

Dados alterados (todos com backup NDJSON e log em `docs/backups/`):

| Frente | Linhas | Efeito |
|---|---|---|
| Aprovação em bloco q4q5 (games + nichos) | 4.260 aprovados (4.184 + 690 + 64 menos sobreposição) | catálogo visível cresceu; 231 rejeitados e 313 em revisão pelo porteiro |
| Itens miúdos | 677 rejeitados | peças, cabos, grips, impressos 3D fora |
| Console | 43 + 47 rejeitados (+4 não-aparelho) | PS4 e peças fora |
| Foto com mão | 85 rejeitados (revertidos para oferta) + 9 `sinal_de_uso` + 99 ofertas em quarentena | médias sem fotos de uso |
| C10 revisões ambíguas | 176 (121 rejeitados, 43 aprovados) | regra por bloco |
| R2-11 e R2-16 | 1.489 + 12 liberados | gate aberto |
| Vendedor fraco fora da média | 4.336 + 81 marcadas, 1.541 produtos, 6.152 dias recalculados | medianas sobem ou descem sem o vendedor fraco |
| Celulares/tablets/relógios para Tecnologia | 196 masters | Tecnologia ganhou categorias |
| GTIN/MPN | 32 masters | chave forte |
| Rascunhos 14 dias | 24 arquivados | fila do dono menor |
| `running` presos | 24 linhas fechadas | só `refresh-snapshots:stats` |
| Jogo Barato, Bambu, Switch 2 | 1 retipado, 2 masters fundidos, 1 oferta movida, 5 aprovados | |
| N1 (migração 0051) | 24.618 linhas de `group_messages` com backup | coluna nova no banco |

Flags e cron: `GROUP_NEUTRO_SEM_BASE`, `GROUP_N1_POR_HORA/DIA`, `GROUP_ENDED_COUPON_DETAIL`, `GROUP_CARD_V2`, `PROMO_PRIME_DERIVADA`, `PROMO_DESCOBERTA`, `GROUP_PROMO_PRIME`, `CRON_ACEITA_KEY_NA_URL`, `redesenho_home`. Cron: cobertura Shopee a cada 10 min, `ampliar-amostra-shopee` por foco 3D, semeadura a cada 20 min, `vitrines` a cada 10 min.

Efeito nas mensagens (48 h): 2.889 enviadas; AC 1.096, G2 1.510, CUPOM 35, N1 31, P1-P4 87, 0 termos proibidos, 0 divergência acima de 2% com o recheck. 8.719 AC e 5.226 G2 expiraram sem envio (propostas em excesso).

Efeito no usuário final: catálogo maior e mais limpo, sem aviso de comissão, departamentos com carregamento imediato, preço de mensagem mais fiel, seção Observatório e Sobre corrigidas, cards v2 (se ligada a flag).

## 3. Contradições entre decisões

1. Frescor: 7 dias (R2-3, e74f2aa) contra 24 h (9c53d0e); comentário e constante de indicador ainda dizem 7 dias (`regras.ts:29`).
2. "Banco cheio, só usado/retrô barra" contra revisão obrigatória da semeadura (275 masters em `review`) e contra 99 ofertas por foto, itens miúdos, frescor.
3. "Indicadores intactos" contra exclusão de 18% das ofertas do ML por vendedor fraco (R2-4) e quarentenas sem motivo gravado.
4. Fila diz cards v2 OFF e o dono diz ligado; fila diz #60 "fila" com código pronto; checklist diz "feito" onde o dado não mudou (Prime).
5. Prime 25%: aprovado como alvo, código no ar, sem nenhum item no banco.
6. Aviso de comissão removido contra revisão legal pendente e acordo Amazon.
7. Telegram: canal `egeek86` na memória e no código de contatos, ícone do rodapé aponta para `espacogeek86`.
8. Fila numera dois itens #33 e dois #37 (duplicidade herdada); #33 de Prime colide com o #33 de incidente.

## 4. Itens que ainda dependem do dono

Acordar/manter o Chrome (loops, Prime, cupons ML); reinjetar `amazon-promocoes`; ligar ou confirmar flags da Vercel; login no portal Magalu; liberar a repetição "master de semeadura nasce aprovado"; agendar os 3 degraus da home nova; decidir sobre aviso de comissão; promover CSP Report-Only; confirmar se `GROUP_CARD_V2` está ligada; aprovar o item 3 do Jogo Barato (NSO a R$ 3.999 hipotético).

## 5. Os 10 maiores riscos de regressão

1. Quarentena sem motivo gravado: reverter lote errado reativa fotos com mão e preços implausíveis juntos.
2. Aviso de comissão removido de todas as telas de compra (Amazon Associates, CDC, CONAR).
3. 275 masters de semeadura em `review` e 278 novos por dia acumulando fora do front.
4. `running` presos antigos (31 `collect-prices`, 31 `collect-shopee`, 11 `showcase`, 7 `vitrines`, 7 `discover`) poluem SLOs e o vigia.
5. 719 dias `closed=false` com data passada (439 em 12/11, 178 em 13/11): métricas diárias em aberto (#15 não fechada).
6. Exclusão de 18% das ofertas ML da média altera medianas e selos na Black Friday.
7. Conferência ao vivo `ml_vende`/`http_` derruba cerca de 700 propostas/48 h; falso positivo derruba volume.
8. Ofertas Shopee de 3D e Prime dependem de cron e do Chrome; qualquer parada deixa o front sem Bambu na Shopee e sem Prime.
9. Rollout da home nova sem agendador ou treino de rollback na semana do pico (19 a 22/11, Black Friday 27/11).
10. `?key=` na URL dos crons ainda aceito, CSP completa só em Report-Only, e cards v2 sem verificação em produção.

## 6. Correções propostas

P0 (antes de 19/11):
- Gravar o motivo da quarentena (coluna `quarantine_reason` ou tabela de trilha) e marcar os 99+115 existentes pelos logs.
- Decisão do dono sobre aviso de comissão, com texto mínimo na página de produto/carrinho se a decisão for manter a divulgação.
- Regra permanente "master de semeadura/Shopee com chave forte nasce aprovado" e esvaziar os 275 em `review` (pedir aval ao dono, é barreira atual).
- Fechar `running` órfãos de `collect-prices`, `collect-shopee`, `showcase`, `vitrines`, `discover` com a mesma ferramenta do R2-8 (dry-run, backup, rollback).
- Agendar os 3 degraus do rollout da home nova (tarefas 09:00 BRT) e ensaiar o `--rollback` uma vez.

P1:
- Prime 25%: reinjetar o laço `amazon-promocoes`, confirmar as 3 flags, medir 1 jogo de ponta a ponta.
- Fechar as 719 linhas `closed=false` por produto (fila #15) e alarme.
- Corrigir resíduos de console e miúdos: Exoprimal/Doom (tipo console), "Fonte Ps2", "Kit Extrusor Bambu", 7 consoles sem veredito, 104 masters com `catalogGate` NULL.
- Automatizar a classificação de foto com mão em oferta nova (mão real x arte de caixa) com amostra visual, em vez de lote manual.
- Reduzir falsos positivos de `ml_vende`/`http_206` no recheck.
- Coletar a atualização de `coupon_items` do ML (parada desde 12/11) e confirmar CUPOMPRAHOME.
- Atas do Conselho para as tarefas de 14 e 15/11 e corrigir a fila (duplicidades #33/#37, estados de #58, #60, #63).
- Segunda rodada de fusão para os 7 masters duplicados do Switch 2 + Mario Kart.

P2:
- Atualizar comentário de `regras.ts:29` e a constante do indicador para refletir 24 h/7 dias.
- Promover a CSP de Report-Only para enforce depois de ler os relatórios; remover `?key=` em `/api/health` e no webhook ML.
- Uniformizar o handle do Telegram (egeek86 contra espacogeek86).
- Rodar `typecheck` e `build` no CI local e o pre-push (#24).
- Cron de relatório de 6 h versionado (script + log) para a rotina deixar rastro no repositório.
- Prova visual dos cards v2 em produção e do bloco Sobre/Observatório no celular.

## 7. Limites desta auditoria

Sem acesso às variáveis da Vercel (flags, firewall) nem ao Chrome do dono. Contagens por SELECT são instantâneas de 2026-11-15 ~04:40 BRT e mudam a cada ciclo. As atribuições de "pedido" vêm do git log, da fila, do checklist e da memória, não do histórico bruto das conversas.
