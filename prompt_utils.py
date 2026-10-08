import os
import json
import re
import time
from datetime import datetime

def load_character_from_path(char_path: str) -> dict:
    # 從指定路徑讀取角色卡 JSON 檔案並解析為 dict。
    # 參數 char_path：角色卡 JSON 檔案的完整路徑；若為空字串或路徑不存在，回傳空 dict。
    # 回傳值：角色卡資料的 dict（讀取失敗或路徑無效時為空 dict）。
    if not char_path:
        return {}
    if not os.path.exists(char_path):
        return {}
    with open(char_path, "r", encoding="utf-8") as f:
        return json.load(f)

_CACHED_LOGIC = None

def _parse_character_logic_js():
    #####################################################################################
    # 解析 character_logic.js 檔案，取得星座、血型、MBTI 描述
    # 無參數；回傳值為 dict：{"zodiac": {...}, "blood": {...}, "type": {...}}
    # 內容會快取於全域變數 _CACHED_LOGIC，避免每次呼叫都重新讀檔與解析（提升效能）。
    #####################################################################################
    global _CACHED_LOGIC
    # 已有快取結果則直接回傳，不重複解析檔案
    if _CACHED_LOGIC: return _CACHED_LOGIC
    js_path = os.path.join(os.path.dirname(__file__), 'web', 'js', 'character_logic.js')
    if not os.path.exists(js_path): return {"zodiac": {}, "blood": {}, "type": {}}
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(r'"\s*\+\s*[\r\n]*\s*"', '', content)
    content = re.sub(r'"\s*\+\s*"', '', content)
    zodiac, blood, ptype = {}, {}, {}
    
    m = re.search(r'window\.ZODIAC_DESCRIPTIONS\s*=\s*\{', content)
    if m:
        for km in re.finditer(r'"([^"]+座)":\s*"([^"]+)"', content[m.end():]): 
            zodiac[km.group(1)] = km.group(2)
            if len(zodiac) >= 12: break
            
    m = re.search(r'window\.BLOOD_TYPE_DESCRIPTIONS\s*=\s*\{', content)
    if m:
        for km in re.finditer(r'"([^"]+型)":\s*"([^"]+)"', content[m.end():]):
            blood[km.group(1)] = km.group(2)
            if len(blood) >= 4: break
            
    m = re.search(r'window\.TYPE_MAPPING\s*=\s*\{', content)
    if m:
        sub = content[m.end():]
        end_idx = sub.find('\n};')
        if end_idx != -1: sub = sub[:end_idx]
        for block in re.finditer(r'"([A-Z]-[A-Z]-[A-Z]-[A-Z])":\s*\{(.*?)\}(?=\s*,\s*"[A-Z]|$)', sub, re.DOTALL):
            k, inner = block.group(1), block.group(2)
            ptype[k] = {}
            for period in ["ambiguity", "love", "breakup"]:
                per_m = re.search(period + r':\s*\{\s*name:\s*"([^"]+)",\s*desc:\s*"([^"]+)"', inner)
                if per_m: ptype[k][period] = f"{per_m.group(1)}\n{per_m.group(2)}"

    # ── 額外解析 lpas_v3_types.js 的 TYPE_MAPPING_V3，併入 ptype dict ──
    # V3 鍵格式為 "A-F-O-L"，與 V1 的 "A-O-C-F" 不會衝突（軸 2 集合 {F,S} vs {O,I} 互斥），可共用同一字典。
    # 用「按 V3 鍵頭切片」的方式分割每個 block，避免靠非貪婪 .*? + lookahead 處理巢狀大括號
    # （V3 entry 內含 pairing: {...}、ambiguity: { desc: "..." } 等多層 {}，原 regex 仰賴 backtracking
    # 容易在 desc 字串內含 "A-... 字樣或檔案結尾格式變動時失敗）。
    v3_path = os.path.join(os.path.dirname(__file__), 'web', 'js', 'lpas_v3_types.js')
    if os.path.exists(v3_path):
        with open(v3_path, 'r', encoding='utf-8') as f:
            v3_content = f.read()
        m = re.search(r'window\.TYPE_MAPPING_V3\s*=\s*\{', v3_content)
        if m:
            sub = v3_content[m.end():]
            end_idx = sub.find('\n};')
            if end_idx != -1: sub = sub[:end_idx]
            # 找出每個 V3 鍵頭位置（如 "A-F-O-L":），用相鄰兩個鍵頭夾出 block 內文
            header_re = re.compile(r'"([AP]-[FS]-[OI]-[HL])"\s*:', re.MULTILINE)
            headers = [(mm.group(1), mm.start(), mm.end()) for mm in header_re.finditer(sub)]
            v3_parsed_count = 0
            for i, (k, _, hdr_end) in enumerate(headers):
                # 此 block 內文 = 本鍵頭結束 → 下一鍵頭起點（最後一個 block 取到 sub 末尾）
                inner_end = headers[i + 1][1] if i + 1 < len(headers) else len(sub)
                inner = sub[hdr_end:inner_end]
                ptype.setdefault(k, {})
                name_m = re.search(r'name:\s*"([^"]+)"', inner)
                v3name = name_m.group(1) if name_m else ''
                # V3 每期欄位為 { desc: "..." }（無 name 子鍵），直接抓 desc
                for period in ["ambiguity", "love", "breakup"]:
                    per_m = re.search(period + r':\s*\{\s*desc:\s*"([^"]+)"', inner)
                    if per_m:
                        ptype[k][period] = f"{v3name}\n{per_m.group(1)}"
                v3_parsed_count += 1
            # 隱憂監測：V3 應有 16 型，少於 16 表示解析路徑失效，沉默失敗會讓提示詞少了人格段
            if v3_parsed_count and v3_parsed_count != 16:
                import sys
                print(f"[prompt_utils] WARN: TYPE_MAPPING_V3 解析到 {v3_parsed_count} 型（預期 16），請檢查 lpas_v3_types.js 格式。", file=sys.stderr)

    _CACHED_LOGIC = {"zodiac": zodiac, "blood": blood, "type": ptype}
    return _CACHED_LOGIC

def _enrich_char_data(char_data: dict, relationship_params: dict = None) -> dict:
    #####################################################################################
    # 補充角色資料
    # 參數 char_data：原始角色卡 dict（可能欄位不齊全）
    # 參數 relationship_params：關係狀態參數（如 partner_status 曖昧期/戀愛期/失戀期），用於決定要帶入哪一期的人格描述
    # 回傳值：補齊星座描述、血型描述、年齡、人格描述、身高體重胸圍預設值後的新 dict（不修改原 char_data）
    #####################################################################################
    c = dict(char_data)  # 複製一份，避免直接修改呼叫端傳入的原始 dict
    # 若前端傳入「劇本中的角色名稱」(role_name)，則優先以它取代角色卡名字 (name)。
    # 這樣 prompt 中的「女主角姓名」「配角姓名」與情境比對都會使用劇中名，避免和角色卡演員名混淆。
    role_name = (c.get('role_name') or '').strip() if isinstance(c.get('role_name'), str) else ''
    if role_name:
        c['name'] = role_name
    if 'birthday' in c and not c.get('age'):
        try:
            bd = datetime.strptime(c['birthday'], "%Y-%m-%d")
            today = datetime.now()
            c['age'] = str(today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day)))
        except: pass
    logic = _parse_character_logic_js()
    if 'zodiac' in c and not c.get('zodiac_description'):
        c['zodiac_description'] = logic['zodiac'].get(c['zodiac'], '')
    if 'blood_type' in c and not c.get('blood_type_description'):
        c['blood_type_description'] = logic['blood'].get(c['blood_type'], '')
    
    p_status = (relationship_params or {}).get('partner_status', '戀愛期')
    p_map = {'曖昧期': 'ambiguity', '戀愛期': 'love', '失戀期': 'breakup'}
    p_key = p_map.get(p_status, 'love')
    # 將 4 字代碼正規化成 character_logic.js／lpas_v3_types.js 字典所用的「A-F-O-L」鍵格式。
    # 新格式 lpas_v3 代碼已去除連字號（如 "AFOL"），這裡補回連字號；已含「-」則原樣保留。
    def _to_dashed(code):
        code = (code or '').strip()
        if not code:
            return ''
        return code if '-' in code else '-'.join(list(code))

    # ── LPAS v3 優先：若角色卡含 lpas_v3 結構，直接取該期天候型代碼 ──
    # lpas_v3 = {ambiguity: "AFOL", love: "ASOL", breakup: "PSIH", intimacy: "..."}（新格式無連字號）
    # V3 描述沿用 _parse_character_logic_js 併入的 TYPE_MAPPING_V3（鍵為 "A-F-O-L" 4 軸字串）。
    v3 = c.get('lpas_v3') or {}
    if v3 and not c.get('personality'):
        v3code = _to_dashed(v3.get(p_key) or '')   # 例如 "AFOL" → "A-F-O-L"
        if v3code:
            c['personality'] = logic['type'].get(v3code, {}).get(p_key, "")

    # ── 舊 V1 相容：若仍無 personality，回退解析 personality_type ──
    if not c.get('personality'):
        ptype = c.get('personality_type', '')
        if ptype and '-' in ptype:
            codes = ptype.split('-')[0].split('_')
            if len(codes) == 3:
                idx = 0 if p_key == 'ambiguity' else 1 if p_key == 'love' else 2
                hcode = _to_dashed(codes[idx])
                c['personality'] = logic['type'].get(hcode, {}).get(p_key, "")
    
    # 確保基本屬性有預設值
    if not c.get('height'): c['height'] = "165"
    if not c.get('weight'): c['weight'] = "55"
    if not c.get('bust'):
        c['bust'] = "無" if c.get('gender') == "男" else "C"
    
    return c

def _format_char_context(c_raw, is_main=False, prefix_override=None):
    """
    將角色 JSON 格式化為提示詞用的文字區塊。
    """
    #####################################################################################
    #將角色 JSON 格式化為提示詞用的文字區塊。
    #####################################################################################    
    c = _enrich_char_data(c_raw)
    prefix = prefix_override if prefix_override else ("女主角" if is_main else "")
    
    habits = c.get('habits', [])
    if isinstance(habits, list): habits = ", ".join(habits)
    elif not habits: habits = ""

    return (
        f"{prefix}姓名：{c.get('name', '')}\n"
        f"{prefix}性別：{c.get('gender', '')}\n"
        f"{prefix}年齡：{c.get('age', '')}\n"
        f"{prefix}生日：{c.get('birthday', '')}\n"
        f"{prefix}星座描述：{c.get('zodiac_description', '')}\n"
        f"{prefix}血型描述：{c.get('blood_type_description', '')}\n"
        f"{prefix}愛情個性類型：{c.get('personality_type', '')}\n"
        f"{prefix}愛情個性描述：{c.get('personality', '')}\n"
        f"{prefix}說話口吻：{c.get('speech_style', '')}\n"
        f"{prefix}職業：{c.get('occupation', c.get('position', ''))}\n"
        f"{prefix}習慣/興趣：{habits}\n"
        f"{prefix}外表特徵：{c.get('appearance', '')}\n"
        f"{prefix}身體數據：身高{c.get('height', '')}公分，體重{c.get('weight', '')}公斤，胸圍{c.get('bust', '')}\n"
    )

