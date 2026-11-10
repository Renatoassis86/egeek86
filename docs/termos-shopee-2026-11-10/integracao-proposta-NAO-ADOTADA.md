# Integração da Shopee Affiliate Open API no egeek86

- Versão: 1.0 (10/11/2026)
- Base: documentação da Open API e termos lidos em 10/11/2026 (arquivos 01 a 18 desta pasta e relatorio.md).
- Escopo: coletar ofertas da Shopee para o comparador, manter histórico de preço segundo a ADR 0004 (1 cotação por oferta por dia) e gerar o link de compra rastreado.
- **Suposições sobre o repositório (não verificadas):** não tive acesso a `C:\repositorio\egeek86` nesta sessão. O texto assume o que foi observado no site em produção e na sessão do Claude Code: Next.js com TypeScript, banco Supabase (Postgres), deploy na Vercel, rota `/go/[slug]` de saída para a loja, documentação em `docs/` com ADRs. Ajuste nomes de tabelas e pastas ao que existir no código.

---

## 1. Decisões de arquitetura

1. **Só a Open API como fonte da Shopee.** Os Termos do Programa proíbem "usar qualquer meio ou forma automatizada de sucateamento, ou outros métodos de extração de dados" (4.3(d)), e os Termos de Serviço proíbem robôs para "monitorar ou copiar nosso Conteúdo" sem consentimento (3.1). Qualquer coletor que leia páginas da Shopee deve ser desligado.
2. **Catálogo pelo Product Feed, preço pelo productOfferV2.**
   - Product Feed (`listItemFeeds` + `getItemFeedData`): carga FULL uma vez e DELTA uma vez por dia. É o caminho que a própria Shopee recomenda desde 2026-03-05 para "populate your database" e manutenção diária.
   - `productOfferV2` com `itemId`: atualização pontual dos itens que o site já exibe (preço, vendas, avaliação, comissão), dentro da cota.
   - `productOfferV2` com `keyword` + `productCatId`: descoberta de novos itens nas categorias de games.
3. **Link de compra pelo `generateShortLink`**, gerado sob demanda e guardado em cache. O link não é alterado depois de gerado (T&C 2.2).
4. **Histórico conforme ADR 0004:** gravar no máximo 1 cotação por oferta por dia (o menor preço do dia), sem apagar a coleta bruta.
5. **Publicação do histórico condicionada a resposta da Shopee** (ver seção 8). Até lá, o histórico pode ser coletado e guardado, mas a exibição pública de variação fica atrás de uma chave de configuração.

## 2. Credenciais e variáveis de ambiente

```
SHOPEE_AFFILIATE_APP_ID=            # [oculto] - copiar da página Abrir API
SHOPEE_AFFILIATE_SECRET=            # [oculto] - tratar como senha
SHOPEE_AFFILIATE_ENDPOINT=https://open-api.affiliate.shopee.com.br/graphql
SHOPEE_RATE_LIMIT_PER_HOUR=7200     # margem de 10% sobre o limite documentado de 8000/hora
SHOPEE_SHOW_PRICE_HISTORY=false     # liga a exibição pública do histórico (seção 8)
```

Regras:
- Variáveis só no servidor. Nunca com prefixo `NEXT_PUBLIC_`, nunca no cliente, nunca em log.
- Na Vercel, cadastrar como variáveis de ambiente de Production e Preview, separadas.
- O segredo apareceu na tela durante a leitura da página "Abrir API". Depois de configurar a integração, vale usar "Redefinir" uma vez e atualizar a variável. Isso é decisão sua, e o botão invalida o segredo antigo na hora.

## 3. Cliente da API

### 3.1 Assinatura

Fórmula da documentação: `SHA256(AppId + Timestamp + Payload + Secret)`, hexadecimal minúsculo. O Payload é a string JSON **exata** enviada no corpo.

Conferido em 10/11/2026 com o exemplo oficial (AppId 123456, Secret "demo", Timestamp 1577836800): o resultado `dc88d72feea70c80c52c3399751a7d34966763f51a7f056aa070a5e9df645412` só é reproduzido quando o corpo é serializado uma única vez e enviado byte a byte igual. A página mostra a query sem a indentação original, então copiar o exemplo da tela não reproduz a assinatura. O teste da seção 9 usa o corpo correto.

