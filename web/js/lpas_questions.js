const LPAS_QUESTIONS = [
    // ========== 曖昧期 (Period 1) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "喜歡上一個人後，我會主動製造偶遇，多出現在他面前。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "我習慣用通訊軟體傳訊息，慢慢拉近與對方的距離。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "我會找機會輕觸對方的手或肩膀，試探肢體接觸的反應。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "我的表達方式比較含蓄，多半透過書信或小禮物傳遞好感。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "我傾向先觀察對方，很少直接開口邀約見面。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 隱忍等) -----
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧對象讓我難過時，我會直接告訴他我的感受。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "若對方反覆冷淡，我會主動提出「我們是不是該說清楚」。" },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "我無法忍受曖昧中的委屈，寧可早點把話講開。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "就算被對方冷落，我還是會替他找理由，說他只是太忙。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "曖昧期受的傷，我會自己吞下去，不想破壞氣氛。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷離開 vs 藕斷絲連) -----
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "確定對方無意後，我會果斷停止聯絡，不再浪費時間。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "我會刪除對話記錄和社群好友，幫助自己快速抽離。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "曖昧無結果時，我會告訴自己「下一個人會更好」。 " },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "即使知道沒希望，我還是會繼續關注他的動態，放不下。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "我會找朋友幫忙傳話或試探，希望還有一絲轉圜餘地。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧超過一個月沒進展，我會覺得太慢，想加快腳步。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "我希望曖昧期越短越好，趕快確定彼此關係。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "我習慣主動推進節奏，不喜歡被動等待對方表態。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "我覺得曖昧期長一點無妨，慢慢觀察比較安心。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "我不會刻意設定時間表，一切跟著感覺走。" },

    // ========== 熱戀期 (Period 2) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀時我會頻繁用言語說「我愛你」或「我想你」。 " },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "我會安排共同運動或健身，增進兩人的身體互動。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "我習慣每天傳訊息或通話，保持緊密聯繫。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "我比較常用行動表達愛，例如幫忙處理事情或送禮物。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "我不太擅長說甜言蜜語，但會用擁抱和牽手傳達感情。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 越痛越愛等) -----
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "另一半說話傷到我時，我會立刻告訴他「你這樣讓我很難過」。 " },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "我無法忍受委屈，會要求對方當面說清楚。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "若對方一再犯同樣的錯，我會提出暫時分開冷靜。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "越是被另一半傷害，我反而越想抓住他，離不開。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "即使對方讓我痛苦，我也會在外人面前替他講好話。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷分手 vs 尋求協助等) -----
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "感情出現無法修復的問題時，我會主動提分手。" },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "我會封鎖對方的聯絡方式，避免自己回頭。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "我認為長痛不如短痛，分手後立刻展開新生活。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "即使感情很糟，我還是會找共同朋友幫忙勸和。" },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "我會一邊說要分手，一邊又忍不住聯繫對方，反反覆覆。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "熱戀期我希望每天見面，甚至想趕快同居。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "我喜歡感情進展快速，三個月內就帶對方見家人。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "我會主動規劃未來，例如討論結婚或買房。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "我覺得熱戀期不用太黏，保持各自的生活空間更重要。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "我傾向慢慢經營感情，不想被時間壓力綁住。" },

    // ========== 失戀期 (Period 3) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "失戀後我會找朋友哭訴，把情緒全部說出來。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "我會在社群網站抒發心情，讓大家知道我的狀態。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "我會透過運動健身發洩情緒，讓自己累到不想思考。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "我習慣獨處，用書寫或畫畫消化悲傷，不讓別人看見。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "即使很痛，我也會在對方面前保持冷靜，假裝沒事。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 只能我負人等) -----
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "失戀後我會把怨恨說出來，甚至直接罵對方一頓。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "我認為被分手就要立刻反擊，絕不讓對方好過。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "我會主動告訴對方「是你對不起我」，把責任推給他。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "即使被甩了，我還是會幫對方找理由，覺得是自己不夠好。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "我習慣把痛苦往肚裡吞，不想讓任何人知道我有多難過。" },

    // ----- Dim3 告別疏遠 (能否下決心：消失療傷 vs 找新戀情等) -----
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "失戀後我會直接消失，不接電話也不回訊息，專心療傷。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "我會立刻認識新對象，用下一段戀情沖淡痛苦。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "我把所有回憶物品丟掉或封箱，徹底切斷過去。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "我還是會偷偷關注前任的近況，甚至找藉口聯絡他。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "我會不斷回想過去的美好，遲遲無法下定決心離開。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "我失戀後恢復很快，一個月內就能正常生活。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "我認為傷痛不必拖太久，會強迫自己趕快走出來。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "分手後三個月內，我就可以準備接受新的感情。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "我至少需要半年以上，才有辦法稍微放下前任。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷痕會在我心裡停留很久，無法快速復原。" }
];

