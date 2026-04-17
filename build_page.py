import os
import json
import glob
import shutil
from jinja2 import Environment, FileSystemLoader

try:
    # 盡量讓 Windows console 不因 cp950 造成亂碼/炸掉
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

def build_page():
    stories_dir = 'stories'
    web_dir = 'web'   # templates / source assets
    out_dir = 'docs'  # GitHub Pages source (Settings -> Pages -> /docs)
    env = Environment(loader=FileSystemLoader(web_dir))
    
    try:
        template = env.get_template('template.html')
    except Exception as e:
        print(f"載入 template.html 失敗: {e}")
        return

    story_files = glob.glob(os.path.join(stories_dir, '*.json'))
    if not story_files:
        print("沒有找到任何故事檔。")
        return

    all_stories = []
    
    for file_path in story_files:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        base_name = os.path.basename(file_path).replace('.json', '') # 例如 2026-04-15_id-001
        html_filename = f"{base_name}.html"
        image_filename = f"{base_name}.png"
        
        rendered_html = template.render(
            character_name=data.get('character_name', '角色'),
            image_filename=image_filename,
            date=data.get('date', ''),
            story=data.get('story', '')
        )
        
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, html_filename)
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(rendered_html)
            
        all_stories.append({
            "date": data.get('date', ''),
            "id": base_name,
            "character_name": data.get('character_name', '角色'),
            "url": html_filename
        })

    # 更新 index.html
    all_stories.sort(key=lambda x: (x['date'], x['id']), reverse=True)
    
    # ... (略，維持原有 index.html 生成邏輯但使用正確連結)
    index_html_content = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"><title>LoveIsABitMessy: 故事列表</title>
<link rel="stylesheet" href="css/lpas_styles.css">
<style>
body {{ display: block; padding: 40px; background-color: var(--c-bg-main); overflow-y: auto; color: white; }}
.story-list {{ max-width: 800px; margin: 0 auto; list-style: none; padding: 0; }}
.story-item {{ margin-bottom: 10px; padding: 10px; border-bottom: 1px solid #333; }}
.story-item a {{ color: var(--c-accent-light); text-decoration: none; display: flex; justify-content: space-between; }}
</style>
</head>
<body>
    <h1 style='text-align:center; font-weight:300;'>LoveIsABitMessy 日記本</h1>
    <div style='text-align:center; margin-bottom:30px;'><a href="lpas.html" class="primary-btn" style="text-decoration:none; padding:10px 20px; border-radius:20px;">做新的人格測驗</a></div>
    <ul class="story-list">
"""
    for s in all_stories:
        index_html_content += f"        <li class='story-item'><a href='{s['url']}'><span>{s['character_name']} 的日記 ({s['id']})</span> <span>{s['date']}</span></a></li>\n"
    
    index_html_content += "    </ul></body></html>"

    with open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(index_html_content)

    # 複製靜態資產到 docs（css/js/主要頁面/images）
    try:
        shutil.copytree(os.path.join(web_dir, 'css'), os.path.join(out_dir, 'css'), dirs_exist_ok=True)
        shutil.copytree(os.path.join(web_dir, 'js'), os.path.join(out_dir, 'js'), dirs_exist_ok=True)
    except Exception as e:
        print(f"⚠️ 複製 web 靜態資產失敗: {e}")

    for page in ['lpas.html', 'admin.html', 'run_daily.html']:
        src = os.path.join(web_dir, page)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(out_dir, page))

    if os.path.isdir('images'):
        try:
            shutil.copytree('images', os.path.join(out_dir, 'images'), dirs_exist_ok=True)
        except Exception as e:
            print(f"⚠️ 複製 images 失敗: {e}")

    # 避免 Windows cp950 主控台遇到 emoji 造成 UnicodeEncodeError
    print(f"[OK] 已編譯 {len(all_stories)} 個日記網頁並輸出到 {out_dir}/，並更新首頁。")

if __name__ == "__main__":
    build_page()