def _format_writer_context(writer_settings: dict) -> str:
    """
    將知名作家寫作風格與範本格式化為提示詞用的文字區塊。
    """
    #####################################################################################
    #將知名作家寫作風格與範本格式化為提示詞用的文字區塊。
    #####################################################################################
    if not writer_settings:
        return ""
    
    style = writer_settings.get('style')
    sample = writer_settings.get('sample')
    
    res = ""
    if style:
        res += f"\n【知名作家寫作風格參考指令】\n{style}\n"
    if sample:
        res += f"\n【知名作家寫作範本參考】\n{sample}\n"
    return res

def build_analyze_text_character_prompt(text_content: str, target_name: str = "") -> str:
    """建立「從文字分析角色特質並生成角色卡 JSON」的提示詞"""
    #####################################################################################
    #建立「從文字分析角色特質並生成角色卡 JSON」的提示詞
    #####################################################################################
    type_options = (
        "LPAS v3 愛情人格量表（曖昧期 / 熱戀期 / 失戀期 各選一型，親密關係另選一型）：\n"
        "\n"
        "■ 16 天候型（用於 ambiguity 曖昧期、love 熱戀期、breakup 失戀期）\n"
        "  四軸編碼 [A/P]-[F/S]-[O/I]-[H/L]：\n"
        "    軸1 主動(A) vs 被動(P)       軸2 快速(F) vs 緩慢(S)\n"
        "    軸3 外放(O) vs 內斂(I)       軸4 佔有(H) vs 自由(L)\n"
        "  16 種代碼與名稱：\n"
        "    A-F-O-H=海嘯　A-F-O-L=煙火　A-F-I-H=漩渦　A-F-I-L=陣雨\n"
        "    A-S-O-H=岩漿　A-S-O-L=太陽　A-S-I-H=藤蔓　A-S-I-L=燈塔\n"
        "    P-F-O-H=雷雨　P-F-O-L=流星　P-F-I-H=流沙　P-F-I-L=晨露\n"
        "    P-S-O-H=梅雨　P-S-O-L=晚霞　P-S-I-H=深海　P-S-I-L=迷霧\n"
        "\n"
        "■ 4 性象限（用於 intimacy 親密關係，四選一，務必『不含』結尾的「型」字）\n"
        "  深情專一（情感高 × 開放低）：沒有愛，給不出身體；專一且鄭重。\n"
        "  鍾情博愛（情感高 × 開放高）：能愛很多人，但都是真心；誠實不獨佔。\n"
        "  靈肉分離（情感低 × 開放低）：性與愛分離，但行為專一；理性節制。\n"
        "  遊戲人間（情感低 × 開放高）：不執著承諾、享受當下；自由不抓不黏。\n"
    )
    # 組合目標角色指定說明
    target_instruction = ""
    if target_name:
        target_instruction = f"""
【重要指定】
本次只分析「{target_name}」這一個角色。
- 請在文字中找出所有關於「{target_name}」的描述、行為、對話、心理活動。
- 忽略其他角色的資料，所有分析結果必須僅反映「{target_name}」的特質。
- 若文字中未明確提及「{target_name}」的某些特質（如身高），請根據其他資訊合理推估。
"""
    else:
        target_instruction = "\n【注意】文字中若有多位角色，請分析最主要的那一位角色（通常是視角角色或女主角）。\n"

    prompt = f"""你是一位精通角色分析的暢銷愛情小說策劃專家，擅長從文字中剖析人物的性格、情感模式與性心理。
請根據以下文字內容，深度分析其中的角色特質，並生成一份完整的角色卡 JSON。
{target_instruction}
【分析方法】
1. 星座推斷：根據性格行為推斷最符合的星座（牡羊/金牛/雙子/巨蟹/獅子/處女/天秤/天蠍/射手/摩羯/水瓶/雙魚）
2. 血型推斷：根據性格特質推斷血型（A型/B型/AB型/O型）
3. MBTI 推斷：根據性格特質推斷MBTI類型（選擇其中最符合的類型，如INFP、ENFJ等）
4. LPAS v3 分析：分別為「曖昧期」「熱戀期」「失戀期」三個階段各從 16 天候型中選一型（填入 ambiguity / love / breakup），並從 4 性象限中選一型作為「親密關係」（填入 intimacy）。三個時期可以相同或不同；若文字敘述不足，請依角色核心性格合理推斷，不可留空。

{type_options}

【必須輸出標準 JSON，不含任何額外說明文字或 markdown 標記，直接以 {{ 開頭】
{{
  "name": "角色名稱，若無則設「未命名角色」",
  "gender": "根據文字判斷性別，填『男』或『女』，若無明確線索則預設『女』",
  "height": "身高(cm)字串，根據身材描述來判斷，若無則設164",
  "weight": "體重(kg)字串，根據身材描述來判斷，若無則設50",
  "bust": "罩杯字母（A/B/C/D/E/F/G），根據身材描述來判斷，若無則設C；但若角色性別為『男』則必須填『無』",
  "birthday": "YYYY-MM-DD，依推斷星座設定合理日期",
  "zodiac": "XX座",
  "blood_type": "X型",
  "MBTI_type": "推斷的MBTI類型",
  "lpas_v3": {{
    "ambiguity": "曖昧期天候型代碼，格式 A-F-O-L（含三個短橫，務必從上表 16 種代碼中挑一個）",
    "love": "熱戀期天候型代碼，同上格式",
    "breakup": "失戀期天候型代碼，同上格式",
    "intimacy": "親密關係性象限（四選一：深情專一 / 鍾情博愛 / 靈肉分離 / 遊戲人間，不含結尾的「型」字）"
  }},
  "analysis_reasons": "詳細說明星座、血型、MBTI、LPAS v3 四期（曖昧/熱戀/失戀/親密關係）推斷理由，各 100 字以上",
  "speech_style": "說話語氣與口吻，具體描述",
  "occupation": "職業",
  "appearance": "外貌描述，包含臉型、五官、髮型、身材、穿著風格",
  "relationship": "人際關係狀態",
  "habits": ["嗜好1", "嗜好2", "嗜好3"],
  "sexual_personality": {{
    "sexual_sensory": "感官偏好描述，包含視覺、觸覺、聽覺、嗅覺等偏好",
    "sexual_behavior": "性行為偏好，包含前戲、體位、節奏等偏好描述",
    "sexual_motivation": "性動機描述，驅使她進入性關係的深層心理動力",
    "sexual_psychology": "性心理描述，對性的態度、價值觀、禁忌與開放程度",
    "sexual_acceptance_and_taboos": "接受度與禁忌，能接受的性行為範疇與底線"
  }},
  "sexual_analysis_reasons": "基於文字中的感官偏好、性行為模式、性動機、性心理、性接受度與禁忌的分析理由，各100字以上",
  "image_prompt": "中文+英文AI生圖提示詞，描述外貌特徵，適合Stable Diffusion格式"
}}

【待分析文字】
{text_content[:50000]}

【禁止】
1. 禁止使用中文簡體字。

請開始分析並輸出完整 JSON（繁體中文填寫，image_prompt 使用中文+英文）："""
    return prompt


def build_analyze_image_prompt_text() -> str:
    """建立「從圖片分析外貌並生成 AI 生圖提示詞」的提示詞"""
    #####################################################################################
    #建立「從圖片分析外貌並生成 AI 生圖提示詞」的提示詞
    #####################################################################################
    return (
        "你是一位專業的 AI 圖像生成提示詞工程師。請仔細觀察圖片中的人物，"
        "生成一段適用於 Stable Diffusion / ComfyUI 的中文+英文提示詞。\n\n"
        "【分析重點】\n"
        "1. 年齡外觀 2. 種族特徵 3. 臉型與五官 4. 髮型髮色\n"
        "5. 身材比例 6. 服裝風格 7. 表情神態 8. 環境背景\n\n"
        "【輸出要求】\n"
        "- 僅輸出中文+英文提示詞字串，不含任何說明或 JSON 標記\n"
        "- 逗號分隔的描述詞組，從最重要特徵開始\n"
        "- 範例：一位令人驚豔的22歲日本女性，心形臉，炯炯有神的眼睛，烏黑的長捲髮，休閒的白色連身裙，身材纖細，笑容溫暖，柔和的自然光線。"
        "A stunning 22-year-old Japanese woman, heart-shaped face with large "
        "expressive eyes, long black wavy hair, wearing a casual white dress, "
        "slender figure, warm smile, soft natural lighting\n\n"
        "請直接輸出提示詞："
    )

