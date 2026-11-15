# Inventario de itens do concorrente (Bambu Lab) - tarefa #59

Dono, 2026-11-15: as impressoras 3D Bambu Lab A1 (o dono escreveu "01"; cobertas A1 e A1 Mini), P1S e P2S (PRIORIDADE) devem estar no fluxo com todos os valores possiveis nas 3 redes (Mercado Livre, Shopee, Amazon), com os destaques de monitoramento no site (/mercado/impressao3d) e nas mensagens (prioridade 3D, GROUP_PRIORIDADE_3D).

Medicao por SELECT em 2026-11-15 ~06:30 UTC (ofertas `active`, fora da quarentena). Antes = medicao inicial; Depois = apos a semeadura aplicada e a correcao de ofertas. Shopee e Amazon dependem de rotinas que rodam so na Vercel ou de aba logada; coluna "Depois" da Shopee e a projecao depois do deploy (ver abaixo).

| Modelo (master) | ML antes -> depois | Shopee antes -> depois | Amazon antes -> depois | Menor preco (rede) | Causa do que faltava | Correcao |
|---|---|---|---|---|---|---|
| A1 (`244ff7b2`) | 91 -> 91 | 0 -> 0 (cron novo) | 1 -> 1 (+1 no master "A1, Bivolt") | R$ 2.672 (ML) | Shopee: cobertura por categoria sem categoria 3D configurada e `ampliar-amostra-shopee` nunca agendado | cron Shopee por foco de nome; termos dedicados no ML |
| A1 Mini (`3a3c43c2`) | 95 -> 97 | 0 -> 0 (cron novo) | 2 -> 2 | R$ 1.799 (Amazon) | idem; faltava o termo "a1 mini" na semeadura | termos novos; 1 catalogo ML anexado (MLB74552536) |
| A1 Combo (`04804f96`) | 235 -> 235 | 0 -> 0 (cron novo) | 3 -> 2 | R$ 3.879 (Amazon) | **oferta Amazon "Creality Hi Combo" (R$ 3.149) mal casada era o menor preco** | oferta movida para o master Creality Hi Combo; menor preco real R$ 3.879 |
| A1 Mini Combo (`f9d4b060`) | 48 -> 63 (8 aguardam link) | 0 -> 0 (cron novo) | 1 -> 1 | R$ 3.118 (Amazon) | faltavam 9 catalogos do ML (MLB72657880, 38662250, 63777570, 45341943, 47782310, 62820392 e outros) | semeadura com termos "a1 mini combo" |
| P1S (`01e7bd6f`, nome "Fechada P1s") | 5 -> 5 | 0 -> 0 (cron novo) | 1 -> 1 (preco de 11/11, sem checagem fresca) | R$ 4.699 (ML) | ML so tem 1 catalogo/5 vendedores (busca "p1s" e "p1s combo" sem catalogo novo); Amazon "sem_match" na ultima varredura | consulta Amazon curta "Bambu Lab P1S" (antes "Impressora 3d Bambu Lab Fechada P1s") |
| P1S Combo (`23bfa05b`) | 25 -> 25 | 0 -> 0 (cron novo) | 0 -> 0 | R$ 5.999 (ML) | Amazon "sem_match" (14/11) | consulta Amazon "Bambu Lab P1S Combo" |
| P2S (`8b279bc1`) | 5 -> 6 (3 aguardam link oficial) | 0 -> 0 (cron novo) | 0 -> 0 | R$ 6.799 (ML) | catalogo MLB80023471 nao estava no banco; Amazon "sem_match" (14/11) | catalogo anexado; consulta Amazon "Bambu Lab P2S" |
| P2S Combo (`2e4a5bd1`) | 25 -> 29 | 0 -> 0 (cron novo) | 0 -> 0 | R$ 8.330 (ML) | catalogos MLB72902278 e MLB73671223 (21 anuncios) fora do banco | semeadura com termo "p2s combo" |

Efeitos colaterais da mesma rodada: criado o master "Bambu Lab H2s Combo Ams 2 Pro" (`f08767fe`, em revisao pelo porteiro, 1 oferta); oferta Amazon "Bambu Lab P1P" (R$ 7.456) estava no master Anycubic Photon P1 e foi para rascunho (nao ha master P1P, fora do pedido).

