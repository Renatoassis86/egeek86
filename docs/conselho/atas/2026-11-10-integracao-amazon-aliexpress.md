# Ata do Conselho Geek: integrar Amazon Brasil e AliExpress como lojas coletadas

- **Data:** 2026-11-10
- **Porte:** médio (decisão de negócio e de conformidade; nenhuma escrita em produção nesta etapa)
- **Presidente:** geek-lead
- **Convocados:** integrador-apis (duas instâncias independentes: Amazon e AliExpress), engenheiro-coleta, especialista-precos, estrategista-mercado, qa-verificador. Pareceres independentes e em paralelo, só leitura e pesquisa web. Conselho consultivo; decisão de negócio é do dono.

## Briefing
- **Pedido do dono:** "vamos ver como fazemos a integração na Amazon e na AliExpress".
- **Estado atual (fato do código):** só Mercado Livre e Shopee coletam. `src/server/collector/sources/amazon.ts` e `aliexpress.ts` são stubs honestos (`operational: false`, lançam erro, nenhum preço simulado).
- **Regras em jogo:** coleta só por API oficial; zero dado fake; um jogo = um master = uma média por oferta-dia (ADR 0004); `findExistingMasterProduct` antes de cadastrar master; nunca `platform = 'unknown'`; cliente nunca vê "afiliado".
- **Calendário:** hoje 10/11; Black Friday 27/11 (17 dias).
- **Pergunta:** qual é o caminho oficial de cada loja, é viável agora ou para a Black Friday, o que depende do dono, e como entra na média sem distorcer.
- **Limite desta etapa:** pesquisa, pareceres e ata. Nenhum código, commit, deploy ou escrita em produção.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| integrador-apis (Amazon) | Depende de pré-requisito | Não prometer Amazon para a Black Friday; obter conta de Associados do Brasil com vendas qualificadas, perguntar por escrito sobre histórico/média e só então implementar sobre a Creators API, nunca sobre a PA-API | Painel brasileiro (locales, License Agreement, Program Policies, cotas reais); chamada real de teste |
| integrador-apis (AliExpress) | Depende de pré-requisito | Não construir agora; dono faz o cadastro no Portals/Open Platform e envia perguntas; só depois de chamada real de diagnóstico com resposta guardada o conselho decide | Resposta real de `product.query`/`productdetail.get` com BR/BRL; termos sobre preço e histórico |
| engenheiro-coleta | Amazon e AliExpress: depende de pré-requisito; AliExpress na média nacional: inviável sem decisão de negócio | Replicar o desenho Shopee por loja (coletor dedicado, pacer, collector_runs, kill-switch ligado por env, padrão desligado); Amazon primeiro; ~8 dias de código Amazon e ~9 AliExpress, mais credencial | GTIN preenchido nos masters; campos reais das APIs |
| especialista-precos | Amazon entra na média com marcação de composição; AliExpress só em série "importado" | Amazon: preço do Buy Box, vendedor identificado, preço de item sem frete; AliExpress fora da média nacional e fora de jogo físico | O que cada API devolve (lista de ofertas ou só vencedor), 1P/3P, moeda, imposto |
| estrategista-mercado | Nenhuma das duas para 27/11 | Black Friday com ML + Shopee declarando a cobertura; abrir já o cadastro Amazon em trilha paralela; ponto de decisão em ~20/11; AliExpress fica para depois | Termos oficiais da Amazon; status da conta do dono; comissão por categoria |
| qa-verificador | Condicional | Uma loja por vez, Amazon primeiro; flag desligada, coletor dedicado, ensaio de N=30 reais e SELECTs de conferência antes de ligar | Credenciais; termos; volume real de cobertura |

