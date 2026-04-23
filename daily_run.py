import subprocess
import sys
import os
import time

def run_script(script_name, args=None):
    print(f"\n>>> 正在執行: {script_name} {' '.join(args) if args else ''}")
    print("-" * 40)
    
    cmd = [sys.executable, script_name]
    if args:
        cmd.extend(args)
    
    # 直接讓輸出流向終端機，避免 capture_output 造成的編碼解碼錯誤
    t0 = time.time()
    result = subprocess.run(cmd)
    elapsed = time.time() - t0
    
    if result.returncode != 0:
        print(f"警告：{script_name} 回傳了非零狀態碼 ({result.returncode})")
    print(f"[TIME] {script_name} 耗時: {elapsed:.1f}s")
    
    return result.returncode, elapsed

def main():
    print("=" * 50)
    print("   LoveIsABitMessy 每日自動生成啟動器   ")
    print("=" * 50)

    # 1. 執行生成故事
    rc_story, t_story = run_script("generate_daily.py")
    if rc_story != 0:
        print("❌ 故事生成失敗，停止後續流程。")
        return

    # 找到最新的故事 JSON 檔傳給生圖腳本
    stories = [f for f in os.listdir('diaries') if f.endswith('.json')]
    if not stories:
        print("❌ 找不到生成的 JSON 故事檔。")
        return
    latest_story = sorted(stories)[-1]

    # 2. 執行生成圖片
    rc_img, t_img = run_script("generate_image.py", [latest_story])

    # 3. 執行網頁編譯
    rc_build, t_build = run_script("daily_page_build.py")

    print("\n" + "=" * 50)
    print("✅ 全部流程執行完畢！")
    print(f"[SUMMARY] story={t_story:.1f}s, image={t_img:.1f}s, build={t_build:.1f}s, total={(t_story+t_img+t_build):.1f}s")
    print("=" * 50)

if __name__ == "__main__":
    main()
