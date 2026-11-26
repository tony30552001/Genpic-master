import { MAX_DOCUMENT_FILE_SIZE } from "./documentFormats.js";
import {
  MAX_CHARACTERS,
  MAX_PROJECT_SECONDS,
  MAX_SCRIPT_DOCUMENT_IMAGES,
  MAX_SCRIPT_SOURCE,
  MAX_SHOT_REFERENCES,
  MAX_SHOT_SECONDS,
  MAX_SHOTS,
  PROMPT_LIMIT,
} from "./videoStoryboard.js";

// Kling's minimum, the strictest supported family (api/_shared/videoModelFamilies.js).
export const SCRIPT_MIN_SHOT_SECONDS = 3;
// Scenes above PROMPT_LIMIT must be condensed by the agent, which often fails the import.
export const SCRIPT_RECOMMENDED_SCENE_LENGTH = 1500;

export const SCRIPT_TEMPLATE_FILES = Object.freeze({
  template: "/templates/video-script-template.docx",
  example: "/templates/video-script-example.docx",
});

const formatNumber = (value) => value.toLocaleString("en-US");

export const SCRIPT_TEMPLATE_STEPS = Object.freeze([
  { title: "複製提示詞", body: "按下方按鈕複製 AI 提示詞。" },
  { title: "交給 AI", body: "貼到 ChatGPT、Copilot 或 Gemini，並附上部門原始文件。" },
  { title: "匯入 Pixora", body: "結果存成 .md 直接匯入；要加參考圖就貼進 DOCX 範本。" },
]);

export const SCRIPT_TEMPLATE_LIMITS = Object.freeze([
  { label: "場景數", value: `最多 ${MAX_SHOTS} 場` },
  { label: "影片總長", value: `最多 ${MAX_PROJECT_SECONDS} 秒` },
  { label: "每場秒數", value: `${SCRIPT_MIN_SHOT_SECONDS}–${MAX_SHOT_SECONDS} 秒` },
  { label: "每場字數", value: `建議 ≤${formatNumber(SCRIPT_RECOMMENDED_SCENE_LENGTH)}，上限 ${formatNumber(PROMPT_LIMIT)}` },
  { label: "每場參考圖", value: `最多 ${MAX_SHOT_REFERENCES} 張` },
  { label: "整份文件圖片", value: `最多 ${MAX_SCRIPT_DOCUMENT_IMAGES} 張` },
  { label: "固定角色", value: `最多 ${MAX_CHARACTERS} 位` },
  { label: "檔案大小", value: `${MAX_DOCUMENT_FILE_SIZE / 1024 / 1024} MB 以內` },
]);

export const SCRIPT_TEMPLATE_NOTES = Object.freeze([
  "每個場景必須有標題：Word 用「標題 1」樣式，Markdown 與 TXT 用 # 開頭的標題（例如「## 洗手」）。沒有標題的檔案無法匯入。",
  "第一個標題前的文字是全片設定，人物外觀與禁止事項寫在這裡，不要每場重複。",
  "圖片依整份文件出現順序編為 @Image1、@Image2……；EMF/WMF 與外部連結圖片會被略過。",
  `每場文字會逐字保留，不會被 AI 改寫；整份文件最多 ${formatNumber(MAX_SCRIPT_SOURCE)} 字。`,
]);

export const buildScriptPrompt = () => `你是醫院與企業教育訓練影片的腳本編輯。請把我附上的部門文件（SOP、教育訓練教材或作業說明）轉成 AI 影片腳本，輸出 Markdown，讓我直接匯入影片分鏡工具。

# 輸出格式
1. 開頭直接寫「全片設定」段落，不要加任何 # 標題。內容包含：
   - 人物：每位固定人物的外觀、髮型、服裝、配件（最多 ${MAX_CHARACTERS} 位）
   - 場景：地點、主要設備與工具的外觀
   - 畫面風格：寫實或動畫、光線、畫面比例
   - 禁止事項：全片都不能出現的錯誤
2. 接著每個場景以「## 場景標題」開頭，標題 20 字以內。
3. 場景內文只寫這一場畫面中看得到的事：誰、在哪裡、做什麼動作、動作順序與方向、鏡頭（景別、角度、運鏡）。
4. 每個場景最後一行寫「長度：N 秒。」

# 硬性限制
- 最多 ${MAX_SHOTS} 個場景，所有場景秒數加總不超過 ${MAX_PROJECT_SECONDS} 秒。
- 每個場景 ${SCRIPT_MIN_SHOT_SECONDS}–${MAX_SHOT_SECONDS} 秒；一場只做一到兩個動作，動作要能在秒數內完成。
- 每個場景建議 ${formatNumber(SCRIPT_RECOMMENDED_SCENE_LENGTH)} 字以內，絕對不可超過 ${formatNumber(PROMPT_LIMIT)} 字。
- 人物外觀、制服與禁止事項只寫在全片設定，不要在每個場景重複。
- 只挑拍得出來的操作步驟；略過「目的、範圍、權責、參考文件、名詞定義」等無法拍攝的章節。
- 不要寫 @Image 或「參考圖」字樣，圖片之後會在 Word 裡插入。
- 畫面中需要出現的文字（標示、警告牌）用「」框起來；沒有框起來的文字不會出現在畫面上。
- 不要加入原文件沒有的步驟或數據；看不懂的地方在最後列出問題，不要自行猜測。

# 完成前自我檢查
- [ ] 全片設定在第一個 ## 標題之前，而且沒有 # 標題
- [ ] 場景數 ≤ ${MAX_SHOTS}，秒數加總 ≤ ${MAX_PROJECT_SECONDS}
- [ ] 每場都有「長度：N 秒。」且 N 在 ${SCRIPT_MIN_SHOT_SECONDS}–${MAX_SHOT_SECONDS}
- [ ] 每場字數 ≤ ${formatNumber(SCRIPT_RECOMMENDED_SCENE_LENGTH)}
- [ ] 沒有重複的人物描述，也沒有 @Image

只輸出 Markdown 腳本本身，不要加說明文字或程式碼區塊。

以下是部門原始文件：
`;

