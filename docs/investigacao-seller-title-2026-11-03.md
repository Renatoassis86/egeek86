# Investigação: título real do anúncio (seller title) por oferta

Data: 2026-11-03. Autor: integrador-apis (Conselho Geek). Somente GET, sem escrita em banco, sem migration, sem commit/deploy.
Base: ADR 0006, ata `2026-11-03-identidade-da-cesta-etapa-codigo.md` (Etapa 2).

## Resumo
- **Opção A (ML, API oficial): não funciona hoje para anúncio de outro vendedor.** Todos os endpoints que trariam o título respondem 403 com o token OAuth do app (authorization_code, dono da conta). Nenhum endpoint de leitura aberta devolve título. Nada simples a implementar.
- **Opção B (o que a coleta já traz): resolve Shopee, não resolve ML.** A Shopee já grava o `productName` do vendedor em `affiliate_offers.title`. No ML o título gravado é sempre o nome do catálogo, e `/products/{id}/items` não devolve título.
- Cobertura das ~390 ofertas ativas sob masters cross-gen: **90 de 391 (23%) já têm título real (Shopee)**; as **301 do ML (77%) não têm caminho oficial** para título. Existe um sinal fraco e parcial (descrição do anúncio, seção 2.4), que não é título.
- Recomendação: não implementar leitura nova no coletor; proteger por flag a chamada de multiget que hoje falha sempre; a migration `seller_title`/`identity_state` só traz valor imediato para Shopee; para o ML, a única rota é pedir permissão ao ML (DevCenter/suporte).

## 1. Método
Leitura com o token OAuth já salvo em `system_config` (`mercado_livre_oauth`, válido por mais 152 min no momento). **Não renovei** o token (renovar rotaciona o refresh_token e grava no banco). Segredos não foram impressos. `MERCADO_LIVRE_CLIENT_ID/SECRET` não estão no `.env.local` (só na Vercel), então **`client_credentials` não foi testado**; o token em uso é `authorization_code` do dono (`/users/me` = 200). Itens de teste: anúncios ativos reais do banco (id extraído de `affiliate_url`, `MLB-<n>`). As páginas da documentação oficial (`developers.mercadolivre.com.br/pt_br/erro-403` e `permissoes-funcionais`) devolveram 403 ao WebFetch; só o resumo de busca foi obtido.

## 2. Opção A: endpoints oficiais do ML (evidência)
### 2.1 Não funcionam (título de anúncio de terceiros)
| Chamada | Status | Corpo (sem segredo) |
|---|---|---|
| `GET /items?ids=a,b,c&attributes=id,title` (Bearer) | 200 no envelope, **cada linha com `code 403`** | `{"error":"access_denied","message":"Access to the requested resource is forbidden"}` |
| `GET /items?ids=...` sem token | 401 | HTML nginx "401 Authorization Required" |
| `GET /items/{id}` (Bearer) | 403 | `access_denied` |
| `GET /items/{id}` sem token | 403 | `blocked_by: PolicyAgent`, `PA_UNAUTHORIZED_RESULT_FROM_POLICIES` |
| `GET /items/{id}` com User-Agent/Accept de navegador | 403 | igual |
| `GET /items/{id}?access_token=...` | 403 | igual |
| `GET /sites/MLB/search?q=...` e `?catalog_product_id=` | 403 | `{"error":"forbidden"}` |
| `GET /sites/MLB/search?seller_id=` e `/users/{seller}/items/search` | 403 | "Searching another user items is restricted." |
| `/items/{id}/prices`, `/reviews/item/{id}`, `/visits/items`, `/user-products/{upid}` | 403 | forbidden / "caller is not allowed to access this user product" |
| `/items/{id}/price_to_win`, `/marketplace/benchmarks/...` | 403 | "does not belong to caller" |

O 403 por PolicyAgent (sem token) e `access_denied` (com token) indicam política por quem chama: o item precisa pertencer ao chamador, ou o app precisa de uma permissão funcional que não tem. Mudar header, query ou UA não altera o resultado.

### 2.2 Funcionam, mas não trazem título
- `GET /products/{catalog_id}/items` (200): `item_id, seller_id, price, original_price, condition, listing_type_id, shipping, sale_terms, user_product_id, tags, official_store_id`. **Sem `title`.** É a fonte atual do coletor.
- `GET /products/{catalog_id}` (200): `name`, `family_name`, `attributes`, `pickers`, `parent_id`. É o nome do CATÁLOGO, não do anúncio. Atributos de plataforma são inconsistentes: um catálogo "Resident Evil 7 PS5 Gold Edition PlayStation 4" traz `CONSOLE_VERSION=PlayStation 4` e `GAME_CONSOLE_VERSIONS=PlayStation 5`; "Monster Energy Supercross 5 Ps4/PS5" traz `VIDEO_GAME_PLATFORM=Sony`.
- `/sites/MLB/domain_discovery/search?q=` (200): sugere domínio/categoria, não lista anúncios.
- `/items/{id}/shipping_options`, `/items/{id}/variations` (`[]`), `/questions/search?item=` (sem perguntas): sem título.

