const {
  DECK_CANVAS_HEIGHT,
  DECK_CANVAS_WIDTH,
  DECK_CHART_TYPES,
  DECK_MAX_SLIDES,
  normalizeImageDensity,
} = require("./deckContract");
const { describeDesignSystem } = require("./deckDesign");
const {
  describeFrameCatalog,
  describeFrameGeometry,
  describeFrameIntent,
} = require("./deckFrames");
const { describeRecipeSpine } = require("./deckRecipes");

/**
 * The three questions every good deck answers before it is written: why does
 * this deck exist, who is in the room, and what should change afterwards.
 * All optional — an empty brief must leave the prompt exactly as it was.
 */
const describeBrief = (brief) => {
  if (!brief || typeof brief !== "object") return "";
  const lines = [
    brief.purpose ? `- 簡報目的：${brief.purpose}` : "",
    brief.audience ? `- 聽眾對象：${brief.audience}` : "",
    brief.outcome ? `- 期望成果：${brief.outcome}` : "",
  ].filter(Boolean);
  if (lines.length === 0) return "";

  return `# 這份簡報的任務
${lines.join("\n")}
請讓每一頁都服務上面這些條件：對這群聽眾而言不重要的內容就刪掉，能促成期望成果的內容就講深。`;
};

/**
 * Distilled authoring contract for ppt-master's canonical SVG dialect.
 *
 * ppt-master ships ~250KB of prompt Markdown for agent hosts. The rules that
 * are actually enforced live in svg_quality_checker.py, and those are captured
 * here so one compact system prompt can drive slide authoring. The Python
 * quality gate stays authoritative; violations come back as repair feedback.
 *
 * The text-metric numbers below were measured against the pinned skill release
 * rather than copied from its release notes: probe slides with known CJK, bold
 * and halfwidth runs were fed to the gate and the passing bounds were read back
 * from its own overflow reports. Re-measure whenever the skill pin changes.
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
- 不要用單一 <g> 包住整頁；也不要讓大量圖元散落在根層。每一頁的根層群組由你依內容結構與設計系統的網格決定。
- 每個根層群組至少 40 × 24；比這更小的框幾乎都是誤植。
- 兩個都含文字的根層群組不可互相重疊；文字壓在裝飾色塊或圖片上則是正當設計。
- 整頁背景色請用根層的 <rect x="0" y="0" width="${DECK_CANVAS_WIDTH}" height="${DECK_CANVAS_HEIGHT}">，並給它 id 與 data-pptx-role="background"，不需要 bounds。
- 滿版元素（滿版底圖、出血色塊）在群組上加 data-pptx-bleed="true"，即可不受安全邊界限制。

# 數值
- 所有幾何數值與 stroke-width 一律是無單位的有限十進位數，最多兩位小數。
- 禁止 pt、px、%、em、rem 等單位；禁止科學記號（1e3）、前置正號（+5）、尾點（5.）。

# 允許的屬性（白名單以外一律禁止）
- 繪圖：fill、stroke、stroke-width、stroke-dasharray、stroke-linecap、stroke-linejoin、fill-opacity、stroke-opacity
- 文字：font-family、font-size、font-weight、font-style、text-anchor、letter-spacing、text-decoration
- 透明度與漸層：opacity、stop-color、stop-opacity
- 根層群組的資料屬性：data-pptx-bounds、data-pptx-role、data-pptx-bleed、data-pptx-replace-with
- 顏色一律用大寫六碼 #RRGGBB 或 none 或 url(#id)。
- 禁止：<style>、class、外部 CSS、<foreignObject>、<textPath>、@font-face、<mask>、SMIL 動畫、<script>、事件屬性、!important、mix-blend-mode。
- 破折號、引號、箭頭等符號直接寫 Unicode 字元（—、「」、→），禁止 &mdash; 這類 HTML 具名實體；& < > 必須寫成 &amp; &lt; &gt;。

# 文字（最常見的失敗原因）
- 一個段落一個 <text>；換行請在同一個 <text> 內用 <tspan x="與父層相同" dy="正值">，禁止用多個並排的 <text> 當作換行。
- text-anchor 只能寫在 <text> 上，不可寫在 <tspan> 上。
- 行距建議：標題 1.2 到 1.3 倍字級，內文 1.5 到 1.6 倍字級（換算成 dy 的絕對數值）。
- 檢查器估算的文字外框是：上緣 = y - 0.85 × font-size，下緣 = y + 0.35 × font-size，
  寬度等於字符前進量總和：中日文字元 1.00 × font-size（**粗體不會變寬**），
  西文與半形字元約 0.54 × font-size。
- 群組 data-pptx-bounds 只要不比文字實際外框窄超過 5% 就通過；任何文字超出畫布一定失敗。
  請保守估算寬度，寧可縮小字級或減少字數。
- 裝飾線不可穿過文字。細線、框線、分隔線、底線的 y 必須落在文字外框之外 —— 用上面的公式算，
  不要用群組的 data-pptx-bounds 判斷，因為 bounds 通常比字身高很多，看起來還有空位其實已經壓到字。
  例：font-size="84" 且基線 y="148" 的標題，字身佔 y 76.6 到 177.4，這個範圍內不能有任何裝飾線。
  大面積的裝飾色塊或圖片墊在文字下方則不受此限。
- 版面安全邊界：內容請留在 x 96 到 1184、y 80 到 640 之間；只有標記 data-pptx-bleed="true" 的滿版群組可以超出。

# 圖片
- 只能引用專案已存在的圖片：<image href="../images/檔名.png" x=".." y=".." width=".." height=".." preserveAspectRatio="xMidYMid slice"/>
- 不要自行編造不存在的圖片檔名。

# 圖表與表格
本頁若附有 chart 或 table 資料，請把它畫成一個根層群組，並同時做完以下三件事（缺一即編譯失敗）：
1. 群組加上 data-pptx-replace-with="chart" 或 data-pptx-replace-with="table"，以及一般的 id 與 data-pptx-bounds。
2. 群組的第一個子節點是 <metadata type="application/json">，內容為單一 JSON 物件，其中 name 必須與群組 id 相同。
   圖表：{"name":"群組id","type":"${DECK_CHART_TYPES.join("｜")}","title":"…","categories":[…],"series":[{"name":"…","values":[…]}]}
   表格：{"name":"群組id","title":"…","headers":[…],"rows":[[…],[…]]}
   一律不要寫 x／y／width／height，匯出時會由你畫出來的圖形自動推導。
3. 在 metadata 之後，用一般 SVG 圖元把這張圖表或表格**完整畫出來**。這不是佔位符，而是使用者實際會看到的畫面，
   必須自己判讀數據、換算比例，畫出正確的長度、角度與欄列。只有 metadata 沒有圖形一定失敗。
   畫之前先把群組切成三塊，並且不要讓任何一塊侵入另一塊：
   a. 類別標籤欄：每個 category 一個標籤，全部靠齊在同一欄，寬度取最長標籤所需的寬度。
   b. 繪圖區：所有長條／點／欄位都從同一條基準線開始，長度只由數值決定；
      繪圖區的最大長度要用**所有 series 的最大值**換算，不能只看第一個 series，否則後面的會超出去。
   c. 數值標籤：每個數值只能標在自己那根長條的末端外側或內部，和長條共用同一條中心線；
      禁止把數值另外排成一列，那會讓人看不出哪個數字屬於哪根長條。
   多個 series（例如兩個年度）請一根一列或一組並排，每個 category 自成一組；
   禁止把不同 category 接成一條連續的長條，那會變成堆疊圖，和 column／bar 的語意不符。
資料的數值請完全依照提供的內容，不要自行增刪或四捨五入成別的數字。

# 設計品質
- 版面由你決定，但必須服從設計系統的色票、字級與網格 —— 那是全份簡報唯一的共同語言。
- 建立清楚的視覺層級：標題、重點、留白。善用色塊、細線、序號等幾何元素。
- 每頁重點不超過 5 條，每條盡量精簡。內容裝不下時請精簡文字，不要縮小字級或壓縮留白。
- 不要把整頁塞滿：留白是版面品質的一部分。`

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
        `# 設計範本規範（${spec.kind}／${spec.id}）\n請遵守以下設計語言的排版節奏、敘事方法與整體調性。\n若其中的色票、字級或版面數值與本份簡報的設計系統衝突，一律以設計系統為準：\n設計系統決定數值，設計範本決定語氣與手法。\n\n${spec.spec}`
    )
    .join("\n\n");
};

/**
 * The authoring contract for one deck.
 *
 * Order matters: the grammar states what compiles, the design system states
 * what this particular deck looks like, and the template spec supplies tone.
 * Each later section may refine the previous one but never overrides its
 * numbers, which is stated explicitly because the template specs do contain
 * palettes of their own.
 */
