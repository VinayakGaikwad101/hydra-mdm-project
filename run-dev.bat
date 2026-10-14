@echo off
echo ========================================================
echo  HYDRA Self-Healing Agent Platform - Local Dev Launcher
echo ========================================================

echo [1/3] Fetching latest environment variables from Doppler...
call doppler run -- echo Secrets synchronized.

echo [2/3] Checking Docker daemon status...
docker info >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [Docker] Docker engine is running. Launching Redis and Mongo containers...
    docker compose up -d
) else (
    echo [Docker] Docker Desktop is NOT running.
    echo [Fallback] HYDRA will automatically fallback to local subprocess test execution.
)

echo [3/3] Starting backend & frontend under Doppler...
start "HYDRA Backend (Port 5001)" cmd /k "cd backend && doppler run -- npm run dev"
start "HYDRA Frontend (Port 3000)" cmd /k "cd frontend && doppler run -- npm run dev"

echo ========================================================
echo  HYDRA is now launching at http://localhost:3000
echo ========================================================
