@AGENTS.md


# Orquestração de agentes

Arquitetura em `docs/03-metodologia/ARQUITETURA_AGENTES.md`. Instruções completas em `agents/`, subagentes nativos em `.claude/agents/`, skills em `.claude/skills/`.

- **Conselho Geek (regra desde 2026-10-31):** toda tarefa nova passa pelo conselho antes de executar. Comece pelo `geek-lead` (presidente) e siga a skill `reuniao-conselho` (`docs/03-metodologia/CONSELHO_GEEK.md`): triagem de porte, pareceres independentes dos especialistas, decisão, ata em `docs/conselho/atas/`, execução e QA. O conselho é consultivo; decisão de negócio é do responsável.
- **Fluxo Mestre (lei de convivência dos processos, desde 2026-11-12):** `docs/03-metodologia/FLUXO_MESTRE.md` liga coleta, catálogo, preço, mensagens, front e governança (nós, filas, precedência, regras R-xx, pontas soltas); leia antes de mudar cadência, cota, flag, coleta, preço ou mensagem e atualize-o no mesmo commit; tarefas derivadas em `docs/fila-de-execucao.md`.
- Tarefa multidisciplinar: comece pelo agente `geek-lead`.
- Antes de mexer em coleta, catálogo, preço ou imagem: skill `regras-negocio-egeek`.
- Antes de criar tela, gráfico ou imagem: skill `padrao-visual-egeek`.
- Antes de declarar concluído: skill `checklist-publicacao` e agente `qa-verificador`.
- Coleta somente por API oficial (decisão de 2026-10-28). Scraping é proibido; o código existente que o usa é dívida a revisar.
- Inventário do catálogo por loja (Games, Impressão 3D, Tecnologia, Livros, Casa, Eletrônicos, Esporte): vive em `/admin/catalogo` (ao vivo, com histórico diário) e em `docs/inventario-catalogo/` (retrato + CSV por loja, gerado por `scripts/gerar-inventario-catalogo.ts`); consultar e atualizar quando lojas, produtos ou fontes mudarem.
- Benchmarks de portais ficam em `research/benchmarks/` (skill `benchmark-portais`).
