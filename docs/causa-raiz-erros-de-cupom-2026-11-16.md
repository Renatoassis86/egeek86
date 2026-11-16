# Por que os erros de cupom e de benefício passaram (causa raiz) - 2026-11-16

Pergunta do dono: por que a equipe de agentes deixa passar esses erros de cupom? Resposta curta: **cada elo validava um pedaço e ninguém era dono da pergunta "este cupom/benefício foi PROVADO neste item, agora?"**. Os testes confirmavam o que o próprio autor escreveu, não a realidade da página. A correção é um cofre com uma função única e obrigatória (`podeDivulgar`, R-64).

## Os dois casos e os fatos
| | Itaú Mastercard 15% (Amazon) | CUPOM ATIVO P1S Combo NIC.3D (ML) |
|---|---|---|
| O que saiu | "com o desconto: R$ 6.716,00 (a confirmar no carrinho)" em ~28 ofertas | "Cupom de R$ 200,00, R$ 5.999 -> R$ 5.799" |
| Fato medido | o texto existe só num widget de marketing (`marketing-widget-url`) do bloco de parcelas; o preço lido (R$ 7.901,18) já é o "10% off à vista no Pix"; 7.901,18 x 0,85 = 6.716,00 empilhava desconto de pagamento excludente | única leitura positiva (01:01:43Z) vinda do texto "R$ 5.799 com Cupom" achado no texto INTEIRO da página de catálogo (vários vendedores), sem campaign_id; 13 min depois o item não tinha cupom e o modal `/cupons/pdp` respondia "Você não tem cupons disponíveis" |
| Alcance | 28 linhas em `offer_card_benefits` | 38 mensagens CUPOM em 24 h, **0 com campaign_id e 0 com nome** |

## O que cada elo validava, o que ninguém validava, e de quem era
| Elo | O que validava | O que NINGUÉM validava | Dono |
|---|---|---|---|
| Leitor da aba (Amazon `beneficiosCartaoDoc`; ML `extrairCupons`) | formato do texto (regex "cartão ... N%", "R$ X com cupom") | ESCOPO (bloco de compra do item x banner/outro vendedor) e VERDADE (a condição existe?) | agente de cupons / loops |
| Ingest do servidor | preço com cupom < preço da oferta; rótulo no formato | prova de campanha ativa no item (campaign_id + modal) | agente de cupons |
| `parseCardBenefit` / `derivar` | número plausível (pct <= 70%) | se o desconto de cartão se aplica sobre o preço já "à vista no Pix" (empilhamento) | agente de cartão (#112) |
| Agulha (`evaluateAgulha`) | frescor (120 min), condição da oferta, coerência do preço | se a LEITURA era real; aceitou 120 min mesmo medindo 22% de cupom morto em 1 a 2 h | agente de cupons |
| Releitura no envio (`loadFacts`) | roda a agulha de novo | usa as MESMAS leituras guardadas: não é leitura nova nem independente | mensagens |
| Guardião | fecha o aviso quando chega leitura "sem cupom" mais nova | agenda a releitura a tempo (houve 1 leitura em 14 h) | agente de cupons |
| Testes | `test-card-benefit-112` AFIRMAVA o preço derivado como correto; testes de cupom usam leituras sintéticas | página real, caso hostil, simulação de checkout | cada autor |
| Aprovação ("pronto") | o autor e o conselho conferem o próprio trabalho | verificação INDEPENDENTE contra a página | ninguém |

Conclusões: (1) **nenhuma regra dizia que um cupom precisa de prova no item**, então cada elo assumia que o anterior tinha provado; (2) o teste do autor virava o critério de "pronto"; (3) o dono da validação era difuso, logo ninguém; (4) o tempo de vida de cupom (minutos) era conhecido e aceito sem uma releitura obrigatória antes do envio.

## O que muda (regras R-62 a R-67 no `FLUXO_MESTRE.md`)
- **R-64 Cofre de validação obrigatória**: `podeDivulgar` (`src/lib/coupons/cofre.ts`) é o ÚNICO caminho para mensagem, card, lista, site, alerta privado e preço final. Estados lido -> validado -> divulgável -> revalidando -> revogado, TTL por tipo de prova (modal oficial do item 10 min; bloco de compra escopado 120; valor final impresso 10; simulação de checkout 30). Tabelas `coupon_validations` (estado e prova atuais) e `coupon_validation_trail` (por que liberou, barrou ou revogou), visíveis em `/admin/mensagens` e em `collector_runs` (`cofre-cupons`).
- **R-65 Padrão negado e registro de validadores**: rede nova ou tipo novo sem validador registrado em `VALIDADORES` = bloqueado; `scripts/test-cofre-cupons-122.ts --db` falha se existir rede ATIVA sem validador.
- **R-66 Prova de valor para preço final**: preço final de benefício só com prova de valor final (impresso pela página ou simulação); bloco de compra não basta.
- **R-67 Verificação independente obrigatória**: nenhum item de cupom ou benefício está "pronto" sem validação do agente `qa-verificador` (independente do autor), contra a página real, com o caso hostil do dono. O autor não fecha o próprio item.
- Medidor: `scripts/medir-cofre-cupons.ts` falha se houver aviso aberto sem prova vigente ou rede ativa sem validador, e mostra liberados/barrados/revogados por rede por dia.

## Simulação de checkout (prova de maior confiança) - procedimento para a equipe de cupons
Nunca compra. Só até ANTES de pagar. Quem opera é a aba logada do dono.
1. Escolher o item (fila do cofre: cupons em `revalidando` ou divulgados sem prova de valor) e abrir o anúncio na aba logada.
2. Clicar em "Comprar agora"/ir para o checkout **somente se o dono autorizar naquela sessão**; parar na tela de resumo do pedido (antes de "Confirmar compra"/pagar). Não preencher cartão, não confirmar, não adicionar endereço novo.
3. Ler no resumo: o valor final com o cupom/benefício, o nome do cupom aplicado e a compra mínima, se exibidos. Se o cupom NÃO aparece aplicado, o resultado é `nao_aplicado`.
4. Enviar `POST /api/ingest/cofre-simulacao` com `{ rows: [{ offer_id, coupon_ref, resultado: 'aplicado' | 'nao_aplicado', valor_final_cents, nome, minimo_cents }] }` (mesmo token e origem das outras rotas assistidas).
5. `aplicado` grava a prova `simulacao_de_checkout` (TTL 30 min, sustenta preço final); `nao_aplicado` REVOGA o cupom/benefício daquela oferta. Limite: 30 simulações por hora no total (`SIMULACOES_POR_HORA`), com resposta 429 acima disso. Sair do checkout sem pagar (fechar a aba/voltar ao anúncio).

## Etapas
- Etapa 1 (entregue): cofre puro + registro (ML, Amazon, Shopee provisória), tabelas, ligação na agulha de cupom e no benefício de cartão, revogação automática, painel no admin, medidor, gancho de simulação, regras e esta análise.
- Etapa 2: auditar o leitor da Shopee e cobrir o preço final de benefício por simulação; gravar decisão de benefício no cofre (hoje só o cupom grava linha); retirada do aviso pelo guardião ligada (`COFRE_RETIRAR_AVISOS=1`) depois de reinjetar o leitor ML v1.3.0; deletar a mensagem do canal quando o aviso é retirado (exige decisão do dono).
