# Ata: Black Friday, por que a vitrine não vira produto, mensagem e seção (2026-11-12)

Porte: grande. Presidente: geek-lead. **Registro honesto:** esta ata foi redigida por um worker-fork, que não pode convocar subagentes; os pareceres abaixo são a síntese das perspectivas da mesa (estratégia, integração de APIs, coleta, DBA, QA, gamer) feita por uma só mão sobre dados medidos no banco. Não substitui parecer independente; o dono pode pedir a rodada formal.

## Pergunta
O dono vê milhares de produtos em promoção na Amazon (Black dos Sonhos), Shopee e Mercado Livre e não os vê no Telegram nem no site. Onde se perdem?

## Dados medidos (banco de produção, 2026-11-12 ~11h30 UTC)
- Os produtos que o dono mostrou (RE Village, Street Fighter 6, MK11, NBA 2K27, F1 25, Red Dead 2...) **já estão no banco** com ofertas ativas da Amazon. A perda não é de cadastro nesses casos.
- Ofertas ativas: Amazon 676 (games 344, livros 145, impressão 3D 74, eletrodomésticos 51, esporte 26, tecnologia 21, eletroeletrônicos 15); Mercado Livre 17.151; Shopee 2.243.
- Mensagens Amazon nas últimas 24 h: 103 enviadas, 175 expiradas sem envio, 52 propostas, 35 retidas; motivos: "expirada sem envio" 87, "revalidação: já não vale (preço velho, sumiu ou mudou)" 82.
- Frescor: só 256 das 676 ofertas Amazon ativas têm preço confirmado há menos de 40 min (regra de envio AMAZON_SEND_MAX_AGE_MIN = 40); 164 estão entre 1 h e 2 h. O laço assistido gira em ciclos de ~2 h (cicloMin) com teto de atualização de 240 masters.
- A descoberta da Amazon (fila `discover`) só busca masters que JÁ têm oferta ML/Shopee (`n_other > 0`). Produto que só existe na Amazon nunca entra. A página /blackfriday da Amazon é montada no navegador (HTML sem cards; curl sem login recebe 503), então só a aba logada lê.
- Não existia página/seção de Black Friday no site.

## Pareceres (síntese)
- Estratégia: o ganho de Black é velocidade e prova de queda real, não volume bruto. Seção própria com queda verificada, sem rótulo de promoção sem prova.
- Integração/APIs: Amazon só pela aba logada (sem API para a conta). Shopee: productOfferV2 por categoria/loja já plugado em cobertura-shopee (campo de desconto existe na API; falta ligar a cobertura, migration 0048 pendente). ML: sem endpoint oficial confirmado de "ofertas do dia" usado hoje; investigar antes de prometer.
- Coleta/DBA: não aumentar escrita (Supabase Micro). Priorizar a ORDEM da fila, não o volume.
- QA/Gamer: nada de selo "Black Friday" sem queda real contra a média única (>= 5 ofertas); um produto, uma média; só novo e em linha.

## Decisões
1. **Fila de atualização da Amazon prioriza os QUENTES** (master com oferta Amazon que gerou candidato de mensagem nas últimas 6 h) antes da ordem por checagem mais antiga. Reversível: reverter o commit. Sem escrita nova (só leitura na fila).
2. **Página pública /black-friday**: só dado real do banco; games/consoles/acessórios com queda confirmada nas 24 h e maiores quedas contra a média única (mesmas réguas e tetos de /ofertas, sem relaxar), mais as faixas das lojas Plus (menor preço do momento, sem média). Entra no sitemap.
3. **Pendentes (precisam de decisão/validação do dono ou de aba logada):** (a) modo "vitrine" da coleta assistida (consultas por categoria/marca para achar ASIN que só a Amazon tem; casar por dedup ao master existente, rascunho para o resto; mudar o loop é opt-in e exige simulação com `enviar:false`); (b) config do vigia com `cicloMin` menor (ex.: 45) para o laço assistido virar contínuo; (c) subir AMAZON_REFRESH_CAP (variável de ambiente, Vercel); (d) ligar a cobertura Shopee (migration 0048 + SHOPEE_VARIANTE_COLUNAS=1) e priorizar itens com desconto; (e) indicador de tendência de preço; (f) rótulo Black Friday no Telegram só com queda real.

