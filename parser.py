import re
import json
import os

def parse_questions():
    file_path = 'Document/LPAS愛情人格特質評量表_完整企劃書.txt'
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract the block
    start_str = "第一部分：還在猜的時候"
    end_str = "第四章"
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)
    
    if start_idx == -1 or end_idx == -1:
        q_text = content
    else:
        q_text = content[start_idx:end_idx]
    
    questions = []
    current_period = 1 # 1: 曖昧, 2: 熱戀, 3: 失戀
    current_dim = 1
    
    for line in q_text.splitlines():
        line = line.strip()
        if not line:
            continue
        
        if "【曖昧期】" in line: current_period = 1
        elif "【熱戀期】" in line: current_period = 2
        elif "【失戀期】" in line: current_period = 3
        elif "靠近與表達" in line: current_dim = 1
        elif "受傷消化" in line: current_dim = 2
        elif "告別疏遠" in line: current_dim = 3
        elif "關係節奏" in line: current_dim = 4
        
        m = re.search(r'(Q\d{2})\s*\[([正反])\]\s*(.*)', line)
        if m:
            q_code = m.group(1)
            direction = 1 if m.group(2) == '正' else -1
            text = m.group(3).strip()
            
            questions.append({
                "id": q_code,
                "period": current_period,
                "dimension": current_dim,
                "direction": direction,
                "text": text
            })
            
    if not questions:
        print("Failed to parse questions. Found 0.")
        return
        
    js_code = "const LPAS_QUESTIONS = " + json.dumps(questions, ensure_ascii=False, indent=4) + ";\n"
    with open('web/js/questions.js', 'w', encoding='utf-8') as jsf:
        jsf.write(js_code)
    print(f"Successfully generated js/questions.js with {len(questions)} questions.")

parse_questions()
