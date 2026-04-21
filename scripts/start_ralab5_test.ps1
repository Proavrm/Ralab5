param(
    [int]$Port = 8000,
    [switch]$Reload,
    [switch]$SkipBuild,
    [string]$ListenHost = '0.0.0.0',
    [switch]$UseProxyHeaders,
    [string]$ForwardedAllowIps = '127.0.0.1',
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $repoRoot 'frontend\react'
$backendDir = Join-Path $repoRoot 'backend\current_fastapi'
$frontendDist = Join-Path $frontendDir 'dist\index.html'
$backendRequirements = Join-Path $backendDir 'requirements.txt'

function Start-BrowserWhenReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    $escapedUrl = $Url.Replace("'", "''")
    $probeScript = @"
`$targetUrl = '$escapedUrl'
for (`$attempt = 0; `$attempt -lt 60; `$attempt++) {
    try {
        Invoke-WebRequest -UseBasicParsing `$targetUrl | Out-Null
        Start-Process `$targetUrl
        exit 0
    }
    catch {
        Start-Sleep -Milliseconds 500
    }
}
Start-Process `$targetUrl
"@

    Start-Process -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile',
        '-WindowStyle', 'Hidden',
        '-Command',
        $probeScript
    ) | Out-Null
}

$pythonCandidates = @(
    (Join-Path $backendDir '.venv\Scripts\python.exe'),
    (Join-Path $repoRoot 'Ralab5.venv\Scripts\python.exe')
)

$pythonExe = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $pythonExe) {
    $bootstrapPython = $null
    $pyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    $systemPython = Get-Command python.exe -ErrorAction SilentlyContinue

    if ($pyLauncher) {
        $bootstrapPython = $pyLauncher.Source
    } elseif ($systemPython) {
        $bootstrapPython = $systemPython.Source
    }

    if (-not $bootstrapPython) {
        Write-Error 'Python is required to start RaLab5.'
        exit 1
    }

    $backendVenvDir = Join-Path $backendDir '.venv'
    Write-Host 'Creating backend virtual environment...'
    & $bootstrapPython -m venv $backendVenvDir
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    $pythonExe = Join-Path $backendVenvDir 'Scripts\python.exe'

    Write-Host 'Installing backend dependencies...'
    & $pythonExe -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    & $pythonExe -m pip install -r $backendRequirements
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if (-not $SkipBuild) {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npmCommand) {
        Push-Location $frontendDir
        try {
            if (-not (Test-Path 'node_modules')) {
                Write-Host 'Installing frontend dependencies...'
                & $npmCommand.Source install
                if ($LASTEXITCODE -ne 0) {
                    exit $LASTEXITCODE
                }
            }

            Write-Host 'Building frontend...'
            & $npmCommand.Source run build
            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }
        }
        finally {
            Pop-Location
        }
    } elseif (-not (Test-Path $frontendDist)) {
        Write-Error 'Frontend build is missing and npm is not available.'
        exit 1
    }
}

Push-Location $backendDir
try {
    $uvicornArgs = @('-m', 'uvicorn', 'api_main:app', '--host', $ListenHost, '--port', $Port)
    $browserUrl = "http://localhost:$Port"

    if ($Reload) {
        $uvicornArgs += '--reload'
    }
    if ($UseProxyHeaders) {
        $uvicornArgs += @('--proxy-headers', '--forwarded-allow-ips', $ForwardedAllowIps)
    }

    if ($ListenHost -eq '127.0.0.1' -or $ListenHost -eq 'localhost') {
        Write-Host "Starting RaLab5 behind a reverse proxy on http://$ListenHost`:$Port"
    }
    else {
        Write-Host "Starting RaLab5 on http://localhost:$Port"
        Write-Host "For another PC on the same network, use http://<this-pc-ip>:$Port"
    }

    if ($UseProxyHeaders) {
        Write-Host "Proxy headers enabled; trusted forwarders: $ForwardedAllowIps"
    }

    if ($OpenBrowser) {
        Write-Host "Browser will open automatically on $browserUrl"
        Start-BrowserWhenReady -Url $browserUrl
    }

    & $pythonExe @uvicornArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}