# Auditoria de cobertura por produto do dono, 2026-11-16 (fila #130, rotina #57, #121)

Pedido do dono: "Preciso que esses itens entrem na loja Casa ... começar a monitorar esses itens."

| Item | Rede e referência | Antes | Depois |
|---|---|---|---|
| Electrolux Aspirador de Pó Vertical Sem Fio Ergorapido 3 em 1 Cyclonic Power 30 min Azul (PTEC101) Bivolt | Amazon `B0FRJ88YSC`; catálogo ML `MLB56864884` (GTIN 7909569485019) | ausente (nenhum master, nenhuma oferta) | master `a3327bd3-6d5c-410a-88e9-cf7541a5f1c3`, oferta Amazon `2ef3bd80-...` (R$ 512,90, tag do dono), oferta ML `d045e41b-...` (placeholder do catálogo, R$ 604,90 menor anúncio) |
| Cadeira Orbital 360 I-size, Black, Safety 1st | ML catálogo `MLB62322005`, anúncio `MLB4381320613` (loja oficial Safety 1st, R$ 1.499,90 na API; o dono viu R$ 1.424,90) | ausente | master `6f33a1a5-ac0e-47b2-8dcc-8646c7114f17`, oferta ML `07caf17e-...` (placeholder do catálogo, R$ 1.499,90) |

## Causa por item (medida)

1. **Aspirador PTEC101.** O segmento `aspirador-de-po` (Casa) existe desde 2026-11-11 e já tinha "vertical", "sem fio", "portátil" e a marca Electrolux. O produto existe no catálogo do ML (`MLB56864884`, 7 anúncios novos, 6 vendedores), mas a busca `aspirador de po sem fio electrolux` devolve 126 resultados, a maioria catálogos antigos sem vendedor (404 "No winners found", cada um gasta uma chamada). A semeadura só olha as primeiras páginas por termo, então o modelo novo (2025) ficava fora. Os termos eram só "tipo + marca", nunca "linha + modelo". Também não havia termos de aspirador com fio, de mão e de marcas como Dyson/Shark/Xiaomi G11.
2. **Cadeirinha Orbital 360.** Não existia segmento para cadeirinha infantil de auto/bebê conforto (domínio ML `MLB-BABY_CAR_SEATS`, medido ao vivo em `/products/MLB62322005`). Sem segmento, o semeador nunca buscou o domínio, e o tipo nem existia na loja Casa. Além disso, a regra de aprovação da Casa exigia VOLTAGEM para todo item do departamento: uma cadeirinha nunca seria aprovada (`voltagem_ausente`).
3. **Amazon.** Os ASINs entram na loja só ligados a um master já existente (fila do `amazon-assistida` parte de masters elegíveis; busca por texto do master). Sem master do aspirador, o ASIN nunca era buscado. Depois do master criado, o loop passa a ter o item na fila normal de descoberta e atualização.

## Causa geral e correção

Causa geral: cobertura de busca por TIPO de produto e por MODELO. Tipos fora do vocabulário elétrico da Casa (cadeirinha) não tinham segmento, e tipos com muitos catálogos mortos (aspirador) escondiam o modelo atual nas páginas profundas.

Correção (todas com teste, `scripts/test-cobertura-itens-dono-2026-11-16.ts` 16/16, `scripts/test-cobertura-tipos.ts` 930/930, `test-tipos-produto`, `test-semeadura` 859/859):

