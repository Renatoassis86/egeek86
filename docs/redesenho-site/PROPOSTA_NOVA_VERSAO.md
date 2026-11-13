# Proposta de nova versão do front (landing e páginas) — 2026-11-13

Origem: ata `docs/conselho/atas/2026-11-13-reorganizacao-front.md` (14 pareceres independentes). Base de fatos: `INVENTARIO_FRONT.md`, `AUDITORIA_RESPONSIVA.md`, `AUDITORIA_DESEMPENHO.md`, `BENCHMARK_FRONT.md`, `GRAFICO_PRECOS.md`, `PROMPTS_IMAGENS.md`. Marcas: DADO REAL (medido), RECOMENDAÇÃO (proposta, depende de decisão do dono). Nada aqui foi implementado.

## 1. O que a varredura encontrou (resumo)
1. Home atual: 14 sessões, 27.851 px no celular, 106 imagens, 690 KB de HTML. A primeira oferta aparece depois de Hero, faixa institucional e carrossel. Não há faixa por plataforma nem quadro de destaques. Notícias não aparecem (0 links `/noticias/<slug>` na home, por regra de fonte).
2. A vitrine "melhores ofertas" tem um fallback que reinclui ofertas "acima do normal" quando a lista fica curta, e traz Xbox One (fora de linha): contradiz a regra do dono.
3. `/inteligencia-gamer` serve 8 artigos escritos à mão no código, com autor, data e afirmações de mercado sem fonte, e tema retrô/usado. `/noticias` tem colunistas fixos e "milhares de leitores" sem dado. A raspagem de notícias de terceiros (`scrapeNewsArticle`) é scraping e cópia (proibido).
4. Indicadores: a média pública ainda é por cotação bruta (não oferta-dia), há 3 pisos de elegibilidade diferentes, 4 médias diferentes na mesma tela de produto (R$ 182,55 / 176,39 / 191,58 / 219,82 no caso medido) e selos de -50% a -57% como destaque.
5. Preço sem horário de leitura nos cartões (R-39). Sem teste automatizado de front, de "afiliado", de cantos retos ou de imagem única.
6. Desempenho: TTFB bom (0,30 a 0,75 s), mas a home tem cauda de 4,7 a 5,0 s em 3 de 5 amostras; produto com TTFB de 2,65 s em 2 de 5; tudo `no-store` (layout lê cookies). Imagens locais sem otimização (`images.unoptimized: true`, 77 PNG, 172 MB, arquivos de 3 a 3,8 MB).
7. Responsivo: 0 rolagem horizontal em 65 células, mas paisagem curta no celular perde 31% da altura em barras fixas, e há erro 500 sem tela de marca (`error.tsx` não existe).
8. `/black-friday` não tem link em menu, rodapé ou home.
9. Imagens: 3 pares com conteúdo idêntico (um dentro de `/sobre`), 27 sem uso, 3 com texto/logo de terceiros. Faltam 11 imagens obrigatórias (prompts prontos).
10. Gráfico do produto: está no ar o antigo (lightweight-charts). Média serrilhada pela cadência de coleta, último ponto trocado pelo preço atual (diagonal), mínimos reais escondidos, "média de mercado" desenhada com 1 oferta só.

## 2. Princípios da nova landing
1. Oferta primeiro: a primeira oferta real aparece sem rolar no desktop e com no máximo 1 rolagem no celular.
2. Cada vitrine é um componente único (`VitrineOfertas`), lido de snapshot persistido com teto de tempo (R-49). Vitrine com menos de 4 itens elegíveis desaparece; nunca se preenche com item fraco, sem média ou sem link.
3. Um número, uma definição, um rótulo de escopo: "N% abaixo da média das lojas (N ofertas, 30 dias)"; piso de 5 ofertas e 14 dias; queda acima de 50% sai da vitrine; "% de desconto do vendedor" nunca é destaque.
4. Só produto novo e em linha. Sem Xbox One, 360, retrô, Open Box, usado, acessório com nome de jogo (encarte, capa, caixa).
5. Geek Plus: sem selo nem média até 27/11 (R-36); só menor preço do momento, loja e horário.
6. Todo preço com horário de leitura ("lido às HH:MM").
7. Cantos retos, premium dark; roxo e esmeralda deixam de ser fundo de seção; verde/vermelho só para alta e queda.
8. Atrás de flag, com rollback sem deploy.

## 3. Arquitetura de informação da landing (ordem, 9 sessões; hoje 14)

Quantidades vêm de `BENCHMARK_FRONT.md` 8.2 (comparável a KaBuM!/Magalu/ML: 10 a 24 por faixa) ajustadas pelos pareceres do gamer-veterano e do key-user. "DOM" = itens montados; "vis" = visíveis sem rolar.

