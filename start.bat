@echo off
title CryptoVerse - Web3 Smart Contract & Blockchain Dashboard
color 0A

echo.
echo   ╔════════════════════════════════════════════════════════════╗
echo   ║                                                            ║
echo   ║   ◆  CryptoVerse Web3 Portfolio Project Launcher           ║
echo   ║      (Includes Layer 2 Support ^& Smart Contracts)        ║
echo   ║                                                            ║
echo   ╚════════════════════════════════════════════════════════════╝
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo   [ERROR] Node.js is not installed or not in PATH.
    echo   Download it from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Show Node.js version
echo   Node.js version:
for /f "tokens=*" %%i in ('node -v') do echo     %%i
echo.

:: Check if node_modules exists, install if not
if not exist "node_modules\" (
    echo   [INFO] node_modules not found. Installing dependencies...
    echo.
    call npm install
    echo.
    if %errorlevel% neq 0 (
        color 0C
        echo   [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo   [OK] Dependencies installed successfully!
    echo.
)

:: Check if .env exists, create from example if not
if not exist ".env" (
    if exist ".env.example" (
        echo   [INFO] Creating .env from .env.example...
        copy .env.example .env >nul
        echo   [OK] .env file created. Edit it to add your API keys.
        echo.
    )
)

echo   ══════════════════════════════════════════════════════
echo   Starting CryptoVerse server...
echo   Dashboard will open at: http://localhost:3000
echo   Press Ctrl+C to stop the server.
echo   ══════════════════════════════════════════════════════
echo.

:: Wait 2 seconds then open browser
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start the server
node server.js

:: If server exits
echo.
echo   Server stopped.
pause
