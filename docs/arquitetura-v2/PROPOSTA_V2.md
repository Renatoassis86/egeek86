# Espaço Geek 86 v2: proposta de arquitetura (2026-11-18)

Escrito para: o dono (decisão de arquitetura e de prioridade).
Origem: benchmark Keepa e similares (`docs/relatorios/2026-11-18-benchmark-keepa-e-similares.md`), 7 pareceres independentes do Conselho Geek (infraestrutura e filas; coleta e extração; armazenamento de séries; inteligência de preços; produto e front; mercado e crescimento; segurança, LGPD e qualidade) e medições em produção feitas em 2026-11-18. Ata: `docs/conselho/atas/2026-11-18-arquitetura-v2.md`. ADR: `docs/08-decisoes-adr/0010-arquitetura-v2.md`.

## 0. Correções ao benchmark (medidas depois dos pareceres)
O parecer de armazenamento questionou um número meu; medi e **três afirmações do benchmark estavam erradas ou incompletas**:
1. **"Snapshot caro, ~8 KB por linha": FALSO.** A tabela tem **3.649.086 linhas reais** (a estatística `n_live_tup` mostrava 84 mil, defasada). 689 MB / 3,65 mi = **~190 bytes por linha, índices incluídos**; 133 tuplas mortas; mediana de 6 linhas por oferta, p99 1.638, máximo 33.474. O armazenamento está **eficiente**; não há motivo para reescrever o modelo agora.
2. **"Sem alerta por usuário": INCOMPLETO.** Existem a tabela `affiliate_price_watches` (preço-alvo, cooldown, `last_notified_at`; **30 alertas, 8 perfis**), `queries/price-watches.ts`, a página `/conta` e o painel `watchlist-panel`; `collect-prices` já prioriza ofertas vigiadas. Falta fechar o ciclo (botão em cada produto, disparo com revalidação, Telegram e e-mail).
3. **Segurança do banco:** o risco "RLS possivelmente desligada" **não se confirma**: 103 das 113 tabelas têm RLS e **`anon` e `authenticated` não têm nenhum privilégio** nas tabelas públicas. As 10 sem RLS estão fechadas por privilégio.
Efeito: o item 4 da tabela de lacunas ("snapshot caro") sai da lista; o item 6 vira "fechar o ciclo do alerta".

## 1. Princípios da v2 (o que não muda)
Mantemos o que nos diferencia e o que as regras do dono protegem: **comparação entre lojas por GTIN**, **fontes oficiais** (ML e Shopee: 97 a 100% de frescor), **porteiro de qualidade** (isca R-61, plausibilidade, identidade, só produto novo e em linha), **honestidade de método** (R-91), **link de afiliado do dono em tudo** (R-70), **revalidação ao vivo antes de postar**, **gravação por mudança com batimento**, **estado diário por oferta-dia**, **8 canais de Telegram** como vitrine, e o portão com as regras do dono executáveis. A v2 **estrangula** pontos fracos, não reescreve o que funciona.

