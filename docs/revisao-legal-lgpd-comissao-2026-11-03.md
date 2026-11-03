# Revisão técnica e de redação: LGPD, termos e aviso de comissão (2026-11-03)

**Natureza deste documento.** Não é parecer jurídico. É uma revisão de conformidade técnica e de redação, feita por IA (perfil `estrategista-mercado`), para deixar os textos prontos para validação final por advogado. Nenhum texto aqui ou nas páginas deve ser tratado como juridicamente aprovado. Fontes legais conferidas apenas em sites oficiais (Planalto, ANPD, MJSP, CONAR); onde a fonte não foi lida na íntegra, está marcado.

Rótulos: **[FATO]** verificado no código; **[HIPÓTESE]** inferência a confirmar; **[REC]** recomendação.

## 1. Fatos coletados (auditoria do código)

### 1.1 Dados pessoais coletados e onde ficam
| Dado | Origem no código | Observação |
|---|---|---|
| E-mail, senha | `signUp` / `signInWithPassword` (Supabase Auth), `/entrar`, `/login` | Login por senha; link mágico só em `/login`. O texto antigo dizia "Magic Link" como forma principal: incorreto |
| Nome, WhatsApp com DDD | `completeRegistration` (`server/actions/auth.ts`) grava em `profiles` | WhatsApp é obrigatório no cadastro |
| Plataformas de jogo, perfil escolhido | `profiles.preferences` (jsonb) | |
| Divulgador: link de rede social, faixa de audiência | `preferences.affiliateOnboarding` | |
| Colecionador: tamanho, foco e **foto da coleção com o rosto** | `/entrar`, gravada em base64 dentro de `profiles.preferences.collectorOnboarding.facePhotoBase64`; vista em `/admin/usuarios` | Sem checkbox de consentimento, sem finalidade e sem prazo informados na tela. Obrigatória para quem escolhe colecionador |
| CPF ou CNPJ de vendedor | `server/actions/collector.ts` grava em `sellers.cnpj` em texto puro | `profiles.cpfHash` existe no schema, mas o CPF do vendedor não passa por hash |
| Jogos acompanhados e preço-alvo | `affiliate_price_watches` | |
| Carrinho (lista de interesse) | `affiliate_cart_items`; cada adição dispara e-mail ao admin com nome e e-mail do usuário (Resend) | |
| Lances, leilões, lista de espera de drops | `auction_bids`, `drop_waitlist` | **Nome completo do perfil é exibido na lista de lances** (`live-bid-room.tsx`) |
| Geek Coins (`geekPoints`) | `profiles` | Penalidade de 500 pontos por inadimplência em leilão (`auction.ts`) |
| Preferências e Telegram chat ID | `notification_preferences`, `telegram_link_tokens` (webhook `/api/webhooks/telegram`) | |
| Histórico de avisos | `notification_deliveries`: destinatário (telefone/e-mail) e payload com a mensagem inteira | Sem prazo de expurgo no código |
| Pesquisa (`/pesquisa`) | `survey_responses`, aceita anônimo; vincula ao perfil se logado | Ao apagar perfil, vira `null` e mantém a resposta |
| Cliques de saída | `/go/[slug]` e `/go/noticia/[slug]` gravam em `analytics_events`: oferta, `referer`, `user-agent`, preço no clique | **Não grava IP nem user_id** (conferido no código) |
| Telemetria de drops | `drop_access_log`: `ip_hash` (SHA-256 do IP sem sal, 32 caracteres), user-agent, user_id se logado | Hash sem sal de IPv4 é reversível por força bruta: é pseudonimização, não anonimização |
| Log de auditoria admin | `audit_log` com `ip_hash`, user-agent | Só ações de administradores |
| Busca | `/api/search` | **Não grava** o termo. Consulta cacheada no CDN |
| Visitante sem conta | `localStorage` `eg86_guest_watchlist` | Só no navegador; migra para a conta no login |

