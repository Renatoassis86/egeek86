# Afiliação a lojas de calçado esportivo (fila #40)

Pesquisa web de 2026-11-12 (páginas públicas da Awin e das marcas; nenhum cadastro feito, nenhum termo aceito). Comissões são "publicadas", não garantidas; o que não foi encontrado está marcado "não confirmado". Decisão do dono sobre cadastro: ver passos abaixo. Ordem de preferência de acesso: API > feed oficial > coleta assistida autorizada (como a Amazon). Scraping nunca.

## Tabela

| Marca / loja | Rede | Comissão publicada | API ou feed | Termos críticos | Recomendação |
|---|---|---|---|---|---|
| Adidas BR | Awin (ID 79926) | 7% comparação de preço, 7,5% cashback, 10% conteúdo, 4% e-mail | não confirmado | cookie 30 dias; cupom não enviado pela rede/Adidas zera a comissão | 1ª candidata: tem categoria "comparação de preço"; pedir feed e confirmar por escrito a elegibilidade do comparador |
| Dafiti / Kanui / Tricae | Awin (ID 17697) ou Rakuten | até 15% (comparadores 12% 1P, 6% 3P) | página cita "feeds de produto" | cookie 30 dias; pessoa física aceita; contato afiliadosbrasil@dafiti.com.br | 2ª: nomeia "comparadores"; pedir feed |
| Mizuno BR | Awin (ID 51271) | 6% | não confirmado | cookie 7 dias; lista comparadores como conteúdo permitido | boa candidata; pedir feed |
| Nike BR | Awin (ID 17652) | 2,5% portais/comparadores, 5,5% cupom, 7,5 a 12% conteúdo | não confirmado (cita só XML promocional) | aprovação pela própria Nike (semanas); cupom só enviado pela Nike; proíbe brand bidding, popup e extensões; cookie 7 dias | cadastrar; sem feed confirmado usar só links limpos até haver feed |
| Centauro | Awin (ID 17806) | 11% sem cupom, 6% cupom, 4% cashback | não confirmado | só pessoa jurídica; cookie 1 dia; proíbe SEM, e-mail, retargeting, popup | cadastrar como PJ; pedir feed |
| Puma BR | Awin | 8% | não confirmado | cookie 30 dias | pedir feed |
| ASICS BR | Awin | 7% | não confirmado | só pessoa jurídica | pedir feed |
| ArtWalk | Awin (ID 28773) | 4,1% | não confirmado | comparador não consta como permitido; só PJ | baixa prioridade |
| Authentic Feet | Awin (segundo agregador) | não confirmado | não confirmado | não confirmado | procurar no painel da Awin |
| Netshoes | Rakuten (2023) ou Awin (2026): fontes conflitam | até 13% (2023) | não confirmado | página oficial bloqueou a leitura | confirmar a rede atual direto com a Netshoes |
| Decathlon BR | Lomadee (2020), campanha pausada em agregador | não confirmado | não confirmado | sem evidência de programa ativo | não recomendada até a Decathlon confirmar |
| Under Armour, Olympikus, Zattini, Havaianas | Awin provável | não confirmado | não confirmado | não confirmado | verificar no painel da Awin |

Lomadee, Afilio, Actionpal, Admitad: nenhuma das marcas esportivas acima foi encontrada nessas redes (Decathlon na Lomadee só em 2020).

## O que isso muda para o hub

1. Quase tudo está na Awin: um cadastro cobre a maioria. A Awin oferece feed de produtos por download e API de publisher; a documentação lida não confirma feeds pt_BR e não diz se o uso em comparador é permitido: isso se lê nos termos de cada anunciante depois da aprovação.
2. Limites da Awin: 5 downloads simultâneos e 5 repetidos por hora por feed; API Enhanced de produtos 5 req/min. Baixar o feed só se a data de atualização mudou.
3. Nada disso é coleta de preço por API sem conta aprovada. Enquanto não houver aprovação e feed, a cobertura de calçados segue por ML (API oficial), Shopee (Affiliate Open API) e Amazon (coleta assistida).
4. Cupons: só publicar cupom enviado pela rede ou pelo anunciante (Nike e Adidas punem).
5. Links de saída devem ser limpos (Nike e Centauro proíbem popup/interação onsite em produto e carrinho).

## Passos do dono (nada disto foi feito pelo time)

1. Criar a conta de publisher na Awin Brasil como pessoa jurídica (Centauro e ASICS excluem pessoa física; a PJ também evita taxa operacional e conversão em euro).
2. No painel, buscar cada anunciante por nome e pedir "Join", declarando o site como comparador de preços. Prioridade: adidas, Dafiti, Mizuno, Nike, Centauro, depois Puma e ASICS.
3. Aguardar a aprovação de cada um (Nike pode levar semanas).
4. Com a aprovação: Toolbox > Create-a-Feed; copiar a chave de download dos feeds (diferente da chave da API de publisher) e guardar como segredo (nunca no repositório). Conferir a lista em productdata.awin.com/datafeed/list/apikey/<chave>.
5. Se o anunciante não oferecer feed, perguntar por escrito ao programa se o uso em comparador é permitido e se há feed ou API.
6. Netshoes: confirmar a rede atual antes de se cadastrar. Decathlon: perguntar se o programa existe.
7. Depois, avisar o time: o `engenheiro-coleta` constrói a ingestão do feed (cota e orçamento únicos, sem scraping) e o `integrador-apis` revisa os termos.

Fontes: Awin merchant-profile 17652, 17806, 79926, 51271, 28773, 17697; página de afiliados da Dafiti; docs de feed da Awin (help.awin.com/developers); Mercado & Consumo; agregadores (Affilitizer, affi.io, Cuelinks, FlexOffers).
