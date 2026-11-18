# Checklist de pendências (2026-11-18)

Legenda: [x] feito e verificado em produção · [~] implementado, **ainda não verificado** · [ ] pendente · [?] depende de resposta do dono (perguntas na seção 3).
Fonte das regras: `docs/03-metodologia/FLUXO_MESTRE.md` §15.10 a 15.18 e `CLAUDE.md`. As regras do dono estão executáveis em `scripts/test-regras-do-dono.ts` (roda no portão).

## 1. Pedidos do dono desta sessão

### Fluxo de mensagens
- [~] **Envio mais rápido (R-98):** janela por loja, 3 lojas por vez, conexões órfãs. Medido: 19 → 49 envios/h. Falta verificar 24 h e chegar perto de 200/h.
- [ ] **Detecção passa de 22 s em ~metade dos ciclos** (nesses ciclos não nascem propostas novas): reduzir o custo do pool (150 por loja x 8 lojas) ou dividir por loja.
- [ ] **Envios `failed` de 31 a 35 s** que ainda aparecem 1 a 2 por ciclo, e propostas que expiram na reconferência ao vivo (preço velho, sumiu ou mudou).
- [~] **Link de compra no texto de toda postagem do Telegram (R-99):** no ar; verificar nas próximas mensagens de cada gatilho (G2, OK, T, P, AC, cupom) e que o cartão com foto não perde a legenda.
- [~] **Diversidade obrigatória (R-100):** tipo, produto 72 h e rede; teto de tipo 20%. Falta medir em 24 h: tipos por loja, redes e produtos repetidos.
- [ ] **Amazon com 0 mensagens em 24 h** (preço com leitura <= 45 min e depende do Chrome). [?] ver pergunta 2.
- [x] **Vitrine de jogos até R$ 200 como plus, fora do ciclo normal (R-96):** cron próprio, silenciosa, não escreve em `group_messages`, não importa o motor do ciclo. Agora com teste que impede quebrar isso.
- [~] **Vitrine: 4 famílias sempre juntas e rodízio:** no ar; conferir a próxima capa no canal.

### Catálogo e lojas
- [~] **Beleza (R-97):** 108+ produtos (MAC primeiro). Agora no pipeline de mensagens; **ainda não verificado**: primeira mensagem no canal e abertura do departamento no site.
- [ ] Beleza: confirmar domínios do ML (hoje busca sem `domain_id`), termos da Shopee, tipo de cartão próprio, limites de mensagem da loja; "Mini Batom" e anúncios com cara de imitação.
- [ ] **Notebooks:** só 13 masters reais em Tecnologia; semeadura de Tecnologia agora ligada (`SEMEADURA_LOJAS=beleza,tecnologia`); verificar quantos notebooks entram em 24 h.
- [ ] **#152 Restaurar `SEMEADURA_LOJAS` com as 8 lojas** quando a Beleza tiver base (as outras 5 lojas não recebem catálogo novo enquanto isso).
- [ ] **Livros na Shopee:** sem categoria configurada (exceção registrada no teste das regras).
- [~] **Janela de 7 dias fora, Amazon igual às outras lojas (#149):** **só ficou aplicada de verdade hoje**; um erro meu tinha deixado `OFFER_FRESHNESS_DAYS` em 7 depois de eu dizer que era 365. Falta deploy e medir a média em 24 h.
- [~] **Liberar todo produto checado (R-93):** 12 liberações reais testadas; medir rascunhos Shopee (2.145) caindo.
- [ ] Reavaliar os **94 de "digital entre parênteses"** e o grupo `review` do porteiro. [?] pergunta 4.

### Cupons (#153, P0)
- [ ] Ler **muito mais itens por dia** (hoje ~100 de 27 mil): fila de itens com maior chance de cupom, 1.000+/dia.
- [ ] Ler a **página de cupons de cada plataforma** (ML, Shopee, Amazon) e casar com categorias/lojas; hoje `affiliate_coupons` está vazia.
- [ ] **Benefício de cartão/crédito da Amazon** (ITAU20OFF, R$ 30 Amazon Crédito) com prova no item. [?] pergunta 3.
- [ ] 27 candidatos no cofre sem conclusão: fechar o ciclo (validar por simulação de compra ou descartar).

### Plataforma e operação
- [ ] **Amazon independente do Chrome:** exige assinar o Keepa e autorizar que escreva preço. [?] pergunta 2.
- [ ] **Coletores `collect-vertical:*` lentos** (4 a 5 min cada, parciais, 8 lojas sobrepostas): reduzir carga no banco.
- [ ] **Loops do Chrome congelam** e o Chrome troca as abas: diagnosticar a causa (memória, abas de outros grupos) e estabilizar; vigia de 30 em 30 min reinjeta.
- [ ] **ML: links `meli.la` pendentes** (1.176 ofertas ativas invisíveis) e quarentena sem motivo (165) e `review` sem prazo (relatório de retenção, itens 3 a 5).
- [ ] Medidor de retenção no portão (`scripts/medir-retencao.ts`) e alarme se livres/ativas < 90%.
- [ ] Home "Compare preços": conferir visual e uso real; capa da vitrine conferida no Telegram.

## 2. Pendências antigas da fila (`docs/fila-de-execucao.md`)
- [ ] #133 paridade preço da página x mensagem (sonda D7) · [ ] #137 estrangular `group-rules.ts` (2.500+ linhas) · [ ] congelar a 1ª onda de módulos após 7 dias verdes (D4) e hooks do Claude Code (D6).
- [ ] AUD-02 (30 mensagens com preço-isca, decisão do dono), AUD-12 (Amazon sem frescor), AUD-19 (link nunca verificado em ~32,7 mil ofertas), AUD-25/26/27.
- [ ] Média com 2 cotações no estado diário (D1) e estender a janela pública de indicadores.
- [ ] Relatório final consolidado de tudo que foi feito (quando a lista fechar).

## 3. Respostas do dono (2026-11-18) e o que mudou
1. **Amazon nas mensagens:** regra das outras lojas (R-101): feito no codigo e nos testes; falta deploy e medir as mensagens da Amazon em 24 h.
2. **Keepa:** continua pelo Chrome, tentando solucoes de raspagem. **As 9h: explicar como assinar** (plano, custo, como a chave entra na Vercel). Pendente: preparar o passo a passo.
3. **Cartao/credito da Amazon:** autorizado com prova no item. Verificado no desktop: o Itau/ITAU20OFF e o "R$ 30 Amazon Credito" nao estao no DOM da aba logada; so "5% off a vista" e um widget de marketing. Sem prova estavel nada sai; pendente ler a pagina como o app a mostra.
4. **94 "digital entre parenteses" e `review`:** nao reavaliar (manter fora). Item removido da lista.
