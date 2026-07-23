# Relatório Técnico — Magalu Developers API
### Análise completa para o Espaço Geek 86 | julho/2026

---

## 1. Veredito estratégico (leia isso primeiro)

A **Magalu Developers API** (`developers.magalu.com`) é uma **API de gestão de portfólio para vendedores (sellers) homologados no marketplace**. Ela não é, e não pretende ser, uma API de consulta pública de catálogo, preços ou promoções de terceiros — e **não tem nenhum mecanismo de link de afiliado ou comissionamento**.

Isso confirma e detalha o que eu já havia sinalizado no relatório anterior: essa via **não serve para o objetivo central de vocês** (monitorar preço de mercado / gerar renda de afiliado). Ela serve para uma coisa bem específica: **se o Espaço Geek 86 decidir também vender produtos como seller dentro do Magalu**, essa API automatiza cadastro de SKU, preço do próprio anúncio, estoque e atendimento.

A prova estrutural está nos escopos (permissões) da API — **100% deles terminam em `-seller`**:

```
open:portfolio-skus-seller:read / :write
open:portfolio-prices-seller:read / :write
open:portfolio-stocks-seller:read / :write
open:portfolio-scores-seller:read
open:order-order-seller:read
open:tickets-seller:read / :write
services:questions-seller:read / :write
```

Não existe `open:portfolio-skus:read` genérico (sem `-seller`) que permita consultar o catálogo de qualquer loja — só existe a variante com sufixo, e mesmo essa exige que **aquele seller específico** faça login e autorize sua aplicação via OAuth. Ou seja, mesmo cadastrando o Espaço Geek 86 como seller, vocês só veriam os próprios produtos — nunca os de concorrentes ou do catálogo geral da Magalu.

---

## 2. Como funciona o acesso (passo a passo real da documentação)

### 2.1 Criar o cliente de aplicação
Feito via uma ferramenta de linha de comando própria, o **IDM CLI** (`id-magalu-cli`), não por um painel web tradicional:

