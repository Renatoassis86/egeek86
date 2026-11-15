# Encerra processos node de 'next build' órfãos (pai morto) com mais de 60 minutos.
# Uso: powershell -File scripts/limpar-processos-orfaos.ps1 [-Apply]
# Por padrão só lista (dry-run). Nunca mexe em processos do projeto 'wemake' nem em processos com pai vivo.
param([switch]$Apply, [int]$IdadeMinMin = 60)
$alvo = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $_.CommandLine -match 'next' -and $_.CommandLine -match 'build' -and $_.CommandLine -notmatch 'wemake' -and
  -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue) -and
  ((Get-Date) - $_.CreationDate).TotalMinutes -gt $IdadeMinMin }
$mb = [int](($alvo | Measure-Object WorkingSetSize -Sum).Sum / 1MB)
"orfaos: {0} (~{1} MB)" -f ($alvo | Measure-Object).Count, $mb
if ($Apply) { $alvo | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "encerrados." } else { "dry-run: use -Apply para encerrar." }
