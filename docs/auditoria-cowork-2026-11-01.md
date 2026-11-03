# Auditoria completa: Espaço Geek 86 (egeek86.com)

- **Data da coleta:** 01/11/2026, entre 00h30 e 02h00 (horário de Brasília).
- **Modo:** somente leitura, com o navegador do dono já logado (perfil Administrador).
- **Restrições respeitadas:** não fiz compra, não enviei formulário e não alterei nada.
- **Uso dos links "Ir à loja":** apenas para abrir o anúncio e ler o preço.
- **Método:** leitura do DOM renderizado, `fetch` same-origin das rotas, renderização em iframe de 1300 px e de 390 px e leitura de 1.088 linhas da `/tabela-de-precos`.
- **Limitação:** a captura de tela das páginas do egeek86 expirou sempre (30 s). As evidências são textos e valores lidos do DOM, com URL. Capturas só foram possíveis nas páginas do Mercado Livre.

Severidade: **P0** viola regra inegociável ou mostra dado falso · **P1** número errado, divergência ou função quebrada · **P2** qualidade, UX ou consistência · **P3** polimento.

---

## 1. Resumo executivo

O site melhorou muito desde 30/10:
- o rodapé não tem mais links 404;
- o ranking fictício foi retirado;
- a conta mostra estados vazios honestos;
- o carrinho virou lista de compra com "Ir à loja";
- a página do produto ganhou média de todas as lojas, tabela por loja, frescor e sinopse com fonte;
- não há cantos arredondados;
- o layout em 390 px não estoura.

**Ainda não dá para confiar nos números para decidir uma compra.** Os 5 maiores riscos:

1. **Produto errado sob o título certo (P0).** "Nintendo Land (Wii U)" carrega sinopse e cotações de "Metroid: Other M". Isso gera média de R$ 407,45 e preço "−70%".
2. **Duplicatas de produto (P0).**
   - PS5 Slim Digital aparece como 3 produtos.
   - PS4 Slim 1 TB aparece como 4 ou mais.
   - GTA V PS4 aparece como 3.
   - Resident Evil 3 PS5 aparece como 2.
   - Cyberpunk 2077 aparece como 3 ou mais.
   - Xbox One S 1 TB aparece como 2.
3. **Isca e preço sem imposto promovidos como oportunidade (P1).**
   - GT7 PS5 a R$ 70 (vendedor com 1 venda) leva o selo "Menor preço já registrado".
   - Switch 2 a R$ 2.906,32 é anúncio internacional. O próprio Mercado Livre estima mais R$ 1.579 de imposto de importação e R$ 918 de ICMS. O site mostra o anúncio como "−35%, Preço Excelente".
4. **Rótulos que não seguem a regra do veredito (P1).**
   - "Preço Excelente" sai para qualquer centavo abaixo da média (40 casos dentro de ±5%).
   - "Preço Regular" sai mesmo com o preço até 64% acima da média (34 casos acima de +5%).
   - A página do produto mostra "Preço estável" nos 15 produtos abertos, inclusive com −66%.
5. **Fora da cartela e contadores divergentes (P0/P1).**
   - Fora da cartela: console "D.E.S.B.L.O.Q", PS2 "+ 20 jogos", "Gta 5 Digital", filtro "Mídia Digital", kit de chaves Torx, teclado e óculos em "Altas e baixas".
   - "Produtos com oferta" aparece com 4 valores diferentes: 1.070, 1.075, 1.088 e 1.121.

**O que está sólido, com o que verifiquei:**
- Os 13 links "Ir à loja" lidos (10 produtos) levam para fora do site, ao anúncio da loja.
- Em 3 anúncios abertos, o preço do site bateu com o da loja (R$ 309,99, R$ 70,00 e R$ 2.906,32).
- Todas as ofertas abertas mostram "Atualizado há menos de 1 h".
- Produtos com histórico curto mostram "--" e "Histórico ainda curto", sem selo.
- Os links externos usam `rel="noopener noreferrer nofollow sponsored"`.
- `/admin` redireciona quem não está logado.
- `/conta`, `/carrinho` e `/monitoramento` não devolvem dados pessoais sem sessão.

---

## 2. Objetivo de cada área (Fase 0)

