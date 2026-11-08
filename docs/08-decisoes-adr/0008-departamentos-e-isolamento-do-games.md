# ADR 0008: Departamentos (verticais) e isolamento do departamento Games

Data: 2026-11-08. Status: **PROPOSTO. Nada aplicado em código, banco ou produção.** Depende das decisões do dono listadas na ata `docs/conselho/atas/2026-11-08-sub-plataforma-categorias.md`. Emenda de escopo ao ADR 0005 (que permanece integral para o departamento Games). Reutiliza ADR 0001, 0002, 0004 e 0006.

## Contexto
- O dono pediu uma sub-plataforma com Livros, Eletrodomésticos, Eletroeletrônicos, Material de tecnologia e Material de esporte, com a mesma métrica, e a gravação do histórico da Black Friday (27/11/2026) sem perder dias.
- Hoje o catálogo é gamer por construção: `product_type` é enum ('game','console','accessory') com default 'game'; `dedup.ts` e `gate.ts` assumem plataforma de jogo; as consultas públicas usam lista de EXCLUSÃO (`catalogGateVisibleSql` é `NOT IN`; ausência de veredito vale aprovado). Um master novo de outra categoria apareceria na home, busca, sitemap e médias gamer.
- O histórico (snapshots append-only) é o único ativo irrecuperável; `price_daily_*` e eventos do menor preço são derivados.

## Decisão proposta
1. **Departamento = coluna `vertical`** (`text NOT NULL DEFAULT 'games'`, CHECK por lista fixa) em `master_products` e `affiliate_offers`. Sem tabelas paralelas; `affiliate_price_snapshots`, `price_daily_offer`, `price_daily_state` e `price_min_events` são reaproveitados sem mudança. Migração aditiva, com RLS, `.rollback.sql`, fora do journal, aplicada por `apply-*.ts` (dry-run padrão, backup, log).
2. **Isolamento por inclusão (allow-list).** Superfícies gamer exigem `vertical = 'games'` E porteiro aprovado. O filtro fica DENTRO dos helpers `publicOffersCtes`/`priceQuotesCtes` (ponto único), com `vertical` tipado e obrigatório nas consultas públicas; sitemap, `/api/produtos/*`, `/go`, busca e snapshots também. Teste automático de vazamento é condição de "concluído".
3. **`product_type` para masters não-games.** Proposta: `ADD VALUE 'general'` (inerte se desfeito; a exaustividade do TypeScript acusa pontos não tratados). Divergência técnica aberta (DBA e QA cruzaram posições na réplica); fallback: só a coluna `vertical` e teste que reprova `vertical<>'games'` com `product_type='game'`. Decidir antes da implementação.
4. **Porteiro e identidade por departamento.** `gate.ts` e ADR 0005 não mudam para Games. Cada departamento tem `gateFor(vertical)` com léxico próprio e evidência positiva; "outra vertical" nunca é `rejected` do porteiro gamer. `dedup.ts` ganha `IdentityProfile` por vertical: GTIN/ISBN/MPN/catálogo ML primeiro; chave estruturada depois; título só como último recurso; nenhum master sem identificador forte ou revisão. Chaves: livro = ISBN-13 (edição/capa/box separam); eletrodoméstico = marca+modelo+voltagem (+capacidade); TV/áudio = marca+modelo+polegada; notebook = part number (sem ele, revisão); hardware = MPN; impressora/3D = marca+modelo+versão; tênis = modelo+cor (+tamanho como variante da oferta, a confirmar). Usado, Open Box, recondicionado, reembalado e importado: fora.
5. **Coleta.** Somente API oficial (ML catálogo; Shopee Affiliate). Fila, cron, cursor e teto de chamadas próprios por vertical (`collect-vertical?v=`), kill-switch `VERTICAL_<NOME>_ENABLED`, `collect-prices` gamer intocado. Pré-requisito: migrações 0025 e 0026 aplicadas e `COLLECTOR_RUNS=1`.
6. **Métrica.** A mesma (ADR 0001/0002/0004). Limiares 35 %/3x mantidos até haver 30 dias e medição de corte por vertical (hipótese de calibração por categoria). Referência de "preço de antes" (hipótese): mediana oferta-dia dos 60 dias anteriores, excluindo os 7 últimos, com >= 14 dias medidos e 3 ofertas distintas. Sem selo, veredito ou "de/por" do marketplace em 2026. `original_price` gravado bruto e rotulado.
7. **UI.** `/mercado/[vertical]` no mesmo app, atrás de flag privada (404 desligada, fora de sitemap/menu/busca), tabela genérica guiada por config da vertical, filtros só com dado real. Nenhuma flag pública sem autorização.

## Consequências
- Custo: ~10 arquivos de consulta pública, 3-5 de coleta/cron, `dedup.ts` e `gate.ts`; critério de aceite: contagens e médias gamer idênticas antes/depois.
- Risco residual: callers que leiam `master_products` sem passar pelo helper; SQL cru. Mitigação provisória: masters novos com `attributes.catalogGate.verdict='review'` (removida após validar a allow-list).
- Risco de marca: diluição do foco gamer (parecer do gamer-veterano contrário a esporte e eletrodoméstico); nome público do departamento é decisão do dono.
- Risco jurídico: desconto falso (CDC) e termos das APIs sobre armazenar/exibir histórico, não verificados.
- Reversão: desligar a flag/cron; `DROP COLUMN vertical`; dados coletados preservados.
