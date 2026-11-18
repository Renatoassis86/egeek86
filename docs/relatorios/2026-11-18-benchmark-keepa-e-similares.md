# Benchmark: Keepa e ferramentas similares x Espaço Geek 86 (2026-11-18)

Escrito para: o dono do Espaço Geek 86 (decisão de arquitetura e prioridades).
Método: 3 rodadas de pesquisa na web (documentação de bibliotecas, análise técnica independente da extensão, artigos de design de sistemas, comparativos) e medição do nosso banco e do nosso código em produção. **Nenhuma fonte é a documentação oficial interna da Keepa** (o site oficial é uma aplicação de página única que a pesquisa não conseguiu ler). Cada achado leva um nível de confiança: **[A]** confirmado em código/fonte técnica, **[B]** vários artigos concordam, **[C]** um só artigo ou promocional (não confiar sem testar).

## 1. Resumo (o que importa)
1. **A Keepa não é só um crawler: a extensão do navegador é parte da coleta.** Análise técnica independente [A] mostra a extensão com conexão permanente (WebSocket) e **o servidor mandando a extensão carregar páginas da Amazon em segundo plano** e extrair preços, vendedores e disponibilidade com regras (CSS/regex) que o servidor atualiza. Ou seja, a base de preços é alimentada pelos navegadores dos usuários. Nós dependemos de **um** navegador (o seu) e a Amazon fica com ~40 leituras/hora.
2. **O formato de dados deles é simples e compacto** [A]: 36 séries por produto (Amazon, novo, usado, ranking de vendas, preço de tabela, Buy Box, contagem de ofertas, nota, avaliações...), cada série é um vetor plano `[tempo, valor, tempo, valor, ...]`, tempo em **minutos** desde uma época própria, preço em centavos inteiros e `-1` = sem oferta. Só se grava quando algo muda.
3. **O agendamento é a arquitetura** (desenho típico, [B]): produto com mais interesse é lido em minutos, o resto em dias; fila com prioridade por pontuação, controle de taxa por domínio e proxy. Nós lemos por idade da última leitura, sem noção de valor.
4. **Onde já somos iguais ou melhores:** gravamos mudança + batimento (como o armazenamento por mudança deles), agregamos por oferta-dia, **comparamos várias lojas por produto (eles são Amazon-primeiro)**, temos porteiro de qualidade (isca, plausibilidade, identidade) e distribuição por Telegram e site.
5. **Onde eles nos ensinam:** (a) coleta distribuída por extensão, (b) agendamento por valor, (c) fila e limite de taxa fora do banco, (d) armazenamento de série mais barato, (e) extratores duplos e monitor de regras, (f) alertas por usuário com preço-alvo e (g) a extensão como canal de distribuição e de dados. Detalhe na seção 5 e roteiro na seção 6.

