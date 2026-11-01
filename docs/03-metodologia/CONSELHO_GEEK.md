# Conselho Geek

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
