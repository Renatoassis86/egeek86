# Parecer do Guardiao do Catalogo - Vitrine de Ofertas segmentada

Reuniao do Conselho Geek de 2026-11-01. Autor: guardiao-catalogo. Consultivo; decisao de negocio e do responsavel.
Escopo: somente leitura. Nenhum codigo editado, nenhuma gravacao no banco. A medicao usou uma transacao READ ONLY e um script temporario fora do repositorio (scratchpad), com os mesmos imports de producao (`classifyCatalogItem`, `readPlatform`, NB do `product-type-classifier`).

Legenda: [MEDIDO] = numero lido do banco hoje; [LIDO] = li titulo a titulo, sem rotulo formal; [HIPOTESE] = ainda nao medido; [RECOMENDACAO].

## 0. Base medida [MEDIDO]

- 5.861 `master_products` vivos (sem `mergedInto`); 2.086 com ao menos uma oferta `active` e preco > 0 (universo dos numeros abaixo; e um teto, nao aplica o filtro de oferta publica da ADR 0002).
- Tipo gravado (`product_type`) nesses 2.086: game 1.507, accessory 460, console 119.
- Tipo efetivo pela cartela (`classifyCatalogItem`): 1.703 visiveis (game 1.284 + console 117 + accessory 302) e 383 escondidos (off_catalog 292, part 49, merchandise 42).
- Divergencia entre tipo gravado e tipo efetivo dentro da cartela: 81 masters (game>console 25, game>accessory 39, console>accessory 12, accessory>console 5). Somando os 383 escondidos, 464 de 2.086 (22,2%) tem `product_type` que a propria cartela contradiz. No catalogo inteiro (5.861) sao 1.453 divergencias, escondidos incluidos.
- Plataforma: `game_platform_gen` = unknown em 180 dos 1.703 visiveis (10,6%); depois de `readPlatform` ainda 174 (so 6 resgatados), dos quais 75 citam plataforma legada fora do enum e 99 nao tem nenhuma pista (33 acessorios multiplataforma, 62 jogos, 4 consoles).
- Fabricante/familia (Nintendo, Sony, Microsoft...): nao existe coluna. Hoje "Nintendo" = `switch_1|switch_2`, "PlayStation" = `ps4|ps5`, "Xbox" = `xbox_one|xbox_series` (page.tsx linhas 131-143). Wii, 3DS, DS, N64, SNES, PS1-3, PSP, Vita e Xbox 360 ficam fora das vitrines de familia. Fora do enum existem hoje 75 itens visiveis (acessorio Wii 8, PS3 16; jogo 3DS 12, PS3 11, DS 8, PS2 6, Wii 5...).

## 1. Diagnostico: por que o acessorio vaza

Causa principal (confirmada nos dados e no codigo): **duas fontes de verdade para o tipo**.

1. `listRankedOffers`/`getFeaturedOffers` aplicam `catalogDimensionFilter`. Sem o parametro `tipo`, esse filtro so remove os "escondidos" (off_catalog/part/merchandise). Ele NAO reescreve o tipo dos que foram apenas retipados (`toType`), isso so acontece quando a aba pede `tipo=...`.
2. Depois da consulta, `ofertas/page.tsx` monta as prateleiras com `o.masterProduct.productType` cru do banco (`isGameOrConsolePhysical`, linhas 120-122, e `accessoryOffers`, linha 144). Ou seja, o item que a cartela ja sabe ser acessorio, mas esta gravado como `console`, passa no filtro e cai na prateleira de console.
3. Mensuracao: dos 1.062 itens que passam em `isGameOrConsolePhysical`, 14 tem tipo efetivo diferente (12 console>accessory, 1 game>console, 1 game>accessory); e 5 itens `accessory` gravados sao de fato consoles e aparecem na prateleira de acessorios. Sao 19 itens trocados de prateleira (1,8% das prateleiras de jogo/console), exatamente a faixa que o dono ve.