| # | Sessão | Conteúdo | DOM | Vis desktop / tablet / celular | Critério |
|---|---|---|---|---|---|
| 1 | Hero compacto | busca + chips das plataformas + contagem regressiva Black Friday (até 27/11) + link "Black Friday" | 0 | meia tela | altura máx. 50% da tela |
| 2 | Quadro de destaques "Melhores ofertas agora" | 1 oferta âncora grande + 3 médias + 8 pequenas, grade assimétrica | 12 | 12 / 6 / 4 | maiores quedas reais sobre a média única (5% a 50%), 5 ofertas, 14 dias, vendedor fiável, cotação <= 6 h; desempate pelo menor preço |
| 3 | Mudanças do menor preço | lista densa de eventos recentes: horário, valor, loja, antes | 8 | 8 / 8 / 5 | ADR 0004; queda >= 5% sobre o evento anterior, últimas 24 h |
| 4 | Plataformas de games (4 faixas: PlayStation, Nintendo, Xbox, PC e portáteis) | em cada faixa: linha de jogos e linha de consoles; sub-abas PS5/PS4 e Switch 2/Switch 1 | jogos 10, consoles 6 por faixa | jogos 5 / 4 / 2, consoles 6 / 3 / 2 | mesma ordenação da sessão 2; faixa some se < 4 itens; PS4 e Switch 1 só se em linha; sem Xbox One |
| 5 | Menor preço registrado | itens hoje no menor registrado (+3% de régua), corroborado (2 vendedores em ±10%), com amplitude de série | 8 | 4 / 4 / 2 | mínimo 14 dias medidos |
| 6 | Acessórios e colecionáveis | controles, headsets, bases, mídia; colecionáveis só com dado | 8 + 6 | 4 / 4 / 2 | some se < 4 |
| 7 | Geek Plus (1 faixa) | 6 cartões de departamento (Impressão 3D, Tecnologia, Livros, Casa, Eletrônicos, Esporte) com 1 produto de destaque cada (menor preço, loja, horário), link `/plus` | 6 + 6 | 6 / 3 / 2 | sem selo nem média; hoje são 2 componentes (`SecaoPlusHome`, `FaixasPlusHome`): consolidar |
| 8 | Notícias | 1 manchete + 3, com data e fonte; bloco some se < 3 matérias com fonte nos últimos 14 dias | 4 | 4 / 2 / 2 | EG-16 mantido |
| 9 | Comunidade e rodapé | Telegram t.me/egeek86 + WhatsApp + newsletter no mesmo bloco | - | - | sem enquete na home |

Total montado: cerca de 120 produtos por visita (hoje ~87), com faixas abaixo da dobra carregando sob demanda.

### Wireframe desktop (1440)
```
[HEADER: logo | busca | Plataformas | Ofertas | Black Friday | Plus | Notícias | Conta]
[HERO compacto: busca  [PS5][Xbox][Switch 2][PC][Acessórios]   Black Friday em 14 d 03 h]
[ MELHORES OFERTAS AGORA                                     ver todas ]
[ ÂNCORA GRANDE ] [ M ][ M ][ M ] [p][p][p][p]
                  [p][p][p][p]
[ MUDANÇAS DO MENOR PREÇO (últimas 24 h)                               ]
[ 13:42  Jogo X PS5   R$ 199,00 (antes R$ 229,00)  Loja Y  ]  x 8
[ PLAYSTATION  [PS5][PS4]   jogos: c c c c c  >  | consoles: c c c c c c ]
[ NINTENDO     [Switch 2][Switch 1] ...                               ]
[ XBOX SERIES  ...                                                     ]
[ PC E PORTÁTEIS ...                                                   ]
[ MENOR PREÇO REGISTRADO: c c c c ]
[ ACESSÓRIOS: c c c c ]   [ COLECIONÁVEIS: c c c c ]
[ ESPAÇO GEEK PLUS: 6 departamentos, 1 produto cada, "entrar no Plus" ]
[ NOTÍCIAS: manchete + 3 (data, fonte) ]
[ COMUNIDADE: Telegram | WhatsApp | newsletter ]  [FOOTER]
```
### Wireframe celular (390, retrato)
```
[HEADER 56 px]  [busca]
[chips de plataforma, rolagem horizontal]  [Black Friday em 14 d]
[DESTAQUES: 4 cartões 2x2 + "ver mais"]
[MUDANÇAS DO MENOR PREÇO: 5 linhas]
[PLAYSTATION: 2 cartões + espiada, rolagem horizontal com snap] (idem Nintendo, Xbox, PC)
[...] [PLUS: 2 + espiada] [NOTÍCIAS: 2] [COMUNIDADE]
[barra inferior 64 px]
```
Paisagem curta (844x390): barra inferior e barra Arkos escondidas (`@media (orientation: landscape) and (max-height: 500px)`), 3 a 4 cartões por linha, produto com imagem limitada a 60% da altura útil.

## 4. Cartão de oferta (todas as vitrines)
- Foto em `contain`, altura do cartão <= 400 px (hoje 414 a 566).
- Preço agora (mono 22 px) + "menor preço agora em N lojas" + horário de leitura.
- Uma linha de posição: "N% abaixo da média das lojas (N ofertas, 30 dias)" ou "em linha"; suprimida se < 5 ofertas ou < 14 dias ("base de preços ainda curta").
- Uma linha de menor registrado: "menor preço desde DD/MM/AAAA (N dias medidos)", só se corroborado.
- Média e maior já visto saem do cartão comum e ficam no cartão destaque e na ficha.
- Selo verde/vermelho só em queda/alta; Plus sem selo; texto >= 12 px (meta 14 px); alvo de toque >= 44 px.

