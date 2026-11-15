# Ata do Conselho Geek: Amazon na média única oferta-dia

- **Data:** 2026-11-11 (Black Friday em 2026-11-27; congelamento de esquema, coleta e regras em 2026-11-20)
- **Porte:** grande (estrutural: mexe em regra inegociável, no cálculo do selo/gráfico/cabeçalho e nas mensagens).
- **Presidente:** geek-lead
- **Escopo desta rodada:** SOMENTE LEITURA E PLANEJAMENTO. Nenhum código, banco (só SELECT), Vercel, Telegram, commit ou deploy foi alterado. Chrome não foi usado.
- **Plano técnico:** `docs/plano-amazon-na-media-2026-11-11.md`. **Rascunho de ADR:** `docs/08-decisoes-adr/0010-amazon-na-media-unica.md` (status "proposto", não aceito).
- **Transparência dos pareceres:** os pareceres abaixo foram redigidos pelo presidente pela lente de cada especialista, depois de ler o código e medir o banco. **Não são subagentes independentes**; pedem confirmação independente (qa-verificador e estatístico) antes de ligar. Convenção: **[C]** visto no código, **[M]** medido no banco, **[H]** hipótese a conferir, **[R]** recomendação.

## Briefing (decisão do dono, 11/11)
A Amazon não pode ficar fora do hub. (1) Entrar na média única se for o mesmo produto de ML/Shopee, com verificação de identidade além de GTIN. (2) Se o produto existe só na Amazon, média e menor preço só com ofertas da Amazon daquele produto. (3) A régua de mensagens (preço >= 10% abaixo da média única) bloqueia a Amazon sem média. (4) Risco da Amazon aceito (ADR 0009); carimbo "Preço na Amazon em dd/mm às hh:mm, sujeito a alteração." continua obrigatório.

## Fatos que mudam o problema
1. **[C][M] A exclusão não está no cálculo diário.** `computeDayState`, `upsertOfferDays`, `loadOffers` e `eligibleOfferSql` não filtram rede. Desde 10/11 há 408 linhas de `price_daily_offer` de 351 ofertas Amazon e a Amazon já é membro (`members`) de 196 estados em 10/11 e 215 em 11/11 (211 produtos). A exclusão mora na camada de leitura das mensagens e do cartão: `loadNonAmazonOffers` (`price-card.tsx`), `isAmazon` em `offer-card-model.ts`, `amazonSeries` e `loadSeries` (`group-offers.ts`/`group-rules.ts`), `live-recheck.ts`. Resultado possível: **duas médias diferentes para o mesmo produto** (estado diário com Amazon; cartões/mensagens sem). Se `PRICE_METRICS_V2` está ligada em produção, o selo/gráfico já incluem a Amazon [H: não verifiquei o ambiente da Vercel].
2. **[M] Impacto (estado aberto de 11/11, 211 produtos com Amazon):** a média muda em média 4,3% e no máximo 21,8%; 134 produtos mudam mais de 2% e 66 mais de 5%; a Amazon é o menor preço em 83. Com a régua de 10%: a Amazon estaria >= 10% abaixo da média em 134 produtos (64%). **[H] Número alto demais para ser confiável sem auditoria** (o preço vem da busca da Amazon, não do Buy Box garantido): auditar amostra de pares antes de ligar.
3. **[M] Amazon-only hoje: 0.** Os 221 masters com Amazon ativa têm todos 3 ou mais ofertas em ML/Shopee. A coleta é "master primeiro": a busca parte do nome do master já cadastrado; só `games`. Produto que existe só na Amazon exige descoberta partindo da Amazon (hoje inexistente). Fora de games há 782 masters ativos (esporte, eletrodomésticos, tecnologia, livros, impressão 3D, eletroeletrônicos) com **zero** oferta Amazon.
4. **[M] Frescor:** `last_checked_at` mediana 20 min, p90 32 min, 30 de 351 (8,5%) com mais de 2 h; mas só grava snapshot quando o preço muda: 290 de 351 ofertas têm **1 único snapshot** e o último tem ~15 h. **[C] Falha iminente:** `computeDayState` considera "fresca" a oferta com última cotação <= 48 h; as ofertas Amazon cujo preço não mudou desde 10/11 vão **sair da média a partir de 12-13/11** mesmo continuando na loja e checadas a cada 30 min. É o ponto "sem batimento" do briefing.
5. **[M] Peso:** 120 dos 215 produtos têm 2 ou 3 ASIN Amazon; cada ASIN é uma oferta e pesa 1 (ADR 0004), então a Amazon pode pesar 2 a 3 contra 1 de cada vendedor.
6. **[C] Identidade hoje:** `ingestAmazonRows` casa por cobertura de tokens (>= 0,8 do master e >= 0,5 do candidato), plataforma igual, edição igual, cor, formato digital, e faixa de preço contra referências (`isImplausiblyLow/High`). Não usa GTIN (a busca devolve ASIN, título, preço, capa) e não extrai marca/modelo/capacidade/voltagem (só games).
7. **[C] Mensagens:** régua de 10% já existe em `group-rules.ts` (`belowAvgPct`, `MIN_BELOW_AVG_PCT`); a Amazon tem série própria (`amazonSeries`), frescor 60/40 min, pausa se o laço parar 90 min, automático só com queda <= 30%.
8. **[C] Contrato (inventário `amazon.md`):** 1(h) preço em cache até 24 h; 1(c)-(e) agregar/analisar; 6(y) rastreio e alerta de preço; 6(z) não exibir conteúdo para anunciar produto de outros sites; 2(b) preço exibido de link/API e carimbo; 6(c) remover o que a Amazon retirar; cláusula 5 aviso de remuneração. O ADR 0009 aceitou o risco da coleta e do histórico; **não cita 6(z) nem 6(y)**.

