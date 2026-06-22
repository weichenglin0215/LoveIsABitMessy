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
    build_daily_prompt,                  #生成日記 prompt
    build_chapters_from_premise_prompt,  #「根據故事粗綱生成各章標題與描述」的完整提示詞
    build_chapter_outline_prompt,        #根據章的標題與描述來建立「各小節大綱」的完整提示詞
    build_novel_content_prompt,          #建立「小說本文生成」的完整提示詞
    build_analyze_text_character_prompt, #從文字分析角色特質
    build_analyze_image_prompt_text,     #從圖片生成 AI 生圖提示詞
    build_story_to_premise_prompt,       #將故事原文濃縮成故事粗綱
    build_story_to_bullet_premise_prompt, #將故事原文轉成條列式故事粗綱
    build_json_repair_chapters_prompt,   #JSON格式修復：章標題與描述
    build_json_repair_sections_prompt,   #JSON格式修復：各小節大綱
    build_diary_image_prompt_text        #生成日記動態生圖提示詞
)

try:
    from json_repair import repair_json as _json_repair_lib
    _HAS_JSON_REPAIR = True
except ImportError:
    _HAS_JSON_REPAIR = False

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
    依序處理：
      0. 剝除推理型模型（qwen3、deepseek-r1 等）的 <think>...</think> 思考區塊
      1. 移除 Markdown 程式碼圍欄
      2. 跳過前綴說明文字，從第一個 [ 或 { 開始
      3. 直接解析（零開銷快速路徑）
      修復1. 移除多餘結尾逗號（, 緊接 } 或 ]）
      修復2. 補充缺漏的逗號（相鄰物件／陣列之間缺少分隔符）
      修復3. 逐字元掃描（字串內換行/tab 轉義、補閉合引號與括號）
    """
    s = s.strip()
    if not s:
        return s

    # 步驟 0：移除推理型模型輸出的 <think>...</think> 思考區塊
    s = re.sub(r'<think>[\s\S]*?</think>', '', s).strip()
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

    # 修復1.5：移除物件後多餘的閉合括號（LLM 常見錯誤：每個陣列元素末尾多寫一個 }）
    # 例：{"title":"..."}   },  →  {"title":"..."},
    # 只在解析失敗時嘗試，並在 try/except 內驗證，避免破壞合法的巢狀 JSON
    s_no_dup = re.sub(r'\}\s*\}(\s*[,\]])', r'}\1', s)
    s_no_dup = re.sub(r',(\s*[}\]])', r'\1', s_no_dup)  # 再清一次多餘逗號
    try:
        json.loads(s_no_dup)
        return s_no_dup
    except Exception:
        pass

    # 修復2：補充缺漏的逗號
    # AI 有時在陣列元素之間省略逗號，例如：
    #   } {  →  }, {
    #   }{   →  },{
    #   ] [  →  ], [
    # 作法：在 } 或 ] 緊接（含任意空白後） { 或 [ 時插入逗號；
    # 已有逗號的情況（}, { 中間有 ,）因逗號不屬於 \s* 故不會重複插入。
    s = re.sub(r'([}\]])(\s*)([{\[])', r'\1,\2\3', s)
    s = re.sub(r',(\s*[}\]])', r'\1', s)   # 清除修復後可能衍生的多餘逗號
    try:
        json.loads(s)
        return s
    except Exception:
        pass

    # 修復3：逐字元掃描
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

    # 修復後再次移除可能產生的多餘結尾逗號，並再補一次缺漏逗號
    fixed = re.sub(r',(\s*[}\]])', r'\1', fixed)
    fixed = re.sub(r'([}\]])(\s*)([{\[])', r'\1,\2\3', fixed)
    fixed = re.sub(r',(\s*[}\]])', r'\1', fixed)

    return fixed


def _json_bracket_end(s: str, start: int) -> int:
    """
    從 s[start] 的開括號（'[' 或 '{'）出發，
    用括號計數（忽略字串內的括號）找到對應的閉合括號並回傳其索引。
    找不到時回傳 -1。
    比 rfind(']') 更精確，不會被 JSON 結尾之後的雜文所誤導。
    """
    if start < 0 or start >= len(s) or s[start] not in '[{':
        return -1
    opener  = s[start]
    closer  = ']' if opener == '[' else '}'
    depth   = 0
    in_str  = False
    escape  = False
    for i in range(start, len(s)):
        c = s[i]
        if escape:
            escape = False
            continue
        if c == '\\' and in_str:
            escape = True
            continue
        if c == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if c == opener:
            depth += 1
        elif c == closer:
            depth -= 1
            if depth == 0:
                return i
    return -1  # 未找到對應閉合括號（JSON 不完整）

def _extract_sections_from_json_data(data) -> list:
    """從解析後的 JSON 資料中萃取小節大綱列表（支援字串元素或含 title/outline 物件）。"""
    sections = []
    if not isinstance(data, list):
        return sections
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
    return sections


def _parse_chapters_from_response(job_id: str, response_text: str, model: str, model_options) -> list:
    """
    多策略解析 AI 回應中的「章標題＋章描述」JSON 陣列。
    所有策略全部執行並蒐集結果，最後選最多章節的策略作為答案。
    策略1：json_repair 套件
    策略2：_try_repair_json + _json_bracket_end
    策略3：AI 重新解析（送回原始文字讓 AI 重新格式化）—— 僅在 1/2 結果不理想時觸發
    策略4：Fallback — 建立含原始文字的 fallback 章節，標記「不符JSON格式」
    永遠回傳 list（至少有一個 fallback 元素）。
    """
    candidates = []  # list of (strategy_name, chapters_list)

    # 策略1：json_repair 套件
    if _HAS_JSON_REPAIR:
        try:
            repaired = _json_repair_lib(response_text)
            data = json.loads(repaired)
            if isinstance(data, list) and data:
                candidates.append(("策略1-json_repair", data))
                _log_print(job_id, f">> [策略1] json_repair 解析得 {len(data)} 章")
        except Exception as e:
            _log_print(job_id, f">> [策略1] json_repair 失敗: {e}")

    # 策略2：_try_repair_json + _json_bracket_end
    try:
        repaired_text = _try_repair_json(response_text)
        start = repaired_text.find('[')
        end   = _json_bracket_end(repaired_text, start) if start != -1 else -1
        if start != -1 and end != -1:
            json_str = repaired_text[start:end + 1].replace('\n', ' ').strip()
            data = json.loads(json_str)
            if isinstance(data, list) and data:
                candidates.append(("策略2-_try_repair_json", data))
                _log_print(job_id, f">> [策略2] _try_repair_json 解析得 {len(data)} 章")
    except Exception as e:
        _log_print(job_id, f">> [策略2] _try_repair_json 失敗: {e}")

    # 判斷是否需要觸發 AI 重新解析（策略3）：
    # 條件：無候選、或最佳章數 < 3、或各策略結果差異超過 30%
    counts = [len(d) for _, d in candidates]
    best_so_far = max(counts, default=0)
    strategies_disagree = (len(counts) > 1 and min(counts) / max(counts) < 0.7)
    need_ai_reparse = (best_so_far < 3) or strategies_disagree

    if need_ai_reparse:
        _log_print(job_id, f">> 各策略結果不一致或章數不足（最佳={best_so_far}），啟動 AI 重新解析...")
        _log_print(job_id, f">> 原始回傳文字（前500字）：{response_text[:500]}")
        try:
            repair_prompt = build_json_repair_chapters_prompt(response_text)
            ai_repaired   = _ollama_generate_direct(model, repair_prompt, options=model_options, job_id=job_id)
            ai_repaired   = _try_repair_json(ai_repaired)
            start = ai_repaired.find('[')
            end   = _json_bracket_end(ai_repaired, start) if start != -1 else -1
            if start != -1 and end != -1:
                json_str = ai_repaired[start:end + 1].replace('\n', ' ').strip()
                data = json.loads(json_str)
                if isinstance(data, list) and data:
                    candidates.append(("策略3-AI重新解析", data))
                    _log_print(job_id, f">> [策略3] AI 重新解析得 {len(data)} 章")
        except Exception as e:
            _log_print(job_id, f">> [策略3] AI 重新解析失敗: {e}")

    # 比對所有候選，選出章數最多的策略
    if candidates:
        if len(candidates) > 1:
            _log_print(job_id, f">> 各策略結果比對：")
            for name, data in candidates:
                _log_print(job_id, f">>   {name}: {len(data)} 章")
        best_name, best_data = max(candidates, key=lambda x: len(x[1]))
        _log_print(job_id, f">> ✅ 採用最佳策略「{best_name}」，共 {len(best_data)} 章")
        return best_data

    # 策略4：Fallback — 原始文字放入第一章描述，標記不符JSON格式
    _log_print(job_id, f">> [策略4] 所有解析策略均失敗，以原始文字建立 fallback 章節")
    return [{"title": "（不符JSON格式）", "description": response_text}]


def _parse_sections_from_response(job_id: str, response_text: str, model: str, model_options) -> list:
    """
    多策略解析 AI 回應中的「各小節大綱」JSON 陣列。
    所有策略全部執行並蒐集結果，最後選最多小節的策略作為答案。
    策略1：json_repair 套件
    策略2：_try_repair_json + _json_bracket_end（含 regex 備用）
    策略3：AI 重新解析 —— 僅在 1/2 結果不理想時觸發
    策略4：Fallback — 逐行萃取，或整段放入單一 fallback 小節
    永遠回傳 list（至少有一個元素）。
    """
    candidates = []  # list of (strategy_name, sections_list)

    # 策略1：json_repair 套件
    if _HAS_JSON_REPAIR:
        try:
            repaired = _json_repair_lib(response_text)
            data = json.loads(repaired)
            sections = _extract_sections_from_json_data(data)
            if sections:
                candidates.append(("策略1-json_repair", sections))
                _log_print(job_id, f">> [策略1] json_repair 解析得 {len(sections)} 個小節")
        except Exception as e:
            _log_print(job_id, f">> [策略1] json_repair 失敗: {e}")

    # 策略2：_try_repair_json + _json_bracket_end（含 regex 備用）
    try:
        repaired_text = _try_repair_json(response_text)
        start = repaired_text.find('[')
        end   = _json_bracket_end(repaired_text, start) if start != -1 else -1
        if start != -1 and end != -1:
            json_str = repaired_text[start:end + 1].replace('\n', ' ').strip()
            try:
                data = json.loads(json_str)
                sections = _extract_sections_from_json_data(data)
                if sections:
                    candidates.append(("策略2-_try_repair_json", sections))
                    _log_print(job_id, f">> [策略2] _try_repair_json 解析得 {len(sections)} 個小節")
            except Exception:
                # regex 備用：逐一提取雙引號字串
                raw_titles = re.findall(r'"([^"]+)"', json_str)
                sections = [t.strip() for t in raw_titles if t.strip()]
                if sections:
                    candidates.append(("策略2-regex", sections))
                    _log_print(job_id, f">> [策略2-regex] regex 提取得 {len(sections)} 個小節")
    except Exception as e:
        _log_print(job_id, f">> [策略2] _try_repair_json 失敗: {e}")

    # 判斷是否需要觸發 AI 重新解析（策略3）：
    # 條件：無候選、或最佳小節數 < 2、或各策略結果差異超過 30%
    counts = [len(d) for _, d in candidates]
    best_so_far = max(counts, default=0)
    strategies_disagree = (len(counts) > 1 and min(counts) / max(counts) < 0.7)
    need_ai_reparse = (best_so_far < 2) or strategies_disagree

    if need_ai_reparse:
        _log_print(job_id, f">> 各策略結果不一致或小節數不足（最佳={best_so_far}），啟動 AI 重新解析...")
        _log_print(job_id, f">> 原始回傳文字（前500字）：{response_text[:500]}")
        try:
            repair_prompt = build_json_repair_sections_prompt(response_text)
            ai_repaired   = _ollama_generate_direct(model, repair_prompt, options=model_options, job_id=job_id)
            ai_repaired   = _try_repair_json(ai_repaired)
            start = ai_repaired.find('[')
            end   = _json_bracket_end(ai_repaired, start) if start != -1 else -1
            if start != -1 and end != -1:
                json_str = ai_repaired[start:end + 1].replace('\n', ' ').strip()
                data = json.loads(json_str)
                sections = _extract_sections_from_json_data(data)
                if sections:
                    candidates.append(("策略3-AI重新解析", sections))
                    _log_print(job_id, f">> [策略3] AI 重新解析得 {len(sections)} 個小節")
        except Exception as e:
            _log_print(job_id, f">> [策略3] AI 重新解析失敗: {e}")

    # 比對所有候選，選出小節數最多的策略
    if candidates:
        if len(candidates) > 1:
            _log_print(job_id, f">> 各策略結果比對：")
            for name, data in candidates:
                _log_print(job_id, f">>   {name}: {len(data)} 個小節")
        best_name, best_data = max(candidates, key=lambda x: len(x[1]))
        _log_print(job_id, f">> ✅ 採用最佳策略「{best_name}」，共 {len(best_data)} 個小節")
        return best_data

    # 策略4：Fallback — 逐行萃取有意義的非空行
    _log_print(job_id, f">> [策略4] 所有解析策略均失敗，以原始文字建立 fallback 小節")
    lines = [s.strip() for s in response_text.split('\n')
             if s.strip() and not s.strip().startswith('[') and not s.strip().startswith('`')]
    if lines:
        return lines
    return [f"（不符JSON格式）{response_text[:300]}"]


def _save_diary_json(char_data: dict, result_text: str, final_prompt: str, image_prompt: str = "", entry_date: str = "", diary_hour: str = "", ai_setup: dict = None) -> str:
    """將日記內容存成 JSON 檔，回傳檔名。
    檔名格式：角色名_日記日期_日記記錄時間-序號.json（例：張小妹_2026-05-23_19-001.json）
    entry_date: 日記的記錄日期（YYYY-MM-DD），批量生成時傳入指定日期；空白則用系統今天。
    diary_hour: 日記的記錄時間（HH），例如 "19"；空白則省略時間欄位。"""
    import re as _re
    from datetime import datetime as _dt
    os.makedirs('diaries', exist_ok=True)
    now       = _dt.now()
    # 用日記的記錄日期當檔名，而非系統今天
    today     = entry_date if entry_date else now.strftime("%Y-%m-%d")
    char_name = char_data.get('name', 'unknown')
    # 檔名前綴：角色名_日記日期_日記時間（有時間就帶入，無則省略）
    if diary_hour:
        file_prefix = f"{char_name}_{today}_{diary_hour}"
    else:
        file_prefix = f"{char_name}_{today}"
    # 取得下一個遞增編號檔名
    suffix = ".json"
    existing = [f for f in os.listdir('diaries') if f.startswith(file_prefix) and f.endswith(suffix)]
    max_num = 0
    for f in existing:
        m = _re.search(rf"{_re.escape(file_prefix)}-(\d{{3}}){_re.escape(suffix)}$", f)
        if m:
            max_num = max(max_num, int(m.group(1)))
    out_filename = f"{file_prefix}-{max_num + 1:03d}.json"
    story_obj = {
        "date":           today,
        "character_id":   char_data.get('id', char_name),
        "character_name": char_name,
        "story":          result_text,
        "image_prompt":   image_prompt or char_data.get('image_prompt', ''),
        "full_prompt":    final_prompt,
        "ai_setup":       ai_setup or {}   # 記錄生成時使用的 AI 參數設定
    }
    with open(os.path.join('diaries', out_filename), 'w', encoding='utf-8') as f:
        json.dump(story_obj, f, ensure_ascii=False, indent=4)
    return out_filename


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

def _log_print(job_id, text: str):
    """同時輸出到 CMD 視窗與瀏覽器 LOG 欄。job_id 為 None 時僅印至 CMD。"""
    print(text)
    if job_id:
        _append_job_log(job_id, text)

def _make_stream_callback(job_id: str, time_start: float):
    """
    建立串流 callback。
    - 每個 token 都更新 last_activity（keep-alive 核心）
    - 每 5 秒將累積的生成文字一次性寫入 job LOG（直接看到輸出比看字數更直覺）
    - 附帶 .flush() 方法，供串流結束時強制輸出緩衝區剩餘文字
    支援有「thinking」欄位的推理型模型（如 qwen3、deepseek-r1）。
    """
    buffer   = ['']   # 累積尚未輸出的生成文字
    last_hb  = [time_start]

    def _do_flush():
        chunk = buffer[0]
        buffer[0] = ''
        if chunk.strip():
            _append_job_log(job_id, chunk)

    def cb(response: str = '', thinking: str = ''):
        if response:
            buffer[0] += response
        now = time.time()
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["last_activity"] = now
        if now - last_hb[0] >= 5:
            last_hb[0] = now
            _do_flush()

    cb.flush = _do_flush   # 供外部在串流結束後強制清空緩衝區
    return cb


def _ollama_with_heartbeat(job_id: str, model: str, prompt: str,
                           options=None, images=None, time_start: float = None):
    """
    呼叫 Ollama 並確保整個過程（含 prefill 長時間零輸出期間）都有心跳更新，
    防止前端輪詢因無活動超時而提前結束。

    機制：
    - 背景執行緒：每 10 秒更新 job["last_activity"]（無 LOG 不洗版）；
                  每 60 秒再額外追加一行等待 LOG，讓使用者看到系統還活著。
    - on_chunk callback（來自 _make_stream_callback）：
                  每個 token 更新 last_activity；每 5 秒追加進度 LOG。
    """
    t0 = time_start or time.time()
    stop = threading.Event()

    def _hb():
        last_log_time = [t0]
        while not stop.wait(10):          # 每 10 秒靜默更新 last_activity
            now = time.time()
            with JOBS_LOCK:
                if job_id in JOBS:
                    JOBS[job_id]["last_activity"] = now
            if now - last_log_time[0] >= 60:  # 每 60 秒補一行 LOG
                last_log_time[0] = now
                elapsed = int(now - t0)
                _append_job_log(
                    job_id,
                    f">> [等待中] Ollama 仍在運算（prefill/大型模型），已用 {elapsed} 秒..."
                )

    threading.Thread(target=_hb, daemon=True).start()
    on_chunk = _make_stream_callback(job_id, t0)
    try:
        result = _ollama_generate_direct(
            model, prompt,
            options=options,
            images=images,
            on_chunk=on_chunk,
            job_id=job_id          # 讓 generate 函式的參數 LOG 也同步到瀏覽器
        )
        on_chunk.flush()           # 強制輸出串流結束時緩衝區殘餘的文字
        return result
    finally:
        stop.set()  # 確保 Ollama 結束後背景執行緒立即停止


def _ollama_generate_direct(model, prompt, options=None, images=None, on_chunk=None, job_id=None):
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
    #"keep_alive": -1,
    "keep_alive": "10m",
    "stream": stream_val,
    "options": default_options
    }

    if images:
        payload["images"] = images
    
    _log_print(job_id, f">>>> 模型: {model}")
    _log_print(job_id, f">>>> 以流式回傳結果: {stream_val}")
    _log_print(job_id, f">>>> VRAM保有大模型(keep_alive -1 等於長久保留): {payload['keep_alive']}")
    _log_print(job_id, f">>>> 溫度(Temperature): {default_options['temperature']}")
    _log_print(job_id, f">>>> 預測長度(num_predict): {default_options['num_predict']}")
    _log_print(job_id, f">>>> 上下文視窗(num_ctx): {default_options['num_ctx']}")
    _log_print(job_id, f">>>> 重複懲罰(repeat_penalty): {default_options['repeat_penalty']}")
    _log_print(job_id, f">>>> Top-K: {default_options['top_k']}")
    _log_print(job_id, f">>>> Top-P: {default_options['top_p']}")
    _log_print(job_id, f">>>> 隨機種子(seed): {default_options['seed']}")
    _log_print(job_id, f">>>> 提示詞字數(Prompt Length): {len(prompt)} characters")
    
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

        _log_print(job_id, ">>>> 正在發送 POST 請求至 Ollama...")
        try:
            with urllib.request.urlopen(req, timeout=3000) as resp:
                _log_print(job_id, f">>>> 伺服器回應碼: {resp.status}")
                _log_print(job_id, "(O)"*15 + "流式生成文字開始" + "(O)"*15)
                if resp.status != 200:
                    err_body = resp.read().decode('utf-8', errors='replace')
                    _log_print(job_id, f"\n>>>> [OLLAMA API ERROR] Status: {resp.status}")
                    _log_print(job_id, f">>>> [OLLAMA API ERROR] Body: {err_body}")
                    return f">>>> Error {resp.status}: {err_body}"

                # 逐行讀取串流回應
                for raw_line in resp:
                    line = raw_line.strip()
                    if line:
                        chunk = json.loads(line)
                        content  = chunk.get('response', '')
                        thinking = chunk.get('thinking', '')
                        print(content, end='', flush=True)
                        full_response.append(content)
                        # 每個 chunk 都通知心跳（含思考型模型的 thinking 階段）
                        if on_chunk:
                            on_chunk(content, thinking)
                        if chunk.get('done'):
                            break
        except Exception as e:
            _log_print(job_id, f"\n>>>> [EXCEPTION] Ollama 呼叫失敗: {str(e)}")
            import traceback
            traceback.print_exc()
            return f"（連線錯誤：{str(e)}）"
        _log_print(job_id, "\n" + "(O)"*15 + "流式生成文字結束" + "(O)"*15)
        return "".join(full_response).strip()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        _log_print(job_id, f"\n>>>> [OLLAMA API ERROR] Status: {e.code}")
        _log_print(job_id, f">>>> [OLLAMA API ERROR] Body: {err_body}")
        return f">>>> Error {e.code}: {err_body}"
    except Exception as e:
        _log_print(job_id, f"\n>>>> [EXCEPTION] Ollama 呼叫失敗: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return f">>>> Error: {e}"

# ═══════════════════════════════════════════════════════════════════════════════
# 非同步 Job 函式（小說產生器 / LoveLine 聊天）
# 前端透過 /api/job?id=... 輪詢 logs，即時顯示後端 print 訊息
# ═══════════════════════════════════════════════════════════════════════════════

def _run_analyze_text_char_job(job_id: str, params: dict):
    """非同步執行「從文字分析角色特質並生成角色卡 JSON」任務"""
    #####################################################################################
    # 非同步執行「從文字分析角色特質並生成角色卡 JSON」任務。
    #####################################################################################
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
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】從文字分析角色特質")
        if target_name:
            _log_print(job_id, f">> 目標角色：「{target_name}」")
        _log_print(job_id, f">> 文字長度：{len(text_content)} 字，模型：{model_name}，num_predict：{opts['num_predict']}")
        _log_print(job_id, "=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        _log_print(job_id, prompt)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)
        _log_print(job_id, ">> 正在呼叫 Ollama 分析中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_with_heartbeat(
            job_id, model_name, prompt, options=opts, time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        _log_print(job_id, response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        _log_print(job_id, "=" * 20 + " AI 回傳結束 " + "=" * 20)
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，Ollama 回傳完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            _log_print(job_id, ">> [警告] 模型回傳空字串！可能原因：模型拒絕回應、num_ctx 不足、或模型不支援此任務。")
            _log_print(job_id, f">> 請確認 Ollama 中已載入模型：{model_name}")

        character = {}
        try:
            repaired_text = _try_repair_json(response_text)
            start = repaired_text.find('{')
            end   = _json_bracket_end(repaired_text, start) if start != -1 else -1
            if start != -1 and end != -1:
                character = json.loads(repaired_text[start:end + 1])
                _log_print(job_id, f">> JSON 解析成功！角色名稱：{character.get('name', '未命名')}")
                _log_print(job_id, f">> 星座：{character.get('zodiac','')}　血型：{character.get('blood_type','')}　LPAS：{character.get('personality_type','')}")
            else:
                _log_print(job_id, ">> 找不到有效 JSON 物件（回傳內容中沒有 { } 結構）。")
        except Exception as e:
            _log_print(job_id, f">> JSON 解析失敗：{e}")
            _log_print(job_id, f">> 顯示原始回傳文字：{response_text}")
            _log_print(job_id, f">> 顯示JSON修正後文字：{repaired_text}")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"character": character, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _log_print(job_id, f"[ERROR] _run_analyze_text_char_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_analyze_image_char_job(job_id: str, params: dict):
    """非同步執行「從圖片分析外貌並生成 AI 生圖提示詞」任務"""
    #####################################################################################
    # 非同步執行「從圖片分析外貌並生成 AI 生圖提示詞」任務。
    #####################################################################################
    try:
        image_base64 = params.get('image_base64', '')
        model_name   = params.get('model', 'gemma4')
        prompt = build_analyze_image_prompt_text()

        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 2048)
        opts.setdefault('temperature', 0.95)

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】從圖片分析外貌生成提示詞")
        _log_print(job_id, f">> 模型：{model_name}，圖片 base64 長度：{len(image_base64)} 字元")
        if not image_base64:
            _log_print(job_id, ">> [錯誤] 未收到圖片資料！")
            with JOBS_LOCK:
                if job_id in JOBS:
                    JOBS[job_id]["status"] = "error"
                    JOBS[job_id]["updated_at"] = time.time()
            return
        _log_print(job_id, "=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        _log_print(job_id, prompt)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)
        _log_print(job_id, ">> 正在呼叫 Ollama 分析圖片中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_with_heartbeat(
            job_id, model_name, prompt,
            options=opts, images=[image_base64], time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        _log_print(job_id, response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        _log_print(job_id, "=" * 20 + " AI 回傳結束 " + "=" * 20)
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，Ollama 回傳完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            _log_print(job_id, ">> [警告] 模型回傳空字串！可能原因：模型不支援視覺功能。")
            _log_print(job_id, f">> 請確認 {model_name} 支援圖片輸入（vision model）。")
            _log_print(job_id, ">> 支援視覺的模型範例：gemma4、llava、moondream、minicpm-v 等。")

        image_prompt = response_text.strip().strip('"').strip("'")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"image_prompt": image_prompt, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _log_print(job_id, f"[ERROR] _run_analyze_image_char_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()



def _run_job(job_id: str, char_id: str, scenario: str, diary_prompt: str, image_prompt: str, model: str = "gemma4", params: dict = None):
    #####################################################################################
    # 執行「生成日記」任務，直接呼叫 _ollama_with_heartbeat（與小說/Loveline 統一）
    #####################################################################################
    if params is None:
        params = {}
    try:
        timeStartSec   = time.time()
        timestampStart = time.strftime("%H:%M:%S", time.localtime(timeStartSec))

        # 解析角色資料（供存檔用）
        char_data = {}
        if params.get('card_json'):
            char_data = params['card_json']
        elif char_id:
            cpath = _resolve_character_json_path(char_id)
            if cpath:
                try:
                    with open(cpath, 'r', encoding='utf-8') as f:
                        char_data = json.load(f)
                except Exception: pass

        # 合併模型參數（以使用者設定為主，填入日記用預設值）
        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 4096)
        opts.setdefault('temperature', 0.85)

        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestampStart}] debug_server.py：【非同步】執行「生成日記」任務")
        _log_print(job_id, "=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        _log_print(job_id, diary_prompt)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)
        _log_print(job_id, f">> 正在呼叫 Ollama 產生日記內容（請稍候）...")

        # ── 第一次生成
        result_text = _ollama_with_heartbeat(
            job_id, model, diary_prompt, options=opts, time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        _log_print(job_id, f"[{time.strftime('%H:%M:%S')}] 總共花費 {duration} 秒，日記初稿產生完畢，長度：{len(result_text)} 字元")

        # ── 第二次生成：動態生圖提示詞
        _log_print(job_id, ">> 正在根據日記內容生成動態生圖提示詞 (這會花費一些時間)...")
        img_prompt_req = build_diary_image_prompt_text(char_data, result_text)
        _log_print(job_id, "=" * 20 + " 以下是送給 AI 的生圖提示詞生成請求 " + "=" * 20)
        _log_print(job_id, img_prompt_req)
        _log_print(job_id, "=" * 20 + " 請求結束 " + "=" * 20)
        timeImgStartSec = time.time()
        dynamic_image_prompt = _ollama_with_heartbeat(
            job_id, model, img_prompt_req, options=opts, time_start=timeImgStartSec
        )
        duration_img = int(time.time() - timeImgStartSec)
        # ── 解析動態生圖提示詞（JSON 格式 {"en": "...", "zh": "..."}）
        _log_print(job_id, f"[{time.strftime('%H:%M:%S')}] 總共花費 {duration_img} 秒，動態生圖提示詞產生完畢！")
        raw_img_resp = dynamic_image_prompt.strip()

        img_prompt_en = ''  # 英文提示詞，送給 ComfyUI
        img_prompt_zh = ''  # 中文提示詞，僅記錄用

        # 嘗試從回應中提取 JSON 物件（去掉可能的 Markdown 包裝）
        json_start = raw_img_resp.find('{')
        json_end   = raw_img_resp.rfind('}')
        json_candidate = raw_img_resp[json_start:json_end + 1] if (json_start != -1 and json_end != -1) else raw_img_resp

        # 策略1：直接 json.loads
        _parsed_img_json = None
        try:
            _parsed_img_json = json.loads(json_candidate)
        except Exception:
            pass

        # 策略2：json_repair 套件修復
        if _parsed_img_json is None and _HAS_JSON_REPAIR:
            try:
                _parsed_img_json = json.loads(_json_repair_lib(json_candidate))
            except Exception:
                pass

        if _parsed_img_json and isinstance(_parsed_img_json, dict):
            img_prompt_en = str(_parsed_img_json.get('en', '')).strip()
            img_prompt_zh = str(_parsed_img_json.get('zh', '')).strip()
        else:
            # 策略3：無法解析，把原始文字當成英文提示詞（降級處理）
            img_prompt_en = raw_img_resp.strip('"').strip("'")
            _log_print(job_id, "⚠️  無法解析 JSON 格式的生圖提示詞，已降級為純文字模式。")

        # 記錄到 LOG
        _log_print(job_id, "=" * 20 + " 動態生圖提示詞（英文）" + "=" * 20)
        _log_print(job_id, img_prompt_en)
        _log_print(job_id, "=" * 20 + " 動態生圖提示詞（中文）" + "=" * 20)
        _log_print(job_id, img_prompt_zh)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)

        # dynamic_image_prompt 改存完整 JSON 字串（供存檔與前端顯示）
        dynamic_image_prompt = json.dumps({"en": img_prompt_en, "zh": img_prompt_zh}, ensure_ascii=False)

        # ── 存檔（從 time_context 解析日記的記錄日期與時間，如「日期：2026-05-23，大約晚上 19 點左右」）
        import re as _re_tc
        time_context_str = params.get('time_context', '')
        # 解析日期：YYYY-MM-DD
        tc_date_match = _re_tc.search(r'(\d{4}-\d{2}-\d{2})', time_context_str)
        entry_date_str = tc_date_match.group(1) if tc_date_match else ''
        # 解析時間：取「XX 點」前的數字（如「晚上 19 點」→ "19"）
        tc_hour_match = _re_tc.search(r'(\d{1,2})\s*點', time_context_str)
        diary_hour_str = tc_hour_match.group(1).zfill(2) if tc_hour_match else ''
        ai_setup = params.get('ai_setup') or {}
        out_filename = _save_diary_json(char_data, result_text, diary_prompt, dynamic_image_prompt, entry_date=entry_date_str, diary_hour=diary_hour_str, ai_setup=ai_setup)
        _log_print(job_id, f">> ✅ 日記已儲存至 diaries/{out_filename}")
        _log_print(job_id, "=" * 20 + " 以下是 AI 完整生成的日記內容 " + "=" * 20)
        _log_print(job_id, result_text)
        _log_print(job_id, "=" * 20 + " 日記內容結束 " + "=" * 20)

        # ── 圖片生成（保留 subprocess 方式，與原本相同）
        env = os.environ.copy()
        env["LAMB_MODEL"]          = model
        env["LAMB_CHAR_ID"]        = char_id or ""
        env["LAMB_SCENARIO"]       = scenario or ""
        env["LAMB_FULL_PROMPT"]    = diary_prompt
        env["PYTHONIOENCODING"]    = "utf-8"
        if params.get('model_options'):
            env["LAMB_MODEL_OPTIONS"]  = json.dumps(params['model_options'])
        if params.get('writer_settings'):
            env["LAMB_WRITER_SETTINGS"] = json.dumps(params['writer_settings'])

        timestampImgStart = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, f"\n[{timestampImgStart}] debug_server.py : === 執行「生成圖片」任務，準備發送給 ComfyUI 的提示詞 ===")
        res_img = subprocess.run(
            [sys.executable, "generate_image.py"],
            capture_output=True, text=True, encoding='utf-8', errors='replace', env=env
        )
        timestampImgEnd = time.strftime("%H:%M:%S", time.localtime())
        if res_img.stdout:
            _log_print(job_id, f"\n[{timestampImgEnd}] debug_server.py : == 完成「生成圖片」任務 ===" + res_img.stdout.strip())
        if res_img.stderr:
            err_msg = res_img.stderr.strip()
            if err_msg and "Error" in err_msg:
                _log_print(job_id, f"[{timestampImgEnd}] debug_server.py : === 發生錯誤，無法完成「生成圖片」任務 === " + err_msg)

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"diary": result_text, "image_prompt": dynamic_image_prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _log_print(job_id, f"[ERROR] _run_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()



def _run_story_to_bullet_premise_job(job_id: str, params: dict):
    """非同步執行「將故事原文轉成條列式故事粗綱」任務"""
    #####################################################################################
    # 非同步執行「將故事原文轉成條列式故事粗綱」任務。
    #####################################################################################
    try:
        text_content      = params.get('text_content', '')
        model_name        = params.get('model', 'gemma4')
        chapter_count     = int(params.get('chapter_count', 8))
        words_per_chapter = int(params.get('words_per_chapter', 400))
        prompt = build_story_to_bullet_premise_prompt(
            text_content, chapter_count=chapter_count, words_per_chapter=words_per_chapter
        )

        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 4096)
        opts.setdefault('temperature', 0.8)

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】將故事原文轉成條列式故事粗綱")
        _log_print(job_id, f">> 原文長度：{len(text_content)} 字，模型：{model_name}，num_predict：{opts['num_predict']}")
        _log_print(job_id, "=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        _log_print(job_id, prompt)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)
        _log_print(job_id, ">> 正在呼叫 Ollama 產生條列式故事粗綱中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_with_heartbeat(
            job_id, model_name, prompt, options=opts, time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        _log_print(job_id, response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        _log_print(job_id, "=" * 20 + " AI 回傳結束 " + "=" * 20)
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，條列式故事粗綱產生完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            _log_print(job_id, ">> [警告] 模型回傳空字串！可能原因：模型拒絕回應、num_ctx 不足、或模型不支援此任務。")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"premise": response_text.strip(), "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _log_print(job_id, f"[ERROR] _run_story_to_bullet_premise_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_story_to_premise_job(job_id: str, params: dict):
    """非同步執行「將故事原文濃縮成故事粗綱」任務"""
    #####################################################################################
    # 非同步執行「將故事原文濃縮成故事粗綱」任務。
    #####################################################################################
    try:
        text_content      = params.get('text_content', '')
        model_name        = params.get('model', 'gemma4')
        chapter_count     = int(params.get('chapter_count', 8))
        words_per_chapter = int(params.get('words_per_chapter', 200))
        prompt = build_story_to_premise_prompt(text_content, chapter_count=chapter_count, words_per_chapter=words_per_chapter)

        opts = dict(params.get('model_options') or {})
        opts.setdefault('num_predict', 4096)
        opts.setdefault('temperature', 0.75)

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】將故事原文濃縮成故事粗綱")
        _log_print(job_id, f">> 原文長度：{len(text_content)} 字，模型：{model_name}，num_predict：{opts['num_predict']}")
        _log_print(job_id, "=" * 20 + " 以下是送給 AI 的完整提示詞 " + "=" * 20)
        _log_print(job_id, prompt)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)
        _log_print(job_id, ">> 正在呼叫 Ollama 產生故事粗綱中（請稍候）...")

        timeStartSec = time.time()
        response_text = _ollama_with_heartbeat(
            job_id, model_name, prompt, options=opts, time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 20 + " 以下是 AI 完整回傳內容 " + "=" * 20)
        _log_print(job_id, response_text if response_text.strip() else "（空字串，模型未回傳任何內容）")
        _log_print(job_id, "=" * 20 + " AI 回傳結束 " + "=" * 20)
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，故事粗綱產生完畢，回傳長度：{len(response_text)} 字元")
        if not response_text.strip():
            _log_print(job_id, ">> [警告] 模型回傳空字串！可能原因：模型拒絕回應、num_ctx 不足、或模型不支援此任務。")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"premise": response_text.strip(), "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        import traceback
        _log_print(job_id, f"[ERROR] _run_story_to_premise_job failed: {e}\n{traceback.format_exc()}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()

def _run_novel_chapters_job(job_id: str, params: dict):
    """非同步執行「根據粗綱生成各章標題與描述」任務"""
    #####################################################################################
    # 非同步執行「根據粗綱生成各章標題與描述」任務。
    #####################################################################################
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
        main_char         = chars[0] if chars else {}
        locked_chapters   = params.get('locked_chapters', [])
        writer_settings   = params.get('writer_settings', {})
        chapter_count     = int(params.get('chapter_count', 16))
        words_per_chapter = int(params.get('words_per_chapter', 400))
        prompt = build_chapters_from_premise_prompt(
            main_char, book_title, premise, chars[1:], locked_chapters,
            writer_settings=writer_settings, chapter_count=chapter_count, words_per_chapter=words_per_chapter
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】根據粗綱生成各章標題與描述")
        _log_print(job_id, f">> 正在呼叫 Ollama 產生「各章標題與描述」(請稍候)...")

        timeStartSec = time.time()
        response_text = _ollama_with_heartbeat(
            job_id, params.get('model', 'gemma4'), prompt,
            options=params.get('model_options'), time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，「各章標題與描述」產生完畢！")

        chapters = _parse_chapters_from_response(
            job_id, response_text, params.get('model', 'gemma4'), params.get('model_options')
        )
        _log_print(job_id, f">> 共解析出 {len(chapters)} 章")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"chapters": chapters, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _log_print(job_id, f"[ERROR] _run_novel_chapters_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_novel_outline_job(job_id: str, params: dict):
    """非同步執行「建立各小節大綱」任務"""
    #####################################################################################
    # 非同步執行「建立各小節大綱」任務。
    #####################################################################################
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
        main_char         = chars[0] if chars else {}
        story_premise     = params.get('story_premise', '')
        all_chapters      = params.get('all_chapters', [])
        chapter_index     = params.get('chapter_index', 0)
        locked_sections   = params.get('locked_sections', [])
        writer_settings   = params.get('writer_settings', {})
        section_count     = int(params.get('section_count', 4))
        words_per_section = int(params.get('words_per_section', 500))
        prompt = build_chapter_outline_prompt(
            main_char, book_title, desc, chars[1:],
            story_premise=story_premise,
            all_chapters=all_chapters,
            chapter_index=chapter_index,
            locked_sections=locked_sections,
            writer_settings=writer_settings,
            section_count=section_count,
            words_per_section=words_per_section
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】建立各小節大綱")
        _log_print(job_id, f">> 正在呼叫 Ollama 產生「各小節大綱」(請稍候)...")

        timeStartSec = time.time()
        response_text = _ollama_with_heartbeat(
            job_id, params.get('model', 'gemma4'), prompt,
            options=params.get('model_options'), time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，「各小節大綱」產生完畢！")

        sections = _parse_sections_from_response(
            job_id, response_text, params.get('model', 'gemma4'), params.get('model_options')
        )
        _log_print(job_id, f">> 共解析出 {len(sections)} 個小節")
        sections = [s.replace('"', '').replace("'", '').strip() for s in sections if s.strip()]
        if not sections:
            sections = ["新小節"]

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"sections": sections, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _log_print(job_id, f"[ERROR] _run_novel_outline_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_novel_content_job(job_id: str, params: dict):
    """非同步執行「小說本文生成」任務"""
    #####################################################################################
    # 非同步執行「小說本文生成」任務。
    #####################################################################################
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
        main_char         = chars[0] if chars else {}
        writer_settings   = params.get('writer_settings', {})
        story_premise     = params.get('story_premise', '')
        section_title     = ctx.get('section_title', '')
        words_per_section = int(params.get('words_per_section', 3000))
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
            story_premise=story_premise,
            words_per_section=words_per_section
        )

        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】小說本文生成 - {section_title}")
        _log_print(job_id, f">> 正在呼叫 Ollama 產生「小說本文生成」(這會花費較長時間，請稍候)...")

        timeStartSec = time.time()
        content = _ollama_with_heartbeat(
            job_id, params.get('model', 'gemma4'), prompt,
            options=params.get('model_options'), time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，「小說本文生成」完畢！ - {section_title}")

        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["result"]     = {"content": content, "debug_prompt": prompt}
                JOBS[job_id]["status"]     = "done"
                JOBS[job_id]["updated_at"] = time.time()
    except Exception as e:
        _log_print(job_id, f"[ERROR] _run_novel_content_job failed: {e}")
        with JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["status"]     = "error"
                JOBS[job_id]["updated_at"] = time.time()


def _run_chat_reply_job(job_id: str, params: dict):
    """非同步執行「LoveLine 角色回覆」任務"""
    #####################################################################################
    # 非同步執行「LoveLine 角色回覆」任務。
    #####################################################################################
    from prompt_utils import build_chat_reply_prompt
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
        _log_print(job_id, "=" * 50)
        _log_print(job_id, f"[{timestamp}] debug_server.py：【非同步】LoveLine 角色回覆 - {character_name}")

        # 13 個關鍵欄位的內容檢查（有無/長度/摘要），確認前端是否完整傳入
        def _summary(v):
            """以摘要字串回報任一欄位的狀態。dict→鍵列表；list→筆數；str→字數"""
            if v is None:
                return "無 (None)"
            if isinstance(v, str):
                return f"有 ({len(v)} 字)" if v else "無 (空字串)"
            if isinstance(v, dict):
                return f"有 ({len(v)} 個鍵: {list(v.keys())[:6]})" if v else "無 (空 dict)"
            if isinstance(v, list):
                return f"有 ({len(v)} 筆)" if v else "無 (空 list)"
            return f"有 ({type(v).__name__})"

        _log_print(job_id, "=" * 20 + " 13 個欄位接收檢查 " + "=" * 20)
        _log_print(job_id, f">> char_data            : {_summary(character)}")
        _log_print(job_id, f">> char_name            : {_summary(character_name)} → 「{character_name}」")
        _log_print(job_id, f">> user_name            : {_summary(user_name)} → 「{user_name}」")
        _log_print(job_id, f">> user_message         : {_summary(user_message)}")
        _log_print(job_id, f">> history              : {_summary(history)}")
        _log_print(job_id, f">> persona_override     : {_summary(persona_override)}")
        _log_print(job_id, f">> session_extra        : {_summary(session_extra)}")
        _log_print(job_id, f">> user_char_data       : {_summary(user_char_data)}")
        _log_print(job_id, f">> user_persona_override: {_summary(user_persona_override)}")
        _log_print(job_id, f">> user_extra           : {_summary(user_extra)}")
        _log_print(job_id, f">> session_type         : {_summary(session_type)} → 「{session_type}」")
        _log_print(job_id, f">> other_participants   : {_summary(participants)}")
        _log_print(job_id, f">> writer_settings      : {_summary(writer_settings)}")

        # 印出完整 prompt，方便核對所有欄位是否確實嵌入 AI 提示詞
        _log_print(job_id, "=" * 20 + f" 送給 AI 的 LoveLine 回覆提示詞 - {character_name} " + "=" * 20)
        _log_print(job_id, prompt)
        _log_print(job_id, "=" * 20 + " 提示詞結束 " + "=" * 20)

        _log_print(job_id, f">> 正在呼叫 Ollama 產生「{character_name}」的回覆({model_name})...")

        opts = params.get('model_options') or {}
        if 'temperature' not in opts:
            opts['temperature'] = 0.95
        timeStartSec = time.time()
        reply_text = _ollama_with_heartbeat(
            job_id, model_name, prompt, options=opts, time_start=timeStartSec
        )
        duration = int(time.time() - timeStartSec)
        timestamp = time.strftime("%H:%M:%S", time.localtime())
        _log_print(job_id, f"[{timestamp}] 總共花費 {duration} 秒，「{character_name}」的回覆產生完畢！")

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
        _log_print(job_id, f"[ERROR] _run_chat_reply_job failed: {e}")
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
                        "result": job.get("result"),
                        # 供前端「無活動超時」判斷使用（Unix 時間戳，單位：秒）
                        "last_activity": job.get("last_activity", job.get("updated_at", 0))
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
                        "last_activity": time.time(),
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
                locked_chapters   = params.get('locked_chapters', [])  # [{"index":1,"title":"","description":""},...]
                writer_settings   = params.get('writer_settings', {})
                chapter_count     = int(params.get('chapter_count', 16))
                words_per_chapter = int(params.get('words_per_chapter', 400))
                prompt = build_chapters_from_premise_prompt(main_char, book_title, premise, chars[1:], locked_chapters, writer_settings=writer_settings, chapter_count=chapter_count, words_per_chapter=words_per_chapter)
                
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
                    end = _json_bracket_end(repaired_text, start) if start != -1 else -1
                    if start != -1 and end != -1:
                        chapters = json.loads(repaired_text[start:end+1])
                except Exception as e:
                    print(f">> JSON 解析失敗 (嘗試修復後): {e}")
                    print(f">> 顯示原始回傳文字：{response_text}")
                    print(f">> 顯示JSON修正後文字：{repaired_text}")

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
                locked_sections   = params.get('locked_sections', [])  # [{"index":int, "title":str},...]
                writer_settings   = params.get('writer_settings', {})
                section_count     = int(params.get('section_count', 4))
                words_per_section = int(params.get('words_per_section', 500))
                prompt = build_chapter_outline_prompt(
                    main_char, book_title, desc, chars[1:],
                    story_premise=story_premise,
                    all_chapters=all_chapters,
                    chapter_index=chapter_index,
                    locked_sections=locked_sections,
                    writer_settings=writer_settings,
                    section_count=section_count,
                    words_per_section=words_per_section
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
                    end = _json_bracket_end(repaired_text, start) if start != -1 else -1
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
                    print(f">> 顯示原始回傳文字：{response_text}")
                    print(f">> 顯示JSON修正後文字：{repaired_text}")
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
                    
                main_char         = chars[0] if chars else {}
                writer_settings   = params.get('writer_settings', {})
                story_premise     = params.get('story_premise', '')
                words_per_section = int(params.get('words_per_section', 3000))
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
                    story_premise=story_premise,
                    words_per_section=words_per_section
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
                        "last_activity": time.time(),
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
                        "last_activity": time.time(),
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
                        "last_activity": time.time(),
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
                        "last_activity": time.time(),
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
                        "last_activity": time.time(),
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
                        "last_activity": time.time(),
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

            elif self.path == '/api/story_to_bullet_premise_async':
                ############################################################################
                # 非同步：將故事原文轉成條列式故事粗綱（前端可透過 /api/job 輪詢 Log）
                ############################################################################
                job_id = str(uuid.uuid4())
                with JOBS_LOCK:
                    JOBS[job_id] = {
                        "status": "running",
                        "logs": [">> 任務啟動：正在將故事原文轉成條列式故事粗綱..."],
                        "result": None,
                        "created_at": time.time(),
                        "last_activity": time.time(),
                        "updated_at": time.time()
                    }
                threading.Thread(
                    target=_run_story_to_bullet_premise_job,
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
                        "last_activity": time.time(),
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

class _SilentTCPServer(socketserver.ThreadingTCPServer):
    """覆寫 handle_error，靜默過濾瀏覽器主動中止連線的雜訊（ConnectionAbortedError / BrokenPipeError）。"""
    def handle_error(self, request, client_address):
        import sys
        exc = sys.exc_info()[0]
        if exc and issubclass(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return  # 瀏覽器關閉/重整頁面時的正常中斷，不必印出
        super().handle_error(request, client_address)

if __name__ == "__main__":
    for d in ['web', 'characters', 'diaries']: os.makedirs(d, exist_ok=True)
    print(f"Server runs at http://localhost:{PORT}")
    with _SilentTCPServer(("127.0.0.1", PORT), DebugHandler) as httpd:
        try: httpd.serve_forever()
        except KeyboardInterrupt: print("\nStopped.")
