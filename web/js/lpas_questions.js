const LPAS_QUESTIONS_PART2 = [
    // ========== 曖昧期 (Period 1) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "喜歡一個人，\n你會主動讓對方注意到你的存在。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "你習慣主動製造機會，\n拉近與對方的距離。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "你會以輕微的肢體接觸，\n試探對方的反應。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "你的表達方式比較含蓄，\n透過間接的方式來傳遞好感。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "你傾向先觀察對方，\n很少主動示好。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 隱忍等) -----
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧對象讓你難過時，\n你會直接說出你的感受。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "若對方反覆冷淡，\n你會主動提出釐清關係。" },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "你無法忍受曖昧中的委屈，\n寧可早點把話講開。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "就算被對方冷落，\n你還是會替他找理由開脫。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "曖昧期受的傷，\n你會自己默默承受。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷離開 vs 藕斷絲連) -----
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "確定對方無意後，\n你會果斷停止聯絡。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "對方明顯冷淡時，\n你會主動中斷聯絡，\n讓自己快速抽離。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "曖昧無結果時，\n你能夠很快轉換心情，\n往前看。" },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "即使知道沒希望，\n你還是會默默關注對方，\n難以真正放下。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "若對方無意，\n你會盡量保持聯絡，\n等待機會。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧拖太久沒進展，\n你會主動加快腳步。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "你希望曖昧期越短越好，\n盡快確定彼此關係。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "你習慣主動推進節奏，\n不喜歡被動等待對方表態。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "你覺得曖昧期長一點無妨，\n慢慢觀察比較安心。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "你不會刻意設定時間表，\n一切跟著感覺走。" },

    // ========== 熱戀期 (Period 2) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀時你會頻繁地\n直接向對方表達愛意。" },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "你會安排兩人私密活動，\n探索彼此的身體。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "才幾天沒見面就覺得心慌，\n你會主動聯繫對方。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "在外人面前，你不太敢大方表現愛意。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "你不擅長說甜言蜜語，\n大多是等待對方說出話題。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 越痛越愛等) -----
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "另一半說話傷到你時，\n你會立刻讓他知道你的感受。" },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "你無法忍受委屈，\n會要求對方當面說清楚。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "若對方一再犯同樣的錯，\n你會提出暫時分開冷靜。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "越是被另一半傷害，\n你反而越想抓住他，離不開。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "即使對方讓你痛苦，\n你也會在外人面前替他講好話。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷分手 vs 尋求協助等) -----
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "感情出現無法修復的問題時，\n你會主動提分手。" },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "你會徹底切斷與對方的聯繫，\n避免自己回頭。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "你認為長痛不如短痛，\n分手後能立刻往前走。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "萬一感情變糟了，\n你會尋求好友的安慰。" },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "你會一邊說要分手，\n一邊又忍不住聯繫對方，\n反反覆覆。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "你希望與對方整天都黏在一起。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "你喜歡感情進展快速，\n短時間內就讓關係更進一步。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "你會主動和對方規劃長遠的未來。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "你覺得熱戀期不用太黏，\n保持各自的生活空間更重要。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "你傾向慢慢經營感情，\n不想被時間壓力綁住。" },

    // ========== 失戀期 (Period 3) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "失戀後你會向人傾訴，\n把情緒全部說出來。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "你會公開抒發心情，\n讓大家知道你的狀態。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "你會透過外在活動發洩情緒，\n讓自己累到不想思考。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "你習慣獨處，\n用自己的方式消化悲傷，\n不讓別人看見。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "即使很痛也假裝沒事，\n你會在對方面前保持冷靜。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 只能你負人等) -----
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "分手時，你會把怨恨直接向對方說出來。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "你認為被分手就要立刻反擊，\n絕不讓對方好過。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "你會主動讓對方知道，\n責任在他身上。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "即使被甩了，\n你還是會替對方找理由，\n覺得是自己不夠好。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "你習慣把痛苦往肚裡吞，\n不想讓任何人知道你有多難過。" },

    // ----- Dim3 告別疏遠 (能否下決心：消失療傷 vs 找新戀情等) -----
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "失戀後你會直接消失，\n與外界斷聯，專心療傷。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "你會盡快展開新的感情，\n沖淡痛苦。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "你會處理掉所有相關的回憶，\n徹底切斷過去。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "你還是會偷偷關注前任，\n難以真正放下。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "你會不斷回想過去的美好，\n遲遲無法下定決心離開。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "失戀只是一件小事，\n明天就沒事了。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "你認為傷痛不必拖太久，\n會強迫自己趕快走出來。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "你失戀後恢復很快，\n短時間內就能回到正常生活。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "你需要很長一段時間，\n才有辦法稍微放下前任。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷痕在你心裡停留很久，\n無法快速復原。" }
];

