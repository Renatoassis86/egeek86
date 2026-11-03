# Ata curta: capacidade não separa o console PS5 (2026-11-03)

Decisão do dono: no console PS5, 825GB e 1TB (e demais capacidades) são o mesmo produto. Seguem separando modelo (Slim/Standard/Pro), Digital x com disco, bundle, região e edição limitada. Outras plataformas (Xbox, Switch, PS4) mantêm a regra de capacidade.

Execução: ajuste em `src/lib/affiliate/dedup.ts`, testes em `scripts/test-identity.ts`, emenda no ADR 0006, §11.1 de `docs/modelo-indicadores.md`, fusão dos masters de console PS5 duplicados por capacidade (backup, log e reversão registrados no relatório da execução). Nada apagado; masters fundidos ficam arquivados com `mergedInto`.
