# Parecer do Gamer Veterano: Vitrine de Ofertas segmentada (/ofertas)

Data: 2026-11-01. Rotulagem: [REAL] = lido no código; [HIP] = hipótese; [REC] = recomendação; [TESTE] = exemplo ilustrativo, não é dado do site.

## 1. Posição
Apoio com ressalvas. A segmentação por tipo e depois por fabricante/plataforma é exatamente como o gamer pensa. A ressalva é que ela só vale se a classificação de tipo e plataforma estiver correta. Hoje, uma prateleira com rótulo errado é pior do que uma prateleira misturada.

## 2. Leitura da situação
- [REAL] `page.tsx` (linhas 120-144): "Universo Nintendo Switch" e "Ecossistema PlayStation & Xbox" usam `isGameOrConsolePhysical`, que mistura console e jogo físico na mesma prateleira. O subtítulo da Nintendo promete "acessórios", mas o filtro os exclui. Isso é a mistura que o dono quer eliminar.
- [REAL] "Menor preço histórico" também mistura jogo e console, ordenado por desconto vs. média. Isso está certo como critério, mas deve ser fatiado por tipo.
- [REAL] `game-classification.ts`: o enum cobre switch_1, switch_2, ps4, ps5, xbox_one, xbox_series, xbox_360. Não há ps3, ps2, ps1, psp, vita, wii, wii_u, 3ds, ds, nem retrô/PC. Qualquer "playstation" genérico (PS3, PS2) cai em `unknown`. Título com duas famílias ou "PS4 / PS5" vira `unknown`, de propósito.
- [REAL] "Xbox One / Series X|S" cai em `xbox_series` (comportamento histórico). Para o gamer isso é aceitável em jogo cross-gen, mas errado para console e acessório.
- [REAL] Não há eixo fabricante no schema: a página testa `gamePlatformGen` direto. Fabricante deve ser derivado da plataforma, não armazenado em paralelo.

## 3. Seções e ordem (1)
Princípio: o gamer chega com intenção de tipo ("quero um jogo de PS5", "quero um Switch"), não de fabricante. Ordem proposta, cada uma com critério de entrada só com dado real:

1. **Ofertas do dia / Tá vendendo muito.** Entrada: ofertas ativas (`status='active'`, `current_price_cents>0`) com maior queda recente vs. média do produto. Sem "popularidade" inventada: se não há dado real de cliques/vendas, o nome da seção deve ser outro ("Maiores quedas agora"). [REC] Não chamar de "vendendo muito" sem métrica de venda real, é risco de claim falso para a comunidade.
2. **Menor preço já visto.** Entrada: `isLowestEver` real, vendedor elegível, mínimo de N cotações históricas (valor de N é decisão do estatístico; [HIP] amostra de 2 cotações dá "menor preço histórico" vazio). Fatiar em abas Jogos | Consoles | Acessórios, ordenado por desconto vs. média única do produto.
3. **Jogos por plataforma.** Abas: Nintendo (Switch 2, Switch), PlayStation (PS5, PS4), Xbox (Series X|S, One), PC, Retrô. Entrada: `productType='game'`, plataforma conhecida, mídia física preferida; digital/código em seção separada ou badge claro.
4. **Consoles por família.** Mesmas famílias, só `productType='console'` de console real (ver seção 4 abaixo). Ordenar por geração mais nova primeiro.
5. **Acessórios por plataforma.** Controle, headset, carregador, cartão de memória oficial, capa, etc. Subgrupo "Compatível com várias plataformas" para os universais.
6. **Retrô e colecionáveis.** Wii, Wii U, 3DS, DS, PS3, PS2, PS1, PSP, Vita, Xbox 360, Mega Drive etc. Só entra quando houver oferta ativa real; seção some se vazia (não preencher).
7. **Lançamentos/Hype.** Entrada: `release_date` real de fonte oficial/API e oferta ativa de pré-venda ou lançamento recente. [REC] Sem calendário real confiável, não criar a seção. Dependência: produtor-gamer-mundial e integrador-apis.

Fora o topo, evitar seção que misture tipos. Cada bloco com no máximo 8 cards e link "ver todos" já filtrado.

