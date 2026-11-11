# Mercado Livre — ficha de inventário

- Atualizado em: 2026-11-10
- Situação no egeek86: **integrado e coletando**. Cerca de 9.900 ofertas ativas em games (medição de 2026-11-10).
- Fontes: `docs/mercado-livre-api.md` (levantamento de 2026-07-13), código em `src/server/collector/` e medições em `collector_runs`.
- O Client Secret fica em `MERCADO_LIVRE_CLIENT_SECRET` (`.env.local` e Vercel). Nunca neste arquivo.

## 1. Canal oficial
- API oficial do Mercado Livre (`https://api.mercadolibre.com`), com OAuth 2.0 Authorization Code **com PKCE obrigatório**. A autorização única foi feita pelo dono no navegador. Tokens em `system_config` (chave `mercado_livre_oauth`), renovação automática (`src/server/collector/sources/mercado-livre-auth.ts`).
- O token dura 6 h (`expires_in` 21600). O refresh token **rotaciona a cada uso**: salvar sempre o novo.
- `redirect_uri` precisa ser HTTPS.
- O site oficial de documentação bloqueia leitura automatizada (403). O conteúdo foi reunido por busca e testes reais.

## 2. Endpoints que funcionam (confirmados)
- Busca por catálogo: `GET /products/search?site_id=MLB&q=<termo>`. O `id` é o `catalog_product_id` (vira `external_ref`).
- Ofertas de um produto: `GET /products/{catalog_product_id}/items` — todos os vendedores ativos, com o vencedor (Buy Box) primeiro. Campos: `item_id`, `price`, `original_price`, `currency_id`, `condition`, `seller_id`, `shipping` (frete grátis e custo).
- 404 `No winners found` = sem oferta ativa (tratado como sem estoque).
- **Não funcionam**: `GET /sites/MLB/search` (403, mesmo autenticado) e `GET /items/{id}` de terceiros (403, só itens do próprio vendedor). O `/items?ids=` também deu 403; impacto no coletor gamer não medido.
- Categorias com vendedor ausente no catálogo (bola, notebook e geladeira em testes) respondem 404 e não geram oferta.

## 3. Cotas
- Limite oficial: **não documentado**.
- Observado hoje: 300 ofertas por rodada, rodadas de 30 a 70 s, 0 erros e 0 respostas 429.
- Se aparecer 429, rever o intervalo.

## 4. Coleta no egeek86
- `collect-prices` (cron `*/5`), `MAX_OFFERS_PER_RUN = 300` (era 150 até 2026-11-10).
- Duas rodadas por ciclo (:00 e :45 s): um segundo agendador externo, **não encontrado**; o dono não sabe onde está. Sem erro; mantido.
- `discover-products` (cron `17 * * * *`) para descoberta; verticais por `collect-vertical?v=...`.
- Cada vendedor vira uma `affiliate_offer` por `(master_product_id, network_id, seller_id)`. Vendedor novo entra como `draft`.
- Frescor medido: 33% das ofertas ativas checadas em 30 min, 69% em 60 min, 100% em 3 h.

## 5. Termos
- Termos de uso da API e regras sobre histórico e exibição de preço: **não arquivados nem lidos**. Pendência: ler e arquivar; perguntar ao suporte sobre guardar e exibir histórico. O dono decidiu em 2026-11-10 não precisar dos termos.
- Ofertas com frete: o frete é informado, mas a média de preço hoje usa o preço do anúncio.

## 6. Pendências técnicas
- Mesmo jogo físico às vezes catalogado sob dois `catalog_product_id`: a duplicata é tratada por `findExistingMasterProduct` (título + plataforma).
- Gerenciamento de IP do app: deixado de fora (Vercel não tem IP fixo).

## 7. Links de afiliado (achado de 2026-11-10, validado no painel do dono)
- Programa de afiliados do dono: perfil **"EGeek 86"** (Games), etiqueta `renatosilvadeassis`, ID `matt_tool=23952458` (confirmado no link oficial do Gerador de links; é o `MELI_TOOL_ID` da Vercel).
- **Formato dos links do banco até 2026-11-10:** `https://produto.mercadolivre.com.br/MLB-<id>?matt_tool=23952458` (direto ao anúncio, sem `matt_word`). Evidência de que esse formato **não rastreia bem**: o site registrou 19 cliques em 7 dias para ML; o painel de afiliados do ML contou 1 clique e 0 pedidos no mesmo período (dados do painel podem ter defasagem).
- **Formato oficial (Gerador de links, https://www.mercadolivre.com.br/afiliados/linkbuilder):** link curto `https://meli.la/<código>`. Ele abre a **página de afiliado do dono** (`/social/renatosilvadeassis?matt_word=renatosilvadeassis&matt_tool=23952458&forceInApp=true&ref=...`) com o produto em destaque e o botão **"Ir para produto"**, que leva ao anúncio com rastreio completo (`matt_tool_id`, `matt_tracing_id`, `matt_event_ts`, `source=affiliate-profile`) e a barra de Afiliados do ML (ganho de 12% em games). Validado em 3 produtos.
- **Efeitos colaterais da geração:** cada link gerado adiciona o produto à lista pública "Minhas recomendações" do perfil. O gerador aceita várias URLs, mas **não informa qual link pertence a qual URL** e recusa algumas (2 de 30 no teste) — por isso a geração é feita **um link por vez**.
- **Operação:** laço na aba logada do ML → `/api/ingest/ml-links` (fila: a oferta mais barata de cada produto primeiro; grava `affiliate_url = meli.la/...` e guarda o link antigo em `collector_runs.meta.trocas`, reversível). Para reverter: `UPDATE affiliate_offers SET affiliate_url = <old>` a partir dessas linhas, ou reconstruir `https://produto.mercadolivre.com.br/MLB-<id>?matt_tool=<MELI_TOOL_ID>`.
- Cliques e comissões: conferir em https://www.mercadolivre.com.br/afiliados/dashboard.
