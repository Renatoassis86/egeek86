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