```ts
// src/lib/shopee/client.ts
import { createHash } from 'node:crypto';

const ENDPOINT = process.env.SHOPEE_AFFILIATE_ENDPOINT!;
const APP_ID = process.env.SHOPEE_AFFILIATE_APP_ID!;
const SECRET = process.env.SHOPEE_AFFILIATE_SECRET!;

export function sign(appId: string, timestamp: number, payload: string, secret: string) {
  return createHash('sha256').update(`${appId}${timestamp}${payload}${secret}`).digest('hex');
}

export class ShopeeApiError extends Error {
  constructor(public code: number, message: string, public path?: string) {
    super(`Shopee ${code}: ${message}`);
  }
}

type GqlResponse<T> = {
  data?: T;
  errors?: { message: string; path?: string; extensions?: { code: number; message: string } }[];
};

// rateLimiter: contador compartilhado descrito na seção 3.2 (a implementar)
export async function shopeeGraphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  await rateLimiter.take();                       // seção 3.2
  const payload = JSON.stringify(variables ? { query, variables } : { query }); // serializar uma vez
  const timestamp = Math.floor(Date.now() / 1000); // relógio do servidor; tolerância de 10 min
  const signature = sign(APP_ID, timestamp, payload, SECRET);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    body: payload,                                 // a mesma string que foi assinada
    cache: 'no-store',
  });

  const json = (await res.json()) as GqlResponse<T>;
  if (json.errors?.length) {
    const e = json.errors[0];
    throw new ShopeeApiError(e.extensions?.code ?? 0, e.extensions?.message ?? e.message, e.path);
  }
  return json.data as T;
}
```

### 3.2 Limite de chamadas e tratamento de erros

O que a documentação garante: 8000 chamadas por hora. Ela não documenta limite por segundo, nem se o limite é por aplicativo, nem o tamanho da janela.

- **Limitador:** balde de fichas com capacidade `SHOPEE_RATE_LIMIT_PER_HOUR` por hora e no máximo 2 chamadas por segundo. Se houver mais de um processo coletando (cron e rota de API), o contador precisa ser compartilhado: uma linha no Postgres com `SELECT ... FOR UPDATE` ou um contador no Redis/Upstash. Um contador em memória não serve na Vercel.
- **Tratamento por código:**

| Código | Significado | Ação |
|---|---|---|
| 10030 | Rate limit exceeded | Parar a fila. Esperar até a próxima hora cheia ("wait for the next time window") e só então retomar. Registrar no log com horário. |
| 10020 | Assinatura, credencial ou timestamp inválido; app desativado | Não repetir. Verificar relógio do servidor (tolerância de 10 min) e credenciais. Alertar. |
| 10010 | Erro de sintaxe ou campo inexistente | Não repetir. Bug de query; alertar. |
| 10031 a 10035 | Acesso negado, afiliado inválido, conta congelada, lista negra, sem acesso à Open API | Parar toda a integração e alertar. São problemas da conta, não do código. |
| 11000, 11001, 11002 | Erro de negócio, parâmetro, vínculo de conta | Não repetir automaticamente; registrar `reason`. |
| 10000 | Erro de sistema | Repetir até 3 vezes com espera crescente (por exemplo 2 s, 8 s, 30 s). |

```ts
// src/lib/shopee/retry.ts
// sleep, pauseUntilNextHour e disableShopeeIntegration são auxiliares a implementar
// (pausa persistida no banco e interruptor da loja, seção 7 item 12).
import { ShopeeApiError } from './client';

const RETRYABLE = new Set([10000]);
const STOP_ALL = new Set([10031, 10032, 10033, 10034, 10035]);

export async function withShopeeRetry<T>(fn: () => Promise<T>): Promise<T> {
  const waits = [2_000, 8_000, 30_000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof ShopeeApiError)) throw e;
      if (e.code === 10030) { await pauseUntilNextHour(); throw e; } // o job reagenda
      if (STOP_ALL.has(e.code)) { await disableShopeeIntegration(e); throw e; }
      if (RETRYABLE.has(e.code) && attempt < waits.length) { await sleep(waits[attempt]); continue; }
      throw e;
    }
  }
}
```

## 4. Coleta

### 4.1 Orçamento de chamadas por hora (proposta)

| Uso | Chamadas/hora | Observação |
|---|---|---|
| Feed DELTA diário | cerca de 1 a 20, concentradas uma vez por dia | 500 linhas por chamada; depende do tamanho do feed |
| Atualização de itens exibidos (`productOfferV2` por `itemId`) | até 5.000 | um item por chamada; prioridade para itens com tráfego |
| Descoberta (`keyword` + `productCatId`) | até 1.000 | categorias de games, consoles e acessórios |
| `generateShortLink` sob demanda | até 1.000 | só quando não houver link em cache |
| Reserva | cerca de 200 | relatórios e testes |

