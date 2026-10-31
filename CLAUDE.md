@AGENTS.md


# Orquestração de agentes

Arquitetura em `docs/03-metodologia/ARQUITETURA_AGENTES.md`. Instruções completas em `agents/`, subagentes nativos em `.claude/agents/`, skills em `.claude/skills/`.

- Tarefa multidisciplinar: comece pelo agente `geek-lead`.
- Antes de mexer em coleta, catálogo, preço ou imagem: skill `regras-negocio-egeek`.
- Antes de criar tela, gráfico ou imagem: skill `padrao-visual-egeek`.
- Antes de declarar concluído: skill `checklist-publicacao` e agente `qa-verificador`.
- Coleta somente por API oficial (decisão de 2026-10-28). Scraping é proibido; o código existente que o usa é dívida a revisar.
- Benchmarks de portais ficam em `research/benchmarks/` (skill `benchmark-portais`).
