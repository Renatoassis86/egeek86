# Metodologia de Desenvolvimento com IA (Vibe Code Disciplinado)

**Como o Espaço Geek 86 constrói software com Claude Code sem desfazer o que já está pronto e sem deixar cadeia pela metade.** É parte do Guia Mestre: o Fluxo Mestre (`FLUXO_MESTRE.md`) diz *o que* o sistema faz; este documento diz *como* se muda o sistema. As regras imperativas daqui são R-83 a R-87 (Fluxo Mestre, seção 15).

- **Versão 1.0, 2026-11-16.** Ata do conselho: `docs/conselho/atas/2026-11-16-metodologia-ia.md` (pareceres independentes do engenheiro de software principal, do QA e do arquiteto; divergência e decisão na seção 12).
- **Para quem:** o dono (seções 1, 2, 11, 12 e 13) e todo agente ou sessão de IA que escreva código (todas as seções; **leitura obrigatória antes de tocar em qualquer arquivo de `src/`, `scripts/` ou `public/loops/`**).
- **Estado:** a Fase 1 (portão, guarda do congelado, manifesto) está **pronta e testada**. As Fases 2 e 3 estão descritas na seção 10 e dependem de decisão do dono.

---

## 1. O problema, em linguagem de quem sofre com ele

O dono descreveu três dores. Cada uma tem causa medida no repositório (2026-11-16):

| Dor | Causa-raiz medida | O que impede daqui para frente |
|---|---|---|
| **"Corrigimos um erro e aparecem outros."** | Não existe nada que barre a mudança: nenhum hook, nenhuma CI de testes, `.claude/settings.json` só tem permissões. 120 scripts `test-*.ts` no disco, **só 38 ligados ao `package.json`**, nenhuma rodada única. Quem corrige roda o teste do assunto, nunca a regressão. | **O portão** (`npm run gate`): uma rodada única, 51 s, antes de todo commit (R-83). |
| **"A IA não sabe o que já está validado."** | "Validado" vive em atas, na memória e em prosa. Não há marcação por máquina de módulo pronto. `group-rules.ts` tem 2.544 linhas e é importado por 39 arquivos: o raio de impacto é invisível. | **Manifesto de módulos** (`docs/validado/MODULOS.json`) e **guarda do congelado** (`npm run congelado`): lista o que está validado, quem consome e bloqueia alteração sem autorização do dono (R-84). |
| **"A cadeia fica pela metade e algo quebra."** O exemplo atual: o preço da mensagem do Telegram difere do da página, e a média às vezes some mesmo com diagnóstico de compra boa. | A mesma grandeza é calculada em vários lugares: ao menos quatro formatadores de preço (`fmtBRL` em mensagens, `formatMoney` em `price-card-model`, `format.ts`, `formatBrlForJudge`), duas médias no site (FM-01), e cada superfície (mensagem, card, página, link) recalcula em vez de ler um valor já decidido. | **Contrato de tarefa com cadeia completa** (R-85) e **fonte única do preço exibido, provada por teste de paridade** (R-86). |

