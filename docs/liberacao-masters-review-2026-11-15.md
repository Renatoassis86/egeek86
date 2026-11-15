# Liberação dos masters em `review` e regra permanente (#83, #55) - 2026-11-15

Política do dono: a única restrição de entrada é USADO, RETRÔ e fora de linha; "precisamos ir colocando os itens em nosso banco"; grupos só de idênticos (dúvida de identidade vira grupo próprio `nao_identificado`); sem mudar indicadores; barreira nova só com aval.

## 1. Medida (SELECT, 2026-11-15 15:25)
Masters com `catalogGate.verdict='review'`, sem `manual`, não fundidos: **446** (não 275: o lote de semeadura de 14/11 cresceu e há 95 de coleta/descoberta).

| Motivo | Masters | Com oferta `active` |
|---|---|---|
| `semeadura_vertical_aguardando_conferencia` (351: 151 com parecer do porteiro `approved`; 197 `chave_fraca_titulo_shopee`; 3 `lexico_fora_do_escopo`) | 351 | 154 |
| `acessorio_plataforma_legada` (retrô) | 29 | 2 |
| `porta_cartao_organizador` (miúdo, decisão anterior) | 27 | 26 |
| `geracao_ambigua` | 20 | 19 |
| `fisico_abaixo_do_piso` (provável código/digital) | 15 | 15 |
| `jogo_sem_plataforma_nem_formato_fisico` / `descoberta_duvida` | 2 / 2 | 0 / 1 |

Por departamento: eletroeletrônicos 159, esporte 123, games 95, eletrodomésticos 54, tecnologia 14, impressão 3D 1. Idade: 350 criados em menos de 24 h, 17 em 1 a 7 dias, 79 com mais de 7 dias. Origem: os 351 são da semeadura/Shopee (`seed-vertical`, `semear-vertical`, `shopee-master-novo-store`); os 95 restantes da coleta/descoberta. Ofertas: 236 ativas nos 446 (duas redes: 160 ofertas em 151 masters e 76 em 67).
Os 197 de identidade fraca têm só ofertas inativas (rascunho da semeadura Shopee): hoje não aparecem em lugar nenhum.

## 2. Regras de decisão (por regra, não por item)
Liberar (`approved`, marca `auto:liberar-review-2026-11-15`, `previousVerdict: review`) tudo que não cair em MANTER:
- MANTER: `catalogGate.manual` (decisão humana); retrô (`acessorio_plataforma_legada`), miúdo (`porta_cartao_organizador`) e `fisico_abaixo_do_piso` (decisões anteriores do dono); sinal de usado/retrô/seminovo/open box/lote/defeito no nome ou nos títulos das ofertas; porteiro gamer `rejected`; item miúdo `sim` ou `ambiguo` (`avaliarItemMiudo`); power bank (decisão R2-16); semeadura com parecer fraco e sem oferta ativa.
- Dúvida de identidade (geração ambígua, sem plataforma/formato, chave fraca, descoberta com dúvida) NÃO barra: vira `identidade.estado = nao_identificado`, grupo próprio.

Amostra de 40 (1 a cada 4) conferida por título e oferta: 37 corretos; 3 duvidosos (fones de R$ 8 a R$ 20, "baixo valor", e um portal de Skylanders, acessório de jogo). **Taxa de erro esperada: cerca de 7%**, todos reversíveis por log; nenhum usado, retrô ou peça de reposição na amostra. Sem o filtro de semeadura "identidade fraca sem oferta ativa", a mesma regra teria liberado peças (formas descartáveis de air fryer, redutores, coldres, cabos): por isso esses 195 ficam fora.

## 3. Aplicação
`scripts/liberar-masters-review-2026-11-15.ts` (dry-run padrão; `--apply --por "Nome"`; `--rollback <log> [--apply]`; `--amostra N`). Lotes de 100, transações curtas, guarda otimista (só grava se o `catalogGate` ainda é o lido e sem `manual`), backup NDJSON e log JSON em `docs/backups/`.
Aplicado: **166 de 166 gravados** (138 eletroeletrônicos, 20 games, 7 esporte, 1 impressão 3D; 20 como `nao_identificado`; guarda otimista ignorou 0).
- Backup: `docs/backups/liberar-review-2026-11-15T15-30-03-112Z.ndjson`
- Log: `docs/backups/liberar-review-log-2026-11-15T15-30-03-112Z.json`
- Reversão: `npx tsx --env-file=.env.local scripts/liberar-masters-review-2026-11-15.ts --rollback docs/backups/liberar-review-log-2026-11-15T15-30-03-112Z.json --apply`

## 4. Regra permanente (código)
`src/lib/catalog/vertical/gate.ts`: `reviewGateFor` (usado por `seed-vertical.ts`, `scripts/semear-vertical.ts`, `shopee-master-novo-store.ts`, `discover-shopee-esporte.ts`) agora, com `GATE_SEMEADURA_DIRETO` ligada (**padrão ligada**; `off`, `0` ou `false` voltam ao ADR 0008):
- parecer `approved` nasce `approved` (`semeadura_direta:<razão>`);
- parecer `review` de categoria `unverified` (identidade fraca) nasce `approved` como `nao_identificado:<razão>` e recebe `attributes.identidade` (`identidadeDoGate`);
- `out_of_scope` (miúdo/léxico), usado, retrô e `rejected` seguem em review: o porteiro já os separa; nada novo foi criado.
Testes: `scripts/test-vertical-identity.ts` 249/249 (casos novos da flag), `test-gate.ts` 126 casos sem falhas, `test-r2-entrada.ts` 21/21, `test-semeadura-servidor.ts` 48/48; `tsc` limpo. A Vercel não precisa de variável nova (o padrão já é ligada).