Casos citados pelo dono, todos reproduzidos no banco:

| Titulo | Gravado | Efetivo | Por que aparece |
|---|---|---|---|
| Stand Mesa Base Vertical Playstation 5 Ps5 Slim Fat | console | accessory (`base vertical`) | prateleira usa tipo gravado |
| Memory Card 16mb Para Playstation 2 (12 ofertas ativas) | console, plataforma ps4 | accessory (`memory card`), plataforma real PS2 | idem; alem disso plataforma errada |
| Cooler Ventoinha Interna para PS4 Fat (ventilador) | console | accessory (`cooler`) | idem |
| Pe Horizontal De Xbox One S - Resfriamento (suporte) | console | accessory (`resfriamento`) | idem |
| Halo Infinite Xbox One Series X Combo Midia Fisica + Baralho (7 ofertas) | game | game com flag bundle | **defeito do classificador, nao da pagina**: `baralho` e sinal fraco de merchandise, e a midia fisica no titulo o anula. A cartela hoje chama de jogo um combo jogo+brinde |

Causas secundarias [MEDIDO/LIDO]:

- Origem do tipo errado no banco: `product_type` tem DEFAULT 'game' e a classificacao so entra na descoberta (Shopee/Magalu nao tinham tipo ate 2026-08-02; achado do proprio `product-type-classifier.ts`). O NB foi treinado com os proprios rotulos do banco (1.859 docs, holdout 96,0% em 372 docs), logo a acuracia de 96% mede concordancia com rotulo ruidoso (ao menos ~4% do banco contradiz a cartela), nao verdade.
- Falsos negativos da cartela (regex de substantivo "primeiro vence" e "midia antes do substantivo mantem jogo") [LIDO, busca por 56 titulos com palavra suspeita entre 1.401 visiveis de jogo/console]: `Camera Hori Piranha Plant Para Nintendo Switch 2` e `Camera Piranha Plant - Nintendo Switch 2` (game), `Para Nintendo Switch/OLED Console Jogo Saco De Armazenamento Tema Zelda` (game, "jogo" aparece antes de "saco"), `Porta Cartao Cartuchos de Jogos (6 Em 1) Bloco Mario` (game), `Kit Mantinha Com Balde Super Mario` (game, e merchandise). Sao 5 achados com busca dirigida, portanto piso, nao taxa.
- Falsos positivos [LIDO]: `Gran Turismo 7 PS4 Jogo de Corrida ... 110GB` retipado para console pela regra `capacidade` (tamanho de instalacao do jogo); `Kit Manta Poliester Casal + Balde de Pipoca God of War` retipado para acessorio (e merchandise); `Super Mario Party para Nintendo Switch com Joy-Con` retipado para acessorio (e combo jogo+hardware, caso limite real). Entre ~64 retipados que li, 3 estavam errados (ordem de 5%); sem rotulo formal, isso e indicio.
- Plataforma gravada errada para retro [MEDIDO]: 9 visiveis com plataforma moderna e titulo legado (Playstation Portatil PSP x3 = ps4, PS3 Slim = ps4, PS2 = ps4, PS Vita = ps4, NES Classic = switch_2, Jogo Wii Sonic = switch_1). Mais 32 conflitos banco x titulo, quase todos titulos multi-geracao ("Xbox One / Series X"), que o campo de valor unico nao representa.
- Quantidade de marcados como bundle: 71 visiveis (console 35, acessorio 25, jogo 11); a flag existe mas a pagina nao a usa para tirar da prateleira nem da media.

Veredito: acessorio vaza porque (a) a prateleira confia no campo bruto, (b) o campo bruto nunca foi corrigido por gravacao, (c) a cartela por regex tem pontos cegos conhecidos, (d) a plataforma e o fabricante nao tem modelo proprio.

## 2. Desenho: classificador em camadas