## 4. Taxonomia (2)
**Plataformas e gerações que o gamer espera:**
- Nintendo: Switch 2, Switch 1 (OLED/Lite são variantes de console, mesmo ecossistema de jogos), Wii U, Wii, 3DS/2DS, DS, GameCube, N64, SNES, NES, Game Boy.
- PlayStation: PS5 (disco e Digital Edition, Slim, Pro), PS4 (Slim, Pro), PS3, PS2, PS1, PSP, PS Vita.
- Xbox: Series X, Series S, One (S/X), 360, Xbox original.
- PC: jogo de PC físico é raro no Brasil; tratar como "PC" e separar de periférico de PC (teclado, mouse) para não virar acessório gamer de console.
- Retrô/outros: Sega (Mega Drive, Master System, Saturn, Dreamcast), Atari, Neo Geo. Fabricante = "Retrô/Outros".
- [REC] Geração é atributo da plataforma, fabricante é derivado. Fonte única: tabela plataforma -> fabricante/família.

**NÃO é console:**
- Clone / console retrô genérico ("Game Stick", "Video Game 10 mil jogos", "Console Retro 2 controles", Dendy-like, "X-Game", "Game Box"). Sem fabricante licenciado, vai para "Outros / Retrô genérico", fora da prateleira de consoles oficiais, ou fora da vitrine.
- Bundle de console + jogos + acessórios: pode ser console, mas com badge "Bundle", e NUNCA entra na média do console avulso (viola "um produto, uma média": edição distinta).
- Console "desbloqueado/modificado", "com jogos instalados": risco de pirataria e golpe de reputação; [REC] excluir da vitrine pública ou segregar.
- Peça de console (HD, fonte, leitor, carcaça, placa), capa e skin: acessório/peça, não console.

**NÃO é jogo:**
- Peça, capa/case, cartão de memória, stand/suporte, ventilador/cooler, controle, volante, "combo com baralho", carta/figure, amiibo (é colecionável/acessório), chaveiro, quadro, cabo, película, mochila, guia/estratégia (livro).
- Cartão pré-pago/gift card/assinatura (PS Plus, Game Pass, Nintendo Switch Online): é "serviço/crédito", fora de jogo e fora de acessório.
- DLC, Season Pass, upgrade pack: não são jogo base (o código já tem `UPGRADE_KEYWORDS`/`DLC_KEYWORDS`); não entram na média do jogo.
- Jogo digital/código: é jogo, mas formato digital; não misturar com físico na mesma média nem no mesmo card.

## 5. Pegadinhas (3)
- **Cross-gen (Xbox One/Series X na mesma caixa; PS4 jogável no PS5):** uma caixa, uma plataforma de catálogo. Regra [REC]: decidir por edição de mídia, não pela compatibilidade. "Xbox One / Series X|S" -> família Xbox, geração `xbox_series` (como hoje) mas com badge "One + Series". "PS4 / PS5" na mesma caixa é raro; o disco normalmente é PS4 e roda no PS5. Hoje vira `unknown`: [REC] mapear para ps4 com badge "roda no PS5" só se título trouxer explícito "PS4" e "PS5" e não houver produto PS5 separado; senão revisão manual. Divergência a registrar com guardiao-catalogo.
- **Smart Delivery:** o mesmo título comprado serve para One e Series (Xbox) e, em alguns casos, PS4/PS5. Não é duas plataformas, é uma. Termo deve ser reconhecido como cross-gen, não como "duas famílias".
- **Deluxe / Colecionador / GOTY / Complete / Ultimate:** edição diferente = `master_product` diferente (regra título+plataforma+edição). Edição Colecionador com estátua, steelbook e artbook não pode ser comparada com a standard. "Edição de Lançamento"/"Day One" geralmente é standard; é pegadinha de marketing.
- **Multiplataforma:** título igual em PS5/Xbox/Switch são três produtos. Nunca somar médias entre plataformas.
- **Switch 1 vs. Switch 2:** jogo "Nintendo Switch 2 Edition" é produto próprio; jogo Switch 1 roda no Switch 2 (retrocompat.), mas o contrário não. Capa japonesa/importado: badge de região.
- **Região:** jogo importado (US/JP/EUR) pode não rodar ou ser incompatível online; badge "importado" quando o título indicar.
- **Acessório multi-plataforma:** cartão microSD vale para Switch 1/2 (Switch 2 exige microSD Express; microSD comum não serve) e é diferente de memory card Vita (proprietário). Controle USB "para PC / PS4 / Switch" é universal. Regra do código para 2+ famílias devolver `unknown` está certa; [REC] criar plataforma-alvo "multi" em acessório em vez de `unknown`, e listá-lo no subgrupo "Compatível com várias plataformas".
- **Controle original vs. clone/paralelo:** Pro Controller, DualSense, DualShock 4, controle Xbox oficial são originais. "Controle compatível", "estilo", "genérico", "sem fio sem marca" são clones: [REC] manter em acessório, mas sem selo de menor preço histórico contra originais (média separada pelo título/marca, se a taxonomia permitir) para não induzir comparação enganosa. Dependência: especialista-precos e guardiao-catalogo.
- **Amiibo:** colecionável Nintendo; tipo próprio "colecionável". Se não houver tipo, vai para acessório com fabricante Nintendo, nunca para jogo.
- **Joy-Con:** acessório Nintendo Switch; Joy-Con de Switch 2 é incompatível com Switch 1 em dock/pareamento de forma geral [HIP, verificar fonte oficial].