## 2. Keepa por dentro (engenharia reversa a partir de fontes)
### 2.1 Modelo de dados [A]
- Objeto de produto com `csv`: matriz onde o primeiro índice escolhe a série. Índices confirmados no código da biblioteca oficial em Java: 0 Amazon, 1 novo, 2 usado, 3 **ranking de vendas**, 4 preço de tabela, 5 colecionável, 6 recondicionado, 7 novo FBM com frete, 8 oferta relâmpago, 9 armazém, 10 novo FBA, 11 a 14 contagens de ofertas, 15 atualizações de informação extra, 16 nota, 17 avaliações, 18 Buy Box com frete, 19 a 27 usado/colecionável por estado, 28 e 29 eBay, 30 trade-in, 31 aluguel, 32 Buy Box usado, 33 exclusivo Prime, 34 e 35 contagem FBA/FBM. Séries "com frete" guardam três valores por ponto: tempo, preço, frete.
- Tempo em **minutos Keepa** (época própria; conversão publicada por terceiros: `(keepaTime + 21564000) * 60` para segundos Unix) [B]. Preço em centavos inteiros. **`-1` = sem oferta (fora de estoque)** [A].
- A série é descontínua e se desenha em degraus: o valor vale até o próximo ponto. Isso é armazenamento **por mudança** (a documentação diz "descontínua"; a regra de só gravar quando muda é a leitura natural, não está escrita) [B].
- Estatísticas calculadas no servidor (atual, mínimo e máximo no intervalo, médias) pedidas por parâmetro `stats` [A].
### 2.2 API e economia de tokens [B/C]
- Cobrança por **balde de tokens** que se enche por minuto conforme o plano; token não usado expira em 60 min; **1 token por produto**; busca e listas custam mais (10 e 50 por página, segundo um guia). Plano de entrada citado a €49/mês com 20 tokens/min; faixas maiores até milhares de tokens/min (valores variam entre fontes: não confiar sem conferir no site oficial). Sem API gratuita. Assinatura do painel (Pro) é separada da API.
- Biblioteca oficial assíncrona e em paralelo, com chamadas por "promessa" (`done/fail`). O cliente Python espera por tokens por padrão.
### 2.3 Coleta [A/B]
- **Extensão (Manifest, conteúdo + página de fundo):** análise independente da extensão mostra WebSocket para `dyn.keepa.com`, mensagens JSON só comprimidas (deflate), identificador persistente do usuário, envio de domínio + ASIN + nota/avaliações a cada página vista, **regras de extração (`scrapeFilters`) vindas do servidor** e **carregamento de páginas da Amazon em segundo plano por ordem do servidor** (XHR ou quadros ocultos), lendo vendedor, preço e disponibilidade. Comentários relatam coletas cerca de 4 vezes por hora ainda em 2025 [C]. Isso é crowdsourcing ativo, não só passivo.
- Crawlers próprios no servidor e proxies existem, mas **não há documentação confiável** de volume, proxies ou frequência (fontes divergem: de 2 a 4 vezes ao dia a de hora em hora [C]).
- **Lição de risco:** a mesma análise criticou a política de privacidade (identificador persistente, coleta além do declarado) e a execução de scripts guiada pelo servidor. É o custo de reputação de uma extensão que coleta.
### 2.3 Produto
- Gráficos injetados na página do produto, alertas de preço-alvo, lista de **ofertas (deals)** com maiores quedas, **Product Finder** (filtro por categoria, preço, ranking, avaliações, histórico), histórico de **ranking de vendas** e uma estimativa de vendas mensais que é só uma faixa publicada pela Amazon (a maioria dos produtos nem tem) [B].
- Modelo de negócio: assinatura do painel e API paga; o grátis é a vitrine.

## 3. Ferramentas similares
| Ferramenta | Como obtém dados | Frequência | O que oferece | Fraquezas | Confiança |
|---|---|---|---|---|---|
| CamelCamelCamel | API de anúncios da Amazon (PA-API) segundo a entrevista do fundador; um concorrente diz páginas públicas | diária, atraso em itens pouco populares | histórico, alerta, extensão Camelizer; ganha comissão de afiliado | depende de API que a Amazon restringe: lacunas no histórico; sem ranking de vendas | B/C |
| Buscapé e Zoom (grupo único) | não documentado (lojas parceiras e rastreio) | histórico de 40 dias a 1 ano | comparação entre lojas, alerta de preço, aplicativo e extensão | pouca transparência de metodologia | B |
| Promobit e Pelando | **mistura comunitária e automática**: usuários postam e votam, rastreio automático de alguns itens | contínuo pela comunidade | oferta com voto, cupom, alerta por termo | qualidade depende da moderação; histórico só de alguns produtos | B |
| Honey (PayPal) | extensão com coleta de navegação e acordos de afiliado | contínuo | cupom automático e histórico | controvérsia de privacidade e de troca de cookie de afiliado (acusações de 2025, não verificadas) | B/C |
| Jungle Scout e Helium 10 | extensão e dados próprios; **estimam vendas por ranking** | contínuo | vendas estimadas, palavras-chave | cada fabricante diz ser mais preciso; sem teste independente | C |
| Desenho genérico de serviço de preços (artigo de design) | raspagem com **JSON-LD primeiro**, regras CSS/XPath de reserva, navegador sem tela só quando falta | quente 1 h, morno 1 dia, frio 7 dias | fila de prioridade em Redis, balde de tokens por domínio+proxy, **dois extratores que precisam concordar**, conjunto-canário por varejista, Timescale com compressão, Kafka para alertas, **amostragem decrescente** (bruto 30 dias, hora 30 a 365, dia 1 a 2 anos) | proxy domina o custo ao crescer; regra de extração que desvia vira "queda para R$ 0" | B |

