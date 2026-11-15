# Ata do Conselho Geek: responsividade mobile e iPad, e aplicativo de celular

- **Data:** 2026-11-11 (Black Friday em 2026-11-27: faltam 16 dias; congelamento de regras, coleta e esquema em 2026-11-20: faltam 9 dias)
- **Porte:** grande (muda o padrão de interface do site inteiro e abre uma decisão estratégica sobre aplicativo). SOMENTE LEITURA E PLANEJAMENTO: nenhum código, banco, Vercel, commit ou deploy foi alterado. Nenhuma ferramenta do Chrome foi usada (abas do dono com coleta rodando). Os únicos arquivos escritos são esta ata e o plano.
- **Presidente:** geek-lead
- **Convocados (pareceres independentes, em paralelo):** engenheiro-frontend, designer-marca, key-user-gamer, engenheiro-performance-web, arquiteto-next, estrategista-mercado, qa-verificador, gamer-veterano (os oito pedidos pelo dono). Não foram convocados nesta rodada: especialista-precos, estatistico-senior e matematico-aplicado (nenhuma regra de preço, média ou selo muda), nem guardiao-catalogo. Conselho consultivo; decisão de negócio é do dono.
- **Plano detalhado:** `docs/plano-mobile-ipad-2026-11-11.md` (achados com arquivo:linha, lotes, critérios, QA, fases do app).

Convenção: **[D]** medido (nesta sessão ou nas atas de 10/11), **[C]** visto no código, **[H]** hipótese, **[R]** recomendação, **[V]** a verificar em fonte oficial ou com navegador.

## Briefing
Pedido do dono: o site tem coisas erradas na visualização em celular e iPad; organizar a responsividade e fazer os agentes chegarem a um acordo sobre a melhor experiência mobile; o dono também pensa em criar um aplicativo de celular.

Regras que nenhuma proposta pode quebrar: cantos quadrados; uma imagem, um lugar (inclui ícones de app); zero dado fake ou sintético; cliente nunca vê "afiliado"; coleta só por API oficial; um jogo = um master = uma média; nada de preço sem origem e horário; Next 16 (guias em `node_modules/next/dist/docs` lidos antes de propor); `PRICE_METRICS_V2` e `PRODUCT_CARD_V1` seguem OFF até decisão do dono por volta de 20/11. A refatoração é de CSS e marcação: `src/lib/pricing/*` e queries de média não são tocados.

Perguntas a decidir: (1) qual é o padrão único de breakpoints e componentes e em que ordem corrigir; (2) como o QA verifica sem navegador agora e com navegador depois; (3) qual caminho de aplicativo (PWA, Capacitor, nativo/Expo), com que fases e antes ou depois da Black Friday.

