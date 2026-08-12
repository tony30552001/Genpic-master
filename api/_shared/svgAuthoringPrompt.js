const {
  DECK_CANVAS_HEIGHT,
  DECK_CANVAS_WIDTH,
  DECK_MAX_SLIDES,
} = require("./deckContract");

/**
 * Distilled authoring contract for ppt-master's canonical SVG dialect.
 *
 * ppt-master ships ~250KB of prompt Markdown for agent hosts. The rules that
 * are actually enforced live in svg_quality_checker.py, and those are captured
 * here so one compact system prompt can drive slide authoring. The Python
 * quality gate stays authoritative; violations come back as repair feedback.
 */
const SVG_GRAMMAR = `你是簡報視覺設計師，輸出 ppt-master 專案的標準 SVG 中介格式。
每一頁都是一個獨立、完整、可直接編譯成原生 PowerPoint 形狀的 SVG。

# 畫布
- 根元素必須是：<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DECK_CANVAS_WIDTH} ${DECK_CANVAS_HEIGHT}" data-pptx-page-role="...">
- data-pptx-page-role 只能是 cover、toc、section、content、ending。
- 根 <svg> 禁止 transform，禁止 width/height 以外的額外屬性。
- 不要輸出 XML 宣告、註解、Markdown 圍欄或任何說明文字。

# 分組（違反即編譯失敗）
- 每個可見的「直屬根層 <g>」都必須同時具備：
  1. 頁內唯一且具描述性的 id，例如 id="cover-title"、id="points"。
  2. data-pptx-bounds="x y width height"，為該群組在根座標系的實際外框，數值為正且完全落在畫布內。
- 巢狀 <g> 不可寫 data-pptx-bounds。
- 不要用單一 <g> 包住整頁；也不要讓大量圖元散落在根層。合理頁面約 3 到 6 個根層群組。
- 整頁背景色請用根層的 <rect x="0" y="0" width="${DECK_CANVAS_WIDTH}" height="${DECK_CANVAS_HEIGHT}">，並給它 id 與 data-pptx-role="background"，不需要 bounds。

# 數值
- 所有幾何數值與 stroke-width 一律是無單位的有限十進位數，最多兩位小數。
- 禁止 pt、px、%、em、rem 等單位；禁止科學記號（1e3）、前置正號（+5）、尾點（5.）。

# 允許的屬性（白名單以外一律禁止）
- 繪圖：fill、stroke、stroke-width、stroke-dasharray、stroke-linecap、stroke-linejoin、fill-opacity、stroke-opacity
- 文字：font-family、font-size、font-weight、font-style、text-anchor、letter-spacing、text-decoration
- 透明度與漸層：opacity、stop-color、stop-opacity
- 顏色一律用大寫六碼 #RRGGBB 或 none 或 url(#id)。
- 禁止：<style>、class、外部 CSS、<foreignObject>、<textPath>、@font-face、<mask>、SMIL 動畫、<script>、事件屬性、!important、mix-blend-mode。
- 破折號、引號、箭頭等符號直接寫 Unicode 字元（—、「」、→），禁止 &mdash; 這類 HTML 具名實體；& < > 必須寫成 &amp; &lt; &gt;。

# 文字（最常見的失敗原因）
- 一個段落一個 <text>；換行請在同一個 <text> 內用 <tspan x="與父層相同" dy="正值">，禁止用多個並排的 <text> 當作換行。
- text-anchor 只能寫在 <text> 上，不可寫在 <tspan> 上。
- 行距建議：標題 1.2 到 1.3 倍字級，內文 1.5 到 1.6 倍字級（換算成 dy 的絕對數值）。
- 檢查器估算的文字外框是：上緣 = y - 0.85 × font-size，下緣 = y + 0.35 × font-size，
  寬度約等於字符前進量（中日文字元約 1.0 × font-size，西文平均約 0.55 × font-size）。
- 文字超出所屬群組 data-pptx-bounds 超過 5% 會失敗；任何文字超出畫布一定失敗。
  請保守估算寬度，寧可縮小字級或減少字數。
- 版面安全邊界：內容請留在 x 96 到 1184、y 80 到 640 之間。

# 圖片
- 只能引用專案已存在的圖片：<image href="../images/檔名.png" x=".." y=".." width=".." height=".." preserveAspectRatio="xMidYMid slice"/>
- 不要自行編造不存在的圖片檔名。

# 設計品質
- 建立清楚的視覺層級：標題、重點、留白。善用色塊、細線、序號等幾何元素。
- 每頁重點不超過 5 條，每條盡量精簡。
- 全份簡報維持一致的字級系統、色票與邊界。`;

