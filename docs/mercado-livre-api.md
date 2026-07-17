# API do Mercado Livre — documentação de referência (Geek Deals)

> Levantamento feito em 2026-07-13 para o módulo Geek Deals. O site oficial de
> docs (`developers.mercadolivre.com.br`) bloqueia leitura automatizada direta
> (retorna 403 em toda página testada, provavelmente proteção anti-bot da
> Cloudflare) — o conteúdo abaixo foi reunido via busca (conteúdo indexado das
> páginas oficiais) + testes reais contra a API + a app já cadastrada no
> painel. Onde não consegui confirmar 100%, está marcado explicitamente.

## 1. Nosso app cadastrado

- **Nome**: Renato Silva de Assis · **Nome curto**: `egeek86`
- **Descrição**: "Fazer pesquisa de preços em tempo real" · **Propósito**: Negócios
- **Client ID**: `2329668978227621`
- **Client Secret**: guardado em `.env.local` (`MERCADO_LIVRE_CLIENT_SECRET`) — nunca commitar, nunca expor client-side.
- Painel mostra "Configuração de segurança 70%" pendente — isso é sobre
  **gerenciamento de IPs** (seção 4), não bloqueia o app de funcionar.

## 2. Acesso público mudou — não é mais "sem autenticação"

Conteúdo antigo (blogs, guias de 2023-2024) diz que os endpoints de busca e
item são públicos, sem token. **Testei ao vivo agora e isso não é mais
verdade**: até `/sites/MLB/categories` (historicamente o endpoint mais aberto
de todos) retorna:

```json
{"blocked_by":"PolicyAgent","code":"PA_UNAUTHORIZED_RESULT_FROM_POLICIES","status":403}
```

sem um `Authorization: Bearer <access_token>` válido. Ou seja: **toda
consulta de preço/estoque vai precisar de access token**, mesmo sendo dado
"público" do ponto de vista de quem navega o site normalmente.

## 3. Autenticação — OAuth 2.0 + PKCE, fluxo Authorization Code

**✅ Feito em 2026-07-13** — app autorizado, `access_token`/`refresh_token`
salvos em `system_config` (chave `mercado_livre_oauth`) e renovação
automática funcionando (`src/server/collector/sources/mercado-livre-auth.ts`).
Registrando aqui como funcionou de verdade, pra próxima vez (reautorização,
segundo app, etc.):

1. **`redirect_uri` precisa ser HTTPS** — `http://localhost` é rejeitado na
   hora de cadastrar ("O endereço deve conter https://"), nem chega a tentar
   autorizar. Usamos um domínio HTTPS já cadastrado (`arkosintelligence.com`)
   só como "ponto de chegada" pra pegar o `code` da URL manualmente — não
   precisa ser uma rota nossa de verdade pra esse bootstrap único.
2. **PKCE é obrigatório** (descoberto só na prática — a troca de code por
   token falhou com `"code_verifier is a required parameter"` na primeira
   tentativa sem isso). Fluxo completo:
   - Gerar `code_verifier` (string aleatória) e `code_challenge` =
     `base64url(sha256(code_verifier))`.
   - URL de autorização precisa incluir `code_challenge` e
     `code_challenge_method=S256`:
     ```
     https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=2329668978227621&redirect_uri=SEU_REDIRECT_URI&code_challenge=XXX&code_challenge_method=S256
     ```
   - Guardar o `code_verifier` (não o challenge) pra usar na troca por token.
3. Autorização pode pedir uma **verificação de segurança extra** (o usuário
   relatou uma etapa tipo "selfie") antes de aprovar — comportamento do lado
   do Mercado Livre, não controlamos.
4. **Troca do code por token**:
   ```
   POST https://api.mercadolibre.com/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &client_id=2329668978227621
   &client_secret=<secret>
   &code=<code recebido>
   &redirect_uri=<mesmo da etapa 1, EXATO>
   &code_verifier=<o mesmo gerado na etapa 2>
   ```
   Resposta traz `access_token` + `refresh_token` + `expires_in` (**21600s =
   6h**, confirmado). O `scope` retornado é bem amplo mesmo pra conta sem
   vendas (`user_type: normal`, `seller_experience: NEWBIE`).
5. **Refresh não precisa de `redirect_uri` nem `code_verifier`** — só
   `grant_type=refresh_token&client_id=...&client_secret=...&refresh_token=...`.
   O Mercado Livre **rotaciona o refresh_token a cada uso** — sempre salvar o
   novo, não reusar o antigo.

Erros comuns: `invalid_grant` (code expirado/já usado, ou `redirect_uri` não
bate exatamente); `code_verifier is a required parameter` (PKCE faltando).

**Importante**: essa autorização única precisa ser feita por você mesmo,
logado na sua conta ML, no navegador. Não é algo que eu consigo automatizar
(não tenho ferramenta de automação de navegador/login) — e nem seria certo
fazer login como você de forma automatizada mesmo que eu tivesse.

## 4. Gerenciamento de IPs (opcional, mas atenção pro deploy)

O painel "Minhas aplicações" tem uma opção de **restringir por faixa de IP**
(CIDR, IPv4/IPv6) quais IPs podem usar as credenciais do app — aparece como
"Configuração de segurança" pendente no seu painel. **Não é obrigatório**
para o app funcionar, é hardening opcional.

