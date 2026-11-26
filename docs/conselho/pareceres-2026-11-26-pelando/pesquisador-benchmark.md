# Parecer do Pesquisador de Benchmark: estudo do Pelando (rodada 1, 2026-11-26)

Escopo: engenharia reversa leve e comparação do pelando.com.br com o egeek86. Somente leitura: nenhuma escrita em produção, banco ou código; nenhuma requisição nova ao Pelando nesta rodada (usei só os fatos do briefing e a ficha de 2026-10-28). Nada de dado ou conteúdo de terceiros foi copiado para o nosso banco.

Legenda: [OBS] fato observado publicamente (briefing 26/11 ou `research/benchmarks/fichas/pelando.md`); [INF] inferência minha; [REPO] lido no repositório (caminho citado); [NÃO VERIFICADO].

## 1. Posição

1. O Pelando é um produto de COMUNIDADE (conteúdo gerado por usuários, voto, comentário, moderação) com SEO programático forte. O egeek86 é um produto de DADOS (coleta, média única, histórico, porteiro de qualidade). São modelos quase complementares: o que ele faz melhor está em distribuição e retenção (SEO por loja e cupom, feed por temperatura, alerta, app, grupos), não em exatidão de preço.
2. A vantagem estrutural do egeek86 é a que a ficha de outubro já apontou: o Pelando não tem histórico de preço nem comparação entre lojas [OBS, ficha §9]. Não devemos competir em comunidade; devemos trazer a camada de DISTRIBUIÇÃO dele, alimentada por dado nosso verificável.
3. Várias ideias já estão em docs (ficha, `research/benchmarks/PANORAMA.md`, ata `docs/conselho/atas/2026-11-10-melhorias-do-front-por-area.md`) mas não foram feitas. A maior lacuna nova e barata é SEO técnico (JSON-LD de oferta e sitemaps segmentados) e a página pública de cupons por loja.

## 2. Leitura

### 2.1 O que o Pelando faz melhor que nós

