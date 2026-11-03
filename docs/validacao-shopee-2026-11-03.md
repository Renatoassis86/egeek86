# Validação da integração Shopee (2026-11-03)

Escopo: coleta Shopee somente por API oficial (Shopee Affiliate Open API, GraphQL assinado). Auditoria feita com leituras (SELECT em transação `read only`, logs da Vercel, testes offline). Nenhuma gravação em dados foi feita, portanto não houve necessidade de backup. Nenhum segredo foi lido, impresso ou gravado.

Legenda: **[REAL]** medido agora; **[CÓDIGO]** lido no código; **[HIPÓTESE]** não provado; **[RECOMENDAÇÃO]**.

## 1. Resumo

| Item | Situação |
|---|---|
| Código de coleta e assinatura | Correto contra o algoritmo documentado; 38 verificações offline passam (`scripts/test-shopee.ts`) |
| Cron `/api/cron/collect-shopee` (`*/10`) | Rodando em produção, HTTP 200 a cada 10 min **[REAL]** |
| Validação ao vivo contra a API (assinatura, campos, latência, cota) | **NÃO EXECUTADA localmente**: sem credencial acessível (ver 3) |
| Dados no banco | Coleta viva e consistente; 4 problemas de qualidade/cobertura (ver 5) |
| Link de afiliado | Só da mutation oficial `generateShortLink`; 100% das 4.372 ofertas em `s.shopee.com.br` **[REAL]** |
| Palavra "afiliado" na UI do cliente | Ausente na área pública **[REAL]** (só em admin, ver 6) |

## 2. Como a integração funciona **[CÓDIGO]**

- Arquivos: `src/server/collector/sources/shopee-auth.ts` (assinatura, erros, link), `sources/shopee.ts` (queries e parse), `collect-shopee-prices.ts` (coleta periódica), `discover-shopee-products.ts` (descoberta), `src/app/api/cron/collect-shopee/route.ts`.
- Env necessária (só nomes): `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_APP_SECRET`, e `CRON_SECRET` para a rota (falha fechada se ausente). Constam em `.env.example`. Na Vercel (Production e Preview) existem as duas `SHOPEE_AFFILIATE_*` (marcadas Sensitive, ocultas) e mais duas legadas `SHOPEE_APP_ID`/`SHOPEE_SECRET` que o código **não usa** **[REAL]** (limpeza sugerida, ver 8).
- Assinatura: `Authorization: SHA256 Credential=<appId>, Timestamp=<s>, Signature=<hex>`, com `Signature = SHA256(AppID + Timestamp + Payload + Secret)` sobre o corpo JSON exato enviado. Endpoint `https://open-api.affiliate.shopee.com.br/graphql`, POST, timeout 15 s. Verificado offline: o header tem o formato oficial e a assinatura recalculada independentemente confere.
- Erros classificados: 10020 auth, 10030/HTTP 429 rate limit, 10031-10035 acesso, 11001 parâmetro, 11000 negócio. Auth, acesso e rate limit são fatais para o lote (o coletor para em vez de martelar a API). Resposta sem `data` vira erro, nunca dado parcial.
- Query: `productOfferV2` com campos `itemId shopId shopName productName priceMin priceMax sales imageUrl productLink offerLink ratingStar priceDiscountRate`. Paginação por `page`/`limit` (limite travado em 50) e `pageInfo.hasNextPage`; descoberta usa 4 termos por execução x 2 páginas, `sortType: 2`.
- Preço: `priceMin` é o preço; se `priceMax > 1,10 x priceMin` a oferta é "preço ambíguo" e não grava. Não existe campo de estoque na API: "disponível" = a API devolveu o item com preço válido.
- Coletor periódico: 1 chamada por oferta (`itemId`), concorrência 3, orçamento 240 s, máx. 600 por tick, ativas a cada 30 min e expiradas a cada 24 h, 3 respostas válidas seguidas sem preço expiram a oferta, filtro anti-isca (preço < 35% da mediana do master).
- Link de afiliado: `generateShortLink(originUrl, subIds)`; só aceita retorno `https://`; falha mantém URL pública e `affiliate_link_pending = true` (não finge comissão).

## 3. Validação ao vivo contra a API oficial: não executada

Motivo **[REAL]**: `.env.local` não tem nenhuma variável `SHOPEE_*` e o ambiente do shell também não. As credenciais existem só na Vercel como variáveis Sensitive, que a CLI não permite baixar (`vercel env pull` as omite). Não tentei contornar isso nem usar o endpoint de produção do cron (exige `CRON_SECRET` e grava no banco).

