# Parecer do Gamer Veterano, rodada 1 (2026-11-01)

Insumos: `docs/auditoria-cowork-2026-11-01.md` (F-02, F-03, F-06, F-16, F-21, F-22, F-27, decisão 4) e SELECT no banco (somente leitura, `scripts/_dup-shared.ts connect()`), produtos com `merged_into` nulo e pelo menos uma oferta `active`. Rótulos: [dado] lido no banco; [conhecimento] vocabulário e fatos do mercado gamer, sem consulta externa nesta rodada; [hipótese]; [recomendação].

## 1. Posição

**Apoio com ressalvas.** Apoio a decisão 4 (aceitar controle licenciado, excluir clone sem marca), com a ressalva de que ela só funciona se a marca virar dado estruturado: `manufacturer` está nulo em 100% dos produtos ativos [dado]. Nenhuma regra inegociável é violada pelas minhas recomendações. Regras tocadas: "um jogo, uma média" (grupos PS5 e bundles, item 3) e "só API oficial" (cobertura de títulos, item 5).

## 2. Leitura da situação

### 2.1 Controles de terceiros (pergunta 1)

[dado] Há cerca de 150 itens "controle" no catálogo ativo, misturando 4 coisas: (a) controle original (DualSense, DualShock, Xbox Wireless, Joy-Con, Pro Controller); (b) controle licenciado de terceiro; (c) clone sem marca; (d) peça, carregador, grip e bateria. Só (a) e (b) são controles. O problema do item (d) é maior que o do clone: baterias, analógicos, borrachas condutivas, flat, placa USB, botões e molas ocupam a cartela de acessórios.

**Lista de marcas [conhecimento]:**

| Classe | Marcas | Tratamento |
|---|---|---|
| A. Licenciada oficialmente pela plataforma | PowerA, Hori (selo "Nintendo Licensed Product" / "Licenciado"), 8BitDo (Switch e Xbox licenciados), PDP, Razer (Xbox/PlayStation), Thrustmaster (Eswap X Pro), Turtle Beach, Scuf, Nacon, Brook, Victrix, Mad Catz, Hyperkin (retro) | Entra como "Controle de terceiro licenciado". Média própria separada do original |
| B. Terceiro conhecido, sem licença confirmada | GameSir, Dobe, Ipega, Flydigi, Knup, Marvo | Entra só como "Acessório compatível", rótulo visível, fora da média do controle original. [hipótese] GameSir e Dobe têm linhas licenciadas para Xbox; confirmar modelo a modelo |
| C. Clone sem marca | sem marca no título | Fora da cartela |

**Padrão de título do clone ruim [dado, testado nos acessórios reais]:**

1. Sem marca reconhecida e com "Compatível com", "Estilo", "Tipo" ou "Gamepad". Exemplos reais: "Controle Compatível Joy-con Para Nintendo Switch Gamepad Rgb Roxo", "Controle estilo Nintendo Switch Joy Con Par Azul", "Controle Gamer Wireless RGB Compatível Nintendo Switch, PC e Android", "Controle Xbox Sem Fio Compatível Com Xbox Series S/x one pc Cor Preto Nexara GM032X", "Controle Xbox Sem Fio ... S-01 PRETO THYPE".
2. Nome do original deturpado: "Doubleshock", "Doubleshock" com "Voltagem 5v", "Nitendo", "Nintend Oled/Lite/PC/iOS/Android". Exemplos: "Controle Doubleshock para Ps4 Sem Fio Joystick Pc", "Controle Ps4 S/fio Preto Doubleshock", "Kit Controle Compatível Nitendo Switch Oled Preto Top".
3. Lista de plataformas demais num título só: "Switch/PC/Android/iOS", "PS5/PS5 Slim/PS5 Pro, celular e PC ... Bluetooth 5.3 RGB ... botões programáveis".
4. Acessório de sufixo vago: "Top", "Gamer", "Joystick", sem marca nem modelo.
5. "Logotipo NFC" ou "Sensor Seis Eixos" como argumento de venda (o clone "Switch Pro com logotipo NFC" da auditoria).

