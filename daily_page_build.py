"""
daily_page_build.py

此腳本原用於將日記資料編譯成靜態 HTML 並輸出至 docs/ 目錄，
供 GitHub Pages 發布。

此規格已停用 — 日記瀏覽改由 debug_server.py 伺服器即時提供，
不再需要預先編譯或寫出任何資料到 docs/。
"""

def build_page():
    # 主要函式：原本負責編譯日記頁面並輸出到 docs/，
    # 現已停用此功能，故僅印出提示訊息，不執行任何實際編譯或寫檔動作。
    print("daily_page_build.py：[SKIP] docs 發布功能已停用，略過編譯流程。")

if __name__ == "__main__":
    # 程式進入點：當此檔案被直接執行時（而非被匯入），呼叫 build_page() 函式。
    build_page()
