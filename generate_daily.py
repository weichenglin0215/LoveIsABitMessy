import os
import json
import random
import urllib.request
import urllib.error
import re
from datetime import datetime
from prompt_utils import build_daily_prompt

# 優先讀取 debug_server 透過環境變數傳入的模型名稱，fallback 為 gemma4
MODEL_NAME = os.environ.get("LAMB_MODEL", "gemma4")

try:
    # 盡量避免 Windows console(cp950) 亂碼/炸掉
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

def get_next_filename(directory, prefix, extension):
    """
    獲取下一個可用編號的檔名，格式：prefix-001.extension
    """
    os.makedirs(directory, exist_ok=True)
    ext = extension.lstrip('.')
    suffix = f".{ext}"
    files = [f for f in os.listdir(directory) if f.startswith(prefix) and f.endswith(suffix)]
    
    max_num = 0
    for f in files:
        m = re.search(rf"{re.escape(prefix)}-(\d{{3}}){re.escape(suffix)}$", f)
        if not m:
            continue
        try:
            num = int(m.group(1))
            max_num = max(max_num, num)
        except ValueError:
            continue
            
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
    if len(t) < 50:
        return False
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
    return not _looks_complete(t)

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"

def _ollama_generate(prompt: str, num_predict: int = 4096, temperature: float = 0.85) -> str:
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": True,
        "options": {
            "num_predict": num_predict,
            "temperature": temperature
        }
    }
    
    full_response = []
    try:
        body_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            OLLAMA_URL,
            data=body_bytes,
            method='POST',
            headers={'Content-Type': 'application/json'}
        )
        print("\n--- 正在流式生成故事內容 ---")
        with urllib.request.urlopen(req, timeout=300) as resp:
            for raw_line in resp:
                line = raw_line.strip()
                if line:
                    chunk = json.loads(line)
                    content = chunk.get('response', '')
                    print(content, end='', flush=True)
                    full_response.append(content)
                    if chunk.get('done'):
                        break
        print("\n--- 生成結束 ---")
        return "".join(full_response).strip()
    except urllib.error.HTTPError as e:
        print(f"\n[ERROR] Ollama 回傳錯誤 {e.code}: {e.read().decode('utf-8', errors='replace')}")
        return ""
    except Exception as e:
        print(f"\n[ERROR] Ollama 連線失敗: {e}")
        return ""

def generate_story():
    chars_dir = 'characters'
    if not os.path.exists(chars_dir) or not [f for f in os.listdir(chars_dir) if f.endswith('.json')]:
        print(f"Error: {chars_dir} 資料夾內無角色卡 JSON。")
        return
    forced_char_id = os.environ.get("LAMB_CHAR_ID", "").strip()
    candidates = [f for f in os.listdir(chars_dir) if f.endswith('.json')]
    if forced_char_id:
        exact = f"{forced_char_id}.json"
        if exact in candidates:
            char_file = exact
        else:
            # 允許傳入不含副檔名但檔名不同格式時的模糊比對
            matched = [f for f in candidates if f.replace('.json', '') == forced_char_id]
            char_file = matched[0] if matched else random.choice(candidates)
    else:
        char_file = random.choice(candidates)
    with open(os.path.join(chars_dir, char_file), 'r', encoding='utf-8') as f:
        char_data = json.load(f)

    # 優先使用外部傳入的完整 Prompt (為了與 UI 顯示保持一致)
    full_prompt_override = os.environ.get("LAMB_FULL_PROMPT", "").strip()
    if full_prompt_override:
        final_prompt = full_prompt_override
    else:
        user_input = os.environ.get("LAMB_SCENARIO", "").strip() or "今天在辦公室發生的一件小事。"
        final_prompt = build_daily_prompt(char_data, user_input, None)
    
    print("\n" + "="*50)
    print("【DEBUG: 產生的 PROMPT】")
    # 這裡印出的內容必須與實際送給 Ollama 的 prompt 完全一致
    print(final_prompt)
    print("="*50 + "\n")

    print(f"正在透過 Ollama 生成 {char_data.get('name', char_file)} 的日記... (請稍候)")
    # 如何讓網頁畫面先更新過，再繼續往下執行
    try:
        result_text = _ollama_generate(final_prompt, num_predict=4096, temperature=0.85)

        # 若被截斷（常見：最後一句中途停掉），自動續寫補齊
        # 只補 1 次，避免耗時倍增
        if _need_continuation(result_text):
            print("⚠️ 偵測到內容可能被裁斷，嘗試自動續寫補齊…")
        for i in range(1):
            if not _need_continuation(result_text):
                break
            continue_prompt = (
                final_prompt
                + "\n\n以下是你剛剛寫到一半的日記，請從最後一句『接著往下寫』，不要重複前文，並寫到一個完整收尾：\n\n"
                + result_text
                + "\n\n（從這裡接續，直接續寫，不要加標題）\n"
            )
            cont = _ollama_generate(continue_prompt, num_predict=2048, temperature=0.85)
            if cont:
                result_text = (result_text.rstrip() + "\n" + cont.lstrip()).strip()
        # 如果最終結果仍然為空，則報錯並跳出
        if not result_text:
            print("\n[ERROR] 生成失敗：AI 未能產出內容。")
            return None

        # 顯示所有 print 內容
        print("\n【DEBUG: AI 回應內容】")
        print(result_text)
        print("-" * 50)

        # 獲取日期與時間
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        now_str = now.strftime("%Y-%m-%d_%H%M%S")
        char_name_str = char_data.get('name', char_file.replace('.json', ''))
        file_prefix = f"{char_name_str}_{now_str}"
        
        # 使用遞增編號命名
        out_filename = get_next_filename('diaries', file_prefix, 'json')
        
        story_obj = {
            "date": today,
            "character_id": char_data.get('id', char_file.replace('.json', '')),
            "character_name": char_data.get('name', 'Unknown'),
            "story": result_text,
            "image_prompt": char_data.get('image_prompt', ''),
            "full_prompt": final_prompt # 紀錄「實際送給模型的 prompt」供 UI 顯示
        }
        
        with open(os.path.join('diaries', out_filename), 'w', encoding='utf-8') as f:
            json.dump(story_obj, f, ensure_ascii=False, indent=4)
        
        print(f"[OK] 故事生成完畢！已儲存至 diaries/{out_filename}")
        return out_filename # 回傳檔名供下一步使用
        
    except Exception as e:
        print(f"[ERROR] 發生錯誤: {e}")
        return None

if __name__ == "__main__":
    generate_story()
