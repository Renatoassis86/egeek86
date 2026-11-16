# Fontes públicas de pistas de cupom de plataforma (2026-11-16)

Status: PROPOSTA para aprovação do dono. Nenhum coletor foi implementado e nenhuma coleta automática roda. Tudo abaixo vem de leitura manual de páginas públicas feita em 2026-11-15/16.

## 1. Regras que valem para qualquer fonte

1. A comunidade só dá a PISTA. Nada é divulgado por nós antes de conferido na própria loja (simulação até antes do pagamento), conforme R-30 do Fluxo Mestre.
2. Não reproduzimos o texto dos outros. Guardamos só: nome do cupom, loja, valor, mínimo, validade (quando existir), fonte (handle/URL), primeira vez visto. Nunca texto do post, foto, link de afiliado alheio.
3. Só páginas públicas, sem login, sem entrar em grupo ou canal privado. Telegram só pela prévia web `t.me/s/<canal>`.
4. Gentileza: no máximo 1 requisição por canal a cada 10 min, User-Agent identificado, respeito a robots.txt e a qualquer bloqueio (429/403 = recuo exponencial e pausa de 6 h).
5. Nenhuma pista vira selo, média, menor preço ou mensagem. Ela só entra na fila de conferência.

## 2. Fontes levantadas

Legenda extração: A = código + valor (+ mínimo) legíveis; B = só código ou só valor; C = sem código (só produto/preço). "Testada" = li os 10 posts mais recentes. Validade: nenhuma fonte testada informa validade de forma estruturada.

| # | Fonte | URL | Plataformas | Frequência | Extração | Situação |
|---|---|---|---|---|---|---|
| 1 | SD Descontos (@sddescontos) | https://t.me/s/sddescontos | ML, Shopee, Amazon, Magalu | ~10 posts em 6 h, em lotes | A (código, valor, mínimo inferido) | Testada, ativa |
| 2 | Ofertas Seletronic (@seleofertas) | https://t.me/s/seleofertas | ML, Amazon, iFood | ~1 post/40 min, em lotes | A (código, valor, mínimo em parte) | Testada, ativa |
| 3 | Urubu das Promoções (@urubupromo) | https://t.me/s/urubupromo | Amazon, ML, Shopee, Magalu | ~6 posts/h | B (código por produto, sem mínimo) | Testada, ativa |
| 4 | Fada dos Cupons (@fadapromos) | https://t.me/s/fadapromos | ML, Amazon, Shopee, Shein | ~10 posts em 1,5 h | B (código por produto; lista geral traz mínimo) | Testada, ativa |
| 5 | Pelando Promoções (@pelandobr) | https://t.me/s/pelandobr | Amazon, ML, AliExpress | 1 post/6 min | C (sem código, só produto e preço) | Testada, descartar como fonte de cupom |
| 6 | Portal Seletronic, cupons ML | https://ofertas.seletronic.com.br/loja/mercado-livre/cupons/ | ML (também Amazon, Shopee, Magalu, KaBuM nas páginas /loja/*/cupons/) | Atualização diária (visto "15/11 19:00") | B (código + %, sem mínimo/validade) | Testada |
| 7 | Melhores Cartões, cupons ML/Amazon | https://www.melhorescartoes.com.br/cupom-desconto.html | ML, Amazon, outras | Artigos diários | A em artigos (código, valor, condições) | Achada, não medida |
| 8 | Passageiro de Primeira | https://passageirodeprimeira.com/ | ML, Amazon | Artigos frequentes | B/A (texto livre, "ativar na aba Cupons") | Achada, não medida |
| 9 | Pontos pra Voar | https://pontospravoar.com/ | ML, Amazon, Magalu | Artigo diário "cupons ativos" | B (texto livre) | Achada, não medida |
| 10 | MKT Esportivo | https://www.mktesportivo.com/ | ML | Artigo diário "cupom ML hoje" | A (código por categoria) | Achada, não medida |
| 11 | Adoro Cupom, ML | https://adorocupom.com/cupons-de-desconto/mercado-livre | ML | Diária | B (agregador, "verificados") | Achada, não medida |
| 12 | Influenciador Magalu | https://t.me/s/parceiromagaludivulgador | Magalu | n/d | n/d | Citada em diretório; não medida |
| 13 | NERD OFERTAS | https://t.me/s/nerdofertas | lojas de nerd/games | n/d | n/d | Citada em diretório; não medida |
| 14 | GPCR Promo | https://t.me/s/gpcrpromo | hardware | n/d | n/d | Citada em diretório; não medida |
| 15 | Melhores Descontos (grupo Telegram) | link encurtado na página do Melhores Cartões | Amazon, ML, Shopee | n/d | n/d | Link não resolvido; precisa confirmação manual |
| 16 | Promobit / Pelando (sites) | promobit.com.br, pelando.com.br | todas | Alta | n/d | URLs de cupons que tentei devolveram 404; descobrir rota correta e ler termos antes |

