# Cobertura por tipo nas lojas Plus (2026-11-12)

Pedido do dono: "Para cada área, existe alguma restrição de itens? Quero TODOS os itens relacionados a cada área; não estou vendo smart TV em nenhuma área. Quero o máximo de produtos por TIPO em cada loja. Não tem limites."

Escopo desta entrega: código, configuração e simulação. Nada foi escrito em produção e nenhuma chamada foi feita à API do Mercado Livre (a cota é desconhecida). Coleta somente por API oficial; nenhum dado sintético: os números abaixo vêm do histórico real das semeaduras (`backup/dados/semear-vertical-*/plano.json`) e do inventário (`docs/inventario-catalogo/*.csv`); o que é premissa está marcado.

## 1. Onde estavam as restrições (causas medidas)

Smart TV existe como tipo desde 08/11 (`smart-tv`, 190 consultas, domínio `MLB-TELEVISIONS`). O problema não era a falta do tipo; era a execução:

| # | Restrição | Onde | Efeito medido |
|---|---|---|---|
| 1 | Semeadura 100% manual (`scripts/semear-vertical.ts`), sem cron | processo | cada tipo só entra quando alguém roda; 9 tipos tiveram 0 a 1 chamada no histórico (memória RAM, processador, monitor, cadeira gamer, notebook, caixa de som, robô aspirador, cafeteira, máquina de lavar) e os segmentos de 11/11 (tênis, fogão, câmeras...) nunca rodaram |
| 2 | `--max-calls 40` por execução, e o 1º tipo da execução consumia tudo | script | os tipos seguintes ficavam em `teto_de_chamadas` com 0 chamadas |
| 3 | `--max-create 20` por tipo | script e `planSeed` | parava em 20 masters mesmo com candidato válido |
| 4 | `--pages 2` e `--limit 20` | script | 40 resultados por termo; a paginação profunda nunca acontecia |
| 5 | Cache de 404 de 3 dias | `seed-budget.ts` | smart-tv: 297 de 346 chamadas foram 404 "sem vendedor" (86%); cada ciclo repagava os mesmos |
| 6 | Smart TV parou por `teto_de_chamadas` e por 429 | histórico | 16 masters planejados em 346 chamadas; 17 aprovados hoje |
| 7 | `searchDomain` só onde o domínio foi medido | `config.ts` | tipos sem domínio medido buscam sem filtro (ruído descartado de graça pela identidade) |
| 8 | Escopo de título/nicho e porteiro por departamento | `scope.ts`, `gate.ts` | por desenho (acessório, pacote, usado, brinquedo); são as regras inegociáveis e ficam |
| 9 | A página do departamento ordena por menor preço | frontend | as TVs ficam enterradas (cabo e carregador vêm primeiro). **Dependência do engenheiro-frontend**: ordem padrão por tipo/relevância e abas por tipo |
| 10 | Freio de cota da reconfirmação (`PLUS_ML_HOURLY_CALL_CAP` 8000/h, `PLUS_ML_DAILY_CALL_CAP` 150000/dia) | `collect-vertical.ts` | valores ASSUMIDOS (a cota oficial do ML não está no repositório). Passa a ser o limite real quando houver milhares de catálogos |

Não existe teto por tipo no que a API devolve. Os limites que ficam protegem as regras inegociáveis (só novo e em linha; sem usado, open box ou recondicionado; sem acessório fora de escopo; sem duplicata título+plataforma; só API oficial) e o freio de cota/429 (espera e retoma; `DAILY_CALL_CAP` de 12.000/dia da semeadura é só trava contra laço descontrolado).

## 2. Tabela tipo x loja (antes e depois)

Antes = o que está na vitrine/banco hoje (inventário de 11/11): coberto = 30 ou mais aprovados; parcial = 1 a 29; "configurado, sem produto" = o segmento existia mas nenhum produto aprovado. Depois = configuração + fila (calculado por `situacaoDepois` em `cobertura-tipos.ts`): "parcial" é o tipo novo cujo `domain_id` ainda não foi conferido ao vivo; vira "coberto" quando o 1º dry-run confirmar. Causas das ausências: sem semente (resolvida), escopo, porteiro, decisão do dono, sem catálogo no ML.

