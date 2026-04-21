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
from urllib.parse import urlparse, parse_qs
from prompt_utils import load_character_from_path, build_story_system_prompt, build_story_final_prompt

PORT = 8000
WEB_DIR = os.path.join(os.path.dirname(__file__), 'web')

JOBS = {}
JOBS_LOCK = threading.Lock()

def _resolve_character_json_path(char_id: str) -> str:
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

def _build_diary_prompt(char_path: str, scenario: str, char_data_override: dict = None, relationship_params: dict = None) -> str:
    """
    回傳「實際送給 Ollama 的完整 prompt」。
    根據 relationship_params 增加多人關係邏輯。
    """
    if char_data_override:
        char_data = char_data_override
    else:
        char_data = load_character_from_path(char_path)

    # 1. 根據伴侶狀態決定目前使用的是哪一種個性描述
    p_status = (relationship_params or {}).get('partner_status', '熱戀期')
    # 支援舊版/單一字串 personality，也支援新版物件格式
    pers_data = char_data.get('personality', "")
    current_personality = ""
    if isinstance(pers_data, dict):
        current_personality = pers_data.get(p_status, pers_data.get('熱戀期', ""))
    else:
        current_personality = pers_data
    
    # 覆蓋 char_data 中的 personality 供 build_story_system_prompt 使用
    display_char_data = char_data.copy()
    display_char_data['personality'] = current_personality

    system_prompt = build_story_system_prompt(display_char_data)
    
    # 2. 增加關係動態 (Relationship Dynamics)
    rel_context = ""
    if relationship_params:
        pa = relationship_params.get('partner_status')
        fA = relationship_params.get('friend_a_status', '無')
        fB = relationship_params.get('friend_b_status', '無')
        others_occupied = relationship_params.get('others_occupied', False)

        rel_context += f"\n[關係動態設定]\n- 本女主目前與伴侶處於：{pa}\n"
        
        if fA != '無':
            rel_context += f"- 與新朋友 A 處於：{fA}\n"
        if fB != '無':
            rel_context += f"- 與新朋友 B 處於：{fB}\n"
        
        if others_occupied:
            rel_context += "- 注意：女主心儀的對象（伴侶或新朋友）似乎已經另有對象了，這讓女主感到極度不安、競爭感或罪惡感。\n"

        # 複雜關係判斷
        logic_hints = []
        if pa == '熱戀期' and (fA == '曖昧期' and fB == '曖昧期'):
            logic_hints.append("女主正處於穩定戀愛中，卻與多位新朋友產生了曖昧情愫。顯然是想要離開男友，另尋新戀情，內心充滿了對男友的厭倦，對新戀情的期待與背德感的拉扯。")
        elif pa == '熱戀期' and (fA == '曖昧期' or fB == '曖昧期'):
            logic_hints.append("女主正處於穩定戀愛中，卻與新朋友產生了曖昧情愫。內心充滿了新鮮感與背德感的拉扯。")
        elif pa == '熱戀期' and (fA == '熱戀期' and fB == '熱戀期'):
            logic_hints.append("女主劈腿了。她同時與多人進行熱戀，顯然是個綠茶婊，享受被多人追捧的快感，必須在日記中呈現這種腳踏多條船的多重心理負擔與刺激。")
        elif pa == '熱戀期' and (fA == '熱戀期' or fB == '熱戀期'):
            logic_hints.append("女主劈腿了。她同時與兩個人進行熱戀，必須在日記中呈現這種出軌的心理負擔與刺激感，懺悔的同時又無法自拔。")
        elif pa == '失戀期' and (fA == '熱戀期' or fA == '曖昧期'):
            logic_hints.append("女主剛經歷失戀的痛苦，但新對象的出現讓她開始考慮接受下一段感情。")
        elif pa == '曖昧期' and (fA == '曖昧期' or fB == '曖昧期'):
            logic_hints.append("女主同時與多位對象處於曖昧期，她在多方之間比較、徘徊，享受這種被包圍的氛圍。")
        
        if others_occupied:
            logic_hints.append("加上『對方已有對象』的設定，故事應強調女主作為第三者的驕傲感、或成為競爭者的必勝心態、或擔憂被拒絕的失落感、或眾人指責的罪惡感。")

        if logic_hints:
            rel_context += "- 心理狀態指引：" + " ".join(logic_hints) + "\n"

    final_scenario = scenario
    if rel_context:
        final_scenario = f"{rel_context}\n[當日情境]\n{scenario}"

    return build_story_final_prompt(system_prompt, final_scenario)

