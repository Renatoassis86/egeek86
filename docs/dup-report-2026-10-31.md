# Relatório de duplicatas de master_products (2026-10-31)

Gerado por `scripts/dry-run-dup-report.ts`. Somente SELECT (transação READ ONLY); nada foi escrito no banco. Regra aplicada: `normalizeTitle`/`analyzeDuplicates` em `src/lib/affiliate/dedup.ts`.

## Resumo

| Medida | Valor |
|---|---|
| master_products no banco | 4783 |
| já arquivados (mergedInto) | 0 |
| Grupos de duplicata para fusão automática (só jogos, plataforma resolvida, mesma edição) | 88 |
| Masters a fundir (excedentes) | 116 |
| Grupos com oferta ativa em mais de um master (média hoje dividida) | 4 |
| Ofertas que seriam reapontadas (total / ativas) | 141 / 4 |
| Snapshots que migrariam junto (pertencem às ofertas movidas; as linhas de snapshot não são alteradas) | 1589 |
| Quase-duplicatas e casos só para revisão manual (clusters / masters) | 101 / 299 |
| Jogos com título multi-geração (PS4/PS5, Xbox One/Series), fora da fusão automática | 240 |
| Grupos com edições distintas mantidas separadas de propósito (Deluxe, GOTY, Gold, Collector, etc.) | 46 |
| master_products com plataforma 'unknown' (total / jogos) | 922 / 402 |
| ... destes, plataforma derivável do título (total / jogos) | 67 / 28 |

### Linhas em tabelas com FK para master_products que acompanhariam a fusão

| Tabela.coluna | Linhas nos masters a fundir |
|---|---|
| affiliate_offers.master_product_id | 141 |
| affiliate_price_watches.master_product_id | 1 |
| products.master_product_id | 0 |

### Revisão manual por tipo

| Tipo | Clusters | Masters |
|---|---|---|
| near_duplicate | 56 | 156 |
| unknown_platform | 33 | 104 |
| platform_conflict | 1 | 12 |
| non_game_exact | 11 | 27 |

## Grupos para fusão automática

Canônico = mais ofertas ativas, depois mais ofertas, mais snapshots, mais antigo. Formato: `ativas/total ofertas, snapshots`.

### G001 ps5 | final fantasy xvi
- **CANÔNICO** `a845bc42-eaee-403a-be8d-31c57a2fef87` "Final Fantasy XVI PS5 Standard" (15/57, 30562)
- fundir `2ad1d2ff-fbf8-4228-a1c8-b0ad0c886018` "Final Fantasy XVI original e Nacional para PS5" (0/1, 1)
- fundir `665d2dbf-2f39-4c1c-a32e-dbda8abecff2` "Final Fantasy XVI - PS5 Mídia Física Lacrado Pronta Entrega" (0/1, 1)
- fundir `b1f03787-d696-4e13-a083-b97dc7dac338` "Final fantasy XVI- Jogo de PS5 original mídia física" (0/1, 1)
- fundir `cd830a27-a027-4990-bf1b-f191983c1632` "Final Fantasy XVI PS5 Novo Lacrado Nota Fiscal Mídia Fisica" (0/1, 1)
- fundir `cf347762-e131-454f-b0a6-3a71f12a2e8f` "Jogo Final Fantasy XVI - PS5 Mídia Física Original - Playstation 5 Envio Rápido" (0/1, 1)

### G002 ps4 | fifa 16
- **CANÔNICO** `76a2e07e-0325-4e94-a300-622c9083c460` "Jogo Ps4 Fifa 16" (8/16, 1559)
- fundir `4944ef44-1fb0-4979-bffa-1a9a06520cfd` "FIFA 16 ps4 envio imediato" (0/1, 1)
- fundir `a7e91951-54fe-4a34-8bfa-0feb051dae4d` "Fifa 16 - Ps4 - Jogo original de Playstation" (0/1, 1)
- fundir `ab4c47cc-4b12-4450-9bf7-2500a95745dc` "FIFA 16 PS 4 mídia física" (0/1, 1)

### G003 ps5 | elden ring
- **CANÔNICO** `af4e8cf0-dbdc-4625-8ab6-e065e18c315f` "Elden Ring Edição Standard - PS5" (0/19, 18)
- fundir `322b0edc-9e30-4cf3-9c15-105e38b6b765` "Edição De Lançamento De Elden Ring (ps5)" (0/1, 0)
- fundir `750850bd-a2b8-4d97-9a3f-d325bfddab37` "Elden Ring PS5 Mídia Física Envio Imediato" (0/2, 2)
- fundir `a2be6dba-2224-42bd-90e8-4f74bc4739c3` "[LACRADO] Elden Ring PS5 Mídia Física Novo Original Pronta Entrega" (0/1, 1)

### G004 ps5 | resident evil requiem
- **CANÔNICO** `8197b0af-727d-41ad-b41f-45c159feb560` "Resident Evil Requiem - Ps5" (16/90, 17828)
- fundir `1694e639-40b5-4cd9-bc53-f32d10c4d64c` "Resident Evil Requiem Ps5 Mídia Física Nacional" (0/1, 1)
- fundir `77c25d19-374f-405b-b8e6-f6c893f3adde` "Resident Evil Requiem - PlayStation 5 Mídia Física Lançamento" (0/1, 1)
- fundir `7b1d6044-a3d2-47eb-8336-edb7102ff93a` "Resident Evil Requiem Ps5 Original Pt Br Física Lacrado" (0/1, 1)

### G005 ps5 | resident evil village
- **CANÔNICO** `b26889a8-b861-4dd0-932c-89d265b06fa2` "Jogo Resident Evil Village - Ps5 Físico" (6/28, 10738)
- fundir `3e9a59ec-b7bc-42ad-9dc3-8b21902f454a` "Resident Evil Village Ps5 Física Lacrado Pronta Entrega" (0/3, 3)
- fundir `72336803-d7b7-448c-85c5-e856bc4b5dd3` "Resident Evil Village Standart PS5 BR Midia Fisica Open Box" (0/1, 1)
- fundir `b8fdecb7-4eb3-4b47-802b-63dbabf31511` "Resident Evil Village PlayStation 5 - Mídia fisica 100% original" (0/1, 1)

### G006 ps4 | anthem
- **CANÔNICO** `4b715597-387b-4b2d-af20-f3453057522a` "Jogo Anthem Original PS4 – Novo Lacrado" (0/1, 1)
- fundir `55119b1b-b664-4ad7-b539-31cf766ba9d8` "Game Anthem - PS4" (0/1, 1)
- fundir `5875e32f-b2f5-4e00-be20-c956a4c363e9` "Anthem Ps4 envio imediato" (0/1, 1)

### G007 ps4 | bloodborne
- **CANÔNICO** `115dfce8-64ba-42d1-80f1-c44ed90a5114` "Bloodborne- jogo ps4 original mídia física" (0/2, 2)
- fundir `10a25c79-4110-4488-a898-7d8197cd0f0e` "Bloodborne Ps4 Midia Fisica Cd Novo lacrado" (0/1, 1)
- fundir `72e80ac0-9ccb-4b65-a68a-d3c096556dde` "Bloodborne - Jogo PS4 (Dublado em Português)" (0/1, 1)

### G008 ps4 | elden ring
- **CANÔNICO** `440edd4a-5000-4cee-a003-efaba170fa00` "Elden Ring Standard Edition PlayStation 4 físico" (16/24, 4513)
- fundir `29ed47af-7dec-4d86-85f0-675b222d55e8` "Elden Ring (jogo Físico, Nacional) - Ps4" (0/2, 5)
- fundir `d77cceb9-20de-4c98-99f8-8e0f7b61ebae` "Elden Ring | Legendado em Português | PS4 Mídia Física Original BR" (0/1, 1)

### G009 ps4 | fifa 15
- **CANÔNICO** `e743153a-77b6-4bfe-9313-e59f7bd056a2` "FIFA 15- Jogo de PS4 original mídia física" (0/1, 1)
- fundir `a5250a22-e697-4f02-800b-e68639b68512` "JOGO FIFA 15 MIDIA FISICA PS4 ENVIO IMEDIATO" (0/1, 1)
- fundir `a720d3ae-abf4-4b97-b5a2-35ac9fee2567` "Fifa 15 - Ps4 - Mídia Física" (0/1, 1)

### G010 ps4 | fifa 19
- **CANÔNICO** `0b21a839-096e-4e8e-9a81-5f281c7f361c` "Fifa 19 PS4 Mídia Física PT BR" (0/1, 1)
- fundir `ce09d76e-f052-406f-9d06-13a98ba140e8` "Jogo FIFA 19 Playstation 4 PS4 Mídia Física" (0/1, 1)
- fundir `cf72d79b-5143-4e00-ae76-b943e234d129` "Fifa 19 Ps4 Físico Em Português" (0/1, 1)

### G011 ps5 | ea fc 25
- **CANÔNICO** `41cb1265-a6e0-4b11-9bbd-1329918c3c56` "EA FC 25 - PS5 - Original" (0/1, 1)
- fundir `59c28c63-e9c4-4d1d-a3c5-58c26ebc5ede` "EA SPORTS FC25 PS5 Midia Fisica" (0/1, 1)
- fundir `a17d8c00-147c-4db4-b7d4-c69b28db2c91` "EA SPORTS FC 25 PS5 Mídia Física Lacrado Nacional Português BR Pronta Entrega" (0/1, 1)

### G012 ps5 | gta 5
- **CANÔNICO** `d1d5da8b-7908-4be3-b83d-3eadc2973f60` "GTA 5 Ps5 Lacrado Mídia Física" (0/12, 12)
- fundir `79129151-a497-48d2-8a2d-f05df62e2750` "GTA 5 PS5 Mídia Física envio Imediato" (0/1, 1)
- fundir `e0c49425-e8e9-409f-bf08-3e3c01b4b177` "GTA 5 PS5 A Pronta Entrega Mídia Fisica" (0/2, 2)

### G013 ps5 | resident evil 3
- **CANÔNICO** `6813e83f-ef94-4b10-b54d-6e844c8a05b5` "Resident Evil 3 Ps5 Midia Fisica" (30/100, 104713)
- fundir `340680cb-57cc-471c-b504-20d67544a32c` "Resident Evil 3 Ps5 Mídia Física Original Sony" (0/2, 2)
- fundir `d3e506e2-72e3-480b-a208-0689aa991cfc` "Resident Evil 3 - Edição PS5 | Mídia Física Oficial | Novo e Lacrado" (0/1, 1)

### G014 ps5 | returnal
- **CANÔNICO** `2860c3af-a9eb-425c-a4a7-41ab09386cbc` "Jogo Returnal Playstation 5 PS5 Mídia fisica" (0/4, 4)
- fundir `8797fc66-d813-4dc0-98b1-fc95b5bccb63` "Returnal  Ps5 Midia Fisica Cd Portugues Br" (0/1, 1)
- fundir `e6492f7d-8bd7-438e-95d1-d793c4a64264` "Returnal Ps5 Mídia Física Lacrado Dublado Em Português" (0/1, 1)

### G015 ps5 | street fighter 6
- **CANÔNICO** `7b41c25e-90c9-441a-86ae-91c87084096c` "Street Fighter 6 Ps5 Midia Fisica" (26/33, 4441)
- fundir `408a1189-5925-4622-a5de-51ef64bcd97e` "Street Fighter 6 para PS5" (0/1, 0)
- fundir `c697d492-8952-4a98-993b-de930f364b7c` "Jogo Street Fighter 6 - Ps5 em mídia fisica" (0/1, 1)

