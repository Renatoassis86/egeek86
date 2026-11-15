# Extensão local "Espaço Geek 86 - Loops"
Reinjeta os loops (ML: `__mll`, `__mlc`; Amazon: `__cup`, `__promo`, `__amza`) a cada carregamento das páginas e marca as abas como não descartáveis.

## Instalar (uma vez)
1. `powershell -File tools/chrome-loops-extension/sync-extension.ps1 -TokenFile <token.txt>` (copia os loops e gera `config.local.json`, que fica FORA do git).
2. No Chrome (perfil das abas), abra `chrome://extensions`, ligue **Modo do desenvolvedor**, clique **Carregar sem compactação** e escolha a pasta `tools/chrome-loops-extension`.
3. Abra/recarregue as 3 páginas (ML linkbuilder, Amazon, Shopee). Os loops sobem sozinhos.

## Atualizar quando um loop mudar
Rode o `sync-extension.ps1` de novo e clique em **Recarregar** na extensão em `chrome://extensions`.

## Segurança
`config.local.json` contém o token de ingest: não commitar (está no `.gitignore`), não compartilhar a pasta.