## Fatos pesquisados (fontes oficiais, acessadas em 2026-11-10 pelo integrador-apis)
**Amazon**
- PA-API 5.0 está descontinuada: chamadas devolvem HTTP 403 `AccessDeniedException` com a mensagem "Product Advertising API is deprecated. Please migrate to Creators API". Fonte: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation. A página oficial atual não traz data; fontes secundárias divergem (31/01, 30/04 e 15/05/2026).
- Sucessora: Creators API. Cadastro por Tools > Creators API > Create Application (Credential ID, Secret, Version), conta primária com aceitação final, máximo de 2 aplicações; chaves da PA-API não servem. Fonte: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction e `.../onboarding/register-for-creators-api`.
- Elegibilidade: a documentação oficial acessada diz "pelo menos 10 vendas qualificadas nos últimos 30 dias" (domínio .com).
- Cotas: início de no máximo 1 TPS e 8.640 por dia nos primeiros 30 dias; sobe com a receita enviada (+1 TPS, teto 10, a cada US$ 4.320 em 30 dias); acesso se perde após 30 dias seguidos sem venda qualificada e volta em até 2 dias. Fonte: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates.
- Operações: SearchItems, GetItems (até 10 ASINs por chamada), GetVariations. Fonte: `.../concepts/best-programming-practices`.
- Cache: guardar respostas "sob as diretrizes do License Agreement"; tabela de boas práticas indica TTL de 1 hora para Offers e 1 dia para os demais campos; proibido guardar dados de cliente.
- Links: o link rastreado vem pronto e não pode ser alterado. O Operating Agreement em português (cláusula 5) exige, em local claro e destacado, a frase "Como participante do Programa de Associados da Amazon, sou remunerado pelas compras qualificadas efetuadas". Fonte: https://associados.amazon.com.br/help/operating/agreement.
- Fonte secundária (espelho do Program Policies, não oficial): data e hora ao lado do preço quando a atualização é menos frequente que de hora em hora.

**AliExpress**
- Existe a Affiliate API oficial (métodos `aliexpress.affiliate.product.query`, `productdetail.get`, `hotproduct.query`, `link.generate`; `tracking_id` obrigatório). Pontos de entrada: https://portals.aliexpress.com e https://openservice.aliexpress.com/doc/api.htm. As páginas oficiais carregam por JavaScript/login e o texto não foi lido; os métodos e parâmetros foram confirmados só em fonte não oficial (SDK `ae_sdk` em unpkg, listagens de terceiros). Uma página antiga de ajuda do Portals indicava App Key, secretKey e teto de fluxo de 5.000 e aceitava BRL em `localCurrency`.
- Existe programa de afiliados do AliExpress no Brasil (por listagens de redes de terceiros; cookie divergente, 30 contra 3 dias).

## Não confirmado (marcado, não suposto)
1. Se amazon.com.br está na lista de locales da Creators API e qual a regra de vendas vigente no programa brasileiro (o dono pediu a regra de 180 dias; a documentação oficial acessada cita 10 vendas em 30 dias, no domínio .com).
2. Campos do OffersV2 da Creators API (Buy Box, vendedores, frete, parcelamento, estoque), existência de GTIN/EAN na resposta e teto de itens do SearchItems.
3. Texto do License Agreement e do Program Policies sobre guardar histórico próprio, exibir média multi-loja e cache além do TTL (a alegação de "24 horas" é só de blog).
4. Uso do nome e do logo "Amazon" e "AliExpress" na mídia.
5. AliExpress: acesso para conta brasileira, aprovação, QPS e cotas, esquema da resposta (preço original e promocional, moeda, imposto, frete, vendedor, estoque), `ship_to_country=BR`/`target_currency=BRL`, GTIN, cláusulas sobre histórico e cache. Nenhum termo oficial foi lido.
6. Os pareceres de engenheiro-coleta, especialista-precos, estrategista-mercado e qa-verificador não pesquisaram a web; o que dizem sobre as APIs é conhecimento geral e está subordinado aos fatos acima.

