# Parecer do Estrategista de Mercado, rodada 1 (2026-11-01)

Insumos: `docs/inventario-funcionalidades-2026-11-01.md`, auditoria Cowork seções 2, 5, 6, 7, `research/benchmarks/PANORAMA.md`. Rótulos: [dado] medido ou lido em arquivo; [hipótese]; [recomendação].

## 1. Posição

**Apoio com ressalvas** ao pacote de decisões da seção 7. Divergência registrada: sobre Hype Zone e leilões, vou além do dono da auditoria (item 5 abaixo). Nenhuma regra inegociável é violada pelas minhas recomendações; o parecer assume que F-01, F-02 e F-17 são corrigidos sem criar dado sintético.

## 2. Leitura da situação

- [dado] O diferencial declarado é "Ofertas reais. Decisões inteligentes." (blueprint seção 4). O comparador concorrente mais próximo (ITAD, GG.deals, Zoom, Promobit) vence hoje em confiança: gráfico no produto, selo coerente, alerta por evento.
- [dado] Coleta (ML, Shopee) e alerta diário por e-mail/Telegram com preço-alvo sugerido já existem e são coerentes com as regras (inventário itens 1, 2, 21-25).
- [dado] O que vaza confiança é a apresentação: produto errado sob título certo (F-01), duplicatas (F-02), veredito de 3 faixas ausente (F-08), contadores que divergem (F-15).
- [dado] Aquisição por busca orgânica tem custo marginal quase zero e não existe: sem `sitemap.xml` (F-29), sem JSON-LD, sem `Sitemap:` em `robots.ts`; home em 22 a 38 s (F-18).
- [dado] Cinco módulos fora do blueprint (Hype Zone, leilões C2C, curadoria, vendedor C2C, pesquisa) foram entregues antes do núcleo estar confiável, enquanto a gamificação aprovada em ADR 0003 não foi implementada e o resgate em cupom que o ADR manda remover continua no código (`curation.ts`, `points-rewards-card.tsx`).
- [hipótese] A receita é comissão de afiliado (ML, Shopee). Sem volume de cliques e conversão por página, não sei qual página rende. Só `affiliate_click` é instrumentado.

## 3. Riscos

1. Um usuário que vê "−70%" num produto errado não volta, e o alerta diário herda a mesma média contaminada. Detecção: taxa de cliques em "Ir à loja" seguida de reclamação; amostra manual semanal de 30 produtos.
2. Entrar no Google com páginas duplicadas ou com dado errado cria índice ruim difícil de reverter. Por isso, sitemap só depois de F-01 e F-02 no escopo publicado.
3. Dependência de duas plataformas de afiliado (ML em 931 produtos, Shopee em 157, [dado auditoria]). Mudança de política ou corte de comissão derruba a receita. Mitigação: Magalu e Amazon quando a descoberta estiver estável.
4. Leilões com "caução" e "escudo anti-bot" sem mecanismo real são promessa enganosa potencial. Pode violar regra de consumidor [hipótese jurídica, não sou advogado].
5. Divulgação de afiliado insuficiente expõe a risco regulatório e de programa (Mercado Livre e Shopee exigem transparência) [hipótese, a confirmar nos termos oficiais].
6. Rosto de colecionador sem base legal (F-19): risco LGPD alto, benefício de negócio zero hoje.

## 4. Recomendação

### 4.1 Opinião sobre as decisões do dono (seção 7)

| Decisão | Minha posição | Razão |
|---|---|---|
| 1 Mediana ao lado da média | Apoio. Chamar "preço típico" e usar a mediana como base do veredito; média em segundo plano. | Resiste a isca e a R$ 15.500 (F-13). Linguagem de Zoom ("mais caro que o normal") converte melhor [PANORAMA]. Condição: documentar a fórmula e manter "um jogo, uma média" para a média. Estatístico deve validar. |
| 2 Uma cotação por oferta por dia | Apoio. | Remove o viés de frequência (F-26) e o número fica explicável. Efeito colateral: cai o contador de cotações; reescrever o texto público de "cotações". |
| 3 Oferta internacional | Apoio a excluir da média e do selo, mostrar à parte com aviso. | Preço sem imposto induz decisão ruim (F-12). Mostrar à parte preserva a cobertura. |
| 4 Controles de terceiros | Apoio com ressalva: aceitar PowerA, Hori, 8BitDo e marcas licenciadas; excluir clone sem marca. | Ressalva: lista de marcas aceitas deve ser dado de configuração auditável, não regex no título. |
| 5 Palavra "afiliado" / divulgação | Apoio a divulgar. Não ocultar. Texto curto e visível perto do "Ir à loja" e em Termos/Sobre ("podemos receber comissão se você comprar pela loja; o preço não muda para você"). | Confiança é o ativo; divulgação clara aumenta credibilidade e protege a conta de afiliado. A regra interna de não usar a palavra continua válida como estilo, desde que a divulgação exista. Advogado valida o texto. |
| 6 Hype Zone, leilões, pontos na navegação principal | Apoio, e proponho mais: tirar Hype Zone e Leilões do menu principal e do `bottom-tab-bar` (hoje `highlight: true`), manter rotas acessíveis, e suspender qualquer texto de "caução/inspeção" até existir mecanismo. | Não move aquisição nem retenção do núcleo. O espaço de menu e a atenção valem mais para "Alerta de preço" e "Menor preço histórico". |

Divergência registrada: a auditoria sugere "até a comparação ser confiável"; eu fixo um critério mensurável de volta (seção 6, métrica 5), para não virar adiamento indefinido.

### 4.2 F-17 (painel de mercado da home)

