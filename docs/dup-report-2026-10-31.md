# Relatório de duplicatas de master_products (2026-10-31)

Gerado por `scripts/dry-run-dup-report.ts`. Somente SELECT (transação READ ONLY); nada foi escrito no banco. Regra aplicada: `normalizeTitle`/`analyzeDuplicates` em `src/lib/affiliate/dedup.ts`.

## Resumo

| Medida | Valor |
|---|---|
| master_products no banco | 5391 |
| já arquivados (mergedInto) | 116 |
| Grupos de duplicata para fusão automática (só jogos, plataforma resolvida, mesma edição) | 0 |
| Masters a fundir (excedentes) | 0 |
| Grupos com oferta ativa em mais de um master (média hoje dividida) | 0 |
| Ofertas que seriam reapontadas (total / ativas) | 0 / 0 |
| Snapshots que migrariam junto (pertencem às ofertas movidas; as linhas de snapshot não são alteradas) | 0 |
| Quase-duplicatas e casos só para revisão manual (clusters / masters) | 105 / 272 |
| Jogos com título multi-geração (PS4/PS5, Xbox One/Series), fora da fusão automática | 276 |
| Grupos com edições distintas mantidas separadas de propósito (Deluxe, GOTY, Gold, Collector, etc.) | 50 |
| master_products com plataforma 'unknown' (total / jogos) | 952 / 415 |
| ... destes, plataforma derivável do título (total / jogos) | 57 / 18 |

### Linhas em tabelas com FK para master_products que acompanhariam a fusão

| Tabela.coluna | Linhas nos masters a fundir |
|---|---|
| affiliate_offers.master_product_id | 0 |
| affiliate_price_watches.master_product_id | 0 |
| products.master_product_id | 0 |

### Revisão manual por tipo

| Tipo | Clusters | Masters |
|---|---|---|
| near_duplicate | 58 | 138 |
| unknown_platform | 34 | 85 |
| platform_conflict | 1 | 20 |
| non_game_exact | 12 | 29 |

## Grupos para fusão automática

Canônico = mais ofertas ativas, depois mais ofertas, mais snapshots, mais antigo. Formato: `ativas/total ofertas, snapshots`.

## Casos para revisão manual (não serão fundidos automaticamente)

### R001 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2b93d982-c77f-4ff4-ae7d-ed9b5bc5cb46` [game/switch_1] "Super Mario Bros .U Deluxe - Nintendo Switch Envio Imediato" (1/1, 1)
- `b7376b02-b667-4a3c-8e41-2bcfa52e07ec` [game/switch_1] "New Super Mario Bros U Deluxe Nintendo Switch Mídia Fisico" (1/6, 6)

### R002 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `902b6c09-24d9-40d3-9f0e-cd38c6b8b225` [game/ps4] "Assassin's Creed Origins - Jogo Físico Ps4 - Jogo Sniper" (2/2, 2)
- `b2609552-7e2c-478f-90c9-b22ebcde023b` [game/ps4] "Assassin’s Creed Origins – PS4 (Original)" (0/1, 1)

### R003 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0860d4d4-6318-4027-9219-3c38c46a8ff4` [game/ps5] "Jogo eletrônico PS5 Lost Soul Aside" (3/3, 3)
- `2df539ed-ca0b-44c3-bb4b-9c521c6b52b8` [game/ps5] "Lost soul aside- Jogo de PS5 original mídia física" (0/1, 1)
- `ac9b31e7-b947-4a3e-b814-db1127e9aed1` [game/ps5] "Jogo Lost Soul Aside Standard Edition Playstation 5 Midia Fí" (0/1, 1)

### R004 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `43ca3e6c-62c3-46cc-b5f8-ad744af9fbc9` [game/ps5] "Jogo Assassin's Creed Valhalla Físico Ubisoft Ps5" (5/5, 5)
- `be43b35c-8398-484f-ae98-3de8f175b6cc` [game/ps5] "Assassin's Creed: Valhalla - PS5 - Original" (0/1, 1)

### R005 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `41cb1265-a6e0-4b11-9bbd-1329918c3c56` [game/ps5] "EA FC 25 - PS5 - Original" (0/3, 3)
- `01df50fa-17da-407f-9dda-eab44101f4ec` [game/ps5] "Jogo EA SPORTS FC 25 Standard Edition Playstation 5 Mídia Fí" (0/1, 1)

### R006 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `4d0738a7-a4f1-4784-88fb-cdd1043e394a` [game/switch_1] "Jogo para Nintendo switch Lego Movie 2 lacrado" (2/3, 3)
- `0e5fef37-1929-4d33-acc4-d0ae476023fb` [game/switch_1] "Lego Movie 2 Nintendo Switch Videogame de Física" (0/1, 60)

### R007 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `27703773-0d4f-4bb3-b82e-62fdfb2b1127` [game/ps5] "Dying Light 2 Stay Human PS5 Midia Fisica" (0/1, 1)
- `a216cf62-bc8d-4b7f-8f22-7a890b80638a` [game/ps5] "Jogo PS5 Dying Light 2 Stay Human Físico Ação RPG PlayStation 5" (0/1, 0)

### R008 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `087e39ad-16db-4bfe-a4e7-0de0d74cb380` [game/switch_1] "Castlevania Belmonts Curse Switch Midia Fisica" (0/1, 2)
- `e7705825-b5f8-4667-bf94-577e3d9dacb1` [game/switch_1] "Castlevania Belmonts Curse Midnight Edition Switch" (0/2, 0)

### R009 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `00f962b7-6de4-4629-a70b-8910e8e06ea0` [game/switch_2] "Câmera Hori Piranha Plant Para Nintendo Switch 2" (0/1, 1)
- `d48dd994-d9c9-4d2b-ad87-7ed756241c42` [game/switch_2] "Câmera Piranha Plant - Nintendo Switch 2" (3/6, 3806)

### R010 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `015dfbac-b2ab-4a52-bbec-7f930618b473` [game/ps5] "Final Fantasy Vll Rebirth - PS5 Midia Fisica" (0/1, 1)
- `39692dc3-f238-4584-ba4d-8a08134d1c04` [game/ps5] "Final Fantasy Vll Ps5 Original mídia física" (0/1, 1)

### R011 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0a6a2cf7-1bbe-443d-bd01-4de491543399` [game/ps4] "Gran Turismo Sport - PS4 Mídia física Português Br" (1/4, 4)
- `86e72df6-3873-4fd6-aacc-6c19caf5d048` [game/ps4] "Jogo Ps4 Gran Turismo Sport Hite" (2/3, 10)

