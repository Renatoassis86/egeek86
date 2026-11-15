# Copia os loops de public/loops para a extensao e gera config.local.json com o token (lido do scratchpad; nunca impresso).
# Uso: powershell -File tools/chrome-loops-extension/sync-extension.ps1 -TokenFile <caminho do token.txt>
param([Parameter(Mandatory=$true)][string]$TokenFile, [string[]]$ExtrasPromo = @('A2B9F6KRH7YF1H'))
$raiz = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
$ext  = Join-Path $raiz 'tools\chrome-loops-extension'
foreach($f in 'ml-links-ui.js','ml-cupons-item.js','cupons-24h.js','amazon-promocoes.js','amazon-assistida.js'){
  Copy-Item (Join-Path $raiz "public\loops\$f") (Join-Path $ext "loops\$f") -Force }
$tok = (Get-Content $TokenFile -Raw).Trim()
@{ api='https://www.egeek86.com'; token=$tok; extrasPromo=$ExtrasPromo } | ConvertTo-Json | Set-Content (Join-Path $ext 'config.local.json') -Encoding UTF8
"extensao sincronizada: loops copiados e config.local.json gerado (token nao exibido)."
