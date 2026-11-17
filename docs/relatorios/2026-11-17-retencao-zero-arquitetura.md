# Retenção zero: análise da arquitetura e o que mudar (2026-11-17)

Pedido do dono: "nenhum produto fique retido e não seja dirigido ao grupo ou atualizado no site por questão de restrição"; "o site precisa ter todos os produtos ativos sempre; só sai dos catálogos e vitrines quando o produto não estiver mais ativo no link"; nunca postar pausado, sem estoque ou sem venda ativa. Medidor reproduzível: `scripts/medir-retencao.ts` (só leitura).

## 1. Medição (banco de produção, 2026-11-17 à noite)

### 1.1 Funil de ofertas ativas com preço: 35.580
| Situação | Ofertas | Natureza |
|---|---|---|
| Livres (aparecem no site e podem ir ao grupo) | 30.169 | ok |
| Porteiro do catálogo (`rejected`/`review`) | 3.191 | escopo do dono (ver 1.3) |
| Link de afiliado pendente (ML) | 1.176 | **técnica, transitória** |
| Quarentena | 724 | proteção; 165 sem motivo gravado |
| Leitura velha (> 7 dias) | 11 | irrelevante |
| Rascunho com preço (fora das ativas): Shopee 2.145, Amazon 79 | 2.224 | **técnica**, tratada pela R-93 |

Fora do ar de verdade: expirada 9.864 (3.764 lidas nos últimos 3 dias, a página confirma que acabou), pausada 1.466, arquivada 65. Essas **devem** ficar fora.

### 1.2 Masters (produtos) com oferta ativa e preço x visíveis no site
games 5.203 x 3.747 (1.456 fora) | eletrônicos 1.793 x 1.622 (171) | esporte 625 x 600 | tecnologia 832 x 828 | casa 693 x 691 | livros 245 x 244 | impressão 3D 165 x 164. Fora do site por causa técnica (e não de escopo) é pouco: o grosso da diferença de games é escopo.

### 1.3 Porteiro: o que é escopo do dono e o que merece revisão
Escopo já decidido (não mexer): item miúdo (games 373, eletrônicos 153, ambíguo 40), clone de controle (86+29), destravado/modificado (65), retrô (55), reparo/reposição (47), console fora de linha (37), usado (30), botão/gatilho e condutiva (66), periférico de PC (28). **Revisão sugerida:** `digital_parenteses` (94 masters de games) e o veredito `review` (aguardando conferência): é o único grupo grande que pode estar barrando produto legítimo.

### 1.4 O maior gargalo: o envio, não a retenção
Últimas 24 h (Telegram): **445 mensagens enviadas** contra **~11.100 propostas expiradas sem envio** (AC 4.281, G2 1.244). Games propôs 1.286 produtos e enviou 93. Capacidade teórica: 7 canais x 1 por minuto = 420/h; real ~20/h até as 22h UTC e 91 na última hora, depois das correções de hoje (R-93/R-94, pool com rotação por minuto). Hoje o produto não é retido por regra, ele **expira na fila** porque o envio é sequencial (revalidação ao vivo + 1 minuto entre mensagens por canal + 60 por ciclo) e a geração de propostas é muito maior que a vazão.

## 2. Causas e mudanças

