# Ata do Conselho Geek: Time de identidade dos itens e validação de médias em rodadas

- **Data:** 2026-11-11
- **Porte:** grande (mexe em regra inegociável "um jogo, uma média só", no cálculo de selo/mensagens e em dado de produção).
- **Presidente:** geek-lead
- **Convocados:** mesa fixa (estrategista-mercado, especialista-precos, gamer-veterano, qa-verificador) mais guardiao-catalogo, estatistico-senior, cientista-dados-tempo-real, engenheiro-backend.
- **Escopo desta rodada:** SOMENTE LEITURA E PLANEJAMENTO. Só SELECT no banco. Nenhuma escrita em produção, commit ou push; nenhuma credencial lida ou criada. Scripts de medição novos: `scripts/medir-dispersao-medias.ts` e `scripts/medir-dispersao-medias2.ts` (SELECT apenas).
- **Rascunho de ADR:** `docs/08-decisoes-adr/0011-validacao-de-identidade-em-rodadas.md` (status "proposto"; nenhum ADR aceito foi alterado). Nota: o diretório de ADRs do projeto é `docs/08-decisoes-adr/`, não `docs/adr`.
- **Transparência dos pareceres:** como na ata de 2026-11-10/11 (Amazon), os pareceres abaixo foram redigidos pelo presidente pela lente de cada especialista, depois de ler o código e medir o banco. **Não são subagentes independentes.** O protocolo pede independência real, então ela fica como etapa obrigatória da execução (auditor cego, ver abaixo) e o `qa-verificador` e o `estatistico-senior` devem confirmar de forma independente antes de qualquer ligação. Convenção: **[C]** visto no código, **[M]** medido no banco, **[H]** hipótese, **[R]** recomendação.

## Briefing
Demanda do dono (11/11): "um time de agentes só para a revisão dos modelos dos itens, para não colocar item diferente no mesmo cômputo de uma média; toda média validada em várias rodadas".
Regras em jogo: sem dado fake; um jogo, uma média só (ADR 0004: oferta-dia); regras de identidade (região, cross-gen e edição limitada separam; cor junta; Open Box fora; só novo e em linha; pacote nunca entra na média do avulso).
Pergunta: desenho do time, protocolo de rodadas, papel da cerca de Tukey, execução segura, comportamento do selo/mensagem enquanto não validada.

## Fatos medidos hoje (SELECT, ofertas ativas, masters com 3 ou mais ofertas) [M]
Total: 1.633 masters. Dispersão por departamento (ratio = maior/menor preço; "fora da cerca" = oferta acima de Q3 + 1,5 IQR em preço bruto):

| Departamento / tipo | Masters | Ofertas | ratio > 2 | ratio > 3 | IQR/mediana > 0,5 | Ofertas fora da cerca | Média difere da mediana > 10% |
|---|---|---|---|---|---|---|---|
| games / jogo | 661 | 5.240 | 212 | 70 | 69 | 246 | 174 |
| livros | 144 | 2.245 | 59 | 29 | 22 | 200 | 45 |
| games / acessório | 185 | 1.807 | 55 | 19 | 21 | 85 | 42 |
| eletrodomésticos | 168 | 1.518 | 47 | 10 | 11 | 51 | 36 |
| impressão 3D | 87 | 1.461 | 17 | 4 | 1 | 92 | 10 |
| eletroeletrônicos | 98 | 830 | 27 | 8 | 8 | 34 | 24 |
| games / console | 57 | 813 | 17 | 9 | 4 | 46 | 12 |
| esporte | 148 | 782 | 16 | 3 | 10 | 30 | 34 |
| tecnologia | 85 | 586 | 12 | 4 | 1 | 23 | 15 |

