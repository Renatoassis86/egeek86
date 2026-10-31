# ADR 0003: Gamificação com XP e Geek Coins

Status: aprovada pelo dono em 2026-10-31. Implementação pendente.

## Decisões do dono
1. XP e Coins são separados.
2. Resgate na Fase 1 é só benefício sem dinheiro (sem cupom).
3. Teto de 100 Coins por dia por usuário e a tabela de ganhos abaixo estão aprovados.
4. Coins não expiram.

## Princípios
- **XP**: acumulado na vida toda, nunca diminui. Define o nível.
- **Coins**: saldo gastável. Sobe com ganhos; desce com resgates e penalidades.
- Fonte única: `points_ledger`. Chave de idempotência (usuário + ação + referência) impede pagar o mesmo ato duas vezes. `profiles.geek_points` é só cache do saldo de Coins.
- Começa do zero na data de lançamento. Nenhum nível, XP ou conquista pode ser exibido sem lançamento real no ledger (regra de dado real).
- Só e-mail verificado ganha. Autovoto não paga. A moderação pode estornar com lançamento negativo.

## Ganhos
| Ação | Coins | XP | Limite |
|---|---|---|---|
| Cadastro completo (e-mail verificado) | 50 | 50 | uma vez |
| Onboarding de colecionador | 100 | 100 | uma vez |
| Acompanhar preço de um jogo novo | 5 | 5 | só a 1ª vez por produto; máx. 3 por dia |
| Voto de curadoria | 10 | 10 | máx. 10 por dia |
| Voto que bate com a decisão final | 50 | 50 | ao fechar a curadoria |
| Reportar preço errado, confirmado pela moderação | 30 | 30 | só após confirmação |
| Semana ativa (ao menos 1 ação) | 10 | 10 | 1 por semana |

Teto diário: 100 Coins por usuário (XP segue o mesmo teto das ações).

## Níveis (por XP)
| Nível | XP | Libera |
|---|---|---|
| Novato | 0 | acompanhar até 20 jogos |
| Explorador | 200 | voto oficial na curadoria |
| Caçador | 1.000 | acompanhar até 50 jogos |
| Curador | 3.000 | propor correção de catálogo |
| Lenda | 8.000 | selo no perfil e acesso antecipado |

## Resgate (Fase 1)
Coins compram só benefícios próprios: vagas extras de acompanhamento, selo e moldura de perfil, acesso antecipado. Sem cupom e sem conversão em dinheiro. A regra antiga "100 pontos = R$ 1,00" é removida do código e dos textos até a Fase 2 (cupom, só com parceiro que banque o desconto e validação jurídica).

## Penalidade
Fraude subtrai Coins (não XP), suspende o voto oficial por 30 dias e fica registrada no ledger com motivo. A penalidade antiga de 500 pontos "(XP)" é substituída por isso.

## Implementação (pendente)
1. Função única `awardCoins(userId, action, refId)` com idempotência, teto diário e XP; substitui os valores soltos em `src/server/actions/curation.ts` e `collector.ts`.
2. Migração: coluna de XP em `profiles` (ou derivada do ledger), tipo de ação e chave única no `points_ledger`.
3. Telas de conta e hype-zone leem do ledger; sem dado fixo.
4. Remover o resgate em cupom (`curation.ts`, `points-rewards-card.tsx`, textos em `/hype-zone/curadoria`) e trocar por catálogo de benefícios.
