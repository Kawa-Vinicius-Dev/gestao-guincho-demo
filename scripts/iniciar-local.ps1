$ErrorActionPreference = 'Stop'

$raizProjeto = Join-Path $PSScriptRoot '..'
$backend = Join-Path $raizProjeto 'backend'
$frontend = Join-Path $raizProjeto 'frontend'

Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$backend'; .\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=local'"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$frontend'; npm run dev"
Write-Host 'Backend e frontend foram iniciados em janelas separadas.'