### R012 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `50efa4d8-4a1f-4ba3-b0f3-b53032a1b5a3` [game/ps5] "Final Fantasy  VII PS5" (0/4, 4)
- `17be542b-d13c-4d98-a7d4-759eba5323e2` [game/ps5] "Final Fantasy VII Rebirth PS5 Standard" (12/35, 23166)
- `56011133-51ef-4c3f-96fc-69b372852fea` [game/ps5] "Final Fantasy VII Intergrade PS5 Midia Fisica" (0/2, 2)

### R013 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `03094b6d-31e8-41d3-9aeb-45b0e8dd4515` [game/ps5] "God Of War Ragnarok - Midia Física Ps5" (0/9, 35)
- `bf7dbfeb-48e0-42f8-8060-9f144edfde7b` [game/ps5] "Kratos God Of War Ragnarök Playstation Ps5 100%" (0/1, 3)
- `d5e75a7a-39a5-42c2-a102-54f6abfb38d5` [game/ps5] "Jogo PS5 Playstation God Of War Ragnarok Ss" (6/22, 2184)

### R014 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `30f74441-c302-404c-b00a-a5c0b0d964f2` [game/ps4] "Grand Theft Auto V – PS4 (Original)" (0/1, 1)
- `7cd3d1dd-9c92-4273-887a-1298784b95d1` [game/ps4] "Grand Theft Auto V - Ps4 - Com mapa" (0/1, 1)

### R015 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `dbc44fbc-efb5-45d5-8af2-9fb6c0db07c6` [game/ps5] "Horizon Forbidden West - PS5 Mídia Física Lacrado" (0/1, 1)
- `df5c0589-fb25-4f4d-9781-41d8ae0a526f` [game/ps5] "Horizon: Forbidden West (Áudio em Português) - Ps5" (0/1, 1)

### R016 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c43eea01-0bf9-4274-8925-49459b7651e2` [game/ps5] "Jogo Gran Turismo 7 - PS5 - Novo - Original" (58/64, 76)
- `34cf695e-a3bd-48e2-af4e-4c549168a40e` [game/ps5] "Gran Turismo 7 (Legendas em Português) - Ps5" (0/1, 1)

### R017 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `3143a7da-1ce2-45d9-8213-a5ed25b3e7b2` [game/switch_1] "Jogo Nintendo Switch Mario Kart 8" (0/1, 1)
- `888c5762-1027-4fcf-afbd-d200063c2f40` [game/switch_1] "Caixa Nintendo Switch Edição Mario Kart 8" (0/1, 1)
- `cd4d007b-c465-4004-9471-592c411d440b` [game/switch_1] "Mario Kart Delux 8 Nintendo Switch" (0/1, 1)

### R018 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1f7f908d-0acd-4b5f-8e6e-984895b6f53a` [game/switch_1] "Jogo Nintendo Switch Super Mario Party" (0/6, 6)
- `9a018e6e-7422-4622-b18e-ddd713f2fe7a` [game/switch_1] "Jogo Super Mario Party Jamboree Nintendo Switch" (2/12, 15)

### R019 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `d0121ffe-6176-4aa1-b1f7-30977478ceb7` [game/ps5] "Jogo Resident Evil 4 Remake Midia Fisica Lacrado para PS5" (0/3, 3)
- `1893c42a-a74f-4c78-87f3-88e237f67e06` [game/ps5] "Resident Evil 4 Remake (Áudio em Português) - Ps5" (0/2, 2)
- `da2c6a94-e1d1-4de1-a296-2709cd8ab5af` [game/ps5] "RESIDENT EVIL 4 REMAKE PS5 ORIGINAL MÍDIA FÍSICA NOVO (DESLACRADO)" (0/1, 1)

### R020 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c936da45-78a3-4f2f-abc6-4be69dfe0b7a` [game/ps5] "Resident Evil 4 2023 Ps5 P S N NÃO É CD" (0/1, 1)
- `6f7a5843-f3d4-4b51-bc3a-39fffb8a6a3d` [game/ps5] "Resident Evil 4 2023 PS5 Midia Fisica" (0/5, 5)

### R021 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `03646602-4d0e-4d60-a0dc-549f86436a45` [game/switch_1] "Super Mario 3D All Stars - Nintendo Switch (com detalhe)" (0/1, 1)
- `f4e42fe7-d3a6-40ad-9662-87da5f948ebe` [game/switch_1] "Super Mario 3d All Stars Nintendo Switch" (4/20, 1079)

### R022 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0a5ea80f-cdaa-42a7-be24-9f3e6563211b` [game/switch_1] "Zelda Breath Wild Explorers Nintendo Switch Original Fisica" (0/1, 1)
- `3ff650a6-ab63-4eaf-8d95-cf63da1dcee6` [game/switch_1] "Zelda Breath Of The Wild Nintendo Switch" (0/1, 1)
- `7929b6eb-f4a7-4f36-ae69-076b516a22e5` [game/switch_1] "The Legend of Zelda Breath of The Wild Switch Midia Fisica" (0/7, 7)
- `82ccba58-e5d8-480c-a7be-1212cba07174` [game/switch_1] "Jogo Nintendo Switch Zelda Breath of the Wild Lacrado + Garantia + NF" (0/1, 1)

### R023 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0cdd48bd-c7c6-44c5-9b39-3baedf0f9750` [game/ps5] "Resident Evil 2 Remake PS5 Mídia Física Novo Nacional Legendado" (0/2, 2)
- `54fce95d-c3f5-4a41-a5a3-7256d7ef228b` [game/ps5] "Resident Evil 2 Remake PS5 | Mídia Física Original | Edição Nativa PlayStation 5 | Novo e Lacrado | Pronta Entrega" (0/1, 1)

### R024 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0e075f34-8706-4143-a9fe-3379f1f688d3` [game/switch_1] "The Legend of Zelda: Skyward Sword-Switch" (0/4, 3)
- `20db4d04-8811-4014-b3f4-d17861f7fdd0` [game/switch_1] "The Legend of Zelda: Skyward Sword HD para Nintendo Switch - Mídia Física" (0/2, 2)
- `399d1f99-31e3-4a71-9389-b6415f77e05a` [game/switch_1] "Jogo Zelda Skyward Sword Hd Nintendo Switch Físico Nacional" (0/1, 0)
- `7aa5c485-3760-4d85-a60c-8617b89489e0` [game/switch_1] "A Lenda de Zelda: Skyward Sword HD - Nintendo Switch" (0/1, 2)
- `cb2a6c98-c902-4593-8ccf-7d0268249141` [game/switch_1] "Zelda Skyward Sword Nintendo Switch Lacrado" (0/1, 1)

