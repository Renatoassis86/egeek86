# Cestas por modelo (NLP leve): sugestões de 2026-11-22

Modo padrão **sugerir**: nada foi gravado. Gerado por `scripts/cesta-nlp.ts sugerir` (R-115). Regras do dono respeitadas: região, cross-geração, edição limitada e combos separam; cor junta; Open Box e usado fora; peça e acessório nunca entram na cesta do principal; PS5 ignora capacidade; decisão humana (`catalogGate.manual`) nunca é desfeita.

## Método, medição e o que foi aplicado (leia primeiro)

**Como a cesta é formada hoje.** Cesta = `master_products` + ofertas ligadas. No Mercado Livre o título da oferta é o do catálogo (igual ao do master em 88% das ofertas lidas); Shopee e Amazon entram por casamento de título, e masters novos nascem por título + plataforma normalizados (jogos, `findExistingMasterProduct`) ou por chave de catálogo (GTIN, MPN+marca, marca+modelo). A média só tirava da conta condição não nova, cross-geração e formato de jogo (`offerExcludedTitleSql`): código de modelo, capacidade, voltagem, região, pack, variante, bundle e peça/acessório não eram conferidos depois da ligação.

**Método de medição (consultas leves, paginadas, somente leitura).** 19.586 masters e 61.7 mil ofertas lidos em páginas de 3-4 mil linhas com pausa; análise 100% local. Para cada amostra sorteada (sementes 20261122, 777123, 424242, 99887; 7 tipos de produto: console/Switch/PS5/Xbox, impressora 3D Bambu e resina/filamento, fone/headset, TV, notebook/periféricos, livro e air fryer; lojas ML, Shopee e Amazon) eu li o par (nome do master, título da oferta) SEM ver a decisão do modelo e rotulei: mesmo produto pelas regras do dono (cor junta; região, voltagem, capacidade exceto PS5, combo x avulso, edição, variante e peça x produto separam) ou diferente. Pares ambíguos ficaram fora (?). Só ofertas com título diferente do nome do master entram (as idênticas são certas por definição).

| Amostra | Rótulos | Ofertas erradas na cesta (antes) | NLP: acertos / falsos / perdidos | Precisão | Revocação |
|---|---|---|---|---|---|
| 20261122 (usada para ajustar) | 155 | 17 (11,0%) | 14 / 0 / 3 | 1,00 | 0,82 |
| 777123 (usada para ajustar) | 157 | 17 (10,8%) | 13 / 0 / 4 | 1,00 | 0,77 |
| 424242 (usada para ajustar) | 120 | 18 (15,0%) | 11 / 0 / 7 | 1,00 | 0,61 |
| 99887 (sorteada por último; 1 falso positivo antes do ajuste final) | 92 | 11 (12,0%) | 9 / 0 / 2 | 1,00 | 0,82 |
| **Total** | **524** | **63 (12,0%)** | **47 / 0 / 16** | **1,00** | **0,75** |

Antes: a camada SQL de elegibilidade tirava 0 dessas 63 ofertas erradas; a checagem de identidade de jogo já existente (`evaluateOfferIdentity`) pegava 20 das 63 mas tirava 101 ofertas certas (precisão 0,17). Depois: restam 16 em 524 (3,1%), nenhuma oferta certa foi tirada. **Atenção:** as três primeiras amostras guiaram os ajustes das regras; a quarta foi lida às cegas e a única correção feita depois dela (lista de componentes truncada vira dúvida, "Jap" é importado) está no código; na leitura às cegas, antes dessa correção, a precisão foi 0,89 (1 falso em 9) e a revocação 0,73. Intervalos são largos (n pequeno); tratar como ordem de grandeza.

**Divisão (mesmo produto em masters diferentes).** 108 pares rotulados (candidatos grosseiros por Jaccard cru >= 0,5): em confiança >= 0,97 o modelo juntou 3 de 21 pares realmente iguais com 0 fusão errada (revocação 0,14, de propósito: título livre tem muito texto descritivo); em >= 0,90 (só sugestão) 8 acertos e 2 erros. O processo atual (`isSameProduct`) junta 5 de 21 com 1 erro. A divisão fica majoritariamente como SUGESTÃO para revisão.

**Aplicado nesta sessão (reversível).** Lote 1: 20 ofertas em quarentena `cesta_nlp_conflito_duro` (eixos objetivos: modelo, capacidade, peça x produto) + 5 junções de masters duplicados (7 ofertas movidas para o master canônico). Lote 2: 37 ofertas em quarentena (numeral, plataforma, linha, variante, região); 3 do plano foram puladas porque mudaram. Total: 57 ofertas fora da média e 7 movidas; envio medido (enviadas na última hora) 212 -> 213 e 211 -> 211, sem queda. Backup lógico e logs: `docs/backups/cesta-nlp-backup-*.ndjson` e `cesta-nlp-log-*.json` (rollback: `scripts/cesta-nlp.ts rollback --log <arquivo> --apply`). Nada de decisão humana (`catalogGate.manual`) foi tocado. Restam como sugestão: as demais ofertas fora da cesta (edição, composição, marca, ofertas em cestas de nome suspeito, ofertas já em quarentena), as cestas mistas e os pares de masters abaixo de 0,97.

**Efeito na média (preço atual das ofertas ativas, antes x depois de tirar o que saiu).** Microfone Samson C02: média R$ 981,56 -> R$ 853,89 (saíram o C01U de R$ 1.759 e o C03). Fone JBL Tune 125BT: R$ 276,74 -> R$ 245,98 (saíram os Tune 520BT, 720BT, 530BT e Flex). Secadora Electrolux STL11: R$ 2.001,08 -> R$ 1.815,66 (saiu a STH11 de R$ 3.299). Medido sobre o preço corrente, não sobre a série oferta-dia (dias fechados não são reescritos, R-20).

**Não verificado.** Revocação em tipos fora dos 7 amostrados; efeito sobre a série oferta-dia e sobre o `price_daily_state` dos masters que receberam ofertas por junção (o estado de dias fechados não é reescrito); se a Shopee/ML recoloca as ofertas em quarentena quando a coleta as relê (a quarentena não é apagada pela coleta, mas não foi observado um ciclo completo); falsos positivos em ofertas das lojas pequenas com título muito curto.

---

## Medida desta rodada

- Masters lidos: 19596; ofertas ativas/rascunho lidas: 61714 (45 s de leitura e análise, consultas paginadas).
- Ofertas com título IDÊNTICO ao do master (certas por definição): 54606. Ofertas que o modelo precisou julgar: 7107.
- **Ofertas com conflito duro com o produto da cesta (fusão errada): 489** em 279 cestas (0.79% das ofertas; 6.88% das que o modelo julgou).
- Cestas em que o NOME do master é o suspeito (a maioria das ofertas diverge dele): 26. Nada é aplicado nelas; a lista está no fim.
- Pares de masters que parecem o mesmo produto (divisão): 406; com confiança >= 0.97 e sem trava: 26; destes com ofertas ativas a mover: 26.

### Conflitos por eixo

| Eixo | Ofertas |
|---|---|
| numeral_ausente | 95 (só sugestão) |
| papel | 93 |
| modelo | 75 |
| composicao | 65 (só sugestão) |
| variante | 46 |
| edicao | 44 (só sugestão) |
| plataforma | 27 |
| numeral | 24 |
| regiao | 17 |
| linha | 11 |
| capacidade | 10 |
| marca | 9 (só sugestão) |
| numeral_parcial | 6 (só sugestão) |
| pack | 4 |
| spec_hp | 3 |
| condicao | 2 |
| spec_l | 2 |
| componentes | 1 (só sugestão) |
| tipo | 1 |
| resolucao | 1 |

### Por tipo de cadastro

| Departamento/tipo | Ofertas | Fora da cesta | % |
|---|---|---|---|
| games/game | 10657 | 180 | 1.7% |
| eletrodomesticos/general | 8087 | 124 | 1.5% |
| tecnologia/general | 10694 | 48 | 0.4% |
| eletroeletronicos/general | 9551 | 40 | 0.4% |
| games/accessory | 3705 | 27 | 0.7% |
| games/console | 1125 | 26 | 2.3% |
| impressao3d/general | 1979 | 23 | 1.2% |
| esporte/general | 6783 | 19 | 0.3% |
| livros/general | 4157 | 2 | 0.0% |
| beleza/general | 4397 | 0 | 0.0% |
| brinquedos/general | 578 | 0 | 0.0% |

## 1. Ofertas fora da cesta (489); aplicáveis em lote: 104 (mover 2, quarentena 102)

