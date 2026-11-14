# Inventário de barreiras: o que impede um item de entrar, ter preço extraído, entrar na série e aparecer (2026-11-14)

Pedido do dono (14/11): "a única restrição é não seguir produtos usados e retrô; vamos colocando os itens no banco; sempre que for colocar barreira na extração de preço, me fale antes; não mudar a estrutura de nenhum indicador; grupos só com produtos iguais".
Tudo abaixo foi lido do código (arquivo:linha) e medido no banco em 2026-11-14 (SELECT somente leitura). **Nenhuma barreira (b) foi removida ou alterada**: só listada para o dono decidir.

## 0. Resposta curta: o preço é extraído mesmo quando o item não aparece?
**Sim, para quase tudo.** Ofertas ATIVAS cujo master está rejeitado ou em revisão continuam sendo lidas pela coleta: das 3.416 ofertas ativas de masters rejeitados, 3.393 (99%) foram checadas nas últimas 24 h; das 2.948 de masters em revisão, 2.892 (98%). Ou seja, o gargalo é de **exibição, média e mensagem**, não de leitura do preço. Exceções, onde a barreira é de **extração/gravação** de fato (seção 2):
- **Plausibilidade de preço** (preço fora de 35% a 300% da mediana não entra na série: a Shopee grava em quarentena, a Amazon descarta).
- **Cadastro**: o item que o porteiro rejeita nem vira master (logo nem oferta), e o que ele deixa em revisão nasce sem aparecer.
- **Link de afiliado pendente** (Mercado Livre): a oferta existe e é lida, mas não é pública.

## 1. (a) Barreiras permitidas pelo dono: usado e retrô
| # | Barreira | Onde | Itens hoje |
|---|---|---|---|
| a1 | Plataforma retrô/fora de linha em JOGO (PS1-3, PSP/Vita, Xbox 360/One, Wii/Wii U, DS/3DS, GameCube, N64, SNES/NES, Game Boy, Sega, Atari) | `src/lib/catalog/gate.ts:165-189` (RETRO_CONSOLE, RETRO_GAME_PLATFORM, `mentionsRetroPlatformOnly`), aplicado em `:259-263` | 496 masters rejeitados (75 ofertas ativas) |
| a2 | Console retrô / fora de linha / PS4 aparelho (decisão de hoje) | `gate.ts:251-257`, `src/lib/catalog/console-videogame.ts:57-59` (RETRO), regra do PS4 na mesma função | 29 masters retrô + 76 fora de linha (106 ofertas ativas) |
| a3 | Usado, seminovo, recondicionado, Open Box no título | `gate.ts` (NOT_ORIGINAL/condição), `src/server/collector/cobertura-shopee.ts:536` (`isUsedCondition`), vitrine `src/lib/vitrines/regras.ts:237` (`condicao_nao_nova`), identidade da oferta `src/lib/affiliate/offer-identity.ts` + `src/server/queries/public-offers.ts:50-90` (fora de média/vitrine, nada apagado) | 32 masters rejeitados por "usado" (34 ofertas); ofertas usadas/Open Box ficam no banco fora da média |
| a4 | Foto com mão / sinais de uso = provável seminovo (decisão de hoje) | `scripts/aplicar-foto-com-mao.ts` (grava `catalogGate=rejected`) | 85 masters (280 ofertas ativas) + 9 por sinal de uso |
| a5 | Plataforma fora de linha / retrô na vitrine e na mensagem | `regras.ts:178-181`, `src/lib/messaging/group-rules.ts:1168-1183` (`isOutOfLine`) | (mesmos itens de a1/a2) |

**Lacuna de usado encontrada hoje (para o dono decidir se cobrimos):** o filtro de usado lê só o TÍTULO. Nas páginas de Granblue Relink Endless Ragnarok (ASIN B0H2NCHDPH) e Octopath Traveler Switch 2 (B0H8Q5JK5Y) o box de compra ativo era "**Usado - Como novo, vendido por Amazon Quase Novo**", e o título era limpo. Por isso esses dois **não foram cadastrados** (LEGO Batman B0G6QNXFG8 foi: botão de compra e sem linha de usado). Recomendação: tratar "Amazon Quase Novo / Usado - Como novo" lido na página do item como usado (barreira de usado, permitida). Não implementei sem sua decisão porque é uma regra nova de extração.

## 2. (b) Demais barreiras, por camada
Recomendação: **manter** (M), **relaxar** (R), **remover** (X) ou **revisar** (V, depende de decisão de produto). "Ofertas" = ofertas ativas hoje.

