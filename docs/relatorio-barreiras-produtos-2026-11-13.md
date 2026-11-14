# Barreiras que impedem produtos de todas as lojas de aparecerem (relatório dos agentes, 2026-11-13)

Pedido do dono: listar as barreiras, desbloquear a maioria e estruturar as regras de forma mais coerente. Quatro agentes em leitura (coleta, identidade e cesta, vitrine e elegibilidade, contratos e negócio). Todos os números foram medidos no banco em 13/11; o que não foi medido está marcado.

## Panorama
- 10.538 masters (games 7.077; eletrônicos 1.303; esporte 654; casa 654; tecnologia 430; livros 252; impressão 3D 168).
- Ofertas ativas: Mercado Livre 22.5 mil, Shopee 3,97 mil, Amazon 2,45 mil. Kabum, Magalu e AliExpress: zero.
- Masters por nº de lojas com oferta ativa: 0 lojas 1.616; 1 loja 5.565; 2 lojas 679; 3 lojas 111.
- A coleta está funcionando (3.892 masters novos em 3 dias). **O gargalo é o que aparece no site, não o que entra.**

## Barreiras, da que mais destrava para a que menos

| # | Barreira | O que esconde (medido) | Como destravar | Risco |
|---|---|---|---|---|
| 1 | **Base de preço (5 cotações e 14 dias) é exigida até para aparecer** (`regras.ts:250`, `price-verdict.ts:12`) | 1.829 de 2.588 jogos já aprovados (70%) | Separar **presença** de **selo**: sem base o produto aparece, sem selo e sem "abaixo do normal" | Baixo, se nenhum selo sair sem base |
| 2 | **Amazon fora dos departamentos** (`departamentos.ts:37`) | ~900 masters fora de games só com oferta na Amazon; por departamento (aprovados, frescos): Tecnologia 146, Casa 176, Eletrônicos 85, Esporte 62, Impressão 3D 36 | Liberar a Amazon só como oferta e menor preço, **sem mediana**; janela de 24 h só para a Amazon | Contratual (cache 24 h, histórico) |
| 3 | **Cadastros em revisão ou rejeitados com oferta ativa** | ~9.000 ofertas ativas (`review`: ML 6.166 e Shopee 124; `rejected`: ML 1.653, Shopee 1.053, Amazon 23); em games 1.426 masters pelo porteiro e 4.452 sem veredito | Triagem em lote só dos `review`, com critério determinístico (marca, modelo, plataforma) e backup; os `rejected` corretos (retrô, pirata, Xbox One) ficam | Baixo nos `review`; alto se promover `rejected` |
| 4 | **Fila de conferência dos departamentos** (`semeadura_vertical_aguardando_conferencia`) | 1.180 masters (eletrônicos 837, esporte 128, casa 107, tecnologia 68, livros 27, impressão 3D 13); Eletrônicos: 1.030 de 1.303 não aprovados | Rodar a aprovação automática v3 com backup, começando por livros com ISBN e esporte | Baixo se mantiver novo/em linha, identidade forte e oferta clicável |
| 5 | **Produto em uma loja só** | 5.565 masters (790 com 2 ou mais) | Rodada de busca cruzada por chave forte (GTIN, ISBN, código de modelo); recuperar o modelo na consulta da Shopee (hoje descartado de propósito) | Médio (sufixos de modelo parecidos) |
| 6 | **Vendedor fraco bloqueia o produto inteiro** | 96 jogos | Escolher a menor oferta **de vendedor não fraco** e só então avaliar | Baixo, melhora a confiança |
| 7 | **Ofertas do Mercado Livre expiradas ou pausadas** | 7.393 expiradas (5.180 sem check há 3+ dias), 1.353 pausadas; 1.899 masters sem oferta ativa | Reconferir por rodízio dentro do orçamento; reativar só com preço e check frescos | Baixo |
| 8 | **Rascunhos e fila de identidade parados** | 400 ofertas em rascunho (Shopee 329, Amazon 61, ML 10; algumas desde julho); 756 itens na fila; nenhuma decisão humana gravada | Decidir por **regra reaproveitável** (`identity_decisions.is_rule`) com log reversível; prazo para rascunho | Médio (regra ruim propaga erro) |
| 9 | **GTIN e MPN pouco preenchidos** | GTIN em 1.674 de 7.971 masters; MPN em 165 | Enriquecer pela API oficial; usar como chave só com GTIN exato e marca compatível | Baixo |
| 10 | **Link pendente (ML sem link rastreável)** em departamentos | Ofertas (não masters): casa 181, esporte 223, impressão 3D 167, livros 150, eletrônicos 105, tecnologia 89 | Terminar a troca para links `meli.la` | Baixo |
| 11 | **Desperdício de cota e tempo** | Catálogo do ML devolve 404 sem vendedor; 429 na semeadura de eletrônicos (10 de 111) e na Shopee; Shopee corta o tempo antes de zerar a fila (558 de 574 execuções) | Priorizar termos com menos 404, recuo e retomada após 429, dividir o lote por departamento | Nenhum |
| 12 | **Mínimo de 4 itens por vitrine** (`regras.ts:399`) | Consoles do Switch 2 com 3 e PS4 no limite | Aceitar 3 em consoles | Baixo |
| 13 | **Plataforma desconhecida e formato de jogo** | 112 jogos com plataforma `unknown` | Backfill pelo título e pela API; não afrouxar o limiar de identidade | Alto se afrouxar |
| 14 | **Frescor de 6 h em departamentos** | Casa ~107, esporte ~134, tecnologia ~86, eletrônicos ~53 | Manter 6 h para ML; só a Amazon pode ter 24 h | Baixo |
| 15 | **Barreiras de contrato e conta** | Amazon: API exige 10 vendas qualificadas, preço em cache só 24 h, histórico e média contrariam o contrato (risco já aceito pelo dono, sem pedido formal); ML: termos nunca lidos; Shopee: sem cláusula sobre histórico; AliExpress, Magalu, Kabum, Awin: sem cadastro nem pesquisa | Decisão do dono; ordem de destravamento abaixo | Alto (suspensão de conta) |

