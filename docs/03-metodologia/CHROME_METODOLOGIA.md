# Metodologia de uso do Chrome (2026-11-18)

Pedido do dono: "como anda a busca, a abertura e o controle dos produtos pelo Chrome? Implemente uma metodologia de uso do Chrome o mais eficiente e que resolva o problema de extração pelo navegador".

## 1. Diagnóstico medido
- **Volume baixo:** Amazon, 138 leituras de preço em 24 h (de ~3.000 ofertas ativas); cupons, 142 leituras em 99 ofertas (de ~27 mil); batimento de cupons ~3 por hora. Em rajada logo depois de cada reinjeção (27 ofertas em 1 h) e quase nada depois.
- **Abas congelam:** nas rodadas do vigia, `Runtime.evaluate` estourou 45 s em quase toda aba ("renderer frozen"), e o Chrome **substituiu abas** (IDs novos) várias vezes por rodada, descartando o loop injetado.
- **A própria sonda piora:** o vigia sondava cada aba por CDP; aba congelada = 45 s perdidos por sonda e, ao navegar, o Chrome recria a aba.
- **Métodos pesados:** `cupons-24h`, `shopee-cupons` e `amazon-promocoes` abrem **iframes** (renderizam a página inteira); `amazon-assistida` e o linkbuilder usam `fetch` (leve). ML item e Shopee são SPA.
- Servidor não é o gargalo da ingestão: rota de cupom responde em 0,6 s.

### Causa raiz encontrada (2026-11-18, medida na máquina do dono)
- **Falta de memória:** 685 MB livres de 13,3 GB (5%), com o Chrome em 41 processos (2,6 GB) e **um servidor Next.js de outro projeto (`wemake`, `start-server.js`) rodando desde 16/11 com 2,1 GB**, além de IDE e antivírus. Com memória nesse nível o Windows comprime e o Chrome congela/descarta abas em segundo plano: foi o que aconteceu ao testar agora (todas as abas, até a que estava aberta, deram `Runtime.evaluate` estourando 45 s, inclusive um comando trivial).
- **Por isso** os loops rodam em rajada logo depois da reinjeção e param: a aba congela, o Chrome a substitui e o loop injetado se perde.
- **Ação do dono:** encerrar esse servidor de outro projeto quando não estiver em uso e manter o Chrome só com as abas dos loops. Eu não encerro processo de outro projeto sem pedido.
- **Meta de máquina:** pelo menos 2 GB livres; o vigia deve registrar memória livre junto do batimento (pendente).

## 2. Regras de uso do Chrome
1. **Uma aba = um loop** (Amazon home, Amazon conta, ML linkbuilder, ML cupons, Shopee), todas no mesmo grupo MCP, nunca minimizadas nem em janela de outro perfil.
2. **Leitura por `fetch` + `DOMParser` na própria aba logada** (cookies do dono), nunca aba nova nem iframe quando a página entrega o dado no HTML. Iframe só onde o site exige renderização (SPA da Shopee), com fatia curta e `src` descartado ao terminar.
3. **Trabalho em fatias:** cada leitura cede a thread principal (`await` + `setTimeout 0`); análise pesada de HTML em `DOMParser`, não em regex gigante.
4. **Timers no Worker** (`relogio: worker`): a aba em segundo plano não estrangula o ciclo.
5. **Batimento de saúde (feito):** todo loop manda 1 batimento por minuto para `/api/ingest/loop-saude`: estado, versão, **atraso do timer (`lagMs`)**, visibilidade e memória. Atraso grande = aba congelada ou thread travada.
6. **Vigia por banco, não por aba (feito):** `scripts/vigia-loops.ts` lê UMA consulta (`collector_runs`, job `loop:<nome>`) e só manda reinjetar o loop **sem batimento há mais de 6 min**. Sem sonda CDP em aba saudável.
7. **Reinjeção:** navegar a **mesma** aba para a URL do loop e injetar; token lido do arquivo, nunca impresso.
8. **Higiene:** reiniciar o loop quando `memMb` passar de ~400 ou depois de 6 h (vazamento); registrar no relatório.
9. **Prioridade de leitura por valor:** itens com preço em queda, com cupom visto antes e os mais enviados primeiro (fila de itens, não varredura cega).

## 3. O que o dono mantém no Chrome (não alterado por mim)
Economia de memória desligada (já está), abas dos loops fixadas, janela não minimizada, computador ligado e sem suspensão. Se o Chrome continuar congelando abas em segundo plano, o ajuste fica em `chrome://discards` (desativar congelamento de abas) — configuração do navegador é decisão do dono.

## 4. Pendente
- Trocar o iframe do `cupons-24h` por `fetch` + `DOMParser` para a Amazon; Shopee pelas rotas internas de dados (JSON) em vez de renderizar a página.
- Fila de itens por valor para o ML (1.000+ leituras/dia) e página de cupons de cada plataforma (fila #153).
- Medir após 24 h: leituras por hora por loop, `lagMs` mediano, abas reiniciadas por dia (meta: menos de 2).