Observações: Gatry e Jogo Barato não foram testados nesta rodada (não apareceram nas buscas; Jogo Barato é referência de paridade, não fonte). As listas de diretórios de grupos (gruposbrasil, meusgrupos, telegram-store) são catálogos automáticos e não confirmam atividade; usei só os canais que li ao vivo. Canais de cupom Shopee e Magalu com extração boa: não achei nenhum dedicado e testado, a cobertura dessas lojas vem dos canais multiloja (1 a 4).

## 3. Qualidade medida (amostra de 10 posts por fonte, 2026-11-15 à noite)

| Fonte | Posts com código | Com valor | Com mínimo | Com validade | Observação |
|---|---|---|---|---|---|
| SD Descontos | 4 de 10 | 4 | 2 (inferido do formato "R$20/119") | 0 | Posta o aviso de "esgotado", útil para encerrar candidato |
| Seletronic Telegram | 9 de 10 | 9 | 3 | 0 | Mistura iFood; cupons de ML aparecem em dobro com os do SD |
| Urubu | 5 de 10 | 0 (só preço final) | 0 | 0 | Código ligado a produto, serve como candidato de "cupom de produto", não de loja inteira |
| Fada | 10 de 10 | 1 post geral | 1 post geral | 0 | Maioria é cupom repetido anexado a produto; mensagem geral traz 3 cupons com mínimo |
| Pelando TG | 0 de 10 | 0 | 0 | 0 | Só aviso genérico "pode acabar a qualquer momento" |
| Portal Seletronic | 12 de 12 visíveis | 12 | 0 | 0 | Data da página é da atualização, não de cada cupom |

Conclusões:
- Código e valor saem com boa taxa nos canais 1 a 4 e no portal. Mínimo sai pela metade. Validade praticamente nunca sai: a validade só se obtém na conferência na loja.
- Convergência entre fontes é sinal forte: os códigos TODO1511SITE, TODOSITE1511, SITETODO1511, BEBESPETS1511, KBEAUTY1511 e ESPORTES1511 apareceram em 3 ou 4 canais independentes na mesma noite. Esses códigos têm padrão (nome + data DDMM), que também ajuda a dedupar e a estimar fim de vida.
- Códigos ligados a produto (Urubu, Fada) não são cupom de plataforma inteira e não servem para o escopo pedido, salvo quando repetem em muitos produtos.
- Amazon e Shopee têm pouco código textual (Amazon é cupom de "resgatar na página"; Shopee quase sempre sem código). Para essas duas lojas as pistas serão fracas e o ganho principal continua sendo a leitura direta pela aba logada.
- Os testes foram feitos com WebFetch (leitura resumida por modelo). Um coletor real precisa de parser próprio de HTML de `t.me/s/` (blocos `tgme_widget_message_text`, data em `<time datetime>`), o que dá a data completa que a leitura resumida não mostrou.

## 4. Desenho proposto (não implementado)