### G016 ps5 | resident evil 4 [remake]
- **CANÔNICO** `d0121ffe-6176-4aa1-b1f7-30977478ceb7` "Jogo Resident Evil 4 Remake Midia Fisica Lacrado para PS5" (0/1, 1)
- fundir `18a79705-c5aa-4da2-9009-1ae27f23b519` "Jogo Resident Evil 4 Remake PS5 Game Midia Fisica Novo Lacrado Dublado Br" (0/1, 1)
- fundir `199f374d-50bd-402a-bc42-b6459e57d787` "Resident Evil 4 Remake - PS5 Mídia Física Envio Imediato" (0/1, 1)

### G017 switch_1 | legend zelda link awakening
- **CANÔNICO** `3a1c94c7-7b8e-4af5-8ef3-e7db4ac40f24` "The Legend of Zelda : Jogo Físico Do Link's Awakening Switch" (2/4, 4)
- fundir `dbb6b1a5-9ecb-4dde-b8b3-1080240b937c` "The Legend of Zelda Link's Awakening - Nintendo Switch Mídia Física Envio Imediato" (0/1, 1)
- fundir `f8571a9a-53fc-4558-9492-452042ffb005` "Jogo Legend Of Zelda Link S Awakening Para Nintendo Switch" (0/2, 1)

### G018 switch_1 | legend zelda tears kingdom
- **CANÔNICO** `aacf3078-a480-4700-87c1-4806a730d97f` "The Legend Of Zelda: Tears Of Kingdom - Nintendo Switch" (0/4, 22)
- fundir `e2d8a1ff-a319-4a50-bc08-5b3632bde583` "The Legend of Zelda Tears of the Kingdom Switch Midia Fisica" (0/1, 1)
- fundir `e7bdede9-c4ef-4d00-9025-3afb07158a43` "The Legend of Zelda Tears of the Kingdom Nintendo Switch Nacional" (0/1, 1)

### G019 switch_1 | pokemon violet
- **CANÔNICO** `a9cb2f4c-6d22-4967-a660-7281565737da` "Jogo Pokémon Violet Nintendo Switch – Lacrado e Novo" (0/2, 2)
- fundir `444b9a4f-4ff8-4e39-bbcd-c612c2c1242a` "Jogo Switch Pokémon Violet , NINTENDO" (0/1, 1)
- fundir `56f3d8d0-41ba-4c11-baff-32c613096b91` "Jogo Pokémon Violet Standard Edition para Nintendo Switch" (0/2, 2)

### G020 switch_2 | mario kart world
- **CANÔNICO** `7ac4d8d5-65cd-4a19-9e39-4f288a3386e7` "Mario Kart World (Switch 2)" (1/1, 2)
- fundir `17fd97e2-15b9-4f4f-bfcb-463275dd21a9` "Mario Kart World Nintendo Switch 2 Nacional - Mídia Física - Lacrado" (0/1, 1)
- fundir `241b0817-70af-4a6a-a4e8-c9086f4eeb30` "Jogo Mario Kart World - Nintendo Switch 2" (0/4, 4)
- nota: canônico tem plataforma 'unknown' no cadastro; fusão ajustaria para switch_2

### G021 xbox_one | forza horizon 4
- **CANÔNICO** `a278526c-7678-4e55-8a3e-5f60f78e9ac6` "Forza Horizon 4 Standard Edition para Xbox One (Físico)" (5/6, 111)
- fundir `0403f657-99ac-44ca-9a7d-981be23f78fb` "Jogo Xbox One Forza Horizon 4" (1/8, 371)
- fundir `bf92b086-e4e4-4dc4-a129-68681fa44d4f` "Microsoft Forza Horizon 4 - Xbox One" (0/1, 0)

### G022 ps4 | battlefield 2042
- **CANÔNICO** `cba05db0-2a9e-40e9-8b51-05b37d145c13` "Battlefield 2042 PS4  Midia Fisica Cd" (0/1, 1)
- fundir `023d6c64-5635-4b23-b714-5b043bbb3833` "Jogo Battlefield 2042 Playstation 4 PS4 Mídia fisica" (0/1, 1)

### G023 ps4 | bound by flame
- **CANÔNICO** `87115d0d-aa7c-40ab-8e0d-f5050edc07fe` "Bound By Flame - Ps4 Mídia Física Cd" (0/1, 1)
- fundir `7b92c563-54ae-43a5-b04c-d6a303cb80fe` "Bound By Flame - PS4 Mídia Física" (0/1, 1)

### G024 ps4 | darksiders 3
- **CANÔNICO** `5efcc56b-32f2-44be-8091-acca251ab130` "Jogo Ps4 Darksiders 3 Mídia Física Pronta" (11/13, 2848)
- fundir `ef2d3948-afb5-484e-b327-10eb29a9c5ff` "DarkSiders 3 PS4" (0/1, 1)

### G025 ps4 | death stranding
- **CANÔNICO** `c6713543-c9ff-4493-aa25-3dcbbadba75a` "Death stranding- jogo de PS4 original mídia física" (0/1, 1)
- fundir `df7be7c3-4429-42c7-ba9b-103fb5a8e133` "Jogo Death Stranding Original PS4" (0/1, 1)

### G026 ps4 | elder scrolls online
- **CANÔNICO** `4e0e8af9-336b-4228-9e4c-a3951845efcc` "THE ELDER SCROLLS ONLINE - PS4" (0/1, 1)
- fundir `7506187a-4b53-4847-986f-c64b2a22ae17` "Jogo Elder scrolls online Playstation 4 PS4 Mídia fisica" (0/1, 1)

### G027 ps4 | fallout 4
- **CANÔNICO** `a654c7a4-bd85-4ac2-a2b2-5d32b3e3fd18` "Fallout 4 - PS4 - Original" (0/3, 3)
- fundir `f697c18f-2947-44ee-ad65-a7dab3479bfd` "Fallout 4 Ps4 Midia fisica cd" (0/1, 1)

### G028 ps4 | fifa 20
- **CANÔNICO** `4923e983-381f-4950-990f-5ea0cae3fb55` "FIFA 20 ps4  envio de imediato" (0/2, 2)
- fundir `c990e1ab-9984-4e48-93dd-e361f9084029` "FIFA 20 – PS4 (Original)" (0/1, 1)

### G029 ps4 | for honor
- **CANÔNICO** `da8224ff-3e2c-464c-9808-5ac5ae418920` "Jogo For honor Playstation 4 PS4 Mídia fisica" (0/1, 1)
- fundir `29bf9800-ed64-46e9-b03b-fb37dc86681d` "FOR HONOR PS4 envio imediato" (0/1, 1)

### G030 ps4 | horizon zero dawn
- **CANÔNICO** `32f1c6b1-0560-43a8-8e3b-07add9d9ecca` "Horizon zero dawn Ps4 Midia fisica cd em Portugues br" (0/1, 1)
- fundir `71079a66-9fc9-4ee2-817f-b2d19ce48f8c` "Jogo Horizon Zero Dawn Original PS4" (0/1, 1)

### G031 ps4 | infamous second son
- **CANÔNICO** `27ea279e-d429-46c3-aa05-1ed25ffd8cd0` "Jogo inFAMOUS: Second Son Original PS4" (0/2, 2)
- fundir `542880b8-a745-43ad-b9ef-58bfcc31d224` "Infamous Second Son Ps4 Midia fisica Cd" (0/1, 1)

### G032 ps4 | killzone shadow fall
- **CANÔNICO** `47ab65b6-6a9f-42cd-b58f-6aa60e76ea6f` "Killzone Shadow Fall Ps4 Midia fisica Cd" (0/1, 1)
- fundir `3588cf24-a260-4afd-a854-85ccdf5f79eb` "Jogo Killzone Shadow Fall Playstation 4 PS4 Mídia fisica" (0/1, 1)

### G033 ps4 | knack
- **CANÔNICO** `e2473ce8-ba8f-4ca7-8aad-ef138626b552` "Jogo Ps4 Knack Físico" (0/2, 3)
- fundir `452685ef-e82f-459c-9147-8fef36d413f8` "KNACK PS4 envio imediato" (0/1, 1)

### G034 ps4 | mass effect andromeda
- **CANÔNICO** `a872408b-277a-4785-8736-7a5ceea4c97d` "Mass Effect Andromeda Ps4 Midia Fisica Cd" (0/1, 1)
- fundir `c5b75665-1e74-4b03-a3ae-da9d63bcab29` "Mass Effect: Andromeda - PS4 - Original" (0/1, 1)

### G035 ps4 | mortal kombat 11
- **CANÔNICO** `18b694fd-3848-43be-ad36-e1254d0ffbda` "Mortal Kombat 11 Jogo Original Ps4 Mídia Física" (0/2, 2)
- fundir `a43277a1-3ec6-4ce0-b172-f4504450ba74` "Mortal Kombat 11 Ps4 Midia fisica Cd" (0/1, 1)

### G036 ps4 | mortal kombat x
- **CANÔNICO** `c123f4ed-e94a-482b-8137-99281ea1b04c` "Mortal kombat X- Jogo de PS4 original mídia física" (0/1, 1)
- fundir `fdc9f597-0224-4192-8276-22ccf820e034` "MORTAL KOMBAT X - PS4" (0/1, 1)

### G037 ps4 | pes 2016
- **CANÔNICO** `aee8daa0-4e9f-48d3-a123-7c7beada8396` "PES 2016- jogo de PS4 original mídia física" (0/1, 1)
- fundir `e94f69af-ce99-45f9-ab5d-478867d3f7ca` "Pes 2016 Ps4 Midia fisica Portugues Br" (0/1, 1)

### G038 ps4 | pes 2020
- **CANÔNICO** `27e3dd1c-ccb0-40f9-9b56-35509191000c` "Pes 2020 Ps4 Midia fisica Portugues Br" (0/1, 1)
- fundir `a7f7eb67-ca0e-44f2-aa66-02517075c467` "PES 2020- jogo de PS4 original mídia física" (0/1, 1)

### G039 ps4 | red dead redemption 2
- **CANÔNICO** `745bef50-bffd-430b-892e-b3c8bfbec746` "Red Dead Redemption 2 - PS4 - Original" (0/2, 2)
- fundir `26b4e9c7-0bd5-427b-8009-a9a395bb805c` "Red Dead Redemption 2 PS 4 Mídia Física Legendado em Português BR" (0/1, 1)

### G040 ps4 | sims 4
- **CANÔNICO** `9b4d4ff0-24c8-4eff-a6a6-25e375d67435` "Jogo Ps4 - The Sims 4 Mídia Física" (0/2, 1)
- fundir `94d1c80c-22e7-47f5-9c58-17504f74c879` "Jogo The Sims 4 - PS4 Midia Fisica Cd" (0/1, 1)

### G041 ps4 | sombras guerra
- **CANÔNICO** `d12d2de8-fe03-4a83-9702-df7b85ec6935` "SOMBRAS DE GUERRA PS4 envio imediato" (0/2, 2)
- fundir `e12c881e-2dcc-44f9-84a2-a298d05f4e31` "Jogo Sombras De Guerra Playstation 4 PS4 Mídia Fisica" (0/1, 1)

### G042 ps4 | star wars battlefront
- **CANÔNICO** `30df4961-abaf-46d3-acd6-c99119ca8dac` "Star Wars: Battlefront - PS4 - Original" (0/2, 2)
- fundir `a96dfdb3-4844-433c-96ea-ca95aa0fce1a` "Star Wars Battlefront PS 4 Mídia fisica" (0/1, 1)

### G043 ps4 | uncharted 4 thief end
- **CANÔNICO** `e128ec00-2ba9-4ba4-bf48-d87584af7f58` "Uncharted 4: A Thief's end - PS4 - Original" (0/1, 1)
- fundir `9c505210-b56b-4d1b-914e-c8ce2675f45f` "Uncharted 4: A Thief's End | Dublado em Português | PS4 Mídia Física Original BR" (0/1, 1)

