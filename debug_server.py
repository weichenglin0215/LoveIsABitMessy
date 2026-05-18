import http.server
import socketserver
import json
import subprocess
import os
import sys
import threading
import time
import uuid
import re
import random

try:
    # 盡量讓 Windows console 不因 cp950 造成亂碼/炸掉
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from urllib.parse import urlparse, parse_qs
from prompt_utils import (
    load_character_from_path,
    build_daily_prompt, #生成日記 prompt
    build_chapters_from_premise_prompt,#「根據故事粗綱生成各章標題與描述」的完整提示詞
    build_chapter_outline_prompt, #根據章的標題與描述來建立「各小節大綱」的完整提示詞
    build_novel_content_prompt, #建立「小說本文生成」的完整提示詞
    build_analyze_text_character_prompt, #從文字分析角色特質
    build_analyze_image_prompt_text,     #從圖片生成 AI 生圖提示詞
    build_story_to_premise_prompt        #將故事原文濃縮成故事粗綱
)

PORT = 8081
WEB_DIR = os.path.join(os.path.dirname(__file__), 'web')

JOBS = {}
JOBS_LOCK = threading.Lock()

def _resolve_character_json_path(char_id: str) -> str:
    #####################################################################################
    # 支援不同目錄
    #####################################################################################
    if not char_id:
        return ""
    p1 = os.path.join('characters', f'{char_id}.json')
    if os.path.exists(p1):
        return p1
    # 允許傳入含日期等檔名（例如 2026-04-15_a）
    p2 = os.path.join('characters', f'{char_id}')
    if os.path.exists(p2) and p2.lower().endswith('.json'):
        return p2
    return ""

def _try_repair_json(s: str) -> str:
    """
    嘗試修復 AI 回傳的殘缺 JSON 格式。
    處理：缺少結尾引號、多餘逗號、未閉合括號、字串內實際換行字元、markdown 圍欄。
    """
    s = s.strip()
    if not s:
        return s

    # 移除 Markdown 程式碼區塊標記（```json ... ``` 或 ``` ... ```）
    s = re.sub(r'^```(?:json)?\s*\n?', '', s)
    s = re.sub(r'\n?```\s*$', '', s)
    s = s.strip()

    # 尋找 JSON 起始位置（[ 或 {），忽略前綴說明文字
    start_idx = -1
    for i, c in enumerate(s):
        if c in '[{':
            start_idx = i
            break
    if start_idx == -1:
        return s
    s = s[start_idx:]

    # 第一次嘗試：直接解析（最常見情況，零開銷）
    try:
        json.loads(s)
        return s
    except Exception:
        pass

    # 修復1：移除多餘的結尾逗號（, 後面緊接 } 或 ]）
    s = re.sub(r',(\s*[}\]])', r'\1', s)
    try:
        json.loads(s)
        return s
    except Exception:
        pass

    # 修復2：逐字元掃描
    # ・字串內實際換行：往後看第一個非空白字元，
    #   若為 }、]、, 代表字串值已結束但缺少結尾引號 → 補上 "
    #   否則視為字串內換行 → 轉義為 \n
    # ・字串內 tab → 轉義為 \t
    # ・補齊整體未閉合的引號與括號
    result = []
    in_string = False
    escape = False
    stack = []
    i = 0

    while i < len(s):
        char = s[i]

        if in_string:
            if escape:
                escape = False
                result.append(char)
            elif char == '\\':
                escape = True
                result.append(char)
            elif char == '"':
                in_string = False
                result.append(char)
            elif char in '\n\r':
                # 往前看：跳過空白，看下一個有效字元
                j = i + 1
                while j < len(s) and s[j] in ' \t\r\n':
                    j += 1
                if j < len(s) and s[j] in '}],':
                    # 字串值後面接的是結構字元 → 補遺漏的結尾引號
                    result.append('"')
                    in_string = False
                    result.append('\n')
                else:
                    # 正常字串內換行 → 轉義
                    result.append('\\n')
            elif char == '\t':
                result.append('\\t')
            else:
                result.append(char)
        else:
            if char == '"':
                in_string = True
                result.append(char)
            elif char == '{':
                stack.append('}')
                result.append(char)
            elif char == '[':
                stack.append(']')
                result.append(char)
            elif char == '}':
                if stack and stack[-1] == '}':
                    stack.pop()
                result.append(char)
            elif char == ']':
                if stack and stack[-1] == ']':
                    stack.pop()
                result.append(char)
            else:
                result.append(char)
        i += 1

    # 補齊未閉合的引號
    if in_string:
        result.append('"')

    # 補齊未閉合的括號
    while stack:
        result.append(stack.pop())

    fixed = ''.join(result)

    # 修復後再次移除可能產生的多餘結尾逗號
    fixed = re.sub(r',(\s*[}\]])', r'\1', fixed)

    return fixed

def _build_diary_prompt(char_path, scenario, char_data_override=None, relationship_params=None, other_chars=None, writer_settings=None, time_context="", past_diaries_context=""):
    #####################################################################################
    # 回傳「實際送給 Ollama 的日記 prompt」。
    #####################################################################################
    if char_data_override:
        char_data = char_data_override
    else:
        char_data = load_character_from_path(char_path)

    return build_daily_prompt(char_data, scenario, relationship_params, other_chars=other_chars, writer_settings=writer_settings, time_context=time_context, past_diaries_context=past_diaries_context)

def _append_job_log(job_id: str, text: str):
    #####################################################################################
    # 在 CMD 顯示 log
    #####################################################################################
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["logs"].append(text)
        job["updated_at"] = time.time()

