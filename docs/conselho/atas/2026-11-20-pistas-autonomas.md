# Ata, 2026-11-20: pistas autônomas por canal e envio no ato da coleta

**Porte:** grande (mexe em dado de produção e no envio). **Presidente:** geek-lead. **Pedido do dono:** cada canal do Telegram e cada destaque do site autônomos; mesma quantidade de envios, o máximo possível; sem fila; mais categorias por canal (ex.: notebook); extração ajustada para sustentar isso.

**Convocados (rodada 1, independentes):** estrategista-mercado, especialista-precos, gamer-veterano, qa-verificador (mesa fixa); cientista-dados-tempo-real, engenheiro-coleta, arquiteto-next, dba-postgres (tema). Fase 0 de medição em paralelo: `docs/evidencias/fase0-oferta-por-tipo-2026-11-20.md`.

## Pontos de acordo (8 de 8 aprovam com condições)
1. O gargalo é a fila global e a repetição, não a capacidade nem a coleta. Fase 0: só 15 a 35% do que é proposto vira envio; em 3 h houve 264 envios, 179 expirações, 1.076 adiamentos por repetição.
2. Gravar o **tipo** em `group_messages` antes de tudo (hoje ninguém consegue medir variedade).
3. **Admissão em modo sombra** primeiro, num canal pequeno, com critério de paridade definido antes.
4. **"Sem fila" = sem fila global.** O envio sai depois da resposta do coletor, por um despachante curto por pista (fila de segundos, TTL curto), nunca dentro do coletor (pool de 3 conexões, timeouts do Telegram de 23 a 60 s).
5. Contadores por canal/hora/tipo com `INSERT ... ON CONFLICT` atômico; sem varredura de histórico por confirmação; sem visão materializada pesada (DBA, cientista).
6. **Não desligar a fila global antes de paridade medida** (QA e preços: 7 dias). Não reduzir a repetição abaixo de 24 h. R-70, R-81, produto novo e preço-isca continuam inegociáveis.
7. A cota-base igual vale como **piso de acesso**, não como meta: pista sem oferta nova fica vazia; a sobra vai por oferta fresca, com teto por canal.

## Divergência registrada: teto por canal
Gamer 15/h; QA 12 a 20/h; estratégia, cientista, DBA e coleta 20 a 30/h; arquiteto aceita 30/h. Pisos propostos de 6 a 15/h. A Fase 0 estima ~208/h no total com repetição de 24 h e sem fila (games 67, tecnologia 38, esporte 34, eletrodomésticos 25, eletroeletrônicos 22, beleza 11, livros 7, 3D 4). Decisão: piso 12/h onde houver oferta, **teto inicial 30/h por canal, configurável por env**; sobe ou desce pela taxa de cliques e saídas medida (o dono pediu "o máximo que puder").

## Achados da Fase 0 que viram trabalho
- **Notebook** existe só em Tecnologia: 19 masters ativos, 8 elegíveis agora, 6 envios em 7 dias; as 9 ofertas da Amazon têm preço de 6 a 7 dias atrás (falta cobertura fresca na Amazon); nada barrado pelo porteiro.
- **Games** tem 7.890 ofertas elegíveis e 1 tipo (sem taxonomia de variedade).
- **Brinquedos** tem 0 masters (a semeadura ainda não produziu).
- `sendRun` não separa motivo por canal; a detecção não grava o bloqueio por master.

## Plano
- **Fase 1 (agora):** migração aditiva (coluna `tipo` em `group_messages`, tabelas `pista_contador` e `pista_decisao`), função de admissão em **sombra** (grava "enviaria/descartaria" e o motivo, sem enviar), piloto em Livros e Impressão 3D, relatório de paridade contra o envio real.
- **Fase 2:** cotas por pista (piso/teto) e vagas por tipo, ainda atrás de flag.
- **Fase 3:** envio no ato (despachante por pista) para ML e Amazon (`/ingest`).
- **Fase 4:** desligar a fila global com paridade de 7 dias e rollback testado.
- Em paralelo: taxonomia de variedade de Games; cobertura fresca da Amazon para tipos característicos; Brinquedos com 0 masters.

## Métricas de sucesso
Todo canal com oferta acima do piso e nenhum parado por mais de 2 h; repetição em 24 h abaixo de 5%; tempo da confirmação ao envio com mediana abaixo de 2 min; expirados sem envio abaixo de 10% das propostas; tipos distintos por canal por dia sobem; p95 do ciclo e do `/ingest` sem piora; zero violação de R-70, R-81, produto novo e preço-isca.

## Vetos e riscos
Nenhum veto. Gatilhos de rollback: espera por conexão do pool acima de 1 s, p95 do ciclo acima de 100 s, 429 do Telegram acima de 1% dos envios, repetição acima de 10%.

## Adendo, 2026-11-20 (noite): ajuste da admissão e paridade da Fase 1
**Critério da ata:** acordo de pelo menos 80% por canal piloto, zero violação de gate inegociável, sem piora do p95 do ciclo. **Resultado medido (1,7 h após o deploy, Livros, Impressão 3D e Beleza, sombra, nada enviado):**

| Canal | Acordo estrito | Acordo com cobertura | Observação |
|---|---|---|---|
| Livros | 10 de 11 (91%) | 91% | era 69% antes do ajuste |
| Impressão 3D | 3 de 12 (25%) | 12 de 12 (100%) | era 11%; os 9 restantes são envios reais de um master que a sombra já tinha "enviado" por outra proposta |
| Beleza | 1 de 1 | 100% | amostra mínima, entrou às 21:42 UTC |

Violações dos gates inegociáveis (R-70, R-81, preço-isca, produto novo, item barrado): **0**. Teto: máximo 8 por hora no canal, 5 por hora no tipo. Rota `pista-sombra`: p50 1,8 s e p95 2,2 s (2 canais: 1,6 e 2,0 s). Ciclo `group-messages`: p95 66,6 s antes, 70,7 s depois (oscilação normal de 68 a 77 s nas 9 h anteriores).

**Causa das divergências (hipótese do agente anterior corrigida em parte):** o teto de 2 por hora por tipo é, de fato, SUAVE no envio real (só segura com alternativa de outro tipo na fila) e o achado tem teto adaptativo duro (6 por hora); mas havia mais duas causas medidas: preço velho de proposta tratado como descarte (o envio real reconfere ao vivo) e repetição causada por decisão simulada de outra proposta do mesmo master. **Condições mantidas:** a Fase 3 só envia depois do recheck ao vivo do preço; Amazon com preço velho continua barrada; não reduzir a repetição abaixo de 24 h; Fase 2 e 3 dependem de 7 dias de paridade e do aval do dono. Detalhes e gatilhos: `FLUXO_MESTRE.md`, seção 15.32 (R-112).