### G044 ps4 | wolfenstein 2
- **CANÔNICO** `94b49759-9777-46a2-bd43-475cdc54cd5a` "Wolfenstein 2- Jogo de PS4 original mídia física" (0/1, 1)
- fundir `232fd222-59a0-4323-9fdc-e826a74995aa` "Jogo Wolfenstein 2 Playstation 4 PS4 Mídia fisica" (0/1, 1)

### G045 ps5 | fc 24
- **CANÔNICO** `b2ade1a4-9811-4c06-ac71-5c4716d64ef7` "FC 24- jogo de PS5 original mídia física" (0/1, 1)
- fundir `ec13b70e-8a51-4596-8ca4-65ba154276fa` "Jogo FC 24 Playstation 5 PS5 mídia física" (0/1, 1)

### G046 ps5 | fc 25
- **CANÔNICO** `8ea32491-c3b2-4b96-8348-5aafc6b8776f` "Fc 25 Ps5 Midia fisica Cd Portugues Br" (0/1, 1)
- fundir `9ef38aa0-1c11-4548-ac1b-4c649d44e3f6` "Jogo FC 25 Playstation 5 PS5 Mídia Fisica" (0/1, 1)

### G047 ps5 | final fantasy 16
- **CANÔNICO** `7a82eb19-777f-4f44-a30a-1768ccac5328` "Final Fantasy 16 PS5 midia fisica" (0/3, 3)
- fundir `ccba10c5-ffd6-429c-92b2-d367348af535` "Final Fantasy 16 Ps5 Legendado em português" (0/1, 1)

### G048 ps5 | final fantasy vii
- **CANÔNICO** `50efa4d8-4a1f-4ba3-b0f3-b53032a1b5a3` "Final Fantasy  VII PS5" (0/3, 3)
- fundir `0e6ff90a-4f4f-4671-aef4-19991ac9b79f` "Final Fantasy VII PS5 Mídia física em português" (0/1, 1)

### G049 ps5 | forspoken
- **CANÔNICO** `508cc89b-76bf-4728-9c04-9f2fceb38f6d` "Jogo Forspoken PS5 – Novo Lacrado" (0/1, 1)
- fundir `faa2bdd4-2926-4ec7-b816-74feb8657fdd` "Forspoken- Jogo de PS5 original mídia física" (0/1, 1)

### G050 ps5 | gran turismo 7
- **CANÔNICO** `c43eea01-0bf9-4274-8925-49459b7651e2` "Jogo Gran Turismo 7 - PS5 - Novo - Original" (0/4, 4)
- fundir `0341a83b-383b-4665-b50d-b5deec6abdf8` "Jogo Gran Turismo 7 Edição Standard Playstation 5 Sony" (0/1, 1)

### G051 ps5 | grand theft auto v gta 5
- **CANÔNICO** `62ddb6e1-683b-4d65-89fb-76ae954579ff` "Grand Theft Auto V GTA 5 PS5 Midia Fisica Standard Edition" (0/11, 39)
- fundir `6b85b9cf-5c9b-4824-97c4-e16f4df8d4ce` "Grand Theft Auto V GTA 5 - PS5 LACRADO - Mídia Física Envio Imediato" (0/1, 1)

### G052 ps5 | mortal kombat 1
- **CANÔNICO** `1788e58c-f4dc-4745-8592-36197fe6867c` "Mortal Kombat 1 - PS5 Standard" (3/23, 13287)
- fundir `ae2f9833-f450-4873-a4dc-95bc7ca378c6` "Mortal Kombat 1 - Playstation5" (0/1, 0)

### G053 ps5 | nba 2k22
- **CANÔNICO** `904823d0-5e1d-4600-b8e2-14c8d7bb0645` "JOGO NBA 2K22 PS5 ORIGINAL MIDIA FISICA CD." (0/1, 1)
- fundir `8fa33eb1-8f39-4a57-9e00-273f5216d323` "Jogo NBA 2K22 Playstation 5 PS5 Mídia Fisica" (0/1, 1)

### G054 ps5 | silent hill 2
- **CANÔNICO** `0379cdc3-9761-4e12-a6a3-e68492745d61` "Silent Hill 2 PS5 Standard" (14/60, 25685)
- fundir `6b3d48af-bad2-471b-b4f6-feb2dc6943b0` "Silent Hill 2 Ps5 Mídia Física Novo Lacrado Legendado em Português Playstation 5" (0/1, 1)

### G055 ps5 | skull bones
- **CANÔNICO** `68f828c4-f6b4-4fed-bbab-14977d0281cf` "Skull And Bones Ps5 Lacrado" (0/2, 2)
- fundir `9fc99c5a-a60e-479d-8f8d-66a007680ded` "Skull and Bones - Jogos para PS5" (0/1, 1)

### G056 ps5 | spider man 2
- **CANÔNICO** `26a812cd-33dc-43a3-a157-6792e96453e5` "Spider Man 2 - PS5 - Original" (0/1, 1)
- fundir `5e9b79e9-4434-4830-86d6-72e124ebbf83` "Spider Man 2 PS5 Mídia Física Dublado em Português Envio Imediato" (0/1, 1)

### G057 ps5 | stranger paradise final fantasy origin
- **CANÔNICO** `b0d25c48-c857-4aa2-98e0-a224078168a3` "Stranger Of Paradise Final Fantasy Origin PS5 Midia Fisica" (16/30, 13527)
- fundir `31e0d6fa-0da1-47b6-9e1b-b769876b1265` "Jogo Stranger Of Paradise Final Fantasy Origin PS5 Original Mídia Física Novo Lacrado Pronta Entrega PlayStation 5" (0/1, 1)

### G058 ps5 | wild hearts
- **CANÔNICO** `f521ef45-3f1c-4590-bc11-8e1402d36751` "Jogo PS5 Wild Hearts Mídia Física Novo Lacrado" (0/1, 1)
- fundir `3212ced1-d00b-4ea3-9315-364b5fbbd795` "Wild Hearts PS5  - Midia Fisica - Lacrado - Envio Rapido" (0/1, 1)

### G059 ps5 | wwe 2k26
- **CANÔNICO** `91c6abe2-d738-4a2c-8c2a-2fb52d8546df` "Wwe 2k26 para Playstation 5" (0/1, 1)
- fundir `3d5e1215-91dd-411b-a590-9dce818aa590` "WWE 2K26 PS5 Midia Fisica" (0/1, 1)

### G060 switch_1 | final fantasy ix
- **CANÔNICO** `61c589f8-ea81-4a4b-8ece-9da23cf22a72` "Final Fantasy Ix - Nsw" (6/13, 7545)
- fundir `c21fa101-9a71-4e78-ade0-d0fbdadda7b2` "FINAL FANTASY IX - NSW" (0/1, 0)

### G061 switch_1 | hunting simulator
- **CANÔNICO** `8efe5486-bce4-45c8-946f-841e6b8c1758` "Hunting Simulator Nintendo Switch Mídia Física" (0/1, 2)
- fundir `85babc31-42ac-40f2-9d22-a85f98c45af2` "JOGO HUNTING SIMULATOR NINTENDO SWITCH MIDIA FISICA ENVIO IMEDIATO" (0/1, 1)

### G062 switch_1 | legend zelda echoes wisdom
- **CANÔNICO** `600415a8-f1f6-4d76-a31e-99f04adc98ea` "The Legend Of Zelda Echoes Of Wisdom Switch Midia Fisica" (0/2, 2)
- fundir `e88cf213-f347-43d3-b569-ac05ee77b8f6` "The Legend of Zelda : Jogo Físico Echoes Wisdom Switch" (0/1, 1)

### G063 switch_1 | mario vs donkey kong
- **CANÔNICO** `85da0979-022f-43ea-95da-56693e2426ec` "Mário vs. Donkey Kong Nintendo Switch" (2/14, 26408)
- fundir `b94a297a-ed18-49eb-aecc-03c1a7b7210c` "Jogo Mario Vs Donkey Kong para Nintendo Switch Físico" (1/2, 2)

### G064 switch_1 | minecraft
- **CANÔNICO** `ad95446e-1e45-46a9-86f6-68baecc059e3` "Minecraft Nintendo Switch Midia Fisica" (10/19, 24200)
- fundir `bdce3e1f-e033-4c66-953b-ba280ef8f657` "Minecraft::.. Para Nintendo Switch" (1/2, 128)

### G065 switch_1 | octopath traveler 0
- **CANÔNICO** `1cd0baf7-e6a2-4117-99c5-e39c5d635a68` "Octopath Traveler 0 para Nintendo Switch, Físico" (0/3, 3662)
- fundir `15760e0e-8c2c-4716-b12b-9772602eb10f` "Octopath Traveler 0 - Nintendo Switch" (0/2, 314)

### G066 switch_1 | pikmin 4
- **CANÔNICO** `677f0206-b1a5-4bf8-b2c9-d309ee16eb1a` "Pikmin 4 Nintendo Switch Físico" (0/5, 1183)
- fundir `981b2c7b-3ace-4285-8cac-0d73ebf249b4` "Jogo Pikmin 4 - Nintendo Switch Oficial" (0/3, 661)

### G067 switch_1 | pokemon legends arceus
- **CANÔNICO** `e8297940-a512-4ed0-9a46-013904537107` "Pokemon Legends:arceus Nintendo Switch" (0/4, 51)
- fundir `e097dfc2-c83e-47cf-b13e-8144edab77ec` "Jogo Pokémon Legends Arceus Para Nintendo Switch Mídia Física" (0/1, 1)

### G068 switch_1 | pokemon scarlet
- **CANÔNICO** `aea053fc-ced6-44ae-af9b-ad45ecaf83b2` "Jogo Pokémon Scarlet Nintendo Switch – Lacrado e Novo" (0/5, 5)
- fundir `261965e5-fbed-4b61-a1c3-76645bf86e66` "Jogo Switch Pokémon Scarlet , Nintendo" (0/1, 0)

### G069 switch_1 | super bomberman
- **CANÔNICO** `a6432cc1-daaf-422a-a916-d1f9def3c0c3` "Super Bomberman R Standard Edition Nintendo Switch (Físico)" (3/8, 722)
- fundir `8176dbce-8405-424f-9807-9ee795afd2eb` "Jogo Super Bomberman R para Nintendo Switch Físico" (1/2, 3)

### G070 switch_1 | super mario maker 2
- **CANÔNICO** `93bb4707-0c9b-4648-9423-e9764ba9d3b1` "Super Mario Maker 2 Nintendo Switch Físico Lacrado" (0/4, 4)
- fundir `4750ea11-07dc-42a2-b22b-72d144888ce2` "Super Mario Maker 2 Nintendo Switch - Mídia fisica 100% original" (0/1, 1)

### G071 switch_1 | super mario odyssey
- **CANÔNICO** `2cfde1c0-f7bd-4deb-b8f9-24bd79981a78` "Super Mario Odyssey Nintendo Switch Lacrado Midia Fisica" (0/7, 7)
- fundir `996175de-33ce-45ae-9542-d9454faee360` "Super Mario Odyssey Nintendo Switch - Mídia fisica 100% original" (0/1, 1)

### G072 switch_1 | super mario party
- **CANÔNICO** `1f7f908d-0acd-4b5f-8e6e-984895b6f53a` "Jogo Nintendo Switch Super Mario Party" (0/4, 4)
- fundir `88c22027-cf96-4285-9554-49b7ee2ec53a` "Super Mario Party Nintendo Switch - Mídia fisica 100% original" (0/2, 2)

