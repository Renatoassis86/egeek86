# Loja de Impressão 3D em 3 seções e guia Plus das impressoras (#63 e #111), 2026-11-15

Commit 611e0f0. Rollback: `DEPT_3D_SECOES=off` na Vercel volta a página anterior de /mercado/impressao3d (padrão: ligada). `GROUP_PRIORIDADE_3D=off` continua desligando a prioridade em mensagens, cobertura e destaque.

## Desenho
- `/mercado/impressao3d` (vista padrão, sem busca, sem tipo, página 1): navegação por âncoras (Guia Bambu Lab, Impressoras N, Filamentos N, Demais itens N), guia no topo e 3 seções, cada uma com título, contagem e "a partir de" (menor preço). Cada seção mostra 8 cartões (mesmos cartões e mesma elegibilidade do departamento) e "Ver todos" para `?tipo=<seção>&ordem=menor` (lista paginada existente). `demais` = todo tipo que não é impressora nem filamento (resinas, secadores, lavagem e cura, ferramentas...), ainda sob as regras de só novo e sem item miúdo.
- Guia (`src/components/plus/guia-impressoras-3d.tsx`, dados em `src/server/queries/guia-3d.ts`, lógica pura em `src/lib/catalog/guia-3d.ts`): grade de 4 colunas; linha 1 = combos (P2S Combo, P1S Combo, A1 Combo, A1 Mini Combo, destacados), linha 2 = as avulsas logo abaixo da irmã (P2S, P1S, A1, A1 Mini); no celular a ordem vira a lista fixa do dono. Depois, Anycubic Kobra (até 4, por master). Cada cartão: foto real, menor preço entre ML, Amazon e Shopee (Shopee só quando há oferta), loja de origem, "verificado há X", preço por loja com link `/go/<slug>`, "sem oferta nesta loja agora" quando falta, menor preço registrado e variação (fonte única `product-price-stats`, só a conta; sem selo e sem média inventada). Combo e avulsa nunca se misturam; A1 ≠ A1 Mini; A1 e "A1 Bivolt" são o mesmo modelo.
- Elegibilidade: `departamentoClicaveisCtes` (publicOffers, porteiro aprovado, quarentena, link não pendente, frescor 24 h ML/Shopee e Amazon). Cache de 5 min (`guia-3d-v1`).
- Faixa Plus da home: destaque da Impressão 3D ordenado pela ordem do dono (consulta prioriza impressoras Bambu/Kobra antes do corte de 160 itens; chaves de cache v2/v5) e link "Guia das impressoras Bambu Lab" (`#guia`).
- Ordem fixa em `src/lib/messaging/prioridade-3d.ts` (`posicaoPrioridade3d`, `ordenarPorPrioridade3d`): fila de mensagens (desempate depois dos bloqueios), cobertura Shopee por master (`ampliar-amostra-shopee`), termos de semeadura (`config.ts`, `config-tipos.ts`).

## Verificado
- Testes: `scripts/test-guia-3d.ts` (49) e `test-impressao3d-prioridade.ts` (36), mensagens (217, 231, 91, 234, 39), `tsc --noEmit` limpo.
- Produção (Playwright próprio, requisições espaçadas): https://egeek86.vercel.app/mercado/impressao3d, 390x844 e 844x390, claro e escuro, sem overflow horizontal; âncoras e 8 cartões na ordem. Menores preços iguais ao SELECT de ofertas ativas: P2S Combo R$ 8.330,00 (ML; Shopee 9.399,00), P1S Combo 5.999,00 (Shopee 6.846,74), A1 Combo 3.899,99 (Shopee 4.273,00), A1 Mini Combo 3.239,00 (Shopee 3.599,00), P2S 6.799,00, P1S 4.699,00, A1 2.672,97 (Shopee 3.297,00), A1 Mini 1.906,99 (Shopee 2.318,00). Links `/go/<slug>` correspondem às ofertas.
- Prints: `docs/amostras-qa-home/s11-guia3d-*.jpg`.

## Depende de coleta
- Amazon: nenhuma oferta fresca (24 h) dos modelos (última leitura de 11 a 14/11): a guia mostra "sem oferta nesta loja agora". Depende de `amazon-vitrine`/coleta assistida (#81, #59).
- Shopee: sem P2S avulsa, sem P2S na Amazon; cobertura agora começa pelos combos.
- Menor preço registrado: aparece quando há estatística persistida do master (cartões sem leitura ainda não mostram a linha).
- Não incluído: cupons e desconto de cartão (item 2c, #112).
