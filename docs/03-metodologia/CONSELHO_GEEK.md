# Conselho Geek

**Versão 2026-11-15** (anterior: 2026-10-31). O que mudou está no bloco "Atualizado em 2026-11-15" no fim deste documento.

O **Conselho Geek** é a mesa de especialistas que opina antes de qualquer coisa ir ao ar. Cada membro é um **perfil de competência** (nível de doutorado na área) com método próprio, perguntas fixas e linhas vermelhas. **Não são pessoas reais**, e os pareceres são recomendações: quem decide é o responsável do projeto (Renato).

## Regra de ouro
Nada passa sem o parecer do conselho. O que muda é a profundidade, conforme o tamanho da tarefa.

| Porte | Exemplos | Rito |
|---|---|---|
| **Leve** | ajuste de texto, bug evidente, cor, correção pontual | Consulta rápida: o `geek-lead` aciona 1 a 3 membros relevantes, resposta curta, ata de uma linha |
| **Médio** | nova tela, novo indicador, mudança de coleta, nova regra de catálogo | Reunião completa: mesa fixa + membros do tema, parecer escrito, ata |
| **Grande** | nova categoria (tecnologia/eletro), mudança de modelo de negócio, mudança em dado de produção, deploy com risco | Reunião completa + réplica entre divergentes + decisão do responsável + ata + ADR |

## Composição
- **Presidente:** `geek-lead` (convoca, conduz, sintetiza, registra, garante as regras inegociáveis).
- **Mesa fixa (médio e grande):** `estrategista-mercado`, `especialista-precos`, `gamer-veterano`, `qa-verificador`.
- **Membros por tema:** ver matriz abaixo.
- **Execução:** os agentes operacionais já existentes (coleta, catálogo, arquitetura, frontend, marca, dataviz, notícias, benchmark, segurança, QA). O conselho opina; a execução só começa com a decisão registrada.

### Membros do conselho
- `gamer-veterano`: Gamer Veterano e Curador de Cultura Gamer
- `especialista-precos`: Especialista em Inteligência e Comparação de Preços
- `estatistico-senior`: Estatístico Sênior (Inferência e Séries Temporais)
- `matematico-aplicado`: Matemático Aplicado (Índices, Otimização e Ranking)
- `produtor-gamer-mundial`: Produtor Executivo da Indústria Mundial de Games
- `cientista-dados-tempo-real`: Cientista de Dados de Monitoramento em Tempo Real
- `estrategista-mercado`: Estrategista de Mercado e Crescimento do Hub
- `engenheiro-backend`: Engenheiro Backend Principal
- `engenheiro-infra-sre`: Engenheiro de Infraestrutura, DevOps e SRE
- `integrador-apis`: Integrador de APIs e Parcerias Técnicas
- `dba-postgres`: DBA e Engenheiro de Dados Postgres
- `engenheiro-performance-web`: Engenheiro de Performance Web
- `engenheiro-software-principal`: Engenheiro de Software Principal (Full-stack, Código e Testes)

### Matriz de tema, quem opina
| Tema | Opinam (além da mesa fixa) |
|---|---|
| Preço, média, selo, veredicto, indicador | estatistico-senior, matematico-aplicado, cientista-precos |
| Coleta, frescor, cota de API, volume, performance de leitura | cientista-dados-tempo-real, engenheiro-coleta, arquiteto-next |
| Catálogo, dedup, plataforma, tipo, segmentação | guardiao-catalogo, gamer-veterano, matematico-aplicado |
| Busca e resultados | gamer-veterano, especialista-precos, key-user-gamer, pesquisador-benchmark, engenheiro-frontend |
| Tela, layout, gráfico, imagem | key-user-gamer, designer-marca, bi-dataviz, engenheiro-frontend |
| Conteúdo e notícia | editor-noticias, gamer-veterano, produtor-gamer-mundial |
| Parcerias, calendário, lançamentos, creators | produtor-gamer-mundial, estrategista-mercado |
| Nova categoria (tecnologia, eletro) | estrategista-mercado, especialista-precos, guardiao-catalogo, cientista-dados-tempo-real |
| Segurança, segredos, banco, deploy | seguranca-db, arquiteto-next, qa-verificador |

## Como a reunião acontece
1. **Triagem** (geek-lead): classifica o porte e escreve o **briefing** de uma página: objetivo, contexto, restrições, regras inegociáveis em jogo, a pergunta a decidir.
2. **Rodada 1, pareceres independentes** (em paralelo): cada membro convocado responde no formato fixo (posição, leitura, riscos, recomendação, dado que falta, métrica). Sem ver a resposta dos outros, para não haver contaminação.
3. **Síntese** (geek-lead): consolida pontos de acordo e de divergência.
4. **Rodada 2, réplica** (só se houver divergência relevante): os membros opostos recebem o argumento um do outro e respondem uma vez.
5. **Decisão:** o geek-lead propõe o plano (ordem, responsáveis, métrica de sucesso, o que fica de fora). Decisão de negócio ou de risco vai ao responsável com recomendação clara e uma pergunta por vez.
6. **Ata:** registrada em `docs/conselho/atas/AAAA-MM-DD-tema.md` (modelo em `docs/conselho/ATA_MODELO.md`). Decisão estrutural vira ADR em `docs/08-decisoes-adr/`.
7. **Execução** pelos agentes operacionais, com as restrições da ata.
8. **Verificação:** `qa-verificador` e skill `checklist-publicacao` antes de declarar concluído.
9. **Retrospectiva:** depois de entrar no ar, a métrica de sucesso é conferida e registrada na ata.