const LPAS_QUESTIONS = [
    // ========== 曖昧期 (Period 1) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "你遇到喜歡的人，\n會想盡辦法讓他多看你一眼。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "遇到心儀的對象，\n你會找各種話題去搭話。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "避免他太忙，你會主動把那些綠茶們都趕走。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "女人總得矜持點，\n先繞幾圈用隱晦方式暗示他。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "你通常先按兵不動，\n等對方來找你。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 隱忍等) -----
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "對方讓你心情不好，\n你會當下就讓他知道。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "如果對方一直忽冷忽熱，\n你會直接攤牌問他。" },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "你看見那些對他示好的女人，\n會想找他把事情說清楚。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "就算對方愛理不理，\n你還是會覺得他只是最近很忙。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "你會藏起心裡的難過，\n不想讓氣氛變僵。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷離開 vs 藕斷絲連) -----
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "確認他對你沒意思，\n你就會頭也不回地走了。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "反正不可能繼續了，\n你能把對方從生活中刪光，\n眼不見為淨。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "他太會跟別人搞曖昧了，\n你會直接放棄他。" },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "明知道沒結果，\n你還是會忍不住看他跟誰互動。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "你會默默盯著他身邊有沒有別人，\n期待自己還有機會。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "你沒辦法接受拖了太久的曖昧，\n會主動跳出來告白。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "你會抓緊機會向對方表白，\n免得被別人搶走了。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "好像有其他女生也對他有意思，\n你會馬上開口約他出來。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "你覺得急不得，\n曖昧本來就要慢慢來。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "你對感情很佛系，\n順其自然，不用催進度。" },

    // ========== 熱戀期 (Period 2) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "你希望跟他隨時都黏在一起。" },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "你會主動安排親密的約會，讓感情升溫。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "你要向全世界宣布這段戀情。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "要讓你直接開口說愛，\n你寧可默默為對方付出。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "你覺得放閃很害羞，\n低調相愛就好。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 越痛越愛等) -----
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "對方提分手，\n你會直接答應，\n給他個痛快。" },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "你沒辦法把委屈吞下去，\n一定要當面講開。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "對方一錯再錯，\n你會直接說分手。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "他越是傷你，\n你反而越捨不得離開他。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "就算他害你傷心難過，\n你還是會在閨蜜面前護著他。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷分手 vs 尋求協助等) -----
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "感情走不下去了，\n你會是先開口提分手的人。" },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "決定分手後，\n你會徹底封鎖，斷得一乾二淨。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "發現對方愛情不專一，\n你會說分就分，絕不拖拖拉拉。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "感情出狀況時，\n你會找閨蜜幫你出主意。" },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "你會嘴上喊著分手，\n但又忍不住偷偷聯絡他。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "你只想跟他黏在一起，\n最好一刻都不要分開。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "你喜歡感情衝得快，\n盡快認識對方的親朋好友。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "你會急著想跟對方同居。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "你覺得太黏了反而喘不過氣，\n各自留點空間比較好。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "你不想被時間追著跑，\n感情順其自然就好。" },

    // ========== 失戀期 (Period 3) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "失戀後你會對閨蜜吐苦水，\n把話全部倒出來。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "你會在貼文呈現失戀狀態，\n讓大家都知道。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "你會把自己的時間表塞滿，\n累了就沒空難過。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "你會躲起來自己療傷，\n不想讓任何人看到失戀的樣子。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "失戀沒什麼大不了，\n就算遇到前任都可以當沒事。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 只能你負人等) -----
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "分手時，\n你會把所有不滿全部倒給對方聽。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "被甩了，你一定要扳回一城，\n絕不當輸的那一方。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "你會明確讓他知道，\n這段感情全都是錯在他自己。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "就算被分手，\n你還是覺得是自己不夠好。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "你會把傷心全部往肚子裡吞，\n連最好的朋友也看不出來。" },

    // ----- Dim3 告別疏遠 (能否下決心：消失療傷 vs 找新戀情等) -----
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "分手後，你會直接人間蒸發，\n誰也不見。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "你希望新對象盡快出現，\n用新感情幫自己療傷。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "你會把跟他相關的東西都丟掉，\n當作沒發生過。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "你還是會偷偷關注他，\n看他身邊有沒有出現新對象？" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "你會反覆回想以前的美好，\n無法下定決心離開。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "失戀只是小事，\n過幾天就回復正常生活了。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "你不會讓自己沉浸痛苦太久，\n會逼自己走出來。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "分手沒多久，\n你就發現新對象了。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "你總是拖了很長一段時間，\n才能真正把前任放下。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷在你心裡會放很久，\n一直難以癒合。" }
];


