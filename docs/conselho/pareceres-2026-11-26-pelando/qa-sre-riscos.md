# Parecer Rodada 1 (independente, adversarial): QA, SRE, Performance, Segurança/DB

Data: 2026-11-26. Tema: engenharia reversa do Pelando. Somente leitura; 2 requisições públicas novas (termos de uso; home com cronometragem) além dos arquivos já coletados. Número sem fonte marcado NÃO VERIFICADO.

## 1. Desempenho público: Pelando x nós

Pelando (arquivos coletados e 1 requisição):
- Home: HTML 275.929 B; 29 tags script (módulos Astro em assets.pelando.com.br), 14 img (7 lazy), 17 ilhas, 3 JSON-LD, 11 blocos style. Transferido comprimido 41.604 B (gzip/br), TTFB 0,18 s, cf-cache-status HIT, Age 80 s.
- Oferta: HTML 419.227 B; 35 scripts, 22 img, 24 ilhas, 2 JSON-LD. Cabeçalho: public, max-age=60, stale-while-revalidate=240, x-edge-cacheable. Servido do edge sem consulta ao banco por visitante.
- JSON-LD da oferta: DiscussionForumPosting + Comment + BreadcrumbList + Organization. NÃO há Product nem Offer. O Pelando evita a política de preço do Google; não é referência de "JSON-LD de preço".

Nós (next.config.ts, layout, páginas; sem build):
- A home é `export const dynamic = 'force-dynamic'` (src/app/(shop)/page.tsx:27): cada visita dispara getPublicMetrics, pesquisa, enquete e seções com consulta própria. 93 arquivos em src/app usam force-dynamic; só 1 página pública com revalidate (jogos-switch-ate-200, 300 s) e o sitemap (3600 s). Sem cache de HTML no edge, cada visitante ou bot custa conexão do pool. A distância de arquitetura está aqui, não no tamanho do HTML.
- Imagens: images.unoptimized = true, remotePatterns "**". Sem transformação: o cliente baixa o original da loja. O Pelando transforma na URL (menos bytes). Ganho de LCP possível, com riscos de custo e direitos (abaixo).
- Cabeçalhos de segurança bons (HSTS, CSP report-only). `img-src https:` aceita qualquer host.
- JSON-LD próprio: nenhum em src/app (a única ocorrência em src é um leitor da Magalu). 
- TTFB/LCP/CLS/INP do nosso site: NÃO VERIFICADO (medir exige Lighthouse/CrUX, ferramenta pesada vetada nesta rodada).

Conclusão: copiar o contrato de cache (HTML público estável 60 s + SWR, dado dinâmico em API cacheada) vale mais que copiar ilhas ou JSON-LD.

## 2. Riscos de adotar as ideias no nosso ambiente

| # | Risco | Gravidade | Evidência |
|---|---|---|---|
| R1 | Pool de 3 conexões (src/lib/db/index.ts, `Math.min(max,2)` fora do pooler transacional). Página SSR nova por visitante, ISR com muitas rotas regenerando junto, ou API "ao vivo" por ilha satura o pool e derruba o envio do Telegram | Crítico | Incidente 18/11: envio de ~130 para ~4 em 15 min, consultas de 22-38 s; R-120 mostra fragilidade do ciclo |
| R2 | SEO programático em massa: conteúdo fino/duplicado (mesmo texto, preço trocado), canibalização master x oferta, risco de "scaled content abuse" no domínio inteiro | Alto | sitemap atual já limita 5.000 ofertas e 500 artigos |
| R3 | Canonical e variações: mesma oferta em lojas diferentes, parâmetros de filtro/ordenação, /go/ e /g/ (afiliado) | Alto | já em robots disallow; listas com filtro precisam canonical para a base e noindex nas combinações |
| R4 | JSON-LD Offer/Product com preço divergente da página (política Google: preço marcado = visível). Com "vitrine em tempo real" (R-90), Amazon "coletado há X" e ML congelado (403 desde 23/11) o preço marcado fica velho | Crítico | 54.131 de 54.221 ofertas ML ativas com confirmação >12 h (memória 25/11) |
| R5 | Cache de HTML com preço: 60 s + 240 s de SWR deixa o preço até 5 min velho; conflita com R-81 (Amazon 45 min) e R-90 | Alto | exige preço hidratado de API verificada, ou rótulo "coletado há X" calculado no cliente |
| R6 | Custo Vercel: API ao vivo por ilha, Image Optimization (hoje desligada), ISR de milhares de rotas, bots | Alto | NÃO VERIFICADO em R$ (sem faturamento); aumento é certo ao sair de force-dynamic para ISR curto em volume |
| R7 | Imagens: hospedar ou transformar fotos de lojas tem questão de direitos; regra do dono: foto real, sem IA, sem mão (seminovo). Copiar do Pelando ou de usuário é pior | Alto | memórias imagens-reais e foto-com-mão |
| R8 | LGPD se houver conta/alerta: Telegram chat id e e-mail mais itens monitorados são dado pessoal (perfil de consumo). Exige base legal, política, exclusão/portabilidade, retenção, contato do encarregado, cookies | Alto | existe /conta e auth Supabase; RLS por tabela; chat id nunca em log nem client |
| R9 | UGC (postar, comentar, votar): spam, links de afiliado alheios (viola R-70 e regra "nunca gravar tag de terceiros"), golpe/phishing, preço-isca (R-61), difamação, moderação 24 h | Crítico | UGC contorna por construção as regras duras do dono |
| R10 | Alertas por usuário: fan-out de envio (Telegram ~30 msg/s global, 1/s por chat) competindo pelo mesmo pool do envio atual | Alto | |
| R11 | Migrar para ilhas/Astro: reescrita de framework sem ganho comprovado | Médio | Next já tem RSC e Suspense (home usa) |
| R12 | Sitemaps por frescor: mais consultas pesadas ao banco, repetindo o padrão "análise pesada derruba envio" | Médio | |
| R13 | Copiar robots do Pelando (bloqueia ferramentas SEO) sem decisão do dono | Baixo | decisão de negócio |