| Rota | Status / tempo de servidor* | Objetivo declarado (1 frase) | Objetivo claro? | Nota 0–10 |
|---|---|---|---|---|
| `/` | 200 · **22,5 a 38,5 s** | Levar o visitante à busca de preço com histórico | Sim, mas mistura painel de mercado, cultura geek e Hype Zone | 4 |
| `/ofertas` (busca) | 200 · 13,8 s na 1ª, ~1,3 s depois | Comparar o preço de um título entre lojas | Sim | 6 |
| `/ofertas/[slug]` | 200 · TTFB ~70 ms | Dizer se o preço de hoje é bom contra o histórico | Sim | 5 |
| `/tabela-de-precos` | 200 · 2,8 s (paginada); 37,9 s (`?todos=1`) | Listar o catálogo com preço, média e mínimo | Sim | 4 |
| `/monitoramento` | 200 · 3,2 s | Acompanhar jogos e ver a variação | Sim | 4 |
| `/monitoramento/altas-e-baixas` | 200 · 1,6 s | Listar maiores quedas e altas | Sim | 3 |
| `/ranking` | 200 · 2,1 s | Ranking de colecionadores | Sim; hoje mostra estado vazio honesto | 7 (estado vazio) |
| `/noticias`, `/noticias/[slug]` | 200 | Notícias de games e cultura pop | Sim | 2 |
| `/inteligencia-gamer` | 200 | Observatório: análises de mercado | Pouco: conteúdo editorial sem dado próprio | 3 |
| `/hype-zone` (+ `/leiloes`, `/curadoria`) | 200 | Drops e leilões C2C entre colecionadores | Não é o negócio de comparação de preços | 3 |
| `/sobre` | 200 | Explicar o serviço | Sim | 6 |
| `/contatos` | 200 | Canais de suporte e formulário | Sim | 6 |
| `/pesquisa` | 200 | Pesquisa de mercado com usuários | Sim | 6 |
| `/carrinho` | 200 | Lista de compra com "Ir à loja" | Sim | 8 |
| `/conta` | 200 | Dados, jogos acompanhados, drops e leilões | Sim | 7 |
| `/entrar`, `/termos`, `/privacidade` | 200 | Acesso e textos legais | Sim | 6 |
| `/go/[slug]` | redireciona → loja | Levar à loja | Sim | 9 |
| `/sitemap.xml` | **404** | — | — | 0 |
| `robots.txt` | 200 | Bloqueia /admin, /api, /conta, /carrinho, /go | Não declara sitemap | 5 |
| `/api/health` | 200 público | Saúde do serviço | — | — |

\* Tempo medido com `fetch` a partir do navegador logado; inclui renderização no servidor.

**Rotas que não existem (404):** `/contato`, `/curadoria`, `/comparar`, `/monitoramento/comparar` (sem id), `/altas-e-baixas`, `/universos`, `/categorias`, `/sellers`, `/faq`, `/trocas`, `/rastreio`, `/seja-seller`, `/cadastro`, `/api`, `/api/cron*`, `/api/webhooks`. Nenhuma delas está linkada hoje no menu ou no rodapé.

---

## 3. Matriz do checklist (A a K)

