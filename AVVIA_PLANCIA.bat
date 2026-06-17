@echo off
cls

echo.
echo ============================================
echo AVVIO PORTFOLIO MK16 FINAL BUILD
echo ============================================
echo.

cd /d "%~dp0"

start /B npx -y http-server -p 8080 -c-1

timeout /t 2 /nobreak >nul

start chrome --new-window --start-fullscreen http://localhost:8080/index.html