## 2. Arquitetura em camadas
```
 Fontes ──► Coleta/Extração ──► Validação ──► Fila+Agendador ──► Armazenamento ──► Inteligência ──► Produto/Distribuição
 (ML API,    (workers, Keepa,    (2 vias,       (por VALOR,        (eventos +        (score, deals,   (página por produto,
  Shopee API, página, extensão    canário,       balde de           diário + MV       métricas de      feed, alertas, Telegram,
  Keepa,      opt-in depois)      quarentena)    tokens)            + cache gráfico)  qualidade)       API, extensão)
                                   └──────────── Segurança, LGPD e Qualidade (transversal) ────────────┘
```
### L1 Coleta e extração
- **ML e Shopee:** API oficial, sem mudança; `sold_quantity` (delta semanal) vira sinal de demanda.
- **Amazon, em camadas:** (1) **Creators API** quando a conta tiver as 10 vendas; (2) **Keepa** como série de **preço cheio** com `source=keepa`; (3) **leitura de página** (aba do dono hoje, extensão opt-in depois) para o **par Pix** e como **prova do preço de mensagem** (R-81/R-101 intactos). Isso exige **revisar a R-82** (decisão do dono).
- **Raspagem em massa com proxy: vetada.** **Extensão opt-in só na fase 3** (consentimento revogável, dado mínimo, sem identificador persistente, sem execução remota, sem tocar em cookie/link de afiliado; dado dela é "sugestão" que precisa concordar com outra fonte).
- **Lojas futuras:** feed/API de afiliado primeiro; cada rede entra por adaptador + canário antes de ter mensagem.
### L2 Validação (nova)
- **Duas vias que concordam** (JSON-LD/dados estruturados + seletor): preço só é aceito se concordam; discordância ou leitura nula vão para **quarentena** (não vira queda, card nem mensagem); nulo nunca vira "R$ 0" nem "sem estoque" sem N confirmações.
- **Conjunto-canário** de 20 a 30 produtos por rede, por hora e no portão: desvio bloqueia o envio daquela rede.
### L3 Fila e agendador por valor
- **Score de interesse** por oferta (postos percentuais por departamento): `0,35·Δvendidos + 0,25·cliques /go (dedupe) + 0,15·envios 72 h + 0,25·|queda recente|` (pesos **provisórios**, calibrar em sombra). Tiers: quente (top 5%), morno (25%), frio, com **piso de frescor** para nenhum frio sumir.
- **Fila de prioridade e balde de tokens por domínio fora do Postgres:** **Upstash Redis + QStash** (HTTP, serverless, incremental); worker dedicado (Fly/Railway) só quando houver carga que a Vercel não comporte (navegador sem tela, lote > 60 s). Lotes de 20 a 50 ofertas em função de ≤ 60 s. **A fila de mensagens migra por último.**
- **Antes de qualquer Redis (Fase 0):** travar sobreposição dos `collect-vertical` com lock de execução única por vertical e medir.
### L4 Armazenamento
- **Mantemos** `affiliate_price_snapshots` (eficiente: 190 B/linha), `price_daily_offer` e `price_daily_state`.
- **Reduções baratas:** (a) **parar de gravar batimento como linha** (78% das 38 mil linhas/dia; `last_checked_at` já prova a leitura); (b) **tabela materializada de ofertas públicas** (hoje CTE de ~2 s por vertical) mantida pelo coletor; (c) **cache do gráfico por produto** (tag invalidada na mudança); (d) **partições mensais com `pg_partman`** (disponível; Postgres 17; **TimescaleDB não está disponível**) e retenção em camadas (bruto, hora, dia) **sem apagar** (arquivar só com backup e aval).
- **Reavaliar** `price_events` compacto (tempo em minutos, centavos, -1 sem oferta) **só se** o volume crescer 10x; hoje não compensa o risco da migração.
### L5 Inteligência de preços
- **Deals robustos:** passam pelo gatilho de isca R-61, **queda confirmada em duas leituras independentes**, preço abaixo do baseline robusto (mediana dos mínimos diários de 30 dias, banda de MAD), estoque e vendedor válidos.
- **Preço de tabela x real:** `inflação = list_price / mediana_30d`; "de/por" da loja não vira desconto quando inflado; economia exibida é sempre contra a **nossa** mediana.
- **Previsão:** só probabilidade empírica ("novo mínimo em 14 dias") com N mínimo, **backtest e comparação com a linha de base ingênua**; sem Prophet/ARIMA no início; **veto** a publicar sem backtest e a estimar vendas por ranking.
- **Métricas de qualidade:** **precisão do alerta** com intervalo de Wilson (verdadeiro = preço continuou na página após 60 min), divergência página x mensagem = 0, atraso evento→mensagem, cobertura por tier e departamento, recall de deals por auditoria amostral.
### L6 Produto, distribuição e retenção
- **Página única por produto mestre** (`/p/<slug>`, 301 das URLs antigas): gráfico (30d/90d/1a, mínimo/média/máximo sobre oferta-dia, selos honestos R-91), comparador por loja com "coletado há X", alerta de preço-alvo, **JSON-LD `Product`/`AggregateOffer`** só com preço fresco.
- **Feed `/ofertas` por maior queda com filtros** na URL (loja, faixa, queda mínima, vertical, "só no mínimo histórico").
- **Alerta por usuário (fechar o ciclo):** site → Telegram `/alerta` → e-mail; idempotência (watch, instante), limite por usuário, **revalidação ao vivo antes de avisar**, **consentimento registrado (sem opt-out por padrão)**.
- **Black Friday (27/11):** landing com "menor preço verificado dos últimos N dias".
- **Depois:** widget, **extensão opt-in** (só com audiência de alerta provada) e **API pública com cota** (lista de espera).
### L7 Segurança, LGPD e qualidade (transversal)
- Tokens **por escopo, com hash, expiração, rotação e revogação** (hoje `COUPON_INGEST_TOKEN` cai para `AMAZON_INGEST_TOKEN`); `Origin` não autentica; rate limit por token na API.
- LGPD: base legal por finalidade, retenção definida (`notification_deliveries.recipient/payload` hoje sem prazo), exportar e excluir em cascata, política atualizada **antes** de lançar extensão/API.
- Portão evolui: varredura de segredos, teste de padrão negado em toda rota `/api`, contrato de API versionado, teste negativo de RLS, **PULADO tratado como falha em rotas críticas**, canário de extração.