| Item | Resultado | Evidência |
|---|---|---|
| **A. Home: hero e busca** | Aprovado | Slogan, busca e atalhos (PS5, Switch 2…) presentes; busca leva a resultados |
| A. Contadores | **Reprovado** | Home: 1.121 produtos e 3.246.260 cotações. `/ofertas`: 1.075. `/sobre`: 1.075 e 3.245.732. Cabeçalho da tabela: 1.070. Abas da tabela: 904 + 56 + 128 = 1.088. Vendedores: 2.314 (`/sobre`) e 2.599 (`/contatos`) |
| A. Vitrines | **Reprovado** | Destaques com vendedor de "Reputação baixa" (Halo Infinite + Baralho, −58%); Nintendo Land com média contaminada (−70%) |
| A. Cópia | **Reprovado** | Home mostra 3 números de mercado diferentes (seção 5, F-17); `/inteligencia-gamer` exibe rótulo técnico "Carrossel 2s" |
| **B. Busca: dimensão por aba** | **Reprovado** | `controle` em Jogos traz "Madden NFL 19". `console` em Jogos traz 4 jogos. `console` em Acessórios traz Memory Card PS2 e PS Portal |
| B. Itens fora da cartela | Parcial | `amiibo`, `cadeira`, `teclado`, `camiseta` e `funko` retornam vazio com mensagem (aprovado). Mas teclado e óculos aparecem em Altas e baixas (F-07) |
| B. Chips somam o total | **Reprovado** | Busca `console` mostra 79 consoles; a aba Consoles da tabela tem 56 |
| B. Tolerância a erro de digitação | **Reprovado** | `resident evill` → 0 resultados. `zeld` funciona (busca por prefixo) |
| B. Busca ampla | **Reprovado** | `xbox` → "amplo demais"; `switch` e `ps5` funcionam como filtro de plataforma |
| B. Sem duplicatas | **Reprovado** | F-02 |
| B. Aba Consoles limpa | **Reprovado** | "Nintendo Switch V2 D.E.S.B.L.O.Q 128GB", "PS2 + 20 jogos de sua escolha", "Gran Turismo 7 PS4" (jogo), "Jam pack Volume 11 PS2" (disco demo), PS Portal como console |
| B. Bundle com selo | **Reprovado** | Bundles aparecem como console comum sem selo (ex.: "Switch 2 + Mario Kart World Bundle" com "Recorde Histórico") |
| **C. Produto: blocos** | Parcial | Tem preço, média de todas as lojas, mínimo com data, contagem, tabela por loja, "Ir à loja" e acompanhar. **Não tem gráfico** (nenhum SVG ou canvas de gráfico na página) |
| C(a) média ≠ atual | Parcial | 12 produtos com atual = média = mínimo e selo (ex.: 8 Doors, Xbox One S 1 TB) |
| C(b) mínimo ≤ atual | **Reprovado** | Nintendo Land: hoje R$ 120,30 e "Menor já visto R$ 150,00", com selo "Menor preço já registrado" |
| C(c) último ponto = atual | Não verificável | Não há gráfico na página do produto |
| C(d) veredito | **Reprovado** | "Preço estável" nos 15 produtos abertos, inclusive GT7 −66% e PS5 −37% |
| C(e) Ir à loja | Aprovado | 13 links lidos (10 produtos) saem para a loja; 3/3 abertos com produto e preço iguais |
| C(f) lojas ordenadas | Aprovado | GT7: Mercado Livre R$ 70 e depois Shopee R$ 142 |
| C(g) sinopse | Parcial | Sinopse da Wikipédia com fonte, mas em **inglês** (Mario Wonder, RE Village), com "WikipÃ©dia" (erro de codificação) e seguida da "Ficha Rápida" copiada do vendedor ("Gênero: ação", "Diversão garantida") |
| C(h) 390 px | Aprovado | Largura do documento 381 px, sem estouro; capa de jogo em 4:5 (347×434, `contain`) |
| C. Histórico curto | Aprovado | Cyberpunk 2084 (3 cotações), PS Portal (10): "Histórico ainda curto", sem selo |
| **D. Tabela: colunas e filtros** | Aprovado | Preço, média, mínimo, cotações, indicador, filtros de loja, plataforma, formato e ordenação |
| D(a) ordenar por desconto | Não verificado | Não acionei a ordenação |
| D(b) "abaixo da média" só com histórico elegível | Aprovado | Linhas sem média mostram "--" (534 de 904 jogos) e nunca "Excelente" |
| D(c) sem "média = mínimo = atual" sem histórico | Parcial | 12 casos com histórico elegível exibem os 3 iguais e "Recorde Histórico" |
| D(d) totais | **Reprovado** | 1.070 no cabeçalho contra 1.088 nas abas |
| D. Filtro "Mídia Digital" | **Reprovado (P0)** | Opção `digital` no filtro de formato contradiz a cartela |
| **E. Ranking** | Aprovado | "Ainda não há ranking publicado…", sem número inventado |
| **F. Monitoramento e carrinho** | Parcial | Carrinho sem "afiliado", com "Ir à loja" e preço igual ao do produto (Story of Seasons R$ 99,99). Monitoramento diverge do produto (F-10). Remover item não testado (alteraria dados) |
| **G. Conteúdo** | **Reprovado** | Notícia assinada "Por Teste Monitoramento" (F-05); notícias sem fonte e todas de 27/07/2026; imagem repetida em /noticias |
| G. Formulários e LGPD | Parcial | `/pesquisa` explica uso agregado. Credenciamento pede foto do **rosto** sem explicar a base legal. Política de privacidade não cita cookies |
| **H. Integrações** | Parcial | 13 links `/go` lidos (meta era 20) saem para a loja; 3 abertos e conferidos. Frescor: todas as ofertas abertas "há menos de 1 h". Shopee ativa em 157 produtos |
| **I. Design** | Parcial | 0 elementos com canto arredondado (aprovado). 148 textos com 10–11 px na tabela em 390 px. Contraste WCAG e teclado não medidos |
| **J. Performance** | **Reprovado** | Home com 22,5–38,5 s no servidor; `/ofertas` 13,8 s na primeira requisição e ~1,3 s depois (padrão do EG-11 persiste) |
| **K. Segurança** | Parcial | `/admin` redireciona sem sessão (aprovado). Sem vazamento de stack ou chave nas páginas de erro. `/api/health` é público e revela "supabase ok / postgres ok". Barra da Vercel (`__vercel_toolbar`) carregada em produção. Sem banner de consentimento de cookies |

---

## 4. Auditoria de indicadores

### 4.1 Regra observada × regra canônica

A regra observada foi inferida das 1.088 linhas da tabela.

