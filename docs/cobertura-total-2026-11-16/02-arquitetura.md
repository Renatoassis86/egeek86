# Cobertura total: arquitetura definitiva e escalável (2026-11-16)

Complementa `01-diagnostico.md`. Regra de governo: R-80 no Fluxo Mestre. Este documento descreve o alvo; a seção 9 diz o que já existe em código (fase 1) e o que falta.

## 1. Princípio

O universo que a plataforma permite é a meta; o buraco aparece no medidor; cada área tem dono e número. Descobrir deixa de ser "palpite de termos" e passa a ser **árvore + destaques + catálogo + termos por demanda**, executado por um escalonador com orçamento, cursor e métrica por área. Rede nova ou área nova entra **por configuração**, não por código.

## 2. Registro único de áreas (`src/lib/catalog/cobertura/areas.ts`)

```
Área (departamento) -> segmentos (tipos de produto, derivados de config*.ts) -> fontes por rede
fontes.ml      = { raizes[], profundidade, minAnuncios, destaques, tendencias }
fontes.amazon  = { nos[], rankings[bestsellers|new-releases|movers-shakers], paginasPorCiclo }
fontes.shopee  = { categorias[productCatId], paginasMax }
área.prioridade, área.coberturaMinima   (fração mínima dos mais vendidos já no banco)
```

- Existe hoje (fase 1): tipos, as 7 áreas com raízes ML (Casa `MLB5726`, Eletrônicos `MLB1000`, Tecnologia `MLB1648` + `MLB1051`, Esporte `MLB1276`, Livros `MLB437616`, Games `MLB1144`), `validarAreas()` (testada: prioridade repetida, raiz inválida, área sem fonte).
- Os segmentos continuam em `config.ts`, `config-ampliacao.ts`, `config-tipos.ts`, `config-ciencia.ts` (nada é escrito duas vezes; `segmentosDaArea` deriva a lista).
- **Adicionar uma área** (ex.: Brinquedos): uma entrada em `AREAS` + segmentos com domínio ML. **Adicionar uma rede** (ex.: Magalu, KaBuM): um adaptador (seção 4) e um bloco `fontes.<rede>` por área.

## 3. Descoberta (fontes, em ordem de rendimento por chamada)

| Fonte | O que traz | Custo | Estado |
|---|---|---|---|
| **A. Destaques por categoria** (`/highlights/MLB/category/{id}`) | 20 mais vendidos de cada categoria, em ids de catálogo | 1 chamada por categoria + 1 de detalhe + 1 de `/items` por candidato novo | **implementado em dry-run** |
| **B. Árvore de categorias** (`/categories/{id}`) | lista de categorias, universo (`total_items_in_this_category`) e a escolha das folhas (sem peça/acessório/outros) | 1 chamada por nó, cacheável por 7 dias | **implementado** |
| **C. Tendências** (`/trends/MLB/{id}`) | 50 palavras em alta por categoria, para alimentar a lista de termos do segmento por **demanda** | 1 chamada por categoria | **implementado** (opção `--tendencias`), alimentar termos na fase 2 |
| **D. Busca por termo** (atual) | `/products/search` até 200 resultados por consulta | 1 chamada por página; teto de **offset 100** | existe; manter só para modelos novos e itens do dono (`--termo`) |
| **E. Variantes e catálogo-pai** | `parent_product_id` do catálogo: irmãos de cor/voltagem | 1 chamada por pai | fase 3 |
| **F. Particionamento por atributo** (marca, linha) para passar o teto de 200 | `attributes` do `/products/search` | a sintaxe **não foi confirmada** (400 em duas tentativas) | investigar na fase 2; alternativa já viável: termo = marca × domínio com `limit=100` e `offset` 0 e 100 (200 por consulta) |
| **G. Faixa de preço** | o ML **não** filtra preço em `/products/search` | n/a | descartado; o particionamento é por termo/domínio/atributo, não por preço |
| **H. Vendedor oficial** | `/users/{id}/items` de terceiros dá 403 | n/a | descartado |
| **I. Itens novos** | sem endpoint de "recém-criados"; o proxy são as tendências (C) e os destaques, que trazem lançamentos (ex.: LG QNED70 2026) | | via A e C |

Amazon (plugável por config, **leitor assistido**): ao lado do modo `refresh/discover` por master, um modo `ranking` que lê as páginas `bestsellers` e `new-releases` dos nós da área (`fontes.amazon.nos`), extrai ASIN, título e preço (mesmo parser), e entrega ao ingest que **cria candidato com master** pela regra de identidade (hoje o ASIN só entra ligado a master). Limite do ritmo: o do loop atual (pausa 4 a 9 s, lote de 10, `paginasPorCiclo` por área); sem abrir mais abas (RAM).
Shopee: `fontes.shopee.categorias` com os `productCatId` das lojas Plus; `paginasMax` por categoria respeita o erro 10000 (cursor existente, `cobertura-shopee`).

## 4. Adaptador por rede (interface única)

