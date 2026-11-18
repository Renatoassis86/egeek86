# Pausa temporária de coletores (2026-11-18, incidente de envio parado)

**Causa:** o envio do Telegram ficou ~2 h parado: o pooler de conexões do banco esgotou (`ECHECKOUTTIMEOUT`, consultas simples estourando em 30 s). A carga da minha radiografia gastou o disco, e os 7 coletores `collect-vertical` (rodadas de 4 a 5 min, até 6 conexões cada, sobrepostas) mais a semeadura mantiveram o pooler cheio.

**O que foi pausado (por variável de ambiente na Vercel, produção; sem mexer em código):**
- `VERTICAL_BELEZA_ENABLED`, `VERTICAL_ESPORTE_ENABLED`, `VERTICAL_IMPRESSAO3D_ENABLED`, `VERTICAL_LIVROS_ENABLED`, `VERTICAL_ELETRODOMESTICOS_ENABLED`, `VERTICAL_ELETROELETRONICOS_ENABLED`, `VERTICAL_TECNOLOGIA_ENABLED` = `0` (valor anterior: `1`).
- `SEMEADURA_LOJAS` = `nenhuma` (valor anterior: `beleza,tecnologia,eletroeletronicos,eletrodomesticos,esporte,livros,impressao3d`).
- `GROUP_COTA_ITEM` = `off` (cotas por item desligadas; a consulta da fila ficou mais leve).

**Como restaurar** (depois que o envio estiver estável por 30 min): `printf '1' | vercel env add VERTICAL_<LOJA>_ENABLED production --force --sensitive` para as 7; `printf 'beleza,tecnologia,eletroeletronicos,eletrodomesticos,esporte,livros,impressao3d' | vercel env add SEMEADURA_LOJAS production --force --sensitive`; remover `GROUP_COTA_ITEM` ou pô-la em `on`; depois `vercel redeploy <último deploy> --target production`. Um coletor por vez, olhando o envio entre um e outro.

## Alivio de I/O em 2026-11-19 (alem da pausa acima)
- **Indices criados** (`scripts/criar-indices-io.ts`): `collector_runs_job_status_fim_idx` e `group_messages_hist_envio_idx` (reversiveis: `DROP INDEX CONCURRENTLY IF EXISTS <nome>`).
- **Historico de envios** lido por ciclo: 4 dias em vez de 7 (maior regra = 72 h).
- **Crons mais espacados** (vercel.json; para restaurar, voltar ao commit anterior): collect-prices e collect-shopee 5→10 min; stats 30→60 min; showcase 15→30; vitrines 10→20; daily 30→60; integridade do envio 1→5 min; aprovacao-auto 5→10; precos-fontes 15→30; cobertura-shopee 10→20.