### G073 switch_1 | super mario party jamboree
- **CANÔNICO** `9a018e6e-7422-4622-b18e-ddd713f2fe7a` "Jogo Super Mario Party Jamboree Nintendo Switch" (0/10, 13)
- fundir `c01dff29-9e5a-4bf9-9bb2-f176e9ce5788` "Super Mario Party Jamboree - Nintendo Switch Mídia Física Envio Imediato" (0/1, 1)

### G074 switch_1 | super mario rpg
- **CANÔNICO** `e2b53a55-e03c-4442-8873-402c625fd43d` "Super Mario RPG Nintendo Switch" (13/36, 20906)
- fundir `203a82e3-908d-468e-b1a1-0a9ca7afcdce` "Super Mario RPG Nintendo Switch - Mídia fisica 100% original" (0/1, 1)

### G075 switch_1 | super mario wonder
- **CANÔNICO** `94ddc43a-6d9e-4fb8-8db2-790c09ceec3e` "Super Mario wonder nintendo switch" (0/2, 2)
- fundir `b175e71f-2e7e-4c48-88f6-556e5234c7e0` "Super Mario Wonder Nintendo Switch Pronta Entrega" (0/1, 1)

### G076 switch_1 | pokemon violet [japao]
- **CANÔNICO** `d2f2eb8f-dc97-4dda-85ab-595b070523c3` "Jogo Nintendo Switch Pokémon Violet Japan" (0/1, 0)
- fundir `85fa237f-51e2-44ed-8849-ee24fcab6426` "Jogo Nintendo Switch Pokemon Violet Japão" (0/1, 0)

### G077 switch_1 | final fantasy vii final fantasy viii twin [remastered]
- **CANÔNICO** `7a0d2633-2fd5-4268-be00-d8c9d3816a75` "Final Fantasy Vii & Final Fantasy Viii Remastered Twin - Nsw" (5/8, 16494)
- fundir `f072ad83-78f3-44d5-807f-f787d31f243b` "FINAL FANTASY VII & FINAL FANTASY VIII REMASTERED TWIN - NSW" (0/1, 0)

### G078 switch_1 | metroid prime [remastered]
- **CANÔNICO** `502b7655-ab02-4fcf-88a5-5f6f1ed44889` "Metroid Prime Remastered - Nintendo Switch" (0/2, 0)
- fundir `5bf93b07-fada-4f8c-9d21-53d8891d0f9d` "Metroid Prime Remasterizado para Nintendo Switch" (0/1, 0)

### G079 switch_2 | elden ring tarnished
- **CANÔNICO** `10e0363d-9958-4dc5-85c1-460439b81c88` "Elden Ring: Tarnished Edition - NS2" (0/1, 0)
- fundir `d8cc2970-07cc-40e1-bc3d-b426ef2576f0` "Elden Ring: Tarnished Edition - NS2" (0/1, 0)
- nota: canônico tem plataforma 'unknown' no cadastro; fusão ajustaria para switch_2

### G080 switch_2 | metroid prime 4 beyond
- **CANÔNICO** `49564a65-a1e3-48a1-9d84-694ed05d000b` "Metroid Prime 4 Beyond - Nintendo Switch 2" (11/28, 11542)
- fundir `0d70bd95-dcd9-4008-afb7-e913e01e3e85` "Metroid Prime 4: Beyond Nintendo Switch 2 Edition NS2" (0/1, 0)

### G081 xbox_one | halo wars 2
- **CANÔNICO** `e22e7407-6788-4652-8e9c-d0687498ffc3` "Halo Wars 2 - Xbox One - Mídia Física" (13/20, 52)
- fundir `5c7036ce-b3e1-46a5-9e20-108880e1fce7` "Halo Wars 2 - Edição Padrão - Xbox One" (0/1, 0)

### G082 xbox_series | elden ring
- **CANÔNICO** `d8e41d3c-8940-47af-aae3-91e46938d642` "Elden Ring - Xbox Series X Standard" (0/2, 0)
- fundir `0caff5d7-2b2f-4305-82b1-9c5f6fa8bb7c` "Elden Ring - Xbox Série X" (0/1, 0)

### G083 xbox_series | fifa 23
- **CANÔNICO** `bf0be9f0-4e50-48d5-87e8-01ff7f8a9e53` "FIFA 23 – Xbox Series X (Original)" (0/1, 1)
- fundir `3da1dc50-f023-4080-8423-acd22f03326c` "JOGO FIFA 23 XBOX SERIES X CD MIDIA FISICA." (0/1, 1)

### G084 xbox_series | forza horizon 6
- **CANÔNICO** `beecf929-7e87-49b6-ba3d-60451ae7ef74` "Forza Horizon 6 Xbox Midia Fisica" (5/8, 4712)
- fundir `b194ffec-938a-4b44-bd8f-3e13dc39a3b8` "Forza Horizon 6:.. Xbox Série X" (0/1, 0)

### G085 xbox_series | gotham knights
- **CANÔNICO** `782ded36-51c0-4a93-9230-b63f4c889e14` "Jogo Gotham Knights - Xbox Series X  - Lacrado" (0/2, 2)
- fundir `b53eff59-1e44-4676-a304-16eaee36ec90` "Gotham Knights Original Lacrado Xbox Séries X" (0/1, 1)

### G086 xbox_series | mortal kombat 1
- **CANÔNICO** `b474e496-a6e8-4cf8-94ba-ead16f71242c` "Mortal Kombat 1 Xbox Series X Mídia Física Pronta Entrega" (0/1, 1)
- fundir `45971885-deca-42d0-9544-49096d73c0cb` "Jogo Mortal Kombat 1 Xbox Series X Físico Lacrado" (0/1, 1)

### G087 xbox_series | nba 2k21
- **CANÔNICO** `3ae8a8d9-e5b3-4b0d-abaa-6cd271587881` "NBA 2k21- XBOX SERIES X - Original" (0/4, 4)
- fundir `09581bbb-0dda-40d3-9b81-535776f6d457` "Nba 2k21 Xbox Series X Mídia Física Pronta Entrega" (0/1, 1)

### G088 xbox_series | wwe 2k22
- **CANÔNICO** `3c2635cc-87f6-420e-96a8-6f8df344f442` "Wwe 2k22 Xbox Series X Mídia Física Novo Lacrado" (0/1, 1)
- fundir `f912bab1-0e1f-4cd2-919a-14e2780270c7` "Wwe 2k22 Xbox Series X Mídia Física Novo Pronta Entrega" (0/1, 1)

## Casos para revisão manual (não serão fundidos automaticamente)

### R001 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c01dff29-9e5a-4bf9-9bb2-f176e9ce5788` [game/switch_1] "Super Mario Party Jamboree - Nintendo Switch Mídia Física Envio Imediato" (0/1, 1)
- `88c22027-cf96-4285-9554-49b7ee2ec53a` [game/switch_1] "Super Mario Party Nintendo Switch - Mídia fisica 100% original" (0/2, 2)
- `1f7f908d-0acd-4b5f-8e6e-984895b6f53a` [game/switch_1] "Jogo Nintendo Switch Super Mario Party" (0/4, 4)
- `9a018e6e-7422-4622-b18e-ddd713f2fe7a` [game/switch_1] "Jogo Super Mario Party Jamboree Nintendo Switch" (0/10, 13)

### R002 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2b93d982-c77f-4ff4-ae7d-ed9b5bc5cb46` [game/switch_1] "Super Mario Bros .U Deluxe - Nintendo Switch Envio Imediato" (1/1, 1)
- `b7376b02-b667-4a3c-8e41-2bcfa52e07ec` [game/switch_1] "New Super Mario Bros U Deluxe Nintendo Switch Mídia Fisico" (0/5, 5)

### R003 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `41cb1265-a6e0-4b11-9bbd-1329918c3c56` [game/ps5] "EA FC 25 - PS5 - Original" (0/1, 1)
- `01df50fa-17da-407f-9dda-eab44101f4ec` [game/ps5] "Jogo EA SPORTS FC 25 Standard Edition Playstation 5 Mídia Fí" (0/1, 1)
- `59c28c63-e9c4-4d1d-a3c5-58c26ebc5ede` [game/ps5] "EA SPORTS FC25 PS5 Midia Fisica" (0/1, 1)
- `a17d8c00-147c-4db4-b7d4-c69b28db2c91` [game/ps5] "EA SPORTS FC 25 PS5 Mídia Física Lacrado Nacional Português BR Pronta Entrega" (0/1, 1)

### R004 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `4d0738a7-a4f1-4784-88fb-cdd1043e394a` [game/switch_1] "Jogo para Nintendo switch Lego Movie 2 lacrado" (0/1, 1)
- `0e5fef37-1929-4d33-acc4-d0ae476023fb` [game/switch_1] "Lego Movie 2 Nintendo Switch Videogame de Física" (0/1, 60)

### R005 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `00f962b7-6de4-4629-a70b-8910e8e06ea0` [game/switch_2] "Câmera Hori Piranha Plant Para Nintendo Switch 2" (0/1, 1)
- `d48dd994-d9c9-4d2b-ad87-7ed756241c42` [game/switch_2] "Câmera Piranha Plant - Nintendo Switch 2" (2/5, 3775)

### R006 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `015dfbac-b2ab-4a52-bbec-7f930618b473` [game/ps5] "Final Fantasy Vll Rebirth - PS5 Midia Fisica" (0/1, 1)
- `39692dc3-f238-4584-ba4d-8a08134d1c04` [game/ps5] "Final Fantasy Vll Ps5 Original mídia física" (0/1, 1)

### R007 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c936da45-78a3-4f2f-abc6-4be69dfe0b7a` [game/ps5] "Resident Evil 4 2023 Ps5 P S N NÃO É CD" (0/1, 1)
- `6f7a5843-f3d4-4b51-bc3a-39fffb8a6a3d` [game/ps5] "Resident Evil 4 2023 PS5 Midia Fisica" (0/5, 5)

### R008 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `03094b6d-31e8-41d3-9aeb-45b0e8dd4515` [game/ps5] "God Of War Ragnarok - Midia Física Ps5" (0/9, 35)
- `bf7dbfeb-48e0-42f8-8060-9f144edfde7b` [game/ps5] "Kratos God Of War Ragnarök Playstation Ps5 100%" (0/1, 3)
- `d5e75a7a-39a5-42c2-a102-54f6abfb38d5` [game/ps5] "Jogo PS5 Playstation God Of War Ragnarok Ss" (6/22, 2178)

### R009 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0341a83b-383b-4665-b50d-b5deec6abdf8` [game/ps5] "Jogo Gran Turismo 7 Edição Standard Playstation 5 Sony" (0/1, 1)
- `34cf695e-a3bd-48e2-af4e-4c549168a40e` [game/ps5] "Gran Turismo 7 (Legendas em Português) - Ps5" (0/1, 1)
- `c43eea01-0bf9-4274-8925-49459b7651e2` [game/ps5] "Jogo Gran Turismo 7 - PS5 - Novo - Original" (0/4, 4)

### R010 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `03646602-4d0e-4d60-a0dc-549f86436a45` [game/switch_1] "Super Mario 3D All Stars - Nintendo Switch (com detalhe)" (0/1, 1)
- `f4e42fe7-d3a6-40ad-9662-87da5f948ebe` [game/switch_1] "Super Mario 3d All Stars Nintendo Switch" (4/20, 1076)

### R011 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `087e39ad-16db-4bfe-a4e7-0de0d74cb380` [game/switch_1] "Castlevania Belmonts Curse Switch Midia Fisica" (0/1, 2)
- `e7705825-b5f8-4667-bf94-577e3d9dacb1` [game/switch_1] "Castlevania Belmonts Curse Midnight Edition Switch" (0/2, 0)