### 1.2 Cookies, analytics e terceiros
- **Cookies [FATO]:** `sb-…-auth-token` (sessão Supabase, necessário), `theme` (preferência visual, 1 ano, gravado por `document.cookie`), cookie PKCE do OAuth do Mercado Livre (`/auth/mercadolivre/start`, uso administrativo). `localStorage`: `eg86_guest_watchlist`.
- **Analytics / publicidade [FATO]:** nenhum Google Analytics, Meta Pixel, GTM, Hotjar, Clarity, Vercel Analytics, Speed Insights ou script de terceiros (`grep` em `src`; `package.json` sem esses pacotes; sem `<script>` nem `<iframe>`). Medição de cliques é própria, em banco.
- **Fontes [FATO]:** `next/font/google` é baixada no build e servida pelo próprio site; o navegador do visitante não chama o Google Fonts.
- **Imagens de produto [FATO]:** `images.unoptimized: true` e `remotePatterns: **`: o navegador do visitante carrega imagens direto dos servidores das lojas, que veem o IP. Divulgado no texto.
- **Barra da Vercel [HIPÓTESE]:** a auditoria de 2026-11-01 viu o cookie `__vercel_toolbar` em produção, e o inventário de 11-02 diz que desligar é tarefa do dono no painel. Se continuar ativo, o texto de cookies fica incompleto. **Confirmar antes de publicar.**
- **Prestadores [FATO]:** Vercel (hospedagem, crons em `vercel.json`), Supabase (Postgres e Auth), Resend (e-mail, `send-email.ts`), Telegram Bot API, Meta WhatsApp Cloud API (só se houver credencial; senão link `wa.me` aberto manualmente pelo admin), marketplaces por API. Região do projeto Supabase: **não consta no código**.
- **Mercado Livre / Shopee [FATO]:** relatórios de conversão importados não trazem identidade do comprador nos campos mapeados (item, valor, comissão, sub-id).

### 1.3 Aviso de comissão antes da revisão
Só existia (a) uma linha em `/termos` §5 (item "Divulgação") e (b) uma frase em `/sobre`. Nada no rodapé, nas páginas de oferta, no carrinho nem junto aos botões "Ir à loja". Links de saída já usam `rel="noopener noreferrer nofollow sponsored"` (oferta, carrinho, tabela de lojas). O link "Ver oferta" em `/monitoramento/comparar/[id]` e o botão em `results-grid.tsx` **não** têm `sponsored` (não alterei).

## 2. Lacunas contra a legislação

Fontes oficiais lidas: LGPD (Planalto), Marco Civil (Planalto), CDC (Planalto), guia de cookies da ANPD (out/2022, via busca), CONAR (guia de influenciadores, via busca), MJSP (ECA Digital). Texto de resoluções da ANPD: só localizadas, não lidas na íntegra.

| # | Tema | Exigência (fonte) | Situação antes | Gravidade |
|---|---|---|---|---|
| 1 | Identificação do controlador | LGPD art. 9º (informação clara e ostensiva) e Decreto 7.962/2013 (e-commerce: identificação do fornecedor) [REC: advogado confirmar aplicação] | Nenhum nome, CNPJ ou endereço no site | Alta |
| 2 | Encarregado | LGPD art. 41 §1º: identidade e contato divulgados publicamente; Res. CD/ANPD 18/2024. Agente de pequeno porte pode ser dispensado (Res. 2/2022), mas mantém canal com o titular. Dispensa não vale para tratamento de alto risco | Texto dizia "e-mail oficial no portal", sem e-mail nem nome | Alta |
| 3 | Bases legais e finalidades | Art. 7º; art. 9º I | Só "contrato e consentimento", genérico | Média |
| 4 | Dado sensível / foto do rosto | Art. 5º II (biométrico vinculado a pessoa) e art. 11 (consentimento específico e destacado) | Foto do rosto exigida sem texto, sem consentimento, sem prazo, guardada em base64 no jsonb do perfil | **Alta** |
| 5 | Direitos do titular | Art. 18 (I a IX), todos | Listava 3 dos 9 | Média |
| 6 | Compartilhamento | Art. 9º, 18 VII | Citava ML, Telegram, Resend; omitia Vercel, Supabase, Meta/WhatsApp, Shopee/Magalu/Amazon, imagens de terceiros | Média |
| 7 | Transferência internacional | Art. 33; Res. CD/ANPD 19/2024 | Ausente. Vercel, Supabase (região desconhecida) e Resend processam fora do Brasil | Alta |
| 8 | Retenção | Art. 9º II; art. 16 | Ausente. Não há expurgo automático no código | Alta |
| 9 | Cookies | Guia ANPD: estritamente necessários dispensam consentimento; demais exigem consentimento livre, informado, sem opção pré-marcada | Seção de cookies já existia, correta. Faltavam `localStorage` e o ponto da barra da Vercel | Baixa |
| 10 | Menores | Art. 14; ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026 segundo o MJSP) | Ausente. Site de games, com leilão, sem verificação de idade | **Alta** |
| 11 | Incidentes | Art. 48; Res. CD/ANPD 15/2024 (prazo para comunicar: **não confirmei o número de dias**, ver §5) | Ausente | Média |
| 12 | Marco Civil art. 15 | Provedor de aplicação (pessoa jurídica, atividade econômica organizada) guarda registros de acesso por 6 meses, sob sigilo | O app não guarda IP; os logs ficam na Vercel. Ponto para o advogado dizer se o site se enquadra e se os logs da Vercel bastam | Média |
| 13 | Publicidade identificável | CDC art. 36 ("fácil e imediatamente, a identifique como tal"); art. 37 §1º e §3º (enganosa por omissão); CONAR: identificação ostensiva, perto do conteúdo | Aviso escondido em `/termos` e `/sobre` | Alta |
| 14 | Cláusulas dos termos | CDC arts. 25, 51 [REC: advogado confirmar] sobre exoneração total e foro | "Nenhuma responsabilidade civil, criminal…" e foro fixo em João Pessoa | Alta |
| 15 | Termos como adesão | Art. 9º, §1º LGPD (consentimento não vale se informação não transparente) | "Concorda automaticamente" | Baixa |

