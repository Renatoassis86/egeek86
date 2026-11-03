# Inventário e checklist: Espaço Geek 86 (2026-11-02)

Escrito para o responsável do projeto. Estado em 2026-11-02, manhã. "Verificado" significa que um teste ou o QA confirmou. "Feito no código" significa que está escrito e compila, mas não foi publicado.

## 0. Onde as coisas estão
- **Produção (www.egeek86.com):** nada desta rodada foi publicado. O site público continua como antes.
- **Servidor local de teste (celular, porta 3101):** roda o código da rodada anterior (vitrine nova), sem o porteiro de originais. Lento e sujeito a travar.
- **Banco de dados (Supabase, é o mesmo para local e produção):** recebeu gravações reversíveis, listadas na seção 3.

## 1. Frentes de trabalho

| # | Frente | Estado | Verificado? | O que falta |
|---|---|---|---|---|
| 1 | Vitrine /ofertas segmentada (jogo, console, acessório, por fabricante) | Feito no código | Sim, no mobile (360, 390, 430 px: sem estouro, 0 imagem fora do quadro, 0 card em prateleira errada) | "Ofertas do dia" sem regra de 2 coletas; lista de candidatos ainda enviesada por preço; home, busca e página de produto não conferidas no navegador após a mudança |
| 2 | Imagens sobrepostas e cortadas nos cards e na página do produto | Feito no código | Sim | Nada além da conferência visual no celular |
| 3 | Gráfico da página do produto (Switch 2 e jogos com muitas cotações) | Corrigido | Sim (GT7 2,5 s; Switch 2 com gráfico) | Nada |
| 4 | Religar ofertas ao produto correto | 8 de 47 feitas | Sim (cotações preservadas) | 35 ofertas sem produto idêntico; 5 ofertas de RE2/RE4 ainda ativas no master de RE3 PS5 |
| 5 | Porteiro "só original e só jogo/console/acessório" | Feito no código e gravado no banco | Testes sim (262 passam); telas só por HTML/API | Decisões 1 a 7 (seção 4); conferir no celular; tela de revisão no admin |
| 6 | Travamento de home e /ofertas | Em andamento (agente de desempenho) | QA reprovou (P0) | Corrigir, medir, reiniciar o servidor, novo QA |
| 7 | Contadores diferentes entre telas (1.907 / 2.009 / 2.007) | Em andamento, dentro da frente 6 | QA reprovou (P1) | Uma fonte e um rótulo únicos |
| 8 | Preços absurdos (109 ofertas; PS4 R$ 2.285.000, Xbox One S R$ 1.200.000, Switch 2 R$ 447.009) | Lista pronta, nada aplicado | Lista sim | Decisão sobre como quarentenar (coluna ou tabela nova) e aplicação |
| 9 | Sitemap e robots apontando para localhost | Não resolvido | Reprovado no QA 1 | Conferir NEXT_PUBLIC_APP_URL na Vercel |
| 10 | Pré-cálculo diário de estatísticas (Fase 2) | Planejado | Não | Decisão sobre a regra de média diária (ADR 0004), tabelas novas com backup |
| 11 | Publicação em produção | Bloqueada | QA 2: NÃO PUBLICAR | Frentes 4 (RE3), 6 e 7, depois novo QA |

## 2. Checklist de publicação (o que precisa estar marcado antes do deploy)
- [x] Typecheck passa
- [x] Testes de classificação e do porteiro passam (262)
- [x] Mobile da /ofertas sem estouro
- [x] Página de produto com gráfico (GT7, Switch 2)
- [x] Nenhum dado fake, nada apagado
- [ ] Home e /ofertas completam em visitas repetidas, inclusive depois do cache expirar
- [ ] Contadores iguais em todas as telas
- [ ] Master de RE3 sem ofertas de outros jogos
- [ ] Porteiro conferido no navegador (busca "Mario", home sem PS2 a R$ 20)
- [ ] Sitemap e robots com o domínio certo
- [ ] Novo QA aprovando
- [ ] Sincronizar com o repositório, varredura de segredos, commit, push, deploy, conferir produção