Leituras:
1. **A poluição não é só de console.** Em games/jogo, 212 de 661 masters (32%) têm ratio > 2 e em 174 a média difere da mediana em mais de 10%. Em todas as verticais, 15% a 40% dos masters têm ratio > 2. Isso é sintoma (dispersão), não prova de mistura: parte é revendedor inflado de um produto idêntico, parte é produto diferente. Separar as duas causas é o trabalho do time.
2. **Piores casos hoje:** PS5 Slim Digital (140 ofertas, de R$ 3.725 a R$ 10.000.000), PS5 825 GB (16 ofertas, R$ 4.200 a R$ 10.000.000), PS4 Slim 1 TB (30 ofertas, R$ 1.796 a R$ 2.285.000), Switch 2 nacional (66 ofertas, R$ 3.140 a R$ 447.009), Astro Bot PS5 (32 ofertas, R$ 180 a R$ 2.700), Zelda BOTW (11 ofertas, R$ 282 a R$ 5.000), PS5 Pro 2 TB (13 ofertas, R$ 5.322 a R$ 50.000).
3. **Preço sentinela/absurdo ativo [M]:** 5 ofertas ativas com preço atual >= R$ 1.000.000 (3 em games, 2 em eletrodomésticos) e 25 ofertas acima de 5 vezes a mediana do próprio master, em 19 masters. [H] A leitura oficial (piso/teto de plausibilidade, ADR 0002, e quarentena) pode já filtrá-las da média pública; não verifiquei. Se não filtra o teto, é falha independente da identidade e a primeira a corrigir.
4. **Evidência do dono (informada, não remedida):** Resident Evil Generation Pack Ns2 (20 anúncios, R$ 439,90 a R$ 990; 7 anúncios de R$ 748 a R$ 990 puxam a média de R$ 721,07). Console: 70 masters unificados hoje, 59 divergentes restantes.
5. **Custo da amostra [M]:** 1.633 masters com 3 ou mais ofertas a validar; os demais não têm média pública (ADR 0004) e entram só quando cruzarem 3 ofertas.

## Pareceres (rodada 1, lentes)
| Lente | Posição | Recomendação em uma linha | Dado que falta |
|---|---|---|---|
| Guardião do catálogo | A identidade precisa de chave estruturada por departamento (como `console-identity.ts` já faz para console: família, modelo, mídia, armazenamento, edição, região, pacote). Hoje só console e games têm; os outros departamentos dependem de título e GTIN. | Um classificador por departamento que emite `chave` + `confiança` + `pontos não provados`; oferta com confiança baixa fica fora da média (fail-closed). | Cobertura de GTIN/MPN/ISBN por departamento |
| Estatístico sênior | Dispersão detecta, não prova identidade. Cerca de Tukey serve para outlier de PREÇO dentro de um produto idêntico; se o conjunto é bimodal, é problema de identidade e Tukey apenas esconderia metade. Preço em escala log. Reexecutar a validação quando o conjunto muda. | Primeiro identidade, depois dispersão, depois cerca; gap bimodal reprova a média e abre revisão de identidade. | Calibrar limiares com amostra rotulada à mão |
| Especialista em preços | Preço de anúncio inflado, pacote disfarçado e vendedor de ágio são rotina nos marketplaces. Mediana junto da média evita a ilusão. | Exibir mediana ao lado da média; cerca só tira da MÉDIA, nunca da lista de ofertas. | Taxa de ágio por categoria |
| Gamer veterano | Edições (30 anos, Wolverine), pacotes com jogo e região são produtos diferentes para o gamer; mas "Slim 1 TB Digital" e "Slim Digital" podem ser o mesmo aparelho. Esconder pacote barato real prejudica o gamer. | Pacote e edição aparecem como grupos próprios (não somem), com média própria quando houver 3 ou mais ofertas do mesmo pacote. | Lista de edições por franquia |
| Cientista de dados em tempo real | O conjunto de ofertas muda a cada coleta; validação precisa de assinatura do conjunto e de revalidação incremental, senão a média "validada" fica velha. | Hash do conjunto (chave + ids de oferta); oferta nova entra provisória e só conta após as rodadas curtas; job incremental por mudança. | Taxa de entrada de ofertas novas por dia |
| Engenheiro backend | Tudo deve ser idempotente, em modo simulação, com tabela de veredito por master e log reversível; nenhuma escrita em `affiliate_offers` fora de um plano aprovado. | Tabela aditiva de validação (veredito, rodada, assinatura, evidências) e leitura que respeita o veredito atrás de flag. | Onde a leitura pública filtra hoje (selo, gráfico, cabeçalho, mensagens) |
| Especialista de QA | Risco de "validar" por circularidade (classificar olhando o preço). Risco de ligar sem baseline. | Classificador nunca vê preço; auditor nunca vê a chave do classificador; amostra cega com taxa de falsa fusão e IC antes de ligar. | Baseline atual de falsa fusão |
| Estrategista | Black Friday em 27/11, congelamento em 20/11. Média errada no pico custa mais confiança do que média "em revisão". | Priorizar PS5, Switch 2, Xbox e os 50 jogos mais vistos antes do dia 20; resto depois da BF. | Top produtos por visita |