Resumo (143 linhas de tipo esperado; 130 segmentos de semeadura): ausente para parcial 53; configurado sem produto para coberto 59; parcial para coberto 12; coberto mantido 9; ausente mantido 10 (todos com causa: escopo de propósito, porteiro de outro agente, decisão do dono, sem catálogo no ML).

### Eletronicos

| Tipo | Segmento | Aprovados hoje | Antes (vitrine) | Depois (config + fila) | Causa / nota |
|---|---|---:|---|---|---|
| Smart TV | `smart-tv` | 17 | parcial | coberto |  |
| Soundbar | `soundbar` | 31 | coberto | coberto |  |
| Home theater | `soundbar` | 31 | coberto | coberto | mesmo domínio MLB-HOME_THEATERS do soundbar |
| Receiver e amplificador de som | `receiver-amplificador` | 0 | ausente | parcial |  |
| Caixa de som | `caixa-de-som` | 0 | configurado, sem produto | coberto |  |
| Fone de ouvido | `fone-de-ouvido` | 16 | parcial | coberto |  |
| Microfone | `microfone` | 0 | ausente | parcial |  |
| Toca-discos | `toca-discos` | 0 | ausente | parcial |  |
| Projetor | `projetor` | 0 | configurado, sem produto | coberto |  |
| Câmera digital | `camera-digital` | 0 | configurado, sem produto | coberto |  |
| Câmera de ação | `camera-de-acao` | 0 | configurado, sem produto | coberto |  |
| Câmera de segurança | `camera-de-seguranca` | 0 | configurado, sem produto | coberto |  |
| Drone | `drone` | 0 | ausente | parcial |  |
| TV Box e streaming | `tv-box` | 0 | ausente | parcial |  |
| Celular e smartphone | `celular` | 0 | ausente | parcial |  |
| Tablet | `tablet` | 0 | configurado, sem produto | coberto |  |
| E-reader | `e-reader` | 0 | configurado, sem produto | coberto |  |
| Smartwatch e smartband | `smartwatch` | 0 | configurado, sem produto | coberto |  |
| Casa inteligente | `casa-inteligente` | 0 | ausente | parcial |  |
| Carregador | `carregador` | 0 | configurado, sem produto | coberto |  |
| Power bank | `power-bank` | 0 | configurado, sem produto | coberto |  |
| Cabo e adaptador | `cabo-e-adaptador` | 0 | configurado, sem produto | coberto |  |
| Hub USB e dock | `hub-usb` | 0 | configurado, sem produto | coberto |  |
| Suporte, rack, antena e controle remoto de TV | - | - | ausente | ausente | escopo: acessório: barrado de propósito (scope.ts e OUT_OF_SCOPE do departamento) |

### Casa

