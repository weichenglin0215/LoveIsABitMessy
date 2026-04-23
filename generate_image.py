import os
import json
import requests
import sys

try:
    # 盡量讓 Windows console 不因 cp950 造成亂碼/炸掉
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

COMFYUI_URL = "http://127.0.0.1:8188/prompt"
COMFYUI_TIMEOUT_SECONDS = int(os.environ.get("LAMB_COMFY_TIMEOUT", "8"))

def generate_image(story_filename=None):
    stories_dir = 'diaries'
    
    # 如果沒傳入檔名，自動抓最新的
    if not story_filename:
        if not os.path.exists(stories_dir):
            os.makedirs(stories_dir)
        story_files = [f for f in os.listdir(stories_dir) if f.endswith('.json')]
        if not story_files:
            print("找不到任何故事檔。")
            return
        story_filename = sorted(story_files)[-1]

    # print(f"根據故事檔生成圖片: {story_filename}") # 減少輸出
    
    file_path = os.path.join(stories_dir, story_filename)
    with open(file_path, 'r', encoding='utf-8') as f:
        story_data = json.load(f)

    prompt_text = story_data.get('image_prompt', '')
    dest_img_name = story_filename.replace('.json', '.png')
    
    workflow_path = 'comfy_workflows/character_portrait.json'
    if not os.path.exists(workflow_path):
        print(f"Error: 找不到 {workflow_path}")
        return

    with open(workflow_path, 'r', encoding='utf-8') as f:
        workflow_data = json.load(f)

    # 尋找並替換 Prompt
    found = False
    for node_id, node in workflow_data.items():
        if node.get('class_type') in ['CLIPTextEncode', 'CLIPTextEncodeSDXL']:
            if 'text' in node.get('inputs', {}):
                node['inputs']['text'] = prompt_text
                found = True
                break
    
    # print("\n" + "="*50)
    # print("【DEBUG: 圖片生成 PROMPT】")
    # print(prompt_text)
    # print("="*50 + "\n")

    payload = {"prompt": workflow_data}
    try:
        response = requests.post(COMFYUI_URL, json=payload, timeout=COMFYUI_TIMEOUT_SECONDS)
        response.raise_for_status()
        print(f"✅ 已送至 ComfyUI。請確保儲存檔名為: images/{dest_img_name}")
    except requests.exceptions.ConnectionError:
        print(f"❌ ComfyUI 連線失敗 (請確認 ComfyUI 已啟動於 8188 埠)")
    except Exception as e:
        print(f"❌ 圖片生成請求失敗: {e}")

if __name__ == "__main__":
    fn = sys.argv[1] if len(sys.argv) > 1 else None
    generate_image(fn)