## 4. O que nós já temos (medido em produção, 2026-11-18)
- **Catálogo:** 14.828 produtos mestres e 53.298 ofertas; **30.456 ofertas ativas no Mercado Livre, 7.258 na Shopee, 2.992 na Amazon**.
- **Frescor:** Mercado Livre 97,5% lido em 24 h (16.587 na última hora); Shopee 100% em 24 h; **Amazon 64 em 24 h (2%) e 40 na última hora**.
- **Gravação por mudança:** `affiliate_price_snapshots` já tem tipo de registro (`primeira`, `mudanca`, `batimento`): em 24 h foram 38.480 linhas (5.580 primeiras, 3.046 mudanças, 29.853 batimentos). É o mesmo princípio do armazenamento por mudança com batimento de confirmação.
- **Agregação:** `price_daily_offer` (319 mil linhas) e `price_daily_state` (102 mil) guardam o mínimo por oferta-dia e o estado do produto por dia (a nossa "amostragem decrescente").
- **Custo de armazenamento:** 689 MB para 84 mil linhas de snapshot (**cerca de 8 KB por linha**, muito mais que um par tempo-valor).
- **Qualidade:** porteiro do catálogo, identidade por GTIN e atributos, piso de plausibilidade, preço-isca em quarentena, vendedor fraco, link de afiliado auditado antes de enviar, revalidação ao vivo antes de postar.
- **Distribuição:** 8 canais de Telegram (um por loja), site com vitrines e "Compare preços", vitrine de jogos até R$ 200. **Integração com a Keepa existe, dormente** (só valida preço da Amazon, não escreve).

