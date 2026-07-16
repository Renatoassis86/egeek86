# PROJECT_BLUEPRINT.md — Espaço Geek 86

> **Fonte de verdade permanente do projeto.** Este documento define visão, missão, posicionamento, arquitetura e princípios do Espaço Geek 86. Toda decisão futura — técnica, visual ou comercial — deve respeitar o que está escrito aqui. Deve ser atualizado sempre que uma decisão estratégica nova for tomada.
>
> Referência para: Claude Code, Antigravity, ChatGPT, desenvolvedores, designers, product managers, cientistas de dados, marketing, futuros colaboradores.
>
> **Convenção deste documento**: cada seção de produto/feature traz uma marcação de estado —
> 🟢 **Construído e testado** (existe no código, foi verificado rodando) · 🟡 **Estrutura existe, não ligada** (schema no banco, zero UI/lógica) · ⚪ **Visão / roadmap** (ainda não iniciado).
> Isso existe pra este documento continuar confiável como fonte de verdade — misturar visão com realidade sem distinção é o que faz um blueprint virar ficção.

---

## 1. O que é o Espaço Geek 86

O Espaço Geek 86 não é apenas um marketplace.

É uma empresa de tecnologia especializada no universo geek. Seu propósito é construir o maior ecossistema brasileiro — e futuramente internacional — de **inteligência para consumo geek**.

A empresa unifica:

- Marketplace premium
- Inteligência de preços
- Histórico de preços
- Comparador de ofertas
- Curadoria especializada
- Conteúdo editorial
- Comunidade
- Gamificação
- Programa de fidelidade
- Colecionismo
- Recomendação inteligente
- Inteligência de dados
- Alertas inteligentes
- Consultoria para decisão de compra

O marketplace é apenas um dos produtos. **O verdadeiro produto é inteligência.**

## 2. Visão

Criar a plataforma de inteligência para consumo geek mais completa do mundo.

Assim como a Amazon revolucionou o comércio, a Steam revolucionou a distribuição de jogos, a Netflix revolucionou o entretenimento, a CamelCamelCamel revolucionou histórico de preços e a IsThereAnyDeal revolucionou promoções de jogos — o Espaço Geek 86 pretende revolucionar a forma como pessoas descobrem, acompanham, pesquisam, compram, colecionam e valorizam produtos do universo geek.

## 3. Missão

Permitir que qualquer pessoa compre melhor através de inteligência de dados, transparência, curadoria e tecnologia.

## 4. Posicionamento

O Espaço Geek 86 não vende apenas produtos. Vendemos: informação, inteligência, confiança, pertencimento, descoberta, nostalgia, colecionismo, experiência.

**Proposta de valor central:**

> Ofertas reais. Decisões inteligentes.

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

O projeto não compete apenas por preço. Compete por inteligência.

- Histórico real de preços
- Comparação entre marketplaces
- Dados oficiais via APIs (nunca scraping — ver seção 11)
- Reputação de vendedores
- Curadoria especializada
- Classificação específica para o universo geek (ex: físico vs. digital, geração de console, jogo completo vs. DLC/upgrade/bundle)
- Alertas automáticos
- Inteligência de compra
- Comunidade
- Gamificação
- Hype Zone
- Conteúdo especializado

## 7. Produtos do ecossistema

### Geek Deals 🟢 *(em desenvolvimento ativo — o único produto do ecossistema com funcionalidade real hoje)*

Motor de inteligência de preços. Responsável por histórico, gráficos, alertas, comparações, melhores ofertas e análise de preço.

**O que já funciona de verdade, testado ao vivo:**
- Coleta oficial via API do Mercado Livre (OAuth 2.0 + PKCE) — 396 jogos de Nintendo Switch importados com preço, imagem, vendedor e classificação (físico/digital/geração de console/tipo de edição).
- Coletor automático priorizando atualização de jogos acompanhados por clientes (5 min) sobre o catálogo geral (15 min).
- Vitrine pública (`/ofertas`) com filtro por formato/geração/rede e destaque de melhores ofertas.
- Página de oferta com histórico de preço, menor valor já visto, média de 30 dias, reputação do vendedor.
- Conta de cliente (`/entrar`, `/conta`) com lista de jogos acompanhados e métricas de cada um.
- Alerta diário automático (e-mail via Resend + Telegram via bot próprio) quando um jogo acompanhado bate o menor preço histórico ou fica 12%+ abaixo da média de 30 dias.
- Admin completo: CRUD de ofertas/cupons/redes, dashboard de métricas, geração assistida de mensagem para WhatsApp (copiar/colar).

**Deliberadamente fora de escopo por ora** (decisão já tomada, não reabrir sem necessidade real): scraping de qualquer tipo (só API oficial), WhatsApp automático (exige aprovação de template pela Meta/Business), cupom automático (a API do Mercado Livre não expõe cupom de terceiros — só cadastro manual do admin).