const LPAS_QUESTIONS_ALT = [
    // ========== 曖昧期 (Period 1) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "當我對某人有好感，我會刻意安排巧遇，增加見面次數。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "我常用即時通訊軟體聊天，逐步縮短兩人之間的距離。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "我會試著輕碰對方的手或手臂，觀察他對肢體接觸的反應。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "我的表達風格較為內斂，大多藉由寫卡片或送小東西來傳達心意。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "我習慣先保持觀望，很少主動約對方出來。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 隱忍等) -----
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧對象讓我心裡不舒服時，我會坦白說出我的心情。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "如果對方一再冷落我，我會主動問「我們要不要把話講開」。 " },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "我受不了曖昧階段的委屈，寧願早點把矛盾釐清。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "就算被對方忽視，我仍會幫他找藉口，認為他只是工作太累。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "曖昧時期受的傷，我會默默承受，不想破壞當下的和諧。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷離開 vs 藕斷絲連) -----
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "一旦確認對方沒意思，我會果斷斷聯，不再耗費心力。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "我會刪除對話紀錄與社群好友，協助自己盡快走出。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "曖昧沒有開花結果時，我會對自己說「還有更適合的人」。 " },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "即使知道機會渺茫，我仍會忍不住去看他的社群動態，難以釋懷。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "我會請朋友幫忙試探或傳話，期盼還有一絲轉機。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧持續一個月仍無進展，我會覺得步調太慢，想加速推進。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "我期望曖昧期愈短愈好，迅速確定彼此關係。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "我習慣主動掌控進度，不喜歡被動等待對方表態。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "我認為曖昧期長一點沒關係，慢慢觀察比較踏實。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "我不會特意設定時間表，凡事順其自然就好。" },

    // ========== 熱戀期 (Period 2) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀階段我會時常用口語表達「愛你」或「想你」。 " },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "我會邀約對方一起去運動或健身，提升身體互動的機會。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "我習慣每天傳訊息或打電話，維持緊密的聯繫。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "我比較傾向用實際行動表達愛，比如幫忙處理事務或贈送禮物。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "我不太會講浪漫的話，但會藉由擁抱與牽手來傳遞情感。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 越痛越愛等) -----
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "伴侶說出傷人的話時，我會馬上回應「你這樣讓我很受傷」。 " },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "我無法接受委屈，會要求對方當面把話說清楚。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "假如對方反覆犯相同的錯誤，我會建議先分開一段時間冷靜。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "愈是被另一半傷害，我反而愈想抓緊他，無法離開。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "即使對方令我痛苦，我仍會在別人面前為他說好話。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷分手 vs 尋求協助等) -----
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "當感情出現無法修補的問題，我會率先提出分手。" },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "我會封鎖伴侶的所有聯絡方式，防止自己回頭。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "我深信長痛不如短痛，分手後立刻投入新生活。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "就算感情狀況很糟，我仍會請共同朋友出面調解。" },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "我會一邊喊著要分手，一邊又忍不住聯絡對方，猶豫不決。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "熱戀時期我希望天天見面，甚至想趕快搬到一起住。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "我喜歡感情快速升溫，三個月內就帶伴侶見家長。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "我會主動討論未來規劃，例如結婚或購屋。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "我認為熱戀期不必太黏，維持各自的獨立空間更重要。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "我偏向慢慢經營感情，不想被時間壓力所束縛。" },

    // ========== 失戀期 (Period 3) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "分手後我會找朋友傾訴，把所有情緒宣洩出來。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "我會在社群平台上發表心情，讓旁人了解我的狀況。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "我會靠運動健身來發洩情緒，讓自己累到無法多想。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "我偏好獨自一人，藉由寫日記或畫圖來消化悲傷，不讓他人看見。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "即使心如刀割，我也會在對方面前維持冷靜，裝作若無其事。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 只能我負人等) -----
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "失戀後我會把不滿說出來，甚至直接痛罵對方一頓。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "我認為被甩就要立刻反擊，絕不讓對方好過。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "我會主動告訴對方「是你辜負我」，把過錯推給他。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "即使被拋棄，我仍會替對方找理由，認為是自己不夠優秀。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "我習慣把傷痛往肚子裡吞，不願讓任何人知道我多難受。" },

    // ----- Dim3 告別疏遠 (能否下決心：消失療傷 vs 找新戀情等) -----
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "失戀後我會人間蒸發，不接電話也不回訊息，專心恢復。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "我會馬上結交新對象，用下一段感情沖淡痛苦。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "我會把所有紀念品丟掉或封箱，徹底與過去切割。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "我仍會偷偷關注前任的近況，甚至找理由與他聯繫。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "我會不斷回憶過往的美好，遲遲無法下決心走開。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "我失戀後復原速度很快，一個月內就能恢復日常。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "我認為不必讓傷痛拖太久，會逼自己趕快站起來。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "分手後三個月內，我就能準備迎接新的戀情。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "我至少需要半年以上的時間，才有辦法稍微放下前任。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷口會在我心裡留很久，無法快速癒合。" }
];

