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
                
    _CACHED_LOGIC = {"zodiac": zodiac, "blood": blood, "type": ptype}
    return _CACHED_LOGIC

def _enrich_char_data(char_data: dict, relationship_params: dict = None) -> dict:
    #####################################################################################
    # 補充角色資料
    #####################################################################################
    c = dict(char_data)
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
    ptype = c.get('personality_type', '')
    if ptype and '-' in ptype and not c.get('personality'):
        codes = ptype.split('-')[0].split('_')
        if len(codes) == 3:
            idx = 0 if p_key == 'ambiguity' else 1 if p_key == 'love' else 2
            hcode = '-'.join(list(codes[idx]))
            c['personality'] = logic['type'].get(hcode, {}).get(p_key, "")
    return c

def build_daily_prompt(char_data: dict, scenario: str, relationship_params: dict = None) -> str:
    """建立「日記生成」的完整提示詞 (包含系統提示與當日情境/關係動態)"""
    #####################################################################################
    #建立「日記生成」的完整提示詞 (包含系統提示與當日情境/關係動態)
    #####################################################################################
    char_data = _enrich_char_data(char_data, relationship_params)
    current_personality = char_data.get('personality', '')
        
    habits = char_data.get("habits", []) or []
    timestamp = time.strftime("%Y年 %m月 %d日 %H時", time.localtime())

    system_prompt = f"""
你現在是一位專業的暢銷愛情小說作家，擅長撰寫一段自然、有趣、具真實感且能引起讀者共鳴的愛情故事，請代入以下角色的靈魂寫日記。
【核心指令】
1. 以沉浸在戀愛氛圍的女性視角，在睡前，以「內心獨白」形式，隨手寫下今天發生的令她難忘的一段經歷或關鍵想法。
2. 日記主題以戀愛為主，也可以包括且不限於：交友、閨蜜、性生活、出軌、一夜情、生理需求、心理撫慰、工作、辦公室戀情、家庭、亂倫、暴力、身心靈、健康、運動、娛樂、旅行等，沒有特定的要求或限制。
3. 若女主角同時擁有伴侶與新朋友，請重點描述三角戀的複雜情感、內心掙扎、性幻想、性愛與罪惡感等內容。
4. 每篇日記撰寫1~2個重點，集中焦點，字數約 300 字，使用「繁體中文」(Traditional Chinese)。

【輸出格式】
第一行請寫 {char_data.get('name', '')} 的日記 {timestamp} 

【寫作技巧】
1. 故事情節要豐富，要有高潮和低潮，要有轉折，要有感動人心的情節。
2. 貼近主角思維: 了解您的女性角色，包括她的基本資訊、年齡、身高、體重、穿著風格、性格特徵、職業、興趣和情境。
3. 增加愛情成分: 凸顯戀愛中的女人的起伏情緒，增加私密肢體接觸的描述。
4. 運用有趣的故事: 將女性角色與一些有趣的人物或場景相結合，增加日記的趣味性和互動性。
5. 故意添加主角犯錯、缺點、愚蠢與不足。
6. 描述感受和情緒: 使用感官詞來描述女生在日常生活中的感受和情緒。讓角色更有感度，並吸引讀者的注意力。
7. 將日記分成段節: 分成不同的段落或部分，釐清思緒和情境。
8. 加入自我刺激與反省: 加入女性角色的自我反省和自我刺激是個好方法，可以讓日記更有深度和真實感。
9. 用現實語言來表達: 以符合女主角年齡、職業與性格來呈現真實的說話用語、語氣、生活習慣。
10. 遵循日記風格和形式: 用簡短字數紀錄生活、表達看法、抒發情緒，無須完整記錄事件經過。無須過度講究文法結構，當女主角在抒發強烈情緒時，請直白表達，勿過度修飾，保持自然流暢。

【禁止】
1. 將女主塑造成完美形象。
2. 流水帳或商業文件或教科書的文體。

【角色設定】
姓名：{char_data.get('name', '')}
年齡：{char_data.get('age', '')}
生日：{char_data.get('birthday', '')}
星座：{char_data.get('zodiac', '')}
星座描述：{char_data.get('zodiac_description', '')}
血型：{char_data.get('blood_type', '')}
血型描述：{char_data.get('blood_type_description', '')}
個性類型：{char_data.get('personality_type', '')}
個性描述：{current_personality}
說話口吻：{char_data.get('speech_style', '')}
職業：{char_data.get('occupation', char_data.get('position', ''))}
習慣/興趣：{', '.join(habits)}
外表特徵：{char_data.get('appearance', '')}
目前關係：{char_data.get('relationship', '')}

""".strip()

    # 2. 增加關係動態 (Relationship Dynamics)
    rel_context = ""
    if relationship_params:
        pa = relationship_params.get('partner_status', '無')
        fA = relationship_params.get('friend_a_status', '無')
        fB = relationship_params.get('friend_b_status', '無')
        others_occupied = relationship_params.get('others_occupied', False)

        if fA != '無':
            rel_context += f"- 與新朋友 A 處於：{fA}\n"
        if fB != '無':
            rel_context += f"- 與新朋友 B 處於：{fB}\n"
        
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

    final_scenario = scenario
    if rel_context:
        final_scenario = f"{rel_context}\n[當日情境]\n{scenario}"

    return f"{system_prompt}\n\n【當前任務/情境】\n{final_scenario}\n\n請開始執行（以繁體中文）："

