# 4060ti 16GB
## LLM參數設定
temperature: 1.1
repeat_penalty: 1.2
top_p: 1.0
top_k: 60
num_ctx: 16384
num_predict: 8192

## 美如日記，要求3000字。
* 成人甜寵+小說劇本式寫作風格。
* 秒數取用第二次產出，避免計算到載入時間。
- gemma4:e4b，9.6 GB，1700字，55秒，30字/秒，文筆偏硬，容易出現文青式的分析內心戲。(2026/05/26)
- VladimirGav/Qwen3.6-27B-16GB-VRAM-Uncensored:latest，15 GB，一直出錯又超慢的。
- VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest，13 GB，一直出錯又超慢的。
- sorc/qwen3.5-instruct-uncensored:9b，9.5 GB，3600字，112秒，32字/秒，(`優選`)以動作描述為主，但是兩篇幾乎一模一樣。(2026/05/26)
- fredrezones55/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b，6.3 GB，1600字，27秒，59字/秒，充滿文青獨白與分析，竟然寫出三選一問題。(2026/05/26)
- nexusriot/Gemma-4-Uncensored-HauhauCS-Aggressive:e4b，6.3 GB，1300字，47秒，26字/秒，分別說明場景、視覺、聽覺、動作、獨白，似乎把提示詞當成命令。(2026/05/26)
- fredrezones55/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive:IQ2_M，12 GB，3700字，90秒，約41字/秒。非常不穩定，有時候只寫幾個字或是寫很長，以動作描述為主，文字有溫度，容易過度形容。(2026/05/26)
- huihui_ai/gemma-4-abliterated:e4b，9.6 GB，786字，30秒，約25字/秒，(`首選`，參數請用標準值，避免過度發散)文筆偏軟，主要形容動作與場景，有點多的文青式的分析內心戲。(2026/05/26)
- qwen3.5:9b，6.6 GB，800字，150秒，5字/秒，(`文筆優選`)有溫度的敘事描述，略帶文青風。(2026/05/26)
- gemma-4-31B-it-abliterated-Q2_K_M:latest，11 GB，很容易出錯且非常耗時。(2026/05/26)
- ikiru/Dolphin-Mistral-24B-Venice-Edition:latest，13 GB，
- dolphin-mistral:latest，4.1 GB，