## Divergências e resolução
1. **Um ou dois auditores independentes por média (custo x confiança):** estatístico e QA querem dois; backend e estrategista querem um por causa do custo. Resolução do presidente: um auditor cego por padrão; **segundo auditor obrigatório** quando (a) o classificador e o auditor discordam, (b) a confiança do classificador é média/baixa, (c) o master tem mais de 30 ofertas, ou (d) a média alimenta mensagem automática. O dono pode apertar.
2. **Quanta dispersão reprova:** estatístico quer portão duro (reprova), gamer veterano teme esconder pacote/edição legítimos. Resolução: dispersão sozinha nunca separa nem apaga oferta; ela só abre revisão. Quem separa é a identidade. A cerca só atua depois de a identidade estar validada.
3. **Cerca em preço bruto ou em log:** estatístico prefere log (preços assimétricos); matemática simples do bruto subestima a cerca em produtos baratos. Decisão: log na decisão, valores mostrados em reais.

## Decisão proposta (aguarda o dono)

### 1. O time (papéis, o que fazem e o que NÃO fazem)
| Papel | Faz | Não faz |
|---|---|---|
| Classificador de identidade (um por departamento: games jogos, games consoles, acessórios, livros, impressão 3D, tecnologia, casa/eletrodomésticos, eletroeletrônicos, esporte) | Lê título e atributos oficiais da API; emite chave de identidade, confiança e pontos não provados. Código determinístico primeiro; modelo só no ambíguo. | Não vê preço. Não decide média. Não escreve no banco. |
| Auditor adversarial independente | Recebe só os títulos/atributos (sem a chave do classificador) e tenta provar que há dois produtos no grupo; devolve "mesmo / diferente / não provado" por oferta. | Não vê preço nem a chave. Não corrige: só reprova. |
| Guardião de dispersão | Só números (preço oferta-dia): ratio, IQR/mediana, gap bimodal, média x mediana, cerca de Tukey em log; abre caso. | Não decide identidade e não apaga oferta. |
| Árbitro | Resolve discordância classificador x auditor com evidência da página/API oficial; caso novo de regra vai ao dono. | Não cria regra nova sozinho. |
| Escriba (executor, engenheiro-backend) | Aplica só planos aprovados: grava veredito, mantém backup e log reversível, idempotente. | Não classifica e não aprova. |
| Verificação final (qa-verificador) | Amostra cega, SELECT final, paridade, baseline antes/depois. Pode bloquear o "concluído". | Não executa correção. |

Regra de ouro do desenho: **quem classifica não audita; quem vê preço não classifica.** O preço só alarma, nunca prova identidade (evita circularidade: ajustar a identidade até a média "parecer boa").

