# Plano passo a passo: tudo o que o dono pediu em 2026-11-13

Fonte única do que foi pedido no dia, com estado real (conferido no código, no deploy e no banco). Itens novos também entram em `docs/fila-de-execucao.md` (#50 a #52). Legenda: **feito** (no ar), **em andamento**, **decisão do dono** (bloqueia), **pendente**.

## A. Pedidos do dia e estado

| # | Pedido do dono | Estado | Onde está | Próximo passo |
|---|---|---|---|---|
| 1 | Organização do site: auditoria do front, benchmark, responsivo, performance, nova landing (vitrines por plataforma, Plus, inventário e checklist, gráfico de preço melhor) | **feito a Fase A atrás da flag** (`REDESENHO_HOME` em 0%, `?v=2` só admin) | fila #47, `docs/redesenho-site/CHECKLIST_NOVA_VERSAO.md` | QA #23 (falta a verificação visual), rollout #24 |
| 2 | Consoles só de video game, sem peças | **feito** (43 rejeitados com backup; ambíguos listados) | commit 1143ac5, `docs/backups/limpeza-console-lista-dono-*.md` | **dono** decide 34 ambíguos e 50 jogos tipados como console |
| 3 | Sem itens miúdos no banco (peças, cabos, grips, objetos 3D) | **feito** (677 masters rejeitados, regra R-50) | commits 19cf567, 358b12c | **dono** revisa 99 ambíguos |
| 4 | Plus resumido: só destaques de preço, uma faixa por departamento, uma abaixo da outra, sem WhatsApp | **feito** | `secao-plus-home.tsx` | nenhum |
| 5 | Seção de Contatos (Telegram, WhatsApp, telefone), e **só na aba Contatos, fora da página inicial** | **feito** | commit 2c71401, `/contatos` | nenhum |
| 6 | Etiqueta "abaixo da média" premium em todos os degraus e correção das sobreposições do cartão | **feito** | commits daf1d66, 8f419fe, 3ef8ad0 | conferir na tela (item 14) |
| 7 | Fotos para os cartões do Plus | **trocado**: sem imagem gerada por IA; cartão com a **foto real** do produto em destaque | commit 29c913f | nenhum (prompts viraram só referência) |
| 8 | Primeira página: uma faixa de jogos por plataforma e uma única faixa de consoles | **feito** (home nova, atrás da flag) | commit 189bf46 | vitrines vazias: ver item 15 |
| 9 | Projeto no Grok (título, descrição, instruções, contexto) e link da identidade visual | **feito** em conversa; **não existe** manual de marca publicado | resposta no chat | se o dono quiser, criar o "Manual de identidade" |
| 10 | Cartões de perfil do Telegram com o site no rodapé (8 cartões) e cartão quadrado de Tecnologia | **feito** | `docs/perfis-lojas/` (originais em `originais-sem-site/`) | **dono** envia ao Telegram |
| 11 | Paginação com a quantidade de páginas e Próxima no final | **feito** (mercado, busca, notícias, tabela de preços) | commit b808cc9, `src/components/ui/paginacao.tsx` | nenhum |
| 12 | Tecnologia sem notebooks e celulares ("só placa de vídeo") | **em andamento** (seção B) | fila #50 | seção B |
| 13 | Retirar os itens do AliExpress | **plano pronto** (seção C) | fila #51 | **dono** escolhe a opção |
| 14 | Verificação visual da home nova, tema escuro e celular | **pendente** (o Chrome não obedeceu à aba de teste) | — | **dono** manda prints de `?v=2` ou autoriza o Playwright (#32) |
| 15 | Vitrines vazias (consoles PS5 e Switch 2, PC, colecionáveis, Plus) | **decisão do dono** | `getVitrines` | esconder ou mostrar "sem ofertas agora" |
| 16 | Proteção contra ataques e invasões ("overlord") | **plano proposto, aguardando autorização** (seção D) | fila #52 | **dono** autoriza o item D1 |
| 17 | Vigia dos loops a cada 5 min e relatório a cada 6 h | **rodando** | crons do Claude | nenhum |

## B. Tecnologia: notebooks e celulares (#50)

Medido no banco (2026-11-13), masters por tipo:

- **Tecnologia (430 masters):** placa de vídeo 87, mouse 64, impressora 37, placa-mãe/gabinete 34, roteador 29, SSD/HD 19, teclado 19, **notebook 12**, monitor 8.
- **Eletrônicos (1.270 masters):** **celular 73**, tablet/leitor 86, relógio inteligente 62.
- Ou seja: celulares existem, mas ficam em **Eletrônicos**, não em Tecnologia; notebooks existem só **12**; e a vitrine do departamento ordenava pelo **menor preço**, o que empilhava itens baratos do mesmo tipo.
- Amazon **não aparece nos departamentos** (regra `REDES_DEPARTAMENTO`: só Mercado Livre e Shopee), por decisão anterior. Por isso a pergunta "a Amazon não vende?" tem resposta: vende, mas está fora da vitrine dos departamentos.

Passos:

1. **Feito agora:** destaques com **um item de cada tipo** (notebook, desktop, monitor, placa de vídeo, SSD, teclado, impressora, roteador...) antes de repetir tipo; cache novo (`v3`).
2. **Decisão do dono:** mover **celulares, tablets e relógios** de Eletrônicos para **Tecnologia**? Recomendo sim (é o que o público espera). Mudança: classificação em `tipos-produto.ts`, vertical no `config-tipos.ts`, migração dos masters existentes com backup NDJSON e `--rollback`.
3. **Cobertura de notebook (12 é pouco):** subir a prioridade de semeadura de `notebook`, `celular` e `tablet` no `seed-schedule` (hoje a busca por catálogo do ML devolve muito 404 sem vendedor, medido: 2 de 2 catálogos); coleta só por API oficial, com orçamento diário.
4. **Amazon nos departamentos:** decisão do dono (hoje fora por regra; a média pública fica só em games até 27/11).
5. Conferir na tela e com `qa-verificador`: Tecnologia mostra notebook e celular logo na entrada.

## C. Retirar itens do AliExpress (#51)

Medido no banco: a rede `aliexpress` tem **0 ofertas**; busca por URL, loja, imagem (alicdn) e título também deu **0**. O que existe é só **código e texto**: o coletor stub `src/server/collector/sources/aliexpress.ts` (não opera, lança erro), referências em `collect-prices.ts` e `amazon-assisted.ts`, a linha da rede `aliexpress` em `affiliate_networks`, `docs/inventario-lojas/aliexpress.md` e atas.

Por isso há duas leituras do pedido; o dono escolhe:

- **Opção 1 (recomendada, segura e reversível): remover a integração AliExpress do projeto.** Passos: (1) backup da linha da rede e do inventário; (2) apagar o stub e o import em `sources/index.ts`; (3) limpar as menções em `collect-prices.ts` e `amazon-assisted.ts`; (4) arquivar `inventario-lojas/aliexpress.md`; (5) `tsc` e testes; (6) deploy e conferir que nenhuma tela cita AliExpress.
- **Opção 2: também tirar produtos "estilo AliExpress" vendidos no Mercado Livre e na Shopee** (importados genéricos, ex.: lojas "Choice Oficial" e "Value Choice", com 51 ofertas ativas cada, e títulos do tipo "G11 Mouse Gamer ... PAW3311"). Passos: (1) regra única `importado-generico` como a do item miúdo (loja, título e padrão de marca); (2) dry-run com a lista para o dono; (3) aplicar com backup e `--rollback`, marcando `catalogGate=rejected`; (4) barrar na entrada (descoberta e porteiro); (5) teste `test:importado`.

Pergunta ao dono: **Opção 1, Opção 2 ou as duas?**

## D. Segurança do site (#52)

Estado medido: o site não tem cabeçalhos de segurança (CSP, HSTS, X-Frame-Options) nem limite de requisições configurados. Passos: D1 cabeçalhos no `next.config.ts` (CSP testada contra Plus, Telegram e imagens); D2 limite de requisições nas rotas públicas e de API e regras do Vercel Firewall; D3 revisão de todas as rotas `/api` e `/api/cron` (token ou segredo exigido, consultas parametrizadas, nenhum segredo em `public/`); D4 opcional: Cloudflare na frente. Só D1 e D3 não mudam o comportamento do site.

## E. Calendário até a Black Friday (27/11)

- **Agora a 20/11:** QA da home nova (item 14), decisões dos itens 2, 3, 12, 13, 15, 16.
- **21/11:** 10% da home nova. **23/11:** 50%. **24/11:** 100% (rollback com a flag em 0%).
- **25 a 28/11:** congelamento, só correção de erro.
- **Depois de 27/11:** Fase C do checklist (gráfico V2, notícias oficiais, Playwright, limpeza de imagens).
