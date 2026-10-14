@echo off
echo 正在停止《坍界行者》服务器...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.ts*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; echo 已停止进程 $_.ProcessId }"
echo 完成
pause
