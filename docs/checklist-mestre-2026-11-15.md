# Checklist mestre de pedidos do dono (2026-11-15)

Uso: resolver **um item por vez**, só passar ao próximo quando a cadeia de implantação estiver fechada de ponta a ponta.

## Cadeia de implantação (o que "pronto" significa)
Um item só fecha quando TODOS os elos existirem e estiverem verificados em produção:
1. **Pedido** registrado (fila + este checklist) e decisão do dono, quando houver.
2. **Código** commitado no `main` (só os arquivos do item).
3. **Teste** automatizado passando (e `tsc` limpo).
4. **Deploy** Ready na Vercel (o site responde; sem build quebrado).
5. **Flag/variável** de ambiente conferida (liga/desliga e valor real em produção).
6. **Dado**: contagem medida por SELECT antes e depois; backup e rollback quando mexer em dados.
7. **Vinculações**: front (site/mobile), mensagens (Telegram/WhatsApp), admin, loops do Chrome, jobs/cron, documentos.
8. **Verificação** por quem não implementou (qa-verificador) ou por medida em produção, com data.
9. **Registro**: linha da fila atualizada, decisão em `docs/decisoes-dono-2026-11-15.md`, memória do dono quando virar regra.

## A. Pedidos já fechados (cadeia completa verificada em 2026-11-15)
| Pedido | Evidência resumida |
|---|---|
| Imagens do Observatório e do Sobre | commits 8bdc640, f86ee69 |
| Console só em linha/novo (PS4, Xbox One S fora), console = só videogame | 82/82 testes; gate e group-rules |
| Foto com mão: rejeitar, depois por OFERTA e só mão real | 84 masters reavaliados, 99 ofertas em quarentena; script com rollback |
| Rodapé sem aviso de comissão; cartões de departamento clicáveis; cache 5 min | commits 74aa63c, b0570b0, d5fa77d |
| Home nova a 100% (10/50/100 hoje) | log em docs/backups/rollout-home-nova-log.ndjson; QA Playwright |
| Cards v2 ligados + capas + fundo branco | flag GROUP_CARD_V2=on; 10 capas gravadas; #65 |
| Cupom encerrado com nome do cupom | commit 1de00bb |
| Bambu Lab A1/P1S/P2S no fluxo (parcial: Shopee e Amazon dependem de ciclos) | #59 |
| Ciência e tecnologia industrial (6 de 16 segmentos semeados) | #60: 295 masters |
| Consolidação Switch 2 + Mario Kart | commit 33deb9f |
| Comissão prevista só no admin | #62: `/admin/comissao`, teste de privacidade |
| Quarentena em lote de preço absurdo e título de risco | 169 ofertas, migração 0052 |
| Alertas do coletor no Telegram do dono | COLLECTOR_ALERTS=1 + TELEGRAM_ALERT_CHAT_ID; teste entregue (falta sonda externa) |
| Auditoria geral com o Conselho e guias atualizados | docs/auditoria-2026-11-15/ |

