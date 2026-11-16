# Ciclo 05: páginas reais por amostragem (C28)

Método: `scripts/auditoria-informacao/ciclo05.ts` busca `/monitoramento/comparar/<master>` (HTML público, sem aba) e compara "Menor preço agora" com o banco (menor preço ativo, fora de quarentena). Amostra aleatória de até 5 masters por departamento (35 masters). Mais 1 leitura com aba nova do Chrome (fechada) da página do GodFall PS5 e leitura de `/ofertas`.

## Resultado
- Jogos: 5 de 5 batem com o banco. As rotas `/monitoramento/comparar` só existem para games (404 nos outros 6 departamentos), então 30 masters de Casa, Eletrônicos, Esporte, Impressão 3D, Livros e Tecnologia ficaram SEM teste de página: **lacuna de cobertura**, a repetir com a rota de produto de cada loja (não localizada por mim; precisa do mapa de rotas).
- GodFall PS5 (fcdbb149...): o site mostra "Menor preço agora R$ 49,97 (Amazon)" e a mensagem P1 do Telegram diz "hoje R$ 130,00" (AUD-01). Três fontes, dois números.
- `/ofertas`: crachá "-51%" sob "Queda confirmada" é % abaixo da média, não queda (AUD-21).
- `/`, `/ofertas`, `/black-friday`, `/contatos`, `/monitoramento`: sem "afiliado", "comissão", "% OFF", "amostra" ou "Brasília".

## Invariante proposto
- **I-14** Teste de contrato diário: para cada departamento, 5 masters aleatórios, "Menor preço agora" da página = consulta oficial; falha se divergir.