### R025 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `14ce4c73-d07a-4f54-93d8-0c810de4b2b2` [game/switch_1] "JOGO SUPER MARIO BROS RPG NINTENDO SWITCH" (0/1, 1)
- `87c81a50-f044-47b5-a8ff-859590a40aec` [game/switch_1] "JOGO SUPER MARIO RPG NINTENDO SWITCH PARCELADO" (0/1, 1)
- `e2b53a55-e03c-4442-8873-402c625fd43d` [game/switch_1] "Super Mario RPG Nintendo Switch" (13/37, 21048)

### R026 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `167fc459-a9b4-4c35-b46a-75fea9b13987` [game/ps4] "Dragon ball xenoverse ps4 envio de imediato" (0/1, 1)
- `f9fb602e-37e7-4458-88ca-83e32ed2627b` [game/ps4] "Dragon Ball Xenoverse XV - PS4 Mídia Física" (0/1, 1)

### R027 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1788e58c-f4dc-4745-8592-36197fe6867c` [game/ps5] "Mortal Kombat 1 - PS5 Standard" (3/24, 13319)
- `6a34d527-aee6-42dd-8f1a-f767c2ba32eb` [game/ps5] "Mortal Kombat 1 - PS5 Estándar" (0/1, 0)

### R028 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `18b97f9a-e764-4030-8022-1d7772f535cf` [game/switch_1] "Super Mario Party Jamboree Nintendo Switch (Digital)" (1/1, 2)
- `43f8e55b-b7b9-4cb0-8157-a0953a0fe6c8` [game/switch_1] "Super Mario Party Nintendo Switch (Digital)" (1/2, 3)

### R029 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1e30fa33-458d-482a-8607-a8ce5a86a9a0` [game/switch_1] "Mario & Luigi Brothership Nintendo Switch (AMERICANO) - Mídia Física - Lacrado" (0/1, 1)
- `4ccec7b6-6e3f-438d-b826-05048281f193` [game/switch_1] "Mario & Luigi: Brothership - Nintendo Switch - Original" (0/6, 6)
- `83b63d44-160b-4893-85fc-f48212d01375` [game/switch_1] "Jogo Mario &amp; Luigi Brothership - Nintendo Switch" (0/1, 1)
- `d19ef93e-00a2-4d9b-a552-cb75042ef511` [game/switch_1] "Jogo Nintendo Switch Mario & Luigi Brothership Nt000002Nsw" (0/1, 1)
- `dc3d8589-3901-4b7c-9356-22c83807af8f` [game/switch_1] "Mario & Luigi Brothership Nintendo Switch Novo Versão Japonesa" (0/2, 2)

### R030 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `26a812cd-33dc-43a3-a157-6792e96453e5` [game/ps5] "Spider Man 2 - PS5 - Original" (0/2, 2)
- `fa3d6d35-a800-4304-b68d-89d43b777163` [game/ps5] "Marvel Spider-man 2 (MÍDIA FÍSICA) - Jogo Novo Original e Lacrado - PS5" (0/2, 2)

### R031 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `27505f8c-bb31-4cc7-aa79-a127de2eb6d5` [game/switch_2] "Super Mario Party Jamboree Nintendo Switch 2 Edition + Jamboree TV Versao Japonesa" (0/1, 1)
- `ca0be201-a84a-494d-b5b4-e380f745dbe7` [game/switch_2] "Super Mario Party Jamboree Nintendo Switch 2 Edition + Jamboree TV -Switch2 - Variação P" (0/2, 2)

### R032 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2939ed63-3812-4431-afd4-234a3e03d1b8` [game/switch_1] "[Nintendo Licensed Product] Hori Classic Controller for Nintendo Switch - Zelda [Compatible with Nintendo Switch]" (1/3, 4)
- `b9853aa7-62a9-44ca-b8e1-05493230aebf` [game/switch_1] "HORI Classic Controller for Nintendo Switch - Zelda (Compatible with Nintendo Switch)" (0/1, 1)

### R033 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2cc2ce85-7801-45a3-906d-615b668e4669` [game/switch_1] "Caixa Super Mario Jogos Nintendo Switch Porta Jogos Com Imã" (0/2, 2)
- `81d31bc4-743e-4513-a3e6-4c2500152927` [game/switch_1] "Caixa Super Mario para Armazenar Jogos de Nintendo Switch Porta Jogos" (0/1, 1)
- `8e91b8ab-379a-45fa-bef6-0e57ce2bd938` [game/switch_1] "Porta jogo nintendo switch caixa super mario" (0/1, 1)

### R034 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `30df4961-abaf-46d3-acd6-c99119ca8dac` [game/ps4] "Star Wars: Battlefront - PS4 - Original" (0/3, 3)
- `d9f5c8ac-9b71-4ae2-9ef1-3dce14c3bfaf` [game/ps4] "Star Wars Battlefront II – PS4 (Original)" (0/1, 1)

### R035 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `33026237-66f9-4b41-87f2-c4be677c6243` [game/switch_1] "Pokémon Shining Pearl Nintendo Switch Euro" (0/1, 0)
- `b2d34150-69da-47d3-9158-90f68d9d634c` [game/switch_1] "Pokemon Shining Pearl - Nintendo Switch" (3/20, 9248)

### R036 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `33cdf3e2-af1a-48c2-b40a-1b9dc0b1e68f` [game/switch_1] "Team Sonic Racing (mídia Física) - Nintendo Switch ()" (0/1, 2)
- `db001c3a-1cf2-4b58-a42a-394fa6ca7bd2` [game/switch_1] "Team Sonic Racing Nintendo Switch Euro" (1/1, 3786)

### R037 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `38870da7-2ed1-4cfc-a031-209aa157ee7b` [game/ps5] "Resident Evil 4 Golden Edition - PS5" (0/2, 1)
- `9e046e45-a2b6-455d-9f25-fe85716aa365` [game/ps5] "Jogo Resident Evil 4 - PS5 Mídia Física Original - Playstation 5 Envio Rápido" (0/1, 1)

### R038 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `398c4a14-b257-4a6e-ba01-87317be28f21` [game/switch_1] "Porta Jogos de Nintendo Switch - Cubo Charada do Mario" (0/1, 1)
- `d5ff4517-2720-464c-ab0e-78f0b70bb736` [game/switch_1] "Porta jogos nintendo switch cubo mário" (0/3, 3)

