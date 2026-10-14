@echo off
setlocal enabledelayedexpansion

echo ======================================================
echo    HYDRA CI/CD Automated Local Environment Launcher
echo ======================================================
echo.

:: 1. Check Doppler CLI
where doppler >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Doppler CLI is not installed or not in PATH.
    echo Please install Doppler: https://docs.doppler.com/docs/install-cli
    pause
    exit /b 1
)

:: 2. Check Doppler Authentication & Setup
echo [*] Syncing Doppler secrets (Project: hydra-mdm-project, Config: dev)...
doppler setup --project hydra-mdm-project --config dev --no-interactive >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Doppler setup failed. Running 'doppler login'...
    doppler login
    doppler setup --project hydra-mdm-project --config dev --no-interactive
)

:: 3. Export Doppler secrets to local backend & frontend .env files
echo [*] Downloading latest environment secrets from Doppler...
doppler secrets download --project hydra-mdm-project --config dev --format env --no-file > backend\.env
echo NEXT_PUBLIC_BACKEND_URL=http://localhost:5001 > frontend\.env.local
echo [OK] Secrets synchronized to backend\.env and frontend\.env.local.

:: 4. Start Docker Infrastructure (Redis + MongoDB)
echo.
echo [*] Checking Docker daemon status...
docker info >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Docker daemon is not running.
    echo     Please start Docker Desktop on Windows.
    echo     Retrying in 5 seconds...
) else (
    echo [*] Starting Redis and MongoDB via docker-compose...
    docker-compose up -d redis mongo
    echo [OK] Redis (6379) and MongoDB (27017) are running in Docker.
)

:: 5. Launch Backend Service
echo.
echo [*] Starting Backend Service in a new window (port 5001)...
start "HYDRA Backend (Port 5001)" cmd /k "cd /d %~dp0backend && doppler run -- npm run dev"

:: 6. Launch Frontend Service
echo [*] Starting Frontend UI in a new window (port 3000)...
start "HYDRA Frontend (Port 3000)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ======================================================
echo    HYDRA Platform Launched Successfully!
echo ======================================================
echo  - Frontend: http://localhost:3000
echo  - Backend:  http://localhost:5001/api/health
echo  - Secrets:  Managed automatically by Doppler (dev)
echo  - Services: Redis (6379), MongoDB (27017)
echo ======================================================
echo.
echo Press any key to exit this launcher window...
pause >nul
