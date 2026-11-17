# PROJECT_BLUEPRINT.md: Espaço Geek 86

> **Fonte de verdade permanente do projeto.** Visão, missão, posicionamento, arquitetura e princípios do Espaço Geek 86. Toda decisão futura (técnica, visual ou comercial) deve respeitar o que está escrito aqui. Atualizar sempre que uma decisão estratégica nova for tomada.
>
> **Convenção de estado**: 🟢 **Construído e verificado** (existe no código e foi medido rodando) · 🟡 **Estrutura existe, não ligada ou parcial** · ⚪ **Visão / roadmap** (não iniciado) · **NÃO VERIFICADO** (não foi possível confirmar na auditoria).

> ### Atualizado em 2026-11-15 (auditoria geral do Conselho Geek, fila #64)
> **O que mudou neste documento.** A versão de julho/2026 descrevia um "marketplace" com Geek Deals como único produto funcional, "Coleta somente por API oficial" e a Fase 3 aguardando deploy. O produto real, medido em 15/11, é um **hub de inteligência de preços gamer/tech**: três redes de varejo (Mercado Livre, Shopee, Amazon; Magalu em estudo), sete departamentos, indicadores próprios (média por oferta/dia, menor preço registrado, selo), mensagens automáticas no Telegram, coleta oficial por API mais coleta assistida em abas logadas do dono, e receita por comissão de afiliado (prevista no admin, ainda não medida). As seções 1, 4, 6, 7, 12, 13 e 17 foram reescritas; as seções de marca, tom de voz, Geek Graph, gamificação e comunidade foram preservadas. O Marketplace (carrinho, pedidos e pagamento) e a Hype Zone **não** são o produto de hoje; ficam como visão (⚪). Insumos: `docs/auditoria-2026-11-15/00-sintese.md` e os painéis 01 a 04. Números abaixo são instantâneos de 15/11/2026, 04:40 a 08:00 BRT.

---

## 1. O que é o Espaço Geek 86

É um **hub de inteligência de preços** para o consumidor gamer e de tecnologia no Brasil. O sistema acompanha ofertas reais de varejistas, guarda o histórico de preço de cada oferta, calcula uma média única por produto, registra cada mudança do menor preço e avisa quedas reais. O que o diferencia de um agregador comum é a **medição**: só chama de oferta o que o histórico prova.

**Como ganha dinheiro.** Comissão de afiliado por clique rastreado (`/go/<slug>`) nas redes em que tem programa: Mercado Livre, Shopee e Amazon. Magalu está em estudo (portal Parceiro/Influenciador; pausada pelo dono). Comissão realizada: **SEM DADO** (0 conversões importadas). Comissão prevista: métrica interna, só no `/admin` (tabela versionada de taxas; apenas a taxa da Amazon é confirmada, ML, Shopee e Magalu são estimadas).

**Produto principal:** o motor de preços (Geek Deals, agora a espinha do sistema inteiro), mais o site público (departamentos, páginas de produto, `/black-friday`, monitoramento) e as mensagens no Telegram.

## 2. Visão

Criar a plataforma de inteligência para consumo geek mais completa do Brasil, e depois mais além. Assim como a CamelCamelCamel revolucionou histórico de preços e a IsThereAnyDeal revolucionou promoções de jogos, o Espaço Geek 86 quer ser a referência em saber **quando um preço é de fato bom** no universo geek.

## 3. Missão

Permitir que qualquer pessoa compre melhor através de inteligência de dados, transparência, curadoria e tecnologia.

## 4. Posicionamento

Vendemos informação, confiança e decisão, não produtos próprios. **Proposta de valor central:** "Ofertas reais. Decisões inteligentes." Na prática: preço honesto com histórico (série por oferta e por dia, menor preço registrado, selo com piso de 5 cotações e 14 dias) e mensagem de queda real com o preço reconferido ao vivo antes do envio.

**Concorrente de referência:** Jogo Barato (curadoria humana de achados com ritmo alto). Vantagem nossa: histórico e medição que o concorrente não publica. Fraqueza nossa, medida: ritmo de captura de Prime e cupom, frescor da Amazon e audiência.

**Públicos reais hoje:** gamer brasileiro comprador de console e jogo físico novo; em menor grau impressão 3D (Bambu Lab, Anycubic Kobra), tecnologia, eletrodomésticos, eletroeletrônicos, esporte e livros. Audiência medida: 1 chat do Telegram com 5 membros.

