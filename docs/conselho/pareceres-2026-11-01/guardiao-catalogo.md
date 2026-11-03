# Parecer do Guardião do Catálogo, rodada 1 (2026-11-01)

Escopo: F-01, F-02, F-03, F-04, F-06, F-07, F-16, F-20, F-21 da `docs/auditoria-cowork-2026-11-01.md`.
Modo: somente leitura. Nenhum código editado, nenhum UPDATE/INSERT/DELETE. Foram feitos só SELECTs (via `connect()` de `scripts/_dup-shared.ts`) e testes de regra em memória com as funções reais (`normalizeTitle`, `coreSimilarity`, `isSameProduct`, `classifyCatalogItem`, `derivePlatformFromTitle`). Scripts temporários ficaram no scratchpad, fora do projeto.
Rótulos: **[DADO]** = medido no banco hoje; **[INFERÊNCIA]** = deduzido; **[RECOMENDAÇÃO]** = proposta.

Universo medido: 5.823 masters não fundidos; 1.803 com oferta ativa e preço > 0; 1.516 destes passam pela cartela (1.153 jogos, 108 consoles, 255 acessórios); 7.887 ofertas ativas.

---

## 1. Posição

1. F-01 não é "um erro de Nintendo Land". É uma classe: **65 ofertas ativas, em 7 masters de jogo, têm título de catálogo que contradiz o master** (Nintendo Land em Metroid Other M; Street Fighter 6 em Street Fighter V; Resident Evil 2 em Resident Evil 3; Yakuza Kiwami 2 em Kiwami; GTA V PS3 em GTA V Xbox X; Moving Out 2 em Moving Out). O código atual de dedup já rejeita esses pares; o dano é dado legado mais ausência de qualquer verificação depois do vínculo.
2. F-02: dos seis clusters, 3 devem ser fundidos (com a separação de bundles/edições), 2 só depois de corrigir a regra (GTA V, RE3) e 1 não pode ser fundido hoje por falta de plataforma (Cyberpunk). A causa é que a dedup de consoles não existe (só jogos fundem automático) e que a normalização apaga capacidade e não entende `®`.
3. F-03, F-04, F-06, F-07 são lacunas pontuais de regra de leitura, todas corrigíveis sem UPDATE no banco: o catálogo é classificado em TS a cada 5 min (`src/server/queries/catalog-dimensions.ts:30-34`). A exceção é F-07 (a consulta de Altas e Baixas nem chama o filtro).
4. F-16 exige migration: o enum `game_platform_gen` (`src/db/schema/_enums.ts:248-257`) não tem Wii, Wii U, 3DS, DS, PS3, PS2, SNES, N64, GBA. Dos 128 jogos públicos sem plataforma, 57 trazem plataforma legada no título e só 5 são derivaveis com o enum atual.
5. F-21 não é lacuna de cadastro: os masters de Tears of the Kingdom e Mario Kart 8 Deluxe existem; todas as ofertas foram marcadas `expired` em lote em 31/10. Causa não provada com leitura (ver seção 4).

---

## 2. Leitura (por achado)

### F-01. Vínculo oferta -> master (causa raiz)

**[DADO] A oferta da URL**
- O slug `jogo-nintendo-land-nintendo-wii-u-midia-fisica-nintendo-452706-afe9f8` é slug de OFERTA (`affiliate_offers.slug`), não de master (SELECT por slug em `master_products` devolve 0 linhas).
- Oferta `21d8d2ba…`: título "Jogo Nintendo Land Nintendo Wii U Midia Fisica Nintendo", `external_ref = MLB23452706`, `seller_id` nulo (placeholder de catálogo), criada em 12/08/2026, apontando para o master `22b6dc4d…`.
- Master `22b6dc4d…` = "Jogo Metroid Other M Nintendo Wii Mídia Física", `meli_catalog_id = MLB39047051`, plataforma `unknown`, criado em 20/07/2026. A sinopse é de Metroid: Other M e está correta para o master.
- As 4 ofertas do catálogo MLB23452706 (1 placeholder + 3 de vendedores: R$ 120,30, R$ 129,00, R$ 150,00) estão todas sob o master Metroid. As outras 4 ofertas sob esse master são do catálogo MLB39047051 (R$ 407,12 a R$ 499,00). Por isso a "menor oferta" do Metroid é um preço de Nintendo Land e a média mistura dois jogos.
- Existe um master correto, "Jogo Nintendo Land Wii U (fisico) Ntsc-us" (`4494c28c…`, `MLB25731487`, criado em 31/10 às 23:00), com plataforma `unknown`. É um terceiro catálogo do ML para o mesmo jogo.

**[DADO] Por que ninguém viu**
- `src/server/collector/collect-prices.ts:360` grava `title: masterProduct.name` em toda oferta de vendedor nova. As 3 ofertas de vendedor de MLB23452706 chamam-se "Jogo Metroid Other M…". O título do catálogo real só sobrevive no placeholder (`seller_id IS NULL`).
- Nada no código compara o título do catálogo com o master depois do vínculo.

