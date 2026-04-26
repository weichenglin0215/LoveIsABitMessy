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
    build_novel_content_prompt #建立「小說本文生成」的完整提示詞
)

PORT = 8000
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
    嘗試修復 AI 回傳的殘缺 JSON 格式
    例如：缺少結尾引號、括號等
    """
    s = s.strip()
    if not s:
        return s
    
    # 尋找第一個 [ 或 {
    start_idx = s.find('[')
    brace_idx = s.find('{')
    if start_idx == -1 or (brace_idx != -1 and brace_idx < start_idx):
        start_idx = brace_idx
    
    if start_idx == -1:
        return s
    
    s = s[start_idx:]
    
    # 基礎修復：平衡引號與括號
    fixed = []
    in_string = False
    escape = False
    stack = []
    
    for char in s:
        if in_string:
            if escape:
                escape = False
            elif char == '\\':
                escape = True
            elif char == '"':
                in_string = False
        else:
            if char == '"':
                in_string = True
            elif char == '{':
                stack.append('}')
            elif char == '[':
                stack.append(']')
            elif char == '}':
                if stack and stack[-1] == '}': stack.pop()
            elif char == ']':
                if stack and stack[-1] == ']': stack.pop()
        fixed.append(char)
    
    # 補齊未閉合的引號
    if in_string:
        fixed.append('"')
    
    # 補齊未閉合的括號
    while stack:
        fixed.append(stack.pop())
        
    return "".join(fixed)

def _build_diary_prompt(char_path, scenario, char_data_override=None, relationship_params=None, other_chars=None):
    #####################################################################################
    # 回傳「實際送給 Ollama 的日記 prompt」。
    #####################################################################################
    if char_data_override:
        char_data = char_data_override
    else:
        char_data = load_character_from_path(char_path)

    return build_daily_prompt(char_data, scenario, relationship_params, other_chars=other_chars)

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

def _ollama_generate_direct(model, prompt, temperature=0.85):
    """直接呼叫 Ollama API 並回傳結果字串 (支援流式傳輸以免超時)"""
    #####################################################################################
    # 直接呼叫 Ollama API 並回傳結果字串 (支援流式傳輸以免超時)
    #####################################################################################
    url = "http://127.0.0.1:11434/api/generate"
    num_predict = 4096
    num_ctx = 131072
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "options": {
            "temperature": temperature, 
            "num_predict": num_predict,
            "num_ctx": num_ctx  # 增加上下文視窗以利長文本生成
        }
    }
    
    print(f">>>> 模型: {model}")
    print(f">>>> 溫度(Temperature): {temperature}")
    print(f">>>> 預測長度(num_predict): {num_predict}")
    print(f">>>> 上下文視窗(num_ctx): {num_ctx}")
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
        with urllib.request.urlopen(req, timeout=300) as resp:
            print(f">>>> 伺服器回應碼: {resp.status}")
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

        print("\n>>>> 生成結束。")
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

def _run_job(job_id: str, char_id: str, scenario: str, diary_prompt: str, image_prompt: str, model: str = "gemma4"):
    #####################################################################################
    # 執行「生成日記」任務，發放提示詞給OLLAMA的大模型
    #####################################################################################
    try:
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        if scenario:
            _append_job_log(job_id, f"[{timestamp}] [Scenario] {scenario}")
        
        print("="*50 + "\n")
        print(f"\n[{timestamp}] === 執行「生成日記」任務，準備發送給 OLLAMA 的提示詞 ===")
        print(diary_prompt)

        _append_job_log(job_id, f"[{timestamp}] === 執行「生成日記」任務，準備發送給 OLLAMA 的提示詞 ===")
        _append_job_log(job_id, diary_prompt)
        env = os.environ.copy()
        env["LAMB_MODEL"] = model
        if char_id:
            env["LAMB_CHAR_ID"] = char_id
        if scenario:
            env["LAMB_SCENARIO"] = scenario
        if diary_prompt:
            env["LAMB_FULL_PROMPT"] = diary_prompt
        env["PYTHONIOENCODING"] = "utf-8"

        res_story = subprocess.run(
            [sys.executable, "generate_daily.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        if res_story.stdout:
            _append_job_log(job_id, f"[{timestamp}] === 完成「生成日記」任務 ===\n")
            _append_job_log(job_id, res_story.stdout)
            print(f"\n[{timestamp}] === 完成「生成日記」任務 ===\n")
            print(res_story.stdout)
        if res_story.stderr:
            _append_job_log(job_id, f"[{timestamp}] === 發生錯誤，無法完成「生成日記」任務 ===\n")
            _append_job_log(job_id, "Error: " + res_story.stderr)
            print(f"\n[{timestamp}] === 發生錯誤，無法完成「生成日記」任務 ===\n")
            print("Error: " + res_story.stderr)
        


        timestamp = time.strftime("%H:%M:%S", time.localtime())
        print(f"\n[{timestamp}] === 執行「生成圖片」任務，準備發送給 ComfyUI 的提示詞 ===")
        # print(image_prompt) # 避免提示詞太長洗版
        _append_job_log(job_id, f"\n[{timestamp}] === 執行「生成圖片」任務，準備發送給 ComfyUI 的提示詞 ===")
        # _append_job_log(job_id, image_prompt)

        res_img = subprocess.run(
            [sys.executable, "generate_image.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        if res_img.stdout:
            _append_job_log(job_id, f"\n[{timestamp}] == 完成「生成圖片」任務 ===" + res_img.stdout.strip())
            print(f"[{timestamp}] == 完成「生成圖片」任務 === [generate_image.py] stdout: {res_img.stdout.strip()}")
        
        if res_img.stderr:
            # 只有在真的有錯誤時才輸出 stderr，且避免重複輸出
            err_msg = res_img.stderr.strip()
            if err_msg and "Error" in err_msg:
                _append_job_log(job_id, f"[{timestamp}] === 發生錯誤，無法完成「生成圖片」任務 === " + err_msg)
                print(f"[{timestamp}] === 發生錯誤，無法完成「生成圖片」任務 === stderr: {err_msg}")

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _append_job_log(job_id, f"\n[{timestamp}] === 正在編譯頁面 ===")
        print(f"\n[{timestamp}] === 正在編譯頁面 ===")
        res_build = subprocess.run(
            [sys.executable, "daily_page_build.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        if res_build.stdout:
            _append_job_log(job_id, f"\n[{timestamp}]" + res_build.stdout)
            print(f"\n[{timestamp}] === 完成「編譯頁面」任務 ===\n")
            print(res_build.stdout)
        if res_build.stderr:
            _append_job_log(job_id, f"[{timestamp}]" + "Error: " + res_build.stderr)
            print(f"\n[{timestamp}] === 發生錯誤，無法完成「編譯頁面」任務 ===\n")
            print(f"\n[{timestamp}]" + "Error: " + res_build.stderr)

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

class DebugHandler(http.server.SimpleHTTPRequestHandler):
    #####################################################################################
    # 主控，根據需求發送提示詞並執行接收後的資料處理。
    #####################################################################################
    def __init__(self, *args, **kwargs):
        # 固定以 web/ 作為靜態檔案根目錄，避免 os.chdir 造成多執行緒競態
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # 靜默 /api/status 的日誌，以免每 5 秒噴一行
        if len(args) > 0 and isinstance(args[0], str) and "/api/status" in args[0]:
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
                        "image_prompt": job.get("image_prompt", "")
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
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                models = [m['name'] for m in data.get('models', [])]
                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps(models).encode('utf-8'))
            except Exception as e:
                self.send_error(500, f"Error: {e}")
        else:
            return super().do_GET()

    def do_POST(self):
        #####################################################################################
        # 處理 HTTP POST 請求（處理建立任務）
        #####################################################################################
        try:
            print(f"\n[POST] {self.path}")
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                body = self.rfile.read(content_length).decode('utf-8')
                params = json.loads(body)
            else:
                params = {}

            if self.path == '/api/run_async':
                #####################################################################################
                # 執行「日記生成」與「圖片生成」任務
                #####################################################################################
                char_id = params.get('char_id')
                scenario = params.get('scenario', '無特定情境')
                card_json = params.get('card_json')
                relationship_params = params.get('relationship', {})
                other_chars = params.get('other_chars', [])

                char_path = _resolve_character_json_path(char_id)
                diary_prompt = _build_diary_prompt(char_path, scenario, char_data_override=card_json, relationship_params=relationship_params, other_chars=other_chars)

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
                threading.Thread(target=_run_job, args=(job_id, char_id, scenario, diary_prompt, image_prompt, model_name), daemon=True).start()

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
                prompt = build_chapters_from_premise_prompt(main_char, book_title, premise, chars[1:], locked_chapters)
                
                print("\n" + "="*50)
                print("【DEBUG: AI 根據粗綱生成各章標題與描述的 PROMPT 如下】")
                print(prompt)
                print(">> 正在呼叫 Ollama 產生「各章標題與描述」 (請稍候)...")
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間:", timestamp)
                
                response_text = _ollama_generate_direct(params.get('model', 'gemma4'), prompt)

                print(">> 「各章標題與描述」產生完畢！\n")
                print(response_text)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
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
                all_chapters   = params.get('all_chapters', [])   # [{"title":"","description":""},...]
                chapter_index  = params.get('chapter_index', 0)   # 0-based
                prompt = build_chapter_outline_prompt(
                    main_char, book_title, desc, chars[1:],
                    story_premise=story_premise,
                    all_chapters=all_chapters,
                    chapter_index=chapter_index
                )
                
                print("\n" + "="*50)
                print("【DEBUG: AI 產生「各小節大綱」的 PROMPT】")
                print(prompt)
                print(">> 正在呼叫 Ollama 產生「各小節大綱」 (請稍候)...")
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間：", timestamp)
                
                response_text = _ollama_generate_direct(params.get('model', 'gemma4'), prompt)
                print(">> 「各小節大綱」產生完畢！\n")
                print(response_text)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
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
                            import re
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
                prompt = build_novel_content_prompt(main_char, ctx.get('chapter_title', ''), f"{ctx.get('chapter_desc', '')} - {ctx.get('section_title', '')}", ctx.get('section_title', ''), chars[1:])
                
                print("\n" + "="*50)
                print(f"【DEBUG: AI 「小說本文生成」 PROMPT - {ctx.get('section_title', '')}】")
                print(prompt)
                print(">> 正在呼叫 Ollama 產生「小說本文生成」 (這會花費較長的時間，請稍候)...")
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("起始時間：", timestamp)
                
                content = _ollama_generate_direct(params.get('model', 'gemma4'), prompt)
                print(f"【DEBUG: AI 「小說本文生成」產生完畢！ - {ctx.get('section_title', '')}】")
                print(content)
                timestamp = time.strftime("%H:%M:%S", time.localtime())
                print("結束時間：", timestamp)
                print("="*50)

                self.send_response(200)
                self.send_header('Content-type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(json.dumps({"content": content, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))

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
