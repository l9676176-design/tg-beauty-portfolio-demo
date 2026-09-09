@echo off
rem Запуск локальной демонстрации без установки пакетов; нужен Node.js 24 или новее.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. See AGENT.md.
  pause
  exit /b 1
)
node server.mjs
pause
