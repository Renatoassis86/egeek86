@AGENTS.md


# Orquestração de agentes

Arquitetura em `docs/03-metodologia/ARQUITETURA_AGENTES.md`. Instruções completas em `agents/`, subagentes nativos em `.claude/agents/`, skills em `.claude/skills/`.

- **Conselho Geek (regra desde 2026-10-31):** toda tarefa nova passa pelo conselho antes de executar. Comece pelo `geek-lead` (presidente) e siga a skill `reuniao-conselho` (`docs/03-metodologia/CONSELHO_GEEK.md`): triagem de porte, pareceres independentes dos especialistas, decisão, ata em `docs/conselho/atas/`, execução e QA. O conselho é consultivo; decisão de negócio é do responsável.
- **Fluxo Mestre (lei de convivência dos processos, desde 2026-11-12):** `docs/03-metodologia/FLUXO_MESTRE.md` liga coleta, catálogo, preço, mensagens, front e governança (nós, filas, precedência, regras R-xx, pontas soltas); leia antes de mudar cadência, cota, flag, coleta, preço ou mensagem e atualize-o no mesmo commit; tarefas derivadas em `docs/fila-de-execucao.md`.
- **Metodologia de desenvolvimento com IA (desde 2026-11-16, R-83 a R-87):** `docs/03-metodologia/METODOLOGIA_IA.md` é lida **antes de tocar em `src/`, `scripts/` ou `public/loops/`**. Em resumo: abra com o Contrato de Tarefa (arquivos permitidos, módulos, consumidores, teste vermelho, fora de escopo); rode `npm run congelado` para ver o que já está validado e quem consome; corrija com teste que falha primeiro e mudança mínima; **`npm run gate` verde antes de todo commit** (`--completo` antes de deploy); módulo `congelado` só muda com descongelamento do dono (`docs/validado/descongelar.json`); a cadeia a jusante fica verde ou vira ponta solta com número na fila; teste existente só muda em commit separado com justificativa; quem implementa não valida.
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
- **Frescor (substituído em 2026-11-17, R-90 e fila #149):** o banco é de anúncios ativos; **a idade da leitura nunca tira oferta do ar**, só o status do link (pausada, expirada, sem estoque, sem venda). `OFFER_FRESHNESS_DAYS` = 365 e **Amazon igual às outras lojas** (sem regra própria). O preço dito em **mensagem** da Amazon segue R-81 (leitura de até 45 min) até o dono mandar mudar. **Sem teto de queda de 50%.** **Vendedor fraco** continua visível e fica fora só da média. Preço implausível (<35% ou >300% da mediana) vai para quarentena.
- **Comissão prevista só no `/admin`**; nunca em página pública, mensagem ou API pública. Aviso de comissão foi retirado das telas de compra por decisão do dono (risco regulatório e de política das redes registrado; mitigação proposta na fila #74, depende dele).
- **Contatos (Telegram/WhatsApp) só em `/contatos`**; mensagens sem termos proibidos ("amostra", "metodologia", "(Brasília)"); cards v2 de mensagem ligados por flag.
- **Nenhum loop pode parar.** Erro, rede, 429, login e captcha viram pausa com recuo e retomada; aba fechada o vigia reabre. Relatório de 6 em 6 horas e vigia a cada 5 min.
- **Pedido novo do dono vai para a lista (`docs/fila-de-execucao.md`) sem parar o que está em andamento; nada fica inacabado.** Só fura a fila se o dono disser "urgente".
- **Aprovação ampla é permitida quando reversível:** dry-run por padrão, backup NDJSON e log em `docs/backups/`, `--rollback`.
- **Cada produto que o dono envia vira auditoria de cobertura** (`docs/inventario-itens-concorrente.md`): por que está ou não no monitoramento, colocar e corrigir a causa geral.
- Nunca imprimir ou versionar segredos. Commit só dos próprios arquivos (`git add` explícito); nunca `git add -A` (índice compartilhado entre agentes).

> **Atualizado em 2026-11-15** (auditoria geral, `docs/auditoria-2026-11-15/00-sintese.md`): (1) corrigida a linha de coleta, que contradizia a coleta assistida; (2) registradas as regras acima, antes espalhadas na memória do dono; (3) registrada a regra "pedido novo vai para a lista". Retrato do negócio: `README.md` e `docs/PROJECT_BLUEPRINT.md`.


## Regras do dono de 2026-11-17 e 2026-11-18 (executáveis em `scripts/test-regras-do-dono.ts`; texto em `FLUXO_MESTRE.md` §15.10 a 15.18)
- **Toda loja nasce completa (R-94, R-97):** vertical nova entra em TODAS as listas (`VERTICALS`, `RELEASED_VERTICALS`, `RELEASED_PLUS` e padrão da detecção em `group-offers.ts`, `AMAZON_MODE_VERTICALS`, `LOJAS`, rodízio da Shopee, cron de coleta). O teste das regras do dono falha se faltar uma; foi a falta de uma lista que deixou a Beleza sem mensagens.
- **Mesmo fluxo para todos os canais (R-94, R-100):** nenhuma exceção por loja no pool; todo envio rotaciona tipo, produto (72 h) e rede; nenhum tipo passa de 20% das mensagens da loja em 24 h; "proibido rodar só em cima de poucos produtos".
- **Link de compra no texto de TODA postagem do Telegram (R-99)**, antes do carimbo; a legenda com foto cede divulgação e slogan, nunca o link, o preço nem o #publicidade.
- **A vitrine de jogos até R$ 200 é um plus (R-96):** cron próprio, silenciosa, fora do ciclo normal e fora de `group_messages`; nunca importar o motor do ciclo nem escrever na fila. PlayStation, Xbox, Switch 1 e Switch 2 sempre juntos, com rodízio.
- **Aprovação contínua libera todo produto checado em todas as lojas (R-93);** dúvida do robô, item miúdo e mídia/modelo/armazenamento ficam com o dono.
- **Envio (R-98):** janela própria por loja, no máximo 3 lojas por vez (pool do banco da Vercel = 3 conexões), conexões órfãs encerradas no início do ciclo.

## Definição de pronto (dono, 2026-11-18: "ou o código não finaliza a implementação ou não faz o que eu peço")
1. Ler a regra no Guia Mestre **antes** de codar e citar o id (R-nn) no commit. Pedido novo vira regra no Guia, no mesmo commit.
2. Toda regra do dono vira verificação em `scripts/test-regras-do-dono.ts` (ou teste próprio) que falha se a regra for desfeita.
3. Edição por script (python/node/sed) **sempre com `assert` de que o trecho existia**; uma substituição silenciosa que não aplica foi o que deixou `OFFER_FRESHNESS_DAYS` em 7 depois de declarado 365. Depois de editar, reler o arquivo ou rodar o teste.
4. "Feito" só com: testes verdes, deploy `READY`, e **medição em produção do efeito pedido** (ex.: envios/hora, mensagens da Beleza, notebooks no banco). Sem medição, o status é "implementado, não verificado".
5. Se algo não puder terminar, entra na fila (`docs/fila-de-execucao.md`) com o que falta e o critério de pronto; nunca fica só no chat.