const buildAuthoringSystemPrompt = ({ fontFamilies, templateSpecs, designSystem } = {}) =>
  [
    SVG_GRAMMAR,
    buildFontGuidance(fontFamilies),
    designSystem ? describeDesignSystem(designSystem) : "",
    buildTemplateGuidance(templateSpecs),
  ]
    .filter(Boolean)
    .join("\n\n");

const IMAGE_DENSITY_GUIDANCE = {
  none: "- 這份簡報不配圖：所有頁面的 needs_image 一律為 false，image_prompt 留空。",
  key: `- 這份簡報採重點配圖：挑出最值得視覺化的頁面，把 needs_image 設為 true。
- 封面與章節轉場頁優先配圖；內容頁挑論述最需要意象支撐的那幾頁。
- 至少提名 3 頁，寧可多提名，最終張數由系統依密度裁定。`,
  every: `- 這份簡報每頁都要配圖：所有頁面的 needs_image 一律為 true。
- 每一頁都必須有獨立且具體的 image_prompt，不可重複同一句。`,
};

const buildOutlineSystemPrompt = ({ imageDensity, recipeId, slideCount } = {}) => {
  const density = normalizeImageDensity(imageDensity);
  const spine = describeRecipeSpine(recipeId, slideCount);

  return `你是簡報策略顧問。請把輸入素材規劃成一份結構清楚、論點分明的簡報大綱。
規則：
- 第一頁是封面（page_role = cover），最後一頁是結尾（page_role = ending）。
- 中間頁使用 content，必要時可用 section 當作章節轉場。
- 每條 key_points 40 字以內，必須具體、有資訊量，不要空話；條數依所選骨架的容納量。
- 全份簡報最多 ${DECK_MAX_SLIDES} 頁。
- 使用與輸入素材相同的語言撰寫，但 image_prompt 一律使用英文。
${spine ? `\n${spine}\n` : ""}
${describeFrameCatalog()}

選擇骨架的規則：
- 先想清楚這一頁的內容是什麼結構（比較、流程、指標、時序、主張），再挑對應的骨架。
- 不要連續兩頁使用同一個骨架；整份簡報也不要只用 content-bullets。
- 內容條數必須落在該骨架的容納範圍內，超出的部分會被截掉，請改選容量更大的骨架或拆成兩頁。

資料視覺化規則：
- 素材裡只要有可比較的數字，就用資料骨架呈現，不要把數字寫成條列。一份好的簡報通常有 2 到 4 頁是圖表或表格。
- chart 欄位：type 限 ${DECK_CHART_TYPES.join("｜")}，最多 6 個 categories、3 個 series；
  每個 series 的 values 長度必須與 categories 相同。pie 與 doughnut 只取第一個 series。
- table 欄位：最多 5 欄 × 6 列，headers 與每一列的長度必須一致。
- 數值一律取自素材，不要自行捏造；素材沒有數據時就不要使用資料骨架。

配圖規則：
${IMAGE_DENSITY_GUIDANCE[density]}
- image_prompt 描述畫面本身，不要出現任何文字、字母、圖表或浮水印。
- 圖片在版面上的角色由骨架決定，你只需要決定哪幾頁值得配圖。

請只回傳 JSON（chart 與 table 為選填，沒有數據就整個省略）：
{"title":"簡報標題","summary":"一句話摘要","slides":[{"page_role":"cover","frame":"cover-bleed","title":"","subtitle":"","key_points":[],"speaker_notes":"","needs_image":true,"image_prompt":"Wide abstract composition of layered translucent planes, low contrast, generous empty space"},{"page_role":"content","frame":"chart-bars","title":"各季營收","subtitle":"","key_points":["成長主要來自雲端方案"],"speaker_notes":"","needs_image":false,"image_prompt":"","chart":{"type":"column","title":"各季營收（百萬）","categories":["Q1","Q2","Q3"],"series":[{"name":"雲端","values":[12,15,19]}]}}]}`;
};

