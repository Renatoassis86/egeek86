# Checklist geral do que falta fazer (2026-11-16, antes da Black Friday de 27/11)

Escrito para o dono, em linguagem simples. "Dono" = depende de você; "Equipe" = os agentes e eu fazemos. Os números #NN são os da fila (`docs/fila-de-execucao.md`).

## A. Erros que você achou nos últimos dias (cada um vira regra do Fluxo Mestre)
| # | O que | Estado | Quem |
|---|---|---|---|
| A1 | Mínimo falso do PS5 (R$ 1.999,99): 102 cotações de anúncio isca apagadas, com backup | **Corrigido.** Falta o gatilho permanente para todos os itens e lojas (agente em andamento) | Equipe |
| A2 | Desconto "Itaú Mastercard 15%" empilhado sobre preço Pix | **Corrigido no ar** (cartão desligado, 28 linhas arquivadas, regra R-62). Falta reativar só com prova | Equipe + você (simulação autorizada) |
| A3 | Cupom de R$ 200 da P1S Combo que não existe mais | **Em correção** (leitor só no bloco do anúncio, releitura antes de enviar, retirar quando sumir) | Equipe |
| A4 | Por que a equipe deixa passar erros de cupom | **Em andamento:** análise de causa e um "cofre de validação" obrigatório (nenhum cupom sai sem prova; rede nova nasce bloqueada) | Equipe |
| A5 | Amazon sumiu do privado | **Corrigido** (voltou só para P2S e P1S Combo) | Equipe |
| A6 | Mensagens de impressora bagunçadas | **Feito** (lista enxuta, 5 melhores por modelo). Falta você olhar a primeira lista no Telegram | Dono |

## B. Cupons de plataforma inteira (cupom que vale para todos os itens)
| # | O que | Estado | Quem |
|---|---|---|---|
| B1 | Agente de cupons rodando | **Voltou a rodar** (cron separado) | Equipe |
| B2 | Cupom da Shopee não traz validade na tela, então nunca vira mensagem | **Decisão sua (D1):** aceitar sem validade, só com leitura recente? | Dono |
| B3 | Abrir "Condições" dos cartões da Shopee para ler a validade | **Decisão sua (D3)**, leitura única de teste | Dono |
| B4 | Mensagem própria de "cupom geral" e linha no site | **Decisão sua (D2)** | Dono |
| B5 | Códigos de banner do ML (CUPOMPRAHOME, DESCONTAOMELI): cadastro pelo seu código visto em tela | Quando você enviar código, valor, mínimo e prazo (D4) | Dono |
| B6 | Fontes públicas de cupons (Telegram e comunidades), Fase 1 | **Você aprova** a lista; antes eu leio os termos de uso | Dono + Equipe |
| B7 | Portal de cupons do ML lendo tudo (4.500 cupons, 90 min) | **Rodando** | Equipe |

## C. Loja Casa e catálogo
| # | O que | Estado | Quem |
|---|---|---|---|
| C1 | Aspiradores de pó (com e sem fio) faltando na Casa (#121) | Na fila: criar a busca e conferir | Equipe |
| C2 | Produtos que você enviou (auditoria de cobertura, #57) | Permanente | Equipe |
| C3 | Ciência e tecnologia: 10 segmentos restantes + decisão 5 (#60) | Depende de você (decisão 5) | Dono |
| C4 | Foto com mão em oferta nova (classificador automático, #99) | Hoje manual | Equipe |

## D. Preço, mensagens e integridade
| # | O que | Estado | Quem |
|---|---|---|---|
| D1 | Link no Telegram = preço da página, privado (#119) | **Fim do loop no privado** (2 medições seguidas) | Equipe |
| D2 | Canal e grupos ainda sem a conferência estrita (cobertura 32,6% no amplo, 2,9% no geral) | Ligar a trava só depois de 90% de cobertura, avisando você antes | Equipe |
| D3 | Placeholders do ML no site e no /go (338 de impressoras): conferir se mostram preço de outro anúncio | Na fila | Equipe |
| D4 | Amazon nos grupos e no canal (contenção #120 ainda ligada) | Liberar depois de cobertura boa das ofertas da Amazon | Equipe |
| D5 | Cards de queda do ML retidos por falta de confirmação recente | Investigar | Equipe |
| D6 | Cron de envio com pouca folga (50 s de 60 s) | Vigiar | Equipe |

## E. Antes da Black Friday (itens P0 da fila)
| # | O que | Quem |
|---|---|---|
| E1 | #69 Repositório GitHub público passar a privado (depende da equipe da Vercel, #15) | Dono |
| E2 | #71 Backup fora da máquina: cadastrar `DATABASE_URL` e `BACKUP_PASSPHRASE` nos secrets do GitHub e rodar o workflow uma vez | Dono |
| E3 | #73 Desligar o disparador duplicado do Supabase (`select cron.unschedule('geek-deals-collect-prices')`), depois fechar o `?key=` | Dono + Equipe |
| E4 | #70 Alerta do coletor com sonda externa | Equipe |
| E5 | #72 Reaper de linhas `running` presas e orçamentos de tempo | Equipe |
| E6 | #77 Atualizar Next, sharp e zod (aviso crítico) | Equipe |
| E7 | #85 e #86 Firewall para Googlebot e TelegramBot, e `proxy.ts` sem consulta a cada requisição | Equipe |
| E8 | #74 Transparência de afiliado sem aviso nos cards | Equipe |
| E9 | #81 Amazon fresca (religar `amazon-vitrine`) e loops que não param | Equipe |
| E10 | #82 Prime e cupom no ritmo do concorrente (promoção Prime ponta a ponta) | Equipe |
| E11 | #78 e #79 Receita real e cliques válidos (precisa de credenciais) | Dono |
| E12 | #80 Captação de inscritos (canal com 5 membros) | Dono + Equipe |
| E13 | Aumentar a capacidade do banco do Supabase para o pico | Dono |

## F. Depois da Black Friday ou sem urgência
#13 a #32 (flags, dias abertos, travas, CI, higiene), #87 a #110 (cargas, cache, LGPD, raspagem da Amazon), #49 (Fase C da landing), #61 Magalu (pausado, por último), #51 AliExpress (escolher opção), #52 segurança "overlord" (autorizar), #50 Tecnologia sem notebooks e celulares (decidir), #47 landing.

## G. Operação do Chrome (você)
- Fechar abas e janelas extras do Chrome: a máquina está com pouca memória e o Chrome recria abas congeladas, o que derruba os loops por alguns minutos (a equipe reinjeta, mas é desgaste).
- Carregar a extensão local `tools/chrome-loops-extension` (3 cliques em chrome://extensions): ela mantém os loops vivos.
- Quando o ML pedir captcha em um anúncio, resolver uma vez na tela.
- Quando a Amazon pedir login, entrar.
