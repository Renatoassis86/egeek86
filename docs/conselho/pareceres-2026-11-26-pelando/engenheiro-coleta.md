# Parecer engenheiro-coleta (olhar integrador-apis) - Pelando como radar de pistas

Data: 2026-11-26. Rodada 1, independente. Nada foi escrito em código, banco ou produção. Nenhuma requisição foi feita ao Pelando além da leitura dos Termos (3 consultas: /termos-de-uso deu 404; /sobre e /sobre/termos-de-uso responderam).

## 1. Posição

**Apoio com ressalvas.** O Pelando só entra como radar de pistas (candidato a conferir na loja), nunca como fonte de preço, cupom ou texto. Sem a ressalva de contato prévio, a parte automatizada fica em modo manual.

## 2. O que o Pelando expõe e o que é permitido

Rotulagem: FATO = lido nesta rodada. DADO DO BRIEFING = informado pelo dono, não reverificado por mim. HIPÓTESE = a confirmar.

| Item | Status |
|---|---|
| robots.txt (FATO, arquivo `pel_robots.txt`) | `User-agent: *` com `Allow: /`; Disallow só em /postar, /meus-alertas, /promocoes-salvas, /configuracoes, /cashback, /atendimento, /meu-perfil. Bloqueia por nome Baiduspider, PetalBot, ManusBot, DataForSeoBot, AhrefsBot, SemrushBot, DotBot. Declara `Sitemap: https://www.pelando.com.br/sitemaps/sitemap.xml`. |
| Sitemaps (DADO DO BRIEFING: promotions_recent horário, coupons_recent, stores) | Declarados no robots, logo publicados para descoberta. Leitura leve e esparsa é compatível com o robots. |
| JSON-LD / HTML público das ofertas | Publicado para buscadores. Ler uma página por pista é, tecnicamente, o que um navegador faz. |
| api-web.pelando.com.br (DADO DO BRIEFING) | Sem documentação pública, sem termos de API, sem chave. Não é API oficial para terceiros. **Não usar.** |
| Termos de Serviço (FATO, https://www.pelando.com.br/sobre/termos-de-uso) | Ver cláusulas abaixo. |

### Cláusulas dos Termos (conforme a leitura da página, feita por resumo automático; o dono ou o jurídico deve reler o texto integral antes de qualquer decisão)

- **Seção 9 (Propriedade Intelectual):** "O uso não autorizado de qualquer conteúdo é estritamente proibido." Conteúdo inclui "logotipos, textos, gráficos". É a cláusula que pesa: copiar texto de ofertas, comentários, fotos ou a "temperatura" para o nosso site ou canal é uso não autorizado.
- **Seção 3:** o Pelando pode "remover, editar ou moderar qualquer conteúdo". Não há licença expressa de reutilização do conteúdo dos usuários, o que reforça que não temos direito de republicá-lo.
- **Seção 12:** lei brasileira, foro de Belo Horizonte/MG.
- **Lacunas (FATO da leitura):** não há cláusula expressa sobre robôs, scraping, crawlers, mineração, API ou uso comercial. Ausência de proibição expressa NÃO é autorização; a Seção 9 cobre o uso do conteúdo, e o contrato de uso pode ser lido de forma mais ampla pela empresa. Não afirmo que ler seja ilegal nem que seja permitido: é zona cinzenta e não decido isso sozinho.
- Contato: não há e-mail nos Termos. Canais públicos: /atendimento (Fale conosco, formulário, bloqueado no robots para rastreio, mas é página de contato para humanos), https://ajuda.pelando.com.br/ e o CNPJ 23.412.517/0001-93 (Belo Horizonte).

## 3. Como usar como radar de pistas (desenho proposto)

Princípio: o Pelando responde "o que a comunidade acha que vale conferir". A verdade (preço, estoque, cupom, frete) vem sempre da loja, pela nossa coleta própria.

1. **Entrada mínima de uma pista:** só o que é fato e não é criação protegida: loja, nome/identificador do produto (título curto, sem copiar a redação), e URL da loja se for pública. NÃO guardar: texto da oferta, comentários, foto, preço do post, temperatura, nome do postador.
2. **Fila de candidatos** com origem `pista:pelando`, sem efeito no site, sem entrar em média nem em mensagem. Casamento com o catálogo pela regra de identidade (guardiao-catalogo decide).
3. **Verificação na loja** por nossas fontes (ver seção 4). Só o que a loja confirma sobe; o preço exibido é o nosso.
4. **Link ao usuário:** sempre o de afiliado do dono (R-70, padrão negado). Nunca repassar link do Pelando nem URL com tag de terceiro (regra "URL colada com marca alheia").
5. **Volume e cortesia:** no máximo uma leitura do sitemap por hora (ele é horário), User-Agent identificável com contato, respeitar 429/Retry-After, parar ao primeiro bloqueio ou captcha. Sem paralelismo, sem varrer páginas de oferta em massa. Preferir ler só o sitemap e abrir página individual apenas para pistas que o catálogo ainda não cobre.
6. **Medição antes de investir:** modo manual por 2 semanas (o dono ou um operador olha o Pelando e cola pistas numa lista). Métrica: % de pistas que viram oferta verificada e nova para nós, e quantos produtos fora do catálogo foram descobertos. Se a taxa for baixa, a automação não compensa o risco.

## 4. Encaixe nas regras

- **R-82 (oficial > Keepa > Chrome):** o Pelando NÃO é camada de preço. Fica fora da escada; é camada de **descoberta**, abaixo de todas, e nunca "confirma" nem "veta" preço. Se a loja disser algo diferente do Pelando, vale a loja.
- **R-61 (preço-isca):** o preço do Pelando não entra em mínimo, média, card ou mensagem. Uma pista com preço muito abaixo é motivo para conferir, nunca para publicar. Benefício: ajuda a detectar isca (muitas ofertas "temperatura alta" são erro de preço da loja que some em minutos), mas só como alerta interno.
- **R-79 (cupom de concorrente é pista):** é exatamente o mesmo molde: cupom visto no Pelando vira candidato, vale só o que a loja mostrar, flag desligada por padrão.
- **R-64 a R-68 (cofre de cupons):** pista de cupom entra no cofre como "nunca provado"; `podeDivulgar` só abre depois de prova no item/checkout pela nossa validação e QA independente. O guardião silencioso (R-68) se aplica ao que não foi provado. Código de cupom copiado do Pelando não é divulgado sem prova.
- **R-02 (coleta só por API oficial; exceção assistida):** ler sitemap público de terceiro que não é loja é caso novo, não coberto. Exige decisão explícita do dono e registro no Fluxo Mestre. Eu recomendo não tratar como "API oficial": é leitura pública leve de fonte de pista.
- **R-70:** reforçado acima. **Regras internas não vão para o front:** o site e o canal não citam o Pelando como fonte nem exibem a temperatura.

## 5. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Violar Seção 9 ao copiar texto/foto/temperatura | Alta | Guardar só loja + identificador do produto; nunca republicar. |
| Ler em massa vira "raspagem" pela nossa própria metodologia (veto do conselho) | Alta | Teto de uma leitura/h do sitemap, sem página em massa; se o dono não aceitar a zona cinzenta, fica só manual. |
| Bloqueio ou IP banido, mudança de formato sem aviso | Média | Degradar sem inventar dado; é pista, nada depende dela. |
| Dependência (a pista some e o catálogo não cresce) | Baixa | Pista só complementa; cobertura própria continua sendo a meta (R-80). |
| Imagem/relação com concorrente comunitário | Média | Parceria transparente (seção 6) em vez de leitura silenciosa. |
| Usar api-web.pelando.com.br | Alta | **Proibido** sem autorização escrita. |
| Preço-isca/erro de preço virar mensagem | Alta | R-61 e R-82 impedem, pista nunca publica. |

## 6. Parceria / contato (rascunho, NÃO enviado, o dono decide)

Canal: formulário https://www.pelando.com.br/atendimento ou Central de Ajuda https://ajuda.pelando.com.br/ (não localizei e-mail comercial público).

> Olá, equipe do Pelando. Somos o Espaço Geek 86 (egeek86), um monitor de preços de games e geek no Brasil, com canal no Telegram (t.me/egeek86). Admiramos o trabalho de curadoria da comunidade de vocês.
> Gostaríamos de saber se existe algum programa de parceria, feed ou API autorizada para terceiros que permita receber, de forma leve e respeitando os termos, a lista de ofertas recentes (loja, produto e link da loja), para usarmos apenas como sinal para conferir o preço diretamente na loja. Não pretendemos copiar textos, fotos, comentários ou votos de vocês, e sempre atribuiríamos a descoberta ao Pelando se for do interesse de vocês.
> Se houver condições, limites de uso ou contato comercial, agradecemos o retorno. Enquanto isso, não faremos leitura automatizada além do que o robots.txt de vocês permite e nada que conflite com os Termos.

Observação ao dono: enviar essa mensagem expõe a nossa existência a um concorrente de curadoria; é decisão sua. Se não enviar, a opção segura é o modo manual (item 6 da seção 3).

## 7. Alternativas legítimas enquanto o ML está parado

Pesquisa web de hoje (pouco material oficial; resultados fracos, marcados como tal):

- **Awin (FATO por documentação oficial encontrada):** a Publisher Product API entrega feeds em JSON Lines das parcerias que o publisher tem (developer.awin.com/apidocs/retail-publisher-productapidocumentation-1; help.awin.com/developers/docs/product-feed-publisher-guide-intro). Exige conta de publisher e token OAuth2. A Awin não dá suporte técnico a integração de feeds. Já está no nosso plano para calçados (docs/03-metodologia/AFILIACAO_CALCADOS.md: ordem API > feed oficial > coleta assistida). Falta confirmar quais anunciantes do nosso nicho (games, geek, eletrônicos) têm programa na Awin Brasil: HIPÓTESE, a verificar no painel logado, sem cadastro feito por mim.
- **Lomadee (resultado fraco):** só vi material antigo de terceiros (artigo iMasters de 2012, plugin que cita 10 req/min e atualização por ID não confiável). Não confirmei API de ofertas/cupons atual e oficial. Pedir ao dono para checar a área de desenvolvedores no painel Lomadee. Não citar limite como fato.
- **Zanox:** foi incorporada à Awin (2017), não é fonte separada. Não verifiquei de novo; HIPÓTESE de conhecimento prévio.
- **Shopee Affiliate Open API:** já é nossa integração oficial (productOfferV2, generateShortLink, conversionReport). Ampliar a cobertura por palavras-chave e categorias dentro da cota, em vez de depender do Pelando.
- **Amazon:** Product Advertising API só funciona com conta de afiliado com vendas qualificadas; não verifiquei os critérios de hoje. Mantém a escada R-82 (oficial > Keepa > Chrome).
- **Magalu:** relatórios no repositório (`relatorio-api-magalu-developers.md`, `relatorio-api-magalu-b2b-platform.md`) são o ponto de partida; reabrir o que a API de afiliados oferece.
- **Mercado Livre:** o bloqueio é 403 da API de itens desde 23/11 (memória: investigação de 25/11, freio R-124, apps e termos). Caminho legítimo é suporte oficial do ML Developers com o app e o tool_id; não contornar. Programa de afiliados do ML com link/relatório oficial pode servir para pista por categoria, a verificar com o dono.
- Apify "actors" que prometem Shopee/ML/Awin: são raspadores de terceiros. **Não usar.**

## 8. Ordem recomendada

1. Dono decide se aceita a zona cinzenta de ler sitemap (item 5 da seção 3) ou fica só manual.
2. Piloto manual de 2 semanas com a lista de pistas e a métrica.
3. Em paralelo, abrir o suporte do ML e checar no painel Awin/Lomadee os programas ativos e feeds do nosso nicho.
4. Só depois, se o dono quiser, enviar a mensagem ao Pelando.
5. Qualquer automação nova: contrato de tarefa, gate (`npm run gate`), registro no Fluxo Mestre, flag desligada por padrão.

## 9. Dado que falta

- Texto integral dos Termos relido por humano (a leitura foi por resumo; a cláusula de uso automatizado pode estar em outro documento, como o Código de Conduta: https://www.pelando.com.br/sobre/codigo-de-conduta, que NÃO li).
- Confirmação do formato real dos sitemaps (DADO DO BRIEFING, não verifiquei).
- Taxa de pistas úteis (métrica do piloto).
- Lista de programas Awin/Lomadee ativos no nicho.

## 10. Métrica de sucesso

Pelo menos X% das pistas viram oferta verificada e nova na nossa coleta (X definido após o piloto), zero texto/foto/preço do Pelando no site ou nas mensagens, zero requisição fora do teto, zero uso de api-web.

Divergência a registrar: se algum membro defender ler as páginas de oferta em massa ou a api-web, meu parecer é contra.