| Tipo | Segmento | Aprovados hoje | Antes (vitrine) | Depois (config + fila) | Causa / nota |
|---|---|---:|---|---|---|
| Geladeira | `geladeira` | 10 | parcial | coberto |  |
| Freezer e frigobar | `freezer` | 0 | configurado, sem produto | coberto |  |
| Fogão | `fogao` | 0 | configurado, sem produto | coberto |  |
| Cooktop | `cooktop` | 0 | configurado, sem produto | coberto |  |
| Forno elétrico | `forno-eletrico` | 0 | configurado, sem produto | coberto |  |
| Micro-ondas | `micro-ondas` | 0 | configurado, sem produto | coberto |  |
| Air fryer | `air-fryer` | 110 | coberto | coberto |  |
| Lava-louças | `lava-loucas` | 0 | configurado, sem produto | coberto |  |
| Máquina de lavar | `maquina-de-lavar` | 0 | configurado, sem produto | coberto |  |
| Secadora de roupas | `secadora-de-roupas` | 0 | configurado, sem produto | coberto |  |
| Aspirador de pó | `aspirador-de-po` | 0 | configurado, sem produto | coberto |  |
| Robô aspirador | `robo-aspirador` | 0 | configurado, sem produto | coberto |  |
| Ar-condicionado | `ar-condicionado` | 0 | configurado, sem produto | coberto |  |
| Ventilador e circulador | `ventilador` | 0 | configurado, sem produto | coberto |  |
| Aquecedor | `aquecedor` | 0 | ausente | parcial |  |
| Purificador de ar | `purificador-de-ar` | 0 | configurado, sem produto | coberto |  |
| Umidificador e desumidificador | `umidificador-desumidificador` | 0 | ausente | parcial |  |
| Liquidificador | `liquidificador` | 0 | configurado, sem produto | coberto |  |
| Batedeira | `batedeira` | 0 | configurado, sem produto | coberto |  |
| Processador de alimentos e mixer | `processador-de-alimentos` | 0 | ausente | parcial |  |
| Espremedor | `espremedor` | 0 | ausente | parcial |  |
| Cafeteira | `cafeteira` | 0 | configurado, sem produto | coberto |  |
| Chaleira elétrica | `chaleira-eletrica` | 0 | ausente | parcial |  |
| Panela elétrica e arrozeira | `panela-eletrica` | 0 | configurado, sem produto | coberto |  |
| Sanduicheira, grill e waffle | `sanduicheira-grill` | 0 | ausente | parcial |  |
| Torradeira | `torradeira` | 0 | ausente | parcial |  |
| Ferro de passar | `ferro-de-passar` | 0 | configurado, sem produto | coberto |  |
| Coifa e depurador | `coifa` | 0 | ausente | parcial |  |
| Bebedouro e purificador de água | `bebedouro-purificador-agua` | 0 | ausente | parcial |  |
| Lavadora de alta pressão | `lavadora-alta-pressao` | 0 | ausente | parcial |  |
| Máquina de costura | `maquina-de-costura` | 0 | ausente | parcial |  |
| Chuveiro e aquecedor de água | - | - | ausente | ausente | decisao_dono: hidráulica/elétrica de obra: fora do recorte atual; incluir é decisão do dono |

### Tecnologia

| Tipo | Segmento | Aprovados hoje | Antes (vitrine) | Depois (config + fila) | Causa / nota |
|---|---|---:|---|---|---|
| Notebook | `notebook` | 0 | configurado, sem produto | coberto |  |
| Computador desktop, mini PC e all-in-one | `computador-desktop` | 0 | ausente | parcial |  |
| Monitor | `monitor` | 0 | configurado, sem produto | coberto |  |
| Placa de vídeo | `placa-de-video` | 70 | coberto | coberto |  |
| Processador | `processador` | 0 | configurado, sem produto | coberto |  |
| Placa-mãe | `placa-mae` | 0 | ausente | parcial |  |
| Memória RAM | `memoria-ram` | 0 | configurado, sem produto | coberto |  |
| SSD e HD interno | `ssd` | 10 | parcial | coberto |  |
| HD e SSD externo | `hd-ssd-externo` | 0 | ausente | parcial |  |
| Pendrive | `pendrive` | 0 | ausente | parcial |  |
| Cartão de memória | `cartao-de-memoria` | 0 | ausente | parcial |  |
| Gabinete de PC | `gabinete-pc` | 0 | ausente | parcial |  |
| Fonte de PC | `fonte-pc` | 0 | ausente | parcial |  |
| Cooler e water cooler | `cooler-pc` | 0 | ausente | parcial |  |
| Teclado | `teclado` | 8 | parcial | coberto |  |
| Mouse | `mouse` | 7 | parcial | coberto |  |
| Mousepad | `mousepad` | 0 | ausente | parcial |  |
| Headset gamer | `headset-gamer` | 5 | parcial | coberto |  |
| Webcam | `webcam` | 0 | ausente | parcial |  |
| Placa de captura | `placa-de-captura` | 0 | ausente | parcial |  |
| Mesa digitalizadora | `mesa-digitalizadora` | 0 | ausente | parcial |  |
| Cadeira gamer | `cadeira-gamer` | 0 | configurado, sem produto | coberto |  |
| Roteador | `roteador` | 0 | ausente | parcial |  |
| Repetidor, mesh e access point | `repetidor-mesh` | 0 | ausente | parcial |  |
| Switch de rede | `switch-rede` | 0 | ausente | parcial |  |
| Adaptador wifi | `adaptador-wifi` | 0 | ausente | parcial |  |
| Nobreak | `nobreak` | 0 | ausente | parcial |  |
| Impressora (jato de tinta, laser, térmica) | `impressora` | 1 | parcial | coberto |  |
| Scanner de documentos | `scanner-de-documentos` | 0 | ausente | parcial |  |
| Mesa e rack gamer (móveis) | - | - | ausente | ausente | decisao_dono: móvel, não eletrônico: fora do recorte atual |