### R012 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0a5ea80f-cdaa-42a7-be24-9f3e6563211b` [game/switch_1] "Zelda Breath Wild Explorers Nintendo Switch Original Fisica" (0/1, 1)
- `3ff650a6-ab63-4eaf-8d95-cf63da1dcee6` [game/switch_1] "Zelda Breath Of The Wild Nintendo Switch" (0/1, 1)
- `7929b6eb-f4a7-4f36-ae69-076b516a22e5` [game/switch_1] "The Legend of Zelda Breath of The Wild Switch Midia Fisica" (0/7, 7)
- `82ccba58-e5d8-480c-a7be-1212cba07174` [game/switch_1] "Jogo Nintendo Switch Zelda Breath of the Wild Lacrado + Garantia + NF" (0/1, 1)

### R013 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0a6a2cf7-1bbe-443d-bd01-4de491543399` [game/ps4] "Gran Turismo Sport - PS4 Mídia física Português Br" (0/3, 3)
- `86e72df6-3873-4fd6-aacc-6c19caf5d048` [game/ps4] "Jogo Ps4 Gran Turismo Sport Hite" (2/3, 8)

### R014 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0cdd48bd-c7c6-44c5-9b39-3baedf0f9750` [game/ps5] "Resident Evil 2 Remake PS5 Mídia Física Novo Nacional Legendado" (0/2, 2)
- `54fce95d-c3f5-4a41-a5a3-7256d7ef228b` [game/ps5] "Resident Evil 2 Remake PS5 | Mídia Física Original | Edição Nativa PlayStation 5 | Novo e Lacrado | Pronta Entrega" (0/1, 1)

### R015 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0e075f34-8706-4143-a9fe-3379f1f688d3` [game/switch_1] "The Legend of Zelda: Skyward Sword-Switch" (0/4, 3)
- `20db4d04-8811-4014-b3f4-d17861f7fdd0` [game/switch_1] "The Legend of Zelda: Skyward Sword HD para Nintendo Switch - Mídia Física" (0/2, 2)
- `399d1f99-31e3-4a71-9389-b6415f77e05a` [game/switch_1] "Jogo Zelda Skyward Sword Hd Nintendo Switch Físico Nacional" (0/1, 0)
- `7aa5c485-3760-4d85-a60c-8617b89489e0` [game/switch_1] "A Lenda de Zelda: Skyward Sword HD - Nintendo Switch" (0/1, 2)
- `cb2a6c98-c902-4593-8ccf-7d0268249141` [game/switch_1] "Zelda Skyward Sword Nintendo Switch Lacrado" (0/1, 1)

### R016 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `0e6ff90a-4f4f-4671-aef4-19991ac9b79f` [game/ps5] "Final Fantasy VII PS5 Mídia física em português" (0/1, 1)
- `17be542b-d13c-4d98-a7d4-759eba5323e2` [game/ps5] "Final Fantasy VII Rebirth PS5 Standard" (12/34, 23083)
- `50efa4d8-4a1f-4ba3-b0f3-b53032a1b5a3` [game/ps5] "Final Fantasy  VII PS5" (0/3, 3)
- `56011133-51ef-4c3f-96fc-69b372852fea` [game/ps5] "Final Fantasy VII Intergrade PS5 Midia Fisica" (0/2, 2)

### R017 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `14ce4c73-d07a-4f54-93d8-0c810de4b2b2` [game/switch_1] "JOGO SUPER MARIO BROS RPG NINTENDO SWITCH" (0/1, 1)
- `203a82e3-908d-468e-b1a1-0a9ca7afcdce` [game/switch_1] "Super Mario RPG Nintendo Switch - Mídia fisica 100% original" (0/1, 1)
- `87c81a50-f044-47b5-a8ff-859590a40aec` [game/switch_1] "JOGO SUPER MARIO RPG NINTENDO SWITCH PARCELADO" (0/1, 1)
- `e2b53a55-e03c-4442-8873-402c625fd43d` [game/switch_1] "Super Mario RPG Nintendo Switch" (13/36, 20906)

### R018 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `167fc459-a9b4-4c35-b46a-75fea9b13987` [game/ps4] "Dragon ball xenoverse ps4 envio de imediato" (0/1, 1)
- `f9fb602e-37e7-4458-88ca-83e32ed2627b` [game/ps4] "Dragon Ball Xenoverse XV - PS4 Mídia Física" (0/1, 1)

### R019 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1694e639-40b5-4cd9-bc53-f32d10c4d64c` [game/ps5] "Resident Evil Requiem Ps5 Mídia Física Nacional" (0/1, 1)
- `77c25d19-374f-405b-b8e6-f6c893f3adde` [game/ps5] "Resident Evil Requiem - PlayStation 5 Mídia Física Lançamento" (0/1, 1)
- `7b1d6044-a3d2-47eb-8336-edb7102ff93a` [game/ps5] "Resident Evil Requiem Ps5 Original Pt Br Física Lacrado" (0/1, 1)
- `8197b0af-727d-41ad-b41f-45c159feb560` [game/ps5] "Resident Evil Requiem - Ps5" (16/90, 17828)
- `de18eb18-13b0-4952-963d-7a09c481fac7` [game/ps5] "Resident Evil Requiem PS5 Versão Japonesa Mídia Física Novo" (0/1, 1)
- `f1402ff6-73a8-42b4-9ba7-c23a63df403a` [game/ps5] "Réquiem de Resident Evil para PS5" (0/1, 0)

### R020 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1788e58c-f4dc-4745-8592-36197fe6867c` [game/ps5] "Mortal Kombat 1 - PS5 Standard" (3/23, 13287)
- `6a34d527-aee6-42dd-8f1a-f767c2ba32eb` [game/ps5] "Mortal Kombat 1 - PS5 Estándar" (0/1, 0)
- `ae2f9833-f450-4873-a4dc-95bc7ca378c6` [game/ps5] "Mortal Kombat 1 - Playstation5" (0/1, 0)

### R021 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `17fd97e2-15b9-4f4f-bfcb-463275dd21a9` [game/switch_2] "Mario Kart World Nintendo Switch 2 Nacional - Mídia Física - Lacrado" (0/1, 1)
- `241b0817-70af-4a6a-a4e8-c9086f4eeb30` [game/switch_2] "Jogo Mario Kart World - Nintendo Switch 2" (0/4, 4)
- `7ac4d8d5-65cd-4a19-9e39-4f288a3386e7` [game/unknown] "Mario Kart World (Switch 2)" (1/1, 2)
- `e1a57932-da1b-40e7-af6f-08f65f60508a` [game/switch_2] "Jogo de Corrida Mário Kart World Para Nintendo Switch 2" (0/2, 2)

### R022 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1893c42a-a74f-4c78-87f3-88e237f67e06` [game/ps5] "Resident Evil 4 Remake (Áudio em Português) - Ps5" (0/2, 2)
- `18a79705-c5aa-4da2-9009-1ae27f23b519` [game/ps5] "Jogo Resident Evil 4 Remake PS5 Game Midia Fisica Novo Lacrado Dublado Br" (0/1, 1)
- `199f374d-50bd-402a-bc42-b6459e57d787` [game/ps5] "Resident Evil 4 Remake - PS5 Mídia Física Envio Imediato" (0/1, 1)
- `d0121ffe-6176-4aa1-b1f7-30977478ceb7` [game/ps5] "Jogo Resident Evil 4 Remake Midia Fisica Lacrado para PS5" (0/1, 1)
- `da2c6a94-e1d1-4de1-a296-2709cd8ab5af` [game/ps5] "RESIDENT EVIL 4 REMAKE PS5 ORIGINAL MÍDIA FÍSICA NOVO (DESLACRADO)" (0/1, 1)

### R023 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `18b97f9a-e764-4030-8022-1d7772f535cf` [game/switch_1] "Super Mario Party Jamboree Nintendo Switch (Digital)" (1/1, 1)
- `43f8e55b-b7b9-4cb0-8157-a0953a0fe6c8` [game/switch_1] "Super Mario Party Nintendo Switch (Digital)" (1/2, 2)

### R024 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `1e30fa33-458d-482a-8607-a8ce5a86a9a0` [game/switch_1] "Mario & Luigi Brothership Nintendo Switch (AMERICANO) - Mídia Física - Lacrado" (0/1, 1)
- `4ccec7b6-6e3f-438d-b826-05048281f193` [game/switch_1] "Mario & Luigi: Brothership - Nintendo Switch - Original" (0/6, 6)
- `83b63d44-160b-4893-85fc-f48212d01375` [game/switch_1] "Jogo Mario &amp; Luigi Brothership - Nintendo Switch" (0/1, 1)
- `d19ef93e-00a2-4d9b-a552-cb75042ef511` [game/switch_1] "Jogo Nintendo Switch Mario & Luigi Brothership Nt000002Nsw" (0/1, 1)
- `dc3d8589-3901-4b7c-9356-22c83807af8f` [game/switch_1] "Mario & Luigi Brothership Nintendo Switch Novo Versão Japonesa" (0/2, 2)

### R025 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `26a812cd-33dc-43a3-a157-6792e96453e5` [game/ps5] "Spider Man 2 - PS5 - Original" (0/1, 1)
- `5e9b79e9-4434-4830-86d6-72e124ebbf83` [game/ps5] "Spider Man 2 PS5 Mídia Física Dublado em Português Envio Imediato" (0/1, 1)
- `fa3d6d35-a800-4304-b68d-89d43b777163` [game/ps5] "Marvel Spider-man 2 (MÍDIA FÍSICA) - Jogo Novo Original e Lacrado - PS5" (0/2, 2)

### R026 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `27505f8c-bb31-4cc7-aa79-a127de2eb6d5` [game/switch_2] "Super Mario Party Jamboree Nintendo Switch 2 Edition + Jamboree TV Versao Japonesa" (0/1, 1)
- `ca0be201-a84a-494d-b5b4-e380f745dbe7` [game/switch_2] "Super Mario Party Jamboree Nintendo Switch 2 Edition + Jamboree TV -Switch2 - Variação P" (0/2, 2)

### R027 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `27703773-0d4f-4bb3-b82e-62fdfb2b1127` [game/ps5] "Dying Light 2 Stay Human PS5 Midia Fisica" (0/1, 1)
- `a216cf62-bc8d-4b7f-8f22-7a890b80638a` [game/ps5] "Jogo PS5 Dying Light 2 Stay Human Físico Ação RPG PlayStation 5" (0/1, 0)

### R028 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2939ed63-3812-4431-afd4-234a3e03d1b8` [game/switch_1] "[Nintendo Licensed Product] Hori Classic Controller for Nintendo Switch - Zelda [Compatible with Nintendo Switch]" (0/2, 2)
- `b9853aa7-62a9-44ca-b8e1-05493230aebf` [game/switch_1] "HORI Classic Controller for Nintendo Switch - Zelda (Compatible with Nintendo Switch)" (0/1, 1)

### R029 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2cc2ce85-7801-45a3-906d-615b668e4669` [game/switch_1] "Caixa Super Mario Jogos Nintendo Switch Porta Jogos Com Imã" (0/2, 2)
- `81d31bc4-743e-4513-a3e6-4c2500152927` [game/switch_1] "Caixa Super Mario para Armazenar Jogos de Nintendo Switch Porta Jogos" (0/1, 1)
- `8e91b8ab-379a-45fa-bef6-0e57ce2bd938` [game/switch_1] "Porta jogo nintendo switch caixa super mario" (0/1, 1)

### R030 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `2df539ed-ca0b-44c3-bb4b-9c521c6b52b8` [game/ps5] "Lost soul aside- Jogo de PS5 original mídia física" (0/1, 1)
- `ac9b31e7-b947-4a3e-b814-db1127e9aed1` [game/ps5] "Jogo Lost Soul Aside Standard Edition Playstation 5 Midia Fí" (0/1, 1)