def build_chat_reply_prompt(char_data, char_name, user_name, user_message, history,
                            persona_override="", session_extra="",
                            user_char_data=None, user_persona_override="", user_extra="",
                            session_type="one_on_one", other_participants=None, writer_settings: dict = None):
    """
    建立 LoveLine 聊天的提示詞，支援使用者資料與進階覆寫。
    """
    #####################################################################################
    # 建立 LoveLine 聊天的提示詞，支援使用者資料與進階覆寫。
    # 參數說明：
    #   char_data            ：AI 扮演角色的角色卡 dict
    #   char_name            ：AI 扮演角色的顯示名稱
    #   user_name            ：使用者顯示名稱
    #   user_message         ：使用者本次傳送的訊息內容
    #   history              ：對話歷史紀錄列表，每筆為 {"name":..., "content":...}
    #   persona_override     ：本次對話特定的人設覆寫文字（優先權高於角色卡）
    #   session_extra        ：本次對話的額外補充設定
    #   user_char_data       ：使用者自己的角色卡 dict（選填）
    #   user_persona_override：使用者特質的覆寫文字
    #   user_extra           ：關於使用者的額外補充資訊
    #   session_type         ：對話類型，"one_on_one"（一對一）或 "group"（群組）
    #   other_participants   ：群組聊天時的其他參與者列表
    #   writer_settings      ：知名作家寫作風格/範本設定（選填）
    # 回傳值：組合完成、可直接送給 LLM 的完整提示詞字串
    #####################################################################################
    # --- 1. 處理目標角色 (AI) 的資料 ---
    target_char = dict(char_data)
    timestamp = time.strftime("%Y年 %m月 %d日 %H時 %M分 %S秒", time.localtime())
    # 關鍵字覆蓋邏輯 (簡易實作：如果在 persona_override 看到特定關鍵字就替換)
    for key in ['生日', '血型', '星座', '年齡', '職業', '性格']:
        if persona_override and f"{key}:" in persona_override:
            # 這裡只是一個邏輯標記，實際 Prompt 會包含 persona_override 讓 AI 自己理解
            pass

    # 取得完整的角色背景與屬性
    char_desc = _format_char_context(target_char, prefix_override="")
    
    # 對話特定的覆寫 (Persona/Persona Override)
    if persona_override:
        char_desc += f"\n【對話特定設定 (優先)】：\n{persona_override}"
    
    # 對話特定的額外補充
    if session_extra:
        char_desc += f"\n【對話額外補充】：\n{session_extra}"

    # --- 2. 處理使用者 (User) 的資料 ---
    user_desc_parts = [f"使用者姓名：{user_name}"]
    if user_persona_override:
        user_desc_parts.append(f"使用者特質：{user_persona_override}")
    # 將使用者角色卡完整資訊（外貌、背景、性格、習慣等所有欄位）以同樣格式輸出
    # 之前只取 personality / personality_description 兩個欄位，導致大部分資料未送給 AI
    if user_char_data and isinstance(user_char_data, dict) and user_char_data:
        user_card_text = _format_char_context(user_char_data, prefix_override="")
        if user_card_text:
            user_desc_parts.append(f"【使用者角色卡完整資料】：\n{user_card_text}")
    if user_extra:
        user_desc_parts.append(f"【關於使用者的額外資訊】：\n{user_extra}")
    
    user_context = "\n".join(user_desc_parts)

    # 群組資訊與其它參與者資料
    group_context = ""
    if session_type == "group" and other_participants:
        other_infos = []
        for p in other_participants:
            p_name = p.get('name', '參與者')
            p_card = p.get('card_json')
            if p_card and isinstance(p_card, dict) and p_card:
                info = _format_char_context(p_card, prefix_override="")
                other_infos.append(f"--- 參與者: {p_name} ---\n{info}")
            else:
                other_infos.append(f"姓名: {p_name}")
        
        group_context = "\n【群組聊天室成員設定】\n這是一個群組聊天室。除了你和 " + user_name + " 之外，參與者還有：\n" + "\n".join(other_infos)
    elif session_type == "one_on_one":
        group_context = f"\n當前環境：這是一對一私人聊天。"
    
    writer_context = _format_writer_context(writer_settings)

    # 歷史紀錄轉文字
    history_text = ""
    for h in history[-15:]:
        name = h.get('name', '未知')
        content = h.get('content', '')
        history_text += f"{name}: {content}\n"

    prompt = f"""你現在要扮演「{char_name}」這個角色，在通訊軟體 LoveLine 上與 {user_name} 進行即時對話。

【你的角色設定】
{char_desc}
{group_context}
{writer_context}

【關於 {user_name} 的資訊】
{user_context}

【之前的對話紀錄】
{history_text}

【使用者或其他角色的提問】
【**重要指令**】請根據以下提問來回覆。
{user_name}: {user_message}

【對話規則】
1. 回答語氣要完全符合角色的年齡跟性格，說話口吻要符合設定。
2. 依照使用者與你的關係來調整你的互動方式。
3. 直接回答使用者的提問。
4. 現在時間是{timestamp}，請根據目前時間來回答或主動聊天。
5. 這是通訊軟體，回應應簡短自然（1~3 句話為主），偶爾可以使用表情符號。
6. 你的回覆對象是 {user_name}。
7. **絕對不要**以「{char_name}:」作為開頭，直接輸出對話內容即可。

【絕對禁止】
1. 絕對禁止重複你自己的上一次回覆。
2. 禁止重複回答相同的意見。
3. 禁止迴避使用者的提問，必須針對提問回答。
4. 禁止用括號()或符號[]來形容自己現在動作、表情與眼神。這是聊天，不是寫小說。
5. 禁止換行與空白行。
6. 禁止用**簡體中文**回覆。

"""
    
    return prompt.strip()



def build_daily_prompt(char_data: dict, scenario: str, relationship_params: dict = None, other_chars: list = None, writer_settings: dict = None, time_context: str = "", past_diaries_context: str = "") -> str:
    """建立「日記生成」的完整提示詞 (包含系統提示與當日情境/關係動態)"""
    #####################################################################################
    #建立「日記生成」的完整提示詞 (包含系統提示與當日情境/關係動態)
    #####################################################################################
    char_data = _enrich_char_data(char_data, relationship_params)
    current_personality = char_data.get('personality', '')
        
    habits = char_data.get("habits", []) or []
    timestamp = time.strftime("%Y年 %m月 %d日 %H時", time.localtime())

    #1. 處理閨密/其他角色資料
    other_context = ""
    if other_chars and len(other_chars) > 0:
        other_lines = []
        count = 1
        for c in other_chars:
            # 優先用劇本中的角色名稱（role_name）做比對，無則退回角色卡名字
            c_name = (c.get('role_name') or c.get('name') or '').strip()
            # 當設定情境 (Scenario) 欄位有提到該位閨密名字時，才加入
            if c_name and c_name in scenario:
                other_lines.append("【第" + str(count) + "位配角資料】：\n" + _format_char_context(c))
                count += 1
        if other_lines:
            other_context = "\n" + "\n\n".join(other_lines)

    # 2. 增加關係動態 (Relationship Dynamics)
    rel_context = ""
    if relationship_params:
        pa = relationship_params.get('partner_status', '無')
        fA = relationship_params.get('friend_a_status', '無')
        fB = relationship_params.get('friend_b_status', '無')
        others_occupied = relationship_params.get('others_occupied', False)

        if pa == '無':
            rel_context = "- 女主目前沒有伴侶。\n"
        elif pa == '曖昧期':
            rel_context = f"- 女主與對象處於曖昧階段\n"
        elif pa == '戀愛期':
            rel_context = f"- 女主與交往的伴侶處於戀愛階段\n"
        elif pa == '失戀期':
            rel_context = f"- 女主與伴侶分手了，正處於失戀狀況\n"

        if fA != '無':
            rel_context += f"- 與新朋友 A 處於{fA}\n"
        if fB != '無':
            rel_context += f"- 與新朋友 B 處於{fB}\n"
        
        if others_occupied:
            rel_context += "- 注意：女主心儀的對象（伴侶或新朋友）似乎已經另有對象了，這讓女主感到極度不安、競爭感或罪惡感。\n"

        logic_hints = []
        if pa == '戀愛期' and (fA == '曖昧期' and fB == '曖昧期'):
            logic_hints.append("女主正處於穩定戀愛中，卻與多位新朋友產生了曖昧情愫。顯然是想要離開男友，另尋新戀情，內心充滿了對男友的厭倦，對新戀情的期待與背德感的拉扯。")
        elif pa == '戀愛期' and (fA == '曖昧期' or fB == '曖昧期'):
            logic_hints.append("女主正處於穩定戀愛中，卻與新朋友產生了曖昧情愫。內心充滿了新鮮感與背德感的拉扯。")
        elif pa == '戀愛期' and (fA == '戀愛期' and fB == '戀愛期'):
            logic_hints.append("女主劈腿了。她同時與多人進行戀愛，顯然是個綠茶婊，享受被多人追捧的快感，必須在日記中呈現這種腳踏多條船的多重心理負擔與刺激。")
        elif pa == '戀愛期' and (fA == '戀愛期' or fB == '戀愛期'):
            logic_hints.append("女主劈腿了。她同時與兩個人進行戀愛，必須在日記中呈現這種出軌的心理負擔與刺激感，懺悔的同時又無法自拔。")
        elif pa == '失戀期' and (fA == '戀愛期' or fA == '曖昧期'):
            logic_hints.append("女主剛經歷失戀的痛苦，但新對象的出現讓她開始考慮接受下一段感情。")
        elif pa == '曖昧期' and (fA == '曖昧期' or fB == '曖昧期'):
            logic_hints.append("女主同時與多位對象處於曖昧期，她在多方之間比較、徘徊，享受這種被包圍的氛圍。")
        
        if others_occupied:
            logic_hints.append("加上『對方已有對象』的設定，故事應強調女主作為第三者的驕傲感、或成為競爭者的必勝心態、或擔憂被拒絕的失落感、或眾人指責的罪惡感。")

        if logic_hints:
            rel_context += "- 心理狀態指引：" + " ".join(logic_hints) + "\n"
    # 建立final_scenario 關於主介面上勾選女主與其他男生關係、三則過往日記、時間日期、設定情境 (Scenario) 的內容
    final_scenario = ""
    if rel_context:
        final_scenario += f"【女主角的複雜關係與心理狀態說明】：\n{rel_context}\n"
    if past_diaries_context:
        final_scenario += f"\n{past_diaries_context}\n"
    final_scenario += f"【重點日誌與情境設定】\n{scenario}\n"
    if time_context:
        final_scenario += f"【重要指令】：你的唯一任務是撰寫今天 {time_context} 的日記。"


    system_prompt = f"""
你是一位熱愛以日記來記錄生活的女人，擅長撰寫一段自然、有趣、具真實感的內心想法，請代入以下角色的靈魂寫日記。
【核心指令】
1. 以沉浸在戀愛氛圍的女性視角，在睡前，隨手寫下當天發生的令她難忘的一段經歷或關鍵想法。
2. 日記主題以戀愛為主，也可以包括且不限於：交友、閨蜜、性生活、出軌、一夜情、生理需求、心理撫慰、工作、上課、辦公室戀情 、家庭、亂倫、暴力、身心靈、健康、運動、娛樂、旅行等，沒有特定的要求或限制。
3. 若女主角同時擁有伴侶與新朋友，請重點描述三角戀的複雜情感、內心掙扎、性幻想、性愛過程與罪惡感等內容。
4. 每篇日記撰寫1~2個重點，集中焦點，字數約 300 字，使用「繁體中文」(Traditional Chinese)。
5. 無須思考，直接輸出日記內容。

【日記本人設定】

{_format_char_context(char_data, is_main=True)}
本人目前的戀愛關係：{char_data.get('relationship', '')}

【其他配角角色設定】{other_context}

{final_scenario}

【輸出格式】
第一行請寫 "{char_data.get('name', '')} 的日記 {time_context}"
日記內容...

【寫作技巧】
1. 貼近日記本人的思維: 以符合日記本人基本資訊、年齡、身高、體重、穿著風格、性格特徵、職業、興趣和情境來表達，呈現真實的說話用語、語氣、生活習慣。
2. 增加愛情成分: 凸顯主角在愛情中的起伏情緒，增加私密肢體接觸的描述。
3. 運用有趣的故事: 將主角與一些有趣的人物或場景相結合，增加日記的趣味性和互動性。
4. 故意添加本人犯錯、缺點、愚蠢與不足。
5. 描述感受和情緒: 使用感官詞來描述女生在日常生活中的感受和情緒。讓角色更有感度，並吸引讀者的注意力。
6. 加入譴責對方與自我安慰: 當女主角在抒發強烈情緒時，請直白表達情緒用語，甚至以激烈的發洩式的口吻來描述，可以讓日記更有深度和真實感。
7. 遵循日記風格和形式: 用簡短字數紀錄生活、表達看法、抒發情緒，無須完整記錄事件經過。無須講究文法結構。

{_format_writer_context(writer_settings)}

【禁止】
1. 流水帳或商業文件或教科書的文體。
2. 禁止以"我"跟"你"字開頭。
3. 禁止使用中文簡體字。

""".strip()

    return f"{system_prompt}\n\n請開始執行（以繁體中文撰寫）："


