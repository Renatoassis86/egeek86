# Mapa de categorias: ciência, tecnologia industrial e demais itens de tecnologia (#60, 2026-11-15)

Pedido do dono (2026-11-15): "esses produtos de ciência, tecnologia industrial e demais itens de tecnologia estejam visíveis em nossa página; veja como as lojas classificam e vamos puxar todos diante de nossas regras".

Regras mantidas, sem nenhuma barreira nova: só produto NOVO e em linha; sem usado, retrô ou fora de linha; sem itens miúdos de baixo valor (peça, cabo, grip, objeto impresso em 3D); console só videogame; grupos só de produtos idênticos; indicadores de preço intactos; foto real. Tudo o que entrou usa o mesmo molde dos tipos de 2026-11-12 (`config-tipos.ts`): consulta de semeadura + léxico aparelho x acessório + nicho, e o master nasce em `review` (invisível) e segue a esteira normal de aprovação.

## 1. Como as 3 lojas classificam

### 1.1 Mercado Livre (medido ao vivo em 2026-11-15, `GET /categories/{id}`, API pública; ids e totais de anúncios)

A árvore de categorias do ML NÃO coincide com a nossa: o que o dono chama de "ciência e tecnologia industrial" está espalhado em 6 raízes.

| Raiz ML | Subárvore relevante (id, anúncios) |
|---|---|
| **MLB1499 Indústria e Comércio** | MLB454785 Ferramentas Industriais (162,8 mil) > **MLB49118 CNC (55,6 mil)** > MLB413212 Máquinas CNC (59 mil), MLB455637 Peças CNC; MLB454980 Usinagem e Acabamento; MLB454787 Fornos e Tratamento Térmico; MLB454798 Equipamento Médico (44 mil) > **MLB454858 Materiais para Laboratório (26 mil)** > MLB454860 Balanças de Laboratório, Becker, Erlenmeyer, Pipetas, Provetas; MLB454829 Controle e Medição; MLB438906 Arquitetura e Desenho; MLB5446 Gráfica e Impressão |
| **MLB263532 Ferramentas** | **MLB5550 Medições e Instrumentação (695 mil)** > MLB455200 Medidores de Eletricidade > **MLB30214 Multímetros (120 mil)**, MLB45283 Osciloscópios (20 mil), MLB30162 Amperímetros, MLB455196 Voltímetros; MLB455198 Medidores de Comprimento > **MLB30163 Paquímetros (43 mil)**, MLB30194 Micrômetros, MLB433459 Relógios Comparadores, MLB401623 Réguas de Precisão; MLB455201 Medidores Ambientais (Higrômetros MLB49081, pH MLB271062, Luxímetros MLB260689, Anemômetros MLB431215); **MLB431216 Termômetros Infravermelhos (12 mil)**; MLB455212 Medidores de Distância (13 mil); MLB2526 Ferramentas Elétricas (665 mil) > Parafusadeiras MLB189008, Perfuração MLB455276, Corte MLB455277, **Soldagem MLB455278 > Estações de Solda MLB48567 (23,6 mil)**, Ferros de Solda MLB48611, Máquinas de Solda MLB261436; MLB2527 Ferramentas Manuais; MLB437789 Pneumáticas |
| **MLB1648 Informática** | MLB1712 Componentes para PC; MLB1700 Conectividade e Redes (Roteadores MLB5867, Switches MLB1708, Placas de Rede MLB9635, Racks MLB419878, Antenas MLB63312); MLB430598 Armazenamento (Pen Drives MLB4980, Discos MLB1669); MLB5875 Impressão > MLB1676 Impressoras, **MLB134190 Impressão 3D** (Impressoras 3D MLB268508, Componentes MLB277812, Canetas 3D MLB270105); MLB271908 Leitores e Scanners (Scanners MLB1660, Leitor de código de barras MLB5906); MLB430637 PC de Mesa; MLB430687 Portáteis; MLB91757 Tablets; MLB14370 Monitores; MLB1718 Nobreaks; MLB1651 Palms e Handhelds |
| **MLB1000 Eletrônicos, Áudio e Vídeo** | **MLB6999 Componentes Eletrônicos (1,35 mi)** > **MLB99779 Placas de Microcontroladores (278 mil)** (Arduino, Raspberry, ESP32), MLB278200 Protoboards, MLB420411 Fontes Chaveadas, MLB455488 Semicondutores, MLB270363 Sensores Indutivos, MLB11620 Displays; MLB264065 Drones e Acessórios; MLB2830 Projetores; MLB3835 Áudio; MLB1002 Televisores |
| **MLB1039 Câmeras e Acessórios** | **MLB4062 Instrumentos Ópticos** > **MLB4064 Microscópios (47,9 mil)**, **MLB80232 Telescópios (7,6 mil)**, MLB4063 Binóculos (12 mil), MLB70298 Monóculos; MLB430403 Drones (MLB430419 Drones, MLB430404 Acessórios e Peças) |
| **MLB1051 Celulares e Telefones** | MLB1055 Celulares e Smartphones; MLB417704 Smartwatches e Acessórios; MLB2908 Rádio Comunicadores |