| Indicador | Regra canônica | Regra observada | Veredito |
|---|---|---|---|
| "Recorde Histórico" / "Menor preço já registrado" | Só com histórico elegível e atual ≤ mínimo | atual = mínimo (166 de 167); 58 casos dentro de ±5% da média; 12 com atual = média = mínimo | **Frágil** |
| "Preço Excelente" (tabela) | Não existe; o veredito deveria ser "abaixo do normal" só com delta < −5% | Qualquer atual < média (delta de −0,5% a −55%); **40 casos** com delta entre 0 e −5% | **Inválido** |
| "Preço Regular" (tabela) | "Em linha" com \|delta\| ≤ 5%; "acima do normal" com delta > +5% | Inclui **34 casos** acima de +5% (máx. **+64,5%**), ex.: Castlevania Dominus R$ 599,90 contra média R$ 421,75 | **Inválido** |
| Tendência na página do produto | Queda ≥ 5% em até 7 dias | "Preço estável" em **15/15** páginas | **Inválido** (indício de valor fixo) |
| Média do produto | Todas as cotações mantidas, todas as lojas, todo o histórico | Card e página batem entre si (Mario Wonder R$ 384,96 nos dois). Mas a média está contaminada por produto errado (Nintendo Land) e por anúncios fora da faixa (Xbox Series X Halo: média R$ 16.146) | **Frágil** |
| Menor preço histórico | Acima do piso de 35% da mediana, com data e loja | GT7 R$ 70 (34% da média) aceito. Nintendo Land com atual menor que o "menor já visto" | **Inválido** |
| Contagem de cotações | Cotações reais | Volume compatível com coletas repetidas a cada poucos minutos: Switch 2 com **299.506**, GTA V PS5 com **195.722**, Mario Wonder com **155.853**. Não é número de observações independentes | **Frágil** (seção 6) |
| Piso de 35% e filtro de 2× a média | Excluir isca e outlier | 57 produtos com média > 2× o mínimo; Xbox Series X a R$ 15.500 segue como preço atual | **Inválido** |
| Contadores institucionais | Iguais em todas as telas | 4 valores diferentes para "produtos" e 2 para "vendedores" | **Inválido** |
| Mediana | Usada internamente | **Não aparece em nenhuma tela** (procurei em home, tabela, produto, monitoramento e altas e baixas) | Decisão do dono (seção 7) |

### 4.2 Recálculo de 16 produtos (7 jogos, 5 consoles, 4 acessórios)

Delta = (atual − média) ÷ média. O "veredito correto" usa a regra canônica: ±5% = em linha.

| # | Produto (página) | Atual | Média | Mínimo | Cotações | Delta | Exibido (tabela / página) | Veredito correto | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Super Mario Bros. Wonder (Switch) | 309,99 | 384,96 | 239,99 (02/10) | 155.853 | −19,5% | Excelente / "Preço estável" | Abaixo do normal | ✗ rótulos divergem |
| 2 | Gran Turismo 7 PS5 | 70,00 | 206,29 | 70,00 (01/11) | 79 | −66% | Recorde / selo menor | Isca: excluir do mínimo | ✗ P1 |
| 3 | Resident Evil Village PS5 | 140,00 | 182,62 | 140,00 (21/07) | 10.810 | −23% | Recorde / "estável" | Abaixo do normal + selo | ✓ números, ✗ tendência |
| 4 | God of War Ragnarök PS5 | 219,00 | 258,07 | 188,00 (21/07) | 2.184 | −15% | Excelente / "estável" | Abaixo do normal | ✓ números, ✗ tendência |
| 5 | 8 Doors PS5 | 349,90 | 349,90 | 349,90 | 7 | 0% | Recorde / selo menor | Em linha | ⚠ selo sem informação |
| 6 | Cyberpunk 2084 (sem plataforma) | 50,00 | — | — | 3 | — | Regular / curto | Histórico curto | ✓ regra; ✗ plataforma desconhecida |
| 7 | "Nintendo Land Wii U" (tabela diz "Metroid Other M") | 120,30 | 407,45 | 150,00 | 1.040 | −70% | Recorde / selo menor | Inválido (produto misturado) | ✗ P0 |
| 8 | Switch 2 Nacional de Tomada | 2.906,32 | 4.455,56 | 2.799,00 | 299.506 | −35% | Excelente | Preço sem imposto de importação | ✗ P1 |
| 9 | PS5 Slim Digital 825 GB | 3.199,99 | 5.069,64 | 3.199,99 | 13.850 | −37% | Recorde / selo | Média provavelmente contaminada | ⚠ não verificado |
| 10 | PS5 Slim Ed. Digital 825 GB Branco | 1.999,99 | — | — | 85 (todas de 01/11) | — | Regular / curto | Duplicata do #9 | ✗ P0 |
| 11 | Xbox Series X 1 TB Halo Infinite | 15.500,00 | 16.146,30 | 6.499,00 | 23 | −4% | **Excelente** | Em linha; preço fora da faixa | ✗ P1 |
| 12 | Xbox One S 1 TB Branco | 1.500,00 | 1.500,00 | 1.500,00 | 9 | 0% | Recorde / selo | Em linha; duplicata de "Xbox One S De 1 Tb" (R$ 1.699) | ✗ P0 |
| 13 | Base Dock DualSense (Shopee) | 54,40 | — | — | 4 | — | curto | curto | ✓ |
| 14 | PlayStation Portal (Acessórios) | 1.450,00 | — | — | 10 | — | curto | Duplicado em Consoles (R$ 1.567,04) | ✗ P0 |
| 15 | Kit chave Torx T6/T8/T10 (Shopee) | 27,89 | — | — | 1 | — | curto | Fora da cartela (ferramenta de reparo) | ✗ P0 |
| 16 | Controlador "Switch Pro com logotipo NFC" | 248,70 | — | — | 1 | — | curto | Clone genérico, listado 2 vezes | ✗ P0 |