## Fora do escopo desta rodada
Mudar a regra de frescor de 40 min (é decisão de risco do dono), qualquer criação de master a partir da Amazon sem passar pelo porteiro, scraping fora da aba logada.

## Adendo (ordens do dono repassadas pelo coordenador, mesma data)
**Plano 1 (continua):** atualização dos ASIN já conhecidos, agora com os QUENTES na frente (decisão 1). O modo vitrine também atualiza o preço de ASIN já conhecido que aparece nas buscas (ajuda o frescor de 40 min).

**Plano 2 (PRINCIPAL), implementado como opt-in:** modo `vitrine` da coleta assistida.
- Servidor: `GET /api/ingest/amazon-assistida?mode=vitrine` entrega ~60 buscas por ciclo (janela rotativa por hora, 202 consultas no total: jogos/consoles/acessórios por plataforma e editora + um conjunto genérico por tipo de cada loja Plus). `POST` com id de vitrine (prefixo 00000000-0000-4000-8000-) vai para `src/server/collector/amazon-vitrine.ts`; resumo em `collector_runs` job `amazon-vitrine` (inclui ids de masters e ofertas criados, para reversão).
- Regras: só card com preço lido; patrocinado fora; ASIN conhecido só atualiza preço (com checagem de preço implausível); ASIN novo passa por dedup (games: `casarJogo` com formato físico por padrão + guarda anti-duplicata por chave simples do título, porque `findExistingMasterProduct` falhou em "NBA 2K27 - PlayStation 5" x "NBA 2K27 - PS5"; Plus: `decidirMasterNovo`); master existente aprovado => mesmo julgamento de identidade da busca por master; master novo nasce em REVISÃO e a oferta nasce RASCUNHO (fora de média/selo/vitrine) até o dono aprovar na fila. Nada de scraping fora da aba logada.
- Para ligar: o vigia injeta o laço com `modos:['refresh','discover','vitrine']` (hoje o padrão segue refresh+discover; a mudança em `/loops/amazon-assistida.js` é só aceitar o modo). Primeiro com `enviar:false`.
- Orçamento de banco: teto de 60 buscas/ciclo (`AMAZON_VITRINE_CAP`), prazo de 50 s por POST, índice de dedup em cache de 10 min por instância.

**Exceção do retrô NOVO (dono, 2026-11-12):** `isNewRetroStyleHardware` (gate.ts): Hyperkin, Analogue, Retro-Bit e 8BitDo, sem 'usado/seminovo/recondicionado/open box/lote/peça/vintage', não caem nas regras de retrô/emulação (porteiro, léxico de identidade e julgamento da Amazon). Nintendo/Sony de época, console retrô genérico e tudo usado continuam fora. Testes em `scripts/test-amazon-vitrine.ts` (21/21). O SupaBoy (ASIN B0HFBFYBS2) não pôde ser cadastrado à mão porque não há preço lido (não se inventa): a consulta "hyperkin" da vitrine o pega com preço real assim que o modo for ligado; entra como rascunho via dedup.

**Plano 2b (cupons/promoções) — NÃO implementado nesta rodada:** ler `/blackfriday/2/` e `/promotion/psp/<ID>`, extrair ASIN, preço, "De" e, só se lido, nome/condição do cupom (app/sem nome = passo a passo). Motivo: essas páginas são montadas no navegador e não há HTML real para escrever e testar o leitor sem abrir a aba logada; criar leitor às cegas arriscaria dado errado. Próximo passo: um loop novo (`amazon-promocoes.js`) injetado pelo vigia numa aba logada, com simulação, mapeando card -> loja pelos mesmos porteiros e ignorando beleza/alimentos/fralda.
