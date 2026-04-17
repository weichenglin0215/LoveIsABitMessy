@echo off
chcp 65001 >nul
echo 開啟伺服器
echo python debug_server.py
python debug_server.py
echo.
echo === 全部執行完畢，按任意鍵關閉視窗 ===
pause >nul