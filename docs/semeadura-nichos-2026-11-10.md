# Ampliação da semeadura dos nichos (10/11/2026)

Origem: ata `docs/conselho/atas/2026-11-10-mensagens-24h-cupons-storytelling-cobertura.md`, seção 6 (cobertura dos nichos). O dono autorizou até 480 chamadas por dia ao Mercado Livre e a liberação dos nichos aprovados. Nada foi gravado no banco nesta etapa; a semeadura em `--apply` é rodada pelo dono depois de revisar.

Legenda: [D] dado medido, [H] hipótese, [R] recomendação.

## 1. Diagnóstico por segmento (leitura do banco em 10/11 + logs de `backup/dados/semear-vertical-*`)

| Segmento | Masters | Ofertas ativas | Masters com vendedor real (`seller_id`) | Passa no porteiro (`suggested=approved`) | Link pendente |
|---|---|---|---|---|---|
| livros | 24 | 152 | 24 (100%) | 24 (100%) | 24 de 152 |
| placa de vídeo | 6 | 35 | 6 (100%) | 6 | 33 |
| SSD | 5 | 39 | 5 (100%) | 5 | 5 |
| impressora | 3 | 22 | 3 | 3 | 21 |
| impressora 3D | 3 | 10 | 3 | 3 | 3 |
| soundbar | 3 | 24 | 3 | 3 | 3 |
| smart TV | 3 | 4 | 2 (67%) | 2 | 2 |
| air fryer | 5 | 11 | 4 (80%) | 5 | 4 |
| notebook, geladeira, máquina de lavar, bola, tênis, esporte | 0 | 0 | | | |

[D] Os 100% de "passa no porteiro" e "com vendedor" são viés de sobrevivência: o script só cria master que já passou no porteiro e que tem vendedor. O gargalo real está antes da criação, nos candidatos descartados. Funil dos 3 `--apply` de livros em 10/11 e 09/11 (280 candidatos, 118 chamadas, 24 masters):

| Destino do candidato | n | % |
|---|---|---|
| Criado | 24 | 9% |
| 404 sem vendedor (gastou 1 chamada cada) | 42 | 15% |
| Domínio fora do segmento (grátis, mas dilui a página) | 102 | 36% |
| ISBN importado (regra do dono) | 66 | 24% |
| Sem identidade forte (revisão) | 26 | 9% |
| Já existia no catálogo | 7 | 3% |

Chamadas: 28 buscas + 90 de `/items` e `/products/{id}`. Rendimento 0,20 master por chamada.

### Causa de cada gargalo
1. **Só a primeira página, 10 por termo** [D]: a 2ª e a 3ª rodada de livros devolveram "já existe" 6 e 1 vez; a lista de candidatos satura. Correção: paginação por offset e página de 20 a 50.
2. **Termos genéricos e poucos** [D]: 1 a 3 termos por segmento; "bola" tinha um só. Correção: 1.157 termos específicos (seção 2), em ordem de prioridade.
3. **Ruído de domínio** [D]: 36% dos resultados de livros eram de outro domínio (camiseta, caneca). Medido em 10/11: `GET /products/search` aceita `&domain_id=` e `limit` até 50; com `domain_id=MLB-BOOKS`, 50 de 50 resultados no domínio (sem o filtro, 7 de 10). Correção: `searchDomain` por segmento, só onde o domínio foi visto ao vivo.
4. **404 "No winners found" (catálogo sem vendedor)** [D]: livros 15%; SSD 3 de 6 testados; teclado, mouse, headset e cadeira 11 de 20 (55%, amostra pequena); bola 10 de 10 em 10/11. [D] Hipótese pai/filho da ata **refutada**: os resultados da busca são folhas (`children_ids` vazio em 50 de 50 no SSD); o 404 é catálogo folha sem anúncio ativo. Correção possível só na origem: cache negativo de 3 dias (não repete a mesma chamada em outra página, termo ou rodada). Não reduz a taxa, evita o desperdício repetido.
5. **Filtros do porteiro/identidade** [D]: 24% ISBN importado (regra do dono, mantida), 9% sem identidade. Tênis segue em zero por regra (GTIN 0/10).
6. **Chamada de detalhe** [D, novo]: `GET /products/{id}` custa 1 chamada por master e **não traz atributo a mais** que a busca (28 contra 29 no SSD; perde o GTIN). Efeito colateral: a chave de identidade muda de `gtin:` (busca) para `bm:` (detalhe), e a coluna `gtin` do master fica nula. [R] Decisão do guardião/dono antes de mexer: pular o detalhe economizaria ~35% das chamadas por master, mas exige unificar a chave. **Não alterei.**
7. **Sobreposição com o catálogo gamer** [D]: 6 de 20 candidatos de periféricos (teclado, mouse, headset, cadeira) já existiam como master (acessórios do catálogo de games). Dedup por catálogo ML os barra, o que é correto, mas **a vertical tecnologia cresce menos que a contagem de candidatos sugere** [H].

## 2. O que mudou no código

