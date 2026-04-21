param(
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverLauncher = Join-Path $repoRoot 'launch_ralab5_server.cmd'
$tunnelLauncher = Join-Path $repoRoot 'scripts\start_cloudflared_ralab5.ps1'
$configCandidates = @(
    "$env:USERPROFILE\.cloudflared\config.yml",
    "$env:USERPROFILE\.cloudflared\cloudflared_ralab5.yml"
)

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

if (-not $serverRunning) {
    Write-Host 'Starting RaLab5 server window...'
    Start-Process -FilePath 'cmd.exe' -WorkingDirectory $repoRoot -ArgumentList @('/k', "`"$serverLauncher`"") | Out-Null
}
else {
    Write-Host 'RaLab5 server already listening on port 8000.'
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