### 2. Protocolo de validação em rodadas (por média)
Pré-requisito: média só existe com 3 ou mais ofertas (ADR 0004).
- **R1, identidade determinística:** todas as ofertas do master recebem chave do classificador do departamento. Reprova se houver chaves diferentes, confiança baixa, ou marcadores duros (pacote, edição, região, open box/usado, cross-gen). Oferta de chave diferente sai do master (vai para o grupo da própria chave, plano aprovado) ou fica "fora da média".
- **R2, auditoria cega:** auditor independente vê só os títulos. Aprova se todas as ofertas são "mesmo" ou "não provado" sem divergência dura. Qualquer "diferente" reprova o conjunto até o árbitro decidir. Segundo auditor nas condições da divergência 1.
- **R3, dispersão:** guardião calcula sinais. Valores iniciais a calibrar com amostra rotulada: ratio máx/mín > 2, IQR/mediana > 0,35, gap bimodal em log > 0,4 com 2 ou mais ofertas de cada lado, média x mediana > 10%,  ou mais de 20% das ofertas fora da cerca. Bimodal ou ratio extremo reprova e volta à R1/R2 (suspeita de mistura). Dispersão leve só dispara a cerca (item 3).
- **R4, confirmação na fonte:** para as ofertas que mais pesam (extremos e maior desvio), conferir atributos na API oficial da loja (marca/modelo/capacidade/edição/pacote); se a API não prova, a oferta fica "não provada" e fora da média. Sem scraping.
- **Validada** = R1 sem divergência dura + R2 concorda (1 ou 2 auditores) + R3 dentro dos limites ou explicada pela cerca + R4 sem refutação, tudo sobre a **mesma assinatura do conjunto** (hash de chave + ids das ofertas). Mínimo de 2 rodadas independentes de olhos diferentes (código e auditor) para tudo, 3 para consoles/acessórios caros e para média que alimenta mensagem automática.
- **Revalidação:** a assinatura muda quando entra/sai oferta ou muda título/atributo. Oferta nova entra **provisória**: aparece na lista, não conta na média pública até passar R1+R2 incrementais (job por mudança, mesma noite). Saída de oferta não reprova, mas recalcula e registra. Revalidação completa a cada 7 dias (ou 24 h nos masters das mensagens automáticas).
- **Estados:** `validada`, `em_revisao` (mudança pendente ou divergência aberta), `reprovada` (mistura comprovada, aguardando separação), `nao_calculavel` (menos de 3 ofertas provadas).

### 3. Cerca estatística (Tukey) e ADRs
- Papel: tratamento de **outlier de preço dentro de identidade validada** (revendedor inflado, erro de preço, sentinela). Oferta fora da cerca (log-preço fora de Q1 - 1,5 IQR a Q3 + 1,5 IQR) **continua visível na lista**, marcada, mas **sai da média, do selo e da mensagem**; a **mediana é exibida junto**. Com menos de 5 ofertas aceitas a cerca é substituída por teto/piso de plausibilidade (ADR 0002) porque Tukey é instável com n pequeno.
- Não substitui a identidade: grupo bimodal nunca é "limpo" pela cerca.
- ADRs: **emendar o ADR 0004** (item 3 da Emenda de 2026-11-05: "média do dia = média simples das ofertas vigentes" passa a "das ofertas vigentes de identidade validada e dentro da cerca") e **estender o ADR 0006** (identidade da cesta) com o protocolo de rodadas. O texto da regra "Um jogo, uma média só" em `AGENTS.md` ganha um parágrafo (proposta no rascunho do ADR 0011; decisão e edição são do dono). Nada foi alterado em ADR aceito.