Com 7.200 chamadas/hora, um item exibido pode ser atualizado várias vezes por dia. Como a ADR 0004 guarda um ponto por dia, uma atualização a cada 4 a 6 horas por item basta para "menor preço do dia" e frescor.

### 4.2 Product Feed

1. `listItemFeeds(feedMode: FULL)`: guardar `datafeedId`, `referenceId`, `date`, `totalCount`.
2. `getItemFeedData(datafeedId, offset, limit: 500)` em laço até `hasMore = false`. Cada linha traz `columns` (JSON em texto, colunas **não documentadas**). Gravar a linha bruta antes de mapear.
3. Diariamente: `listItemFeeds(feedMode: DELTA)`, aplicar `updateType` NEW, UPDATE ou DELETE. DELETE desativa a oferta, não apaga histórico.
4. Antes de mapear, inspecionar as colunas reais de um feed baixado e documentar em `docs/integracoes/shopee-feed-colunas.md`.

### 4.3 productOfferV2

```graphql
query ProdutoPorItem($itemId: Int64) {
  productOfferV2(itemId: $itemId, limit: 1) {
    nodes {
      itemId productName shopId shopName shopType
      priceMin priceMax priceDiscountRate sales ratingStar
      productCatIds imageUrl productLink offerLink
      commissionRate periodStartTime periodEndTime
    }
    pageInfo { page limit hasNextPage }
  }
}
```

```graphql
query Descoberta($keyword: String, $cat: Int, $page: Int) {
  productOfferV2(keyword: $keyword, productCatId: $cat, sortType: 2, page: $page, limit: 50) {
    nodes { itemId productName shopId shopName priceMin priceMax sales ratingStar productCatIds imageUrl productLink }
    pageInfo { page hasNextPage }
  }
}
```

Cuidados:
- O tipo `Int64` e o nome exato dos argumentos devem ser conferidos no explorer `https://open-api.affiliate.shopee.com.br/explorer/v2` antes de ir para produção. A documentação mostra os nomes dos campos, não a assinatura GraphQL completa.
- `limit: 50` é suposição: o máximo para productOfferV2 não está documentado. Testar 50 e 100 e registrar o que a API aceita.
- `listType` e `matchId` não podem ser combinados com os demais parâmetros.
- `price` está marcado "(To Be Removed)". Usar `priceMin` e `priceMax`.

### 4.4 Normalização de preço

- `priceMin` e `priceMax` chegam como texto em reais (ex.: "45.99"). Converter para centavos inteiros: `Math.round(parseFloat(v) * 100)`. Rejeitar NaN, zero e negativos.
- **Preço da oferta para o comparador:** `priceMin`, mas só quando `priceMin === priceMax`. Quando forem diferentes, o anúncio tem variações com preços distintos (edição, cor, bundle). Nesse caso, gravar os dois e marcar `has_variations = true`. Não usar no menor preço do produto canônico até confirmar a variação certa: o preço mínimo pode ser de outra edição ou de um acessório.
- Aplicar ao preço da Shopee as mesmas regras de sanidade das outras lojas: piso de 35% da mediana e filtro de 2× a média.
- A API não informa frete, estoque nem se o vendedor é internacional. O campo `shopType` indica loja oficial (1), indicada (2) ou indicada plus (4). Não há indicação de importação: tratar como "origem não informada" na tela.

## 5. Modelo de dados (proposta, adaptar ao esquema atual)