### R031 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `30df4961-abaf-46d3-acd6-c99119ca8dac` [game/ps4] "Star Wars: Battlefront - PS4 - Original" (0/2, 2)
- `a96dfdb3-4844-433c-96ea-ca95aa0fce1a` [game/unknown] "Star Wars Battlefront PS 4 Mídia fisica" (0/1, 1)
- `d9f5c8ac-9b71-4ae2-9ef1-3dce14c3bfaf` [game/ps4] "Star Wars Battlefront II – PS4 (Original)" (0/1, 1)

### R032 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `30f74441-c302-404c-b00a-a5c0b0d964f2` [game/ps4] "Grand Theft Auto V – PS4 (Original)" (0/1, 1)
- `7cd3d1dd-9c92-4273-887a-1298784b95d1` [game/ps4] "Grand Theft Auto V - Ps4 - Com mapa" (0/1, 1)

### R033 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `3143a7da-1ce2-45d9-8213-a5ed25b3e7b2` [game/switch_1] "Jogo Nintendo Switch Mario Kart 8" (0/1, 1)
- `888c5762-1027-4fcf-afbd-d200063c2f40` [game/switch_1] "Caixa Nintendo Switch Edição Mario Kart 8" (0/1, 1)
- `cd4d007b-c465-4004-9471-592c411d440b` [game/switch_1] "Mario Kart Delux 8 Nintendo Switch" (0/1, 1)

### R034 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `33026237-66f9-4b41-87f2-c4be677c6243` [game/switch_1] "Pokémon Shining Pearl Nintendo Switch Euro" (0/1, 0)
- `b2d34150-69da-47d3-9158-90f68d9d634c` [game/switch_1] "Pokemon Shining Pearl - Nintendo Switch" (3/20, 9211)

### R035 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `33cdf3e2-af1a-48c2-b40a-1b9dc0b1e68f` [game/switch_1] "Team Sonic Racing (mídia Física) - Nintendo Switch ()" (0/1, 2)
- `db001c3a-1cf2-4b58-a42a-394fa6ca7bd2` [game/switch_1] "Team Sonic Racing Nintendo Switch Euro" (1/1, 3755)

### R036 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `38870da7-2ed1-4cfc-a031-209aa157ee7b` [game/ps5] "Resident Evil 4 Golden Edition - PS5" (0/2, 1)
- `9e046e45-a2b6-455d-9f25-fe85716aa365` [game/ps5] "Jogo Resident Evil 4 - PS5 Mídia Física Original - Playstation 5 Envio Rápido" (0/1, 1)

### R037 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `398c4a14-b257-4a6e-ba01-87317be28f21` [game/switch_1] "Porta Jogos de Nintendo Switch - Cubo Charada do Mario" (0/1, 1)
- `d5ff4517-2720-464c-ab0e-78f0b70bb736` [game/switch_1] "Porta jogos nintendo switch cubo mário" (0/3, 3)

### R038 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `39dd9819-b640-43d4-8a64-ba7cf3ac8aee` [game/xbox_series] "Lacrado Marvel's Midnight Suns - Xbox Series X" (0/1, 1)
- `e12a6de4-101a-497f-81f3-5b3e143b3b71` [game/xbox_series] "Jogo Xbox Series X Marvel Midnight Suns Enhanced Edition" (0/1, 1)

### R039 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `408a1189-5925-4622-a5de-51ef64bcd97e` [game/ps5] "Street Fighter 6 para PS5" (0/1, 0)
- `7b41c25e-90c9-441a-86ae-91c87084096c` [game/ps5] "Street Fighter 6 Ps5 Midia Fisica" (26/33, 4441)
- `c697d492-8952-4a98-993b-de930f364b7c` [game/ps5] "Jogo Street Fighter 6 - Ps5 em mídia fisica" (0/1, 1)
- `d4e6075b-8bb9-4d08-ad28-cb52bb7ac38b` [game/ps5] "Street Fighter 6 PS5 Estándar" (0/1, 0)
- `ea2cd97b-2c34-4118-8229-10d7d76fa1de` [game/ps5] "Street Fighter 6 Edição Lenticular Ps5" (0/1, 0)

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
- `600415a8-f1f6-4d76-a31e-99f04adc98ea` [game/switch_1] "The Legend Of Zelda Echoes Of Wisdom Switch Midia Fisica" (0/2, 2)
- `b6f7f401-b54e-4025-8453-0d5fc3e44906` [game/switch_1] "LACRADO ZELDA ECHOES OF WISDOM PARCELADO NINTENDO SWITCH" (0/1, 1)
- `c42169fb-522b-46c4-a79d-eb1215deb9ea` [game/switch_1] "LACRADO COM NOTA ZELDA ECHOES OF WISDOM NINTENDO SWITCH" (0/1, 1)
- `e88cf213-f347-43d3-b569-ac05ee77b8f6` [game/switch_1] "The Legend of Zelda : Jogo Físico Echoes Wisdom Switch" (0/1, 1)

### R045 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `62ddb6e1-683b-4d65-89fb-76ae954579ff` [game/ps5] "Grand Theft Auto V GTA 5 PS5 Midia Fisica Standard Edition" (0/11, 39)
- `6b85b9cf-5c9b-4824-97c4-e16f4df8d4ce` [game/ps5] "Grand Theft Auto V GTA 5 - PS5 LACRADO - Mídia Física Envio Imediato" (0/1, 1)
- `8f265fdf-ee04-4110-b7cb-0187d5a44268` [game/ps5] "GTA 5 Grand Theft Auto V | Legendado em Português | PS5 Mídia Física Original US" (0/1, 1)
- `c2df4777-d2c7-4de2-9c68-d6335f56a5ed` [game/ps5] "Jogo Gta 5 Ps5 - Grand Theft Auto V Ps5 Mídia Física" (51/104, 193651)
- `f28a3712-1fe1-4255-b2da-48fc34670155` [game/ps5] "Playstation PS5 GTA 5 Grand theft auto NEW" (0/1, 1)

### R046 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `65cc8f42-6110-4015-8cdc-8348043bfa8d` [game/switch_1] "Super Mario Bros. Wonder Nintendo Switch (físico)" (26/70, 154466)
- `94ddc43a-6d9e-4fb8-8db2-790c09ceec3e` [game/switch_1] "Super Mario wonder nintendo switch" (0/2, 2)
- `b175e71f-2e7e-4c48-88f6-556e5234c7e0` [game/switch_1] "Super Mario Wonder Nintendo Switch Pronta Entrega" (0/1, 1)

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
- `7a82eb19-777f-4f44-a30a-1768ccac5328` [game/ps5] "Final Fantasy 16 PS5 midia fisica" (0/3, 3)
- `ccba10c5-ffd6-429c-92b2-d367348af535` [game/ps5] "Final Fantasy 16 Ps5 Legendado em português" (0/1, 1)
- `d7214dbc-1538-4ac2-b64e-8395e3d418d5` [game/ps5] "Jogo PS5 - Final Fantasy 16/XVI" (0/1, 1)

### R050 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `7c02001e-ea82-4fcb-9253-3911c08a4d02` [game/switch_1] "Nintendo Switch Pro Controller Original Novo (Leia descrição) Lacrado Zelda Tears Of The kingdom" (0/1, 1)
- `ea8fd609-aa33-40b5-bc6b-e841338cda77` [game/switch_1] "Nintendo Switch Pro Controller Zelda: Tears of the Kingdom" (0/1, 1)
- `ef097300-eeec-441a-9962-cdc564bfb651` [game/switch_1] "Nintendo Switch Pro Controller The Legend of Zelda: Tears of the Kingdom Edition Tecido" (0/1, 1)

### R051 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `8d95b328-48fe-42ef-8135-8258cd1e0a2f` [game/switch_1] "NINTENDO SWITCH EDIÇÃO LETS GO EEVEE" (0/1, 1)
- `e6fb9117-fd19-47a2-98f4-a76fc183aa2a` [game/switch_1] "Pokemon Lets Go Eevee Nintendo Switch" (1/1, 2)

### R052 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `8f87346f-7a62-4289-8f26-290fef326cea` [game/switch_1] "Mortal Kombat 1 - Nintendo Switch" (2/3, 166)
- `9ab82216-5793-4a16-a56b-e87c0afabf83` [game/unknown] "Mortal Kombat 1 - NSW Estándar" (0/1, 0)

### R053 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c895701d-f41c-466d-aac8-d370574ecebf` [game/xbox_series] "Tekken 8 - Launch Edition Xbox Series X Físico Launch Edition" (0/1, 0)
- `f0d49f2c-548d-422a-809d-1a49e47865bb` [game/xbox_series] "Tekken 8 Launch Edition para Xbox Series X em Mídia Física" (0/1, 0)

### R054 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `c95643e7-a4ef-415f-857a-73c22057974c` [game/xbox_one] "Jogo Forza Motorsport 5 Microsoft Xbox One" (3/6, 13)
- `edc9ccad-f4f8-410a-9ee8-89826e2c33ed` [game/xbox_one] "Game Xbox One Forza Motorsport 5 - Vitrine" (0/1, 0)

### R055 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `d71baafd-de93-450d-af84-0e3d75607d48` [game/ps4] "Lego Marvel Super Heroes 2 - Ps4 Midia fisica Cd" (0/2, 2)
- `dedc78db-24d2-4718-a91c-25cfeca3d2bc` [game/ps4] "Jogo Lego Super Heroes 2 Playstation 4 PS4 Mídia fisica" (0/1, 1)

### R056 near_duplicate
_Jaccard do núcleo >= 0.7 (não idêntico), mesma plataforma/formato/edição_
- `dbc44fbc-efb5-45d5-8af2-9fb6c0db07c6` [game/ps5] "Horizon Forbidden West - PS5 Mídia Física Lacrado" (0/1, 1)
- `df5c0589-fb25-4f4d-9781-41d8ae0a526f` [game/ps5] "Horizon: Forbidden West (Áudio em Português) - Ps5" (0/1, 1)

### R057 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `1d76a608-c8c5-427e-aef5-800e5169e461` [game/unknown] "Final Fantasy VII Rebirth" (0/1, 0)
- `17be542b-d13c-4d98-a7d4-759eba5323e2` [game/ps5] "Final Fantasy VII Rebirth PS5 Standard" (12/34, 23083)

### R058 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4767b067-f4d6-41b3-97e6-643975be65ed` [game/unknown] "Mortal Kombat 1" (0/14, 0)
- `1788e58c-f4dc-4745-8592-36197fe6867c` [game/ps5] "Mortal Kombat 1 - PS5 Standard" (3/23, 13287)
- `45971885-deca-42d0-9544-49096d73c0cb` [game/xbox_series] "Jogo Mortal Kombat 1 Xbox Series X Físico Lacrado" (0/1, 1)
- `8f87346f-7a62-4289-8f26-290fef326cea` [game/switch_1] "Mortal Kombat 1 - Nintendo Switch" (2/3, 166)
- `ae2f9833-f450-4873-a4dc-95bc7ca378c6` [game/ps5] "Mortal Kombat 1 - Playstation5" (0/1, 0)
- `b474e496-a6e8-4cf8-94ba-ead16f71242c` [game/xbox_series] "Mortal Kombat 1 Xbox Series X Mídia Física Pronta Entrega" (0/1, 1)

### R059 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `5d9f97f6-ffb7-444f-a18b-8adb9983f55c` [game/unknown] "Street Fighter 6 Estándar" (0/1, 0)
- `d4e6075b-8bb9-4d08-ad28-cb52bb7ac38b` [game/ps5] "Street Fighter 6 PS5 Estándar" (0/1, 0)

