import os
import json
import urllib.request
import urllib.error
import sys

try:
    # 盡量讓 Windows console 不因 cp950 造成亂碼/炸掉
    # (將標準輸出重新設定為 utf-8 編碼，遇到無法編碼的字元時以取代方式處理，避免程式因編碼錯誤而中斷)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    # 若目前執行環境不支援 reconfigure（例如某些非標準的 stdout），則忽略此錯誤，不影響主要流程
    pass

# ComfyUI 本地伺服器的 API 端點網址，預設監聽在本機 8188 埠的 /prompt 路徑
COMFYUI_URL = "http://127.0.0.1:8188/prompt"
# 呼叫 ComfyUI API 的逾時秒數；可透過環境變數 LAMB_COMFY_TIMEOUT 覆寫，預設為 8 秒
COMFYUI_TIMEOUT_SECONDS = int(os.environ.get("LAMB_COMFY_TIMEOUT", "8"))

def generate_image(story_filename=None):
    """
    根據指定的故事 JSON 檔案，讀取其中的生圖提示詞（image_prompt），
    並將提示詞套用到 ComfyUI 的圖片生成工作流程（workflow）中，
    最後透過 HTTP POST 請求送交給本機執行的 ComfyUI 伺服器進行圖片生成。

    參數:
        story_filename: 故事 JSON 檔案名稱（不含路徑）。若未提供，則自動選取
                         diaries 目錄下依檔名排序最新的一個 .json 檔。
    """
    # 存放故事 JSON 檔案的目錄名稱
    stories_dir = 'diaries'

    # 如果沒傳入檔名，自動抓最新的
    if not story_filename:
        # 若 diaries 目錄不存在，先建立空目錄，避免後續 os.listdir 出錯
        if not os.path.exists(stories_dir):
            os.makedirs(stories_dir)
        # 列出目錄下所有 .json 結尾的故事檔案
        story_files = [f for f in os.listdir(stories_dir) if f.endswith('.json')]
        if not story_files:
            # 目錄底下沒有任何故事檔，直接印出提示並結束函式
            print("找不到任何故事檔。")
            return
        # 依檔名排序後取最後一個，通常代表最新（檔名多以時間戳記命名）
        story_filename = sorted(story_files)[-1]

    # print(f"根據故事檔生成圖片: {story_filename}") # 減少輸出

    # 組合出故事檔案的完整路徑，並以 utf-8 編碼讀取內容解析為 JSON 物件
    file_path = os.path.join(stories_dir, story_filename)
    with open(file_path, 'r', encoding='utf-8') as f:
        story_data = json.load(f)

    # 讀取生圖提示詞；新版格式為 JSON 字串 {"en": "...", "zh": "..."}，舊版為純文字
    # ComfyUI 只需要英文部分
    # 先取出原始的 image_prompt 欄位內容（可能是純文字，也可能是序列化後的 JSON 字串）
    _raw_prompt = story_data.get('image_prompt', '')
    try:
        # 嘗試將其解析為 JSON 物件（新版格式）
        _prompt_obj = json.loads(_raw_prompt)
        # 若成功解析為 dict，取出其中的英文提示詞 'en'；若沒有 'en' 欄位則退回原始字串
        prompt_text = _prompt_obj.get('en', _raw_prompt) if isinstance(_prompt_obj, dict) else _raw_prompt
    except Exception:
        # 解析失敗，代表這是舊版純文字格式，直接使用原始字串作為提示詞
        prompt_text = _raw_prompt  # 純文字，直接使用
    # 將故事檔的副檔名 .json 替換成 .png，作為預期產生的圖片檔名
    dest_img_name = story_filename.replace('.json', '.png')

    # ComfyUI 圖片生成工作流程設定檔的路徑（定義了節點與參數的 JSON 檔）
    workflow_path = 'comfy_workflows/character_portrait.json'
    if not os.path.exists(workflow_path):
        # 找不到工作流程檔案時，印出錯誤訊息並結束函式，不繼續往下執行
        print(f"Error: 找不到 {workflow_path}")
        return

    # 讀取並解析工作流程 JSON 檔案內容
    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow_data = json.load(f)

    # 尋找並替換 Prompt
    # 遍歷工作流程中所有節點，找到負責文字編碼（CLIP Text Encode）的節點，
    # 將該節點的文字輸入替換成前面準備好的英文提示詞 prompt_text
    found = False
    for node_id, node in workflow_data.items():
        # 只處理 class_type 為 CLIPTextEncode 或 CLIPTextEncodeSDXL 的節點
        if node.get('class_type') in ['CLIPTextEncode', 'CLIPTextEncodeSDXL']:
            # 確認該節點的 inputs 中確實有 'text' 欄位才進行替換
            if 'text' in node.get('inputs', {}):
                node['inputs']['text'] = prompt_text
                found = True
                # 只替換第一個符合條件的節點後即跳出迴圈
                break

    # print("\n" + "="*50)
    # print("【DEBUG: 圖片生成 PROMPT】")
    # print(prompt_text)
    # print("="*50 + "\n")

    # 組成要送給 ComfyUI API 的請求主體（payload），key 為 "prompt"，內容即整個工作流程資料
    payload = {"prompt": workflow_data}
    try:
        # 將 payload 序列化為 JSON 字串（保留非 ASCII 字元，如中文）後編碼為 utf-8 位元組
        body_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        # 建立一個 POST 請求物件，指定目標網址、請求內容、方法與標頭
        req = urllib.request.Request(
            COMFYUI_URL,
            data=body_bytes,
            method='POST',
            headers={'Content-Type': 'application/json'}
        )
        # 送出請求並等待回應，設定逾時時間避免長時間卡住
        with urllib.request.urlopen(req, timeout=COMFYUI_TIMEOUT_SECONDS) as resp:
            resp.read()  # 確保回應完整讀取
        # 請求成功送出後，提示使用者預期產生的圖片檔名與存放位置
        print(f"✅ 已送至 ComfyUI。請確保儲存檔名為: images/{dest_img_name}")
    except urllib.error.URLError as e:
        # URLError 包含連線拒絕 (ConnectionRefusedError) 與 timeout
        # 通常代表 ComfyUI 尚未啟動，或網路連線有問題
        print(f"❌ ComfyUI 連線失敗 (請確認 ComfyUI 已啟動於 8188 埠): {e.reason}")
    except Exception as e:
        # 捕捉其他未預期的例外狀況（例如序列化失敗等），避免程式直接崩潰
        print(f"❌ 圖片生成請求失敗: {e}")

if __name__ == "__main__":
    # 當此檔案作為主程式直接執行時，從命令列參數取得故事檔名（若有提供）
    # 若未提供任何參數，則傳入 None，讓 generate_image 自動選取最新的故事檔
    fn = sys.argv[1] if len(sys.argv) > 1 else None
    generate_image(fn)
