# Capas dos cards e quadro branco (fila #65, 2026-11-15)

## 1. Por que vieram sem capa (medido)
- A oferta tem foto no banco, mas em 101 ofertas ATIVAS do Mercado Livre (de 24.577) o endereço da foto é da Shopee (cf.shopee.com.br / susercontent). O card tem uma regra (incidente 2026-11-11) que só aceita foto da CDN da mesma loja da oferta; essas fotos eram recusadas e o card ia para o modo "sem capa" sem tentar nenhuma outra foto. Era o caso dos dois prints: a oferta de ML de Zelda Echoes of Wisdom e a de Zelda Ocarina of Time (Switch 2) carregavam imagem da Shopee.
- Nas últimas 48 h: 2.852 cards enviados; 19 (0,7%) saíram assim (17 com foto de outra loja + 2 ofertas sem endereço de foto), todos do Mercado Livre. Shopee e Amazon: 0.
- Teste real de rede (GET em 1.722 ofertas distintas das mensagens de 48 h, da máquina local): 0 falhas de HTTP, timeout ou formato; 23 respostas passaram de 3 s (mediana 272 ms). Falha de rede/timeout na produção não aparece nos logs (a falha era silenciosa); agora é registrada como `[card-cover] SEM CAPA ...` com a causa.
- Não era falta de foto no banco: só 10 masters aprovados com oferta ativa não tinham foto utilizável (não os 11 da estimativa inicial).

## 2. O que foi corrigido (commit 111e98d, no ar)
- `card-cover.ts` (novo): candidatas em ordem (oferta do card, demais ofertas ativas do master com oficial/ML primeiro, `default_images`), variantes do mesmo endereço (ML -F/-O/-V e webp para jpg; Amazon versão grande e original; Shopee sem _tn), retentativa em timeout, rede e HTTP 5xx/429 (7 s por tentativa, prazo total 22 s), conversão de webp/avif/gif para jpeg, aceita content-type genérico, prefere lado >= 240 px, cache em memória por endereço. Só foto real; nada gerado.
- Vale para o card v2, o legado e (sem capa) o card de cupom encerrado.
- Quadro interno SEMPRE branco (#FFFFFF): com capa (inclusive foto de fundo escuro, que antes tingia o quadro), sem capa (título escuro, filete dourado) e a caixa do rótulo do cupom encerrado.
- Testes: `scripts/test-card-v2.ts` 62/62 (branco nos cantos medido por pixel, 10 casos de falha de capa com servidor local); `test-card-oferta` 39/39; tsc limpo. Deploy: 1ª tentativa falhou por busca transitória da fonte Geist no build (nada do código); redeploy Ready.

## 3. Capas que faltavam (10 masters) e o que foi feito
Origem: foto real de outra oferta (expirada) do mesmo produto, validada por GET. Gravado em `master_products.default_images` (acrescentada no início). Backup `docs/backups/capas-masters-2026-11-15T08-06-07-133Z.ndjson`, log `capas-masters-log-...json`, reversão `scripts/aplicar-capas-masters.ts --rollback <log> --apply`.

| Master | Produto | Resultado |
|---|---|---|
| 440d2bdd | Cyberpunk 2077 | capa gravada (oferta expirada) |
| 7ca37f56 | Cyberpunk 2077 Projekt Red | capa gravada |
| 719940b6 | Dead Cells: Return to Castlevania (Switch) | capa gravada |
| 91616a3d | God of War: Saga | capa gravada |
| 56190408 | God of War Ragnarök Collector's | capa gravada |
| e7705825 | Castlevania Belmonts Curse Midnight (Switch) | capa gravada |
| 5f9bbf64 | Dark Pictures House of Ashes (Xbox Series) | capa gravada |
| 0fb55bf4 | Resident Evil: Revelations | capa gravada |
| b1079965 | Zelda Breath of the Wild Edição Especial | capa gravada (foto de 01/2023; confira se é a edição) |
| d36627dc | God of War: Ascension | capa gravada |

Varredura de rede dos 1.966 masters (mensagens de 72 h + 300 com mais ofertas ativas; "mais vistos" não existe como coluna, usei ofertas ativas): nenhum outro sem capa utilizável.

## 4. Amostras (docs/amostras-cards/)
`v2b-print-ocarina-switch2-*.png`, `v2b-print-echoes-of-wisdom-2-*.png` (oferta da Shopee do mesmo master; a de ML sem oferta elegível agora), `v2b-antes-sem-capa-1..6-*.png` (ofertas ML com foto de outra loja, agora com capa e fundo branco), `v2b-fallback-sem-capa-fundo-branco.png`.

## 5. Depende do dono
- A causa raiz dos 101 anúncios do ML com foto da Shopee (origem do cadastro) não foi corrigida; o card agora contorna.
- Conferir a capa de Zelda BOTW Edição Especial.
- Nenhuma mensagem foi reenviada ao canal.