def _ollama_generate_direct(model, prompt, options=None, images=None):
    """直接呼叫 Ollama API 並回傳結果字串 (支援流式傳輸以免超時)"""
    #####################################################################################
    # 直接呼叫 Ollama API 並回傳結果字串 (支援流式傳輸以免超時)
    #####################################################################################
    url = "http://127.0.0.1:11434/api/generate"
    
    # 預設參數
    default_options = {
        "temperature": 0.85,
        "num_predict": 2048,
        "num_ctx": 8192,
        "repeat_penalty": 1.1,
        "top_k": 40,
        "top_p": 0.9,
        "num_gpu": 999 #強制所有資料放入GPU跟VRAM。
    }
    
    # 合併外部傳入的 options（不修改原始 dict）
    if options:
        # stream 是 payload 同層的屬性，不屬於 options，需要單獨取出
        stream_val = options.get('stream', True)
        merged_options = {k: v for k, v in options.items() if k != 'stream'}
        default_options.update(merged_options)
    else:
        stream_val = True

    # 每次呼叫自動產生隨機 seed，確保 AI 輸出每次都有足夠變化
    # （外部若傳入 seed 則以外部為準，已在上方 update 合併進來）
    if 'seed' not in default_options:
        default_options['seed'] = random.randint(1, 2_147_483_647)

    payload = {
    "model": model,
    "prompt": prompt,
    # keep_alive 選項：
    # -1  → 永久保留在 VRAM（適合連續批次生成）
    # "5m" → 閒置 5 分鐘後自動卸載（節省 VRAM，偶發使用時適合）
    # 0   → 生成完立刻卸載
    "keep_alive": -1,
    "stream": stream_val,
    "options": default_options
    }

    if images:
        payload["images"] = images
    
    print(f">>>> 模型: {model}")
    print(f">>>> 以流式回傳結果: {stream_val}")
    print(f">>>> VRAM保有大模型(keep_alive -1 等於長久保留): {payload['keep_alive']}")
    print(f">>>> 溫度(Temperature): {default_options['temperature']}")
    print(f">>>> 預測長度(num_predict): {default_options['num_predict']}")
    print(f">>>> 上下文視窗(num_ctx): {default_options['num_ctx']}")
    print(f">>>> 重複懲罰(repeat_penalty): {default_options['repeat_penalty']}")
    print(f">>>> Top-K: {default_options['top_k']}")
    print(f">>>> Top-P: {default_options['top_p']}")
    print(f">>>> 隨機種子(seed): {default_options['seed']}")
    # print(f">>>> 使用GPU層數(num_gpu): {default_options['num_gpu']}")
    print(f">>>> 提示詞字數(Prompt Length): {len(prompt)} characters")
    
    full_response = []
    try:
        import urllib.request
        import urllib.error

        body_bytes = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=body_bytes,
            method='POST',
            headers={'Content-Type': 'application/json'}
        )

        print(">>>> 正在發送 POST 請求至 Ollama...")
        try:
            with urllib.request.urlopen(req, timeout=3000) as resp:
                print(f">>>> 伺服器回應碼: {resp.status}")
                print("(O)"*15 + "流式生成文字開始" + "(O)"*15)
                if resp.status != 200:
                    err_body = resp.read().decode('utf-8', errors='replace')
                    print(f"\n>>>> [OLLAMA API ERROR] Status: {resp.status}")
                    print(f">>>> [OLLAMA API ERROR] Body: {err_body}")
                    return f">>>> Error {resp.status}: {err_body}"

                # 逐行讀取串流回應
                for raw_line in resp:
                    line = raw_line.strip()
                    if line:
                        chunk = json.loads(line)
                        content = chunk.get('response', '')
                        print(content, end='', flush=True)
                        full_response.append(content)
                        if chunk.get('done'):
                            break
        except Exception as e:
            print(f"\n>>>> [EXCEPTION] Ollama 呼叫失敗: {str(e)}")
            import traceback
            traceback.print_exc()
            return f"（連線錯誤：{str(e)}）"
        print("\n" + "(O)"*15 + "流式生成文字結束" + "(O)"*15)
        return "".join(full_response).strip()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        print(f"\n>>>> [OLLAMA API ERROR] Status: {e.code}")
        print(f">>>> [OLLAMA API ERROR] Body: {err_body}")
        return f">>>> Error {e.code}: {err_body}"
    except Exception as e:
        print(f"\n>>>> [EXCEPTION] Ollama 呼叫失敗: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return f">>>> Error: {e}"

def _run_job(job_id: str, char_id: str, scenario: str, diary_prompt: str, image_prompt: str, model: str = "gemma4", params: dict = None):
    #####################################################################################
    # 執行「生成日記」任務，發放提示詞給OLLAMA的大模型
    #####################################################################################
    try:
        timeStartSec = time.time()
        timestampStart = time.strftime("%H:%M:%S", time.localtime(timeStartSec))
        
        print("="*50 + "\n")
        print(f"[{timestampStart}] debug_server.py : === 執行「生成日記」任務，準備發送給 OLLAMA 的提示詞 ===")
        print("="*20 + "以下是提示詞" + "="*20 +"\n\n")
        print(diary_prompt)
        print("\n" + "="*20 + "提示詞結束" + "="*20 +"\n")
        _append_job_log(job_id,"="*50)
        _append_job_log(job_id, f"[{timestampStart}] debug_server.py : === 執行「生成日記」任務，準備發送給 OLLAMA 的提示詞 ===")
        _append_job_log(job_id, "="*20 + "以下是提示詞" + "="*20 +"\n")
        _append_job_log(job_id, diary_prompt)
        _append_job_log(job_id, "\n" + "="*20 + "提示詞結束" + "="*20 +"\n")
        env = os.environ.copy()
        env["LAMB_MODEL"] = model
        if char_id:
            env["LAMB_CHAR_ID"] = char_id
        if scenario:
            env["LAMB_SCENARIO"] = scenario
        if diary_prompt:
            env["LAMB_FULL_PROMPT"] = diary_prompt
        env["PYTHONIOENCODING"] = "utf-8"

        if params.get('model_options'):
            env["LAMB_MODEL_OPTIONS"] = json.dumps(params.get('model_options'))
        if params.get('writer_settings'):
            env["LAMB_WRITER_SETTINGS"] = json.dumps(params.get('writer_settings'))

        res_story = subprocess.run(
            [sys.executable, "generate_daily.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        timeEndSec = time.time()
        timestampEnd = time.strftime("%H:%M:%S", time.localtime(timeEndSec))
        duration = int(timeEndSec - timeStartSec)
        if res_story.stdout:
            _append_job_log(job_id, f"="*100)
            _append_job_log(job_id, f"[{timestampEnd}] 總共花費 {duration} 秒 ，debug_server.py : === 處理完「生成日記」任務與準備好提示詞 ===")
            _append_job_log(job_id, f"debug_server.py : === 以下交給 generate_daily.py 處理 ===")
            # 顯示generate_daily.py的輸出內容
            _append_job_log(job_id, res_story.stdout)

            print("="*100 + "\n")
            print(f"[{timestampEnd}] debug_server.py : === 處理完「生成日記」任務與準備好提示詞 ===\n")
            print(f"debug_server.py : === 以下交給 generate_daily.py 處理 ===\n")
            print(res_story.stdout)

        if res_story.stderr:
            _append_job_log(job_id, "="*100 + "\n")
            _append_job_log(job_id, f"[{timestampEnd}] debug_server.py : === 發生錯誤，無法完成「生成日記」任務 ===\n")
            _append_job_log(job_id, "Error: " + res_story.stderr)
            print("="*100 + "\n")
            print(f"[{timestampEnd}] debug_server.py : === 發生錯誤，無法完成「生成日記」任務 ===\n")
            print("debug_server.py : Error: " + res_story.stderr)
            print("="*100 + "\n")


        timestampImgStart = time.strftime("%H:%M:%S", time.localtime())
        print(f"\n[{timestampImgStart}] debug_server.py : === 執行「生成圖片」任務，準備發送給 ComfyUI 的提示詞 ===")
        # print(image_prompt) # 避免提示詞太長洗版
        _append_job_log(job_id, f"\n[{timestampImgStart}] debug_server.py : === 執行「生成圖片」任務，準備發送給 ComfyUI 的提示詞 ===")
        # _append_job_log(job_id, image_prompt)

        res_img = subprocess.run(
            [sys.executable, "generate_image.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        timestampImgEnd = time.strftime("%H:%M:%S", time.localtime())
        if res_img.stdout:
            _append_job_log(job_id, f"\n[{timestampImgEnd}] debug_server.py : == 完成「生成圖片」任務 ===" + res_img.stdout.strip())
            print(f"[{timestampImgEnd}] debug_server.py : == 完成「生成圖片」任務 === [generate_image.py] stdout: {res_img.stdout.strip()}")
        
        if res_img.stderr:
            # 只有在真的有錯誤時才輸出 stderr，且避免重複輸出
            err_msg = res_img.stderr.strip()
            if err_msg and "Error" in err_msg:
                _append_job_log(job_id, f"[{timestampImgEnd}] debug_server.py : === 發生錯誤，無法完成「生成圖片」任務 === " + err_msg)
                print(f"[{timestampImgEnd}] debug_server.py : === 發生錯誤，無法完成「生成圖片」任務 === stderr: {err_msg}")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"] = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _append_job_log(job_id, f"[ERROR] debug_server job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"] = "error"
                JOBS[job_id]["updated_at"] = time.time()

# ═══════════════════════════════════════════════════════════════════════════════
# 非同步 Job 函式（小說產生器 / LoveLine 聊天）
# 前端透過 /api/job?id=... 輪詢 logs，即時顯示後端 print 訊息
# ═══════════════════════════════════════════════════════════════════════════════

def _run_novel_chapters_job(job_id: str, params: dict):
    """非同步執行「根據粗綱生成各章標題與描述」任務"""
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        premise      = params.get('story_premise', '')
        book_title   = params.get('book_title', '未命名小說')
        characters   = params.get('characters', [])
        character_ids= params.get('character_ids', [])
        chars = []
        for i in range(max(len(characters), len(character_ids), 1) if (characters or character_ids) else 0):
            c   = characters[i]   if i < len(characters)    else {}
            cid = character_ids[i] if i < len(character_ids) else ""
            if not c and cid:
                cpath = _resolve_character_json_path(cid)
                if cpath:
                    try:
                        with open(cpath, 'r', encoding='utf-8') as f:
                            c = json.load(f)
                    except: pass
            chars.append(c)
        main_char       = chars[0] if chars else {}
        locked_chapters = params.get('locked_chapters', [])
        writer_settings = params.get('writer_settings', {})
        prompt = build_chapters_from_premise_prompt(
            main_char, book_title, premise, chars[1:], locked_chapters,
            writer_settings=writer_settings
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】根據粗綱生成各章標題與描述")
        log(f">> 正在呼叫 Ollama 產生「各章標題與描述」(請稍候)...")

        timeStartSec = time.time()
        response_text = _ollama_generate_direct(
            params.get('model', 'gemma4'), prompt,
            options=params.get('model_options')
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log(f"[{timestamp}] 總共花費 {duration} 秒，「各章標題與描述」產生完畢！")

        chapters = []
        try:
            repaired_text = _try_repair_json(response_text)
            start = repaired_text.find('[')
            end   = repaired_text.rfind(']')
            if start != -1 and end != -1:
                json_str = repaired_text[start:end + 1].replace('\n', ' ').strip()
                chapters = json.loads(json_str)
                log(f">> JSON 解析成功，共 {len(chapters)} 章")
            else:
                log(f">> JSON 修復後找不到有效陣列範圍")
        except Exception as e:
            log(f">> JSON 解析失敗 (嘗試修復後): {e}")
            log(f">> 原始回傳（前500字）: {response_text[:500]}")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"chapters": chapters, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _append_job_log(job_id, f"[ERROR] _run_novel_chapters_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_novel_outline_job(job_id: str, params: dict):
    """非同步執行「建立各小節大綱」任務"""
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        desc         = params.get('description', '')
        book_title   = params.get('book_title', '故事專案')
        characters   = params.get('characters', [])
        character_ids= params.get('character_ids', [])
        chars = []
        for i in range(max(len(characters), len(character_ids), 1) if (characters or character_ids) else 0):
            c   = characters[i]    if i < len(characters)    else {}
            cid = character_ids[i] if i < len(character_ids) else ""
            if not c and cid:
                cpath = _resolve_character_json_path(cid)
                if cpath:
                    try:
                        with open(cpath, 'r', encoding='utf-8') as f:
                            c = json.load(f)
                    except: pass
            chars.append(c)
        main_char       = chars[0] if chars else {}
        story_premise   = params.get('story_premise', '')
        all_chapters    = params.get('all_chapters', [])
        chapter_index   = params.get('chapter_index', 0)
        locked_sections = params.get('locked_sections', [])
        writer_settings = params.get('writer_settings', {})
        prompt = build_chapter_outline_prompt(
            main_char, book_title, desc, chars[1:],
            story_premise=story_premise,
            all_chapters=all_chapters,
            chapter_index=chapter_index,
            locked_sections=locked_sections,
            writer_settings=writer_settings
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】建立各小節大綱")
        log(f">> 正在呼叫 Ollama 產生「各小節大綱」(請稍候)...")

        timeStartSec = time.time()
        response_text = _ollama_generate_direct(
            params.get('model', 'gemma4'), prompt,
            options=params.get('model_options')
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log(f"[{timestamp}] 總共花費 {duration} 秒，「各小節大綱」產生完畢！")

        sections = []
        try:
            repaired_text = _try_repair_json(response_text)
            start = repaired_text.find('[')
            end   = repaired_text.rfind(']')
            if start != -1 and end != -1:
                json_str = repaired_text[start:end + 1].replace('\n', ' ').strip()
                try:
                    data = json.loads(json_str)
                    if isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict):
                                title_val   = item.get('title',   item.get('標題', ''))
                                outline_val = item.get('outline', item.get('大綱', ''))
                                combined    = f"{title_val} {outline_val}".strip()
                            else:
                                combined = str(item)
                            combined = " ".join(combined.split()).strip(' "「」\'')
                            if combined:
                                sections.append(combined)
                except Exception as inner_e:
                    log(f">> JSON 解析失敗，嘗試 regex 提取: {inner_e}")
                    log(f">> 修復後文字（前500字）: {json_str[:500]}")
                    raw_titles = re.findall(r'"([^"]+)"', json_str)
                    if raw_titles:
                        sections = [t.strip() for t in raw_titles if t.strip()]
        except Exception as e:
            log(f">> JSON 解析失敗 (大綱): {e}")
            log(f">> 原始回傳（前500字）: {response_text[:500]}")
            sections = [s.strip() for s in response_text.split('\n')
                        if s.strip() and not s.startswith('[') and not s.startswith('`')]

        if not sections:
            sections = ["第一階段", "第二階段", "第三階段"]
        sections = [s.replace('"', '').replace("'", '').strip() for s in sections if s.strip()]
        if not sections:
            sections = ["新小節"]

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"sections": sections, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _append_job_log(job_id, f"[ERROR] _run_novel_outline_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_novel_content_job(job_id: str, params: dict):
    """非同步執行「小說本文生成」任務"""
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        ctx          = params.get('context', {})
        characters   = params.get('characters', [])
        character_ids= params.get('character_ids', [])
        chars = []
        for i in range(max(len(characters), len(character_ids), 1) if (characters or character_ids) else 0):
            c   = characters[i]    if i < len(characters)    else {}
            cid = character_ids[i] if i < len(character_ids) else ""
            if not c and cid:
                cpath = _resolve_character_json_path(cid)
                if cpath:
                    try:
                        with open(cpath, 'r', encoding='utf-8') as f:
                            c = json.load(f)
                    except: pass
            chars.append(c)
        main_char       = chars[0] if chars else {}
        writer_settings = params.get('writer_settings', {})
        story_premise   = params.get('story_premise', '')
        section_title   = ctx.get('section_title', '')
        prompt = build_novel_content_prompt(
            main_char,
            ctx.get('chapter_title', ''),
            f"{ctx.get('chapter_desc', '')} - {section_title}",
            section_title,
            chars[1:],
            writer_settings=writer_settings,
            chapter_index=ctx.get('chapter_index', 0),
            section_index=ctx.get('section_index', 0),
            prev_section_title=ctx.get('prev_section_title') or '',
            prev_section_content=ctx.get('prev_section_content') or '',
            next_section_title=ctx.get('next_section_title') or '',
            next_section_locked=bool(ctx.get('next_section_locked', False)),
            story_premise=story_premise
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】小說本文生成 - {section_title}")
        log(f">> 正在呼叫 Ollama 產生「小說本文生成」(這會花費較長時間，請稍候)...")

        timeStartSec = time.time()
        content = _ollama_generate_direct(
            params.get('model', 'gemma4'), prompt,
            options=params.get('model_options')
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log(f"[{timestamp}] 總共花費 {duration} 秒，「小說本文生成」完畢！ - {section_title}")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"content": content, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _append_job_log(job_id, f"[ERROR] _run_novel_content_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_chat_reply_job(job_id: str, params: dict):
    """非同步執行「LoveLine 角色回覆」任務"""
    from prompt_utils import build_chat_reply_prompt
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        character             = params.get('character', {})
        character_name        = params.get('character_name', '角色')
        user_name             = params.get('user_name', '使用者')
        user_message          = params.get('user_message', '')
        history               = params.get('history', [])
        persona_override      = params.get('persona_override', '')
        session_extra         = params.get('session_extra', '')
        user_char_data        = params.get('user_character', {})
        user_persona_override = params.get('user_persona_override', '')
        user_extra            = params.get('user_extra', '')
        session_type          = params.get('session_type', 'one_on_one')
        participants          = params.get('participants', [])
        model_name            = params.get('model', 'gemma4')
        writer_settings       = params.get('writer_settings', {})

        prompt = build_chat_reply_prompt(
            character, character_name, user_name, user_message, history,
            persona_override=persona_override,
            session_extra=session_extra,
            user_char_data=user_char_data,
            user_persona_override=user_persona_override,
            user_extra=user_extra,
            session_type=session_type,
            other_participants=participants,
            writer_settings=writer_settings
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】LoveLine 角色回覆 - {character_name}")
        log(f">> 正在呼叫 Ollama 產生「{character_name}」的回覆({model_name})...")

        opts = params.get('model_options') or {}
        if 'temperature' not in opts:
            opts['temperature'] = 0.95
        timeStartSec = time.time()
        reply_text = _ollama_generate_direct(model_name, prompt, options=opts)
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log(f"[{timestamp}] 總共花費 {duration} 秒，「{character_name}」的回覆產生完畢！")

        # 清理回覆內容（與同步版保持一致）
        reply_text = reply_text.strip()
        reply_text = re.sub(rf'^{character_name}[:：\s]*', '', reply_text).strip()
        reply_text = reply_text.strip('"').strip("'")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"reply": reply_text, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _append_job_log(job_id, f"[ERROR] _run_chat_reply_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_analyze_text_char_job(job_id: str, params: dict):
    """非同步執行「從文字分析角色特質並生成角色卡 JSON」任務"""
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        text_content = params.get('text_content', '')
        target_name  = params.get('target_name', '').strip()
        model_name   = params.get('model', 'gemma4')
        prompt = build_analyze_text_character_prompt(text_content, target_name=target_name)

        # 分析任務需要較長輸出，覆寫 num_predict
        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 2048)
        opts.setdefault('temperature', 0.95)

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】從文字分析角色特質")
        if target_name:
            log(f">> 目標角色：「{target_name}」")
        log(f">> 文字長度：{len(text_content)} 字，模型：{model_name}，num_predict：{opts['num_predict']}")
        log("=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        log(prompt)
        log("=" * 20 + " 提示詞結束 " + "=" * 20)
        log(">> 正在呼叫 Ollama 分析中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_generate_direct(model_name, prompt, options=opts)
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        log(response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        log("=" * 20 + " AI 回傳結束 " + "=" * 20)
        log(f"[{timestamp}] 總共花費 {duration} 秒，Ollama 回傳完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            log(">> [警告] 模型回傳空字串！可能原因：模型拒絕回應、num_ctx 不足、或模型不支援此任務。")
            log(f">> 請確認 Ollama 中已載入模型：{model_name}")

        character = {}
        try:
            repaired = _try_repair_json(response_text)
            start = repaired.find('{')
            end   = repaired.rfind('}')
            if start != -1 and end != -1:
                character = json.loads(repaired[start:end + 1])
                log(f">> JSON 解析成功！角色名稱：{character.get('name', '未命名')}")
                log(f">> 星座：{character.get('zodiac','')}　血型：{character.get('blood_type','')}　LPAS：{character.get('personality_type','')}")
            else:
                log(">> 找不到有效 JSON 物件（回傳內容中沒有 { } 結構）。")
        except Exception as e:
            log(f">> JSON 解析失敗：{e}")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"character": character, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _append_job_log(job_id, f"[ERROR] _run_analyze_text_char_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_analyze_image_char_job(job_id: str, params: dict):
    """非同步執行「從圖片分析外貌並生成 AI 生圖提示詞」任務"""
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        image_base64 = params.get('image_base64', '')
        model_name   = params.get('model', 'gemma4')
        prompt = build_analyze_image_prompt_text()

        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 2048)
        opts.setdefault('temperature', 0.95)

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】從圖片分析外貌生成提示詞")
        log(f">> 模型：{model_name}，圖片 base64 長度：{len(image_base64)} 字元")
        if not image_base64:
            log(">> [錯誤] 未收到圖片資料！")
            with JOBS_LOCK:
                if job_id in JOBS:
                    JOBS[job_id]["status"] = "error"
                    JOBS[job_id]["updated_at"] = time.time()
            return
        log("=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        log(prompt)
        log("=" * 20 + " 提示詞結束 " + "=" * 20)
        log(">> 正在呼叫 Ollama 分析圖片中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_generate_direct(
            model_name, prompt,
            options=opts,
            images=[image_base64]
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        log(response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        log("=" * 20 + " AI 回傳結束 " + "=" * 20)
        log(f"[{timestamp}] 總共花費 {duration} 秒，Ollama 回傳完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            log(">> [警告] 模型回傳空字串！可能原因：模型不支援視覺功能。")
            log(f">> 請確認 {model_name} 支援圖片輸入（vision model）。")
            log(">> 支援視覺的模型範例：gemma4、llava、moondream、minicpm-v 等。")

        image_prompt = response_text.strip().strip('"').strip("'")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"image_prompt": image_prompt, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _append_job_log(job_id, f"[ERROR] _run_analyze_image_char_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_story_to_premise_job(job_id: str, params: dict):
    """非同步執行「將故事原文濃縮成故事粗綱」任務"""
    def log(text):
        print(text)
        _append_job_log(job_id, text)
    try:
        text_content = params.get('text_content', '')
        model_name   = params.get('model', 'gemma4')
        prompt = build_story_to_premise_prompt(text_content)

        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 4096)
        opts.setdefault('temperature', 0.75)

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 50)
        log(f"[{timestamp}] debug_server.py：【非同步】將故事原文濃縮成故事粗綱")
        log(f">> 原文長度：{len(text_content)} 字，模型：{model_name}，num_predict：{opts['num_predict']}")
        log("=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        log(prompt)
        log("=" * 20 + " 提示詞結束 " + "=" * 20)
        log(">> 正在呼叫 Ollama 產生故事粗綱中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_generate_direct(model_name, prompt, options=opts)
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        log("=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        log(response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        log("=" * 20 + " AI 回傳結束 " + "=" * 20)
        log(f"[{timestamp}] 總共花費 {duration} 秒，故事粗綱產生完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            log(">> [警告] 模型回傳空字串！可能原因：模型拒絕回應、num_ctx 不足、或模型不支援此任務。")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"premise": response_text.strip(), "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _append_job_log(job_id, f"[ERROR] _run_story_to_premise_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


class DebugHandler(http.server.SimpleHTTPRequestHandler):
    #####################################################################################
    # 主控，根據需求發送提示詞並執行接收後的資料處理。
    #####################################################################################
    def __init__(self, *args, **kwargs):
        # 固定以 web/ 作為靜態檔案根目錄，避免 os.chdir 造成多執行緒競態
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # 靜默 /api/status, /api/job 與 /favicon.ico 的日誌，以免每秒噴一行洗版
        if len(args) > 0 and isinstance(args[0], str) and ("/api/status" in args[0] or "/api/job" in args[0] or "favicon.ico" in args[0]):
            return
        super().log_message(format, *args)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        #####################################################################################
        # 處理 HTTP GET 請求（處理靜態檔案與 API 請求）
        #####################################################################################
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        if parsed_path.path == '/api/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())

        elif parsed_path.path == '/api/characters':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            if not os.path.exists('characters'): os.makedirs('characters', exist_ok=True)
            chars = [f.replace('.json', '') for f in os.listdir('characters') if f.endswith('.json')]
            self.wfile.write(json.dumps(chars).encode())

        elif parsed_path.path == '/api/diaries':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            if not os.path.exists('diaries'): os.makedirs('diaries', exist_ok=True)
            files = [f for f in os.listdir('diaries') if f.endswith('.json')]
            self.wfile.write(json.dumps(files).encode())

        elif parsed_path.path == '/api/job':
            qs_params = parse_qs(parsed_path.query)
            job_id = (qs_params.get('id', ['']) or [''])[0]
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if not job:
                    payload = {"error": "job_not_found"}
                else:
                    payload = {
                        "id": job_id,
                        "status": job["status"],
                        "logs": "\n".join(job["logs"]),
                        "diary_prompt": job.get("diary_prompt", ""),
                        "image_prompt": job.get("image_prompt", ""),
                        "result": job.get("result")   # 新增：供非同步 Job 回傳 AI 結果
                    }
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode('utf-8'))

        elif parsed_path.path.startswith('/diaries/') or parsed_path.path.startswith('/characters/'):
            import urllib.parse
            file_path = urllib.parse.unquote(parsed_path.path.lstrip('/'))
            if os.path.exists(file_path):
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8' if file_path.endswith('.json') else 'application/octet-stream')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "File not found")
        elif parsed_path.path == '/api/models':
            try:
                import urllib.request
                req = urllib.request.Request('http://localhost:11434/api/tags')
                with urllib.request.urlopen(req, timeout=500) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                models = [m['name'] for m in data.get('models', [])]
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(models).encode('utf-8'))
            except ConnectionRefusedError:
                # Ollama 尚未啟動，回傳空清單而不是 500 錯誤
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps([]).encode('utf-8'))
            except Exception as e:
                # 其他錯誤也回傳空清單，避免干擾 CMD
                print(f">> [/api/models] Ollama 尚未連線或發生錯誤: {type(e).__name__}")
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps([]).encode('utf-8'))

        else:
            return super().do_GET()

    def do_POST(self):
        #####################################################################################
        # 處理 HTTP POST 請求（處理建立任務）
        #####################################################################################
        try:
            print("="*100+ "\n")
            timestamp = time.strftime("%H:%M:%S", time.localtime())
            print(f"開始執行時間: {timestamp}"+ "\n")
            print("debug_server.py : 開始執行 HTTP POST 請求（處理建立任務）"+ "\n")
            print(f"[POST] {self.path}" + "\n")
            print("="*100+ "\n")

            #_append_job_log(self.path, f"="*100 + "\n")
            #_append_job_log(self.path, f"開始執行時間: {timestamp}"+ "\n")
            #_append_job_log(self.path, f"debug_server.py : 開始執行 HTTP POST 請求（處理建立任務）"+ "\n")
            #_append_job_log(self.path, f"[POST] {self.path}" + "\n")
            #_append_job_log(self.path, f"="*100+ "\n")
            
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length).decode('utf-8')
                params = json.loads(body)
            else:
                params = {}

            if self.path == '/api/get_diary_prompt':
                char_id = params.get('char_id')
                scenario = params.get('scenario', '無特定情境')
                card_json = params.get('card_json')
                relationship_params = params.get('relationship', {})
                other_chars = params.get('other_chars', [])
                writer_settings = params.get('writer_settings', {})
                time_context = params.get('time_context', "")
                past_diaries_context = params.get('past_diaries_context', "")

                char_path = _resolve_character_json_path(char_id)
                diary_prompt = _build_diary_prompt(char_path, scenario, char_data_override=card_json, relationship_params=relationship_params, other_chars=other_chars, writer_settings=writer_settings, time_context=time_context, past_diaries_context=past_diaries_context)

                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"diary_prompt": diary_prompt}).encode('utf-8'))
                return

            elif self.path == '/api/run_async':
                #####################################################################################
                # 執行「日記生成」與「圖片生成」任務
                #####################################################################################
                char_id = params.get('char_id')
                scenario = params.get('scenario', '無特定情境')
                card_json = params.get('card_json')
                relationship_params = params.get('relationship', {})
                other_chars = params.get('other_chars', [])
                writer_settings = params.get('writer_settings', {})
                time_context = params.get('time_context', "")
                past_diaries_context = params.get('past_diaries_context', "")

                char_path = _resolve_character_json_path(char_id)
                # 如果 frontend 已經傳入預覽好的 prompt，就優先使用；否則後端再生成一次
                diary_prompt = params.get('diary_prompt')
                if not diary_prompt:
                    diary_prompt = _build_diary_prompt(char_path, scenario, char_data_override=card_json, relationship_params=relationship_params, other_chars=other_chars, writer_settings=writer_settings, time_context=time_context, past_diaries_context=past_diaries_context)

                image_prompt = ""
                if card_json:
                    image_prompt = card_json.get('image_prompt', '')
                elif char_path and os.path.exists(char_path):
                    try:
                        with open(char_path, 'r', encoding='utf-8') as f:
                            image_prompt = json.load(f).get('image_prompt', '')
                    except: pass

                if card_json and not char_path:
                    temp_path = os.path.join('characters', f'{char_id}.json')
                    os.makedirs('characters', exist_ok=True)
                    with open(temp_path, 'w', encoding='utf-8') as f:
                        json.dump(card_json, f, ensure_ascii=False, indent=4)
                    char_path = temp_path

                job_id = str(uuid.uuid4())
                model_name = params.get('model', 'gemma4')
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動..."],
                        "diary_prompt": diary_prompt,
                        "image_prompt": image_prompt,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(target=_run_job, args=(job_id, char_id, scenario, diary_prompt, image_prompt, model_name, params), daemon=True).start()

                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running", "diary_prompt": diary_prompt, "image_prompt": image_prompt}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/generate_chapters':
                ############################################################################
                # 執行根據粗綱生成「各章標題與描述」任務
                ############################################################################
                premise = params.get('story_premise', '')
                book_title = params.get('book_title', '未命名小說')
                
                characters = params.get('characters', [])
                character_ids = params.get('character_ids', [])
                chars = []
                for i in range(max(len(characters), len(character_ids))):
                    c = characters[i] if i < len(characters) else {}
                    cid = character_ids[i] if i < len(character_ids) else ""
                    if not c and cid:
                        cpath = _resolve_character_json_path(cid)
                        if cpath:
                            try:
                                with open(cpath, 'r', encoding='utf-8') as f:
                                    c = json.load(f)
                            except: pass
                    chars.append(c)
                    
                main_char = chars[0] if chars else {}
                locked_chapters = params.get('locked_chapters', [])  # [{"index":1,"title":"","description":""},...]
                writer_settings = params.get('writer_settings', {})
                prompt = build_chapters_from_premise_prompt(main_char, book_title, premise, chars[1:], locked_chapters, writer_settings=writer_settings)
                
                if params.get('preview'):
                    print("="*50)
                    print("debug_server.py：【PREVIEW: AI 根據粗綱生成各章標題與描述的 PROMPT 如下】\n")
                    print(prompt)
                    print("\n" + "="*50)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({"debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))
                    return

                print("\n" + "="*50)
                print("debug_server.py：【DEBUG: AI 根據粗綱生成各章標題與描述的 PROMPT 如下】\n")
                print(prompt)
                print("\n" + "="*50)
                print(">> debug_server.py：正在呼叫 Ollama 產生「各章標題與描述」 (請稍候)...")
                timeStartSec = time.time()
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間:", timestamp)

                response_text = _ollama_generate_direct(params.get('model', 'gemma4'), prompt, options=params.get('model_options'))

                duration = int(time.time() - timeStartSec)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print(f">> debug_server.py：「各章標題與描述」產生完畢！總共花費 {duration} 秒\n")
                # 已經顯示過成果，不再顯示一次
                #print(response_text)
                print("結束時間:", timestamp)
                print("="*50)

                chapters = []
                # 提取 JSON 陣列，解析各章標題與描述
                try:
                    repaired_text = _try_repair_json(response_text)
                    start = repaired_text.find('[')
                    end = repaired_text.rfind(']')
                    if start != -1 and end != -1:
                        chapters = json.loads(repaired_text[start:end+1])
                except Exception as e:
                    print(f">> JSON 解析失敗 (嘗試修復後): {e}")
                    print(f">> 嘗試修復後的內容: {repaired_text[:200]}...")

                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"chapters": chapters, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))


            elif self.path == '/api/generate_outline':
                ############################################################################
                # 執行建立「各小節大綱」任務
                ############################################################################
                desc = params.get('description', '')
                book_title = params.get('book_title', '故事專案')
                
                # 支援直接傳入 card_json 或傳入 character_ids 由後端解析
                characters = params.get('characters', [])
                character_ids = params.get('character_ids', [])
                chars = []
                for i in range(max(len(characters), len(character_ids))):
                    c = characters[i] if i < len(characters) else {}
                    cid = character_ids[i] if i < len(character_ids) else ""
                    if not c and cid:
                        cpath = _resolve_character_json_path(cid)
                        if cpath:
                            try:
                                with open(cpath, 'r', encoding='utf-8') as f:
                                    c = json.load(f)
                            except: pass
                    chars.append(c)
                    
                main_char = chars[0] if chars else {}
                story_premise  = params.get('story_premise', '')
                all_chapters   = params.get('all_chapters', [])   # [{"title":"","description":"","locked":bool},...]
                chapter_index  = params.get('chapter_index', 0)   # 0-based
                locked_sections = params.get('locked_sections', [])  # [{"index":int, "title":str},...]
                writer_settings = params.get('writer_settings', {})
                prompt = build_chapter_outline_prompt(
                    main_char, book_title, desc, chars[1:],
                    story_premise=story_premise,
                    all_chapters=all_chapters,
                    chapter_index=chapter_index,
                    locked_sections=locked_sections,
                    writer_settings=writer_settings
                )
                
                if params.get('preview'):
                    print("\n" + "="*50)
                    print("【PREVIEW: AI 產生「各小節大綱」的 PROMPT】")
                    print(prompt)
                    print("="*50)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({"debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))
                    return
                
                print("\n" + "="*50)
                print("【DEBUG: AI 產生「各小節大綱」的 PROMPT】")
                print(prompt)
                print(">> 正在呼叫 Ollama 產生「各小節大綱」 (請稍候)...")
                timeStartSec = time.time()
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間：", timestamp)

                response_text = _ollama_generate_direct(params.get('model', 'gemma4'), prompt, options=params.get('model_options'))

                duration = int(time.time() - timeStartSec)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print(f">> 「各小節大綱」產生完畢！總共花費 {duration} 秒\n")
                print(response_text)
                print("結束時間：", timestamp)
                print("="*50)
                
                sections = []
                try:
                    repaired_text = _try_repair_json(response_text)
                    start = repaired_text.find('[')
                    end = repaired_text.rfind(']')
                    if start != -1 and end != -1:
                        json_str = repaired_text[start:end+1]
                        json_str = json_str.replace('\n', ' ').strip()
                        
                        try:
                            data = json.loads(json_str)
                            if isinstance(data, list):
                                for item in data:
                                    title_val = ""
                                    outline_val = ""
                                    if isinstance(item, dict):
                                        title_val = item.get('title', item.get('標題', ''))
                                        outline_val = item.get('outline', item.get('大綱', ''))
                                        combined_str = f"{title_val} {outline_val}".strip()
                                    else:
                                        combined_str = str(item)
                                    
                                    # 去掉內部換行並合併為單行
                                    combined_str = " ".join(combined_str.split())
                                    combined_str = combined_str.strip(' "「」\'')
                                    
                                    if combined_str:
                                        sections.append(combined_str)
                        except:
                            # 嘗試解析為純字串列表
                            raw_titles = re.findall(r'"([^"]+)"', json_str)
                            if raw_titles:
                                sections = [t.strip() for t in raw_titles if t.strip()]
                except Exception as e:
                    print(f">> JSON 解析失敗 (大綱): {e}")
                    # Fallback
                    sections = [s.strip() for s in response_text.split('\n') if s.strip() and not s.startswith('[') and not s.startswith('`')]
                
                if not sections: 
                    sections = ["第一階段", "第二階段", "第三階段"]
                
                # 過濾掉可能殘留的引號與空字串
                sections = [s.replace('"', '').replace("'", '').strip() for s in sections if s.strip()]
                if not sections: sections = ["新小節"]
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"sections": sections, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))


            elif self.path == '/api/generate_story_content':
                #####################################################################################
                # 執行「小說本文生成」任務
                #####################################################################################
                ctx = params.get('context', {})
                
                characters = params.get('characters', [])
                character_ids = params.get('character_ids', [])
                chars = []
                for i in range(max(len(characters), len(character_ids))):
                    c = characters[i] if i < len(characters) else {}
                    cid = character_ids[i] if i < len(character_ids) else ""
                    if not c and cid:
                        cpath = _resolve_character_json_path(cid)
                        if cpath:
                            try:
                                with open(cpath, 'r', encoding='utf-8') as f:
                                    c = json.load(f)
                            except: pass
                    chars.append(c)
                    
                main_char = chars[0] if chars else {}
                writer_settings = params.get('writer_settings', {})
                story_premise = params.get('story_premise', '')
                prompt = build_novel_content_prompt(
                    main_char,
                    ctx.get('chapter_title', ''),
                    f"{ctx.get('chapter_desc', '')} - {ctx.get('section_title', '')}",
                    ctx.get('section_title', ''),
                    chars[1:],
                    writer_settings=writer_settings,
                    chapter_index=ctx.get('chapter_index', 0),
                    section_index=ctx.get('section_index', 0),
                    prev_section_title=ctx.get('prev_section_title') or '',
                    prev_section_content=ctx.get('prev_section_content') or '',
                    next_section_title=ctx.get('next_section_title') or '',
                    next_section_locked=bool(ctx.get('next_section_locked', False)),
                    story_premise=story_premise
                )
                
                if params.get('preview'):
                    print("\n" + "="*50)
                    print(f"【PREVIEW: AI 「小說本文生成」 PROMPT - {ctx.get('section_title', '')}】")
                    print(prompt)
                    print("="*50)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({"debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))
                    return

                print("\n" + "="*50)
                print(f"【DEBUG: AI 「小說本文生成」 PROMPT - {ctx.get('section_title', '')}】")
                print(prompt)
                print(">> 正在呼叫 Ollama 產生「小說本文生成」 (這會花費較長的時間，請稍候)...")
                timeStartSec = time.time()
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間：", timestamp)

                content = _ollama_generate_direct(params.get('model', 'gemma4'), prompt, options=params.get('model_options'))

                duration = int(time.time() - timeStartSec)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print(f"【DEBUG: AI 「小說本文生成」產生完畢！總共花費 {duration} 秒 - {ctx.get('section_title', '')}】")
                print(content)
                print("結束時間：", timestamp)
                print("="*50)

                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"content": content, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/chat_reply':
                ###########################################################################
                # LoveLine: 根據對話歷史與角色卡，請 Ollama 生成角色回應
                ###########################################################################
                from prompt_utils import build_chat_reply_prompt
                
                character      = params.get('character', {})
                character_name = params.get('character_name', '角色')
                user_name      = params.get('user_name', '使用者')
                user_message   = params.get('user_message', '')
                history        = params.get('history', [])   # [{role, name, content}]
                
                # 新增的進階設定參數
                persona_override      = params.get('persona_override', '')
                session_extra         = params.get('session_extra', '')
                user_char_data        = params.get('user_character', {})
                user_persona_override = params.get('user_persona_override', '')
                user_extra            = params.get('user_extra', '')
                
                session_type   = params.get('session_type', 'one_on_one')
                participants   = params.get('participants', [])
                model_name     = params.get('model', 'gemma4')

                writer_settings = params.get('writer_settings', {})
                prompt = build_chat_reply_prompt(
                    character, character_name, user_name, user_message, history,
                    persona_override=persona_override,
                    session_extra=session_extra,
                    user_char_data=user_char_data,
                    user_persona_override=user_persona_override,
                    user_extra=user_extra,
                    session_type=session_type,
                    other_participants=participants,
                    writer_settings=writer_settings
                )

                if params.get('preview'):
                    print("\n" + "="*50)
                    print(f"【PREVIEW: AI 「LoveLine 角色回覆」 PROMPT - {character_name}】")
                    print(prompt)
                    print("="*50)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(json.dumps({"debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))
                    return

                print("\n" + "="*50)
                print(f"【DEBUG: AI 「LoveLine 角色回覆」 PROMPT - {character_name}】")
                print(prompt)
                print(f">> 正在呼叫 Ollama 產生「LoveLine 角色回覆」 ({model_name})...")
                timeStartSec = time.time()
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間：", timestamp)

                opts = params.get('model_options') or {}
                if 'temperature' not in opts:
                    opts['temperature'] = 0.95
                reply_text = _ollama_generate_direct(model_name, prompt, options=opts)

                duration = int(time.time() - timeStartSec)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print(f"\n【DEBUG: AI 「LoveLine 角色回覆」產生完畢！總共花費 {duration} 秒 - {character_name}】")
                print(reply_text)
                print("結束時間：", timestamp)
                print("="*50)
                
                # 清理回覆內容
                reply_text = reply_text.strip()
                reply_text = re.sub(rf'^{character_name}[:：\s]*', '', reply_text).strip()
                reply_text = reply_text.strip('"').strip("'")

                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"reply": reply_text, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/novel_chapters_async':
                ############################################################################
                # 非同步：根據粗綱生成各章標題與描述（前端可透過 /api/job 輪詢 Log）
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動：根據粗綱生成各章標題與描述..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_novel_chapters_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/novel_outline_async':
                ############################################################################
                # 非同步：建立各小節大綱（前端可透過 /api/job 輪詢 Log）
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動：建立各小節大綱..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_novel_outline_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/novel_content_async':
                ############################################################################
                # 非同步：小說本文生成（前端可透過 /api/job 輪詢 Log）
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [f">> 任務啟動：小說本文生成 - {params.get('context', {}).get('section_title', '')}..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_novel_content_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/chat_reply_async':
                ############################################################################
                # 非同步：LoveLine 角色回覆（前端可透過 /api/job 輪詢 Log）
                ############################################################################
                job_id = str(uuid.uuid4())
                char_name = params.get('character_name', '角色')
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [f">> 任務啟動：等待「{char_name}」回覆中..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_chat_reply_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/analyze_text_character_async':
                ############################################################################
                # 非同步：從文字分析角色特質並生成角色卡 JSON
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動：從文字分析角色特質..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_analyze_text_char_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/analyze_image_character_async':
                ############################################################################
                # 非同步：從圖片分析外貌並生成 AI 生圖提示詞
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動：從圖片分析外貌生成提示詞..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_analyze_image_char_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/story_to_premise_async':
                ############################################################################
                # 非同步：將故事原文濃縮成故事粗綱（前端可透過 /api/job 輪詢 Log）
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動：正在將故事原文濃縮成故事粗綱..."],
                        "result": None,
                        "created_at": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_story_to_premise_job,
                    args=(job_id, params),
                    daemon=True
                ).start()
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"job_id": job_id, "status": "running"}, ensure_ascii=False).encode('utf-8'))

            elif self.path == '/api/save_diary':
                filename = params.get('filename')
                data = params.get('data')
                if filename and data and not '..' in filename:
                    os.makedirs('diaries', exist_ok=True)
                    with open(os.path.join('diaries', filename), 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=4)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode())
                else:
                    self.send_error(400, "Invalid Request")
            else:
                self.send_error(400, "Invalid Request")
        except Exception as e:
            print(f"[ERROR] do_POST failed: {e}")
            import traceback
            traceback.print_exc()
            try:
                self.send_error(500, str(e))
            except: pass

if __name__ == "__main__":
    for d in ['web', 'characters', 'diaries']: os.makedirs(d, exist_ok=True)
    print(f"Server runs at http://localhost:{PORT}")
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), DebugHandler) as httpd:
        try: httpd.serve_forever()
        except KeyboardInterrupt: print("\nStopped.")