### 4.3 Consistência entre telas (teste 2)

- **Mário vs. Donkey Kong (Switch):**
  - Tabela: 26.412 cotações, só Mercado Livre, média R$ 416,78.
  - `/monitoramento`: "3 lojas parceiras monitoradas" e "10 cotações de preços coletadas" (janela Tudo).
  - Ao mesmo tempo, diz "Comprar agora: no menor preço (ou muito perto)" com R$ 329,90, enquanto o mínimo registrado é R$ 139,81. **P1.**
- **Xbox One S De 1 Tb branco:** "−39,3%" em Altas e baixas; −28% contra a média na tabela. A base de comparação não é informada. **P2.**
- **Super Mario Wonder:** card, página e tabela batem (R$ 309,99 / R$ 384,96 / R$ 239,99). **OK.**
- **Nintendo Land:** card e página batem entre si (R$ 120,30 / R$ 407,45), mas a tabela chama o produto de "Metroid Other M". **P0.**
- **Ranking:** não aplicável (sem ranking publicado).

### 4.4 Amostra pequena (teste 6)

A contagem aparece ("N cotações", "7 variações"). Mas uma média com 7 cotações e outra com 155.853 têm a mesma aparência, e o rótulo "Recorde Histórico" é igual nos dois casos.

### 4.5 Gráfico (teste 9)

- **Página do produto:** não tem gráfico.
- **`/monitoramento`:** a contagem muda por janela (1D: 3; 1S: 7; 1M: 8; Tudo: 10 cotações). Não consegui ler eixos nem pontos do SVG com segurança.
- Interpolação: **não verificável** nesta rodada.

---

## 5. Achados

