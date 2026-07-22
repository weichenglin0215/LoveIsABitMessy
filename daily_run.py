import subprocess  # 用於以子行程方式呼叫其他 Python 腳本（例如 generate_daily.py、generate_image.py）
import sys         # 用於取得目前 Python 直譯器路徑 (sys.executable)，確保子行程使用同一個 Python 環境
import os          # 用於檔案系統操作，例如列出 diaries 資料夾內的檔案
import time        # 用於計算每個腳本的執行耗時


def run_script(script_name, args=None):
    """
    以子行程方式執行指定的 Python 腳本，並回傳執行結果與耗時。

    參數：
        script_name (str): 要執行的腳本檔名，例如 "generate_daily.py"
        args (list[str] | None): 傳給該腳本的命令列參數清單，預設為 None（不帶參數）

    回傳：
        tuple(int, float):
            - 第一個元素為子行程的返回碼（0 表示成功，非 0 表示失敗）
            - 第二個元素為執行耗時（秒）
    """
    print(f"\n>>> 正在執行: {script_name} {' '.join(args) if args else ''}")
    print("-" * 40)

    # 組合要執行的命令：使用目前的 Python 直譯器來執行目標腳本
    cmd = [sys.executable, script_name]
    if args:
        cmd.extend(args)

    # 直接讓輸出流向終端機，避免 capture_output 造成的編碼解碼錯誤
    # （若改用 capture_output=True，中文輸出可能因編碼不一致而擲出例外）
    t0 = time.time()
    result = subprocess.run(cmd)
    elapsed = time.time() - t0

    # 若子行程回傳非零狀態碼，代表執行過程中發生錯誤，僅提示警告但不中斷（由呼叫端決定是否停止）
    if result.returncode != 0:
        print(f"警告：{script_name} 回傳了非零狀態碼 ({result.returncode})")
    print(f"[TIME] {script_name} 耗時: {elapsed:.1f}s")

    return result.returncode, elapsed


def main():
    """
    每日自動化流程的主要進入點。
    依序執行：
      1. 產生每日故事內容（generate_daily.py），輸出為 diaries 資料夾內的 JSON 檔
      2. 根據最新產生的故事 JSON 檔，執行生圖腳本（generate_image.py）
    若步驟 1 失敗，則整個流程中止；步驟 2 若失敗僅記錄結果，不影響流程結束。
    """
    print("=" * 50)
    print("   LoveIsABitMessy 每日自動生成啟動器   ")
    print("=" * 50)

    # 1. 執行生成故事：呼叫 generate_daily.py 產生今日的故事內容
    rc_story, t_story = run_script("generate_daily.py")
    if rc_story != 0:
        # 故事生成失敗時，後續的生圖步驟沒有意義，直接中止流程
        print("❌ 故事生成失敗，停止後續流程。")
        return

    # 找到最新的故事 JSON 檔傳給生圖腳本
    # 掃描 diaries 資料夾內所有 .json 檔案（假設檔名具有可排序的時間戳記或編號）
    stories = [f for f in os.listdir('diaries') if f.endswith('.json')]
    if not stories:
        print("❌ 找不到生成的 JSON 故事檔。")
        return
    # 依檔名排序後取最後一個，視為最新產生的故事檔
    latest_story = sorted(stories)[-1]

    # 2. 執行生成圖片：將最新的故事 JSON 檔案路徑作為參數傳入 generate_image.py
    rc_img, t_img = run_script("generate_image.py", [latest_story])

    # 輸出整體流程結束摘要，包含各階段與總耗時
    print("\n" + "=" * 50)
    print("✅ 全部流程執行完畢！")
    print(f"[SUMMARY] story={t_story:.1f}s, image={t_img:.1f}s, total={(t_story+t_img):.1f}s")
    print("=" * 50)


if __name__ == "__main__":
    main()
