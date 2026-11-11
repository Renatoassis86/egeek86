# Inventario do catalogo por loja

Gerado em 2026-11-11T17:33:10.248Z a partir do banco (somente leitura). Retrato do momento: o inventario vivo e a pagina **/admin/catalogo** (so admin), com historico diario dos ultimos 14 dias; este documento e os CSVs devem ser regenerados quando lojas, produtos ou fontes mudarem.

Regerar: `npx tsx --conditions=react-server --env-file=.env.local scripts/gerar-inventario-catalogo.ts`

Definicoes: produto = master_product nao fundido; status = veredito do porteiro (sem veredito = aprovado); oferta ativa = status active, fora da quarentena de preco e com preco > 0; link oficial = Mercado Livre `https://meli.la/...`, demais redes link nao pendente; media unica = ultima linha de `price_daily_state` com media calculada (cada oferta vale 1 por dia). Nenhum dado e estimado ou preenchido.

## Totais por loja

| Loja | Aprovados | Em revisao | Rejeitados | Ofertas ativas | Link oficial | Aprovados com media | Faixa de preco | Ultima coleta |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Games | 4.324 | 504 | 1.575 | 9.995 | 37,5% | 19,8% | R$ 4,99 a R$ 10.000.000,00 | 2026-11-11T17:33:01.553Z |
| Impressão 3D | 58 | 59 | 0 | 1.485 | 29,6% | 58,6% | R$ 61,99 a R$ 35.935,94 | 2026-11-11T17:32:39.220Z |
| Tecnologia | 101 | 40 | 0 | 692 | 21,7% | 46,5% | R$ 69,89 a R$ 14.999,00 | 2026-11-11T17:33:01.839Z |
| Livros | 102 | 143 | 0 | 2.397 | 6,8% | 36,3% | R$ 12,00 a R$ 989,00 | 2026-11-11T17:32:41.938Z |
| Casa e eletrodomésticos | 120 | 173 | 0 | 1.748 | 8,5% | 48,3% | R$ 45,95 a R$ 1.800.000,00 | 2026-11-11T17:30:11.168Z |
| Eletrônicos | 64 | 74 | 1 | 461 | 13,9% | 29,7% | R$ 8,00 a R$ 35.971,00 | 2026-11-11T17:26:27.362Z |
| Esporte | 83 | 256 | 0 | 1.141 | 8,1% | 19,3% | R$ 13,99 a R$ 19.990,00 | 2026-11-11T17:27:59.084Z |
| **Total** | **4.852** | **1.249** | **1.576** | **17.919** | | | | |

## Ofertas ativas por rede

| Loja | Mercado Livre | Shopee | Amazon | Outras |
|---|---:|---:|---:|---:|
| Games | 8.534 | 1.136 | 325 | 0 |
| Impressão 3D | 1.476 | 0 | 9 | 0 |
| Tecnologia | 691 | 0 | 1 | 0 |
| Livros | 2.386 | 0 | 11 | 0 |
| Casa e eletrodomésticos | 1.746 | 0 | 2 | 0 |
| Eletrônicos | 459 | 0 | 2 | 0 |
| Esporte | 1.139 | 0 | 2 | 0 |
| **Total** | **16.431** | **1.136** | **352** | **0** |

## Por departamento (tipo/segmento, produtos aprovados)

### Games

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| game | 2.985 | 5.987 |
| accessory | 1.038 | 1.413 |
| console | 301 | 719 |

### Impressão 3D

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| filamento-3d | 41 | 514 |
| impressora-3d | 15 | 482 |
| resina-3d | 2 | 6 |

### Tecnologia

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| placa-de-video | 70 | 284 |
| ssd | 10 | 57 |
| teclado | 8 | 48 |
| mouse | 7 | 32 |
| headset-gamer | 5 | 15 |
| impressora | 1 | 12 |

### Livros

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| livros | 102 | 893 |

### Casa e eletrodomésticos

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| air-fryer | 110 | 583 |
| geladeira | 10 | 33 |

### Eletrônicos

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| soundbar | 31 | 134 |
| smart-tv | 17 | 55 |
| fone-de-ouvido | 16 | 50 |

### Esporte

| Tipo/segmento | Produtos aprovados | Ofertas ativas |
|---|---:|---:|
| bola | 58 | 207 |
| esteira | 24 | 64 |
| bicicleta-ergometrica | 1 | 5 |

## CSV por loja

- [Games](games.csv) - 6.403 produtos (todos os status; coluna `status_porteiro`)
- [Impressão 3D](impressao3d.csv) - 117 produtos (todos os status; coluna `status_porteiro`)
- [Tecnologia](tecnologia.csv) - 141 produtos (todos os status; coluna `status_porteiro`)
- [Livros](livros.csv) - 245 produtos (todos os status; coluna `status_porteiro`)
- [Casa e eletrodomésticos](eletrodomesticos.csv) - 293 produtos (todos os status; coluna `status_porteiro`)
- [Eletrônicos](eletroeletronicos.csv) - 139 produtos (todos os status; coluna `status_porteiro`)
- [Esporte](esporte.csv) - 339 produtos (todos os status; coluna `status_porteiro`)

Os CSVs daqui nao trazem o link de afiliado da oferta mais barata (coluna vazia); o export completo, com o link, e `GET /api/admin/catalogo/export?loja=<slug>` (so admin) ou o botao CSV em /admin/catalogo.