### 2.3 Escopos, tipo de token, limites
- O 403 persiste com o token do dono do app. `client_credentials` (token de app) tem pouca chance de ser mais permissivo, mas **não foi testado**.
- Rate limit: nenhuma resposta trouxe cabeçalho `x-ratelimit*` ou `retry-after`; cerca de 270 GETs (4 em paralelo) não geraram 429.
- Pela documentação oficial (resumo de busca): 403 `access_denied` decorre de app bloqueado, escopos/permissões funcionais não habilitados no DevCenter, ou token que não pertence ao dono do dado; "At least one policy returned UNAUTHORIZED" se resolve habilitando a **permissão funcional** associada no app. Não consegui ler qual permissão libera itens de terceiros.

### 2.4 Sinal parcial: descrição do anúncio (não é título)
`GET /items/{id}/description` responde **200** para anúncios de outros vendedores (`text, plain_text, last_updated, date_created, snapshot`). É texto livre do vendedor. Teste nas 248 ofertas ML ativas sob masters cross-gen com item id na URL: 215 retornaram 200 (33 deram 404, anúncio inativo), 37 dos 200 vinham vazios, e só **64 mencionam geração/plataforma** (ps4/ps5/xbox). Em PS5 Slim, descrições copiadas citam "825 GB" mesmo em anúncio de 1TB, então tampouco é confiável. Conclusão: não substitui título; no máximo pista para revisão humana. Não implementado.

## 3. Opção B: o que a coleta já traz
| Fonte | Campo do vendedor na resposta | Onde vira `affiliate_offers.title` | Situação |
|---|---|---|---|
| Shopee (`productOfferV2`, API oficial) | `productName` | `discover-shopee-products.ts` (~l.185): `title: item.productName`. `collect-shopee-prices.ts` não reescreve o título. | **Título real já gravado.** O nó de cada coleta também traz `productName`, então a rechecagem não exige chamada extra. |
| Mercado Livre | nenhum título por anúncio em `/products/{id}/items` | `discover-products.ts` (~l.677/707): `title: item.name` (nome do catálogo); `collect-prices.ts` (~l.411): `title: masterProduct.name` ao criar oferta de vendedor | **Título herdado do catálogo/master.** `fetchSellerTitles` (`mercado-livre.ts`, multiget `/items?ids=&attributes=id,title`) existe, mas recebe 403 em 100% dos casos e cai em falha aberta. |
| Magalu (`discover-magalu-products.ts`) | `title` do `__NEXT_DATA__`/JSON-LD | `title: item.title` | Dado real, **mas extraído do HTML da página (scraping), proibido desde 2026-10-28**. Dívida a revisar. Nenhuma oferta Magalu ativa hoje (ML 8.705, Shopee 773). |

Onde o título do ML é sobrescrito: (1) descoberta usa o nome do catálogo; (2) oferta nova de vendedor em `collect-prices.ts` usa `masterProduct.name`; (3) o próprio catálogo às vezes é cross-gen no nome (ex.: "Jogo Revita PS4 Ps5 Upgrade").

## 4. Cobertura estimada das ~390 ofertas
Regex sobre o nome do master (jogos com duas gerações no nome); aproxima a lista da etapa 2 (390; aqui 391).
| Rede | Ativas | Com título real no banco | Com item id na URL | Placeholders sem vendedor |
|---|---|---|---|---|
| Shopee | 90 | **90** (13 diferem do nome do master; 77 coincidem porque o master foi criado a partir delas) | n/a | 90 (Shopee não usa `seller_id`) |
| Mercado Livre | 301 | **0** (só 4 diferem do master) | 248 | 53 |
| Total | 391 | 90 (23%) | | |

- Opção A: 0 de 301 ML recuperáveis hoje.
- Opção B: 90 de 391 (Shopee); a rechecagem já roda sobre `affiliate_offers.title` (é o que `offerIdentityVisibleSql` faz), sem migration.
- Sinal parcial (2.4): até ~64 de 248 ML teriam menção de plataforma, só como pista humana.
- Base global: das 8.705 ofertas ML ativas, só 393 têm título diferente do master (~95% com título herdado).