## 6. Fabricante vs. plataforma, atalhos (4)
- O gamer pensa "plataforma" ("PS5", "Switch") para jogo e acessório, e "fabricante/família" ("Nintendo", "PlayStation") para navegação ampla. [REC] Filtro principal em dois níveis: chip de fabricante (Nintendo, PlayStation, Xbox, PC, Retrô/Outros) e dentro dele chips de plataforma/geração (Switch 2, Switch 1, PS5, PS4...). Fabricante sozinho como filtro final é largo demais: PS3 e PS5 são mundos diferentes de preço e relevância.
- Atalhos: "Só PS5", "Só Switch 2", "Jogos físicos", "Menor preço histórico", "Até R$ X" (faixa de preço sobre dado real). Chips persistentes na URL (compartilháveis).
- Nunca esconder `unknown`: criar triagem interna (admin), não mostrar como "Outros" ao público.
- Mobile: abas horizontais por tipo, chips de plataforma abaixo.
- Rótulos: "PS5", não "PlayStation 5"; "Switch 2" sem "Nintendo" repetido; "Xbox Series X|S".

## 7. Riscos
1. Classificação errada = prateleira errada (ex.: clone como console). Detectar com auditoria de amostra por seção antes de publicar (guardiao-catalogo).
2. Plataformas sem enum (PS3, PS2, Wii...) caem em `unknown` e a seção Retrô nascerá vazia ou errada. Detectar: contar `unknown` por título.
3. Seção "Tá vendendo muito" sem métrica real de venda: claim falso. [REC] renomear ou provar.
4. Bundle e edição especial contaminando média: viola regra "um jogo, uma média".
5. Prateleira com 1-2 itens parece vitrine morta: ocultar abaixo de um mínimo.
6. Uso de `unknown`/derivação do título: o título é a fonte; falhas aqui já causaram duplicatas (incidente 2026-07-29).

## 8. Recomendação (ordem)
1. Aprovar a taxonomia tipo -> fabricante -> plataforma/geração (tabela única, fabricante derivado).
2. Ampliar o enum de plataformas (ps3, ps2, ps1, psp, vita, wii, wii_u, ds_3ds, retro_outros, pc) antes de abrir a seção Retrô; rodar dedup com a nova taxonomia.
3. Separar consoles de jogos em todas as prateleiras; remover `isGameOrConsolePhysical` dos blocos de plataforma.
4. Excluir da vitrine: clones/genéricos, bundles com jogos instalados, peças; marcar bundle e edições com badge e produto próprio.
5. Renomear/provar "Tá vendendo muito".
6. Só criar "Lançamentos/Hype" com calendário oficial real.
NÃO fazer: preencher prateleira vazia com itens de outra categoria; criar fake para completar 8 cards; chamar clone de console; somar médias entre plataformas.