## 5. Comparação: o que fazemos igual, onde somos melhores e onde eles nos ensinam
### 5.1 Igual ou equivalente
- Série por mudança com batimento; estado diário agregado; veredito contra a média com histórico mínimo (5 cotações e 14 dias, R-91); alerta por evento de preço; fila e coleta com recuo em 429.
### 5.2 Onde somos melhores (ou diferentes de propósito)
1. **Comparação entre lojas do mesmo produto** (Mercado Livre, Shopee, Amazon) com identidade por GTIN: a Keepa e a CamelCamelCamel são Amazon-primeiro.
2. **Fontes oficiais onde existem** (API do Mercado Livre e da Shopee) em vez de raspagem: sem proxy, sem bloqueio, 97 a 100% de frescor.
3. **Regras de qualidade explícitas e auditáveis** (isca, identidade, só produto novo, vendedor, link de afiliado) e honestidade de método (sem laudo com pouca base).
4. **Distribuição ativa** em canais de Telegram por loja, com cartões, vitrines e rodízio; eles são ferramentas passivas.
### 5.3 Onde eles poderiam melhorar o nosso desenvolvimento (lacunas)
| # | Lacuna nossa | Como eles fazem | Impacto | Esforço |
|---|---|---|---|---|
| 1 | **Coleta da Amazon depende de uma aba de um navegador** (40 leituras/h; aba congela, Chrome troca a aba) | extensão distribuída + servidor ordena páginas em segundo plano | Amazon de 2% para cobertura útil; fim do ponto único de falha | alto (e exige transparência e LGPD) |
| 2 | **Agendamento por idade, sem valor** | pontuação por interesse (seguidores, cliques, vendas, queda recente); quente/morno/frio | mesmas leituras, mais resultado nos produtos que importam | médio |
| 3 | **Fila no banco** (coletores competem pelo Postgres: ciclos de 60 a 118 s, conexões órfãs, `Failed query`) | fila de prioridade e balde de tokens em Redis, fora do banco | tira a causa de boa parte da lentidão do envio e dos coletores | médio |
| 4 | **Snapshot caro** (~8 KB por linha) | vetor plano de pares tempo-valor em minutos inteiros; hipertabela comprimida | armazenamento e consulta de gráfico 10x menores | médio |
| 5 | **Extração com um só leitor por rede** (erro da Amazon de R$ 8.499 x R$ 9.499, #120) | JSON-LD primeiro, **dois extratores que concordam**, conjunto-canário, quarentena de leitura nula | menos mensagem errada, alarme de regra que desvia | médio |
| 6 | **Sem alerta por usuário** (o Telegram é difusão) | preço-alvo por usuário, fila de eventos, idempotência (watch, instante), limite por usuário | principal motor de retenção e de dado de interesse (alimenta o item 2) | médio |
| 7 | **Sem sinal de demanda** na priorização ("principais produtos") | ranking de vendas como série própria; estimativa por faixa | rodízio e vitrine por demanda real (o ML expõe vendidos: `sold_quantity`) | baixo |
| 8 | **Sem extensão nem canal na página da loja** | gráfico injetado + alerta + coleta | distribuição, retenção e dado | alto |
| 9 | **Sem API pública com cota** | balde de tokens por plano | receita B2B e uso do nosso dado | médio |
| 10 | **Sem monitor de "regras de extração desviando"** | canário por varejista a cada deploy e por hora | detecta queda falsa antes de postar | baixo |
### 5.4 Riscos que a Keepa mostra (para não repetir)
- Extensão que coleta navegação e executa instruções do servidor virou caso público de privacidade: se fizermos extensão, **consentimento claro, dado mínimo, sem identificador persistente, sem execução remota de código e sem tocar em cookie de afiliado** (a controvérsia da Honey).
- Plataformas bloqueiam raspagem (TLS, CAPTCHA, proxy): a Amazon é o caso difícil; o caminho sustentável é **API oficial ou provedor pago** (Keepa) e não raspagem em massa.
- Histórico com lacuna quando a API da loja é restringida (CamelCamelCamel): guardar o tempo da última leitura separado do histórico, como já fazemos (`last_checked_at`).

## 6. Roteiro sugerido (ordem de custo-benefício)
1. **Já, baixo esforço:** (7) usar vendidos do Mercado Livre como sinal de demanda no rodízio e nas vitrines; (10) conjunto-canário de leitores (Amazon, ML, Shopee) rodando por hora e no portão; **(5) segundo extrator para a Amazon** (valor da página x JSON da página).
2. **Médio:** (2) pontuação por valor no agendamento (cliques do `/go`, envio nas últimas 72 h, queda recente, vendidos) com tiers quente/morno/frio; (3) tirar fila e limite de taxa do Postgres para Redis; (4) série compacta e retenção em camadas (bruto 30 dias, hora até 1 ano, dia depois).
3. **Alerta por usuário (6)** pelo bot do Telegram (`/alerta`, preço-alvo): dá dado de interesse real para o agendamento e engajamento.
4. **Amazon (1):** assinar a Keepa como fonte de preço (a decisão do dono já pedida às 9h) **e**, só depois, avaliar uma extensão opt-in com todas as salvaguardas acima.
5. **Longo prazo:** extensão com gráfico e alerta nas páginas de ML, Shopee e Amazon; API pública com cota.

Métricas de sucesso (medir em 24 h e 7 dias): cobertura da Amazon (meta de 20% em 24 h), leituras por hora por loop, tempo médio do ciclo de mensagens, linhas e bytes de histórico por oferta, mensagens com preço divergente da página (meta: zero), alertas por usuário entregues em menos de 60 s.

## 7. Limites desta pesquisa
- Nenhuma fonte primária interna da Keepa; planos e preços variam entre artigos; números de frequência e de falsos positivos de alerta são de blogs concorrentes ou promocionais [C].
- A análise da extensão é de 2021 com comentários até 2025; a versão atual pode ter mudado.
- Próximas rodadas úteis: teste lado a lado de 20 produtos (nossa leitura x gráfico da Keepa) para medir atraso e divergência, e leitura do contrato oficial da API (aba "Product object" no site da Keepa) com sua conta.

## 8. Fontes
- Keepa, biblioteca oficial em Java (`CsvType`, `-1` sem oferta): github.com/keepacom/api_backend
- Biblioteca Python da Keepa e histórico de produto: keepaapi.readthedocs.io
- Análise técnica independente da extensão: palant.info/2021/08/02/data-exfiltration-in-keepa-price-tracker
- Guia de API e tokens: nexscope.ai/blog/keepa-api-guide; planos: revenuegeeks.com/keepa-pricing
- Entrevista do fundador da CamelCamelCamel (PA-API): softwareengineeringdaily.com/2019/05/24/camelcamelcamel-amazon-price-tracker-with-daniel-green
- Desenho de serviço de preços (agendamento, tiers, armazenamento, alertas): handbook-hld.pages.dev/curriculum/case-studies/price-tracking
- Agendamento inteligente de raspagem: dev.to/sommic/smart-scheduling-how-to-optimize-competitor-price-scraping-to-reduce-costs-19k
- Buscapé e Zoom (histórico e alertas): buscape.com.br; Promobit e Pelando: comparativos em showmetech.com.br
- Honey (coleta e afiliados): 9to5google.com/2025/12/22/honey-user-data-practices-reports
- Jungle Scout e Helium 10 (estimativas): helium10.com/blog/helium-10-jungle-scout-amazon-sales-data-accuracy
