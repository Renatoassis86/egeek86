# Cobertura total: diagnóstico medido (2026-11-16)

Pedido do dono (16/11): "Existem vários produtos que não estamos monitorando. O que estamos fazendo de errado que não trazemos todos os produtos que as plataformas permitem para cada área? Resolver de uma vez por todas e já dar escalabilidade."

Método: somente leitura. Banco por SELECT; Mercado Livre pela API oficial com o token do sistema (lido do banco, nunca impresso), ~230 chamadas em 16/11 com pausa de 350 a 450 ms, sem 429; Amazon e Shopee sem chamada nova (ver seção 2). Rótulos: **[medido]** número obtido hoje; **[código]** lido no repositório; **[estimado]** extrapolação com a conta mostrada; **[não medido]** com o motivo.
Reproduzível: `scripts/medir-cobertura-areas.ts` (banco) e `scripts/descobrir-por-arvore.ts` (dry-run). Saídas: `medicao-areas-2026-11-16.json` e `dry-run-casa-2026-11-16.json` nesta pasta.

## Resposta curta

Não estamos errando no filtro. Estamos **descobrindo pelo método errado e parando cedo**: a descoberta é por palpite de termos ("tipo + marca") dentro de um teto de 150 a 200 resultados por consulta, e o servidor só semeia 1 dos 6 departamentos. Resultado medido: dos 412 produtos mais vendidos das 30 maiores categorias da Casa no ML, **2 estão no banco (0,5%)**. Eletrônicos 2,3%, Tecnologia 0%, Esporte 0%. Até Games, a área mais cuidada, só tem 36%. O que entra é filtrado corretamente; o que falta é o que nunca foi apresentado ao filtro.

## 1. O que cada plataforma permite

### 1.1 Mercado Livre [medido ao vivo, 16/11]
| Recurso | Resultado | Uso |
|---|---|---|
| `/sites/MLB/categories`, `/categories/{id}` | 200. Árvore completa com `total_items_in_this_category` (ex.: Informática 4,1 mi, Eletrodomésticos 3,0 mi, Esportes 6,2 mi, Livros 7,5 mi anúncios; Televisores 10,4 mil, Geladeiras 8,9 mil) | universo por categoria e lista de folhas |
| `/highlights/MLB/category/{id}` | 200. **20 mais vendidos** por categoria (`PRODUCT` = id de catálogo; `ITEM` = anúncio livre). Em domínio (`/highlights/.../domain/`): 404 | fonte de descoberta por demanda |
| `/trends/MLB/{id}` | 200. 50 palavras em alta por categoria | termos por demanda em vez de palpite |
| `/products/search` | **exige** `q`, `product_identifier`, `parent_product_id` ou `attributes` (sem navegação por categoria/domínio, 400). `status=active` ajuda: sem ele só 2% dos resultados estavam ativos. **`offset` máximo 100** (HTTP 400 acima) e **`limit` máximo 100**: uma consulta alcança **no máximo 200 catálogos** (150 com limit 50). `paging.total` trava em 10.000. `search_after` com o `paging.last` devolvido **não avança** (repete a página) | busca por termo |
| `attributes=BRAND:...`, `BRAND=...` | ignorados (400 de "campo obrigatório"): sintaxe do filtro por atributo **não confirmada** | [não medido] |
| `/sites/MLB/search`, `/items/{id}` de terceiros | 403 (restritos) | fora |
| `/catalog_domains/{domain}` | 200, metadados do domínio | confirma domínio |
| `/products/{id}/items` | 200 com vendedores, ou 404 "No winners found" | funil atual |

Consequência direta: o desenho atual (`MAX_SEARCH_PAGES = 20`, "20 páginas de 50 = offset 1000") **nunca foi alcançável**. A partir da 3ª página o ML responde 400, o termo é marcado esgotado (`erro_http_400` casa com `DEAD_STOP`) e o ciclo recomeça do topo. Depois de 3 passadas cada termo só relê os mesmos 150 resultados: **não há descoberta nova por construção**.