### R039 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `39dd9819-b640-43d4-8a64-ba7cf3ac8aee` [game/xbox_series] "Lacrado Marvel's Midnight Suns - Xbox Series X" (0/1, 1)
- `e12a6de4-101a-497f-81f3-5b3e143b3b71` [game/xbox_series] "Jogo Xbox Series X Marvel Midnight Suns Enhanced Edition" (3/4, 4)

### R040 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `47eca717-56b0-4d51-bc12-a0e8faabb2ee` [game/ps5] "Resident Evil 4 Gold Edtion Ps5 Fisico Pronta Entrega!" (0/1, 1)
- `ebaa3e80-90ae-4b78-94ff-a86a57819aa3` [game/ps5] "Resident Evil 4 Gold Edition Ps5 Fisico" (0/4, 6)

### R041 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `4d1bd89a-8352-4709-92e5-623ee889ada5` [game/switch_1] "🎲 Mario Party Superstars (Nintendo Switch) - Edição Japonesa 🇯🇵🎉" (0/1, 1)
- `58dc7b08-7771-4d72-94cc-ee0cced186b1` [game/switch_1] "Mario Party Superstars - Nintendo Switch - Original" (0/3, 3)

### R042 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `550494f8-9afa-44b1-83fc-9759f6c31d2d` [game/xbox_360] "Microsoft Xbox 360 Pacote Forza Horizon 2" (0/1, 0)
- `6a205e5b-e0db-43f1-be95-2218eea46e51` [game/xbox_360] "Forza Horizon 2 Xbox 360 Fisico" (0/2, 5)

### R043 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `5ece4562-824c-4136-99ad-e744d19406ce` [game/ps4] "Jogo Dark souls 3 Playstation 4 PS4 Mídia fisica" (0/2, 2)
- `6c7a96be-4677-42ab-879e-1819e9e9cf0b` [game/ps4] "Box Dark Souls (para 3 jogos) - PS4" (0/1, 1)

### R044 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `600415a8-f1f6-4d76-a31e-99f04adc98ea` [game/switch_1] "The Legend Of Zelda Echoes Of Wisdom Switch Midia Fisica" (0/3, 3)
- `b6f7f401-b54e-4025-8453-0d5fc3e44906` [game/switch_1] "LACRADO ZELDA ECHOES OF WISDOM PARCELADO NINTENDO SWITCH" (0/1, 1)
- `c42169fb-522b-46c4-a79d-eb1215deb9ea` [game/switch_1] "LACRADO COM NOTA ZELDA ECHOES OF WISDOM NINTENDO SWITCH" (0/1, 1)

### R045 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `62ddb6e1-683b-4d65-89fb-76ae954579ff` [game/ps5] "Grand Theft Auto V GTA 5 PS5 Midia Fisica Standard Edition" (0/12, 40)
- `8f265fdf-ee04-4110-b7cb-0187d5a44268` [game/ps5] "GTA 5 Grand Theft Auto V | Legendado em Português | PS5 Mídia Física Original US" (0/1, 1)
- `c2df4777-d2c7-4de2-9c68-d6335f56a5ed` [game/ps5] "Jogo Gta 5 Ps5 - Grand Theft Auto V Ps5 Mídia Física" (51/104, 195809)
- `f28a3712-1fe1-4255-b2da-48fc34670155` [game/ps5] "Playstation PS5 GTA 5 Grand theft auto NEW" (0/1, 1)

### R046 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `65cc8f42-6110-4015-8cdc-8348043bfa8d` [game/switch_1] "Super Mario Bros. Wonder Nintendo Switch (físico)" (26/71, 155854)
- `94ddc43a-6d9e-4fb8-8db2-790c09ceec3e` [game/switch_1] "Super Mario wonder nintendo switch" (0/3, 3)

### R047 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `6d36e15e-28f2-4dae-a525-e6c7e0be37e9` [game/switch_1] "Super Mario Kart 8 Deluxe Nintendo Switch Mídia Física Original" (0/1, 1)
- `778b70af-cf9a-4b43-b8b2-2f468be0f426` [game/switch_1] "Jogo Mario Kart 8 Deluxe, Nintendo Switch - HBCPAABPA" (0/1, 1)
- `9c1685b3-854a-4943-b6c6-979f84198826` [game/switch_1] "Mario Kart 8 Deluxe - Nintendo Switch" (0/16, 17)

### R048 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `6df3f813-fe4d-453b-870a-c6011ccce60a` [game/switch_1] "🎾 Mario Tennis Aces (Nintendo Switch) - Edição Japonesa 🇯🇵🎾" (0/1, 1)
- `b6c68e25-be8a-4245-bfe4-30e31e014439` [game/switch_1] "Mario Tennis Aces Nintendo Switch" (0/1, 1)

### R049 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `7a82eb19-777f-4f44-a30a-1768ccac5328` [game/ps5] "Final Fantasy 16 PS5 midia fisica" (0/4, 4)
- `d7214dbc-1538-4ac2-b64e-8395e3d418d5` [game/ps5] "Jogo PS5 - Final Fantasy 16/XVI" (0/1, 1)

### R050 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `7ac4d8d5-65cd-4a19-9e39-4f288a3386e7` [game/switch_2] "Mario Kart World (Switch 2)" (5/11, 78)
- `e1a57932-da1b-40e7-af6f-08f65f60508a` [game/switch_2] "Jogo de Corrida Mário Kart World Para Nintendo Switch 2" (0/2, 2)

### R051 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `7b41c25e-90c9-441a-86ae-91c87084096c` [game/ps5] "Street Fighter 6 Ps5 Midia Fisica" (26/35, 4888)
- `d4e6075b-8bb9-4d08-ad28-cb52bb7ac38b` [game/ps5] "Street Fighter 6 PS5 Estándar" (0/1, 0)
- `ea2cd97b-2c34-4118-8229-10d7d76fa1de` [game/ps5] "Street Fighter 6 Edição Lenticular Ps5" (0/1, 0)

### R052 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `7c02001e-ea82-4fcb-9253-3911c08a4d02` [game/switch_1] "Nintendo Switch Pro Controller Original Novo (Leia descrição) Lacrado Zelda Tears Of The kingdom" (0/1, 1)
- `ea8fd609-aa33-40b5-bc6b-e841338cda77` [game/switch_1] "Nintendo Switch Pro Controller Zelda: Tears of the Kingdom" (0/1, 1)
- `ef097300-eeec-441a-9962-cdc564bfb651` [game/switch_1] "Nintendo Switch Pro Controller The Legend of Zelda: Tears of the Kingdom Edition Tecido" (0/1, 1)