### 2.1 Entrada no banco (cadastro do master)
| # | O que barra | Onde | Itens hoje | Rec. |
|---|---|---|---|---|
| b1 | Item miúdo (peça, cabo, grip, capa, base/suporte, objeto 3D, brinde) | `gate.ts:245-248` + `src/lib/catalog/item-miudo.ts`; vitrine `regras.ts:229` | 643 (por cabeça) + 26 (por termo) + 51 + 46 ambíguos = 766 masters, ~1.4 mil ofertas | M (decisão sua de 13/11; confirme) |
| b2 | Jogo digital / "(digital)" / formato digital | `src/lib/catalog/dimensions.ts:500` (digital_parenteses), `digital_formato` | 116 + 35 masters (172 ofertas) | V (hoje só físico; é barreira de produto, não de usado) |
| b3 | Não original: clone/compatível de controle, destravado/modificado | `gate.ts:101-121` (NOT_ORIGINAL), `:214` | 113 + 34 clones + 73 destravados = 220 masters (245 ofertas) | M (não é o produto original) |
| b4 | Fora do escopo de games: periférico de PC, teclado, mobiliário, reparo, botão/gatilho, analógico, brinde | `dimensions.ts:167-178` e vizinhas | 103 + 84 + 53 + 59 + 43 + 31 + 29 + 24 + 25 + acessório sem plataforma 107 | M/V (são outras categorias; decida se algum vira departamento) |
| b5 | **Master em revisão do porteiro**: nasce sem aparecer até alguém decidir | `gate.ts` (review), `src/lib/catalog/vertical/gate.ts:146` | **1.515 masters (2.948 ofertas)**: 759 `semeadura_vertical_aguardando_conferencia`, 258 `geracao_ambigua` (`gate.ts:430`), 181 jogo sem plataforma/formato (`gate.ts:361`), 120 headset sem plataforma (`gate.ts:270`), demais | **R**: é a maior barreira que não é usado/retrô. Sugestão: o que não tem sinal de usado/retrô entra aprovado (como já feito para a promoção) |
| b6 | Amazon: master novo da vitrine geral sempre em revisão e oferta em rascunho | `src/server/collector/amazon-vitrine.ts:257` (caminho geral); a descoberta por promoção foi liberada hoje (`ativarNovoAprovado`) | 66 rascunhos Amazon de 2.829 ofertas | **R**: estender o mesmo critério ao caminho geral (sua decisão) |
| b7 | Jogo sem plataforma conhecida no título | `cobertura-shopee.ts:543` (`sem_plataforma`), `regras.ts:44` (`plataforma_unknown`) | (dentro de b5) | M (sem plataforma não dá para agrupar) |

### 2.2 Extração e gravação do preço
| # | O que barra | Onde | Itens hoje | Rec. |
|---|---|---|---|---|
| b8 | **Plausibilidade**: preço < 35% ou > 300% da mediana das cotações ativas do mesmo produto (com ≥ 2 referências) não é gravado | `src/server/collector/price-plausibility.ts:7-12`, usado em `amazon-assisted.ts:222-223`, `amazon-vitrine.ts:214`, `collect-shopee-prices.ts:200`, `ampliar-amostra-shopee.ts:490`, `cobertura-shopee.ts` (a Shopee põe em quarentena; a Amazon descarta) | não medível por SELECT onde descarta; 123 ofertas em quarentena onde grava com marca | **R**: é a única barreira de EXTRAÇÃO de preço pura. Descontos reais acima de 65% são descartados em vez de guardados. Sugestão: sempre gravar com marca de quarentena (como a Shopee já faz) para o preço entrar na série bruta e ficar fora da média até conferência |
| b9 | Quarentena de preço absurdo: oferta e cotações saem de ofertas públicas, estatística e histórico | `public-offers.ts:50-90` (`quarantined_at`), `notQuarantinedSql :82` | 123 ofertas ativas | V |
| b10 | Link de afiliado pendente: oferta lida, mas não pública | `src/server/vitrines/pool.ts:50` (`affiliate_link_pending = false`) | 911 ofertas ativas (links meli.la a trocar) | M (o loop de links resolve) |
| b11 | Identidade da oferta duvidosa na Amazon (`judgeGame` manda para rascunho) | `src/server/collector/amazon-assisted.ts:184-191, 229-237` | parte dos 66 rascunhos | M |

### 2.3 Série, média, selo e indicadores (estrutura NÃO alterada)
| # | O que barra | Onde | Efeito | Rec. |
|---|---|---|---|---|
| b12 | Selo/veredito só com 5 cotações e 14 dias | `src/lib/affiliate/price-verdict.ts:11-13` | sem base: aparece sem selo (presença) | M (é o indicador; não mexer) |
| b13 | Faixa "em linha" ±5% | `price-verdict.ts:15` | define abaixo/acima | M |
| b14 | Ofertas fora da média: usadas/Open Box, geração ambígua, `avg_excluded_at` | `public-offers.ts:93-99`, migração 0044 | 19 ofertas ativas fora da média | M |
| b15 | Piso de plausibilidade 35% da mediana (≥ 3 ofertas) e zona de suspeita 50% (sem selo de menor registrado sem corroboração) | `price-verdict.ts:26-34`, `public-offers.ts:173-180` | tira o preço baixo demais do público | V |
| b16 | Oferta pública exige leitura de até 7 dias | `price-verdict.ts:24`, `public-offers.ts:159-163` | 0 ofertas ativas acima de 7 dias hoje | M |
| b17 | Vendedor fraco (reputação vermelha/laranja): fora do preço exibido e da corroboração; se for a única, o produto some | `pool.ts:145-149`, `regras.ts:242`, `price-verdict.ts:175` | 877 ofertas ativas | V |

