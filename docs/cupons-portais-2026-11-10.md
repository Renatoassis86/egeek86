# Cupons nos portais — o que foi observado (2026-11-10, aba logada do dono, somente leitura)

Nada foi clicado ("Aplicar", "Eu quero" e "Usar" alteram a conta). Nenhum dado pessoal da conta é guardado aqui. Complementa `docs/cupons-2026-11-10.md` (contrato de dados do servidor).

## Mercado Livre — https://www.mercadolivre.com.br/cupons
- Central pública de cupons do comprador: **2.999 cupons** na leitura. Seções: Recomendados, "Mais de 10%" (982), "Mais de R$100" (29), Acabam hoje, Mais usados, Novos, Meus cupons.
- **Não são códigos de digitar** (existe o campo "Inserir código", mas os cupons da lista são **ativados por botão**: "Aplicar" ou, quando já ativos, "Conferir"). Ativar muda a conta do comprador: a rotina de leitura nunca clica.
- Campos legíveis por cartão: título ("30% OFF em Casa", "R$200 OFF em Samsung TVs"), escopo ("Em produtos selecionados", "Em produtos de <loja>"), **compra mínima** ("Sem compra mínima." ou valor), **limite de desconto**, **validade** ("Vence 31 de dezembro", "Vence em domingo"), e alerta "Está esgotando!".
- Escopos que dá para ligar às nossas ofertas: **loja** ("Em produtos de <nome do vendedor>": casa com o vendedor da oferta) e **categoria nomeada** ("Informática", "Samsung TVs"). "Em produtos selecionados" sem lista **não** se liga a um item com segurança.
- Na página de produto o cupom não aparece no bloco de compra; nos cartões de listagem aparece o **preço com cupom** ("R$ X com Cupom"), que é o sinal por item quando o cupom ativado vale para ele.
- Cupom é **dependente da conta** (alguns "Meus cupons", assinantes Meli+, ativos). Só o que qualquer pessoa pode ativar deve ir ao grupo.

## Shopee — vouchers
- **Carteira da conta** (https://shopee.com.br/user/voucher-wallet): 43 cupons na leitura, **muitos exclusivos** (lives, vídeo, "Sua Oferta Exclusiva", SParcelado) e vários vencendo em minutos, alguns com "% utilizado". **Não divulgar** cupom de carteira: é da conta do dono.
- **Página pública** (https://shopee.com.br/m/cupom-de-desconto, "Pegue mais cupons"): cartões com escopo ("TODAS AS LOJAS", "LOJAS OFICIAIS", categoria como "AUTOMÓVEIS E MOTOCICLETAS", "Produtos selecionados"), valor ("R$30 OFF", "50% OFF", "50% DE CASHBACK"), mínimo ("Nas compras acima de R$299"), limite ("Limitado a R$50"), e estado do botão: **"Eu quero"** (disponível) ou **"Esgotado"**. O texto de "Condições" é um link por cartão.
- Vários cupons são **cashback** (crédito em Moedas Shopee), não desconto no preço: a mensagem deve dizer isso.

## Regras que decorrem disso
1. Só cupom **público** (qualquer pessoa pode ativar/resgatar) entra em mensagem.
2. Cupom só entra no texto se **verificado nas últimas 2 horas** e com estado disponível (não "Esgotado", não vencido).
3. Cashback e desconto no preço são tipos diferentes e nunca se somam no preço exibido.
4. Cupom de escopo amplo ("Informática R$400 OFF acima de R$3.499") vira **mensagem própria de cupons verificados**; ligar a um item só quando o escopo for loja ou categoria nomeada, ou quando a listagem mostrar "com Cupom" para o item.
5. Nunca prometer: "sujeito a disponibilidade e às condições do cupom".
