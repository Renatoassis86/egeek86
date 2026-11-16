# Ciclo 01: mensagens enviadas (C01, C02, C04 a C06, C20, C24, C25, C29)

Método: 7.339 mensagens `enviada` dos últimos 7 dias (4.174 no template atual, desde 13/11 03:00 UTC), reanalisadas por `scripts/auditoria-informacao/ciclo01.ts`, `ciclo01b.ts`, `ciclo01c.ts` (somente leitura) mais SQL avulso. Testes: preço do texto x `price_cents_detected`; "% abaixo da média" recalculado; média do texto x `avg_cents`; carimbo "Conferido em" x `live_checked_at`/`sent_at` (BRT); textos proibidos; formato de moeda; coerência dos números das mensagens de plataforma (P1 a P4) com o banco; vendedor/reputação.

## Passou (invariantes que valeram)
- Preço dito = `price_cents_detected` (0 divergências, G2/AC/OK/G3/N1). Formato de moeda correto (0 erros). `% abaixo` recalculado bate (0 em 4.174 do template atual).
- Carimbo "Conferido em" nunca é posterior ao envio e nunca passa de 60 min antes do envio; é sempre anterior ou igual à checagem ao vivo (honesto, conservador). Fuso BRT correto.
- `price_daily_*` usa o dia civil em BRT (167.751 linhas, 0 divergências).
- Reputação do vendedor no texto x hoje: 25 de 2.891 mudaram depois do envio (esperado).

## Achados

| Id | Sev. | Achado | Evidência | Afetados |
|---|---|---|---|---|
| AUD-01 | ALTA | **P1/P3/P5 misturam bases**: a série "menor registrado/menor R$ X em dd/mm" vem de `price_daily_state` (inclui Amazon), mas o "hoje" exclui Amazon (`group-platform.ts` filtra `netKind(o) !== 'amazon'`). Resultado: "menor R$ 49,97 em 12/11 · hoje R$ 130,00" conta uma "movimentação" que não houve (a oferta Amazon de R$ 49,97 continua ativa, o site a mostra como "Menor preço agora"). Mensagem 3536b0a7 (P1 GodFall PS5, 16/11 01:01 UTC). | `ciclo01c.ts`: de 174 mensagens P1 a P5 desde 11/11, 29 têm oferta Amazon ativa MAIS BARATA que o "hoje" dito; em 11 o "menor registrado" é preço Amazon. | 29 mensagens (17%) |
| AUD-02 | ALTA | **Mensagens já publicadas com preço depois marcado como isca (R-61)**: o gatilho nasceu em 16/11 00:37; o que saiu antes ficou. | cruzamento `group_messages` x `preco_isca_marcas` (preço igual, marca ativa): P4 5, G4 5, AC 4, P1 4, G3 4, P3 4, G5 2, P2 2 = 30 mensagens (9 com razão < 0,40). Ex.: AC f5b7c358 (alto-falante Intelbras a R$ 400, mediana ~R$ 750), P1 9e20d456 (RE Requiem PS5, "menor R$ 134,99", razão 0,35). | 30 mensagens; Telegram NÃO apagado (ordem do dono) |
| AUD-03 | MÉDIA | **"Novo no monitoramento" repetido**: 786 de 1.622 AC (48%) repetem uma oferta já anunciada no MESMO grupo (a cada 24 a 48 h; máximo 3 vezes em 3 dias, ex.: Bola Vôlei Diadora a7106c45, Mala Duffel c6c18c5a); 94% das ofertas foram criadas há mais de 24 h (52% há mais de 72 h). A frase "Novo" é falsa para essas. | SQL no fim deste arquivo | 786 mensagens |
| AUD-04 | MÉDIA | **Texto com "% abaixo da média" sem 5 ofertas (R-19)**: G2/OK com "X% abaixo da média das lojas (R$ Y)" quando o dia anterior tinha 4 ou menos ofertas na média (249 de 1.636 textos com média/%; 88 também têm menos de 5 nativas hoje). Obs.: o dono aceitou "média provisória" na beta (2026-11-16) para o diagnóstico; falta decisão explícita se vale para mensagem pública. | `ciclo02b.ts` | 249 mensagens |
| AUD-05 | MÉDIA | **"mais de 25687 mil vendas"**: `sellerLine` faz `floor(n/1000)` sem tratar milhões; 11 vendedores têm >= 1 milhão de vendas (máx. 25,7 milhões, provável total errado/loja oficial). Texto ilegível e número duvidoso. | `group-messages.ts:931`; 22 AC desde 13/11 | 22 mensagens; 11 vendedores |
| AUD-06 | BAIXA | Mensagem com "14 dias" e "15 dias" no mesmo texto ("Menor preço dos últimos 14 dias" + "Mínimo/Máximo (últimos 15 dias)"). | 31 G2/OK desde 13/11 | 31 |
| AUD-07 | BAIXA | 18 mensagens (0,4%) saíram sem `live_checked_at` (R-22 pede reconferência); 12 com preço vivo > 2% diferente do dito (todas P2, cuja `offer_id` é a mais cara do par). 3 G2 dizem "Menor preço dos últimos 14 dias" havendo mínimo menor no estado (R$ 316,15 x R$ 322,91). | `ciclo01b.ts`, `ciclo02b.ts` | 18 + 3 |
| AUD-08 | BAIXA | Mensagens com texto hoje proibido, publicadas ANTES das proibições (11 e 12/11): "(Brasília)" 292, "amostra" 223, "Cupom do anúncio" 79. Zero desde 13/11. Só listar; sem ação. | SQL por dia | 594 históricas |
| AUD-09 | BAIXA | P2 "Mesmo produto, preços diferentes entre lojas": `offer_id`/`price_cents_detected` da mensagem referem-se a UMA das duas lojas; auditorias automáticas que comparam preço x oferta geram falso positivo (12 casos). Sem erro ao leitor. | `ciclo01b.ts` S3 | n/a |

## Invariantes propostos (ciclo 01)
- **I-01** Em mensagem de plataforma, "hoje" e "menor registrado" usam o MESMO conjunto de redes; se o conjunto exclui uma rede, a série também exclui.
- **I-02** Nenhuma mensagem enviada tem preço marcado em `preco_isca_marcas` (medidor diário; hoje retroativo = 30).
- **I-03** "Novo no monitoramento" só uma vez por (oferta, loja de grupo) em toda a vida; ou trocar o rótulo para "De volta/Em oferta".
- **I-04** Texto com "%" exige >= 5 ofertas na média no dia do envio (R-19) ou decisão do dono por escrito.
- **I-05** `sellerLine` nunca emite "N mil" com N >= 1000.

## SQL de reprodução (AUD-03)
```sql
SELECT count(*) n, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM group_messages m2 WHERE m2.offer_id=m.offer_id AND m2.trigger='AC' AND m2.status='enviada' AND m2.sent_at<m.sent_at AND m2.store_id IS NOT DISTINCT FROM m.store_id)) repetido
FROM group_messages m WHERE m.trigger='AC' AND m.status='enviada' AND m.sent_at>='2026-11-13T03:00Z';
```
