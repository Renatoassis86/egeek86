# Cupons do concorrente: por que não captamos, e o veredito (2026-11-16)

Pedido do dono (2026-11-16): "Existe cupom que o concorrente colocou. Como não conseguimos captar esse cupom? Teste ele para nossos itens. Veja se os cupons dos concorrentes são válidos." Regra nova: R-79 no `FLUXO_MESTRE.md`. Tudo abaixo foi medido hoje (código, banco, prévias públicas `t.me/s/<canal>` e a aba logada do dono); a hora é UTC (BRT = UTC menos 3).

## 1. Causa: por que o sistema não viu esses cupons

Os três códigos (TODO1511SITE, SITETODO1511, TODOSITE1511) são cupons de **digitar código**. Nenhum dos nossos leitores olha esse tipo:

| Tipo de cupom | Onde nasce | Quem lê hoje | Lacuna |
|---|---|---|---|
| ML, campanha listada | portal `/cupons` (campanhas "Em produtos selecionados", por loja, por categoria; hoje inclui "R$50 OFF Black Friday, mínimo R$120, vence 30/11") | `ml-cupons-portal.js` (3.177 vistos em 6 h) | cupom de digitar código só aparece na lista DEPOIS de inserido na conta |
| ML, código de banner/campanha (o caso de hoje) | banner/post/canal + "Cupons > Inserir código" | **ninguém** | sem fonte de códigos e sem validador |
| ML, link `/sec/...` de ativação | link de afiliado de terceiro; ativa o cupom na conta (app) | ninguém | link alheio não é guardado; resultado só aparece em "Meus cupons" da conta |
| ML, cupom do anúncio | modal `/cupons/pdp` | `ml-cupons-item.js` | cobre só o item aberto |
| Shopee, vouchers | `/m/cupom-de-desconto` e códigos em canais (ex. S3U4DMF4V, C0RR1D411D011) | `shopee-cupons.js` (só a página) | códigos textuais sem fonte nem validador |
| Amazon, cupom no produto | página do produto (selo) | `cupons-24h.js` (por ASIN) | OK para o escopo |
| Amazon, Exclusivo Prime 25% | promoção Prime | trilha #66/#82 | já monitorada; não reconferida nesta rodada |

Conclusão da causa: o dado nasceu fora de toda superfície que lemos (canal e código digitado). A janela também é curta (a de R$220 durou cerca de 30 min), então só uma pista em minutos e uma conferência na loja resolvem.

## 2. Melhor fonte automatizável por tipo

1. **ML, código**: pista pública da comunidade (prévia `t.me/s`, sem entrar em grupo) vira CANDIDATO; a loja decide pela aba logada ("Inserir código"). Já implementado (seção 4).
2. **ML, campanha listada**: portal `/cupons` (existente). Novo achado: há uma aba "Meus cupons" e uma seção "Cupons Black Friday" (o canal citou "Mais > Cupons Black Friday" no app às 21:09 BRT, cupom de R$40 OFF "no app"); ler "Meus cupons" antes/depois de inserir é a segunda prova de aceite.
3. **ML, link `/sec`**: não captar (link de terceiro). A pista é o código; o link só serve para o dono abrir no app.
4. **Shopee e Amazon**: códigos textuais são raros; cobertura continua pelas abas logadas. Candidatos Shopee/Magalu são gravados mas ficam com prioridade 0 (sem validador por código, R-65).
5. **Página oficial como segunda fonte (não feito)**: ler banners da home e `/ofertas` do ML procurando "Use o cupom X". Não implementado: exige leitor novo na aba e não houve cupom de banner hoje para calibrar.

## 3. Veredito do que o concorrente divulgou (evidência)

Prévias públicas lidas 02:2x UTC de `sddescontos`, `seleofertas` e `fadapromos` (3 canais independentes) e teste na aba logada (Cupons > Inserir código) às 02:30 UTC.