const LPAS_QUESTIONS_ALT = [
    // ========== 曖昧期 (Period 1) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "當你對某人有好感，你會刻意安排巧遇，增加見面次數。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "你常用即時通訊軟體聊天，逐步縮短兩人之間的距離。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "你會試著輕碰對方的手或手臂，觀察他對肢體接觸的反應。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "你的表達風格較為內斂，大多藉由寫卡片或送小東西來傳達心意。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "你習慣先保持觀望，很少主動約對方出來。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 隱忍等) -----
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧對象讓你心裡不舒服時，你會坦白說出你的心情。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "如果對方一再冷落你，你會主動問「你們要不要把話講開」。 " },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "你受不了曖昧階段的委屈，寧願早點把矛盾釐清。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "就算被對方忽視，你仍會幫他找藉口，認為他只是工作太累。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "曖昧時期受的傷，你會默默承受，不想破壞當下的和諧。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷離開 vs 藕斷絲連) -----
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "一旦確認對方沒意思，你會果斷斷聯，不再耗費心力。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "你會刪除對話紀錄與社群好友，協助自己盡快走出。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "曖昧沒有開花結果時，你會對自己說「還有更適合的人」。 " },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "即使知道機會渺茫，你仍會忍不住去看他的社群動態，難以釋懷。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "你會請朋友幫忙試探或傳話，期盼還有一絲轉機。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧持續一個月仍無進展，你會覺得步調太慢，想加速推進。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "你期望曖昧期愈短愈好，迅速確定彼此關係。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "你習慣主動掌控進度，不喜歡被動等待對方表態。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "你認為曖昧期長一點沒關係，慢慢觀察比較踏實。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "你不會特意設定時間表，凡事順其自然就好。" },

    // ========== 熱戀期 (Period 2) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀階段你會時常用口語表達「愛你」或「想你」。 " },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "你會邀約對方一起去運動或健身，提升身體互動的機會。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "你習慣每天傳訊息或打電話，維持緊密的聯繫。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "你比較傾向用實際行動表達愛，比如幫忙處理事務或贈送禮物。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "你不太會講浪漫的話，但會藉由擁抱與牽手來傳遞情感。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 越痛越愛等) -----
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "伴侶說出傷人的話時，你會馬上回應「你這樣讓你很受傷」。 " },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "你無法接受委屈，會要求對方當面把話說清楚。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "假如對方反覆犯相同的錯誤，你會建議先分開一段時間冷靜。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "愈是被另一半傷害，你反而愈想抓緊他，無法離開。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "即使對方令你痛苦，你仍會在別人面前為他說好話。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷分手 vs 尋求協助等) -----
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "當感情出現無法修補的問題，你會率先提出分手。" },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "你會封鎖伴侶的所有聯絡方式，防止自己回頭。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "你深信長痛不如短痛，分手後立刻投入新生活。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "就算感情狀況很糟，你仍會請共同朋友出面調解。" },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "你會一邊喊著要分手，一邊又忍不住聯絡對方，猶豫不決。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "熱戀時期你希望天天見面，甚至想趕快搬到一起住。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "你喜歡感情快速升溫，三個月內就帶伴侶見家長。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "你會主動討論未來規劃，例如結婚或購屋。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "你認為熱戀期不必太黏，維持各自的獨立空間更重要。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "你偏向慢慢經營感情，不想被時間壓力所束縛。" },

    // ========== 失戀期 (Period 3) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "分手後你會找朋友傾訴，把所有情緒宣洩出來。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "你會在社群平台上發表心情，讓旁人了解你的狀況。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "你會靠運動健身來發洩情緒，讓自己累到無法多想。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "你偏好獨自一人，藉由寫日記或畫圖來消化悲傷，不讓他人看見。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "即使心如刀割，你也會在對方面前維持冷靜，裝作若無其事。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 只能你負人等) -----
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "失戀後你會把不滿說出來，甚至直接痛罵對方一頓。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "你認為被甩就要立刻反擊，絕不讓對方好過。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "你會主動告訴對方「是你辜負你」，把過錯推給他。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "即使被拋棄，你仍會替對方找理由，認為是自己不夠優秀。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "你習慣把傷痛往肚子裡吞，不願讓任何人知道你多難受。" },

    // ----- Dim3 告別疏遠 (能否下決心：消失療傷 vs 找新戀情等) -----
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "失戀後你會人間蒸發，不接電話也不回訊息，專心恢復。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "你會馬上結交新對象，用下一段感情沖淡痛苦。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "你會把所有紀念品丟掉或封箱，徹底與過去切割。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "你仍會偷偷關注前任的近況，甚至找理由與他聯繫。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "你會不斷回憶過往的美好，遲遲無法下決心走開。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "你失戀後復原速度很快，一個月內就能恢復日常。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "你認為不必讓傷痛拖太久，會逼自己趕快站起來。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "分手後三個月內，你就能準備迎接新的戀情。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "你至少需要半年以上的時間，才有辦法稍微放下前任。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷口會在你心裡留很久，無法快速癒合。" }
];