## 3. Riscos de COLETA em relação ao Pelando

Fatos lidos:
- robots.txt: `User-agent: *` Allow `/`; Disallow só em /postar, /meus-alertas, /promocoes-salvas, /configuracoes, /cashback, /atendimento, /meu-perfil. Bloqueia por nome Baiduspider, PetalBot, ManusBot, DataForSeoBot, AhrefsBot, SemrushBot, DotBot. Sem Crawl-delay. Sitemap público.
- Termos (/sobre/termos-de-uso, HTTP 200): sem cláusula explícita sobre robôs, scraping, automação ou API (busca por esses termos sem acerto). Cláusula 9: todo o conteúdo (textos, gráficos, logotipos) é propriedade exclusiva do Pelando e o uso não autorizado é "estritamente proibido". Cláusula de conteúdo: o usuário declara não violar direitos de terceiros.
- Leitura prática: ler HTML público não é vedado pelo robots; reproduzir texto, foto e comentário (UGC e editorial) cai na cláusula 9 e em direito autoral. Não é parecer jurídico.
- Cloudflare: cf-ray e cf-cache-status presentes. Risco de desafio/captcha e bloqueio por IP/fingerprint se a frequência subir. Com cache de 60 s, consultar a mesma URL mais de 1x/min não traz dado novo. Limite de taxa NÃO testado de propósito.
- api-web.pelando.com.br: API não documentada, fora do robots do www. Caminho mais provável de bloqueio e de questionamento. Veto.
- Identificação: User-Agent honesto com contato; não imitar navegador; não usar a aba logada do dono.
- Natureza do dado: pista, não fonte (mesmo princípio R-79). Promoção do Pelando só vale o que a loja mostrar; preço de terceiro nunca entra em média, mínimo, card ou mensagem (R-61, R-71).
- Fragilidade: depender de concorrente que muda HTML ou bloqueia sem aviso é o mesmo padrão do ML 403 (23/11, sem aviso, coleta parada). Tratar como fonte descartável.

## 4. Critérios de aceite e testes para qualquer feature derivada

Todos obrigatórios; falha em qualquer um bloqueia o "concluído".

