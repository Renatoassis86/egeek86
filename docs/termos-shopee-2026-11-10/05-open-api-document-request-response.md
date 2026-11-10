# Open API Document — Request and Response

- URL: https://affiliate.shopee.com.br/open_api/document?type=request_response
- Título da aba: Criadores e Afiliados Shopee | Shopee 2026
- Data de atualização: não informada
- Lido em: 10/11/2026

---

Request and Response

Request
Open API request need to use the "POST" method, and the content type is application/json,
Endpoint is https://open-api.affiliate.shopee.com.br/graphql and no matter what operation is performed, the endpoint remains the same.

The request format is

{
"query": "...",
"operationName": "...",
"variables": { "myVariable": "someValue", ... }
}

where operationName and variables are optional fields.
Only when there are multiple operations in the query, OperationName is required.

Response
If Open API has received your request, it will return a response with an HTTP Status Code of 200. The data and error information will be returned in JSON format which is

{
"data": { ... },
"errors": [ ... ]
}

If no error occurs, the error information won't be returned.

Error Structure

| Field | Type | Description |
|---|---|---|
| message | String | Error overview |
| path | String | The location of the request in error |
| extensions | object | Error details |
| extensions.code | Int | Error code |
| extensions.message | String | Error description |

Error Codes

| Error code | Meaning | Description |
|---|---|---|
| 10000 | System error | System error |
| 10010 | Request parsing error | Incorrect query syntax, incorrect field type, API does not exist, etc |
| 10020 | Identity authentication error | Signature is incorrect or expired |
| 10030 | Trigger traffic limiting | The number of requests exceeds the threshold |
| 11000 | Business processing error | Business processing error |