### 2.4 Front (vitrines)
| # | O que barra | Onde | Rec. |
|---|---|---|---|
| b18 | **Teto de queda de 50%**: queda acima de 50% sobre a média some da vitrine (tratada como erro de coleta) | `regras.ts:27, 256, 261` | **R**: é o desconto grande que o público procura. Sugestão: mostrar sem selo, com "confirme no site", em vez de esconder |
| b19 | "Acima do normal" exclui do front (também em modo presença) | `regras.ts:255, 260` | V |
| b20 | Mínimo de 4 itens por faixa; abaixo, a faixa some | `regras.ts:13` | V (você escolheu completar com Amazon como oferta) |
| b21 | Sem imagem; embalagem avulsa; edição DLC/upgrade; console que não é aparelho | `regras.ts:217-241` | M |
| b22 | Frescor de leitura: destaques 6 h, demais 24 h (Amazon 24 h nos departamentos) | `regras.ts:28-30`, `src/lib/catalog/departamentos.ts` | V (depende de o Chrome estar de pé para a Amazon) |
| b23 | Só destaques e menor registrado exigem base de preço | `regras.ts:368` | M |

### 2.5 Mensagens
| # | O que barra | Onde | Rec. |
|---|---|---|---|
| b24 | Oscilação de preço (≥ 3 trocas em 24 h) e link sem conferência (ML sem id do anúncio) | `src/lib/messaging/price-guard.ts`, `live-recheck.ts` (commit 2556b66) | M (criadas por você em 14/11 para o caso P2S) |
| b25 | Desconto acima de 45% da média ou queda acima de 45% = retido; verde até 30% | `group-rules.ts:52-61, 1161-1167` | V |
| b26 | Preço < 0,35x ou > 3x a mediana das ofertas = retido | `group-rules.ts:57-58, 1163-1164` | V |
| b27 | Fora de escopo: tipo, plataforma desconhecida, porteiro review/rejected | `group-rules.ts:1183-1186` | M |
| b28 | Região no título/master (importado) | `group-rules.ts:457-461` | M |
| b29 | Cupom da Amazon barrado (guardNetwork); promoção Prime tem caminho próprio atrás de flag | `group-rules.ts` + `GROUP_PROMO_PRIME` | V (flag desligada) |
| b30 | Cotas e cooldown: mesmo produto 8 h (exceção: nova queda ≥ 5% após 120 min), tipo ≤ 2 por hora, N1 ≤ 6 por dia | `group-rules.ts:188-216` | V |

## 3. Grupos de produtos iguais (decisão registrada, sem mudança)
Confirmado no código e na memória: **região, geração cruzada, edição limitada, formato e capacidade separam masters; cor junta; Open Box fica fora da média.** Nada do que foi feito hoje altera isso: a descoberta por promoção usa o mesmo `casarJogo` + `findExistingMasterProduct` + `acharGameMasterPorChave` (dedup existente) antes de criar um master novo, e nenhuma estrutura de indicador (média por oferta/dia, selo 5 cotações e 14 dias, menor preço) foi tocada.

## 4. O que foi feito hoje nesta frente
- Descoberta por promoção (games, Amazon): master novo aprovado pelo porteiro segue para a ingestão da Amazon e nasce com oferta ativa; usado e retrô barram; o resto da vitrine geral não mudou (teste `scripts/test-promo-descoberta-ativa.ts`).
- LEGO Batman: O Legado do Cavaleiros das Trevas (Switch 2, ASIN B0G6QNXFG8): master criado e 1 oferta ativa a R$ 452,65 (preço de prateleira).
- Granblue e Octopath Traveler (Switch 2): **não cadastrados** (box atual "Usado - Como novo"); voltam quando a página mostrar oferta nova. Script: `scripts/promo-descoberta-dryrun.ts` (`--so=ASIN` e `--apply`).

## 5. Decisões que dependem do dono (resumo)
1. **b5 e b6**: liberar masters em revisão (1.515) e o master novo da Amazon sem sinal de usado/retrô?
2. **b8**: gravar preço implausível em quarentena em vez de descartar?
3. **b18**: mostrar queda acima de 50% sem selo em vez de esconder?
4. **Usado pela página** ("Amazon Quase Novo"): cobrir como usado?
5. **b2** (digital) e **b17** (vendedor fraco): manter?
