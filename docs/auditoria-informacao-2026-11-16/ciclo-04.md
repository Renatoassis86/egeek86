# Ciclo 04: frete, vendedor, links, contadores, comissão, contatos (C09 a C13, C21 a C23, C27)

Método: SQL no banco e leitura (curl, sem aba) das páginas públicas `/`, `/ofertas`, `/black-friday`, `/contatos`, `/monitoramento`.

## Passou
- Frete: 629 cotações, 0 "grátis com custo", 0 prazo invertido, todas com leitura < 48 h. ML sempre CEP 58035090.
- Vendedores: 0 percentuais inválidos, 0 sem apelido, 0 vendas negativas.
- Comissão/"afiliado"/% OFF/"menor preço da internet": 0 ocorrências nas 5 páginas públicas lidas. Telegram/WhatsApp/e-mail só em `/contatos` (a página `/monitoramento` cita "e-mail e Telegram" como recurso, não contato).
- Afiliado: 0 ofertas ativas sem `affiliate_url`; 0 URLs ML fora de domínio esperado.

## Achados

| Id | Sev. | Achado | Evidência | Afetados |
|---|---|---|---|---|
| AUD-19 | MÉDIA | **Link não verificado**: 25.577 de 26.357 ofertas ML ativas (97%), todas as 4.291 Shopee e 2.894 Amazon nunca tiveram `link_verificado_em` (destino = anúncio do preço, #119 cobre só o privado); 1.199 ML com `affiliate_link_pending` (placeholder). Para essas, "Comprar" pode levar a outro anúncio sem prova. | SQL | ~32.700 ofertas |
| AUD-20 | MÉDIA | **Cotações Amazon com CEP diferente**: 48 cotações `amazon_pagina` com CEP 58035000 (o do dono é 58035090); 1 prazo > 60 dias. Frete/prazo só existe para 629 ofertas (impressoras); o resto do site não afirma frete, o que é correto. | SQL | 48 |
| AUD-21 | MÉDIA | **Selo "Queda confirmada" com percentual sobre a média**: em `/ofertas` ("Ofertas do dia: queda confirmada nas últimas 24 h") o crachá "-51%" é "% abaixo da média" (BACK4BLOOD PS5 Shopee R$ 44,90, média R$ 90,96) enquanto a queda real da oferta foi 43% (R$ 79,00 para R$ 44,90). O leitor entende "caiu 51%". É a mesma família do erro "queda de 5% que era Pix". | `/ofertas` HTML x `affiliate_offers.previous_price_cents` (cfb33b27) | classe geral (4 cards do dia + destaques) |
| AUD-22 | BAIXA | Contadores do filtro de `/ofertas` (Jogos 2.030, Consoles 154, Acessórios 456) não reproduzíveis por consulta independente (masters aprovados de games com oferta ativa: jogos 2.607, consoles 115, acessórios 526); a definição de "contado" não está escrita em lugar nenhum. Inconclusivo: precisa do dono da página explicar a regra. | SQL x HTML | n/a |
| AUD-23 | BAIXA | Estoque ("Somente N"): nenhuma página ou mensagem usa; o site já diz "sem garantia de estoque". OK. | grep | 0 |

## Invariantes propostos
- **I-12** Todo botão "Comprar" de oferta visível tem `link_verificado_em` recente ou o card diz "link não conferido".
- **I-13** Crachá percentual em seção de "queda" é queda da própria oferta; "% abaixo da média" em outro rótulo e outra cor.
