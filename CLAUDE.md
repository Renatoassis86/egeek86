@AGENTS.md


# Orquestração de agentes

Arquitetura em `docs/03-metodologia/ARQUITETURA_AGENTES.md`. Instruções completas em `agents/`, subagentes nativos em `.claude/agents/`, skills em `.claude/skills/`.

- **Conselho Geek (regra desde 2026-10-31):** toda tarefa nova passa pelo conselho antes de executar. Comece pelo `geek-lead` (presidente) e siga a skill `reuniao-conselho` (`docs/03-metodologia/CONSELHO_GEEK.md`): triagem de porte, pareceres independentes dos especialistas, decisão, ata em `docs/conselho/atas/`, execução e QA. O conselho é consultivo; decisão de negócio é do responsável.
- **Fluxo Mestre (lei de convivência dos processos, desde 2026-11-12):** `docs/03-metodologia/FLUXO_MESTRE.md` liga coleta, catálogo, preço, mensagens, front e governança (nós, filas, precedência, regras R-xx, pontas soltas); leia antes de mudar cadência, cota, flag, coleta, preço ou mensagem e atualize-o no mesmo commit; tarefas derivadas em `docs/fila-de-execucao.md`.
- Tarefa multidisciplinar: comece pelo agente `geek-lead`.
- Antes de mexer em coleta, catálogo, preço ou imagem: skill `regras-negocio-egeek`.
- Antes de criar tela, gráfico ou imagem: skill `padrao-visual-egeek`.
- Antes de declarar concluído: skill `checklist-publicacao` e agente `qa-verificador`.
- **Fontes de coleta (corrigido em 2026-11-15):** o padrão é API oficial no servidor (Mercado Livre, Shopee). A **coleta assistida** na aba logada do próprio dono (Amazon, cupons, links meli.la) é exceção autorizada por ele desde 2026-11-10 (ADR 0009, `FLUXO_MESTRE.md` R-02): fila curta, pausa aleatória, recuo em captcha/login/403/429, nunca raspagem em massa nem contorno de proteção. Raspagem fora disso continua proibida; o código antigo que a usa é dívida (`docs/divida-coleta-sem-api-oficial.md`). A decisão de 2026-10-28 ("somente API oficial") foi superada nesse ponto; o risco de política da Amazon está registrado (auditoria 2026-11-15, A6, fila #95).
- Inventário do catálogo por loja (Games, Impressão 3D, Tecnologia, Livros, Casa, Eletrônicos, Esporte): vive em `/admin/catalogo` (ao vivo, com histórico diário) e em `docs/inventario-catalogo/` (retrato + CSV por loja, gerado por `scripts/gerar-inventario-catalogo.ts`); consultar e atualizar quando lojas, produtos ou fontes mudarem.
- Benchmarks de portais ficam em `research/benchmarks/` (skill `benchmark-portais`).

## Regras inegociáveis vigentes do dono (consolidadas em 2026-11-15; íntegra na memória do projeto e em `FLUXO_MESTRE.md`)
- **Só produto novo e em linha.** Retrô, usado e fora de linha (inclui Xbox One e PS4 console) ficam fora. A única restrição de entrada é usado/retrô; **barreira nova só com aval explícito do dono**. Grupos só de produtos iguais; indicadores não mudam de estrutura.
- **Console é só videogame**: motores, frontais, bases, adesivos e acessórios nunca entram em Consoles. **Sem itens miúdos** (peças, cabos, grips, objetos impressos em 3D, itens de baixo valor) no banco e no site.
- **Foto real do produto, nunca imagem gerada por IA.** Foto com mão decide **por oferta**, e só mão real (arte de caixa não conta): a oferta sai das médias, do selo e do histórico; o master volta.
- **Frescor:** oferta de ML e Shopee só é clicável com preço confirmado nas últimas 24 h ("visto há X" após 6 h); a série usa 7 dias. **Sem teto de queda de 50%.** **Vendedor fraco** continua visível e fica fora só da média. Preço implausível (<35% ou >300% da mediana) vai para quarentena.
- **Comissão prevista só no `/admin`**; nunca em página pública, mensagem ou API pública. Aviso de comissão foi retirado das telas de compra por decisão do dono (risco regulatório e de política das redes registrado; mitigação proposta na fila #74, depende dele).
- **Contatos (Telegram/WhatsApp) só em `/contatos`**; mensagens sem termos proibidos ("amostra", "metodologia", "(Brasília)"); cards v2 de mensagem ligados por flag.
- **Nenhum loop pode parar.** Erro, rede, 429, login e captcha viram pausa com recuo e retomada; aba fechada o vigia reabre. Relatório de 6 em 6 horas e vigia a cada 5 min.
- **Pedido novo do dono vai para a lista (`docs/fila-de-execucao.md`) sem parar o que está em andamento; nada fica inacabado.** Só fura a fila se o dono disser "urgente".
- **Aprovação ampla é permitida quando reversível:** dry-run por padrão, backup NDJSON e log em `docs/backups/`, `--rollback`.
- **Cada produto que o dono envia vira auditoria de cobertura** (`docs/inventario-itens-concorrente.md`): por que está ou não no monitoramento, colocar e corrigir a causa geral.
- Nunca imprimir ou versionar segredos. Commit só dos próprios arquivos (`git add` explícito); nunca `git add -A` (índice compartilhado entre agentes).

> **Atualizado em 2026-11-15** (auditoria geral, `docs/auditoria-2026-11-15/00-sintese.md`): (1) corrigida a linha de coleta, que contradizia a coleta assistida; (2) registradas as regras acima, antes espalhadas na memória do dono; (3) registrada a regra "pedido novo vai para a lista". Retrato do negócio: `README.md` e `docs/PROJECT_BLUEPRINT.md`.

