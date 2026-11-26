# Ata, 2026-11-26: benchmark e engenharia reversa do Pelando

Presidência: geek-lead (síntese feita pela sessão principal). Rodada 1 independente, seis frentes.
Pareceres completos: `docs/conselho/pareceres-2026-11-26-pelando/` (pesquisador-benchmark, arquiteto-next, engenheiro-coleta, precos-e-dados, produto-ux, qa-sre-riscos).
Natureza: consultiva. Nada foi implementado. Nenhum dado do Pelando foi gravado.

## 1. O que o Pelando é (fato observado em 26/11/2026)
- Comunidade de ofertas feita por usuários. Voto vira "temperatura", com comentários, alertas, cupons por loja, cashback, chat, app e grupos de WhatsApp.
- Front Astro com ilhas (um script por componente), mídia em servidor próprio com transformação na URL (webp, 200 e 500 px), API própria `api-web.pelando.com.br`, Cloudflare na frente.
- HTML de 276 KB (home) e 419 KB (oferta), TTFB de 0,18 s, `Cache-Control: public, max-age=60, stale-while-revalidate=240`, HIT de borda.
- SEO programático: sitemaps segmentados (recentes, cupons, lojas, discussões, meses) com `lastmod` e `changefreq` por URL, slugs `/d/<slug>-<hash>`.
- JSON-LD da oferta é `DiscussionForumPosting`, sem `Product` nem `Offer` (evita a política de preço do Google).
- Modelo de dados da oferta (página `/d/`): `temperature`, `commentCount`, `price` (digitado pelo usuário, sem tipo), `couponCode`, `freeShipping`, `cashback`, `status`, `mergedIntoId`, `redirectUrl` (redirecionador próprio).
- Não confirmado: cards do feed (carregam depois), corte numérico de frio, normal e quente, decaimento da temperatura, busca, moderação.

## 2. Onde somos melhores e onde ele é
| Nós | Pelando |
|---|---|
| Média única, histórico de preço, comparação entre lojas | Distribuição: SEO programático, sitemaps, cupons por loja |
| Cupom com prova (R-63 a R-68), filtro de isca (R-61) | Alertas, notificações, app, sensação de "agora" |
| Identidade de produto, cesta | Cache de HTML na borda (nossa home é `force-dynamic`) |

Conclusão comum aos seis: não competir em comunidade. Trazer a camada de distribuição e engajamento, alimentada por dado nosso verificado.

## 3. Lacunas nossas confirmadas no repositório
- Sem JSON-LD; sitemap único (`src/app/sitemap.ts`, `lastmod` muda a cada coleta); imagens `unoptimized`.
- Layout raiz lê `cookies()` e `headers()`, tornando tudo dinâmico; 93 arquivos com `force-dynamic`; 1 página pública com `revalidate`.
- Sem rota pública de cupons por loja; sem manifest ou service worker; alertas só por produto e preço-alvo.
- `oferta-encerrada` com texto fixo; `ranking` é espaço reservado.

## 4. Acordos
1. Usar o Pelando só como pista, nunca como fonte de preço, cupom, texto ou foto (R-82 camada de descoberta; R-61; R-79; cofre R-64 a R-68).
2. Não migrar para Astro; não fazer votação, chat, comunidade, cashback nem API pública agora.
3. Calcular os sinais só com dados nossos; temperatura calculada, nunca votada.
4. Baixo risco primeiro; nada que sobrecarregue o pool de 3 conexões.

## 5. Divergências e resolução proposta
- **JSON-LD com preço:** arquitetura quer Product/Offer já; QA veta preço sem leitura fresca (ML congelado: 54.131 de 54.221 ofertas ativas sem confirmação há mais de 12 h). Proposta: começar sem preço ou só com Amazon e Shopee frescos, com teste de igualdade entre JSON-LD e HTML; o ML entra quando a extração voltar.
- **Leitura do sitemap do Pelando:** coleta aceita só em piloto manual, no máximo 1 por hora, parando no primeiro 403, 429 ou captcha; QA lembra que não é parecer jurídico e que a cláusula 9 proíbe uso do conteúdo. Proposta: piloto manual de 2 semanas, sem automação, e só com aval do dono.
- **"Plataforma" na decisão de 25/11:** interpretada como rede de venda (Amazon, ML, Shopee). Precisa de confirmação.

## 6. Plano em ondas (proposto, nenhuma aprovada)
**Onda 1, baixo risco, sem tocar no pool**
1. Selo "menor preço em N dias" e sparkline no card (só dados nossos).
2. Sitemaps segmentados, com `lastmod` igual à última mudança real de preço.
3. Oferta encerrada com último preço, data e "ver outras cotações".
4. JSON-LD Product/Offer, conforme a resolução da divergência.
5. Tirar `cookies()` e `headers()` do layout raiz e fazer cache de borda em canário numa rota de oferta (única mudança que reduz carga no banco; exige ADR).

**Onda 2**
6. Alerta de preço-alvo por produto no Telegram (reaproveita `price-watches` e o vínculo do Telegram).
7. Abas de descoberta (recentes, maiores quedas, menor preço histórico) e "Mais quentes" curada por vertical.
8. Página pública `/cupons/<loja>`, só com o que o cofre libera. É o item de maior risco de regra.

**Onda 3, em sombra, com backtest**
9. Termômetro Geek v0 (0 a 100) por produto e rede, pesos a calibrar, base mínima de 3 ofertas e 3 vendedores, sem isca, preço fresco.
10. Alerta por palavra-chave resolvida para produtos da cesta; PWA com push; proxy de imagem em webp (antes, parecer do guardião do catálogo sobre direito de imagem).

## 7. Vetos
SSR por visitante ou API ao vivo sobre o pool atual; páginas em massa sem conteúdo único; Offer/Product sem leitura fresca; copiar conteúdo do Pelando ou usar a `api-web`; coleta com identificação camuflada ou pela aba logada do dono; conteúdo de usuários sem moderação; contas e alertas sem LGPD; otimização de imagem da Vercel sem teto de custo; migrar para Astro; análise pesada no banco com o envio ligado; concluir sem QA independente (R-87).

## 8. Decisões que são do dono
1. Autorizar ou não o piloto manual de leitura de sitemap do Pelando como pista (caso novo, vira regra no Fluxo Mestre).
2. Enviar ou não o contato ao Pelando (rascunho no parecer de coleta, não enviado).
3. Confirmar o sentido de "plataforma" nas médias.
4. Aprovar a Onda 1, ou parte dela, para entrar na fila.
5. Alternativas de cobertura com o ML parado: conferir no painel da Awin e da Lomadee quais programas existem para o nosso nicho.

## 9. Dados que faltam
Leitura humana integral dos Termos do Pelando; Search Console (valor real de SEO); LCP e TTFB do nosso site; hit ratio e custo atual da Vercel; cards do feed do Pelando; viabilidade de botão ou reação nos canais pelo Bot API.