| Tema | Pelando | Nós hoje | Veredito |
|---|---|---|---|
| Estrutura de feed | Abas Recentes, Mais quentes, Mais baratos, Comentadas, Discussões, /c/categoria; feed infinito [OBS] | `/ofertas` único com filtros (`src/app/(shop)/ofertas/page.tsx`), `/mercado/[vertical]` (`src/app/(detalhe)/mercado/[vertical]`), `/tabela-de-precos`; sem abas de ordenação "quente/recente" [REPO] | Ele ganha em descoberta por ordenação social |
| Temperatura e votos | Voto quente/frio, grau numérico (16°, 99°, 2911°) [OBS] | Nada equivalente; o ranking de colecionadores é placeholder sem dado (`src/app/(shop)/ranking/page.tsx`) [REPO] | Ele ganha como termômetro; nosso sinal humano não existe |
| Histórico de preço | Não tem [OBS] | Gráfico por produto (`src/components/monitoring/price-chart-v2.tsx`), média única, menor preço histórico, agregado diário (`src/server/pricing/price-daily.ts`) [REPO] | Nós ganhamos com folga |
| Alertas | "Criar alerta" por preço e por palavra-chave, /meus-alertas, notificações e app [OBS] | `affiliate_price_watches` com preço-alvo e queda de 12% sobre a média (`src/db/schema/affiliate_watches.ts`, `src/server/notifications/constants.ts`), `/conta/notificacoes` [REPO]; por palavra-chave, loja ou categoria: não achei [NÃO VERIFICADO em UI] | Empate na mecânica de preço; ele ganha em alerta por termo e em push de app |
| Cupons por loja | `/cupons-de-descontos/<loja>` (shopee, mercado-livre, magalu, amazon, aliexpress) e sitemap `coupons_recent` [OBS]; cupom copiável junto do "Ir para loja" [OBS, ficha] | Cofre de validação (R-64 a R-67), guardião e mensagens de cupom no Telegram (`src/server/messaging/guardiao-cupons.ts`, `src/lib/coupons/cofre.ts`); administração em `src/app/admin/cupons*`; nenhuma rota pública de cupons por loja em `src/app/` [REPO] | Maior lacuna de SEO e de valor. Nosso dado é mais confiável (prova no item), mas está escondido do site |
| Cashback | `/cashback` e `/meu-cashback` [OBS] | Só tratado como tipo de benefício a NÃO somar ao preço (`docs/cupons-portais-2026-11-10.md`, `src/lib/coupons/card-benefit.ts`) [REPO] | Não é lacuna de produto; ver §2.3 |
| Comunidade | Postar, comentar, perfil, chat, discussões, selos de nível [OBS] | Esquemas de pontos, selos e missões existem (`src/db/schema/loyalty.ts`, `engagement.ts`) sem uso público de oferta [REPO] | Ele ganha, mas é o ponto que menos devemos copiar |
| SEO programático | Sitemaps segmentados: feed, `promotions_recent` (hourly), `coupons_recent`, discussions, stores, communities, `promotions_AAAA_MM`; JSON-LD `DiscussionForumPosting` com contagem de interações; páginas de loja [OBS] | Um `sitemap.ts` com 6 rotas fixas, até 5.000 ofertas e 500 notícias, revalidate 1 h (`src/app/sitemap.ts`) [REPO]; busca por texto não achou JSON-LD (`ld+json`, `schema.org`) em `src/app` nem `src/components` [REPO]; `generateMetadata` existe em `src/app/(detalhe)/ofertas/[slug]/page.tsx` [REPO] | Ele ganha em volume indexável e rich results; nós temos dado para um JSON-LD melhor (preço, disponibilidade, histórico) |
| App | Apps iOS e Android, banner de app, AlertsButton e Notifications em bundle próprio [OBS] | Sem manifest nem service worker em `src/` ou `public/` [REPO, busca por texto]; canais Telegram por loja e bot (`docs/03-metodologia/FLUXO_DE_ENVIO_TELEGRAM.md`, `FLUXO_MESTRE.md` N26); WhatsApp assistido manual (N27) [REPO] | Ele ganha em push nativo; nós temos canal Telegram forte e nada de PWA |
| Performance e entrega | Astro com ilhas, HTML em CDN Cloudflare, `cache-control public, max-age=60, stale-while-revalidate=240`, ~275 KB na home [OBS] | Next 16; a auditoria de 01/11 mediu home fria de 22 a 38 s por consultas pesadas e páginas `force-dynamic` (`docs/conselho/pareceres-2026-11-01/dba-postgres.md`, `docs/redesenho-site/AUDITORIA_DESEMPENHO.md`) [REPO]; situação ATUAL [NÃO VERIFICADO] | O padrão de cache de borda curto com SWR é replicável |
| Grupos | pelando.promo/grupos (WhatsApp) [OBS] | Telegram por vertical (7 canais, `FLUXO_MESTRE.md` §16); WhatsApp assistido; contatos só em `/contatos` (regra do dono) [REPO] | Nada a trazer além da organização em `/contatos` |

### 2.2 Fato x inferência sobre o funcionamento interno

- [OBS] Frontend Astro com bundles por componente; API própria `api-web.pelando.com.br`; mídia via `media.pelando.com.br` com transformação de imagem (webp, 0x200 e 0x500); GTM; Cloudflare.
- [INF] A temperatura é uma soma de votos com possível decaimento no tempo (padrão do gênero); "Mais quentes" provavelmente é janela de tempo mais temperatura. Não confirmado, o algoritmo não é visível.
- [INF] A receita deve vir de afiliado, cashback e anúncios; "loja verificada" e cupons por loja alimentam o redirecionamento com a tag deles. Sem fonte pública confirmada.
- [INF] O robots.txt que bloqueia Ahrefs, Semrush e ManusBot, e esconde `/postar`, `/meus-alertas` etc., indica que tratam o catálogo de promoções como ativo a proteger de raspagem. Reforça a nossa linha: só observar, nunca raspar.

### 2.3 O que NÃO devemos copiar

