# Departamentos (/mercado): publicação mínima e reversível

Data: 2026-11-10. Origem: ata `docs/conselho/atas/2026-11-10-melhorias-do-front-por-area.md` (emenda E.1 a E.4) e ADR 0008.
Estado: código pronto e atrás de chave DESLIGADA. Nada foi escrito no banco, nada foi commitado, publicado ou implantado. Games não foi editado (nenhuma consulta, página, média ou grade de games mudou).

## Arquivos

Criados:
- `src/lib/catalog/departamentos.ts`: registro dos 5 departamentos (slug, rótulo, tipo de cartão, chave `dept_<slug>`), regras puras (estado, linha de identidade, mediana, busca) e constantes (mínimo de 3 masters, cache de 30 s, 24 por página, frescor de 6 h).
- `src/lib/analytics/origem-clique.ts`: validação de `s` (tg, wa, site) e `m` (`^[a-z0-9-]{3,40}$`) do /go.
- `src/lib/catalog/aprovacao-nicho.ts`: critérios de aprovação (puros).
- `src/server/departamentos.ts`: leitura da chave no banco (`feature_flags`) com cache em memória de 30 s, trava mestra, contagem de masters; falha de leitura = fechado.
- `src/server/departamentos-rotas.ts`: `exigirDepartamento` (404 real).
- `src/server/queries/departamento.ts`: consultas novas (exigem a vertical do registro, recusam games, porteiro `approved` por inclusão, só oferta clicável). Reaproveita `publicOffersCtes(vertical)`; `priceQuotesCtes` não é usado porque os departamentos não têm série.
- `src/components/mercado/cartao-departamento.tsx`.
- `src/app/(detalhe)/mercado/[vertical]/page.tsx` e `.../[slug]/page.tsx` (em `(detalhe)` de propósito: sem `loading.tsx` acima, `notFound()` devolve 404 real, não soft-404).
- `src/app/(shop)/link-em-ativacao/page.tsx`: aviso neutro para link pendente.
- `scripts/aprovar-masters-nicho.ts`, `scripts/test-departamentos.ts`; comando `npm run test:departamentos` no `package.json`.

Editados (runtime existente):
- `src/app/go/[slug]/route.ts`: ver abaixo.
- Menu, mudança mínima: `src/app/(shop)/layout.tsx` (lê os departamentos abertos), `src/components/layout/app-shell.tsx`, `app-header.tsx` e `mobile-nav-drawer.tsx` (propriedade opcional `departamentos`; vazia = HTML do menu idêntico ao atual). `site-footer.tsx` não foi alterado.

## Regras implementadas
- Departamento aberto = trava mestra `MERCADO_UI` ligada (`1` ou `true`) E linha `dept_<slug>` com `enabled=true` em `feature_flags` E 3 ou mais masters aprovados e visíveis. Qualquer outra coisa: 404 (rotas), `/go` recusa, item do menu some.
- Master visível = `vertical` do departamento, `catalogGate.verdict='approved'` (ou `manual='approved'`, `manual='rejected'` vence) e pelo menos uma oferta clicável.
- Oferta clicável = passa em `publicOffersCtes(vertical)` E `affiliate_link_pending=false` E ativa E sem quarentena E checada há menos de 6 h (`OFERTA_CLICAVEL_MAX_HORAS`, ata E.1 item 2) E rede Mercado Livre ou Shopee (Amazon fora) E URL http(s).
- Exibição: menor preço agora, número de vendedores, "verificado há X"; mediana só com 3 ou mais vendedores do Mercado Livre, rotulada "apenas Mercado Livre". Sem selo, gráfico, histórico, "% abaixo" ou "de/por". Sem imagem nova (foto do master, `contain`). Noindex, fora do sitemap, sem `generateStaticParams`.
- Linha de identidade só com dado do master: livro (ISBN, edição, editora, autor), tecnologia (marca, part number, GTIN, modelo), eletro (marca, modelo, voltagem), esporte (marca, modelo).
- Janela do dono: `rules` com `[{"audience":"admin"}]` abre o departamento só para administradores logados (menu, rotas e `/go`).

## /go
- Aceita games sempre; outro departamento só se liberado (`departamentoLiberadoParaGo`); fechado vai a `/oferta-encerrada`.
- Link pendente NÃO redireciona em nenhuma vertical: vai a `/link-em-ativacao` e grava o evento `affiliate_click_blocked` (propriedades: motivo `link_pendente`). Mudança de comportamento em games: as 4 ofertas games com link pendente deixam de levar à loja.
- O evento é gravado com `after()` (doc `after.md` do Next 16 confirma uso em route handler); `affiliate_click` ganhou `vertical`, `origem` e `mensagem` nas propriedades. Link válido de games redireciona exatamente como antes.
- Origem: `s` em {tg, wa, site} vira `origem`; `m` casando `^[a-z0-9-]{3,40}$` vira `mensagem`; qualquer outro valor é ignorado. Os parâmetros nunca vão para o destino.

## Como ligar e desligar
Pré-requisito único (não há migration de esquema; `feature_flags` já existe). Inserir as 5 linhas DESLIGADAS (executar só com autorização do dono):