const buildOutlineUserMessage = ({ material, slideCount, templateSpecs, brief }) => {
  const specs = Array.isArray(templateSpecs) ? templateSpecs.filter(Boolean) : [];
  const guidance =
    specs.length > 0
      ? `\n\n這份簡報必須遵守以下設計範本規範的敘事方法與調性：\n\n${specs
          .map((spec) => `【${spec.kind}／${spec.id}】\n${spec.spec}`)
          .join("\n\n")}`
      : "";
  const task = describeBrief(brief);

  return `${material}${task ? `\n\n${task}` : ""}\n\n請規劃 ${slideCount} 頁的簡報大綱。${guidance}`;
};

/** Chart and table data, restated for the author in the shape metadata needs. */
const describeSlideData = (slide) => {
  if (slide.chart) {
    const series = slide.chart.series
      .map((entry) => `  - ${entry.name}：${entry.values.join("、")}`)
      .join("\n");
    return `本頁資料（圖表，type = ${slide.chart.type}）：
標題：${slide.chart.title || slide.title}
分類：${slide.chart.categories.join("、")}
數列：
${series}`;
  }

  if (slide.table) {
    const rows = slide.table.rows.map((row) => `  - ${row.join("｜")}`).join("\n");
    return `本頁資料（表格）：
標題：${slide.table.title || slide.title}
表頭：${slide.table.headers.join("｜")}
資料列：
${rows}`;
  }

  return "";
};