### Esporte

| Tipo | Segmento | Aprovados hoje | Antes (vitrine) | Depois (config + fila) | Causa / nota |
|---|---|---:|---|---|---|
| Tênis (corrida, caminhada, treino, casual) | `tenis` | 0 | configurado, sem produto | coberto |  |
| Chuteira | `chuteira` | 0 | configurado, sem produto | coberto |  |
| Camisa de time e esportiva | `camisa-de-time` | 0 | configurado, sem produto | coberto |  |
| Roupa de compressão | `roupa-de-compressao` | 0 | configurado, sem produto | coberto |  |
| Roupa de ciclismo | `roupa-de-ciclismo` | 0 | configurado, sem produto | coberto |  |
| Meia esportiva | `meia-esportiva` | 0 | configurado, sem produto | coberto |  |
| Boné | `bone` | 0 | configurado, sem produto | coberto |  |
| Mochila esportiva | `mochila-esportiva` | 0 | configurado, sem produto | coberto |  |
| Bolsa de treino | `bolsa-de-treino` | 0 | configurado, sem produto | coberto |  |
| Bola de futebol | `bola` | 58 | coberto | coberto |  |
| Bola de basquete | `bola-de-basquete` | 0 | configurado, sem produto | coberto |  |
| Bola de vôlei | `bola-de-volei` | 0 | configurado, sem produto | coberto |  |
| Raquete de tênis e squash | `raquete-de-tenis` | 0 | configurado, sem produto | coberto |  |
| Raquete de beach tennis | `raquete-beach-tennis` | 0 | configurado, sem produto | coberto |  |
| Tênis de mesa | `tenis-de-mesa` | 0 | ausente | parcial |  |
| Luva de goleiro | `luva-de-goleiro` | 0 | configurado, sem produto | coberto |  |
| Caneleira | `caneleira` | 0 | configurado, sem produto | coberto |  |
| Luva de boxe e MMA | `luva-de-boxe` | 0 | ausente | parcial |  |
| Saco de pancada | `saco-de-pancada` | 0 | ausente | parcial |  |
| Óculos de natação | `oculos-de-natacao` | 0 | ausente | parcial |  |
| Bicicleta | `bicicleta` | 0 | ausente | parcial |  |
| Capacete de ciclismo | `capacete-de-ciclismo` | 0 | ausente | parcial |  |
| Skate e longboard | `skate` | 0 | ausente | parcial |  |
| Patins | `patins` | 0 | ausente | parcial |  |
| Patinete e scooter | `patinete` | 0 | ausente | parcial |  |
| Esteira ergométrica | `esteira` | 24 | parcial | coberto |  |
| Bicicleta ergométrica | `bicicleta-ergometrica` | 1 | parcial | coberto |  |
| Elíptico | `eliptico` | 0 | configurado, sem produto | coberto |  |
| Estação de musculação | `estacao-de-musculacao` | 0 | ausente | parcial |  |
| Banco de musculação e supino | `banco-de-musculacao` | 0 | ausente | parcial |  |
| Barra e anilha | `barra-e-anilha` | 0 | ausente | parcial |  |
| Halter | `halter` | 0 | configurado, sem produto | coberto |  |
| Kettlebell | `kettlebell` | 0 | configurado, sem produto | coberto |  |
| Tornozeleira de peso | `tornozeleira-de-peso` | 0 | configurado, sem produto | coberto |  |
| Luva de academia | `luva-de-academia` | 0 | configurado, sem produto | coberto |  |
| Faixa elástica | `faixa-elastica` | 0 | configurado, sem produto | coberto |  |
| Tapete de yoga e exercício | `tapete-de-yoga` | 0 | configurado, sem produto | coberto |  |
| Bola de pilates | `bola-de-pilates` | 0 | ausente | parcial |  |
| Rolo de massagem | `foam-roller` | 0 | ausente | parcial |  |
| Corda de pular | `corda-de-pular` | 0 | configurado, sem produto | coberto |  |
| Garrafa e squeeze esportivo | `garrafa-esportiva` | 0 | configurado, sem produto | coberto |  |
| Suplementos (whey, creatina...) | - | - | ausente | ausente | decisao_dono: alimento regulado, com validade e rótulo: a regra "só novo e em linha" e a identidade por lote não foram definidas para ele |
| Camping, pesca e trilha | - | - | ausente | ausente | decisao_dono: fora do recorte "esporte" atual; incluir é decisão do dono |
| Roupa fitness do dia a dia (legging, short, camiseta dry-fit) | - | - | ausente | ausente | sem_catalogo_ml: medido em 11/11: a busca devolve uniformes, lembrancinhas e modeladores, não catálogo de produto |

