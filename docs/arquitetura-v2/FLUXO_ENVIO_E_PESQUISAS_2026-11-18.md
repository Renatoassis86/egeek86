# Fluxo de envio em tempo real: conta e pesquisas (2026-11-18)

Pedido do dono: aumentar o fluxo de envios para o Telegram; calcular o ciclo para tudo ir em tempo real; o que nao couber na hora pode repetir so na hora seguinte; usar mais vendidos/clicados das plataformas como prioridade; variedade de tipos; novas lojas; v2 em paralelo.

## 1. Medicao de hoje (08:00 a 09:00, Brasilia) [medido]
- Propostas criadas: ~2.000 por hora (a maioria repete os mesmos produtos). Enviadas em 24 h: 1.077. Expiradas sem envio: 29.606 (mediana 91 min na fila antes de expirar). Fila agora: ~3.600 propostas (games 1.162, tecnologia 742, eletroeletronicos 741, casa 644, esporte 372, beleza 304, livros 294, 3D 179).
- Ciclo (cron a cada minuto): 40 a 100 s, 3 a 6 envios por ciclo; deteccao 24 s (orcamento 22 s); envio saudavel 2 a 11 s por mensagem; envios que falham levam 23 a 60 s (timeout de conexao).
- Ritmo por hora: 4 (00h), 59, 57, 73, 81, 87, 60, 37, 111.
- Por loja (3 h): intervalo medio entre envios 4,7 a 6 min nas 5 lojas grandes; 25,7 min em livros; 45 min em impressao 3D.

## 2. Conta do ciclo [modelo; valores de entrada medidos acima]
- Por laco (loja): envios por ciclo = piso(B / (t + g)), com B = 38 s de orcamento, t = 7 s por envio, g = 3 s de espacamento por chat. = 3.
- 3 lacos (limite do pool de 3 conexoes): 9 envios por ciclo. Com ~0,8 ciclo por minuto (ciclos longos seguram o proximo): ~430 envios/h teorico.
- ANTES da correcao de hoje: o laco parava no primeiro envio (nao esperava os 3 s) => 1 a 2 envios por laco por ciclo e cada loja so era atendida de ~3 em ~3 min (rodizio de 3 lojas por minuto). Observado: 60 a 110/h. A correcao libera o ritmo teorico acima.
- Atraso maximo: fila de ~800 pendentes / 430 por hora = 1,9 h para drenar tudo; por isso o que importa e a ORDEM (prioridade), nao zerar a fila.
- Carga necessaria para "tempo real": se existirem lambda eventos dignos de envio por hora, a fila so fica curta (espera < 60 min) com utilizacao rho = lambda/mu < 0,5, isto e mu >= 2 x lambda. Com mu = 430/h, suporta lambda ate ~215/h (27 por loja por hora).
- Teto por tipo: TIPO_MAX_PER_HOUR = 2 por tipo e loja. Para 27 envios/h por loja sao precisos pelo menos 14 tipos ativos na hora. Variedade de tipos e vazao sao o mesmo problema.
- Proximos ganhos (ordem): (1) eliminar as falhas de 30 s (conexoes do banco) = +30%; (2) separar deteccao (24 s) do envio em dois crons e dar ao envio ~55 s = 3 x piso(55/10) = 15 por ciclo = ~900/h; (3) pool de conexoes maior no Supavisor (a medir antes).
- Regra "repete na hora seguinte": proposta que expira sem envio NAO consome o produto: a deteccao volta a propor no ciclo seguinte (nao ha cooldown sem envio). O cooldown de 8 h e a regra de 72 h valem so para o que foi ENVIADO. Mantido.

## 3. Sinais de popularidade das plataformas (pesquisa)
| Rede | Sinal | Como obter | Ja temos? |
|---|---|---|---|
| ML | Mais vendidos por categoria (ate 20) | `/highlights/MLB/category/{id}` | usado so para cobertura; falta virar prioridade |
| ML | Em alta | `/trends/MLB/{categoria}` | usado para gerar termos de busca |
| ML | Vendas acumuladas | `sold_quantity` | sim (coluna); e total, nao janela: usar delta semanal |
| Amazon | Mais vendidos / Movers / Ofertas do Dia | so paginas publicas; a Creators API nao tem operacao de best sellers | nao; Keepa traz salesRank (cliente existe em `src/lib/precos-fontes/keepa.ts`) |
| Shopee | Vendas por produto, ordenar por vendas | `productOfferV2` campo `sales`, `sortType: 2` | sim, usado em descoberta |
Score proposto (0 a 1; pesos provisorios a calibrar): 0,45 posicao em lista + 0,25 vendas normalizadas (dentro da mesma plataforma) + 0,15 em alta/oferta + 0,15 variacao recente; faltando sinal, redistribui o peso. O limite inferior de Wilson sobre cliques/envios penaliza evidencia pequena; decaimento por tempo estilo Lemmy `(horas+2)^1,8`.
Nao confirmado: visitas do ML (`/items/{id}/visits`), ofertas relampago por API, formato das paginas de ranking da Amazon.

## 4. Projetos parecidos (pesquisa)
Aproveitaveis como IDEIA (sem copiar codigo; PriceBuddy e GPL): PriceBuddy (regras de extracao por loja e alerta), python-amazon-paapi (MIT: espera de 1 s, tentativas com `Retry-After`), keepa-python (orcamento de tokens), KramerBot (historico de enviados e cortes por limiar), Wilson score (Evan Miller), ranking do Lemmy (decaimento), BullMQ (round-robin e limite por grupo). Conclusoes: coletar por orcamento de tokens por faixa (quente/morno/frio); score que penaliza pouca evidencia; variedade por COTA (round-robin entre lojas e tipos) com o score so ordenando dentro do grupo; dedup por preco enviado; tiers com reavaliacao. Nao ha clone aberto do Promobit/Pelando nem SDK de afiliados do ML.

## 5. Novas lojas (pesquisa; notas e comissoes sao ESTIMATIVA, confirmar nos paineis das redes)
Ranking: 1 Brinquedos e Colecionaveis (kidults +51% desde 2021; e-commerce 38% do setor), 2 Ferramentas e Bricolagem, 3 Instrumentos Musicais e Audio Pro, 4 Relogios e Wearables (risco de falsificacao), 5 Suplementos, 6 Bebe e Maternidade, 7 Pet (R$ 78 bi, ticket baixo), 8 Automotivo sem pecas, 9 Casa Externa. Recomendacao: abrir Brinquedos e Colecionaveis primeiro (fronteira com games a regrar), depois Ferramentas e Instrumentos. Depende da sua decisao; cada loja nova exige canal de Telegram, tipos, porteiro e migracao como a Beleza (R-97).
