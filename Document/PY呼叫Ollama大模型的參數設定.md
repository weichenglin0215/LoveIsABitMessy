在使用 Python 呼叫 Ollama API 時，參數主要分為 請求基礎參數 與 模型運算參數 (Options) 兩大類。

以下是常用且實用的參數整理：

1. 請求基礎參數 (Payload 頂層)
這些參數決定了 API 的基本行為。

參數 | 型別 | 說明
---|---|---
model | String | 必填。指定模型名稱（如 gemma2:27b）。
prompt | String | 輸入的文本內容。
stream | Boolean | 預設 True。是否以流式傳輸回傳結果。
format,String,"若設為 ""json""，則模型會強制輸出 JSON 格式。"
images,List,傳遞 base64 編碼的圖片（僅限多模態模型）。
system,String,覆蓋模型原本的 System Prompt。


2. 模型運算參數 (options 內層)
這些參數控制生成的隨機性、長度與硬體資源分配。

控制生成質量 (品質與隨機性)
temperature: (Float) 數值越高越隨機（如 0.8），越低越嚴謹（如 0.2）。
top_p: (Float) 核取樣。數值越小，只會從機率最高的 token 中選擇，減少胡說八道。
top_k: (Integer) 限制模型只從機率前 K 名的候選詞中選擇。
repeat_penalty: (Float) 防止模型重複說同樣的話。通常設為 1.1 ~ 1.2。

控制資源與長度 (解決效能問題)
num_ctx: (Integer) 上下文長度。對於你的 16G 顯存，若模型太大，請縮小此值（如 2048 或 4096）以避免 OOM（顯存溢出）。
num_predict: (Integer) 最大生成 Token 數。設為 -1 則由模型自行決定終點。
num_gpu: (Integer) 強制指定載入到 GPU 的層數（Layers）。在 VRAM 臨界點時非常有用。
num_thread: (Integer) 使用 CPU 運算時的執行緒數量。

進階採樣控制
stop: (List) 設定停止詞。當模型生成這些詞時會立即中斷。例如 ["\nUser:"]。
mirostat: (Integer) 0=禁用, 1=Mirostat, 2=Mirostat 2.0。一種動態調整溫度的技術。

3. 實際程式碼範例
```python
import requests
import json

url = "http://localhost:11434/api/generate"

payload = {
    "model": "gemma-4-31B-it-abliterated-Q3_K_M",
    "prompt": "請解釋量子力學",
    "stream": False,
    "options": {
        # 效能優化建議：16GB VRAM 跑 31B 模型，建議降低上下文
        "num_ctx": 4096,
        "num_gpu": 32,          # 視模型層數而定
        "temperature": 0.7,
        "top_p": 0.9,
        "num_predict": 1024,
        "repeat_penalty": 1.1,
        "stop": ["User:", "AI:"] 
    }
}

response = requests.post(url, json=payload)
print(response.json()['response'])
```

4. 針對 16GB VRAM / 31B 模型 的建議設定
考量到你的硬體限制，以下是一組穩定的建議值：

Model： gemma-4-31b-it-abliterated-Q3_K_M (因已量子化，負擔較輕)
num_ctx： 4096 (減少上下文長度，避免 OOM)
num_gpu： 28~32 (視模型具體層數而定)
top_k： 40 (限制模型選擇範圍)
top_p： 0.9
temperature： 0.7 (創造一點驚喜，但又不會太瘋)
repeat_penalty： 1.1
num_predict： -1 (讓模型自己決定何時結束，或設為 2048 避免跑太久)