Principio: **uma unica funcao de classificacao, uma unica saida tipada, gravada e lida do mesmo lugar**. Nenhuma tela decide tipo por regex nem por campo bruto. Fail-closed: o que nao tem confianca nao entra em prateleira de jogo/console/acessorio.

### 2.1 Taxonomia final (saida da classificacao)

| Campo | Valores | Observacao |
|---|---|---|
| `kind` | GAME, CONSOLE, ACCESSORY; fora da cartela: PART, MERCH, OFF_VERTICAL, DLC_DIGITAL, USED_OR_CLONE | os 3 primeiros sao as abas; os demais ficam escondidos e preservados |
| `accessory_subtype` | controller, audio, power_cable, storage, protection_case, stand_cooling, camera_peripheral, wheel_arcade, other | so para ACCESSORY; alimenta filtros futuros |
| `platform_family` | nintendo, playstation, xbox, sega, atari, pc_valve, retro_other, multi, unknown | e o eixo da regra do dono: "jogo da Nintendo", "console da Nintendo", "acessorio da Nintendo" = `kind` x `family` |
| `platform` | switch_2, switch_1, ps5, ps4, ps3, ps2, ps1, psp, vita, xbox_series, xbox_one, xbox_360, xbox_original, wii_u, wii, 3ds, ds, gamecube, n64, snes, nes, gba, gb, megadrive, dreamcast, atari_*, pc, unknown | enum precisa crescer (hoje 8 valores). Familia deriva da plataforma por tabela, nao por regex |
| `platforms_compat` | lista | acessorio/jogo multi-geracao ("Xbox One/Series X"): `platform` = plataforma principal da caixa; lista guarda a compatibilidade; filtro de plataforma casa com a lista |
| `generation` | 9a (switch 2, ps5, series), 8a (switch, ps4, one), 7a (wii, ps3, 360, ds, 3ds, psp, vita)... | derivada por tabela de `platform` |
| `hardware_maker` | first_party, third_party:<marca> | opcional; "Controle PowerA Switch" e acessorio da Nintendo (plataforma), nao fabricado por ela. Nao confundir com `platform_family` |
| `format` | physical, digital, unknown | digital sai da cartela ja hoje |
| `composition` | single, bundle_console_game, bundle_game_accessory, bundle_game_merch, multipack_games | substitui o booleano `bundle` |
| `confidence` + `decided_by` + `evidence[]` | 0-1, camada, termos | auditavel, base da fila de revisao |

Regra do dono, formalizada: `titulo da prateleira = kind x platform_family`. Console Nintendo e CONSOLE/nintendo, Joy-Con de Switch e ACCESSORY/nintendo, Mario Kart Switch e GAME/nintendo; PS2 Memory Card e ACCESSORY/playstation (plataforma ps2).

### 2.2 Camadas (ordem de precedencia)

Camada 0, normalizacao: fold de acento/caixa, pontuacao, letras espacadas ("D.E.S.B.L.O.Q"), unificacao de sinonimos ("playstation 5|ps5|play 5", "x box"), unidades (825gb, 1tb), numerais romanos. Reaproveita `foldTitle`. Tokenizacao por palavra + n-gramas de 1-3 palavras e de caracteres 3-5 (tolera grafia deturpada "nitendo").

Camada 1, atributos estruturados do marketplace (vence o texto quando existir e for consistente): arvore de categoria do Mercado Livre (`resolveMeliCategoryProductType` ja existe), CONSOLE_VERSION/ITEM_CONDITION/FORMAT, categoria da Shopee/Magalu quando a API oficial a devolver, EAN/GTIN quando houver, catalogo `catalog_product_id`. Peso alto, mas nao absoluto: o proprio ML cataloga errado (incidente de 2026-07-29), entao conflito estrutural x texto vai para a camada 4.