### R053 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `8197b0af-727d-41ad-b41f-45c159feb560` [game/ps5] "Resident Evil Requiem - Ps5" (18/94, 18070)
- `de18eb18-13b0-4952-963d-7a09c481fac7` [game/ps5] "Resident Evil Requiem PS5 Versão Japonesa Mídia Física Novo" (0/1, 1)
- `f1402ff6-73a8-42b4-9ba7-c23a63df403a` [game/ps5] "Réquiem de Resident Evil para PS5" (0/1, 0)

### R054 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `8d95b328-48fe-42ef-8135-8258cd1e0a2f` [game/switch_1] "NINTENDO SWITCH EDIÇÃO LETS GO EEVEE" (0/1, 1)
- `e6fb9117-fd19-47a2-98f4-a76fc183aa2a` [game/switch_1] "Pokemon Lets Go Eevee Nintendo Switch" (1/1, 3)

### R055 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `8f87346f-7a62-4289-8f26-290fef326cea` [game/switch_1] "Mortal Kombat 1 - Nintendo Switch" (2/3, 168)
- `9ab82216-5793-4a16-a56b-e87c0afabf83` [game/unknown] "Mortal Kombat 1 - NSW Estándar" (0/1, 0)

### R056 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c895701d-f41c-466d-aac8-d370574ecebf` [game/xbox_series] "Tekken 8 - Launch Edition Xbox Series X Físico Launch Edition" (0/1, 0)
- `f0d49f2c-548d-422a-809d-1a49e47865bb` [game/xbox_series] "Tekken 8 Launch Edition para Xbox Series X em Mídia Física" (0/1, 0)

### R057 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c95643e7-a4ef-415f-857a-73c22057974c` [game/xbox_one] "Jogo Forza Motorsport 5 Microsoft Xbox One" (3/6, 17)
- `edc9ccad-f4f8-410a-9ee8-89826e2c33ed` [game/xbox_one] "Game Xbox One Forza Motorsport 5 - Vitrine" (0/1, 0)

### R058 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `d71baafd-de93-450d-af84-0e3d75607d48` [game/ps4] "Lego Marvel Super Heroes 2 - Ps4 Midia fisica Cd" (0/2, 2)
- `dedc78db-24d2-4718-a91c-25cfeca3d2bc` [game/ps4] "Jogo Lego Super Heroes 2 Playstation 4 PS4 Mídia fisica" (0/1, 1)

### R059 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `1d76a608-c8c5-427e-aef5-800e5169e461` [game/unknown] "Final Fantasy VII Rebirth" (0/1, 0)
- `17be542b-d13c-4d98-a7d4-759eba5323e2` [game/ps5] "Final Fantasy VII Rebirth PS5 Standard" (12/35, 23166)

### R060 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4767b067-f4d6-41b3-97e6-643975be65ed` [game/unknown] "Mortal Kombat 1" (0/14, 0)
- `1788e58c-f4dc-4745-8592-36197fe6867c` [game/ps5] "Mortal Kombat 1 - PS5 Standard" (3/24, 13319)
- `8f87346f-7a62-4289-8f26-290fef326cea` [game/switch_1] "Mortal Kombat 1 - Nintendo Switch" (2/3, 168)
- `b474e496-a6e8-4cf8-94ba-ead16f71242c` [game/xbox_series] "Mortal Kombat 1 Xbox Series X Mídia Física Pronta Entrega" (0/2, 2)

### R061 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `5d9f97f6-ffb7-444f-a18b-8adb9983f55c` [game/unknown] "Street Fighter 6 Estándar" (0/1, 0)
- `d4e6075b-8bb9-4d08-ad28-cb52bb7ac38b` [game/ps5] "Street Fighter 6 PS5 Estándar" (0/1, 0)

### R062 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `aab270e0-229e-4014-b1ca-d8b1dccd6153` [game/unknown] "Cyberpunk 2077 Ultimate Edition" (0/1, 0)
- `53ecccc9-a49d-41af-8b22-267aeb5a1f39` [game/ps5] "Cyberpunk 2077 Ultimate Edition PS5 Midia Fisica" (12/26, 16459)
- `c1e50127-83fd-4c2b-85b1-aa052ddc6577` [game/switch_2] "Cyberpunk 2077 Ultimate Edition Switch 2 Midia Fisica" (0/1, 2)

### R063 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `e7fe71c6-ee14-43b9-8615-62e1123d1f6e` [game/unknown] "Elden Ring" (0/3, 0)
- `d8e41d3c-8940-47af-aae3-91e46938d642` [game/xbox_series] "Elden Ring - Xbox Series X Standard" (0/3, 0)
- `af4e8cf0-dbdc-4625-8ab6-e065e18c315f` [game/ps5] "Elden Ring Edição Standard - PS5" (0/23, 21)
- `440edd4a-5000-4cee-a003-efaba170fa00` [game/ps4] "Elden Ring Standard Edition PlayStation 4 físico" (16/27, 4621)

### R064 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `e4d32318-9292-4626-ae9f-d5b2c354beb2` [game/unknown] "ELDEN RING NIGHTREIGN Standard Edition" (0/1, 0)
- `c1627d91-3c74-4793-9b7c-9aec8de50cab` [game/ps5] "Jogo Ps5 Elden Ring Nightreign Standard Edition" (11/36, 13169)

### R065 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4ec0603d-cbd4-4f5d-a694-c80a789a525f` [game/unknown] "God of War" (0/5, 0)
- `d09a54df-80c2-4de9-a821-17357c5b3c63` [game/ps4] "God Of War Playstation 4" (1/6, 5)

### R066 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `921ac234-7ac9-4f4a-9e3e-d818422eb833` [game/unknown] "God of War Laufey Standard" (0/4, 0)
- `e0b74cd4-2ecb-49ce-b139-8f7a56e62d7e` [game/ps5] "God of War Laufey Jogo PS5 Standard" (0/2, 0)

### R067 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `a0a24597-d16d-446c-bf5d-55e2016e8bc5` [game/unknown] "Hollow Knight Standard Edition" (0/2, 0)
- `2b317119-5992-4d4f-b1de-7719e368079a` [game/ps5] "Hollow Knight PS5 Midia Fisica" (0/2, 841)
- `f57d9a9b-f7d3-45b7-93a7-7899b5db5b9c` [game/switch_1] "Hollow Knight Switch Standard Edition (Físico)" (9/14, 14442)
- `2a986660-a072-409e-82b6-ad8a6f9e1d29` [game/ps4] "HOLLOW KNIGHT - PS4" (13/14, 15)
- `c020f5fe-c912-4d18-bbd7-e83d9c91dfce` [game/switch_2] "Hollow Knight Nintendo Switch 2 Standard" (0/1, 0)