## Barreiras que devem ficar (não destravar)
Xbox One e 360 fora de linha (272), teto de 50% de queda (31, suspeitos de erro de coleta), item miúdo, retrô, console que não é aparelho (59), produto sem foto, "acima" nas faixas de destaque.

## Estrutura de regras proposta
Hoje as constantes estão em cinco lugares (`VITRINE_REGRAS`, `departamentos.ts`, `price-verdict.ts`, `pool.ts`, `get-vitrine.ts`) e as regras de identidade em quatro arquivos. Proposta:

1. **Um módulo único de exibição** (`src/lib/catalog/regras-exibicao.ts`) com **três degraus**:
   - **Presença (aparece):** oferta ativa e não pendente, fresca por loja (ML 6 h; Amazon 24 h), master aprovado e no escopo, com foto, plataforma conhecida e vendedor não fraco. Sem exigir base de preço.
   - **Rotulagem (selo):** 5 cotações, 14 dias, teto de 50% e dispersão. Só aqui saem "abaixo", "acima" e menor registrado.
   - **Destaque:** presença mais selo "abaixo" de pelo menos 5%, leitura de 6 h e mínimo de 4 itens (3 em consoles).
2. **Uma tabela única de identidade** com quatro ações: **separa** (região, geração, edição, formato, capacidade, modelo, pacote), **junta** (cor, ruído de texto, mesmo GTIN ou catálogo), **exclui da média mas mantém visível** (Open Box, usado, vendedor fraco, variante com spread alto, fora da cerca estatística, identidade incerta) e **fora do catálogo** (retrô, fora de linha, peças, itens miúdos). Motivos em vocabulário fechado.

Efeito esperado: cerca de 1.800 produtos de games a mais e de 36 a 176 masters a mais por departamento, sem selo sem base.

## Ordem de destravamento sugerida (até 27/11)
1. Degrau 1 (presença sem base) e escolha de oferta de vendedor não fraco.
2. Amazon nos departamentos só como oferta (decisão do dono até 17/11).
3. Triagem em lote dos cadastros `review` e da fila de conferência dos departamentos, com backup.
4. Busca cruzada por chave forte; reconferência das ofertas expiradas do ML; troca de links `meli.la`.
5. Depois da Black Friday: Magalu, Kabum, Awin e AliExpress; pedido formal à Amazon.

## Decisões do dono necessárias
A. Aprovar o desenho de três degraus (presença, selo, destaque).
B. Liberar a Amazon nos departamentos só como oferta e menor preço, sem mediana.
C. Autorizar a triagem em lote dos cadastros em `review`, com backup e rollback.
D. Mover celulares, tablets e relógios para Tecnologia.
E. Autorizar a execução por fases até 20/11, com o `qa-verificador` antes de cada deploy.
