# Relatório Técnico — Magalu Empresas B2B Platform API
### Achado novo, 2026-07-22 — diferente da Developers API (já descartada)

---

## 0. Atenção: existem DUAS APIs Magalu diferentes com nome parecido — não confundir

Nesta mesma sessão, dois documentos diferentes da Magalu foram colados no chat. São **APIs completamente diferentes**:

| | **Magalu Developers** (`developers.magalu.com`) | **Magalu Empresas B2B Platform** (`institucional.magaluempresas.com.br`) |
|---|---|---|
| Veredito | ❌ Já descartada — ver `relatorio-api-magalu-developers.md` | ✅ Caminho novo e real, ainda não integrado |
| Modelo | Cliente OAuth2 + **cada seller individual autoriza seu app** (`./idm client create`, escopos `open:portfolio-*-seller:*`) | Usuário/senha fornecidos pelo **comercial da Magalu** após "onboarding" — sem fluxo de autorização por seller |
| Serve pra | Seller gerenciar o **próprio** catálogo/preço/estoque dentro do Magalu | Parceiro B2B **revender o catálogo inteiro da Magalu** no próprio site |
| O que colamos hoje | Guia "Como Criar e Configurar um Cliente" (`./idm client create`) — é a MESMA API já analisada e descartada em julho, só reapareceu no chat | Spec OpenAPI completa (`document.yaml`, v2.0.0) + landing `institucional.magaluempresas.com.br/api-integracao` |

Se alguém achar de novo a doc do `developers.magalu.com`/`idm client create`/escopos `-seller`, **é a mesma API já descartada** — não vale reabrir como novidade.

---

## 1. O que é a B2B Platform (o achado de hoje)

Landing page (`institucional.magaluempresas.com.br/api-integracao`) lista 4 modelos de integração:
1. **Incentivo e Fidelidade** — troca de pontos por produtos Magalu.
2. **Catálogo para e-commerce (Gateway interno)** — parceiro revende catálogo Magalu, mas pagamento passa pelo gateway da própria Magalu.
3. **Catálogo para e-commerce (Gateway externo)** — parceiro revende catálogo Magalu usando **seu próprio** gateway de pagamento. **Este é o modelo relevante pro Espaço Geek 86** — mas note que ele é desenhado pra vender de verdade (carrinho, pedido, pagamento), não só pra comparar preço.
4. **Tag Pixel e GPC** — tracking de campanha, não relevante aqui.

Modelo 100% comercial/sales-led: não tem cadastro self-service. Contato via `0800 310 0002` ou formulário "Fale Conosco". A doc técnica completa (Stoplight/OpenAPI) fica em `b2b-platform-docs.luizalabs.com`, mas só é útil de verdade depois que o comercial configura a "campanha B2B" do parceiro.

## 2. Autenticação

- `securitySchemes.bearerAuth`: Bearer JWT.
- Endpoints: `POST /v1/oauth/token` e `POST /v2/oauth/token` (corpo exato não veio no trecho colado — provavelmente usuário/senha → token, precisa confirmar quando tivermos credencial real pra testar).
- **Staging**: `http://b2b-platform-staging.luizalabs.com/api`
- Produção: não veio no trecho colado (provavelmente liberada só após homologação em staging).
- Cada par usuário/senha é vinculado a **uma campanha B2B específica** (regras de preço/filtro de catálogo variam por campanha) — a doc recomenda usuário/senha **dedicados por campanha**, não reaproveitar entre campanhas diferentes.

## 3. Fluxo até ter credencial de verdade (segundo a doc)

1. Contato comercial (0800 310 0002 / Fale Conosco) → define o modelo de negócio (Fidelidade vs Shopping/gateway externo).
2. Comercial configura a "campanha B2B" do parceiro.
3. Comercial libera usuário/senha de **staging** (dado de teste).
4. Parceiro testa o fluxo completo em staging (a doc menciona especificamente "criação de pedido" — sugere que a homologação foca no fluxo de venda completo, não só leitura de catálogo).
5. Só depois de validar staging com sucesso, credenciais de **produção** são liberadas.

**Ainda não confirmado**: se o Renato já tem usuário/senha de staging, ou se esse contato comercial ainda precisa ser feito.

## 4. Endpoints relevantes pro Espaço Geek 86 (preço/catálogo, não o fluxo de venda completo)

