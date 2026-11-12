# Fase de formação das lojas que não são games

Decisão do dono em 2026-11-11 (ata: `docs/conselho/atas/2026-11-11-fase-de-formacao-outras-lojas.md`). Vale para impressão 3D, tecnologia, livros, casa (eletrodomésticos), eletroeletrônicos e esporte. Games e consoles (vertical `games`) não mudam.

## Onde mudar a data
Uma linha: `DATA_DE_CORTE_FORMACAO` em `src/lib/messaging/fase-formacao.ts` (hoje `2026-11-30`, dia em Brasília). A função `emFaseDeFormacao(vertical, now)` só olha o relógio: na virada (00:00 de Brasília) a estrutura dos games entra sozinha, sem deploy.

## Antes da data de corte
| Item | Formação | Depois (= games) |
|---|---|---|
| Média | simples: preço atual de cada oferta ativa, uma por oferta (Mercado Livre e Shopee; sem Amazon) | média oferta-dia do selo, elegível |
| Amostra mínima da média | 3 ofertas (dentro da faixa 0,35x a 3x a mediana, para um anúncio absurdo não decidir) | 3 ofertas, 5 oferta-dias, 14 dias |
| Lojas distintas | 2 | 3 |
| Régua de queda | só "abaixo da média" (piso 0,1%) | 10% |
| Fora da média | Open Box/usado/região/edição diferente no título, quarentena, preço fora da faixa, identidade `incerta` | idem, com a trava de identidade validada |

Mantido nas duas fases: dado real (nada sintético), 1 h entre reenvios do mesmo produto, só produto novo e em linha, frescor e reconfirmação do preço, faixas de risco (retido/aprovação).

## Texto ao cliente
Com menos de 5 ofertas na média (`MIN_AVG_OFFERS_CLAIM`) o texto nunca diz "X% abaixo da média" nem "abaixo da média": mostra "Média simples: R$ Y (N ofertas ativas; amostra pequena)". Nunca aparece a palavra "afiliado".

## Identidade incerta
`OfferFact.identidade = 'incerta'` (a ser preenchido pela fila de classificação, que outro agente cria) tira o item da média simples e da escolha da oferta durante a formação. Enquanto o campo não for preenchido pelo carregador, nada muda (ausente = certa).

## Aceleração da coleta
Ver a ata (números antes/depois). Freios de quota mantidos: teto horário de 3000 chamadas do job Shopee (somado de `collector_runs`), pacer de 480 ms, parada em 10030/auth/access, cap de chamadas do ML por execução.

## Cadência das lojas Plus (2026-11-12): mesmo ritmo dos games
Pedido do dono: reconfirmar o preço das lojas Plus no ritmo dos games (intervalo de 15 min). O código está pronto; o que vale em produção depende do deploy e das variáveis abaixo. Games não mudam.

**Causas medidas (SELECT em 2026-11-12):** o caminho Plus (`collect-vertical`) tinha intervalo de 60 min em livros, esporte e 3D (nunca chegaria a "30 min"), cron de 20 em 20 min, e um catálogo cuja página 2+ devolvia HTTP 400/404 derrubava o catálogo inteiro (os preços reais da página 1 eram jogados fora, o catálogo nunca era carimbado e ficava no topo da fila gastando 2 chamadas por tentativa). `collect-prices` só enfileira `vertical = games` (isolamento do ADR 0008): as verticais Plus nunca entram nele.

| Item | Antes | Depois |
|---|---|---|
| Intervalo de recoleta por oferta | livros, esporte, 3D: 60 min; casa, tecnologia, eletro: 30 min | onda 1 (livros, esporte, casa): 15 min; onda 2 (3D, tecnologia, eletro): 30 min. Uma linha por loja em `PLUS_REFRESH_CEILING_MIN` (`src/lib/catalog/vertical/config.ts`); trocar para 15 liga a onda 2 |
| Cron de cada loja Plus | 3x/hora (20 em 20 min) | a cada 5 min, minutos escalonados (`vercel.json`) |
| Fila | mais velha primeiro, sem testar o agrupamento | mais velha primeiro por catálogo (grupo herda a oferta mais velha; nunca checada vem antes de todas), função pura `groupDueOldestFirst` testada |
| Página 2+ com HTTP 400/404 | catálogo falha, nada gravado, 2 chamadas por tentativa, fica devido para sempre | para na página que falha (sem repetir), grava a página 1, não expira ninguém, carimba, conta como parcial |
| HTTP 429 | tratado como falha comum (a execução seguia chamando) | para a execução na hora (`stoppedBecause = http_429`), sem carimbo, registrado como `http_429` em `collector_runs` |
| Cauda | oferta que o ML não devolve ficava ativa com preço velho | oferta ATIVA já checada, sem preço reconfirmado há 12 h (`VERTICAL_STALE_EXPIRE_HOURS`), vira `expired` (máx. 200 por execução; só com `COLLECTOR_RUNS=1`, sem 429, com preço gravado e no máximo metade dos catálogos falhos). Oferta nem checada não expira |
| Cota | só o teto de 240 chamadas por execução | também freio somado das 6 lojas em `collector_runs`: `PLUS_ML_HOURLY_CALL_CAP` (padrão 8000/h, uma execução usa no máximo metade da folga) e `PLUS_ML_DAILY_CALL_CAP` (padrão 150000/dia). Os dois padrões são ASSUMIDOS: a cota oficial do ML não está documentada no repositório |

**Números (cálculo, não medição; 1.527 catálogos Plus ativos e 8.743 ofertas; fator de páginas 1,1 assumido):**

| | Antes | Depois onda 1 | Depois ondas 1+2 em 15 min |
|---|---|---|---|
| Chamadas/h (Plus) | ~2.000 | ~5.300 | ~6.700 |
| Chamadas/dia (Plus) | ~48 mil | ~127 mil | ~161 mil (passa do padrão de 150 mil: subir o freio diário só com a cota do ML confirmada) |
| Idade máxima esperada de uma oferta | 60 a 80 min (livros, esporte, 3D) | 20 min (onda 1), 35 min (onda 2) | 20 min |
| Cobertura esperada em 30 min | livros/esporte/3D ~50%, demais ~75% | onda 1 ~100%, onda 2 ~85% | ~100% |

Por execução cada loja precisa de ~100 chamadas (esporte 120, casa 95, livros 81) contra o teto de 240: cabe. O tempo real por execução (gravação por oferta) não foi medido; o orçamento de 240 s continua parando a rodada.

**Como observar:** `collector_runs` (job `collect-vertical:<loja>`): `stopped_because`, `meta.apiCalls`, `meta.expiredStale`, `meta.partialCatalogs`, `meta.quotaLimitedBy`. Se aparecer 429, voltar `vercel.json` para 3x/hora e/ou `VERTICAL_<LOJA>_REFRESH_MIN=30` (variável de ambiente, sem deploy de código).

**Testes:** `scripts/test-plus-reconfirmacao.ts` (`npm run test:plus-reconfirmacao`), `test-vertical-identity` (atualizado: livros agora 15 min).

## Testes
`scripts/test-regua-adaptativa.ts` (virada antes/depois com `now`), `test-mensagens-grupo`, `test-mensagens-motor-v2`, `test-mensagens-onda2`, `test-ampliar-amostra-params`.
