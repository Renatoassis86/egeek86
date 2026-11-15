# Plano de verificação e de correção dos links (#119, 2026-11-15)

Pedido do dono: verificar todas as situações de todos os produtos para saber se há divergência entre o que foi postado e o valor real na página; plano de verificação de todos os links e plano de correção.

## Como a página do link é lida (descoberta técnica, validada)
`GET https://meli.la/<id>` seguindo redirecionamentos, com User-Agent de iPhone, cai em `https://www.mercadolivre.com.br/social/<perfil>?...` (HTML de cerca de 390 KB, sem captcha). O estado embutido tem `"polycards":[{ metadata:{ id (anúncio), product_id (catálogo) }, components:[title, price (current_price, previous_price), paused ("Anúncio pausado")] }]`. A página traz **um** cartão (o do link). Fixtures reais em `scripts/fixtures/polycards-*.html`; leitor em `src/lib/links/polycard.ts`; teste `scripts/test-auditoria-links-119.ts`.

Casos reais do dono lidos assim:
| Link | Cartão da página | A oferta no banco |
|---|---|---|
| `meli.la/2DjU21f` (A1 Combo, ACLAPACOMERCIO) | MLB5563781513, R$ 3.826, **Anúncio pausado** | R$ 3.519,92 (preço de outro anúncio do vendedor) |
| `meli.la/2C2QDdM` (P2S Combo, EGGHOME) | MLB5487109677, R$ 9.399 (de 10.999), ativo | alternava R$ 9.399 e **R$ 19.899,10** a cada ciclo |

Por que a EGGHOME aparecia a R$ 19.899,10 (investigado): o vendedor tem anúncios em catálogos diferentes (um de R$ 9.399 e outro de R$ 19.899,10). O coletor de verticais lê um catálogo por vez e grava, na MESMA oferta (produto, rede, vendedor), o anúncio do catálogo da vez. O histórico mostra a troca 939900 / 1989910 a cada 30 a 60 min desde 16:14Z. A gravação de 21:01Z não foi minha: foi o próprio coletor.

## Verificação
1. Universo: todas as ofertas ativas com link. Ordem: combos P2S/P1S/A1 (fase 1) -> demais impressoras (fase 2) -> resto em rodízio (fase 3).
2. ML (`meli.la`): resolver no servidor, 1 requisição a cada 1,2 a 2 s, User-Agent fixo, cache por link, parar em 429/captcha e retomar no ciclo seguinte. URL direta `produto.mercadolivre.com.br/MLB-...` não tem cartão: registra `erro_leitura` (não bloqueia).
3. Comparação: anúncio esperado (`link_item_id`, senão `external_item_id`) ou, sem anúncio, o catálogo; preço dentro de 0,5%; cartão pausado. Vereditos: `ok | preco_divergente | item_diferente | pausado | sem_link | erro_leitura`.
4. Gravação em `offer_link_audit` (migration 0056, idempotente, com rollback). Job `auditoria-links` em `collector_runs`.
5. Amazon e Shopee: **não** usam esta via. A Amazon já grava preço lido da página a cada visita do loop assistido; a Shopee, pela API. Para elas vale a regra de confirmação fresca (queda 60 min, lista 6 h, Amazon 130 min). Não há comparação página x oferta nova para elas: **não verificado** além da idade da confirmação.
6. Execução recorrente: dentro do cron `group-messages` (a cada minuto, flag `AUDITORIA_LINKS`, ligada), com o tempo que sobra: combos a cada 30 min, demais impressoras a cada 6 h, resto a cada 24 h. Alarme no Telegram do dono (1 vez a cada 6 h) se mais de 2% das leituras de 24 h divergirem.

