$ErrorActionPreference = 'Stop'

Set-Location (Join-Path $PSScriptRoot '..')
docker compose up -d postgres
Write-Host 'PostgreSQL iniciado em localhost:5432.'