```sql
INSERT INTO feature_flags (key, description, enabled, rules) VALUES
 ('dept_tecnologia',       'Departamento Tecnologia em /mercado',       false, '[]'::jsonb),
 ('dept_eletroeletronicos','Departamento Eletroeletrônicos em /mercado',false, '[]'::jsonb),
 ('dept_livros',           'Departamento Livros em /mercado',           false, '[]'::jsonb),
 ('dept_eletrodomesticos', 'Departamento Eletrodomésticos em /mercado', false, '[]'::jsonb),
 ('dept_esporte',          'Departamento Esporte em /mercado',          false, '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

- Abrir só para o dono: `UPDATE feature_flags SET enabled=true, rules='[{"audience":"admin"}]'::jsonb, updated_at=now() WHERE key='dept_livros';`
- Abrir ao público: `UPDATE feature_flags SET enabled=true, rules='[]'::jsonb, updated_at=now() WHERE key='dept_livros';`
- Reverter tudo (vale em até 30 s, sem deploy): `UPDATE feature_flags SET enabled=false, updated_at=now() WHERE key LIKE 'dept_%';`
- Trava mestra: variável de ambiente `MERCADO_UI=1` (precisa de deploy para mudar). Sem ela, tudo é 404 e o banco nem é lido. Remover e reimplantar, ou Instant Rollback da Vercel, esconde as rotas por inteiro.
- Cada instância serverless tem o seu cache de 30 s; a reversão total leva no máximo esse tempo.

## Passo a passo de abertura (cada passo em produção pede autorização do dono no momento)
1. Dry-run: `npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts` (somente leitura). Imprime a lista nominal (nome, vertical, ofertas clicáveis, faixa de preço, motivos de quem fica) e grava a proposta em `docs/backups/aprovar-nichos-proposta-<ts>.json`.
2. O dono confere 100% da lista (títulos, foto, ISBN/GTIN, faixa) e devolve um JSON `{"ids":[...]}`. Repetir o dry-run com `--lista` para reavaliar ao vivo (os preços e a idade das ofertas se movem).
3. Backup do banco (padrão do projeto) e aprovação: `npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts --lista <arquivo> --apply --por "<nome>"`. Grava antes o backup NDJSON (`docs/backups/aprovar-nichos-<ts>.ndjson`, linha completa dos masters) e o log (`aprovar-nichos-log-<ts>.json`); depois muda só `catalogGate.verdict` de `review` para `approved`, com `approvedBy`, `approvedAt`, `criteriaVersion=1` e `previousVerdict`.
4. Inserir as flags desligadas (SQL acima), definir `MERCADO_UI=1` na Vercel e implantar (preview primeiro; ensaiar a reversão e comparar o HTML de games com o baseline).
5. Abrir só para o dono por 24 h (UPDATE com `audience: admin`). Conferir no navegador (390 e 1440 px, tema claro e escuro, 404 do departamento fechado) e clicar em `/go` de uma oferta de cada departamento.
6. Se tudo certo, abrir ao público (`rules='[]'`), com go/no-go em 17/11 conforme a ata.
7. Reversão da aprovação (opcional): `npx tsx --env-file=.env.local scripts/aprovar-masters-nicho.ts --rollback docs/backups/aprovar-nichos-log-<ts>.json --apply`.

## Critérios do dry-run (ata E.2)
Evidência positiva do porteiro (`suggested='approved'`), produto novo (sem usado, recondicionado, Open Box, reembalado, importado), ao menos 1 oferta clicável, amplitude de preço entre clicáveis <= 2,5x, quarentena abaixo de 30% das ofertas, nome específico (3 ou mais palavras, não genérico), identidade forte (modelo ou part number para não-livros; voltagem para eletrodoméstico), sem nome duplicado no departamento, com foto. Decisão minha além da ata: GTIN sozinho não basta sem modelo (barra "Smart TV LG 4k") e eletrodoméstico exige voltagem no atributo ou no nome.

Resultado do dry-run em 10/11 (leitura): 34 de 52 aprováveis (tecnologia 10, livros 17, eletroeletrônicos 3, eletrodomésticos 4), 1 rejeitado pelo dono. A conferência humana continua obrigatória.

## Verificação feita
- `npx tsc --noEmit`: exit 0. `npm run build`: exit 0 (rotas `/mercado/[vertical]`, `/mercado/[vertical]/[slug]`, `/link-em-ativacao` listadas como dinâmicas).
- `npm run test:departamentos`: 145 PASS, 0 FAIL. `test:vertical`, `test:gate`, `test:dimensions`, `test:parecer`: verdes.
- `next start` local, trava mestra desligada: `/mercado/livros`, `/mercado/tecnologia/x` e `/mercado/games` devolvem 404; home sem "Departamentos".
- As consultas de departamento foram exercitadas com dados reais por simulação somente leitura (porteiro trocado em memória; nada gravado): listas, busca, detalhe, mediana (30 vendedores ML em um SSD) e contagens batem.
- Baseline de games por SELECT (`publicOffersCtes('games')`): 1.843 masters, de 8.507 a 8.510 ofertas públicas durante a sessão; a variação de 3 ofertas é coleta em andamento, não código (nenhuma consulta de games foi alterada).

## Pendências
- Navegador (cantos computados, foco, mobile, tema claro): não feito (Chrome proibido nesta tarefa).
- Baseline de HTML de games (`/`, `/ofertas`, `/pesquisa`, `/tabela-de-precos`, uma oferta) antes e depois: comparar em preview.
- Teste de redirecionamento do `/go` ao vivo por departamento e do evento `affiliate_click_blocked` (exige gravar eventos; fazer em preview).
- Esporte não abre (0 masters). Eletrodomésticos passaria no mínimo de 3 (4 aprováveis no dry-run), mas a ata manda mantê-lo fechado; basta não ligar a flag e não incluir seus ids na lista.
- Texto do aviso de comissão e o nome "Departamentos" no menu seguem as decisões do dono.
