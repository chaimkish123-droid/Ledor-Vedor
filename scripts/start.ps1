# Starts L'Dor VaDor on this computer.
#
# Written for somebody who has never used PowerShell. It works out where it
# lives, checks the few things that can be wrong, says so in plain words if
# one of them is, and otherwise opens the family archive in a browser.
#
# Do not run this by hand - double-click start.bat in the folder above.

# Not 'Stop': in Windows PowerShell, that makes a native command's stderr
# throw when redirected - and 'docker info' talks on stderr precisely when
# Docker is down, which is the very case being checked for. Every command
# below is checked by its exit code instead.
$ErrorActionPreference = 'Continue'

function Say($text)  { Write-Host $text }
function Good($text) { Write-Host $text -ForegroundColor Green }
function Bad($text)  { Write-Host $text -ForegroundColor Red }

# ---------------------------------------------------------------- #
# Where are we? Never rely on the folder the window happened to open in.
# ---------------------------------------------------------------- #

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path (Join-Path $root 'docker-compose.yml'))) {
    Bad "I cannot find the application's files."
    Say ""
    Say "This script is in:  $root"
    Say "but there is no docker-compose.yml there, which means the folder"
    Say "was not unzipped whole. Download the ZIP again and unzip all of it."
    exit 1
}

Say ""
Say "L'Dor VaDor"
Say "Working in $root"
Say ""

# ---------------------------------------------------------------- #
# Is Docker there, and is it awake?
# ---------------------------------------------------------------- #

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Bad "Docker Desktop is not installed on this computer."
    Say ""
    Say "Get it from https://www.docker.com/products/docker-desktop/"
    Say "Install it, restart when it asks, open it once, and run this again."
    exit 1
}

Say "Checking Docker is running..."
docker info 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Say "Docker Desktop is installed but not running. Starting it..."

    $candidates = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
    )
    $exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($exe) {
        Start-Process $exe | Out-Null
    } else {
        Say "I could not find it to start it for you - open Docker Desktop"
        Say "from the Start menu yourself."
    }

    # It takes a while to wake up. Wait rather than fail.
    $waited = 0
    while ($waited -lt 180) {
        Start-Sleep -Seconds 5
        $waited += 5
        docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Write-Host "." -NoNewline
    }
    Say ""

    if ($LASTEXITCODE -ne 0) {
        Bad "Docker Desktop did not finish starting after three minutes."
        Say ""
        Say "Open it from the Start menu and watch the bottom-left corner."
        Say "When it says 'Engine running', run this again."
        exit 1
    }
}

Good "Docker is running."
Say ""

# ---------------------------------------------------------------- #
# Build and start.
# ---------------------------------------------------------------- #

# On your own machine the address is plain http://localhost, and browsers
# refuse to keep a login on one of those unless told this is deliberate.
# Without it, signing in silently does nothing at all.
$env:LDOR_COOKIE_SECURE = 'false'

Say "Building the application. The first time takes a few minutes -"
Say "after that it is seconds. You can watch, or go and make tea."
Say ""

docker compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Say ""
    Bad "That did not finish."
    Say ""
    Say "The reason is in the lines above - usually the last few. Copy them"
    Say "and bring them back, and it is normally a one-line fix."
    exit 1
}

# ---------------------------------------------------------------- #
# Wait until it actually answers, then open it.
# ---------------------------------------------------------------- #

Say ""
Say "Started. Waiting for it to be ready..."

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        Write-Host "." -NoNewline
    }
}
Say ""

if (-not $ready) {
    Bad "It started but is not answering yet."
    Say ""
    Say "Here is what it last said:"
    Say ""
    docker compose logs --tail 40
    Say ""
    Say "Copy that and bring it back."
    exit 1
}

Good "Ready."
Say ""
Say "Opening http://localhost:3000"
Start-Process 'http://localhost:3000'

Say ""
Say "You should see 'Begin your family's archive'. Make your account -"
Say "you are the first person here, so you are the administrator."
Say ""
Say "It keeps running after you close this window, and it comes back on"
Say "its own when you restart the computer."
Say ""
Say "  To stop it       double-click stop.bat"
Say "  To start again   double-click start.bat"
Say ""
