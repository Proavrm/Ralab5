param(
    [switch]$OpenBrowser,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $repoRoot 'frontend\react'
$frontendDist = Join-Path $frontendDir 'dist\index.html'
$serverLauncher = Join-Path $repoRoot 'launch_ralab5_server.cmd'
$tunnelLauncher = Join-Path $repoRoot 'scripts\start_cloudflared_ralab5.ps1'
$configCandidates = @(
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:USERPROFILE\.cloudflared\cloudflared_ralab5.yml"
)

# Option 2 serves frontend/react/dist (not Vite). Without a rebuild here, an already
# running server on 8000 would keep serving an outdated dist; JS assets use long-lived cache headers.
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

            Write-Host 'Building frontend for static hosting (Cloudflare / port 8000)...'
            & $npmCommand.Source run build
            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }
        }
        finally {
            Pop-Location
        }
    }
    elseif (-not (Test-Path $frontendDist)) {
        Write-Error 'Frontend build is missing and npm is not available.'
        exit 1
    }
    else {
        Write-Warning 'npm not found; using existing frontend/react/dist without rebuild.'
    }
}

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

function Test-PortListening {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    try {
        return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    }
    catch {
        return $false
    }
}

function Get-TunnelHostname {
    $configPath = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $configPath) {
        return $null
    }

    $hostnameMatch = Select-String -Path $configPath -Pattern 'hostname:\s*(\S+)' | Select-Object -First 1
    if (-not $hostnameMatch) {
        return $null
    }

    return $hostnameMatch.Matches[0].Groups[1].Value
}

$serverRunning = Test-PortListening -Port 8000
$cloudflaredRunning = [bool](Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1)

if (-not $env:RALAB_AUTH_MODE) {
    $env:RALAB_AUTH_MODE = 'proxy'
}

if (-not $serverRunning) {
    Write-Host 'Starting RaLab5 server window (RALAB_AUTH_MODE=proxy if unset)...'
    Start-Process -FilePath 'cmd.exe' -WorkingDirectory $repoRoot -ArgumentList @('/k', "`"$serverLauncher`"") | Out-Null
}
else {
    Write-Host 'RaLab5 server already listening on port 8000.'
    if (-not $SkipBuild) {
        Write-Host 'If the app was already open, hard-refresh (Ctrl+F5) so the browser loads the new JS bundles.'
    }
}

if (-not $cloudflaredRunning) {
    Write-Host 'Starting Cloudflare tunnel window...'
    Start-Process -FilePath 'powershell.exe' -WorkingDirectory $repoRoot -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$tunnelLauncher`"") | Out-Null
}
else {
    Write-Host 'Cloudflare tunnel already running.'
}

$publicHostname = Get-TunnelHostname

Write-Host ''
Write-Host 'RaLab5 launch requested.'
Write-Host 'Local URL:  http://localhost:8000'

if ($publicHostname) {
    Write-Host "Public URL: https://$publicHostname"
}
else {
    Write-Host 'Public URL: check your Cloudflare tunnel config.'
}

if ($OpenBrowser) {
    if ($publicHostname) {
        Write-Host "Browser will open automatically on https://$publicHostname"
        Start-BrowserWhenReady -Url "https://$publicHostname"
    }
    else {
        Write-Host 'Cloudflare hostname not found; opening the local URL instead.'
        Start-BrowserWhenReady -Url 'http://localhost:8000'
    }
}

Write-Host ''
Write-Host 'Use this launcher for normal internet usage: app + Cloudflare tunnel.'
Write-Host 'Use launch_ralab5_test.cmd for local-only usage.'