1. UGC aberto (postar oferta, comentário, chat, perfil): exige moderação, expõe a engano de preço e a spam de link de afiliado alheio; viola R-70 (todo link ao usuário é do dono) e reabre o risco de preço-isca (R-61).
2. Temperatura por voto de usuário anônimo: voto simulado seria dado falso (inegociável). Só serve como sinal DERIVADO de dado real nosso.
3. Cupom de comunidade sem prova: o próprio Pelando depende de comentário "cupom esgotado". Nossa regra é mais dura (cupom só com prova no item, R-63 a R-68). Manter.
4. Cashback próprio: exige parceria, redirecionamento e passivo financeiro; quebra a regra de link único do dono (R-70) e a regra de nunca somar cashback ao preço.
5. Banner de app e anúncios cobrindo a primeira tela (ficha mobile).
6. Bloquear crawlers de IA e SEO como o robots.txt dele: queremos descoberta. Decisão do dono, não recomendo.
7. Qualquer cópia de título, descrição, foto, temperatura ou comentário deles para o nosso banco: proibido.

### 2.4 Lacunas nossas que o Pelando evidencia

1. Nenhuma página pública de cupons por loja, embora tenhamos o cofre mais rigoroso do nicho.
2. Sem JSON-LD de produto/oferta: perdemos rich results de preço e disponibilidade.
3. Sitemap único; sem sitemap de recentes nem por vertical.
4. Sem ordenação "Mais quentes/Mais baratos" no feed; "menor preço histórico" existe, mas não é rota ou aba de descoberta.
5. Sem push (PWA) e sem alerta por palavra-chave ou loja.
6. Página de oferta encerrada genérica (`src/app/(shop)/oferta-encerrada/page.tsx`: texto fixo, sem último preço, data ou similares), apesar de a ata de 10/11 já listar a melhoria como P3 [REPO].
7. Sem "viram agora" real (cliques em `/go/[slug]` na última hora): não confirmei agregado por oferta [NÃO VERIFICADO; checar `src/db/schema/analytics.ts`].
8. Contagem social vazia: ranking de colecionadores é placeholder.

## 3. Riscos

- Ranking "quente" derivado e mal calibrado vira o gatilho do preço-isca (R-61): anúncio muito abaixo dos outros ganharia visibilidade. Qualquer "temperatura" nossa usa a média única e o filtro de isca como entrada.
- Página de cupons pública sem prova repete erros já registrados (R-63, R-68, R-79). Só entra o que `podeDivulgar` do cofre libera, com carimbo de verificação.
- Regras internas não vão para o front: a fórmula de temperatura e os critérios do cofre ficam internos; a tela mostra só o resultado e o carimbo "verificado há X".
- JSON-LD com preço velho é penalizável: só emitir com leitura fresca (R-81/R-90) e oferta publicável (`linkPublicavelFilter`).
- Carga no Postgres pequeno: feed novo sai de agregado ou cache, não de consulta pesada (lição de 18/11, memória "Análise pesada no banco derruba o envio").
- Escopo: respeitar a allow-list de vertical (ADR 0008), sem misturar retrô ou usado.

## 4. Recomendação: 12 candidatas ordenadas por valor/esforço

Esforço: P pequeno (até cerca de 1 dia), M médio, G grande. Valor: A alto, M médio, B baixo. Ordem: melhor relação primeiro.

