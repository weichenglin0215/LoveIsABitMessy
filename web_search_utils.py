# -*- coding: utf-8 -*-
"""網路搜尋輔助工具：DuckDuckGo HTML 版 + Tavily API + 網頁抓取。

用途：
    供 debug_server.py 的「多文改寫」/「網路搜尋並依序改寫」任務在改寫前
    先透過網路搜尋補充事實資料，將整理後的參考資料段落塞入送給 AI 的提示詞裡。

三個來源：
    1. suggested_urls：使用者手動填的網址，優先抓取。
    2. use_duckduckgo：走 html.duckduckgo.com 免費爬蟲。
    3. use_tavily：呼叫 Tavily Search API。

品質控管（本次強化）：
    - 每筆抓回來的原始內容都會先 print 到 CMD，方便使用者檢視搜尋來源。
    - _clean_snippet() 去除 URL / markdown 連結圖片 / 純導覽列項目。
    - _is_useful() 判斷是否為「無效」內容（如：百度安全驗證、Wiki 多語連結列表）。
    - 每筆內容截斷在 2000 字內，優先於段落／句號邊界截斷。
    - 提示詞中不再輸出網址（對地端 LLM 無意義），只保留標題 + 淨化後的內容。
"""

import re
import sys
import requests
from typing import List, Dict, Callable, Optional

try:
    # BeautifulSoup 用於清理 HTML 標籤，取得純文字
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False


# 通用 User-Agent，避免部分網站直接擋掉 Python requests
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    )
}

# 單筆內容截斷上限（超過就從段落／句號邊界截）
_SNIPPET_MAX_CHARS = 2000

# 一眼可判定「無效」的關鍵句：命中任一個就直接丟棄整筆
_BAD_MARKERS = (
    "百度安全验证", "百度安全驗證",
    "安全验证", "安全驗證",
    "请完成验证", "請完成驗證",
    "captcha",
    "访问过于频繁", "訪問過於頻繁",
    "系统检测到您的请求", "系統檢測到您的請求",
    "the page you are looking for cannot be found",
    "404 not found", "403 forbidden",
    "please enable javascript",
    "cloudflare",
)


# ── 內部工具：CMD 完整顯示原始搜尋回傳 ──────────────────────────────────────────
def _dump_raw_to_stdout(source: str, item_idx: int, title: str, url: str, raw: str) -> None:
    """把單筆搜尋回傳的原始資料完整印到 CMD，方便使用者檢視搜尋到什麼。

    debug_server 在啟動時已 sys.stdout.reconfigure(encoding='utf-8')，這裡直接 print 即可。
    """
    try:
        print("\n" + "─" * 78, flush=True)
        print(f"[網路搜尋原始資料] 來源={source}  第 {item_idx} 筆", flush=True)
        print(f"標題：{title}", flush=True)
        print(f"網址：{url}", flush=True)
        print(f"長度：{len(raw)} 字", flush=True)
        print("── 內容原文開始 ──", flush=True)
        print(raw if raw else "（空）", flush=True)
        print("── 內容原文結束 ──", flush=True)
    except Exception as e:
        # 印 log 失敗絕不能影響主流程
        try:
            print(f"[網路搜尋原始資料] print 失敗：{e}", flush=True)
        except Exception:
            pass


# ── 內部工具：內容淨化 ──────────────────────────────────────────────────────────
def _clean_snippet(text: str) -> str:
    """把 fetch 或 tavily 回傳的原始文字整理成「AI 好讀」的乾淨文字。

    做的事：
        1. Markdown 連結 [text](url) → 只保留 text；純圖片 ![alt](url) 整段丟掉
        2. 移除裸露的 http(s):// URL
        3. 逐行過濾：
           - 純以列表符號 `*` / `-` / `#` 開頭且不含中日文字的（多為導覽列）
           - 內容過短（1~2 個字）且不像句子結尾的
           - 只有標點符號、括弧、豎線的
        4. 折疊多餘空白 / 空行
    """
    if not text:
        return ""

    s = text

    # 1) markdown 圖片先整段刪
    s = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", s)
    # 2) markdown 連結：保留可讀文字
    s = re.sub(r"\[([^\]]*)\]\([^)]+\)", r"\1", s)
    # 3) 移除裸露 URL
    s = re.sub(r"https?://\S+", "", s)
    # 4) 移除多國語言側邊欄常見符號組合 `– 阿拉伯文`、`– 英文` 等（trailing）
    s = re.sub(r"\s*[–—-]\s*[一-鿿]{1,10}文\s*$", "", s, flags=re.MULTILINE)

    kept_lines: List[str] = []
    for raw_ln in s.splitlines():
        ln = raw_ln.strip()
        if not ln:
            continue
        # 只由符號、括弧、|、·、• 等構成
        if not re.search(r"[一-鿿぀-ヿA-Za-z0-9]", ln):
            continue
        # 「跳到主要內容 / 跳去內容 / Skip to content」這類無用文字
        if re.search(r"跳(到|去).{0,4}(內容|主要)", ln) or "Skip to content" in ln:
            continue
        # 只剩 markdown 標題符號＋很短文字的目錄項（`# 目錄`、`## 內容`）
        if re.match(r"^#{1,6}\s*$", ln):
            continue
        # 目錄／編輯區行為（維基頁面常見）
        if ln in ("編輯", "编辑", "查嘢", "查看", "目錄", "目录"):
            continue
        # 剩下就當作可用內容
        kept_lines.append(ln)

    cleaned = "\n".join(kept_lines)
    # 折疊 3 個以上連續換行成 2 個
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _truncate_smart(text: str, max_chars: int = _SNIPPET_MAX_CHARS) -> str:
    """截斷到 max_chars，但盡量在段落 / 句號 / 逗號的邊界收尾，避免半句話。"""
    if len(text) <= max_chars:
        return text
    slice_ = text[:max_chars]
    # 依序嘗試：雙換行 → 單換行 → 中文句號／！／？ → 英文句號
    for sep in ("\n\n", "\n", "。", "！", "？", "!", "?", ".", "，", ","):
        idx = slice_.rfind(sep)
        if idx > max_chars * 0.5:  # 至少留一半內容
            return slice_[:idx + len(sep)].rstrip() + "……"
    return slice_.rstrip() + "……"