### Livros

| Tipo | Segmento | Aprovados hoje | Antes (vitrine) | Depois (config + fila) | Causa / nota |
|---|---|---:|---|---|---|
| Livros por gênero, editora e autor (ficção, não ficção, infantil, didático, religião, saúde, artes, esportes) | `livros` | 102 | coberto | coberto | ~650 termos em livros (gêneros, editoras, autores); a execução é que ficou curta (245 produtos) |
| Mangá, HQ e graphic novel | `livros` | 102 | coberto | coberto | termos próprios dentro de livros (domínio MLB-BOOKS) |
| Livros de RPG, programação, arte de jogos | `livros` | 102 | coberto | coberto |  |
| Papelaria, caderno, agenda e planner | - | - | ausente | ausente | escopo: barrado de propósito (OUT_OF_SCOPE de livros) |

### Impressao 3D

| Tipo | Segmento | Aprovados hoje | Antes (vitrine) | Depois (config + fila) | Causa / nota |
|---|---|---:|---|---|---|
| Impressora 3D (FDM e resina) | `impressora-3d` | 15 | parcial | coberto |  |
| Filamento (PLA, PETG, ABS, TPU, ASA, nylon) | `filamento-3d` | 41 | coberto | coberto |  |
| Resina | `resina-3d` | 2 | parcial | coberto |  |
| Peças (bico, hotend, mesa PEI, extrusor, correia) | `peca-impressora-3d` | 0 | ausente | parcial | entra em revisão: a vitrine exige compatibilidade escrita no título (decisão do conselho) |
| Secador e dry box de filamento | `secador-filamento` | 0 | ausente | parcial |  |
| Estação de lavar e curar resina | `lavadora-curadora-resina` | 0 | ausente | parcial |  |
| Scanner 3D | - | - | ausente | ausente | porteiro: OUT_OF_SCOPE.impressao3d em gate.ts barra "scanner" sempre; liberar exige mudar o porteiro (outro agente) |
| Caneta 3D | - | - | ausente | ausente | porteiro: OUT_OF_SCOPE.impressao3d em gate.ts barra "caneta 3d" sempre; liberar exige mudar o porteiro (outro agente) |
| Ferramentas de pós-processamento (espátula, alicate, lixa) | - | - | ausente | ausente | decisao_dono: ticket baixo e sem identidade forte; incluir é decisão do dono |

## 3. O que mudou no código