| # | Funcionalidade | Valor | Esforço | Onde / base existente | Condição (regras) |
|---|---|---|---|---|---|
| 1 | JSON-LD `Product` + `Offer` (preço, moeda, disponibilidade; `aggregateRating` nunca sem dado real) na página de oferta | A | P | `src/app/(detalhe)/ofertas/[slug]/page.tsx`; filtro `linkPublicavelFilter` | Só oferta publicável e leitura fresca; sem preço-isca; sem texto de regra interna |
| 2 | Sitemaps segmentados: ofertas recentes (hourly), por vertical, cupons, notícias, com lastmod real | A | P | evoluir `src/app/sitemap.ts` (`generateSitemaps`) | Mesma allow-list do atual; falha de consulta não gera sitemap parcial |
| 3 | Oferta encerrada por item: último preço visto, data e "ver outras cotações" (próximo anúncio ativo mais barato) | A | P | `src/app/(shop)/oferta-encerrada/page.tsx`, `/go`; ata 10/11 (P3) e PANORAMA #9 | Só concorrência real; encerrada só com prova (sem estoque ou pausa), nunca pela idade (R-90) |
| 4 | Página pública `/cupons/<loja>` (Amazon, ML, Shopee, Magalu...) com cupons verificados, carimbo de verificação e botão com link do dono | A | M | `src/lib/coupons/cofre.ts`, guardião, `affiliate_coupons`; sem rota pública hoje | `podeDivulgar` único; verificação dentro da janela; cashback separado de desconto; link R-70 |
| 5 | Abas de descoberta em `/ofertas`: Recentes, Maiores quedas (vs média única), Menor preço histórico, Mais clicadas | A | M | `/ofertas`, `/tabela-de-precos`, `src/server/pricing/price-daily.ts` | Fórmula interna não exibida; só dado medido; filtro de isca (R-61) antes |
| 6 | Alerta por loja, categoria e palavra-chave (além de produto + preço-alvo), com envio no Telegram pessoal | A | M | `affiliate_price_watches`, `src/server/notifications/`, `/conta/notificacoes`; bot do Telegram | Cooldown (3 dias hoje); mesmas barreiras de link e de benefício de cartão |
| 7 | "Viram agora": contador real de cliques em 1 h no card e no detalhe | M | P/M | `/go/[slug]`; analytics (verificar `src/db/schema/analytics.ts`) | Medido, nunca inflado; só acima de mínimo; sem dado pessoal |
| 8 | Cache de borda curto com stale-while-revalidate para listas públicas (modelo `max-age=60` + SWR 240) | M | P/M | `ofertas`, home, `mercado`; `AUDITORIA_DESEMPENHO.md` | Respeita R-90 (vitrine em tempo real): janela curta, nunca preço vencido |
| 9 | PWA instalável + Web Push para alertas (sem app nativo) | M | M | `src/app` (sem manifest hoje), canal push em `notification.ts` | Opt-in explícito; sem banner cobrindo a primeira tela; push com a mesma barreira de link |
| 10 | Páginas de loja `/lojas/<loja>`: ofertas ativas, desconto médio, cupons verificados | M | M | `affiliate_networks`, `/mercado/[vertical]` | Só lojas com padrão de link registrado (R-70); sem selo "verificada" que não possamos provar |
| 11 | Botão compartilhar na oferta (reuso do link curto `/g/[code]`) | B/M | P | `src/app/g/[code]/route.ts` | Link curto já é afiliado do dono |
| 12 | Tab bar inferior e linha de ações grande no mobile (acompanhar, compartilhar, abrir) | B/M | M | componentes de shop; ficha mobile do Pelando | Sem banner de instalação sobre o conteúdo |

Ficam de fora (ver §2.3): UGC aberto, voto e temperatura social, cashback próprio, chat, perfil público, bloqueio de crawlers de IA.

## 5. Dado que falta

1. Performance ATUAL de `/ofertas` e da home (TTFB frio e quente); o parecer de DBA de 01/11 é antigo.
2. Se `src/db/schema/analytics.ts` guarda cliques por oferta por hora (necessário para #5 e #7).
3. Search Console: URLs indexadas e consultas que trazem tráfego (sem acesso nesta rodada); sem isso o valor SEO de #1, #2, #4 e #10 é [INF].
4. Termos de uso do Pelando quanto a observação automatizada (só leitura pública pontual foi feita).
5. Volume de alertas ativos e taxa de clique nas mensagens do Telegram, para priorizar #6 sobre #9.

## 6. Métrica de sucesso

- #1 e #2: ofertas amostradas com dados estruturados válidos no teste de rich results (meta 100% das publicáveis) e crescimento de URLs indexadas em 30 dias [INF até haver Search Console].
- #3: queda da taxa de saída da página encerrada (métrica já proposta na ata de 10/11) e % de visitas que seguem para outra cotação.
- #4: zero cupom exibido sem prova (auditoria `docs/avisos-cupom-sem-prova-2026-11-16.md`), cliques por cupom, % com carimbo dentro da janela.
- #5: cliques `/go` por visita a `/ofertas`; zero ofertas isca (R-61) no topo das abas.
- #6 e #9: alertas ativos por usuário, taxa de abertura, descadastros.

Ordem sugerida ao presidente: 1, 2 e 3 (baixo risco, sem regra nova), depois 4 (maior valor, maior cuidado), depois 5 e 6. Este parecer não executa nada.
