# API List — Get Shopee Offer List (Version 2.0)

- URL: https://affiliate.shopee.com.br/open_api/list (página padrão; link do menu: /open_api/list?type=shopee_offer)
- Título da aba: Criadores e Afiliados Shopee | Shopee 2026
- Data de atualização: não informada na página (ver "New Version Update")
- Lido em: 10/11/2026

---

Get Shopee Offer List
Query: shopeeOfferV2
ResultType: ShopeeOfferConnectionV2!

Query parameters

| Field | Type | Description | Example |
|---|---|---|---|
| keyword | String | Search by offer name | clothes |
| sortType | Int | LATEST_DESC = 1 — Sort offers by latest update time; HIGHEST_COMMISSION_DESC = 2 — Sort offers by commission rate from high to low | 1 |
| page | Int | Page number | 2 |
| limit | Int | Number of data per page | 10 |

Response parameters

| Field | Type | Description | Example |
|---|---|---|---|
| nodes | [ShopeeOfferV2]! | Data list | |
| pageInfo | PageInfo! | Page information | |

ShopeeOfferV2 structure

| Field | Type | Description | Example |
|---|---|---|---|
| commissionRate | String | Commission rate, e.g. set "0.0123" if the rate is 1.23% | |
| imageUrl | String | Image url | |
| offerLink | String | Offer link | |
| originalLink | String | Original link | |
| offerName | String | Offer name | |
| offerType | Int | CAMPAIGN_TYPE_COLLECTION = 1; CAMPAIGN_TYPE_CATEGORY = 2; | |
| categoryId | Int64 | CategoryId returns when offerType = CAMPAIGN_TYPE_CATEGORY | |
| collectionId | Int64 | CollectionId returns when offerType = CAMPAIGN_TYPE_COLLECTION | |
| periodStartTime | Int | Offer start time | |
| periodEndTime | Int | Offer end time | |

PageInfo structure

| Field | Type | Description | Example |
|---|---|---|---|
| page | Int | The current page number | 2 |
| limit | Int | Number of data per page | 10 |
| hasNextPage | Bool | If it has next page | true |