Camada 2, regras ponderadas por lexico de classe (evolucao do regex atual, sem quebrar os 209 casos):
- Lexicos separados por classe e subtipo (controle, headset, cabo, fonte, dock, memory card/SD, capa/case/saco/estojo/porta-cartucho, cooler/ventoinha/stand/base/suporte/pe, camera/kinect/move, volante/pedal/arcade; para console: console, videogame, modelos, capacidade com contexto; para jogo: jogo, midia, edicao, DLC, ano/numeral de franquia).
- Em vez de "primeiro match vence", pontuacao: peso por termo x posicao (substantivo-nucleo = primeiro substantivo de classe fora de clausula de compatibilidade) x forca (forte 3, fraco 1) x negacao ("sem controle", "nao inclui"). Remove clausulas "para/compativel com/for <plataforma>" antes de pontuar (a plataforma ali e alvo, nao produto), o que resolve "Saco de Armazenamento ... Console Jogo" e "Camera ... Para Nintendo Switch 2".
- Tamanho em GB so conta como console se NAO houver sinal de jogo (ano, "jogo", "midia", franquia) - resolve "Gran Turismo 7 ... 110GB".
- Marcas de acessorio (PowerA, Hori, 8BitDo, Logitech, Nacon, SanDisk, Dobe, Ipega) como lexico auxiliar de peso medio; marca de console (Sony/Microsoft/Nintendo) sozinha nao decide.
- Detector de composicao: separadores "+", "com", "kit", "combo", "e" quebram o titulo em componentes; cada componente recebe a classe; ver 2.3.

Camada 3, modelo estatistico (so quando camadas 1-2 empatam ou ficam abaixo do limiar): TF-IDF (palavras 1-2 + caracteres 3-5) com regressao logistica multinomial calibrada (Platt/isotonica), ou Naive Bayes complementar como baseline barato. Tem de ser treinado com **rotulos humanos (conjunto ouro, secao 3)**, nao com `product_type` do banco, que e o ruido que queremos corrigir. Medicao: o NB atual concorda com a cartela em 1.636 de 1.703 visiveis (96,1%); nas 67 discordancias, olhando as de maior confianca, o NB erra quando a franquia domina ("Controle ... Zelda" vira game com p=0,92-1,00; "Console ... com Controle Adicional" vira accessory com p=0,91-0,98). Conclusao: o modelo e desempatador e detector de anomalia, nunca juiz sozinho; bom para achar candidatos a revisao, ruim como autoridade.

Camada 4, resolucao de conflitos, confianca e fila de revisao:
- Conflito = camadas discordam, ou composicao ambigua, ou estrutura x texto divergem, ou plataforma nao resolvida.
- Confianca final = combinacao calibrada (acordo entre camadas eleva; conflito derruba). Limiares: >= 0,90 publica; 0,60-0,90 publica apenas na busca/ficha, fora das prateleiras comerciais; < 0,60 ou conflito = `needs_review`, escondido das vitrines.
- Fila `catalog_review` (id, master_id, proposta, evidencia, camadas, estado). O dono ou o guardiao decide; cada decisao vira exemplo rotulado novo (aprendizado) e regra de excecao auditavel (`overrides` por master, nunca por regex que o tempo deforma).
- Decisao humana fixada (`human_locked=true`) nunca e sobrescrita por reclassificacao automatica.

### 2.3 Casos limite - regra proposta (decisao do dono onde indicado)