- `src/lib/catalog/vertical/config-tipos.ts`: segmento novo `cadeirinha-auto` (Casa, domínio `MLB-BABY_CAR_SEATS`, 12 marcas reais: Safety 1st, Chicco, Burigotto, Galzerano, Tutti Baby, Cosco, Maxi-Cosi, Graco, Kiddo, Joie, Infanti, Cybex; termos de cadeirinha, bebê conforto e assento de elevação; rank 216; domínio a confirmar como os demais tipos novos).
- `src/lib/catalog/vertical/config-ampliacao.ts`: termos extras do `aspirador-de-po` por modelo e linha (Ergorapido, PTEC101, Cyclonic Power, PowerSpeed, STK15), vertical sem fio / com fio / portátil × 8 a 15 marcas (Electrolux, WAP, Mondial, Philco, Britânia, Black+Decker, Dyson, Xiaomi, Shark, Samsung Jet, Bosch, Oster, Multilaser, Midea, Cadence, Arno, Kärcher, Philips Walita) e modelos Dyson V8/V11/V12/V15 e Xiaomi G11/G20. Entram no fim da lista (para não deslocar os índices das rodadas anteriores); para trazer um modelo à frente use `--termo`.
- `src/lib/catalog/vertical/scope-tipos.ts`: léxico e nicho do `cadeirinha-auto` (capa, protetor, espelho, cinto, redutor, base avulsa, cadeira de alimentação/escritório/gamer/praia/bicicleta ficam fora).
- `src/lib/catalog/aprovacao-nicho.ts`: `SEGMENTOS_SEM_ENERGIA` (voltagem não se aplica à cadeirinha; eletrodoméstico elétrico continua exigindo).
- `src/lib/catalog/tipos-produto.ts` e `cobertura-tipos.ts`: tipo "Cadeirinhas infantis para auto" na Casa e linha esperada na cobertura.
- `scripts/semear-vertical.ts`: opção `--termo "a|b"` (busca só estes termos exatos; é o caminho oficial para colocar um produto do dono sem varrer o segmento).
- `scripts/cobertura/ingerir-amazon-item-do-dono.ts`: ingestão de uma leitura de página `/dp/<ASIN>` pelo caminho oficial `ingestAmazonRows` (identidade, porteiro, tag do dono, tipo de preço R-69); simulação por padrão.

## Como entraram (caminho oficial, com backup e rollback)

- ML: `semear-vertical.ts --segmento aspirador-de-po --termo ptec101 --apply --termos-aprovados` (1 master, backup `backup/dados/semear-vertical-pre-2026-11-16T02-08-02-917Z.ndjson`, rollback `backup/logs/semear-vertical-2026-11-16T02-08-02-917Z.json`) e `--segmento cadeirinha-auto --termo "safety 1st orbital 360|cadeira para auto orbital 360"` (11 masters de cadeirinha, backup `...T02-09-28-927Z.ndjson`, rollback `backup/logs/semear-vertical-2026-11-16T02-09-28-927Z.json`). Reversão: `scripts/semear-vertical.ts --rollback <log> --apply`.
- Amazon: leitura somente da página `/dp/B0FRJ88YSC` no Chrome (R$ 512,90 em destaque, "De" R$ 979,90, "5% off à vista no Pix" é desconto extra, por isso `px=0`, preço cheio; Prime; sem carrinho). Ingestão com `ingerir-amazon-item-do-dono.ts --apply`: score 0,96, motivo `modelo_igual`, link `https://www.amazon.com.br/dp/B0FRJ88YSC?tag=manusmonteiro-20`.
- Marca de afiliado: a URL colada do ML trazia `matt_tool=38524122` (de outra pessoa, vinda do compartilhamento do WhatsApp). Nunca foi gravada nem usada; o master e a oferta usam só a URL de catálogo sem marca, e o link do dono nasce pela coleta (`matt_tool` do dono quando `MELI_TOOL_ID` está na Vercel) ou pelo loop `ml-links-ui.js` (meli.la).

## Mapeamento Casa

"Casa" é o departamento `eletrodomesticos` (`src/lib/catalog/departamentos.ts`, rótulo Casa, flag `dept_eletrodomesticos`). Ambos têm `vertical = 'eletrodomesticos'`. Aspirador entra pelo tipo `aspirador` e a cadeirinha pelo tipo novo `cadeirinha-auto`. A página lista só masters com oferta clicável e link de afiliado válido (R-70); o ML fica fora da página enquanto a oferta é placeholder pendente.

## Estado e pendências

- Aspirador: visível em Casa (consulta `listarDepartamentoAoVivo('eletrodomesticos', { q: 'ergorapido' })` = 1) pela oferta Amazon.
- Cadeirinha: aparece quando a coleta `collect-vertical?v=eletrodomesticos` (a cada 15 min) trocar o placeholder pelos anúncios reais (incluindo `MLB4381320613`) com link do dono.
- Mensagens só saem com todas as barreiras (R-61 isca, R-62/64 cupom/cartão, R-63, R-70 link do dono); nada foi enviado por esta tarefa.
- Dado a conferir do dono: o preço R$ 1.424,90 que ele viu difere dos R$ 1.499,90 da API (provável desconto de Pix/cartão no anúncio); o sistema guarda o preço de venda e trata o Pix pelas regras R-62/R-69.
- Sem relação com este pedido, mas visto no caminho: o master "2 Filtros Aspirador Vertical PowerSpeed Stk12..." (peça) e dois "Aspirador de Pó Descartável Cartucho Filtro" estão aprovados em Casa; ficam para o guardião de item miúdo (regra "sem itens miúdos").