Domínios do catálogo de produtos (`domain_id`, o que a semeadura realmente usa) confirmados ao vivo neste trabalho: `MLB-MICROSCOPES`, `MLB-TELESCOPES`, `MLB-BINOCULARS`, `MLB-OSCILLOSCOPES`, `MLB-CALIPERS`, `MLB-PRECISION_SCALES`, `MLB-INFRARED_THERMOMETERS`, `MLB-SOLDERING_STATIONS`, `MLB-CNC_ROUTERS` (e `MLB-CNC_CONTROLLERS`, que é peça), `MLB-LASER_CUTTING_AND_ENGRAVING_MACHINES`, `MLB-CUTTING_PLOTTERS`, `MLB-MICROCONTROLLER_BOARDS` e `MLB-MICROCONTROLLERS`, `MLB-LASER_METERS`, `MLB-MULTIMETERS`. Domínios que NÃO existem no catálogo (a busca devolveu outro assunto): fonte de bancada (cai em `MLB-EMBEDDED_SWITCH_MODE_POWER_SUPPLIES`), scanner 3D (cai em `MLB-SCANNERS`, que é o de documentos), NAS e servidor (cai em docking, fita e servidor de impressão).

### 1.2 Shopee Brasil (nível de confiança: médio)

A Shopee não publica a árvore de produtos em página estática nem tem API pública de categorias (as páginas do blog e do Seller Centre exigem login; o blog lista apenas categorias EDITORIAIS: "Celulares & Dispositivos", "Eletronicos & Eletroportateis", "Games & Acessórios", "Auto & Moto", "DIY"). Com agregadores e guias de vendedores, a árvore de produto relevante é:

- **Celulares e Dispositivos**: celulares, tablets, acessórios, wearables.
- **Computadores e Acessórios**: desktops, monitores, componentes de computador, notebooks, teclados e mouses, armazenamento, redes, impressoras.
- **Eletrônicos** (nos guias também "Eletrônicos e Eletroportáteis"): TV, câmera, áudio, drones, casa inteligente.
- **Casa e Construção** > "Ferramentas e Melhorias para a Casa": é onde ficam ferramentas elétricas, multímetro, paquímetro, estação de solda (não há categoria de "ciência" ou "laboratório" própria: instrumentos de medição e Arduino/ESP32 aparecem misturados em Eletrônicos e em Ferramentas).
- **Automotivo**: ferramentas e peças.

Limite: a Shopee não tem catálogo de produto com GTIN/MPN consultável (o projeto só consulta ofertas pela API de afiliados). Por isso não há "semeadura" na Shopee: a oferta Shopee entra DEPOIS, ligada a um master que o ML (ou a Amazon) criou, pelas rotinas de ligação já existentes. Hoje, medido: **0 ofertas ativas de Shopee em Tecnologia** (Shopee tem 2.648 em Games, 126 em Esporte, 7 em Casa).

### 1.3 Amazon Brasil (nível de confiança: médio)