### 4. Execução segura, ordem, custo, métrica
- **Tudo em simulação primeiro:** plano em arquivo (como `auditar-consoles.ts`: plan, backup, log de reversão), SELECT final, nada em produção sem aprovação do dono em cada lote. A leitura pública só consulta o veredito atrás de flag de três estados (desligada, sombra, ligada).
- **Ordem de ataque:** (1) teto de plausibilidade e sentinelas (5 ofertas >= R$ 1 milhão ativas); (2) PS5 (Slim, 825 GB, Pro, edição 30 anos, pacotes) e Resident Evil Generation Pack; (3) demais 57 masters de console (59 divergentes); (4) games/jogo (661 masters, 5.240 ofertas, o maior volume e o foco da BF); (5) acessórios de games; (6) livros (ISBN/GTIN dá chave forte, rápido); (7) eletrodomésticos e eletroeletrônicos (marca, modelo, voltagem); (8) impressão 3D, esporte, tecnologia (depois da BF, alinhado à decisão da Amazon de só games na BF).
- **Custo [H]:** classificação por código tende a custo marginal baixo; o auditor por modelo roda só em masters ambíguos ou sinalizados, em lote. Com 1.633 masters, a ordem de grandeza é de milhões de tokens por rodada completa, não de dezenas de milhões; estimar com piloto de PS5 antes de aprovar o resto.
- **Métrica de sucesso:** (a) 100% dos masters com média pública têm veredito `validada` ou não aparecem com selo; (b) em amostra cega de 40 masters por departamento, falsa fusão <= 2% (com intervalo de confiança registrado); (c) nos validados, IQR/mediana <= 0,25 e ratio máx/mín <= 2 depois da cerca; (d) os 212 masters de jogos com ratio > 2 reduzidos a zero não explicados; (e) zero mensagem automática com média não validada.

### 5. Selo e mensagem enquanto a média não é validada
Regra do dono respeitada: dado real, nada inventado.
- Média não validada (`em_revisao`, `reprovada`, `nao_calculavel`): **sem selo de "bom/ruim preço" e sem percentual contra a média**; o cartão mostra o rótulo factual "Preço em revisão" e a lista de ofertas reais com preço e horário. O **menor preço** como fato de uma oferta pode aparecer só quando a oferta passou na identidade (R1+R2); caso contrário, não se compara.
- Mensagens automáticas e a régua de 10% abaixo da média: **bloqueadas** sem veredito `validada` recente (<= 24 h). Pergunta ao dono: permitir mensagem de queda da própria oferta (de R$ A para R$ B no mesmo anúncio), que é dado real e não usa média.
- Cerca: a oferta fora dela não gera mensagem de "menor preço" automática.

## Decisões que dependem do dono (uma por vez)
1. **D1 (primeira):** aprovar o desenho do time e a regra "fail-closed" (sem veredito validado, sem selo e sem mensagem de média). Recomendação: sim.
2. D2: aprovar a cerca de Tukey em log (visível, fora da média, mediana junto) e a emenda ao ADR 0004 / parágrafo em `AGENTS.md`. Recomendação: sim, em sombra primeiro.
3. D3: permitir mensagem de queda da própria oferta enquanto a média está em revisão. Recomendação: sim, com carimbo de data/hora e sem comparar com média.
4. D4: nível de rigor: 1 auditor padrão + 2º nos casos descritos (recomendado) ou sempre 2.
5. D5: congelar para a Black Friday só games/consoles (ordem acima) e deixar os demais para depois do dia 27.

## Execução e verificação
Nada executado nesta rodada, exceto as medições SELECT. Quando autorizado: guardiao-catalogo (classificadores), estatistico-senior e cientista-precos (limiares), engenheiro-backend e dba-postgres (tabela aditiva de veredito e leitura por flag), **qa-verificador obrigatório** (amostra cega, baseline antes/depois, SELECT final) antes de ligar.

## Limites desta rodada
Pareceres são lentes do presidente, não independentes. Não verifiquei se a leitura pública já aplica teto de plausibilidade nas ofertas de R$ 1 milhão; as ofertas fora da cerca foram contadas em preço bruto, sem filtro de elegibilidade; ratio é sintoma, não prova de mistura; os limiares são iniciais e precisam de calibração com amostra rotulada.

## Retrospectiva
Pendente (preencher após o piloto de PS5).