const LPAS_QUESTIONS_ALT2 = [
    // --- 曖昧期 (Period 1) ---
    // Dim 1: 靠近與表達
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "喜歡上一個人之後，你通常盡量就會想辦法多出現在他面前。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "你喜歡一個人的時候，你會直接用行動表現出來。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "如果感覺到對方也有一點喜歡你，你會主動把曖昧推進一步。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "就算很喜歡一個人，你也需要有明確理由才傳訊息給他。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "你喜歡一個人的時候，你給的訊號通常很隱晦。" },
    // Dim 2: 受傷消化
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧期只要對方讓你難受，你會直接讓他知道。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "喜歡的人冷淡了幾天，你需要跟朋友說說，心情才會好一點。" },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "曖昧期受挫了，你的情緒通常很快就寫在臉上了。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "曖昧期就算心裡很難受，你也避免讓他看出來。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "喜歡的人讓你失望了，你習慣獨自消化情緒。" },
    // Dim 3: 告別疏遠
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "確認對方對你沒有感覺之後，你通常能夠比較快讓自己抽身。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "長期處於曖昧，你寧可早一點結束，離開令人失望的對象。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "你習慣把感情直接說清楚，盡快脫離曖昧的狀態。" },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "就算知道這段曖昧沒有結果，你還是會繼續留下。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "你寧可保持曖昧，避免告白被拒絕。" },
    // Dim 4: 關係節奏
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧期拖太久讓你很不舒服，你希望感情快一點有個方向。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "喜歡一個人的時候，你很快就能確定自己要不要繼續追求。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "不確定的感覺消耗了你的精力，你比較希望感情早一點明朗。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "曖昧期就算拖很久，只要感覺還在，你可以一直等下去。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "你對感情進展的速度很放鬆，順其自然最舒服。" },

    // --- 熱戀期 (Period 2) ---
    // Dim 1: 靠近與表達
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀期，你很自然地說出「你喜歡你」或「你想你」。 " },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "另一半做了讓你開心的事，你通常會直接說出你的感受。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "你跟另一半和好之後，你通常會主動說出來，使氣氛恢復融洽。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "就算在熱戀期，「你愛你」這種話你也很難說出口。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "你表達愛意的方式大多是行動，說出口對你來說很困難。" },
    // Dim 2: 受傷消化
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "另一半說出令你難過的話，你通常會告訴他，你受傷了。" },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "熱戀期如果心裡有委屈，你需要說出來才能真正放下。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "另一半忘記了你說過的重要的事，你通常會讓他知道你有點失落。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "就算另一半讓你很難受，你也會隱藏自己的脆弱。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "熱戀期受傷了，你通常自己消化，避免他看見你的情緒。" },
    // Dim 3: 告別疏遠
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "感情出現嚴重問題的時候，你通常會主動說「你們需要談談」。 " },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "另一半最近變得有點疏遠，你通常會直接問他是不是有什麼事。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "你習慣正面處理感情問題，及時化解積累。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "就算感情出現裂縫，你也很難開口說出「你們需要談談」。 " },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "另一半如果疏遠了，你通常會假裝沒發現，等他先說。" },
    // Dim 4: 關係節奏
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "熱戀期你的感情很濃烈，每天都充滿感受，有時候甚至有點消耗。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "另一半依賴你、需要你，這讓你感覺這段感情是真實的。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "熱戀期你喜歡頻繁地見面和聯絡，這對你來說是很自然的。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "熱戀期感情太濃烈反而讓你不安，你比較喜歡平靜而確定的狀態。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "你在感情裡較少依賴對方，你重視自己的空間和節奏。" },

    // --- 失戀期 (Period 3) ---
    // Dim 1: 靠近與表達
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "感情結束的時候，你通常需要把心裡的感受說出來，不管是對他還是對朋友。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "失戀之後，你的狀態通常很快就讓身邊的人看出來了。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "失戀後朋友來關心你，你通常願意說出你真實的狀態。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "就算失戀很痛，你也會避免在他面前崩潰。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "失戀之後，你通常把感受藏起來，讓大家以為你很好。" },
    // Dim 2: 受傷消化
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "失戀之後，你需要跟人說說話，說出來才能慢慢好轉。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "失戀的情緒通常很快就從你身上表現出來，你難以隱藏。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "失戀後你通常需要大哭一場，讓情緒出來，才能繼續往前。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "失戀之後，你的情緒大多往裡面走，表面上看起來還好。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "失戀後你很快就能讓自己正常運作，看起來像平常一樣。" },
    // Dim 3: 告別疏遠
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "感情結束之後，你通常能清楚地讓自己停止聯絡他。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "失戀之後，你傾向乾淨地切斷，避免關係模糊不清。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "放下一段感情之後，你通常是真的放下了，很少回頭。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "就算知道應該斷聯絡，你還是會忍不住去看他的動態。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "失戀之後，你很難完全切斷，常常還是會找各種理由聯絡他。" },
    // Dim 4: 關係節奏
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "失戀的傷雖然很痛，但你恢復的速度通常比別人預期的快。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "放下一段感情之後，你通常能夠比較快對新的人產生興趣。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "失戀後你通常有個明確的時間點，某一天就突然覺得好多了。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "就算失戀後感覺好一點了，你也很難很快對新的人動心。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷在你心裡會放很久，你需要很長的時間才能真正好轉。" }
];