```sql
-- Oferta Shopee vinculada ao produto canônico do egeek86
create table if not exists shopee_offers (
  item_id        bigint primary key,
  product_id     uuid references products(id),   -- vínculo pelo matching do catálogo; nulo até revisar
  shop_id        bigint not null,
  shop_name      text,
  shop_type      int[],
  product_name   text not null,
  product_link   text not null,                  -- URL original do produto
  image_url      text,
  cat_ids        int[],
  has_variations boolean not null default false,
  active         boolean not null default true,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  source         text not null check (source in ('feed','product_offer_v2'))
);

-- Coleta bruta (não apagar; serve de auditoria)
create table if not exists shopee_price_raw (
  id           bigserial primary key,
  item_id      bigint not null references shopee_offers(item_id),
  price_min_c  integer not null check (price_min_c > 0),
  price_max_c  integer not null check (price_max_c >= price_min_c),
  discount_pct integer,
  sales        integer,
  rating       numeric(2,1),
  collected_at timestamptz not null default now()
);

-- Agregado diário conforme ADR 0004 (1 cotação por oferta por dia)
create table if not exists shopee_price_daily (
  item_id     bigint not null references shopee_offers(item_id),
  day         date not null,                       -- dia em America/Sao_Paulo
  price_c     integer not null,                    -- menor price_min_c do dia
  samples     integer not null,
  primary key (item_id, day)
);

-- Link rastreado gerado pela Shopee (não alterar depois de gerado)
create table if not exists shopee_short_links (
  item_id     bigint not null references shopee_offers(item_id),
  sub_ids     text[] not null,
  short_link  text not null,
  created_at  timestamptz not null default now(),
  primary key (item_id, sub_ids)
);
```

- RLS: as quatro tabelas só podem ser escritas pelo papel de serviço. Leitura pública apenas por views que expõem o necessário.
- Oferta sem coleta há mais de 7 dias deixa de valer como preço atual (regra já existente no egeek86). O campo `last_seen_at` alimenta esse corte.

## 6. Link de compra

```graphql
mutation GerarLink($url: String!, $subIds: [String]) {
  generateShortLink(input: { originUrl: $url, subIds: $subIds }) { shortLink }
}
```

- `originUrl`: o `productLink` da oferta.
- `subIds` (até 5): use para medir de onde veio o clique sem dados pessoais. Proposta:
  1. `egeek86`;
  2. a página (`produto`, `busca`, `tabela`);
  3. a dimensão (`jogo`, `console`, `acessorio`);
  4. o id do produto canônico;
  5. vazio.
  Os valores voltam no campo `utmContent` do conversionReport.
- Gerar sob demanda no primeiro clique e guardar em `shopee_short_links`. Não gerar em massa.
- A rota `/go/[slug]` responde com redirecionamento 302 para o `short_link` **somente após o clique do usuário** (T&C 4.4). Não pré-carregar, não abrir em iframe, não redirecionar automaticamente.
- Links de saída com `rel="nofollow sponsored noopener"`. Manter `Disallow: /go/` no robots.txt (T&C 4.3(k) proíbe indexar URLs com o ID de afiliado).
- Se o Product Feed trouxer um "product_short link", ele pode substituir o `generateShortLink` para itens do feed, como a Shopee recomenda. Confirmar a coluna real no feed.

## 7. Conformidade (checklist antes de publicar)

| # | Requisito | Base | Como cumprir no egeek86 |
|---|---|---|---|
| 1 | Site aprovado como Mídia de Afiliado | T&C 2.3(a) | Conferir no portal se o domínio egeek86.com está cadastrado. |
| 2 | Identificar que o site pode receber comissão | Guia CONAR 2026; T&C 4.2 | Aviso curto e visível junto ao botão "Ir à loja", por exemplo: "Podemos receber comissão da loja se você comprar por este link. O preço para você não muda." **Isso altera a regra interna de nunca mencionar a relação comercial; decisão sua.** |
| 3 | Sem anúncios em Google Ads ou Bing Ads com link de afiliado | T&C 4.3(i) | Não usar link Shopee em campanhas de busca ou shopping. |
| 4 | "Shopee" como palavra-chave negativa em anúncios de busca do site | T&C 4.3(c) | Se houver campanha de busca, incluir a negativa. |
| 5 | Não indexar links de afiliado | T&C 4.3(k) | `/go/` bloqueado no robots.txt e links com `nofollow sponsored`. |
| 6 | Cookie só com clique voluntário | T&C 4.4 | Sem prefetch da rota `/go/`. Desligar o prefetch do `<Link>` do Next.js nesses botões (`prefetch={false}`) ou usar `<a>` simples. |
| 7 | Sem raspagem do site da Shopee | T&C 4.3(d); ToS 3.1 | Só Open API. Remover qualquer coletor antigo de páginas Shopee. |
| 8 | Imagem do produto vinda da API | T&C 4.3(d) | Usar `imageUrl` da API; não copiar banners nem logotipo da Shopee. |
| 9 | Marca Shopee | T&C 2.3(a) (ambíguo para sites) | Exibir o nome "Shopee" como loja de origem em texto; evitar logotipo até confirmação. |
| 10 | Não exibir informação desatualizada como atual | T&C 4.3(j); Boas práticas | Mostrar "Atualizado há X" e retirar a oferta da comparação após 7 dias sem coleta. |
| 11 | Não testar comprando pelo próprio link | T&C 3.6(c) | Testes de fluxo param na página da loja. |
| 12 | Remover conteúdo quando a Shopee pedir | T&C 4.1 e 5.2(a) | Ter um interruptor por loja que tira todas as ofertas Shopee do ar sem deploy. |
| 13 | Dados pessoais dos relatórios | Política de Privacidade 8.6; ToS 2.2 | Não importar nome nem contato de comprador. O conversionReport traz pedidos, não identificação; guardar só agregados por subId. |