- `src/lib/catalog/vertical/config-tipos.ts` (novo): 53 tipos novos nas lojas Plus, sem teto de consultas por tipo (marcas x modelos), `domainUnconfirmed`, orçamento próprio de 60 chamadas na 1ª rodada exploratória; mais consultas para notebook, placa de vídeo, monitor, SSD, periféricos, impressora e Impressão 3D.
- `src/lib/catalog/vertical/scope-tipos.ts` (novo): léxico aparelho x acessório e recorte de nicho de cada tipo novo (capinha não é celular, filtro não é coifa, Nintendo Switch não é switch de rede, bicicleta ergométrica não é bicicleta).
- `src/lib/catalog/vertical/seed-schedule.ts` (novo): fila por tipo. Orçamento próprio por tipo e por execução (`callsPerRun`, padrão 150), prioridade por antiguidade (nunca semeado primeiro), profundidade que cresce a cada ciclo (até 20 páginas de 50, em largura), termos esgotados saem das passadas seguintes, cursor por tipo.
- `seed-plan.ts`: `maxCreate` sem teto por padrão; `segmentCalls` (orçamento do tipo, para com `orcamento_do_tipo`); `terms` explícito; `termsTouched`.
- `seed-budget.ts`: cache de 404 de 3 para 7 dias (a fila volta ao tipo em ciclos de dias).
- `scripts/semear-vertical.ts`: `--fila` (todos os tipos; cursor em `backup/dados/semear-cursor.json`, que só avança com `--apply` ou `--avancar-cursor`) e `--por-tipo`. Padrões novos: `--limit 50`, `--pages 20`, `--max-create` sem teto, `--max-calls 600`.
- `src/lib/catalog/vertical/cobertura-tipos.ts` (novo): este mapa tipo x loja como dado, testado.
- Não alterados: `aprovacao-nicho.ts` e `gate.ts` (outro agente). Duas ausências dependem do gate: scanner 3D e caneta 3D (`OUT_OF_SCOPE.impressao3d` as manda sempre para revisão). Em Casa, "mangueira" e "acessório" no `OUT_OF_SCOPE` mandam parte das lavadoras de alta pressão para revisão.
- Produto em dúvida: o master nasce sempre com `catalogGate.verdict = 'review'` (invisível); identidade fraca vai para a lista de revisão do planejador (`reviews`), que a fila de classificação consome. Nada vai para a vitrine sem passar pelo porteiro e pela aprovação.

## 4. Como rodar (dry-run por padrão; só lê a API oficial e o banco)

```
# Simulação (0 chamadas): tabela, chamadas por tipo, impacto na cota
npm run simular:semeadura-plus -- --paginas 3 --unicos 0.5 --pool 139

# 1ª rodada exploratória dos tipos novos (confere os domain_id; 60 chamadas por tipo)
npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --fila --vertical eletroeletronicos --max-calls 1200

# Fila completa, dry-run, com a cota do dia
npx tsx --conditions=react-server --env-file=.env.local scripts/semear-vertical.ts --fila --por-tipo 150
```

Depois do 1º dry-run de cada tipo novo: ler os `dominio_fora_do_segmento` do `plano.json`, corrigir a regex em `config-tipos.ts`, declarar `searchDomain` e tirar `domainUnconfirmed` (o tipo passa a "coberto"). `--apply` exige `--termos-aprovados` (a curadoria dos termos continua com o dono/guardião) e grava backup lógico antes do 1º INSERT, como antes.

## 5. Simulação (sem chamar a API)

Entradas reais: 28 tipos com histórico, 6.047 chamadas, 18.164 resultados; custo medido de **5,4 chamadas por master planejado**; 6,2% dos resultados viram master planejado; saturação por tipo: mediana de **139** catálogos com vendedor nos 6 tipos explorados a fundo (faixa 12 a 410). Premissas (não medidas): 3 páginas por termo e 50% dos resultados são catálogos novos.

| Cenário | Chamadas de semeadura (130 tipos) | Dias no teto de 12.000/dia | Masters novos (est.) |
|---|---:|---:|---:|
| Base (saturação 139 por tipo) | ~140.000 | ~12 | ~25.000 (livros é limite superior: ~6.900) |
| Mercado largo (saturação 556 por tipo) | ~280.000 | ~23 | ~51.000 |