## 5. Indicadores (conjunto enxuto: 6)
Preço agora; Média das lojas (30 dias); Posição vs média; Menor preço registrado; Mudança do menor preço; Ofertas ativas (nº de ofertas e lojas). Rótulos fixos; eliminar "Média Histórica", "Maior Desconto vs. Média", "No Menor Preço Histórico". "Números do site" (vaidade), enquete, Benefits, StatementBand, painel do Observatório saem da home (ficam, se o dono quiser, em `/sobre` ou `/pesquisa`).

## 6. Notícias (reorganização)
- 14 categorias viram 2 editorias na leitura: Lançamentos e Mercado; Cultura Geek (sem migração de banco agora).
- Cartão sempre com título, data, fonte e editoria; matéria sem fonte e data não publica (validar na action).
- Home: 4 matérias (1 manchete + 3), depois das ofertas; some com < 3 matérias dos últimos 14 dias.
- Retirar: `news-ticker.tsx` (0 usos), "Coluna Editorial" fixa e o CTA com "milhares de leitores", `/inteligencia-gamer` (redirect 308 para `/noticias` ou página só com dado real e fonte), scraping de notícia (`scrapeNewsArticle`, transcrição no GET, `go/noticia`), `scripts/fix-news-cover-images.ts`.
- Pós-27/11: feeds RSS oficiais (5 a 8) com cron de 2 h (título, trecho <= 280 caracteres, data, fonte, link; sem corpo nem imagem de terceiros), alerta de frescor 48 h, vínculo notícia-produto ("Onde comprar" com menor preço e média única), SEO por matéria (description, canonical, OG, JSON-LD NewsArticle).

## 7. Gráfico de preço (resumo; detalhes em `GRAFICO_PRECOS.md`)
Evoluir `price-chart-v2` (SVG próprio, sem dependência) e aposentar `price-history-chart` + lightweight-charts (~60 KB gzip a menos) depois da paridade da fila #14. Séries: linha em degraus do menor preço com marcadores quadrados em cada mudança (e tabela completa), média oferta-dia visível por padrão, faixa do dia, sub-painel "ofertas no dia" para explicar saltos de composição, lacuna como buraco, trecho sem confirmação tracejado, nunca interpolar; janelas 1S, 1M, 3M, 1A e "Tudo medido"; sem verde/vermelho; cantos retos. Mitigação mínima no gráfico antigo ainda nesta fase 2: parar de sobrescrever o último ponto e remover o selo duplicado.

## 8. Outras páginas
- `/ofertas`, `/tabela-de-precos`, `/black-friday`: mesmos cartão e rótulos; piso único de 5 ofertas; `/black-friday` linkada em header, drawer, rodapé e home até 27/11.
- `/ranking` (vazio por regra) sai dos menus; `/hype-zone`, `/leiloes` seguem fechados (404 por flag).
- `/sobre`: trocar uma das duas imagens idênticas; renomear `ferramenta-gestao-afiliados.png` (nome vaza no HTML).
- `/entrar`: rótulo "Divulgador" (item 6 da seção 9 do Fluxo Mestre).
- Páginas de erro com a marca: `app/error.tsx`, `app/global-error.tsx`.

## 9. Desempenho: metas
Home p95 < 3 s e mediana < 1,2 s (50 amostras); TTFB p95 < 800 ms nas 12 páginas; JS inicial < 200 KB brotli (hoje 279 a 344); imagens locais da home < 600 KB; HTML < 400 KB (hoje 690 KB; benchmark sugere 300 KB); altura mobile <= 14.000 px; transferência <= 8 MB desktop e 5 MB celular. Ações: reexportar PNGs > 2 MB em WebP/AVIF no mesmo caminho (sem duplicar), cache imutável em `/images/*`, `sizes`/`priority` nas imagens da dobra, trocar framer-motion por CSS/LazyMotion fora do caminho crítico, `dynamic()` em Toaster/gráfico/drawer, limite de ~12 a 24 cards por seção. Tirar `cookies()`/`headers()` do layout raiz (ISR) fica para depois de 27/11 (risco de flash de tema).

## 10. O que fica fora até 27/11 (decisão do estrategista, ver ata)
Reorganização completa de "indicadores" históricos e do Observatório, feeds RSS e vínculo notícia-produto, média/selo no Plus, BI sobreposto por produto, ISR do layout, troca total do gráfico se a paridade da fila #14 não fechar, Playwright no repositório.

## 11. Rollout
Flag `REDESENHO_HOME` (percentual), home atual intacta como fallback; construção 14 a 19/11, QA em 20/11, 10% em 21/11, 50% em 23/11, 100% em 24/11; congelamento de 25 a 28/11 (só correção); rollback desligando a flag em menos de 5 min, exercitado uma vez antes de 24/11.
