# === 匯入標準函式庫 ===
import os              # 用於檔案系統操作（讀取目錄、環境變數等）
import json             # 用於讀寫 JSON 格式的角色卡與日記檔案
import random           # 用於在多個角色卡中隨機挑選一個
import urllib.request   # 用於向本機 Ollama 伺服器發送 HTTP 請求
import urllib.error     # 用於捕捉 HTTP 請求發生的錯誤
import re               # 用於正規表示式比對（檔名編號、句尾標點判斷）
from datetime import datetime         # 用於取得目前日期時間，作為檔名與日記日期
from prompt_utils import build_daily_prompt  # 匯入外部模組：組合日記生成用的完整 Prompt

# 優先讀取 debug_server 透過環境變數傳入的模型名稱，fallback 為 gemma4
MODEL_NAME = os.environ.get("LAMB_MODEL", "gemma4")

try:
    # 盡量避免 Windows console(cp950) 亂碼/炸掉
    # 強制將標準輸出改為 UTF-8 編碼，避免中文字元在 Windows 主控台顯示亂碼或拋出例外
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    # 若目前執行環境不支援 reconfigure（例如非標準 stdout），則忽略即可，不影響主要功能
    pass

def get_next_filename(directory, prefix, extension):
    """
    獲取下一個可用編號的檔名，格式：prefix-001.extension

    做法：掃描目標資料夾內所有符合「prefix-數字.extension」格式的檔案，
    取出目前最大的編號，並回傳「編號+1」的新檔名，藉此達到自動遞增編號的效果。
    """
    # 若資料夾不存在則自動建立，避免後續 listdir 出錯
    os.makedirs(directory, exist_ok=True)
    # 移除副檔名開頭可能帶有的點號，統一格式
    ext = extension.lstrip('.')
    suffix = f".{ext}"
    # 篩選出資料夾中「檔名開頭為 prefix、結尾為指定副檔名」的候選檔案
    files = [f for f in os.listdir(directory) if f.startswith(prefix) and f.endswith(suffix)]

    # 逐一比對檔名，找出目前已使用的最大編號
    max_num = 0
    for f in files:
        # 使用正規表示式擷取檔名中的三位數編號，例如 prefix-001.json 中的 001
        m = re.search(rf"{re.escape(prefix)}-(\d{{3}}){re.escape(suffix)}$", f)
        if not m:
            continue
        try:
            num = int(m.group(1))
            max_num = max(max_num, num)
        except ValueError:
            # 理論上不會發生（正規表示式已限制為數字），但仍保留例外處理避免程式中斷
            continue

    # 回傳「最大編號 + 1」的新檔名，並補齊為三位數（例如 002）
    return f"{prefix}-{max_num + 1:03d}.{ext}"

def _looks_complete(text: str) -> bool:
    """
    粗略判斷是否像「完整結尾」：
    - 以句號/驚嘆號/問號/引號/省略號/右括號等收尾
    - 或至少最後一行不在半個句子中間（避免你貼的『看到他這麼勤...』）
    """
    if not text:
        return False
    t = text.strip()
    # 文字太短（少於 50 字）視為不完整，避免誤判尚未生成完成的內容
    if len(t) < 50:
        return False
    # 檢查結尾字元是否為常見的完整句尾符號（句號、驚嘆號、問號、右引號、省略號、右括號等）
    return bool(re.search(r"[。！？…」』）》\)]\s*$", t))

def _need_continuation(text: str) -> bool:
    """
    是否需要補續寫（避免不必要的第 2/3 次 API 呼叫拖慢速度）
    """
    if not text:
        return True
    t = text.strip()
    # 明顯過短才補寫；長文但缺標點不再強制補，避免無謂耗時
    if len(t) < 280:
        return True
    # 若文字長度足夠，則再進一步檢查結尾是否為完整句子
    return not _looks_complete(t)

# Ollama 本機推論伺服器的 API 端點（預設埠號 11434）
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

