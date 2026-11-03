# Ata do Conselho Geek: religar a descoberta automática (conservador)

- **Data:** 2026-11-03. **Porte:** médio (coleta que grava no catálogo; reversível; sem decisão nova de negócio).
- **Presidente:** geek-lead. **Pareceres sintetizados:** engenheiro-coleta (fluxo), guardiao-catalogo (dedup/porteiro), integrador-apis (cota ML), especialista-precos (piso/isca), dba-postgres (auditoria por `created_at`). QA na verificação.
- **Autorização do dono:** religar "com acompanhamento", agora que porteiro, identidade, digital x físico e quarentena estão no ar.

## Estado encontrado
- A descoberta estava desligada só por AUSÊNCIA no `vercel.json` (a rota `/api/cron/discover-products` existe; o `pg_cron` nem está instalado no banco: `cron.job` não existe). Sem flag de ambiente.
- A rota antiga rodava ML + Shopee + Magalu juntos, sem teto de masters novos, 10 termos/execução, 60 sondas/termo, 2 termos em paralelo.

## Revisão do fluxo (código)
Já existia e foi confirmado: dedup `findExistingMasterProduct` antes de toda criação; `entryGateAttributes` no INSERT (veredito nasce junto); filtro de usado/Open Box por título e `condition`; idempotência por índice único `(network_id, external_ref)` + `onConflictDoNothing` + transação master+oferta; plataforma derivada do título (nunca `unknown` por default).

Lacunas achadas e corrigidas (somente `discover-products.ts`, novo `discover-policy.ts` e a rota do cron):
1. `entryGateAttributes` era chamado sem formato, plataforma nem mediana de preço: o piso de plausibilidade nunca valia na descoberta. Agora recebe os três.
2. Porteiro `rejected` agora aborta o cadastro com o tipo JÁ resolvido (antes só o título com tipo `game`).
3. Sem teto de masters novos: agora `maxNewMasters` (padrão 10, teto duro 50); a execução encerra ao atingi-lo (poupa cota).
4. Dúvida vira `review`: tipo resolvido por classificador estatístico ou só pelo termo, plataforma desconhecida, formato digital/desconhecido (jogo), menor preço isca (<35% da mediana dos vendedores, 3+ vendedores), preço >= R$ 50.000, plataforma herdada do termo (acessório). Cross-gen já nascia review. Rastro em `attributes.discovery` (`bornAs`, `doubts`).
5. Anexar a master existente agora checa a faixa de preço contra as cotações reais do master (<35% ou >3x a mediana: descarta), mesma régua do ADR 0002 e da quarentena.
6. Console herdava a plataforma do TERMO de busca: Wii, DS Lite e 3DS foram cadastrados como `switch_1` (achado na execução real). Console agora só usa a plataforma do título.
7. Dois termos em paralelo podiam cadastrar o mesmo jogo sob dois `catalog_product_id` gêmeos: concorrência 1.
8. Cota ML: 429 persistente (busca ou sonda) encerra a execução; 4 erros seguidos de sonda idem; o cursor só avança o que foi buscado. Orçamento de tempo 90 s (a rota tem 120 s). Starvation: 75-85% dos candidatos não têm oferta (404) e o teto de sondas gastava sempre os mesmos primeiros; a ordem agora gira por hora (sem estado).
9. Desempenho: 2 consultas por candidato viraram 2 por termo (pré-checagem em lote); 100 s para 2 termos caiu para cerca de 12 s.
10. Rota: padrão agora SÓ Mercado Livre; Shopee/Magalu só com `?source=shopee|all`.
11. Log: 1 linha JSON por execução no console (`event: discover-products`) e resumo em `system_config.discover_products_last_run`.

## Dados medidos
- Dry-run (varredura dos 123 termos, 25 sondas/termo): 24.873 resultados; 14.711 já existiam (59%); 3.489 barrados por título/porteiro; 2.931 sem vendedor novo; 3.504 não sondados pelo teto; 1 rejeitado pelo porteiro (digital); 1 erro (429 na busca de 1 termo, tratado).
- Candidatos com vendedor (81 únicos): 71 criariam master (18 approved, 53 review) e 10 anexariam a master existente. Nos 18 approved não houve falso positivo evidente pelo título; nos review os motivos foram corretos (cross-gen, classificador, termo, plataforma desconhecida).
- Execução real supervisionada (backup de 15:18, dentro das 12 h; cursor 109 a 112, 4 termos, teto 10): 5 masters criados, 5 em review, 0 approved, 0 erro, 49 s; cada um com 1 oferta placeholder e 1 cotação. Log `backup/dados/descoberta-log-2026-11-03T19-08-44-081Z.json`. Plataforma de 3 deles corrigida (`backup/dados/descoberta-correcao-plataforma-1793732970589.json`).
- Testes: `scripts/test-discover-policy.ts` 39 verificações, 0 falha; gate 109, dimensões 259, identidade 330, 0 falha; `tsc` limpo (fora de `.next/types`).

## Decisão
Religar via `vercel.json`: `/api/cron/discover-products?source=meli&maxNew=10&terms=4&probes=25`, `17 * * * *` (1x/hora). Entra em produção só no próximo deploy (decisão do responsável). Reversível: remover a linha.

## Riscos e pendências
- 4 dos 5 masters da execução real são consoles retrô (Wii, DS Lite, 3DS, Game Boy Color), provavelmente fora do escopo: ficam em review; decisão do dono (rejeitar via `catalogGate.manual`).
- Game Boy foi tipado como `game` ("Game" casa o padrão de mídia) e nasceu com `plataforma_desconhecida`; o review o segura.
- A descoberta da Shopee (`discover-shopee-products.ts`) não passa formato/mediana ao porteiro e cria até 60 masters/execução: não religada aqui.
- `apply-catalog-gate.ts` reavalia só pelo título e pode derrubar um `review` de dúvida da descoberta (que o porteiro sozinho aprovaria). Conferir `attributes.discovery` antes de rodá-lo em massa.
- O cursor estava em 99 na sondagem e em 109 na execução real: algo (disparo manual do admin ou outra frente) avançou a rotação no intervalo. Não identificado.
- Todo master novo em review depende de triagem humana em `/admin/catalogo-revisao`.