## Correção
- (A) Imediata, ligada: o porteiro (`avaliarConfirmacao`) e o `live-recheck` tiram de mensagem de queda, card e lista a oferta cujo último veredito (até 6 h) seja `preco_divergente`, `item_diferente`, `pausado` ou `sem_link`. **Desvio do pedido, por escolha minha**: oferta nunca auditada ou com `erro_leitura` NÃO é barrada (senão as 26 mil ofertas ML ficariam mudas até o rodízio terminar e uma falha de leitura silenciaria o canal). Combos e demais impressoras são auditados primeiro.
- (B) Dados (`scripts/auditar-links-119.ts --apply --por=`; backup NDJSON antes; `--rollback=`): `pausado` -> `expired`; `preco_divergente` e `item_diferente` do mesmo catálogo -> regrava o preço pela página (fonte da verdade), anúncio do link, `previous_price` zerado (sem "queda"); `item_diferente` de outro catálogo, `erro_leitura` e `sem_link` -> só registra (o porteiro barra as mensagens).
- (C) Causa-raiz no coletor (feito): anúncio precificado gravado (`external_item_id`), troca de anúncio zera o preço anterior, anúncio irmão mais caro não derruba o anúncio preso, link realinhado ao anúncio do preço, `link_item_id` gravado pelo gerador de links.
- (D) Prevenção: auditoria recorrente, teste do leitor com HTML real, alarme. **Pendente**: métrica no admin (não feita).
- (E) Mensagens já enviadas com preço divergente: ver o relatório da execução (privado por oferta). **Nada foi apagado do canal.**

## Limites conhecidos
- Variação (voltagem 127V/220V, cor) não vem na página lida nem na API de catálogo: o veredito compara o anúncio e o preço do cartão, não a variação escolhida.
- O cartão da página pode mostrar o preço de lista do anúncio, sem cupom, Pix ou cartão.
- Leitura de produção (Vercel) do `meli.la` não foi testada: se o ML responder 429/captcha ao IP do servidor, o ciclo para e registra `parou` (sem silenciar mensagens).

## Entrega 1 (ordem do dono: regra rígida no privado) - 2026-11-15
- **Privado (lista de 10 min e cards de queda de P2S/P1S Combo)**: só entra oferta com último veredito `ok` em `offer_link_audit` nas últimas 6 h (um `erro_leitura` passageiro não derruba se houve `ok` nas 6 h). Queda: também confirmação de preço <= 60 min. Sem veredito ou só `erro_leitura` = não sai. Flag `RIGIDO_PRIVADO` (ligada; `0` desliga). Efeito conhecido: oferta com URL direta `produto.mercadolivre.com.br` não pode ser lida (a página do item cai em verificação de conta/captcha neste IP) e fica fora do privado até o gerador de links produzir o `meli.la`.
- **Ciclo de auditoria** do cron agora audita primeiro as ofertas do privado, depois as ofertas que saíram ou foram propostas em mensagem de grupo/canal nas últimas 24 h, depois combos, impressoras e o resto.
- Canal e grupos: regra atual mantida (confirmação + veredito ruim bloqueia); a regra rígida só chega lá quando a cobertura das ofertas de mensagem estiver completa.