| Arquivo | Mudança |
|---|---|
| `scripts/semear-vertical.ts` | `--pages N` (padrão 2), `--limit` (padrão 20, máx. 50), `--terms-from K`, `--sem-dominio`, `--daily-cap`, `--estado`; orçamento diário; cache de 404; interrupção por Ctrl+C; relatório final (`relatorio.json` + log). |
| `scripts/_semear-estado.ts` (novo) | Estado local `backup/dados/semear-estado.json` (não é banco): chamadas por dia (dia civil de São Paulo), execuções, cache de 404. Preenche o histórico das rodadas antigas (`plano.json`). |
| `src/lib/catalog/vertical/seed-budget.ts` (novo) | Lógica pura: teto 480/dia, cobrança, backfill, TTL do 404. |
| `src/lib/catalog/vertical/seed-utils.ts` (novo) | Puro: `combineTerms`, `dedupeTerms`, `searchPath`, `pagingDecision`, `summarizeReports`, `estimateMasters`. |
| `src/lib/catalog/vertical/seed-plan.ts` | Paginação em largura (página 1 de todos os termos, depois a 2…), parada do termo quando a página não rende, cache de 404, `shouldStop`, motivo `teto_diario`, `callsSpent` por segmento. Dedup, porteiro e identidade intactos. |
| `src/lib/catalog/vertical/ml-api.ts` | `beforeCall` (cobra o orçamento diário antes de cada chamada) e `DailyBudgetExceeded`. |
| `src/lib/catalog/vertical/config.ts` | `searchDomain`; termos de 14 segmentos ampliados; 13 segmentos novos. |
| `src/lib/catalog/vertical/scope.ts` | Léxico (aparelho x acessório) dos segmentos novos e recorte de nicho (`fora_do_nicho`): cadeira só se disser "gamer", teclado mecânico/gamer, mouse gamer, headset gamer, fone comum sem "gamer/headset". |
| `scripts/test-semeadura.ts` (novo) | 236 verificações (orçamento, paginação, termos, nicho, planejador com cliente ML falso). |
| `scripts/test-vertical-identity.ts` | Duas asserções que fixavam 13 segmentos atualizadas para 26. |

Segmentos novos (domínio medido): teclado `MLB-PC_KEYBOARDS`, mouse `MLB-COMPUTER_MICE`, headset gamer e fone `MLB-HEADPHONES`, monitor `MLB-COMPUTER_MONITORS`, cadeira gamer `MLB-OFFICE_CHAIRS`, memória RAM `MLB-RAM_MEMORY_MODULES`, processador `MLB-COMPUTER_PROCESSORS`, caixa de som `MLB-SPEAKERS`, robô aspirador `MLB-ROBOT_VACUUMS`, cafeteira `MLB-ELECTRIC_COFFEE_MAKERS`, esteira `MLB-TREADMILLS`, bicicleta ergométrica `MLB-STATIONARY_BICYCLES`. Livros: 77 termos (RPG, programação, ficção científica, fantasia, mangá/HQ de games, arte de jogos, guias oficiais).

Regras preservadas: dry-run por padrão; `--apply` exige `--termos-aprovados` (`TERMS_STATUS` continua `provisorio`); masters novos nascem em `catalogGate.verdict='review'`; duplicata por catálogo ML, GTIN, chave de identidade e título; nunca `unknown`; open box, usado e importado fora; cor junta, edição/região/cross-gen separam.

## 3. Orçamento diário
- Teto 480 por dia (dia civil de São Paulo), contando **busca, `/items` e `/products/{id}`, em dry-run e em apply**. Cobrança **antes** de cada chamada, gravada na hora: se o processo morrer, o gasto já está salvo (a chamada em voo conta).
- `--max-calls` por execução fica limitado ao saldo do dia. Saldo zero: a execução não começa e não faz nenhuma chamada.
- Fora do teto: o recoletor `collect-vertical` (outro orçamento, já em produção), que cresce com o número de masters.
- Estado em 10/11 ao fim deste trabalho: 145 usadas (90 das rodadas anteriores do dia + 55 desta medição), 335 restam. `npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --estado` mostra o saldo sem chamar a API.

## 4. Medição desta etapa: 55 chamadas ao ML (teto do trabalho: 60), todas de leitura
- 28 chamadas de descoberta: domínio e `limit=50`, filtro `domain_id`, pai/filho, detalhe x busca.
- 10 chamadas: dry-run de livros (1 termo, 30 por página, filtrado): 3 planejados, 3 de 404, rendimento **0,30** (n pequeno).
- 17 chamadas: dry-run de teclado, mouse, headset gamer e cadeira gamer (1 termo, 5 por página): 1 planejado, 55% de 404, 30% já existente, rendimento **0,06** (n muito pequeno, primeiros resultados de cada busca).
- A paginação com 2 ou mais páginas **não foi medida ao vivo** (sem chamadas sobrando); está coberta por teste com cliente falso. [H] a página 2 rende menos que a 1.