1. Criar conta em [id.magalu.com](https://id.magalu.com).
2. Baixar o binário do IDM (GitHub `luizalabs/id-magalu-cli`), renomear para `idm`, tornar executável.
3. `./idm login` → autentica sua conta de desenvolvedor.
4. `./idm client create --name ... --redirect-uris ... --scopes ... --audience "https://api.magalu.com https://services.magalu.com"` → gera `client_id` e `client_secret`.

Alguns escopos (ex.: `open:portfolio-scores-seller:read`) exigem **aprovação manual adicional** da Magalu, não são liberados automaticamente.

### 2.2 Autenticação/Autorização (OAuth 2.0 Authorization Code)
Esse é o ponto que sela a questão do afiliado: **quem autoriza o acesso é o seller, individualmente, loja por loja**.

Fluxo:
1. Seu app redireciona o **seller** (não um consumidor final, não vocês) para `id.magalu.com/login` com `client_id`, `redirect_uri` e `scope`.
2. O seller loga com **credencial de pessoa jurídica da loja dele**.
3. Ele vê uma tela de consentimento e autoriza os escopos.
4. Você recebe um `code` (válido por 10 minutos, uso único) na sua `redirect_uri`.
5. Troca o `code` por `access_token` (JWT, expira em até 7200s = 2h) + `refresh_token`, via POST em `id.magalu.com/oauth/token`.

Não existe, em nenhum ponto desse fluxo, uma etapa de "consulta pública sem autenticação de um seller".

### 2.3 Ambientes
| Tipo | Ambiente | URL |
|---|---|---|
| Marketplace | Produção | `api.magalu.com` |
| Sandbox | Homologação | `api-sandbox.magalu.com` (documentação nota que o sandbox está "em desenvolvimento e em breve será disponibilizado" — ou seja, na prática hoje só existe produção real) |
| Complementar | Produção | `services.magalu.com` |

---

## 3. Estrutura das APIs de Produto (Portfólio)

O "Portfólio" é dividido em três partes — todas por SKU **do próprio seller autenticado**:

- **SKU**: cadastro/consulta/atualização de produtos do seller.
- **Stock**: quantidade disponível, por seller.
- **Price**: preço do anúncio do seller (não o preço de mercado ou de concorrentes).

Endpoints de Preço (`/products/ref/precos`): `POST` (criar), `GET` (consultar), `PATCH` (atualizar) — sempre escopados a `-seller`.

Também existe:
- **Automatização de Preço / Pricing Rules**: regras de precificação automática (ex.: ajustar preço do seu próprio anúncio conforme regras internas) — não é monitoramento de concorrência.
- **Score**: métricas de qualidade do anúncio do seller (não é análise de mercado).
- **Vídeos**: upload de vídeo de produto do seller.
- **Categorias e Atributos**: taxonomia de categorias da Magalu (esse endpoint é o mais próximo de "dado público" que existe — vale explorar para enriquecer sua própria taxonomia interna, mesmo sem virar seller).

## 4. Outras APIs do ecossistema (fora de Produtos)
- **Pedidos**: consulta de pedidos recebidos pelo seller.
- **Logística**: entregas, fretes, etiquetas — do seller.
- **SAC**: tickets de atendimento, devoluções — do seller.
- **Perguntas & Respostas**: gerenciar perguntas feitas por clientes no anúncio do seller.
- **Chat com Cliente**: conversas com compradores.
- **Análise Financeira**: dados financeiros/repasses do seller.
- **Webhooks**: notificações de eventos (pedido criado, pergunta recebida etc.) — sempre por seller.

Nada disso expõe catálogo de terceiros.

## 5. Governança técnica da API (útil se decidirem virar seller no futuro)
- **Rate limit**: por seller e por módulo/minuto — ex.: Preços-Consulta 850/min, Produtos-Cadastro 650/min, SAC 100-200/min. Estourar o limite retorna `429 Too Many Requests`.
- **Erros**: estrutura de erro padronizada e código de retorno HTTP documentados (`return-code`, `error-structure`).
- **Paginação/filtros/ordenação**: padronizados via `development-guide/pagination-filtering-sorting`.
- **Rastreio de requisição**: header `X-Request-Id` obrigatório para suporte/debug.
- **Sales Channel ID**: identifica o canal de venda (relevante se o seller vender em múltiplos canais do grupo Magalu — Magalu, Época Cosméticos etc.).

---

## 6. O que fazer com essa informação (recomendação de Product Manager)

1. **Não construir nenhuma parte do pipeline de dados do Espaço Geek 86 em cima dessa API** — ela não entrega o que vocês precisam (preço de mercado, promoções, catálogo amplo).
2. Se em algum momento fizer sentido de negócio o Espaço Geek 86 **vender produtos próprios ou de parceiros dentro do Magalu** (ex.: colecionáveis curados, parcerias com lojas geek), aí sim essa API entra em cena — mas como ferramenta operacional de venda, não de inteligência de dados.
3. Para monetização por afiliação real na Magalu, o caminho correto é o **programa de afiliados da Magalu** (separado dessa documentação técnica de sellers) — recomendo eu pesquisar e trazer os detalhes desse programa especificamente, incluindo requisitos de aprovação, formato de link e regras de comissão, se você quiser seguir por aí.
4. Mantenha a estratégia já definida no relatório anterior: para dado de mercado/preço da Magalu, o caminho mais defensável é **parceria comercial direta** com o grupo Magalu para acesso a feed de preços com finalidade editorial/comparativa — não a Developers API.

---

Quer que eu pesquise agora o **programa de Afiliados da Magalu** (não o de developers), que é a via correta para geração de link com comissão?

---

## 7. Correção importante (2026-07-22)

Numa sessão anterior, o módulo `src/server/collector/sources/magalu-auth.ts` foi removido do código por eu ter concluído que as credenciais nele hardcoded (`c4dc989c-c97f-469a-bc86-ec91e88f3847` / `2353d7d7-99cb-4ed7-bdef-db1e57eebf41` / `dc788f82-a2ff-4420-a195-155cb843d334`) eram "provavelmente fabricadas" — julgamento baseado em indícios circunstanciais (hardcoded no código-fonte, nunca em `.env.local`, esquema de headers sem correspondência no fluxo OAuth2 descrito acima).

**Essa conclusão estava errada.** O Renato mostrou (2026-07-22) a tela `id.magalu.com/api-keys` com esses EXATOS três valores, num app chamado "magalu_egeek", conta "Renato Silva", criado em 21/07/2026, status "Ativa" — ou seja, são credenciais reais da conta ID Magalu dele, não inventadas.

**O que não muda:**
- A tela mostra a seção "Acessos" com ~28 produtos (Container Registry, DBaaS, Object Storage, Virtual Machine, Network, LBaaS, etc. — claramente produtos de infraestrutura da **Magalu Cloud**, não de e-commerce) e **nenhum estava selecionado** no momento da captura — ou seja, mesmo sendo reais, essas chaves hoje não têm NENHUM escopo/permissão habilitado.
- Os únicos itens da lista relacionados a e-commerce/marketplace são "API do Magalu – Marketplace", "APIs de Marketplace – Portfólio", "APIs de Marketplace – Pedidos", "Plataforma Seller – Perguntas e Respostas" — e esses são exatamente os produtos cobertos pela análise das seções 1-6 acima (escopos `open:portfolio-*-seller`, seller-only, requer autorização OAuth2 de um seller específico). Habilitar esse acesso não muda a conclusão: ainda seria só o catálogo do **próprio** seller Espaço Geek 86 (se um dia virar seller), nunca um feed de mercado.
- `id.magalu.com/api-keys` é o sistema de identidade/IAM interno da Magalu (usado por vários produtos internos, inclusive infraestrutura de nuvem) — **não tem relação nenhuma** com a "Magalu Empresas B2B Platform" (ver `relatorio-api-magalu-b2b-platform.md`), que usa usuário/senha próprios por campanha, emitidos separadamente pelo comercial após onboarding. São dois sistemas de auth completamente diferentes, apesar do nome parecido.

Conclusão prática: essas chaves específicas (`magalu_egeek`) não são o caminho pro pipeline de dados de mercado, mesmo sendo genuinamente reais e mesmo que algum escopo de Marketplace seja habilitado nelas. O caminho real continua sendo a B2B Platform (credencial diferente, sistema diferente) ou o programa de afiliados (ainda não pesquisado a fundo).