### Problemas de código/produto descobertos (fora do meu escopo editar; encaminhar)
1. **`/contatos`: o formulário não faz nada.** A action é um placeholder vazio (`// Form action placeholder`). Quem preenche acredita que enviou. Há risco de CDC (informação) e de perda de contatos de clientes. Corrigir ou trocar por link de e-mail.
2. **WhatsApp ligado por padrão no banco:** `notification_preferences.whatsapp_orders` tem `default(true)` no schema Drizzle. Quando a linha é criada ao alternar alerta de e-mail ou ao vincular o Telegram, o usuário passa a constar como tendo autorizado o WhatsApp sem ter clicado. A tela mostra `?? false` apenas quando não há linha. Isso invalida o "consentimento" que o envio exige. Mudar o default para `false` exige migration (fora do meu escopo); confirmar também o valor real no banco.
3. **Alertas por e-mail e Telegram nascem ligados** (`email_price_alerts`, `telegram_price_alerts` default `true`). Aceitável se a base for execução do serviço pedido (usuário acompanhou o jogo), mas o advogado deve decidir.
4. **CPF/CNPJ em texto puro** em `sellers.cnpj`; foto do rosto em base64 no jsonb; considerar criptografia, segregação e prazo.
5. **Nome completo público nos lances.** Sugerir apelido de exibição.
6. **Sem exclusão de conta nem exportação de dados na interface:** hoje só por pedido manual. Precisa de processo interno e prazo.
7. **`ip_hash` sem sal** (drops): trocar por HMAC com segredo.
8. **E-mail ao admin a cada item adicionado ao carrinho** contém nome e e-mail do usuário: é tratamento que a política precisa cobrir (cobri em "Resend").
9. **Penalidade de 500 pontos** conflita com ADR 0003 ("XP nunca diminui"; a penalidade atual atinge `geekPoints`). Decisão de produto, não jurídica.
10. A interface de `/entrar` oferece a opção "Divulgador"; a palavra "afiliado" não aparece para o cliente (conferido). Mantida a regra.

## 3. O que mudou

Arquivos alterados (sem commit, sem deploy):
- `src/app/(shop)/privacidade/page.tsx`: reescrita em 12 seções (controlador, dados, finalidades e bases legais, compartilhamento, transferência internacional, retenção, direitos art. 18 completos, encarregado, cookies e `localStorage`, menores, incidentes, mudanças), mesma estrutura visual (Card de resumo, seções com `Reveal`). Removidas afirmações falsas ou imprecisas: "Magic Link" como login, "lances efetuados" como único uso, "Privacidade Blindada" (promessa absoluta), "Resend… rigorosos padrões".
- `src/app/(shop)/termos/page.tsx`: aceite sem "automaticamente"; idade mínima; cláusula de responsabilidade "na medida permitida em lei" (sem o ⚠️), foro com ressalva do domicílio do consumidor; nova seção **6. Divulgação** com âncora `#divulgacao`; remoção de "criminal" e de "integral e exclusiva"; "Soft Close" e penalidade mantidos como estão no código.
- `src/components/legal/commission-notice.tsx` (novo): texto único `COMMISSION_NOTICE_TEXT` = "Podemos receber uma comissão pelas compras feitas pelos nossos links, sem custo extra para você." + link "Saiba mais" para `/termos#divulgacao`. Sem a palavra "afiliado".
- Aviso inserido em: rodapé (`site-footer.tsx`, todas as páginas com rodapé), tabela de lojas (`product-stores-table.tsx`, usada na página de oferta e na pesquisa), carrinho (`carrinho/page.tsx`).
- **Banner de cookies: não criado, de propósito.** Só há cookies necessários e a preferência de tema; nenhum cookie opcional. O guia da ANPD dispensa consentimento para os estritamente necessários. Se a barra da Vercel estiver ativa para visitantes ou se entrar analytics, o banner passa a ser exigido (recusar por padrão, botões "Recusar", "Aceitar" e "Configurar" com mesmo destaque).