## 5. Estimativa de masters novos e o que muda com as páginas extras
Modelo por candidato: calls = 1 (items) + (1 − p404) (detalhe); masters = (1 − p404) × p_identidade × (1 − p_duplicata).
- Livros: p404 0,10–0,15; identidade 0,7; ~0,25–0,30 master/chamada [D parcial: 0,20 histórico, 0,30 medido filtrado].
- Hardware (tecnologia, eletro): p404 0,45–0,55; ~0,10–0,19 master/chamada [H, 0,06 medido em 17 chamadas].
- Esporte: sem medição com vendedor; 0,0–0,05 [H].
Páginas extras e filtro de domínio mudam a **oferta de candidatos novos** (de 10 para 20–100 por termo, e sem a diluição de 36%), o que impede a queda de rendimento por saturação. **Não** reduzem o 404 nem o ISBN importado; por isso o rendimento médio esperado sobe pouco (0,20 para ~0,18–0,25), mas deixa de decair.

| Cenário | master/chamada | 1.440 chamadas (3 dias) | Total (52 + novos) |
|---|---|---|---|
| Baixo | 0,10 | 144 | ~196 |
| Provável | 0,18 | ~259 | ~311 |
| Alto (livros repetido em tudo) | 0,30 | 432 | ~484 |

Meta de 20/11: 300 masters e 1.610 ofertas, **sem promessa**. Faltam 248 masters; no cenário provável os 3 dias cobrem ~100% e sobram 7 dias de cota. Parar e voltar ao conselho se o rendimento ficar abaixo de 0,10 em duas rodadas seguidas (regra da ata).

## 6. Plano de execução das próximas 72 h (comandos de dry-run primeiro; apply é decisão do dono)
Prefixo: `npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts`. Em toda rodada: primeiro sem `--apply`; conferir o relatório; repetir com `--apply --termos-aprovados`.

**Passo 0 (0 chamadas, dono):** aprovar ou cortar a lista de termos (`src/lib/catalog/vertical/config.ts`). Rodar `--estado`.

**Dia 1, 11/11 (480):**
1. Livros, 150: `--segmento livros --terms 25 --pages 2 --limit 30 --max-calls 150 --max-create 60`
2. Hardware, 130: `--segmento placa-de-video,ssd,memoria-ram,processador,monitor --terms 4 --pages 2 --limit 20 --max-calls 130 --max-create 12`
3. Periféricos, 80: `--segmento teclado,mouse,headset-gamer,cadeira-gamer --terms 4 --pages 1 --limit 20 --max-calls 80 --max-create 8`
4. Eletroeletrônicos, 60: `--segmento soundbar,smart-tv,fone-de-ouvido,caixa-de-som --terms 3 --pages 1 --limit 20 --max-calls 60 --max-create 8`
5. Eletrodomésticos, 40: `--segmento air-fryer,robo-aspirador,cafeteira --terms 3 --pages 1 --limit 20 --max-calls 40 --max-create 8`
6. Esporte (medição), 20: `--segmento esteira,bicicleta-ergometrica,bola --terms 2 --pages 1 --limit 10 --max-calls 20 --max-create 3`
Conferência (SELECT) depois de cada apply: contagem por vertical antes/depois, 0 duplicata (`findExistingMasterProduct`), `catalogGate` em `review`.

**Dia 2, 12/11 (480):** repete as 6 rodadas **continuando a lista** com `--terms-from` (livros 25, hardware 4, periféricos 4, eletro 3, eletrodomésticos 3, esporte 2). Redistribui a cota para onde o rendimento do Dia 1 foi maior que 0,15 e tira de onde foi menor que 0,05. Se esporte seguir em zero, corta e deixa só a medição de 10 chamadas.

**Dia 3, 13/11 (480):** idem, com `--pages 3` onde a página 2 do Dia 2 ainda rendeu (relatório mostra `termStops`). Rodada final de conferência: contagem por vertical contra a tabela de metas (14/11: 155 masters e 815 ofertas).

Em paralelo (não depende da cota): resolver os links de afiliado pendentes (placa de vídeo 33, impressora 21, livros 24…) e rodar `scripts/aprovar-masters-nicho.ts` em dry-run para o que for entrando.

Estimativa por dia (cenário provável): livros 150 × 0,27 ≈ 40; hardware 130 × 0,15 ≈ 20; periféricos 80 × 0,10 ≈ 8; eletro 60 × 0,15 ≈ 9; eletrodomésticos 40 × 0,15 ≈ 6; esporte 20 × 0,03 ≈ 1; total ≈ 84 por dia, ≈ 250 em 72 h.

## 7. Depende do dono
1. Aprovar (ou cortar) a lista de termos e autorizar `--apply --termos-aprovados`.
2. Decisão sobre o detalhe `GET /products/{id}`: pular economiza ~35% das chamadas mas muda a chave de identidade `bm:` para `gtin:` (guardião do catálogo).
3. Periféricos que já são acessórios do catálogo gamer: manter na vertical games (padrão do dedup) ou reclassificar para tecnologia.
4. Cadeira gamer vive em `MLB-OFFICE_CHAIRS`: aceitar o recorte "título diz gamer".
5. Aprovação humana dos masters (porteiro `review`) para que apareçam; esporte segue fechado enquanto tiver 0 masters.