def build_story_to_bullet_premise_prompt(text_content: str, chapter_count: int = 8, words_per_chapter: int = 400) -> str:
    """建立「將故事原文轉換成條列式故事粗綱」的提示詞。

    與 build_story_to_premise_prompt 的差異：
    - 輸出採用條列(*) 格式，最精簡的關鍵資訊。
    - 每個事件除了原故事走向之外，必須額外給出兩種「AI 自行發展」的可能劇情走向，
      讓後續 AI 撰寫故事大綱時能擇一發展，創造戲劇化轉變。
    - 目的：讓後續 AI 不被原故事細節綁住，能自由發展更多可能性。
    """
    #####################################################################################
    # 建立「將故事原文轉換成條列式故事粗綱」的提示詞
    #####################################################################################
    prompt = f"""你是一位頂尖的小說策劃編輯與故事拆解專家，擅長把長篇故事拆解成最精簡的「條列式」骨架，讓後續創作者能自由發揮、發展出更多戲劇化的可能性。
請閱讀以下故事原文，依照「起、承、轉、合」四大結構，將整個故事濃縮成「條列式」的故事粗綱。

【核心目的】
- 依照原故事來拆解出「起、承、轉、合」四大結構，並各自分析其中的核心情感與關鍵角色動機。
- 不要重述原故事的劇情細節，只保留最關鍵、最能感動人心的「人、事、時、地、物」的核心元素。
- 在「關鍵事件」中除了原故事的劇情走向之外，必須再額外發想「兩種」由 AI 自行發展、且戲劇化轉變的替代劇情走向，讓後續 AI 撰寫大綱時能自行擇一發展。
- AI 構思走向(替代劇情)必須以原劇情的「核心情感、關鍵角色動機、關鍵物品、關鍵地點、關鍵時間」為基礎(情理之中)，根據角色個性特質去做出重大改變(意料之外)，以創造戲劇化轉變。

【整體章數】
依照原故事的長度與複雜度將故事分成 {chapter_count} 章，依「起、承、轉、合」分配比例：
- 起 約佔 25%
- 承 約佔 30%
- 轉 約佔 30%
- 合 約佔 15%


【輸出格式規定】
請嚴格依照以下格式輸出，所有內容使用繁體中文：

女主角：姓名、樣貌、穿著、個性、核心信念、動機、目標、行為。
男主角：姓名、樣貌、穿著、個性、核心信念、動機、目標、行為。
女配角：姓名（若有）、樣貌、個性、與主角的關係、動機、目標、行為。
男配角：姓名（若有）、樣貌、個性、與主角的關係、動機、目標、行為。
反派女角色：姓名（若有）、樣貌、動機、目的、行為（若無反派女角色則略去此行）。
反派男角色：姓名（若有）、樣貌、動機、目的、行為（若無反派男角色則略去此行）。
其他角色：其餘重要角色簡短描述（若無則略去此段）。
AI建議的多位配角：與主角的關係、動機、目標、核心信念、行為與情緒描述。(補充原故事的不足)

故事背景：故事發生的年代、地點、社會背景說明（約300字）。

【每章輸出格式（嚴格遵守，全部使用「*」條列）】
每章字數約 {words_per_chapter} 字。格式如下：

第X章：（章節標題）
* 本章粗綱內容。(至少150字)
* 男主角XXX：動機、目標、核心信念、行為與情緒描述。
* 女主角XXX：動機、目標、核心信念、行為與情緒描述。
* 配角XXX：動機、目標、核心信念、行為與情緒描述。（其他角色一一條列；若無可省略）
* 關鍵事件1：事件緣由。
    - 原故事走向：……
    - AI 構思走向A（某角色做出了戲劇化決定）：……
    - AI 構思走向B（某角色做出了戲劇化決定）：……
* 關鍵事件2：事件緣由。
    - 原故事走向：……
    - AI 構思走向A（某角色做出了戲劇化決定）：……
    - AI 構思走向B（某角色做出了戲劇化決定）：……
* 關鍵事件3：事件緣由。
    - 原故事走向：……
    - AI 構思走向A（某角色做出了戲劇化決定）：……
    - AI 構思走向B（某角色做出了戲劇化決定）：……
* 關鍵物品：物品名稱在劇情中的象徵或功能。
* 關鍵時間：本章發生的時間點與事件有密切關聯。
* 關鍵地點／環境：本章發生的地點、氛圍與事件有密切關聯。
* 隱喻或伏筆：本章有任何隱喻或伏筆需注意。
* 一句話說出本章的重點。
* 缺失：本章缺乏或遺漏了哪些重點？
* 其他補充：你認為對後續創作有幫助的任何條列項目（隱喻、伏筆、情感張力、感官細節等）。

【撰寫規則】
1. 全部以「*」開頭的條列項目呈現，子項目以「    -」縮排條列，禁止寫成段落式敘述。
2. 文字精簡、訊息密度高，每項條列盡量在一行內表達完整意思。
3. 角色描述只保留行為與情緒「動機」，不寫具體對白、不寫具體場景細節。
4. 「AI 替代走向」必須與「原故事走向」明顯不同，且要能合理銜接前後章，並具備戲劇張力。(情理之中，意料之外)
5. 必須保留原著的核心情感主軸（例如：愛情、復仇、救贖、失落等），但允許替代走向改變結局方向。
6. 不寫流水帳，不複述原文台詞，不引用原文段落。

【禁止】
1. 禁止使用中文簡體字。
2. 禁止寫成完整段落式粗綱（這是另一個按鈕的工作）。
3. 禁止省略「AI 替代走向A／B」這兩個子項目。

【故事原文】
{text_content[:50000]}

請開始輸出「條列式故事粗綱」（繁體中文，全部使用 * 條列）："""
    return prompt



def build_story_to_premise_prompt(text_content: str, chapter_count: int = 8, words_per_chapter: int = 200) -> str:
    """建立「將故事原文濃縮成故事粗綱」的提示詞"""
    #####################################################################################
    # 建立「將故事原文濃縮成故事粗綱」的提示詞
    #####################################################################################
    prompt = f"""你是一位頂尖的小說策劃編輯，擅長解析故事結構並濃縮成精煉的故事粗綱。
請閱讀以下故事原文，將整個故事濃縮成故事粗綱，讓讀者在短時間內能掌握完整故事的架構與關鍵劇情。

【輸出格式規定】
請嚴格依照以下格式輸出，所有內容使用繁體中文：

女主角：姓名、樣貌、穿著、個性、核心信念、動機、目標、行為。
男主角：姓名、樣貌、穿著、個性、核心信念、動機、目標、行為。
女配角：姓名（若有）、樣貌、個性、與主角的關係、動機、目標、行為。
男配角：姓名（若有）、樣貌、個性、與主角的關係、動機、目標、行為。
反派女角色：姓名（若有）、樣貌、動機、目的、行為（若無反派女角色則略去此行）。
反派男角色：姓名（若有）、樣貌、動機、目的、行為（若無反派男角色則略去此行）。
其他角色：其餘重要角色簡短描述（若無則略去此段）。

故事背景：故事發生的年代、地點、社會背景說明（約200字）。

【故事粗綱】
依照「起、承、轉、合」四大結構，根據原故事的長度與複雜度將故事分成 {chapter_count} 章。
每章格式如下（每章粗綱約 {words_per_chapter} 字，著重本章主旨與關鍵劇情）：

第一章：（章節標題）
（本章粗綱，約{words_per_chapter}字）
本章粗綱內容。(至少三個要點，每個要點至少100字)
關鍵情節中的角色們的動機與目標。
關鍵情節中的角色們的關係分析。
關鍵的物品或時間點對主角們的影響分析。
AI建議的劇情轉變或補充分析。

第二章：（章節標題）
（本章粗綱，約{words_per_chapter}字）
本章粗綱內容。(至少三個要點，每個要點至少100字)
關鍵情節中的角色關係。
關鍵的物品或時間點對主角們的影響。
AI建議的劇情轉變或補充。

…（依此類推，直到故事結尾）

【注意事項】
- 起（約佔章節數的 25%）：故事開端，人物登場，背景鋪墊，衝突萌生。
- 承（約佔章節數的 30%）：事件發展，人物關係深化，矛盾逐步升溫。
- 轉（約佔章節數的 30%）：關鍵轉折，最大衝突爆發，情緒最高點。
- 合（約佔章節數的 15%）：問題解決，人物成長，故事收尾。
- 保持原著的核心情感與關鍵劇情，不添加原著沒有的內容。
- 若原著有特殊結局（如悲劇、開放式結局），請如實保留。

【故事原文】
{text_content[:50000]}

【禁止】
1. 禁止使用中文簡體字。

請開始輸出故事粗綱："""
    return prompt