### R068 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `440d2bdd-d0ba-496a-bdcf-98c2bc24f0b0` [game/unknown] "Cyberpunk 2077" (10/28, 10028)
- `9b3eaa82-9bc2-4d93-b1b4-19b98edbc152` [game/unknown] "Cyberpunk 2077 Standard (Padrão)" (0/1, 0)
- `b2160601-67a8-42d8-840b-a50283c1a286` [game/ps4] "Cyberpunk 2077 - PS4 - Mídia física Português Br" (0/1, 1)
- `cc31471e-0d9e-4b10-822a-72d5b4ab5f39` [game/xbox_one] "CyberPunk 2077 - Xbox One/Series X - Original" (0/2, 2)

### R069 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `c4ec7503-4de4-4efe-8ed8-1e37ee30ced9` [game/unknown] "Mortal Kombat 1 Estándar" (0/1, 0)
- `6a34d527-aee6-42dd-8f1a-f767c2ba32eb` [game/ps5] "Mortal Kombat 1 - PS5 Estándar" (0/1, 0)
- `9ab82216-5793-4a16-a56b-e87c0afabf83` [game/unknown] "Mortal Kombat 1 - NSW Estándar" (0/1, 0)

### R070 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `eee425f2-a6bf-4c99-a065-67d19106fefe` [game/unknown] "Hollow Knight SILKSONG" (0/1, 0)
- `8bd9465b-f2f7-4442-99a7-9116b014102e` [game/xbox_series] "Hollow Knight Silksong Xbox One Xbox Series X Midia Fisica" (3/3, 3)

### R071 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `02545ef4-71cf-4944-af9a-5c20201f2b22` [game/unknown] "Elden Ring - Padrão México" (0/1, 0)
- `c18e1014-0155-4118-9b57-1ae08120895e` [game/unknown] "Elden Ring - Edição Standard México" (0/1, 0)

### R072 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `040b032e-9087-4d01-87fc-fedbb87aaee6` [game/unknown] "Cyberpunk 2077 Edição Steelbook" (0/1, 0)
- `04a1de1a-9f50-4b4d-bc44-875359eb446f` [game/xbox_one] "Cyberpunk 2077 Steelbook Edition Xbox One" (0/1, 2)

### R073 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `07c06d49-2d4c-4db0-ba45-f8daf93467ed` [game/unknown] "Gta 5" (1/2, 5)
- `10072eb7-4e1f-42c0-9374-14aa36d0c5df` [game/ps4] "Gta 5" (6/8, 18)
- `d1d5da8b-7908-4be3-b83d-3eadc2973f60` [game/ps5] "GTA 5 Ps5 Lacrado Mídia Física" (0/15, 15)

### R074 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `0e009e64-a0d2-49bc-b9d4-82bb62019ab9` [game/unknown] "Resident Evil Requiem" (0/3, 0)
- `58f4c935-60c4-4e57-8e6d-13bf85a1be87` [game/switch_2] "Resident Evil Requiem - Nintendo Switch 2 Físico Lacrado Novo" (0/2, 2)
- `8197b0af-727d-41ad-b41f-45c159feb560` [game/ps5] "Resident Evil Requiem - Ps5" (18/94, 18070)

### R075 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `0fb55bf4-495e-4051-8efe-1eaaff7d5cd9` [game/unknown] "Resident Evil: Revelations" (0/4, 0)
- `2bfe2230-c658-4fed-b7b6-d075a5b91efd` [game/ps4] "Resident Evil Revelations - PS4 - Original" (0/1, 1)
- `fe2ece36-501a-41e3-8ada-4ed58e740a45` [game/switch_1] "Resident evil revelations Lacrado Nintendo switch" (0/1, 1)

### R076 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `124c23aa-2461-409a-a133-d7bdf5fdbb1a` [game/unknown] "Street Fighter 6 Edição Lenticular" (0/1, 0)
- `ea2cd97b-2c34-4118-8229-10d7d76fa1de` [game/ps5] "Street Fighter 6 Edição Lenticular Ps5" (0/1, 0)

### R077 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `1ed8b82f-5d9f-4f58-932f-15405ff9a18a` [game/unknown] "Silent Hill" (0/6, 0)
- `7c0fd7dd-d249-4f42-86cd-2f6ef0b8d73d` [game/unknown] "Padrão Silent Hill" (0/4, 6)

### R078 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `23a8e827-66d6-4b39-a5bf-1db19013edf0` [game/unknown] "Resident Evil Village" (0/1, 0)
- `452e86aa-259d-4381-a07f-5dda8280a8be` [game/ps4] "Resident Evil: Village - PS4 - Original" (0/1, 1)
- `b26889a8-b861-4dd0-932c-89d265b06fa2` [game/ps5] "Jogo Resident Evil Village - Ps5 Físico" (6/33, 10810)

### R079 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `3294e4e6-75fe-42d4-8e9f-75931bba5db8` [game/unknown] "Nintendo Super Mario Odyssey" (0/1, 1)
- `2cfde1c0-f7bd-4deb-b8f9-24bd79981a78` [game/switch_1] "Super Mario Odyssey Nintendo Switch Lacrado Midia Fisica" (1/9, 9)

### R080 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4480478c-efec-461e-8746-b21355e37214` [game/unknown] "Elden Ring Standard Edition (Digital)" (0/1, 0)
- `47021800-3548-4973-ba20-11925b1c6ff4` [game/xbox_one] "Elden Ring Standard Edition Xbox One Digital" (0/1, 0)

### R081 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4e1f0c81-3e77-46a7-9aae-065892b84866` [game/unknown] "Street Fighter 6 Edição de colecionador" (0/1, 0)
- `78568bb2-9500-4f50-bc73-6bce55cad9a4` [game/ps4] "Street Fighter 6 Collector's Edition - Ps4" (3/3, 2482)

### R082 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `59700d6a-a549-4232-bb65-a05fc33e52cd` [game/unknown] "Silent Hill Downpour" (0/1, 0)
- `94d5e8e5-0ef9-44c3-a932-e2a11356a827` [game/xbox_360] "Jogo Xbox 360 Silent Hill Downpour Midia Fisica" (0/1, 0)

