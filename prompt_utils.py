import os
import json
import re
import time
from datetime import datetime

def load_character_from_path(char_path: str) -> dict:
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
    #####################################################################################
    global _CACHED_LOGIC
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
    #####################################################################################
    c = dict(char_data)
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
    if not c.get('bust'): c['bust'] = "C"
    
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
    #建立「根據粗綱生成各章標題與描述」的提示詞
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
你是一位金牌小說策劃與總編。請根據以下【主角設定】與【故事粗綱】，為這部名為《{book_title}》的小說規劃出各章節的標題與章節大綱。

【指令】
1. 根據粗綱描述，請規劃 {chapter_count} 章。
2. 每個章節需要有「章節標題」與「章節描述（約{words_per_chapter}字，交代本章重點）」。
3. 每個項目是一個包含 "title" 與 "description" 的物件。
4. **必須**回傳標準的 JSON 格式列表，不可遺漏任何標示符號。
5. 不要有任何額外前言、後記或 Markdown 區塊。
6. 若存在「已固定章節」，必須嚴格銜接其前後劇情，不可改變固定章節的內容。

【寫作技巧】
1. 粗綱描述僅是參考而已，要以角色個性與創意優先，讓創意主導故事架構與劇情發展。
2. 情節出乎意料但又在情理之中，符合長篇小說的起承轉合。
3. 每一章都要有關鍵的轉折與劇情，且具有張力與懸念，勾引讀者繼續閱讀的慾望。
4. 標題要吸引人，讓大腦產生驚嘆號與問號。
5. 描述要簡潔扼要，避免冗言贅字。
6. 善於安排其他角色的戲份，創造出多角關係，讓故事更精彩。

【禁止】
1. 禁止過度講究合理性與邏輯，人生本來就是一件很混亂的事情，不合邏輯才是真實的。
2. 劇情禁止被道德感框架約束。要寫出人性的黑暗面，以及在感情中的自私與矛盾。
3. 角色禁止塑造出完美形象，每個人都是有罪且不完美的。

