@echo off
chcp 65001 >nul
echo Stopping game server (node server.ts)...
powershell -NoProfile -Command "$p = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.ts*' }; if (-not $p) { echo 'No game server running.' } else { $p | ForEach-Object { $id = $_.ProcessId; try { Stop-Process -Id $id -Force -ErrorAction Stop; echo (\"Stopped PID \" + $id) } catch { echo (\"Already exited PID \" + $id) } } }"
echo Done
pause
