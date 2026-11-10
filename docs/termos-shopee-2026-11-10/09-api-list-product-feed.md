# API List — Get Product Feed Offer List e Get Product Feed Offer Details

- URLs:
  - https://affiliate.shopee.com.br/open_api/list?type=product_feed_offer
  - https://affiliate.shopee.com.br/open_api/list?type=product_feed_offer_detail
- Título da aba: Criadores e Afiliados Shopee | Shopee 2026
- Data de atualização: não informada nas páginas (lançamento descrito em "New Version Update", 2026-03-05)
- Lido em: 10/11/2026

---

## Get Product Feed Offer List
Query: listItemFeeds
ResultType: ItemFeedListConnection!

Query parameters

| Field | Type | Description | Example |
|---|---|---|---|
| feedMode | FeedMode | Optional. 1. 'FULL' (Default): Contains every product in that category. Use this for your first download. 2. 'DELTA': Only contains products that were added, updated, or removed since yesterday. | FULL |

Response parameters

| Field | Type | Description | Example |
|---|---|---|---|
| feeds | [ItemFeed!]! | Offer Data List | |

ItemFeed structure

| Field | Type | Description | Example |
|---|---|---|---|
| datafeedId | String! | The unique key used to fetch specific file details for the product catalog. | 12345_FULL_20260205 |
| datafeedName | String! | The display name of the product catalog | Home Appliance - Preferred |
| referenceId | String! | An identifier that enables clients to map delta updates to the corresponding full feed | 373421936506056704 |
| description | String! | A brief summary of the catalog content | |
| totalCount | Int64! | Total number of products within the catalog | 509 |
| date | String! | The date when the product catalog was last synchronized or updated | 2026-02-08 |
| feedMode | FeedMode! | 1. 'FULL' (Default): Contains every product in that category. Use this for your first download. 2. 'DELTA': Only contains products that were added, updated, or removed since yesterday. | FULL |

## Get Product Feed Offer Details
Query: getItemFeedData
ResultType: ItemFeedDataConnection!

Query parameters

| Field | Type | Description | Example |
|---|---|---|---|
| datafeedId | String! | A unique identifier returned by the listItemFeeds API, used to track specific data snapshots. Format: {datafeedId}_{feedMode}_{grassDate} | 12345_FULL_20260205 |
| offset | Int | The starting point (index) from which to begin retrieving the current request's results | 0 |
| limit | Int | The number of items to download per page; maximum allowed value is 500 | 500 |

Response parameters

| Field | Type | Description | Example |
|---|---|---|---|
| rows | [ItemFeedDataRow!]! | Data List | |
| pageInfo | ItemFeedPageInfo! | Page Information | |

ItemFeedDataRow structure

| Field | Type | Description | Example |
|---|---|---|---|
| columns | String | Core data fields. JSON object strings containing column names and column values | |
| updateType | DeltaDataUpdateType | Only valid in DELTA mode. Indicates the change type of the record: NEW (new), UPDATE, DELETE. | NEW |

ItemFeedPageInfo structure

| Field | Type | Description | Example |
|---|---|---|---|
| offset | Int64! | The starting index for the current data segment | 0 |
| limit | Int64! | The maximum number of records to return in this request | 500 |
| totalCount | Int64! | The total number of available feed files matching the criteria | 1000 |
| hasMore | Boolean! | A boolean flag indicating if more pages are available (TRUE: next page exists; FALSE: last page reached) | TRUE |

---

## Página do portal "Feed de produto" (complementar)

- URL: https://affiliate.shopee.com.br/creative/product_feed
- Lido em: 10/11/2026

Página Inicial / Criativo / Feed de produto
Feed de produto
O feed de produtos atualiza os dados automaticamente todos os dias.

| Nome do Feed de Produto | Descrição | Hora de Atualização de Dados | Link |
|---|---|---|---|
| Shopee Oficial BR - 2022 | -- | 10/11/2026 10:30:57 | Ver Link (não aberto) |
| Shopee Brasil - 2022 | -- | 10/11/2026 10:30:57 | Ver Link (não aberto) |
