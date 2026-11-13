# Briefing do Conselho Geek: reorganização do front (2026-11-13)

Porte: GRANDE. Presidente: geek-lead. Dono: Renato. Prazo-guia: Black Friday em 27/11/2026. Site de produção: https://www.egeek86.com (repo em c:\repositorio\egeek86, Next 16, leia node_modules/next/dist/docs antes de afirmar algo sobre APIs do Next).

## Pedido do dono (resumo)
1. Varredura ponta a ponta do FRONT: bem desenvolvido? coerente com os objetivos (inteligência de preços, média única, só produto novo e em linha)? responsivo em mobile, tablet e desktop, em retrato E paisagem?
2. Comparar com outros portais (design gráfico, tempo de resposta, otimização de código, bibliotecas, fotos).
3. Reorganizar TODAS as sessões, segmentações, indicadores e a parte de notícias.
4. Landing: sessões por segmentação de MELHORES OFERTAS, com quadro de destaques de tamanho comparável ao dos grandes marketplaces do Brasil; destaques por PLATAFORMA DE GAMES (jogos e consoles de cada plataforma); uma sessão de destaque para o GEEK PLUS.
5. Inventário novo + proposta de nova versão + checklist para nada ficar inacabado.
6. Gráfico de monitoramento de preços: o dono continua vendo "linhas estranhas". Diagnosticar com dado real e propor forma melhor, sem dado fake/interpolado, mudança do menor preço do momento sempre visível (ADR 0004, média oferta-dia).
7. Fotos: se faltar imagem, NÃO gerar nem reaproveitar; entregar prompt pronto para o ChatGPT no estilo das existentes (public/images, docs/banco-de-imagens.md, docs/banco-mestre-prompts-imagens.md). Regra uma imagem, um lugar: grep pelo nome do arquivo.

## Fase 1 = DIAGNÓSTICO E PLANO
Nenhuma mudança em código de produção, nenhuma escrita em produção, nenhum deploy, nenhum commit (quem commita é o geek-lead).

## Restrições duras
- NÃO use, navegue, recarregue nem feche as abas existentes do Chrome (tabs 1311993196, 1311993197, 1311993205; grupo 1453248565). Para navegador, abra aba NOVA e feche ao terminar, ou use medição por HTTP/headless (Playwright/Puppeteer só se já instalado; não instale nada global). Nunca mexa em __mll, __mlc, __cup, __promo, __amza.
- Não sobrecarregue o banco: medições leves por HTTP, poucas amostras espaçadas (>= 5 s entre amostras da mesma URL). Nada de consulta pesada em produção. Leituras SQL só se indispensáveis, leves e com LIMIT.
- Regras: sem dado fake/sintético/interpolado; um jogo uma média; só produto novo e em linha; coleta só por API oficial; a palavra "afiliado" nunca aparece ao cliente; cantos retos; uma imagem um lugar; nunca imprimir credenciais/token (não leia .env*).
- Leia antes: CLAUDE.md, AGENTS.md, docs/03-metodologia/FLUXO_MESTRE.md (seções 1, 6.3, 6.6, 9), docs/fila-de-execucao.md (itens 14, 23, 46), .claude/skills/padrao-visual-egeek/SKILL.md, docs/08-decisoes-adr/ (ADR 0004).
- Português do Brasil, sem emojis. Número sem fonte não entra: marque DADO REAL (com fonte/medida), HIPÓTESE ou RECOMENDAÇÃO.

## Formato fixo do parecer (devolva no final da sua resposta)
1. Posição (1 frase)  2. Leitura (o que você verificou, com caminhos de arquivo/URL/medidas)  3. Riscos  4. Recomendação (concreta, com quantidades)  5. Dado que falta  6. Métrica de sucesso