## 3. Divergências entre pareceres e como resolvi
| Ponto | Posições | Resolução |
|---|---|---|
| Reescrever o armazenamento (`price_events`) | DBA propôs; mas apoiou só **depois** de medir | Medi: 190 B/linha. **Não reescrever agora**; só parar batimento, materializar ofertas públicas e cachear gráfico. |
| Extensão e API | benchmark e coleta: fase 3; mercado: só depois de provar retenção por alerta | Consistente: **alerta primeiro**, extensão/API só com audiência (metas do parecer de mercado) e aval jurídico. |
| Redis/QStash x só travar sobreposição | infra: A (Upstash) incremental | **Fase 0 trava sobreposição e mede**; Redis na fase 2 se a medição mostrar que o banco ainda é o gargalo. |
| Cliques `/go` no score | preços: sinal não conferido no banco | **Sombra primeiro** (registrar com dedupe); só entra no score se existir e for confiável. |
| Alerta por usuário | benchmark dizia "não existe" | Já existe a base (30 alertas); prioridade é **fechar o ciclo**. |
| Keepa escrever preço | coleta: precisa mudar a R-82 | **Decisão do dono** (às 9h); enquanto isso, Keepa só confirma/veta como hoje. |

## 4. Roteiro por fases
- **Fase 0 (agora até a Black Friday, 27/11; baixo risco, sem migração):** medir linha de base; lock de execução única por vertical; canário de leitores + segundo extrator da Amazon + quarentena de leitura nula; **parar batimento como linha** e **materializar ofertas públicas** (sombra por flag); **fechar o ciclo do alerta no site e no Telegram**; JSON-LD e canonical nas páginas atuais; landing de Black Friday; registrar cliques `/go` com dedupe; rotular 200 alertas enviados para medir precisão; varredura de segredos e teste de padrão negado no portão. **Métricas:** zero divergência página x mensagem; ciclo de mensagens < 45 s; zero "Failed query" por falta de conexão em 7 dias.
- **Fase 1 (dezembro):** score por valor **em sombra** e depois ligado nos coletores; página por produto mestre com redirects e cache; feed com filtros; alerta por e-mail (opt-in duplo); endurecer deals (duas leituras + baseline robusto) e inflação de tabela. **Métricas:** precisão do alerta com intervalo; fração dos alertas verdadeiros no tier quente; LCP/INP/CLS no verde.
- **Fase 2 (janeiro):** Upstash Redis + QStash (coleta primeiro, mensagens por último); Keepa como fonte da Amazon (se o dono decidir) com validação lado a lado de 20 produtos; partições com `pg_partman` e retenção em camadas; tokens por escopo. **Métricas:** Amazon 20% em 24 h; p95 do lote < 60 s; conexões < 50% do teto.
- **Fase 3 (fevereiro em diante, só com gatilhos):** widget; **extensão opt-in** (gatilho: mais de 500 usuários com alerta ativo, parecer jurídico e auditoria); **API pública** com cota (gatilho: demanda real); worker dedicado se necessário.

## 5. Metas de 90 dias (hipóteses a revisar na semana 4 com dado real)
100 a 300 usuários com alerta ativo (hoje 30 alertas e 8 perfis); 1.000 a 3.000 inscritos nos canais; 20 a 40% dos usuários de alerta voltando em 30 dias; Amazon 20% em 24 h; precisão do alerta medida e publicada internamente.

## 6. Decisões que dependem do dono
1. **Revisar a R-82** para a Keepa escrever o preço cheio da Amazon (a página segue provando o preço de mensagem)? (às 9h você pediu o passo a passo da assinatura)
2. **Fase 0 até a Black Friday** como escopo, deixando Redis, extensão e API para depois?
3. Quer que o **alerta por e-mail** entre na fase 1 (exige provedor e opt-in duplo) ou só Telegram e site?
4. **Retenção** de dados pessoais dos alertas e prazo de guarda das entregas.
5. Parecer jurídico sobre termos de afiliado e extensão (Amazon): quem providencia?

## 7. Limites
Custos de Upstash/QStash/Inngest, planos da Keepa e termos atuais das lojas **não foram verificados** (estimativas). Pesos do score e limiares de inflação são **provisórios**. Metas de usuários não têm base histórica nossa.