## Divergências e réplica (rodada 2)
Sem réplica formal: as divergências são de premissa e se resolvem pelos fatos pesquisados ou vão ao dono.
1. **API da Amazon.** engenheiro-coleta e o stub partem da PA-API 5.0; a pesquisa oficial mostra PA-API descontinuada (403) e Creators API como único caminho. Resolvido a favor da pesquisa. Consequência: o stub (variáveis `AMAZON_PA_API_*`, "30 dias") está desatualizado e só deve ser reescrito depois do acesso.
2. **Elegibilidade.** O pedido cita 180 dias de vendas qualificadas; a documentação oficial acessada cita 10 vendas em 30 dias. Aberto: depende de conferir o painel brasileiro.
3. **AliExpress na média.** especialista-precos e engenheiro-coleta recomendam série separada "importado" fora da média nacional; qa-verificador observa que isso conflita com "uma média só" e exige emenda de ADR; o conflito é com a promessa "todas as lojas que cobrimos". Vai ao dono (decisão 3).
4. **Quando entra a Amazon.** estrategista-mercado propõe um ponto de decisão em ~20/11; engenheiro-coleta e integrador-apis dizem que não há prazo viável sem conta e vendas. Convergem em não prometer 27/11; divergem só se vale reservar a janela. Presidente: reservar apenas se a conta e a credencial existirem até 17/11.
5. **Buy Box.** especialista-precos teme alternância 1P/3P gerando eventos de menor preço falsos; engenheiro-coleta propõe gravar o preço do Buy Box sem frete. Compatível, desde que cada cotação guarde o tipo de vendedor.

## Veredito por loja
| Loja | Veredito | Por quê |
|---|---|---|
| Amazon Brasil | **Depende de pré-requisito** | Caminho técnico claro (Creators API, ASIN estável, preço em BRL), mas exige conta de Associados do Brasil aprovada, vendas qualificadas, credencial e leitura dos termos sobre histórico. Não entra na Black Friday de 27/11. |
| AliExpress | **Depende de pré-requisito, e com decisão de negócio pendente** | Affiliate API existe, mas nada oficial sobre campos, limites e termos foi lido; preço de importação não é comparável ao nacional e o catálogo de jogo físico é de alto risco. Para jogos: não vale o esforço. Possível só para acessórios e periféricos, depois da Amazon. |
| Nenhuma é inviável | | A inviabilidade só aparece se os termos proibirem guardar histórico; hoje isso é desconhecido, não confirmado. |

## Decisão (plano em ordem)
Plano proposto; nada executado. Responsáveis entre parênteses.
1. **Esta semana, sem código (dono + integrador-apis):** o dono cadastra/confirma a conta de Associados e a conta do AliExpress Portals e envia as perguntas por escrito (itens abaixo). Presidente prepara o texto das perguntas em `docs/perguntas-amazon-aliexpress-2026-11-10.md` na próxima etapa autorizada, no mesmo molde das perguntas à Shopee.
2. **Black Friday (estrategista-mercado + frontend):** declarar só as lojas com oferta fresca (ML e Shopee). Antes de qualquer menção pública a Amazon/AliExpress, limpar cupons e números fixos classificados como dado fake e o texto de privacidade/termos que já cita "Amazon, Magalu" como parceiras.
3. **Ponto de decisão em 17/11 (geek-lead):** se a conta e a credencial Creators API existirem e a resposta sobre histórico for favorável, abrir ata de implementação da Amazon; senão, Amazon fica para depois da Black Friday.
4. **Diagnóstico antes de desenho (integrador-apis):** com credencial, uma chamada real `GetItems` com ASIN de jogo, resposta guardada, para fixar campos, GTIN, Buy Box e vendedores. Só então reescrever o stub.
5. **Implementação Amazon (engenheiro-coleta, ~8 dias de código), só após o item 4:**
   - Coletor dedicado `collect-amazon-prices.ts` e `discover-amazon-products.ts` (modelo Shopee), pacer genérico extraído de `shopee-pacing.ts`, `startCollectorRun`, rota e cron próprios.
   - Kill-switch `COLLECT_AMAZON_ENABLED` (padrão desligado), além da ausência de credencial.
   - Identidade: `external_ref = 'amazon-<ASIN>'`; ligação ao master por GTIN quando houver, senão `findExistingMasterProduct`; sem plataforma identificável, descarta (nunca `unknown`). Exigir mínimo de 3 referências antes de uma oferta virar menor preço público (a guarda 0,35x a 3x só age com 2 ou mais).
   - Gravar `source = 'api'`, preço BRL do Buy Box sem frete, tipo de vendedor 1P/3P na cotação, data/hora da coleta visível ao lado do preço; cache respeitando o TTL de 1 hora para ofertas.
   - Seed `ensureAmazonNetwork`, `slo.ts`, tipos de relatório de comissão e demais pontos que assumem só ML/Shopee (lista do qa-verificador).