def _is_useful(cleaned: str) -> bool:
    """判斷淨化後的內容值不值得餵給 LLM。

    篩掉：
        - 太短（< 80 字，通常是驗證頁、404 之類）
        - 命中 _BAD_MARKERS 任一
        - 中日英字元密度過低（多為連結導覽列）
    """
    if not cleaned:
        return False
    low = cleaned.lower()
    for bad in _BAD_MARKERS:
        if bad in low:
            return False
    if len(cleaned) < 80:
        return False
    # 中日英文字元密度：低於 40% 視為導覽列（例如維基語言側欄）
    meaningful = len(re.findall(r"[一-鿿぀-ヿA-Za-z0-9]", cleaned))
    if meaningful / max(1, len(cleaned)) < 0.4:
        return False
    return True


# ── 對外：抓單頁 ────────────────────────────────────────────────────────────────
def fetch_page(url: str, timeout: int = 12) -> str:
    """抓取單一網頁，回傳「原始純文字」（不淨化、不截斷）。

    淨化與截斷交給 _clean_snippet + _truncate_smart，
    這樣呼叫方可以先把原始版本印到 CMD 給使用者看。
    """
    if not _HAS_BS4:
        return ""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=timeout)
        resp.encoding = resp.apparent_encoding or resp.encoding
        soup = BeautifulSoup(resp.text, "html.parser")
        # 移除完全無閱讀價值的區塊
        for tag in soup(["script", "style", "nav", "header", "footer",
                         "aside", "noscript", "form", "iframe"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        # 只做「去空行、去左右空白」等基本清理；連結／markdown 交給 _clean_snippet
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        return "\n".join(lines)
    except Exception:
        return ""


# ── 對外：DuckDuckGo 搜尋 ──────────────────────────────────────────────────────
def duckduckgo_search(query: str, max_results: int = 6) -> List[Dict]:
    """透過 DuckDuckGo HTML 版做免費搜尋。

    做法：
        1. 對搜尋結果頁 parse title / url / snippet
        2. 對每個 url 再打一次 fetch_page 抓完整內容
        3. 每筆抓到的原始內容都會 print 到 CMD
        4. 逐筆判斷是否值得留，值得就淨化 + 截斷後回傳
    回傳格式：[{"title": str, "url": str, "snippet": str（已淨化）}, ...]
    """
    if not _HAS_BS4 or not query:
        return []
    results: List[Dict] = []
    try:
        list_url = "https://html.duckduckgo.com/html/?q=" + requests.utils.quote(query)
        resp = requests.get(list_url, headers=_HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")
        raw_hits = soup.find_all("div", class_="result__body")[:max_results]

        idx = 0
        for r in raw_hits:
            a = r.find("a", class_="result__a")
            if not a:
                continue
            link = a.get("href", "") or ""
            if link.startswith("//"):
                link = "https:" + link
            title = a.get_text(strip=True) or "(no title)"
            snippet_tag = r.find("a", class_="result__snippet")
            snippet_summary = snippet_tag.get_text(strip=True) if snippet_tag else ""

            idx += 1
            # 抓完整內容，若失敗就以搜尋結果頁的 snippet_summary 遞補
            page_text = fetch_page(link) if link else ""
            combined_raw = page_text or snippet_summary

            # 完整原文 → CMD（未淨化前）
            _dump_raw_to_stdout("DuckDuckGo", idx, title, link, combined_raw)

            cleaned = _clean_snippet(combined_raw)
            if not _is_useful(cleaned):
                print(f"[網路搜尋] DuckDuckGo 第 {idx} 筆判定為低價值，捨棄。", flush=True)
                continue

            cleaned = _truncate_smart(cleaned, _SNIPPET_MAX_CHARS)
            results.append({"title": title, "url": link, "snippet": cleaned})
    except Exception as e:
        print(f"[網路搜尋] DuckDuckGo 例外：{e}", flush=True)
    return results


# ── 對外：Tavily 搜尋 ──────────────────────────────────────────────────────────
def tavily_search(query: str, api_key: str, max_results: int = 6) -> List[Dict]:
    """呼叫 Tavily Search API，含品質篩選與截斷。"""
    if not api_key or not query:
        return []
    try:
        resp = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": max_results,
                "include_raw_content": True,
                "include_answer": False,
            },
            timeout=30,
        )
        data = resp.json() if resp.content else {}
        out: List[Dict] = []
        for idx, item in enumerate((data.get("results") or [])[:max_results], 1):
            title = item.get("title", "") or "(no title)"
            url = item.get("url", "") or ""
            raw = item.get("raw_content") or item.get("content") or ""

            # 完整原文 → CMD（未淨化前）
            _dump_raw_to_stdout("Tavily", idx, title, url, raw)

            cleaned = _clean_snippet(raw)
            if not _is_useful(cleaned):
                print(f"[網路搜尋] Tavily 第 {idx} 筆判定為低價值，捨棄。", flush=True)
                continue

            cleaned = _truncate_smart(cleaned, _SNIPPET_MAX_CHARS)
            out.append({"title": title, "url": url, "snippet": cleaned})
        return out
    except Exception as e:
        print(f"[網路搜尋] Tavily 例外：{e}", flush=True)
        return []


# ── 對外：組合三種來源，輸出給提示詞用的段落 ────────────────────────────────────
def build_search_context(
    query: str,
    use_duckduckgo: bool = False,
    use_tavily: bool = False,
    tavily_api_key: str = "",
    suggested_urls: Optional[List[str]] = None,
    max_results_per_engine: int = 5,
    log_fn: Optional[Callable[[str], None]] = None,
) -> str:
    """整合三種來源，回傳可直接嵌入 prompt 的參考資料段落。

    提示詞版面（依使用者要求）：
        - 保留：來源編號、標題、內容
        - 不放：URL（對地端 LLM 無意義）
    """
    def _log(msg: str):
        if log_fn:
            log_fn(msg)

    entries: List[Dict] = []

    # 1) 使用者指定 URL 優先抓取
    if suggested_urls:
        _log(f">> [搜尋] 抓取使用者指定的 {len(suggested_urls)} 個網址...")
        for idx, url in enumerate(suggested_urls, 1):
            raw = fetch_page(url)
            _dump_raw_to_stdout("使用者指定 URL", idx, url, url, raw)
            if not raw:
                _log(f"   ⚠️ 抓取失敗或內容為空：{url}")
                continue
            cleaned = _clean_snippet(raw)
            if not _is_useful(cleaned):
                _log(f"   ⚠️ 判定為低價值（如驗證頁 / 過短 / 純導覽列），捨棄：{url}")
                continue
            cleaned = _truncate_smart(cleaned, _SNIPPET_MAX_CHARS)
            entries.append({"title": "使用者指定來源", "url": url, "snippet": cleaned})
            _log(f"   ✅ 已抓取並保留 {len(cleaned)} 字：{url}")

    # 2) DuckDuckGo 免費搜尋
    if use_duckduckgo and query:
        _log(f">> [搜尋] DuckDuckGo 查詢：{query}")
        ddg = duckduckgo_search(query, max_results=max_results_per_engine)
        _log(f"   有效結果：{len(ddg)} 筆")
        entries.extend(ddg)

    # 3) Tavily API 搜尋
    if use_tavily and tavily_api_key and query:
        _log(f">> [搜尋] Tavily 查詢：{query}")
        tv = tavily_search(query, tavily_api_key, max_results=max_results_per_engine)
        _log(f"   有效結果：{len(tv)} 筆")
        entries.extend(tv)

    if not entries:
        return ""

    # 組成給 LLM 的段落（不放 URL）
    lines: List[str] = [
        "以下是從網路收集到的有效參考資料，請在改寫時擇要引用其中的事實與細節：\n"
    ]
    for i, r in enumerate(entries, 1):
        lines.append(f"【資料 {i}】{r.get('title', '') or '（無標題）'}")
        snippet = r.get("snippet", "") or ""
        if snippet:
            lines.append(f"內容：{snippet}")
        lines.append("")
    return "\n".join(lines)