### 1.2 Amazon [código; não medido ao vivo]
Único caminho legítimo: leitor assistido na aba logada do dono (`public/loops/amazon-assistida.js`): busca `/s?k=` do HTML, lote de até 40 linhas por POST, pausa de 4 a 9 s entre itens, ciclo de 120 min, RAM baixa do Chrome. A fila parte de **masters existentes** (modos `refresh` e `discover` buscam o texto do master). Não há leitura de nós de navegação, "mais vendidos" nem "lançamentos". Medição ao vivo exigiria operar a aba logada (autorização de leitura existe; não foi feita nesta rodada para não competir com o loop por RAM). Estado no banco: 2.895 ofertas ativas (414 conferidas nas últimas 24 h); 2.242 execuções do loop em 72 h; 10 buscas por lote, em amostra: 22 patrocinados e 14 "cobertura baixa" descartados para 6 aceitos.

### 1.3 Shopee [código + cursor no banco; não medido ao vivo]
API oficial de afiliados `productOfferV2` por `productCatId` (50 itens por página, mais vendidos primeiro). O cursor em `system_config` (`cobertura_shopee_cursor`) tem **11 categorias, todas da loja games**; cada uma avança até a página 5 a 32 e para por `System Error 10000` do servidor da Shopee (1 a 8 falhas por categoria). Lojas Plus (Casa, Esporte, Eletrônicos...) não têm categoria no cursor; entram só por `discover-shopee-esporte` (35 masters em 3 dias).

## 2. O que temos [medido no banco, 16/11]

Ofertas ativas por departamento e rede, masters aprovados e cobertura dos mais vendidos do ML (3 categorias de nível 1 por área; Casa com as 30 maiores):

| Departamento | ML | Amazon | Shopee | Masters aprovados | Masters sem oferta ativa | Tipos com < 30 masters aprovados | Mais vendidos do ML já no banco |
|---|---|---|---|---|---|---|---|
| Casa (eletrodomésticos) | 1.755 | 415 | 13 | 827 | 263 | 33 de 34 | **2 de 412 (0,5%)** (nível 2); 0 de 56 (nível 1) |
| Eletrônicos | 7.613 | 377 | 1 | 1.398 | 98 | 5 de 18 | 1 de 44 (2,3%) |
| Tecnologia | 2.734 | 399 | 0 | 962 | 111 | 41 de 51 | 0 de 50 |
| Esporte | 1.205 | 336 | 153 | 894 | 349 | 43 de 46 | 0 de 36 |
| Livros | 2.591 | 157 | 0 | 252 | 3 | 0 de 1 | 0 de 19 (categoria raiz) |
| Impressão 3D | 1.598 | 194 | 27 | 171 | 3 | 5 de 7 | sem categoria ML configurada |
| Games | 9.040 | 1.017 | 4.106 | 4.288 | 2.412 | n/a | 13 de 36 (36%) |
| **Total** | **26.536** | **2.895** | **4.300** | | | | |

Masters aprovados que têm oferta ativa na Amazon: Casa 377 de 827 (46%), Eletrônicos 290 de 1.398 (21%), Tecnologia 329 de 962 (34%), Esporte 272 de 894 (30%), Games 698 de 4.288 (16%).
Profundidade por tipo na Casa (masters, todos os vereditos): air fryer 131, geladeira 20, fogão 15, cooktop 15, robô aspirador 12, cadeirinha 11, micro-ondas 7, liquidificador 5, cafeteira 5, aspirador de pó 2, máquina de lavar 0. O ML tem milhares de anúncios de cada um (Geladeiras 8,9 mil anúncios, Máquinas de Lavar 7,7 mil).
Masters criados por dia (fora games, ML + Shopee + servidor): 11/11 = 1.249; 12/11 = 1.231; 13/11 = 929; 14/11 = 405; 15/11 = 860; 16/11 (parcial) = 52. A semeadura de ML sozinha (script manual + servidor) criou 3.055 masters em 8 dias; a última execução do servidor fez 6 chamadas e criou 0.

## 3. Dry-run do piloto (Casa, 254 chamadas, nada gravado) [medido]

Fonte: 30 categorias da Casa (profundidade 2, mínimo 3.000 anúncios, sem peça/acessório/outros) → 412 catálogos únicos entre os 20 mais vendidos de cada → 410 ainda fora do banco → 121 detalhados (orçamento) → mesmo funil da semeadura:

