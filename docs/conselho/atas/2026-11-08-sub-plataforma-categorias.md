# Ata do Conselho Geek: sub-plataforma de categorias (departamentos) e histórico da Black Friday

- **Data:** 2026-11-08
- **Porte:** grande (nova categoria, mudança de modelo de dado, nova coleta, emenda de escopo do ADR 0005)
- **Presidente:** geek-lead
- **Convocados:** mesa fixa (estrategista-mercado, especialista-precos, gamer-veterano, qa-verificador) e por tema: dba-postgres, engenheiro-coleta, integrador-apis, cientista-dados-tempo-real, estatistico-senior, guardiao-catalogo, engenheiro-infra-sre, seguranca-db, engenheiro-frontend, arquiteto-next, key-user-gamer
- **Escopo desta reunião:** somente desenho. Nenhuma migração aplicada, nenhuma escrita no banco, nenhum deploy, nenhuma flag ligada, nenhum commit, nenhuma chamada a API de marketplace. Única leitura de banco: 1 conjunto de SELECTs em transação READ ONLY (contagens abaixo); o script temporário foi removido.

## Briefing
Pedido literal do dono: criar uma sub-plataforma para Livros, Eletrodomésticos, Eletroeletrônicos (smart TV, soundbar), Material de tecnologia (computadores, notebooks, acessórios, hardware, impressoras, impressoras 3D, informática) e Material de esporte, com a mesma métrica e arquitetura semelhante, e "não perder a historicidade de novembro, mês de Black Friday". Começar a implantar no banco e organizar a página.

Calendário: hoje 08/11; Black Friday sexta 27/11/2026 (19 dias). Cada dia sem coleta é histórico irrecuperável (os snapshots são a única fonte; `price_daily_*` e eventos do menor preço são derivados e recalculáveis).

Regras em jogo: zero dado fake/interpolado; um produto = um master = uma média (oferta-dia, ADR 0004); mudança do menor preço é evento; uma imagem um lugar; só API oficial; cliente nunca vê "afiliado"; cantos retos; nada em produção sem autorização.

Emenda de escopo: a ata de 2026-11-02 e o ADR 0005 definem "somente jogo, console e acessório de game" e o porteiro `src/lib/catalog/gate.ts` rejeita hoje, de propósito, livro/guia, papelaria, vestuário e peça interna. Este pedido é uma EMENDA (novo departamento), não uma violação, e deve ser registrada como emenda que mantém o ADR 0005 integral para o departamento Games (ver ADR 0008, proposto).

## Dados medidos (banco real, SELECT READ ONLY, 2026-11-08)
- `affiliate_price_snapshots`: ~3,31 M de linhas, 550 MB; 10.755 linhas gravadas nas últimas 24 h. Banco inteiro: 651 MB.
- Ofertas por rede/status: Mercado Livre 9.790 ativas, 5.251 expiradas; Shopee 757 ativas, 3.597 expiradas.
- Masters por `product_type`: game 4.059, console 471, accessory 2.021.
- Migração 0024 JÁ aplicada (existem `price_daily_offer`, `price_daily_state`, `price_min_events`). 0025 e 0026 NÃO aplicadas (sem `collector_runs`, sem `external_item_id`/`last_price_confirmed_at`). Colunas do snapshot hoje: id, offer_id, price_cents, list_price_cents, discount_percent, coupon_code, collected_at, source (sem condição, estoque, vendedor ou moeda).
- Correção de premissa: o snapshot só é gravado quando o preço muda ou a cada 24 h (`record-price-snapshot.ts`, batimento). Portanto o crescimento de armazenamento é muito menor que a estimativa do SRE (que assumia 1 linha por coleta): ordem de grandeza, hipótese, dezenas de MB até a BF por vertical, não GB.