## Estado medido (insumo dos pareceres)
- [C] Base boa já existente: `viewportFit: 'cover'` e `themeColor` claro/escuro (`layout.tsx:72-80`); utilitários de safe-area (`globals.css:374-379`); variante `hover-supported` (`globals.css:16`); barra inferior só até `lg` com 5 abas de 48 px (`bottom-tab-bar.tsx`); prateleira horizontal com snap no celular e grade a partir de `md` (`grouped-offer-shelf.tsx:91-99`); tabela de preços vira cartões abaixo de `md` (`price-table-board.tsx:220,297`); gráfico V2 com `ResizeObserver` e `touch-action: pan-y` (`price-chart-v2.tsx:123,317`); camada do cartão em tela cheia no celular com `dvh` (`components/ui/camada-sobreposta.tsx`, ADR 0007).
- [C] Problemas de sistema: nenhum breakpoint próprio no `@theme` (cada tela escolhe `sm`/`md`/`lg`); tipografia de títulos fixa (60/44 px) em `globals.css`; `overflow-x: hidden` em `html`, `body` e `AppShell` (`globals.css:289-306`, `app-shell.tsx:43,66`) que esconde estouro horizontal e, [H], pode desligar `position: sticky`; campos de formulário a 14-15 px (zoom do iOS); alvos de toque de 32-36 px; 170 usos de `text-[9|10|11px]` e 231 de `text-xs`; header com tarja que quebra em duas linhas e hex fixo (`app-header.tsx:204-210`).
- [C] Menu do iPad paisagem: `onMouseEnter` + `onClick` no mesmo botão (`app-header.tsx:118-123`) abre e fecha no toque; menu do usuário só abre por hover (`app-header.tsx:277`) e o menu lateral some em `lg`, então "Sair" e "Meus drops" ficam sem caminho por toque até o link `/conta` (a confirmar se `/conta` oferece "Sair").
- [D] Peso (nesta sessão e ata de 10/11): `images.unoptimized: true` e `remotePatterns` com `**` (`next.config.ts:5-11`); 75 arquivos acima de 1 MB em `public/` (161 MB só em `public/images`), PNG de 3 a 3,8 MB em home e `/sobre`; só 12 de 41 `<Image>` têm `sizes`; fotos de marketplace entram por `<img>` cru (`product-image.tsx`); `/ofertas` com 1.020 KB de HTML e 145 `<img>`; todas as rotas `private, no-store`.
- [D] Não existe `manifest`, service worker, push web nem ícones de app (`src/app` só tem `favicon.ico`). Canais de aviso existentes: e-mail, Telegram, WhatsApp (`src/server/notifications/*`), cron diário às 11h (`vercel.json`), `detectQualifyingWatches` já aplica cooldown (ADR 0002).
- [D] Não há Playwright, vitest, jest, eslint nem CI. Padrão de teste existente: `scripts/test-*.ts` com `tsx`, função `check()` e código de saída 1.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| engenheiro-frontend | Concorda: problema é de sistema, não de uma tela; cabe antes de 20/11 em 9 a 11 dias de front | 4 breakpoints nomeados (base, md 768, lg 1024, xl 1280), `@container` nos cartões, 6 componentes base (Sheet, Button/Select 44 px, Input 16 px, ResponsiveTable, Chip, Text fluido); PWA primeiro, Capacitor só depois da BF, nativo não | Participação de celular e iPad nos acessos; lista de telas que o dono vê erradas |
| designer-marca | Hierarquia e densidade, não redesenho; mesma identidade no app, navegação própria | Títulos com `clamp()`; header de 1 linha até 56 px; primeira dobra com título, frase, CTA e 1 cartão; preço do cartão 24 px; ícones de app em pasta própria, sem reuso | Prints reais do dono em iPhone e iPad |
| key-user-gamer | O site resolve o preço, mas a jornada de compra no celular é longa | CTA fixo "Ir à loja" com menor preço visível; busca em primeiro plano; 2 colunas já em `md`; menu por toque; push de alerta é o único diferencial real do app; usaria o site na tela inicial | Origem do tráfego por dispositivo; clique em "Ir à loja" por posição |
| engenheiro-performance-web | Apoio com ressalvas: a base mobile é pesada | Orçamento por rota; variantes WebP dos assets próprios (meta: zero arquivo servido acima de 300 KB); paginar `/ofertas`; blur opaco no celular; SW nunca cacheia HTML, `/go`, `/api` ou preço | Cota de transformação de imagem da Vercel; Web Vitals reais |
| arquiteto-next | PWA mínimo agora; push depois ou atrás de flag; Capacitor só se houver demanda; Expo não | `app/manifest.ts`, ícones 192/512/maskable, apple-touch-icon; SW só com `push` e `notificationclick`, sem cache de fetch; `sw.js` com `no-cache`; excluir `sw.js` e manifest do matcher do `proxy.ts` | Se o dono tem Mac e iPhone para testar iOS; conteúdo permitido no push |
| estrategista-mercado | Contra app de loja antes de 27/11; a favor de responsividade e PWA leve | Capacidade é o gargalo (Onda A já consome ~25 dias); instrumentar origem do `affiliate_click`; Telegram é o "push" da BF; Web Push e Capacitor só pós-BF por dados | Funil real por dispositivo; leitura oficial das políticas Apple e Google |
| qa-verificador | Aprova em duas camadas: guarda estático agora, navegador depois | `scripts/test-responsivo.ts` (10 regras, baseline por arquivo+regra+contagem) e `scripts/test-vetos.ts`; depois Playwright com Chromium próprio em 4 viewports e 8 rotas | Slug real de oferta e credencial de teste do `/admin` |
| gamer-veterano | PWA agora, app nativo adiado | Corrigir cartão e lista no celular; alerta precisa trazer plataforma, formato, edição, região, menor preço com data e loja; 3 a 5 pushes/dia no máximo em BF; silêncio 23h às 8h | Acessos por iOS x Android e por origem; retorno em 7 dias |

## Divergências e réplica (rodada 2)
Nenhuma divergência exigiu réplica formal; as diferenças abaixo foram resolvidas pelo presidente com base nos pareceres, e seguem registradas aqui.

1. **Service worker antes ou depois do congelamento.** arquiteto-next propôs SW só de push dentro da janela; performance-web e estrategista-mercado propuseram só manifest antes e SW depois. Argumento decisivo: push exige tabela nova (mudança de esquema, congelado em 20/11) e QA em iOS real, e o dono não tem usuários medidos com alerta ativo. **Resultado:** antes de 20/11 só manifest, ícones e orientação de instalação, sem SW; SW de push e tabela de assinaturas entram a partir de 28/11 (ou antes só se o dono mandar, ver pergunta 3 do plano).
2. **Capacidade.** frontend estima 9 a 11 dias de front mais 7 de performance (parte sobreposta); estrategista lembra que a Onda A de 10/11 já consome o prazo. **Resultado:** o plano separa P0 (até 20/11) e P1 (21 a 24/11) e pergunta ao dono se o congelamento vale para CSS e marcação (pergunta 2). Última janela de deploy de interface proposta: 24/11.
3. **Barra inferior.** designer-marca quer 4 abas mais "Mais"; key-user quer busca na barra. **Resultado:** proposta de 5 posições (Início, Buscar, Ofertas, Monitorar, Mais), com Hype e Perfil dentro de "Mais"; é decisão de navegação do dono (pergunta 5), não entra sem aprovação.
4. **Header.** designer-marca pede 1 linha de até 56 px; key-user pede busca visível. **Resultado:** conciliado em uma linha: menu, logo compacto e campo de busca que abre a camada; a tarja institucional sai do celular.
5. **PWA opcional (QA) versus PWA central (os demais).** O QA lembra que o problema atual é CSS. **Resultado:** manifest é barato (1 dia) e não bloqueia a correção; push fica como fase própria.
6. **Veto técnico:** nenhum. Pontos sensíveis: SW nunca serve preço de cache; ícone de app é arquivo novo e único; refatoração não toca `src/lib/pricing/*`.