| # | Sev. | Área | Achado e evidência | Lente | Correção sugerida |
|---|---|---|---|---|---|
| F-01 | **P0** | Catálogo / matching | `/ofertas/jogo-nintendo-land-nintendo-wii-u-midia-fisica-nintendo-452706-afe9f8`: título "Nintendo Land Wii U", sinopse de "Metroid: Other M"; na tabela, o mesmo link aparece como "Jogo Metroid Other M Nintendo Wii". Média R$ 407,45, atual R$ 120,30 (−70%), na vitrine "Tá Vendendo Muito" | Gamer, Estatístico | Revisar o vínculo oferta→produto. Bloquear o vínculo quando título ou plataforma da oferta diferem do produto. Reprocessar as estatísticas do produto |
| F-02 | **P0** | Catálogo | Duplicatas (lista abaixo da tabela) | Gamer, Dados | Unificar por título, plataforma, edição e mídia; dedup por EAN/catálogo da loja quando houver |
| F-03 | **P0** | Cartela / consoles | `/ofertas/nintendo-switch-v2-d-e-s-b-l-o-q-128gb-tudo-100-shopee-04e26f` (desbloqueado, contornando filtro com pontos); "Console Playstation 2 Ps2 + 20 jogos de sua escolha"; "Jam pack Volume 11 PS2" e "Gran Turismo 7 PS4" na aba Consoles | Gamer, QA | Normalizar o título antes do filtro (remover pontos e espaços entre letras); bloquear "N jogos de sua escolha"; classificar disco demo como fora da cartela |
| F-04 | **P0** | Cartela / formato | Filtro "Todo Formato → Mídia Digital" na tabela; produto "Gta 5 Digital" listado e presente em Altas e baixas | Gamer | Remover a opção e o produto; impedir ingestão com formato digital |
| F-05 | **P0** | Notícias | `/noticias/especialistas-preveem-que-gta-6-fature-us-5-2-bilhoes-na-semana-de-lancamento`: "Por **Teste Monitoramento**", sem link de fonte; "LEIA TAMBÉM" repete a mesma notícia de X-Men com dois títulos | QA, Conteúdo | Despublicar conteúdo de teste; exigir autor real e URL de fonte para publicar |
| F-06 | **P0** | Cartela / acessórios | Kit chave Torx (ferramenta de reparo); "Host de jogo disco rígido externo HDD gabinete"; 2 controles "Switch Pro com logotipo NFC" (clone genérico, R$ 248,70 cada); PS Portal duplicado em Consoles e Acessórios | Gamer | Lista de exclusão por termo e por categoria da loja; uma dimensão por produto |
| F-07 | **P0** | Altas e baixas | `/monitoramento/altas-e-baixas` lista "Teclado Mecânico Gamer" (−28,6%), "Óculos Motorhomestore Fallout", "Borrachas condutivas DualSense" (peça de reparo) e dois "Gta 5" (Mercado Livre R$ 169,90 e Shopee R$ 119,90) | Gamer, Dados | Aplicar o mesmo filtro de cartela da busca a esta consulta |
| F-08 | **P1** | Indicadores | "Preço Excelente" para qualquer delta < 0 (40 casos entre 0 e −5%); "Preço Regular" com até +64,5% | Matemático, Preços | Implementar o veredito canônico de 3 faixas (±5%) e usar o mesmo texto na tabela, no card e na página |
| F-09 | **P1** | Produto | "Preço estável" em 15/15 páginas, inclusive GT7 −66% e PS5 −37% | Matemático | Calcular a tendência (queda ≥ 5% em 7 dias, com histórico elegível) ou retirar o rótulo |
| F-10 | **P1** | Monitoramento | Mário vs. DK: "3 lojas", "10 cotações" e "Comprar agora: no menor preço" com R$ 329,90, contra mínimo de R$ 139,81 e 26.412 cotações na tabela. Vendedor exibido como "NAIPEGAMES · 5_green" (código cru da API) | Dados, Preços | Ler da mesma estatística do produto; traduzir a reputação |
| F-11 | **P1** | Plausibilidade | GT7 PS5 R$ 70 (anúncio novo, vendedor com 1 venda, conferido no Mercado Livre) recebe selo "Menor preço já registrado" e entra no mínimo | Preços, Estatístico | Aplicar o piso de 35% da **mediana**; considerar reputação ou vendas do vendedor para entrar no mínimo |
| F-12 | **P1** | Plausibilidade | Switch 2 "Modelo Nacional de Tomada" R$ 2.906,32: no Mercado Livre é "Internacional", enviado dos EUA, com imposto de importação estimado em R$ 1.579 e ICMS em R$ 918. A loja oficial Nintendo no mesmo anúncio cobra R$ 4.277 | Preços, Integrador | Marcar oferta internacional; somar os tributos que a loja informa ou excluí-la da comparação com o nacional |
| F-13 | **P1** | Plausibilidade | Xbox Series X Halo R$ 15.500 (média R$ 16.146, mínimo R$ 6.499) rotulado "Excelente"; PS5 Slim 2 controles R$ 12.500 como preço atual | Estatístico | Teto por produto canônico (ex.: > 2× a mediana da categoria) além do filtro sobre a média bruta |
| F-14 | **P1** | Produto | Nintendo Land: "HOJE R$ 120,30" e "Menor já visto R$ 150,00" na mesma tela | Matemático | O mínimo deve incluir a cotação atual |
| F-15 | **P1** | Contadores | Produtos: 1.121 (home e `/contatos`), 1.075 (`/ofertas` e `/sobre`), 1.070 (cabeçalho da tabela), 1.088 (soma das abas). Vendedores: 2.314 e 2.599. "No menor preço histórico": 12 em `/ofertas` contra 167 "Recorde Histórico" na tabela | Dados | Uma única view de métricas com a mesma definição em todas as telas |
| F-16 | **P1** | Plataforma | 89 jogos sem plataforma na tabela, embora o título a cite (DS, 3DS, Wii, Wii U, SNES, PS3, Xbox 360, "Xbox Series"); na busca aparecem como "PRODUTO" (ex.: Cyberpunk 2077 R$ 129) | Gamer | Extrair a plataforma do título; ampliar a lista de plataformas |
| F-17 | **P1** | Home | Painel de mercado com US$ 205–207 bi, US$ 197 bi (+7,5%), ~3,68 bi e 3,6 bi jogadores, e Mobile/Console/PC = US$ 92 + 51 + 43 = **US$ 186 bi** (não fecha com nenhum dos dois totais). A Newzoo publicou US$ 188,8 bi (previsão), US$ 196,7 bi e depois "acima de US$ 200 bi" para 2025 | Estatístico, Conteúdo | Um único número, com edição e data do relatório |
| F-18 | **P1** | Performance | Home 22,5 s e 38,5 s em duas medições; `/ofertas` 13,8 s na primeira e ~1,3 s nas seguintes; `/tabela-de-precos?todos=1` 37,9 s | Performance | Cache/ISR para home e contadores; pré-aquecer após cada deploy; paginar o "Ver todos" |
| F-19 | **P1** | LGPD | `/contatos`: credenciamento com "upload de foto da coleção + **rosto**", sem base legal nem retenção informada; política de privacidade não menciona cookies, mas o site grava `sb-…-auth-token`, `theme` e `__vercel_toolbar` | Segurança | Explicar finalidade, base legal e retenção do dado biométrico; seção de cookies na política |
| F-20 | **P1** | Busca | Busca `console` traz 79 consoles; a aba Consoles da tabela tem 56. Busca `controle` em Jogos traz "Madden NFL 19 Controle Real Player Motion"; `console` em Jogos traz 4 jogos | QA | Buscar por dimensão classificada, não por palavra no título |
| F-21 | **P1** | Catálogo | Zelda: a busca devolve só Breath of the Wild e Link's Awakening; Tears of the Kingdom e Mario Kart 8 Deluxe (Switch) não aparecem na busca nem na tabela | Estratégia | Lista de títulos obrigatórios por plataforma (top vendas) com alerta de cobertura |
| F-22 | P2 | Produto | Sinopse em inglês (Wikipédia en) num site em português; "WikipÃ©dia" (codificação); "Ficha Rápida" copiada do vendedor ("Gênero: ação" para um jogo de plataforma; "Diversão garantida") | Conteúdo | Preferir pt.wikipedia; corrigir UTF-8; remover a ficha do vendedor |
| F-23 | P2 | Busca | `resident evill` → 0 resultados; `xbox` → "amplo demais", enquanto `switch` e `ps5` funcionam | Key user | Busca tolerante a erro (trigram); tratar "xbox" como família de plataformas |
| F-24 | P2 | Vitrine | Destaques com vendedor de "Reputação baixa" (Halo Infinite + Baralho, −58%) | Preços | Excluir reputação baixa de destaques e selos |
| F-25 | P2 | Imagens | `/noticias`: `news-xmen.png` ×8; `news-retro-console`, `news-gaming-setup`, `news-esports` e `news-gta6` ×4 cada; `/inteligencia-gamer`: `hero-gamer-panel.png` ×2; home: `observatorio-gamer-hero.png` ×2 | Front-end | Uma imagem por lugar; variante responsiva via `srcset`, não dois `<img>` |
| F-26 | P2 | Estatística | Contagem de cotações conta coletas repetidas (Switch 2 com 299.506). A média fica ponderada pela frequência de coleta de cada anúncio, não pelo preço praticado | Estatístico | Uma cotação por oferta por dia (ou por mudança de preço) |
| F-27 | P2 | Bundle | Bundles sem selo "Bundle" (ex.: "Switch 2 + Mario Kart World Bundle", "PS4 + God of War Ragnarok") | Gamer | Selo e filtro de bundle |
| F-28 | P2 | Mobile | 148 textos com 10–11 px na tabela em 390 px | Front-end | Mínimo de 12 px no mobile |
| F-29 | P2 | SEO | `/sitemap.xml` 404 e `robots.txt` sem `Sitemap:` | Estratégia | Gerar sitemap de produtos e notícias |
| F-30 | P3 | Observatório | Rótulo "Carrossel 2s" visível ao usuário | Front-end | Remover |
| F-31 | P3 | Segurança | `/api/health` público expõe "supabase / postgres ok"; barra da Vercel carregada em produção | Segurança | Restringir o health a token; desligar a toolbar em produção |
| F-32 | P3 | `/go` | Slug inexistente redireciona em silêncio para `/ofertas` | Integrador | Página "oferta encerrada" com alternativas |