| Caso | Regra proposta |
|---|---|
| Console + jogo(s) / controle extra ("PS5 + Astro Bot", "Xbox 360 com Kinect e 18 jogos") | CONSOLE, `composition=bundle_console_game`; selo Bundle; fora da media e do menor preco do console puro (ja e regra da cartela). Console com controle da caixa NAO e bundle |
| Jogo + brinde de merchandise ("Halo Combo + Baralho", "God of War + balde de pipoca") | GAME, `composition=bundle_game_merch`, edicao propria; nao entra na media do jogo simples, nao entra em destaque. Hoje o Halo passa como jogo comum: **decisao do dono**: mostrar com selo ou esconder da vitrine |
| Jogo + acessorio de hardware ("Super Mario Party com Joy-Con", "Mario Kart + volante") | Bundle de hardware: kind pelo componente de maior valor, aqui ACCESSORY/BUNDLE com selo; nunca na prateleira de jogo puro. Precisa regra explicita; hoje e decidido por acaso (Mario Party vira acessorio) |
| Multipack de jogos ("Combo 3 GTA V", "Banjo Kazooie e Viva Pinata") | GAME, `multipack_games`, fora da media de jogo unico (ja existe como flag) |
| Console retro (PS2, Wii, NES Classic, Xbox 360) | CONSOLE com plataforma/familia corretas; sujeito a decisao pendente "retro entra na cartela?" e a regra "so item novo" (quase toda oferta retro e usada). Clones e "game stick" ja saem como OFF |
| Console em edicao de jogo (Switch OLED Zelda, PS5 Spider-Man) | CONSOLE (sinal de hardware vence franquia). Nome do jogo no titulo nao e evidencia de classe |
| Jogo digital / codigo / gift card / DLC | fora da cartela (DLC_DIGITAL), preservado. "Midia Digital" de PC idem |
| Peca de reposicao (flat flex, analogico, carcaca, ventoinha interna) | PART, escondida; "Cooler Ventoinha Interna para PS4 Fat (CUH-...)" e peca; "Cooler externo para PS5" e ACCESSORY/stand_cooling. Fronteira: reposicao interna vs periferico externo |
| Capa/case/estojo/saco/porta-cartucho/pelicula/skin | ACCESSORY/protection_case quando o alvo e console/controle/jogo fisico; "capa de jogo", "somente caixa/encarte" = PART; "capa" de livro/celular = fora |
| Cartao de memoria | ACCESSORY/storage com plataforma: "Memory Card PS2" = ps2; SD/microSD "para Switch" = switch; SD generico sem plataforma de console = OFF (regra ja existente) |
| Dock, base de carga, stand, suporte, pe, cooler | ACCESSORY (stand_cooling/power_cable). Nunca CONSOLE por conter "PS5 Slim" no titulo; a plataforma vira `platform`, nao `kind` |
| PS Portal, Kinect, camera, volante, headset | ACCESSORY (PS Portal ja tratado) |
| Acessorio multiplataforma ("Headset Xbox/PS4/PC") | ACCESSORY, `platform_family=multi`, `platforms_compat` com a lista |
| Titulo "nu" ("Nintendo Switch 2", "PS4") | CONSOLE se for aparelho; jogo nunca tem so o nome da plataforma |
| Produto usado/seminovo/clone | USED_OR_CLONE, escondido (regra de 2026-07-24 mantida) |

## 3. Como medir assertividade sem dado fake