## 3. O que já foi gravado no banco (tudo com backup e log, nada apagado)
1. **8 ofertas movidas** para o produto certo. Log: `backup/dados/relink-log-2026-11-01T16-03-16-716Z.json`.
2. **Veredito do porteiro em 1.559 produtos** (campo `attributes.catalogGate`, sem migration). Backup e log em `backup/dados/catalog-gate-*`. Desfazer: `apply-catalog-gate.ts --revert <log>`.
3. Nenhum DELETE. Nenhuma migration nova aplicada.

## 4. Decisões que estão com você (recomendação entre parênteses)
1. Usado original, como PS2 usado a R$ 20 (continuar fora).
2. Bundles originais de console (aba Consoles com selo Bundle, média separada).
3. Amiibo e colecionáveis licenciados (fora).
4. Acessório de marca legítima sem plataforma no título (mandar para revisão, não rejeitar).
5. Porta-cartão com plataforma e marca conhecida (aceitar); Anbernic e Retroid (fora).
6. Piso de preço do PS2: R$ 60 ou R$ 70 (manter R$ 60 até medir).
7. Tela de revisão no admin (construir na próxima rodada).
8. Como quarentenar os preços absurdos (coluna `quarantined_at`, mais simples; ou tabela de integridade, mais completa).
9. Regra da média diária e da mediana (ADR 0004).

## 5. Limites conhecidos
- O veredito do porteiro vale para o produto inteiro, não por oferta. Uma oferta legítima (God of War II a R$ 581,90) ficou escondida junto com as de R$ 20.
- Cópia com título limpo e preço normal não é detectável por texto.
- O piso de R$ 30 / R$ 60 é hipótese, não dado medido.
- O servidor local trava com conexões velhas do banco; reiniciar resolve.

## 6. Pendências antigas (não esquecidas)
Sinopses (heurística do Spider-Man 2); produtos de plataforma `unknown` (GTA V, SF6, Cyberpunk); Hype Zone e leilões na navegação; revisão jurídica do texto de LGPD e comissão; credenciais IGDB (você); desligar a Vercel Toolbar (você, no painel); migrations RLS 0019 a 0021 não aplicadas; validação da Shopee; cron de descoberta desligado até a classificação estar certa; mesclar a branch na main; ADR 0003 (gamificação); apagar componentes órfãos; total de ofertas que cresceu de 12.560 para 16.013 (conferir); Retrospectiva das atas.

## 7. Atualização de 2026-11-03: decisões do §4 adotadas por delegação (reversíveis)
O dono mandou "fazer tudo o que falta". Adotada a recomendação registrada em cada item; ver ata `docs/conselho/atas/2026-11-03-quarentena-e-decisoes-pendentes.md`.
| # | Decisão | Estado |
|---|---|---|
| 1 | Usado fora | Adotada; corrigida a lacuna do "Used" em inglês |
| 2 | Bundle de console | Adotada (já implementada) |
| 3 | Amiibo fora | Adotada (já implementada) |
| 4 | Acessório de marca sem plataforma | Adotada; revisão para qualquer marca conhecida |
| 5 | Porta-cartão e Anbernic/Retroid | Adotada; porta-cartão com marca e plataforma aprovado, emulação rejeitada |
| 6 | Piso PS2 R$ 60 | Adotada (já era) |
| 7 | Tela de revisão no admin | Construída: `/admin/catalogo-revisao` (somente leitura) |
| 8 | Quarentena | Coluna `quarantined_at` (migration 0023 aplicada); 83 + 1 ofertas quarentenadas |
| 9 | Média diária/mediana | ADR 0004 aceita por delegação; implementação em plano (não feita) |