Portanto ficam **sem evidência direta** nesta rodada: resposta real da API, campos efetivamente devolvidos, latência e cotas.

Evidência indireta de que a credencial de produção funciona **[REAL]**: 6.178 snapshots `source = 'api'` desde 2026-07-23; 740 snapshots nas últimas 24 h; última mudança de preço gravada às 17:50 UTC de hoje; última checagem às 18:40 UTC; 4.372 links curtos obtidos pela mutation oficial. Ou seja, assinatura, `productOfferV2` e `generateShortLink` funcionam em produção.

Para fechar esta pendência (leitura pura, sem gravar): colocar `SHOPEE_AFFILIATE_APP_ID`/`SECRET` em `.env.local` (ou rodar na Vercel) e executar uma query `productOfferV2(keyword:"ps5", limit:5)` medindo o tempo. O teste offline já cobre a lógica de assinatura e parse. Cota: a documentação oficial exige login em `affiliate.shopee.com.br/open_api`; o limite por hora **não foi confirmado** e não deve ser citado como fato **[HIPÓTESE]**.

## 4. Observabilidade (corrigido)

Os logs da Vercel mostram só `GET /api/cron/collect-shopee 200`; o corpo (`CollectShopeeSummary`) não é registrado, então não havia como saber quantas ofertas cada tick cobre, nem se parou por rate limit ou por tempo. Corrigido: a rota agora faz `console.log('[collect-shopee]', ...)` com as contagens do resumo (sem segredos, no máximo 5 erros truncados). Depois do próximo deploy, `vercel logs --query collect-shopee` passa a mostrar `stoppedBecause`, `checked`, `priced`, `errors`.

## 5. Auditoria dos dados Shopee (SELECT) **[REAL]**, 2026-11-03 ~18:45 UTC

### 5.1 Volume e frescor
- Ofertas Shopee: 773 ativas, 18 rascunho, 3.581 expiradas (4.372 no total). Nenhum `external_ref` fora de `shopee-<itemId>`; nenhum `external_ref` duplicado; nenhuma oferta sem master, com master inexistente ou fundido; nenhuma em quarentena; nenhuma ativa sem snapshot nem com cache de preço divergente do último snapshot.
- Ativas: 331 lojas, todas com imagem e loja. Coleta mais recente 18:40 UTC, mais antiga 17:30 UTC (74 min).
- **Cobertura abaixo do alvo**: o alvo é cada ativa a cada 30 min; hoje 470 das 773 estão com mais de 30 min e 149 com mais de 1 h. Distribuição por idade (blocos de 10 min): ~104 ofertas por tick. Ou seja, cada execução cobre ~100 ofertas e não as 600 do teto. A causa (latência da API, latência do banco ou parada por rate limit) **não é distinguível sem o log novo** **[HIPÓTESE]**.
- **Expiradas nunca revisitadas**: 3.486 das 3.581 expiradas foram checadas pela última vez em 31/10 (10:55-13:00 UTC) e 3.578 estão vencidas (> 24 h). Como as ativas vencidas ocupam toda a capacidade de cada tick, as expiradas não chegam a ser reconsultadas e nada é reativado. Consequência para "concorrência real": uma loja que voltou ao estoque só reaparece se for redescoberta. Parte dessas expirações pode vir da regra "3 respostas sem preço"; ver risco R2.
- Churn: 105 ofertas expiradas nas últimas 24 h; 0 reativações nas últimas 24 h; 0 ofertas novas nas últimas 24 h e 721 nos últimos 7 dias. A descoberta Shopee não está em `vercel.json` (só `collect-prices`, `notify-price-drops`, `collect-shopee`, `refresh-snapshots`); ela depende de outro disparador (a conferir). Se não houver, o catálogo Shopee só encolhe.

### 5.2 Preços
- Ativas: mínimo R$ 4,99, mediana R$ 169,89, máximo R$ 7.898,00. 0 acima de R$ 15.000.
- 47 abaixo de R$ 20: todas acessórios/peças (grips, molas, chaves, cabos). Preços plausíveis para o tipo. Nenhum jogo ou console abaixo desse patamar. Das 47, ~25 são barradas pelo porteiro (reparo/peças).
- 4.372 de 4.372 `affiliate_url` em `https://s.shopee.com.br/...`; 0 pendentes; 0 URLs públicas sem comissão; 0 com parâmetros suspeitos.

