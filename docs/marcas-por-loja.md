# Principais marcas por loja e diversificação (2026-11-18)

Pedido do dono: variedade de **tipos dentro de cada loja** (e não só entre segmentos), enumerar as principais marcas e um algoritmo que dê esse fluxo.

## O que foi medido (últimas 4 h, antes da correção)
- **Esporte:** 82 bolas de 110 envios (75%). **Casa:** 85 air fryers e 33 aspiradores de 120. **Livros:** RPG e programação na frente.
- **Todos eram "Achado" (AC)**, avisos sem comparação de preço. Nenhum era queda de preço.
- Causa 1 (código): a cota por tipo é "suave": só segura o tipo quando existe alternativa na fila. As alternativas (quedas de produtos já enviados nas últimas 72 h, regra R-77) ficavam bloqueadas, então só restavam bolas e air fryers novos e a cota liberava.
- Causa 2 (oferta): o catálogo de Esporte tem 13 tipos e o de Casa 14; bola e air fryer concentram os produtos novos.
- Beleza: 0 produtos das 5 marcas preferidas (a semeadura da Beleza estava sem chamadas; corrigido com o segmento `marcas-beleza`).

## O algoritmo (só ORDEM, nada é excluído, exceto o teto do achado que adia para a hora seguinte)
1. **Teto duro do achado por tipo e loja:** no máximo 3 por hora (GROUP_TIPO_AC_POR_HORA). O excedente espera a hora seguinte e o produto não é consumido.
2. **Dentro de cada tipo da loja a ordem é:** marca preferida (Beleza) → degrau da régua → **cota de família** (3 primeiras palavras; quem saiu em 6 h vai atrás) → **cota de marca** (marca que saiu em 6 h na loja vai atrás) → popularidade (mais vendidos do ML) → recência.
3. **Entre os tipos da loja:** o menos enviado nas últimas 24 h abre a fila (rodízio por déficit).
4. Desligar: GROUP_TIPO_AC_POR_HORA=off, GROUP_COTA_ITEM=off, GROUP_MARCAS_PREFERIDAS=off.

## Limite honesto
Ordem e teto não criam variedade que o catálogo não tem: com o teto, uma loja pode enviar menos por hora até haver mais tipos. A segunda metade da solução é **mais tipos no catálogo** (próximo passo: ampliar a taxonomia de Esporte, Casa e Livros e semear por tipo).

## Principais marcas por loja (lista inicial minha; o dono confirma e ajusta em `src/lib/messaging/marcas-lojas.ts`)
- **Tecnologia:** Samsung, Apple, Xiaomi, Motorola, Logitech, Redragon, HyperX, Lenovo, Dell, Acer, ASUS, HP, Intel, AMD, NVIDIA, Gigabyte, MSI, Kingston, SanDisk, JBL, Anker, TP-Link, Multilaser, Positivo, Epson, Canon, Western Digital, Seagate, Corsair, Razer, Intelbras, Realme, Oppo, Huawei.
- **Eletroeletrônicos:** Samsung, LG, Sony, Philips, TCL, AOC, Panasonic, JBL, Bose, Xiaomi, Positivo, Philco, Multilaser, Canon, Nikon, GoPro, DJI, Roku, Intelbras, Elgin, Harman Kardon, Sennheiser, Marshall, Yamaha, Hisense, Semp, Britânia, JVC, Edifier.
- **Casa (eletrodomésticos):** Mondial, Philco, Britânia, Electrolux, Brastemp, Consul, Arno, Oster, Black+Decker, Walita, Cadence, WAP, Midea, Fischer, Suggar, Tramontina, Eos, Lenoxx, Agratto, Esmaltec, Continental, Dako, Kärcher, Bosch, Whirlpool, Gree, Springer, Midea.
- **Esporte:** Nike, Adidas, Puma, Olympikus, Mizuno, Asics, Penalty, Topper, Umbro, Wilson, Spalding, Mikasa, Kipsta/Decathlon, Oxer, Acte, Kikos, Polimet, Speedo, Fila, Under Armour, Reebok, Vollo, Gonew, Athletic, Caloi, Dream Fitness, Wellness, New Balance, Head, Babolat, Yonex, Technogym.
- **Livros (editoras):** Companhia das Letras, Intrínseca, Rocco, Record, HarperCollins, Aleph, Panini, JBC, DarkSide, Pearson, Novatec, Casa do Código, Alta Books, Sextante, Planeta, Arqueiro, Principis, Martins Fontes, Devir, Galápagos, Editora 34, Vozes, Mundo Cristão, Globo Livros, Zahar, Thomas Nelson.
- **Impressão 3D:** Bambu Lab, Creality, Anycubic, Elegoo, Prusa, Flashforge, Sunlu, eSun, Voolt3D, 3D Lab, Sethi3D, Kobra, Artillery, Phrozen, Polymaker, Overture, Sovol, Snapmaker.
- **Beleza:** as 5 do dono (Medicube, Tsubaki, Schwarzkopf, L'Oréal, Bioré) + MAC, Dior, Chanel, YSL, Lancôme, Estée Lauder, Maybelline, NYX, Vult, O Boticário, Natura, Eudora, Avon, Risqué, La Roche-Posay, Vichy, CeraVe, The Ordinary, Neutrogena, Kérastase, Olaplex, Wella, Truss, Taiff, Babyliss, Carolina Herrera, Paco Rabanne.
- **Games:** PlayStation, Xbox, Nintendo, Capcom, EA, Ubisoft, Rockstar, Konami, Bandai Namco, Square Enix, Sega, Activision, Warner, CD Projekt, FromSoftware.