### R083 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `668646f9-625d-41ff-b05a-033102a3b20c` [game/unknown] "Street Fighter 6" (1/10, 176)
- `319317e4-9d81-4464-929a-694d2b7d6a22` [game/xbox_series] "Street Fighter 6 (mídia Física) - Xbox Series X" (0/1, 1)
- `7b41c25e-90c9-441a-86ae-91c87084096c` [game/ps5] "Street Fighter 6 Ps5 Midia Fisica" (26/35, 4888)

### R084 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `753ff13c-96b3-4e1d-b8ed-a2e810aa7b6c` [game/unknown] "Tekken 8 Edição de colecionador" (0/1, 0)
- `3f8ff736-2aa4-49a3-aff6-31b58490023d` [game/ps5] "Tekken 8 Collector's Edition - Ps5" (0/1, 5)

### R085 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `77d4b692-1e1d-4a37-9114-b413f6f1f0cb` [game/unknown] "Turok Trilogy Bundle" (0/1, 0)
- `4b6e31bc-f1d0-433d-92c3-3f2903f4e12e` [game/ps5] "Turok Trilogy Bundle Ps5 Mídia Física" (0/7, 37981)

### R086 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `7ca37f56-edb2-499e-9c12-a131f71fecac` [game/unknown] "Cyberpunk 2077 Projekt Red" (5/13, 48)
- `24ab009c-6c49-4055-8960-3c23d57b6fb8` [game/ps4] "Cyberpunk 2077 CD Projekt Red PS4" (3/15, 192)

### R087 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `84c6ae11-c7f7-4957-a00e-10efceff8f78` [game/unknown] "Elden Ring Collector's" (0/1, 0)
- `17f97813-d6bf-41bb-9020-996525586768` [game/ps5] "Elden Ring Collector Edition Ps5" (0/1, 0)

### R088 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `ac2071f6-298d-4536-9a53-c963dacc5325` [game/unknown] "Tekken 8 Standard Edition" (0/11, 1)
- `98831105-323d-4caf-87c3-031390962c0b` [game/ps5] "Tekken 8 Ps5 Midia Fisica" (13/26, 14411)
- `c0f3fee8-0238-4c2b-b5e8-2398e48afec0` [game/unknown] "Tekken 8 (xsx)" (0/1, 0)

### R089 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `b2763b39-dcc1-403a-baf1-82aec02ef7e4` [game/unknown] "Tekken Tag Tournament 2" (0/1, 0)
- `711f2833-15e7-4c6b-9b77-6452407246d8` [game/xbox_360] "Jogo Xbox 360 Tekken Tag Tournament 2" (0/1, 0)

### R090 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `b5e5881f-9c1c-40ec-ad27-75ccda1081d7` [game/unknown] "Nintendo Mário Kart World - Mídia Física Lacrado" (0/1, 1)
- `7ac4d8d5-65cd-4a19-9e39-4f288a3386e7` [game/switch_2] "Mario Kart World (Switch 2)" (5/11, 78)

### R091 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `b8942e61-c209-4090-9b85-675f916331f4` [game/unknown] "Zelda Breath Of The Wild" (0/1, 1)
- `3ff650a6-ab63-4eaf-8d95-cf63da1dcee6` [game/switch_1] "Zelda Breath Of The Wild Nintendo Switch" (0/1, 1)

### R092 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `e8039b5e-d409-41a0-838b-fbd604816f4a` [game/unknown] "Silent Hill 2 Remake Standard" (0/1, 0)
- `2866dbbc-780a-457f-b387-b28e404124ce` [game/ps5] "Silent Hill 2 Remake Ps5 - Mídia Física" (0/2, 2)

### R093 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `44bcde51-44ec-43d8-9409-75a01532924b` [console/switch_1] "Nintendo Switch Lite Desbloqueado" (1/1, 1)
- `5307d140-59e4-48ba-bb94-b85989b80ecf` [console/switch_1] "ENVIO RAPIDO! NINTENDO SWITCH LITE DESBLOQUEADO" (0/2, 2)
- `5862acd9-d695-48ca-9c0b-504ed6c7e367` [console/switch_1] "NOTA FISCAL Nintendo Switch lite desbloqueado com nota e garantia" (0/1, 1)

### R094 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `9d580734-4f56-4f4c-9e5c-ba06b29944d1` [console/xbox_series] "Xbox séries x 1 tb" (1/1, 1)
- `720d61aa-f505-4200-98de-c499284f5de5` [console/xbox_series] "Xbox séries x 1 tb  -  ORIGINAL, Lacrado!" (0/1, 1)

### R095 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `0a155e2c-fdd4-4946-afcf-f8027cd93675` [console/xbox_one] "Console Xbox One S Microsoft 1tb" (0/1, 3)
- `12c806b9-6827-4736-b7bb-128ebc6b8064` [console/xbox_one] "Console Xbox Xbox One S Standard" (0/1, 0)
- `71841796-7360-413c-aa39-ccf16476a112` [console/xbox_one] "Console Xbox One S de 500 GB" (0/1, 0)

### R096 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `0faf86f5-2eed-492d-9301-25dd9e32dd7c` [accessory/switch_1] "Controle Para Nintendo Switch- Joycon Alta Qualidade/Envio Imediato" (0/1, 1)
- `af54d7cf-a268-4bf5-a587-e056032f0a5f` [accessory/switch_1] "Controle Nintendo Switch Joycon alta qualidade Envio Rapido" (0/1, 1)

### R097 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `14fb9ec6-078a-41b3-84a3-6accc3627fb8` [console/xbox_one] "Console Xbox One S De 1 Tb branco" (3/4, 6)
- `c53344ea-728d-4cdf-8c1a-da4c3202fd13` [console/xbox_one] "Console Xbox One S 1 TB Branco da Microsoft" (3/3, 9)

### R098 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `24c6ff7e-4b46-4f11-8a0d-a117dfc191a1` [console/ps5] "Console Playstation 5 Disco Sony Brasil" (0/1, 0)
- `aa8f1ca0-a210-419f-9ce8-517c8fc16af6` [console/ps5] "Console PlayStation PlayStation 5" (0/5, 0)
- `b72b88a4-87ed-457c-ac06-ecdc4ffd9daa` [console/ps5] "Console Playstation 5 Standard 1tb Sony" (0/29, 6764)