- **95 catálogos novos seriam criados (78,5% dos detalhados)**, todos com vendedor novo ativo (nenhum 404, porque mais vendido tem vendedor). Distribuição: ventilador 15, geladeira 13, máquina de lavar 13, aspirador de pó 11, micro-ondas 9, cooktop 5, ferro 5, air fryer 3, outros 21.
- Barrados: 3 duplicata de título, 1 já planejado por título, 2 mesma chave de identidade, 1 item miúdo (relé de geladeira), 0 usado/retrô, 0 sem identidade forte.
- **14 de 109 sem segmento (12,8%)**: domínio que nenhum tipo cobre. Seis são peças ou itens fora da regra (relé, mangueira, agitador, refil, lâmpada, balança), certo estar fora. Oito são produtos: chaleira elétrica (3), cozedor de ovos a vapor (2), climatizador evaporativo (1), adega (1), balança de cozinha (1).
- **Bug achado e corrigido**: o segmento `chaleira-eletrica` aceitava só `ELECTRIC_KETTLES|WATER_KETTLES`; o domínio real é `MLB-ELECTRIC_JUGS`. Toda chaleira seria rejeitada como `dominio_fora_do_segmento` (0 masters de chaleira no banco).
- Extrapolação [estimada]: 412 × 78,5% ≈ **320 catálogos novos só dos mais vendidos de 30 categorias da Casa**, contra 827 masters aprovados hoje (+39%). Um nível mais fundo (folhas, ~150 categorias) ≈ 5 vezes isso.

## 4. Causas raiz com peso

Peso = itens afetados. "Medido" tem número de hoje; "estimado" mostra a conta.

| # | Causa | Evidência | Peso (itens) |
|---|---|---|---|
| C1 | **Descoberta por termo fixo "tipo + marca", sem árvore de categoria nem destaques.** Novos modelos e best-sellers nunca aparecem em termos escolhidos à mão; a busca por palavra devolve o que casa com o texto, não o que vende | 0,5% a 2,3% dos mais vendidos no banco (Casa, Eletrônicos, Tecnologia, Esporte) [medido] | Casa ≈ 320 só em 30 categorias; Eletrônicos, Tecnologia e Esporte ≈ 400 cada no mesmo corte [estimado, 20 × 30 × 0,7]; ≈ 1.500 no nível 2 das 4 áreas medidas e ≈ 7.500 no nível 3 |
| C2 | **Teto da API: 200 resultados por consulta (offset 100) e profundidade 3 a 20 inalcançável.** O ciclo de profundidade vira releitura dos mesmos 150; termo esgotado em 3 passadas | `offset > 100` = HTTP 400 [medido]; `MAX_SEARCH_PAGES = 20` [código] | afeta ~16.000 termos de 157 segmentos; 0 descoberta nova após a 3ª passada; coerente com a criação caindo de 1.249/dia (11/11) para 52 (16/11, parcial) |
| C3 | **Semeadura de servidor ligada em 1 de 6 departamentos** (`semear-vertical:eletroeletronicos`, único job nas 72 h; teto 120 chamadas por execução) | `collector_runs` 72 h [medido]; a última execução: 6 chamadas, 0 criados | Casa, Tecnologia, Esporte, Livros e Impressão 3D só crescem quando alguém roda o script à mão: 4 de 6 áreas, 33 + 41 + 43 tipos rasos |
| C4 | **Tipos sem semente ou com domínio errado** (67 segmentos com `domainUnconfirmed`; 71 sem `searchDomain`, buscam sem filtro) | chaleira (domínio errado), cozedor a vapor, climatizador evaporativo, adega [medido no dry-run] | 12,8% dos candidatos novos da Casa sem segmento (8 produtos válidos em 109); um tipo inteiro (chaleira) bloqueado |
| C5 | **Catálogo inativo e sem vendedor consome a cota** (49% dos candidatos de busca por termo terminam em 404 "sem vendedor") | 4.185 de ~8.970 candidatos nos 34 planos manuais [medido]; nos destaques: 0 de 109 | ~4.200 chamadas desperdiçadas já feitas; some com a fonte por destaques |
| C6 | **Identidade fraca vai para revisão** (sem GTIN/MPN/marca+modelo) | 1.275 candidatos (14%) em `revisao_sem_identidade_forte` [medido, 34 planos] | 1.275 catálogos esperando decisão; nos destaques da Casa 0 (os mais vendidos têm atributos) |
| C7 | **Masters sem oferta ativa** (placeholder do ML, sem coleta) | Casa 263, Esporte 349, Tecnologia 111, Eletrônicos 98, outros 6 = **827** fora de games [medido] | 827 masters invisíveis nas vitrines |
| C8 | **Amazon só entra ligada a master existente**; sem nós de navegação nem rankings | cobertura de masters na Amazon: 16% a 46% [medido]; 3.828 masters (inclui games) com ML ativo sem Amazon ativa | herda o buraco do ML (C1) e acrescenta o seu: ~3.800 masters sem Amazon; universo da Amazon [não medido] |
| C9 | **Shopee só por 11 categorias de games** e erro 10000 em páginas fundas; Plus entra por foco | cursor com 11 categorias [medido]; 903 rascunhos Shopee parados na fila de classificação (Casa 313, Esporte 382, Tecnologia 109, Eletrônicos 77, Games 22) | 903 ofertas esperando identidade; Plus sem categorias [estimado: depende de decisão sobre quais `productCatId`] |
| C10 | **Fila de refresco e coleta priorizam o que já existe**; `discover-products` cria no máximo 10 por execução (`maxNew=10`) | `maxNew=10` em `vercel.json` [código] | teto de 10 criações por execução; sem cota própria de "descobrir" por área |
| C11 | **Sem medidor nem dono da cobertura**: nenhum número dizia "estamos em 0,5% dos mais vendidos"; relatórios mediam saúde de coleta, não universo | auditoria de 15/11 e `/admin/fluxo` não têm a métrica [código] | causa de todas as outras terem durado |