⚠️ Se você ativar isso no futuro: ambientes serverless (Vercel, por exemplo)
não têm IP de saída fixo por padrão — isso quebraria as chamadas da API a
menos que se use um proxy/NAT com IP fixo ou o recurso pago de IP fixo da
Vercel. Por enquanto, **deixar essa configuração de fora** é o caminho mais
simples pro nosso caso.

## 5. Endpoint de preço — CONFIRMADO ao vivo em 2026-07-13 ✅

Depois de completar a autorização OAuth (com PKCE — ver seção 3.1), testamos
contra a API real. Descoberta importante: **`GET /items/{item_id}` direto dá
403** pra itens de terceiros — só funciona pra itens do próprio vendedor
autenticado. O caminho certo pra comparação de preço é outro:

```
GET https://api.mercadolibre.com/products/{catalog_product_id}/items
Authorization: Bearer <access_token>
```

Isso retorna as ofertas ativas (de diferentes vendedores) pra aquele produto
de catálogo, já ordenadas com o "vencedor" (buy box) primeiro:

```json
{
  "paging": { "total": 1, "offset": 0, "limit": 100 },
  "results": [
    {
      "item_id": "MLB5408400744",
      "price": 150,
      "original_price": null,
      "currency_id": "BRL",
      "condition": "new",
      "seller_id": 2411683351,
      "shipping": { "free_shipping": false, "cost": 44.14 }
    }
  ]
}
```

Se não houver oferta ativa, retorna **404** com
`{"message": "No winners found", "error": "not_found"}` — tratamos isso como
"sem estoque agora", não como erro.

### Como achar o `catalog_product_id`

```
GET https://api.mercadolibre.com/products/search?site_id=MLB&q={termo de busca}
```
(Nota: `GET /sites/MLB/search`, o endpoint de busca "clássico", retorna 403
mesmo autenticado — parece restrito/depreciado. A API de Produtos
(`/products/search`) é a que funciona e é a mais atual.)

Cada resultado tem um `id` (esse é o `catalog_product_id` — vira o
`external_ref` em `affiliate_offers` no nosso banco).

### Testado com dados reais (buscas "mario kart world switch 2", "jogo nintendo switch"):
- Mario Kart World Nintendo Switch 2 (Digital) — `MLB50667133` — R$ 439,90
- Jogo Mario Kart World Switch 2 — `MLB49246742` — R$ 488,00
- Jogo Nintendo Switch Princess Peach Showtime — `MLB32487605` — R$ 496,00

### Implicação de design (revisado em 2026-07-16)

Versão inicial só guardava o vencedor do buy box (`results[0]`) e descartava
o resto do array — funcionava pra "qual é o melhor preço agora", mas jogava
fora o histórico de preço dos outros vendedores do mesmo produto, que a
própria resposta já traz de graça. Corrigido: `fetchSnapshots` retorna TODOS
os vendedores do array `results`, um `PriceSnapshotResult` por vendedor
(cada um com `externalSellerId`/`externalItemId` próprios).

`collect-prices.ts` cria uma `affiliate_offer` por vendedor detectado (uma
por `(master_product_id, network_id, seller_id)`) — a que já existia
continua sendo atualizada normalmente; vendedor novo (nunca visto pra esse
produto) entra como `status: 'draft'` (mesma regra de
`discover-products.ts`: preço já começa a ser rastreado, mas só publica com
link de afiliado real colado manualmente pelo admin). O "melhor preço atual"
do produto continua sendo calculado em cima disso — só que agora como o
`MIN()` real entre as ofertas de todos os vendedores rastreados, calculado
em `getMasterProductPriceHistory`/`getBestActiveOfferIdsForMasterProducts`,
em vez de já vir pré-resolvido pela API numa oferta só.

## 6. Rate limits

Não encontrei um número oficial documentado publicamente (a página que
provavelmente lista isso também estava bloqueada pro fetch automatizado).
Vamos descobrir na prática quando começarmos a chamar de verdade — o coletor
já está desenhado pra rodar em intervalos (15-30 min por oferta, não
contínuo), o que deve ficar bem abaixo de qualquer limite razoável.

## 7. Status (2026-07-13)

- [x] App autorizado via OAuth+PKCE, tokens salvos e renovando sozinhos.
- [x] Endpoint de preço confirmado e testado com produtos reais (Nintendo
      Switch 2, jogos).
- [x] `fetchSnapshot` real implementado em
      `src/server/collector/sources/mercado-livre.ts` (não é mais stub).
- [x] Testado ponta a ponta pelo sistema de verdade: oferta cadastrada →
      `GET /api/cron/collect-prices` → snapshot gravado com `source: 'api'`
      → `current_price_cents` e `last_checked_at` atualizados.
- [ ] Configurar o agendamento de verdade em produção (Vercel Cron ou
      Supabase `pg_cron`+`pg_net`) chamando `/api/cron/collect-prices` a cada
      15-30min, com o header `Authorization: Bearer $CRON_SECRET`.
- [ ] Cadastrar as ofertas reais que você quer rastrear (usando o
      `catalog_product_id` da seção 5 como `external_ref`).
- [ ] Rate limit ainda não observado na prática — se aparecer erro 429,
      revisitar o intervalo de coleta.