## Pareceres (lentes)
| Lente | Posição | Recomendação |
|---|---|---|
| Estatístico sênior | Incluir é correto se a identidade for forte; sem ela a Amazon contamina a média. A oferta compara-se com uma média que ela mesma ajuda a formar (viés com n pequeno). Efeito composição: a entrada da Amazon quebra a série de 211 produtos. | Mínimo de 3 ofertas para média (ADR 0004) mantido; régua de 10% exige 4 ofertas quando o candidato é membro; marcar a quebra de série em 11/11 usando `matched_change_pct`/`composition_flag`; auditar 40 pares (IC do erro de identidade) antes de ligar. |
| Matemático aplicado | Média por oferta-dia é bem definida com N variável; a entrada da Amazon é mudança de composição, não de nível. Com `members` por oferta o cálculo "com" e "sem" Amazon sai do mesmo conjunto. | Função única `computeDayState(offers, {includeNetworks})`; teste de paridade exato: sem Amazon = valor de hoje centavo a centavo; propriedade: média com Amazon fica entre min e max dos membros. |
| Especialista em preços | Preço de busca da Amazon não é o Buy Box nem inclui cupom/frete; Amazon 3P não é Amazon 1P. 64% dos produtos "10% abaixo" é suspeito. | Gravar vendedor (1P/3P) e condição; só novo; cupom da Amazon nunca é subtraído; auditoria de amostra; faixa plausível (já existe com >= 3 ofertas) vale para a Amazon. |
| Cientista de dados em tempo real | Sem batimento a Amazon sai da média por silêncio, não por sair da loja. | Batimento por `last_price_confirmed_at`: oferta entra se confirmada em <= 24 h (alinha ao contrato) e `consecutive_miss_count = 0`; saída por falta de leitura vira estado "sem leitura recente", não "removida". Linha oferta-dia de dia sem mudança (coluna `last_confirmed_at`, migration aditiva). |
| Integrador de APIs | Sem API: coleta assistida pela aba logada (ADR 0009). Dependência do computador do dono; Creators API segue inviável (0 vendas). | Aceito o risco; manter parada em captcha; alarme do laço (3 h) e pausa da classe (90 min); kill-switch por env. |
| DBA | Dados já estão nas tabelas; falta de coluna só para o batimento. Reprocessar é barato: há só 2 dias de Amazon (desde 10/11). | Migration aditiva única até 14/11 (antes do congelamento); reprocesso de 10 e 11/11 por script idempotente; índice parcial por rede se a consulta pesar. |
| QA | Há risco de divergência entre camadas e de ligar sem baseline. | Paridade (games sem Amazon = hoje), antes/depois com Amazon, auditoria de identidade, teste de frescor, SELECT final; flag em 3 modos. |
| Estrategista | Black Friday sem a Amazon deixa o hub com cobertura menor justo no pico; o risco contratual é do dono, já aceito. | Incluir só `games` na BF; outras verticais depois. Pedir aprovação escrita à Amazon em paralelo. |
| Gamer veterano | O gamer espera ver a Amazon (muita mídia física em promoção); desconfia de "menor preço" de vendedor terceiro, edição errada e ágio de colecionador. | Edição/plataforma/região como portões duros; 3P marcado; preço sempre com horário. |

## Divergências e decisões do presidente
1. **"Só games na BF" x "tudo"** (estrategista quer cobertura, QA quer menos superfície): decidido provisoriamente games em 20/11; demais verticais depois da BF.
2. **Amazon-only com 1 ASIN:** a regra "média com >= 3 ofertas" impede média; ver decisão D3.
3. **Contrato:** o inventário recomendou não misturar; o dono já aceitou o risco. O conselho registra a recomendação (aceitar com mitigação) e deixa a decisão com ele.

## Decisões que dependem do dono (uma por vez, com recomendação)
D1 incluir a Amazon na média única pública (selo, gráfico, cabeçalho) aceitando 6(z)/1(c)-(e)/6(y); D2 limite de frescor 24 h; D3 regra Amazon-only; D4 identidade em dúvida fica fora da média; D5 verticais; D6 aviso de remuneração. Detalhe e recomendações no plano, seção 9.

## Execução e QA
Nada executado. Quando autorizado: engenheiro-backend e dba-postgres implementam; cientista-precos/estatístico revisam; **qa-verificador obrigatório** antes de ligar (paridade, auditoria de identidade, SELECT).

## Limites desta rodada
Não verifiquei variáveis da Vercel, nem se `PRICE_METRICS_V2` está ligada, nem o Buy Box real; a medição de impacto é de um único dia aberto. Pareceres são lentes, não independentes.