```ts
interface AdaptadorRede {
  rede: 'ml' | 'amazon' | 'shopee' | string;
  universo(area, fonte): Promise<{ categorias: {id,nome,total}[] }>;          // quanto existe
  descobrir(area, fonte, cursor, orcamento): Promise<{ candidatos: Candidato[]; cursor: Cursor; chamadas: number; parou: Motivo }>;
  confirmar(candidato): Promise<Oferta | null>;                                // preço e vendedor reais (mesmo funil de hoje)
}
```
Todos devolvem `Candidato` no formato que o funil atual já consome (`MlCatalogPayload` no ML; `AmzCand` na Amazon; item de `productOfferV2` na Shopee). O **funil é único e já existe**: item miúdo, identidade forte, duplicata, 404, porteiro, escopo; `planSeed` ganhou a opção `candidates` (fase 1) para receber candidatos de qualquer fonte sem refazer a busca. Rede nova = escrever só `AdaptadorRede` + config.

## 5. Escalonador, orçamento, cursor

- **Orçamento por rede** (ML: teto diário já existente no estado `semeadura_vertical_estado`; Amazon: lotes por ciclo; Shopee: `COBERTURA_LIMITES`). Cada área recebe uma fatia pela **prioridade por valor**: `prioridade` da área x (1 - cobertura atual) x peso de Black Friday (ticket e cliques). Hoje todas as áreas empatam com a ordem de `seedRank`; passa a valer o buraco.
- **Cursor por segmento e fonte** (retomável, sem repetir): `{ area, rede, fonte, chave, posicao, idsVistos(hash), ultimaExecucao, esgotada }`. A fonte A guarda quais categorias já tiveram destaque lido e quando (reler a cada 3 dias: destaques mudam); a fonte B guarda nós lidos (7 dias); a fonte D guarda o cursor atual da fila de termos, mas **a profundidade passa a ser limitada por `offset <= 100`** (corrige o ciclo morto do `MAX_SEARCH_PAGES`).
- **Orçamento por execução**: a fatia do servidor mantém 120 chamadas (`SEMEADURA_MAX_CALLS`) e 60 s de `maxDuration`; criação limitada a **30 masters novos por execução** (mesmo freio da Shopee) para poupar o Supabase Micro.
- **Falha**: 429 para a rede e recua (15, 30, 60, 120 min já implementados); erro de categoria marca a categoria e segue; nada para o loop (R-37).

## 6. Banco (migration reversível, **proposta, não aplicada**)

```sql
-- 0064_cobertura_total.up.sql
create table cobertura_cursor (
  area text not null, rede text not null, fonte text not null, chave text not null,
  posicao jsonb not null default '{}', ids_vistos_hash text, esgotada boolean not null default false,
  atualizado_em timestamptz not null default now(), primary key (area, rede, fonte, chave));
create table cobertura_medicao (
  id bigserial primary key, medido_em timestamptz not null default now(), area text not null, rede text not null,
  universo integer, descobertos integer not null, aprovados integer not null, rejeitados jsonb not null default '{}',
  destaques_total integer, destaques_no_banco integer, cobertura numeric(5,4), alerta boolean not null default false);
create index on cobertura_medicao (area, rede, medido_em desc);
-- 0064_cobertura_total.down.sql
drop table if exists cobertura_medicao; drop table if exists cobertura_cursor;
```
Só tabelas novas (nenhuma alteração em tabela existente), RLS fechada como as demais; 1 linha de medição por área/rede por execução (~14 linhas por hora no máximo). O congelamento de esquema de 20/11 (comentário em `amazon-fila.ts`) significa que a **migration só entra depois do ok do dono**; antes disso o cursor da fonte A fica em `system_config` (padrão do cursor da Shopee) e a medição em arquivo/`collector_runs.meta`.

## 7. Medidor, painel e alerta