def _ollama_generate(prompt: str, num_predict: int = 4096, temperature: float = 0.85) -> str:
    """
    呼叫本機 Ollama 伺服器的 /api/generate 介面，以串流方式取得模型生成的文字。

    參數：
        prompt      - 要送給模型的完整提示詞
        num_predict - 最多生成的 token 數量（影響輸出長度上限）
        temperature - 生成的隨機性（數值越高越有創意，越低越保守穩定）

    回傳：
        模型生成的完整文字（字串），若發生錯誤則回傳空字串 ""。
    """
    # 預設參數
    default_options = {
        "temperature": temperature,
        "num_predict": num_predict,
        "num_ctx": 4096,          # 模型的上下文視窗大小（token 數）
        "repeat_penalty": 1.2,     # 重複懲罰係數，避免模型生成重複字句
        "top_k": 40,               # 取樣時只考慮機率最高的前 40 個候選字
        "top_p": 0.9               # 核採樣（nucleus sampling）機率門檻
    }

    # 讀取並合併環境變數中的 LAMB_MODEL_OPTIONS
    # 允許外部呼叫端（例如 debug_server）透過環境變數覆寫預設的生成參數
    stream_val = True
    lamb_options_str = os.environ.get("LAMB_MODEL_OPTIONS")
    if lamb_options_str:
        try:
            lamb_options = json.loads(lamb_options_str)
            # 是否採用串流模式（stream）獨立取出，其餘參數合併進 default_options
            stream_val = lamb_options.pop('stream', True)
            default_options.update(lamb_options)
        except Exception as e:
            # 解析失敗時僅顯示警告，不中斷程式，繼續使用預設參數
            print(f"[WARN] Failed to parse LAMB_MODEL_OPTIONS: {e}")

    # 組合要送給 Ollama API 的請求內容（JSON 格式）
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": stream_val,
        "options": default_options
    }

    # 用於收集串流回傳的每一段文字片段，最後再組合成完整結果
    full_response = []
    try:
        # 將 payload 編碼為 UTF-8 的 JSON 位元組資料
        body_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        # 建立 HTTP POST 請求物件
        req = urllib.request.Request(
            OLLAMA_URL,
            data=body_bytes,
            method='POST',
            headers={'Content-Type': 'application/json'}
        )
        print(">"*100)
        print("\ngenerate_daily.py : --- 正在流式生成故事內容，測試流式生成的功能 ---\n")
        print("<"*100)
        # 發送請求並以串流方式逐行讀取回應（每行為一個 JSON 物件片段）
        with urllib.request.urlopen(req, timeout=3000) as resp:
            for raw_line in resp:
                line = raw_line.strip()
                if line:
                    chunk = json.loads(line)
                    content = chunk.get('response', '')
                    # 即時印出目前收到的文字片段，模擬「逐字輸出」的效果
                    print(content, end='', flush=True)
                    full_response.append(content)
                    # Ollama 在生成完成時，該行的 done 欄位會標記為 True
                    if chunk.get('done'):
                        break
        print("\n")
        print(">"*100)
        print("\ngenerate_daily.py : --- 結束流式生成故事內容 ---\n")
        print("<"*100)

        # 將所有片段串接起來，並去除頭尾多餘空白後回傳
        return "".join(full_response).strip()
    except urllib.error.HTTPError as e:
        # 伺服器有回應但回傳錯誤狀態碼（例如模型不存在、參數錯誤等）
        print("\n")
        print(">"*100)
        print(f"\ngenerate_daily.py : [ERROR] Ollama 回傳錯誤 {e.code}: {e.read().decode('utf-8', errors='replace')}")
        print("<"*100)
        return ""
    except Exception as e:
        # 其他連線失敗情況（例如 Ollama 服務未啟動、逾時等）
        print("\n")
        print(">"*100)
        print(f"\ngenerate_daily.py : [ERROR] Ollama 連線失敗: {e}")
        print("<"*100)
        return ""