export const SCRIPT_EXAMPLE = Object.freeze({
  title: "病房清潔七步驟",
  preface: [
    "這是醫院病房清潔 SOP 教育訓練影片，寫實攝影風格，16:9，柔和的白天室內光線，畫面中沒有病人。",
    "人物：同一位清潔人員貫穿全片。黑色短髮及耳下，白色醫療口罩，灰色短袖工作 Polo 衫配綠色衣領與袖口，深海軍藍長版圍裙，名牌固定於左胸。作業時戴紅色手掌、淡奶黃色長袖筒的一體式橡膠手套。",
    "工具：清潔推車（側面為平整的黑色壓克力板）、高處除塵器（深灰色圓形除塵頭、綠色連接件、銀灰色筆直長桿）、病室用紫色抹布、浴廁用綠色抹布、平板拖把、黃色警告牌。",
    "禁止事項：人物臉部、髮型、制服與手套不得改變；工具不得變形、換色、增加或消失；清潔方向開始後不得反向，也不得在同一處來回擦拭；除了警告牌上的「工作進行中」，畫面不出現其他文字。",
  ].join("\n"),
  scenes: [
    {
      title: "作業前準備",
      seconds: 8,
      text: "清潔推車靠牆停在病房門口外側，不擋住出入口與走廊動線。清潔人員把黃色「工作進行中」警告牌放在門口地面，正面朝向走廊。接著她用乾洗手液搓揉雙手，再戴上橡膠手套，雙手在胸前確認手套服貼。\n鏡頭：固定中景，平視，從走廊斜前方拍攝，推車、警告牌與人物都完整入鏡。本場只做準備，不進入病房。",
    },
    {
      title: "高處除塵",
      seconds: 10,
      text: "清潔人員站在病床旁，雙手握住高處除塵器長桿，讓圓形除塵頭貼著牆面上緣與接近天花板的邊角。她沿著房間四周以順時鐘方向緩慢、連續地推進，只清潔肩膀以上的高處，已清潔過的區域不再回頭。\n鏡頭：中遠景，略為仰角，緩慢跟拍除塵頭的移動方向。本場只做高處除塵，不拿其他工具。",
    },
    {
      title: "平面清消",
      seconds: 15,
      text: "清潔人員左手拿噴瓶，把消毒劑噴在右手的紫色抹布上，藥劑只噴在抹布，不直接噴向任何表面。之後放下噴瓶，依序擦拭櫥櫃、床旁桌、陪床椅與病床床欄。大面積平面用 Z 字型路徑往未清潔區域推進，扶手與床欄沿著形狀單一方向擦拭，每個物件只示範一小段代表性動作。\n鏡頭：中景，平視，物件之間用硬切換。",
    },
    {
      title: "浴廁清消",
      seconds: 15,
      text: "清潔人員改用綠色抹布，依序擦拭浴廁的洗手槽、門把與紅色拉繩式救人鈴。接著按下馬桶水箱上方的沖水鈕，把清潔劑沿馬桶內緣倒入，用馬桶刷由上而下刷洗內壁。最後用玻璃刮刀由上而下刮乾鏡面。每個設施只示範一小段代表性動作。\n鏡頭：中景與特寫交替，平視，設施之間用硬切換。",
    },
    {
      title: "收垃圾與垃圾桶清潔",
      seconds: 12,
      text: "清潔人員踩下不鏽鋼腳踏式垃圾桶，雙手提起透明垃圾袋，在袋口打結後放進推車的回收袋。接著用綠色抹布擦拭完全清空的垃圾桶內外，再套上一個全新、乾淨、透明的垃圾袋，把袋口反摺包住桶緣。\n鏡頭：特寫，略為俯角，固定不動。",
    },
    {
      title: "地板清消",
      seconds: 12,
      text: "清潔人員雙手握住平板拖把，從病房最裡面開始，以 S 型路徑一邊拖地一邊倒退，朝右側的房門口移動，拖把頭全程貼地，不重複拖已清潔的區域。最後停在門口，地面微濕反光。\n鏡頭：固定遠景，平視，人物、完整拖把與門口始終在畫面內。",
    },
    {
      title: "自我檢視",
      seconds: 8,
      text: "清潔人員已脫下手套，站在病房門口，轉頭由左至右環視房間，確認床面、桌面與地面都已完成清潔。最後她收起黃色「工作進行中」警告牌，放回清潔推車。\n鏡頭：中景，平視，緩推。",
    },
  ],
});

export const sceneText = (scene) => `${scene.text}\n長度：${scene.seconds} 秒。`;

export const scriptExampleMarkdown = () =>
  [SCRIPT_EXAMPLE.preface, ...SCRIPT_EXAMPLE.scenes.map((scene) => `## ${scene.title}\n${sceneText(scene)}`)].join(
    "\n\n"
  );