## Pareceres (rodada 1, independentes)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| dba-postgres | Aditivo e reversível é viável; risco de contaminação hoje ALTO e estrutural | Coluna `vertical text NOT NULL DEFAULT 'games'` com CHECK em `master_products` e `affiliate_offers`; allow-list `vertical='games'` nas CTEs públicas; sem tabelas paralelas; reaproveitar `price_daily_*` sem mudança | Tamanho real; callers que leem `master_products` sem passar pelo gate |
| engenheiro-coleta | Motor ML por catálogo reaproveitável, mas fila única sem filtro de vertical: oferta nova fura a fila gamer | Filtro `vertical` no `dueWhere`; cron e teto próprios; semear lista curta de `catalog_product_id` já; descoberta por vertical com termos, cursor e gate próprios; `isNonProductAccessory` rejeita livro/tênis, então não reaproveitar | Cota do ML; cobertura de catálogo por vertical; se `evaluateOfferIdentity` tolera master não-jogo |
| integrador-apis | Só ML e Shopee estão disponíveis hoje; Magalu, Amazon, Americanas sem caminho oficial pronto | Começar só com ML e Shopee; medir cobertura com 1 busca por vertical; cadastro paralelo de redes (Awin/Lomadee/PA-API) sem contar com eles para 27/11; ler termos sobre armazenar/exibir histórico | Cota real; termos de uso; resposta ao vivo da Shopee |
| cientista-dados-tempo-real | Gravar já é viável; sem `collector_runs` coleta parada é indistinguível de preço estável | Aplicar 0025 e ligar `COLLECTOR_RUNS=1` antes de semear; frequência por vertical (TV/notebook 5-10 min na BF, eletro 15-30, livros/esporte 60); batimento 6 h nas verticais da BF; lacuna registrada, nunca interpolada | Campos que a API devolve; taxa de mudança por vertical |
| estatistico-senior | Fórmula e razões (35 %, 3x) são invariantes à escala; o que quebra é master misturando variantes | Manter limiares até 30 dias de dado e medir corte por categoria; sem selo com n<3; referência "preço de antes" = mediana oferta-dia dos 60 dias anteriores excluindo os 7 últimos, com mínimo de 14 dias medidos; em novembro afirmar só "menor preço desde DD/MM" e "N dias monitorados" | Distribuição real de dispersão por categoria |
| guardiao-catalogo | `dedup.ts` e o porteiro são gamer por construção; "outra vertical" não pode ser `rejected` | Perfil de identidade por vertical (GTIN/ISBN/MPN primeiro, título só último recurso); porteiro por vertical; nunca cadastrar master sem identificador forte ou revisão; usado/Open Box/recondicionado/reembalado/importado fora | Se o ML devolve GTIN/ISBN/MPN em `/products/search` |
| engenheiro-infra-sre | Apoio com ressalvas: crons dedicados e kill-switch por vertical, isolados do `collect-prices` | Confirmar plano Vercel e Supabase; aplicar 0025; `collector-health` não está no `vercel.json`; flag `VERTICAL_<NOME>_ENABLED`; começar em 30 min e subir só se disco e cota permitirem | Plano/limites Vercel e Supabase; porta do pooler em produção |
| seguranca-db | Viável se isolamento for estrutural; default aberto hoje (ausência de veredito = aprovado) | Inverter para allow-list em sitemap, busca, `/api/produtos/*`, `/go`; tabela nova sempre com RLS; cron com `rejectUnlessCronAuthorized` (Bearer); rota admin de semeadura com papel, limite e registro; backup e rollback testado | Se `/go` e `/api/search` usam o porteiro; se a 0026 tem RLS |
| engenheiro-frontend | Para o MVP não precisa de página pública; tabela de preços atual é gamer no desenho | `/mercado/[vertical]` no mesmo app, atrás de `MERCADO_UI`, 404 desligada; tabela genérica guiada por config da vertical; filtros só com dado real; 1 hero por vertical, sem repetição | Como pesquisa/monitorar usam `product_type`; atributos que o ML devolve |
| arquiteto-next | Um app, um banco; isolamento por parâmetro obrigatório nas queries, não filtro ad hoc | Coluna `vertical`; `vertical` tipado nos helpers `publicOffersCtes`/`priceQuotesCtes` (filtro dentro do CTE, ponto único); segmento real de URL (grupo `(pasta)` não aparece na URL); `generateSitemaps` por vertical; ~10 arquivos de query pública e 3-5 de coleta | Chamadores dos helpers; SQL cru que os contorne (não li `generate-static-params`) |
| key-user-gamer | Gamer não pediu isso (hipótese); mistura de verticais é o maior risco de confiança | Fase 1 só gravar; Fase 2 páginas próprias fora da home/busca gamer; sem histórico mínimo mostrar "coletando desde DD/MM"; livros e esporte por último | Interesse real do público (sem dado de analytics lido) |
| estrategista-mercado | Apoio com ressalvas: o ativo em 2026 é a série, não a página | Sem sub-marca pública agora; ordem: tecnologia, eletroeletrônicos, livros, eletrodomésticos, esporte; MVP = cesta pequena e bem identificada; selo de desconto não pode existir em 2026 (CDC) | Comissões, termos, volume de busca da BF |
| especialista-precos | Apoio com ressalvas: gravar já; nunca exibir "de/por" do marketplace como verdade | Gravar `original_price` bruto rotulado; comparar só à vista, frete fora; voltagem separa; piso por vertical calibrado com dado; ranking de qualidade esperada: TV/notebook > soundbar/hardware > eletro > livros > esporte (hipótese) | Campos reais de `/products/{id}/items`; frequência de `original_price` |
| gamer-veterano | Apoio com ressalvas; CONTRA esporte e eletrodoméstico por falta de coerência de mundo | Registrar como emenda (departamentos), ADR 0005 intacto para Games; porteiro próprio com evidência positiva; whitelist por categoria/marca; nome próprio do departamento, nunca "tudo do Espaço Geek"; livros só recorte gamer | Decisão do dono sobre esporte/eletro |
| qa-verificador | Não há teste estrutural contra vazamento; testes de gate/dimensions nem rodam em esteira | `scripts/test-vertical-isolation.ts`, snapshot textual do SQL das CTEs, contagens gamer antes/depois idênticas, rollback provado, kill-switch, grep de imagens; vetos listados | Linha de base congelada |