def build_chapters_from_premise_prompt(char_data: dict, book_title: str, story_premise: str, other_chars: list = None,
                                       locked_chapters: list = None, writer_settings: dict = None,
                                       chapter_count: int = 16, words_per_chapter: int = 400) -> str:
    """建立「根據故事粗綱生成各章標題與描述」的提示詞

    Args:
        locked_chapters: 已上鎖的章節清單，每個元素為 {"index": int(1-based), "title": str, "description": str}
        chapter_count: 建議生成的章節數量
        words_per_chapter: 每章描述的建議字數
    """
    #####################################################################################
    #建立「根據粗綱生成各章標題與章描述」的提示詞
    #####################################################################################    
    char_data = _enrich_char_data(char_data, {"partner_status": "戀愛期"})

    # 處理閨密/其他角色資料
    other_context = ""
    if other_chars and len(other_chars) > 0:
        other_lines = []
        for c in other_chars:
            if c.get('name'):
                other_lines.append(_format_char_context(c))
        if other_lines:
            other_context = "\n【其他配角角色設定】\n" + "\n\n".join(other_lines)

    # 組建「已上鎖章節」說明段落
    locked_context = ""
    if locked_chapters:
        lines = []
        for lc in locked_chapters:
            idx = lc.get('index', '?')
            t   = lc.get('title', '')
            d   = lc.get('description', '')
            lines.append(f"  第{idx}章（已固定）：{t}\n    描述：{d}")
        locked_context = "\n【已固定章節（禁止更動）】\n以下章節內容已由作者確定，規劃時必須嚴格銜接：\n" + "\n".join(lines)

    system_prompt = f"""
你是一位金牌小說策劃與總編。請根據以下【主角設定】與【故事粗綱】，為這部名為《{book_title}》的小說規劃出各章的標題與章的描述。

【指令】
1. 根據粗綱描述，請規劃 {chapter_count} 章。
2. 每個章需要有「章的標題」與「章的描述（約{words_per_chapter}字，交代本章重點）」。
3. 每個項目是一個包含 "title" 與 "description" 的物件。
4. **必須**回傳標準的 JSON 格式列表，不可遺漏任何標示符號。
5. 不要有任何額外前言、後記或 Markdown 區塊。
6. 若存在「已固定章節」，必須嚴格銜接其前後劇情，不可改變固定章節的內容。

【寫作技巧】
1. 參考並分析【故事粗綱】的故事背景、角色設定、角色動機、目標、行為描述與關鍵的物品與時間點，解析出本章的核心重點，並銜接上下章的劇情。
2. 針對【故事粗綱】的每一個要點，都必須詳細補充符合劇情的明確的角色動機、目標、具體行為、事件、地點、關鍵物品。
3. 章描述的重點在於根據上述分析來轉換成每一位角色的實際行動與關鍵對話，並善於安排其他角色的戲份，創造出多角關係，讓故事更精彩。
4. 要以角色個性與創意優先，讓角色個性與創意來推動故事架構與推進劇情發展。劇情要出乎意料但又在情理之中，符合長篇小說的起承轉合。
5. 每一章都要有關鍵的轉折劇情，且具有張力與懸念，勾引讀者繼續閱讀的慾望。
6. 在【故事粗綱】之中有提到包含 `《XXX》` 關鍵字的句子，請特別為此關鍵字內容，以條列 1. 2. 3. ...方式，發想多個能夠強力推動劇情或合理化劇情的內容。
7. 標題要吸引人，讓大腦產生驚嘆號與問號。
8. 章描述的結尾要明確寫出本章的能夠吸引讀者繼續閱讀的懸念重點。

【禁止】
1. 禁止過度講究合理性與邏輯，人生本來就是一件很混亂的事情，不合邏輯才是真實的。
2. 禁止劇情被道德感框架約束。要寫出人性的黑暗面，以及在感情中的自私與矛盾。
3. 禁止塑造出完美形象的角色，每個人都是有罪且不完美的。
4. 禁止以"某人"、"某物"、"突發事件"、"特定區域"、"某種"、"另一個"這一類模糊的詞語來描述劇情。必須有明確的事件、明確的地點、明確的角色動作、明確的關鍵物品。否則會讓讀者覺得毫無代入感。

【範例格式】
[
  {{"title": "第一章：標題文字", "description": "本章大綱描述...。本章包含 `《XXX》` 的關鍵字與吸引讀者繼續閱讀的懸念重點。"}},
  {{"title": "第二章：標題文字", "description": "本章大綱描述...。本章包含 `《XXX》` 的關鍵字與吸引讀者繼續閱讀的懸念重點。"}},
  {{"title": "第三章：標題文字", "description": "本章大綱描述...。本章包含 `《XXX》` 的關鍵字與吸引讀者繼續閱讀的懸念重點。"}},
  {{"title": "第四章：標題文字", "description": "本章大綱描述...。本章包含 `《XXX》` 的關鍵字與吸引讀者繼續閱讀的懸念重點。"}}
]

【故事粗綱】
{story_premise}
{locked_context}

【角色設定】
{_format_char_context(char_data, is_main=True)}
目前關係：{char_data.get('relationship', '')}
{other_context}
{_format_writer_context(writer_settings)}

""".strip()

    return f"{system_prompt}\n\n請開始規劃（以繁體中文）："

def build_chapter_outline_prompt(char_data: dict, book_title: str, outline_desc: str, other_chars: list = None,
                                  story_premise: str = "", all_chapters: list = None, chapter_index: int = 0,
                                  locked_sections: list = None, writer_settings: dict = None,
                                  section_count: int = 4, words_per_section: int = 500) -> str:
    """根據章的標題與描述來建立「各小節大綱」的完整提示詞

    Args:
        story_premise     : 完整故事粗綱
        all_chapters      : 全部章節清單，每個元素為 {"title": str, "description": str}
        chapter_index     : 目前章節的 0-based 索引
        section_count     : 建議生成的小節數量
        words_per_section : 每小節描述的建議字數
    """
    #####################################################################################
    # 根據章的標題與描述來建立「各小節大綱」的完整提示詞
    #####################################################################################
    char_data = _enrich_char_data(char_data, {"partner_status": "戀愛期"})

    # 處理閨密/其他角色資料
    other_context = ""
    if other_chars and len(other_chars) > 0:
        other_lines = []
        for c in other_chars:
            if c.get('name'):
                other_lines.append(_format_char_context(c))
        if other_lines:
            other_context = "\n【其他配角角色設定】\n" + "\n\n".join(other_lines)

    # 組建全部章節一覽
    total_chapters = len(all_chapters) if all_chapters else 0
    current_ch_num = chapter_index + 1  # 1-based

    chapters_overview = ""
    if all_chapters:
        lines = []
        for i, ch in enumerate(all_chapters):
            num = i + 1
            marker = ""
            if num == current_ch_num:
                marker = "  ← 【目前正在規劃本章小節】"
            elif num == 1:
                marker = "  （第一章・開頭）"
            elif num == total_chapters:
                marker = "  （最後一章・結局）"
            lock_tag = "🔒" if ch.get('locked') else ""
            lines.append(f"  第{num}章{lock_tag}：{ch.get('title','')}　描述：{ch.get('description','')} {marker}")
        chapters_overview = "\n".join(lines)

    # 組建已鎖定小節說明（AI 必須跳過這些槽位）
    locked_sections_context = ""
    if locked_sections:
        ls_lines = []
        for ls in locked_sections:
            ls_lines.append(f"  第{ls.get('index','?')}節（已鎖定，不可修改）：{ls.get('title','')}")
        locked_sections_context = "\n【本章已鎖定的小節（禁止更動，規劃其他節時必須銅接）】\n" + "\n".join(ls_lines)

    # 開頭/結尾特殊提示
    position_hint = ""
    if total_chapters > 0:
        if current_ch_num == 1:
            position_hint = "\n⚠️ 本章是全書的【第一章・開頭】，請以吸引讀者的開場白鋪墊故事世界觀與主角形象。"
        elif current_ch_num == total_chapters:
            position_hint = "\n⚠️ 本章是全書的【最後一章・結局】，請安排合適的收尾與情感昇華，給讀者滿足感或深刻的餘韻。"

    system_prompt = f"""
你是一位金牌小說作者與專業編輯。請根據上述資訊與以下規格，為《{book_title}》第{current_ch_num}章規劃出 {section_count} 個小節。
{position_hint}

【指令】
1. 請根據目前『章描述』的場景分割數量或核心重點數量，來規劃出 {section_count} 個小節，並為每個小節提供小節描述(大綱)，字數約{words_per_section}字。
2. **必須**回傳標準的 JSON 格式列表，每個項目包含標題與大綱，合併成單一字串。
3. 不要有任何額外前言、後記或 Markdown 區塊。

範例格式：
[
  {{"第一節：標題文字...(關鍵小節或次要小節)...。大綱內容描述..."}},
  {{"第二節：標題文字...(關鍵小節或次要小節)...。大綱內容描述..."}},
  {{"第三節：標題文字...(關鍵小節或次要小節)...。大綱內容描述..."}}
]

【寫作技巧】
1. 依照「章描述」之中的關鍵劇情重點或不同的場景來拆分成多個的「關鍵小節」與「次要小節」。
2. 小節的標題文字直接寫出每一位角色在此節的目標。
3. 小節的大綱內容主要是寫出每一位角色在此節的具體行動內容，包含能夠主導劇情轉折發展的關鍵對話、關鍵動作與內心想法。
4. 在「章描述」之中有提到包含「(請構思)」的句子，請特別為此句內容以條列 1. 2. 3. ...方式，發想多個能夠強力推動劇情或合理化劇情的內容。
5. 必須與前後小節的劇情銜接，保持故事連貫性。
6. 關鍵小節的內容必須能凸顯本章關鍵重點並推動劇情發展，要說明原因與行為。
7. 次要小節的內容可以用來解決劇情矛盾，讓劇情合理化，豐富劇情或增加張力。

【故事粗綱】
{story_premise if story_premise else '（未提供）'}

【全書章節一覽】
{chapters_overview if chapters_overview else '（未提供）'}
{locked_sections_context}

【角色設定】
{_format_char_context(char_data, is_main=True)}
目前關係：{char_data.get('relationship', '')}
{other_context}
{_format_writer_context(writer_settings)}

【禁止】
1. 禁止使用中文簡體字。
2. 禁止文青式內心獨白與第三人稱說教式內容。
3. 禁止寫流水帳交代劇情。

""".strip()

    user_input = f"請為第{current_ch_num}章『{outline_desc}』撰寫本章的各小節大綱。"
    return f"{system_prompt}\n\n【當前任務/情境】\n{user_input}\n\n請開始執行（以繁體中文）："

def build_novel_content_prompt(char_data: dict, current_chapter: str, chapter_outline: str, section_title: str,
                                other_chars: list = None, writer_settings: dict = None,
                                chapter_index: int = 0, section_index: int = 0,
                                prev_section_title: str = "", prev_section_content: str = "",
                                next_section_title: str = "", next_section_locked: bool = False,
                                story_premise: str = "", words_per_section: int = 3000) -> str:
    """建立「小說本文生成」的完整提示詞"""
    #####################################################################################
    #建立「小說本文生成」的完整提示詞
    #####################################################################################
    char_data = _enrich_char_data(char_data, {"partner_status": "戀愛期"})

    # 處理其他角色資料
    other_context = ""
    if other_chars and len(other_chars) > 0:
        other_lines = []
        for c in other_chars:
            if c.get('name'):
                other_lines.append(_format_char_context(c))
        if other_lines:
            other_context = "\n【其他配角角色設定】\n" + "\n\n".join(other_lines)

    # 上一節銜接說明
    prev_context = ""
    if prev_section_title:
        prev_context = f"\n【上一節銜接】\n上一節標題：{prev_section_title}\n"
        if prev_section_content and prev_section_content.strip():
            # 只取最後約 900 字，避免 prompt 過長
            snippet = prev_section_content.strip()[-900:]
            prev_context += f"上一節結尾片段（請自然銜接此後的劇情，勿重複）：\n「...{snippet}」\n"
        else:
            prev_context += "（上一節尚未生成內容，請自行根據大綱銜接）\n"

    # 下一節預告說明
    next_context = ""
    if next_section_title:
        lock_note = "（已鎖定，本節結尾必須為下一節鋪陳）" if next_section_locked else "（下一節）"
        next_context = f"\n【下一節預告】{lock_note}\n下一節標題：{next_section_title}\n請在本節結尾自然引導至下一節的開頭，埋下伏筆。\n"

    system_prompt = f"""
你現在是獲獎無數的小說作家。請根據以下情境與完整的角色設定，撰寫小說正文。

【寫作指令】
1. 注重肢體動作與對話來呈現角色思維與角色之間的互動。
2. 字數約 {words_per_section} 字，使用「繁體中文」。
3. 對話必須完全符合角色身份與個性的「說話口吻」。
4. 請直接開始撰寫故事，不要輸出標題或任何前言。
5. 本節為【第 {chapter_index} 章 第 {section_index} 節】，請確保與上下節情節連貫。

【寫作技巧】
1. 遵照小節大綱的內容，添加更多符合劇情發展的行為描述、動作描述與對話內容。
2. 掌握小節重點，針對劇情高潮處，以時間膨脹方式詳加描述所有動作細節與對話內容，增加閱讀者的深度沉浸感。
3. 對話的重點在於對話的文字內容必須簡短且精準掌握重點，切勿在對話之前添加角色的情緒描述。
3. 關鍵時刻要有感動人心的行動(行為)與對話，避免以第三人稱或獨白方式來描述感受和情緒。
4. 將文字內容視覺化與聽覺化：透過描述「肢體動作與對話」來呈現角色的感受和情緒。提高角色的代入感與共鳴感，並吸引閱讀者的注意力。
5. 貼近主角思維: 了解角色的基本資訊、年齡、身高、體重、穿著風格、性格特徵、職業、興趣和情境。學習角色的日常生活方式，以便在文章中表現出更真實的情節和感受。
6. 用現實語言來表達: 以符合當下時間與環境背景的文字來撰寫內容。

【角色設定】
{_format_char_context(char_data, is_main=True)}
目前關係：{char_data.get('relationship', '')}
{other_context}
{_format_writer_context(writer_settings)}

【當前章節】：第 {chapter_index} 章 {current_chapter}
【章節大綱/目標】：{chapter_outline}
{prev_context}{next_context}

【禁止】
1. 禁止文青式內心獨白與第三人稱說教式內容。
2. 禁止在對話之前添加角色的情緒描述，會顯得很低俗，請直接讓簡短精確的對話文字來呈現角色的感受。
3. 禁止描寫無法視覺化的氛圍或感受。
4. 禁止重複又冗長的描述角色的心境。
5. 禁止使用中文簡體字。

""".strip()

    user_input = f"請撰寫『{section_title}』的內容。"
    return f"{system_prompt}\n\n【當前任務/情境】\n{user_input}\n\n請開始執行（以繁體中文）："


