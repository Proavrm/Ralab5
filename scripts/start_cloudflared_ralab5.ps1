$cloudflared = "cloudflared.exe" # ou caminho completo se não estiver no PATH
$configCandidates = @(
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:USERPROFILE\.cloudflared\cloudflared_ralab5.yml"
)

$config = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not (Test-Path $config)) {
    $candidateList = $configCandidates -join ', '
    Write-Error "Arquivo de configuração do tunnel não encontrado. Procurado em: $candidateList"
    exit 1
}

Write-Host "Iniciando Cloudflare Tunnel para RaLab5..."
Write-Host "Usando configuração: $config"
& $cloudflared tunnel --config $config run