### 5.3 Porteiro (gate) e tipos
- Reavaliando as 773 ativas com `evaluateCatalogGate`: 633 aprovadas, 140 não aprovadas (73 fora de escopo, 60 não original/clone, 6 decisão do dono, 1 usado). 147 masters Shopee ativos já têm veredito persistido não aprovado (a diferença de 7 é veredito manual/histórico). Elas ficam ocultas da vitrine e dos indicadores, mas continuam `active` e **consomem ~19% da cota de coleta** em checagens inúteis **[RECOMENDAÇÃO]**: priorizar no fim da fila ou não consultar as já rejeitadas.
- As 18 ofertas em rascunho e as 773 ativas passam pela entrada: master novo nasce com `entryGateAttributes` (código lido em `discover-shopee-products.ts`). Os masters Shopee ativos têm apenas as chaves `catalogGate` e `synopsis_source` em `attributes`, coerente com o desenho (o veredito só é gravado quando não aprovado).
- Tipos das ativas (cobertas pelo gate): jogo 479 (6 sem plataforma: itens de 3DS/N64/PS3/brinquedos, todos pegos por filtro de escopo ou a revisar), console, acessório.

### 5.4 Duplicatas e identidade
- Mesma oferta duplicada: 0. Várias ofertas Shopee ativas no mesmo master: 15+ masters (por exemplo Resident Evil 4 Remake PS5 com 5 lojas). Isso é esperado (lojas diferentes do mesmo jogo = mais cotações), não é duplicata.
- Duplicata de master: 715 masters Shopee ativos; **10 deles o `findExistingMasterProduct` atual mapeia para OUTRO master** (ex.: "Resident Evil 4 2023 PS5 Midia Fisica" x "Resident Evil 4 2023 Ps5 P S N NÃO É CD"; "GTA 5 PS4 ... Com Mapa" x "Gta 5"; "Lego Marvel Super Heroes 2 PS4" x "Jogo Lego Super Heroes 2 PS4"; "Grand Theft Auto V GTA 5 PS5 ..." x "Jogo Gta 5 Ps5 ...", "Resident Evil 2 Remake PS5 ..." x "Resident Evil 2 Ps5 ..."; mais 5 de acessório/console). Violam "um jogo, uma média". Sinalizado ao responsável por dedup (outro agente); não toquei em dedup nem fusão.

### 5.5 Formato digital x físico e título
- Dos jogos aprovados (≈434): 63 `physical`, 371 `unknown`. Desses 371, **209 têm no título "mídia física/lacrado/disco/cartucho"** e continuam `unknown`. Causa **[CÓDIGO]**: a descoberta só usava `classifyFromAttributes([], título)`, que lê o atributo FORMAT do Mercado Livre (inexistente na Shopee). Corrigido para novos masters (ver 7); o backfill dos existentes exige gravação (pendente, ver 8).
- Digital: nenhum jogo digital (código, chave, PSN) apareceu entre as ofertas Shopee ativas aprovadas; 1 título ("Beast of Reincarnation PS5 ... Jogo Novo Lacrado") foi acusado por conter "Chave"/similar mas é físico. "Digital" nos consoles refere-se à edição sem leitor e está certo.
- Título limpo: **não há limpeza de título**; o `master_products.name` e `affiliate_offers.title` são o `productName` cru do vendedor. 30 das 773 ativas têm emoji, "envio imediato", "pronta entrega", "[Seguro e Confiança]" etc. (ex.: "🎮 Far Cry 6 – PS5"). Pendência de apresentação, pertence a quem cuida da camada de exibição/identidade.

## 6. Link de afiliado e a palavra "afiliado" na UI **[REAL/CÓDIGO]**

