# Mapa dos pontos que emitem URL de produto ao usuário (R-70, 2026-11-16)

Regra do dono: todo link que o usuário recebe, no site e nas mensagens, é link de afiliado do dono. Padrão NEGADO: o que não casa com o padrão registrado não sai.
Fonte única: `src/lib/affiliate/link-afiliado.ts` (`ehLinkAfiliadoValido`, `linkAfiliadoDe`, `auditarUrlsDeMensagem`, `linkPublicavelSql`). Medidor: `scripts/medir-links-afiliado.ts`. Teste: `scripts/test-link-afiliado-r70.ts`.

## Padrões válidos (REGISTRO)
| Rede | Vale | Não vale |
|---|---|---|
| Amazon | `https://(www.)amazon.com.br/...` com TODOS os `tag=` iguais à tag do dono (`AMAZON_ASSOCIATE_TAG`) | `a.co`, `amzn.to` (a tag não é verificável), sem tag, tag alheia, http, outro domínio Amazon |
| Mercado Livre | `https://meli.la/<código>` ou URL `*.mercadolivre.com.br` com `matt_tool` = `MELI_TOOL_ID` do dono | URL crua `/p/MLB...`, `matt_tool` de outro id |
| Shopee | `https://s.shopee.com.br/<código>` | `shopee.com.br/...` direto |
| Magalu, AliExpress, KaBuM | registradas SEM padrão: nenhum link vale | tudo |
| Rede nova | nenhum link vale até existir padrão no REGISTRO | tudo |

Institucionais permitidos (lista explícita e pequena, `HOSTS_INSTITUCIONAIS`): `www.egeek86.com`, `egeek86.com`, `t.me`, `telegram.me`, `chat.whatsapp.com`, `whatsapp.com`, `wa.me`.

## Pontos de emissão e quem valida (depois da R-70)
| # | Ponto | Arquivo | O que emite | Validação (camada) |
|---|---|---|---|---|
| 1 | Redirecionador `/go/<slug>` | `src/app/go/[slug]/route.ts` | 302 para `affiliate_url` | L5: revalida com `ehLinkAfiliadoValido`; Amazon sem tag é reescrita; o resto vai para `/link-em-ativacao` e grava bloqueio. Antes: só `affiliate_link_pending` e `http(s)`. |
| 2 | Mensagem do canal/grupos (texto, legenda, botão "Ver oferta e comprar") | `src/server/messaging/group-queue.ts` -> `sendTelegramGroupMessage` | `buildGoLink` (site/go), `buyUrl` direto (meli.la, s.shopee, amazon com tag), convite WhatsApp | L4: `porteiroDeEnvio` (texto + botão + `/go` resolvido na oferta, com banco) e barreira pura dentro de `sendTelegramGroupMessage`. URL do botão gravada em `group_messages.candidate.botaoUrl`. Antes: ninguém conferia o botão. |
| 3 | Canal Destaques (2ª publicação, mesmo texto e botão) | `group-queue.ts` | idem | L4 pura em `sendTelegramGroupMessage`. |
| 4 | Aviso "cupom encerrado" / cartão | `src/server/messaging/guardiao-cupons.ts` | texto sem produto | L4 pura em `sendTelegramGroupMessage`. |
| 5 | Lista e quedas das impressoras 3D (privado) | `src/server/messaging/painel-impressoras.ts` | `/go` e texto; chamada direta ao Telegram (`tg`) | L4 pura em `tg()` (sendMessage/sendPhoto, incluindo `reply_markup`) e em `sendTelegramGroupMessage`; consulta da lista usa o predicado L3. |
| 6 | Avisos privados ao dono, resumo diário, alertas | `src/server/notifications/send-telegram.ts` (usado por `aviso-impressoras`, `monitor-preco-impressoras`, `heartbeat-store`, `send-daily-digest`, `collector-health`, webhook) | texto livre | L4 pura em `sendTelegramMessage`. |
| 7 | Alerta de auditoria de links, descoberta de lojas, alerta do porteiro | `auditoria-links.ts`, `stores-discover.ts`, `porteiro-links.ts` | só texto sem URL / só leitura | Fora da barreira por desenho (lista de exceções no teste; o porteiro tira `https://` do detalhe do alerta). |
| 8 | Site: listas, detalhe, busca, sitemap, vitrines | `src/server/queries/affiliate.ts`, `src/app/sitemap.ts`, `src/server/vitrines/pool.ts`, `src/server/queries/departamento.ts` | páginas e `/go/<slug>` (a `affiliate_url` nunca vai ao navegador) | L3: `linkPublicavelFilter` (oferta sem pendência e com marca do dono). Vitrines e departamento já exigiam `affiliate_link_pending = false`. |
| 9 | Seleção de ofertas para mensagens | `src/server/messaging/group-offers.ts`, `live-recheck.ts` | candidatos | L3: mesmo predicado. ML continua só com `meli.la` (regra do dono de 2026-11-11). |
| 10 | Admin (`/admin/ofertas/[id]`, aprovação) | `src/app/admin/...`, `src/components/admin/aprovacao-view.tsx` | links para o próprio dono conferir | Fora do escopo público (o teste varre só componentes e páginas não-admin). |
| 11 | Gravação da oferta | todos os coletores, `ingest/ml-links`, `ingest/amazon-assistida` | `affiliate_url` | L2: trigger `affiliate_offers_link_trg` (migration 0063): Amazon ganha a tag; `affiliate_link_pending` = NOT link válido; nunca rejeita. |
| 12 | WhatsApp, e-mail, feeds | não existem hoje | - | Quando existirem, usar `auditarUrlsDeMensagem`/`porteiroDeEnvio` (R-70, regra "rede ou canal novo"). |

## O que o medidor garante (L6)
(a) ativas publicáveis sem link estrito válido = 0, pendentes nunca passam no predicado público, rede com oferta ativa sem padrão = 0, config banco = código, trigger ativo;
(b) mensagens enviadas nas últimas 24 h com URL fora do padrão (texto e botão) = 0 e `/go` citados cujo link hoje não vale = 0;
(c) amostra de páginas do site sem href externo de loja sem marca. Aparece em `/admin` (fluxo: alertas `link-sem-marca` e `link-bloqueado`).
