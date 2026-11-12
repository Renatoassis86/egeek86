# Ata do Conselho Geek: gerador de aprovação (`/admin/aprovacao`)

- **Data:** 2026-11-12
- **Porte:** médio
- **Presidente:** geek-lead
- **Convocados:** especialista-precos, guardiao-catalogo, gamer-veterano, qa-verificador, seguranca-db (pareceres independentes em paralelo)

## Briefing
Pedido do dono: dizer o motivo de cada produto que não vai à aba Black Friday nem às mensagens e ter uma página, aberta por link no celular ou no computador, onde ele aprova um a um para liberar. Regras em jogo: zero dado fake, um jogo uma média, só novo e em linha, Open Box e reputação baixa fora, frescor de 40 min da Amazon (decisão do dono, não alterar), nada de mexer em crons, `vercel.json` ou loops.

## Fato medido que muda o diagnóstico
- Pendência na fila de classificação em oferta **ativa** não esconde nada: os porteiros públicos (`catalogGateVisibleSql`, `offerIdentityVisibleSql`, `status = 'active'`) não leem a fila. Dispersão de preço (719 itens) só pede confirmação.
- O que está **retido de verdade** são os rascunhos da Amazon: 962 (528 de masters em revisão do porteiro do catálogo, 264 sem item de fila e sem gate, 168 com item). Para liberar um master em revisão é preciso aprovar também o master (gate `manual`), senão a oferta ativa continua invisível.
- Fila total medida na página: 1.808 itens aptos (Amazon 1.032, Mercado Livre 721, Shopee 55) mais 34 de ofertas já encerradas; por motivo: dispersão 719, produto novo 528, rascunho 264, cobertura 119, Plus 66, fronteira 49, mídia 41, modelo 19, armazenamento 3.
- Dos 962 rascunhos, 941 passam nas guardas de título (novo, sem duas gerações), 19 citam duas gerações no título e 2 têm master rejeitado.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| especialista-precos | Favorável | Queda só com referência válida; queda acima de 50% é anomalia e vem com aviso; lote só por prova, nunca por preço | quantos dos rascunhos têm >= 5 ofertas |
| guardiao-catalogo | Favorável | Item criado na hora, mesma transação, pela função existente; sem UPDATE direto de status; mostrar master, ASIN e checagens; sem botão de aprovar com plataforma `unknown` | quantos dos sem item são "óbvios" |
| gamer-veterano | Favorável | Cartão com título cru ao lado da imagem; Aprovar desligado quando mídia/modelo estão indefinidos; explicação em 3 partes sem jargão | exemplos de título ruim por categoria |
| qa-verificador | Favorável, condicionado | Sem caminho fora do `applyInTx`; lote com uma transação curta por item; teste em transação revertida; checar idempotência e permissão | efeito sobre menor preço |
| seguranca-db | Favorável, condicionado | `requireAdmin` na página e em cada action; backup em disco não funciona na Vercel (usar o banco como fonte e script local para NDJSON); lote com teto e recalculado no servidor; imagens com `referrerPolicy` | auditoria separada (migration) |

## Divergências e réplica
Sem divergência de fundo. Ponto de desenho resolvido: o backup NDJSON pedido pelo dono não pode ser gravado pela Vercel; decisão: o estado anterior fica em `identity_decisions` (e o gate anterior do master em `attributes.aprovacaoHumana`) e `scripts/aprovacao-backup.ts` exporta NDJSON com o comando de reversão. Sem migration nova.

## Decisão
1. Camada fina sobre `applyInTx`/`undoInTx` (reaproveitada, não reescrita), mais: item criado pelo molde `enfileirarDuvidaAmazon` para rascunho sem item; aprovação do master em revisão junto; guardas antes de liberar (novo, sem duas gerações, preço lido, sem quarentena, duplicata por `findExistingMasterProduct`, falha da checagem bloqueia).
2. Lote só dos casos que `judgeObvio` já classifica como óbvios, com prévia obrigatória, dois cliques, até 100 por rodada, recalculado no servidor e uma transação por item. O lote não solta rascunhos (cobertura Amazon nunca é óbvia por definição do código).
3. Ordem: maior queda real (>= 5 ofertas, até 50%) primeiro, depois Amazon, depois rascunho. Sem referência suficiente, a tela diz isso.
4. Pular em rascunho sem item não grava nada; em item de fila grava `nao_sei` (volta em 7 dias, comportamento existente).
5. Fora: mudar o frescor de 40 min, crons, `vercel.json`, aprovar qualquer item em nome do dono.
- Decisão do responsável do projeto: ferramenta aprovada no pedido; a liberação dos itens é do dono, clique a clique ou pelo lote com prévia.
- Registro: o coordenador relatou, durante a obra, uma autorização do dono para liberar tudo em bloco. Uma mensagem entre agentes não substitui o consentimento do dono e o pedido original proibia aprovar em nome dele; por isso nenhuma liberação em produção foi executada. O plano em simulação está acima (941 aptos pelas guardas de título, 19 e 2 barrados); a execução em bloco fica para o dono confirmar no chat dele ou clicar na ferramenta.

## Métrica de sucesso
'Liberadas hoje por você' sobe, `affiliate_offers` em `draft` da Amazon cai, e as liberadas aparecem em `/black-friday` e nas mensagens (conferir em `group_messages` no ciclo seguinte; Amazon só com preço confirmado há menos de 40 min).

## Execução e verificação
- Executores: engenheiro-backend e engenheiro-frontend (geek-lead).
- QA: `tsc` limpo; `scripts/test-aprovacao.ts` verde (aprovar rascunho sem item, com item e de master em revisão ativa a oferta e ela passa nos porteiros públicos; duplo clique idempotente; desfazer restaura status, `published_at` e gate; nada gravado); `scripts/test-fila-classificacao.ts` 75/75; `next build` sem erro; `GET /admin/aprovacao` sem sessão = 307 para `/login`.
- Bug corrigido de passagem (existente): `undoInTx` gravava NULL em `recalc_masters`, o que fazia o `drainRecalc` falhar com 'invalid input syntax for type uuid: "NULL"' e travar o recálculo das decisões seguintes.

## Retrospectiva
Pendente: conferir 'liberadas hoje' e o efeito nas mensagens depois que o dono usar.