[hipótese] Regex no título só pega o clone declarado. O padrão sem sinal é "Controle Ps4 Sem Fio Preto" ou "Controle Xbox series joystick original manete": não dá para saber se é original sem o atributo BRAND/MODEL do anúncio. A regra confiável é por marca estruturada, e o título entra só como reforço.

**Peças e consumíveis (excluir da cartela, 36+ itens no catálogo ativo [dado]):** analógicos 3D/Hall/TMR/ALPS, "borrachas condutivas", "flat", "placa USB jds", "botões R1 R2", "molas", "botão LB RB", "CI HDMI Xbox One S" (cadastrado como console), "kit chave Torx", "lote de caixas vazias", baterias e cabos de reposição, grips de silicone e "mini volante" que encaixa no controle. Bateria e carregador oficiais ou de marca (Dobe, Oivo) podem ficar como acessório B; peça solta de reparo não.

### 2.2 Bundles (pergunta 2)

[dado] Oito consoles do catálogo ativo são bundle e nenhum tem selo ou `game_edition_type = 'bundle'`: Switch 2 + Mario Kart World (R$ 4.190), Switch OLED Mario Wonder + 3 meses Nintendo Switch Online (R$ 2.050), PS4 Slim "Hits Bundle" (R$ 1.100 e R$ 2.199), PS4 Slim "com 3 Jogos e Mega Pack" (R$ 2.290), PS5 pacote NBA 2K26 (R$ 4.372), PS5 pacote Fortnite (R$ 5.819), PS2 "+ 20 jogos" (R$ 600). Há bundles ainda escondidos em `product_type = 'game'`: "Console digital God Of War Ragnarok Ps5", "Console Mídia Física Com God Of War Ragnarok", "Console Playstation 4 E Jogo God Of War Ragnarok", "Console PS5 Slim ... Pacote Astro Bot E Gran Turismo 7", "Console PS5 Slim + Jogo Astro Bot E Gt7", "Console PS5 ... Returnal e Ratchet e Clank". O enum `game_edition_type` já tem `bundle` (5 jogos hoje) e nenhum console.

[conhecimento] Bundle oficial de fabricante (ex.: Switch 2 + Mario Kart World, PS5 + jogo de lançamento) é um SKU próprio com GTIN próprio; o jogo vem em código ou disco. O preço do bundle não é preço do console: o gamer compara com "console + jogo separados".

### 2.3 PS5: o que é o mesmo produto (pergunta 3)

Grupos reais do banco hoje [dado, console ps5 ativo, preço mínimo da oferta ativa]. Observação importante: "Console PlayStation® 5 Slim Edição Digital 825 GB Branco" (R$ 1.999) está com `game_platform_gen = ps4` e "Console Digital Sony PS5 Slim 1TB" está correto como ps5. O enum de plataforma é a causa dos erros de PS2, PS3, PSP e Vita virarem "ps4" (ver item 6).