- Origem do link: único ponto que escreve `affiliate_url` Shopee em código automático é `generateShopeeAffiliateLink` (mutation `generateShortLink`), usado pela descoberta e pelo coletor. Não existe montagem manual de parâmetro de comissão. Falha da API mantém URL pública com `affiliate_link_pending = true`. No banco, 0 pendentes.
- O cliente nunca vê a URL de afiliado: a saída é `/go/[slug]`, que lê o destino sempre do banco (sem redirect aberto, valida http/https), registra o clique e redireciona.
- Palavra "afiliado" na área pública: `grep` em `src/app/(shop)`, `src/components` e `src/app/api` não encontra texto visível ao cliente. O texto legal é `CommissionNotice` ("Podemos receber uma comissão pelas compras feitas pelos nossos links..."). Ocorrências restantes: `src/app/(shop)/sobre/page.tsx` (somente `id` e caminho de imagem `ferramenta-gestao-afiliados`, o texto visível diz "divulgadores"); `src/app/entrar/page.tsx` (apenas valor interno `'afiliado'` do seletor, rótulos visíveis dizem "Divulgador"); páginas `src/app/admin/*` (área restrita, aceitável) e `message-template.ts` (mensagem do painel admin). Nada a corrigir.
- Item a revisar pelo responsável: o caminho de imagem do `/sobre` contém "afiliados" na URL do arquivo (visível a quem inspeciona o HTML). Renomear exigiria mexer em `public/images` e na regra de uma imagem, um lugar; não foi alterado.

## 7. Correções feitas (sem commit, sem deploy)

1. `src/app/api/cron/collect-shopee/route.ts`: log do resumo (ver 4).
2. `src/server/collector/discover-shopee-products.ts`: novo master de **jogo** passa a gravar `gameFormat` por `resolveGameFormat(título, formato estruturado)`, que só afirma físico/digital quando o título prova (nunca chuta). Não altera masters existentes nem dedup.
3. `scripts/test-shopee.ts` (novo): 38 verificações offline, 0 falhas. Rodar: `npx tsx --conditions=react-server scripts/test-shopee.ts`. Usa credenciais fictícias e `fetch` simulado; não faz rede nem acessa o banco.
- `tsc --noEmit`: sem erros nos arquivos Shopee. A verificação do `qa-verificador` ainda deve ser acionada pelo orquestrador (este agente não a executou).

## 8. Riscos e pendências

| # | Item | Tipo |
|---|---|---|
| P1 | Validar ao vivo (assinatura, campos, latência, cota) com a credencial; hoje só há evidência indireta | Pendência, precisa da credencial local |
| P2 | Cobertura: ~100 ofertas por tick; 470 ativas fora da janela de 30 min. Ler o novo log após o deploy; se for tempo, reduzir trabalho por item (consulta de referência e transação por item) ou aumentar concorrência; se for rate limit, espaçar | Risco operacional |
| P3 | Expiradas nunca revisitadas (3.486 sem checagem desde 31/10). Reservar fatia fixa de cada tick (ex. 10%) para expiradas ou checar menos as ativas rejeitadas pelo gate | Recomendação (muda consumo de cota, decidir com P2) |
| P4 | 147 ofertas ativas de masters rejeitados/em revisão gastam ~19% da cota | Recomendação |
| R2 | Variação com `priceMax > 1,10 x priceMin` conta como "sem preço" e, após 3 vezes, expira uma oferta que existe. Item com faixa de variações larga some em vez de ficar com preço da variação mais barata | Risco de cobertura, não alterado (mudar a regra afeta preço exibido; decisão de negócio) |
| P5 | 10 masters Shopee duplicados segundo o dedup atual | Encaminhar ao agente de dedup |
| P6 | Backfill de `game_format` em ~209 masters Shopee (título prova físico). Gravação: exige backup ≤ 12 h e log; não executada | Pendência |
| P7 | Títulos crus com emoji/promoção (30 de 773) | Pendência de apresentação |
| P8 | Descoberta Shopee não está no `vercel.json`; confirmar quem a dispara (0 ofertas novas em 24 h) | Pendência |
| P9 | `triggerShopeeExtraction(queryOrUrl)` ignora o argumento e roda a rotação de termos fixa; a mensagem ao admin sugere busca por palavra-chave/link | Bug menor de admin, não alterado |
| P10 | Variáveis legadas `SHOPEE_APP_ID`/`SHOPEE_SECRET` na Vercel, não usadas pelo código (risco de segredo esquecido) | Limpeza |
| R1 | API não tem campo de estoque; "indisponível" = não retornado ou sem preço válido. Limitação da API, já documentada no código | Limitação |

## 9. Evidências (sem segredos)

- Consultas: contagens por status, frescor, preços, hosts de `affiliate_url`, formato, gate (via `evaluateCatalogGate`), duplicatas (`findExistingMasterProduct` sobre os 715 masters), todas em `BEGIN READ ONLY` com `DATABASE_URL` do `.env.local`.
- Cron: `vercel logs --environment production --query collect-shopee` mostra execuções a cada 10 min, `responseStatusCode: 200`, deployment de produção atual.
- Testes: `scripts/test-shopee.ts` 38/38 OK.