### Marketplace 🟡 *(schema completo no banco — carrinho, pedidos, produtos, variantes, pagamentos — zero UI e zero Server Actions)*

Venda de: games, consoles, action figures, colecionáveis, Pokémon, TCG, board games, eletrônicos, informática, impressão 3D, cultura pop, tecnologia, utilidades geek.

### Hype Zone 🟡 *(schema de drops existe — zero UI)*

Centro de tendências. Produtos em alta, lançamentos, drops, coleções, itens limitados.

### Geek Intelligence ⚪

Área dedicada à inteligência de mercado: relatórios, insights, comparativos, histórico, análises, estatísticas — a versão "profissional/analítica" do que o Geek Deals já entrega de forma simplificada ao consumidor final.

### Geek Community ⚪ *(tabelas de wishlist/reviews existem no schema, não wired)*

Perfis, coleções públicas, avaliações, discussões, missões, conquistas.

## 8. Geek Graph — inteligência de interesse do usuário ⚪

*(Conceito novo, ainda não iniciado — registrado aqui porque é considerado um diferencial competitivo de médio/longo prazo.)*

A Amazon conhece o que você compra. A Steam conhece o que você joga. O Spotify conhece o que você escuta. O Espaço Geek 86 pode conhecer **o universo geek de cada usuário**.

A ideia é construir um grafo de interesses relacionando franquias, consoles, editoras, estúdios, personagens, coleções, gêneros, plataformas, cartas, action figures, filmes, séries, mangás e hábitos de compra — usado para personalizar recomendações, alertas, Hype Zone, campanhas, rankings e até a organização da home.

**Sinal embrionário que já existe no banco hoje**, sem qualquer processamento em cima ainda: cada linha de `affiliate_price_watches` já conecta `userId → masterProductId` (o jogo que o cliente escolheu acompanhar) — é literalmente a primeira aresta de um grafo de interesse, só não é tratada como tal ainda. Quando este produto for priorizado, o ponto de partida natural é agregar esse sinal (e futuros sinais equivalentes — visualização de produto, clique em oferta) por atributo do `master_product` (franquia, plataforma, gênero) em vez de só por produto individual.

## 9. Experiência

O usuário nunca deve sentir que entrou em um e-commerce. Ele deve sentir que entrou em um universo vivo.

O site deve transmitir: descoberta, curiosidade, confiança, sofisticação, emoção, tecnologia.

## 10. Identidade visual

**Estado atual**: o site hoje usa uma paleta roxo/laranja provisória (tema "cofre da cultura geek"). A paleta oficial abaixo foi definida e **ainda não foi aplicada** — é a próxima migração de design pendente.

Inspiração: Apple, Steam, PlayStation Store, Netflix, StockX, SuperRare.

**Paleta oficial:**
- Preto profundo
- Dourado
- Creme
- Grafite

Tipografia forte, minimalismo, motion elegante, nada poluído.

**Elementos já definidos** (ver assets recebidos):
- Símbolo: ícone quadrado de cantos arredondados com três barras verticais (curta-alta-curta) separadas por linha pontilhada — motivo de comparação de preço/dial.
- Wordmark: "ESPAÇO" em creme + "GEEK 86" em dourado, caixa alta, peso bold/black condensado.
- Tagline principal: "Ofertas reais. Decisões inteligentes."
- Tagline secundária: "Tecnologia · Games · Cultura Pop · Ofertas"
- Ícones de benefício (5 pilares, formato tag): Ofertas Selecionadas, Histórico de Preços, Vendedores Confiáveis, Cupons Exclusivos, Compre Melhor.

## 11. Tom de voz

Especialista. Próximo. Didático. Confiável. Apaixonado por cultura geek.

Nunca exagerado. Nunca sensacionalista. **Sempre baseado em dados.**

## 12. Arquitetura do produto

*(Estado real verificado no código, não aspiracional — divergências do texto original do blueprint anotadas explicitamente.)*

