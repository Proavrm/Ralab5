param(
    [string]$Domain = 'ralab5-test.ralaboratory.com',
    [switch]$RotateJwtSecret
)

$ErrorActionPreference = 'Stop'

function Set-UserAndProcessEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    [Environment]::SetEnvironmentVariable($Name, $Value, 'User')
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function New-HexSecret {
    param(
        [int]$ByteCount = 48
    )

    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }

    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

if ([string]::IsNullOrWhiteSpace($Domain)) {
    throw 'Domain must not be empty.'
}

$normalizedDomain = $Domain.Trim().ToLowerInvariant()
$allowedHosts = @($normalizedDomain, '127.0.0.1', 'localhost') -join ','
$allowedOrigins = @(
    "https://$normalizedDomain",
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'http://127.0.0.1:5173',
    'http://localhost:5173'
) -join ','

$existingJwtSecret = [Environment]::GetEnvironmentVariable('RALAB_JWT_SECRET', 'User')
$jwtSecret = $existingJwtSecret
$secretStatus = 'kept existing secret'

if ($RotateJwtSecret -or [string]::IsNullOrWhiteSpace($existingJwtSecret)) {
    $jwtSecret = New-HexSecret
    $secretStatus = 'generated new secret'
}

Set-UserAndProcessEnv -Name 'RALAB_AUTH_MODE' -Value 'proxy'
Set-UserAndProcessEnv -Name 'RALAB_JWT_SECRET' -Value $jwtSecret
Set-UserAndProcessEnv -Name 'RALAB_ALLOWED_HOSTS' -Value $allowedHosts
Set-UserAndProcessEnv -Name 'RALAB_ALLOWED_ORIGINS' -Value $allowedOrigins

Write-Host 'RaLab5 proxy auth configured.'
Write-Host "  RALAB_AUTH_MODE=proxy"
Write-Host "  RALAB_ALLOWED_HOSTS=$allowedHosts"
Write-Host "  RALAB_ALLOWED_ORIGINS=$allowedOrigins"
Write-Host "  RALAB_JWT_SECRET=<hidden> ($secretStatus)"
Write-Host 'Restart already-open terminals to load the persistent user environment.'