O acesso ao site foi bloqueado (HTTP 503) para leitura automática e a PA-API/Creators ainda não está liberada (`docs/inventario-lojas/amazon.md`). O que se confirmou por busca: a Amazon.com.br tem o departamento **"Ferramentas e Materiais de Construção"**, **"Computadores e Informática"**, **"Eletrônicos"**, **"Celulares e Comunicação"**, **"Automotivo"** (a lista de Mais Vendidos de "Ferramentas de Diagnóstico, Teste e Medição Automotiva" tem multímetros digitais no topo) e, nos EUA, o departamento "Industrial & Scientific" (Lab Instruments & Equipment, Lab Meters, Test Lab Tubes) que no Brasil aparece como **"Indústria, Ciência e Tecnologia"**. Cada ASIN carrega `browseNodeInfo` (nós de navegação e ranking) na PA-API `GetItems`: quando a conta de associado liberar a API, a classificação por nó deve ser lida de lá (decisão registrada na seção 6).

## 2. Medição ANTES (SELECT, 2026-11-15)

Script: `scripts/medir-ciencia-tecnologia-2026-11-15.ts` (somente leitura).

- Masters por vertical x veredito do porteiro: tecnologia 633 aprovados e 3 rejeitados; **nenhum master de tecnologia em `review`** (os 54 em revisão são de Eletrônicos, 38 de Esporte e 77 de Games; nenhum é de ciência). Logo, **não há masters de ciência parados em revisão para liberar**: o problema era de COLETA.
- Departamento: `dept_tecnologia` ligado e público (`rules=[]`), 565 masters visíveis com oferta ativa e 1.942 ofertas ativas (ML 1.570, Amazon 372, Shopee 0).
- Tipos visíveis em `/mercado/tecnologia` (aprovados): placa de vídeo 87, tablet/leitor 79, celular 67, mouse 64, relógio inteligente 52, placa-mãe/fonte/gabinete 39, impressora 36, roteador 30, SSD/HD 19, teclado 16, pendrive/cartão 15, outros 14, captura 12, notebook 11, webcam 11, desktop 11, RAM 9, monitor 8, móveis gamer 8, scanner 8, mousepad 8, mesa digitalizadora 8, nobreak 7, headset 6, cadeira gamer 5, processador 3.
- Itens de ciência e tecnologia industrial (microscópio, telescópio, multímetro, osciloscópio, paquímetro, balança de precisão, termômetro infravermelho, Arduino/ESP32/Raspberry, fonte de bancada, estação de solda, scanner 3D, CNC, gravadora a laser, plotter de recorte) em QUALQUER departamento: **0 masters**. (Os 3 acertos de "Arduino" e 3 de "IoT" caíram em Games por texto de jogo; um deles de "cnc" está rejeitado em Games.)
- O que o banco já tem e já aparece: celular, tablet, smartwatch, notebook, desktop, componentes de PC, redes, armazenamento, impressora (e impressão 3D no próprio departamento), scanner de documentos, mesa digitalizadora, nobreak, captura, webcam. Drone, câmeras, TV, áudio e casa inteligente já existem em Eletrônicos.

Causa-raiz: a semeadura só tinha consultas para as categorias do cardápio de 2026-11-11/12; as categorias de ciência e tecnologia industrial do ML não tinham consulta nenhuma. Shopee e Amazon não semeiam masters.

## 3. Mapa categoria-da-loja -> departamento/tipo do site