const LPAS_QUESTIONS_ALT2 = [
    // --- 曖昧期 (Period 1) ---
    // Dim 1: 靠近與表達
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "喜歡上一個人之後，我通常盡量就會想辦法多出現在他面前。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "我喜歡一個人的時候，我會直接用行動表現出來。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "如果感覺到對方也有一點喜歡我，我會主動把曖昧推進一步。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "就算很喜歡一個人，我也需要有明確理由才傳訊息給他。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "我喜歡一個人的時候，我給的訊號通常很隱晦。" },
    // Dim 2: 受傷消化
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧期只要對方讓我難受，我會直接讓他知道。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "喜歡的人冷淡了幾天，我需要跟朋友說說，心情才會好一點。" },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "曖昧期受挫了，我的情緒通常很快就寫在臉上了。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "曖昧期就算心裡很難受，我也避免讓他看出來。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "喜歡的人讓我失望了，我習慣獨自消化情緒。" },
    // Dim 3: 告別疏遠
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "確認對方對我沒有感覺之後，我通常能夠比較快讓自己抽身。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "長期處於曖昧，我寧可早一點結束，離開令人失望的對象。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "我習慣把感情直接說清楚，盡快脫離曖昧的狀態。" },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "就算知道這段曖昧沒有結果，我還是會繼續留下。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "我寧可保持曖昧，避免告白被拒絕。" },
    // Dim 4: 關係節奏
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧期拖太久讓我很不舒服，我希望感情快一點有個方向。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "喜歡一個人的時候，我很快就能確定自己要不要繼續追求。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "不確定的感覺消耗了我的精力，我比較希望感情早一點明朗。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "曖昧期就算拖很久，只要感覺還在，我可以一直等下去。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "我對感情進展的速度很放鬆，順其自然最舒服。" },

    // --- 熱戀期 (Period 2) ---
    // Dim 1: 靠近與表達
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀期，我很自然地說出「我喜歡你」或「我想你」。 " },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "另一半做了讓我開心的事，我通常會直接說出我的感受。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "我跟另一半和好之後，我通常會主動說出來，使氣氛恢復融洽。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "就算在熱戀期，「我愛你」這種話我也很難說出口。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "我表達愛意的方式大多是行動，說出口對我來說很困難。" },
    // Dim 2: 受傷消化
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "另一半說出令我難過的話，我通常會告訴他，我受傷了。" },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "熱戀期如果心裡有委屈，我需要說出來才能真正放下。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "另一半忘記了我說過的重要的事，我通常會讓他知道我有點失落。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "就算另一半讓我很難受，我也會隱藏自己的脆弱。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "熱戀期受傷了，我通常自己消化，避免他看見我的情緒。" },
    // Dim 3: 告別疏遠
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "感情出現嚴重問題的時候，我通常會主動說「我們需要談談」。 " },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "另一半最近變得有點疏遠，我通常會直接問他是不是有什麼事。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "我習慣正面處理感情問題，及時化解積累。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "就算感情出現裂縫，我也很難開口說出「我們需要談談」。 " },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "另一半如果疏遠了，我通常會假裝沒發現，等他先說。" },
    // Dim 4: 關係節奏
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "熱戀期我的感情很濃烈，每天都充滿感受，有時候甚至有點消耗。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "另一半依賴我、需要我，這讓我感覺這段感情是真實的。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "熱戀期我喜歡頻繁地見面和聯絡，這對我來說是很自然的。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "熱戀期感情太濃烈反而讓我不安，我比較喜歡平靜而確定的狀態。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "我在感情裡較少依賴對方，我重視自己的空間和節奏。" },

    // --- 失戀期 (Period 3) ---
    // Dim 1: 靠近與表達
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "感情結束的時候，我通常需要把心裡的感受說出來，不管是對他還是對朋友。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "失戀之後，我的狀態通常很快就讓身邊的人看出來了。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "失戀後朋友來關心我，我通常願意說出我真實的狀態。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "就算失戀很痛，我也會避免在他面前崩潰。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "失戀之後，我通常把感受藏起來，讓大家以為我很好。" },
    // Dim 2: 受傷消化
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "失戀之後，我需要跟人說說話，說出來才能慢慢好轉。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "失戀的情緒通常很快就從我身上表現出來，我難以隱藏。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "失戀後我通常需要大哭一場，讓情緒出來，才能繼續往前。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "失戀之後，我的情緒大多往裡面走，表面上看起來還好。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "失戀後我很快就能讓自己正常運作，看起來像平常一樣。" },
    // Dim 3: 告別疏遠
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "感情結束之後，我通常能清楚地讓自己停止聯絡他。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "失戀之後，我傾向乾淨地切斷，避免關係模糊不清。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "放下一段感情之後，我通常是真的放下了，很少回頭。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "就算知道應該斷聯絡，我還是會忍不住去看他的動態。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "失戀之後，我很難完全切斷，常常還是會找各種理由聯絡他。" },
    // Dim 4: 關係節奏
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "失戀的傷雖然很痛，但我恢復的速度通常比別人預期的快。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "放下一段感情之後，我通常能夠比較快對新的人產生興趣。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "失戀後我通常有個明確的時間點，某一天就突然覺得好多了。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "就算失戀後感覺好一點了，我也很難很快對新的人動心。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷在我心裡會放很久，我需要很長的時間才能真正好轉。" }
];