| Ação | Rede | Oferta | Produto da cesta | Conflito | Aplicável |
|---|---|---|---|---|---|
| quarentena | sho | Botão LB RB Compatível Controle Xbox Series X S | 2 Botões LB RB Compatível Controle Xbox Series X S | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | 5 - Botões Gatilho Rb Lb Controle Xbox Series X S | 2 Botões LB RB Compatível Controle Xbox Series X S | numeral: 5 x 2 | sim |
| quarentena | sho | Botão Air Fryer Mondial AFN40 AFN50 AFN51 Timer Temperatura | ADEREÇO PLÁSTICO P/ TIMER AIR FRYER MONDIAL AFN40/ AFN5 | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Insta360 GO Ultra – Câmera de vlogging pequena 4K, mãos livres, câmera | Câmera de ação preta 4K Insta360 Go Ultra Creator Bundl | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Jogo PS5 Silent Hill f | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Silent Hill f Ps5 Mídia Física | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | ja_em_quarentena |
| quarentena | sho | Silent Hill f  PS5 lacrado | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Silent Hill F Ps5 Lacrado | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Silent Hill F Ps5 Midia Fisica | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | PS5 - Silent Hill F mídia física ( Novo ) | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Silent Hill f PS5 Físico | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | ja_em_quarentena |
| quarentena | sho | silent hill ps5 | Silent Hill 2 PS5 Standard | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Organização Perfeita Para Seu Setup Gamer  Base Display De Jogos PS5 P | Kit 3 Organização Perfeita Para Seu Setup Gamer Base Di | numeral_ausente: sem x 3 | nome_do_master_divergente |
| quarentena | sho | Organização Perfeita Para Seu Setup Gamer Base Display De Jogos PS5 PS | Kit 3 Organização Perfeita Para Seu Setup Gamer Base Di | numeral_ausente: sem x 3 | nome_do_master_divergente |
| quarentena | sho | Kit 2 Organização Perfeita Para Seu Setup Gamer Base Display De Jogos  | Kit 3 Organização Perfeita Para Seu Setup Gamer Base Di | numeral: 2 x 3 | nome_do_master_divergente |
| quarentena | mer | Nintendo Switch Oled Neon Vermelho Azul Com Joy-con Jap Preto | Console Nintendo Switch Oled 64gb Tela 7 | regiao: importado x nacional | sim |
| quarentena | mer | Nintendo Switch Oled Neon Vermelho Azul Com Joy-con Jap Preto | Console Nintendo Switch Oled 64gb Tela 7 | regiao: importado x nacional | sim |
| quarentena | sho | Puxador Cabo Preto Air Fryer Mondial AF-29 AF-30 AF-30-I AF-31 New Pra | Fritadeira Air Fryer 3.6L Mondial AF36BI 127V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Bola Vôlei Dualt VP200 + Bomba Grátis Profissional Resistente Promoção | Bola de Vôlei de Quadra / Praia Dualt PVC SOFT VP200 | composicao: combo/kit x avulso | decisao_humana_do_dono |
| quarentena | sho | Bola de Vôlei Dualt VP200 Oficial + Bomba de Encher Alta Qualidade Esp | Bola de Vôlei de Quadra / Praia Dualt PVC SOFT VP200 | composicao: combo/kit x avulso | decisao_humana_do_dono |
| quarentena | sho | Bola de Vôlei Quadra Praia Dualt Vp200 PVC SOFT + Bomba de Ar | Bola de Vôlei de Quadra / Praia Dualt PVC SOFT VP200 | composicao: combo/kit x avulso | decisao_humana_do_dono |
| quarentena | sho | FIFA 22 Xbox one Séries X | Fifa 22 - XBOX SERIES X - Original | plataforma: [xbox_one,xbox_series] x [xbox_series] | sim |
| quarentena | ama | FIFA 22 - Xbox Series X( para PlayStation5 e Xbox Series X) | Fifa 22 - XBOX SERIES X - Original | plataforma: [ps5,xbox_series] x [xbox_series] | sim |
| quarentena | sho | Fritadeira Air Fryer Forno Oven 12L Mondial AFO-12L-BI 110V | Fritadeira Air Fryer Forno Oven 12L Mondial 2000W - AFO | modelo: afo12lbi x afon12lwi | oferta_nao_ativa |
| quarentena | ama | Dom Casmurro - Edição Exclusiva Amazon | Livro Dom Casmurro, de Machado de Assis. Editorial Edit | edicao: [ed_exclusiva] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | FILTRO HEPA PAS1450C ORIGINAL ASPIRADOR DE PÓ PHILCO - LAVÁVEL AR PURO | Reservatorio Aspirador De Pó Philco Pas1450c Original | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | FILTRO HEPA PAS1450C ORIGINAL ASPIRADOR DE PÓ PHILCO - LAVÁVEL AR PURO | Reservatorio Aspirador De Pó Philco Pas1450c Original | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Robô Aspirador Xiaomi S40 Bivolt 10000Pa / Mapeamento Laser LDS | Xiaomi S20+ Robô Aspirador Preto | modelo: 10000pa/s40 x s20; variante: [] x [plus] | oferta_nao_ativa |
| quarentena | sho | Robô Aspirador Xiaomi H50 110v/ 10.000Pa / Original Lacrado viu | Xiaomi S20+ Robô Aspirador Preto | modelo: 10000pa/h50 x s20; variante: [] x [plus] | oferta_nao_ativa |
| quarentena | sho | Robô Aspirador Xiaomi H50 10000pa 2026 - 220V branco | Xiaomi S20+ Robô Aspirador Preto | modelo: 10000pa/h50 x s20; variante: [] x [plus] | oferta_nao_ativa |
| quarentena | sho | Fritadeira Forno Elétrico Sem Óleo Air Fry Oven Britânia BFR2100P12 L | Fritadeira Air Fryer Oven Britânia Rosa 12l 1800w Bfr21 | modelo: bfr2100p12 x bfr2150rs | oferta_nao_ativa |
| quarentena | ama | Fritadeira Air Fryer Oven Britânia BFR2100 4 em 1 1800W 127V | Fritadeira Air Fryer Oven Britânia Rosa 12l 1800w Bfr21 | modelo: bfr2100 x bfr2150rs | sim |
| quarentena | sho | Fritadeira Elétrica Air Fryer 12L Britânia Oven BFR2100P Preta 127V | Fritadeira Air Fryer Oven Britânia Rosa 12l 1800w Bfr21 | modelo: bfr2100p x bfr2150rs | sim |
| quarentena | ama | Denon Amplificador integrado PMA-3000NE Reference 2 canais 160W - Prat | Amplificador Integrado Denon Pma-900hne Black ( 120v ) | modelo: 3000ne/pma3000ne x 900hne/pma900hne | oferta_nao_ativa |
| quarentena | ama | High on Life Game of the Year - PS5 | Jogo Ps5 original High On Life 2 | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Resident Evil 3 Remake PS5 Mídia Física Novo Nacional Legendado | Resident Evil 2 Remake PS5 Mídia Física Novo Nacional L | numeral: 3 x 2 | sim |
| quarentena | sho | Super Mario 3D World + Fury World 🎮Nintendo Switch🎮（Original japonês | Super Mario 3d World + Bowsers Fury Nintendo Switch | regiao: importado x nacional | sim |
| quarentena | ama | Impressora 3D Bambu Lab H2D Full Combo, Laser Edition - 110V (modulo l | Impressora 3d Fdm Fechada H2d Combo Ams Bambu Lab | edicao: [ed_laser] x [] | eixo_so_sugestao:edicao |
| quarentena | ama | Visions of Mana - Amazon Exclusive Edition (PS5) | Jogo Ps5 Visions Of Mana Midia Fisica | edicao: [ed_exclusive] x [] | eixo_so_sugestao:edicao |
| quarentena | ama | Drone XT808 com Câmera 4K, GPS Integrado, Motor Brushless, Transmissão | Xt808 Drone 4k Dual Camera Brushless Motor Rc Quadcopte | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Filtro Hepa Aspirador Britania BAS1010P 1000w FAS750AZ 600 FUN CLEAN B | KIT 2X FILTROS P/ ASPIRADOR DE PÓ BRITÂNIA BAS1200C / B | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro Hepa Aspirador De Pó Britânia Bas1010p Original FAS750AZ | KIT 2X FILTROS P/ ASPIRADOR DE PÓ BRITÂNIA BAS1200C / B | papel: peca_reposicao x aspirador (acessório/peça x principal); modelo: fas750az | nome_do_master_divergente |
| quarentena | sho | Filtro Hepa Aspirador Po Britania BAS1010P BAS1290V BAS1295P | KIT 2X FILTROS P/ ASPIRADOR DE PÓ BRITÂNIA BAS1200C / B | papel: peca_reposicao x aspirador (acessório/peça x principal); modelo: bas1290v | nome_do_master_divergente |
| quarentena | sho | MAFIA PS4 | Jogo Mafia 3 Ps4 Midia Fisica | numeral_ausente: sem x 3 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | INSTA360 X4 8K 360 ACTION CAM CINSABMA (X401) | Câmera De Ação Insta360 X4 Pocket 8k 360° Motorcycle Bu | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Par Grip Borracha Silicone Analógico Xbox One 360 Series S X Ps3 Ps4 P | Grip Borracha Silicone 4 Unidades Analógico Xbox One Se | pack: 1 x 4 | sim |
| quarentena | sho | Encarte Mario Kart 8 – Nintendo Switch / Somente Encarte | Somente Encarte Nintendo Switch - Mario Kart 8 Deluxe | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Kit 2 Rodinhas Frontais Original Electrolux Ergorapido ERG10 ao ERG28 | Kit 2 filtros para para aspiradores ERG10 ao ERG25 | modelo: erg28 x erg25 | oferta_nao_ativa |
| quarentena | ama | Impressora 3D Creality Ender 3 V3 SE, velocidade de impressão de 250 m | Impressora 3D Creality Ender 3 V3 SE, velocidade de imp | composicao: combo/kit x avulso | decisao_humana_do_dono |
| quarentena | sho | 2026 novo produto Switch Gamepad NS pro somatossensorial Oled jogo por | 2026 novo produto Switch Gamepad NS pro somatossensoria | modelo: steamtgcd592br2026082 x steamtgcd592br2026091 | sim |
| quarentena | ama | Sniper Elite: Resistance - Compatible for PS5 - UK PAL | Jogo Sniper Elite Resistance Ps5 Midia Fisica | regiao: importado x nacional | sim |
| quarentena | sho | Nikoderiko The Magical World Directors Cut Xbox Series X Midia Fisica | Nikoderiko The Magical World Directors Cut Collectors E | edicao: [] x [collector] | eixo_so_sugestao:edicao |
| quarentena | sho | Resident Evil Viii Village Gold Edition Ps5 | Resident Evil Village Gold Edition – PS5 (Original) | numeral_ausente: 8 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | PS5 - Resident Evil 8: Village - Gold Edition (mídia física) | Resident Evil Village Gold Edition – PS5 (Original) | numeral_ausente: 8 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | STREET FIGHTER 6 YEARS 1-2 FIGHTERS EDITION - PlayStation 4 | Jogo Street Fighter 6 Years 1 2 Fighters Edition Ps4 Ca | numeral_parcial: 6 x 1,2,6 | eixo_so_sugestao:numeral_parcial |
| quarentena | ama | Street Fighter 6 Years 1-2 Fighters Edition (PlayStation 4) | Jogo Street Fighter 6 Years 1 2 Fighters Edition Ps4 Ca | numeral_parcial: 6 x 1,2,6 | eixo_so_sugestao:numeral_parcial |
| quarentena | ama | JBL, Fone de Ouvido Sem Fio, Tune 520BT, Bluetooth - Azul | Fone Ouvido Neckband Sem Fio Jbl Tune 125bt Bluetooth B | modelo: 520bt x 125bt; linha: tune 520bt x tune 125bt | sim |
| quarentena | ama | JBL, Fone de Ouvido On-Ear, Tune 720BT, Bluetooth, Sem Fio - Preto | Fone Ouvido Neckband Sem Fio Jbl Tune 125bt Bluetooth B | modelo: 720bt x 125bt; linha: tune 720bt x tune 125bt | sim |
| quarentena | ama | JBL, Fone de Ouvido Sem Fio, Bluetooth, Tune Flex TWS - Branco | Fone Ouvido Neckband Sem Fio Jbl Tune 125bt Bluetooth B | linha: tune flex x tune 125bt | sim |
| quarentena | ama | JBL, Fone de Ouvido Bluetooth Over-Ear, Tune 530BT, Sem Fio, Até 76 Ho | Fone Ouvido Neckband Sem Fio Jbl Tune 125bt Bluetooth B | modelo: 530bt x 125bt; linha: tune 530bt x tune 125bt | sim |
| quarentena | ama | Gigabyte RTX 5060 Ti Eagle Max OC Placa de Vídeo 8GB GDDR7 NVIDIA GeFo | Placa de vídeo Gigabyte GeForce RTX 5060 Ti GDDR7 Windf | variante: [max,ti] x [ti] | sim |
| quarentena | sho | Jogo NIOH Playstation 4 PS4 Mídia fisica | NIOH 1 - Jogo PS4 (Mídia Física) | numeral_ausente: sem x 1 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | PS4 NIOH | NIOH 1 - Jogo PS4 (Mídia Física) | numeral_ausente: sem x 1 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | ATTACK SHARK X11SE Mouse Para Jogos Sem Fio Ultraleve Tri-Mode-2.4G/US | Mouse Para Jogos Tri-Mode ATTACK SHARK X11-Sensor PAW33 | modelo: 22kdpi/trimode24gusbc x x11sensor | oferta_nao_ativa |
| quarentena | sho | Jogo Blood Bowl Playstation 4 PS4 Mídia fisica | Blood Bowl 2 - PS4 Midia Fisica | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Filtro Aspirador Philco Pas1420/pas1550/pas1600bas1500 | Resevatorio Aspirador Philco Pas1600 | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Encarte Resident Evil 2 – PlayStation 5 (PS5) / Somente Encarte | Resident Evil Village - PS5 Mídia Física - (ENCARTE REI | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | God Of War III Remasterizado Hits PlayStation 4 | God of War HITS para PlayStation 4 Físico | numeral_ausente: 3 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Resident Evil Revelations HD (PS4) | Resident Evil 4 Hd Ps4 - Capcom | numeral_ausente: sem x 4 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Capcom Resident Evil Revelations HD 1 Games (PS4) [video game] | Resident Evil 4 Hd Ps4 - Capcom | numeral: 1 x 4 | sim |
| quarentena | sho | ATTACK SHARK R11 ULTRA Carbon Fiber Wireless 8K PAW3950MAX Gaming Mous | ATTACK SHARK X11 ULTRA Carbon Fiber Wireless 8K PAW3950 | modelo: r11 x 54l15/x11 | nome_do_master_divergente |
| quarentena | sho | ATTACK SHARK R11 Ultra 8K Carbon Fiber Wireless Gaming Mouse,PAW3950 M | ATTACK SHARK X11 ULTRA Carbon Fiber Wireless 8K PAW3950 | modelo: r11 x 54l15/x11 | nome_do_master_divergente |
| quarentena | sho | ATTACK SHARK R11 Ultra 8K Carbon Fiber Wireless Gaming Mouse,PAW3950 M | ATTACK SHARK X11 ULTRA Carbon Fiber Wireless 8K PAW3950 | modelo: r11 x 54l15/x11 | nome_do_master_divergente |
| quarentena | sho |  Escudo Anti-Poeira para PS5 Slim com Plugues de Silicone e Rede de Ma | Console PlayStation 5 Slim Digital | papel: suporte_base x console (acessório/peça x principal) | ja_em_quarentena |
| quarentena | sho | Battlefield 1 Ps4 Midia fisica Cd | Battlefield  Ps4 Midia fisica Cd Portugues Br | numeral_ausente: 1 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | mer | Impressora 3D Bambu Lab A1 Ultra Silenciosa e Automática | Impressora 3d Bambu Lab A1 | variante: [ultra] x [] | ja_em_quarentena |
| quarentena | sho | The Last of us Part 2 Playstation 4 PS4 | The Last of Us Ps4 Português Dublado | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | PS4 The Last of US Parte 2 | The Last of Us Ps4 Português Dublado | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | Jogo The Last of Us Part 2 PS4 Mídia Física Original NOVO LACRADO | The Last of Us Ps4 Português Dublado | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | The Last of Us parte 2 PS4 | The Last of Us Ps4 Português Dublado | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | Ps4 slim 1TB | Playstation 4 slim 500gb | capacidade: 1000GB x 500GB | sim |
| quarentena | sho | 2kits Filtro Aspirador Britânia Bas 1500v PAS 1600P, BAS 1500V, BAS 30 | Aspirador de Pó Vertical Britânia Filtro Ciclone 1500W  | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Sensor Temperatura Air Fryer Oven Mondial Afon-12l-bi-bc | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON- | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | SENSOR TEMPERATURA AIR FRYER OVEN MONDIAL AFON-12L ORIGINAL AFON-12L-B | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON- | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | SENSOR TEMPERATURA AIR FRYER OVEN MONDIAL AFON-12L ORIGINAL AFON-12L-B | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON- | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro de Ar Ultra HEPA H13 com Carvão Ativado para Impressoras 3D Bam | Impressora 3d Bambu Lab X2d | papel: peca_reposicao x impressora3d (acessório/peça x principal) | ja_em_quarentena |
| quarentena | ama | Celular Samsung Galaxy A17 5G, 256GB, 8GB, 50MP Tela 6.7" - Azul | Celular Samsung Galaxy A56 5g 256gb 8gb Ram Rosa | modelo: a17 x a56 | sim |
| quarentena | ama | Celular Samsung Galaxy A17 5G, 256GB, 8GB, 50MP Tela 6.7" - Preto | Celular Samsung Galaxy A56 5g 256gb 8gb Ram Rosa | modelo: a17 x a56 | sim |
| quarentena | sho | Botão Timer Temporizador Air Fryer Bella Cuccina  BCFR05 | Fritadeira Air Fryer Oven Bella Cuccina 12L BCFR05 1500 | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Mouse Gamer Sem Fio H'Maston MS08 Bluetooth 2.4GHz RGB Dual Mode Recar | Mouse sem fio dual band receptor nano 2,4ghz / Bluetoot | modelo: ms08 x mss350l/s350l | oferta_nao_ativa |
| quarentena | ama | Yakuza Kiwami 2 (Nintendo Switch 2) | Yakuza Kiwami - Nintendo Switch 2 | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Grand Theft Auto V GTA 5 Premium Online Edition PS4 | Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5 Fisic | edicao: [ed_online] x [] | oferta_nao_ativa |
| quarentena | sho | GTA Grand Theft Auto V  - PS4 - Original | Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5 Fisic | edicao: [] x [ed_premium]; numeral_ausente: sem x 5 | eixo_so_sugestao:edicao,numeral_ausente |
| quarentena | ama | Grand Theft Auto V - Premium Edition -Playstation 4 | Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5 Fisic | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Jogo PS4 GTA V Grand Theft Auto V Premium Edition Mídia Física Lacrado | Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5 Fisic | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Grand Theft Auto V Premium  Online Edition - GTA 5 PS4 Fisico | Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5 Fisic | edicao: [ed_online] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Jogo GTA 5 (Grand Theft Auto V) - PS4 | Jogo Ps4 Grand Theft Auto V Premium Edition Gta 5 Fisic | edicao: [] x [ed_premium] | eixo_so_sugestao:edicao |
| quarentena | sho | Elden Ring Nightreign Seekers Edition - Stellbook Edition - PS5. | Elden Ring Nightreign Seekers Edition Steelbook Ps5 | edicao: [ed_stellbook] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Impressora 3D Bambu Lab P2S Combo 110V Plug EU Cinza | Impressora 3D Bambu Lab P2S Combo de FDM Automática, | regiao: importado x nacional | sim |
| quarentena | ama | Samsung Tablet Android Galaxy Tab A9 WiFi, 4 GB de RAM, 64 GB de armaz | Tablet Samsung Galaxy Tab A9+ de 11" Wi-Fi 64 GB Grafit | variante: [] x [plus] | sim |
| quarentena | ama | Star Wars Battlefront 2 (PS4) | Star Wars: Battlefront - PS4 - Original | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Final Fantasy Type 0 HD - Xbox One ou Series X | Final Fantasy Type-0 HD - XBOX ONE/SERIES X - Original | numeral_ausente: 0 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Mouse Gamer TGT GM25, Rainbow, 2400DPI, 4 Botoes, Preto, TGT-GM25-BL01 | Mouse Gamer TGT GM95 LED, 1600DPI, 4 Botoes, TGT-GM95-B | modelo: gm25 x gm95 | oferta_nao_ativa |
| quarentena | ama | insta360 Câmera de ação X4 8K 360 | Camera De Ação 360 Insta360 X6 Essentials Bundle 8k50 P | modelo: x4 x 8k50/x6; composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Mouse Sem Fio Wireless Led Rgb 2,4GHz + Plug USB Á Pilha Ergonômico Si | Mouse Sem Fio Silencioso 1600DPI Wireless USB 2.4GHz Pa | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | ama | Drone com Camera 6K HD, XT105 Drone Profissional com 2 Baterias, Drone | Drone Profissional Xt105 Brushless Câmera Hd 2 Baterias | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Controle Gamesir Kaleid Para Xbox Series S / X Xbox One e PC Notebook  | Controle Gamesir G7 Se Para Xbox Series S / X Xbox One  | variante: [] x [se] | sim |
| quarentena | ama | Ubisoft Tom Clancy's Ghost Recon Breakpoint Aurora Edition (PS4) | Tom Clancys Ghost Recon Breakpoint Ps4 Lacrado | edicao: [ed_aurora] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Battlefield™ V PS4 | Jogo Battlefield 1 Playstation 4 PS4 mídia fisica | numeral_ausente: sem x 1 | ja_em_quarentena |
| quarentena | sho | Jogo Battlefield V Playstation 4 PS4 Mídia fisica | Jogo Battlefield 1 Playstation 4 PS4 mídia fisica | numeral_ausente: sem x 1 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | GTA: Grand Theft Auto V - XBOX ONE/SERIES X - Original | GTA 5 Grand Theft Auto V Premium Edition Xbox One Físic | edicao: [] x [ed_premium]; plataforma: [xbox_one,xbox_series] x [xbox_one] | eixo_so_sugestao:edicao,numeral_ausente |
| quarentena | sho | C0ldre externo ostensivo TAURUS PT57, PT58, PT59, PT638, PT640, PT938, | C0ldre externo ostensivo GLOCK, G17, G22, G21 GEN5 | modelo: g25/pt57/pt58 x g17/g21/g22 | oferta_nao_ativa |
| quarentena | sho | Dragon Ball Xenoverse 2 - Xbox One/Series - Original | Dragon Ball Xenoverse XV - Xbox One/Series - Original | numeral: 2 x 15 | sim |
| quarentena | sho | Dragon Ball Xenoverse 2 - Xbox One/Series - Original | Dragon Ball Xenoverse XV - Xbox One/Series - Original | numeral: 2 x 15 | sim |
| quarentena | ama | EA SPORTS FC 27 Standard Edition Xbox Series X /Physical Disc I VideoG | EA SPORTS FC 27 Xbox Series X / Xbox One | plataforma: [xbox_series] x [xbox_one,xbox_series] | sim |
| quarentena | ama | Headset Gamer Redragon Titan Preto Sem Fio Tri Mode | Headset Gamer Redragon Sem Fio Mira Preto H868 | linha: titan x mira | sim |
| quarentena | sho | Coldre Velado (Sem Aba) Premium Interno Protetor Para Revól. RT85 38 2 | Coldre Velado PREMIUM Interno Dissimulado Paisana Para  | papel: suporte_base x ? (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | [PS5] Resident Evil 4 Gold Edition【Direct from Japan】
 | 【PS5】Resident Evil: Requiem【Direct from Japan】
 | numeral_ausente: 4 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Cabo Puxador Da Air Fryer Electrolux Eaf10 Eaf30 A21903601 | Electrolux Air Fryer Efficient | papel: cabo_adaptador x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | SAMSON Microfone Dinâmico Supercardioide Neodimio Q7X, preto, Professi | Microfone Dinâmico Supercardioide Neodimio Samson Q8x C | modelo: q7x x q8x | oferta_nao_ativa |
| quarentena | sho | Botão Interruptor Aspirador Electrolux STK12 STK13 STK15 Original | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro ELECTROLUX Aspirador de Pó PowerSpeed Stk12 Stk13 Stk14 Stk15 S | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro Aspirador Vertical PowerSpeed Stk12 Stk13 Stk14 Stk15 | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro do motor / Aspirador Electrolux STK12 / STK13 / STK14 / STK15 | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Suporte Inferior Pegador Do Aspirador Electrolux - STK15 STK12 STK13 S | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: suporte_base x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Conector Acabamento Suporte Inferior Cabo Elétrico Aspirador Electrolu | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: cabo_adaptador x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro ELECTROLUX Aspirador de Pó PowerSpeed Stk12 Stk13 Stk14 Stk15 V | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Suporte Inferior Cabo Elétrico Aspirador Electrolux Stk15 | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: suporte_base x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Conector Pegador Vermelho P/ Aspirador Electrolux Stk12 Stk13 Stk14 St | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: cabo_adaptador x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Filtro Aspirador Vertical PowerSpeed Stk12 Stk13 Stk14 Stk15 | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Electrolux Pegador Completo com Suporte Inferior para Aspirador STK13  | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: suporte_base x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Botao Trava do Aspirador Electrolux Powerspeed STK15 | Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | papel: peca_reposicao x aspirador (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | mer | Filamento Pla Lite Marrom Cacau C/ Carretel 1kg Bambu Lab Marrom-escur | Filamento Pla 1kg 1,75m Bambu Lab Refil | variante: [lite] x [] | ja_em_quarentena |
| quarentena | mer | Filamento Pla Lite Bambu Lab 1kg C/carretel - Alta Qualidade Cor Giras | Filamento Pla 1kg 1,75m Bambu Lab Refil | variante: [lite] x [] | sim |
| quarentena | mer | Filamento PLA Lite Bambu Lab 1Kg, Sem Carretel e Cor Bege | Filamento Pla 1kg 1,75m Bambu Lab Refil | variante: [lite] x [] | ja_em_quarentena |
| quarentena | mer | Filamento PLA Bambu Lab Refill PLA Lite Preto 1.75mm 1kg para Impresso | Filamento Pla 1kg 1,75m Bambu Lab Refil | variante: [lite] x [] | ja_em_quarentena |
| quarentena | mer | Filamento Pla Lite Bambu Lab 1kg C/carretel - Alta Qualidade Cor Cinza | Filamento Pla 1kg 1,75m Bambu Lab Refil | variante: [lite] x [] | sim |
| quarentena | mer | Filamento Pla Bambu Lab Lite C/ Carretel Impressão 3d 1kg Branco Lite | Filamento Pla 1kg 1,75m Bambu Lab Refil | variante: [lite] x [] | sim |
| quarentena | sho | Resident Evil 2 PS4 Midia Fisica | Resident Evil 6 (Lacrado) Jogo ps4 | numeral: 2 x 6 | sim |
| quarentena | sho | Jogo Resident evil 4 Playstation 4 PS4 mídia fisica | Resident Evil 6 (Lacrado) Jogo ps4 | numeral: 4 x 6 | sim |
| quarentena | sho | motor 127v Airfryer forno  Mondial AFON-12L | Fritadeira Air Fryer Forno Oven 12l Mondial Afon-12l-ab | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Motor 127v 6025 Fritadeira Forno Mondial Oven Afon-12l | Fritadeira Air Fryer Forno Oven 12l Mondial Afon-12l-ab | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Galápagos, Vampiro: A Máscara Escudo do Narrador, Acessório de RPG | Galápagos Vampiro A Máscara Martin Ericsson | papel: suporte_base x ? (acessório/peça x principal) | sim |
| quarentena | ama | Samsung Galaxy S25 Edge 5G, 512GB, 12GB, Câmera 200MP | Samsung Galaxy S25+ 512GB, 12GB, Câmera Tripla - Azul M | variante: [edge] x [plus] | sim |
| quarentena | sho | EA SPORTS FC25 PS5 Midia Fisica | EA FC 25 - PS5 - Original | numeral_ausente: sem x 25 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Celular Realme C71 4G Smartphone 4GB RAM 128GB ROM Dual SIM (Verde) | Smartphone Realme Note 60s Celular 128 Gb 4gb Ram Dual  | modelo: c71 x 60s | sim |
| quarentena | ama | Grand Theft Auto V - Xbox Series X | Grand Theft Auto V Gta 5 Xbox Series X Midia Fisica | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Grand Theft Auto V - [Xbox Series X] | Grand Theft Auto V Gta 5 Xbox Series X Midia Fisica | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Mouse Gamer Para Jogos Redragon Impact USB Preto RGB 12400 DPI M908 | Mouse Gamer Redragon Storm RGB 12400DPI M808-RGB | modelo: m908 x m808rgb/m808 | nome_do_master_divergente |
| quarentena | sho | Mouse Gamer Redragon Cobra M711 V3 PRETO RGB USB Pixart PMW3327 12400  | Mouse Gamer Redragon Storm RGB 12400DPI M808-RGB | modelo: pmw3327/m711 x m808rgb/m808 | nome_do_master_divergente |
| quarentena | sho | Mouse Gamer Redragon Cobra RGB 12400DPI 8 Botões M711 Preto/Branco - M | Mouse Gamer Redragon Storm RGB 12400DPI M808-RGB | modelo: m711 x m808rgb/m808 | nome_do_master_divergente |
| quarentena | sho | Botão Timer Fritadeira Philco Air Fryer Oven PFR2000P | Fritadeira Air Fry Philco 11 Litros Oven PFR2000P - 220 | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | BOTÃO TIMER E TEMPERATURA  AIR FRYER OVEN PHILCO PFR2000P | Fritadeira Air Fry Philco 11 Litros Oven PFR2000P - 220 | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Botão Timer/termostato Fritadeira Air Fry Oven Pfr2000p | Fritadeira Air Fry Philco 11 Litros Oven PFR2000P - 220 | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Everybody 1-2-Switch! NOVO LACRADO Nintendo Switch | Jogo Nintendo Switch Everybody 1 - 2 Switch | numeral_ausente: sem x 1,2 | ja_em_quarentena |
| quarentena | sho | Sony Playstation 4 1000gb Ps4 Slim + 8 JOGOS III | Sony Playstation 4 1000gb Ps4 Pro + 8 JOGOS III | variante: [slim] x [pro] | sim |
| quarentena | sho | Console Nintendo Switch 2 + pacote Mario Kart World | Bundle Nintendo Switch 2 + Mario Kart World | componentes: [pacote] x [mario] | eixo_so_sugestao:componentes |
| quarentena | sho | Nintendo switch lite  32 gb novo lacrado | Nintendo Switch Lite D.E.S.B.L.O.Q. 128GB | capacidade: 32GB x 128GB | ja_em_quarentena |
| quarentena | sho | FIFA 17 PS4 envio de imediato | FIFA 20 ps4  envio de imediato | numeral: 17 x 20 | ja_em_quarentena |
| quarentena | sho | Super Mario 3D Collection - Nintendo Switch | Jogo Nintendo Switch Super Mario 3d Collection Japonês | regiao: importado x nacional | sim |
| quarentena | sho | Jogo Nintendo Switch Super Mario 3d Collection | Jogo Nintendo Switch Super Mario 3d Collection Japonês | regiao: importado x nacional | sim |
| quarentena | sho | Apoios de Borracha Airfryer Philips RI9201 Ri9270 Ri9280 RI9252 RI9255 | placa de energia montada 127v para Airfryer Philips-wal | papel: peca_reposicao x ? (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Controle Hori D-pad Esquerdo Edição Mario Para Nintendo Switch | Controle Hori D-pad Esquerdo Edição Zelda Para Nintendo | edicao: [ed_mario] x [ed_zelda] | eixo_so_sugestao:edicao |
| quarentena | sho | Cesto Fritadeira Air Fryer Britânia Philco BFR2100P PFR2200P | Philco Fritadeira Air Fryer 12L Pt PFR2200P 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | decisao_humana_do_dono |
| quarentena | sho | Bandeja Air Fryer Oven Philco Pfr2200p E Britania Bfr2100p Bfr2300p Bf | Philco Fritadeira Air Fryer 12L Pt PFR2200P 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | decisao_humana_do_dono |
| quarentena | sho | Bandeja Air Fryer Oven Philco Pfr2200p E Britania Bfr2100p Bfr2300p | Philco Fritadeira Air Fryer 12L Pt PFR2200P 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | decisao_humana_do_dono |
| quarentena | sho | Par de Escova Lateral Original Para Robô Aspirador Wap Robot W310 | Robô Aspirador De Pó Wap Robot W310 Bivolt | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Bandeja Cesta Fritadeira Air Fryer Britânia BFR51 Original | Air Fryer Britânia 5,5L Antiaderente 1500W BFR51 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Cesto Fritadeira Air Fryer Britânia BFR51 Gold Quadrada | Air Fryer Britânia 5,5L Antiaderente 1500W BFR51 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Panela Suporte Branca Airfryer Walita RI9201 RI9252 | Fritadeira Airfryer Digital Philips Walita - RI9252 | papel: suporte_base x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Apoio Panela Suporte Airfryer Walita RI9201 RI9252 RI9255 | Fritadeira Airfryer Digital Philips Walita - RI9252 | papel: suporte_base x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Helice Motor P/ Airfryer Philips Walita Ri9252 Original | Fritadeira Airfryer Digital Philips Walita - RI9252 | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | ama | Celular Samsung Galaxy A17 5G, 128GB, 4GB, 50MP Tela 6.7" - Azul | Celular Samsung Galaxy A06 5g Preto | modelo: a17 x a06 | sim |
| quarentena | ama | Celular Samsung Galaxy A17 5G, 128GB, 4GB, 50MP Tela 6.7" - Preto | Celular Samsung Galaxy A06 5g Preto | modelo: a17 x a06 | sim |
| quarentena | sho | Extratora de carpete e Aspirador 35,5 litros 1200W - EA135 Lite IPC So | Extratora Aspirador de Pó e Líquidos IPC EA135 Lite 120 | variante: [] x [lite] | oferta_nao_ativa |
| quarentena | sho | Controle Ps5 com Grip - 4 Paddles (Black) | Controle Ps5 com Grip 2 Paddles (Black) | numeral: 4 x 2 | sim |
| quarentena | ama | Câmera de Ação Insta360 X5, 8K 360°, À Prova D'água, Branco Acetinado, | Câmera De Ação Insta360 X5 Kit Starter Bundle Preta Pre | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | ama | Insta360 X5 BMW Motorrad Edition – Câmera de ação 8K 360 à prova d'águ | Câmera De Ação Insta360 X5 Kit Starter Bundle Preta Pre | composicao: combo/kit x avulso; edicao: [ed_motorrad] x [] | nome_do_master_divergente |
| quarentena | ama | Insta360 Câmera X6, 8K 360 com sensores de 1/1.1'' | Câmera De Ação Insta360 X5 Kit Starter Bundle Preta Pre | modelo: x6 x x5; composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | ama | Câmera padrão Insta360 X4, visão de 360°, à prova d'água, resolução 8K | Câmera De Ação Insta360 X5 Kit Starter Bundle Preta Pre | modelo: x4 x x5; composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | ama | LTGEM Capa rígida para Brother DS-640 / DS-740D / DS-940DW / DS-720D & | SCANNER PORTÁTIL BROTHER DS640 | papel: capa_case x ? (acessório/peça x principal) | decisao_humana_do_dono |
| quarentena | sho | Robô Aspirador Xiaomi S40 PRO / 15.000Pa / Bivolt | Aspirador Robô Xiaomi 5C H50 Pro | modelo: 15000pa/s40 x h50 | oferta_nao_ativa |
| quarentena | sho | Xiaomi S40 Pro Robô Aspirador com Sucção Potente e Limpeza Automática  | Aspirador Robô Xiaomi 5C H50 Pro | modelo: s40 x h50 | oferta_nao_ativa |
| mover para: The Legend Of Zelda: Tears Of Kingdom - Nintendo S | sho | The Legend of Zelda: Tears of the Kingdom - Nintendo Switch | The Legend of Zelda™: Tears of the Kingdom Nintendo Swi | plataforma: [switch] x [switch2] | nome_do_master_divergente |
| mover para: The Legend Of Zelda: Tears Of Kingdom - Nintendo S | sho | The Legend of Zelda: Tears of The Kingdom - Nintendo Switch Envio Imed | The Legend of Zelda™: Tears of the Kingdom Nintendo Swi | plataforma: [switch] x [switch2] | nome_do_master_divergente |
| quarentena | sho | Steelbook The Legend of Zelda Tears of the Kingdom For Nintendo Switch | The Legend of Zelda™: Tears of the Kingdom Nintendo Swi | plataforma: [switch] x [switch2] | nome_do_master_divergente |
| quarentena | sho | Call of Duty: Infinite Warfare - Xbox Ones/Series X - Original | Call of Duty Modern Warfare 2 - Xbox One/Series - Origi | plataforma: [xbox_series] x [xbox_one]; numeral_ausente: sem x 2 | nome_do_master_divergente |
| quarentena | sho | Call of Duty: Infinite Warfare - Xbox Ones/Series X - Original | Call of Duty Modern Warfare 2 - Xbox One/Series - Origi | plataforma: [xbox_series] x [xbox_one]; numeral_ausente: sem x 2 | nome_do_master_divergente |
| quarentena | sho | Call Of Duty: Advanced Warfare - Xbox One/Series - Original | Call of Duty Modern Warfare 2 - Xbox One/Series - Origi | numeral_ausente: sem x 2 | nome_do_master_divergente |
| quarentena | sho | Tom clancy´s the division Playstation 4 PS4 | Tom Clancy's The Division 2 - PS4 - Original | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Helice Secundaria Aco Fritadeira Britania Air Fry 3.2l Bfr | Air fryer Britânia Fritadeira Air Fryer preto | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Coldre MC03F Tira de perna + Cinto + Acessórios Maynards NFe | Coldre Cintura Curto Maynards com fita de perna MC03F M | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | ama | Call of Duty Modern Warfare 2 - PS4 | Call of Duty: Modern Warfare - PS4 - Original | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | PS4 SUPERCROSS 3 Monster Energy | Jogo Monster energy Supercross Playstation 4 PS4 Mídia  | numeral_ausente: 3 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Binóculo Profissional Longo Alcance Com Ajuste de Zoom 20-180x180 Até  | Binoculo Profissional 20x180x100 Zoom Longo Alcance + C | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | ama | Binóculo Profissional Longo Alcance Com Ajuste de Zoom 20-180x180 | Binoculo Profissional 20x180x100 Zoom Longo Alcance + C | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Botão  timer Da fritadeira oster  Original  Ofrt520 | Fritadeira Sem Óleo Ofrt520 4,6 Litros Oster 220v | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | JBL Grip Caixa de Som Bluetooth Portátil 16W RMS Preta | Caixa Som JBL JBLGO5PIKAM portátil com bluetooth waterp | papel: suporte_base x caixa_som (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Caixa de Som Portátil JBL Flip 7, Bluetooth, Preto, 25 W RMS | Caixa Som JBL JBLGO5PIKAM portátil com bluetooth waterp | variante: [flip] x [] | sim |
| quarentena | ama | ELEGOO Impressora 3D de resina Saturn 4, LCD mono HD de 10” 12K, nivel | Impressora 3d Anycubic Mono M5s | marca: elegoo x anycubic; modelo: 218x122x220mm³ x m5s | eixo_so_sugestao:marca |
| quarentena | sho | Super Mario Bros Nintendo DS | Jogo - Super Mario Bros Japonês - Nintendo | regiao: importado x nacional | sim |
| quarentena | mer | Console Híbrido Nintendo Switch OLED Mario Red Edition de 64 GB | Console Nintendo Switch OLED 64GB Edição Mario Vermelho | edicao: [ed_red] x [] | eixo_so_sugestao:edicao |
| quarentena | mer | Console Híbrido Nintendo Switch OLED Mario Red Edition de 64 GB | Console Nintendo Switch OLED 64GB Edição Mario Vermelho | edicao: [ed_red] x [] | eixo_so_sugestao:edicao |
| quarentena | mer | Console Híbrido Nintendo Switch OLED Mario Red Edition de 64 GB | Console Nintendo Switch OLED 64GB Edição Mario Vermelho | edicao: [ed_red] x [] | eixo_so_sugestao:edicao |
| quarentena | ama | Hilook Câmera de Segurança Turret Interna 2MP Full HD, Lente Fixa 2.8m | Kit Cftv Hilook Câmera Segurança Dome Full Hd + Conecto | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | ama | Mini Osciloscópio Digital FNIRSI DSO152 200 KHz Portátil | Mini Osciloscópio Portátil Dso152 + Ponta De Prova X10  | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | ama | Mini Osciloscópio Dso152 Digital Portátil 200khz | Mini Osciloscópio Portátil Dso152 + Ponta De Prova X10  | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | ama | Samsung 16GB DDR4 PC4-21300, 2666MHZ, 260 PIN SODIMM, 1,2V, CL 19 módu | Memória RAM Kingston 16Gb 2666Mhz Ddr4 Pc4-21300 | marca: samsung x kingston | eixo_so_sugestao:marca |
| quarentena | ama | Kingston Kcp426Ns8/16 16Gb Ddr4 2666Mhz Non Ecc Memoria Ram Dimm | Memória RAM Kingston 16Gb 2666Mhz Ddr4 Pc4-21300 | modelo: kcp426ns8/kcp426ns816 x pc421300/pc4 | ja_em_quarentena |
| quarentena | ama | ADATA Memória RAM DDR4 16GB 2666MHz SO-DIMM para Notebook | Memória RAM Kingston 16Gb 2666Mhz Ddr4 Pc4-21300 | marca: adata x kingston | eixo_so_sugestao:marca |
| quarentena | sho | Jogo Just cause 3 Playstation 4 PS4 Mídia fisica | Jogo Ps4 Just Cause 4 Midia Fisica | numeral: 3 x 4 | sim |
| quarentena | sho | DARK SOULS - PS4 | Jogo Dark souls 3 Playstation 4 PS4 Mídia fisica | numeral_ausente: sem x 3 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Carregador Portátil Power Bank 1Hora 20000mAh GAR159R Vermelho com 4 C | Power Bank 20000mah 1hora Bateria Portátil Gar117b Bran | modelo: gar159r x gar117b | sim |
| quarentena | sho | MOTOR 127V 35W FRITADEIRA AIR FRYER MONDIAL | Fritadeira Air Fryer Mondial Oven Digital 127v | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Nintendo Super Mario Bros Wonder Switch Edição Mundial | Super Mario Bros. Wonder Nintendo Switch (físico) | edicao: [ed_mundial] x [] | eixo_so_sugestao:edicao |
| quarentena | ama | Jogo Destiny 2 - Ps4 Mídia Física | Jogo Destiny Original PS4 | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | Jogo Destiny 2 Playstation 4 PS4 Mídia fisica | Jogo Destiny Original PS4 | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | DESTINY 2 PS4 | Jogo Destiny Original PS4 | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | Jogo Destiny 2  Playstation 4 PS4 Mídia fisica | Jogo Destiny Original PS4 | numeral_ausente: 2 x sem | nome_do_master_divergente |
| quarentena | sho | Controle Nintendo Switch Pro - Preto | Controle Pro, Nintendo Switch™ 2 | plataforma: [switch] x [switch2] | sim |
| quarentena | sho | Controle Nintendo Switch Pro | Controle Pro, Nintendo Switch™ 2 | plataforma: [switch] x [switch2] | sim |
| quarentena | sho | Botao Plastico Fritadeira Air Fry Britania Bfr15p | Fritadeira Air Fryer Rosa Britânia 5,5L 1500W | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Filtro Hepa Para Robô Aspirador Electrolux HOME-E SPEED ERB10 ERB11 HO | Par EscovaLateral Para Robô Aspirador Electrolux HOME-E | papel: peca_reposicao x ? (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Motor 220v Fritadeira Philips Walita Airfryer RI9201, RI9252, RI9270,  | Air fryer Philips Spectrum Walita de 4.1L branco | papel: peca_reposicao x air_fryer (acessório/peça x principal) | sim |
| quarentena | ama | Until Dawn 2™ - PS5 | Until Dawn - PS5 - Original | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Rune Factory 3 Special - Europeu - Nintendo Switch | Jogo Rune Factory 3 Special Nintendo Switch Midia Fisic | regiao: importado x nacional | sim |
| quarentena | sho | Motor 220v 35w Fritadeira Air Fry Philco / Britania Original | Air fryer Britânia Air Fry de 3.5L preto | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Fritadeira Elétrica Sem Óleo Air Fryer 7L 1700W AFD7Q Painel Digital B | Air Fryer Digital Sem Óleo 7L BLACK+DECKER AFD7Q 220V | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | sho | Robô Aspirador Xiaomi S40C 110/220v Passa Pano 5000Pa Wi-Fi | ROBÔ ASPIRADOR DE PÓ INTELIGENTE S40C XIAOMI, (XM865BRA | modelo: 5000pa x xm865bra | decisao_humana_do_dono |
| quarentena | sho | Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 25 + God Raganarok + Gt | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | capacidade: 500GB x 1000GB; variante: [slim] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 25 + God Raganarok + Gt | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | capacidade: 500GB x 1000GB; variante: [slim] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 1000gb Ps4 Slim + Ea Fc Fifa 25 + God Raganarok + G | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | variante: [slim] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 26 + God Raganarok + Gt | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | capacidade: 500GB x 1000GB; variante: [slim] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 500 gb Ps4 + Ea Fc Fifa 25 + God Raganarok + Gta 5  | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | capacidade: 500GB x 1000GB; variante: [] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 1000 gb Ps4 + Ea Fc Fifa 25 + God Raganarok + Gta 5 | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | variante: [] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 1000gb Ps4 Slim + Ea Fc Fifa 25 + God Raganarok + G | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | variante: [slim] x [pro] | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 26 + God Raganarok + Gt | Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God | capacidade: 500GB x 1000GB; variante: [slim] x [pro] | nome_do_master_divergente |
| quarentena | ama | Secadora de Roupas Electrolux 11Kg Cor Inox Essential Care (STH11) 127 | Secadora Electrolux 11kg Essential Care Stl11 | modelo: sth11 x stl11 | sim |
| quarentena | sho | Botão Knob Timer e Temperatura Air fryer Multilaser CE021 CE084 CE22 C | Multilaser gourmet air fryer ce084 4l 1500w vermelho | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Red Dead Redemption - PlayStation 4 | Red Dead Redemption 2 - PS4 - Original | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Red Dead Redemption - PlayStation 4 | Red Dead Redemption 2 - PS4 - Original | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Jogo Red Dead Redemption - PS4 - Original - Novo Lacrado | Red Dead Redemption 2 - PS4 - Original | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Botão Temperatura  Air Fryer Philco Pfr15p Pfr15pg Pfr15pi Paf55a Blac | Fritadeira Elétrica Air Fryer Philco PAF55A 5,5 L 1500W | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Botão Timer Fritadeira Air Fryer Philco Pfr15p Pfr15pg Pfr15pi PAF55A  | Fritadeira Elétrica Air Fryer Philco PAF55A 5,5 L 1500W | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Power Bank 10000mAh Indução, Basike Carregador Portatil com Suporte(Pr | Carregador Power Bank Magsafe Indução 10000 MAH IPHONE | papel: power_bank x cabo_adaptador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Controle Sem Fio Horipad Edição Yoshi para Nintendo Switch 1 e 2 | Controle Sem Fio Horipad Gray Para Nintendo Switch 1 E  | edicao: [ed_yoshi] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Controle Sem Fio Horipad Edição Sonic Para Nintendo Switch 1 E 2 | Controle Sem Fio Horipad Gray Para Nintendo Switch 1 E  | edicao: [ed_sonic] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Controlador Em Forma De Y Parafusos Console De Jogo Parafuso Para Nint | Parafusos Em Forma De Y Para Console De Jogos , Control | papel: controle x peca_reposicao (acessório/peça x principal) | sim |
| quarentena | sho | Super Mario Galaxy 1 E 2 Nintendo Switch | Super Mario Galaxy 1 + 2 Nintendo Switch Mídia Física L | numeral_parcial: 1,2 x 1 | nome_do_master_divergente |
| quarentena | sho | Jogo SUPER MARIO GALAXY + SUPER MARIO GALAXY 2, Nintendo Switch - NT00 | Super Mario Galaxy 1 + 2 Nintendo Switch Mídia Física L | numeral_ausente: sem x 1 | nome_do_master_divergente |
| quarentena | sho | Jogo Super Mario Galaxy 1 e 2 Nintendo Switch Novo lacrado | Super Mario Galaxy 1 + 2 Nintendo Switch Mídia Física L | numeral_parcial: 1,2 x 1 | nome_do_master_divergente |
| quarentena | sho | SUPER MARIO GALAXY 1+2 NINTENDO SWITCH | Super Mario Galaxy 1 + 2 Nintendo Switch Mídia Física L | numeral_ausente: sem x 1 | nome_do_master_divergente |
| quarentena | sho | Fritadeira Elétrica Air Fryer 6L 1900W AFN-60-RI Sem Óleo Vermelho/Ino | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Fritadeira elétrica Mondial AFN-40-bi 4L Preto/Inox | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Fritadeira Air Fryer Mondial AFN-50-BI 5 Litros 1900W 220V Preto/Inox | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Fritadeira Elétrica Air Fryer Mondial AFN-40-BI 4L Inox/Preta - 220V | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Fritadeira Sem Óleo Air Fryer 8L Mondial Preto/Inox 1900W - AFD-80-BI | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Temporizador Fritadeira Elétrica Mondial AFN-40-BI Family | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Fritadeira Elétrica AFN-40-BI Sem Óleo Mondial | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Fritadeira Air Fryer Mondial AFN-50-BI / 5 Litros, 1900W, Preto/Inox | Fritadeira Elétrica Air Fryer Mondial + Liquidificador  | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Filtro Hepa Aspirador Oster Stick Oasp601 Oasp602 Oasp603 Oasp630 Oasp | Reservatorio para Aspirador de Pó Oster OASP630 OASP601 | papel: peca_reposicao x ? (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Geladeira Electrolux Frost Free 490L Efficient com AutoSense Inverse B | Geladeira Frost Free Electrolux Inverse 490l Inox Ib54s | modelo: ib7 x ib54s | sim |
| quarentena | ama | Bayonetta 3 - Nintendo Switch | Bayonetta Nintendo Switch (Físico) | numeral_ausente: 3 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Mario + Rabbids Sparks Of Hope Cosmic Edition Nintendo Switch (Non-US  | Mario Rabbids Sparks Of Hope - Nintendo Switch | edicao: [ed_cosmic] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Kit 2 Filtros Hepa Aspirador de Pó Ergorápido Electrolux Erg23n Erg24n | Kit com 2 Filtros para Aspiradores Ergorapido - ERG26 e | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | ama | Tubo PTFE de 5 metros para Bambu Lab série A1, X1, P1, impressora 3D,  | Impressora 3D Photon P1 Anycubic com tubo duplo de resi | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | ama | Impressora 3D Bambu Lab - P1P, Bivolt | Impressora 3D Photon P1 Anycubic com tubo duplo de resi | marca: bambu lab x anycubic; composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | sho | Sony Playstation 4 500 gb Ps4 + Ea Fc Fifa 26 + God Raganarok + Gta 5  | Sony Playstation 4 1 tera Ps4 + Ea Fc Fifa 26 + God Rag | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 500 gb Ps4 + Ea Fc Fifa 26 + God Raganarok + Gta 5  | Sony Playstation 4 1 tera Ps4 + Ea Fc Fifa 26 + God Rag | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 26 + God Raganarok + Gt | Sony Playstation 4 1 tera Ps4 + Ea Fc Fifa 26 + God Rag | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Sony Playstation 4  1000gb Ps4 Slim + Ea Fc 26 + God Raganarok + Gta 5 | Sony Playstation 4 1 tera Ps4 + Ea Fc Fifa 26 + God Rag | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | ama | Jogo Moving Out 2 - Nintendo Switch | Moving Out - Nintendo Switch | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Botão do Timer e Temperatura Fritadeira Elétrica Mondial Family 4 Litr | Air Fryer Mondial Afn Afn-40-bf 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Grade + Hélice Inferior Air Fryer Mondial AFN40 AFN-40 Original | Air Fryer Mondial Afn Afn-40-bf 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal); composicao: comb | oferta_nao_ativa |
| quarentena | sho | Grade Hélice Supote Inferior Air Fryer Mondial AFN40 AFN-40 Original | Air Fryer Mondial Afn Afn-40-bf 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Cabo Fio de Conexão Vermelho Fritadeira Air Fryer Mondial AFN-40 4 Lit | Air Fryer Mondial Afn Afn-40-bf 220V | papel: cabo_adaptador x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Grade Metálica Air Fryer AFN-40 Mondial Original | Air Fryer Mondial Afn Afn-40-bf 220V | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Resident Evil 7 Biohazard - Gold Edition - PlayStation 4 | Resident Evil 7 PS5 Gold Edition PlayStation 4 (Físico) | plataforma: [ps4] x [ps4,ps5] | sim |
| quarentena | mer | Kit Manguito + Meia Poliamida Unissex Corrida Ciclismo Bike Cor Rosa-c | Kit Esportivo Winston Manguito Meia Corrida Ciclismo | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | mer | Kit Manguito + Meia Poliamida Unissex Corrida Ciclismo Bike Cor Rosa-c | Kit Esportivo Winston Manguito Meia Corrida Ciclismo | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | mer | Kit Manguito + Meia Poliamida Unissex Corrida Ciclismo Bike Cor Verde- | Kit Esportivo Winston Manguito Meia Corrida Ciclismo | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | mer | Kit Manguito + Meia Poliamida Unissex Corrida Ciclismo Bike Cor Verde- | Kit Esportivo Winston Manguito Meia Corrida Ciclismo | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | mer | Kit Manguito + Meia Poliamida Unissex Corrida Ciclismo Bike Cor Branco | Kit Esportivo Winston Manguito Meia Corrida Ciclismo | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Puxador Da Fritadeira Mondial Af-29/ Af-30/ Af-31/ Af-30-i | Fritadeira Air Fryer Mondial Família 3.5 Litros Preta | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Puxador Cabo Air Fryer Mondial AF-29 AF-30 AF-30i AF-30-DI AF-31 Origi | Fritadeira Air Fryer Mondial Família 3.5 Litros Preta | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Cooktop Indução Agratto ACKI01I-02 Preto 1 Boca | Cooktop Indução ACKLl01l-02 Preto 1 Boca 2000W Agratto | modelo: acki01i02/acki01i x ackll01l02/ackll01l | oferta_nao_ativa |
| quarentena | sho | Filtro HEPA para Robô  ASPIRADOR Xiaomi S40 PRO OV71GL/MOP 3C/ Lavável | Para compatível com Xiaomi Robot Vacuum S40 Pro OV71GL  | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | 🧩 Mario vs. Donkey Kong (Nintendo Switch) - Edição Japonesa 🇯🇵🧩 | Mário vs. Donkey Kong Nintendo Switch | edicao: [ed_japonesa] x []; regiao: importado x nacional | eixo_so_sugestao:edicao |
| quarentena | sho | Tom Clancys The Division 2  PS4 Midia Fisica | Tom Clancys The Division - PS4 Mídia física Cd | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | 3 Saco Descartável + Filtro Espuma para Aspirador de Pó Electrolux GT2 | Aspirador de Pó e Água Electrolux Inox 20L 127V - GT20i | papel: peca_reposicao x aspirador (acessório/peça x principal); composicao: comb | oferta_nao_ativa |
| quarentena | sho | Filtro Descartável Saco Coletor Aspirador de Pó Electrolux Gt12i Gt20i | Aspirador de Pó e Água Electrolux Inox 20L 127V - GT20i | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | NIKON 7557 Câmera Digital Coolpix P950 | Nikon Z30 Câmera Digital | modelo: p950 x z30 | sim |
| quarentena | mer | Jogo Super Mario Galaxy + Super Mario Galaxy 2 para Nintendo Switch Mí | Super Mario Galaxy + Super Mario Galaxy 2 - Nintendo Sw | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Nintendo Switch Super Mario Galaxy + Super Mario Galaxy 2 | Super Mario Galaxy + Super Mario Galaxy 2 - Nintendo Sw | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Jogo Deadrising Playstation 4 PS4 Mídia física | Jogo deadrising 2 Playstation 4 PS4 Mídia fisica | numeral_ausente: sem x 2 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Asus PRIME A520M-R Placa Mãe AM4 DDR4 HDMI M.2 USB 3.2 | Placa Mãe Gigabyte A520M K V2 (AM4/2xDDR4/HDMI/D-Sub/M. | marca: asus x gigabyte | decisao_humana_do_dono |
| quarentena | sho | Cesta Interna Air Fryer Mondial AF-30 Cuba Original Antiaderente | Air fryer Mondial Cozinha af-30-i | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | sho | Air Fryer Mondial AF-30-DI Preto 3,5L com Timer | Air fryer Mondial Cozinha af-30-i | modelo: af30di x af30i | nome_do_master_divergente |
| quarentena | sho | Cesta Puxador Airfryer Mondial AF-30 AF-30-I AF-30-DI | Air fryer Mondial Cozinha af-30-i | papel: peca_reposicao x air_fryer (acessório/peça x principal) | nome_do_master_divergente |
| quarentena | ama | Gallant Esteira Ergométrica Elétrica Elite 2.9hp 16km/h 130kg | Esteira Ergométrica Elétrica Gallant Elite 2.5hp 14km P | spec_hp: 2.9hp x 2.5hp | sim |
| quarentena | ama | Gallant Esteira Ergométrica Elétrica Elite 2.8hp 16km/h 120kg | Esteira Ergométrica Elétrica Gallant Elite 2.5hp 14km P | spec_hp: 2.8hp x 2.5hp | sim |
| quarentena | ama | Gallant Esteira Ergométrica Elétrica Elite 2.8hp 16km/h 120kg | Esteira Ergométrica Elétrica Gallant Elite 2.5hp 14km P | spec_hp: 2.8hp x 2.5hp | oferta_nao_ativa |
| quarentena | ama | Impressora 3D de resina ELEGOO Saturn 4 Ultra 16K, Aquecimento de tanq | Impressora 3d Anycubic Photon Mono Se | marca: elegoo x anycubic; variante: [ultra] x [se] | eixo_so_sugestao:marca |
| mover para: The Legend of Zelda: Breath of the Wild Nintendo S | sho | Jogo The Legend Of Zelda Breath Of The Wild Nintendo Switch | Porta jogos console nintendo switch zelda breath of the | tipo: jogo x console | sim |
| quarentena | sho | FUSIVEL AIR FRYER OSTER ORIGINAL 10A 192ºC | Air fryer Oster OFRT970 de 4.6L preto | modelo: 192ºc x ofrt970 | oferta_nao_ativa |
| quarentena | sho | NBA 2K 22 PS5 | JOGO NBA 2K22 PS5 ORIGINAL MIDIA FISICA CD. | numeral_ausente: 22 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | The Legend of Zelda: Tears of the Kingdom Collectors Edition Nintendo  | Console Nintendo Switch - The Legend of Zelda: Tears of | edicao: [collector] x []; regiao: importado x nacional | eixo_so_sugestao:edicao |
| quarentena | ama | EA SPORTS FC 26 - XBOX Series X | Ea Sports Fc 26 (mídia Física) - Xbox Series X / Xbox O | plataforma: [xbox_series] x [xbox_one,xbox_series] | decisao_humana_do_dono |
| quarentena | ama | Resident Evil 7 biohazard Gold Edition - PS5 - UK PAL (EU Version) | Resident Evil 7 Gold Edition Ps5 Mídia Física | regiao: importado x nacional | sim |
| quarentena | mer | Botão LB RB para Controle Xbox one S. | Botão LB RB para controle de Xbox One Series X/S | plataforma: [xbox_one] x [xbox_one,xbox_series] | oferta_nao_ativa |
| quarentena | ama | Final Fantasy Type-0 HD (PS4) | Final Fantasy Type 0 HD Ps4 Mídia Física | numeral_ausente: sem x 0 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Final Fantasy Type-0 HD - PS4 | Final Fantasy Type 0 HD Ps4 Mídia Física | numeral_ausente: sem x 0 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Botão Tecla Trava Aspirador De Pó Electrolux Stk12 Stk13 Stk14b Stk15 | TECLA DEPOSITO ASPIRADOR ELCTROLUX STK12 ORIGINAL | papel: peca_reposicao x aspirador (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Turok Trilogy Bundle Switch Midia Fisica | Turok Trilogy Nintendo Switch Mídia Física Ação Aventur | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | 4 Botões Analógico para controle Compatível Ps5 Dualsense | 8 Botões Direcional Analógico Para Controle Ps5 Dualsen | numeral: 4 x 8 | sim |
| quarentena | sho | 4 Botões Analógico Emborrachado Para Controle Ps5 Dualsense | 8 Botões Direcional Analógico Para Controle Ps5 Dualsen | numeral: 4 x 8 | sim |
| quarentena | sho | 4 Botões Analógico Emborrachado Para Controle Ps5 Dualsense | 8 Botões Direcional Analógico Para Controle Ps5 Dualsen | numeral: 4 x 8 | sim |
| quarentena | ama | MAX TITANIUM TOP WHEY 3W + PERFORMANCE POTE 900 GR CHOCOLATE | Top Whey Protein 3w 900g Whey Concetrado Max Titanium S | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | ama | Celular Samsung Galaxy A37 5G, 256GB, 8GB, 50MP Tela 6.7" - Verde | Celular Samsung Galaxy A36 5g 256gb 8gb Ram Verde | modelo: a37 x a36 | sim |
| quarentena | ama | STREET FIGHTER 6 YEARS 1-2 FIGHTERS EDITION - PlayStation 5 | Street Fighter 6 - Year 1 - 2 / Fighters Edition - Play | numeral_parcial: 6 x 1,2,6 | eixo_so_sugestao:numeral_parcial |
| quarentena | sho | Two Point Campus Enrollment Launch Edition - Ps5 - Lacrado | Jogo PS5 Two Point Campus Enrollment Edition Mídia Físi | edicao: [ed_launch] x [] | eixo_so_sugestao:edicao |
| quarentena | sho | Bandeja Coletora Air Fryer PAF15A Philco Original | Fritadeira Elétrica Air Fryer Oven PAF15A 15L Redstone  | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | ama | Bola de Futebol de Campo Slick 22 Azul, Branco e Preto- Topper | Bola Futebol Campo Topper Slick Ii | numeral: 22 x 2 | sim |
| quarentena | ama | Insta360 GO Ultra Câmera de Ação 4K60, Sensor 1/1.28", Tela Touchscree | Camera De Acão Insta360 Go 4k Ultra Lifestyle Bundle Br | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| quarentena | sho | Nintendo Switch OLED 512gb Kamikaze desbloqueado Novo | Nintendo Switch OLED Desbloqueado Kamikaze 256GB Novo | capacidade: 512GB x 256GB | ja_em_quarentena |
| mover para: Nintendo Switch OLED Kamikaze Desbloqueado 128 GB  | sho | Nintendo Switch OLED Desbloqueado Kamikaze 128GB Novo | Nintendo Switch OLED Desbloqueado Kamikaze 256GB Novo | capacidade: 128GB x 256GB | ja_em_quarentena |
| quarentena | sho | Fritadeira Elétrica Sem Óleo Air Fry Oven PFR2200P 12L + Liquidificado | Fritadeira Elétrica Sem Óleo Air Fryer Oven Philco 12L  | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | ama | SanDisk Cartão microSD Ultra UHS I de 256 GB 150 MB/s R, para smartpho | Cartão Memória Micro Sd Sandisk 256gb Microsd Ultra 150 | edicao: [aniversario] x [] | eixo_so_sugestao:edicao |
| quarentena | ama | Sandisk Cartão uhs i microsd extremo 64gb para vídeo 4k em smartphones | Cartão Memória Micro Sd Sandisk 64gb Extreme 170mbs + A | composicao: combo/kit x avulso | oferta_nao_ativa |
| quarentena | sho | The Last Of Us Part 2 (Remastered) - PS5 - Original | The Last Of Us Part I - PS5 Novo Lacrado Português Br | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Resident Evil Requiem PS5 midia física dublado em português | Resident Evil 9 Requiem PS5 Mídia Física Novo Lacrado D | numeral_ausente: sem x 9 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | FLASHFORGE Impressora 3D Ad5X, Impressora 3D Multicolorida com Ifs, Ni | Impressora 3d Elegoo Mars 5 Ultra | marca: flashforge x elegoo; variante: [] x [ultra] | eixo_so_sugestao:marca |
| quarentena | ama | Teclado Mecânico Gamer Husky Harbor, Abnt2, Rgb, Switch Gateron Brown, | Teclado Mecânico Gamer Husky Anchorage Full Size, RGB,  | modelo: htg210ptma x htg200ptvr | decisao_humana_do_dono |
| quarentena | ama | Teclado Mecânico Gamer Husky Blizzard, 60%, RGB, Switch Gateron Brown, | Teclado Mecânico Gamer Husky Anchorage Full Size, RGB,  | modelo: htg001brma x htg200ptvr | decisao_humana_do_dono |
| quarentena | ama | Teclado Mecânico Gamer Husky HailStorm, 65%, RGB, Switch Gateron Red,  | Teclado Mecânico Gamer Husky Anchorage Full Size, RGB,  | modelo: htg002brvr x htg200ptvr | decisao_humana_do_dono |
| quarentena | sho | Mouse Gamer Marvo Duke 50, RGB, 12800DPI, 6 Botoes, Cinza e Laranja, M | Mouse Gamer Rgb Fortrek Crusader Edition 12800dpi | edicao: [] x [ed_crusader] | nome_do_master_divergente |
| quarentena | sho | Mouse Gamer Rgb Fortrek Crusader White Edition 12800dpi | Mouse Gamer Rgb Fortrek Crusader Edition 12800dpi | edicao: [ed_white] x [] | nome_do_master_divergente |
| quarentena | sho | Mouse Gamer RGB Sem Fio MS18 Bluetooth 2.4G USB 12800DPI Recarregável  | Mouse Gamer Rgb Fortrek Crusader Edition 12800dpi | edicao: [] x [ed_crusader] | nome_do_master_divergente |
| quarentena | sho | Elden Ring Ps4 e ps5 Mídia Física | Elden Ring Edição Standard - PS5 | plataforma: [ps4,ps5] x [ps5] | sim |
| quarentena | sho | Elden Ring / Playstation 4 - Ps4 - Ps5 / Original / Envio imediato | Elden Ring Edição Standard - PS5 | plataforma: [ps4,ps5] x [ps5] | sim |
| quarentena | sho | Botão Timer P/ Air Fryer Britânia Bfr11pi Bfr11pg Bfr11p Ori | Air Fryer Britânia 4,4L Inox 1500W BFR11PG | papel: peca_reposicao x air_fryer (acessório/peça x principal) | oferta_nao_ativa |
| quarentena | sho | Fritadeira Elétrica Sem Óleo Air Fryer AF-36-FB 3,6L Mondial | Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mon | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Cabo Puxador Da Fritadeira Air fryer Mondial Af-33/ Af-34 Preto e Cinz | Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mon | papel: cabo_adaptador x air_fryer (acessório/peça x principal); composicao: comb | nome_do_master_divergente |
| quarentena | ama | Fritadeira Sem Óleo Air Fryer Pratic 3,6L, Mondial, Preto/Inox, 1500W, | Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mon | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | sho | Botão timer Knob fritadeira elétrica air fryer mondial Afn-40/50/51/80 | Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mon | papel: peca_reposicao x air_fryer (acessório/peça x principal); composicao: comb | nome_do_master_divergente |
| quarentena | ama | MONDIAL Fritadeira Sem Óleo Air Fryer Pratic 3,6L, Preto, 1500W, 220V  | Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mon | composicao: combo/kit x avulso | nome_do_master_divergente |
| quarentena | ama | SSD Kingston NV3 1TB M.2 2280 NVMe Gen4, Desempenho e Eficiência para  | SSD Nvme Asgard AN4 1tb Gen4 | modelo: snv3s1000g/nv3/snv3s x an4 | nome_do_master_divergente |
| quarentena | ama | Crucial SSD P310 PCIe Gen4 2280 NVMe M.2 de 1 TB com dissipador de cal | SSD Nvme Asgard AN4 1tb Gen4 | modelo: 7100mbs/ct1000p310ssd5/ct1000p310ssd501 x an4 | nome_do_master_divergente |
| quarentena | ama | Crucial SSD P310 1TB 2280 PCIe Gen4 3D NAND NVMe M.2 – Até 7.100 MB/s  | SSD Nvme Asgard AN4 1tb Gen4 | modelo: 7100mbs/ct1000p310ssd801/p310 x an4 | nome_do_master_divergente |
| quarentena | ama | ADATA Legend 860 SSD NVMe M.2 2280 1TB PCIe Gen4, Leitura 6000MB/s, Gr | SSD Nvme Asgard AN4 1tb Gen4 | modelo: 5000mbs/6000mbs x an4 | nome_do_master_divergente |
| quarentena | ama | Konami Metal Gear Solid: Master Collection Vol.1 (Ps5) | Metal Gear Solid Master Collection Vol 1 PS5 Midia Fisi | numeral_ausente: sem x 1 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Resident Evil 3 PS5 / Mídia Física Original / Novo e Lacrado / Pronta  | Jogo Resident Evil Village - Ps5 Físico | numeral_ausente: 3 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Resident Evil Village Standart PS5 BR Midia Fisica Open Box | Jogo Resident Evil Village - Ps5 Físico | condicao: novo x não novo | ja_em_quarentena |
| quarentena | sho | Jogo RESIDENT EVIL VILLAGE PS4 / PS5 | Jogo Resident Evil Village - Ps5 Físico | plataforma: [ps4,ps5] x [ps5] | ja_em_quarentena |
| quarentena | ama | Samson C01U Microfone condensador USB Studio (novo) | Microfone Condensador Samson C02 Cinza | modelo: c01u x c02 | sim |
| quarentena | ama | Microfone Samson Condensador C03 | Microfone Condensador Samson C02 Cinza | modelo: c03 x c02 | sim |
| quarentena | ama | ASUS Placa-mãe TUF Gaming A520M-PLUS (WiFi) AMD AM4 (3ª geração Ryzen™ | Placa-Mãe ASUS TUF GAMING A520M-PLUS II, AM4, mATX, DDR | numeral: 3 x 2 | sim |
| quarentena | sho | Jogo NBA 2K21 - Xbox Series X | Jogo Nba 2k 21 Xbox Series X | numeral_ausente: sem x 21 | nome_do_master_divergente |
| quarentena | sho | NBA 2k21- XBOX SERIES X - Original | Jogo Nba 2k 21 Xbox Series X | numeral_ausente: sem x 21 | nome_do_master_divergente |
| quarentena | sho | NBA 2k21 Xbox Series X Mídia Física Novo Lacrado | Jogo Nba 2k 21 Xbox Series X | numeral_ausente: sem x 21 | nome_do_master_divergente |
| quarentena | sho | Nba 2k21 Xbox Series X Mídia Física Pronta Entrega | Jogo Nba 2k 21 Xbox Series X | numeral_ausente: sem x 21 | nome_do_master_divergente |
| quarentena | sho | NBA 2K21 Xbox Series X Físico Novo LACRADO | Jogo Nba 2k 21 Xbox Series X | numeral_ausente: sem x 21 | nome_do_master_divergente |
| quarentena | sho | Ps4 Slim de 500GB/1TB + 2 Controles + JOGO (ENVIO COM NOTA FISCAL) | PlayStation 4 Slim 500 GB + 2  Controles + Garantia + N | composicao: combo/kit x avulso | eixo_so_sugestao:composicao |
| mover para: PS4 PlayStation 4 Slim 1TB + 2 Controles + Garanti | sho | PS4 PlayStation 4 Slim 1TB + 2 Controles + Garantia + Nota Fiscal | PlayStation 4 Slim 500 GB + 2  Controles + Garantia + N | capacidade: 1000GB x 500GB | sim |
| quarentena | ama | Filamento Impressão 3D PLA Lite 1,75mm 1kg FlashForge Cor de pele | Filamento PLA Flashforge 1.75mm de 1kg | variante: [lite] x [] | sim |
| quarentena | ama | Shure Microfone condensador digital MV51 | Microfone Condensador Digital Shure Mv5-dig | modelo: mv51 x mv5dig | oferta_nao_ativa |
| quarentena | ama | Smart TV TCL 85 Polegadas QLED 4K P8L WiFi Bluetooth Google TV HDR10+  | Smart TV TCL 85" QLED 4K P7K com Google TV e Dolby Atmo | modelo: 85p8l/p8l x p7k | oferta_nao_ativa |
| quarentena | sho | Dragon Quest III HD-2D Remake PS5 Lacrado | Jogo Ps5 Dragon Quest Ill Hd-2d Remake Mídia Física | numeral_ausente: 3 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Call of Duty: Black OPS 3 - Xbox One/Series X - Original | Call of Duty: Black OPS 4 - Xbox One/Series - Original | plataforma: [xbox_one,xbox_series] x [xbox_one]; numeral: 3 x 4 | sim |
| quarentena | sho | GTA V - Grand Theft Auto - PS5 - Original | Jogo Gta 5 Ps5 - Grand Theft Auto V Ps5 Mídia Física | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | GTA: Grand Theft Auto V - PS5 - Original | Jogo Gta 5 Ps5 - Grand Theft Auto V Ps5 Mídia Física | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Jogo GTA V - Grand Theft Auto V PS5 Mídia Física Original (Lacrado) | Jogo Gta 5 Ps5 - Grand Theft Auto V Ps5 Mídia Física | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | GTA: Grand Theft Auto V - PS5 - Original | Jogo Gta 5 Ps5 - Grand Theft Auto V Ps5 Mídia Física | numeral_ausente: sem x 5 | eixo_so_sugestao:numeral_ausente |
| quarentena | ama | Lego The Hobbit - Ps4 | Jogo Lego Hobbit Ps4 Europeu | regiao: importado x nacional | sim |
| quarentena | ama | JBL, Fone de Ouvido Bluetooth, Tune Flex 2, Sem Fio, Com Cancelamento  | Fone De Ouvido JBL Tune Buds Sem Fio Com Cancelamento D | linha: tune flex x tune buds | sim |
| quarentena | ama | JBL, Fone de Ouvido Bluetooth, Tune Flex 2, Sem Fio, Com Cancelamento  | Fone De Ouvido JBL Tune Buds Sem Fio Com Cancelamento D | linha: tune flex x tune buds | sim |
| quarentena | ama | Shure Microfone de Lapela Sem Fio MoveMic AMV-LAV-Z7 - Sem Capa de Car | Microfone Lapela Sem Fio Movemic One Shure Mv-one-z7 | modelo: amvlavz7 x mvonez7 | sim |
| quarentena | ama | Caixa de Som Gamer Redragon Anvil Pro com Subwoofer 2.1 25W GS520-PRO | Caixa de Som Gamer Caixa Som Redragon RGB Anvil Pro GS5 | variante: [pro] x [] | sim |
| quarentena | ama | Fone de Ouvido Intra-Auricular Sem Fio JBL Wave Buds 2, Branco | Fone Ouvido Sem Fio Jbl Wave Beam 2 Preto Cancelamento  | linha: wave buds x wave beam | nome_do_master_divergente |
| quarentena | ama | Fone de Ouvido Sem Fio, JBL, Bluetooth, Wave Buds 2, Intra Auricular,  | Fone Ouvido Sem Fio Jbl Wave Beam 2 Preto Cancelamento  | linha: wave buds x wave beam | nome_do_master_divergente |
| quarentena | ama | JBL, Fone de Ouvido Sem Fio, Bluetooth, Wave Buds 2, Intra Auricular,  | Fone Ouvido Sem Fio Jbl Wave Beam 2 Preto Cancelamento  | linha: wave buds x wave beam | nome_do_master_divergente |
| quarentena | ama | Fone de Ouvido Intra-auricular Sem Fio JBL Wave Buds 2, Rosa | Fone Ouvido Sem Fio Jbl Wave Beam 2 Preto Cancelamento  | linha: wave buds x wave beam | nome_do_master_divergente |
| mover para: LEGO Marvel Super Heroes 2 - Nintendo Switch | sho | jogo nintendo switch lego marvel super heroes 2 | Lego Marvel Super Heroes - Edição padrão - Nintendo Swi | numeral_ausente: 2 x sem | eixo_so_sugestao:numeral_ausente |
| quarentena | sho | Final Fantasy VII Rebirth MIDIA fisica PS5 | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth PS5 | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII: Rebirth - PS5 | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth PS5 | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth PS5 Mídia física | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy 7 Vii Rebirth Ps5 Midia Fisica Novo Lacrado Playstation  | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth Exclusive Edition - PS5 | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [ed_exclusive] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth Ps5 Lacrado | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Jogo FINAL FANTASY VII REBIRTH - PS5 - Mídia Física - Lacrado | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth PS5 Mídia Física 2 Discos Original | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe]; numeral_parcial: 2,7 x 7 | eixo_so_sugestao:edicao,numeral_parcial |
| quarentena | sho | Final Fantasy VII Rebirth PS5 mídia física Impecável | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | FINAL FANTASY VII Rebirth PS5 | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Rebirth  - PS5 - Mídia Física Lacrado | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Final Fantasy VII Remake Rebirth PS5 (lacrado) | Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | edicao: [] x [deluxe] | eixo_so_sugestao:edicao |
| quarentena | sho | Mouse Gamer Branco ou Preto USB DPI 3200 MG-80 C3Tech | Mouse Gamer Com Fio USB C3Tech MG-10BK | modelo: mg80 x 10bk/mg10bk | nome_do_master_divergente |
| quarentena | sho | Mouse USB com Fio C3Tech MS-31BK Óptico 1000 DPI 3 Botões Preto para P | Mouse Gamer Com Fio USB C3Tech MG-10BK | modelo: 31bk/ms31bk x 10bk/mg10bk | nome_do_master_divergente |
| quarentena | sho | 🖱️ Mouse com Fio USB C3Tech MS-31BK ⚡ Precisão, Conforto e Durabilida | Mouse Gamer Com Fio USB C3Tech MG-10BK | modelo: 31bk/ms31bk x 10bk/mg10bk | nome_do_master_divergente |

(+89 no plano JSON)

## 2. Masters duplicados (mesmo produto em cestas diferentes): 406

| Confiança | Canônico | A incorporar | Ofertas ativas (inc.) | Aplicável | Travas / dúvidas |
|---|---|---|---|---|---|
| 0.975 | Bola Basquete Nba Wilson Drv Laranja #6 | Bola de Basquete Wilson NBA DRV 6 | 1 | não | decisao_humana |
| 0.975 | Aspirador Robô Xiaomi 5C H50 Pro | Robô Aspirador Xiaomi H50 Pro 2026 Branco | 3 | sim |  |
| 0.975 | Robô Aspirador Xiaomi H50 Pro Branco | Aspirador Robô Xiaomi 5C H50 Pro | 3 | sim |  |
| 0.975 | Robô Aspirador Xiaomi H50 Pro Branco | Robô Aspirador Xiaomi H50 Pro 2026 Branco | 3 | não | gtin_diferente |
| 0.975 | Console Sony Playstation 5 Edição Slim Disk 1tb Branco | CONSOLE PLAYSTATION 5 SLIM DISK 1TB | 1 | sim |  |
| 0.975 | Aolion J20 Joycon sem fio para Nintendo Switch – Controle para a mão esquerda e direita co | Aolion Wireless J20 Joycon para Switch Nintendo, controles esquerdo e direito, joystick RG | 1 | sim |  |
| 0.975 | Aolion RGB J20 Joycon Para Nintendo Switch Controle Sem Fio Esquerdo e Direito Com Joystic | Aolion RGB J20 Joycon para Switch Nintendo, controle sem fio para esquerda e direita, joys | 1 | sim |  |
| 0.975 | JOYCON ORIGINAL NINTENDO SWITCH PARCELADO | JOYCON NEON ORIGINAL NINTENDO SWITCH PARCELADO | 1 | sim |  |
| 0.975 | Endless Ocean Luminous - Nintendo Switch | Endless Ocean Luminous Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Jogo The Legend of Zelda: Ocarina of Time, Nintendo Switch 2 | Jogo The Legend of Zelda: Ocarina of Time, Nintendo Switch 2 | 2 | não | formato_diferente |
| 0.975 | Super Mario 3d World + Bowsers Fury Nintendo Switch | Jogo Super Mario 3D World - Bowser's Fury Nintendo Switch | 1 | não | formato_diferente |
| 0.975 | Animal Crossing New Horizons NINTENDO SWITCH | Animal Crossing: New Horizons Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Pokémon Pokopia - Nintendo Switch 2 | Pokemon Pokopia Nintendo Switch 2 | 1 | não | formato_diferente |
| 0.975 | Darksiders Genesis Nintendo Switch Físico | Jogo Darksiders Genesis Nintendo Switch | 2 | não | formato_diferente |
| 0.975 | Rayman Legends Definitive Edition - Nintendo Switch | Jogo Rayman Legends Definitive Edition Nintendo Switch | 2 | não | formato_diferente |
| 0.975 | Jogo Nintendo Switch Super Mario Party | Super Mario Party Nintendo Switch (Digital) | 2 | não | formato_diferente |
| 0.975 | Jogo Nintendo Switch Super Mario Party | Jogo Super Mário Party Nintendo Switch | 1 | não | formato_diferente |
| 0.975 | Super Mario Odyssey Nintendo Switch Lacrado Midia Fisica | Super Mario Odyssey™ Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Mario & Luigi: Brothership - Nintendo Switch - Original | Mario & Luigi™: Brothership Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Sonic Frontiers NINTENDO SWITCH | Sonic Frontiers Ue Nintendo Switch | 1 | não | formato_diferente |
| 0.975 | Super Mario Party Nintendo Switch (Digital) | Jogo Super Mário Party Nintendo Switch | 1 | não | formato_diferente |
| 0.975 | Persona 5 Tactica - Nintendo Switch Físico | Persona 5 Tactica Nintendo Switch Original NOVO LACRADO NF | 1 | sim |  |
| 0.975 | South Park The Fractured But Whole Nintendo Switch Físico | South Park The Fractured But Whole NINTENDO SWITCH | 1 | não | formato_diferente |
| 0.975 | Metroid Dread Nintendo Switch | Metroid™ Dread Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Jogo Mário Kart Deluxe 8 Nintendo Switch | Mario Kart™ 8 Deluxe Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Jogo Mário Kart Deluxe 8 Nintendo Switch | Super Mario Kart 8 Deluxe Nintendo Switch Mídia Física Original | 1 | não | formato_diferente |
| 0.975 | Pokémon™: Let’s Go, Pikachu! Nintendo Switch (Digital) | Pokemon Let's Go Pikachu - Nintendo Switch | 2 | não | formato_diferente |
| 0.975 | Mario Kart™ 8 Deluxe Nintendo Switch (Digital) | Super Mario Kart 8 Deluxe Nintendo Switch Mídia Física Original | 1 | não | formato_diferente |
| 0.975 | Caixa Som Bluetooth Portátil Jbl Xtreme 4 Cor Preto | Caixa Som Bluetooth Jbl Xtreme 4 Portátil Azul | 4 | não | gtin_diferente |
| 0.975 | Caixa De Som Jbl Á Prova D'água E Poeira Boombox 3 Bluetooth Preto | Caixa de Som JBL Boombox 3 Bluetooth Portátil, Preta e À Prova D'Água | 7 | não | gtin_diferente |
| 0.975 | CONSOLE NINTENDO SWITCH ANIMAL CROSSING DESBLOQUEADO COMPLETO ENVIO IMEDIATO | NOTA FISCAL CONSOLE NINTENDO SWITCH ANIMAL CROSSING DESBLOQUEADO COMPLETO ENVIO IMEDIATO | 1 | não | condicao_nao_nova |
| 0.975 | Console Nintendo Switch 2 256GB LCD Gray Novo Lacrado Lançamento NAO ENVIAMOS PRA CIDADE P | Console Nintendo Switch 2 256GB LCD Gray SEM JOGO Novo Lacrado Lançamento NÂO ENVIAMOS PRA | 1 | sim |  |
| 0.975 | Bundle Nintendo Switch 2 + Mario Kart World + 3 Meses Online | Console Nintendo Switch 2 Bundle Mario Kart World + 3 Meses de Nintendo Online Nacional Or | 1 | sim |  |
| 0.975 | Fone De Ouvido Bluetooth Galaxy Buds Pro Preto Samsung | Fone De Ouvido Bluetooth Samsung Galaxy Buds Pro Violeta | 4 | não | gtin_diferente |
| 0.975 | Controle Sem Fio Sony DualSense, Bluetooth, PS5 e PC, Incluso Cabo USB, Midnight Black - 1 | Controle PS5 Dualsense Midnight Black, Incluso cabo USB, Compatível com PC | 1 | sim |  |
| 0.975 | Controle Sem Fio Dualsense Ps5 - Chroma Teal | Controle Sem Fio DualSense PS5 – Chroma Verde Metálico Teal | 4 | sim |  |
| 0.975 | Sega Genesis Classics Nintendo Switch Original | SEGA Genesis Classics - Nintendo Switch | 1 | não | formato_diferente |
| 0.975 | ADEREÇO PLÁSTICO P/ TIMER AIR FRYER MONDIAL AFN40/ AFN50/ AFN51/ AFN60/ AFN80 ORIGINAL ADE | ADEREÇO PLÁSTICO P/ TIMER AIR FRYER MONDIAL AFN-40/ AFN-50/ AFN-51/ AFN-60 ORIGINAL P O TI | 1 | sim |  |
| 0.975 | Mouse Gamer Sem Fio Logitech G305 Lightspeed 12000 Dpi Preto | Mouse Gamer Sem Fio Logitech G305 Lightspeed 12000 Dpi Cor Lilás | 2 | não | gtin_diferente |
| 0.975 | Mouse Gamer Sem Fio Logitech G305 Lightspeed 12000 Dpi Preto | Mouse Gamer Sem Fio Logitech G305 Lightspeed 12000 Dpi Cor Azul | 3 | não | gtin_diferente |
| 0.975 | Mouse Gamer Sem Fio Logitech G305 Lightspeed 12000 Dpi Cor Azul | Mouse Gamer Sem Fio Logitech G305 Lightspeed 12000 Dpi Cor Lilás | 2 | não | gtin_diferente |
| 0.975 | Teclado Mecânico Sem Fio Redragon Fizz Pro Wireless 60% Preto Brown Idioma Português Brasi | Teclado Mecânico Redragon Fizz Pro Wireless 60% Branco Brown Idioma Português Brasil | 2 | não | gtin_diferente |
| 0.975 | Pendrive 128gb Usb 2.0 Sandisk Cruzer Blade Cor Preto/vermelho | SanDisk Cruzer Blade pendrive 128gb 2.0 preto/vermelho | 4 | não | gtin_diferente |
| 0.975 | Câmera Canon R100 Mirrorless 4k Lente 18-45mm + Acessórios | Câmera Canon R100 Mirrorless 4k Lente 18-45mm + Acessórios Preto | 3 | sim |  |
| 0.975 | Câmera Mirrorless Canon Eos R10 - Corpo - Com Nf-e | Câmera Canon Eos R10 Mirrorless Corpo | 4 | não | gtin_diferente |
| 0.975 | Smartphone Samsung Galaxy A56 5g Preto 256gb, 8gb Ram Preto. | Smartphone Samsung Galaxy A56 5G de 256 GB Preto com 8 GB RAM | 2 | sim |  |
| 0.975 | Celular Samsung Galaxy A56 5g 128gb 8gb Ram Rosa | Samsung Galaxy A56 5g 128gb 8gb Ram Verde | 4 | não | gtin_diferente |
| 0.975 | Celular Samsung Galaxy A56 5g 128gb 8gb Ram Cinza | Celular Samsung Galaxy A56 5g 128gb 8gb Ram Rosa | 5 | não | gtin_diferente |
| 0.975 | Celular Samsung Galaxy A56 5g 128gb 8gb Ram Cinza | Samsung Galaxy A56 5g 128gb 8gb Ram Verde | 4 | não | gtin_diferente |
| 0.975 | Celular Samsung Galaxy A36 5g 256gb 8gb Ram Verde | Celular Samsung Galaxy A36 5g 256gb 8gb Ram Violeta | 2 | não | gtin_diferente |
| 0.975 | Filamento PETG Masterprint de 1.75mm e 1kg | Filamento 3D PETG 1.75mm 1KG Masterprint Para Impressora 3D | 4 | não | decisao_humana |
| 0.975 | Celular Motorola Moto G04s 256 Gb 4gb Ram Verde | Celular Motorola Moto G04s 256 Gb 4gb Ram Blue | 2 | sim |  |
| 0.975 | Bola Futebol De Campo Penalty Matis Termotec Oficial Cor Verde | Bola Futebol De Campo Penalty Matis Termotec Cor Azul | 2 | não | gtin_diferente |
| 0.975 | Bola Futebol De Campo Bola 8 X Penalty Cor Preto | Bola Futebol Campo 8 Penalty Amarela | 5 | sim |  |
| 0.975 | Bola Futebol de Campo Penalty Player Xxiii cor Vermelho/Preto | Bola Futebol de Campo Penalty Player Xxiii Cor Azul/Laranja | 3 | não | gtin_diferente |
| 0.975 | Ar-condicionado Split 22.000 Btus Inverter Lite Frio Midea Branco | Ar-Condicionado Split 12000 BTUs Inverter Lite Frio Midea | 1 | não | decisao_humana |
| 0.975 | Trava da Haste Aspirador de Pó Vertical Wap High Speed Original | Trava Da Haste Aspirador De Pó Vertical Wap High Speed | 1 | sim |  |
| 0.975 | Fritadeira Elétrica WAP Air Fryer Family 4L Antiaderente Vermelha 1500W | Fritadeira Elétrica Air Fryer WAP Family 4L 1500W Antiaderente Preta | 4 | não | gtin_diferente |
| 0.975 | Fritadeira Elétrica Air Fryer WAP WC AB1050 Barbecue Flame Digital 10L 1700W 230°C 127V | Fritadeira Elétrica WAP 10L Air Fryer Barbecue Flame Digital 1700W WC AB1050 127V | 1 | sim |  |
| 0.975 | Carregador Portátil Indução 10000mAh Power Bank Anker MagGo Magnético MagSafe para Apple i | Carregador Portátil Indução 10000mAh Power Bank Anker MagGo Magnético MagSafe para Apple i | 1 | não | gtin_diferente |
| 0.975 | Tablet Xiaomi Redmi Pad 2 11 4gb/128gb/wifi - Grafite | Tablet Xiaomi Redmi Pad 2 11 4gb/128gb/wifi Cinza Grafite | 11 | não | gtin_diferente |
| 0.975 | Tablet Xiaomi Redmi Pad 2 (128) - Versão Global Cor Cinza | Tablet Xiaomi Redmi Pad 2 (128) - Versão Global Cor Lilás | 3 | não | gtin_diferente |
| 0.975 | Lego Star Wars: O Despertar da Força - XBOX ONE/SERIES X - Original | Jogo Original LEGO STAR WARS - O Despertar da Força xbox one Xbox Series X Midia Fisica Di | 1 | não | plataforma_cadastro_diferente, formato_diferente |
| 0.975 | Cadeira Gamer ThunderX3 EC1 Preta Ergonômica em Couro Sintético | Cadeira Gamer Ergonômica De Couro Sintético Thunderx3 Ec1 Cor Branco | 2 | sim |  |
| 0.975 | Cadeira Gamer Thunderx3 Core Smart Loft Cinza Escuro | Cadeira Gamer Thunderx3 Core Smart Loft Cinza Claro | 2 | não | gtin_diferente |
| 0.975 | Memória RAM Kingston Fury Beast, 16GB, 5600MHz, DDR5, CL40 | Memória Ram Kingston Fury Beast Ddr4 16gb 3600 Mhz | 4 | não | gtin_diferente |
| 0.975 | Memória Ram Ddr5 Kingston Fury 16gb Preto 6800mhz Cl34 | Memória RAM Kingston Fury DDR5 para Computadores de Mesa 16GB com 6400MHz | 2 | não | gtin_diferente |
| 0.975 | Carregador Turbo 65W USB-C GaN Kaidi Compatível com Xiaomi Samsung iPhone | Carregador Turbo USB-C 65W GaN Kaidi Branco para iPhone MacBook Samsung | 7 | sim |  |
| 0.975 | Fogao 4 Bocas Venax Temis Vermelho Glp | Fogao 4 Bocas Venax Temis Azul Glp | 2 | não | gtin_diferente |
| 0.975 | Fogao 4 Bocas Venax Temis Inox Glp | Fogao 4 Bocas Venax Temis Vermelho Glp | 2 | não | gtin_diferente |
| 0.975 | Fogao 5 Bocas Venax Temis Preto Gas Glp | Fogao 5 Bocas Venax Temis Verde Gas Glp | 2 | não | gtin_diferente |
| 0.975 | Fogao 4 Bocas Venax Temis Inox Glp | Fogao 4 Bocas Venax Temis Azul Glp | 2 | não | gtin_diferente |
| 0.975 | Fogao De Embutir 4 Bocas Venax Temis Inox Gas Glp | Fogao De Embutir 4 Bocas Venax Temis Amarelo Gas Glp | 2 | não | gtin_diferente |
| 0.975 | Fogão De Embutir 5 Bocas Temis Inox Gás Glp Venax | Fogao De Embutir 5 Bocas Venax Temis Branco Gas Glp | 2 | não | gtin_diferente |
| 0.975 | Topper Futsal Slick Bola Futebol Salão Branco Com Azul | Bola Futebol Futsal Salão Topper Slick Branco | 3 | não | gtin_diferente |
| 0.975 | Wario Ware Move It ! Nintendo Switch | Wario Ware: Move It! Nintendo Switch (Digital) | 1 | não | formato_diferente |
| 0.975 | Controle Dualsense Ps5 Gta 6 VI Edição Limitada Especial Sem Fio Sony White | Controle Dualsense Ps5 Gta 6 VI Edição Limitada Especial Sem Fio Sony Black | 6 | sim |  |
| 0.975 | Secadora De Roupas Electrolux 11kg Branca Essential Care Cor Branco | Secadora De Roupas Electrolux 11kg Cor Inox Essential Care | 4 | não | gtin_diferente |
| 0.975 | Placa De Vídeo Gigabyte Rtx 5070 Windforce Sff 12gb | Placa De Vídeo Gigabyte Rtx 5070 Windforce Oc Sff 12gb | 2 | não | gtin_diferente |
| 0.975 | Processador Amd Ryzen Threadripper 7980x Str5 5.1ghz 320mb | Processador Amd Ryzen Threadripper 9970x Str5 4ghz 160mb | 3 | não | gtin_diferente |
| 0.975 | Processador Amd Ryzen Threadripper 9980x Str5 3.2ghz 5.4ghz | Processador Amd Ryzen Threadripper 7980x Str5 5.1ghz 320mb | 3 | não | gtin_diferente |
| 0.975 | Processador Amd Ryzen Threadripper 7980x Str5 5.1ghz 320mb | Processador Amd Ryzen Threadripper 9960x Str5 5.4ghz 152mb | 3 | não | gtin_diferente |
| 0.975 | Processador Amd Ryzen Threadripper 9980x Str5 3.2ghz 5.4ghz | Processador Amd Ryzen Threadripper 9970x Str5 4ghz 160mb | 3 | não | gtin_diferente |
| 0.975 | Processador Amd Ryzen Threadripper 9970x Str5 4ghz 160mb | Processador Amd Ryzen Threadripper 9960x Str5 5.4ghz 152mb | 3 | não | gtin_diferente |
| 0.975 | Processador Amd Ryzen Threadripper 9980x Str5 3.2ghz 5.4ghz | Processador Amd Ryzen Threadripper 9960x Str5 5.4ghz 152mb | 3 | não | gtin_diferente |
| 0.975 | 8Bitdo Ultimate 2C Wired Controller for Windows PC and Android, with 1000Hz Polling Rate,  | 8Bitdo Ultimate 2C Wired Controller for Windows PC and Android, with 1000Hz Polling Rate,  | 0 | não | decisao_humana |
| 0.975 | 8Bitdo Ultimate 2C Wired Controller for Windows PC and Android, with 1000Hz Polling Rate,  | 8Bitdo Ultimate 2C Wired Controller for Windows PC and Android, with 1000Hz Polling Rate,  | 0 | não | decisao_humana |
| 0.975 | 8Bitdo Ultimate 2C Wired Controller for Windows PC and Android, with 1000Hz Polling Rate,  | 8Bitdo Ultimate 2C Wired Controller for Windows PC and Android, with 1000Hz Polling Rate,  | 1 | não | decisao_humana |
| 0.975 | Fone De Ouvido Sem Fio Xiaomi Redmi Buds 6 Play Preto | Fone de ouvido Bluetooth Xiaomi Redmi Buds 6 Play Original Preto | 4 | não | gtin_diferente |
| 0.975 | Fone de Ouvido Bluetooth Xiaomi Redmi Buds 6 Play Preto, Intra-Auricular | Fone de ouvido Bluetooth Xiaomi Redmi Buds 6 Play Original Preto | 4 | sim |  |
| 0.975 | Fone De Ouvido Sem Fio Xiaomi Redmi Buds 6 Play Preto | Fone de Ouvido Bluetooth Xiaomi Redmi Buds 6 Play Preto, Intra-Auricular | 46 | sim |  |
| 0.975 | Mouse Gamer Redragon Storm Preto Rgb M808-rgb | Mouse Gamer Redragon Storm RGB 12400DPI M808-RGB | 1 | sim |  |
| 0.975 | ELEGOO Resina lavável 8K para impressora 3D Espacial 1KG - Resina de fotopolímero padrão d | ELEGOO Resina lavável 8K para impressora 3D Fumaça 1KG - Resina de fotopolímero padrão de  | 1 | não | decisao_humana |
| 0.975 | ELEGOO Resina lavável 2.0 para impressora 3D Claro 1KG - Resina de fotopolímero padrão de  | ELEGOO Resina lavável 2.0 para impressora 3D Cerâmica 1KG - Resina de fotopolímero padrão  | 1 | não | decisao_humana |
| 0.975 | Cooktop 5 Bocas Chamalux Tripla Chama Cor Rosa | Cooktop 5 Bocas Tripla Chama Chamalux Vermelho | 2 | sim |  |
| 0.975 | Câmera Fujifilm X-e5 Mirrorless (corpo/preta) Preto | Câmera Fujifilm X-e5 Mirrorless (corpo/prateado) Preto | 3 | sim |  |
| 0.975 | Câmera Segurança Ip Poe Intelbras Vip 1300 Mini Sd Cor Preto | Câmera Segurança Ip Poe Intelbras Vip 1300 Mini Sd Cor Branco | 3 | não | gtin_diferente |
| 0.975 | Call of the night: canções da noite 02 - Kotoyama - Panini - Capa Mole | Call of the night: canções da noite 01 - Kotoyama - Panini - Capa Mole | 7 | não | gtin_diferente |
| 0.975 | Bola Vôlei Mormaii Beach Sports Vb500 Praia Homologada Cor Azul | Bola Vôlei Mormaii Beach Sports Vb500 Praia Homologada Cor Laranja | 2 | não | gtin_diferente |
| 0.975 | Smartphone Realme Note 60s Celular 128 Gb 4gb Ram Dual Sim Verde | Smartphone Realme Note 60s Celular 128 Gb 4gb Ram Dual Sim Preto | 5 | não | gtin_diferente |
| 0.975 | Fone Bluetooth Redmi Buds 6 Lite Xiaomi Preto | Fone Bluetooth Redmi Buds 6 Lite Xiaomi, Azul | 5 | não | gtin_diferente |
| 0.975 | Fone Bluetooth Redmi Buds 6 Lite Xiaomi Preto | Fone Bluetooth Redmi Buds 6 Lite Xiaomi, Branco | 4 | não | gtin_diferente |
| 0.975 | Fone Bluetooth Redmi Buds 6 Active Xiaomi, Branco | Fone Bluetooth Redmi Buds 6 Active Xiaomi Preto | 6 | não | gtin_diferente |
| 0.975 | Fone Bluetooth Redmi Buds 6 Lite Xiaomi, Azul | Fone Bluetooth Redmi Buds 6 Lite Xiaomi, Branco | 4 | não | gtin_diferente |
| 0.975 | Fone Ouvido Stereo P2 3.5mm Super Bass Com Fio Android Iphon Cor Vermelho | Fone Ouvido Stereo P2 3.5mm Super Bass Com Fio Android Iphon Cor Azul | 2 | não | gtin_diferente |
| 0.975 | Power Bank Baseus Esazi 2a Quick Charge 20000mah Preto | Power Bank Baseus Esazi 2a Quick Charge 20000mah Branco | 3 | não | gtin_diferente |
| 0.96 | Controle Para Nintendo Switch- Joycon Alta Qualidade/Envio Imediato | Controle Nintendo Switch Joycon alta qualidade Envio Rapido | 1 | não |  |
| 0.96 | de Controles Joy-Con Nintendo para Switch Azul-Claro e Vermelho | Controles Joy-Con para Nintendo Switch - verde e rosa | 2 | não | decisao_humana |
| 0.96 | Strap Controle Nintendo Switch Joy-Con | Joy-Con Strap NINTENDO SWITCH | 1 | não |  |
| 0.96 | L.A. Noire Nintendo Switch | JOGO LA NOIRE NINTENDO SWITCH MIDIA FISICA ENVIO IMEDIATO | 1 | não |  |
| 0.96 | Nintendo Switch Lite Azul Turquesa Desbloqueado | Nintendo Switch Lite Desbloqueado | 1 | não | condicao_nao_nova |
| 0.96 | Nintendo Switch Lite Azul Turquesa Desbloqueado | envio rapido NOVO CONSOLE NINTENDO SWITCH LITE DESBLOQUEADO COM NOTA E GARANTIA | 1 | não | condicao_nao_nova |
| 0.96 | Nintendo Switch Lite Desbloqueado | envio rapido NOVO CONSOLE NINTENDO SWITCH LITE DESBLOQUEADO COM NOTA E GARANTIA | 1 | não | condicao_nao_nova |
| 0.96 | Controle Sem Fio Dualsense Cobalt Blue - PS5 | Controle Sem Fio Sony DualSense, PlayStation 5, Bluetooth, Branco - 3005767 | 1 | não |  |
| 0.96 | Controle Sem Fio Dualsense Cobalt Blue - PS5 | Controle Sem Fio Ps5 Dualsense Branco V2 | 1 | não |  |
| 0.96 | Controle Sem Fio Ps5 Dualsense Branco V2 | Controle Sony DualSense PS5, Sem Fio, Gray Camuflado - 1000039944 | 1 | não |  |
| 0.96 | Controle Sem Fio Dualsense Cobalt Blue - PS5 | Controle Sony DualSense PS5, Sem Fio, Gray Camuflado - 1000039944 | 1 | não |  |
| 0.96 | Air Fryer Britânia 5l Antiaderente Gold 1500w Baf45a Cor Preto | Fritadeira Air Fryer 5l Antiaderente 1500w Baf45a Britânia | 3 | não | gtin_diferente |
| 0.96 | Controle Xbox Wireless Series X/s Carbon Black Carbon Black | Controle Sem Fio Microsoft Xbox Wireless Series X/s Cor Carbon Black Preto | 1 | não |  |
| 0.96 | Câmera Digital Kodak Pixpro Fz45 (vermelha) S/juros Vermelho | Câmera digital Kodak Pixpro Fz45 Cor prata | 4 | não | gtin_diferente |
| 0.96 | Câmera Digital Kodak Pixpro Fz45 (branca) Branco | Câmera digital Kodak Pixpro Fz45 Cor prata | 4 | não | gtin_diferente |
| 0.96 | Câmera digital Kodak EasyShare M532 em preto. | Câmera digital Kodak EasyShare M532 Preta. | 2 | não | gtin_diferente |
| 0.96 | Câmera Digital Kodak Pixpro Fz45 (branca) Branco | Câmera Digital Kodak Pixpro Fz45 (vermelha) S/juros Vermelho | 6 | não | gtin_diferente |
| 0.96 | Cadeira Gamer Thunderx3 Profissional Tgc12 Preta | Cadeira Gamer Profissional Tgc12 Thunderx3 Cor Preta/verde | 10 | não | gtin_diferente |
| 0.96 | Mouse Gamer Sem Fio Logitech G Pro X Superlight - Preto | Mouse Gamer Sem Fio Logitech G PRO X SUPERLIGHT - Vermelho | 7 | não |  |
| 0.96 | Controle Com Fio PowerA Pokémon para Nintendo Switch, Com Vibração | Controle PowerA Pokémon para Nintendo Switch Com Fio USB | 2 | não |  |
| 0.96 | Headset Gamer Sem Fio Logitech G435 LIGHTSPEED - Azul | Headset Gamer Sem Fio Logitech G435 LIGHTSPEED - Preto | 3 | não |  |
| 0.96 | Mouse Gamer Razer Basilisk V3 Pro 35K Sem Fio Branco | Mouse Gamer Razer Basilisk V3 Pro 35K, Sem Fio, para Destros, Prateado | 2 | não | gtin_diferente |
| 0.96 | Controle sem fio 8BitDo Ultimate 2 para Windows e Android - joysticks TMR, Bluetooth e 2.4 | Controle sem fio 8BitDo Ultimate 2 para PC Windows e Android - joysticks TMR, Bluetooth/2. | 0 | não | decisao_humana |
| 0.96 | ENVIO RAPIDO! NINTENDO SWITCH LITE DESBLOQUEADO | NOTA FISCAL Nintendo Switch lite desbloqueado com nota e garantia | 1 | não | condicao_nao_nova |
| 0.96 | Headphone Bluetooth 6.0 Jbl Tune 730bt Fone Ouvido Azul | Headphone Bluetooth 6.0 Jbl Tune 730bt Fone Ouvido Branco | 2 | não |  |
| 0.95 | Fritadeira Air Fryer 4,2l Bfr37 Britânia Cor Preto | Britânia Bfr37 fritadeira air fryer preto 4,2L | 13 | não |  |
| 0.95 | Fone Headphone Sem Fio Bluetooth Fone Ouvido Estéreo Inova Cor Azul | Fone Headphone Sem Fio Bluetooth Fone Ouvido Estéreo Inova Cor Vermelho | 2 | não |  |
| 0.946 | Wilson Bola de Basquete NBA DRV 7 | Wilson Bola de Basquete NBA DRV PRO 7 | 1 | não | decisao_humana, variante |
| 0.946 | Robô aspirador Xiaomi Mi Robot Vacuum-Mop P preto | Robô aspirador Xiaomi Mi Robot Vacuum-Mop 2 branco | 3 | não | numeral_ausente |
| 0.946 | Robô Aspirador Xiaomi H50 Pro Branco 110v | Aspirador Robô Xiaomi 5C H50 Pro | 3 | não | voltagem_ausente |
| 0.946 | Robô Aspirador Xiaomi H50 Pro Branco 110v | Robô Aspirador Xiaomi H50 Pro 2026 Branco | 3 | não | gtin_diferente, voltagem_ausente |
| 0.946 | Robô Aspirador Xiaomi H50 Pro Branco 110v | Robô Aspirador Xiaomi H50 Pro Branco | 24 | não | gtin_diferente, voltagem_ausente |
| 0.946 | Fone De Ouvido Sem Fio Anker Soundcore Life P2 Mini Preto | Fone De Ouvido Anker Soundcore Life Q30 Cancelamento D Ruído Cor Preto | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Soundbar JBL 1300X MK2 11.1.14 Canais Preto para Home Theater com Dolby Atmos e Bluetooth | JBL SOUNDBAR 1300MK2 11.1.4 Canais | 4 | não | gtin_diferente, modelo_ausente |
| 0.946 | Caixa de Som JBL Boombox 2 Portátil com Bluetooth Preta à Prova d’Água | Caixa De Som Boombox 2 80w Bluetooth À Prova D'água Jbl Cor Verde-escuro | 6 | não | spec_w_ausente |
| 0.946 | Caixa De Som Bluetooth Boombox 4 Jbl 210w Prova D'água Azul | Caixa de Som JBL Boombox 4 Bluetooth Portátil à Prova d'Água Laranja | 4 | não | gtin_diferente, spec_w_ausente |
| 0.946 | Freezer Horizontal Consul 309l Cha31fb Cor Branco | Freezer horizontal Consul CHA31EB branco 309L | 2 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Nintendo Switch 2 - 256 GB - NACIONAL + Bundle EA Sports FC 27 - Lacrado | Bundle Nintendo Switch 2 + Ea Sports Fc 27 Nacional Com NF | 1 | não | capacidade_ausente |
| 0.946 | Nintendo Switch OLED Zelda desbloqueado | Nintendo switch OLED desbloqueado novo  256 GB versão Zelda | 1 | não | condicao_nao_nova, capacidade_ausente |
| 0.946 | Aspirador De Pó Vertical Banco 1.350 W 1 litro APV 1350 220V turbo Vonder | Aspirador De Pó Vertical Banco 1.350 W 1 litro APV 1350 turbo Vonder | 1 | não | voltagem_ausente |
| 0.946 | Câmera de segurança inteligente TP-Link Tapo C100 V1 Tapo branca cor 1 | Câmera de segurança inteligente TP-Link Tapo C100 V1 Tapo, cor branca2 | 2 | não | gtin_diferente, numeral_ausente |
| 0.946 | Fone De Ouvido Bluetooth Galaxy Buds Pro Preto Samsung | Fone De Ouvido Samsung Galaxy Buds Pro Bluetooth R190 | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Fone De Ouvido Bluetooth Samsung Galaxy Buds Pro Violeta | Fone De Ouvido Samsung Galaxy Buds Pro Bluetooth R190 | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Controle joystick sem fio Playstation Dualshock PS4 | Controle Joystick Sem Fio PS4 PlayStation Dualshock 4 100% | 1 | não | numeral_ausente |
| 0.946 | Controle Sem Fio Dualsense Chroma Pearl Ps5 - Sony | Controle sem fio PlayStation DualSense™ – Chroma Pearl | 0 | não | plataforma_ausente |
| 0.946 | Controle sem fio PS5 DualSense Gray Camouflage | DualSense™ – Gray Camouflage | 0 | não | plataforma_ausente |
| 0.946 | Controle Dualsense Chroma Indigo - Ps5 Azul | PlayStation Controle sem fio DualSense® – Chroma Indigo | 0 | não | plataforma_ausente |
| 0.946 | Processador Intel Core I7-12700KF 3.60GHz 25MB | Processador Intel Core i5 460M Para Notebook 2.8 GHz | 2 | não | gtin_diferente, cpu_gpu_ausente |
| 0.946 | Processador Intel Core i5 460M Para Notebook 2.8 GHz | Processador Intel Core i7-2600 para Computadores de Mesa | 2 | não | gtin_diferente, cpu_gpu_ausente |
| 0.946 | Processador Intel Core i5-10400F para Computadores de Mesa | Processador Intel Core i5 460M Para Notebook 2.8 GHz | 2 | não | gtin_diferente, cpu_gpu_ausente |
| 0.946 | Processador Intel Core i7 860 Para Desktop | Processador Intel Core i5 460M Para Notebook 2.8 GHz | 2 | não | gtin_diferente, numeral_ausente |
| 0.946 | Processador Intel Core i5 460M Para Notebook 2.8 GHz | Processador Intel Core I5-11400 | 2 | não | gtin_diferente, cpu_gpu_ausente |
| 0.946 | Processador Intel Core i5 460M Para Notebook 2.8 GHz | Processador Intel Core I5 - 460m 2.53ghz Para Samsung Rv411 | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Processador Intel Core i7-2600 3.4GHz Quad-Core LGA1155 DDR3 | Processador Intel Core i7-2600 para Computadores de Mesa | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L, Mondial, 2000W - AFON-12L-BI | Fritadeira Air Fryer Forno Oven 12L Mondial 2000W - AFON-12L-WI | 16 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Elétrica Mondial Big Fry 2,5L FT-07 110V | Fritadeira Elétrica Mondial Big Fry 2,5L FT-07 | 1 | não | voltagem_ausente |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-WI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-BI-BC | 1 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-RI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-BI-BC | 1 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L, Mondial, 2200W - AFON-12L-BI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-BI-BC | 1 | não | gtin_diferente, modelo_ausente |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-FB | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-BI-BC | 1 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-WI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-RI | 2 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L, Mondial, 2200W - AFON-12L-BI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-WI | 20 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-WI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-FB | 3 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Elétrica Sem Óleo Air Fryer Mondial 5L Grand Family AFN-50 Timer 1900W | Fritadeira Elétrica Sem Óleo Air Fryer Mondial 5L Grand Family AFN-50-RI Timer 1900W | 1 | não | modelo_ausente |
| 0.946 | Fritadeira Air Fryer Forno Oven 12l Mondial Afon-12l-ab Preto | Fritadeira Air Fryer Forno Oven 12l Mondial AFON-12L-BIN | 3 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L, Mondial, 2200W - AFON-12L-BI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-RI | 2 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-FB | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W - AFON-12L-RI | 2 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L, Mondial, 2200W - AFON-12L-BI | Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-FB | 3 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Fritadeira Air Fryer Forno Oven Mondial 12l 2000w 220v | Mondial Fritadeira Air Fryer Forno Oven 12L, Preto/Inox, 2000W, 220V - AFON-12L-BI | 1 | não | decisao_humana, modelo_ausente |
| 0.946 | Fritadeira Air Fryer Forno Oven 12L, Mondial, 2000W - AFON-12L-BI | Mondial Fritadeira Air Fryer Forno Oven 12L, Preto/Inox, 2000W, 220V - AFON-12L-BI | 1 | não | decisao_humana, voltagem_ausente |
| 0.946 | Camera De Ação 360 Insta360 X6 Essentials Bundle 8k50 Preto | Câmera de ação Insta360 X6 Essentials Bundle preta preta | 4 | não | numeral_ausente |
| 0.946 | Switch Gigabit De Mesa Tp-link Ls108g Com 8 Portas | Switch Gigabit de Mesa com 8 Portas TP-Link LS1008G | 1 | não | decisao_humana, modelo_sufixo |
| 0.946 | Headset Gamer Hyperx Cloudx Stinger Para Xbox One Hx-hscscx-bk/ww | Headset Gamer HyperX CloudX Stinger Over-ear com Microfone para Xbox | 5 | não | gtin_diferente, plataforma_ausente |
| 0.946 | Headset Gamer HyperX CloudX Stinger Over-ear com Microfone para Xbox | Headset Gamer HyperX CloudX Stinger 2 para Xbox, Com Fio, Branco | 3 | não | gtin_diferente, numeral_ausente |
| 0.946 | Headset Gamer Hyperx Cloud Stinger Hx-hscss-bk/am Ps4 Ps5 | Headset Gamer Hyperx Cloud Stinger, Preto, Hx-hscs-bk/na Preto | 2 | não | gtin_diferente, plataforma_ausente |
| 0.946 | Pendrive SanDisk Ultra Dual m3.0 32GB 3.0 preto | Pendrive SanDisk Ultra Dual 32GB 3.0 branco | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Pendrive Sandisk Ultra Shift SDCZ410-128G-G46 usb 3.0 128gb preto rápido | Pendrive SanDisk Ultra Shift de 128 GB USB 3.0 em Preto | 8 | não | gtin_diferente, modelo_ausente |
| 0.946 | Pendrive Sandisk Cruzer Fit Cz33 32gb Cor Preto | Pendrive Sandisk Cruzer Fit 32gb 2.0 Preto | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Cartão Memória Micro Sd Sandisk 64gb P/nintendo 100mbs | Cartão de Memória SanDisk Micro SD, 64Gb | 1 | não | decisao_humana, modelo_ausente |
| 0.946 | Cartão Memória Micro Sd Sandisk 256gb Microsd Ultra 150mbs | Cartão Memória Microsd Sandisk 256gb Micro Sd Ultra 100mbs | 7 | não | gtin_diferente, modelo_sufixo |
| 0.946 | PS4 Slim 1TB OU 500GB + 1 OU 2 CONTROLES + 1 JOGO ORIGINAL | PS4 PlayStation 4 Slim + 2 Controles + Garantia + Nota Fiscal | 1 | não | capacidade_ausente |
| 0.946 | Câmera Canon Eos R50 Mirrorless Com Lente 18-45mm | Câmera Canon Eos R50 Mirrorless Lente 18-45mm Branca S/juros Branco | 7 | não | numeral_ausente |
| 0.946 | Câmera Canon Eos R5 Mirrorless 8k (corpo) Preto | Câmera Canon Eos R5 Ii Mirrorless 8k (corpo) Preto | 7 | não | numeral_ausente |
| 0.946 | Câmera Mirrorless Canon Eos R100 - Corpo + Nf-e * Cor Preto | Câmera Canon Eos R10 Mirrorless Corpo | 4 | não | modelo_ausente |
| 0.946 | Câmera Mirrorless Canon Eos R10 - Corpo - Com Nf-e | Câmera Mirrorless Canon Eos R100 - Corpo + Nf-e * Cor Preto | 7 | não | modelo_ausente |
| 0.946 | Memória Ram DDR5 16GB Corsair 6000MHz RGB Vengeance MH16GX5M1D6000Z38 | Memória RAM Corsair Vengeance DDR5 16GB 5600MHz RGB - Preto | 8 | não | gtin_diferente, modelo_ausente |
| 0.946 | Placa de Vídeo Asus GeForce RTX 5070 Prime OC Edition 12GB GDDR7 192-bit | Placa De Vídeo Asus Prime Geforce Rtx 5070 12gb Gdr7 | 3 | não | gtin_diferente, modelo_ausente |
| 0.946 | Fonte Xbox 360 Super Slim Bivolt 1 Pino KNUP | Fonte Xbox 360 Super Slim Bivolt 1 Pino KNUP KP-W017 | 1 | não | modelo_ausente |
| 0.946 | Aspirador de Pó e Água WAP GTW 10 1400W 220V | Aspirador de Pó e Água 1400W WAP GTW 10 | 1 | não | voltagem_ausente |
| 0.946 | Aspirador Antiácaro WAP Mite Cleaner UV Luz UV Filtro HEPA 127v 400W | Aspirador Antiácaro WAP Mite Cleaner UV Luz UV Filtro HEPA 400W | 1 | não | voltagem_ausente |
| 0.946 | Aspirador De Pó e Água Profissional WAP GTW 25 Inox 2000W 25L 127V/220v FW010527 | Aspirador De Pó e Água Profissional WAP GTW 25 Inox 2000W 25L 127V FW010527 | 1 | não | voltagem_bivolt |
| 0.946 | Robô Aspirador De Pó Wap Robot W310 Bivolt | WAP Robô Aspirador Robot W310 3 em 1 Bivolt | 1 | não | decisao_humana, numeral_ausente |
| 0.946 | Smart Tv 32 Philco Roku Tv Led Dolby Áudio | Smart TV 32" Philco Roku TV Dolby Áudio HDR10 P32CRB | 1 | não | decisao_humana, modelo_ausente |
| 0.946 | Smart Tv 32 Philco Roku Tv Led Dolby Áudio | Smart Tv 32 Philco Led Roku Tv Hd Dolby Audio P32cra | 3 | não | gtin_diferente, modelo_ausente |
| 0.946 | Smart Tv 32 Philco Led Roku Tv Hd Dolby Audio P32cra | Smart TV 32" Philco Roku TV Dolby Áudio HDR10 P32CRB | 1 | não | decisao_humana, modelo_sufixo |
| 0.946 | Carregador Portátil Indução 10000mAh Power Bank Anker MagGo Magnético MagSafe para Apple i | Carregador Portátil Indução 10000mAh Power Bank Anker MagGo Qi2 Magnético MagSafe para App | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Carregador Portátil Indução 10000mAh Power Bank Anker MagGo Qi2 Magnético MagSafe para App | Carregador Portátil Indução 10000mAh Power Bank Anker MagGo Magnético MagSafe para Apple i | 1 | não | gtin_diferente, modelo_ausente |
| 0.946 | KODAK Câmera Digital PIXPRO Zoom FZ45-RD de 16 MP com Zoom óptico de 4X, ângulo amplo de 2 | KODAK Câmera Digital PIXPRO Zoom FZ45-WH de 16 MP com Zoom óptico de 4X, ângulo amplo de 2 | 1 | não | decisao_humana, modelo_sufixo |
| 0.946 | Tablet Xiaomi Redmi Pad 2 11 4gb/128gb/wifi Cinza Grafite | Tablet Xiaomi Redmi Pad 4gb+128gb Cinza Cor Cinza Escuro | 3 | não | gtin_diferente, numeral_ausente |
| 0.946 | Tablet Xiaomi Redmi Pad 2 11 4gb/128gb/wifi - Grafite | Tablet Xiaomi Redmi Pad 4gb+128gb Cinza Cor Cinza Escuro | 3 | não | gtin_diferente, numeral_ausente |
| 0.946 | Tablet Xiaomi Redmi Pad 4gb+128gb Cinza Cor Cinza Escuro | Tablet Xiaomi Redmi Pad | 3 | não | gtin_diferente, capacidade_ausente |
| 0.946 | Aspirador de Pó Philco Vertical 2 em 1 1450w Pas1600p - 127 | Aspirador de Pó Vertical Philco 2 em 1 1450W PAS1600P | 1 | não | numeral_parcial |
| 0.946 | ASPIRADOR DE PÓ PORTÁTIL E VERTICAL 2000W POWER CLEAN PHILCO 220V | Philco Aspirador Pó Vertical Power Clean 2000W PAS4000V 220V | 1 | não | decisao_humana, modelo_ausente |
| 0.946 | Fritadeira Air Fryer 5,5l Widemax Com Interior De Alumínio 1900w Midea | Fritadeira Air Fryer 5,5l Widemax Com Interior De Alumínio 1900w Midea - 220V | 1 | não | voltagem_ausente |
| 0.946 | Memória RAM Kingston Fury Beast, 16GB, 5600MHz, DDR5, CL40 | Memória RAM Kingston Fury Beast de 32 GB (2x16 GB) Ddr5 de 6000 mhz | 2 | não | capacidade_parcial |
| 0.946 | Memória Ram Ddr4 Kingston Fury Beast Rgb 16gb 3600mhz Preto | Memória RAM Kingston Fury Beast Rgb White Ddr5 16gb 5600mt/s | 3 | não | gtin_diferente, modelo_ausente |
| 0.946 | Memória Ram Kingston Fury Beast Ddr4 16gb 3600 Mhz | Memória RAM Kingston Fury Beast de 32 GB (2x16 GB) Ddr5 de 6000 mhz | 2 | não | capacidade_parcial |
| 0.946 | Memória Ram Kingston Fury 16gb 2666mhz Kf426s15ib1/16 | Memória RAM Kingston Fury DDR5 para Computadores de Mesa 16GB com 6400MHz | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Memória Ram Kingston Fury Beast Rgb Ddr4 32gb 3200mt/s Cl16 Ram | Memória RAM DDR5 32GB 6000MHz Kingston Fury Beast CL30 RGB | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Memória Ram Kingston Fury Beast Rgb Ddr4 32gb 3200mt/s Cl16 Ram | Memória RAM Kingston Fury Beast Rgb Ddr4 32gb 3600mt/s | 2 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Memória RAM Kingston Fury Beast Ddr4 Rgb 32 GB 3733 MB/s | Memória RAM DDR5 32GB 6000MHz Kingston Fury Beast CL30 RGB | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Memória Ram Ddr5 Kingston Fury Beast Rgb, 6000 Mhz, 1x32 Gb, CL30 - KF560C30BBEA-32 | Memória RAM DDR5 32GB 6000MHz Kingston Fury Beast CL30 RGB | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Memória RAM DDR5 32GB 6000MHz Kingston Fury Beast CL30 RGB | Memória RAM Kingston Fury Beast Rgb Ddr4 32gb 3600mt/s | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Memória RAM Kingston Fury Beast Rgb Expo Ddr5 32gb 6000mt/s | Memória Ram Kingston Fury Beast Rgb Expo Ddr5 32gb 6400mt/s | 2 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Memória Ram Kingston Fury Renegade Rgb 16gb Ddr4 3600mhz | Memória Ram Pc 16gb Kingston Fury Renegade Rgb Ddr5 6400mhz | 2 | não | gtin_diferente, plataforma_ausente |
| 0.946 | Memória Ram Kingston Fury Renegade Rgb 16gb Ddr4 3600mhz | Memória RAM Kingston Fury Renegade Rgb Ddr5 16gb 7200mt/s | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Fritadeira Air Fryer Elgin 4,2L Quad Fry com Tecnologia Air Circuit 360° | Fritadeira Air fryer, Elgin, Quad Fry - 1.400W, 4,2L, Com Tecnologia Air Circuit 360° | 1 | não | spec_w_ausente |
| 0.946 | Fritadeira Air Fryer Facilita Fry 3,5 Litros Elgin | Fritadeira Elétrica Air Fryer Facilita Fry Elgin - 3.5 Litros, 110V | 1 | não | decisao_humana, voltagem_ausente |
| 0.946 | Fritadeira Oster Diamondtech 6L Com Visor Transparente 110V | Fritadeira Digital Air Fryer Oster 6L com Visor Transparente DiamondTech | 1 | não | voltagem_ausente |
| 0.946 | Webcam Full HD Logitech Brio 100 - Branco | Webcam Logitech Brio Ultra Hd para gravação e streaming | 2 | não | numeral_ausente |
| 0.946 | Webcam Full HD Logitech Brio 300 - Branco | Webcam Logitech Brio Ultra Hd para gravação e streaming | 2 | não | numeral_ausente |
| 0.946 | Webcam Full HD Logitech Brio 500 - Branco | Webcam Logitech Brio Ultra Hd para gravação e streaming | 2 | não | numeral_ausente |
| 0.946 | Carregador Turbo 65w Tipo C Hrebos Original Para Celular Branco CRG-229 | Carregador Turbo Hrebos 65w Para MacBook e Celulares Tipo-C | 3 | não | gtin_diferente, modelo_ausente |
| 0.946 | Processador AMD Ryzen 7 7800X3D 4.2GHz (5.0GHz Max) AM5 | Processador Amd Ryzen 7 9800x3d 104mb 4.7ghz - 5.2ghz | 43 | não | gtin_diferente, modelo_sufixo |
| 0.946 | Processador Amd Ryzen 7 5700x Oem | Processador OEM AMD Ryzen 7 5700X 4.6GHz AM4 | 3 | não | gtin_diferente, modelo_ausente |
| 0.946 | Power Bank Geonav 10.000mah - Pb10kwt- Branco | Power Bank 10.000 Mah Geonav Cor Cinza | 2 | não | modelo_ausente |
| 0.946 | 8BitDo Ultimate 2C Wireless Controller for Windows PC and Android, with 1000 Hz Polling Ra | 8BitDo Ultimate 2 Wireless Controller for Windows, Apple, Steam & Android, TMR Joysticks,  | 0 | não | decisao_humana, numeral_ausente |
| 0.946 | Fritadeira Elétrica Fischer Air Fryer Dual Grill 220v 4l Preto | Fritadeira Air Fryer Fischer Dual Grill 4 L Digital Preto | 6 | não | gtin_diferente, voltagem_ausente |
| 0.946 | Fone De Ouvido Xiaomi Bluetooth Redmi Buds 3 Original | Fone De Ouvido Xiaomi Redmi Buds 7s Cor Branco | 2 | não | numeral_ausente |
| 0.946 | Fone de ouvido in-ear sem fio Xiaomi Redmi buds 6 preto | Fone De Ouvido Xiaomi Redmi Buds 7s Cor Branco | 2 | não | numeral_ausente |
| 0.946 | Smart TV Box Proeletronic SmartPLUS+ 4K com Android | TV Box Proeletronic SmartPLUS+ 4K com Android 10 e 16GB | 2 | não | capacidade_ausente |
| 0.946 | Tv Box Proeletronic SmartPro 4k, com Android 10 E 16gb Smart Box PROSB-3000/16GB | Proeletronic Smartpro 4K TV Box Android 10 PROSB-3000/16GB | 1 | não | decisao_humana, numeral_ausente |
| 0.946 | ELEGOO Resina lavável 8K para impressora 3D Espacial 1KG - Resina de fotopolímero padrão d | ELEGOO Resina lavável 2.0 para impressora 3D Claro 1KG - Resina de fotopolímero padrão de  | 1 | não | decisao_humana, resolucao_ausente |
| 0.946 | ELEGOO Resina lavável 8K para impressora 3D Espacial 1KG - Resina de fotopolímero padrão d | ELEGOO Resina lavável 2.0 para impressora 3D Cerâmica 1KG - Resina de fotopolímero padrão  | 1 | não | decisao_humana, resolucao_ausente |
| 0.946 | ELEGOO Resina lavável 2.0 para impressora 3D Claro 1KG - Resina de fotopolímero padrão de  | ELEGOO Resina lavável 8K para impressora 3D Fumaça 1KG - Resina de fotopolímero padrão de  | 1 | não | decisao_humana, resolucao_ausente |
| 0.946 | ELEGOO Resina lavável 2.0 para impressora 3D Cerâmica 1KG - Resina de fotopolímero padrão  | ELEGOO Resina lavável 8K para impressora 3D Fumaça 1KG - Resina de fotopolímero padrão de  | 1 | não | decisao_humana, resolucao_ausente |
| 0.946 | Ar Condicionado Split Agratto One Top Frio 9000 Btus Branco | Ar Condicionado Split Frio 9000 Btus Facst9f-02 Agratto | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Cooktop 5 Bocas Chamalux Tripla Chama Bivolt Branco | Cooktop 5 Bocas Tripla Chama Chamalux Vermelho | 2 | não | voltagem_ausente |
| 0.946 | Cooktop 5 Bocas Chamalux Tripla Chama Cor Rosa | Cooktop 5 Bocas Chamalux Tripla Chama Bivolt Branco | 4 | não | gtin_diferente, voltagem_ausente |
| 0.946 | Câmera Mirrorless Fujifilm X-t5 Com Lente 16-80mm (prata) | Câmera Mirrorless Fujifilm X-t5 E Lente Xf 16-50mm ( Preta ) Cor Preto | 2 | não | numeral_ausente |
| 0.946 | Câmera Mirrorless Fujifilm X-t5 Com Lente 16-80mm (prata) | Câmera Fujifilm X-t50 Mirrorless Prata Com Lente Xf 16-50mm Preto | 2 | não | gtin_diferente, modelo_ausente |
| 0.946 | Teclado Mecânico sem fio Logitech MX Mechanical Mini | Teclado Mecânico sem fio Logitech MX Mechanical | 5 | não | variante |
| 0.946 | Aspirador De Pó Sem Fio Oster Whiteduoclean 2 Em 1 OASP645- Bivolt | Aspirador De Pó Sem Fio Oster Whiteduoclean 2 Em 1 - Bivolt | 0 | não | modelo_ausente |
| 0.946 | Inova Caixa Som Bluetooth Caixa De Som Pequena Som Casa Cor Azul-marinho | Inova Caixa Som Bluetooth Caixa De Som Pequena Som Casa Cor Preto1 | 2 | não | gtin_diferente, modelo_ausente |

(+156 no plano JSON)

## 3. Cestas com nome de master suspeito (26), para o dono decidir

| Master | Título mais comum das ofertas | Ofertas em conflito |
|---|---|---|
| Kit 3 Organização Perfeita Para Seu Setup Gamer Base Display De Jogos  | Kit 3 Organização Perfeita Para Seu Setup Gamer Base Display De Jogos  | 3 |
| KIT 2X FILTROS P/ ASPIRADOR DE PÓ BRITÂNIA BAS1200C / BAS1010P ORIGINA | KIT 2X FILTROS P/ ASPIRADOR DE PÓ BRITÂNIA BAS1200C / BAS1010P ORIGINA | 3 |
| ATTACK SHARK X11 ULTRA Carbon Fiber Wireless 8K PAW3950MAX Gaming Mous | ATTACK SHARK R11 ULTRA Carbon Fiber Wireless 8K PAW3950MAX Gaming Mous | 3 |
| The Last of Us Ps4 Português Dublado | Jogo The Last of US Remasterizado PS4 Midia Fisica Original NOVO LACRA | 4 |
| Fritadeira Air Fryer Forno Oven 12L Mondial 2200W AFON-12L-BI-BC | Sensor Temperatura Air Fryer Oven Mondial Afon-12l-bi-bc | 3 |
| Aspirador Vertical Electrolux Com Fio Stk15 127V Urban | Filtro Aspirador Vertical PowerSpeed Stk12 Stk13 Stk14 Stk15 | 12 |
| Mouse Gamer Redragon Storm RGB 12400DPI M808-RGB | Mouse Gamer Para Jogos Redragon Impact USB Preto RGB 12400 DPI M908 | 3 |
| Fritadeira Air Fry Philco 11 Litros Oven PFR2000P - 220 Volts | Botão Timer Fritadeira Philco Air Fryer Oven PFR2000P | 3 |
| Fritadeira Airfryer Digital Philips Walita - RI9252 | Panela Suporte Branca Airfryer Walita RI9201 RI9252 | 3 |
| Câmera De Ação Insta360 X5 Kit Starter Bundle Preta Preto | Câmera De Ação Insta360 X5 Kit Starter Bundle Preta Preto | 4 |
| The Legend of Zelda™: Tears of the Kingdom Nintendo Switch 2 Edição Ni | The Legend of Zelda: Tears of the Kingdom - Nintendo Switch | 3 |
| Call of Duty Modern Warfare 2 - Xbox One/Series - Original | Call of Duty: Infinite Warfare - Xbox Ones/Series X - Original | 3 |
| Jogo Destiny Original PS4 | Jogo Destiny 2 - Ps4 Mídia Física | 4 |
| Sony Playstation 4 1000gb Ps4 Pro + Ea Fc Fifa 25 + God Raganarok + Gt | Sony Playstation 4 500gb Ps4 Slim + Ea Fc Fifa 25 + God Raganarok + Gt | 8 |
| Super Mario Galaxy 1 + 2 Nintendo Switch Mídia Física Lacrado | Jogo Super Mario Galaxy 1 + 2 Nintendo Switch Original Lacrado | 4 |
| Fritadeira Elétrica Air Fryer Mondial + Liquidificador - Preto Com Ino | Fritadeira Elétrica Air Fryer Mondial + Liquidificador - Preto Com Ino | 8 |
| Sony Playstation 4 1 tera Ps4 + Ea Fc Fifa 26 + God Raganarok + Gta 5  | Sony Playstation 4 500 gb Ps4 + Ea Fc Fifa 26 + God Raganarok + Gta 5  | 4 |
| Air fryer Mondial Cozinha af-30-i | Cesta Interna Air Fryer Mondial AF-30 Cuba Original Antiaderente | 3 |
| Mouse Gamer Rgb Fortrek Crusader Edition 12800dpi | Mouse Gamer Fortrek Crusader 12800Dpi Preto | 3 |
| Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mondial Preto | Fritadeira Elétrica Air Fryer 3,6l + Liquidificador Mondial Preto | 5 |
| SSD Nvme Asgard AN4 1tb Gen4 | SSD Kingston NV3 1TB M.2 2280 NVMe Gen4, Desempenho e Eficiência para  | 4 |
| Jogo Nba 2k 21 Xbox Series X | Jogo Nba 2k 21 Xbox Series X | 5 |
| Fone Ouvido Sem Fio Jbl Wave Beam 2 Preto Cancelamento de Ruído | Fone de Ouvido Intra-Auricular Sem Fio JBL Wave Buds 2, Branco | 4 |
| Mouse Gamer Com Fio USB C3Tech MG-10BK | Mouse Gamer Branco ou Preto USB DPI 3200 MG-80 C3Tech | 3 |
| Sony Playstation 4 1000gb ou 500gb Com 1 ou 2 Manetes Ps4 Slim + Ea Fc | PlayStation 4 PS4 Slim 500GB / 1000 GB com 1 ou 2 Manetes + Ea Fc Fifa | 9 |
| Hélice Inferior + Grade Metálica Air Fryer Mondial AFN40 AFN-40Origina | Hélice Inferior + Grade Metálica Air Fryer Mondial AFN40 AFN-40Origina | 3 |

## 4. Cestas MISTAS (as ofertas se contradizem entre si num eixo que o nome não fixa): 31

Ex.: 110V e 220V na mesma cesta (decisão do dono: voltagem, região, capacidade, tamanho e pack separam). Só sugestão: separar exige criar o master do outro lado.

| Eixo | Master | Grupos (ofertas) | Ofertas na minoria |
|---|---|---|---|
| regiao | Console Nintendo Switch Oled 64gb Tela 7 | importado:2 sem_marca_de_regiao:54 | 2 |
| voltagem | Impressora 3D Bambu Lab P2S Combo de FDM Automática, | 110:4 220:2 | 2 |
| regiao | Jogo Nintendo Switch Super Mario 3d Collection Japonês | importado:2 sem_marca_de_regiao:2 | 2 |
| polegadas | Pelúcia PICHU Pelucia Pokémon Pokemon | 10:1 12:1 20:1 | 2 |
| voltagem | Impressora 3D Bambu Lab A2l | 110:3 220:2 | 2 |
| regiao | Robô Aspirador Xiaomi H50 Pro Branco 110v | importado:2 sem_marca_de_regiao:102 | 2 |
| pack | 4 Pares 8 Unidades De Grip Borracha de Silicone Para Analógicos de Con | 2:1 4:3 10:1 | 2 |
| voltagem | Bambu Lab Impressora 3d X2d Combo Ams 2 | 110:2 220:4 | 2 |
| voltagem | Xiaomi S20+ Robô Aspirador Preto | 110:1 220:1 | 1 |
| regiao | Super Mario 3d World + Bowsers Fury Nintendo Switch | importado:1 sem_marca_de_regiao:12 | 1 |
| voltagem | Impressora 3d Fdm Fechada H2d Combo Ams Bambu Lab | 110:3 220:1 | 1 |
| voltagem | Receiver Denon Avc-x3800h Dolby Atmos 9.4 Canais 8k | 110:1 220:1 | 1 |
| regiao | Jogo Sniper Elite Resistance Ps5 Midia Fisica | importado:1 sem_marca_de_regiao:4 | 1 |
| voltagem | Fritadeira Air Fryer Philco PAF40A 1500W - 4 Litros | 110:1 220:2 | 1 |
| voltagem | Fritadeira Elétrica Air Fryer WAP Barbecue Heat WC AB1030 | 110:1 220:1 | 1 |
| regiao | Impressora 3D Bambu Lab P2S Combo de FDM Automática, | importado:1 sem_marca_de_regiao:45 | 1 |
| regiao | Jogo - Super Mario Bros Japonês - Nintendo | importado:1 sem_marca_de_regiao:1 | 1 |
| regiao | Jogo Rune Factory 3 Special Nintendo Switch Midia Fisica | importado:1 sem_marca_de_regiao:5 | 1 |
| regiao | Mário vs. Donkey Kong Nintendo Switch | importado:1 sem_marca_de_regiao:13 | 1 |
| voltagem | Air Fryer Philco 16L 4 em 1 Painel Digital PAF16A | 110:1 220:2 | 1 |
| regiao | Console Nintendo Switch - The Legend of Zelda: Tears of The Kingdom ED | importado:1 sem_marca_de_regiao:3 | 1 |
| regiao | Resident Evil 7 Gold Edition Ps5 Mídia Física | importado:1 sem_marca_de_regiao:9 | 1 |
| voltagem | Gaabor Aspirador de Pó Silent Dust Off 2 em 1 Fácil de Armazenar Sucçã | 110:4 220:1 | 1 |
| voltagem | Air Fryer Britânia 4,2L Dura Mais 1500W BFR38 | 110:2 220:1 | 1 |
| voltagem | Fritadeira Air Fry Wap Barbecue Wc Ab1090 Smoker 10L 1700W | 110:1 220:1 | 1 |
| voltagem | Aspirador Inteligente Xiaomi | 110:1 220:1 | 1 |
| regiao | Jogo Lego Hobbit Ps4 Europeu | importado:6 sem_marca_de_regiao:1 | 1 |
| voltagem | Air Fryer Forno c/ Visor Philips Walita 12L AI551 | 110:1 220:1 | 1 |
| voltagem | Air Fryer Oven Kitchen Art 16L 4 em 1 com Rotisserie KAF16A | 110:1 220:2 | 1 |
| regiao | Super Smash Bros Ultimate Nintendo Switch Mídia Física | importado:1 sem_marca_de_regiao:28 | 1 |
| regiao | Bambu Lab Impressora 3d X2d Combo Ams 2 | importado:1 sem_marca_de_regiao:9 | 1 |

## 5. Efeito na média da cesta (preço atual das ofertas ativas, sem tirar o que a regra já exclui; antes x depois de tirar as ofertas em conflito duro)

| Cesta | Ofertas | Tiradas | Média antes | Média depois | Mediana antes | Mediana depois | O que saiu |
|---|---|---|---|---|---|---|---|
| 4 Pares 8 Unidades De Grip Borracha de Silicone Para An | 5 | 2 | R$ 16.59 | R$ 19.99 | R$ 19.99 | R$ 19.99 | sho R$ 13 2 Pares 4 Unidades De Grip Borracha de Silicone Para Analógi ; sho R$ 10 10 Pares 20 Unidades De Grip Borracha de Silicone Para Analó |
| Microfone Condensador Samson C02 Cinza | 10 | 2 | R$ 981.56 | R$ 853.89 | R$ 948.36 | R$ 722.37 | ama R$ 1759 Samson C01U Microfone condensador USB Studio (novo) ; ama R$ 1226 Microfone Samson Condensador C03 |
| Tom Clancys Ghost Recon Breakpoint Ps4 Lacrado | 6 | 1 | R$ 184.12 | R$ 161.17 | R$ 155.99 | R$ 151.99 | ama R$ 299 Ubisoft Tom Clancy's Ghost Recon Breakpoint Aurora Edition ( |
| Lego Uma Aventura Lego Videogame - PS4 - Original | 6 | 3 | R$ 98.19 | R$ 110.11 | R$ 98.90 | R$ 98.90 | ama R$ 99 Uma Aventura Lego 2 - PlayStation 4 ; sho R$ 60 UMA AVENTURA LEGO VIDEOGAME 2 - PS4 ; sho R$ 100 Jogo Uma Aventura LEGO 2 Videogame - PS4 - Novo |
| Star Wars: Battlefront - PS4 - Original | 7 | 1 | R$ 119.37 | R$ 105.40 | R$ 129.90 | R$ 102.84 | ama R$ 203 Star Wars Battlefront 2 (PS4) |
| Fone Ouvido Neckband Sem Fio Jbl Tune 125bt Bluetooth B | 10 | 4 | R$ 276.74 | R$ 245.98 | R$ 244.66 | R$ 244.66 | ama R$ 228 JBL, Fone de Ouvido Sem Fio, Tune 520BT, Bluetooth - Azul ; ama R$ 342 JBL, Fone de Ouvido On-Ear, Tune 720BT, Bluetooth, Sem Fio - ; ama R$ 531 JBL, Fone de Ouvido Sem Fio, Bluetooth, Tune Flex TWS - Bran |
| Controle Sem Fio Horipad Gray Para Nintendo Switch 1 E  | 5 | 2 | R$ 385.72 | R$ 343.23 | R$ 369.90 | R$ 355.90 | sho R$ 399 Controle Sem Fio Horipad Edição Yoshi para Nintendo Switch 1 ; sho R$ 500 Controle Sem Fio Horipad Edição Sonic Para Nintendo Switch 1 |
| Jogo Lego Hobbit Ps4 Europeu | 7 | 1 | R$ 174.53 | R$ 156.96 | R$ 157.00 | R$ 155.83 | ama R$ 280 Lego The Hobbit - Ps4 |
| Call of Duty: Modern Warfare - PS4 - Original | 8 | 1 | R$ 224.88 | R$ 203.44 | R$ 223.45 | R$ 199.00 | ama R$ 375 Call of Duty Modern Warfare 2 - PS4 |
| Secadora Electrolux 11kg Essential Care Stl11 | 8 | 1 | R$ 2001.08 | R$ 1815.66 | R$ 1847.74 | R$ 1748.21 | ama R$ 3299 Secadora de Roupas Electrolux 11Kg Cor Inox Essential Care ( |
| Impressora 3D Elegoo Centauri Carbon FDM 500mm/s Alta V | 5 | 1 | R$ 3474.45 | R$ 3792.30 | R$ 3700.00 | R$ 3784.99 | ama R$ 2203 Impressora 3d Fdm Bambu Lab A1 Mini |
| Mídia Física Jogo Ps4 Indivisible Lacrado 505 Games | 5 | 1 | R$ 186.90 | R$ 170.95 | R$ 170.00 | R$ 169.95 | ama R$ 251 Indivisible PS4 |
| Resident Evil 4 Hd Ps4 - Capcom | 5 | 2 | R$ 194.31 | R$ 179.33 | R$ 204.67 | R$ 149.00 | ama R$ 205 Resident Evil Revelations HD (PS4) ; ama R$ 229 Capcom Resident Evil Revelations HD 1 Games (PS4) [video gam |
| Jogo Ps4 Just Cause 4 Midia Fisica | 6 | 1 | R$ 145.27 | R$ 156.34 | R$ 135.00 | R$ 135.00 | sho R$ 90 Jogo Just cause 3 Playstation 4 PS4 Mídia fisica |
| Microfone Lapela Sem Fio Movemic One Shure Mv-one-z7 | 8 | 1 | R$ 2378.20 | R$ 2522.65 | R$ 2268.21 | R$ 2489.42 | ama R$ 1367 Shure Microfone de Lapela Sem Fio MoveMic AMV-LAV-Z7 - Sem C |
| Jogo Rune Factory 3 Special Nintendo Switch Midia Fisic | 6 | 1 | R$ 217.28 | R$ 230.36 | R$ 192.44 | R$ 194.99 | ama R$ 152 Rune Factory 3 Special - Europeu - Nintendo Switch |
| Drone Profissional Xt105 Brushless Câmera Hd 2 Baterias | 6 | 1 | R$ 289.06 | R$ 305.73 | R$ 242.03 | R$ 259.07 | ama R$ 206 Drone com Camera 6K HD, XT105 Drone Profissional com 2 Bater |
| Console Nintendo Switch OLED 64GB Edição Mario Vermelho | 7 | 3 | R$ 3511.57 | R$ 3712.25 | R$ 3399.00 | R$ 3725.00 | mer R$ 3399 Console Híbrido Nintendo Switch OLED Mario Red Edition de 64 ; mer R$ 2899 Console Híbrido Nintendo Switch OLED Mario Red Edition de 64 ; mer R$ 3434 Console Híbrido Nintendo Switch OLED Mario Red Edition de 64 |
| Samsung Galaxy S25+ 512GB, 12GB, Câmera Tripla - Azul M | 6 | 1 | R$ 5320.61 | R$ 5596.43 | R$ 5179.56 | R$ 5224.13 | ama R$ 3942 Samsung Galaxy S25 Edge 5G, 512GB, 12GB, Câmera 200MP |
| Final Fantasy Vii Rebirth Deluxe Edition - Ps5 Físico | 28 | 14 | R$ 319.18 | R$ 303.81 | R$ 294.94 | R$ 298.85 | sho R$ 280 Final Fantasy VII Rebirth MIDIA fisica PS5 ; sho R$ 280 Final Fantasy VII Rebirth PS5 ; sho R$ 426 Final Fantasy VII: Rebirth - PS5 |
| Mini Osciloscópio Portátil Dso152 + Ponta De Prova X10  | 7 | 2 | R$ 269.20 | R$ 257.15 | R$ 267.20 | R$ 261.36 | ama R$ 294 Mini Osciloscópio Digital FNIRSI DSO152 200 KHz Portátil ; ama R$ 305 Mini Osciloscópio Dso152 Digital Portátil 200khz |
| Red Dead Redemption 2 - PS4 - Original | 9 | 3 | R$ 182.36 | R$ 174.47 | R$ 159.99 | R$ 159.98 | ama R$ 152 Red Dead Redemption - PlayStation 4 ; ama R$ 192 Red Dead Redemption - PlayStation 4 ; sho R$ 250 Jogo Red Dead Redemption - PS4 - Original - Novo Lacrado |
| Mário vs. Donkey Kong Nintendo Switch | 14 | 1 | R$ 330.54 | R$ 342.90 | R$ 333.45 | R$ 337.00 | sho R$ 170 🧩 Mario vs. Donkey Kong (Nintendo Switch) - Edição Japonesa |
| Placa de Captura de Vídeo HDMI Nintendo Switch Hlily, 4 | 6 | 1 | R$ 140.87 | R$ 135.95 | R$ 142.40 | R$ 132.90 | ama R$ 165 Placa de captura de vídeo Nintendo Switch, Placa de captura  |
| Turok Trilogy Nintendo Switch Mídia Física Ação Aventur | 5 | 1 | R$ 300.97 | R$ 311.25 | R$ 259.89 | R$ 278.85 | sho R$ 260 Turok Trilogy Bundle Switch Midia Fisica |

---

## Junções de masters aplicadas (autorização do dono, 2026-11-22: "Ok. Autorizo")

Reexecutado o modo `sugerir` às 13:2x (dados mudaram desde as 07:30): 404 pares, 22 com confiança >= 0,97, sem trava e com ofertas ativas a mover (eram 26). Nenhum tem `catalogGate.manual`. Revisei cada par pelos títulos das ofertas dos dois lados (voltagem, região, condição, pack, modelo) e **apliquei 15**, em 3 lotes de 5 (`--lote 0 --juncoes 5`, CESTA_NLP=aplicar), medindo envio antes e depois de cada lote.

**Fora (7):** pares 1 e 2 (Xiaomi H50 Pro: cadeia A>B e B>A, e a cesta de origem mistura S40 Pro bivolt e 110/220V); 8 e 13 (peças de air fryer/aspirador); 12 (Penalty Bola 8 x Bola 8 X, modelo possivelmente diferente); 18 (cadeia com o par 19 dos Redmi Buds 6 Play, o 19 foi aplicado); 20 (a oferta M908 Impact estava na cesta do M808 Storm, erro de cadastro que a junção propagaria; fica para o dono decidir o nome/cesta).

**Impacto no envio:** enviadas na última hora 231 -> 233, 227 -> 225, 225 -> 227; erros de group_messages na hora: 7 -> 7. Sem queda.

**Ofertas movidas:** 83 (8 + 10 + 65). Logs reversíveis (rollback: `scripts/cesta-nlp.ts rollback --log <arquivo> --apply`): `docs/backups/cesta-nlp-log-2026-11-22T13-23-40-454Z.json`, `...T13-24-33-256Z.json`, `...T13-25-12-213Z.json`. Backup lógico = o log (ids das ofertas e do master de origem); os masters incorporados ficam vazios, nada foi apagado.

**Média da cesta (preço atual das ofertas ativas, não em quarentena; antes -> depois; menor preço):**

| Cesta canônica | Ofertas | Média | Menor oferta |
|---|---|---|---|
| Carregador Turbo 65W Kaidi | 7 -> 14 | R$ 101,43 -> 87,70 | R$ 79,99 -> 69,90 |
| Controle DualSense Chroma Teal | 5 -> 9 | R$ 512,63 -> 663,00 | R$ 427,57 -> 427,57 |
| Câmera Canon R100 | 4 -> 7 | R$ 7.645,01 -> 6.830,49 | R$ 5.725,01 -> 5.725,01 |
| Switch 2 Bundle Mario Kart World | 2 -> 3 | R$ 5.449,99 -> 5.233,23 | R$ 4.899,99 -> 4.799,70 |
| Fritadeira WAP AB1050 | 1 -> 2 | R$ 738,24 -> 923,62 | R$ 738,24 -> 738,24 |

Outras: Redmi Buds 6 Play 97 -> 141 ofertas (R$ 131,26 -> 132,73); Fujifilm X-e5 6 -> 9 (R$ 14.325 -> 14.974). Medido sobre o preço corrente, não sobre a série oferta-dia. Cestas com 1 oferta ganharam base para média; as que subiram trocaram ofertas de cor/embalagem diferentes do mesmo modelo.