### R060 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `c4ec7503-4de4-4efe-8ed8-1e37ee30ced9` [game/unknown] "Mortal Kombat 1 Estándar" (0/1, 0)
- `6a34d527-aee6-42dd-8f1a-f767c2ba32eb` [game/ps5] "Mortal Kombat 1 - PS5 Estándar" (0/1, 0)
- `9ab82216-5793-4a16-a56b-e87c0afabf83` [game/unknown] "Mortal Kombat 1 - NSW Estándar" (0/1, 0)

### R061 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `02545ef4-71cf-4944-af9a-5c20201f2b22` [game/unknown] "Elden Ring - Padrão México" (0/1, 0)
- `c18e1014-0155-4118-9b57-1ae08120895e` [game/unknown] "Elden Ring - Edição Standard México" (0/1, 0)

### R062 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `040b032e-9087-4d01-87fc-fedbb87aaee6` [game/unknown] "Cyberpunk 2077 Edição Steelbook" (0/1, 0)
- `04a1de1a-9f50-4b4d-bc44-875359eb446f` [game/xbox_one] "Cyberpunk 2077 Steelbook Edition Xbox One" (0/1, 2)

### R063 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `07c06d49-2d4c-4db0-ba45-f8daf93467ed` [game/unknown] "Gta 5" (1/2, 4)
- `10072eb7-4e1f-42c0-9374-14aa36d0c5df` [game/ps4] "Gta 5" (5/7, 12)
- `79129151-a497-48d2-8a2d-f05df62e2750` [game/ps5] "GTA 5 PS5 Mídia Física envio Imediato" (0/1, 1)
- `d1d5da8b-7908-4be3-b83d-3eadc2973f60` [game/ps5] "GTA 5 Ps5 Lacrado Mídia Física" (0/12, 12)
- `e0c49425-e8e9-409f-bf08-3e3c01b4b177` [game/ps5] "GTA 5 PS5 A Pronta Entrega Mídia Fisica" (0/2, 2)

### R064 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `0e009e64-a0d2-49bc-b9d4-82bb62019ab9` [game/unknown] "Resident Evil Requiem" (0/3, 0)
- `1694e639-40b5-4cd9-bc53-f32d10c4d64c` [game/ps5] "Resident Evil Requiem Ps5 Mídia Física Nacional" (0/1, 1)
- `58f4c935-60c4-4e57-8e6d-13bf85a1be87` [game/switch_2] "Resident Evil Requiem - Nintendo Switch 2 Físico Lacrado Novo" (0/2, 2)
- `77c25d19-374f-405b-b8e6-f6c893f3adde` [game/ps5] "Resident Evil Requiem - PlayStation 5 Mídia Física Lançamento" (0/1, 1)
- `7b1d6044-a3d2-47eb-8336-edb7102ff93a` [game/ps5] "Resident Evil Requiem Ps5 Original Pt Br Física Lacrado" (0/1, 1)
- `8197b0af-727d-41ad-b41f-45c159feb560` [game/ps5] "Resident Evil Requiem - Ps5" (16/90, 17828)

### R065 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `0fb55bf4-495e-4051-8efe-1eaaff7d5cd9` [game/unknown] "Resident Evil: Revelations" (0/4, 0)
- `2bfe2230-c658-4fed-b7b6-d075a5b91efd` [game/ps4] "Resident Evil Revelations - PS4 - Original" (0/1, 1)
- `fe2ece36-501a-41e3-8ada-4ed58e740a45` [game/switch_1] "Resident evil revelations Lacrado Nintendo switch" (0/1, 1)

### R066 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `124c23aa-2461-409a-a133-d7bdf5fdbb1a` [game/unknown] "Street Fighter 6 Edição Lenticular" (0/1, 0)
- `ea2cd97b-2c34-4118-8229-10d7d76fa1de` [game/ps5] "Street Fighter 6 Edição Lenticular Ps5" (0/1, 0)

### R067 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `1ed8b82f-5d9f-4f58-932f-15405ff9a18a` [game/unknown] "Silent Hill" (0/6, 0)
- `7c0fd7dd-d249-4f42-86cd-2f6ef0b8d73d` [game/unknown] "Padrão Silent Hill" (0/4, 6)

### R068 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `23a8e827-66d6-4b39-a5bf-1db19013edf0` [game/unknown] "Resident Evil Village" (0/1, 0)
- `3e9a59ec-b7bc-42ad-9dc3-8b21902f454a` [game/ps5] "Resident Evil Village Ps5 Física Lacrado Pronta Entrega" (0/3, 3)
- `452e86aa-259d-4381-a07f-5dda8280a8be` [game/ps4] "Resident Evil: Village - PS4 - Original" (0/1, 1)
- `72336803-d7b7-448c-85c5-e856bc4b5dd3` [game/ps5] "Resident Evil Village Standart PS5 BR Midia Fisica Open Box" (0/1, 1)
- `b26889a8-b861-4dd0-932c-89d265b06fa2` [game/ps5] "Jogo Resident Evil Village - Ps5 Físico" (6/28, 10738)
- `b8fdecb7-4eb3-4b47-802b-63dbabf31511` [game/ps5] "Resident Evil Village PlayStation 5 - Mídia fisica 100% original" (0/1, 1)

### R069 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `3294e4e6-75fe-42d4-8e9f-75931bba5db8` [game/unknown] "Nintendo Super Mario Odyssey" (0/1, 1)
- `2cfde1c0-f7bd-4deb-b8f9-24bd79981a78` [game/switch_1] "Super Mario Odyssey Nintendo Switch Lacrado Midia Fisica" (0/7, 7)
- `996175de-33ce-45ae-9542-d9454faee360` [game/switch_1] "Super Mario Odyssey Nintendo Switch - Mídia fisica 100% original" (0/1, 1)

### R070 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4480478c-efec-461e-8746-b21355e37214` [game/unknown] "Elden Ring Standard Edition (Digital)" (0/1, 0)
- `47021800-3548-4973-ba20-11925b1c6ff4` [game/xbox_one] "Elden Ring Standard Edition Xbox One Digital" (0/1, 0)

### R071 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `440d2bdd-d0ba-496a-bdcf-98c2bc24f0b0` [game/unknown] "Cyberpunk 2077" (10/28, 9983)
- `9b3eaa82-9bc2-4d93-b1b4-19b98edbc152` [game/unknown] "Cyberpunk 2077 Standard (Padrão)" (0/1, 0)
- `b2160601-67a8-42d8-840b-a50283c1a286` [game/ps4] "Cyberpunk 2077 - PS4 - Mídia física Português Br" (0/1, 1)
- `cc31471e-0d9e-4b10-822a-72d5b4ab5f39` [game/xbox_one] "CyberPunk 2077 - Xbox One/Series X - Original" (0/2, 2)

### R072 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4e1f0c81-3e77-46a7-9aae-065892b84866` [game/unknown] "Street Fighter 6 Edição de colecionador" (0/1, 0)
- `78568bb2-9500-4f50-bc73-6bce55cad9a4` [game/ps4] "Street Fighter 6 Collector's Edition - Ps4" (3/3, 2449)

### R073 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `4ec0603d-cbd4-4f5d-a694-c80a789a525f` [game/unknown] "God of War" (0/5, 0)
- `d09a54df-80c2-4de9-a821-17357c5b3c63` [game/ps4] "God Of War Playstation 4" (0/5, 4)

### R074 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `59700d6a-a549-4232-bb65-a05fc33e52cd` [game/unknown] "Silent Hill Downpour" (0/1, 0)
- `94d5e8e5-0ef9-44c3-a932-e2a11356a827` [game/xbox_360] "Jogo Xbox 360 Silent Hill Downpour Midia Fisica" (0/1, 0)

### R075 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `668646f9-625d-41ff-b05a-033102a3b20c` [game/unknown] "Street Fighter 6" (1/10, 174)
- `319317e4-9d81-4464-929a-694d2b7d6a22` [game/xbox_series] "Street Fighter 6 (mídia Física) - Xbox Series X" (0/1, 1)
- `408a1189-5925-4622-a5de-51ef64bcd97e` [game/ps5] "Street Fighter 6 para PS5" (0/1, 0)
- `7b41c25e-90c9-441a-86ae-91c87084096c` [game/ps5] "Street Fighter 6 Ps5 Midia Fisica" (26/33, 4441)
- `c697d492-8952-4a98-993b-de930f364b7c` [game/ps5] "Jogo Street Fighter 6 - Ps5 em mídia fisica" (0/1, 1)

### R076 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `753ff13c-96b3-4e1d-b8ed-a2e810aa7b6c` [game/unknown] "Tekken 8 Edição de colecionador" (0/1, 0)
- `3f8ff736-2aa4-49a3-aff6-31b58490023d` [game/ps5] "Tekken 8 Collector's Edition - Ps5" (0/1, 5)

### R077 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `77d4b692-1e1d-4a37-9114-b413f6f1f0cb` [game/unknown] "Turok Trilogy Bundle" (0/1, 0)
- `4b6e31bc-f1d0-433d-92c3-3f2903f4e12e` [game/ps5] "Turok Trilogy Bundle Ps5 Mídia Física" (0/7, 37981)

### R078 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `7ca37f56-edb2-499e-9c12-a131f71fecac` [game/unknown] "Cyberpunk 2077 Projekt Red" (5/13, 42)
- `24ab009c-6c49-4055-8960-3c23d57b6fb8` [game/ps4] "Cyberpunk 2077 CD Projekt Red PS4" (2/14, 189)

### R079 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `84c6ae11-c7f7-4957-a00e-10efceff8f78` [game/unknown] "Elden Ring Collector's" (0/1, 0)
- `17f97813-d6bf-41bb-9020-996525586768` [game/ps5] "Elden Ring Collector Edition Ps5" (0/1, 0)

### R080 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `921ac234-7ac9-4f4a-9e3e-d818422eb833` [game/unknown] "God of War Laufey Standard" (0/4, 0)
- `e0b74cd4-2ecb-49ce-b139-8f7a56e62d7e` [game/ps5] "God of War Laufey Jogo PS5 Standard" (0/2, 0)

### R081 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `a0a24597-d16d-446c-bf5d-55e2016e8bc5` [game/unknown] "Hollow Knight Standard Edition" (0/2, 0)
- `2a986660-a072-409e-82b6-ad8a6f9e1d29` [game/ps4] "HOLLOW KNIGHT - PS4" (0/1, 1)
- `2b317119-5992-4d4f-b1de-7719e368079a` [game/ps5] "Hollow Knight PS5 Midia Fisica" (0/2, 841)
- `c020f5fe-c912-4d18-bbd7-e83d9c91dfce` [game/switch_2] "Hollow Knight Nintendo Switch 2 Standard" (0/1, 0)
- `f57d9a9b-f7d3-45b7-93a7-7899b5db5b9c` [game/switch_1] "Hollow Knight Switch Standard Edition (Físico)" (9/14, 14313)

### R082 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `aab270e0-229e-4014-b1ca-d8b1dccd6153` [game/unknown] "Cyberpunk 2077 Ultimate Edition" (0/1, 0)
- `53ecccc9-a49d-41af-8b22-267aeb5a1f39` [game/ps5] "Cyberpunk 2077 Ultimate Edition PS5 Midia Fisica" (10/24, 15923)
- `c1e50127-83fd-4c2b-85b1-aa052ddc6577` [game/switch_2] "Cyberpunk 2077 Ultimate Edition Switch 2 Midia Fisica" (0/1, 2)

