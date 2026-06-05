# 4060ti 16GB
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
- (`3次選`)gemma4:e4b，9.6 GB，1700字，55秒，30字/秒，文筆偏硬，容易出現文青式的分析內心戲。(2026/05/26)
- VladimirGav/Qwen3.6-27B-16GB-VRAM-Uncensored:latest，15 GB，一直出錯又超慢的。
- VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest，13 GB，一直出錯又超慢的。
- (`2優選`)sorc/qwen3.5-instruct-uncensored:9b，9.5 GB，3600字，112秒，32字/秒，以動作描述為主，但是兩篇幾乎一模一樣。(2026/05/26)
- fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b，6.3 GB，1600字，27秒，59字/秒，充滿文青獨白與分析，竟然寫出三選一問題。(2026/05/26)
- nexusriot/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b，6.3 GB，1300字，47秒，26字/秒，分別說明場景、視覺、聽覺、動作、獨白，似乎把提示詞當成命令。(2026/05/26)
- fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:IQ2_M，12 GB，3700字，90秒，約41字/秒。非常不穩定，有時候只寫幾個字或是寫很長，以動作描述為主，文字有溫度，容易過度形容。(2026/05/26)
- (`1首選`)huihui_ai/gemma-4-abliterated:e4b，9.6 GB，786字，30秒，約25字/秒，`參數請用標準值`，避免過度發散，文筆偏軟，主要形容動作與場景，有點多的文青式的分析內心戲。(2026/05/26)
- (`2文筆優選`)qwen3.5:9b，6.6 GB，800字，150秒，5字/秒，有溫度的敘事描述，略帶文青風。(2026/05/26)
- gemma-4-31B-it-abliterated-Q2_K_M:latest，11 GB，很容易出錯且非常耗時。(2026/05/26)
- ikiru/Dolphin-Mistral-24B-Venice-Edition:latest，13 GB，
- dolphin-mistral:latest，4.1 GB，


# 4090 24GB
## LLM參數設定
temperature: 1.1
repeat_penalty: 1.2
top_p: 1.0
top_k: 60
num_predict: 8192
num_ctx: 16384

## 以色情小說筆法撰寫，要求2000字。
* 秒數取用第二次產出，避免計算到載入時間。

- huihui_ai/Qwen3.6-abliterated:27b，17GB，品質好速度中上 會有長串的思考過程，感覺還是偏理性分析。
- tinyrick/gemma-4-31B-it-uncensored-heretic-llmfan46:Q4_K_M，18GB，品質中上速度中上
- fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:IQ4_XS，19GB，一直重複寫出思考過程，品質中等，速度快34秒
- fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:Q4 ，22GB，一直重複寫出思考過程，品質中上，160秒很慢。
- huihui_ai/gemma-4-abliterated:e4b ，9.6GB，太文青不敢直白描述，經常出現`簡體`，`超快`。3.3秒
- GX-Telecom/gemma-4-26B-A4B-it-ultra-uncensored-heretic-Q5-APEX:latest，19GB，過度理性分析，甚至出現條列式分析，速度快10秒，品質太硬
- juilpark/gemma-4-31B-it-uncensored-heretic:q4_k_m ，18GB，速度中上41秒品質中上，能抓到`寫作重點`。
- huihui_ai/gemma-4-abliterated:31b ，19GB，`首選`，加上過程範本會更好。42秒
- fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b ，6.3 GB，`首選`，但不夠露骨，`超快`6秒
- Agen/gemma-4-26B-A4B-it-uncensored-heretic:latest，17GB，中上速度中上品質，`快速`11秒
- VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest，13 GB，有點理性，尚可，`快速`11秒
- gemma-4-31B-it-abliterated-Q5_K_M:latest ，21GB，理性又慢79秒