## Site e mensagens (medido)
- Todos os 8 masters aparecem em /mercado/impressao3d (consulta `departamentoClicaveisCtes`): A1 92 vendedores, A1 Mini 95, A1 Combo 234, A1 Mini Combo 46, P1S 5, P1S Combo 25, P2S 3 (2 ofertas aguardam o link oficial `meli.la`), P2S Combo 25. Faixa da home: `destaquesDepartamento` + `priorizarImpressao3d` ja abre com a mais barata de cada modelo Bambu/Kobra.
- Mensagens (ultimos 4 dias, tabela `group_messages`): todos os 8 modelos tem G2/AC enviados (P1S 17 G2, P1S Combo 16, P2S 3+1 AC, P2S Combo 15, A1 Combo 17+1, A1 Mini 17, A1 Mini Combo 6). Nenhum travado por quarentena.
- Destaques: `price_daily_state` de 15/11 tem menor, media por oferta/dia e variacao para todos, exceto P2S (n_quotes 0: oferta recente, ainda sem 5 cotacoes e 14 dias, sem selo, como manda a regra) e "A1, Bivolt" (master Shopee/Amazon com 1 oferta).

## O que mudou no codigo
- `src/lib/catalog/vertical/config.ts`: 11 termos novos no segmento `impressora-3d` (P2S, P2S Combo, P1S Combo, A1 Combo, A1 Mini, A1 Mini Combo etc.), no topo da lista.
- `src/lib/affiliate/amazon-identity.ts`: `consultaImpressoraBambu` gera a consulta curta `Bambu Lab <modelo> [Combo]` (Amazon e Shopee usam `buildQueryFor`); so impressora, peca/kit/filamento ficam de fora.
- Shopee: `ampliar-amostra-shopee` ganhou `&nome=` (foco por palavras do nome) e entrou no `vercel.json` (`33 * * * *`, `vertical=impressao3d&nome=bambu+impressora&limitMasters=20&maxCalls=60&apply=1`). Antes a Shopee tinha 0 ofertas em toda a vertical Impressao 3D porque a cobertura por categoria depende de ids em `SHOPEE_COBERTURA_CONFIG` (vazio para 3D) e o ampliar nunca foi agendado. Limite por master mantido (3 ofertas Shopee, identidade forte, 10030 para a rodada).
- `scripts/corrigir-bambu-59-2026-11-15.ts`: movimentacao e rascunho de ofertas mal casadas (dry-run, `--apply`, backup NDJSON, log, `--rollback`).
- Semeadura aplicada com backup `backup/dados/semear-vertical-pre-2026-11-15T06-39-43-422Z.ndjson` e log `backup/logs/semear-vertical-2026-11-15T06-39-43-422Z.json` (`semear-vertical.ts --rollback <log> --apply`).

## Pendencias que dependem do dono
- Amazon: P2S, P2S Combo e P1S Combo seguem sem oferta; as varreduras anteriores deram `sem_match`. A nova consulta curta entra na proxima passada da coleta assistida (aba logada); nao foi possivel conferir a prateleira da Amazon agora (navegador desconectado).
- "revisao_sem_identidade_forte: 40" na semeadura ML: catalogos de impressora sem marca/modelo forte ficam em revisao (barreira existente, nao alterada).
- Master P1P (Bambu Lab) nao existe; criar so com aval.

## Jogo Barato (Shopee): Switch 2 + Mario Kart World, Switch Lite e OLED (2026-11-15)

Os três itens já estavam rastreados (preço do pix = preço cheio × 0,95 × 0,92); o Switch Lite estava escondido por rejeição de master por foto com mão, corrigida por oferta (84 masters liberados/reavaliados, 99 ofertas em quarentena por mão real). Masters duplicados do Switch 2 + Mario Kart World consolidados em `4704eddc` (44 ofertas ativas). Detalhes, contagens e rollback: `docs/inventario-itens-jogobarato-shopee-2026-11-15.md`.