Limitações dos pareceres: o estrategista-mercado não leu CLAUDE.md e AGENTS.md (usou o contexto da sessão); designer-marca e frontend não reverificaram todas as linhas do briefing; valores de contas de desenvolvedor (Apple 99 USD/ano, Google 25 USD, pagamento único) são de memória e estão marcados [V]. Nenhuma política Apple ou Google foi lida em fonte oficial nesta sessão.

## Decisão
Plano proposto (detalhe em `docs/plano-mobile-ipad-2026-11-11.md`):
1. **Lote 0, rede de segurança (0,5 dia, qa-verificador):** `test-responsivo` e `test-vetos` com baseline, antes de qualquer edição.
2. **Lote 1, fundação (1,5 dia, engenheiro-frontend):** `overflow-x: clip` no lugar de `hidden` (e checagem de sticky), breakpoints documentados no `@theme`, títulos fluidos, campos a 16 px, alvo de 44 px em ponteiro grosso, Sheet/Dialog único com `dvh`.
3. **Lote 2, header, menu e busca (1,5 dia):** header de 1 linha, menu por toque no iPad, menu do usuário por toque, busca em primeiro plano.
4. **Lote 3, página do produto com gráfico (2,5 dias):** 2 colunas em `md`, CTA fixo com menor preço, gráfico fluido.
5. **Lote 4, home, busca, cartão de oferta e paginação de `/ofertas` (3 dias, junto com performance).**
6. **Lote 5, imagens e peso (2,5 dias, performance-web):** variantes dos assets próprios, `sizes`, `remotePatterns`, blur opaco no celular.
7. **Lote 6 e 7, admin, tabelas, `/sobre`, varredura de fontes (2 dias).**
8. **PWA mínimo (1 a 1,5 dia, arquiteto-next):** `app/manifest.ts`, ícones, orientação de instalação; sem SW.
9. **Aplicativo:** PWA primeiro; Web Push a partir de 28/11; Capacitor reavaliado em janeiro com dados; Expo/nativo descartado por ora; nenhuma conta de desenvolvedor agora.

Fica de fora até depois de 27/11: SW, push, tabela de assinaturas, Capacitor, Expo, contas Apple e Google, qualquer redesenho de marca.

- **Decisão do responsável do projeto:** pendente. Perguntas ao dono, uma por vez, no final do plano (a primeira: aprovar a ordem "responsividade e PWA mínimo antes de qualquer app de loja").
- **ADR a abrir após aprovação:** padrão de breakpoints e componentes base mobile (0010) e caminho de aplicativo (0011). Não foram criados nesta sessão.

## Métrica de sucesso
Medida por script estático agora e por Playwright quando o navegador for liberado: zero rolagem horizontal da página em 360, 390, 768 e 1024; zero alvo interativo abaixo de 44 px nas jornadas (home, busca, produto, menu); nenhum campo abaixo de 16 px; nenhum texto informativo abaixo de 12 px; menu abre por toque em 1024; CTA e menor preço visíveis sem rolar em 360x640; LCP p75 menor ou igual a 2,5 s e CLS menor ou igual a 0,1 em 4G; nenhum arquivo servido acima de 300 KB; manifest instalável. Resultado de negócio: cliques em `/go` por visita mobile antes e depois (linha de base a medir). Conferir em 2026-11-24 e na retrospectiva pós-BF.

## Execução e verificação
- Executores previstos: engenheiro-frontend (lotes 1 a 4, 6, 7), engenheiro-performance-web (lote 5 e paginação), arquiteto-next (manifest, headers, proxy, depois SW e push), designer-marca (tokens de tipografia, ícones do app, revisão visual), qa-verificador (lote 0 e veto em cada lote).
- QA: pendente. Hoje só vale verificação estática (`npm run typecheck`, `test:responsivo`, `test:vetos`); a verificação em tela do `checklist-publicacao` (item 3) fica registrada como lacuna até o navegador ser liberado e é risco assumido do dono se houver deploy antes.

## Retrospectiva
Preencher após 2026-11-27: métricas atingidas? Quantas regras do baseline chegaram a zero? Cliques `/go` por visita mobile mudaram? Dados de dispositivo justificam Web Push e Capacitor?
