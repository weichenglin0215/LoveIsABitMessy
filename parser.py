import re
import json
import os

def parse_questions():
    # 來源文件路徑：LPAS 愛情人格特質評量表的完整企劃書（純文字檔）
    file_path = 'Document/LPAS愛情人格特質評量表_完整企劃書.txt'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 從完整文件中擷取「題目區塊」
    # start_str：題目區塊的起始標記（第一部分：還在猜的時候）
    # end_str：題目區塊的結束標記（第四章，代表題目部分已結束）
    start_str = "第一部分：還在猜的時候"
    end_str = "第四章"

    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    # 若找不到起始或結束標記，代表格式可能有異動，
    # 此時退而求其次，直接使用整份文件內容進行解析
    if start_idx == -1 or end_idx == -1:
        q_text = content
    else:
        q_text = content[start_idx:end_idx]

    questions = []
    # current_period：目前所屬的「階段」分類
    # 1 = 曖昧期, 2 = 熱戀期, 3 = 失戀期
    current_period = 1 # 1: 曖昧, 2: 熱戀, 3: 失戀
    # current_dim：目前所屬的「面向／維度」分類（依標題關鍵字判斷）
    current_dim = 1

    # 逐行掃描題目區塊文字，依序判斷目前所在的階段／維度，
    # 並以正規表示式擷取符合題目格式的行（例如：Q01 [正] 題目文字...）
    for line in q_text.splitlines():
        line = line.strip()
        if not line:
            continue

        # 依關鍵字切換目前所屬的「階段」（曖昧期／熱戀期／失戀期）
        if "【曖昧期】" in line: current_period = 1
        elif "【熱戀期】" in line: current_period = 2
        elif "【失戀期】" in line: current_period = 3
        # 依關鍵字切換目前所屬的「維度」（1~4，分別對應不同的人格特質面向）
        elif "靠近與表達" in line: current_dim = 1
        elif "受傷消化" in line: current_dim = 2
        elif "告別疏遠" in line: current_dim = 3
        elif "關係節奏" in line: current_dim = 4

        # 比對題目格式，例如：Q01 [正] 題目內容
        # group(1)：題目代碼（如 Q01）
        # group(2)：正／反向計分標記
        # group(3)：題目文字內容
        m = re.search(r'(Q\d{2})\s*\[([正反])\]\s*(.*)', line)
        if m:
            q_code = m.group(1)
            # 「正」向題目計分方向為 1，「反」向題目計分方向為 -1（反向計分）
            direction = 1 if m.group(2) == '正' else -1
            text = m.group(3).strip()

            # 將解析出的單一題目資訊，組成字典後加入題目清單
            questions.append({
                "id": q_code,
                "period": current_period,
                "dimension": current_dim,
                "direction": direction,
                "text": text
            })

    # 若完全沒有解析到任何題目，印出錯誤訊息並中止，不產生輸出檔案
    if not questions:
        print("Failed to parse questions. Found 0.")
        return

    # 將題目清單轉換為 JavaScript 常數宣告字串（JSON 格式，保留中文不轉義）
    js_code = "const LPAS_QUESTIONS = " + json.dumps(questions, ensure_ascii=False, indent=4) + ";\n"
    # 將產生的 JavaScript 內容寫入前端使用的題目資料檔
    with open('web/js/questions.js', 'w', encoding='utf-8') as jsf:
        jsf.write(js_code)
    print(f"Successfully generated js/questions.js with {len(questions)} questions.")

# 主程式進入點：執行題目解析與 JS 檔案產生流程
parse_questions()
