# HYDRA Automated Local Development Launcher

This script automates:
1. Doppler environment secrets synchronization (`hydra-mdm-project` -> `dev`)
2. Docker containers startup for Redis (6379) and MongoDB (27017)
3. Backend Express server startup on port 5001 with Doppler injection
4. Frontend Next.js development server startup on port 3000

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "    HYDRA CI/CD Automated Local Environment Launcher   " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Doppler CLI Check
if (-not (Get-Command doppler -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Doppler CLI is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Doppler: https://docs.doppler.com/docs/install-cli"
    exit 1
}

# 2. Sync Doppler Secrets
Write-Host "[*] Syncing Doppler secrets (Project: hydra-mdm-project, Config: dev)..." -ForegroundColor Yellow
try {
    doppler setup --project hydra-mdm-project --config dev --no-interactive | Out-Null
} catch {
    Write-Host "[!] Doppler login required..." -ForegroundColor Yellow
    doppler login
    doppler setup --project hydra-mdm-project --config dev --no-interactive
}

# Download secrets to backend/.env and frontend/.env.local
Write-Host "[*] Injecting Doppler secrets..." -ForegroundColor Yellow
doppler secrets download --project hydra-mdm-project --config dev --format env --no-file | Out-File -FilePath "$rootPath\backend\.env" -Encoding utf8
"NEXT_PUBLIC_BACKEND_URL=http://localhost:5001" | Out-File -FilePath "$rootPath\frontend\.env.local" -Encoding utf8
Write-Host "[OK] Secrets synchronized to backend\.env and frontend\.env.local" -ForegroundColor Green

# 3. Docker Service Check & Start
Write-Host ""
Write-Host "[*] Checking Docker daemon status..." -ForegroundColor Yellow
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[!] Docker Desktop is not currently running." -ForegroundColor Yellow
    Write-Host "    Please start Docker Desktop on your machine to run Redis & Mongo containers." -ForegroundColor Yellow
} else {
    Write-Host "[*] Starting Redis & MongoDB containers via docker-compose..." -ForegroundColor Yellow
    docker-compose up -d redis mongo
    Write-Host "[OK] Redis (6379) and MongoDB (27017) are online in Docker." -ForegroundColor Green
}

# 4. Start Backend
Write-Host ""
Write-Host "[*] Launching Backend on http://localhost:5001..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootPath\backend'; doppler run -- npm run dev"

# 5. Start Frontend
Write-Host "[*] Launching Frontend on http://localhost:3000..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootPath\frontend'; npm run dev"

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "    HYDRA Platform Launched Successfully!            " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  - Frontend: http://localhost:3000"
Write-Host "  - Backend:  http://localhost:5001/api/health"
Write-Host "  - Secrets:  Doppler (hydra-mdm-project / dev)"
Write-Host "  - Services: Redis (6379), MongoDB (27017)"
Write-Host "======================================================" -ForegroundColor Green