| Categoria da loja (ML) | Domínio do catálogo | Segmento de semeadura (novo) | Tipo em /mercado/tecnologia |
|---|---|---|---|
| MLB4064 Microscópios | MLB-MICROSCOPES | `microscopio` | Microscópios, telescópios e binóculos |
| MLB80232 Telescópios | MLB-TELESCOPES | `telescopio` | idem |
| MLB4063/MLB70298 Binóculos e Monóculos | MLB-BINOCULARS | `binoculo` | idem |
| MLB30214 Multímetros, MLB30162 Amperímetros | MLB-MULTIMETERS | `multimetro` | Multímetros, osciloscópios e fontes de bancada |
| MLB45283 Osciloscópios | MLB-OSCILLOSCOPES | `osciloscopio` | idem |
| (fonte de bancada: sem domínio no catálogo) | n/d | `fonte-bancada` (rende ~0) | idem |
| MLB30163 Paquímetros, MLB30194 Micrômetros | MLB-CALIPERS | `paquimetro` | Paquímetros, balanças de precisão e medidores |
| MLB454860 Balanças de Laboratório | MLB-PRECISION_SCALES | `balanca-precisao` | idem |
| MLB431216 Termômetros Infravermelhos | MLB-INFRARED_THERMOMETERS | `termometro-infravermelho` | idem |
| MLB455212 Medidores de Distância | MLB-LASER_METERS | `medidor-laser` | idem |
| MLB99779 Placas de Microcontroladores | MLB-MICROCONTROLLER_BOARDS / MLB-MICROCONTROLLERS | `placa-microcontrolada` | Arduino, Raspberry Pi, ESP32 e prototipagem |
| MLB48567 Estações de Solda, MLB48611 Ferros de Solda | MLB-SOLDERING_STATIONS | `estacao-solda` | Estações de solda e retrabalho |
| MLB49118 CNC > Máquinas CNC | MLB-CNC_ROUTERS | `maquina-cnc` | Scanners 3D, CNC, laser e plotters de recorte |
| laser (gravadora/cortadora) | MLB-LASER_CUTTING_AND_ENGRAVING_MACHINES | `gravadora-laser` | idem |
| plotter de recorte e cortadora de vinil | MLB-CUTTING_PLOTTERS | `plotter-corte` | idem |
| scanner 3D (MLB1660 Scanners) | cai em MLB-SCANNERS (documentos) | `scanner-3d` (nicho exige "3d") | idem |
| MLB1676 Impressoras, MLB5875 Impressão | MLB-PRINTERS | já existia (`impressora`) | Impressoras |
| MLB134190 Impressão 3D | MLB-3D_PRINTERS | já existia (Impressão 3D, departamento fechado ao público) | n/a |
| MLB1712 Componentes para PC, MLB1700 Redes, MLB430598 Armazenamento | vários | já existiam | tipos atuais |
| MLB1055 Celulares, MLB91757 Tablets, MLB417704 Smartwatches | vários | já existiam | tipos atuais |
| MLB264065/MLB430403 Drones | MLB-DRONES | já existia (Eletrônicos, `drone`) | n/a |
| NAS e servidores | sem domínio no catálogo | NÃO semeável (decisão 6.4) | `nas-servidor` já classifica se aparecer |

Tipos novos em Tecnologia (`src/lib/catalog/tipos-produto.ts`, derivados do título, ficam antes dos tipos gerais para vencer empates): `instrumentos-opticos`, `medicao-eletrica`, `medicao-precisao`, `prototipagem`, `estacao-solda`, `fabricacao-digital`, `nas-servidor`. Testes de fronteira: "Scanner de Mesa" continua Scanner; "Fonte ATX 750W" continua Placa-mãe, fonte e gabinete; "Smartphone ... nas cores" continua Celular.

Shopee e Amazon: o mapa acima é por produto, não por categoria da loja. A Shopee e a Amazon encaixam suas ofertas em masters que já existem (GTIN/MPN/marca+modelo); quando o ML cria o master de um microscópio, a oferta de Shopee/Amazon do mesmo item se liga pelas rotinas atuais.

## 4. O que foi implementado

