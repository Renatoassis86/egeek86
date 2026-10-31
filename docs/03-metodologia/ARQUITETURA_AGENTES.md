# Arquitetura de Agentes Especializados, Espaço Geek 86

Adaptada da arquitetura do projeto dieese/conjuntura (2026-10-28).

## 0. Natureza

Agentes são **papéis**, não memória. A fonte de verdade, nesta ordem: `AGENTS.md`/`CLAUDE.md`, `docs/PROJECT_BLUEPRINT.md`, documentação versionada, banco de produção. O que um agente produz de permanente é registrado no repositório. Em conflito, prevalece a documentação.

## 1. Camadas

| Camada | Local | Função |
|---|---|---|
| Regras | `AGENTS.md`, `CLAUDE.md` | Regras inegociáveis e protocolo |
| Instrução completa | `agents/*.md` | Missão, leitura obrigatória, procedimento, limites |
| Subagente nativo | `.claude/agents/*.md` | Arquivo curto com frontmatter, aponta para `agents/` |
| Skill | `.claude/skills/*/SKILL.md` | Padrões já decididos, em checklist |
| Conhecimento | `research/benchmarks/` | Fichas, prints e panorama |

Mudança de conteúdo substantivo é feita em `agents/`, nunca em `.claude/agents/`.

## 2. Papéis

```
                         GEEK-LEAD
   ┌────────────┬─────────────┬──────────────┬─────────────┬───────────┐
  DADOS       PRODUTO      ENGENHARIA     CONTEÚDO      DATAVIZ
 engenheiro-  key-user-    arquiteto-     designer-     bi-dataviz
 coleta       gamer        next           marca
 guardiao-    pesquisador- engenheiro-    editor-
 catalogo     benchmark    frontend       noticias
 cientista-                seguranca-db
 precos                    qa-verificador
```

Coordenação lógica, não hierarquia rígida: especialistas trocam informação direto. O `qa-verificador` é passagem obrigatória antes de concluir.

## 3. Fluxos típicos

- **Nova fonte de ofertas:** engenheiro-coleta, guardiao-catalogo, cientista-precos, qa-verificador.
- **Nova tela ou gráfico:** key-user-gamer (necessidade), pesquisador-benchmark (referência), bi-dataviz, engenheiro-frontend, designer-marca, qa-verificador.
- **Novo indicador:** cientista-precos, bi-dataviz, `modelo-indicadores.md`, qa-verificador.
- **Matéria:** editor-noticias, cientista-precos (dados), designer-marca (capa).

## 4. Princípios

1. Nenhum agente cria dado fake ou sintético.
2. Nenhum agente altera escopo sozinho nem reabre decisão tomada (ex.: só API oficial).
3. Hipótese nunca é apresentada como fato.
4. Operação destrutiva exige autorização explícita.
5. Decisão estrutural vira ADR em `docs/08-decisoes-adr/`.

## 5. Conflitos

Divergência entre agentes é registrada, não escondida. O `geek-lead` reconcilia e, se a decisão for de negócio, leva ao responsável do projeto.