## Divergências e réplica (rodada 2)
1. **Escopo e coerência de mundo (gamer-veterano x pedido do dono; estrategista e key-user alinhados em "esporte por último").** Gamer-veterano é contra esporte e eletrodoméstico. Os demais aceitam, desde que por último e curados. Não há réplica técnica possível: é decisão de negócio. Resolução: levada ao dono (pergunta 1), com a divergência registrada e recomendação de gravar esses dois com cesta mínima (custo baixo, histórico irrecuperável) mantendo-os fora da página pública por padrão.
2. **ADD VALUE no enum `product_type` (dba-postgres x qa-verificador / arquiteto / guardião).** DBA propôs `ADD VALUE 'general'` para que masters novos não herdem o default `'game'`. QA vetou irreversibilidade; arquiteto e guardião preferem não tocar no enum. Réplica: o QA retirou o veto (resíduo inerte) e exigiu a opção do DBA, porque `product_type` aparece em 168 ocorrências em 37 arquivos e fazer cada ponto ignorá-lo quando `vertical<>'games'` espalha a regra, com risco de ramo esquecido tratar a nova vertical como jogo. O DBA, por sua vez, retirou a proposta (o valor novo quebra `Record<ProductType, ...>` e é irreversível). As posições se cruzaram e NÃO convergiram. Decisão do presidente (recomendação, a confirmar no ADR 0008 antes de implementar): adotar a coluna `vertical` como barreira principal e usar `ADD VALUE 'general'` aplicado dentro da mesma migração, porque (a) a exaustividade do TypeScript acusa em tempo de compilação todo ponto não tratado, (b) o valor fica inerte se tudo for desfeito, (c) a alternativa deixa o default `'game'` ativo para dado novo. Se o dono ou o arquiteto discordar na implementação, o fallback aceitável é só a coluna, com a allow-list nas CTEs e teste que falha se um master `vertical<>'games'` tiver `product_type='game'`. Registrado como divergência técnica aberta.
3. **Frequência e armazenamento (infra x cientista).** Infra estimou milhões de linhas assumindo uma por coleta e disse que dedup quebraria a mediana. Fato verificado: o sistema já grava só mudança mais batimento de 24 h, e a oferta-dia é a mediana das cotações gravadas. Resolução: manter a regra; batimento reduzido para 6 h nas verticais da BF (hipótese do cientista) a decidir após medir; armazenamento deixa de ser risco primário.
4. **Limiar do piso (estatístico x especialista-precos).** Estatístico quer manter 35 %/3x até dado; especialista quer calibrar por vertical. Convergência: manter e instrumentar `floorExcludedQuoteCount` por vertical; recalibrar só com dado (corte > 5 % indica identidade ruim, não limiar errado).