| Cupom | Existiu? | Janela provável | Hoje na loja | Para os nossos itens |
|---|---|---|---|---|
| **TODO1511SITE** (R$220 OFF, mínimo R$1.499, limite R$220) | **Sim.** 3 canais convergem: 22:00:00Z (sddescontos), 22:00:30Z (seleofertas), 22:00:02Z (fadapromos) e 6 posts de produto de 22:05 a 22:14Z | de 22:00Z (19:00 BRT) ou antes até cerca de 22:27Z (19:27 BRT): o post de 22:27Z, "AINDA TEM", lista só os dois menores. O cartão que você viu dizia "Encerra em 01:55:25" postado 19:05 BRT, ou seja, fim da campanha por volta de 21:00 BRT | **Não aceito** ("Tivemos um problema") | 5.803 de 24.805 ofertas ML ativas alcançam o mínimo de R$1.499 (19.002 abaixo) |
| **SITETODO1511** (R$100 OFF, mínimo R$999) | **Sim.** sddescontos e fadapromos | de 22:00Z até pelo menos 22:27Z (19:27 BRT) | **Não aceito** | 6.917 ofertas alcançam o mínimo de R$999 |
| **TODOSITE1511** (R$20 OFF, mínimo R$199; o post diz R$20/119, a lista da Fada diz "acima de R$119") | **Sim.** sddescontos e fadapromos; mínimo divergente entre fontes (R$119 nos canais, R$199 na sua mensagem): **só a loja decide** | idem | **Não aceito** | com R$199: 16.709 ofertas; com R$119 seria mais |
| Link `mercadolivre.com.br/sec/1Nzy99B` (o seu) | n/d | n/d | Abri na aba: "Parece que esta página não existe" | n/d |
| Link `mercadolivre.com.br/sec/1TTwcDm` (o que os canais usaram) | sim, nos posts | n/d | Abri na aba: mesma página "não existe" | n/d |
| Amazon, Exclusivo Prime 25% (jogos PS4/Switch) | não conferido agora | n/d | já monitorado (#66/#82) | seguir a trilha existente |

Sobre "para os nossos itens": o número acima é quantas ofertas **alcançam o mínimo** (cupom é por carrinho). **Não** é "vale para todos os itens": o cartão do concorrente dizia "TODO O SITE" no título e **"Em produtos selecionados"** no escopo, e a loja escrita manda. Logo todas as ofertas são "depende de simulação" (R-62/R-66); o desconto estimado (R$220, R$100 e R$20, o próprio teto) é interno e nunca vira preço final público sem simulação aplicada. Os exemplos do concorrente também não nos servem de graça: o Monitor Odyssey G5 de R$1.227,88 fica abaixo do mínimo de R$1.499 (o concorrente o mostrou "com cupom" porque o carrinho dele somava itens), e o volante G29 de R$1.379 também.

### Limite do teste (importante)
- Os três códigos devolveram a **mesma mensagem genérica** "Tivemos um problema". Fiz um **controle com um código inventado** e ele devolveu exatamente a mesma mensagem. Portanto a mensagem **não distingue "encerrado" de "nunca existiu"**: prova só que o código **não está aceito agora**. A existência vem da convergência de três canais e da ordem cronológica dos posts, não da loja. O validador novo trata o erro genérico como "ainda não aceito" e só rebaixa para inválido depois de 3 conferências com 30 min de intervalo.
- Estados hoje: os três candidatos estão gravados em `cupom_candidato` como `em_conferencia` (1 tentativa cada); sem aceite viram `expirado` em 24 h da primeira vez visto, nunca `validado`. Nada foi divulgado. Foram gravados 27 candidatos no total (ML, Shopee, Magalu, outras), com a flag desligada em produção: ninguém lê a tabela.
- Não inseri outros códigos na sua conta (VIPNOML, OFFTEC e as categorias de 15/11 já foram avisados como esgotados pelos canais). MELIMAIS1411 é cupom Meli+ (restrito).
- O que não consegui verificar: o início exato (18:45 BRT que você viu); as prévias só mostram posts a partir de 22:00Z do dia 15, e a página de campanha não guarda histórico.

## 4. O que foi implementado (atrás da flag `CUPOM_PISTAS_COMUNIDADE`, desligada por padrão)

| Peça | Arquivo | Função |
|---|---|---|
| Tabelas | `drizzle/migrations/0064_cupom_candidato.sql` (+ rollback; `scripts/aplicar-migration-0064.ts`) | `cupom_candidato` (código, rede, valor, mínimo, limite, escopo dito, fontes, primeira/última vez, estado, tentativas, `lido_na_loja`) e `cupom_pista_fonte` (controle de gentileza). Sem texto de post, foto nem link alheio. Aplicada (aditiva). |
| Núcleo puro | `src/lib/coupons/candidato.ts` | parser da prévia `t.me/s`, extração de código/valor/mínimo/limite/escopo, agregação por (rede, código), leitor do resultado de "Inserir código", estado (candidato, em conferência, validado, inválido, expirado, descartado), aplicação ao nosso item, gentileza (1 req/10 min por canal, 429/403 pausa 6 h) |
| Coletor | `scripts/coletar-pistas-cupom.ts` | só os 3 canais da Fase 1, só a prévia pública; flag desligada = sai sem fazer nada |
| Banco | `src/server/coupons/candidatos.ts` | grava/atualiza, fila de conferência por prioridade (convergência, frescor, escopo), expira em 24 h, registra conferência e, se a LOJA declarar "Em todo o Mercado Livre", entra em `coupon_items` como `loja_inteira` pelo pipeline normal (cofre: prova `lista_oficial_de_cupons`, TTL 120 min) |
| Rota | `src/app/api/ingest/cupom-candidato/route.ts` | GET fila (até 3), POST `{ codigo, texto }` (origem ML + token; o servidor interpreta o texto do modal) |
| Validador na aba | `public/loops/ml-cupom-codigo.js` | abre "Inserir código", insere UM código, lê o resultado, envia; 15 min por ciclo, 3 por ciclo, 8 por hora, pausa 20 a 40 s entre códigos, nunca contorna captcha |
| Teste nos nossos itens | `scripts/testar-cupom-nos-itens.ts` | alcance por mínimo, "sim" só com escopo declarado pela loja, "depende" nos demais, desconto estimado interno; `--retest` escolhe o item mais barato que alcança o mínimo e confere o limite de simulações por hora |
| Testes | `scripts/test-cupom-candidato-79.ts` e `-ingestao.ts` (lote aceito pelo validador do pipeline) | com posts reais de 15/11 (extração, escopo, "TODO O SITE" + "selecionados" não é plataforma, erro genérico, estados, mínimo, gentileza, flag) |

Cofre: o cupom aceito só chega ao cofre pelo pipeline de `coupon_items` com escopo de loja inteira. Cupom "selecionados" ou de categoria fica `validado` só no candidato e é aplicado **por item**, com simulação (`/api/ingest/cofre-simulacao`, limite de 30 por hora, item removido do carrinho depois). A rotina de reteste é `testar-cupom-nos-itens.ts --retest`; a simulação em si (adicionar ao carrinho, ler o valor, remover) continua sendo operada na aba, sem dado de cartão.

## 5. Como operar (quando o dono ligar a flag)
1. `CUPOM_PISTAS_COMUNIDADE=1` no ambiente do servidor e do coletor. Agendar `coletar-pistas-cupom.ts` de 10 em 10 min (o próprio script respeita o intervalo).
2. Na aba `/cupons` do ML: `window.__MLCOD_CFG = { api, token, enviar: false }`, injetar `ml-cupom-codigo.js`, conferir `__mlcod.status()` e `await __mlcod.testar(['CODIGO'])` com um código de teste, depois `enviar: true`.
3. Medir 14 dias a taxa de aceite por fonte (fonte abaixo de 10% sai da rotação).

## 6. O que depende do dono
- Ligar a flag (a coleta é de prévia pública; os termos de Telegram e portais seguem pendentes da seção 4.5 de `cupons-fontes-comunidade-2026-11-16.md`).
- Aceitar que código **aceito** pela loja entra em "Meus cupons" da conta dele (efeito normal de inserir).
- Decidir se vale o leitor de banners/home do ML como segunda fonte (seção 2, item 5).
- Autorizar simulações de carrinho com cupom aplicado quando houver cupom validado.
