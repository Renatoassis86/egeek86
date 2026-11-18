# Tudo o que o dono pediu (consolidado em 2026-11-19) e o estado real

Legenda: [x] feito e verificado · [~] implementado, nao verificado ou parcial · [ ] pendente · [?] aguarda decisao do dono.

## A. Fluxo de envio (Telegram) e diversidade
- [ ] **Voltar a enviar o maximo de produtos, o tempo todo, com a maior diversidade** (pedido de hoje). Envio parado desde as 14h de 18/11 por saturacao de disco do banco (ver secao L).
- [x] Envio mais rapido (laco espera 3 s e segue; deteccao e envio em invocacoes proprias) e o que nao couber na hora volta na hora seguinte.
- [x] Link de compra no texto de toda postagem; vitrine de jogos ate R$ 200 a cada 30 min (sai mesmo com o resto parado).
- [~] Diversidade por tipo dentro de cada loja: teto adaptativo do achado, cota de familia, de marca e de tipo (**desligada** durante o incidente), principais marcas por loja (exceto games), ordem de marca no pool.
- [~] Variedade medida na melhor hora (194 envios): Tecnologia 20 tipos, Eletronicos 10, Esporte 6 (74% bola), Casa 3 (90% air fryer), Beleza 4, Livros 1.
- [~] Popularidade das plataformas como prioridade (mais vendidos do ML em `offer_popularity`, 345 itens); falta Shopee (vendas) e Amazon (Keepa).

## B. Catalogo
- [~] Catalogo maior de tipos: semeadura de todas as lojas (**pausada** no incidente); marcas preferidas da Beleza (Medicube, Tsubaki, Schwarzkopf, L'Oreal, Biore): 26 produtos no banco, **0 mensagens**.
- [ ] Novos tipos de Esporte, Casa e Livros (taxonomia) e semear por tipo; notebooks (13 reais); livros na Shopee.
- [?] Nova loja Brinquedos e Colecionaveis (e outras da pesquisa: Ferramentas, Instrumentos...).

## C. Site
- [x] "Espaco Geek Plus" virou **Arkos Price** (/arkos-price, /plus redireciona).
- [ ] **Hierarquia robusta dos destaques** (quais produtos aparecem primeiro em cada destaque).
- [ ] Todos os produtos coletados na vitrine.

## D. Cupons
- [ ] Cupons (0 mensagens em 24 h): ler a pagina de cupons de cada plataforma e o item; cartao/credito Amazon com prova no item.

## E. Plataforma v2 (cronograma por dias)
- [ ] Alerta por usuario (ciclo fechado), JSON-LD e canonical, landing da Black Friday (27/11), canario de leitura, score de interesse em sombra, materializar ofertas publicas, pagina por produto mestre.
- [ ] **Passo a passo da assinatura do Keepa** (voce pediu para as 9h; ainda nao preparei).
- [~] Radiografia do banco (todas as variaveis extraidas): **interrompida** porque derrubou o banco; refazer leve.

## F. Marca
- [x] Logo v2 (raquetes iguais, bola quadrada), 8 variacoes, kit para o ChatGPT com slogans e cards por loja.
- [ ] Trocar o logo antigo pelo novo nos cards enviados ao Telegram.

## G. Operacao
- [x] Vigia dos loops a cada 30 min, status de 15 em 15 min, relatorio de 6 em 6 h. [~] O Chrome trava e troca as abas a cada 30 a 60 min.
- [x] Guia Mestre atualizado (R-103 e demais).

## L. Incidente do banco (causa de tudo estar parado)
- Servidor pequeno (~1 GB de RAM; banco de 1,49 GB). Mais de 1 TB lido do disco em 3 dias; 507 GB de arquivos temporarios.
- Quem mais le disco: estatisticas de preco (320 GB), historico de envios (143 GB), contagem de cotacoes (91 GB), ultima execucao de job em `collector_runs` (65 GB).
- Pausados por variavel de ambiente: 7 `collect-vertical`, semeadura, cotas por item.
