# Ata 2026-11-03: consoles retrô fora do monitoramento de preço

**Porte:** pequeno, reversível. **Decisão do responsável (chat):** "Pode retirar os retrô por enquanto até segunda ordem. Retro só em drops e leilões. A venda no monitoramento de preço de mercado trabalha sempre com itens novos."

**Decisão:** console de geração retrô (PS1 a PS3, PSP/Vita, Xbox clássico/360, Wii/Wii U, DS/3DS, GameCube, N64, SNES/NES, Game Boy, Sega, Atari) é REJEITADO pelo porteiro (`console_retro_fora_do_escopo`). PS4, Xbox One e Switch seguem (ainda vendidos novos). Regra só para a dimensão console, pelo nome do master; nome que cita geração atual não rejeita. Override manual "approved" continua valendo.

**Execução:** regra em `src/lib/catalog/gate.ts`; 17 casos novos em `scripts/test-gate.ts` (126 passam). Gravado em 29 masters (41 ofertas ativas preservadas, nada apagado). Log: `backup/dados/catalog-gate-log-2026-11-03T22-50-43-133Z.json`; backup `...ndjson` ao lado. Desfazer: `apply-catalog-gate.ts --revert <log>`. 16 promoções de `review` para aprovado, vindas de regras anteriores e não pedidas, foram revertidas (log `...NAO-RETRO-reverter.json`).

**Efeito na descoberta:** consoles retrô novos já nascem rejeitados (porteiro na entrada).

**Fora desta decisão (aguarda o dono):** jogos de plataforma legada e acessórios retrô seguem como estavam. Destino futuro: seções de Drops e Leilões.