**Duplicatas do F-02** (todos verificados na tabela de 01/11):

| Produto | Ocorrências |
|---|---|
| PS5 Slim Digital 825 GB | 3 produtos: R$ 3.199,99, R$ 1.999,99 e R$ 5.099,99 (este com controle) |
| PS4 Slim 1 TB preto | 4 ou mais: R$ 1.400, 1.500, 1.700 e 1.750 |
| Xbox One S 1 TB branco | 2: R$ 1.500 e R$ 1.699 |
| GTA V Premium PS4 | 3: R$ 119,90, 153,55 e 168,00 |
| Resident Evil 3 PS5 | "Resident Evil 3" (R$ 164,99) e "Resident Evil 3 Remake" (R$ 170) |
| Cyberpunk 2077 | "Cyberpunk 2077" (R$ 129), "Projekt Red" (R$ 90), "CD Projekt Red PS4" (R$ 142,26) |

---

## 6. Lacunas do modelo de negócio

- **Gráfico na página do produto:** ainda não existe; a decisão "compro hoje?" depende de ir ao `/monitoramento`.
- **Mediana:** não é exibida. A média está visivelmente contaminada (F-01, F-13, PS5 Slim com média R$ 5.069).
- **Alerta com preço-alvo:** não verificado ("Acompanhar preço" não foi clicado). Não há preço-alvo sugerido (mínimo × 1,05) visível.
- **Lojas:** 2 lojas reais (Mercado Livre em 931 produtos, Shopee em 157). Kabum, Amazon, Magalu e AliExpress não aparecem mais no filtro (correto, se não há oferta).
- **Fora do negócio:** Hype Zone, leilões C2C, curadoria e "Pontos" competem por atenção com a comparação de preços. O texto promete "escudo anti-bot", "caução" e "itens inspecionados" sem mecanismo visível.
- **Rotulagem de oferta internacional ou importada:** não existe (F-12).