Por loja no cenário base (chamadas): Livros 14.390, Tecnologia 29.227, Eletrônicos 23.666, Casa 29.567, Esporte 37.261, Impressão 3D 6.298. A 1ª varredura (uma execução por tipo: 77 tipos a 150 chamadas e 53 a 60) custa ~14.700 chamadas, ou seja, 2 dias no teto atual de 12.000.

**O que pressiona a cota não é a semeadura, é a reconfirmação.** Cada catálogo ativo é reconferido a cada 15 a 60 min (fator medido de 1,1 chamada por catálogo). Chamadas por hora:

| Catálogos ativos | 15 min | 30 min | 60 min | 120 min |
|---:|---:|---:|---:|---:|
| 1.274 (hoje) | 5.606 | 2.803 | 1.401 | 701 |
| 5.000 | 22.000 | 11.000 | 5.500 | 2.750 |
| 10.000 | 44.000 | 22.000 | 11.000 | 5.500 |
| 20.000 | 88.000 | 44.000 | 22.000 | 11.000 |
| 40.000 | 176.000 | 88.000 | 44.000 | 22.000 |

Hoje (5.606/h a 15 min) já fica abaixo do freio assumido de 8.000/h. Com ~10 mil catálogos a 30 min seriam 22.000/h (2,8x o freio assumido). No cenário base (~26 mil catálogos) a 30 min seriam ~57.000/h, 7x o freio horário assumido. Sem cadência por camada, "sem limites" em número de produtos esbarra na cota.

## 6. Decisão que o dono precisa tomar (cota)

1. **Qual é a cota real do ML para o app?** Não está documentada. Proposta: piloto de 1 loja (Eletrônicos) com a fila e a reconfirmação ligadas por 24 h, olhando `collector_runs` (`stopped_because = http_429`, `meta.quotaLimitedBy`); o 429 é o limite real e o código já para e retoma. Autorizar a 1ª varredura exploratória: ~14.700 chamadas em 2 dias.
2. **Cadência por camada** (recomendação, não implementada): reconfirmar a cada 15 min só o que está na vitrine (aprovado, com oferta clicável) e a cada 60 a 120 min o que está em revisão ou sem link oficial. Com ~26 mil catálogos e, por exemplo, ~20% em vitrine, a carga cairia de ~114 mil/h (tudo a 15 min) para ~30 mil/h (20% a 15 min, 80% a 60 min). Exige mexer em `dueWhere` de `collect-vertical.ts`.
3. **Escopo** (ausências sem dono técnico): suplementos, camping/pesca/trilha, chuveiro e aquecedor de água, mesa/rack gamer e ferramentas de pós-processamento 3D (decisão do dono); scanner 3D e caneta 3D (exigem mudança no porteiro, agente que relaxa o gate).
4. **Peças de impressora 3D**: a decisão do conselho exige compatibilidade escrita; a aprovação de impressão 3D precisa exigir o modelo da impressora no título antes de liberar para a vitrine.

## 7. Riscos e pendências

- Os `domain_id` dos 53 tipos novos são regex de varredura, não medidos (hipótese). Domínio errado custa 1 chamada por termo e nunca cria master.
- A profundidade máxima de 20 páginas (offset 1000) é premissa: o corte real do offset da busca de catálogo não está documentado.
- A saturação por tipo (139) vem de tipos de nicho; tipos largos (celular, bicicleta, tênis, notebook) podem ter bem mais.
- Livros é aberto (autores, editoras, gêneros): o número é limite superior.
- Regenerar `/admin/catalogo` e `docs/inventario-catalogo/` quando os primeiros tipos novos entrarem.

## 8. Testes

`npm run test:cobertura-tipos` (789 verificações: mapa completo, tipos novos, léxico, fila, cursor, sem teto de masters, orçamento do tipo, fórmulas), `test:vertical-identity` (244; a asserção de contagem de segmentos foi ampliada), `scripts/test-semeadura.ts` (737), `test:plus-reconfirmacao`, `scripts/test-collector-multicatalog.ts` (93) e `tsc --noEmit`.