## B. Em aberto, na ordem em que vamos resolver (um por vez)
| # | Item | Fila | O que falta na cadeia | Depende do dono? |
|---|---|---|---|---|
| 1 | **Promoção Prime 25% do Jogo Barato e cupons, ponta a ponta** | #66, #82, #37 | Elos: loop `amazon-promocoes` na aba -> `coupon_items` -> agulha -> mensagem CUPOM/Prime -> card no site. Auditoria: 0 promoção Prime no banco; `amazon-promocoes` sem execução registrada; 37 mensagens CUPOM/24 h, mas nenhuma Prime confirmada **Rastreio 2026-11-15** (`docs/rastreio-prime-cupons-2026-11-15.md`, `scripts/verificar-prime-cupons.ts`): loop/ingest/job vivos; CORRIGIDO o elo agulha->mensagem (fonte `amazon-item-confirmado` não era tratada como promoção: 0 mensagens CUPOM da Amazon na história) e extras do loop (v1.2.0). PENDENTE DE LEITURA NA ABA: o que o loop leu de A2B9F6KRH7YF1H (0 `coupon_items`); depois, ciclo de ~40 min e reinjeção da v1.2.0 após o deploy | Não (eu opero a aba) |
| 2 | **Loja de Impressão 3D em 3 seções** (Impressoras, Filamentos, Demais itens) | #63 | Nada feito | Não |
| 2b | **Guia dedicada às impressoras 3D prioritárias no Plus, com o menor preço sempre** (ML e Amazon). **Ordem do dono, COMBOS PRIMEIRO dentro de cada modelo: P2S Combo, P2S, P1S Combo, P1S, A1 Combo/A1 Mini Combo, A1/A1 Mini, Kobra**, valendo para guia, front, mensagens, cupons e cobertura | #111 | Nada feito; junta com o item 2 (#63) e depende da cobertura Bambu (#59) | Não |
| 2c | **Cupons e descontos de cartão para as impressoras 3D prioritárias (ML e Amazon)**: validar como se aplicam, nome do cupom, cartão/emissora que dá o desconto, preço final | #112 | Nada feito; depende dos itens 1 e 3 (leitura de cupom na aba) | Não (eu opero a aba) |
| 3 | **Cupons: ML por anúncio (CUPOMPRAHOME) e cupom da Shopee** | #7, #8 | Leitura ML ampliada (+1.500 ofertas) sem confirmar envio; Shopee: 0 leituras no banco, sem loop | Não |
| 4 | **275 masters em `review` (política "só usado/retrô barra")** e barreiras de entrada | #83, #55 | Regra permanente de liberação não aplicada | Aval do dono para nova barreira |
| 5 | **Ciência e tecnologia: 10 segmentos restantes + decisão 5** (departamento Ferramentas, exceções de item miúdo, linha Fluke/Testo, anúncio livre, equipamento médico fora, R2-11 nos próximos lotes) | #60 | Rodar 10 segmentos; confirmar `SEMEADURA_LOJAS` | **Sim** (decisão 5) |
| 6 | **Bambu na Shopee e na Amazon** (P2S, P1S Combo) | #59 | Cron novo da Shopee ainda sem ciclo; Amazon depende da coleta assistida | Não |
| 7 | **Amazon fresca: `amazon-vitrine` parado ~22 h** e frescor | #81, #26 | Religar e medir | Não |
| 8 | **Foto com mão em oferta nova** (classificador automático) e origem de 101 anúncios do ML com foto da Shopee | #99 | Classificação ainda manual | Não |
| 9 | **Linhas `running` presas (reaper) e orçamentos de tempo; segundo disparador do `collect-prices`; `?key=`** | #72, #73 | 106 linhas presas; disparador não achado; flag off só depois de 48 h | Parcial (achar o disparador) |
| 10 | **Atualizar Next, sharp e zod** (aviso crítico) | #77 | Pacotes e testes | Não |
| 11 | **Receita real e cliques válidos** (importar conversões; excluir bots) | #78, #79 | Tabela de conversões vazia | Sim (credenciais) |
| 12 | **WhatsApp: 0 envios em 7 dias** e captação de inscritos | #100, #80 | Diagnóstico e plano | Sim (canal) |
| 13 | **Firewall: exceção para Googlebot/TelegramBot; `proxy.ts` sem `getUser` por requisição** | #85, #86 | Regra e código | Não |
| 14 | **Backup fora da máquina** | #71 | Escolher PITR do Supabase ou bucket | **Sim** |
| 15 | **Equipe da Vercel + privar o repositório** | #69 | `renatoarkos` na equipe da Vercel e no GitHub; depois privar | **Sim** |
| 16 | Magalu (pausado) | #61 | Login no portal, slug da loja, tabela de comissões | **Sim** (por último) |
| 17 | Demais P1/P2 da síntese (CI, LGPD, painéis, métricas, refatorações) | #87 a #110 | Ver 00-sintese.md | Alguns |

## C. Regras desta lista
- Pedido novo entra no fim desta tabela e na fila, **sem interromper** o item em andamento (salvo "urgente" do dono).
- A cada item fechado: atualizar a linha da fila, este checklist e `docs/decisoes-dono-2026-11-15.md`.
