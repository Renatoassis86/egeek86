# API List — Get Product Offer List (Version 2.0)

- URL: https://affiliate.shopee.com.br/open_api/list?type=product_offer
- Título da aba: Criadores e Afiliados Shopee | Shopee 2026
- Data de atualização: não informada na página
- Lido em: 10/11/2026

---

Get Product Offer List
Query: productOfferV2
ResultType: ProductOfferConnectionV2

Query parameters

| Field | Type | Description | Example |
|---|---|---|---|
| shopId (New) | Int64 | Search by shop id | 84499012 |
| itemId (New) | Int64 | Search by item id | 17979995178 |
| productCatId (New) | Int32 | Filter specific Level 1 / Level 2 / Level 3 product category tiers using the category id. Please refer to the following link to find the correct category ids. SG https://seller.shopee.sg/edu/category-guide · MY https://seller.shopee.com.my/edu/category-guide · TH https://seller.shopee.co.th/edu/category-guide · TW https://seller.shopee.tw/portal/categories · ID https://seller.shopee.co.id/edu/category-guide · VN https://banhang.shopee.vn/edu/category-guide · PH https://seller.shopee.ph/edu/category-guide · BR https://seller.shopee.com.br/edu/category-guide | 100001 |
| listType | Int | Type of product offer list, (listType can only be used as a query parameter with matchId, can not be used as a query parameter with the rest of the input). ALL = 0; Recommendation product list, not available to sort. HIGHEST_COMMISSION = 1;(To Be Removed) Highest commission product offer list, not available to sort. TOP_PERFORMING = 2; Top performing product offer list, not available to sort. LANDING_CATEGORY = 3; Product offer list of recommendation category in landing page, not available to sort. DETAIL_CATEGORY = 4; Product offer list of specific category in detail page. DETAIL_SHOP = 5; Product offer list of specific shop in detail page. DETAIL_COLLECTION = 6;(To Be Removed) Product offer list of specific collection in detail page | 1 |
| matchId | Int64 | The matchid for specific listType(matchId can only be used as a query parameter with listType, can not be used as a query parameter with the rest of the input). CategoryId for listType = LANDING_CATEGORY and DETAIL_CATEGORY; ShopId for listType = DETAIL_SHOP; CollectionId for listType = DETAIL_COLLECTION | 10012 |
| keyword | String | Search by product name | shopee |
| sortType | Int | RELEVANCE_DESC = 1; Only for search by keyword, and sort by relevance with keyword. ITEM_SOLD_DESC = 2; Sort by sold count from high to low. PRICE_DESC = 3; Sort by price from high to low. PRICE_ASC = 4; Sort by price from low to high. COMMISSION_DESC = 5; Sort by commission rate from high to low | 2 |
| page | Int | Page number | 2 |
| isAMSOffer (New) | Bool | Filter by type of offer. TRUE = Filter for offers that have seller (AMS) commission. FALSE = Filter for all offers regardless of if there is seller (AMS) commission | true |
| isKeySeller (New) | Bool | Filter for offers from Shopee's key sellers; TRUE = Offers from key sellers; FALSE = All offers regardless of the key seller status | true |
| limit | Int | Number of data per page | 10 |

Response parameters

| Field | Type | Description | Example |
|---|---|---|---|
| nodes | [ProductOfferV2]! | Data list | |
| pageInfo | PageInfo! | Page information | |

ProductOfferV2 structure

| Field | Type | Description | Example |
|---|---|---|---|
| itemId | Int64 | Item ID | 17979995178 |
| commissionRate | String | Maximum Commission rate, e.g. set "0.0123" if the rate is 1.23% | "0.25" |
| sellerCommissionRate (New) | String | Seller Commission rate (Commission Xtra rate) | "0.25" |
| shopeeCommissionRate (New) | String | Shopee Commission rate | "0.25" |
| commission (New) | String | Commission amount = price * commissionRate. Note: The unit is the local currency | "27000" |
| appExistRate (To Be Removed) | String | Commission rate for non-first-time order users of this product on the app, e.g. set "0.0123" if the rate is 1.23% | |
| appNewRate (To Be Removed) | String | Commission rate for new users of this product on the app, e.g. set "0.0123" if the rate is 1.23% | |
| webExistRate (To Be Removed) | String | Commission rate for non-first-time order users on the web, e.g. set "0.0123" if the rate is 1.23% | |
| webNewRate (To Be Removed) | String | Commission rate for new users of this product on the web, e.g. set "0.0123" if the rate is 1.23% | |
| price (To Be Removed) | String | Product Price. Note: The unit is the local currency | |
| sales | Int32 | Sales count for this product | 25 |
| priceMax (New) | String | Product maximum price. Note: The unit is the local currency | "55.99" |
| priceMin (New) | String | Product minimum price. Note: The unit is the local currency | "45.99" |
| productCatIds (New) | [Int] | Product category id. Returns category id level 1, level 2, level 3 in order, or 0 if the relevant level does not exist. | [100012,100068,100259] |
| ratingStar (New) | String | The product rating shown in Shopee Product Page | "4.7" |
| priceDiscountRate (New) | Int | The price discount shown in Shopee Product Page. 10 represents 10% | 10 |
| imageUrl | String | Image url | |
| productName | String | Product name | IKEA starfish |
| shopId (New) | Int64 | Shop id | 84499012 |
| shopName | String | Shop name | IKEA |
| shopType (New) | [Int] | OFFICIAL_SHOP = 1; Product offers from official shops / Shopee Mall sellers. PREFERRED_SHOP = 2; Product offers from preferred sellers. PREFERRED_PLUS_SHOP = 4; Product offers from preferred plus sellers | [], [1,4] |
| productLink | String | Product link | https://shopee.co.id/product/14318452/4058376611 |
| offerLink | String | Offer link | https://shope.ee/xxxxxxxx |
| periodStartTime | Int | Offer Start Time | 1687539600 |
| periodEndTime | Int | Offer End Time | 1688144399 |

PageInfo structure

| Field | Type | Description | Example |
|---|---|---|---|
| page | Int | The current page number | 2 |
| limit | Int | Number of data per page | 10 |
| hasNextPage | Bool | If it has next page | true |

Error Code Description

| Error Code | Error Description |
|---|---|
| 11000 | Business Error |
| 11001 | Params Error : {reason} |
| 11002 | Bind Account Error : {reason} |
| 10020 | Invalid Signature |
| 10020 | Your App has been disabled |
| 10020 | Request Expired |
| 10020 | Invalid Timestamp |
| 10020 | Invalid Credential |
| 10020 | Invalid Authorization Header |
| 10020 | Unsupported Auth Type |
| 10030 | Rate limit exceeded |
| 10031 | access deny |
| 10032 | invalid affiliate id |
| 10033 | account is frozen |
| 10034 | affiliate id in black list |
| 10035 | You currently do not have access to the Shopee Affiliate Open API Platform. Please contact us to request access or learn more. contact link : https://help.shopee.com.br/portal/webform/bbce78695c364ba18c9cbceb74ec9091 |
