# Ata do Conselho Geek: arquitetura v2 (2026-11-18)

- **Data:** 2026-11-18
- **Porte:** grande
- **Presidente:** geek-lead
- **Convocados (7 pareceres independentes, rodada 1):** infraestrutura e filas (arquiteto-next + engenheiro-infra-sre); coleta e extração (engenheiro-coleta + integrador-apis); armazenamento de séries (dba-postgres + cientista-dados-tempo-real); inteligência de preços (cientista-precos + especialista-precos + estatistico-senior); produto e front (engenheiro-frontend + bi-dataviz + designer-marca + engenheiro-performance-web); mercado e crescimento (estrategista-mercado + gamer-veterano + key-user-gamer + produtor-gamer-mundial + pesquisador-benchmark); segurança e qualidade (seguranca-db + qa-verificador).

## Briefing
Construir a v2 mantendo o que temos de melhor (comparação entre lojas, fontes oficiais, porteiro de qualidade, honestidade de método, link de afiliado do dono) e trazendo o que Keepa, CamelCamelCamel, Buscapé/Zoom, Promobit/Pelando, Honey e serviços de preços têm e nós não. Regras inegociáveis em jogo: R-70, R-81/R-101, R-82, R-91, R-61, "loops nunca param", só produto novo, regras internas fora do front. Pergunta: qual arquitetura e em que ordem.

## Pareceres (rodada 1)
| Membro | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| Infra e filas | Apoio | Upstash Redis + QStash incremental; antes, travar sobreposição e medir | limites reais do plano Vercel, comandos/dia |
| Coleta | Apoio com condição | Keepa + página como prova + extensão só fase 3; exige rever R-82 | preço/latência da Keepa BR, termos da Amazon |
| Armazenamento | Apoio com ressalva | Medir antes; reduzir batimento; materializar ofertas públicas; `price_events` só se crescer | (medido pelo presidente: 3,65 mi linhas, 190 B/linha) |
| Inteligência de preços | Apoio | Score por valor em sombra; deals com 2 leituras + baseline robusto; sem previsão sem backtest | cliques `/go` por oferta, precisão atual do alerta |
| Produto e front | Apoio | Página única por mestre, JSON-LD, feed com filtros, fechar o ciclo do alerta | confirmar disparo do alerta |
| Mercado e crescimento | Apoio com divergência | Alerta e SEO antes de extensão e API; metas realistas | inscritos reais, comissão por clique |
| Segurança e qualidade | Apoio com condições | Consentimento registrado, tokens por escopo, portão mais forte; vetos para extensão e API | retenção desejada, termos das lojas |

## Divergências e réplica (rodada 2)
- Reescrever o armazenamento: o DBA condicionou à medição; o presidente mediu (190 B/linha) e **retirou a proposta** de reescrita.
- Extensão e API: mercado pediu provar retenção antes; coleta e benchmark já as colocavam na fase 3. Sem conflito.
- Alerta "não existe" (benchmark) x "já existe a base" (front): confirmado no banco (30 alertas, 8 perfis); prioridade vira fechar o ciclo.
- Risco "RLS desligada" (segurança): verificado, **não se confirma** (103/113 tabelas com RLS, `anon`/`authenticated` sem privilégios).

## Decisão (proposta, aguarda o responsável do projeto)
Adotar a arquitetura de `docs/arquitetura-v2/PROPOSTA_V2.md` em 4 fases, **começando pela Fase 0 até a Black Friday (27/11)**, sem migração de armazenamento e sem Redis nesta fase. Fica de fora agora: extensão, API pública, reescrita de histórico, raspagem com proxy, previsão publicada.
- Decisão do responsável do projeto: **pendente** (5 perguntas na seção 6 da proposta).

## Métrica de sucesso
Fase 0: zero divergência página x mensagem; ciclo < 45 s; zero "Failed query" por falta de conexão em 7 dias; ciclo do alerta funcionando no site e no Telegram; precisão do alerta medida. Revisão na semana 4.
