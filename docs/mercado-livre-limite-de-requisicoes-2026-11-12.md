# Mercado Livre: limite de requisições (levantado em 2026-11-12)

Fonte: documentação oficial lida no Chrome do dono (sessão logada), em developers.mercadolibre.com.ar:
- FAQ "Rate Limit / Error 429" (atualizada em 05/05/2026): https://developers.mercadolibre.com.ar/rate-limit-error-429
- "Buenas prácticas para uso de la plataforma": https://developers.mercadolibre.com.ar/es_ar/buenas-practicas-para-uso-de-la-plataforma

## O que a documentação diz
- **Não existe um número global publicado** (nem por hora, nem por dia). O limite é **por endpoint** e é controlado, na maioria dos casos, **por Client ID (a aplicação)**, não por IP nem por usuário. O tamanho da resposta não entra no cálculo.
- **429 Too Many Requests** = excesso de requisições em curto período. Recomendação oficial: backoff exponencial com jitter, reduzir a concorrência, distribuir as chamadas no tempo (evitar picos), não repetir requisições em massa.
- **Paginação por scroll** (`scroll_id`): consumir as páginas dentro do tempo de vida do scroll; scroll aberto por muito tempo ou repetido gera 429. Não misturar `scroll_id` com `offset/limit`.
- Muitos endpoints **não têm multiget grande** (ex.: visitas aceita um único produto por chamada); o ritmo deve ser limitado.
- **Aumento de cota:** para volume legítimo, contatar a equipe de integrações comerciais com evidência de uso (consumo por Client ID).
- Boas práticas: limitar os IPs do ambiente que usam o access token e tratar o 429 espalhando as requisições ao longo do tempo.

## O que isso significa para o Espaço Geek 86
- Não há como calcular a cota exata por documento: ela só se descobre **medindo** (erros 429 por endpoint em `collector_runs`).
- Nosso comportamento já segue o recomendado: freio no primeiro 429, cadência escalonada por loja, limite por execução (240), tetos somados PLUS_ML_HOURLY_CALL_CAP/PLUS_ML_DAILY_CALL_CAP (valores atuais são SUPOSIÇÕES, não oficiais) e backoff.
- Para crescer com segurança: acompanhar 429 por endpoint e, se o volume legítimo pedir, solicitar aumento de cota à equipe de integrações do Mercado Livre com o consumo por Client ID.