## 5. O que fica barrado (para o dono decidir os duvidosos)
Total que segue em `review`: **280** (446 - 166).

| Grupo | Masters | Exemplos |
|---|---|---|
| Retrô: acessório de plataforma legada | 29 | Volante Wii U; Controle Joystick Ps3 Usb; Volante Xbox360/Ps2; Wii Logitech Speed Force; Fonte Ps2 Slim |
| Miúdo (decisão anterior): porta cartão/jogo | 27 | Porta jogo Switch Mario; Porta Cartão Switch 12 jogos (impressão 3D); Porta Jogos Switch 3D |
| Físico abaixo do piso (provável código/digital) | 15 | Cuphead Xbox One; Far Cry 6 Xbox One Series; Battlefield 4 Xbox One; Call of Duty Vanguard |
| Power bank (R2-16) | 4 | Power Bank Multilaser 4500 mAh; Power Bank Turbo 30000 mAh; Concept 5000 mAh |
| **DÚVIDA 1: semeadura com identidade fraca, sem oferta ativa** | **195** | Air Fryer Mueller 35L; Fritadeira WAP 10L; Forno Oster 10 em 1; Aspirador Gaabor 2 em 1; Removedor de ácaros UV |
| **DÚVIDA 2: léxico fora do escopo (falso positivo provável)** | 3 | Drone Fimi X8 SE com Controle Remoto; Binóculo 20x50 com Bolsa (x2) |
| Porteiro rejeita (usado/retrô/plataforma legada, console não aparelho) | 4 | Assassins Creed Mirage Xbox Série X / One; Spongebob Patrick Star Xbox S X/One; Switch Oled Pokémon Go+; Resident Evil Requiem (rejeitado por "papelaria": falso positivo provável) |
| Miúdo `sim`/`ambiguo` | 3 | Necessaire organizadora de cabos (x2); Power Bank Magsafe 5000 mAh |

### Pontos que parecem barreira e dependem do aval do dono
1. **195 masters de semeadura Shopee com identidade fraca e sem oferta ativa** (eletrodomésticos e esporte, lote de 14/11). Não foram liberados porque o filtro de miúdo atual não reconhece boa parte deles como peça/acessório (formas e papel descartáveis, pés de silicone, redutores, buchas, coldres, fivelas, canaleta) e porque, sem oferta ativa, liberar não muda nada no site. Se o dono quiser tudo no banco: autorizar liberar mesmo assim ou ampliar o vocabulário do filtro de miúdo (tarefa à parte). O código permanente já aprova identidade fraca na entrada; o risco é esse mesmo vocabulário.
2. **Fones e itens baratos liberados** (fones de R$ 8 a R$ 30, cerca de 20): as políticas "baixo valor fora" e "colocar no banco" colidem; mantive liberados (nenhum piso novo criado). Dizer se quer piso.
3. **Falsos positivos do léxico "fora do escopo"** (drone "com controle remoto"; "papelaria" em Resident Evil Requiem): seguem barrados por regra antiga.

## 6. Prova (SELECT)
| Medida | Antes | Depois |
|---|---|---|
| Masters em `review` (sem manual, não fundidos) | 446 | 280 |
| Eletroeletrônicos em review / com oferta ativa | 159 / 144 | 21 / 6 |
| Esporte em review / com oferta ativa | 123 / 7 | 116 / 0 |
| Games em review / com oferta ativa | 95 / 63 | 75 / 44 |
| Masters aprovados com oferta ativa: eletroeletrônicos | 1.105 | 1.243 |
| Esporte / games / impressão 3D | 551 / 3.406 / 168 | 558 / 3.425 / 169 |
| Ofertas ativas de aprovados (eletroeletrônicos / esporte / games) | 6.173 / 1.572 / 11.805 | 6.311 / 1.584 / 11.824 |
| Masters `nao_identificado` | 673 | 693 |

Departamento certo (CTE de `listarDepartamento`, `departamentoClicaveisCtes`): dos liberados, 7 de esporte e 1 de impressão 3D já passam no filtro de clicáveis. Os 138 de eletroeletrônicos têm oferta ativa mas `last_checked_at` nulo (placeholder da semeadura, nunca verificada), então só aparecem depois da primeira coleta (`collect-vertical` e `collect-prices` pegam `last_checked_at IS NULL` primeiro). Reconferir após o próximo ciclo. Indicadores: nenhuma mudança de estrutura, preço, oferta ou fórmula; só `catalogGate`/`identidade` (a diferença de livros nas ofertas ativas no intervalo vem da coleta em curso, não desta liberação).

Elos: pedido (fila #83/#55) OK; código e teste OK; flag: padrão ligada, sem variável; dado: antes/depois e rollback OK; deploy e verificação do surgimento dos eletroeletrônicos no departamento: pendentes do próximo ciclo de coleta.