### R099 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `2a8bddaf-9234-4684-bda3-6274eb3269fd` [accessory/xbox_series] "Controle joystick Microsoft Xbox Microsoft CONTROLE XBOX SERIES CONTROLE XBOX SERIES" (0/2, 0)
- `78f5517d-7ed6-4d0b-83a4-55c1e49ada1c` [accessory/xbox_series] "Controle Joystick Microsoft Xbox Series X/S" (0/1, 1)

### R100 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `2d4bd0ad-2c96-4721-998a-718c1fb0d10e` [console/xbox_series] "Console Xbox Series S de 1 TB" (0/1, 0)
- `a265eb0c-3a9e-43b8-9d4a-541f1ef44465` [console/xbox_series] "Console Xbox Series X 1TB Standard" (2/15, 1904)
- `bbc8bf90-820c-43d1-b8f5-34e6e8f4f27d` [console/xbox_series] "Console Xbox Series X Xbox One X" (0/3, 0)

### R101 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `2db7c939-20f5-4bbd-879e-f903010bce73` [accessory/xbox_series] "Controle Xbox Series X/S Novo Lacrado Original" (0/1, 1)
- `b9c54aac-790b-4c56-9034-45da05a1b498` [accessory/xbox_series] "Controle para Xbox Series S" (0/1, 1)
- `fcc36cb9-5918-4a2b-bcf5-673be78de3df` [accessory/unknown] "controle Xbox séries X Original" (0/1, 1)

### R102 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `3551cad0-9ee6-43d5-ba87-af137d870929` [console/ps5] "Console PlayStation PlayStation 5 Digital" (0/1, 0)
- `d335b69f-d0a7-497b-b075-b355efcd829f` [console/ps5] "Console PlayStation 5 - Digital Edition" (0/1, 1)

### R103 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `4fce8242-d512-4bc4-b42e-de2c5e4221bd` [console/switch_1] "CONSOLE NINTENDO SWITCH ANIMAL CROSSING DESBLOQUEADO COMPLETO ENVIO IMEDIATO" (0/1, 1)
- `ed7917c8-ef1a-4cac-a2c2-f77ddbd30a05` [console/switch_1] "NOTA FISCAL CONSOLE NINTENDO SWITCH ANIMAL CROSSING DESBLOQUEADO COMPLETO ENVIO IMEDIATO" (0/1, 1)

### R104 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `d69fe7df-deca-43d6-9556-17d5ec730120` [accessory/xbox_360] "Controle Xbox 360 Preto" (0/1, 8)
- `ee94acf1-13fd-43b0-9862-d36d3e8037be` [accessory/unknown] "Controle Xbox 360 Preto" (0/1, 4)

### Conflito entre plataforma do cadastro e do título
- `61c8c89d-6b60-4f6f-9bb1-bcf376727d2b` cadastro=switch_2 "[Direct From Japan] Nintendo Switch 2025.9.3Week Release Japan NEW GAME" (0/5)
- `94bea44a-73e6-4307-aed2-1ec76dc5a802` cadastro=switch_2 "[Direct From Japan] Switch  2024.10.5Week Release Japan NEW GAME Nintendo Switch" (0/1)
- `3e714c6d-42a9-4fb7-9232-3019115a2a20` cadastro=switch_2 "[Direct From Japan] Switch 2024.11.5Week Japan NEW GAME Nintendo" (0/2)
- `c5fedf84-f055-4fd8-8e68-aa70c266818a` cadastro=switch_1 "Jogo eletrônico Orbitals Nintendo Switch 2" (4/4)
- `68947b99-b18d-46a9-87f6-96a2d7a63a67` cadastro=switch_1 "Jogo Cronos The New Dawn Terror Switch 2 Nintendo Bloober Team" (7/7)
- `3c85c9df-fd01-4900-87bf-70a469adbed2` cadastro=ps5 "Jogo Ps4 The Dark Pictures Little Hope Midia Fisica" (7/7)
- `683f2471-bcb5-4c4d-89cc-8c09159f1466` cadastro=ps5 "Gran Turismo 7 PS4 Jogo de Corrida Sony Simulador 2022 110GB" (6/6)
- `ee0cafa3-a866-4ff8-afab-5507c8164c04` cadastro=xbox_series "Jogo Clash: Artifacts Of Chaos Zeno Edition Xbox One Xbox X" (2/2)
- `42cf1a66-b402-429c-b3ce-9c08c1dd8761` cadastro=xbox_series "Terraria Xbox One Mídia Física Jogo Aventura Multijogador" (9/9)
- `d1603740-a802-4ed6-81e9-d3d52b9c887d` cadastro=xbox_series "Sleeping Dogs Xbox 360 Mídia Física Jogo Aventura Square Enix" (2/2)
- `eedd4076-619b-495c-9e33-64255bd0ede8` cadastro=xbox_one "Minecraft Standard Edition Xbox 360 Físico Jogo De Aventura E Construção" (5/5)
- `d91a8ec5-4d41-412d-93b2-46045a4af252` cadastro=xbox_one "Halo Wars Xbox 360 Mídia Física Microsoft" (0/1)
- `0dee1dcd-aeed-4655-9ee5-59edee091d68` cadastro=switch_2 "Coleção Mario kart deluxe mc donals mc lanche feliz Nintendo switch 2024  Mario Peach Bowser Toadette Yoshi Luigi Toad" (0/1)
- `2bb612be-f3ed-44da-b8a6-3df91651a117` cadastro=switch_2 "Carro super mario kart mcdonalds nintendo switch 2024" (0/1)
- `2e88c8f7-15be-4af7-91a7-f33457470a51` cadastro=ps4 "Coleção Castlevania Advance Deluxe Nintendo Switch - Prata" (0/1)
- `565752e3-e987-40b8-8454-236dcc0bff84` cadastro=xbox_one "Halo Infinite Xbox Série X|S, Xbox One e PC (Digital)" (0/1)
- `93ee6990-37bd-4355-83d3-855a3e9b369a` cadastro=switch_2 "Nintendo Nintendo Switch OLED White Nintendo Switch 2021" (0/1)
- `9dcbdeef-10f0-454e-bc4f-044863dec19e` cadastro=ps4 "Tekken 8 Standard Edition PS5 Fisico Bandai Namco" (0/1)
- `b87a02f6-f8bc-46f4-a167-9d290c0a6f15` cadastro=switch_1 "Nba 2k26 - Nintendo Switch 2 Físico Europeu" (0/1)
- `e24fd149-c613-44e2-aed7-8dddb7c0990a` cadastro=switch_2 "Nintendo Nintendo Switch Switch NINTENDO SWITCH 2DA VERSION 2ª edição" (0/1)