## 5. Princípios do produto

Toda funcionalidade criada deve fortalecer pelo menos um destes pilares:

1. Descoberta
2. Confiança
3. Conversão
4. Retenção
5. Comunidade
6. Colecionismo
7. Inteligência

Se uma funcionalidade não fortalecer nenhum desses pilares, **ela não deve entrar no produto.**

## 6. Diferencial

- Histórico real de preços por oferta e por dia; menor preço registrado com cada mudança em evento.
- Comparação entre redes (ML, Shopee, Amazon) numa só média por produto.
- Mensagem com preço reconferido ao vivo antes do envio: 0 de 2.865 divergiram mais de 2% na reconferência (máximo 0,89%).
- Identidade de cesta rigorosa: região, geração cruzada e edição limitada separam produtos; cor junta; só novo e em linha; sem peças e itens miúdos (ADR 0006).
- Reputação do vendedor: vendedor fraco continua visível mas fica fora da média.
- Classificação específica do universo geek (físico x digital, geração de console, tipo de edição).
- Alertas de queda ao usuário (e-mail e Telegram) e Black Friday monitorada.
- Fontes: API oficial onde existe; coleta assistida na aba logada do dono onde não existe (ver seção 13).

## 7. Produtos e frentes do ecossistema

### Motor de preços e catálogo 🟢
Coleta, identidade, indicadores e histórico. Núcleo do negócio. Detalhes na seção 13 e no `FLUXO_MESTRE.md`.
- 🟢 31,3 mil ofertas ativas (ML ~24,5 mil, Shopee ~4,1 mil, Amazon ~2,8 mil) e 6.443 masters aprovados com oferta ativa; 1.007 (15,6%) em duas ou mais redes; 1.482 de 8.326 masters ativos (17,8%) com 5 ou mais ofertas.
- 🟢 Média por oferta/dia (ADR 0004), Amazon na média única (ADR 0010), identidade de cesta (ADR 0006), validação de identidade em rodadas (ADR 0011).
- 🟡 Dias de preço abertos: 541 a 719 linhas `closed=false` com data passada (fila #15), em alta.

### Site público 🟢
Sete departamentos (ADR 0008): Games, Impressão 3D, Tecnologia, Livros, Eletrodomésticos, Eletroeletrônicos e Esporte. Páginas de produto com gráfico, `/black-friday`, `/monitoramento`, `/contatos`, busca, notícias, conta de cliente (alertas de preço). Home nova (ADR 0012) pronta atrás de flag, rollout planejado para 19, 21 e 22/11 (sem agendador; fila #84). Contatos e botões de canal só em `/contatos`.

### Mensagens automáticas 🟢
`group-messages` a cada minuto: detecta, aplica régua de destaque (R-44), cooldown de 8 h por produto (R-47), mensagem neutra N1 para produto sem base (R-51), reconferência ao vivo e envio ao Telegram (um grupo por loja e canal Destaques). Cerca de 1.440 mensagens/dia; 0 com termo proibido nas últimas 48 h. Cartões de imagem v2 (flag; estado em produção NÃO VERIFICADO). WhatsApp é assistido e manual: 0 envios em 7 dias 🟡.

### Cupons e promoções 🟡
Cupom na agulha (4 conferências), guardião de cupons, cupom encerrado com nome (#56), promoções da Amazon por laço de navegador, promoção Prime derivada atrás de flags (estado NÃO VERIFICADO; 0 mensagens Prime em 48 h). Cupom da Shopee: 0 em `coupon_items`.

### Admin 🟢
Catálogo, ofertas, aprovação (`/admin/aprovacao`), fluxo ao vivo (`/admin/fluxo`), comissão prevista (`/admin/comissao`), mensagens, usuários. Autorização real em `requireAdmin`.

### Marketplace próprio ⚪
Schema de carrinho, pedidos, variantes e pagamentos existe no banco; **não é o produto de hoje**. Sem UI de venda própria.

### Hype Zone, Geek Intelligence, Geek Community ⚪
Visão. Há tabelas de drops, wishlist e reviews no schema, sem funcionalidade ligada. Geek Intelligence é a versão analítica do que o motor de preços já entrega.

## 8. Geek Graph: inteligência de interesse do usuário ⚪

*(Conceito de médio e longo prazo, não iniciado.)*

A Amazon conhece o que você compra. A Steam conhece o que você joga. O Spotify conhece o que você escuta. O Espaço Geek 86 pode conhecer **o universo geek de cada usuário**: um grafo de interesses relacionando franquias, consoles, editoras, estúdios, personagens, coleções, gêneros e plataformas, usado para personalizar recomendações, alertas e a organização da home.

**Sinal embrionário que já existe no banco**, sem processamento ainda: cada linha de `affiliate_price_watches` liga `userId` a `masterProductId`. Ponto de partida natural: agregar esse sinal e outros equivalentes (visualização, clique) por atributo do master (franquia, plataforma, gênero).

## 9. Experiência

O usuário nunca deve sentir que entrou em um e-commerce. Ele deve sentir que entrou em um universo vivo: descoberta, curiosidade, confiança, sofisticação, emoção, tecnologia.

## 10. Identidade visual

Paleta oficial: preto profundo, dourado, creme, grafite. Tipografia forte, minimalismo, motion elegante, nada poluído; cantos retos e contraste (skill `padrao-visual-egeek`). Inspiração: Apple, Steam, PlayStation Store, Netflix, StockX, SuperRare. O estado de aplicação da paleta oficial no site em produção é NÃO VERIFICADO nesta rodada (a home nova e o redesenho estão atrás de flag).

**Elementos definidos:**
- Símbolo: ícone quadrado de cantos arredondados com três barras verticais (curta-alta-curta) separadas por linha pontilhada, motivo de comparação de preço.
- Wordmark: "ESPAÇO" em creme + "GEEK 86" em dourado, caixa alta, bold/black condensado.
- Tagline principal: "Ofertas reais. Decisões inteligentes."
- Tagline secundária: "Tecnologia · Games · Cultura Pop · Ofertas"
- Ícones de benefício (5 pilares): Ofertas Selecionadas, Histórico de Preços, Vendedores Confiáveis, Cupons Exclusivos, Compre Melhor.
- Imagens: foto real do produto; nunca imagem gerada por IA para card ou oferta.

## 11. Tom de voz

Especialista. Próximo. Didático. Confiável. Apaixonado por cultura geek. Nunca exagerado. Nunca sensacionalista. **Sempre baseado em dados.** Mensagem de oferta sem termos como "amostra", "metodologia" ou "(Brasília)".

## 12. Arquitetura do produto

*(Estado real verificado no código em 15/11/2026.)*

- Next.js 16.2.6 (App Router) 🟢. **Esta versão tem breaking changes**: consultar `node_modules/next/dist/docs/` antes de escrever rota (ver `AGENTS.md`). A auditoria de segurança indica atualização para 16.4.6 (fila #77).
- TypeScript 🟢 (`tsc` com 0 erros, 31 s); Tailwind v4 🟢; Radix UI + class-variance-authority 🟢.
- Supabase (Auth + Postgres, plano Micro, 60 conexões, PostgreSQL 17) 🟢; Drizzle ORM 🟢; RLS ligada em 102 de 102 tabelas, `anon` sem nenhum acesso 🟢.
- Hospedagem Vercel; **26 crons** em `vercel.json` (coleta ML e Shopee a cada 5 min, 6 coletas por vertical a cada 15 min, mensagens a cada minuto, snapshots, cobertura Shopee, semeadura, aprovação automática, saúde) 🟢.
- RSC-first e Server Actions; páginas públicas dinâmicas com cache de vitrine em memória por instância (risco na Black Friday, fila #89) 🟡.
- Organização por domínio (DDD-ish, `src/db/schema/*`; lógica pura em `src/lib`, I/O em `src/server`) 🟢.
- Observabilidade: `collector_runs`, `collector-health` a cada 30 min, `/admin/fluxo`, `/api/health`. **Alertas em dry-run e sem sonda externa** (fila #70) 🟡.
- Segurança: HSTS, `X-Frame-Options`, CSP parcial em enforce e completa em Report-Only; cron e ingest em tempo constante e fail-closed; `?key=` na URL ainda aceito e só instrumentado (fila #73) 🟡.
- Realtime do Supabase, SEO programático e pipeline amplo de analytics: ⚪/🟡 (`analytics_events` registra o clique de afiliado e eventos da home).
- **Repositório GitHub hoje PÚBLICO** (contém `docs/backups`, estratégia e atas): tornar privado é P0 (fila #69).

## 13. Engenharia de dados

**Fontes de coleta** (decisão evoluída; ver ADR 0009 e `FLUXO_MESTRE.md` R-02):
1. **API oficial no servidor** (cron): Mercado Livre (OAuth, busca, itens, cupom) e Shopee (API de afiliados). É o caminho padrão e o único que roda sem o computador do dono.
2. **Coleta assistida em abas logadas do dono**: Amazon (preço, vitrine, promoções), cupons e links meli.la do ML. Exceção autorizada pelo dono (2026-11-10): aba do próprio dono, fila curta, pausa aleatória, recuo em captcha, login, 403 ou 429, sem raspagem em massa e sem contornar proteções. Roda por laços em `public/loops/` com vigia que reinjeta e reabre a aba. **Risco declarado:** viola a política de Associados da Amazon e depende de um computador ligado (fila #95 decide o caminho para API oficial).
3. **Derivação interna**: preço derivado de promoção Prime só para ordenar o front; nunca como cotação.

**Princípios** (valem para qualquer coleta):
- Nenhum dado fake, sintético, interpolado ou preenchido. Sem leitura, sem oferta.
- Dados auditáveis: todo dado sabe de onde veio; horário carimbado pelo servidor.
- Histórico append-only: nunca deletar `affiliate_offers` nem `affiliate_price_snapshots` (usar `status = 'expired'`).
- Toda gravação em massa é reversível: dry-run por padrão, backup NDJSON e log em `docs/backups/`, `--rollback` (49 de 64 scripts de escrita seguem; 13 legados não, fila #106).
- Segredo só na Vercel (Sensitive) e em memória; nunca em arquivo, log ou resposta.
- Cada oferta vale 1 por dia na média; toda mudança do menor preço vira evento.
- Observabilidade desde o primeiro dia: cron reporta resumo estruturado em `collector_runs`.

**Gaps medidos hoje:** orçamento de tempo esgotado em 96% das execuções do `collect-shopee`; fila de coleta que não zera; linhas `running` presas; segundo disparador do `collect-prices`; backup só local (fila #71 a #73, #88).

## 14. Gamificação ⚪

Schema existe (`loyalty.ts`: badges, levels, missions, points_ledger) sem lógica ligada. Visão: Geek Points, ranks, badges, missões, conquistas. ADR 0003 registra a proposta.

## 15. Comunidade ⚪

Perfis públicos, coleções compartilháveis, reviews, rankings, listas. Schema parcial (`engagement.ts`) sem UI. A prioridade de audiência hoje é captar inscritos nos canais (fila #80), não construir comunidade interna.

## 16. Analytics

Toda interação relevante deve gerar evento. **Hoje** só o clique de afiliado e eventos da home são instrumentados de verdade. 72% dos cliques registrados são de bots (prévia de link e indexadores); o KPI deve usar cliques válidos (fila #79). Receita realizada: SEM DADO (importador de conversões escrito, não agendado; fila #78).

## 17. Roadmap (retrato corrigido)

- **Concluído:** MVP Geek Deals (ML); classificação de jogo; coleta automática; login de cliente e alertas; Shopee e Amazon; 7 departamentos; média por oferta/dia; mensagens no Telegram com régua; cupons; Central de aprovação; Bambu/Kobra com prioridade; comissão prevista no admin.
- **Em andamento (P0 até 19/11 e P1 até a Black Friday, 27/11):** segurança e continuidade (repositório privado, alertas, backup, dependências), integridade de preço (quarentena em lote), medição de receita e audiência, frescor da Amazon, Prime e cupom, rollout da home nova (19, 21 e 22/11, congelamento de 23 a 28/11). Plano único em `docs/auditoria-2026-11-15/00-sintese.md` e fila #69 a #110.
- **Depois de 27/11:** gráfico V2 único (#49), Magalu (#61), refatoração do motor de mensagens, retenção do banco, indicador de tendência da Black Friday (#10).
- ⚪ **Futuro, sem sequência:** WhatsApp automático, Geek Graph, gamificação, comunidade, internacionalização, apps, marketplace próprio, ferramentas B2B.

## 18. Filosofia

O Espaço Geek 86 deve ser reconhecido como a plataforma mais inteligente, confiável e honesta para quem vive a cultura geek e quer comprar melhor. Toda decisão técnica, visual ou comercial deve reforçar essa identidade.

---

*Documento vivo. Para as regras de Next.js desta versão, ver `AGENTS.md`; para a lei de convivência dos processos, `docs/03-metodologia/FLUXO_MESTRE.md`; para as tarefas, `docs/fila-de-execucao.md`.*