const LPAS_QUESTIONS_20260603 = [
    // ========== 曖昧期 (Period 1) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q01", period: 1, dimension: 1, direction: 1, text: "喜歡一個人，\n你會主動製造偶遇，\n經常出現在他面前。" },
    { id: "Q02", period: 1, dimension: 1, direction: 1, text: "你習慣傳訊息，\n慢慢拉近與對方的距離。" },
    { id: "Q03", period: 1, dimension: 1, direction: 1, text: "你會輕觸對方的手或肩膀，\n試探肢體接觸的反應。" },
    { id: "Q04", period: 1, dimension: 1, direction: -1, text: "你的表達方式比較含蓄，\n透過書信或小禮物傳遞好感。" },
    { id: "Q05", period: 1, dimension: 1, direction: -1, text: "你傾向先觀察對方，\n很少直接開口邀約見面。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 隱忍等) -----
    { id: "Q06", period: 1, dimension: 2, direction: 1, text: "曖昧對象讓你難過時，\n你會直接告訴他你的感受。" },
    { id: "Q07", period: 1, dimension: 2, direction: 1, text: "若對方反覆冷淡，\n你會主動提出\n「你們是不是該說清楚？」" },
    { id: "Q08", period: 1, dimension: 2, direction: 1, text: "你無法忍受曖昧中的委屈，\n寧可早點把話講開。" },
    { id: "Q09", period: 1, dimension: 2, direction: -1, text: "就算被對方冷落，\n你還是會替他找理由，\n說他只是太忙。" },
    { id: "Q10", period: 1, dimension: 2, direction: -1, text: "曖昧期受的傷，\n你會自己吞下去，\n不想破壞氣氛。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷離開 vs 藕斷絲連) -----
    { id: "Q11", period: 1, dimension: 3, direction: 1, text: "確定對方無意後，\n你會果斷停止聯絡，\n不再浪費時間。" },
    { id: "Q12", period: 1, dimension: 3, direction: 1, text: "對方已讀不回，\n你會刪除對話記錄和社群好友，\n幫助自己快速抽離。" },
    { id: "Q13", period: 1, dimension: 3, direction: 1, text: "曖昧無結果時，\n你會告訴自己\n「下一個人會更好」。" },
    { id: "Q14", period: 1, dimension: 3, direction: -1, text: "即使知道沒希望，\n你還是會繼續關注他的動態，\n放不下過去的相處時光。" },
    { id: "Q15", period: 1, dimension: 3, direction: -1, text: "你會找朋友幫忙傳話或試探，\n希望還有一絲轉圜餘地。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q16", period: 1, dimension: 4, direction: 1, text: "曖昧超過一個月沒進展，\n你會覺得太慢，想加快腳步。" },
    { id: "Q17", period: 1, dimension: 4, direction: 1, text: "你希望曖昧期越短越好，\n趕快確定彼此關係。" },
    { id: "Q18", period: 1, dimension: 4, direction: 1, text: "你習慣主動推進節奏，\n不喜歡被動等待對方表態。" },
    { id: "Q19", period: 1, dimension: 4, direction: -1, text: "你覺得曖昧期長一點無妨，\n慢慢觀察比較安心。" },
    { id: "Q20", period: 1, dimension: 4, direction: -1, text: "你不會刻意設定時間表，\n一切跟著感覺走。" },

    // ========== 熱戀期 (Period 2) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q21", period: 2, dimension: 1, direction: 1, text: "熱戀時你會頻繁用言語說\n「你愛你」或「你想你」。" },
    { id: "Q22", period: 2, dimension: 1, direction: 1, text: "你會安排共同運動或健身，\n增進兩人的身體互動。" },
    { id: "Q23", period: 2, dimension: 1, direction: 1, text: "你習慣每天傳訊息或通話，\n保持緊密聯繫。" },
    { id: "Q24", period: 2, dimension: 1, direction: -1, text: "你比較常用行動表達愛，\n主動邀約或送禮物。" },
    { id: "Q25", period: 2, dimension: 1, direction: -1, text: "你不太擅長說甜言蜜語，\n習慣微笑、擁抱和牽手傳達感情。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 越痛越愛等) -----
    { id: "Q26", period: 2, dimension: 2, direction: 1, text: "另一半說話傷到你時，\n你會立刻告訴他\n「你這樣讓你很難過」。" },
    { id: "Q27", period: 2, dimension: 2, direction: 1, text: "你無法忍受委屈，\n會要求對方當面說清楚。" },
    { id: "Q28", period: 2, dimension: 2, direction: 1, text: "若對方一再犯同樣的錯，\n你會提出暫時分開冷靜。" },
    { id: "Q29", period: 2, dimension: 2, direction: -1, text: "越是被另一半傷害，\n你反而越想抓住他，離不開。" },
    { id: "Q30", period: 2, dimension: 2, direction: -1, text: "即使對方讓你痛苦，\n你也會在外人面前替他講好話。" },

    // ----- Dim3 告別疏遠 (能否下決心：果斷分手 vs 尋求協助等) -----
    { id: "Q31", period: 2, dimension: 3, direction: 1, text: "感情出現無法修復的問題時，\n你會主動提分手。" },
    { id: "Q32", period: 2, dimension: 3, direction: 1, text: "你會封鎖對方的聯絡方式，\n避免自己回頭。" },
    { id: "Q33", period: 2, dimension: 3, direction: 1, text: "你認為長痛不如短痛，\n分手後立刻展開新生活。" },
    { id: "Q34", period: 2, dimension: 3, direction: -1, text: "萬一感情變糟了，\n你會找共同朋友幫忙勸和。" },
    { id: "Q35", period: 2, dimension: 3, direction: -1, text: "你會一邊說要分手，\n一邊又忍不住聯繫對方，\n反反覆覆。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q36", period: 2, dimension: 4, direction: 1, text: "熱戀期你希望每天見面，\n甚至想趕快同居。" },
    { id: "Q37", period: 2, dimension: 4, direction: 1, text: "你喜歡感情進展快速，\n三個月內就帶對方見家人。" },
    { id: "Q38", period: 2, dimension: 4, direction: 1, text: "你會主動規劃未來，\n例如討論結婚或買房。" },
    { id: "Q39", period: 2, dimension: 4, direction: -1, text: "你覺得熱戀期不用太黏，\n保持各自的生活空間更重要。" },
    { id: "Q40", period: 2, dimension: 4, direction: -1, text: "你傾向慢慢經營感情，\n不想被時間壓力綁住。" },

    // ========== 失戀期 (Period 3) ==========
    // ----- Dim1 靠近與表達 (方式) -----
    { id: "Q41", period: 3, dimension: 1, direction: 1, text: "失戀後你會找朋友哭訴，\n把情緒全部說出來。" },
    { id: "Q42", period: 3, dimension: 1, direction: 1, text: "你會在社群網站抒發心情，\n讓大家知道你的狀態。" },
    { id: "Q43", period: 3, dimension: 1, direction: 1, text: "你會透過運動健身發洩情緒，\n讓自己累到不想思考。" },
    { id: "Q44", period: 3, dimension: 1, direction: -1, text: "你習慣獨處，\n用書寫或畫畫消化悲傷，\n不讓別人看見。" },
    { id: "Q45", period: 3, dimension: 1, direction: -1, text: "即使很痛，\n你也會在對方面前保持冷靜，\n假裝沒事。" },

    // ----- Dim2 受傷消化 (下決定：直接表達 vs 只能你負人等) -----
    { id: "Q46", period: 3, dimension: 2, direction: 1, text: "失戀後你會把怨恨說出來，\n甚至直接罵對方一頓。" },
    { id: "Q47", period: 3, dimension: 2, direction: 1, text: "你認為被分手就要立刻反擊，\n絕不讓對方好過。" },
    { id: "Q48", period: 3, dimension: 2, direction: 1, text: "你會主動告訴對方\n「是你對不起你」，\n把責任推給他。" },
    { id: "Q49", period: 3, dimension: 2, direction: -1, text: "即使被甩了，\n你還是會幫對方找理由，\n覺得是自己不夠好。" },
    { id: "Q50", period: 3, dimension: 2, direction: -1, text: "你習慣把痛苦往肚裡吞，\n不想讓任何人知道你有多難過。" },

    // ----- Dim3 告別疏遠 (能否下決心：消失療傷 vs 找新戀情等) -----
    { id: "Q51", period: 3, dimension: 3, direction: 1, text: "失戀後你會直接消失，\n不接電話也不回訊息，\n專心療傷。" },
    { id: "Q52", period: 3, dimension: 3, direction: 1, text: "你會立刻認識新對象，\n用下一段戀情沖淡痛苦。" },
    { id: "Q53", period: 3, dimension: 3, direction: 1, text: "你把所有回憶物品封箱丟掉，\n徹底切斷過去。" },
    { id: "Q54", period: 3, dimension: 3, direction: -1, text: "你還是會偷偷關注前任的近況，\n甚至找藉口聯絡他。" },
    { id: "Q55", period: 3, dimension: 3, direction: -1, text: "你會不斷回想過去的美好，\n遲遲無法下定決心離開。" },

    // ----- Dim4 關係節奏 (時間快慢) -----
    { id: "Q56", period: 3, dimension: 4, direction: 1, text: "你失戀後恢復很快，\n一個月內就能正常生活。" },
    { id: "Q57", period: 3, dimension: 4, direction: 1, text: "你認為傷痛不必拖太久，\n會強迫自己趕快走出來。" },
    { id: "Q58", period: 3, dimension: 4, direction: 1, text: "分手後三個月內，\n你就可以準備接受新的感情。" },
    { id: "Q59", period: 3, dimension: 4, direction: -1, text: "你至少需要半年以上，\n才有辦法稍微放下前任。" },
    { id: "Q60", period: 3, dimension: 4, direction: -1, text: "失戀的傷痕在你心裡停留很久，\n無法快速復原。" }
];