## Acordos (sem divergência)
- Gravar o histórico já, sem página pública, sem selo de desconto, sem veredito em 2026 (14 dias mínimos não serão atingidos para a maioria antes de 27/11).
- Isolamento ESTRUTURAL antes do primeiro insert: coluna `vertical`, allow-list `'games'` nas superfícies gamer (CTEs, sitemap, busca, `/api/produtos`, `/go`), teste automático de vazamento. Sem isso, rede de segurança transitória: masters novos nascem com `attributes.catalogGate.verdict='review'` (invisíveis nos filtros atuais) — gambiarra declarada e removida depois.
- Sem tabelas paralelas; `price_daily_*` e eventos do menor preço reaproveitados (são por `offer_id`/`master_product_id`, sem FK).
- Coleta só ML e Shopee (Magalu/Amazon/AliExpress são stubs/sem API); cadastro de outras redes em paralelo, sem contar com elas para 27/11.
- Cron e fila dedicados por vertical, teto próprio, kill-switch por env, `collect-prices` gamer intocado; aplicar 0025 e ligar `COLLECTOR_RUNS=1` antes.
- Identidade forte (GTIN/ISBN/MPN/catálogo ML) antes de título; usado, Open Box, recondicionado, reembalado e importado fora; voltagem e polegada separam; cor junta (exceto tênis, onde separa).
- Comparação só à vista; `original_price` do marketplace gravado bruto e rotulado, nunca base de selo.
- Ordem: Tecnologia (hardware, notebook, periférico) e Eletroeletrônicos (TV, soundbar) primeiro; Livros depois; Eletrodomésticos; Esporte por último (tênis é a pior identidade).
- Página: `/mercado/[vertical]` (nome provisório) no mesmo app, atrás de flag privada, 404 desligada, fora de sitemap, menu e busca; nenhuma flag pública; nome público é decisão do dono (sem "afiliado").

## Decisão (plano proposto, depende da decisão do dono)
**Fase 0, leitura e preparo (sem tocar produção, 08-10/11)**
1. ADR 0008 (proposto) e esta ata.
2. Congelar linha de base gamer (SELECT READ ONLY): masters públicos, ofertas elegíveis, `price_daily_state`, média/mínimo de 20 masters amostrados, contagem do sitemap.
3. Escrever `scripts/test-vertical-isolation.ts` e snapshot textual das CTEs; adicionar scripts `test:gate`, `test:dimensions` ao `package.json` (hoje não rodam em esteira).
4. Medir (com autorização de chamadas, no padrão da ata 2026-11-06): 1 busca `/products/search` por vertical, `dry=1`, para cobertura de catálogo, presença de GTIN/ISBN/MPN, campos de `/items` (estoque, original_price, loja oficial). Sem isso a semeadura é palpite.