1. **Conjunto ouro rotulado a mao a partir de dados reais.** Amostra estratificada dos `master_products` ativos (nome real + tipo gravado + plataforma gravada + categoria do marketplace), nada sintetico. Estratos: por tipo efetivo previsto (game, console, accessory, escondidos), por familia, e **sobreamostragem das discordancias** entre camadas (cartela x NB x banco) e dos 81 retipados. Tamanho minimo sugerido: 400 predito-jogo, todos os ~120 consoles, 300 acessorios, 150 escondidos, 150 discordancias, 100 plataforma unknown = ~1.200 itens. Justificativa: para provar que o vazamento esta abaixo de 2% com 95% de confianca e preciso ao menos 150 itens limpos por prateleira (regra dos 3); 400 permite meta de 1%.
2. Rotulacao: duas pessoas independentes (dono + guardiao), 15% em dupla para kappa de Cohen >= 0,85; divergencias decididas e documentadas. Rotular `kind`, `platform`, `platform_family`, `composition` e uma bandeira "incerto".
3. Divisao treino/teste **por familia de titulo** (mesmo jogo em varias lojas nao pode estar nos dois lados), 70/30; o teste nao e usado para ajustar regra. Os 209 casos de `scripts/test-dimensions.ts` continuam como regressao (evitar quebrar), mas NAO medem acuracia, porque foram escritos por quem escreveu a regra.
4. Metricas: matriz de confusao kind x kind (com a classe "fora"), precisao e recall por classe, F1; **taxa de vazamento por prateleira** = itens exibidos cujo rotulo ouro nao e a classe da prateleira (a metrica que o dono sente); acuracia de plataforma e de familia, cobertura (fracao com plataforma resolvida), tamanho da fila de revisao, e concordancia entre camadas. IC de Wilson de 95% em tudo.
5. **Metas** [RECOMENDACAO, a validar]: precisao >= 99% em game e console e >= 98% em accessory nas prateleiras (vazamento <= 1%); recall >= 95% (o que sobra vai para a fila, nao some); plataforma correta >= 97% nos resolvidos, `unknown` <= 3% dos visiveis (hoje 10,2%); fila de revisao <= 10% do volume; zero item de `human_locked` sobrescrito.
6. Monitoramento continuo: a cada coleta nova, amostra de 100 itens por mes rotulados para detectar deriva; relatorio de vazamento no QA antes de cada publicacao (a metrica entra no `checklist-publicacao`).
7. Linha de base ja disponivel: os numeros da secao 0 e 1. Eles nao sao acuracia (sem rotulo ouro), so contagem de discordancia; nao devem ser apresentados como acuracia.

## 4. Plano de execucao

Etapa A - so codigo, sem gravar nada (curta, resolve o que o dono ve):
1. A pagina e as queries passam a ler o tipo efetivo (uma funcao unica `effectiveCatalogType`), nunca `masterProduct.productType` cru; `catalogDimensionFilter` sem `tipo` tambem aplica `toType` nas prateleiras. Resolve os 19 itens trocados medidos, os 4 casos citados (exceto Halo).
2. Consertos de regra com teste: clausula de compatibilidade removida antes de pontuar; GB so como console sem sinal de jogo; camera/saco/porta-cartucho/porta-cartao; combo jogo+brinde e jogo+hardware como `composition`, fora das prateleiras comerciais e da media. Adicionar a cada correcao os titulos reais deste parecer como casos de teste.
3. Prateleiras de familia por `platform_family` em vez de lista de enum (Nintendo = switch_1, switch_2 e retro Nintendo), ainda lendo plataforma derivada em runtime (`readPlatform`) ate o enum crescer.
4. Script somente leitura de auditoria (evolucao de `audit-segmentacao.ts`) que emite o relatorio de vazamento e a amostra a rotular. Sem escrita.

Etapa B - conjunto ouro e modelo (sem gravar no catalogo):
5. Gerar a amostra estratificada (CSV) a partir do banco em leitura; rotulagem humana; calcular a linha de base real da cartela atual e do NB atual.
6. Treinar TF-IDF + regressao logistica calibrada sobre o ouro; comparar com regras; combinar na camada 3; medir contra as metas. So entra se bater as metas.