| Grupo proposto | Itens reais (mínimo em R$) | Mesmo produto? |
|---|---|---|
| **PS5 Slim Digital 825 GB (padrão)** | "PS5 Slim Digital 825GB" (3.199), "PS5 Slim Edição Digital 825 GB Branco" (1.999, ps4 por erro), "PS5 Slim Digital 825GB + DualSense Branco" (5.099) | Os dois primeiros são o mesmo SKU: a duplicata da auditoria. O de R$ 5.099 inclui controle extra: bundle, outro produto. O de R$ 1.999 é isca/erro até prova: 37% abaixo do outro [hipótese] |
| **PS5 Slim Digital 1 TB** | "Console digital Sony PS5 Slim Digital 1 TB branco/preto" (3.900) | Edição distinta por capacidade |
| **PS5 Slim com disco** | "PS5 Edição Slim Disk 1TB Branco" (3.299), "PS5 Slim Disc de 1 TB, pacote Fortnite" (5.819, bundle), "PS5 Slim Cor branco/preto" (4.419, sem capacidade no título) | Slim com leitor de disco é um grupo próprio. O terceiro item não permite concluir o grupo sem o atributo estruturado |
| **PS5 Slim Digital + leitor de disco acoplável** | "PS5 Slim Digital Edition e unidade de disco branca" (3.600) | Na prática equivale a Slim com disco, vendido em dois SKUs. Marcar como bundle de hardware, não misturar com o Digital puro |
| **PS5 padrão (modelo original, 825 GB, com disco)** | "Sony PS5 825GB padrão branco e preto" (4.200), "PS5 EA Sports FC 24" (4.250, bundle), "PS5 825GB Kit DualSense Cosmic Red + Sackboy" (6.500, bundle) | Modelo anterior ao Slim, em fim de linha [conhecimento]. Distinto do Slim |
| **PS5 Pro** | "PS5 Pro 2TB Branco" (4.799), "PS5 Pro Digital Edition + DualSense White" (4.599) | O Pro não tem leitor de disco incluído [conhecimento]; os dois itens são o mesmo console. Hoje aparecem como dois cards |
| **Edições limitadas (cada uma é o seu produto)** | Slim 1TB Digital 30º Aniversário (5.500), Digital Wolverine (6.099), "Console e joystick DualSense camuflagem" (5.600) | Edição distinta; coleção. Não entram na média do padrão |
| **Falso positivo / fora** | "Console Playstation 5 Portatil 30 Anos.. Cinza" (R$ 1.890), "PlayStation 5501 Sony 16 MB" (R$ 19.000), "Refrigerador Duplo Para PS5 Slim Dobe" (R$ 78) | [hipótese] o "portátil 30 anos" é um clone retro ou game stick, não Sony. O de R$ 19.000 é item de outro tipo (memory card PS1 com título errado). O refrigerador é acessório cadastrado como console |

[dado] A mesma estrutura de problema vale para Xbox One S 1 TB (Branco e "De 1 Tb", R$ 1.500 e R$ 1.699, mais "All Digital" R$ 1.500 que é variante sem disco: o All-Digital é produto distinto do S com disco) e para PS4 Slim 1 TB (R$ 1.400, 1.500, 1.700, 1.750, 2.300: cinco cards do mesmo console).

Regra de agrupamento proposta [recomendação]: chave de produto de console = família + modelo + leitor (disco/digital) + capacidade + edição (padrão ou nome da limitada). Cor e voltagem não definem produto no preço (branco e preto do mesmo modelo são o mesmo SKU de preço), a menos que a cor seja uma edição nomeada.

### 2.4 PS Portal (pergunta 4)

[dado] Há 3 produtos PS Portal: 2 como console ("Console remoto Playstation Portal", R$ 1.567, "PlayStation Portal Reprodutor Remoto", R$ 1.543) e 1 como acessório ("PlayStation Portal Para Console PS5", R$ 1.450). [conhecimento] O Portal é periférico de streaming remoto: não roda jogo, não funciona sem um PS5 na mesma casa e na mesma rede, e a Sony o chama de "PlayStation Portal Remote Player". Para o gamer ele é acessório, não console.

Decisão recomendada: **acessório, plataforma PS5, um único produto**. Dentro de Consoles ele puxa a média de console para baixo e aparece como "console mais barato do PS5". Também não deve ser comparado com o "PlayStation 5 Portátil" (item falso positivo acima).

### 2.5 Títulos obrigatórios (pergunta 5)

Verifiquei por nome no catálogo ativo (jogos de `game_platform_gen` correto, físico e digital juntos). Fatos de top vendas vêm do meu conhecimento do mercado, sem ranking de vendas do Brasil consultado; o ranking oficial de fonte (item "dado que falta") substitui a lista abaixo.

**Presentes [dado]:**
- Switch: Mario Kart 8 Deluxe digital (R$ ver oferta) e Mario Kart 8 + Booster Course Pass físico; Super Mario Odyssey (2 produtos); Mario Wonder (4); Smash Ultimate (físico e digital); Animal Crossing (1); Pokémon Violet e Scarlet/Violet DLC; Pokémon Legends Z-A (Switch 1 e 2); Metroid Prime 4; Donkey Kong Bananza; Zelda BOTW (físico e digital); Link's Awakening; Echoes of Wisdom; Skyward Sword HD; TOTK (Collector's Edition físico e Zelda TOTK digital). 
- PS: God of War Ragnarök (PS4 e PS5), God of War 2018, Spider-Man 2 (PS5), Astro Bot, Returnal, Ratchet, GT7, The Last of Us (PS4), Elden Ring (PS5, 5 produtos), Death Stranding, Resident Evil 4.
- Xbox: Forza Horizon 5 (8 em Series), Halo (7 em One, 6 em Series), Starfield, Hellblade.