## 8. Histórico de preços: o que fazer até haver resposta da Shopee

- **Coletar e guardar:** sim. É uso interno dos dados obtidos pela API, compatível com o propósito do feed ("populate your database", manutenção diária).
- **Exibir preço atual, loja e link:** sim. É o uso previsto do programa.
- **Exibir histórico, média, mínimo e variação calculados com dados Shopee:** manter `SHOPEE_SHOW_PRICE_HISTORY=false` até a Shopee responder. O motivo é a cláusula 6.1(d) dos Termos do Programa, que trata como confidencial "qualquer dado (incluindo dados de conteúdo e análises de conteúdo) compartilhado pela Shopee [...] em conexão com os programas da Shopee", combinada com a proibição de "exibir publicamente [...] ou criar trabalhos derivados" do Conteúdo (ToS 3.1).
- **Enquanto isso:** a média do produto pode continuar usando as outras lojas. A oferta da Shopee entra só como "preço atual nesta loja", sem contribuir para o histórico público.
- **Pergunta para a Shopee (enviar pelo formulário de contato do programa):**
  > Somos um site de comparação de preços de jogos cadastrado no Programa de Afiliados. Podemos guardar o histórico de preços obtido pela Open API e exibir ao público a variação de preço e o menor preço registrado de produtos Shopee, com link de afiliado? Podemos exibir o nome "Shopee" como loja de origem? Qual o limite de chamadas por segundo e se os 8000/hora são por aplicativo?

## 9. Testes

```ts
// src/lib/shopee/__tests__/sign.test.ts
import { sign } from '../client';

test('reproduz o exemplo oficial de assinatura', () => {
  // Corpo com a indentação original do exemplo (4 e 8 espaços)
  const payload = JSON.stringify({
    query: '{\nbrandOffer{\n    nodes{\n        commissionRate\n        offerName\n    }\n}\n}',
  });
  expect(sign('123456', 1577836800, payload, 'demo'))
    .toBe('dc88d72feea70c80c52c3399751a7d34966763f51a7f056aa070a5e9df645412');
});
```

Este vetor foi conferido em 10/11/2026: o hash bate com a documentação.

Outros testes recomendados:
- **Normalização:** "45.99" → 4599; "0", "", "abc" e valores negativos são rejeitados; `priceMin ≠ priceMax` marca `has_variations`.
- **Erros:** 10030 pausa a fila sem repetir; 10020 não repete; 10000 repete até 3 vezes; 10031 a 10035 desligam a integração.
- **Limitador:** 7.201 chamadas simuladas na mesma hora → a última espera a próxima janela.
- **Agregado diário:** três coletas no mesmo dia → uma linha em `shopee_price_daily` com o menor preço e `samples = 3`.
- **Link:** `/go/[slug]` só responde 302 em GET iniciado por navegação. Botões de saída com `prefetch={false}`. HTML com `rel="nofollow sponsored noopener"`.
- **Interruptor:** desligar a loja Shopee tira as ofertas da busca, da tabela e do produto sem deploy.

## 10. Ordem de implementação

1. Variáveis de ambiente, `client.ts`, teste de assinatura e uma chamada manual de `productOfferV2` por `itemId` pelo servidor.
2. Limitador compartilhado e tratamento de erros.
3. Tabelas, RLS e normalização de preço.
4. Feed FULL de teste: inspecionar e documentar as colunas reais.
5. Feed DELTA diário (cron Vercel ou Supabase scheduled function) e atualização por `itemId` dos itens exibidos.
6. Matching oferta → produto canônico, com a mesma revisão usada para as outras lojas (sem vínculo automático quando o título contradiz o produto).
7. `generateShortLink` sob demanda e ajuste da rota `/go/`.
8. Checklist de conformidade (seção 7) e aviso de comissão.
9. Exibição do histórico só depois da resposta da Shopee (seção 8).