Prova de que o mecanismo funciona (primeira rodada do portão, 2026-11-16): ele achou **2 testes já vermelhos** que ninguém tinha visto (um cobrava a versão exata `1.1.0` do leitor da Amazon, e o R-81 a subiu para `1.2.0`; outro ainda esperava o comportamento da Amazon anterior à contenção #120). Os dois foram corrigidos no mesmo dia, só nos testes. Esse é exatamente o tipo de furo que hoje passa em silêncio.

## 2. Os onze princípios

1. **Tarefa pequena, escopo escrito.** Toda mudança nasce de um *Contrato de Tarefa* (seção 4) que lista os arquivos que podem ser tocados. O que não está no contrato não se mexe.
2. **Primeiro o teste que falha.** Corrigir é: reproduzir o erro num teste, vê-lo vermelho, mudar o mínimo, vê-lo verde. Sem teste vermelho antes, não há "correção", há palpite.
3. **Mudança mínima, nunca refator escondido.** Corrigir um bug não é limpar código. Refator é outra tarefa, em outro commit, com saída idêntica provada.
4. **O validado é lei: não se mexe sem autorização.** Módulo validado só muda por contrato de tarefa; módulo congelado só muda com descongelamento do dono (seção 6).
5. **Cadeia completa ou ponta registrada.** Mudar um nó obriga a conferir todos os nós a jusante (seção 5). Cada um fica verde ou vira ponta solta com número na fila. **Nunca omitido.**
6. **Uma grandeza, um dono.** Preço exibido, média, selo, link e frescor têm **um** módulo que decide; os demais só leem (seção 7).
7. **Vermelho conhecido não é aceito, é registrado.** Se o portão já estava vermelho antes da sua mudança, isso entra na ata ou na fila com data; não se "contorna".
8. **Teste não é editado para passar.** Mudar um teste existente exige commit separado com a justificativa ("a garantia continua valendo porque…"). Quem implementa não é quem valida (R-87).
9. **Prova antes de "pronto".** "Pronto" é a saída do portão verde mais a cadeia fechada, mostradas no commit. "Li o código" e "testei na tela" não contam.
10. **A máquina impõe, o documento explica.** Tudo que a regra puder verificar sozinha vira script, não parágrafo. Documento novo só entra se tiver gatilho em código (a mesma regra do R-63).
11. **Dado e decisão em tempo real (regra do dono, 2026-11-16, R-89).** Dado velho nunca chega ao usuário como se fosse novo. Todo dado tem **idade máxima declarada num lugar só** (o orçamento de frescor, seção 17), medida por máquina, e toda mudança que cria ou altera um dado novo declara a idade máxima dele no Contrato de Tarefa.

## 3. Os estados de um módulo

Um **módulo** é um conjunto de arquivos com uma responsabilidade (ex.: `preco-isca`, `link-afiliado`, `mensagens-regras`). Está listado em `docs/validado/MODULOS.json`, com os arquivos, os testes que o guardam, a regra R-xx de origem e os consumidores (gerados do `git grep`).

| Estado | Significa | Quem pode mudar | Como muda de estado |
|---|---|---|---|
| `rascunho` | em construção | qualquer sessão | ao ganhar teste vira `em_validacao` |
| `em_validacao` | implementado, sem prova completa | qualquer sessão, com contrato | prova completa (seção 8) → `validado` |
| `validado` | teste guarda verde **e** cadeia fechada | só por Contrato de Tarefa, com portão | dono ou QA independente promove a `congelado` |
| `congelado` | validado pelo dono/QA; é a base | **só com descongelamento vigente** | o dono descongela por prazo curto |
| `candidato` | proposto para validar/congelar; ainda não bloqueia | como `em_validacao` | decisão do dono |

**Regra de ouro do congelamento:** só congela módulo que tem teste que o guarda **e** esse teste está verde no portão completo. Congelar código sem teste só esconde bug.

## 4. O Contrato de Tarefa (uma página, antes de escrever código)

Toda sessão de IA abre a tarefa preenchendo isto (no próprio pedido ou na primeira resposta). O dono só precisa aprovar quando o contrato toca módulo `validado`/`congelado` ou decisão de negócio.

```
CONTRATO DE TAREFA
Sintoma / objetivo ..... (uma frase observável; ex.: "preço do Telegram difere da página")
Onde está o erro ....... (camada: fonte | banco | média | site | mensagem | link | frescor)
Arquivos permitidos .... (lista fechada; qualquer outro precisa voltar aqui e justificar)
Módulos tocados ........ (ids do MODULOS.json + estado de cada um)
Consumidores a conferir  (saída de `npm run congelado`: cadeia a jusante)
Teste vermelho ......... (qual teste novo reproduz o erro ANTES da correção)
Invariantes que continuam verdes (portão rápido + os testes dos módulos tocados)
Fora de escopo ......... (o que NÃO será feito, mesmo que pareça relacionado)
Flag / reversão ........ (como desligar; migration com rollback)
```

## 5. O ciclo de toda tarefa (8 passos)

1. **Reconhecer.** Ler `AGENTS.md`, `CLAUDE.md`, este documento, o Fluxo Mestre na seção do nó e `npm run congelado` para ver o que já está validado e quem consome.
2. **Contrato.** Preencher a seção 4. Tarefa grande: modo de planejamento do Claude Code + conselho (`reuniao-conselho`).
3. **Teste vermelho.** Escrever o teste que reproduz o erro e mostrá-lo falhando.
4. **Mudança mínima.** Só nos arquivos do contrato. Se precisar sair da lista, parar e atualizar o contrato.
5. **Portão.** `npm run gate -- --so=<assunto>` durante o trabalho; `npm run gate` antes do commit; `--completo` antes de deploy.
6. **Cadeia.** Percorrer os nós (abaixo). Cada um: verde, ou ponta solta com número na fila.
7. **Registro.** Fluxo Mestre no **mesmo commit** (seção 13.2), ata se foi decisão, `docs/validado/MODULOS.json` se mudou o estado de um módulo.
8. **Commit.** `git add` explícito dos próprios arquivos (nunca `git add -A`), um R-xx por commit, mensagem com: causa, teste vermelho, o que o portão mostrou.

### 5.1 Os nós da cadeia (use como checklist de "pronto")

`fonte` (coleta/API) → `banco` (migration + rollback) → `série e dia fechado` (reprocessar o passado, R-71) → `média e selo` (mesmo conjunto de ofertas, R-72/R-78) → `site` (card, página, vitrine) → `mensagem` (texto, card, cota) → `link` (afiliado do dono, R-70; **a página do link mostra o mesmo preço da mensagem**, R-86) → `cofre/guardião` (R-64 a R-68) → `vigia/observabilidade` → `Fluxo Mestre` → `fila`.

Se a sua mudança toca um nó, **os nós à direita dele são seus**: ou ficam verdes, ou entram na fila com número. É isso que impede a cadeia "feita até a metade".

## 6. Congelamento e descongelamento

- **Manifesto:** `docs/validado/MODULOS.json` (estado, caminhos, testes que guardam, consumidores).
- **Guarda:** `npm run congelado` compara o que mudou (`git diff` contra `HEAD`, ou `--contra=origin/main`) com o manifesto. Para cada arquivo tocado imprime o módulo, o estado, os testes e **os consumidores a conferir**. Módulo `congelado` alterado sem descongelamento vigente: **falha (código 1)**.
- **Descongelar:** só o dono, em `docs/validado/descongelar.json`: `{ id, motivo, regra, ate, autorizadoPor }`. **Vence sozinho** (`ate`); descongelamento vencido não vale. Depois da mudança, o módulo volta a congelado no mesmo commit que fecha a tarefa.
- **Emergência (hotfix):** o dono descongela por 24 h no máximo; o hotfix ainda exige teste vermelho e portão; a ata registra por que foi emergência.
- **Aviso extra (sempre ligado):** regra de preço/mensagem/catálogo mudou sem teste novo, ou sem o Fluxo Mestre no mesmo commit.

## 7. Fonte única de verdade por conceito

Cada conceito tem **um** dono. Os demais módulos só **leem** o resultado; recalcular em outro lugar é defeito.

| Conceito | Dono (hoje) | Regra | Estado |
|---|---|---|---|
| Preço do dia e tipo (cheio × Pix) | `src/lib/pricing/tipo-preco.ts`, `daily-state.ts` | R-69 | `candidato` |
| Isca (preço fora do padrão) | `src/lib/pricing/preco-isca.ts` | R-61 | `candidato` |
| Média, diagnóstico e selo | `price-verdict-v2.ts`, `parecer-produto.ts` | R-72, R-78 | `candidato` |
| **Preço exibido** (o número que a pessoa vê) | **hoje espalhado** (mensagem, card, página) | **R-86** | **a convergir (seção 7.1)** |
| Link ao usuário | `src/lib/affiliate/link-afiliado.ts` | R-70 | `candidato` |
| Frescor e confirmação | `src/lib/messaging/confirmacao-preco.ts`, `src/lib/precos-fontes/` | R-81, R-82 | `candidato` |

### 7.1 Convergência do preço exibido (o caso "Telegram diferente da página")

**Sem reescrita de uma vez** (divergência do conselho resolvida na seção 12): construir `src/lib/pricing/preco-exibido.ts`, função pura que devolve `{ centavos, tipo, texto, media: { estado: 'ok' | 'provisoria' | 'ausente', motivo }, frescorMin, podeDivulgar }`, e migrar **uma superfície por vez, atrás de flag, em sombra** (a nova calcula e **compara** com a antiga; só troca quando a diferença é zero em N produtos).

O juiz é o **teste de paridade**: para N produtos de fixture, o texto da mensagem, o card e a página devem trazer o **mesmo preço, a mesma média (ou o mesmo rótulo de provisória) e o mesmo link**. **Diagnóstico "compra boa" sem média presente é invariante violada** (a média some vira estado visível, não silêncio). Esse teste reproduz exatamente os dois erros relatados.

## 8. O portão e a definição de "validado"

- **`npm run gate`** (rápido, ~1 min): typecheck + todos os `test:*` sem banco. **Antes de todo commit** (R-83).
- **`npm run gate -- --completo`**: inclui os que exigem `.env.local`/banco (7 hoje). Antes de deploy e uma vez por dia.
- **`npm run gate -- --so=<assunto>`**: rodada de módulo durante o trabalho.
- **Descoberta automática:** todo `test:*` ligado ao `package.json` entra sozinho. Exceção só em `docs/validado/gate.json` (`ignorar` com motivo; nunca silenciosa).
- **Linha de base de 2026-11-16:** rápido 32 verdes (2 falhas achadas e corrigidas no mesmo dia); **completo (com banco) 34 verdes e 4 vermelhos** (fila #138). Detalhe em `docs/validado/BASELINE_2026-11-16.md`.
- **Dívida conhecida:** **82 scripts `test-*.ts` não estão ligados** ao `package.json` e portanto não rodam no portão. Ligá-los em lotes, após classificar (puro × banco), é a tarefa #1 da Fase 2.

**"Validado" = (a) teste guarda do módulo verde no portão completo; (b) teste de regressão do erro que originou a regra; (c) cadeia a jusante fechada ou registrada; (d) QA independente deu o ok (R-87).**

## 9. Papéis e práticas no Claude Code

- **Uma tarefa por sessão**; sessão longa degrada (a IA perde o que já está validado). Ao trocar de assunto, abrir sessão nova (`/clear`) e começar por `npm run congelado`.
- **Modo de planejamento** para qualquer tarefa que toque mais de um módulo ou um módulo `validado`.
- **Conselho antes, QA depois.** O conselho dá parecer independente (rodada 1 sem contaminação). O `qa-verificador` valida **sem ter escrito** o código; quem implementa nunca fecha a própria validação.
- **Commits pequenos e reversíveis:** um R-xx por commit; migration sempre com `.rollback.sql`; flag para tudo que muda comportamento ao vivo.
- **Índice git compartilhado:** `git add` explícito; nunca `git add -A` (lição do commit `8044110`, que subiu 287 arquivos locais).
- **Trabalho paralelo** só em `git worktree` separado e em módulos diferentes (o contrato diz quais).
- **Pedido novo do dono durante uma tarefa** vai para `docs/fila-de-execucao.md` e não interrompe o que está em andamento (R-59), salvo "urgente".

## 10. Automação por máquina, em fases

**Fase 1 — pronta (2026-11-16, sem impacto no fluxo atual):** `npm run gate`, `npm run congelado`, `docs/validado/MODULOS.json`, `descongelar.json`, `gate.json`, esta metodologia, R-83 a R-87.

**Fase 2 — depende do dono (muda como o trabalho é bloqueado):**
1. Hook de `git pre-commit` (`.githooks/` + `core.hooksPath`) que roda o portão rápido e `congelado`. `--no-verify` passa a ser proibido pelo `AGENTS.md`.
2. Hooks do Claude Code em `.claude/settings.json`: `PreToolUse` em `Edit|Write` bloqueando caminhos `congelado` sem descongelamento vigente; `Stop` recusando encerrar com arquivo alterado sem portão verde. Exigem saída de emergência registrada (seção 6).
3. GitHub Action `gate` em push (hoje o único workflow é o de backup).
4. Ligar os 82 testes órfãos ao `package.json`, em lotes.

**Fase 3 — convergência estrutural (tarefas da fila, uma por vez):**
1. `preco-exibido.ts` em sombra e teste de paridade (seção 7.1).
2. Regra de lint: proibir formatador de moeda fora de `format.ts` e `preco-exibido.ts`, com **baseline que só pode diminuir**.
3. Estrangular `group-rules.ts` por blocos: **primeiro** testes de caracterização com a saída real de hoje; **depois** extrair um bloco por vez para `messaging/rules/<tema>.ts`, mantendo o arquivo atual como *barrel*; cada extração é um commit com saída idêntica provada.

## 11. Como o dono pede uma tarefa (modelo de pedido)

```
TAREFA: <o que está errado ou o que quero, em uma frase>
EVIDÊNCIA: <print, link, produto, horário>
NÃO MEXER: <o que está pronto e tem de ficar como está, se eu souber>
PRONTO QUANDO: <o que eu vou conferir com meus olhos>
```
A IA responde com o Contrato de Tarefa (seção 4) antes de escrever código e só segue se o contrato não tocar módulo validado/congelado ou decisão de negócio sem o meu ok.

## 12. Decisão do conselho e divergência

- **Acordo dos três pareceres:** (1) falta um portão único imposto por máquina; (2) falta marcação por máquina do que está validado; (3) a mesma grandeza é calculada em vários lugares, e é isso que gera "Telegram ≠ página"; (4) o teste decisivo é de **cadeia ponta a ponta/paridade**, não mais testes por camada; (5) não escrever documento grande novo como controle; (6) hooks rígidos precisam de saída de emergência; (7) não congelar sem teste.
- **Divergência:** o arquiteto propõe criar já o contrato `PrecoExibido` em 1 a 2 dias; o engenheiro propõe migrar em sombra por flag, com o teste de paridade como juiz. **Decisão:** sombra e paridade (seção 7.1), porque protege o que já está validado.
- **O que ficou de fora de propósito:** reescrever a camada de mensagens de uma vez; limite de linhas retroativo; novos documentos de controle.

## 13. Métricas de sucesso (conferir toda semana, no relatório de 6 em 6 horas)

| Métrica | Hoje | Meta |
|---|---|---|
| Testes vermelhos no portão rápido / completo | 0 / **4** (fila #138) | **0 / 0** |
| Scripts de teste ligados ao portão | 38 de 120 | 120 de 120 (ou ignorados com motivo) |
| Commits seguidos de correção do mesmo assunto em 48 h | NÃO MEDIDO (medir na semana 1) | queda de 50% em 30 dias |
| Divergência de preço mensagem × página × link na amostra de paridade | NÃO MEDIDO (não há teste ainda) | 0 |
| "Compra boa" sem média presente | NÃO MEDIDO | 0 |
| Módulos `congelado` com teste guarda verde | 0 de 0 | os 7 pequenos congelados após o ok do dono |
| Tempo do portão rápido | 51 s | < 2 min |

## 14. Anti-padrões (se acontecer, parar)

- "Aproveitei e arrumei também…" (escopo fora do contrato).
- Editar o teste para ficar verde sem justificar.
- Dizer "pronto" sem a saída do portão.
- Corrigir só o ponto onde o erro apareceu (tela) sem percorrer os nós a jusante.
- Calcular um preço ou uma média num segundo lugar "só para esse caso".
- Criar flag nova sem entrada em `.env.example` e sem registro no Fluxo Mestre.
- Sessão longa misturando assuntos.

## 15. Primeira onda de congelamento proposta (decisão do dono)

Sete módulos pequenos, com teste que passa no portão e regra do dono por trás. **Nenhum está congelado ainda**; só entram em `congelado` com o seu ok: `preco-isca` (R-61), `tipo-preco-amazon` (R-69), `link-afiliado` (R-70), `item-miudo`, `console-videogame`, `gate-catalogo` (R-58) e `plausibilidade-quarentena` (R-57). `mensagens-regras` e `parecer-e-preco-no-site` esperam os testes de caracterização (Fase 3). `frescor-e-confirmacao` espera ligar seus testes ao `package.json`.

## 16. Contrato de Tarefa: acréscimo de frescor (R-89)
O Contrato de Tarefa (seção 4) ganha a linha **"Idade máxima do dado"**: para cada dado que a mudança lê, grava, mostra ou envia, a idade máxima e **onde a regra é imposta** (arquivo do orçamento de frescor). Sem essa linha o contrato não vale. Cadeia completa (seção 5.1) passa a incluir o nó **"frescor"**: depois de `site` e `mensagem`, confere-se que a superfície nova respeita o mesmo orçamento (a mensagem e a página do mesmo produto nunca usam idades diferentes sem decisão do dono).

## 17. Orçamento de frescor (a tabela que vira contrato)
Fonte única em código: `src/lib/frescor/orcamento.ts` (etapa E2 da auditoria `docs/auditoria-tempo-real-2026-11-16.md`; **ainda não existe**). Enquanto isso, o mapa abaixo é a referência e o portão passa a falhar se uma constante de idade nova nascer fora do arquivo.

| Dado | Idade máx. proposta | Onde é imposta hoje | Como é medida |
|---|---|---|---|
| Preço Amazon (mensagem, lista, card, **site**) | 45 min (`AMAZON_FRESCOR_MIN`) | `confirmacao-preco.ts`; no site é 24 h (G1) | a criar (E1) |
| Entrega Amazon | 45 min | `frete-prazo.ts` (R-88) | a criar (E1) |
| Preço ML/Shopee, queda | 30 min no envio (reconferência ao vivo) | `group-rules.ts`, `live-recheck.ts` | `live_checked_at` (medido: 0 min) |
| Preço, lista do privado | 360 min | `confirmacao-preco.ts` | a criar (E1) |
| Oferta clicável no site (ML, Shopee) | 24 h (vitrine hoje 168 h: decisão do dono) | `departamentos.ts`, `vitrines/regras.ts` | a criar (E1) |
| Série e média | 7 dias | `price-verdict.ts`, `daily-state.ts` | invariante `dia_passado_aberto = 0` |
| Cupom | decisão do dono (hoje 120 min e 24 h) | `group-messages.ts`, `campaign.ts`, `amazon-promocoes.ts` | a criar |
| Estoque | **sem regra** | n/a | n/a |

**Gatilhos de máquina da seção:** (1) o medidor de frescor roda no portão completo e na linha de base; (2) teste que falha se houver literal de idade de dado fora de `orcamento.ts`; (3) toda superfície nova (página, cartão, mensagem, API) importa o orçamento. Detalhe e plano por etapas: `docs/auditoria-tempo-real-2026-11-16.md`.

## 18. Fase 2 implantada (2026-11-17, fila #136)
- `.githooks/pre-commit`: barra commit que viola módulo congelado (`npm run congelado`). `.githooks/pre-push`: roda o portão (`npm run gate`) e barra o push se vermelho. **Instalar uma vez por clone:** `git config core.hooksPath .githooks`. Pular só em emergência, com autorização do dono (`--no-verify`), e registrar no Fluxo Mestre.
- `.github/workflows/gate.yml`: o portão rápido e a guarda do congelado rodam em todo push na `main` e em todo pull request, sem secrets e sem banco (o que toca o banco fica PULADO; o portão completo segue como rodada diária).
- **Não feito (por ser configuração do próprio Claude Code, do dono):** hooks `PreToolUse`/`Stop` em `settings.json`. A primeira onda de congelamento (7 módulos, #135) segue aguardando o portão completo verde.
- Teste: `scripts/test-fase2-metodologia.ts`.