6. **Ensaio e liberação gradual (qa-verificador):** dry-run, 30 ofertas reais com 10 conferidas à mão contra a loja, SELECTs de conferência, SLO verde por 72 h, backup NDJSON e reversão por `quarantined_at`/`status`.
7. **AliExpress (depois da Amazon estável):** só com credencial, termos lidos e decisão 3. Piloto de 50 itens, sem cron, medindo % com preço em BRL com imposto declarado e sem master duplicado. Esforço de código ~9 dias, mais coluna de origem e filtro de média (~1,5 dia).

**Fica de fora:** scraping ou agregador como atalho; câmbio fixo ou estimativa de imposto própria (seria dado sintético); jogo físico no AliExpress; qualquer promessa pública antes de haver oferta coletada; tabelas paralelas.
**Vetos do qa-verificador a respeitar:** scraping disfarçado; gravar preço sem moeda BRL explícita; criar master sem `findExistingMasterProduct`; ligar sem resposta do dono sobre termos, marca e histórico; entrar na média pública sem guarda e sem ensaio aprovado.
**Pendência fora do escopo, achada pelo QA:** a palavra "afiliado" aparece em `entrar/page.tsx` (papel) e em `sobre/page.tsx` (id e nome de imagem); verificar se é visível ao cliente.

## O que o dono precisa fazer manualmente
1. Conferir no painel brasileiro de Associados Amazon (afiliados.amazon.com.br) se a conta está com aceitação final, quantas vendas qualificadas tem e qual a regra vigente (10 em 30 dias ou 180 dias).
2. Se a conta estiver apta: criar a aplicação em Creators API (Create Application) e guardar Credential ID e Secret só no cofre da Vercel (Sensitive); nunca em chat ou arquivo.
3. Ler no painel o License Agreement e o Program Policies e enviar à Amazon a pergunta escrita: pode guardar histórico próprio e exibir média multi-loja; cache além do TTL; uso do nome/logo; texto de divulgação exigido.
4. Cadastrar o domínio do site no AliExpress Portals, pedir acesso à Affiliate API na Open Platform (App Key, Secret, `tracking_id`) e enviar as perguntas: histórico/média públicos, nome/logo, QPS, cache, imposto e BRL no Brasil.
5. Responder as decisões abaixo, uma por vez.

## Decisões que cabem ao dono (uma por vez, com recomendação)
1. **Black Friday: aceitar ML + Shopee como cobertura declarada, sem Amazon nem AliExpress em 27/11?** Recomendação: sim. Nenhum parecer vê prazo realista, e prometer loja sem oferta fere "sem dado fake" e a reputação.
2. **Amazon, se os termos proibirem histórico próprio: ficar fora da média ou exibir só o preço atual com horário?** Recomendação: ficar fora da média e do histórico, só mostrar preço atual com horário se os termos permitirem; manter "uma média só" honesta. Decidir depois da resposta da Amazon.
3. **AliExpress: fora da média nacional, em série própria "Importado", só acessórios e periféricos, nunca jogo físico?** Recomendação: sim; exige emenda de ADR sobre "todas as lojas".
4. **Texto de divulgação junto ao botão** (já pendente desde a ata de hoje): "Podemos receber comissão se você comprar" no site e, para a Amazon, a frase da cláusula 5 do Operating Agreement. Recomendação: aprovar os dois, sem a palavra "afiliado", com revisão jurídica.
5. **Janela de decisão em 17/11 (go/no-go da Amazon para antes da Black Friday).** Recomendação: só ir se conta, credencial e resposta sobre histórico existirem até lá; caso contrário, adiar para dezembro.

- Decisão do responsável do projeto: **pendente**

## Métrica de sucesso
- **Imediata (até 17/11):** conta Amazon apta confirmada ou não; perguntas enviadas às duas lojas; resposta sobre histórico registrada.
- **Black Friday:** 0 menções públicas a loja sem oferta ativa fresca (< 6 h); 0 cupom ou número fixo sem origem no banco.
- **Por loja, depois de no ar (piloto de 72 h):** 0 duplicatas de master por ASIN/ID; 0 oferta com `currency <> 'BRL'`; 0 `platform = 'unknown'` novo; 0 oferta fora de 0,35x a 3x sem quarentena; SLO verde; 15 de 15 conferências manuais batendo; 0 evento de menor preço sem vendedor identificado; `composition_flag` e quebra de série documentadas com data de corte; 0 "afiliado" e 0 imagem repetida no HTML público.
- **AliExpress piloto:** 100% das ofertas com preço BRL e imposto declarado pela API, 0 jogo físico na base.