【範例格式】
[
  {{"title": "第一章：標題文字", "description": "本章大綱描述..."}},
  {{"title": "第二章：標題文字", "description": "本章大綱描述..."}},
  {{"title": "第三章：標題文字", "description": "本章大綱描述..."}},
  {{"title": "第四章：標題文字", "description": "本章大綱描述..."}}
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
1. 請規劃 {section_count} 個小節，並為每個小節提供小節描述(大綱)，字數約{words_per_section}字。
2. **必須**回傳標準的 JSON 格式列表，每個項目包含標題與大綱，合併成單一字串。
3. 不要有任何額外前言、後記或 Markdown 區塊。

範例格式：
[
  {{"第一節：標題文字...。大綱內容描述..."}},
  {{"第二節：標題文字...。大綱內容描述..."}},
  {{"第三節：標題文字...。大綱內容描述..."}}
]

【寫作技巧】
1. 必須與前後章節的劇情銜接，保持故事連貫性。
2. 掌握本章關鍵重點與前後小節描述(大綱)來安排各小節描述(大綱)，規劃出關鍵小節與次要小節。
3. 關鍵小節的內容必須能凸顯本章關鍵重點並推動劇情發展。
4. 次要小節的內容可以用來解決劇情矛盾，讓劇情合理化，豐富劇情或增加張力。

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
3. 對話必須完全符合角色的「說話口吻」。
4. 請直接開始撰寫故事，不要輸出標題或任何前言。
5. 本節為【第 {chapter_index} 章 第 {section_index} 節】，請確保與上下節情節連貫。

【寫作技巧】
1. 遵照小節大綱的內容，添加更多符合劇情發展的細節描述，包括行為描述與對話內容。
2. 掌握小節重點，針對劇情高潮處，以時間膨脹方式詳加描述所有動作細節與來回對話內容，增加閱讀者的深度沉浸感。
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
1. 禁止使用中文簡體字。
2. 禁止文青式內心獨白與第三人稱說教式內容。

""".strip()

    user_input = f"請撰寫『{section_title}』的內容。"
    return f"{system_prompt}\n\n【當前任務/情境】\n{user_input}\n\n請開始執行（以繁體中文）："

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
  "gender": "女",
  "height": "身高(cm)字串，根據身材描述來判斷，若無則設164",
  "weight": "體重(kg)字串，根據身材描述來判斷，若無則設50",
  "bust": "罩杯字母，根據身材描述來判斷，若無則設C",
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


def build_story_to_premise_prompt(text_content: str, chapter_count: int = 8, words_per_chapter: int = 200) -> str:
    """建立「將故事原文濃縮成故事粗綱」的提示詞"""
    #####################################################################################
    # 建立「將故事原文濃縮成故事粗綱」的提示詞
    #####################################################################################
    prompt = f"""你是一位頂尖的小說策劃編輯，擅長解析故事結構並濃縮成精煉的故事粗綱。
請閱讀以下故事原文，將整個故事濃縮成故事粗綱，讓讀者在短時間內能掌握完整故事的架構與關鍵劇情。

【輸出格式規定】
請嚴格依照以下格式輸出，所有內容使用繁體中文：

女主角：姓名、樣貌、穿著、個性、動機、目標、行為。
男主角：姓名、樣貌、穿著、個性、動機、目標、行為。
女配角：姓名（若有）、樣貌、個性、在故事中的角色。
男配角：姓名（若有）、樣貌、個性、在故事中的角色。
反派女角色：姓名（若有）、樣貌、動機、行為（若無反派女角色則略去此行）。
反派男角色：姓名（若有）、樣貌、動機、行為（若無反派男角色則略去此行）。
其他角色：其餘重要角色簡短描述（若無則略去此段）。

故事背景：故事發生的年代、地點、社會背景說明（約200字）。

【故事粗綱】
依照「起、承、轉、合」四大結構，根據原故事的長度與複雜度將故事分成 {chapter_count} 章。
每章格式如下（每章粗綱約 {words_per_chapter} 字，著重本章主旨與關鍵劇情）：

第一章：（章節標題）
（本章粗綱，約{words_per_chapter}字）

第二章：（章節標題）
（本章粗綱，約{words_per_chapter}字）

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
請閱讀以下故事原文，依照「起、承、轉、合」結構，將整個故事濃縮成「條列式」的故事粗綱。

【核心目的】
- 不要重述原故事的劇情細節，只保留最關鍵、最能感動人心的核心元素。
- 在「關鍵事件」中除了原故事的劇情走向之外，必須再額外發想「兩種」由 AI 自行發展、且戲劇化轉變的替代劇情走向，
  讓後續 AI 撰寫大綱時能自行擇一發展。

【整體章數】
依照原故事的長度與複雜度將故事分成 {chapter_count} 章，依「起、承、轉、合」分配比例：
- 起 約佔 25%
- 承 約佔 30%
- 轉 約佔 30%
- 合 約佔 15%

【每章輸出格式（嚴格遵守，全部使用「*」條列）】
每章字數約 {words_per_chapter} 字。格式如下：

第X章：（章節標題）
* 男主角XXX：行為與情緒描述。
* 女主角XXX：行為與情緒描述。
* 配角XXX：行為與情緒描述。（其他角色一一條列；若無可省略）
* 關鍵事件1：事件緣由。
    ** 注意：產生章描述時，請由以下三種故事走向選擇其中之一發展。直接寫出章描述，勿添加類似"故事選擇發展【XXXX】："
    - 原故事走向：……
    - AI 構思走向A（戲劇化）：……
    - AI 構思走向B（戲劇化）：……
* 關鍵事件2：事件緣由。
    ** 注意：產生章描述時，請由以下三種故事走向選擇其中之一發展。直接寫出章描述，勿添加類似"故事選擇發展【XXXX】："
    - 原故事走向：……
    - AI 構思走向A（戲劇化）：……
    - AI 構思走向B（戲劇化）：……
* 關鍵物品：物品名稱與在劇情中的象徵或功能。
* 時間／地點／環境：本章發生的時間、地點、氛圍。
* 其他補充：你認為對後續創作有幫助的任何條列項目（伏筆、情感張力、感官細節等）。

【撰寫規則】
1. 全部以「*」開頭的條列項目呈現，子項目以「    -」縮排條列，禁止寫成段落式敘述。
2. 文字精簡、訊息密度高，每項條列盡量在一行內表達完整意思。
3. 角色描述只保留行為與情緒「動機」，不寫具體對白、不寫具體場景細節。
4. 「AI 替代走向」必須與「原故事走向」明顯不同，且要能合理銜接前後章，並具備戲劇張力。
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


def build_rewrite_content_prompt(text_content: str, user_request: str, doc_name: str = "") -> str:
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
    return (
        f"{user_request.strip()}\n\n"
        f"━━━━━━━━━━ 以下為待改寫原文 ━━━━━━━━━━\n"
        f"{header}"
        f"{body}\n"
        f"━━━━━━━━━━ 待改寫原文結束 ━━━━━━━━━━\n\n"
        f"請根據上方【使用者指令】的規則，直接輸出改寫後的完整內容，不要輸出任何前言、後記或說明文字："
    )


def build_chat_reply_prompt(char_data, char_name, user_name, user_message, history,
                            persona_override="", session_extra="", 
                            user_char_data=None, user_persona_override="", user_extra="",
                            session_type="one_on_one", other_participants=None, writer_settings: dict = None):
    """
    建立 LoveLine 聊天的提示詞，支援使用者資料與進階覆寫。
    """
    #####################################################################################
    #建立 LoveLine 聊天的提示詞，支援使用者資料與進階覆寫。
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
