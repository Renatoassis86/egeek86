# Preço da mensagem diferente do preço no site: investigação e plano de aprendizado de máquina (2026-11-14)

Caso do dono: mensagem do Telegram (canal Impressão 3D) com a Bambu Lab P2S Combo a **R$ 8.513,22** ("conferido às 22:58"); a página do Mercado Livre, aberta pelo link, mostrava **R$ 9.399** (de R$ 10.999, 14% OFF).

## O que foi medido
- Mensagem `0be763db` (G2, enviada 02:07 UTC): oferta `955c51c0`, vendedor **NIC.3D** (id ML 549613405), preço 8.513,22, média 10.400,23, **sem revalidação ao vivo** (`live_note` = skipped, `recheck` vazio).
- Histórico de preço dessa oferta: **oscila entre R$ 9.399,00 e R$ 8.513,22 desde 11/11**, em pares separados por **16 a 17 segundos** (ex.: 20:35:30 → 9.399; 20:35:47 → 8.513,22; 22:05:31 → 9.399; 22:05:47 → 8.513,22).
- A API oficial agora: no catálogo da oferta (`MLB72865438`, P2S Combo) **não existe nenhum anúncio a 8.513,22**; o anúncio de R$ 9.399 / R$ 10.999 é do vendedor EGGHOME (é o que o dono viu na tela). O preço **8.513,22 com lista 9.899,10** existe no **outro catálogo** (`MLB63957935`, Combo AMS 2 Pro Prateado), anúncio `MLB7064408358` **do mesmo vendedor NIC.3D**.
- Outra oferta (`93607216`, catálogo Prateado) tem exatamente o mesmo preço e a mesma lista, desde 11/11.
- **94,7% das ofertas ativas do Mercado Livre (21.354 de 22.561) não têm `external_item_id`**: a oferta é identificada só por vendedor + catálogo, não pelo anúncio.

## Causa mais provável (apoiada pelos números acima)
Uma oferta sem identificação do anúncio recebe o preço de **outro anúncio do mesmo vendedor em outro catálogo** (variante/cor diferente). Na mesma rodada de coleta o vendedor aparece nos dois catálogos; o último a gravar vence, e o preço troca de 9.399 para 8.513,22 em 16 s. O link da mensagem leva ao anúncio errado ou a um preço que não é o da cor do cartão. A revalidação ao vivo foi pulada porque a coleta tinha "confirmado" o preço minutos antes, mas a confirmação vinha do anúncio irmão.

Dimensão do problema nas últimas 48 h: **147 ofertas oscilam** entre poucos preços (4 ou mais trocas, diferença de 5% ou mais); 368 têm 4 ou mais trocas; 10 mensagens enviadas saíram de 5 ofertas oscilantes. Divergência de 2% ou mais entre mensagem e rechecagem: 13 de 2.797 mensagens G2 (0,5%), mas só onde a rechecagem existe.

## Correções imediatas propostas (sem modelo)
1. **Bloqueio por oscilação:** oferta com 3 ou mais trocas de preço em 24 h entre poucos valores não vai em mensagem até estabilizar e passar por revalidação ao vivo.
2. **Identificar o anúncio:** gravar `external_item_id` em toda oferta nova e em backfill (a API de catálogo já devolve `item_id`); casar o preço por anúncio, nunca por vendedor.
3. **Revalidação obrigatória** (nunca "pulada") em produto de ticket alto e em oferta de vendedor com mais de um anúncio na mesma família.
4. **Conferir o link:** a mensagem só sai se o anúncio do link (`meli.la`) tem o mesmo `item_id` e o mesmo preço lidos agora.

## Plano de modelo de aprendizado de máquina (para não repetir o erro)
**Objetivo:** estimar, antes de enviar, a chance de o preço da mensagem não bater com o do site (divergência de 2% ou mais), e bloquear acima de um limiar.

- **Rótulo (verdade):** divergência entre o preço da mensagem e o preço lido de novo no anúncio do link (rechecagem ao vivo na API oficial). Ponto de partida: `group_messages.recheck_divergence_pct`; completar com uma amostra de rechecagens ao vivo das mensagens já enviadas (orçamento pequeno de chamadas).
- **Atributos:** nº de trocas de preço em 6/24/48 h, amplitude (máx/mín), nº de anúncios do vendedor na família, `external_item_id` ausente, idade da última confirmação, razão preço/lista, desconto sobre a média, ticket, tipo de vendedor e reputação, rede, categoria, hora do dia, preço da mensagem contra a mediana das lojas.
- **Modelos:** regressão logística (linha de base, explicável) e gradiente de árvores (LightGBM ou similar); escolher pelo melhor recall com precisão aceitável.
- **Treino e teste:** divisão **por tempo** (treina nos dias antigos, testa nos dias novos), nunca aleatória; validação cruzada em janelas; relatório de precisão, recall, curva e matriz de confusão; limiar escolhido para recall alto (barrar erro custa menos que enviar erro).
- **Uso:** o score entra como porta de segurança na fila de mensagens, depois da revalidação ao vivo; mensagem com score alto é retida e vai para revisão. Começar em **modo sombra** (só mede, não bloqueia) por alguns dias.
- **Monitoramento:** taxa de divergência por semana; reaprender quando houver deriva.
- **Dados falsos:** nenhum; o modelo só lê o que já foi coletado.