- **Medidor** (existe): `scripts/medir-cobertura-areas.ts` gera por área: ofertas por rede e status, masters por veredito, masters sem oferta ativa, profundidade por tipo, quem semeia, e (opção `--destaques N`) a cobertura dos mais vendidos do ML. Saída JSON versionada em `docs/cobertura-total-2026-11-16/`.
- **Painel**: nó "Cobertura por área" no `/admin/fluxo` (verde acima da meta da área, âmbar até 20 pontos abaixo, vermelho abaixo ou sem leitura em 24 h; cinza sem fonte, nunca verde por omissão, como o resto do painel).
- **Alerta**: `cobertura < coberturaMinima` da área, ou semeadura de uma área sem execução em 24 h, ou queda de 10 pontos entre medições, vira alerta do coletor (mesmo canal da fila #70, hoje em dry-run por falta de `TELEGRAM_ALERT_CHAT_ID`).
- **Métrica por área**: universo (soma de `total_items_in_this_category` das categorias escolhidas, e mais vendidos), descobertos, aprovados, rejeitados por motivo (contadores do funil, os mesmos de `SeedReport.counts`).

## 8. Respeito às regras vigentes

- **R-61 (preço-isca)**: o candidato entra sem preço publicável; o preço público só nasce da coleta normal, que já aplica o gatilho de isca.
- **R-62/R-64 (cupom e cartão)**: a descoberta não grava cupom nem benefício; preço Pix e cartão seguem as regras de ingestão existentes.
- **R-70 (link do dono)**: o master e a oferta nascem como **placeholder** (`affiliate_link_pending = true`, URL de catálogo sem marca). Nada descoberto aparece como clicável nem sai em mensagem sem o link do dono (o `matt_tool` do dono nasce na coleta ou pelo loop `ml-links-ui.js`). A URL do concorrente nunca é gravada.
- **Entrada do dono**: só novo e em linha (o funil rejeita usado, open box, recondicionado, importado, fora de linha); grupos só de iguais (identidade forte, cor junta, região/geração/edição limitada separam); sem itens miúdos (`ehItemMiudo` roda antes de qualquer chamada, e `CATEGORIA_FORA` tira peça/acessório/"outros" da árvore); imagem real do catálogo; foto com mão fica na quarentena pós-entrada; nada de regra interna no front (a ordem das áreas, os critérios e a metodologia só aparecem se o dono pedir).
- **Master nasce `review`** (invisível) e só vira público pela aprovação automática existente (`aprovacao-auto`, a cada 10 min); a descoberta nunca publica.

## 9. Plano de rollout, carga e custo até 27/11

Limites de carga: Supabase Micro (30 masters por execução, sem transação longa, backup lógico antes de cada gravação, rollback pelo log como o `semear-vertical`); conta logada da Amazon (um único loop, `paginasPorCiclo` baixo, parar se o Chrome ficar sem RAM); ML (teto diário existente; 429 recua).

| Fase | O quê | Chamadas ML | Tempo | Risco |
|---|---|---|---|---|
| **1 (feita hoje)** | medidor por área; fonte por árvore+destaques em dry-run; `planSeed` com candidatos; correção do domínio da chaleira; testes | ~460 de leitura em 16/11 | feito | nenhum (nada grava, nada ligado) |
| **2a (após ok do dono)** | ligar a fonte A na Casa atrás de `DESCOBERTA_ARVORE_ML=1`, 30 masters por execução, 120 chamadas por execução | ≈ 830 (30 categorias: 30 + 400 detalhes + 400 `/items`) | ≈ 7 execuções de 20 min ≈ 2,5 h | masters novos entram em `review`; carga de `aprovacao-auto` |
| **2b** | mesma fonte em Eletrônicos, Tecnologia e Esporte (nível 2); `semear-vertical` ligado nas 6 lojas (`SEMEADURA_LOJAS`) | ≈ 830 por área, ≈ 2.500 | 1 a 2 dias dentro do teto atual (1.400 a 4.400 chamadas/dia) | pico de criação: ~1.500 masters |
| **3** | nível 3 (folhas) das áreas de maior valor; tendências alimentando termos; tipos sem semente (cozedor a vapor, climatizador evaporativo, adega, balança de cozinha); Amazon `ranking`; Shopee Plus por categoria | ≈ 4.000 a 5.000 por área | até 27/11 só Casa, Eletrônicos e Tecnologia | volume de aprovação e de revisão de identidade (1.275 no histórico) |
| **4 (depois da BF)** | migration de cursor/medição, painel, alerta, `parent_product_id`, filtro por atributo (se confirmado), nova área/rede só por config | n/a | semanas | mudança de esquema depois do congelamento |

Estimativa de entrega até 27/11 (11 dias): fases 2a e 2b em 3 dias (≈ 1.500 masters novos nos mais vendidos), fase 3 parcial nos 8 dias restantes; **a meta de cobertura dos mais vendidos de cada área (50% a 60%) é atingível até 27/11 nas 4 áreas de ML; Amazon e Shopee dependem das decisões abaixo**. Custo: só chamadas de leitura e linhas de banco; nenhum serviço novo.

## 10. O que depende do dono (decisões e credenciais)
1. **Ligar a fonte A na Casa** (`DESCOBERTA_ARVORE_ML=1` na Vercel) depois de ver `dry-run-casa-2026-11-16.json`: 95 catálogos novos em 121 detalhados.
2. **Ligar `SEMEADURA_LOJAS` nas 6 lojas** (hoje só `eletroeletronicos`); variável Sensitive, não consigo ler o valor, só vi pelos jobs de 72 h que é um departamento.
3. **Teto de criação por execução** (proposta 30) e **ordem de áreas** (proposta: Casa, Eletrônicos, Tecnologia, Esporte).
4. **Amazon**: autorizar a leitura das páginas de ranking na aba logada (modo `ranking`) e o ritmo (proposta: 6 páginas por ciclo por área).
5. **Shopee Plus**: quais `productCatId` entram por loja; a chave já existe só na Vercel.
6. **Migration 0064** depois do congelamento de 20/11 ou antes, com seu aval.
7. **Alerta externo**: `TELEGRAM_ALERT_CHAT_ID` e `COLLECTOR_ALERTS` (fila #70) para o alerta de cobertura sair do dry-run.
