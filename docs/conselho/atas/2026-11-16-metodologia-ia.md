# Ata do Conselho Geek: metodologia de desenvolvimento com IA (vibe code disciplinado)

- **Data:** 2026-11-16
- **Porte:** grande (muda como todo o trabalho é feito)
- **Presidente:** geek-lead (síntese feita pela sessão principal)
- **Convocados:** engenheiro de software principal, qa-verificador, arquiteto-next (pareceres independentes e em paralelo)

## Briefing
Pedido do dono: parar de "voltar atrás": corrigir um erro e gerar outros; a IA não sabe o que já está validado; a cadeia fica pela metade (exemplo atual: preço do Telegram ≠ página do link; média some com diagnóstico de compra boa). Quer uma metodologia robusta de código por IA no Claude Code, escrita no Guia Mestre. Regras em jogo: R-59 (nada inacabado), R-63 (todo erro vira regra com gatilho), R-64 a R-67 (QA independente), Fluxo Mestre 13.2.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| Eng. software principal | Falta um ponto que bloqueie a mudança; a mesma grandeza é calculada em vários lugares | `npm run verify` único + hooks do Claude Code + contrato `preco-publicavel` + golden + manifesto de congelados, migração em sombra | quantos dos 120 testes passam; flags reais (FM-02); origem do caso Telegram |
| QA verificador | "Validado" é relato, não artefato; defeito está na emenda entre camadas | invariante de cadeia ponta a ponta (banco → média → página → mensagem → link), definição de pronto executável, correção cirúrgica com escopo-diff | quais `test:*` passam; ambiente de teste |
| Arquiteto Next | A regra existe no papel, não no código; arquivos gigantes sem fronteira imposta | contrato `PrecoExibido` único, lint de formatadores com baseline, manifesto de congelados, estrangulamento de `group-rules.ts` | onde a média é decidida por superfície; se há CI |

## Divergências e réplica
Arquiteto: criar já o contrato `PrecoExibido` (1 a 2 dias). Engenheiro: migrar em sombra, por flag, com teste de paridade como juiz. **Resultado:** sombra e paridade, para proteger o que já está validado. Sem réplica adicional (a divergência era de ritmo, não de objetivo).

## Decisão
1. Entregue hoje (Fase 1, sem mudar o fluxo): `scripts/gate.ts` (`npm run gate`), `scripts/check-frozen.ts` (`npm run congelado`), `docs/validado/` (MODULOS.json com 10 candidatos, descongelar.json, gate.json, linha de base), `METODOLOGIA_IA.md`, Fluxo Mestre seção 15 (R-83 a R-87), pontas #133 a #137, ponteiro no `CLAUDE.md`.
2. Correção dos 2 testes vermelhos que o portão achou (só testes).
3. **Fica para decisão do dono:** Fase 2 (hook de commit, hooks do Claude Code, GitHub Action), primeira onda de congelamento (7 módulos).
4. Fora de propósito: reescrever mensagens de uma vez; limite de linhas retroativo; documentos de controle sem gatilho em código.
- Decisão do responsável do projeto: **pendente** (Fase 2 e congelamento); a Fase 1 foi pedida por ele em 2026-11-16.

## Métrica de sucesso
METODOLOGIA_IA.md, seção 13 (testes vermelhos = 0; 120 de 120 no portão; divergência de preço = 0; retrabalho em 48 h cai 50% em 30 dias). Conferir no relatório de 6 em 6 horas e em 2026-12-16.

## Execução e verificação
- Executor: sessão principal. QA: o portão rápido ficou verde (32/0); a guarda foi testada congelando e violando um módulo de propósito (bloqueou, liberou com descongelamento vigente e foi revertida). QA independente (R-87) do conjunto: pendente.

## Retrospectiva
Pendente (2026-12-16).