**Faltando [dado]:**
- TOTK **edição padrão física** para Switch 1: só existe Collector's Edition, o digital e o Upgrade Pack para Switch 2. O padrão é o título que mais vende em loja física.
- Ghost of Tsushima, Bloodborne, Uncharted, Demon's Souls, The Last of Us Part I/II (PS5), Horizon Forbidden West em PS5 nas mãos de bundle, Naruto, Spyro, Monster Hunter, Dark Souls, Sekiro, Fortnite (não é jogo de loja, mas há cartões), Black Myth: Wukong, Metal Gear Solid Delta.
- GTA V PS5 existe (1), GTA V PS4 existe (3), GTA V Xbox One (1); Elden Ring Series (1) e RDR2 PS4 (1) são os únicos Rockstar/FromSoft de PS4. FC 25 não aparece (apareceram FC 24, 26 e 27); FC 26 só Switch 2 e Xbox Series.
- Mario Kart World existe (1 produto, Switch 2). Mario Kart 8 Deluxe físico solo (sem Booster Pass) não aparece.

A auditoria disse que "Mario Kart 8 Deluxe não aparece na busca nem na tabela". O banco tem o produto digital e o físico com Booster Pass [dado]; o gamer que busca "mario kart 8 deluxe" provavelmente não vê porque o título está como "Mario Kart™ 8 Deluxe" e "Mario Kart 8 + Booster Course Pass". [hipótese] é problema de normalização do ™ e da palavra Deluxe, além de cobertura.

**Achado grave de classificação:** 53 itens que parecem acessório ou console estão como `product_type = 'game'` com plataforma preenchida [dado], por exemplo "Console Nintendo Switch - Zelda TOTK EDITION", todos os controles Hori/PowerA de Zelda/Pokémon/Mario, "Console Playstation 5 ... Returnal e Ratchet", "Pôster Gigante - Elden Ring" (6 pôsteres), "Guidão GTA MTB", "Manopla BMX GTA", "Pc Gamer Gta 5 I7". Isso explica parte das contas de "Zelda" e "Mario" que parecem cobertas: 6 dos 7 "Tears of the Kingdom" ativos são controle, console ou bundle, não o jogo.

**Como o motor de descoberta cobre pela API oficial [recomendação, ancorada no código `src/server/collector/discover-products.ts`]:** hoje a descoberta é matriz plataforma x gênero (72 termos) mais uma lista curta de franquias, cada termo com teto de 200 resultados em `/products/search` e `status=active`. Um termo genérico "jogo ps5 rpg" não garante que Ghost of Tsushima apareça. Proposta: lista curada de títulos obrigatórios (arquivo de configuração versionado, com título, plataforma, formato e GTIN quando conhecido), buscada por `q="<título> <plataforma>"` em `/products/search` e validada por título normalizado e plataforma contra o resultado (nunca aceitar o primeiro item cegamente: foi assim que "Nintendo Land" virou "Metroid Other M"). Resultado sem catálogo ativo vira "sem cobertura" em relatório, nunca produto inventado nem preço copiado. Scraping continua proibido.

### 2.6 Plataformas retrô (pergunta 6)

[dado] O enum `game_platform_gen` tem 7 valores (switch_1, switch_2, ps4, ps5, xbox_one, xbox_series, xbox_360) mais `unknown`. Não existe DS, 3DS, Wii, Wii U, SNES, N64, GBA, PS1, PS2, PS3, PSP e Vita. Consequência medida:

- **Jogos retrô entram como `unknown`:** DS (Advance Wars, Castlevania Order of Ecclesia, Final Fantasy IV, Pokémon Diamond/White), 3DS (Zelda ALBW, Tri Force Heroes, Majora's Mask 3D, Pokémon Moon, Metroid Federation Force), Wii/Wii U (Zelda Skyward Sword, BOTW Wii U, Zombi U, Nintendo Land), SNES (Super Metroid, Castlevania Dracula X, Mortal Kombat II), GBA, N64 (Zelda Master Quest), PS2, PS3 (God of War Collection, Silent Hill HD, Street Fighter IV, Mortal Kombat Komplete). São cerca de 90 a 170 produtos "unknown" entre jogos [dado: 178 ativos em `unknown`].
- **Consoles retrô entram com a plataforma errada:** PS2 (R$ 847 e R$ 600 com "20 jogos"), PS3 Slim, PSP-1000/3000 (R$ 2.030 a R$ 2.258) e Vita (R$ 3.970) estão como `ps4`; o NES Classic Edition está como `switch_2`; xbox_360 está certo.
- **Memory Card PS2 e "Jam pack Volume 11 PS2"** estão em Consoles. O Jam Pack é disco demo; Memory Card é acessório.

[conhecimento] O gamer retrô valoriza mídia original com caixa e manual, região (NTSC-U, PAL, NTSC-J), e desconfia de console "desbloqueado", "com 20 jogos" e cartucho sem etiqueta. Quase toda oferta retrô no ML é usada, e a regra interna é "só item novo" (`scripts/prune-used-condition-products.ts`, pedido do cliente de 2026-07-24). Retrô novo lacrado existe (relançamentos, estoque antigo) mas é raro e caro. Decisão de negócio que não é minha: a cartela inclui retrô ou não?

**Recomendação do veredito:** a cartela deve incluir retrô de mídia física original **somente se** o anúncio vier como novo/lacrado pelo campo `condition = new`. Mesmo assim, a média mistura edições regionais; por isso o campo região entra no título normalizado. Sem esse cuidado, "um jogo, uma média" é violada (Super Metroid americano e europeu são médias diferentes).

Consoles: PS2 e PS3 são aceitáveis como "console retrô" quando de fabricante e sem desbloqueio/jogos. **Excluir sempre:** "PS2 + 20 jogos de sua escolha", "Switch V2 D.E.S.B.L.O.Q", "Disco de desbloqueio para PS4 BDJ GoldHEN" (cadastrado como console, R$ 30) e "Nintendo Switch Oled Desbloqueado - Smash Bros 10 jogos digitais" (4 itens "desbloqueado/loja" detectados por mim, além do que a auditoria viu). Discos demo (Jam Pack, "PlayStation VR Demo Disc 1.0") ficam fora: não são produto vendável do ponto de vista do jogador e já colidiram com a regra "digital não entra".

### 2.7 Sinopse em português (pergunta 7)

[dado] Só 276 dos 1.363 jogos ativos (20%) têm descrição, e a única chave em `attributes` é `synopsis_source`. Os exemplos lidos: "Wonder Boy: The Dragon's Trap is a 2017 platform action-adventure game developed by Lizardcube..." e "Just Dance 2019 is a 2018 dance rhythm game...", em inglês, direto da Wikipédia em inglês; a auditoria já viu a "Ficha Rápida" copiada do vendedor.

**O que o gamer espera ver [conhecimento]:**
1. Gênero e proposta em uma frase ("jogo de plataforma e aventura 2D").
2. Número de jogadores e modo online/offline (Switch: portátil, TV, split-screen).
3. Idioma de áudio e legenda, em português do Brasil ou não. É a dúvida número 1 de quem compra mídia física no ML.
4. Desenvolvedora e publicadora, ano de lançamento.
5. Classificação indicativa brasileira.
6. Região da mídia (NTSC-U, PAL, NTSC-J) para retrô e importados.
7. Aviso de requisito de console/versão: Switch 2 Edition, "Upgrade Pack", se o disco é só o jogo ou traz DLC.
8. Duração aproximada e se tem DLC/season pass. Dado de terceiros: só com fonte.

**O que ele não quer ver:** texto de vendedor ("diversão garantida", "envio imediato", "novo lacrado original"), resumo traduzido por máquina com erro, spoiler, ou sinopse de outro jogo (o caso Nintendo Land / Metroid Other M).

[recomendação] Fonte primária: pt.wikipedia.org (já traz "Captain Toad" e "Sonic Unleashed" em português nos dados), com fallback para a descrição da loja oficial da plataforma. Quando só houver fonte em inglês, mostrar o campo vazio com "Sinopse em português ainda não disponível" em vez do texto em inglês: texto em inglês num site em português erode confiança, e traduzir por modelo sem revisão cria dado derivado sem rastro. Toda sinopse leva a fonte e a data.

## 3. Riscos

1. **Cartela por título é frágil.** Regex "sem marca" derruba controle bom de marca nova; sem regex deixa passar clone. Detecção: amostra manual semanal de 30 controles; taxa de reclamação "isso não é original".
2. **Mesclar bundle com console puxa média errada.** Um PS5 Slim a R$ 5.099 (com controle) e um a R$ 3.199 na mesma média faz o segundo parecer "-37%". Detecção: produto com intervalo > 1,3x entre menor e maior preço ativo.
3. **Erro de tipo no catálogo corrompe tudo que vem depois.** 53 itens `game` que são console/controle/pôster entram em média de jogo; um controle Zelda de R$ 250 não é preço de TOTK. Detecção: item `game` sem GTIN e sem título de jogo reconhecido, ou preço > 3x a mediana do título.
4. **Retrô usado vira "novo" na média.** Detecção: `condition` do ML guardado por oferta; hoje o banco não o guarda (script `prune-used-condition-products.ts` declara a limitação).
5. **Lista de títulos obrigatórios envelhece.** Detecção: cada título obrigatório sem oferta ativa há 14 dias aparece no relatório, não some.
6. **Selo "clone" feito errado ofende marca legítima nova.** Preferir "terceiro, não licenciado" a "falsificado"; só afirmar falsificação com prova.

## 4. Recomendação (em ordem)

1. **Gravar a marca.** Preencher `manufacturer`/marca a partir do atributo BRAND (e MODEL, GTIN) que o ML devolve na coleta; hoje é nulo. Sem isso a decisão 4 não é auditável.
2. **Cadastrar a lista de marcas como configuração** (tabela ou arquivo versionado, classes A/B/C acima), fora do código-fonte. Classe A: aceita com selo "Licenciado". Classe B: "Terceiro". Classe C e sem marca: fora da cartela, com log do motivo.
3. **Exclusão de peças, consumíveis e coisas que não são produto.** Lista por termo: analógico, borracha condutiva, flat, placa usb, botão/gatilho/mola, grip, caixa vazia, chave torx, CI/hdmi, pôster, guidão/manopla/bicicleta, "pc gamer", "refrigerador", "desbloqueio/desbloqueado/d.e.s.b.l.o.q" (normalizar pontos e espaços antes), "n jogos de sua escolha", "mega pack", "game stick", "jam pack", "demo disc". Aplicar a todas as consultas, inclusive Altas e baixas.
4. **Reclassificar `product_type`.** Os 53 itens `game` com cara de console/controle/pôster precisam virar console, acessório ou sair da cartela. Reaproveitar `product-type-classifier.ts`; checar antes de reprocessar com amostra, sem escrever em produção sem autorização do responsável.
5. **Bundle de primeira classe.** Incluir `bundle` em `game_edition_type` para console (ou campo próprio `bundle_contents`), selo "Bundle" visível, filtro, e **nunca na média do console sozinho**. Chave de produto: família + modelo + leitor + capacidade + edição + conteúdo do bundle. Mario Kart World + Switch 2 e PS4 + God of War entram como bundle com média própria, comparada contra "console + jogo separados" quando os dois existirem.
6. **Unificar PS5, PS4 e Xbox pelos grupos do item 2.3.** PS5 Slim Digital 825 GB tem três cards: unir os dois que são o mesmo SKU e deixar o bundle com controle à parte. Corrigir `ps4` indevido do "PS5 Slim Edição Digital". Manter Digital x com disco x Pro como produtos distintos. Seguir `findExistingMasterProduct`; não unir por título só.
7. **PS Portal:** acessório PS5, um produto, tirar dos dois cards de Console. Sem "console portátil PS5".
8. **Cobertura de títulos obrigatórios:** arquivo de config com ~100 a 150 títulos por plataforma, com TOTK edição padrão, Mario Kart 8 Deluxe físico, Ghost of Tsushima, Bloodborne, Uncharted, Last of Us, FC 25, Monster Hunter, Dark Souls e os outros listados em 2.5. Busca `/products/search` com validação por título+plataforma. Relatório de lacuna semanal (título sem oferta ativa). Normalizar ™, ® e "Deluxe" na busca.
9. **Retrô:** se o responsável aprovar, ampliar o enum com `ps1, ps2, ps3, psp, vita, wii, wii_u, ds, 3ds, snes, n64, gba, nes` (mais campo `region`), extrair a plataforma do título (F-16, 89 jogos sem plataforma), exigir `condition = new` e excluir desbloqueado. Antes disso, ao menos corrigir o rótulo errado (PS2/PS3/PSP/Vita como "ps4"; NES Classic como "switch_2").
10. **Sinopse:** pt.wikipedia primeiro; sem fonte em português, campo vazio com aviso; remover a "Ficha Rápida" de vendedor; mostrar os 8 campos do item 2.7 quando houver dado com fonte.

**NÃO fazer:** não criar marca ou licença por palpite (a lista é do responsável, com fonte oficial do programa de licenciamento); não aplicar o selo "falsificado"; não traduzir sinopse por modelo sem revisão e sem rastro; não preencher título obrigatório com preço de outra edição; não escrever no banco sem autorização.

## 5. Dado que falta

1. Atributo BRAND/MODEL/GTIN/`condition` por oferta (ML) para os controles e consoles: qual percentual das ofertas ativas já devolve BRAND?
2. Ranking oficial de mais vendidos (ML "mais vendidos" por categoria na API oficial e/ou listas de publishers) para trocar a lista de títulos obrigatórios por dado real.
3. Quantos jogos `unknown` são realmente retrô, e quantos desses têm `condition = new` na oferta.
4. Quantos produtos `game` são, de fato, console/acessório/pôster (os 53 vêm de regex minha, não de verificação linha a linha).
5. Quais PS5/PS4/Xbox do grupo 2.3 têm GTIN ou SKU da loja que confirme o mesmo produto.
6. Decisão do responsável: cartela inclui retrô? Aceita classe B (GameSir, Dobe) com rótulo "Terceiro"?
7. Percentual de jogos com sinopse em português hoje (a leitura sugere perto de zero em português; medir pelo idioma).

## 6. Métrica de sucesso

1. 0 clones sem marca e 0 peças de reparo na cartela de acessórios em auditoria de amostra de 100 itens.
2. `manufacturer` preenchido em 90% ou mais dos controles e consoles ativos.
3. Cada grupo da seção 2.3 = 1 card; 0 produtos com intervalo de preço ativo acima de 1,3x quando o grupo é o mesmo SKU.
4. 100% dos bundles com selo; 0 bundle na média de console puro.
5. PS Portal: 1 produto, só em Acessórios.
6. 100% dos títulos obrigatórios com oferta ativa, ou na lista de lacuna com motivo; TOTK padrão físico e Mario Kart 8 Deluxe físico aparecendo na busca por nome.
7. 0 produto `game` que seja console, acessório ou pôster.
8. Retrô: 0 item com plataforma errada; nenhum "desbloqueado" na cartela.
9. 100% das sinopses exibidas em português e com fonte; 0 texto de vendedor.

## Divergências registradas

- Auditoria diz que Mario Kart 8 Deluxe "não aparece"; o banco tem o digital e o físico com Booster Pass. A divergência é de busca/normalização, não só de cobertura.
- Auditoria e estrategista falam em "aceitar PowerA, Hori, 8BitDo": acrescento classe B e a exigência de marca estruturada; sem ela, a regra vira regex frágil.
- Sobre retrô: a regra "só item novo" (2026-07-24) pode esvaziar a categoria. Decisão de negócio, não minha.