def _append_job_log(job_id: str, text: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            return
        job["logs"].append(text)
        job["updated_at"] = time.time()

def _ollama_generate_direct(model, prompt, temperature=0.85):
    """直接呼叫 Ollama API 並回傳結果字串 (非串流)"""
    url = "http://127.0.0.1:11434/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": 4096}
    }
    try:
        import requests
        res = requests.post(url, json=payload, timeout=120)
        res.raise_for_status()
        return res.json().get('response', '').strip()
    except Exception as e:
        print(f"Ollama error: {e}")
        return f"Error: {e}"

def _run_job(job_id: str, char_id: str, scenario: str, diary_prompt: str, image_prompt: str):
    try:
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        if scenario:
            _append_job_log(job_id, f"[{timestamp}] [Scenario] {scenario}")
        
        print(f"\n[{timestamp}] === 準備發送給 OLLAMA 的提示詞 ===")
        print(diary_prompt)
        print("="*40 + "\n")

        _append_job_log(job_id, f"[{timestamp}] === 正在生成故事 (請稍候) ===")
        env = os.environ.copy()
        if char_id:
            env["LAMB_CHAR_ID"] = char_id
        if scenario:
            env["LAMB_SCENARIO"] = scenario
        if diary_prompt:
            env["LAMB_FULL_PROMPT"] = diary_prompt
        env["PYTHONIOENCODING"] = "utf-8"

        res_story = subprocess.run(
            [sys.executable, "generate_story.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        if res_story.stdout:
            _append_job_log(job_id, res_story.stdout)
        if res_story.stderr:
            _append_job_log(job_id, "Error: " + res_story.stderr)

        timestamp_img = time.strftime("%H:%M:%S", time.localtime())
        _append_job_log(job_id, f"\n[{timestamp_img}] === 正在生成圖片 (ComfyUI) ===")
        res_img = subprocess.run(
            [sys.executable, "generate_image.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        if res_img.stdout:
            _append_job_log(job_id, res_img.stdout)
        if res_img.stderr:
            _append_job_log(job_id, "Error: " + res_img.stderr)

        _append_job_log(job_id, "\n=== 正在編譯頁面 ===")
        res_build = subprocess.run(
            [sys.executable, "build_page.py"],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
        if res_build.stdout:
            _append_job_log(job_id, res_build.stdout)
        if res_build.stderr:
            _append_job_log(job_id, "Error: " + res_build.stderr)

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
    def __init__(self, *args, **kwargs):
        # 固定以 web/ 作為靜態檔案根目錄，避免 os.chdir 造成多執行緒競態
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path == '/api/characters':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            chars = [f.replace('.json', '') for f in os.listdir('characters') if f.endswith('.json')]
            self.wfile.write(json.dumps(chars).encode())
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
        elif parsed_path.path.startswith('/stories/'):
            # 特殊處理：容許存取根目錄下的 stories 資料夾 (用於同步乾淨 JSON)
            import urllib.parse
            file_path = urllib.parse.unquote(parsed_path.path.lstrip('/'))
            if os.path.exists(file_path):
                self.send_response(200)
                # 根據副檔名決定 content-type
                if file_path.endswith('.json'):
                    self.send_header('Content-type', 'application/json; charset=utf-8')
                else:
                    self.send_header('Content-type', 'application/octet-stream')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, "File not found")
        else:
            # 預設服務 web/ 下的靜態檔案
            return super().do_GET()

    # 準備好傳給大模型的提示詞，處理 POST 請求
    def do_POST(self):
        # 產生日記，處理 /api/run_async 請求
        if self.path == '/api/run_async':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data)
            
            char_id = params.get('char_id')
            scenario = params.get('scenario', '無特定情境')
            card_json = params.get('card_json')  # 雲端模式會直接傳入角色 JSON
            relationship_params = params.get('relationship', {})

            # 先把 prompt 組好回傳給前端顯示（避免 subprocess stdout 亂碼/逾時時拿不到）
            char_path = _resolve_character_json_path(char_id)
            diary_prompt = _build_diary_prompt(char_path, scenario, char_data_override=card_json, relationship_params=relationship_params)

            # 圖片 prompt：優先從 card_json 取，其次從本地檔案取
            image_prompt = ""
            if card_json:
                image_prompt = card_json.get('image_prompt', '') or ''
            elif char_path and os.path.exists(char_path):
                try:
                    with open(char_path, 'r', encoding='utf-8') as f:
                        cd = json.load(f)
                    image_prompt = cd.get('image_prompt', '') or ''
                except Exception:
                    image_prompt = ""

            # 如果收到 card_json 但本地沒有檔案，將其暫存為本地檔案供 generate_story.py 使用
            if card_json and not char_path:
                temp_char_path = os.path.join('characters', f'{char_id}.json')
                try:
                    os.makedirs('characters', exist_ok=True)
                    with open(temp_char_path, 'w', encoding='utf-8') as f:
                        json.dump(card_json, f, ensure_ascii=False, indent=4)
                    char_path = temp_char_path
                    _append_job_log('', f'[Cloud] 已將雲端角色卡暫存至 {temp_char_path}')
                except Exception as e:
                    _append_job_log('', f'[Cloud] 暫存角色卡失敗: {e}')

            job_id = str(uuid.uuid4())
            with JOBS_LOCK:
                JOBS[job_id] = {
                    "status": "running",
                    "created_at": time.time(),
                    "updated_at": time.time(),
                    "logs": [">> 任務已啟動（背景執行中）..."],
                    "diary_prompt": diary_prompt,
                    "image_prompt": image_prompt
                }

            t = threading.Thread(target=_run_job, args=(job_id, char_id, scenario, diary_prompt, image_prompt), daemon=True)
            t.start()

            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({
                "job_id": job_id,
                "status": "running",
                "diary_prompt": diary_prompt,
                "image_prompt": image_prompt
            }, ensure_ascii=False).encode('utf-8'))

        # 產出大綱，處理 /api/generate_outline 請求
        elif self.path == '/api/generate_outline':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data)
            desc = params.get('description', '')
            chars = params.get('characters', [])
            
            char_names = ", ".join([c.get('name', '未知角色') for c in chars])
            prompt = f"""你是一位專業的小說編輯。請根據以下【章節大綱說明】與【角色資訊】，為本章節規劃出 3 到 5 個具體的小節標題。
小節標題應具備故事張力，循序漸進。

【角色資訊】：{char_names}
【章節大綱說明】：{desc}

請直接回傳 JSON 格式的列表，例如：["小節標題1", "小節標題2", "小節標題3"]。不要有任何額外前言或解釋。"""

            response_text = _ollama_generate_direct("gemma4", prompt)
            
            # 嘗試解析 JSON 列表
            sections = []
            try:
                # 尋找方括號
                match = re.search(r'\[.*\]', response_text, re.DOTALL)
                if match:
                    sections = json.loads(match.group(0))
            except:
                sections = [s.strip() for s in response_text.split('\n') if s.strip()]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"sections": sections, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))

        # 產出小說內容，處理 /api/generate_story_content 請求
        elif self.path == '/api/generate_story_content':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            params = json.loads(post_data)
            ctx = params.get('context', {})
            chars = params.get('characters', [])
            
            char_context = ""
            for c in chars:
                char_context += f"【{c.get('name')}】\n性格：{c.get('personality')}\n背景：{c.get('background','')}\n\n"
                
            prompt = f"""你是一位獲獎無數的言情小說家。請根據以下資訊，撰寫一段細膩、動人且充滿畫面感的小說內容。
以第三人稱視角敘述，字數約 500-1000 字。

【登場角色與設定】：
{char_context}

【目前情境】：
章節：{ctx.get('chapter_title')}
章大綱：{ctx.get('chapter_desc')}
本小節目標：{ctx.get('section_title')}

請直接開始撰寫故事，不要輸出標題或任何前言。"""

            content = _ollama_generate_direct("gemma4", prompt)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({"content": content, "debug_prompt": prompt}, ensure_ascii=False).encode('utf-8'))

if __name__ == "__main__":
    os.makedirs('web', exist_ok=True)
    print(f"除錯伺服器運行於 http://localhost:{PORT}")
    print(f"請開啟 http://localhost:{PORT}/run_daily.html 進行測試")
    # 允許同時處理輪詢與背景任務的請求
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), DebugHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已停止。")