1. Gate R-83: `npm run gate` verde (e `--completo` ao tocar preço/mensagem/catálogo) antes do commit; módulos congelados intocados; contrato de tarefa escrito (arquivos permitidos, o que não muda).
2. QA independente R-87: verificador que não escreveu o código roda tipos e build, abre desktop e mobile, confere o número da tela contra o banco, estado vazio/erro/carregando, e assina. Autor não aprova o próprio trabalho.
3. Flag de reversão: feature nasce atrás de flag desligada (percentual 0, como REDESENHO_HOME), reversível sem deploy, comando de desligar documentado. Loops novos seguem "loops nunca param", com freio e orçamento.
4. Carga no banco: medir `group_messages` por 15 min antes e depois (linha de base ~130/15 min); queries novas com statement_timeout curto, uma conexão, sem count exato; teste de carga curto no pool de 3 com ~50 visitantes concorrentes na rota nova. Aprovado se nenhuma espera de envio >2 s e zero EMAXCONN.
5. Cache: toda rota pública nova com política explícita (revalidate ou s-maxage+SWR) e teste que prova 1 consulta por janela, independente do número de visitas.
6. SEO: cada URL indexável com conteúdo único mínimo (preço, histórico, loja, texto específico) acima de limiar definido; canonical para a base; filtros noindex; sitemap só de páginas vivas (ativas, com preço e imagem); amostra de 30 páginas revisada à mão; conferir Search Console após 14 dias.
7. Dado estruturado: nenhum Offer/Product sem leitura fresca (padrão negado: Amazon <=45 min, ML <=12 h, Shopee por regra própria); preço do JSON-LD vem da mesma variável do HTML; teste automatizado compara os dois; validador de rich results em amostra; leitura velha omite o bloco inteiro.
8. Regras do dono: sem dado fake; um master por mídia; preço público só de oferta ativa; imagem real, sem IA, sem mão; só produto novo e em linha; todo link é afiliado do dono (R-70); regras internas fora do front; tipo de preço Amazon (R-69); condição não nova fora (R-75).
9. LGPD (se conta/alerta): mapa de dados, base legal, consentimento do alerta, exclusão por self-service, chat id e e-mail só no servidor e fora de logs, RLS por tabela, retenção definida, teste de que o usuário A não lê o dado do B.
10. Segurança: sem service_role no client; cron novo com segredo; admin com papel; CSP report-only sem violação nova; rate limit em formulários e APIs públicas.
11. Coleta: User-Agent honesto, respeito a robots, no máximo 1 req/min por URL com teto diário, interruptor único e parada automática no primeiro 403/429/captcha; nada guardado do texto ou imagem do Pelando, só fato derivado que volta a ser verificado na loja.
12. Retrospectiva: métrica de sucesso (TTFB/LCP medidos, tráfego, cliques, erros) registrada na ata; reverter se pior.

## 5. Vetos recomendados

1. Veto a página SSR por visitante ou API pública "ao vivo" ligada ao pool de 3 conexões sem cache e sem teste de carga (R1, R10).
2. Veto a páginas programáticas em massa sem conteúdo único e canonical definido (R2, R3); começar com teto baixo e crescer por lote medido.
3. Veto a JSON-LD Product/Offer enquanto o frescor do preço não for garantido pela mesma fonte da página; ML sob 403 fica de fora. Liberar por plataforma com leitura fresca (R4, R5).
4. Veto a copiar ou hospedar texto, foto, comentário ou logotipo do Pelando (cláusula 9); veto à api-web.pelando.com.br; veto a coleta com User-Agent camuflado ou pela conta/aba logada do dono.
5. Veto a UGC sem moderação 24 h, bloqueio de link de afiliado de terceiros, rate limit e fila de revisão (R9). Fase 1 só leitura.
6. Veto a contas/alertas com dado pessoal sem fluxo LGPD completo e teste de isolamento por usuário (R8).
7. Veto a ligar Image Optimization da Vercel em larga escala sem teto de custo e alerta de faturamento (R6). Alternativa: miniaturas pré-geradas uma vez na coleta.
8. Veto a trocar Next por Astro ou reescrever em ilhas (R11): copiar o padrão de cache e carga diferida, não a stack.
9. Veto a qualquer levantamento pesado no banco de produção com o envio ligado (incidente 18/11): amostras <=2 mil linhas, pausas, conferir envio antes e depois.
10. Veto a declarar concluído sem QA independente e gate (R-83, R-87).

Ordem de baixo risco sugerida: (a) cache de HTML nas páginas públicas estáveis (ofertas, tabela de preços) com teste de queries; (b) sitemap segmentado com consultas leves; (c) JSON-LD só Organization/BreadcrumbList/WebSite, sem preço; (d) medir Lighthouse/CrUX uma vez, fora do horário de envio; (e) só então discutir alertas e conta, com LGPD.

## Dados que faltam
- Core Web Vitals reais do nosso site (CrUX/Lighthouse): NÃO VERIFICADO.
- Faturamento e limites do plano Vercel.
- Limite de taxa do Cloudflare do Pelando: não testado de propósito.
- Posição jurídica sobre fato derivado de concorrente.
