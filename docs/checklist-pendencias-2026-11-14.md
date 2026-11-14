# Checklist de pendências (consolidado em 2026-11-14)

Motor de perguntas: o dono responde uma por vez; cada resposta vira ação. Atualizado a cada resposta. Black Friday: 27/11.

## A. Em execução (não exige decisão)
| # | Item | Estado |
|---|---|---|
| A1 | Correção do preço da mensagem diferente do site: bloqueio por oscilação (3+ trocas em 24 h) e conferência do link | agente trabalhando |
| A2 | Foto com mão nos jogos | **feito**: 82 de 2.614 rejeitados (commit bde88bd, backup e rollback) |
| A3 | AliExpress, Opção 1 | **feito** (commit 10a2e75) |
| A4 | Loops do Chrome parados desde 16:00 UTC (Chrome não responde) | **depende do dono**: acordar o computador/Chrome |

## B. Prioridade nova do dono (executar depois do que está em andamento)
| # | Item |
|---|---|
| B1 | **Impressão 3D no fluxo de mensagens e na página**: mais impressoras Anycubic Kobra e Bambu Lab (cota diária e prioridade na fila de mensagens, destaque no front, cobertura de coleta dessas marcas) |

## C. Decisões do dono (motor de perguntas, nesta ordem)
| # | Pergunta | Recomendação |
|---|---|---|
| C1 | Jogos de PS4: manter ou tirar também? | manter (ainda vendem novos) |
| C2 | Fotos com sinais de uso (11 consoles): mandar para revisão? | sim, só revisão |
| C3 | Preço da mensagem diferente do site: modelo de aprendizado em modo sombra | sim, só mede |
| C4 | Mensagem neutra N1 para produto sem base (migração 0051 + backup) | sim, com cota baixa |
| C5 | Afrouxar o "modelo fraco" (~154 produtos reais) | sim, marca reconhecida + linha |
| C6 | Reconferência dos 1.899 masters sem oferta ativa no Mercado Livre | sim, por rodízio |
| C7 | Cupom do Mercado Livre: religar a leitura e ler cupom por anúncio (o cupom CUPOMPRAHOME não está no banco; leitura parada desde 12/11) | sim |
| C8 | Segurança do site: cabeçalhos CSP/HSTS e revisão das rotas `/api` | sim, só D1 e D3 |
| C9 | Vitrines vazias (PS5/Switch 2 consoles, PC, colecionáveis, Plus): esconder ou "sem ofertas agora" | esconder |
| C10 | Revisões ambíguas: 34 consoles, 50 jogos tipados como console, 99 itens miúdos | decidir por regra |
| C11 | Verificação visual da home nova (celular e tema escuro): prints ou Playwright | Playwright |
| C12 | Rollout da home nova: 10% em 21/11, 50% em 23/11, 100% em 24/11 | manter o calendário |
| C13 | Busca cruzada por chave forte, GTIN/MPN e decisões de identidade por regra | sim |
| C14 | Revisar em tamanho cheio os lotes de foto com mão classificados só por miniatura (1005, 1809, 2010, 2211) | sim |
| C15 | Erros menores: `cobertura-shopee` (5 falhas em 6 h), `group-messages`, `refresh-snapshots:stats` | investigar |
| C16 | Repouso do computador desativado (loops do Chrome pararam 2h20 e depois não voltaram) | dono faz |

## D. Respostas registradas
Respostas do dono em 2026-11-14 (todas pelo motor de perguntas):
- C1: manter os jogos de PS4 (só o aparelho saiu).
- C2: rejeitar direto as fotos com sinais de uso (feito: 9 masters, motivo `sinal_de_uso`, commit 94a2844).
- C3: modelo de aprendizado em modo sombra.
- C4: mensagem neutra N1 com cota baixa (migração 0051 com backup + flag).
- C5: afrouxar "modelo fraco" para marca reconhecida + linha.
- C6: reconferência por rodízio dos masters sem oferta ativa no Mercado Livre.
- C7: religar a leitura de cupons do ML e ler por anúncio (depende do Chrome).
- C8: segurança D1 (cabeçalhos) e D3 (revisão de /api).
- C9: vitrines vazias completam com Amazon como oferta (24 h, fora da mediana).
- C10: revisões ambíguas decididas por regra, com backup e rollback.
- C11: verificação visual com Playwright.
- C12: **adiantar** o rollout: 10% em 19/11, 50% em 21/11, 100% em 22/11.
- C13: as três (busca cruzada por chave forte, GTIN/MPN, identidade por regra).
- C14: rever em tamanho cheio os 36 itens dos lotes por miniatura.
- C15: investigar `cobertura-shopee`, `group-messages`, `refresh-snapshots:stats`.
- B1: impressão 3D (Kobra e Bambu): cota reservada de mensagens + destaque no front + coleta priorizada.