- `src/lib/catalog/vertical/config-ciencia.ts` (novo): 16 segmentos de semeadura em Tecnologia (ranks 200 a 215), marca real obrigatória, identidade forte (GTIN ou marca+modelo), 12 deles com `searchDomain` medido ao vivo; `scanner-3d` e `fonte-bancada` ficam com domínio não confirmado (o catálogo ML não os tem).
- `src/lib/catalog/vertical/scope-ciencia.ts` (novo): léxico aparelho x acessório e nicho por segmento (ex.: balança só de precisão, nunca cozinha ou corporal; termômetro infravermelho só industrial, nunca de testa; CNC nunca roteador de rede; laser nunca estético ou nível).
- Fiação em `config.ts` (SEGMENTS.push) e `scope.ts` (LEX/NICHO).
- `tipos-produto.ts`: 7 tipos novos em Tecnologia; `departamentos.ts`: descrição do departamento; `cobertura-tipos.ts`: 18 linhas novas do mapa tipo x loja (as ausências com causa registrada).
- Testes: `test-tipos-produto.ts` (+18 casos), `test-cobertura-tipos.ts` (ajuste dos dois testes que supunham só os tipos de 2026-11-12).
- Nenhuma barreira nova: o item miúdo continua sendo barrado pelo porteiro existente (`item-miudo.ts`: no dry-run barrou, por exemplo, tapetes de corte, pontas de solda e brocas).

## 5. Contagens antes / depois

| Medida (SELECT) | Antes | Depois |
|---|---|---|
| Masters de ciência/tecnologia industrial (microscópio, telescópio, binóculo, multímetro, osciloscópio, paquímetro...) em qualquer departamento | 0 | 295 criados (293 sugeridos `approved` pelo porteiro do departamento + 2 em revisão por identidade) |
| Masters de Tecnologia aprovados | 633 | 926 |
| Masters de Tecnologia aprovados com oferta ativa (visíveis em `/mercado/tecnologia`) | 565 | 857 (o restante da diferença vem de outras rotinas em curso) |
| Tipo Microscópios, telescópios e binóculos | 0 | 101 |
| Tipo Multímetros, osciloscópios e fontes de bancada | 0 | 110 |
| Tipo Paquímetros, balanças de precisão e medidores | 0 | 82 |
| Masters de Tecnologia em `review` | 0 | 2 (identidade fraca; ficam para o dono/guardião) |

Como se chegou lá: dry-run (443 chamadas ao ML, nada gravado), depois `semear-vertical --apply` (1.200 chamadas, teto da execução; só os 6 primeiros segmentos da lista caíram dentro do teto: microscópio, telescópio, binóculo, multímetro, osciloscópio, paquímetro; 295 masters e 295 ofertas, todas do Mercado Livre). Backup lógico `backup/dados/semear-vertical-pre-2026-11-15T07-08-41-402Z.ndjson`; log de reversão `backup/logs/semear-vertical-2026-11-15T07-08-41-402Z.json` (`--rollback <log> --apply`). Os masters nascem em `review` (ADR 0008); a liberação usou a regra R2-11 do dono (só usado/retrô barra) por `scripts/aplicar-r2-liberacoes-2026-11-14.ts --fase revisao --vertical tecnologia --so-sugerido-aprovado` (filtros novos neste script, sem barreira nova): 293 liberados, 0 pulados; backup `docs/backups/r2-revisao-2026-11-15T07-57-53-739Z.ndjson` e log `docs/backups/r2-revisao-log-2026-11-15T07-57-53-739Z.json` (reverter com `--rollback <log> --apply`). Ofertas só do Mercado Livre por enquanto (Amazon e Shopee ligam depois, ver seção 6.6).

Segmentos ainda NÃO semeados com `--apply` (ficaram fora do teto de 1.200 chamadas; entram pelo cron `semear-vertical` ou por nova rodada): termômetro infravermelho (dry-run: 6 a criar), balança de precisão (5), Arduino/Raspberry/ESP32 (13), estação de solda (12), CNC (13), gravadora a laser (6), plotter de recorte (10), medidor a laser, scanner 3D e fonte de bancada (dry-run: 0). No dry-run, o item miúdo barrou: 22 itens no plotter (tapetes de corte, lâminas), 7 no CNC, 5 em solda, 5 em placas, 3 em fonte.

## 6. O que ficou de fora e por quê; decisões que dependem do dono