Filtros de escopo/porteiro **não** são causa relevante: no dry-run só 7 de 121 foram barrados e todos por motivo correto. Os contadores históricos de rejeição nos 34 planos manuais: sem vendedor 46,8%, sem identidade forte 14,2%, fora do domínio 5,4%, duplicata 4,9%, ISBN importado 2,7%, item miúdo 1,2%, usado/open box/recondicionado 0,3%. Foto com mão, retrô e quarentena atuam depois da entrada e não afetam a descoberta.

## 5. Tamanho do buraco por departamento e rede

Universo-meta = mais vendidos por categoria (medível e comprável na Black Friday). Cauda longa fica fora da meta até haver medida.

| Departamento | Rede | Hoje | Meta fase 2 (mais vendidos, nível 2) | Buraco estimado |
|---|---|---|---|---|
| Casa | ML | 827 masters | +320 catálogos medidos em 30 categorias; ~+1.500 no nível 3 | ≥ 320 [medido-estimado] |
| Eletrônicos | ML | 1.398 | ~+400 | ~400 [estimado] |
| Tecnologia | ML | 962 | ~+400 | ~400 [estimado] |
| Esporte | ML | 894 | ~+400 | ~400 [estimado] |
| Livros | ML | 252 | categorias folha de `Livros Físicos` (ISBN, 564 termos já cobrem parte) | [não medido] |
| Impressão 3D | ML | 171 | árvore em Indústria/Informática não mapeada | [não medido] |
| Todas | Amazon | 2.895 ofertas | masters novos x taxa de 21% a 46% = ~+500 ofertas; mais rankings da Amazon [não medido] | ~500 + rankings |
| Casa, Esporte, Tecnologia, Eletrônicos | Shopee | 194 ativas fora de games | categorias Plus sem cursor | 903 rascunhos + categorias [não medido] |

## 6. O que não foi medido e por quê
- Universo real da Amazon e da Shopee (sem navegação autorizada na aba logada nesta rodada; chaves da Shopee só existem na Vercel).
- Sintaxe do filtro `attributes` do `/products/search` (poderia particionar por marca e passar o teto de 200).
- Filtro por faixa de preço no `/products/search`: não existe; o particionamento possível é por termo, domínio e (se confirmado) atributo.
- Cauda longa de catálogos que não são mais vendidos: o ML não expõe lista paginada de catálogos por categoria.