**Fase 1, fundação em produção (precisa autorização do dono; alvo 10-12/11)**
5. Migração 0027 aditiva: `vertical` em `master_products` e `affiliate_offers` (default 'games', CHECK), índice parcial, `ADD VALUE 'general'` (sujeito à divergência 2), RLS, `.rollback.sql`; `apply-vertical.ts` (dry-run padrão, backup, log). Aplicar 0025 e 0026 antes, nessa ordem; ligar `COLLECTOR_RUNS=1`; incluir `collector-health` num agendador.
6. Código: parâmetro `vertical` obrigatório nos helpers de CTE e nas ~10 queries públicas; allow-list no sitemap e rotas `/api/produtos/*`; porteiro por vertical (`gateFor`) e `IdentityProfile` por vertical em `dedup.ts`. QA bloqueia se qualquer contagem gamer mudar.

**Fase 2, começar a gravar (alvo 12-15/11)**
7. Cron `collect-vertical?v=` com teto próprio e kill-switch `VERTICAL_<NOME>_ENABLED`; semeadura por rota admin (papel, limite, `collector_runs`) com lista curada de `catalog_product_id` e termos por whitelist de marca/linha; masters nascem em `review` até identidade forte conferida; semear primeiro TV, notebook, hardware, soundbar; depois livros por ISBN; eletro e esporte cesta mínima (se o dono aprovar).
8. Frequência: 30 min para todas; 10-15 min em TV/notebook/hardware de 18/11 a 30/11 somente se cota (429 < 1 %) e disco permitirem. Dado que a API não devolve fica NULL, nunca estimado.

**Fase 3, página (depois do dado; interna; alvo após 15/11, pública só depois de 27/11 e decisão do dono)**
9. `/mercado/[vertical]` somente leitura: título, menor preço agora, nº de lojas, "verificado há", "coletando desde DD/MM". Sem selo, sem veredito, sem "de/por" do marketplace. Reaproveita detalhe `/ofertas/[slug]`, cartão-pai e gráfico V2 (dependem de PRICE_METRICS_V2/PRODUCT_CARD_V1, hoje OFF; não ligar para a sub-plataforma antes de validar na gamer).

**Fica de fora:** usado/Open Box/reembalado/recondicionado/importado; scraping; Magalu/Amazon (sem API oficial); selo de desconto e veredito em 2026; imagem repetida; qualquer flag pública; sub-marca pública; livro genérico sem recorte aprovado; consumíveis de impressora e papelaria (a confirmar).

- Decisão do responsável do projeto: **pendente** (4 perguntas abaixo).

## Decisões pedidas ao dono (uma por vez, cada uma com recomendação)
1. **Escopo e nome do departamento.** Aprova registrar como emenda (departamentos, ADR 0005 intacto para Games), com a ordem Tecnologia, Eletroeletrônicos, Livros, Eletrodomésticos, Esporte, e gravar já esporte e eletrodoméstico apenas com cesta mínima? Recomendação: sim; livros só com recorte aprovado; esporte/eletro fora da página pública por padrão até você decidir (gamer-veterano é contra incluí-los).
2. **Autorização de produção para a fundação** (0025, 0026, 0027 aditivas, `COLLECTOR_RUNS=1`, cron e kill-switch). Recomendação: autorizar em bloco, com backup, log e rollback, na ordem da Fase 1, só depois de testes verdes e contagem gamer idêntica (padrão de "aprovação ampla com backup").
3. **Medição de cobertura nas APIs** (cerca de dezenas de chamadas somente leitura ao ML e uma à Shopee) para decidir a semeadura. Recomendação: autorizar um teto (ex. 60 chamadas ML + 3 Shopee), como na ata de 06/11.
4. **Página e termos.** Sem página pública antes de 27/11 (interna atrás de flag) e você (ou assessoria) ler os termos de ML e Shopee sobre armazenar e exibir histórico de preço antes de publicar; iniciar em paralelo o cadastro de redes (Awin/Lomadee/Amazon). Recomendação: sim.