- Next.js 16 (App Router) — 🟢 ver `AGENTS.md`: **esta versão tem breaking changes vs. o conhecimento de treinamento de qualquer IA** (params de rota dinâmica são `Promise<{...}>`, entre outras mudanças) — sempre consultar `node_modules/next/dist/docs/` antes de escrever código de rota.
- TypeScript — 🟢
- Tailwind v4 — 🟢
- Design system próprio sobre Radix UI primitives + class-variance-authority (padrão arquitetural igual ao shadcn/ui — componentes copiados/adaptados no repo, não instalados via CLI/registry) — 🟢
- Supabase (Auth + Postgres) — 🟢
- Drizzle ORM — 🟢
- Server Actions + React Server Components (RSC-first) — 🟢
- Organização por domínio/bounded context (`src/db/schema/*` um arquivo por domínio, Geek Deals deliberadamente separado do catálogo geral de marketplace) — 🟢. *(O texto original citava "Feature Sliced Architecture" — o projeto não segue essa metodologia formalmente; o padrão real é DDD-ish por bounded context, mais simples.)*
- Mobile first — 🟢 (front público e admin verificados responsivos em desktop e mobile)
- Realtime (Supabase Realtime) — ⚪ não implementado
- SEO programático — 🟡 tabela `seo_redirects` existe no schema, sem geração/uso
- Analytics — 🟡 tabela `analytics_events` existe e já é usada para clique de afiliado; não há pipeline de analytics amplo ainda
- Discovery Commerce, Gamificação, Hype Zone (como features de produto) — ⚪ ver seção 7

## 13. Engenharia de dados

Princípios (já seguidos no Geek Deals, devem valer para qualquer coleta futura):

- Coleta **oficial via APIs**, nunca scraping — decisão arquitetural, não só prática. Motivo registrado: scraping em escala viola termos de uso das plataformas parceiras (Mercado Livre, Amazon, etc.) e é exatamente o tipo de automação de evasão de detecção que este projeto evita construir, mesmo quando tecnicamente possível.
- Dados auditáveis — todo dado coletado sabe de onde veio (`source: 'manual' | 'api' | 'scrape'` em `affiliate_price_snapshots`).
- Append-only para eventos históricos (preço, cliques) — nunca sobrescrever, sempre snapshot novo.
- Histórico completo preservado, nunca truncado.
- Rastreabilidade: toda mutação relevante sabe quem fez (`createdBy`) e quando.
- Escalabilidade: índices BRIN em tabelas de série temporal de alto volume, refresh diferenciado por "temperatura" do dado (jogo acompanhado atualiza mais rápido que o resto do catálogo).
- Observabilidade e métricas desde o primeiro dia — cron jobs reportam resumo estruturado (`checked`, `updated`, `errors`) em vez de silenciosamente rodar.

## 14. Gamificação ⚪

Schema existe (`loyalty.ts`: badges, levels, missions, points_ledger, user_badges, user_missions) — **zero lógica de negócio ligada ainda**.

Visão: Geek Points, ranks, badges, missões, coleções, conquistas, drops exclusivos, níveis, sistema de fidelidade.

## 15. Comunidade ⚪

Construir recursos que transformem compradores em membros ativos: perfis públicos, coleções compartilháveis, reviews, rankings, recomendações, listas.

Schema parcial existe (`engagement.ts`: wishlists, reviews, review_votes, product_views) — não wired a nenhuma UI ou Server Action.

## 16. Analytics

Toda interação relevante deve gerar evento para aprendizado do produto. Métricas-alvo: descoberta, engajamento, retenção, conversão, recorrência, valor por usuário, comportamento de compra.

**Hoje**: só clique de afiliado (`affiliate_click`) é instrumentado de fato.

## 17. Roadmap

- **MVP (concluído)**: Geek Deals — coleta manual, catálogo Mercado Livre, admin, vitrine pública.
- **Fase 1 (concluída)**: classificação de jogo (físico/digital/geração/edição), reputação de vendedor, rankings/filtros.
- **Fase 2 (concluída)**: coleta automática via API oficial, importação em massa (396 jogos), correção de bugs de classificação.
- **Fase 3 (concluída)**: front público e admin redesenhados (desktop + mobile), login de cliente, dashboard `/conta`, alertas automáticos por e-mail e Telegram, agendamento via Supabase pg_cron (aguardando deploy em produção para ativar de fato).
- **Fase 4 (não iniciada)**: migração de identidade visual (paleta preto/dourado, logo, wordmark), conteúdo institucional (Quem Somos, rodapé com crédito Arkos Intelligence, redes sociais).
- ⚪ Futuro, não sequenciado: WhatsApp automático (Business API), Amazon/Kabum/Shopee/AliExpress, Geek Graph, gamificação, comunidade, internacionalização, apps móveis, marketplace completo (carrinho/pedidos/pagamento), APIs públicas, programa de sellers, programa de afiliados formal, ferramentas B2B/Geek Intelligence.

## 18. Filosofia

O Espaço Geek 86 deve ser reconhecido não como um simples marketplace, mas como a plataforma mais inteligente, confiável, bonita e completa para qualquer pessoa que viva a cultura geek.

Toda decisão técnica, visual ou comercial deve reforçar essa identidade.

---

*Este documento deve permanecer vivo durante toda a evolução do projeto e ser atualizado sempre que novas decisões estratégicas forem tomadas. Para as regras técnicas específicas do Next.js desta versão, ver `AGENTS.md` na raiz do projeto.*
