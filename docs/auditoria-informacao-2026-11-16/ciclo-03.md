# Ciclo 03: identidade, condição, categoria, foto (C14 a C19)

Método: banco inteiro (33.542 ofertas ativas, 7.070 masters aprovados no `catalogGate`). Regex de condição em títulos, spread de preço por master, `catalogGate`, imagens.

## Passou
- Itens com `catalogGate = rejected` (3.088 ofertas) estão fora da vitrine; 63 ofertas Shopee "desbloqueado/Tinfoil" (Switch modificado) estão em quarentena. Zero "usado/seminovo/recondicionado" ativo e visível em ML; os 3 "usado" da Amazon eram falso positivo (OUSADA, Crusader).
- Spread: de 2.600 masters com >= 3 ofertas na média, 0 têm máximo >= 3 x mediana (a faixa R-20 funciona); 1 com mínimo <= 1/3 da mediana.
- Foto: 0 URL não https; imagens iguais em masters diferentes são 84 (170 masters), quase todas variações legítimas (iPhone 128/256/512 GB, edições do mesmo jogo).

## Achados

| Id | Sev. | Achado | Evidência | Afetados |
|---|---|---|---|---|
| AUD-14 | ALTA | **Open Box, vitrine e "Outlet" aprovados e visíveis (R-10/R-12)**: 10 ofertas Shopee com gate `approved`, sem quarentena e dentro da média: "PS5 DE VITRINE" R$ 4.530 (f82777d5), "Xbox Series S Modelo Vitrine" R$ 2.999 (c6621ec8), "Resident Evil Village ... Open Box" (a743ae96), e 7 "Outlet" (PS5 Slim Digital R$ 4.599 3ccf2249, PS5 Wolverine R$ 5.399,99 0c1d3e38, Switch Lite R$ 1.499,99 aec17bac e R$ 1.799,99 d0307a55, três jogos). O PS5 Wolverine "Outlet" entrou numa mensagem P2 enviada (9d325104, 12/11, "R$ 5.399,99 na Shopee", comparado ao ML R$ 3.895). Condição "outlet" não é prova de novo: pela R-11 dúvida fica fora. | `ciclo03` SQL | 10 ofertas, 1 mensagem |
| AUD-15 | MÉDIA | **Retrô/clone aprovado**: "Mini Game Retrô Portátil Nintendo 400 Jogos" (f7a22730, R$ 54,99) e "Vídeo Game stick Retrô PS2 Nintendo Atari" (ac5822bf, R$ 171) ativos e aprovados (R-10: retrô fora, exceto Hyperkin/Analogue/Retro-Bit/8BitDo). Além de 2 ML "desbloqueado" não encontrados hoje (0). | SQL | 2 ofertas |
| AUD-16 | MÉDIA | **Itens miúdos aprovados (R-50)**: ~8 acessórios de baixo valor com gate `approved` e visíveis: adaptador Joy-Con Grip R$ 23,90 (1ab7cd72), "Joy-Con Grip Conect" R$ 32,90 (0e9d3e8c), volantes Joy-Con grip R$ 42,90 a 76,63 (2f7c1a79, 9481311d, ec453566, 41faf4bc, c3f44c69). Controles com grip e luvas/bicicletas com "Grip" são falsos positivos legítimos. | SQL | ~8 ofertas |
| AUD-17 | BAIXA | 172 ofertas ativas sem `image_url` (171 ML games, 132 com master também sem imagem). O card fica sem foto real. | SQL | 172 |
| AUD-18 | BAIXA | Vendedores com reputação velha: 647 de 12.037 (5%) sem refresh há > 30 dias; 46 mensagens sem o apelido do vendedor no texto (provável escape de caractere). | SQL | 647 / 46 |

## Invariantes propostos (ciclo 03)
- **I-10** Título com `open box|vitrine|outlet|mostruário|retrô|desbloqueado` nunca em oferta ativa fora de quarentena (regra automática no ingest, não só no gate do master).
- **I-11** Oferta ativa e visível tem imagem própria ou herda a do master; contador diário de ofertas visíveis sem foto = 0.

## SQL (AUD-14)
```sql
SELECT o.id, left(o.title,60), coalesce(mp.attributes->'catalogGate'->>'verdict','-') FROM affiliate_offers o JOIN master_products mp ON mp.id=o.master_product_id
WHERE o.status='active' AND o.quarantined_at IS NULL AND o.title ~* '(outlet|open ?box|vitrine)' AND o.title !~* 'ousada|crusader';
```