1. **Ferramentas elétricas e equipamentos industriais** (parafusadeira, furadeira, esmerilhadeira, serra, máquina de solda MIG/TIG, compressor, retífica): categoria ML MLB2526 (665 mil anúncios) e MLB454785. Não são "Tecnologia"; o dono pediu "equipamentos industriais compactos", mas tratar isso exige um **departamento novo (por exemplo "Ferramentas")**, que o registro de departamentos só abre com aprovação do dono (ata 2026-11-10, emenda; flag `dept_<slug>` e `MERCADO_UI`). Não implementado. **Decisão 1: abrir o departamento Ferramentas (sim/não e recorte: só marcas e potências relevantes?).**
2. **Sensores, módulos, kits de eletrônica, protoboards, jumpers, pontas de solda, brocas, fresas**: itens miúdos de baixo valor. Barrados pela regra do dono de 2026-11-13; não tentei contornar. **Decisão 2 (opcional): existe um piso de valor (ex.: kit de robótica acima de R$ 150 de marca) que o dono aceitaria como exceção ao item miúdo? Sem aval, continua fora.**
3. **Instrumentos baratos** (pH, higrômetro, anemômetro, luxímetro, termômetro ambiente, trena comum): MLB455201 Medidores Ambientais tem 100 mil anúncios, quase todos de baixo valor; ficam fora pela mesma regra de item miúdo e por não terem catálogo de marca forte. **Decisão 3: incluir a linha profissional (Fluke, Minipa, Testo, Extech) por consulta de marca?** (a consulta de multímetro e termômetro já faz isso.)
4. **NAS, servidores, fonte de bancada, scanner 3D**: o catálogo do ML não tem domínio para eles (ver 1.1). Só existe anúncio livre, que a regra de identidade forte (GTIN/MPN) não aceita. Para trazê-los seria preciso criar uma ENTRADA nova (aceitar anúncio livre com marca+modelo no título), o que é **barreira/entrada nova e depende do aval do dono. Decisão 4.** Alternativa sem barreira nova: puxá-los pela Amazon, quando a PA-API/Creators for liberada (ASIN tem GTIN e `browseNodeInfo`).
5. **Equipamento médico e de laboratório** (MLB454798: autoclave, centrífuga, vidraria, Becker): regulado (ANVISA), vidraria é item miúdo e o público do site é gamer/geek. Fora. **Decisão 5: confirmar que equipamento médico fica fora.**
6. **Shopee e Amazon**: sem semeadura própria (seção 1.2 e 1.3). Hoje 0 ofertas de Shopee em Tecnologia; a Shopee precisa de busca por palavra-chave nos coletores de afiliado para os termos novos (próxima rodada de #60: ligar `shopee-cobertura.ts` aos tipos novos, sem barreira nova) e a Amazon depende da liberação da API de associado.
7. **Drones, câmeras, TV e áudio** já estão em Eletrônicos (não duplicados em Tecnologia).
8. **Aprovação dos masters novos**: a semeadura grava `review` (rede de segurança do ADR 0008). Para aparecerem em `/mercado/tecnologia` eles passam pela aprovação (contínua pelo fluxo existente, ou `scripts/aprovacao-liberar-tudo.ts --apply`, que por regra só roda com ordem do dono). Os 293 que o porteiro sugeriu `approved` já foram liberados pela regra R2-11 do dono (ver seção 5), com rollback. **Decisão 8: confirmar que a regra R2-11 vale para os próximos lotes do cron de semeadura (liberação automática do sugerido `approved`).**

## 7. Como repetir e reverter

- Medir: `npx tsx --env-file=.env.local scripts/medir-ciencia-tecnologia-2026-11-15.ts`.
- Dry-run de um segmento: `npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --segmento microscopio --pages 1 --terms 2`.
- Gravar: o mesmo com `--apply --termos-aprovados`; grava backup NDJSON em `backup/dados/` e log de reversão em `backup/logs/semear-vertical-<ts>.json`; reverter com `--rollback <log.json> --apply`.
- O cron `/api/cron/semear-vertical` semeia as lojas listadas em `SEMEADURA_LOJAS` (variável sensível da Vercel, não lida aqui): se `tecnologia` estiver nela, os 16 segmentos novos entram sozinhos na fila (nunca semeados vão primeiro).