**[INFERÊNCIA] Como o vínculo errado nasceu**
- O vínculo é de 12/08, anterior à reescrita da dedup (31/10, ver comentário em `dedup.ts:15-21`). Testei o par com o código de hoje: núcleos "land wii" x "metroid other wii", Jaccard 0,25, `isSameProduct = false`. Plataforma `unknown` dos dois cai no ramo de igualdade exata (`dedup.ts:235-243`), que também rejeita. Logo, o caminho automático atual não repete este erro.
- Não achei master fundido apontando para o Metroid (`attributes.mergedInto`), então não foi fusão de script. Restam a dedup antiga ou uma extração manual no admin (`src/server/actions/affiliate.ts:160,186`, `src/server/actions/collector.ts:372`). Sem git no ambiente não consigo provar qual. **Dado que falta:** o log da criação de 12/08.

**[DADO] Contagem de ofertas ativas cujo título de catálogo contradiz o master** (7.887 ofertas ativas; para cada oferta, título = placeholder do mesmo `network_id + external_ref` ou o próprio título; comparação por `coreSimilarity` do `normalizeTitle`):

| Limiar | Ofertas | Masters |
|---|---|---|
| sim < 0,2 | 8 | 5 |
| sim < 0,5 | 12 | 6 |
| sim < 0,8 | 82 | 18 |

Após revisão manual dos 82 (os de sim = 0 são falsos positivos: título idêntico cujo núcleo ficou vazio, ex.: "Nintendo Switch Físico"):