### 4.1 Tabela própria `cupom_candidato`
Campos: id, loja (ml/amazon/shopee/magalu), codigo (normalizado em maiúsculas), valor_texto, valor_tipo (reais/percentual), valor_num, minimo_num, validade_texto, fonte_ids (array, uma linha por código+loja, fontes acumuladas), contagem_fontes, primeira_vez_visto, ultima_vez_visto, estado, motivo_estado, conferido_em, cupom_id (vínculo ao cupom confirmado). Sem coluna de texto original, sem URL de afiliado.

Estados: `candidato` -> `em_conferencia` -> `confirmado` (vira entrada normal do pipeline de cupons, R-30) | `invalido` | `esgotado` | `expirado` | `descartado` (fora de escopo: produto único, público restrito, categoria sem relação com o catálogo).

### 4.2 Coletor
- Um job leve (cron) lê as prévias `t.me/s/<canal>`, no máximo 1 requisição por canal a cada 10 min, rotação entre canais (ex.: 5 canais = 1 requisição a cada 2 min no total).
- Extrai com regex apenas: código (token maiúsculo 5 a 24 caracteres próximo de "cupom/código"), valor (R$ ou %), mínimo ("acima de", "a partir de", padrão "20/119" com marcação de inferência), loja (pelo texto/ domínio do link, sem seguir o link).
- Dedupe por (loja, código). Convergência (>= 2 fontes) sobe a prioridade de conferência. Fonte única entra com prioridade baixa.
- Aviso de "esgotado/acabou/encerrado" na mesma fonte marca o candidato como `esgotado` e cancela conferência pendente.
- Corte de ruído: códigos de produto único, de iFood/outros fora das 4 lojas, e cupons de público restrito (Meli+, Prime, "app") ficam marcados e só seguem se a regra R-30 e R-49a os aceitarem.

### 4.3 Confirmação (regra de ouro)
1. A equipe de cupons (memória agentes-cupons-24h) pega candidatos por prioridade e confere na própria loja, na aba logada que o dono já opera, por simulação até antes do pagamento: aplicar o código, ler valor real, mínimo, escopo (loja inteira, categoria, produto), validade e elegibilidade.
2. Só depois da leitura na fonte oficial o candidato vira `confirmado` e o valor/validade lidos na loja (nunca os do post) entram no pipeline normal de cupom e mensagem (R-30: validade futura, sem "% OFF" vedado por R-24, link oficial R-27).
3. Se a loja contradiz a pista, vale a loja; o candidato vira `invalido` com motivo. Pista nunca basta para mensagem.
4. Reconferência periódica dos confirmados segue o acompanhamento já existente ("divulgação de cupom é acompanhada até o fim", R-30).

### 4.4 Cadência
- Coleta: ciclo contínuo respeitando 10 min por canal; sites/portais 1 vez por hora no máximo.
- Conferência: fila prioritária por convergência e frescor; meta de ler o candidato em até 30 min da primeira vez visto; candidato sem conferência em 24 h vira `expirado`.
- Pico noturno e de datas promocionais (os códigos observados são lançados às 18h/22h/00h): a cadência de conferência sobe nesses horários.

### 4.5 Direitos autorais e termos de uso
- Fatos simples (nome de um cupom, valor, mínimo) não são protegidos por direito autorais, mas a base de dados de um site pode ter proteção sui generis e os termos do Telegram e dos portais podem restringir coleta automatizada. Mitigação: só prévia pública, baixíssima taxa, sem armazenar texto, imagem ou link de afiliado alheios, sem republicar a fonte, e nenhum link de volta para a fonte nas nossas mensagens.
- Pendências antes de ligar: (a) ler os Termos de Serviço/API do Telegram quanto a scraping de `t.me/s/` (o caminho oficial para coleta estável é um bot ou a API, que exigiria entrar nos canais, o que o dono vetou); (b) ler robots.txt e termos de cada portal (Seletronic, Promobit, Pelando); (c) validar com o dono se aceita o risco residual, pois não há garantia contratual de acesso. Esta análise não é parecer jurídico.
- Remoção imediata de qualquer fonte que peça ou bloqueie.
- Risco reputacional: nunca citar os canais como origem; a divulgação sai só depois da conferência própria.