| # | Causa | Mudança no código | Mudança no Guia |
|---|---|---|---|
| 1 | Rascunho Shopee/ML/Amazon só saía por cartão humano; só a Amazon e 4 motivos eram automáticos | **Feito (R-93)**: aprovação contínua em todas as lojas, inclui dispersão, 3 em paralelo, lote 100/5 min | R-93 (§15.10) |
| 2 | Assimetria entre lojas (cotas, aviso só sem média em games, corte do total) | **Feito (R-94)**: cotas únicas, rotação pura 35%, intercalação, teste que proíbe exceção por loja | R-94 (§15.11) |
| 3 | Link de afiliado pendente do ML (1.176 ativas invisíveis) | Fila de geração de link ordenada por **produto sem nenhuma oferta visível** primeiro; contador no medidor; alarme se > 200 por > 2 h | R-95 |
| 4 | Quarentena sem prazo (724; 165 sem motivo) | Reavaliação automática a cada 6 h: isca/divergente voltam se o preço normalizou; motivo vazio vira defeito; quarentena nunca esconde o **produto**, só a oferta (outra oferta válida o mantém) | R-95 |
| 5 | Porteiro `review` sem prazo | Fila de revisão com SLA e auto-resolução quando a regra de escopo não se aplica; lista ao dono só o que depende de decisão | R-95 |
| 6 | Envio sequencial com revalidação ao vivo; propostas expiram | Paralelizar revalidações no laço de envio; subir `MAX_SENDS_PER_RUN`; fila por prioridade de **idade** (a mais antiga primeiro, para ninguém expirar sempre); gerar só o que a vazão consegue enviar | R-95 e orçamento do ciclo (§ Fluxo) |
| 7 | Pool geral só olha produto com razão; nunca "vistos" | **Feito (R-94)**: rotação pura; meta: todo produto ativo considerado a cada 2 h | R-94 |
| 8 | "Ativo no link" provado só pela coleta; pausado/sem estoque demora a sair | Regra única: oferta só é clicável com leitura de **disponibilidade** fresca (ML 24 h, Shopee 24 h, Amazon 45 min); `miss_count` >= 2 tira da vitrine e das mensagens na hora | R-95 |
| 9 | Site: produto sai do catálogo por filtros acumulados (identidade, porteiro, quarentena) | Página do produto e catálogo mostram **todo produto com oferta ativa e link publicável**; o que o porteiro rejeita por escopo some, o resto fica | R-95 |

## 3. Regra proposta R-95, "Retenção zero" (para o Guia)
1. Um produto só sai de catálogo, vitrine e mensagens quando (a) nenhuma oferta dele está ativa no link (pausada, expirada, sem estoque, sem venda) ou (b) está fora do escopo que o **dono** definiu (usado, retrô, fora de linha, miúdo, clone).
2. Toda outra retenção (rascunho, link pendente, quarentena, revisão) tem **prazo máximo e saída automática**; vencido o prazo vira alarme no medidor, nunca fica silencioso.
3. O medidor `scripts/medir-retencao.ts` roda no vigia e no portão: se `livres / ativas` cair abaixo de 90% o portão avisa.
4. Todo canal (existente ou novo) usa o mesmo pool, as mesmas cotas e a mesma classificação (Novo em monitoramento, Em monitoramento, diagnóstico só com critérios).
5. Nada pausado, sem estoque ou sem venda ativa é postado (já valia; passa a ser teste).

## 4. Nova seção da home: busca com ranking de menor preço (estilo Buscapé)
Penúltima seção (antes do cadastro de e-mail): campo de busca, o visitante escolhe o produto e vê **todas as ofertas do produto do menor ao maior preço**, com loja, preço, selo/classificação (Novo em monitoramento, Em monitoramento ou diagnóstico), indicadores quando existirem (média, menor preço registrado, queda) e o link de saída de cada oferta (sempre o link de afiliado do dono, R-70). Todos os departamentos, não só games. Só ofertas ativas, com link publicável e leitura fresca.

## 5. Impressão 3D
Já aberta no site (`dept_impressao3d` ligada, 164 produtos visíveis) e nas mensagens (231 enviadas em 3 dias). Faltava a Amazon (liberada agora em `AMAZON_MENSAGENS_VERTICAIS`). Gargalo: 2.347 propostas expiradas em 3 dias, mesma causa do item 1.4. O comentário "fechada ao público" em `departamentos.ts` e `verticais.ts` está desatualizado e será corrigido.

## 6. Ordem de execução
1. Feito hoje: R-93, R-94, Amazon e 3D liberadas.
2. Próximo: item 6 (vazão do envio) e item 8 (disponibilidade), porque são o que mais perde produto hoje.
3. Depois: itens 3, 4, 5 e 9, medidor no portão, seção da home.
4. Medir após 24 h: enviadas/dia, expiradas sem envio, `livres/ativas`.