# ─────────────────────────────────────────────────────────────────────────────
# 「選取文字 AI 加工」四種功能的預設語氣指令（擴寫／精簡／對白／視覺化改寫）
# ⚠️ 若要調整各功能的 AI 行為，直接修改這裡的字串即可（前端「補充指示」會另外附加疊加）。
# ─────────────────────────────────────────────────────────────────────────────
REFINE_MODE_INSTRUCTIONS = {
    # Alt+P 擴寫／優化
    'expand': (
        "任務：把【待處理段落】擴寫、優化得更豐富飽滿。\n"
        "- 依前後上下文延展，補上更多有畫面的動作、環境互動與具體細節，讓情節更立體。\n"
        "- 必須維持原段落的原意、人物、時間線與立場，不可自行新增與上下文矛盾的設定或角色。\n"
        "- 避免文青式內心獨白與第三人稱說教，盡量以「看得見的行為」與「聽得見的對白」來呈現情緒。\n"
    ),
    # Alt+S 精簡
    'condense': (
        "任務：把【待處理段落】精簡濃縮。\n"
        "- 保留關鍵資訊、劇情轉折與人物動機，刪除贅字、重複與可有可無的鋪陳。\n"
        "- 維持原段落的原意與語氣，不可刪掉會影響上下文銜接的必要資訊。\n"
    ),
    # Alt+T 對白優化
    'dialogue': (
        "任務：把【待處理段落】中的對白優化得更貼近角色。\n"
        "- 依【登場角色設定】對照段落中出現的人名（例如「聶小倩：」「小倩：」），讓每個人的台詞符合其性格與習慣用語／說話口吻。\n"
        "- 若段落中有多位角色說話，請分別依各自的角色設定調整，不要讓所有人講話都是同一個腔調。\n"
        "- 對白要簡短、精準、像真人在說話；刪除說教式、解說劇情式的呆板台詞。\n"
        "- 禁止在對白之前添加角色的情緒描述（例如「他生氣地說」），改以對白本身與必要的動作來呈現情緒。\n"
        "- 對白以外的敘述可保留，但若與對白語氣不搭可一併微調。\n"
    ),
    # Alt+A 視覺化改寫
    'visual': (
        "任務：把【待處理段落】改寫成「觀眾看得到」的視覺化內容。\n"
        "- 把內心戲、理性分析、抽象感受，改寫成角色的具體動作、表情、肢體語言，或角色與環境／物件的互動來表達。\n"
        "- 讓情緒透過「行為」被讀者看見，而不是被作者直接說出來。\n"
        "- 禁止文青式內心獨白與第三人稱說教式的心境描述。\n"
        "- 維持原段落的原意、人物與劇情走向。\n"
    ),
}

REFINE_MODE_TITLES = {
    'expand': '擴寫／優化',
    'condense': '精簡',
    'dialogue': '對白優化',
    'visual': '視覺化改寫',
}


def build_refine_text_prompt(mode: str, selected_text: str, context_text: str = "",
                             extra_instruction: str = "", target_words: int = 0,
                             characters: list = None, writer_settings: dict = None) -> str:
    """建立「選取文字 AI 加工」提示詞（擴寫／精簡／對白／視覺化改寫共用）。

    參數：
      mode              ：'expand' | 'condense' | 'dialogue' | 'visual'
      selected_text     ：使用者在輸入框中反白選取、待加工的原始文字
      context_text      ：前端組好的上下文（含以特殊標記包住的待處理段落），供 AI 理解脈絡
      extra_instruction ：使用者於彈窗填寫的「補充指示」（選填，疊加於預設語氣之後）
      target_words      ：目標字數（僅為參考建議值，0 表示不限制）
      characters        ：登場角色卡清單（供對白優化對照人名／口吻）
      writer_settings   ：寫作風格／範本設定（選填）
    """
    #####################################################################################
    # 選取文字 AI 加工提示詞：後端提供四種預設語氣骨架，前端「補充指示」可疊加覆寫。
    #####################################################################################
    mode_instruction = REFINE_MODE_INSTRUCTIONS.get(mode, REFINE_MODE_INSTRUCTIONS['expand'])
    mode_title = REFINE_MODE_TITLES.get(mode, '加工')

    # 登場角色區塊（主要給對白優化對照，其他模式也一併提供以維持人物一致）
    char_block = ""
    if characters:
        lines = []
        for i, c in enumerate(characters):
            if c and (c.get('name') or c.get('role_name')):
                lines.append(_format_char_context(c, is_main=(i == 0)))
        if lines:
            char_block = "\n【登場角色設定（供對照人名與說話口吻）】\n" + "\n\n".join(lines)

    target_note = f"\n- 目標字數：約 {target_words} 字（僅為參考建議，可為求自然而略增減）。" if target_words and target_words > 0 else ""

    extra_block = ""
    if extra_instruction and extra_instruction.strip():
        extra_block = f"\n【使用者補充指示（優先遵守）】\n{extra_instruction.strip()}\n"

    prompt = f"""
你是一位獲獎無數的小說編修高手。以下提供一段小說文字的上下文，其中以「⟦選取★開始⟧」與「⟦選取★結束⟧」標記包住的部分，是使用者指定要你加工的【待處理段落】。

【加工模式】{mode_title}
{mode_instruction}{target_note}
{extra_block}
【共通規則】
- 只輸出加工後的【待處理段落】文字本身，不要輸出標題、前言、說明、標記符號或任何額外文字。
- 不要重複輸出上下文中未被標記的部分。
- 全部使用繁體中文，禁止使用中文簡體字。
{char_block}

【上下文（★標記處為待處理段落★）】
{context_text}

【待處理段落原文】
{selected_text}

請直接輸出加工後的文字（繁體中文，只輸出替換【待處理段落】的內容）：""".strip()

    return prompt


def build_novel_review_prompt(text_content: str, user_request: str, doc_name: str = "") -> str:
    """建立「小說評審」提示詞。

    ⚠️ 設計原則：本函式盡量不在後端寫死評審規則，
    評審立場與細節由前端「使用者要求」多行文字框傳入的 user_request 主導，
    以便使用者可自由改寫成不同流派、不同嚴格程度的評審請求。
    這裡只組合最少量的骨架：使用者要求 + 待審稿件（含截斷保護）。
    """
    #####################################################################################
    # 小說評審提示詞：使用者要求主導 + 待審稿件內容
    # 後端不寫死評審面向，讓使用者可在前端自行改寫「使用者要求」。
    #####################################################################################
    # 文字長度上限（避免 num_ctx 爆掉），與前端 MAX_LEN 對齊
    MAX_LEN = 100000
    body = text_content if len(text_content) <= MAX_LEN else (text_content[:MAX_LEN] + "\n\n【注意：原文過長，已於此處截斷】")
    header = f"待審稿件名稱：{doc_name}\n" if doc_name else ""
    return (
        f"{user_request.strip()}\n\n"
        f"━━━━━━━━━━ 以下為待審稿件全文 ━━━━━━━━━━\n"
        f"{header}"
        f"{body}\n"
        f"━━━━━━━━━━ 待審稿件結束 ━━━━━━━━━━\n\n"
        f"請根據上方【使用者要求】的立場與格式，開始撰寫評審意見（繁體中文）："
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 心情軸線（Mood Axis）
#   把小說切成時間軸上的許多「段落」，請 AI 逐段標記「一般讀者讀到該段時的感受強度」，
#   前端再把結果畫成「橫向＝時間、縱向＝多項指標、顏色＝強度」的七彩熱度圖。
#
#   為了讓本機 LLM 穩定回傳符合規格的資料，這裡採「雙保險」：
#     ① build_mood_axis_schema()：產生 JSON Schema，由 debug_server 以 Ollama 的 format 參數傳入，
#        由 Ollama 在解碼階段強制輸出「結構合法、欄位齊全、分數只能是 1~7、id 只能是本批編號」的 JSON，
#        模型不可能少欄位、寫出 8 分或亂寫標點。
#     ② build_mood_axis_prompt()：Schema 只限制「長相」，並不會被模型當成文字讀到，
#        所以提示詞仍須用文字交代每個欄位的意義、評分基準與留白規則（本函式負責）。
#   指標清單（metrics）由前端傳入（含名稱、定義與 1／4／7 分的錨點），後端不寫死，
#   日後增減指標只需改前端設定。
# ═══════════════════════════════════════════════════════════════════════════════

# 所有指標共用的分數：1~7，對應紅橙黃綠藍靛紫七彩（7=紅=最高、4=綠=普通、1=紫=最低）
MOOD_SCORE_LEVELS = [1, 2, 3, 4, 5, 6, 7]
# 伏筆事件的三種動作
MOOD_FORESHADOW_ACTIONS = ["埋下", "呼應", "回收"]
# 每個段落摘要／角色名／伏筆名的長度上限（Schema 的 maxLength，避免模型寫成長篇大論）
MOOD_SUMMARY_MAX_LEN = 24
MOOD_NAME_MAX_LEN = 12
MOOD_NOTE_MAX_LEN = 30


def build_mood_axis_schema(metrics: list, segment_ids: list, known_foreshadow_names: list = None) -> dict:
    """建立「心情軸線」單一批次回傳資料的 JSON Schema（交給 Ollama 的 format 參數）。

    欄位順序刻意安排成：id → summary → characters → 各項指標 → foreshadows。
    Ollama 會依 Schema 的屬性順序逐欄生成，所以模型一定是「先用一句話複述這段發生什麼事（summary）、
    再列出這一段登場的人物（characters）、最後才打分數」，等於讓它先讀懂再評分，比直接丟數字準確。
    characters 排在各項指標之前，是為了「男主角處境」「女主角處境」這類可能沒登場的指標：
    模型得先寫出誰在場，打分時才看得出該主角在不在場（光在說明裡寫「沒登場填 0」，小模型常常忘記）。

    參數 metrics：指標清單，每筆至少含 id（英文小寫識別字）；
    參數 segment_ids：本批待分析段落的編號，Schema 會限制 id 只能是其中之一，且筆數剛好等於段落數。
    參數 known_foreshadow_names：目前已追蹤的伏筆名稱。小模型很容易把同一條伏筆在不同批次取成不同名字
        （例如「神祕的信」→「夾著的另一封信」），導致追蹤斷掉。所以伏筆事件做成兩種形狀（anyOf）：
          ① 既有伏筆：name 只能從已知名單中選（enum），action 只能是「呼應」或「回收」；
          ② 全新伏筆：name 自取，action 固定為「埋下」，並附 note 說明。
        如此「是不是同一條伏筆」就變成模型必須明確選擇的事，而不是自由發揮。
    指標若標記 nullable（例如「男主角處境」「女主角處境」：該主角這一段可能根本沒登場），
        分數 enum 多一個 0，代表「沒登場／無法判斷」，前端會把 0 當成留白，而不是硬湊一個分數。
    """
    score_schema = {"type": "integer", "enum": list(MOOD_SCORE_LEVELS)}
    props = {
        "id": {"type": "integer", "enum": [int(i) for i in segment_ids]},
        "summary": {"type": "string", "minLength": 4, "maxLength": MOOD_SUMMARY_MAX_LEN},
    }
    # 角色關愛：只列「本段有登場」的角色，沒登場就不列（前端會把沒列出的格子留白）
    props["characters"] = {
        "type": "array",
        "maxItems": 6,
        "items": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "minLength": 1, "maxLength": MOOD_NAME_MAX_LEN},
                "score": dict(score_schema),
            },
            "required": ["name", "score"],
            "additionalProperties": False,
        },
    }
    for m in metrics:
        if m.get("nullable"):
            props[m["id"]] = {"type": "integer", "enum": [0] + list(MOOD_SCORE_LEVELS)}
        else:
            props[m["id"]] = dict(score_schema)
    # 伏筆事件：沒有就是空陣列（前端會把該段的伏筆格子留白）。
    # name 的 minLength 與 summary 的 minLength 都是為了擋掉小模型常見的佔位符（例如 "-"）。
    # 屬性順序刻意把 action 放在 name 前面：Ollama 依屬性順序逐欄生成，模型得「先決定這一段對伏筆做了什麼事」，
    # 文法才會依 action 分岔——選「呼應／回收」時 name 只能從已知名單挑；選「埋下」時才能自取新名稱。
    # （若 name 在前，模型會直接寫已知名稱、再隨手選「埋下」，同一條伏筆就被誤判成新伏筆。）
    new_variant = {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["埋下"]},
            "name": {"type": "string", "minLength": 2, "maxLength": MOOD_NAME_MAX_LEN},
            "note": {"type": "string", "maxLength": MOOD_NOTE_MAX_LEN},
            "strength": dict(score_schema),
        },
        "required": ["action", "name", "note", "strength"],
        "additionalProperties": False,
    }
    variants = []
    names = []
    for nm in (known_foreshadow_names or []):
        if nm and nm not in names:
            names.append(nm)
    if names:
        variants.append({
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["呼應", "回收"]},
                "name": {"type": "string", "enum": names},
                "strength": dict(score_schema),
            },
            "required": ["action", "name", "strength"],
            "additionalProperties": False,
        })
    variants.append(new_variant)
    props["foreshadows"] = {
        "type": "array",
        "maxItems": 2,
        "items": variants[0] if len(variants) == 1 else {"anyOf": variants},
    }
    n = len(segment_ids)
    return {
        "type": "object",
        "properties": {
            "segments": {
                "type": "array",
                "minItems": n,
                "maxItems": n,
                "items": {
                    "type": "object",
                    "properties": props,
                    "required": list(props.keys()),
                    "additionalProperties": False,
                },
            }
        },
        "required": ["segments"],
        "additionalProperties": False,
    }