## 5. Recomendação
1. **Não implementar** leitura nova de título no coletor ML: nenhuma opção oficial funciona de modo simples. Nada foi implementado nem gravado.
2. **Proteger a chamada atual** `fetchSellerTitles` (hoje +1 GET por grupo, sempre 403) com flag de ambiente desligada (ex.: `MELI_SELLER_TITLE_ENABLED`), religável se o ML liberar. Alteração pequena, não feita aqui por estar fora do escopo "só se a opção funcionar".
3. **ML: a única rota oficial é a permissão.** Pedir no DevCenter (app do dono) a permissão funcional de leitura de anúncios públicos, ou abrir chamado ao suporte de integrações do ML. Ação do dono. Depois, testar `client_credentials` e `authorization_code`.
4. **As 301 ofertas ML cross-gen seguem sem atribuição de geração** (decisão da etapa 2 mantida: fora das médias pelo filtro SQL). Não inferir por descrição nem por atributo de catálogo (inconsistentes). Saída: triagem humana por master (138 masters no CSV da etapa 2).
5. **Shopee:** passar a usar o `productName` do nó a cada coleta (hoje o título só é gravado na descoberta). Requer `seller_title` para não perder o título original se o master mudar.

## 6. Desenho mínimo da migration (NÃO aplicada)
Alinhado ao ADR 0006, reduzido ao necessário. `ADD COLUMN` sem default volátil é só metadado; `identity_state` com DEFAULT constante também (PG >= 11).
```sql
ALTER TABLE affiliate_offers
  ADD COLUMN seller_title text,
  ADD COLUMN identity_state text NOT NULL DEFAULT 'ok'
    CHECK (identity_state IN ('ok','review','open_box','used')),
  ADD COLUMN identity_checked_at timestamptz;
-- arquivo separado (CONCURRENTLY não roda em transação)
CREATE INDEX CONCURRENTLY affiliate_offers_identity_review_idx
  ON affiliate_offers (identity_state) WHERE identity_state <> 'ok';
-- Reversão
DROP INDEX IF EXISTS affiliate_offers_identity_review_idx;
ALTER TABLE affiliate_offers
  DROP COLUMN identity_checked_at, DROP COLUMN identity_state, DROP COLUMN seller_title;
```
`identity_reason` do ADR pode ficar fora da primeira versão (o motivo é recomputável pelo motor). Coluna nova não exige nova política RLS.

Uso na rechecagem:
- **Shopee:** a cada nó, `seller_title = node.productName`; `evaluateOfferIdentity(seller_title, master)`; se excluída, `identity_state` recebe o motivo e `identity_checked_at = now()`; título mudou entre ciclos, reavalia. Backfill do `seller_title` das Shopee a partir de `affiliate_offers.title` é seguro (já é o título do vendedor), com backup NDJSON e log como na etapa 2.
- **ML:** grava `seller_title` só se o multiget devolver 200 (flag ligada); senão NULL e `identity_state` permanece `ok`, sem presumir nada. **Não copiar** o `title` herdado do ML para `seller_title`.
- **Leitura:** `offerIdentityVisibleSql` passa a `identity_state = 'ok'` e, quando `seller_title IS NULL`, mantém o regex atual sobre `title` (compatibilidade).

## 7. Riscos
- Copiar o título herdado do ML para `seller_title` mascararia a falta de dado e daria falsa pureza (viola "sem dado fake"). Mitigação: NULL explícito.
- Desligar `fetchSellerTitles` sem flag perderia a tentativa que funcionaria sozinha se o ML liberar. Mitigação: flag.
- Descrição do anúncio é texto copiado e ruidoso: só como pista humana.
- `client_credentials` sem teste: dizer que "não ajuda" é inferência, não evidência.
- Documentação oficial não lida na íntegra (WebFetch 403); nome exato da permissão a pedir é desconhecido.
- Magalu via HTML é scraping: se voltar a ser ativado, só por API oficial.
- A contagem 391 é por regex do nome do master, não pela lista exata da etapa 2 (390); não altera a conclusão.

## 8. Dados que faltam
- Resposta do ML (DevCenter/suporte) sobre a permissão funcional para leitura de itens de terceiros.
- Teste `client_credentials` com `MERCADO_LIVRE_CLIENT_ID/SECRET` (buscar na Vercel).
- Métricas de aceite quando houver permissão: % de ofertas ML ativas com `seller_title` não nulo (meta inicial: as 301 cross-gen; depois as 8.705) e % de linhas do multiget com `code 200`.