### R083 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `ac2071f6-298d-4536-9a53-c963dacc5325` [game/unknown] "Tekken 8 Standard Edition" (0/11, 1)
- `98831105-323d-4caf-87c3-031390962c0b` [game/ps5] "Tekken 8 Ps5 Midia Fisica" (13/26, 14273)
- `c0f3fee8-0238-4c2b-b5e8-2398e48afec0` [game/unknown] "Tekken 8 (xsx)" (0/1, 0)

### R084 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `b2763b39-dcc1-403a-baf1-82aec02ef7e4` [game/unknown] "Tekken Tag Tournament 2" (0/1, 0)
- `711f2833-15e7-4c6b-9b77-6452407246d8` [game/xbox_360] "Jogo Xbox 360 Tekken Tag Tournament 2" (0/1, 0)

### R085 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `b5e5881f-9c1c-40ec-ad27-75ccda1081d7` [game/unknown] "Nintendo Mário Kart World - Mídia Física Lacrado" (0/1, 1)
- `17fd97e2-15b9-4f4f-bfcb-463275dd21a9` [game/switch_2] "Mario Kart World Nintendo Switch 2 Nacional - Mídia Física - Lacrado" (0/1, 1)
- `241b0817-70af-4a6a-a4e8-c9086f4eeb30` [game/switch_2] "Jogo Mario Kart World - Nintendo Switch 2" (0/4, 4)
- `7ac4d8d5-65cd-4a19-9e39-4f288a3386e7` [game/unknown] "Mario Kart World (Switch 2)" (1/1, 2)

### R086 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `b8942e61-c209-4090-9b85-675f916331f4` [game/unknown] "Zelda Breath Of The Wild" (0/1, 1)
- `3ff650a6-ab63-4eaf-8d95-cf63da1dcee6` [game/switch_1] "Zelda Breath Of The Wild Nintendo Switch" (0/1, 1)

### R087 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `e4d32318-9292-4626-ae9f-d5b2c354beb2` [game/unknown] "ELDEN RING NIGHTREIGN Standard Edition" (0/1, 0)
- `c1627d91-3c74-4793-9b7c-9aec8de50cab` [game/ps5] "Jogo Ps5 Elden Ring Nightreign Standard Edition" (10/35, 13041)

### R088 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `e7fe71c6-ee14-43b9-8615-62e1123d1f6e` [game/unknown] "Elden Ring" (0/3, 0)
- `0caff5d7-2b2f-4305-82b1-9c5f6fa8bb7c` [game/unknown] "Elden Ring - Xbox Série X" (0/1, 0)
- `29ed47af-7dec-4d86-85f0-675b222d55e8` [game/ps4] "Elden Ring (jogo Físico, Nacional) - Ps4" (0/2, 5)
- `322b0edc-9e30-4cf3-9c15-105e38b6b765` [game/ps5] "Edição De Lançamento De Elden Ring (ps5)" (0/1, 0)
- `440edd4a-5000-4cee-a003-efaba170fa00` [game/ps4] "Elden Ring Standard Edition PlayStation 4 físico" (16/24, 4513)
- `750850bd-a2b8-4d97-9a3f-d325bfddab37` [game/ps5] "Elden Ring PS5 Mídia Física Envio Imediato" (0/2, 2)
- `a2be6dba-2224-42bd-90e8-4f74bc4739c3` [game/ps5] "[LACRADO] Elden Ring PS5 Mídia Física Novo Original Pronta Entrega" (0/1, 1)
- `af4e8cf0-dbdc-4625-8ab6-e065e18c315f` [game/ps5] "Elden Ring Edição Standard - PS5" (0/19, 18)
- `d77cceb9-20de-4c98-99f8-8e0f7b61ebae` [game/ps4] "Elden Ring | Legendado em Português | PS4 Mídia Física Original BR" (0/1, 1)
- `d8e41d3c-8940-47af-aae3-91e46938d642` [game/xbox_series] "Elden Ring - Xbox Series X Standard" (0/2, 0)

### R089 unknown_platform
_Plataforma não indicada no título nem no cadastro; núcleo igual ao de outro master_
- `e8039b5e-d409-41a0-838b-fbd604816f4a` [game/unknown] "Silent Hill 2 Remake Standard" (0/1, 0)
- `2866dbbc-780a-457f-b387-b28e404124ce` [game/ps5] "Silent Hill 2 Remake Ps5 - Mídia Física" (0/2, 2)

### R090 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `44bcde51-44ec-43d8-9409-75a01532924b` [console/switch_1] "Nintendo Switch Lite Desbloqueado" (0/1, 1)
- `5307d140-59e4-48ba-bb94-b85989b80ecf` [console/switch_1] "ENVIO RAPIDO! NINTENDO SWITCH LITE DESBLOQUEADO" (0/2, 2)
- `5862acd9-d695-48ca-9c0b-504ed6c7e367` [console/switch_1] "NOTA FISCAL Nintendo Switch lite desbloqueado com nota e garantia" (0/1, 1)

### R091 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `0a155e2c-fdd4-4946-afcf-f8027cd93675` [console/xbox_one] "Console Xbox One S Microsoft 1tb" (0/1, 3)
- `12c806b9-6827-4736-b7bb-128ebc6b8064` [console/xbox_one] "Console Xbox Xbox One S Standard" (0/1, 0)
- `71841796-7360-413c-aa39-ccf16476a112` [console/xbox_one] "Console Xbox One S de 500 GB" (0/1, 0)

### R092 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `0faf86f5-2eed-492d-9301-25dd9e32dd7c` [accessory/switch_1] "Controle Para Nintendo Switch- Joycon Alta Qualidade/Envio Imediato" (0/1, 1)
- `af54d7cf-a268-4bf5-a587-e056032f0a5f` [accessory/switch_1] "Controle Nintendo Switch Joycon alta qualidade Envio Rapido" (0/1, 1)

### R093 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `14fb9ec6-078a-41b3-84a3-6accc3627fb8` [console/xbox_one] "Console Xbox One S De 1 Tb branco" (2/3, 3)
- `c53344ea-728d-4cdf-8c1a-da4c3202fd13` [console/xbox_one] "Console Xbox One S 1 TB Branco da Microsoft" (3/3, 6)

### R094 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `24c6ff7e-4b46-4f11-8a0d-a117dfc191a1` [console/ps5] "Console Playstation 5 Disco Sony Brasil" (0/1, 0)
- `aa8f1ca0-a210-419f-9ce8-517c8fc16af6` [console/ps5] "Console PlayStation PlayStation 5" (0/5, 0)
- `b72b88a4-87ed-457c-ac06-ecdc4ffd9daa` [console/ps5] "Console Playstation 5 Standard 1tb Sony" (0/29, 6764)

### R095 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `2a8bddaf-9234-4684-bda3-6274eb3269fd` [accessory/xbox_series] "Controle joystick Microsoft Xbox Microsoft CONTROLE XBOX SERIES CONTROLE XBOX SERIES" (0/2, 0)
- `78f5517d-7ed6-4d0b-83a4-55c1e49ada1c` [accessory/xbox_series] "Controle Joystick Microsoft Xbox Series X/S" (0/1, 1)

### R096 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `2d4bd0ad-2c96-4721-998a-718c1fb0d10e` [console/xbox_series] "Console Xbox Series S de 1 TB" (0/1, 0)
- `a265eb0c-3a9e-43b8-9d4a-541f1ef44465` [console/xbox_series] "Console Xbox Series X 1TB Standard" (2/15, 1902)
- `bbc8bf90-820c-43d1-b8f5-34e6e8f4f27d` [console/xbox_series] "Console Xbox Series X Xbox One X" (0/3, 0)

### R097 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `2db7c939-20f5-4bbd-879e-f903010bce73` [accessory/xbox_series] "Controle Xbox Series X/S Novo Lacrado Original" (0/1, 1)
- `b9c54aac-790b-4c56-9034-45da05a1b498` [accessory/xbox_series] "Controle para Xbox Series S" (0/1, 1)
- `fcc36cb9-5918-4a2b-bcf5-673be78de3df` [accessory/unknown] "controle Xbox séries X Original" (0/1, 1)

### R098 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `3551cad0-9ee6-43d5-ba87-af137d870929` [console/ps5] "Console PlayStation PlayStation 5 Digital" (0/1, 0)
- `d335b69f-d0a7-497b-b075-b355efcd829f` [console/ps5] "Console PlayStation 5 - Digital Edition" (0/1, 1)

### R099 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `4fce8242-d512-4bc4-b42e-de2c5e4221bd` [console/switch_1] "CONSOLE NINTENDO SWITCH ANIMAL CROSSING DESBLOQUEADO COMPLETO ENVIO IMEDIATO" (0/1, 1)
- `ed7917c8-ef1a-4cac-a2c2-f77ddbd30a05` [console/switch_1] "NOTA FISCAL CONSOLE NINTENDO SWITCH ANIMAL CROSSING DESBLOQUEADO COMPLETO ENVIO IMEDIATO" (0/1, 1)

### R100 non_game_exact
_Console/acessório com título equivalente; variantes (cor, modelo, kit) não são distinguíveis pelo título_
- `d69fe7df-deca-43d6-9556-17d5ec730120` [accessory/xbox_360] "Controle Xbox 360 Preto" (0/1, 8)
- `ee94acf1-13fd-43b0-9862-d36d3e8037be` [accessory/unknown] "Controle Xbox 360 Preto" (0/1, 4)

### Conflito entre plataforma do cadastro e do título
- `61c8c89d-6b60-4f6f-9bb1-bcf376727d2b` cadastro=switch_2 "[Direct From Japan] Nintendo Switch 2025.9.3Week Release Japan NEW GAME" (0/5)
- `94bea44a-73e6-4307-aed2-1ec76dc5a802` cadastro=switch_2 "[Direct From Japan] Switch  2024.10.5Week Release Japan NEW GAME Nintendo Switch" (0/1)
- `3e714c6d-42a9-4fb7-9232-3019115a2a20` cadastro=switch_2 "[Direct From Japan] Switch 2024.11.5Week Japan NEW GAME Nintendo" (0/2)
- `d91a8ec5-4d41-412d-93b2-46045a4af252` cadastro=xbox_one "Halo Wars Xbox 360 Mídia Física Microsoft" (0/1)
- `0dee1dcd-aeed-4655-9ee5-59edee091d68` cadastro=switch_2 "Coleção Mario kart deluxe mc donals mc lanche feliz Nintendo switch 2024  Mario Peach Bowser Toadette Yoshi Luigi Toad" (0/1)
- `2bb612be-f3ed-44da-b8a6-3df91651a117` cadastro=switch_2 "Carro super mario kart mcdonalds nintendo switch 2024" (0/1)
- `2e88c8f7-15be-4af7-91a7-f33457470a51` cadastro=ps4 "Coleção Castlevania Advance Deluxe Nintendo Switch - Prata" (0/1)
- `565752e3-e987-40b8-8454-236dcc0bff84` cadastro=xbox_one "Halo Infinite Xbox Série X|S, Xbox One e PC (Digital)" (0/1)
- `93ee6990-37bd-4355-83d3-855a3e9b369a` cadastro=switch_2 "Nintendo Nintendo Switch OLED White Nintendo Switch 2021" (0/1)
- `9dcbdeef-10f0-454e-bc4f-044863dec19e` cadastro=ps4 "Tekken 8 Standard Edition PS5 Fisico Bandai Namco" (0/1)
- `b87a02f6-f8bc-46f4-a167-9d290c0a6f15` cadastro=switch_1 "Nba 2k26 - Nintendo Switch 2 Físico Europeu" (0/1)
- `e24fd149-c613-44e2-aed7-8dddb7c0990a` cadastro=switch_2 "Nintendo Nintendo Switch Switch NINTENDO SWITCH 2DA VERSION 2ª edição" (0/1)