| Contradição real | Ofertas | Master afetado |
|---|---|---|
| Nintendo Land, Wii U, em Metroid Other M | 4 | Metroid Other M |
| Street Fighter 6 em "Jogo Ps4 Street Fighter V" | 21 | SFV PS4 |
| Resident Evil 2 em "Resident Evil 3 Ps5" | 28 | RE3 PS5 |
| Resident Evil 2 Remake em "Resident Evil 3 Remake PS5" | 7 | RE3 Remake |
| Yakuza Kiwami 2 em Yakuza Kiwami (Switch 2) | 1 | Yakuza Kiwami |
| GTA V PS3 em GTA V Xbox X | 3 | GTA V Xbox X |
| Moving Out 2 em Moving Out | 1 | Moving Out |
| **Subtotal de jogos** | **65** | **7** |
| Pôsteres (Cyberpunk #1/#2, God of War), cadeira, Mario Kart World digital em físico | 10 | já ocultos, exceto 1 |

- Falso positivo a evitar: "GTA V" x "GTA 5" tem números diferentes (`numDiff`) mas é o mesmo jogo.
- **Ponto cego:** 1.722 ofertas ativas não têm placeholder (o título delas é o do master), então a verificação por título não as alcança. Dessas, as com `external_ref` diferente de `master.meli_catalog_id` são o risco (no total 664 ofertas ativas estão sob catálogo diferente do primário do master; dos 65 contaminados, todos estão nesse grupo). **Dado que falta:** título real do item na API oficial do ML para o grupo sem placeholder.

**[RECOMENDAÇÃO] Regra (guarda do vínculo)**
```ts
// verifyOfferBelongsToMaster(catalogTitle, masterName, masterPlatform)
const a = normalizeTitle(catalogTitle), b = normalizeTitle(masterName);
if (!a.coreTitle || !b.coreTitle) return 'inconclusivo';        // evita os falsos "sim = 0"
const aliasA = aliasNumerals(a), aliasB = aliasNumerals(b);       // GTA V == GTA 5, ver F-02
if (!sameList(aliasA.numbers, aliasB.numbers)) return 'conflito'; // SF6 x SFV, RE2 x RE3, Kiwami 2
if (coreSimilarity(a.coreTitle, b.coreTitle) < 0.5) return 'conflito'; // Nintendo Land x Metroid (0,25)
if (a.platform !== 'unknown' && b.platform !== 'unknown' && a.platform !== b.platform) return 'conflito'; // PS3 x Xbox X
return 'ok';
```
- Teste contra os 7.887 títulos reais: pega os 65 casos; os "sim 0,5-0,8" restantes (Gran Turismo Sport "PT BR" x "Hite", Super Mario Bros U Deluxe "Envio Imediato") passam por `ok` porque o número e a plataforma batem. Falsos positivos medidos: 0 entre os 65; falsos negativos: os do ponto cego (sem placeholder).
- Onde aplicar: (a) `collect-prices.ts` antes de criar oferta de vendedor (alertar e não vincular); (b) leitura: view de auditoria diária; (c) `discover-products.ts` já passa por `findExistingMasterProduct` (ok).

**UPDATE no banco: SIM (correção dos 65).** Só desenho, não executar:
```
-- DRY-RUN (SELECT). Para cada external_ref contraditório:
--   1. destino = findExistingMasterProduct(titulo_catalogo, plataforma) ; se null, criar master (passo manual)
--   2. UPDATE affiliate_offers SET master_product_id = :destino, title = :titulo_catalogo (placeholder) / nome do destino (vendedores)
--      WHERE network_id = :n AND external_ref = :ref;       -- snapshots seguem a oferta (FK offer_id), histórico preservado
--   3. revalidateTag('affiliate-offers'); recalcular estatísticas dos 2 masters
-- Pré-condições: backup/dados recente (mesmo critério do merge-duplicate-masters.ts), transação única,
--   contagem esperada = 65 ofertas, log reversível por oferta (id, master anterior).
-- Nintendo Land: destino proposto 4494c28c (já existe); as 4 ofertas MLB23452706 passam de 22b6dc4d para ele.
```
- Atenção: após o UPDATE o Metroid fica só com 4 ofertas; Nintendo Land ganha cotações novas. Mínimo e média históricos de Nintendo Land mudam (hoje inválidos, F-14).

### F-02. Duplicatas (classificação por cluster)

Causa comum **[DADO]**:
- `dedup.ts:96-97` apaga capacidade (`\d{2,4}gb`, `\dtb`) do núcleo. Em console, capacidade é SKU (825 GB x 1 TB). Hoje só não funde porque consoles nunca entram em fusão automática (`analyzeDuplicates` só agrupa `productType === 'game'`, linha 394; consoles só viram `non_game_exact` para revisão, linha 530-547, com núcleo idêntico, e o núcleo de console quase nunca é idêntico: "slim", "branco", "cor preto"...).
- `dedup.ts:82-98` não remove `®`, `™`: "PlayStation® 5 Slim" não casa `\bplaystation\s*[45]\b` e fica com "5" no núcleo (master `1193e028`, núcleo "5 slim branco"). `game-classification.ts:56-62` tem o mesmo defeito; esse master está gravado como `ps4` embora o título diga PlayStation 5.
- Títulos com nome longo e alias ("Grand Theft Auto V" x "Gta 5") não convergem (`dedup.ts` não tem tabela de alias).

| Cluster (masters, ofertas ativas) | Decisão | Por quê |
|---|---|---|
| **PS5 Slim Digital 825 GB**: `1193e028` (85 ofertas, R$ 1.999,99, gravado como ps4) + `22c09745` (72, R$ 3.199,99) | **Fundir** os dois; canônico `22c09745`; corrigir plataforma de `1193e028` para ps5 antes | Mesmo aparelho (Slim, Digital, 825 GB). A diferença de preço é isca/outlier (F-11), não produto. |
| PS5 Slim Digital: `7726149b` (R$ 5.099,99, com DualSense) | **Manter** | Bundle com controle extra. |
| PS5 Slim 1 TB Digital `0a9635ba`/`0a8ff56a` (R$ 3.900) | **Manter** separado dos 825 GB | Capacidade diferente (SKU diferente). Hoje a normalização os igualaria: risco de fusão errada se alguém estender o dedup a consoles sem tratar capacidade. |
| PS5 Slim Digital 30º aniversário `c8a82f2b`, Wolverine `b7560511`, "Digital Edition e unidade de disco" `4a8bbb84`, "pacote Fortnite" `16bfdd87` | **Manter** | Edição limitada/kit com conteúdo. |
| **PS4 Slim 1 TB preto**: `f4ac511b` (15, R$ 1.400), `dd70f76d` (8, R$ 1.500), `6aa78892` (11, R$ 1.700, CUH-251A), `0de4e1e5` (4, R$ 1.750), `1c8663e6` (2, R$ 2.300) | **Fundir os 5**; canônico `f4ac511b` | Mesmo aparelho (Slim, 1 TB, padrão, preto). O código CUH-251A é só revisão de hardware. |
| PS4 Slim: `ac3ac01d`, `a24e4f15` (Hits Bundle), `f67ffd58` (3 jogos + Mega Pack), `f79535e1` (500 GB + CoD), `5f0aa71a` (2 controles + jogos; gravado `accessory`, dimensão efetiva console) | **Manter** | Bundles ("Slim" + conteúdo). `5f0aa71a` precisa corrigir `product_type` para console. |
| **Xbox One S 1 TB branco**: `14fb9ec6` (14, R$ 1.699) + `c53344ea` (3, R$ 1.500) | **Fundir**; canônico `14fb9ec6` | Mesmo aparelho. |
| Xbox One S: `e9947923` (All-Digital, sem leitor), `1c140be4` (Division 2), `d87d08af` (Game Pass), `8f1dfe14` (FIFA 17), `364afd34` (2 TB Gears 4) | **Manter** | Aparelho diferente ou bundle. |
| **GTA V PS4 Premium**: `776e8c29` (7, R$ 153,55) + `2dc21264` (1, R$ 168) | **Fundir depois de corrigir a regra** (alias GTA V = GTA 5 + dedupe de token). Teste: com o alias, o par vira o mesmo núcleo "gta 5" e mesmo marcador `premium`. | Mesma edição física. Hoje núcleo "gta 5" x "grand theft auto v gta 5" (Jaccard 0,33). |
| GTA V PS4 `10072eb7` ("Gta 5", R$ 119,90, 6 ofertas) | **Revisão do dono** | Sem marcador de edição. A Premium é a edição física vendida hoje; é provável que seja a mesma, mas o regra "sem marcador != premium" é deliberada (`dedup.ts:34-40`). **Dado que falta:** atributo `EDITION`/`GTIN` da API do ML. |
| GTA V `a3e96079` (combo de 3), `3666e53c` (Xbox One), `c2df4777` (PS5), `deb76eb3` (Xbox X, plataforma `unknown`) | **Manter** | Plataforma/lote distintos. `deb76eb3` pede plataforma (F-16). |
| **Resident Evil 3 PS5**: `6813e83f` (29) + `998156be` ("em formato físico", 13) | **Fundir** | Só difere por ruído "formato". |
| RE3 PS5: `30d74497` ("Remake", 8, R$ 170) | **Fundir com `6813e83f`** via alias curado (RE2/RE3/RE4 PS4/PS5: "Remake" é a única versão na plataforma) | Hoje o marcador `remake` separa. Não generalizar o marcador `remake`. |
| RE3 PS5: `c78b07f7` ("Playstation 5 euros", 3) | **Revisão** | "euros" pode ser região PAL; ou é ruído. |
| RE3 PS4 `235a1ef8` | **Manter** | Outra plataforma. |
| **Cyberpunk 2077**: `24ab009c` (PS4, 21), `440d2bdd` (plataforma `unknown`, 10, R$ 129), `7ca37f56` ("Projekt Red", `unknown`, 5, R$ 90) | **Não fundir hoje**. `440d2bdd` + `7ca37f56` são candidatos a fundir **entre si** e com o PS4 só quando a plataforma for resolvida | Plataforma desconhecida bloqueia (`dedup.ts:232-247`). "CD Projekt Red"/"Projekt Red" é nome de estúdio e deve ser ruído. **Dado que falta:** `CONSOLE_VERSION` do catálogo ML (consulta oficial) para os 2 masters `unknown`. |
| Cyberpunk Ultimate PS5 `53ecccc9`, Ultimate Switch 2 `c1e50127`, Steelbook Xbox One `ad897e46`, digital `556e0e29`, "2084" `9b24ce1b` | **Manter** | Edições/plataformas/produtos distintos. |
| **PS Portal**: `3dc9a636` (console), mais 2 masters tipados console mas com dimensão efetiva acessório (`Playstation Portal Para Console Ps5`, `Playstation Portal Reprodutor Remoto…`), total 28 ofertas | **Fundir os 3** num só, na aba escolhida pelo dono (hoje a regra `acessorios_generico` o põe em Acessórios) | Mesmo aparelho em duas dimensões (F-06). Hoje "Console remoto Playstation Portal" cai em console porque o substantivo `console` aparece antes (`dimensions.ts:284`). |

**Resultado medido da regra proposta para jogos** (protótipo em memória sobre os 1.211 jogos públicos com oferta): hoje a dedup automática acha 0 clusters; com 4 aliases (remover `®™©`, `grand theft auto v|gta v` -> `gta 5`, remover `cd projekt red|projekt red`, ruído `formato|euros`) mais dedupe de tokens, aparecem 2 clusters (RE3 PS5 com 3 masters; GTA V PS4 Premium com 2), 3 excedentes. Falso positivo: 0. O resto do problema de F-02 é de console (abaixo).

**Regra proposta para consoles** (chave de fusão, não existe hoje):
`família | capacidade | disco/digital | conteúdo`, onde conteúdo = "plain" quando o título não tem `+`, `com N`, `jogo(s)`, `pacote`, `kit`, `bundle`, `controle(s)`, `hits`, `mega pack`, `combo`, nome de jogo, `limitada|edição|aniversário|<nome de edição>`. Cor fica fora (decisão do dono, ver Dado que falta).
- Protótipo sobre os 108 consoles públicos: 13 clusters "plain" de ≥ 2 masters. Fusões legítimas: PS5 Slim 825 GB Digital (2), PS4 Slim 1 TB (5), Xbox One S 1 TB (2), Xbox Series X 1 TB (3, excluir Halo Infinite R$ 15.500), Xbox Series X 1 TB Digital (2), Xbox Series S 512 GB (2), Xbox Series S 1 TB (2), PS5 825 GB disco (2), Switch OLED 64 GB (3 plain), Switch Lite 32 GB (3 plain). Falsos positivos do protótipo (a corrigir antes de usar): Pokémon Dialga/Palkia, Splatoon, Zelda TotK, Halo Infinite (faltam como marcador de edição), PS Portal em "ps5", "PlayStation 5501 R$ 19.000" (item incoerente), Switch 2 nacional (2: pendente de F-12).

**UPDATE no banco: SIM.** Reusar `scripts/merge-duplicate-masters.ts` (já faz dry-run por padrão, reaponta todas as FKs, arquiva com `mergedInto`, exige backup recente). Ele só funde jogos; para consoles falta um modo "plano explícito" (lista de grupos aprovados pelo dono). Desenho: `scripts/merge-explicit-plan.ts --plan plano.json` (padrão dry-run), onde `plano.json` = `[{canonical, merge:[...]}]` com os grupos "Fundir" da tabela acima; as mesmas garantias do script existente. Antes: corrigir a plataforma de `1193e028` (ps4 -> ps5) e o `product_type` de `5f0aa71a`.

### F-03. Console desbloqueado com pontos, "N jogos de sua escolha", disco demo

| Item | Causa raiz | Regra | Resultado no banco |
|---|---|---|---|
| "Nintendo Switch V2 D.E.S.B.L.O.Q 128GB" | `foldTitle` (`dimensions.ts:101-109`) vira "d e s b l o q"; `CONSOLE_MOD_RE` (`dimensions.ts:338`) procura `\bdesbl\w*` e não casa. O texto "d e s b l o q" só existe em `CONSOLE_NOUNS` (linha 195), que classifica como console em vez de esconder. | Antes de testar `CONSOLE_MOD_RE`, colapsar 4+ letras isoladas: `t.replace(/\b(?:[a-z] ){3,}[a-z]\b/g, m => m.replace(/ /g, ''))`. Aplicar SOMENTE ao teste de console modificado. | Colapso geral altera 4 nomes: os 2 Switch desbloq e "G.O.R.E." e "S.T.A.L.K.E.R.2" (legítimos). Aplicado só ao teste `desbl`, casa 2 (os dois Switch), 0 falso positivo. |
| "Console Playstation 2 Ps2 + 20 jogos de sua escolha" | Nenhuma regra. | `/\b\d{1,3} jogos? (?:de\|da\|a) (?:sua \|seu )?escolha\b\|\bjogos? (?:de\|da\|a) (?:sua )?escolha\b\|\bsua escolha\b/` no console -> `off_catalog` motivo `jogos_a_escolha` (conteúdo indeterminado, não é SKU). | 4 masters (1 com oferta ativa, 3 sem). 0 falso positivo. |
| "Jam pack Volume 11 PLAYSTATION 2" (tipado console), "Playstation Vr Demo Disc 1.0" | Nenhuma regra de disco demo. | `/\bjam pack\b\|\bdemo disc\b\|\bdisco demo\b\|\bdemonstrativ[oa]\b\|\bsampler\b\|\bnot for resale\b\|\bdemo\b/` -> `off_catalog` motivo `disco_demo`. | 3 masters (2 com oferta), incluindo "Street Fighter 6 … Not For Resale" (oferta 0). 0 falso positivo (não usei `trial`: casaria "Galactic Trials"). |

- **UPDATE no banco: não.** Efeito imediato via `loadOverrides` (cache de 5 min). `docs/segmentacao-catalogo-2026-10-31.md` (seção 5) já define o plano de gravar `attributes.catalogDimension` quando o dono aprovar.
- PS2: o enum não tem PS2 e a cartela não decide se PS2 é plataforma atendida. **Decisão do dono** (ver Dado que falta).

### F-04. "Gta 5 Digital" e opção "Mídia Digital"

**[DADO] Causa raiz**
- `classifyCatalogItem(name, dbType)` (`dimensions.ts:343`) só vê o NOME. `DIGITAL_RE` (linha 337) exige a palavra "digital" no título. O master `07c06d49…` se chama "Gta 5" e tem `game_format = 'digital'` (atributo estruturado do ML); a regra nunca o vê. `catalog-dimensions.ts:30-34` seleciona só `id, name, product_type`.
- Outra rota: `DIGITAL_RE` só é aplicada a `dimension === 'game'` (linha 370). "Minecraft Legends … Console Agency … (Digital)" (tipado console, 2 ofertas) e "Console Nintendo Switch 2 + EA SPORTS FC 27 (Digital)" (0 ofertas) escapam.
- A opção está em `src/components/price-table/price-table-board.tsx:179` e `FORMAT_VALUES` em `src/app/(shop)/tabela-de-precos/page.tsx:21`.
- Medido: com `game_format = 'digital'` há 3 masters públicos (EA FC 27 Xbox Series, Mortal Kombat 11 PC, Gta 5); com "(digital)" no título, 112 (95 com oferta; 110 jogos e 2 consoles), a maioria já escondida por `DIGITAL_RE`. O filtro "Mídia Digital" devolve só resíduos que deveriam estar escondidos.

**[RECOMENDAÇÃO]**
1. Remover a `<option value="digital">` e `'digital'` de `FORMAT_VALUES` (2 linhas).
2. `loadOverrides` passa a ler `game_format` e `classifyCatalogItem(name, dbType, gameFormat?)` esconde (`off_catalog`, `digital_formato`) quando `gameFormat === 'digital'` e o item não é console. Testado nos 5.823: 3 públicos pegos.
3. Para o título: `/\(\s*digital\s*\)/i` esconde em qualquer dimensão (console "Digital Edition" sem parênteses permanece, são 16 consoles legítimos com a palavra "digital" no título; zero deles tem "(digital)").
- **UPDATE no banco: não.** Higiene opcional: o coletor não deve criar master com `game_format = 'digital'` (`discover-products.ts` já tem `classifyFromAttributes`; a decisão de não ingerir é de negócio).

### F-06. Torx, HDD, clone de controle, PS Portal

| Item | Causa raiz | Regra | Resultado |
|---|---|---|---|
| "Kit chave Torx T6 T8 T10 P/ Abrir Ps3…" | `PART_STRONG` (`dimensions.ts:165`) tem `ferramentas?` mas o título não a usa. | Acrescentar `\btorx\b\|\bchaves? (?:de )?(?:fenda\|philips\|allen\|estrela)\b\|\bkit chaves?\b\|\b(?:p\|para) abrir\b\|\bdesmontar\b`. | 6 masters (1 com oferta). 0 falso positivo (não usei `chave` solta: "chave de ativação" é código digital). |
| "Host De Jogo Disco Rígido Externo HDD Gabinete … Caso Para Xbox Série X & S" | `armazenamento` (`dimensions.ts:184`) trata qualquer `hdd/disco rigido` como acessório válido. É um gabinete vazio, sem capacidade. | `armazenamento` só vale com capacidade (`\d+ ?(gb\|tb)`) ou `cartao de memoria/memory card`; `(gabinete\|caso\|case\|caixa\|enclosure\|caddy) + (hdd\|disco rigido\|ssd)` sem capacidade -> `part` motivo `gabinete_hd`. | 1 master pego, 0 falso positivo no catálogo inteiro. |
| 2 "Controlador … Switch Pro … Logotipo NFC / Despertar NFC" (R$ 248,70) | `CLONE_RE` (`dimensions.ts:336`) só cobre "clone", game stick, retro. | Frase de clone: `\bcontroladores? (?:universal\|para nintendo switch pro)\b.*\b(?:nfc\|wake ?up\|despertar\|logotipo)\b`. | Pega os 2. **Não** usar lista de marcas permitidas: testei e ela marcaria 69 de 184 controles públicos (Xbox/PS "sem marca" legítimos) como clones. A decisão 4 do dono (lista permitida) precisa de uma lista de marcas curada pelo dono, não de heurística. |
| PS Portal em 3 masters | Substantivo que vem primeiro decide (`dimensions.ts:284`). | `\bplaystation portal\b\|\bps portal\b` -> `accessory` com precedência sobre `console`, e fundir os 3 (ver F-02). | 3 masters, 28 ofertas ativas. |

- **UPDATE no banco: não** para as regras (leitura). **Sim** para a fusão do PS Portal (entra no plano explícito de F-02).

### F-07. Teclado, óculos, peça e "Gta 5" em Altas e Baixas

**[DADO] Causa raiz:** `getTopMovers` (`src/server/queries/price-history.ts:615-690`) lê `affiliate_offers` + `master_products` e não chama `catalogDimensionFilter`/`catalogHiddenFilter` (que existem em `src/server/queries/catalog-dimensions.ts:58-72`). Ele também não filtra `game_format`.
- Reproduzi as 6 combinações período x direção (24h, 7d, 30d; alta/queda), top 30 de cada. Fora da cartela em 5 das 6: "Teclado Mecânico Gamer", "Óculos Motorhomestore Fallout" (`brinde_diverso`), "Borrachas Condutivas Tech" (`condutiva_flat`), "Gta 5" (digital), "Pc Gamer Gta 5…", "Pokémon Brilliant Diamond (Digital)", "Halo: Campaign Evolved Premium (digital)", "Controle Para Jogos Bluetooth Usb 3 Em 1" (`acessorio_sem_plataforma`). 1 a 5 itens do top 30 em cada.
- "dois Gta 5": são o master digital `07c06d49` (R$ 169,90, fora da cartela) e o master PS4 físico `10072eb7` (R$ 119,90, legítimo mas duplicata provável da Premium, F-02).

**[RECOMENDAÇÃO]** Em `getTopMovers`, adicionar `AND ${await catalogHiddenFilter(sql\`mp.id\`)}` (e o filtro de formato digital da seção F-04) no `WHERE` final. Teste de aceitação: executar as 6 combinações e conferir 0 itens fora da cartela. **UPDATE no banco: não.**

### F-16. Plataforma derivável do título

**[DADO]** Universo: 128 jogos públicos com oferta e plataforma `unknown` (de 1.211). Em todo o catálogo: 522 jogos `unknown`; a regra atual deriva 18.

| Pista no título | Masters | Enum atual cobre? |
|---|---|---|
| 3DS 12, DS 8, Wii 5, Wii U 3, PS3 11, PS2 6, SNES 3, N64 2, GBA 1 | 51 | **Não** |
| Xbox 360 (4) + "Xbox X" (1: "GTA V … Xbox X") | 5 | Sim (`xbox_360`, `xbox_series`); o "Xbox 360" já deveria derivar: gravados `unknown` antes da regra |
| PC (1) | 1 | Não (fora da cartela de consoles) |
| Sem pista no título | 71 | Maioria são acessórios/consoles tipados como `game` (Forza Horizon 6 etc.) e alguns jogos de fato sem plataforma ("Resident Evil 6 (Físico)", "God of War: Ascension", "Final Fantasy XV") |

- 57 de 128 (44%) trazem a plataforma legada; o número 89 da auditoria é outro recorte (tabela inteira, que inclui masters fora do conjunto que medi); a ordem de grandeza é a mesma.
- **Causa raiz:** `derivePlatformFromTitle` (`game-classification.ts:43-87`) só devolve valores do enum. `xbox x` não é reconhecido (`/xbox\s*series|\bseries\s*[xs]\b|\bxsx\b/`).
- **Regra proposta:**
  1. `xbox\s*[xs]\b` (e "Xbox X|S") -> `xbox_series` quando não houver "one". Validado: 1 caso, GTA V Xbox X.
  2. Nova coluna textual/atributo `legacy_platform` ou novos valores de enum (`wii`, `wii_u`, `ds`, `3ds`, `ps3`, `ps2`, `snes`, `n64`, `gba`). A segunda é uma migration (`ALTER TYPE game_platform_gen ADD VALUE`, irreversível e visível ao Drizzle).
  3. Plataforma do ML estruturada (`CONSOLE_VERSION`) tem prioridade; título só quando faltar.
  4. Plataforma `unknown` continua bloqueando fusão automática, como hoje.
- **UPDATE no banco: SIM** (51 a 57 masters: `UPDATE master_products SET game_platform_gen = :p WHERE id = :id`). Dry-run: SELECT de `id, name, game_platform_gen, derivePlatformFromTitle(name)` com `WHERE game_platform_gen = 'unknown' AND product_type = 'game'` e contagem esperada por plataforma; transação única; reversível por `id`. Precondição: decisão do dono sobre quais plataformas legadas fazem parte da cartela (hoje a cartela de acessórios exige plataforma de console no título e o filtro público da tabela só lista as 6 gerações atuais, `tabela-de-precos/page.tsx:22`).

### F-20. Busca por palavra do título em vez de dimensão

**[DADO]** Termo "console": 105 masters públicos (94 consoles, 6 acessórios, 5 jogos); aba Consoles: 108 masters com oferta ativa neste instante (a tabela do site mostrou 56 e 79; os números mudam conforme o filtro de preço/loja; o que importa é que o termo atravessa abas). Os 5 jogos: "Transport Fever 2 Console Ed", "Football Manager Console 2024", "Mortal Kombat 1 Para Console", "Company Of Heroes 3 Edição Console", "Videogame Resident Evil 2 Console Xbox One". Termo "controle": 191 masters (173 acessórios, 17 consoles, 1 jogo: "Madden NFL 19 Controle Real Player Motion").
- **Causa raiz:** `search-products.ts` casa o termo contra o título e só então separa por aba; as palavras "console" e "controle" são ao mesmo tempo nome de dimensão e palavra de título. A regra de dimensão por substantivo (`dimensions.ts:283-297`) corrige o jogo tipado como console, mas não impede um jogo de ter a palavra no título.
- **Regra proposta:** na busca, reconhecer termos de dimensão (`console(s)`, `controle(s)`, `acessório(s)`, `jogo(s)`) como filtro de aba quando são a ÚNICA ou a principal palavra da consulta, e não como termo de título; para consulta composta ("controle ps5"), a palavra de dimensão restringe a aba e o resto casa o título. Teste de aceitação: "console" retorna 100% da aba Consoles (nenhum jogo); "controle" em Jogos retorna 0.
- **UPDATE no banco: não.**

### F-21. Cobertura de Tears of the Kingdom e Mario Kart 8 Deluxe

**[DADO]**
- Os masters existem: 27 de TotK e 20 de MK8D, a maioria com `act = 0`. "Mario Kart 8 Deluxe - Nintendo Switch" tem 16 ofertas, todas `expired` em 31/10 (15 placeholders de catálogo ML distintos, `miss = 0`, `last_checked_at` 31/10). TotK: 6 ofertas `expired` e 5 ativas só na Collector's Edition.
- Status global: 7.890 ativas, 8.120 `expired`. Em 31/10 expiraram 3.886 ofertas da Shopee (lote) e 71 do ML; em 01/11, 160 do ML. Zero `consecutive_miss_count` nos casos de MK8D, ou seja, não expiraram pelo caminho normal de "sem vendedor" (`collect-prices.ts:427-434`).
- Há duplicação grande por trás: MK8D tem pelo menos 8 masters de jogo distintos ("Mario Kart 8 Deluxe - Nintendo Switch", "Super Mario Kart 8 Deluxe… Original", "Jogo Nintendo Switch Mario Kart 8", variantes de importação) que também são F-02, com dedup que não os junta porque `ingles`, `japao`, `importado` são marcadores.
- **[INFERÊNCIA]** a expiração em massa de 31/10 coincide com a limpeza de `prune-*`/`expirar-shopee`; não consegui provar a origem com leitura. **Dado que falta:** log de execução de 31/10 e resposta da API oficial do ML para `MLB…` de MK8D e TotK (há vendedor ativo agora?).
- **Recomendação:** (1) lista de títulos obrigatórios por plataforma com alerta de cobertura (a lista é decisão do dono/produtor; começar com 30 títulos); (2) antes de reativar ofertas expiradas, rodar a guarda de F-01 (para não reativar vínculo errado); (3) reativação por regra do coletor, nunca por UPDATE manual de status.
- **UPDATE no banco: não neste item.** Reativar ofertas é papel do coletor (`collect-prices.ts:401-406` já reativa `expired` -> `active` quando volta a achar vendedor).

---

## 3. Riscos

1. **Fundir errado é irreversível para o usuário**: média única nova esconde diferença de SKU (825 GB x 1 TB, bundle, edição limitada). Mitigação: só o plano explícito aprovado pelo dono; log reversível (o script atual já grava).
2. **Estender a dedup a consoles sem tratar capacidade** faria o próprio defeito do `dedup.ts:96-97` fundir PS5 825 GB com 1 TB.
3. **Classificador por regex vira whack-a-mole**: cada achado soma uma regra. Risco de falso positivo cresce; o `scripts/test-dimensions.ts` precisa de todos os casos desta rodada (positivos e negativos: "G.O.R.E.", "S.T.A.L.K.E.R. 2", "Galactic Trials", "Console PlayStation 5 Slim Digital", controle Xbox sem marca).
4. **Ponto cego do F-01**: 1.722 ofertas ativas sem placeholder não podem ser auditadas por título.
5. **Estatísticas de produto contaminadas** continuam publicadas até o UPDATE de F-01/F-02 e a revalidação do cache (`affiliate-offers`).
6. **Migration de enum (F-16)** é irreversível; fazer só com decisão de cartela.
7. Dois defeitos de dados descobertos de passagem: master `1193e028` (PS5 Slim) gravado como `ps4`; `5f0aa71a` (PS4 Slim + 2 controles) gravado como `accessory`. Ambos entram no plano.

---

## 4. Recomendação em passos

Ordem por risco/benefício. Nenhum passo foi executado.

1. **Regras de leitura (sem banco), 1 PR:** F-03 (colapso para `desbl`, `jogos_a_escolha`, `disco_demo`), F-04 (remover opção; `gameFormat` no classificador; `(digital)`), F-06 (Torx, gabinete HD, clone NFC, PS Portal), F-07 (`catalogHiddenFilter` em `getTopMovers`), F-20 (termos de dimensão na busca). Adicionar todos os casos positivos e negativos ao `scripts/test-dimensions.ts`. Responsável: engenheiro-backend + guardiao-catalogo; QA: qa-verificador.
2. **Normalização (`dedup.ts`):** remover `®™©`; alias `grand theft auto v|gta v` -> `gta 5`; ruído `formato|euros|cd projekt red|projekt red`; dedupe de tokens do núcleo; `xbox x` em `derivePlatformFromTitle`. Teste: 2 clusters novos, 0 falso positivo (medido).
3. **Chave de console** (família, capacidade, disco/digital, conteúdo) como nova função pura em `dedup.ts`, só para REVISÃO, nunca fusão automática; saída = lista para o dono aprovar.
4. **Guarda do vínculo (F-01):** `verifyOfferBelongsToMaster` em `collect-prices.ts` (alerta, não bloqueia na primeira versão) + script de auditoria diário (SELECT) que lista conflitos. Meta: 0 conflitos.
5. **Dry-run de correção de vínculo (F-01):** script `scripts/relink-conflicting-offers.ts` (padrão dry-run) com as 65 ofertas e o destino por oferta; exige backup recente; o dono aprova a lista; só então `--apply`.
6. **Plano explícito de fusão (F-02):** `scripts/merge-explicit-plan.ts` (padrão dry-run) com os grupos "Fundir" da tabela de F-02. Corrigir antes `1193e028` -> ps5 e `5f0aa71a` -> console.
7. **F-16:** decisão do dono sobre plataformas legadas; migration do enum; dry-run de UPDATE por plataforma; só depois executar.
8. **F-21:** lista de títulos obrigatórios (dono) + alerta de cobertura; investigar o lote de expiração de 31/10 com `engenheiro-coleta` e `cientista-dados-tempo-real`.
9. **Reprocessar estatísticas** dos masters afetados (Metroid, Nintendo Land, SFV, SF6, RE2/RE3, Kiwami, GTA V Xbox X, Moving Out, PS5 Slim, PS4 Slim, Xbox One S) e revalidar cache; QA com busca por "ps5 slim digital", "ps4 slim 1tb", "xbox one s 1tb", "gta v ps4", "resident evil 3", "nintendo land", "street fighter 6": 1 card por edição.

Dependências de outros especialistas: dba-postgres (migration, transação, backup), engenheiro-coleta (guarda em `collect-prices.ts`, lote de expiração), especialista-precos/estatistico-senior (recalcular média/mínimo após fusão; F-11/F-12/F-13 distorcem a média de `1193e028`/`22c09745` mesmo depois de fundir), gamer-veterano (edições: GTA V sem marcador, "Remake" em RE2/RE3/RE4, cor de console).

---

## 5. Dado que falta

1. Log/origem do vínculo de 12/08 (dedup antiga x extração manual no admin).
2. Título real do item na API oficial do ML para as 1.722 ofertas sem placeholder (e atributos `EDITION`, `CONSOLE_VERSION`, `GTIN` dos catálogos).
3. `CONSOLE_VERSION` dos masters Cyberpunk `unknown` (`440d2bdd`, `7ca37f56`) e de GTA V Xbox X (`deb76eb3`).
4. Log de 31/10 que expirou 3.886 ofertas Shopee e as do ML de MK8D/TotK.
5. Decisões do dono: (a) cor de console distingue SKU? (b) plataformas legadas (PS2, PS3, Wii, 3DS…) fazem parte da cartela? (c) PS Portal: console ou acessório? (d) "Gta 5" sem marcador é a Premium? (e) lista permitida de marcas de controle (decisão 4 da auditoria) e como tratar "Doubleshock/clone" sem marca (13 ofertas num só master); (f) lista de títulos obrigatórios.
6. Reconciliação do número 89 de F-16 e das contagens 56/79 de F-20 com a tabela pública (não reproduzi o filtro de preço/loja da UI).

---

## 6. Métrica

| Métrica | Hoje (medido) | Meta | Como medir |
|---|---|---|---|
| Ofertas ativas com título de catálogo em conflito com o master | 65 (7 masters) | 0 | Script de auditoria diário (SELECT) |
| Clusters de duplicata automática em jogos | 0 (regra atual) + 2 que a regra não vê | 0 após aliases | `analyzeDuplicates` + `scripts/dry-run-dup-report.ts` |
| Consoles duplicados (mesma chave família/capacidade/disco/conteúdo) | ~10 clusters (≥ 25 masters) | 0 | Chave de console proposta |
| Itens fora da cartela nas 6 combinações de Altas e Baixas | 1 a 5 em cada top 30 | 0 | Rodar `getTopMovers` e classificar |
| Masters públicos com `game_format = 'digital'` | 3 | 0 | SELECT + `catalogDimensionFilter` |
| Opção "Mídia Digital" no filtro | presente | removida | Teste de UI |
| Jogos públicos com plataforma `unknown` e plataforma presente no título | 57 de 128 | 0 | `derivePlatformFromTitle` ampliado vs coluna |
| Consoles/acessórios com termo de dimensão em aba errada na busca | 5 jogos em "console"; 1 em "controle" | 0 | Busca por termo x aba |
| Masters de títulos obrigatórios com ≥ 1 oferta ativa | TotK e MK8D (físico) sem oferta ativa | 100% da lista | Lista de cobertura (a definir) |
| Falsos positivos do classificador no `test-dimensions.ts` | 0 de 100 | 0 de 100 + os casos desta rodada | `npx tsx scripts/test-dimensions.ts` |