### `GET /v1/products` — catálogo paginado
- `_limit` (até 1000) + `_page` (obrigatórios), mais filtros: `category`, `brand`, `price_gte`/`price_lte`, `ean[]`, `sku[]`, `id[]`, `active`, `availability`, `seller_id`, `type` (`product`/`bundle`).
- Retorna: `title`, `sku`, `seller_id`, `seller_name`, `ean`, `price`, `list_price`, `medias[]` (imagens), `categories[]`, `attributes[]`, `dimensions`, `factsheet[]`.
- **⚠️ Aviso da própria doc, repetido em vários endpoints**: *"O preço enviado neste serviço é o mesmo preço praticado no e-commerce do Magalu, e não necessariamente é o preço de venda do produto para um canal de venda B2B. [...] este preço não deve ser apresentado para o cliente final."* — ou seja, `price`/`list_price` daqui servem pra descoberta/catalogação, **não pra mostrar ao usuário final do Espaço Geek 86**.

### `POST /v1/products/pricing_and_availability` — preço real pra mostrar
- Corpo: lista de `{sku, seller_id}` (até 20 por chamada, endpoint antigo via `GET /v1/products/info` está `deprecated: true` — usar o POST).
- Retorna por item: `price`, `list_price`, `stock_count`, `availability`, e opcionalmente `best_price` (preço com desconto conforme forma de pagamento, ex: Pix) se `show_payment_methods: true`.
- **Doc é explícita**: "Este serviço deve ser chamado sempre que um produto for apresentado em tela para o cliente final, seja em vitrine, resultado de busca ou página principal do produto." — ou seja, é o serviço certo pra alimentar preço exibido na tabela/oferta do site.

### Não relevante agora (fora de escopo — fluxo de venda completo, não comparação de preço)
Carrinho, frete, clientes, pedidos, boleto/pix, pós-venda, tickets, webhook de pedido — tudo isso é pra quando/se o Espaço Geek 86 decidir **vender de verdade** produtos Magalu com checkout próprio (modelo "Gateway externo"). Não construir agora; é uma decisão de negócio maior (processar pagamento, ter CNPJ como revendedor formal, etc.), separada de "mostrar oferta com link de afiliado".

## 5. Design de integração recomendado (quando tivermos credencial)

Mesmo padrão split já usado pro Mercado Livre:
- **Descoberta/catalogação**: `discover-magalu-b2b-products.ts` varre `GET /v1/products` paginado (filtrado por categoria de games/consoles, se a doc de categorias (`/v1/categories`) permitir), cria `master_products`/`affiliate_offers` iniciais.
- **Atualização de preço**: `collect-prices.ts` (ou uma fonte nova em `price-sources`) chama `POST /v1/products/pricing_and_availability` em lote (até 20 sku+seller por chamada) pros produtos já catalogados, atualiza `current_price_cents` com o preço REAL (nunca o de `/v1/products`).
- **Link/CTA**: como este é catálogo pra **revenda** (não afiliação com comissão por clique), não existe "link de afiliado" no sentido do Mercado Livre/Shopee — o modelo de monetização aqui é margem de revenda, o que implica processar pedido/pagamento de verdade (ver seção 4). Enquanto o Espaço Geek 86 não decidir entrar nesse modelo completo, dá pra usar só como **fonte de dado de preço/catálogo pra comparação** (mostrar "Magalu: R$X" na tabela, sem CTA de compra próprio) — precisa alinhamento de negócio sobre se isso é permitido pelos termos da campanha B2B (não vem na doc técnica, é pergunta pro comercial).

## 6. Pendências antes de codar

1. Confirmar se já existe usuário/senha de staging (comercial já contatado?) ou se falta esse passo.
2. Perguntar ao comercial da Magalu explicitamente: dá pra usar os dados de catálogo/preço só pra exibição comparativa (sem processar pedido/pagamento), ou o contrato da campanha B2B exige processar venda de verdade pra ter acesso? Isso muda o escopo do que dá pra construir.
3. Confirmar URL de produção (só veio staging no trecho colado).
4. Corpo exato do `POST /v1/oauth/token` (username/password → JWT) — confirmar formato quando tivermos credencial real pra testar ao vivo, igual foi feito com o Mercado Livre.