def _mood_format_recent(recent: list, metrics: list) -> str:
    """把「最近幾段的摘要與評分」排成一行一段的文字，供下一批保持評分尺度連續。"""
    lines = []
    for r in recent or []:
        scores = r.get("scores") or {}
        parts = []
        for m in metrics:
            v = scores.get(m["id"])
            if v is not None:
                parts.append(f"{m['label']}={v}")
        score_text = ("（" + "、".join(parts) + "）") if parts else ""
        lines.append(f"#{r.get('id')}「{r.get('summary') or '（無摘要）'}」{score_text}")
    return "\n".join(lines) if lines else "（這是第一批，尚無前情）"


def build_mood_axis_prompt(book_title: str, metrics: list, known_characters: list,
                           known_foreshadows: list, recent: list, segments: list,
                           total_segments: int = 0, leads: dict = None) -> str:
    """建立「心情軸線」單一批次的提示詞。

    參數：
      book_title         書名／文件名稱
      metrics            指標清單：[{id, group, label, hint, low, mid, high}, ...]
      known_characters   目前已出現過的主要角色名稱（讓 AI 沿用同一寫法）
      known_foreshadows  已追蹤的伏筆：[{name, note, resolved}, ...]
      recent             前面最近幾段的結果：[{id, summary, scores}, ...]（供銜接與校準尺度）
      segments           本批待分析段落：[{id, title, text}, ...]，title 為「第N章〈…〉／第M節〈…〉」
      total_segments     全書總段落數（用來告訴 AI 這批落在全書的哪個位置，判斷是否可能是高潮）
      leads              男女主角姓名 {"male": "阿哲", "female": "小晴"}（取自角色卡性別；未知則為空字串，由 AI 依文意判斷）
    """
    # ── 各指標的定義與 1／4／7 分錨點：有具體的「例子」，AI 才不會每個指標都給一樣的分數 ──
    metric_lines = []
    for m in metrics:
        line = (
            f"■ {m['id']}｜{m['label']}：{m.get('hint', '')}\n"
            f"　1分＝{m.get('low', '最低')}　／　4分＝{m.get('mid', '普通')}　／　7分＝{m.get('high', '最高')}"
        )
        if m.get("nullable"):
            # 可能沒登場的對象（例如男／女主角）：沒登場就填 0，前端會留白，不要硬給一個分數
            line += "\n　※ 先看你上面寫的 characters 欄位：若這個人物沒有出現在這一段（characters 裡沒有他／她），輸出 0（代表圖表留白）；有出現才給 1～7。"
        metric_lines.append(line)
    metric_block = "\n".join(metric_lines)
    has_nullable = any(m.get("nullable") for m in metrics)
    # 男／女主角姓名（若指標有 lead 屬性）：給了名字，AI 只要檢查名字有沒有出現在這一段，比「判斷誰是男主角」容易得多
    leads_text = ""
    if any(m.get("lead") for m in metrics):
        leads = leads or {}
        unknown = "（未指定，請依文意判斷：通常是故事中最重要的{}性人物）"
        leads_text = (
            f"男主角：{(leads.get('male') or '').strip() or unknown.format('男')}\n"
            f"女主角：{(leads.get('female') or '').strip() or unknown.format('女')}\n"
        )
    metric_ids = "、".join(m["id"] for m in metrics)

    # ── 格式範本：刻意用〈〉佔位，而不是放真實數字，避免模型照抄範例的分數 ──
    metric_template = ",".join(
        f'"{m["id"]}":' + ('〈1~7，沒登場填 0〉' if m.get("nullable") else '〈1~7〉') for m in metrics
    )
    format_template = (
        '{"segments":[{"id":〈段落編號〉,"summary":"〈6~14字摘要〉",'
        '"characters":[{"name":"〈角色名〉","score":〈1~7〉}],' + metric_template + ','
        '"foreshadows":[{"action":"〈埋下|呼應|回收〉","name":"〈伏筆名〉","note":"〈12字內說明，僅「埋下」時有此欄〉","strength":〈1~7〉}]（沒有伏筆就是 []）},'
        '…每個待分析段落各一筆，順序與段落編號相同…]}'
    )

    # ── 前情狀態 ──
    chars_text = "、".join(known_characters) if known_characters else "（尚無，請依文中出現的人名自行判斷）"
    if known_foreshadows:
        fs_lines = []
        for f in known_foreshadows:
            status = "已回收" if f.get("resolved") else "進行中"
            note = f"：{f['note']}" if f.get("note") else ""
            fs_lines.append(f"・{f['name']}（{status}{note}）")
        fs_text = "\n".join(fs_lines)
    else:
        fs_text = "（尚無）"
    recent_text = _mood_format_recent(recent, metrics)

    # ── 本批位置（全書進度），提醒 AI 不要在全書很前面就把「最終高潮」的 7 分用掉 ──
    ids = [s["id"] for s in segments]
    first_id, last_id = (min(ids), max(ids)) if ids else (0, 0)
    if total_segments and total_segments > 0:
        pos_text = (f"本批是全書第 {first_id}～{last_id} 段（共 {total_segments} 段），"
                    f"約位於全書的 {round(first_id * 100 / total_segments)}%～{round(last_id * 100 / total_segments)}%。")
    else:
        pos_text = f"本批是全書第 {first_id}～{last_id} 段。"

    # ── 待分析段落（每段附編號與所屬章節，編號就是回傳資料的 id） ──
    seg_blocks = []
    for s in segments:
        seg_blocks.append(f"【段落 {s['id']}】{s.get('title', '')}\n{s.get('text', '')}")
    segments_text = "\n\n".join(seg_blocks)

    n = len(segments)
    id_list = "、".join(str(i) for i in ids)
    title_line = f"《{book_title}》\n\n" if book_title else ""
    # 規則 1 的例外說明：只有存在 nullable 指標時才加，避免多餘的干擾
    zero_note = "（唯一的例外：標註「沒登場填 0」的指標，該人物沒有登場（沒列在你寫的 characters 裡）時請輸出 0。）" if has_nullable else ""

    return f"""你是一位資深小說編輯，同時擔任「讀者體驗分析師」。你的工作不是評論文筆好壞，而是替下方每一個【待分析段落】標記「一位一般讀者讀到那一段時的感受強度」，讓作者能畫出整本小說的「心情軸線」圖表，看出讀者情緒的起伏。

{title_line}【評分規則】（務必遵守）
1. 所有分數都是 1～7 的整數，對應七種顏色：7＝紅（最高）、6＝橙、5＝黃、4＝綠（普通）、3＝藍、2＝靛、1＝紫（最低）。{zero_note}
2. 分數只代表「強度」，沒有好壞之分。悲劇的低迷、平淡日常的低分都是正確的標示，請照實給分，不要為了討好作者而美化，也不要因為你喜不喜歡那段文字而加分或扣分。
3. 以「整部小說」為尺度評分：4 代表普通、一般水準；只有真正的高潮、最強烈處才給 7；只有真正的谷底，或完全沒有該情緒時才給 1。請善用 1～7 的完整範圍，不要讓所有段落都擠在 3～5；相鄰段落只有在真的很相近時才給相同的分數。
4. 只根據【待分析段落】裡實際寫出來的文字評分。【前情狀態】只是幫助你理解上下文與保持評分尺度一致，不可拿來替沒寫在該段落裡的內容加分。
5. 每個指標都要獨立判斷：同一段落可以「劇情很平淡（plot 低）」但「很感人（joy 高）」，不要讓所有指標一起漲跌。
6. 全部使用繁體中文，禁止使用中文簡體字。
7. 只輸出符合下方【輸出格式】的 JSON，不要輸出任何說明、前言、註解或程式碼框；JSON 請輸出成緊湊的單行，不要縮排、不要多餘的空白與換行。

【各指標的定義與評分基準】（欄位名稱＝英文識別字）
{metric_block}

【角色關愛指數（characters 欄位）】
- 只列出「在這個段落裡實際登場（出現、說話、被明確描寫）」且有名字、對劇情有份量的主要角色；路人與沒有登場的角色絕對不要列出，留白代表該段沒有這個角色。
- score＝讀者此刻對該角色的「關愛程度」：7＝非常喜愛、心疼、想守護、為他加油；4＝普通、沒有特別感覺；1＝強烈反感、討厭、厭惡。
- 名稱請使用文中的人名；若已列在【已知主要角色】中，必須沿用完全相同的寫法。若全文以第一人稱「我」敘事，敘事者就以「我」為名。最多列 6 位。

【伏筆追蹤（foreshadows 欄位）】
- 伏筆＝作者特意留給後面劇情使用的「具體線索」（被特別強調的物件、意味深長的台詞、不合常理的異狀、懸而未決的疑問、預告）。判斷方法：如果日後劇情完全沒用到這個細節，讀者也不會覺得缺了什麼，那它就不是伏筆。一部小說通常只有 3～8 條主要伏筆，寧缺勿濫。
- 以下【都不是】伏筆，請不要列入：情緒或氣氛的描寫、天氣與景色的象徵意義、角色單純的情緒爆發或衝突、普通的情節推進、在同一段裡就已經交代完的事。
- 伏筆的名稱必須是「具體的事物、線索或疑問」（例：神祕的信、斷掉的鑰匙、他沒說完的那句話），不可以是「…的象徵意義」「…的轉折」「…的氛圍」這種抽象概念。
- 只列出「這個段落裡」出現的伏筆事件；這一段沒有任何伏筆就輸出空陣列 []，絕對不要用 "-"、"無" 之類的佔位文字湊數。每段最多 2 筆。
- 如果這一段提到、呼應或揭曉了【已知伏筆】清單裡的事物：action 用「呼應」（再次提起、加深、暗示）或「回收」（謎底揭曉、兌現），name 必須從已知清單中挑選，不可另取新名字。
- 只有「全新、之前沒出現過」的伏筆，才用 action＝「埋下」，並自取 2～8 個字的名詞片語當 name（例：神祕的信、斷掉的鑰匙），note 用 12 字內說明它是什麼。
- 同一批裡，後面的段落若又提到前面段落「剛埋下」的伏筆（還不在已知清單裡），name 請寫成與前面段落完全相同的名稱（action 仍寫「埋下」即可，系統會自動歸為呼應），不要為同一件事另取新名字。
- strength：該伏筆在這一段的份量與醒目程度（1＝一筆帶過、4＝明確提及、7＝整段的核心）。

【段落摘要（summary 欄位）】
- 用 6～14 個字描述這段「發生了什麼事」，要具體（例：「小美雨中等候」「兩人圖書館爭吵」）。不要加標點，不要寫「本段」「描述」之類的字眼。

【輸出格式】
輸出一個 JSON 物件，欄位依序為 id、summary、characters、{metric_ids}、foreshadows，格式如下（〈〉是說明，請換成實際的值）：
{format_template}

━━━━━━━━━━ 前情狀態 ━━━━━━━━━━
已知主要角色：{chars_text}
{leads_text}已知伏筆：
{fs_text}
最近幾段的結果（只供銜接與校準評分尺度，不要照抄）：
{recent_text}
{pos_text}

━━━━━━━━━━ 待分析段落（共 {n} 段） ━━━━━━━━━━
{segments_text}
━━━━━━━━━━ 待分析段落結束 ━━━━━━━━━━

請為上面 {n} 個段落（編號：{id_list}）各輸出一筆資料，id 必須與段落編號相同，並依編號由小到大排列。現在請直接輸出 JSON："""