def build_chapters_from_premise_prompt(char_data: dict, book_title: str, story_premise: str, other_chars: list = None) -> str:
    """建立「根據故事粗綱生成各章標題與描述」的提示詞"""
    #####################################################################################
    #建立「根據粗綱生成各章標題與描述」的提示詞
    #####################################################################################    
    char_data = _enrich_char_data(char_data, {"partner_status": "戀愛期"})
    current_personality = char_data.get('personality', '')
    habits = char_data.get("habits", []) or []

    system_prompt = f"""
你是一位金牌小說策劃與總編。請根據以下【主角設定】與【故事粗綱】，為這部名為《{book_title}》的小說規劃出各章節的標題與章節大綱。

【指令】
1. 根據粗綱描述，請規劃適當的章節數量。
2. 每個章節需要有「章節標題」與「章節描述（約 100 字，交代本章重點）」。
3. 故事架構應符合都會言情長篇小說的起承轉合。
4. 每個項目是一個包含 "title" 與 "description" 的物件。
5. **必須**回傳標準的 JSON 格式列表，不可遺漏任何標示符號。
6. 不要有任何額外前言、後記或 Markdown 區塊。

範例格式：
[
  {{"title": "第一章：標題文字", "description": "本章大綱描述..."}},
  {{"title": "第二章：標題文字", "description": "本章大綱描述..."}}
]

【故事粗綱】
{story_premise}

【角色設定】
姓名：{char_data.get('name', '')}
年齡：{char_data.get('age', '')}
生日：{char_data.get('birthday', '')}
星座：{char_data.get('zodiac', '')}
星座描述：{char_data.get('zodiac_description', '')}
血型：{char_data.get('blood_type', '')}
血型描述：{char_data.get('blood_type_description', '')}
個性類型：{char_data.get('personality_type', '')}
個性描述：{current_personality}
說話口吻：{char_data.get('speech_style', '')}
職業：{char_data.get('occupation', char_data.get('position', ''))}
習慣/興趣：{', '.join(habits)}
外表特徵：{char_data.get('appearance', '')}
目前關係：{char_data.get('relationship', '')}
其他登場角色：{other_chars}

""".strip()

    if other_chars and len(other_chars) > 0:
        names = [c.get('name', '') for c in other_chars]
        system_prompt += f"\n【其他登場角色】：{', '.join(names)}"
        
    return f"{system_prompt}\n\n請開始規劃（以繁體中文）："

def build_chapter_outline_prompt(char_data: dict, book_title: str, outline_desc: str, other_chars: list = None) -> str:
    """根據章的標題與描述來建立「各小節大綱」的完整提示詞"""
    #####################################################################################
    # 根據章的標題與描述來建立「各小節大綱」的完整提示詞
    #####################################################################################
    char_data = _enrich_char_data(char_data, {"partner_status": "戀愛期"})
    current_personality = char_data.get('personality', '')
    habits = char_data.get("habits", []) or []

    system_prompt = f"""
你是一位金牌小說作者與專業編輯。請根據以下【主角設定】，為這部名為《{book_title}》的小說的《{outline_desc}》規劃出 3~5 個小節。

【指令】
1. 請規劃 3~5 個小節，並為每個小節提供標題與簡短大綱。
2. 風格應對位當下流行的都會愛情長篇小說。
3. **必須**回傳標準的 JSON 格式列表，每個項目包含標題與大綱，必須被合併成單一字串，。
不要有任何額外前言、後記或 Markdown 區塊。

範例格式：
[
  {{"第一節：標題文字...。大綱內容描述..."}},
  {{"第二節：標題文字...。大綱內容描述..."}},
  {{"第三節：標題文字...。大綱內容描述..."}}
]



【角色設定】
姓名：{char_data.get('name', '')}
年齡：{char_data.get('age', '')}
生日：{char_data.get('birthday', '')}
星座：{char_data.get('zodiac', '')}
星座描述：{char_data.get('zodiac_description', '')}
血型：{char_data.get('blood_type', '')}
血型描述：{char_data.get('blood_type_description', '')}
個性類型：{char_data.get('personality_type', '')}
個性描述：{current_personality}
說話口吻：{char_data.get('speech_style', '')}
職業：{char_data.get('occupation', char_data.get('position', ''))}
習慣/興趣：{', '.join(habits)}
外表特徵：{char_data.get('appearance', '')}
目前關係：{char_data.get('relationship', '')}
其他登場角色：{other_chars}

""".strip()
    
    user_input = f"【章節大綱說明】：{outline_desc}"
    if other_chars and len(other_chars) > 0:
        names = [c.get('name', '') for c in other_chars]
        user_input += f"\n【其他登場角色】：{', '.join(names)}"
        
    return f"{system_prompt}\n\n【當前任務/情境】\n{user_input}\n\n請開始執行（以繁體中文）："