`tsc --noEmit`: sem erros fora de `.next/types`.

## 4. Marcadores [PREENCHER] (informações que só o responsável tem)
1. Razão social ou nome, CNPJ/CPF e endereço do controlador (privacidade §1; termos §1)
2. Nome ou função do encarregado (privacidade §8)
3. E-mail dedicado do encarregado (privacidade §8; hoje usa `contato@egeek86.com`)
4. Região do projeto Supabase (privacidade §4)
5. Mecanismo de transferência internacional por prestador (privacidade §5)
6. Prazos de retenção por tipo de dado (privacidade §6)
7. Base legal e prazo da foto do rosto e do CPF/CNPJ (privacidade §3)
8. Avaliação do ECA Digital e verificação de idade (privacidade §10)
9. Prazo, forma de pagamento e arrependimento nos leilões (termos §3)
10. Confirmar que a comissão não influencia ordem/destaque de preço (termos §6)

**As páginas não devem ir ao ar com esses marcadores visíveis.** Ou o responsável preenche, ou o advogado fecha a redação.

## 5. Pontos que o advogado deve validar
1. Enquadramento do controlador (pessoa física, MEI ou PJ) e se cabe a dispensa de encarregado como agente de pequeno porte (Res. CD/ANPD 2/2022).
2. Base legal correta para foto do rosto (sensível? biométrica? consentimento específico, art. 11) e para CPF/CNPJ do vendedor; se a coleta deve continuar enquanto não houver consentimento destacado.
3. Aplicação do **ECA Digital (Lei 15.211/2025)** a um site de games com leilão (acesso provável por menores) e eventual exigência de verificação de idade; decreto regulamentador (a ANPD cita Decreto 12.880/2026; fontes divergem na grafia, **conferir**).
4. Prazo de comunicação de incidente (Res. CD/ANPD 15/2024): a busca não mostrou o número de dias; conferir o texto oficial.
5. Mecanismo de transferência internacional (Res. CD/ANPD 19/2024, cláusulas-padrão) para Vercel, Supabase e Resend, e contratos/DPAs desses prestadores.
6. Se o site é "provedor de aplicação" para o art. 15 do Marco Civil e se os logs da Vercel cumprem a guarda de 6 meses.
7. Legítimo interesse (art. 7º IX): registro dos cliques e da telemetria de drops; precisa de teste de balanceamento (LIA) documentado.
8. Validade das cláusulas de limitação de responsabilidade (CDC art. 51) e foro; solidariedade da cadeia (CDC arts. 7º e 25) para itens de loja parceira.
9. Natureza do leilão entre colecionadores (relação de consumo ou civil), penalidade em pontos, sem prazo de pagamento definido.
10. Aviso de comissão: texto aprovado atende CDC art. 36 e o guia do CONAR; posição (rodapé, tabela de lojas, carrinho) é suficiente ou deve aparecer em cada card de oferta e em cada "Ir à loja"? Não consegui ler o texto exato do guia do CONAR sobre links de afiliados (a busca só devolveu trechos), portanto não afirmo o rótulo exato exigido.
11. Regras dos programas parceiros (Mercado Livre, Shopee, Amazon Associados, Magalu): podem exigir texto específico de divulgação. **Não verifiquei.** Amazon, se ativo, costuma exigir frase própria.
12. Cobertura do consentimento para WhatsApp e e-mails de marketing, e o default de alertas ligados.
13. Compromisso do §6 dos termos sobre identificar parceria paga/patrocínio (promessa de conteúdo).
14. Regime de menção a "Geek Coins" como pontos sem valor monetário (sem equivalência em dinheiro) para evitar enquadramento como moeda/promoção.

## 6. Próximos passos (ordem sugerida)
1. Dono: preencher os 10 marcadores e confirmar o estado da barra da Vercel.
2. Dev (fora deste escopo): corrigir `/contatos`, default de `whatsapp_orders` (migration), sal no hash de IP, apelido nos lances, fluxo de exclusão/exportação.
3. Advogado: validar a lista da seção 5.
4. Só então publicar. Métrica: marcadores = 0; aviso de comissão visível em 100% das páginas com "Ir à loja"; zero termos "afiliado" na interface do cliente.