## 9. Dado que falta
- Contagem real no banco por (productType, gamePlatformGen) e quantos estão `unknown`.
- Fonte real de popularidade (cliques/vendas) para "mais vendido".
- Distribuição real de bundles e clones no catálogo ativo.
- Calendário oficial de lançamentos (API).
- Mínimo de cotações para o selo "menor preço histórico" (estatístico-senior).

## 10. Métrica de sucesso
- 0 itens de tipo errado em amostra auditada de 100 cards por seção (aceite: 100% de acerto no conjunto de teste abaixo).
- Redução de `unknown` e de cliques em "limpar filtro" / saídas imediatas.
- Taxa de clique por seção e por chip de plataforma (dado real de analytics).
- 0 duplicatas novas por título+plataforma+edição.

## 11. Conjunto de teste (5) [TESTE: exemplos ilustrativos de títulos no estilo do Mercado Livre, NÃO são dados do site]
Formato: título -> tipo / fabricante / plataforma. Deve ser validado em fixture, nunca importado para o banco.

1. "Jogo The Legend of Zelda Tears of the Kingdom Nintendo Switch Físico" -> jogo / Nintendo / Switch 1
2. "Mario Kart World Nintendo Switch 2 Mídia Física Lacrado" -> jogo / Nintendo / Switch 2
3. "Console Nintendo Switch OLED 64GB Branco" -> console / Nintendo / Switch 1 (OLED)
4. "Controle Pro Controller Nintendo Switch Original" -> acessório / Nintendo / Switch (1 e 2 compatível; checar fonte)
5. "Cartão de Memória MicroSD 256GB para Nintendo Switch" -> acessório / Nintendo / Switch 1 (microSD comum; Switch 2 exige Express)
6. "God of War Ragnarök PS5 Mídia Física" -> jogo / PlayStation / PS5
7. "Console PlayStation 5 Slim 1TB Edição Digital" -> console / PlayStation / PS5
8. "Controle DualSense PS5 Branco Original Sony" -> acessório / PlayStation / PS5
9. "Controle sem fio compatível PS4 genérico" -> acessório (clone) / PlayStation / PS4, sem selo contra original
10. "FIFA 23 PS4 e PS5 Mídia Física" -> jogo / PlayStation / ambíguo: revisão manual (hoje `unknown`)
11. "Forza Horizon 5 Xbox One e Series X|S Mídia Física" -> jogo / Xbox / Series (cross-gen, badge One + Series)
12. "Console Xbox Series S 512GB Branco" -> console / Xbox / Series S
13. "Headset Gamer Sem Fio Xbox / PS5 / PC" -> acessório / multi-plataforma / multi (subgrupo universal)
14. "Game Stick 4K 10 Mil Jogos 2 Controles" -> NÃO é console oficial: excluir ou "Retrô genérico"
15. "Console Mega Drive Tectoy 3 com 78 Jogos Na Memória" -> console / Retrô-Outros / Mega Drive (licenciado Tectoy; avaliar badge "versão nacional")
16. "Jogo Pokémon Ruby Game Boy Advance Cartucho" -> jogo / Nintendo / retrô (GBA)
17. "Combo Baralho + Jogo de Cartas Zelda" -> NÃO é jogo de videogame: fora da vitrine gamer ou colecionável
18. "Amiibo Mario Super Smash Bros Nintendo" -> colecionável (ou acessório) / Nintendo / multi-jogo; nunca jogo
19. "Suporte Stand Vertical + Ventilador para PS5 Slim" -> acessório / PlayStation / PS5
20. "Jogo God of War Ragnarök Edição Colecionador PS5" -> jogo / PlayStation / PS5, edição própria (produto diferente do standard); e "Kit Console PS5 + 2 Jogos" -> console bundle, com badge, média separada

## 12. Divergências a registrar
- Pode haver divergência com o guardiao-catalogo sobre `unknown` vs. "multi" para acessório universal.
- Pode haver divergência com o especialista-precos sobre a média separada para controle original vs. clone (minha posição: separar).
- Preferência de franquia/fabricante não vira regra; a ordem das plataformas segue dado real de oferta, não marca.