def build_novel_content_prompt(char_data: dict, current_chapter: str, chapter_outline: str, section_title: str, other_chars: list = None) -> str:
    """建立「小說本文生成」的完整提示詞"""
    #####################################################################################
    #建立「小說本文生成」的完整提示詞
    #####################################################################################
    char_data = _enrich_char_data(char_data, {"partner_status": "戀愛期"})
    habits = char_data.get("habits", []) or []
    
    # 處理其他角色的個性欄位
    other_context = ""
    if other_chars and len(other_chars) > 0:
        other_lines = []
        for c in other_chars:
            c_en = _enrich_char_data(c, {"partner_status": "戀愛期"})
            p_val = c_en.get('personality', '')
            other_lines.append(f"- {c_en.get('name')}: {p_val}")
        other_context = "\n【其他登場角色】\n" + "\n".join(other_lines)

    # 主角個性欄位
    current_personality = char_data.get('personality', "")

    system_prompt = f"""
你現在是獲獎無數的都會言情小說家。請根據以下情境與完整的角色設定，撰寫小說正文。

【寫作指令】
1. 使用「第三人稱」視角，文字需優美且細膩，注重心理描寫、肢體動作與對話。
2. 字數約 1200~1500 字，使用「繁體中文」。
3. 對話必須完全符合角色的「說話口吻」。
4. 請直接開始撰寫故事，不要輸出標題或任何前言。

【寫作技巧】
1. 故事情節要豐富，要有高潮和低潮，要有轉折，要有感動人心的情節。
2. 貼近主角思維: 了解您的女性角色，包括她的基本資訊、年齡、身高、體重、穿著風格、性格特徵、職業、興趣和情境。學習女性角色的日常生活方式，以便在日記中表現出更真實的情節和感受。
3. 增加愛情成分: 凸顯戀愛中的女人的起伏情緒，增加私密肢體接觸的描述。
4. 運用有趣的故事: 將您的女性角色與一些有趣的人物或場景相結合，這會增加日記的趣味性和互動性。
5. 描述感受和情緒: 使用感官詞來描述女生在日常生活中的感受和情緒。這可以令人對您的角色更有感度，並吸引讀者的注意力。
6. 將日記分成段節: 將日記分成不同的段落或部分，以便更好地釐清思緒和情境。這可以讓讀者更容易追蹤並理解您的主題。
7. 加入自我刺激與反省: 在日記中加入女性角色的自我反省和自我刺激是個好方法，可以讓日記更有深度和真實感。
8. 用現實語言來表達: 將日記中的內容寫成現在的形式，而不是過去或未來的形式，這樣讀者就可以更直接地參與女性角色的故事。
9. 遵循日記風格和形式: 根據您想要表達的主題和風格，將日記寫成文字或圖片。這可以讓讀者更容易了解女性角色的生活方式和情緒。

【當前章節】：{current_chapter}
【章節大綱/目標】：{chapter_outline}

【角色設定】
姓名：{char_data.get('name', '')}
年齡：{char_data.get('age', '')}
生日：{char_data.get('birthday', '')}
星座：{char_data.get('zodiac', '')}
星座描述：{char_data.get('zodiac_description', '')}
血型：{char_data.get('blood_type', '')}
血型描述：{char_data.get('blood_type_description', '')}
個性類型：{char_data.get('personality_type', '')}
個性描述：{current_personality}
說話口吻：{char_data.get('speech_style', '')}
職業：{char_data.get('occupation', char_data.get('position', ''))}
習慣/興趣：{', '.join(habits)}
外表特徵：{char_data.get('appearance', '')}
目前關係：{char_data.get('relationship', '')}
其他登場角色：{other_chars}
{other_context}

""".strip()

    user_input = f"請撰寫『{section_title}』的內容。"
    return f"{system_prompt}\n\n【當前任務/情境】\n{user_input}\n\n請開始執行（以繁體中文）："