Prioridade baixa de esforço, média de marca. Hoje são números de terceiros hardcoded que não fecham (US$ 92+51+43 = 186 contra 197 e 207). [recomendação] Em curto prazo, ou (a) mostrar um único total com edição e data do relatório e remover a divisão que não fecha, ou (b) remover o painel da home. Prefiro (b) ou mover para `/inteligencia-gamer`: a home deve levar à busca de preço; o painel não é dado nosso e consome espaço de um LCP já ruim (F-18). Se mantido, cada número cita o relatório e a edição; sem arredondar para fechar conta.

### 4.3 F-29 (sitemap)

Alto retorno, baixo esforço, mas com ordem: só publicar páginas de produto que passaram pelos filtros de F-01/F-02/cartela. [recomendação] `app/sitemap.ts` com produtos ativos elegíveis, notícias publicadas e rotas estáticas; `Sitemap:` em `robots.ts`; JSON-LD `Product` com `AggregateOffer` (faixa de preço real, nunca inventada) em `/ofertas/[slug]`; `lastmod` vindo da última coleta real. Sitemap em partes se passar de 50.000 URLs.

### 4.4 F-21 (cobertura de títulos obrigatórios)

Apoio, e é a ponte entre SEO e catálogo: quem busca "Zelda Tears of the Kingdom preço" é a intenção de compra mais valiosa. [recomendação] Lista curada de ~100 a 200 títulos por plataforma (top vendas e lançamentos), mantida pelo Gamer Veterano; o job apenas verifica se cada um tem master_product com oferta pública e abre alerta de cobertura no admin. Sem inserir produto sem oferta real. Atenção: ML bloqueia `/sites/MLB/search` (403, plano de expansão seção 2.2), então a fonte é `/products/search` por GTIN ou nome.

### 4.5 Prioridades que mais movem o negócio (ordem)

1. **Confiança do número** (F-01, F-02, F-08, F-11, F-13, F-14, F-15): sem isso, SEO traz tráfego que não confia e alerta que manda aviso errado. Sem negociação.
2. **Alerta por preço-alvo como produto central de retenção.** Já existe base boa. Passos: (a) CTA "Avisar quando chegar a R$ X" visível em cada página de produto e card; (b) alerta por evento além do digest diário (cron frequente só para watches com alvo atingido, reaproveitando `detect-price-drops.ts`); (c) mostrar contador real de quem acompanha o produto; (d) e-mail transacional com histórico curto. [hipótese] Retorno alto porque o concorrente brasileiro direto é Promobit/Zoom, que alertam por evento.
3. **SEO básico**: sitemap, JSON-LD, `Sitemap:` em robots, título/descrição por produto, e performance da home (F-18). Em paralelo ao item 1 para o que for técnico, publicação só depois dele.
4. **Veredito em linguagem natural e gráfico na página do produto** (F-09, lacuna seção 6): é o motivo de ser do site.
5. **F-21** cobertura obrigatória.
6. Divulgação de publicidade e LGPD do rosto (F-19): barato e elimina risco.
7. Instrumentar funil: visita, busca, página de produto, clique em "Ir à loja", criação de alerta, e-mail aberto, clique de volta. Sem isso, as metas abaixo não são medíveis.

### 4.6 O que NÃO fazer agora

- Não ativar expansão para tecnologia/eletro (plano `docs/plano-expansao-tecnologia-2026-10-31.md`) antes de "um produto, uma média" estar limpo nos games. Misturar TV com jogo destrói os indicadores globais (plano seção 1.1).
- Não implementar ADR 0003 completo agora; fazer só o mínimo: remover `convertPointsToDiscount` e o texto "100 XP = R$ 1,00" (o dono já decidiu). Gamificação sem comunidade ativa é ruído.
- Não adicionar novos módulos de comunidade, marketplace ou C2C.
- Não ligar WhatsApp automático.
- Não criar páginas programáticas em massa antes de F-01 e F-02.

## 5. Dado que falta

- Cliques em "Ir à loja" por página e por loja, e comissão estimada por clique (ML e Shopee). Hoje só temos cliques.
- Origem do tráfego atual (orgânico, direto, social). Não há analytics de aquisição no código.
- Quantos usuários têm watch ativo, quantos com preço-alvo, quantos alertas foram enviados e abertos (consulta a `affiliate_price_watches` e ao log do digest).
- Estado real dos crons `discover-products` e `import-shopee-conversions` em produção (pg_cron).
- Quantos dos títulos obrigatórios (F-21) estão cobertos hoje (lista não existe).
- Uso real de Hype Zone/leilões (sessões, ações). Se for zero, remover da navegação não tem custo.
- Texto exato dos termos de divulgação dos programas ML e Shopee Afiliados.

## 6. Métrica de sucesso

Metas numéricas só serão fixadas depois de medir a linha de base (dado que falta). Indicadores propostos:

1. Cliques em "Ir à loja" por 100 visitas a página de produto (norte de conversão).
2. Alertas ativos com preço-alvo por 100 usuários cadastrados e taxa de abertura/clique do alerta (retenção).
3. Sessões orgânicas e páginas indexadas via sitemap (aquisição); LCP da home p75 abaixo de 3 s (critério da auditoria: home abaixo de 3 s na primeira requisição).
4. Divergência de contadores entre telas = 0 e produtos duplicados na busca por cluster conhecido = 0 (testes de regressão da auditoria seção 8).
5. Critério para reentrada de Hype Zone e leilões no menu: itens 1 a 4 estáveis por 30 dias e evidência de uso orgânico.
6. Cobertura de títulos obrigatórios em % (alvo a definir após baseline).

Dependências: Estatístico (mediana, veredito), Especialista em Preços (oferta internacional, piso), Guardião do Catálogo (F-01/F-02), Engenheiro de Performance (F-18), Segurança/Jurídico (F-19, divulgação, leilões), Gamer Veterano (lista F-21).
