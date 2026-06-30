# 4060ti 16GB。
## 上下文限制
- 雖然gemma4跟Qwen3.6都支援256k(262144)上下文，但是過多的上下文會耗費大量VRAM導致速度變很慢且亂回答。
- ⭕若使用容量15GB的模型時，上下文勿超過`8192`，否則會明顯變慢。
- ⭕若使用容量13GB的模型時，上下文勿超過`65536`，否則會明顯變慢。
- ⭕若使用容量10GB以下的模型時，上下文勿超過`131072`，否則會明顯變慢。

## LLM參數設定
temperature: 1.1
repeat_penalty: 1.2
top_p: 1.0
top_k: 60
num_predict: 8192
num_ctx: 16384

## 美如日記，要求3000字。
* 成人甜寵+小說劇本式寫作風格。
* 秒數取用第二次產出，避免計算到載入時間。
- ✅✅✅⭕`小說首選、日記首選、生圖提示詞`VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest，13 GB，優點是能完全依照大綱，但文青式說明略多(必須特別禁止)，對白與動作可以。
- ✅✅✅❌`無法日記、生圖提示詞`VladimirGav/Qwen3.6-27B-16GB-VRAM-Uncensored:latest，15 GB，在4060 16GB VRAM 只能使用上下文 `8192`，超過就明顯變慢。第一段能依照要求撰寫，第二段出乎意料的優秀。
- ✅✅❌`無法日記、生圖提示詞`sorc/qwen3.5-instruct-uncensored:9b 9.5GB，3600字，112秒，32字/秒，以動作描述為主，很細膩的文筆，略慢的描述細節，文青味略重，創意較低，執行速度偏慢。(2026/05/26)
- ✅✅❌`無法日記、生圖提示詞`fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:Q2_K_P  15 GB，3700字，90秒，約41字/秒。能抓到關鍵重點，字數控制得宜，對白偏少，速度不快。創意不多，即使重寫也差不多。(2026/05/26)
- ✅✅❌`無法日記、生圖提示詞`fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:IQ2_M，12 GB，3700字，90秒，約41字/秒。能抓到關鍵重點，字數控制得宜，對白偏少，速度不快。創意不多，即使重寫也差不多。有可能會重複輸出同樣的文字。(2026/05/26)
- ✅⭕`快速聊天、日記、生圖提示詞`，huihui_ai/gemma-4-abliterated:e4b，9.6 GB，786字，30秒，約25字/秒，避免過度發散，字數過多，文筆偏硬，容易出現文青式的分析內心戲，不敢直白描述，必須要字數較多的劇情大綱來引導才敢寫出肉體接觸。(2026/05/26)
- ✅fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b，6.3 GB，1600字，27秒，59字/秒，過度分析與文青味，字數過多且重複描述有點亂，執行速度快。(2026/05/26)
- ❌ nexusriot/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b，6.3 GB，1300字，47秒，26字/秒，理性分析過多，文青式內心戲過多，字數也太多。分別說明場景、視覺、聽覺、動作、獨白，似乎把提示詞當成命令。(2026/05/26)
- ✅✅`文筆優選、略快`，qwen3.5:9b，6.6 GB，800字，150秒，5字/秒，有溫度的敘事描述，略帶文青風。(2026/05/26)
- ✅⭕`快速聊天、日記、生圖提示詞、無破解測試用`，gemma4:e4b，9.6 GB，1700字，55秒，30字/秒，文筆偏硬，容易出現文青式的分析內心戲，不敢瑟瑟，常簡體。(2026/05/26)
- ❌❌ gemma-4-31B-it-abliterated-Q2_K_M:latest，11 GB，很容易出錯且非常耗時。(2026/05/26)
- ❌ ikiru/Dolphin-Mistral-24B-Venice-Edition:latest，13 GB，
- ❌ dolphin-mistral:latest，4.1 GB，


# 4090 24GB
## 上下文限制
- 雖然gemma4跟Qwen3.6都支援256k(262144)上下文，但是過多的上下文會耗費大量VRAM導致速度變很慢且亂回答。
- ⭕若使用容量20GB的模型時，上下文勿超過`8192`，否則會明顯變慢。
- ⭕若使用容量17GB的模型時，上下文勿超過`65536`，否則會明顯變慢。
- ⭕若使用容量13GB以下的模型時，上下文勿超過`131072`，否則會明顯變慢。
- ⛔❌🚫別使用20GB以上的模型，根本沒有上下文的空間，立刻就爆記憶體，速度變很慢且會亂回答。

## LLM參數設定
temperature: 1.1
repeat_penalty: 1.2
top_p: 1.0
top_k: 60
num_predict: 8192
num_ctx: 16384

## 以色情小說筆法撰寫，要求2000字。
* 秒數取用第二次產出，避免計算到載入時間。

- ✅✅✅✅⭕`小說首選、日記首選、生圖提示詞`Agen/gemma-4-26B-A4B-it-uncensored-heretic:latest，17GB，品質優，速度快，文字略粗有情緒情感，適合言情，能堆疊情緒，關鍵詳細，分析有情緒。11秒
- ✅✅✅✅⭕`小說次選、日記次選、生圖提示詞`VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest，13 GB，文字略粗有情緒情感，品質優能呈現出戲劇性，`快速`11秒，上下文得開到32768或以上，不然無法輸出或輸出不全。
- ✅✅✅⭕`小說次選、日記次選、QWEN竟然可以生圖提示詞`fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:IQ4_XS，19GB，品質佳，速度很快34秒，會詳細描寫關鍵，會鋪陳會收尾。，上下文得開到32768或以上，不然無法輸出或輸出不全。
- ✅✅✅❌mridiot918/qwen3.6-27b-uncensored:latest 17GB，很會寫過程，也很容易陷入思考無限迴圈。
- ✅✅✅⭕`小說次選、日記次選、生圖提示詞`huihui_ai/gemma-4-abliterated:31b ，19GB，VRAM快用完，品質好，速度中上，字數略多可控，情緒起伏夠，關鍵詳細，理性分析會帶入情緒。42秒。
- ✅✅✅❌fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:Q4 ，22GB，上下文勿超過`8192`，品質優，160秒速度慢，很會寫關鍵細節，會鋪陳會收尾，夠專業夠吸引人。
- ✅✅juilpark/gemma-4-31B-it-uncensored-heretic:q4_k_m ，18GB，速度中上41秒品質中上，能抓到`寫作重點`。
- ✅✅❌`無法日記、生圖提示詞`huihui_ai/Qwen3.6-abliterated:27b，17GB，品質好，速度中等，字數可控，情緒起伏夠，關鍵不夠詳細，理性分析會帶入情緒。有亦舒味道。可惜無法生圖，文筆太好也不適合寫日記。
- ✅gemma-4-31B-it-abliterated-Q5_K_M:latest ，21GB，除了標題或分段落有些理性說明之外，能掌握關鍵與節奏，能勾起慾望，速度略慢，79秒。
- ❌tinyrick/gemma-4-31B-it-uncensored-heretic-llmfan46:Q4_K_M，18GB，品質中上，速度中上，理性分析過多，直接列出一下三段，情緒轉換太快，關鍵細節描述不足。
- ❌GX-Telecom/gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q5-APEX:latest，19GB，過度理性分析，甚至出現條列式分析，速度快10秒，品質太硬
- ✅✅✅VladimirGav/Qwen3.6-27B-16GB-VRAM-Uncensored:latest，15 GB，第一段能依照要求撰寫，第二段出乎意料的優秀。
- ✅✅✅VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest，13 GB，優點是能完全依照大綱，但文青式說明略多(必須特別禁止)，對白與動作可以。
