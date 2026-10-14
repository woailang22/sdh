@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting game server...
echo Open http://127.0.0.1:3000 in browser
echo Keep this window OPEN = server running, close it = stop server
npm run dev
pause
