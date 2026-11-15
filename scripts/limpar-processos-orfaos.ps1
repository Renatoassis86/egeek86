# Encerra processos orfaos (pai morto) de builds/testes dos agentes: node de 'next build', tsx e playwright (qa.*.cjs) com mais de N minutos.
# Uso: powershell -File scripts/limpar-processos-orfaos.ps1 [-Apply] [-IdadeMinMin 10]
# Por padrao so lista (dry-run). Nunca mexe no projeto 'wemake', no Antigravity, no Chrome do usuario nem em processos com pai vivo.
param([switch]$Apply, [int]$IdadeMinMin = 10)
$alvo = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $c = $_.CommandLine; $c -and $c -notmatch 'wemake' -and $c -notmatch 'antigravity|extensions\\' -and
  ($c -match 'next' -and $c -match 'build' -or $c -match 'tsx' -or $c -match 'playwright|qa\.cjs|scratchpad') -and
  -not (Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue) -and
  ((Get-Date) - $_.CreationDate).TotalMinutes -gt $IdadeMinMin }
$mb = [int](($alvo | Measure-Object WorkingSetSize -Sum).Sum / 1MB)
"orfaos: {0} (~{1} MB)" -f ($alvo | Measure-Object).Count, $mb
if ($Apply) { $alvo | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "encerrados." } else { "dry-run: use -Apply para encerrar." }