## Entrega 2 a 4 (frente "integridade de preço") - 2026-11-15
- **Módulo único** `src/lib/pricing/integridade-preco.ts` (puro) e `src/server/pricing/integridade-preco.ts` (servidor): as 6 invariantes, aplicadas na ESCRITA (`recordPriceSnapshot` com `itemId`, `decidirTrocaDeAnuncio`), no LINK (`alinharLinkAoAnuncio`, auditoria da página) e na MENSAGEM (`avaliarConfirmacao`, `live-recheck`).
  - I1 anúncio concreto: preenchido pela API oficial do catálogo (`preencherAnuncios`, 1 catálogo por minuto no cron `group-messages` e `scripts/preencher-anuncios-119.ts` em lote; backup NDJSON; `--rollback`). Na regra rígida (privado) oferta sem anúncio concreto não sai.
  - I2 troca de anúncio zera `previous_price` e realinha o link (feito na entrega do #119).
  - I3 link no mesmo anúncio: leitura da página (`offer_link_audit`) e `link_item_id`.
  - I4 sumiço: anúncio preso sem leitura há mais de 3 h cede ao irmão; sem irmão, `expireStaleOffers` (12 h) expira. **Não alterei** a regra de expiração por falta em master com vários catálogos.
  - I5 pausado: veredito `pausado` expira (script de correção) e bloqueia mensagem.
  - I6 variação: só `textoPrecoComVariacao` e `violacoes` no módulo; **a API de catálogo e a página lida não trazem a variação (127V/220V)**, então nada é exibido com variação ainda. Pendente.
- **Auditoria de URL direta** `produto.mercadolivre.com.br/MLB-...`: **não é possível sem navegador**: do servidor/IP desta máquina a página cai em `gz/account-verification` (verificação de conta). A saída é o gerador de links produzir o `meli.la` (fila `ml-links`). Essas ofertas ficam fora do privado.
- **Amazon e Shopee**: veredito de IDADE da leitura (a página/API já é a fonte do preço), gravado na mesma tabela (`ok` dentro da janela, senão `erro_leitura`). Não há comparação página x oferta nova.
- **Prevenção**: ciclo recorrente no cron (privado, ofertas de mensagem, combos 30 min, impressoras 6 h, resto 24 h); alarme no Telegram do dono acima de 0,5% de divergentes em 24 h; painel em `/admin/mensagens` (divergentes, sem leitura, cobertura, idade do último veredito, mensagens sem veredito); testes `scripts/test-integridade-preco-119.ts`, `scripts/test-auditoria-links-119.ts` (HTML real em `scripts/fixtures/`). Fixture de página de item: indisponível (captcha).

## Rodada 1 do revisor (tratamento) - 2026-11-15
| Achado | Tratamento |
|---|---|
| 8 captcha / fatias paralelas | **Ritmo global** (`src/server/links/ritmo-e-api.ts`): 1 leitura de página a cada 2 s somando cron e scripts (linha única em `collector_runs` `auditoria-ritmo`, lock consultivo); captcha/429 abre recuo de 15 min para todos e grava `auditoria-links-bloqueio`. As fatias paralelas que eu havia disparado foram **encerradas**. |
| 3 ok obsoleto | `avaliarAuditoria`: no estrito, veredito ok anterior a `last_price_change_at` ou `item_trocado_at` = `veredito_obsoleto`; os escopos privado e canal reauditam nesse caso. |
| 4 live-recheck | Deixou de passar `confirmedAt: now`; usa só a parte de auditoria (`avaliarAuditoria`) com os fatos reais. A frescura do preço continua sendo tratada pela reconferência ao vivo da própria fase. |
| 1 fail-open | Flag `CONFIRMACAO_ESTRITA_CANAL` (padrão **desligada**) estende o modo estrito a grupos/canal; a auditoria agora ordena por **frequência de mensagem** nas últimas 24 h. |
| 2 link direto | Auditado pela **API oficial do catálogo** (anúncio na lista + preço na tolerância = `ok`, fonte registrada). Fora da lista = `erro_leitura` (não `pausado`, o anúncio pode estar em outro catálogo). `/p/MLB` (catálogo) segue sem leitura. |
| 5 Amazon no estrito | Estrito exige veredito de página só do ML; Amazon e Shopee valem pela janela de confirmação (Amazon 130 min). |
| 6 tolerância | Maior entre R$ 1,00 e 0,1% (era 0,5%): R$ 30 em R$ 7,7 mil agora é divergência. |
| 7 testes | `scripts/test-auditoria-links-119.ts`: ok obsoleto, estrito Amazon, caminho de envio de grupos (fail-open padrão, estrito por flag, bloqueante, obsoleto, sem anúncio). |
| Backups | Nenhum foi apagado; o commit acidental foi desfeito em 8c0b519 (arquivos alheios só saíram do índice). Arquivos de trabalho temporários não são adicionados. |

## Rodada 2 do revisor (tratamento) - 2026-11-15
| Achado | Tratamento |
|---|---|
| 13 meta do ritmo | `src/lib/links/ritmo.ts`: `sanearMeta` (string jsonb vira JSON; array/objeto gigante/texto grande = estado zerado; só 6 chaves numéricas) e `metaParaGravar` (nunca espalha o meta lido); leitura com `pg_column_size` limitando o meta; teste `scripts/test-ritmo-119.ts` com string, array, objeto gigante e objeto de caracteres. Cron `auditoria-links` gravando de novo; `auditoria-ritmo` com 71 bytes. |
| 18 ritmo | Intervalo global 4 s, teto 120 leituras por 10 min, recuo crescente 15/30/60 min (reinicia após 6 h sem bloqueio). |
| 14 regra versionada | Migration 0057 (`regra_versao`): vereditos sob a regra antiga (0,5%) valem como `ok_regra_antiga` (não contam como ok) e são reauditados; vereditos gravados depois da tolerância nova foram marcados com versão 2. |
| 15 (93607216) | **Causa**: o coletor gravava o anúncio irmão mais barato do vendedor (R$ 8.749) enquanto o link é do anúncio MLB5245600573 (R$ 9.978,38 na API hoje). Agora `recordPriceSnapshot` IGNORA anúncio irmão quando o do link foi confirmado há menos de 3 h (preço = o do anúncio do link); o coletor não confirma nem realinha o link nesse caso; com o do link sem leitura há mais de 3 h o irmão assume. O gravador de correção da auditoria define o `link_item_id` antes do preço. |
| 16 canal | `CONFIRMACAO_ESTRITA_CANAL_ESCOPO=bambu` (modo estrito só para impressoras Bambu Lab; resto fail-open com veredito ruim bloqueando); escopo `bambu` na auditoria, priorizado depois do privado. **A flag não foi ligada em produção** (decisão de ligar fica com o coordenador/dono). |
| 17 envio | Antes de entregar a lista congelada o porteiro revê preço, troca de anúncio, falta e quarentena das ofertas da lista; se algo mudou, a lista é regenerada (só enquanto a entrega da lista não terminou). |
| 19 filler | Guarda contra id de catálogo em `recordPriceSnapshot`; sem anúncio do link e vendedor com vários anúncios novos no catálogo, o filler NÃO adivinha: grava veredito `pendente_de_anuncio` (bloqueante). |
| 20 Amazon | `last_price_confirmed_at` da Amazon é carimbado em cada leitura da página (`amazon-assisted.ts`), enquanto o snapshot só nasce quando o preço muda: o snapshot não mede idade de leitura, então **a idade de confirmação é o critério** (sem unificação por snapshot). A contenção #120 (Amazon fora das mensagens) é de outra frente. |
| 21 Shopee | `renovarShopee`: renova pela API (`lookupShopeeItem`) as ofertas Shopee Bambu/combos sem confirmação há mais de 60 min, 6 por minuto no cron; indisponível soma falta. `last_checked_at` não conta como confirmação. |
| 22 links `/p/MLB` | O filler define o anúncio e `alinharLinkAoAnuncio` passa a URL direta do anúncio; ela entra na fila do gerador de links e a auditoria a lê pela API. Depende do filler cobrir o catálogo dessas ofertas. |

## Rodada 3 do revisor (tratamento) - 2026-11-15
- **23 captcha por volume (estrutural)**: o alvo de um `meli.la` é estável. A PÁGINA é lida **uma vez por link** (grava `link_item_id` e `link_verificado_em`, migration 0058); depois o PREÇO do anúncio do link vem da API do catálogo (sem captcha). Página só em: link novo/regerado (`link_verificado_em` é zerado pelo gerador de links), troca de anúncio (idem, `alinharLinkAoAnuncio`), amostra de 1 em 20 (`AMOSTRA_PAGINA = 0,05`), e quando o anúncio do link não aparece na lista da API (pode estar pausado). Veredito por API vale para o PREÇO; o da página vale para o LINK. Teto de leituras de página: **8 por 10 min** (global), recuo 15/30/60 min. `scripts/backfill-link-verificado-119.ts` marca como verificadas as ofertas cujo link já foi lido pela página (backup NDJSON e `--rollback`).
- **24 Shopee**: falta só conta em ciclos distintos separados por >= 30 min (`collector_runs` job `shopee-falta`); erro de rede/429 não conta; expira com 3 faltas; leitura boa zera.
- **25 irmão assumindo**: antes de assumir (anúncio do link sem leitura há mais de 3 h) lê o catálogo pela API; se o anúncio do link está na lista, o irmão NÃO assume; só assume com o do link fora da lista (lista completa) ou indeterminado.
- **26 reauditoria**: privado e Bambu até 30 por ciclo (a verificação por API não consome o teto de páginas), canal ordenado por frequência de mensagem.
- **27 canal**: consulta do escopo `canal` roda a cada 5 min (era todo minuto); índice `group_messages (offer_id, created_at)` na 0058. Medida antes: ~0,5 a 0,8 s.
- **Filler**: 3 catálogos por minuto no cron (era 1).
- **29 Procedimento para ligar `CONFIRMACAO_ESTRITA_CANAL_ESCOPO=bambu` em produção**: (1) medir a cobertura das ofertas Bambu ML com veredito ok recente (<= 6 h, regra 2) pelo medidor ou por `metricasIntegridade`; (2) só com cobertura >= 90%: `vercel env add CONFIRMACAO_ESTRITA_CANAL_ESCOPO production` com o valor `bambu` e `vercel redeploy <url> --target production`; (3) avisar o dono de que o canal fica mais rígido para as Bambu (oferta sem veredito ok sai da fila até ser auditada); (4) reverter removendo a variável. **Não foi ligada.**

## Tempo do cron `group-messages` (regressão de 2026-11-15, 23:30Z) - medição por fase
Medido em `collector_runs` job `group-messages-fases` (nova linha por invocação) e no meta de `group-messages`.

| Fase | Antes (23:31 a 23:34Z, tudo na mesma invocação) | Depois da separação (23:38 a 23:40Z) |
|---|---|---|
| ciclo de envio (pick + facts + detect + persistência) | 28 a 54 s (pick 0,4 a 6,3; facts 2,4 a 11; detect 5,7 a 24) | 21 a 24 s (pick 0,4 a 1,6; facts 2,4; detect 5,7 a 7,1) |
| frete e prazo (#118) | até 15 s | ~13 s (agora no máximo 8 s e só se restar >= 7 s até o teto) |
| agente de cupons | 0,01 a 7 s | 0,01 a 7 s |
| painel/lista do privado | 0,09 s | 0,09 s |
| auditoria de links | pulada (sem tempo) | 6,4 a 7,8 s (invocação própria) |
| preenchimento de anúncio (2 catálogos) | pulado | 1,6 s |
| renovação da Shopee | pulada | 0,03 s |

Conclusão: o que mais consumia tempo era o próprio ciclo de envio (carga do banco e fila de 11 mil mensagens) somado ao frete/prazo; as fases novas da integridade eram pequenas, mas só rodavam depois delas e morriam de fome. Mudanças: (1) integridade em invocação própria `?fase=integridade` (mesma rota, entrada própria em `vercel.json`, trava `group-messages:integridade`, orçamento ~42 s); (2) teto total de 40 s na invocação de envio, ordem fixa e mínimo por fase; (3) frete/prazo limitado a 8 s.

## Rodada 4 do revisor (tratamento) - 2026-11-15
| Achado | Tratamento |
|---|---|
| 30 (2d875e9b) | **Causa**: a API de catálogo do ML atrasa horas em relação à página (9.230 na API até 23:00; página 9.399 às 22:21; hoje a API também diz 9.399). Regra: depois de uma correção pela página, o valor ANTIGO que ela substituiu não pode ser regravado pelo coletor por 2 h (`deveIgnorarPrecoRejeitado`; a nota do veredito `corrigido de ...; antes N` guarda o valor). Outro valor (inclusive queda real) passa. |
| 31 (93607216) | **Causa**: é um PLACEHOLDER de catálogo (sem vendedor): guarda o MENOR preço do catálogo (R$ 8.749) e o link é de UM anúncio de outro vendedor (TECPRINTRP10, R$ 9.978); preço e link divergem por desenho e `external_item_id` nunca é gravado (o anúncio já pertence à oferta do vendedor). Placeholder ML saiu da lista/cards do privado. O medidor do revisor precisa tratá-lo como não elegível ao estrito. Filler: ofertas do privado e Bambu têm prioridade 0 e catálogo tentado de novo após 30 min. |
| 32 | Não regrava linha idêntica (só renova `checked_at`); reaudita não-ok a cada 10 min. |
| 33 | Rótulos separados: `recuo_global (captcha/429 recente)` x `teto_de_leituras_da_janela (8 por 10 min)`. |
| 34 | `anuncioDoLinkVivo` pagina até 20 páginas; limite de 60 chamadas/min por instância; indeterminado NÃO deixa o irmão assumir (só `false` comprovado). |
| 35 | `not_returned` só vira falta se a API respondeu ok para outra oferta no mesmo ciclo; mantém 3 ciclos separados por 30 min. |
| 36 | **Causa-raiz do envio lento**: o pré-filtro da fila (`NOT EXISTS` por master entre as já enviadas) rodava 908 vezes varrendo ~7 mil linhas: **19,1 s** (10,8 s na segunda medição). Índice parcial `group_messages_enviadas_master_idx` (migration 0059, criado em 1,4 s): **23 ms** no EXPLAIN ANALYZE. Fases opcionais: com `ciclo_envio` > 20 s o frete/prazo é pulado e o agente de cupons fica em 5 s. `q_all` (product-price-stats) e as consultas `live_networks` NÃO foram tocadas (módulos de outra frente). |
| 37 | `vercel.json` tem 25 crons; a entrada `?fase=integridade` a cada minuto exige plano Pro (limite 40 crons); no Hobby seria recusada. |
| 38 | Não é minha: a contenção da Amazon só pode sair com snapshot <= 130 min comprovado nas 5 ofertas do estrito (leitor novo do agente #120). |