## Poderes e limites
- O conselho é **consultivo**. Quem decide é o responsável do projeto.
- **Veto técnico** só em violação de regra inegociável (dado fake, duplicata de produto/imagem, scraping, operação destrutiva sem autorização, segredo exposto). `qa-verificador` e `seguranca-db` podem bloquear o "concluído".
- Divergência é registrada na ata, não escondida.
- Hipótese não vira fato; número sem fonte não entra em parecer.
- Os membros são perfis de IA. Referências citadas são literatura e método, não endosso de pessoas reais.

## Fluxo de trabalho com o responsável
Pedido do responsável, triagem do geek-lead, reunião, decisão, execução, verificação, entrega. Quando o pedido for urgente e leve, a consulta rápida roda no mesmo turno e a ata fica de uma linha.

---

## Atualizado em 2026-11-15

Ata: `docs/conselho/atas/2026-11-15-auditoria-geral.md`. Auditoria: `docs/auditoria-2026-11-15/00-sintese.md`.

**O que mudou desde 2026-10-31**
1. **Painéis de auditoria por tema.** Além da reunião por tarefa, o presidente pode abrir uma auditoria geral com painéis paralelos e uma síntese. A de 15/11 teve quatro painéis: (1) pedidos do dono atendidos e mudanças causadas (qa-verificador, guardiao-catalogo, gamer-veterano); (2) vulnerabilidades no contexto do negócio (seguranca-db, engenheiro-infra-sre, engenheiro-backend); (3) modelo de negócio, eficácia e efetividade (estrategista-mercado, cientista-precos, especialista-precos, estatistico-senior, pesquisador-benchmark, key-user-gamer, produtor-gamer-mundial, designer-marca); (4) eficiência técnica (engenheiro-software-principal, arquiteto-next, engenheiro-performance-web, engenheiro-coleta, dba-postgres, integrador-apis, bi-dataviz). Regra dos painéis: somente leitura, número só com fonte, hipótese marcada, NÃO VERIFICADO quando não deu para provar.
2. **Membros.** A lista de perfis vive em `agents/` (28 arquivos em 15/11); a seção "Membros do conselho" acima cita só os de pareceres, e a matriz de temas segue válida. Quem opina em eficiência técnica, coleta e banco inclui `dba-postgres`, `engenheiro-performance-web` e `engenheiro-software-principal`.
3. **Rotina permanente de auditoria de cobertura por produto (fila #57).** Cada produto que o dono manda (print do concorrente, link, nome) vira um caso: está ou não no monitoramento, por quê, colocar no fluxo e corrigir a causa geral para itens parecidos. Registro em `docs/inventario-itens-concorrente.md`. Barreira nova só com aval do dono.
4. **Pedido novo vai para a lista (regra de 2026-11-15).** O pedido do dono entra em `docs/fila-de-execucao.md` com prioridade e não interrompe o que está em andamento, salvo "urgente". Nada fica inacabado: tarefa só sai da fila com critério de pronto verificável.
5. **Relatórios de 6 em 6 horas e vigia.** O responsável pela operação emite um relatório a cada 6 horas (loops, cupons, coleta, mensagens, fila) e o vigia a cada 5 minutos reinjeta laços, reabre abas e encerra transações presas (regra "nenhum loop pode parar"). Ainda não há arquivo de relatório no repositório (NÃO VERIFICADO onde vive); fila #110 versiona.
6. **Ata semanal.** Toda semana uma ata resume decisões, divergências e perguntas ao dono, mesmo sem reunião nova. Motivo: em 15/11 não havia ata desde 13/11 apesar de 102 commits, contrariando a regra de que toda tarefa passa pelo Conselho. Atas de 14 e 15/11 pendentes (fila #104). Porte da ata para tarefa leve: uma linha.
7. **Dono das decisões.** Persistem: o conselho é consultivo; decisão de negócio e de risco é do dono, com uma pergunta por vez. Itens que dependem de credencial ou painel dele ficam marcados "DEPENDE DO DONO" na fila e na ata.

**Mudança no rito.** A ata passa a ter, quando houver auditoria, as seções "O que fica de fora" e "Perguntas ao dono" (modelo em `docs/conselho/ATA_MODELO.md` continua válido; as seções entram como extras).