/**
 * One page's authoring request.
 *
 * `frameGeometry` switches from intent to exact bounds. That is the retreat
 * path: free-form authoring already failed the repair loop for this page, so
 * we stop asking for a layout and hand over one that is known to compile.
 */
const buildSlideUserMessage = ({
  deckTitle,
  slide,
  totalSlides,
  availableImages,
  frameGeometry = false,
}) => {
  const points =
    slide.key_points.length > 0
      ? slide.key_points.map((point, index) => `${index + 1}. ${point}`).join("\n")
      : "（無條列重點，請用一段精煉敘述呈現）";
  const images =
    Array.isArray(availableImages) && availableImages.length > 0
      ? `\n可用圖片（僅能使用這些檔名）：\n${availableImages
          .map((name) => `- ../images/${name}`)
          .join("\n")}`
      : "\n本頁沒有可用圖片。";

  return [
    `簡報標題：${deckTitle}`,
    `這是第 ${slide.slide_number} 頁，共 ${totalSlides} 頁。`,
    `頁面角色 data-pptx-page-role：${slide.page_role}`,
    `頁面標題：${slide.title}`,
    `副標題：${slide.subtitle || "（無）"}`,
    `重點：\n${points}${images}`,
    describeSlideData(slide),
    frameGeometry ? describeFrameGeometry(slide.frame) : describeFrameIntent(slide.frame),
    '請輸出這一頁的 SVG。只回傳 JSON：{"svg":"<svg ...>...</svg>"}',
  ]
    .filter(Boolean)
    .join("\n\n");
};

/**
 * Repair feedback.
 *
 * The order of the principles is load-bearing. An earlier version led with
 * "shrink the type and cut words", so every layout complaint was resolved by
 * deleting content and decks came back thin. Content is the last thing to go,
 * never the first.
 *
 * `frameGeometry` is set only on the retreat path, where a page has already
 * exhausted free-form repair and is being rebuilt on fixed bounds.
 */
const buildRepairUserMessage = ({ slide, previousSvg, problems, frameGeometry = false }) => {
  const geometry = frameGeometry ? describeFrameGeometry(slide.frame) : "";
  const principles = frameGeometry
    ? `1. 這一次請完全依照上面骨架指定的 id 與 data-pptx-bounds 重排版面，不要沿用原本的座標。
2. 再把每個群組內的文字排回它自己的框內：調整 x／y、改用 <tspan> 換行、或收斂行距。
3. 只有在文字量確實超過該框的容量時，才精簡文字。
4. 其餘設計（色彩、字體、層級）保持不變。`
    : `1. 先針對錯誤訊息指出的那幾個群組調整幾何：移動位置、調整 data-pptx-bounds、或改變區塊的分配方式。
2. 再把該群組內的文字排回它自己的框內：調整 x／y、改用 <tspan> 換行、或收斂行距。
3. 只有在文字量確實超過可用空間時，才精簡文字 —— 刪內容是最後手段，不是第一步。
4. 其餘設計（色彩、字級、網格對齊、幾何語彙）保持不變，不要藉修正之便重做整頁。`;

  return [
    "以下 SVG 未通過品質檢查，請修正後重新輸出完整的 SVG。",
    `錯誤訊息：\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join("\n")}`,
    `原始 SVG：\n${previousSvg}`,
    geometry,
    `修正原則：\n${principles}`,
    `第 ${slide.slide_number} 頁的 data-pptx-page-role 必須維持 ${slide.page_role}。`,
    '只回傳 JSON：{"svg":"<svg ...>...</svg>"}',
  ]
    .filter(Boolean)
    .join("\n\n");
};

module.exports = {
  SVG_GRAMMAR,
  buildAuthoringSystemPrompt,
  buildOutlineSystemPrompt,
  buildOutlineUserMessage,
  buildRepairUserMessage,
  buildSlideUserMessage,
  describeBrief,
};