### 4.6 Encaixe no Fluxo Mestre
- Novo nó "Coletor de pistas de cupom" na tabela mestre (seção 2), a montante do nó existente de leitura/validação de cupom. Ele escreve só em `cupom_candidato`; não toca em preço, média, selo nem mensagem.
- Nova fila no catálogo (seção 3.1): fila de candidatos de cupom, com pilha de `invalido/esgotado` para auditoria.
- Regra nova proposta (R-61 ou próximo número livre; numeração a ajustar em ata): "Pista de comunidade nunca é divulgada; só cupom lido e confirmado na loja (R-30) pode virar mensagem; texto de terceiros não é armazenado."
- Prioridade na escada de degradação (4.5): o coletor é a primeira classe a pausar em aperto de cota/banco; a conferência segue a prioridade de cupons já definida.
- Loop: segue a regra "loops nunca param" (erro = reinicia, vigia reinjeta), com flag própria de desligamento rápido (sugestão: `CUPOM_PISTAS_COMUNIDADE`, padrão desligada).
- Auditoria: relatório diário de pistas (quantas vistas, confirmadas, taxa de acerto por fonte) alimenta o ranking de fontes e a retirada das de baixa taxa.

### 4.7 Encaixe na equipe de cupons 24h
Os agentes ganham uma entrada a mais: além da descoberta por banners e abas logadas, consomem a fila `candidato` por prioridade. A taxa de confirmação por fonte vira KPI: fonte com menos de 10% de confirmação em 14 dias sai da rotação. O dono segue operando as abas (leitura Shopee/Amazon autorizada) e nada exige conta nova.

## 5. Lista de canais proposta para aprovação do dono

Fase 1 (aprovar para coleta automática, após ok dos termos): 
1. t.me/s/sddescontos
2. t.me/s/seleofertas
3. t.me/s/fadapromos
4. ofertas.seletronic.com.br/loja/{mercado-livre,amazon,shopee,magazine-luiza}/cupons/ (1 requisição/h cada)

Fase 2 (só como pista de cupom de produto/convergência, aprovar separado):
5. t.me/s/urubupromo

Fase 3 (testar antes, leitura manual ainda pendente):
6. Melhores Cartões, MKT Esportivo, Pontos pra Voar, Passageiro de Primeira (artigos diários, extração A/B; exige parser de texto livre, ganho incerto)
7. parceiromagaludivulgador, nerdofertas, gpcrpromo, Melhores Descontos (grupo)

Fora: Pelando Promoções no Telegram (sem código), diretórios de grupos.

## 6. Riscos
- Termos de uso do Telegram e dos portais quanto a coleta automatizada (ver 4.5).
- Fontes de afiliados replicam entre si: convergência pode ser eco, não confirmação independente. Por isso a confirmação só vale na loja.
- Cupom com mínimo/escopo diferentes do dito no post: tratado pela conferência.
- Fonte muda de HTML ou some: monitorar taxa de extração por fonte e alertar.
- Possível ingestão maliciosa (código falso para induzir divulgação): impedida pela regra de nunca divulgar sem leitura na loja.
- Carga na conta logada do dono ao simular carrinho: limitar simulações por hora (alinhar com a cota de leitura já vigente).

## 7. Recomendação
Aprovar a Fase 1 com a ressalva de checar termos primeiro; implementar o coletor atrás de flag desligada em rodada separada, com medição de 14 dias da taxa de confirmação por fonte antes de qualquer outra fase. O ganho esperado é maior para Mercado Livre (códigos de banner com padrão de data) e baixo para Amazon e Shopee.

## 8. O que não foi verificado
- Datas completas dos posts (a leitura resumida só mostrou horário).
- Número de inscritos e atividade histórica além da noite medida.
- Termos e robots.txt de cada fonte.
- Gatry, Jogo Barato, Promobit e Pelando (rotas de cupom devolveram 404).