## 7. Decisões que cabem ao dono

1. **Mostrar a mediana ao lado da média?**
   - *Recomendo sim*, como "preço típico", com a média em segundo plano.
   - Estatístico: a mediana não se move com isca ou anúncio de R$ 15.500.
   - Especialista em preços: o consumidor entende "preço típico" melhor que "média".
2. **O que conta como cotação:** cada coleta ou um preço por oferta por dia?
   - *Recomendo um por oferta por dia.* Hoje um anúncio coletado a cada poucos minutos pesa mais que outro (F-26).
3. **Oferta internacional:** somar os impostos estimados pela loja ou excluir?
   - *Recomendo excluir da média e do selo.* Mostrar à parte, com aviso.
4. **Controles "compatíveis" de terceiros:** clone genérico ou acessório válido?
   - *Recomendo* aceitar marcas licenciadas (PowerA, Hori, 8BitDo) e excluir os sem marca que imitam o original.
5. **Palavra "afiliado":** os Termos dizem "parceiros afiliados".
   - A regra interna proíbe a palavra para o cliente.
   - A transparência sobre links patrocinados também tem peso ético e regulatório.
   - *Recomendo* manter uma divulgação curta e honesta em Termos e Sobre ("podemos receber comissão da loja") e consultar um advogado. Não sou advogado.
6. **Hype Zone, leilões e pontos:** manter no produto principal ou separar?
   - *Recomendo* tirar da navegação principal até a comparação de preços estar confiável.

## 8. Plano de correção priorizado

| Ordem | Itens | Esforço | Quem |
|---|---|---|---|
| 1 | F-01 (matching errado), F-05 (notícia de teste) | P | Dados, Conteúdo |
| 2 | F-03, F-04, F-06, F-07 (cartela em todas as consultas, inclusive Altas e baixas) | M | Coleta, Back-end |
| 3 | F-02 (dedup por título, plataforma, edição e mídia; PS Portal numa dimensão só) | G | Dados |
| 4 | F-08, F-09, F-14 (veredito de 3 faixas, tendência real, mínimo inclui o atual) | P | Back-end |
| 5 | F-11, F-12, F-13 (piso pela mediana, teto, reputação, oferta internacional) | M | Dados |
| 6 | F-15, F-10, F-20 (uma view de métricas e de estatística por produto em todas as telas) | M | Back-end |
| 7 | F-18 (cache da home, pré-aquecimento após deploy, paginação do "Ver todos") | M | Back-end |
| 8 | F-16, F-21 (plataforma pelo título; cobertura dos títulos obrigatórios) | M | Coleta |
| 9 | F-19 (LGPD: rosto e cookies) | P | Jurídico, Front-end |
| 10 | F-17, F-22–F-32 | P | Conteúdo, Front-end |

**Testes de regressão sugeridos:**
- nenhum produto com título diferente da sinopse ou da oferta vinculada;
- busca por "ps5 slim digital", "ps4 slim 1tb", "gta v ps4", "resident evil 3", "cyberpunk 2077" → 1 card por edição;
- nenhum título com "desbloq" (normalizado), "digital" ou "jogos de sua escolha";
- veredito recalculado = exibido em 100% das linhas da tabela;
- contadores iguais em home, `/ofertas`, `/sobre`, `/contatos` e tabela;
- home abaixo de 3 s na primeira requisição após deploy.

---

## Fontes externas

- Newzoo via GamesBeat: [Global game revenues hit $196.7B in 2025](https://gamesbeat.com/global-game-revenues-hit-196-7b-in-2025-up-7-4-newzoo/)
- Newzoo via GamesBeat: [Global games revenue breached $200B in 2025](https://gamesbeat.com/business/global-games-revenue-breached-200b-in-2025-newzoo/)
- Newzoo via PocketGamer.biz: [Global games market set to hit $188.8bn in 2025](https://www.pocketgamer.biz/newzoo-global-games-market-set-to-hit-1888bn-in-2025)
- Anúncios conferidos no Mercado Livre em 01/11/2026: Super Mario Bros. Wonder (MLB27826560), Gran Turismo 7 PS5 (MLB28560829), Nintendo Switch 2 Modelo Nacional de Tomada (MLB49200061).
