# API List — Get Short Link

- URL: https://affiliate.shopee.com.br/open_api/list?type=short_link
- Título da aba: Criadores e Afiliados Shopee | Shopee 2026
- Data de atualização: não informada
- Lido em: 10/11/2026
- Nenhum link foi gerado durante a leitura.

---

Get Short Link
Mutation: generateShortLink
ResultType: ShortLinkResult!

Parameters

| Field | Type | Description | Example |
|---|---|---|---|
| originUrl | String! | Original url | https://shopee.com.br/Apple-Iphone-11-128GB-Local-Set-i.52377417.6309028319 |
| subIds | [String] | Sub id in utm content in tracking link, it has five sub ids | ["s1","s2","s3","s4","s5"] |

Result

| Field | Type | Description | Example |
|---|---|---|---|
| shortLink | String! | Short link | |

Example (da documentação, com credenciais fictícias)

curl -X POST 'https://open-api.affiliate.shopee.com.br/graphql' \
-H 'Authorization:SHA256 Credential=123456, Signature=x9bc0bd3ba6c41d98a591976bf95db97a58720a9e6d778845408765c3fafad69d, Timestamp=1577836800' \
-H 'Content-Type: application/json' \
--data-raw '{"query":"mutation{\n generateShortLink(input:{originUrl:"https://shopee.com.br/Apple-Iphone-11-128GB-Local-Set-i.52377417.6309028319",subIds:["s1","s2","s3","s4","s5"]}){\n shortLink\n }\n}"}'