Etapa C - grava no banco (depende de aprovacao do responsavel, e so com backup e log reversivel):
7. Migration aditiva: novas colunas (`catalog_kind` ou reaproveitar `product_type`, `platform_family`, `composition`, `classification_confidence`, `classification_source`, `human_locked`) e novos valores do enum de plataforma (ADD VALUE e irreversivel: fazer em migration propria e revisada pelo dba-postgres). Tabela `catalog_review` e tabela de log `catalog_reclassification_log` (id, master_id, campo, valor_antigo, valor_novo, camada, evidencia, lote, data).
8. Backup antes de cada lote (snapshot das colunas afetadas por id em CSV/tabela de backup), dry-run com relatorio, aplicar em transacao unica, lote pequeno primeiro (itens de alta confianca: ex. os 12 console>accessory), conferir, depois o resto. Reversao por script que le o log.
9. **Nunca apagar.** O que sai da cartela vira `kind` escondido, nunca DELETE; duplicata so por `mergedInto` (padrao existente). Respeitar a regra de um jogo, uma media: reclassificar de tipo ou plataforma pode revelar duplicata nova (ex.: o mesmo titulo marcado ps4 e ps2) - rodar `findExistingMasterProduct` antes de mudar plataforma.
10. Plataforma: ordem sugerida - (i) corrigir os 9 retro com plataforma moderna errada e os 75 sem rotulo; (ii) so depois da migration do enum, gravar plataforma legada; dry-run ja existe em `docs/segmentacao-plataformas-legadas-2026-11-01.md` (51-57 masters).
11. Entrada de novos itens: a descoberta (ML, Shopee, Magalu) passa a chamar a mesma funcao de classificacao antes de inserir; item sem confianca vai para `needs_review` em vez de herdar `game` por default (remover o DEFAULT 'game' em migration posterior).
12. QA (`qa-verificador`) confere: leitura do banco pos-lote, relatorio de vazamento, tela de /ofertas no navegador, regra de dedup, e `checklist-publicacao`.

Dependencias de outros especialistas: dba-postgres (migration, enum, backup/rollback), engenheiro-backend (funcao unica e cache `catalog-dimension-overrides`), gamer-veterano (rotulagem de edicoes e retro), especialista-precos/estatistico-senior (exclusao de bundle da media, intervalos de confianca), qa-verificador.

## 5. Riscos

1. **Falso negativo de acessorio continua existindo** enquanto houver regex: a busca dirigida achou 5 em 1.401; a taxa real so se sabe com o ouro. Mitigacao: fail-closed + fila.
2. **Rotulo circular**: treinar o modelo com `product_type` do banco reaprende o erro (~4% a 22% de contradicao conforme o criterio). Mitigacao: so rotulo humano.
3. **Franquia/edicao confunde modelo e regra** (Controle Zelda, Console Zelda). Mitigacao: substantivo-nucleo e sinais de hardware acima do nome do jogo.
4. **Esconder demais**: hoje 94 jogos "(Digital)" e 28 controles "compativel" ficam fora; um falso positivo some um produto real. Mitigacao: relatorio de escondidos na amostra ouro, revisao de recall.
5. **Mudar `kind` ou plataforma cria duplicata ou funde medias** (regra um jogo, uma media). Mitigacao: dedup antes de gravar; nunca apagar.
6. **ADD VALUE no enum e irreversivel** e quebra os mapas fechados (labels, buscas, facets). Mitigacao: migration separada; alternativa `attributes.legacyPlatform` ate a decisao do dono.
7. **Plataforma de valor unico nao representa titulo multi-geracao** (32 conflitos medidos). Sem `platforms_compat` o filtro continua errado para esses itens.
8. **Decisoes de negocio pendentes**: retro entra na cartela? combo jogo+brinde aparece? bundle jogo+hardware aparece e onde? Sem resposta o codigo decide por acaso.
9. **Cache de 5 min** das excecoes (`catalog-dimension-overrides-v2`) atrasa o efeito de correcoes e pode mascarar teste de QA.
10. **Dado de ofertas com status/preco**: os numeros usam `status=active` e preco > 0; o conjunto exibido segue a regra de oferta publica (ADR 0002), entao parte dos 19 trocados pode nao estar no ar; confirmar no navegador antes de comunicar numero ao dono.

## 6. Resumo para decisao

Corrigir a leitura (Etapa A) e barato e reversivel, e resolve de imediato os exemplos do dono, exceto o Halo, que depende de regra de composicao. A segmentacao rigorosa por tipo x familia x plataforma exige o conjunto ouro e uma migration (Etapa C), que so deve ocorrer com backup, log por id e aprovacao.