## Métrica de sucesso
- Gamer: contagens e médias antes/depois idênticas (diferença zero); `oldest_due_age_s` do `collect-prices` igual ao baseline; 429 < 1 %/dia.
- Série: percentual de dias, do início da coleta até 30/11, com snapshot válido por item da cesta (alvo a definir; hipótese 95 % das ofertas ativas confirmadas dentro do SLO); zero dia sem coleta não registrado em `collector_runs`.
- Qualidade: 0 duplicata por chave forte; 0 master de vertical em superfície gamer (teste automatizado); 0 imagem repetida; amostra de 100 masters novos com IC de Wilson.
- Zero afirmação de desconto sem referência elegível (>= 14 dias medidos, 3 ofertas distintas).
- Pós-BF: comparar `original_price` do marketplace contra a mediana dos 30 dias anteriores para quantificar o desconto falso.

## Reversão
Desligar `VERTICAL_<NOME>_ENABLED` e remover o cron do `vercel.json` (menos de 10 min); página atrás de flag, rota 404; dados já coletados ficam (snapshots append-only, derivados recalculáveis, nunca apagados). Migração: `.rollback.sql` (DROP COLUMN `vertical`, índices); o valor `general` do enum permanece inerte.

## Não verificado (honestidade)
Cota real de ML e Shopee; limites de cron/plano Vercel e plano/disco Supabase; porta do pooler em produção; termos de uso das APIs; cobertura de catálogo ML por vertical, presença de GTIN/ISBN/MPN e campos de `/items`; se `evaluateOfferIdentity` tolera master não-jogo; todos os chamadores dos helpers de CTE e SQL cru que os contorne; se `/go` e `/api/search` usam o porteiro; se a 0026 tem RLS; interesse real do público; comissões por categoria; Shopee ao vivo (estado da ata de 11/03). Nenhum dado fake foi criado.

## Execução e verificação
- Executores previstos: engenheiro-backend, engenheiro-coleta, dba-postgres, arquiteto-next, guardiao-catalogo, engenheiro-frontend; qa-verificador e seguranca-db com poder de bloquear o "concluído".
- QA: não executado nesta reunião (somente desenho).

## Retrospectiva
Preencher após 30/11/2026.

## Execução (2026-11-08, após as 4 respostas "sim" do dono)
- **Aplicado em produção (15:32 UTC):** migrações 0025, 0026 e 0027 (backup em `backup/dados/vertical-2026-11-08T15-32-48-526Z`, log em `backup/logs/aplicacao-0025-0027-2026-11-08.log`). Contagens e campos estáveis da linha de base gamer idênticos depois.
- **Código:** isolamento por allow-list `vertical='games'` (commit b119cad); porteiro com combos, acessórios e variantes de cor (85054d5). `COLLECTOR_RUNS=1`; kill-switches VERTICAL_TECNOLOGIA/ELETROELETRONICOS/ELETRODOMESTICOS ligados; LIVROS e ESPORTE desligados.
- **Semeadura (Mercado Livre, só leitura de catálogo oficial):** 28 masters em revisão: tecnologia 17, eletroeletrônicos 6, eletrodomésticos 5. Ajuste de ordem frente à ata: livros ficam à espera do recorte do dono; notebook e geladeira sem vendedor no catálogo (404); bola parou em HTTP 429.
- **QA independente:** sem achados bloqueantes ou altos. Médios: preço implausível (TV LG 75" a R$ 98.919) sem guarda nas verticais; master `smart-tv-lg-4k` com identidade fraca; Shopee em 429 recorrente com fila que não esvazia; "afiliad" em payload de /ofertas (pré-existente). Não verificado: /api/produtos por HTTP (flags OFF), coleta já habilitada de eletroeletrônicos.
- **Pendências do dono:** recorte de livros; credenciais da Shopee; cor (um master por modelo vs. por GTIN); cópia datada dos termos de ML e Shopee e pergunta escrita ao suporte; revisão jurídica antes de página pública.