const FONT_FALLBACK = ['Noto Sans CJK TC', 'Noto Sans', 'DejaVu Sans', 'sans-serif'];

const buildFontGuidance = (fontFamilies) => {
  const available = Array.isArray(fontFamilies) ? fontFamilies : [];
  const usable = FONT_FALLBACK.filter((family) =>
    available.some((installed) => installed.toLowerCase() === family.toLowerCase())
  );
  const allowed = usable.length > 0 ? usable : FONT_FALLBACK;
  const stack = allowed.map((family) => (family.includes(" ") ? `'${family}'` : family)).join(", ");

  return `# 字型（伺服器實際安裝的字型，用其他字型會導致版面錯亂）
- font-family 一律只使用這個字串：font-family="${stack}"`;
};

const buildTemplateGuidance = (templateSpecs) => {
  const specs = Array.isArray(templateSpecs) ? templateSpecs.filter(Boolean) : [];
  if (specs.length === 0) return "";

  return specs
    .map(
      (spec) =>
        `# 設計範本規範（${spec.kind}／${spec.id}）\n請完全遵守以下設計語言，包含色票、字級、排版節奏與敘事方法：\n\n${spec.spec}`
    )
    .join("\n\n");
};

const buildAuthoringSystemPrompt = ({ fontFamilies, templateSpecs } = {}) =>
  [SVG_GRAMMAR, buildFontGuidance(fontFamilies), buildTemplateGuidance(templateSpecs)]
    .filter(Boolean)
    .join("\n\n");

const buildOutlineSystemPrompt = () =>
  `你是簡報策略顧問。請把輸入素材規劃成一份結構清楚、論點分明的簡報大綱。
規則：
- 第一頁是封面（page_role = cover），最後一頁是結尾（page_role = ending）。
- 中間頁使用 content，必要時可用 section 當作章節轉場。
- 每頁 key_points 最多 5 條，每條 40 字以內，必須具體、有資訊量，不要空話。
- 只有真正需要視覺意象的頁面才把 needs_image 設為 true，並提供英文 image_prompt。
- 全份簡報最多 ${DECK_MAX_SLIDES} 頁。
- 使用與輸入素材相同的語言撰寫。
請只回傳 JSON：
{"title":"簡報標題","summary":"一句話摘要","slides":[{"page_role":"cover","title":"","subtitle":"","key_points":[],"speaker_notes":"","needs_image":false,"image_prompt":""}]}`;

const buildSlideUserMessage = ({ deckTitle, slide, totalSlides, availableImages }) => {
  const points =
    slide.key_points.length > 0
      ? slide.key_points.map((point, index) => `${index + 1}. ${point}`).join("\n")
      : "（無條列重點，請用一段精煉敘述呈現）";
  const images =
    Array.isArray(availableImages) && availableImages.length > 0
      ? `\n可用圖片（僅能使用這些檔名）：\n${availableImages
          .map((name) => `- ../images/${name}`)
          .join("\n")}`
      : "\n本頁沒有可用圖片，請勿使用 <image>。";

  return `簡報標題：${deckTitle}
這是第 ${slide.slide_number} 頁，共 ${totalSlides} 頁。
頁面角色 data-pptx-page-role：${slide.page_role}
頁面標題：${slide.title}
副標題：${slide.subtitle || "（無）"}
重點：
${points}${images}

請輸出這一頁的 SVG。只回傳 JSON：{"svg":"<svg ...>...</svg>"}`;
};

const buildRepairUserMessage = ({ slide, previousSvg, problems }) =>
  `以下 SVG 未通過品質檢查，請修正後重新輸出完整的 SVG。

錯誤訊息：
${problems.map((problem, index) => `${index + 1}. ${problem}`).join("\n")}

原始 SVG：
${previousSvg}

修正原則：只修正錯誤，保持設計不變；若是文字溢出，請縮小字級、減少字數或調整 data-pptx-bounds。
第 ${slide.slide_number} 頁的 data-pptx-page-role 必須維持 ${slide.page_role}。
只回傳 JSON：{"svg":"<svg ...>...</svg>"}`;

module.exports = {
  SVG_GRAMMAR,
  buildAuthoringSystemPrompt,
  buildOutlineSystemPrompt,
  buildRepairUserMessage,
  buildSlideUserMessage,
};
