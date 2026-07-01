@echo off
chcp 65001 >nul
REM ====================================================================
REM  永久排除 TCP 8081，避免 Hyper-V / WinNAT 保留範圍占走 debug_server 的埠
REM  症狀：python debug_server.py 出現 WinError 10013「存取權限不足」
REM  必須以「系統管理員」身份執行；下方會自動偵測並提權
REM ====================================================================

REM 若非管理員身份就自動用 UAC 重新啟動自己
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 需要系統管理員權限，正在重新啟動...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo === 停止 WinNAT ===
net stop winnat

echo === 永久排除 TCP 8081 ===
netsh int ipv4 add excludedportrange protocol=tcp startport=8081 numberofports=1

echo === 啟動 WinNAT ===
net start winnat

echo.
echo === 目前 TCP 保留範圍 ===
netsh int ipv4 show excludedportrange protocol=tcp

echo.
echo ✅ 完成！請確認上方表格有 8081（後面帶 * 表示 admin-managed）
pause