def build_rewrite_content_prompt(text_content: str, user_request: str, doc_name: str = "", search_context: str = "") -> str:
    """建立「多文改寫」提示詞（例如：翻譯成英文、改寫成小紅書風、擴寫、濃縮…等）。

    ⚠️ 設計原則：本函式盡量不在後端寫死改寫規則，
    改寫任務與細節由前端「使用者指令」多行文字框傳入的 user_request 主導，
    以便使用者可自由改寫成不同語言、不同文體、不同長度的改寫請求。
    這裡只組合最少量的骨架：使用者指令 + 待改寫原文（含截斷保護）。
    """
    #####################################################################################
    # 多文改寫提示詞：使用者指令主導 + 待改寫原文
    # 後端不寫死改寫方向，讓使用者可在前端自行改寫「使用者指令」。
    #####################################################################################
    # 文字長度上限（避免 num_ctx 爆掉），與前端對齊
    MAX_LEN = 100000
    body = text_content if len(text_content) <= MAX_LEN else (text_content[:MAX_LEN] + "\n\n【注意：原文過長，已於此處截斷】")
    header = f"原始檔名：{doc_name}\n" if doc_name else ""
    # 網路搜尋參考資料區塊（可選）：由 web_search_utils.build_search_context 產生
    search_block = ""
    tail_hint = "請根據上方【使用者指令】的規則，直接輸出改寫後的完整內容，不要輸出任何前言、後記或說明文字："
    if search_context and search_context.strip():
        search_block = (
            f"━━━━━━━━━━ 網路搜尋參考資料 ━━━━━━━━━━\n"
            f"{search_context.strip()}\n"
            f"━━━━━━━━━━ 參考資料結束 ━━━━━━━━━━\n\n"
        )
        tail_hint = "請根據上方【使用者指令】的規則，並在必要時引用【網路搜尋參考資料】的事實與細節，直接輸出改寫後的完整內容，不要輸出任何前言、後記或說明文字："
    return (
        f"{user_request.strip()}\n\n"
        f"{search_block}"
        f"━━━━━━━━━━ 以下為待改寫原文 ━━━━━━━━━━\n"
        f"{header}"
        f"{body}\n"
        f"━━━━━━━━━━ 待改寫原文結束 ━━━━━━━━━━\n\n"
        f"{tail_hint}"
    )




def build_json_repair_chapters_prompt(raw_text: str) -> str:
    """
    當 AI 產生章節標題與描述的 JSON 格式錯誤時，
    送給 AI 重新解析成正確 JSON 格式的提示詞。
    """
    return f"""你是一位 JSON 格式校正專家。以下是一段 AI 生成的文字，本應是包含章節標題與描述的 JSON 陣列，但格式不正確或混有說明文字。

【你的任務】
請將以下內容重新整理成有效的 JSON 陣列，每個元素是包含 "title"（章標題）與 "description"（章描述）兩個欄位的物件。

【輸出規則】
1. 只輸出純 JSON 陣列，開頭為 [，結尾為 ]，不加任何說明、標題或 Markdown 符號
2. 每個章節物件必須有 "title" 和 "description" 兩個字串欄位
3. 字串值內不得出現未跳脫的換行符或引號
4. 陣列元素之間必須以逗號分隔
5. 若原始文字完全無法識別任何章節結構，請輸出空陣列 []
6. 禁止輸出 ```json 等 Markdown 標記

【原始文字】
{raw_text}

請直接輸出 JSON 陣列（以 [ 開頭）："""


def build_json_repair_sections_prompt(raw_text: str) -> str:
    """
    當 AI 產生各小節大綱的 JSON 格式錯誤時，
    送給 AI 重新解析成正確 JSON 格式的提示詞。
    """
    return f"""你是一位 JSON 格式校正專家。以下是一段 AI 生成的文字，本應是包含各小節大綱的 JSON 陣列，但格式不正確或混有說明文字。

【你的任務】
請將以下內容重新整理成有效的 JSON 陣列，每個元素可以是：
- 純字串（小節大綱描述），或
- 含有 "title"（小節標題）與 "outline"（小節大綱）兩個欄位的物件

【輸出規則】
1. 只輸出純 JSON 陣列，開頭為 [，結尾為 ]，不加任何說明、標題或 Markdown 符號
2. 字串值內不得出現未跳脫的換行符或引號
3. 陣列元素之間必須以逗號分隔
4. 若原始文字完全無法識別任何小節結構，請輸出空陣列 []
5. 禁止輸出 ```json 等 Markdown 標記

【原始文字】
{raw_text}

請直接輸出 JSON 陣列（以 [ 開頭）："""


def build_diary_image_prompt_text(char_data: dict, diary_text: str) -> str:
    """
    根據角色卡的基礎設定 (image_prompt) 與日記本文內容，
    產出符合 Danbooru 格式 (逗號分隔英文 Tags) 的動態生圖提示詞。
    """
    #####################################################################################
    #根據角色卡的基礎設定 (image_prompt) 與日記本文內容產出生圖提示詞。
    #####################################################################################
    base_image_prompt = char_data.get('image_prompt', '')
    char_name = char_data.get('name', '女主角')

    return f"""你是一位擅長 AI 繪圖提示詞 (Stable Diffusion / ComfyUI) 的專家。
現在有一篇由「{char_name}」剛寫好的日記，以及她原本的基礎外貌設定提示詞。

【任務目標】
請仔細閱讀這篇日記，擷取其中提到的「關鍵場景」、「當下穿著的服裝」、「當下正在做的動作」、「臉上表情」、「環境氛圍」和「其他角色(如果有)」。
將這些新擷取的元素，與她原本的基礎外貌設定「完美融合」，最終輸出成以下兩組提示詞，每組約300字。
1.「純英文，以自然語言描述任何可視覺化的細節」。
2.「純繁體中文，以自然語言描述任何可視覺化的細節」。

【基礎外貌設定 (Base Image Prompt)】
{base_image_prompt}

【本次日記內容】
{diary_text}

【輸出規則】
1. 必須保留角色卡的「基礎外貌設定」關於年齡、身高、體重、三圍、身體特徵。
2. 如果沒有特別描述國籍或人種，一律以「東方人」為準。
3. 把日記中提到的場景、特定服裝或情緒動作轉化成提示詞。
4. 如果日記有明確指定服裝或場景，請覆寫掉基礎設定中衝突的背景或服裝。
5. 請按照「主體描述 -> 服裝/配件 -> 姿勢/動作/表情 -> 其他角色(如果有) -> 環境 -> 鏡頭角度 -> 光影氛圍」的順序排列。
6. 必須以下列 JSON 格式輸出，直接以 {{ 開頭，不加任何說明文字或 Markdown 標記：
{{"en": "English prompt here...", "zh": "中文提示詞..."}}

請直接輸出 JSON（以 {{ 開頭）："""
