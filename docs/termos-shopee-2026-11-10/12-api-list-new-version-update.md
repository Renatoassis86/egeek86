# API List — New Version Update

- URL: https://affiliate.shopee.com.br/open_api/list?type=update_instructions
- Título da aba: Criadores e Afiliados Shopee | Shopee 2026
- Data de atualização mais recente na página: 2026-03-05
- Lido em: 10/11/2026

---

New Version Update
Some of Shopee Open API platform features have been optimized.
But The old API version is still available. Affiliate partners can choose update your API accordingly or not.

Update on 2026-03-05
Open API New Product Feed API Release
- This guide explains how to use the Shopee OpenAPI Product Feed to retrieve and manage product data for your affiliate business. The system is designed to provide you with a full catalog of products and keep them updated daily with minimal effort, following the steps below:
1. Find your files: Use the Get Product Feed Offer List API to see available product feeds.
2. Initial Setup: Download the "FULL" data file to populate your database for the first time.
3. Update Links: Replace your existing product links with the product_short link provided in the feed (they can get users faster to open the Shopee app).
4. Daily Maintenance: Use "DELTA" files every day to only download the items that have changed, saving time and bandwidth.

Update on 2024-11-15
1. The Conversion Report API now includes new fields such as netCommission and campaignType, and updates existing fields to provide more detailed commission information.
2. The Validated Report API has also been updated with new fields and modifications to existing fields.
3. Newly added fields are labeled as "New," while deprecated fields are marked as "To Be Removed".

Update on 2024-11-04
Add new fields in ShopOfferV2 API to view seller commission related info.
Add new sort type in ShopOfferV2 API to support query by popular shop.

Update on 2023-08-04
Product Offer V2 API add some fields about Item Info, Shop Info.
Shop Offer V2 API add some fields about Item Info, Shop Info and Offer Status.
Conversion Report API add Item Status; and Validated Report API can return the corresponding billing details by validation id.
All new fields are labeled as "New". All fields to be deprecated are marked as "To Be Removed".

Update on 08/05/2023
Checkout response info will change from one response per checkout ID to multiple responses per checkout ID, this will occur when there are multiple order IDs under the same checkout ID.
Updated/added some fields. Affected fields are labeled as "New".
Some fields will be removed on 2023-08-01. Affected fields are labeled as "To Be Removed".

Update on 2022-12-20
Add new fields to fit the front-end interface optimization in Conversion Report API.

Update on 2022-05-12
Sunset local category fields in Conversion Report API.

Update on 2022-01-30
Provide Get Brand Offer API v2.0.

Update on 2021-08-03
Provide global category fields in Conversion Report API.

Update on 2021-06-15
Provide creative banner info for brand offer, including banner quantity, fileName, imageUrl etc.

Update on 2021-04-19
Provide offerStatus in Shopee/Brand/Product offer.
Support sorting by ending soon in Shopee/Brand offer to sort offers by end time from earliest to latest.
Provide offerUpdates in Shopee/Brand/Product to track all offer status change.

Update on 2021-03-04
Provide Product offer API.
Provide Shop Type in Conversion Report API.

Update on 2021-01-04
Update on Getting Offer list API
Provide detailed commission rates including Web（new/existing) and App（new/existing）commission rate.
If Shop and campaign type of Shopee offer have been set by different categories, Open API will provide category commission rate. But if not, API won't provide that.
Update on Getting Conversion Report
Add Fraud Status.
Add filter option by fraud status which includes unverified/verified/fraud.
Add model id which is the unique id for normal items.
Add promotion id which is the unique id for bundle deal and add on deal items.

(Os links "View details" de cada atualização estavam ocultos e não foram abertos.)
