# R-119 (B): pontuacao de fotos da vitrine como TAREFA AGENDADA PERMANENTE do Windows (sem janela de terminal).
#   Religar / instalar :  powershell -ExecutionPolicy Bypass -File scripts\foto-vitrine-tarefa.ps1 -Acao Instalar
#   Ver estado         :  powershell -ExecutionPolicy Bypass -File scripts\foto-vitrine-tarefa.ps1 -Acao Status
#   Rodar agora        :  powershell -ExecutionPolicy Bypass -File scripts\foto-vitrine-tarefa.ps1 -Acao Rodar
#   Desligar           :  powershell -ExecutionPolicy Bypass -File scripts\foto-vitrine-tarefa.ps1 -Acao Desligar     (remove a tarefa; nada mais a desfazer)
# A tarefa dispara a cada 8 min e no logon, roda UMA rodada de scripts/foto-vitrine-pontuar.ts (orcamento de 400 s), NUNCA sobrepoe rodadas (IgnoreNew), tem teto de 20 min por
# rodada, prioridade baixa, reinicia sozinha se falhar e registra em .foto-vitrine-tarefa.log + collector_runs (job foto-vitrine-pontuar). Roda como o usuario atual (sem senha);
# precisa de sessao aberta, como o resto do ambiente local. Sem token neste arquivo: as variaveis vem de .env.local, lido pelo proprio script.
param([ValidateSet('Instalar', 'Status', 'Rodar', 'Desligar')][string]$Acao = 'Status')
$ErrorActionPreference = 'Stop'
$Nome = 'Egeek86-FotoVitrine'
$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Log = Join-Path $Raiz '.foto-vitrine-tarefa.log'

switch ($Acao) {
  'Instalar' {
    # sai do laco antigo de terminal (--loop) para nao duplicar o trabalho
    Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'foto-vitrine-pontuar\.ts --loop' -and $_.Name -match 'node|cmd|bash' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $cmd = "cd /d `"$Raiz`" && npx tsx --conditions=react-server --env-file=.env.local scripts/foto-vitrine-pontuar.ts --orcamento 400 >> `"$Log`" 2>&1"
    $tarefaAcao = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c $cmd" -WorkingDirectory $Raiz
    $t1 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 8)
    $t2 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $cfg = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 2) -Hidden
    $cfg.Priority = 8
    Register-ScheduledTask -TaskName $Nome -Action $tarefaAcao -Trigger @($t1, $t2) -Settings $cfg -Description 'R-119: pontua fotos da vitrine de jogos (CLIP local) a cada 8 min. Desligar: foto-vitrine-tarefa.ps1 -Acao Desligar' -Force | Out-Null
    Write-Output "Tarefa '$Nome' instalada (a cada 8 min). Log: $Log"
  }
  'Status' {
    $t = Get-ScheduledTask -TaskName $Nome -ErrorAction SilentlyContinue
    if (-not $t) { Write-Output "Tarefa '$Nome' NAO instalada."; break }
    $i = Get-ScheduledTaskInfo -TaskName $Nome
    Write-Output ("Estado: {0} | ultima execucao: {1} | resultado: {2} | proxima: {3}" -f $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
    if (Test-Path $Log) { Get-Content $Log -Tail 3 }
  }
  'Rodar' { Start-ScheduledTask -TaskName $Nome; Write-Output 'Disparada.' }
  'Desligar' {
    Unregister-ScheduledTask -TaskName $Nome -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Tarefa '$Nome' removida."
  }
}