def generate_story():
    """
    主要業務邏輯：挑選一位角色、組合生成 Prompt、呼叫 Ollama 產生日記內容，
    並將結果連同相關中繼資料（角色資訊、日期、原始 Prompt）存成 JSON 檔案。

    回傳：
        成功時回傳新產生的日記檔名（字串）；失敗時回傳 None。
    """
    chars_dir = 'characters'
    # 檢查角色卡資料夾是否存在，且內部至少有一個 .json 角色卡檔案
    if not os.path.exists(chars_dir) or not [f for f in os.listdir(chars_dir) if f.endswith('.json')]:
        print(f"generate_daily.py : Error: {chars_dir} 資料夾內無角色卡 JSON。")
        return
    # 允許外部（例如網頁 UI）透過環境變數指定要使用哪一位角色
    forced_char_id = os.environ.get("LAMB_CHAR_ID", "").strip()
    candidates = [f for f in os.listdir(chars_dir) if f.endswith('.json')]
    if forced_char_id:
        exact = f"{forced_char_id}.json"
        if exact in candidates:
            char_file = exact
        else:
            # 允許傳入不含副檔名但檔名不同格式時的模糊比對
            matched = [f for f in candidates if f.replace('.json', '') == forced_char_id]
            # 找不到符合的角色卡時，退回隨機挑選一位
            char_file = matched[0] if matched else random.choice(candidates)
    else:
        # 未指定角色時，從所有角色卡中隨機挑選一位
        char_file = random.choice(candidates)
    # 讀取所選角色卡的 JSON 內容（包含角色設定、姓名、圖片提示詞等）
    with open(os.path.join(chars_dir, char_file), 'r', encoding='utf-8') as f:
        char_data = json.load(f)

    # 優先使用外部傳入的完整 Prompt (為了與 UI 顯示保持一致)
    full_prompt_override = os.environ.get("LAMB_FULL_PROMPT", "").strip()
    if full_prompt_override:
        # 若外部已提供完整組好的 Prompt，直接採用，確保與網頁上顯示的內容一致
        final_prompt = full_prompt_override
    else:
        # 否則自行組合 Prompt：讀取使用者輸入的情境描述，預設值為辦公室小故事
        user_input = os.environ.get("LAMB_SCENARIO", "").strip() or "今天在辦公室發生的一件小事。"
        # 讀取寫作風格/範本等額外設定（JSON 字串），供 build_daily_prompt 使用
        writer_settings_str = os.environ.get("LAMB_WRITER_SETTINGS")
        writer_settings = None
        if writer_settings_str:
            try:
                writer_settings = json.loads(writer_settings_str)
            except: pass
        # 呼叫外部工具函式，依角色資料、使用者情境與寫作設定組合出最終 Prompt
        final_prompt = build_daily_prompt(char_data, user_input, None, writer_settings=writer_settings)
    
    print("\n" + ">"*100 + "\n")
    print("generate_daily.py : 生成日記\n")
    print("【DEBUG: 產生的 PROMPT，不再重複寫出】\n")
    # 這裡印出的內容必須與實際送給 Ollama 的 prompt 完全一致
    # print(final_prompt)
    print("\n" + ">"*100 + "\n")
    print(f"generate_daily.py : 正在透過 Ollama 生成 {char_data.get('name', char_file)} 的日記... (請稍候)")
    print("\n" + "<"*100 + "\n")
    # 如何讓網頁畫面先更新過，再繼續往下執行
    try:
        # 第一次呼叫 Ollama，生成日記主要內容（最多 4096 個 token）
        result_text = _ollama_generate(final_prompt, num_predict=4096, temperature=0.85)

        # 若被截斷（常見：最後一句中途停掉），自動續寫補齊
        # 只補 1 次，避免耗時倍增
        if _need_continuation(result_text):
            print("⚠️ generate_daily.py：偵測到內容可能被裁斷，嘗試自動續寫補齊…")
        # 迴圈只執行最多 1 次（範圍為 range(1)），代表最多只補寫一次，避免因反覆續寫而拖慢整體速度
        for i in range(1):
            # 若目前內容已判定完整，則不需要續寫，直接跳出迴圈
            if not _need_continuation(result_text):
                break
            # 組合續寫用的 Prompt：附上原本的 Prompt、已生成的內容，並指示模型接續寫下去
            continue_prompt = (
                final_prompt
                + "\n\n以下是你剛剛寫到一半的日記，請從最後一句『接著往下寫』，不要重複前文，並寫到一個完整收尾：\n\n"
                + result_text
                + "\n\n（從這裡接續，直接續寫，不要加標題）\n"
            )
            # 第二次呼叫 Ollama 進行續寫（token 數較少，因為只是補完結尾）
            cont = _ollama_generate(continue_prompt, num_predict=2048, temperature=0.85)
            if cont:
                # 將續寫的內容接在原本文字之後，並去除多餘空白
                result_text = (result_text.rstrip() + "\n" + cont.lstrip()).strip()
        # 如果最終結果仍然為空，則報錯並跳出
        if not result_text:
            print("\n[ERROR] 生成失敗：AI 未能產出內容。")
            return None

        # 顯示所有 print 內容
        print("\n")
        print("(*)" * 30 + "\n")
        print("\n【generate_daily.py：DEBUG: AI 已完成最終的生成日記內容如下】\n")
        print(result_text)
        print("\n")
        print("($)" * 30 + "\n")

        # 獲取日期與時間
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")            # 用於日記內容中的日期欄位
        now_str = now.strftime("%Y-%m-%d_%H%M%S")     # 用於檔名，精確到秒避免重複
        char_name_str = char_data.get('name', char_file.replace('.json', ''))
        file_prefix = f"{char_name_str}_{now_str}"

        # 使用遞增編號命名，避免同一秒內產生多個檔案時互相覆蓋
        out_filename = get_next_filename('diaries', file_prefix, 'json')

        # 組合最終要寫入檔案的日記物件，包含日期、角色資訊、生成內容與原始 Prompt
        story_obj = {
            "date": today,
            "character_id": char_data.get('id', char_file.replace('.json', '')),
            "character_name": char_data.get('name', 'Unknown'),
            "story": result_text,
            "image_prompt": char_data.get('image_prompt', ''),
            "full_prompt": final_prompt # 紀錄「實際送給模型的 prompt」供 UI 顯示
        }

        # 將日記物件寫入 diaries 資料夾，使用 UTF-8 編碼並保留中文字元（ensure_ascii=False）
        with open(os.path.join('diaries', out_filename), 'w', encoding='utf-8') as f:
            json.dump(story_obj, f, ensure_ascii=False, indent=4)

        print(f"[OK] 故事生成完畢！已儲存至 diaries/{out_filename}")
        return out_filename # 回傳檔名供下一步使用

    except Exception as e:
        # 捕捉整個生成流程中任何未預期的例外，避免程式直接崩潰
        print(f"[ERROR] 發生錯誤: {e}")
        return None

# 當此檔案被直接執行（而非被其他模組匯入）時，才會執行主要生成流程
if __name__ == "__main__":
    generate_story()
