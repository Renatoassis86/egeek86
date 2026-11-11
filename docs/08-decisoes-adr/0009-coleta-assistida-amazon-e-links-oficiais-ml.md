# ADR 0009 — Coleta assistida da Amazon e links oficiais de afiliado do Mercado Livre

- Data: 2026-11-10
- Status: aceito pelo dono ("Autorizo tudo"); riscos contratuais assumidos por ele.
- Emenda a: regra de 2026-10-28 ("coleta somente por API oficial; raspagem proibida").
- Ata: `docs/conselho/atas/2026-11-10-integracao-amazon-aliexpress.md` (e inventário em `docs/inventario-lojas/`).

## Contexto
A Amazon BR não tem acesso a API para a conta (Creators API exige conta de Associados aprovada e 10 vendas qualificadas em 30 dias; a conta tem 0 vendas). A Licença de PI da Amazon exclui robôs e extração de dados e limita o cache de preço a 24 horas. O dono precisa de preços de todas as lojas durante a Black Friday (27/11/2026) e de comissão por venda. No Mercado Livre, os links do banco eram `...?matt_tool=ID` direto ao anúncio; o painel do afiliado contou 1 clique contra 19 do site.

## Decisão
1. **Amazon:** coleta assistida automática pela aba logada do dono (laço de 2 em 2 horas, 4 a 7,5 s por busca, 400 produtos do topo + 300 em rodízio), enviando os resultados para `POST /api/ingest/amazon-assistida` (token dedicado; CORS só amazon.com.br; sem token = 503). Parada automática em captcha ou status diferente de 200; sem contornar verificações. Dado sem origem não entra: sem preço lido, sem oferta.
2. **Mercado Livre:** substituir `affiliate_url` das ofertas ativas visíveis pelo link oficial `meli.la/...` gerado no Gerador de links, um por vez, via `POST /api/ingest/ml-links` (reversível por `collector_runs.meta.trocas`).
3. Esta emenda NÃO vale para outras lojas: Shopee, AliExpress e Magalu seguem pela regra de API oficial até nova decisão.

## Consequências e riscos aceitos
- Depende do computador do dono (Chrome aberto e logado). Alarme de parada: regra `amazon-assistida` (3 h) em `slo.ts`; só envia com `COLLECTOR_ALERTS=1` e destino configurado.
- A Amazon pode suspender a conta de Associados e reter comissões (violação material da Licença de PI; cláusula 5 exige aviso de remuneração, que o dono dispensou). Preço da Amazon exibido com data e hora.
- O Gerador de links do ML adiciona cada produto à lista pública "Minhas recomendações" do perfil do dono.
- Preço histórico da Amazon guardado contraria o limite de cache de 24 h da Licença de PI.

## Reversão
Desligar: remover `AMAZON_INGEST_TOKEN` na Vercel (rotas respondem 503) e fechar as abas. Restaurar links do ML a partir de `collector_runs.meta.trocas`.