## Execução e verificação
- Executores futuros: engenheiro-coleta, integrador-apis, guardiao-catalogo (revisão do uso de GTIN), engenheiro-frontend (rótulos/badges), seguranca-db (segredos e rotas cron).
- QA desta etapa: apenas leitura; nenhuma alteração de código, banco ou produção. Verificações de código citadas vêm dos pareceres (arquivo:linha) e devem ser reconferidas no ensaio. A contagem de testes do qa-verificador (1 arquivo achado) diverge da ata anterior (20 PASS / 152/152); reconciliar antes de usar como linha de base.

## Retrospectiva
Preencher após o ponto de decisão de 17/11 e após o piloto de cada loja.

## Decisões do dono posteriores (2026-11-10)
- **Amazon por raspagem assistida (decisão do dono, contra a recomendação do inventário).** O dono escolheu "raspagem completa": entrar na conta de Associados, buscar promoções e preços de itens do portfólio e trazer produtos com o link de associado dele, até a conta ter vendas suficientes para a Creators API.
- **Riscos informados antes da decisão (inventário `docs/inventario-lojas/amazon.md`):** a Licença de PI exclui robôs e extração de dados e limita cache de preço a 24 h (1(h)); Requisitos 2(b) só permitem exibir preço vindo da API ou de link da Amazon; 6(y) proíbe rastreio e alerta de preço sem aprovação; 6(z) proíbe misturar com outros varejistas; a cláusula 5 exige o aviso de remuneração. Violação material permite suspensão imediata e retenção de comissões, e a conta suspensa perde o caminho da API.
- **Esta decisão emenda a regra de 2026-10-28 (coleta só por API oficial) para a Amazon.** Condições aplicadas pela execução: dono logado e presente; ritmo lento e com teto por rodada; sem burlar CAPTCHA nem verificação (parar e avisar); sem cron e sem rodada escondida; piloto pequeno antes de escalar; resultados do piloto em arquivo local, sem escrita no banco até o dono aprovar; cada preço com origem "assistida", horário e URL; nada de dado fake; checagem de duplicata antes de qualquer master; kill-switch desligado por padrão. Registrar como emenda de ADR antes de qualquer código.
- **Automação de 2 em 2 horas (decisão do dono, "Autorizo tudo", 2026-11-10).** A aba logada do dono em www.amazon.com.br é o agendador: a cada 2 horas busca a fila em `GET /api/ingest/amazon-assistida`, lê as buscas da Amazon em ritmo lento (4 a 7,5 s) e envia os resultados por `POST` na mesma rota. A rota (token dedicado `AMAZON_INGEST_TOKEN`, Sensitive na Vercel; CORS só para amazon.com.br; sem token = 503 = kill-switch) aplica o casamento e grava ofertas, links com o tag do dono e snapshots `source=scrape`; cada lote vira uma linha em `collector_runs` (job `amazon-assistida`). Implementação: `src/server/collector/amazon-assisted.ts`.
- **Limites aceitos pelo dono:** depende do computador ligado e da aba aberta e logada; cobertura em rodízio (~1.000 produtos por rodada de 2 h, portfólio completo em ~6 h); alarme se não chegar nada por mais de 3 h; parada automática em captcha ou status diferente de 200.
- **Riscos aceitos (maior exposição até agora):** a coleta automática e contínua é a conduta que a Licença de PI da Amazon exclui (robôs, extração, cache de preço limitado a 24 h); suspensão da conta e retenção de comissões são possíveis. O carimbo de data e hora do preço (Licença de PI) foi adicionado à tabela de lojas e à página da oferta; o texto exato do aviso de isenção exigido pelo contrato não foi lido na íntegra e deve ser conferido.
- **Mercado Livre e Shopee** continuam a cada 5 minutos, 24 horas, sem depender do computador do dono.
