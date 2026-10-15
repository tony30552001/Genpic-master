# 「無文字」與「修改這張」改善計畫

> 文件狀態：已完成（第 1–4 階段：A1 + A2、C + B5、B2 + B3、B4 + B6）
> 建立日期：2026-10-15
> 範圍：整合「一般創作」與「圖片轉換」成單一創作工作區，包含生成設定、附圖用途、預覽區與修改流程

## 1. 背景與依據

近 30 天資料（8 位使用者、117 筆歷史、79 次生成、40 次修改）顯示兩個重複出現的摩擦：

1. **使用者在 prompt 裡手打「不要文字／把文字移除」。** 「無文字」其實已存在（`imageLanguage = "none"`），但只放在設定分頁的語言清單（`SettingsPanel.jsx`），離生成按鈕太遠，使用者找不到。約 30 筆職安情境插圖都有這種需求。
2. **使用者用「整段 prompt 重生」代替「修改」。** 同一組公車盲區 prompt 被重生 11 次，每次構圖都會跑掉。預覽區（`ImagePreview.jsx`）只有「分享到 LINE」與「下載圖片」。要修改得先下載、切到圖片轉換分頁、再重新上傳。

設計原則（Apple Design 的八原則）：

- **Grouping & mapping**：控制要放在它影響的東西旁邊。
- **Spatial consistency**：從哪裡展開，就回到哪裡。
- **Agency + forgiveness**：任何一版都能回頭。
- **Simplicity**：常用路徑放第一層，進階功能往下一層。

## 2. 功能 A：「無文字」放到生成設定

### A1. GenerateBar 新增「圖中文字」切換

- 在 `GenerateBar` 的比例與品質旁新增一組分段控制：`繁中｜無文字｜其他▾`。
  - 「其他▾」展開其餘語言（沿用 `SettingsPanel` 的 `LANGUAGE_OPTIONS`）。選了其他語言時，分段的第三格改成顯示那個語言的名稱。
  - 外觀與互動沿用比例／品質按鈕：`aria-pressed`、`min-h-11`、`focus-visible`，標籤不換行。
- 把 `LANGUAGE_OPTIONS` 抽到共用模組，例如 `src/lib/imageTextLanguage.js`，`SettingsPanel` 與 `GenerateBar` 都從這裡引用，不要各自維護一份。
- 狀態沿用 `InfographicGenerator` 現有的 `imageLanguage`（localStorage `genpic_image_language`）與 `handleLanguageChange`（切換時會清空 `optimizedPromptEn`）。設定頁與工作區是同一個值，雙向同步。
- 輸出設定標題列的摘要（`模型 · 尺寸`）加上目前的文字模式，例如 `· 無文字`，讓使用者一眼確認。
- 整合後只剩一個 `GenerateBar`（見功能 C），不會有第二組控制。

### A2. Prompt 提示：偵測「不要文字」

- 新增 `src/lib/promptHints.js`，提供純函式 `detectNoTextIntent(text)`。
  - 比對：不要文字、不要有文字、無文字、移除文字、去掉文字、不含文字、no text、without text 等。
  - 排除只針對局部的說法，例如「標題不要文字」。規則從保守開始，寧可漏報也不要誤報。
- 在一般創作分頁的 `ScriptEditor` 下方顯示提示卡，條件是偵測成立而且 `imageLanguage !== "none"`：
  - 文案：「偵測到你不要圖中文字，改用『無文字』效果更穩定。」
  - 按鈕：「改用無文字」會呼叫 `handleLanguageChange("none")`；「略過」會關閉提示，直到 prompt 有新的變化才會再出現。
  - 提示卡用 `role="status"`，進場用 motion token，並支援減少動態效果。
- 這是之後「AI 生圖教練」規則型提示的第一條，提示卡元件設計成可接受多種提示，但目前只實作這一種。

### A 驗收

- 不進設定頁，就能在生成按鈕旁切換到「無文字」，而且設定頁會同步顯示。
- 輸入「不要文字」會出現提示，一鍵切換後提示消失。
- 測試：
  - `promptHints` 的單元測試，包含正例、反例與局部描述。
  - `GenerateBar.test.jsx` 驗證文字模式的切換與 `aria-pressed`。
  - `SettingsPanel.test.jsx` 改用共用的選項清單。

## 3. 功能 B：「修改這張」與版本畫布

### B1. 互動設計：原地開始，需要時再展開

| 情境 | 呈現 |
| --- | --- |
| 剛生成完、只想改一點 | 預覽區下方出現「要修改哪裡？」輸入框和「修改這張」按鈕，結果在原位取代 |
| 已有 2 個以上版本，或按「展開」 | 預覽從原位放大成整頁畫布；關閉時縮回同一個位置 |
| 手機（`lg` 以下） | 預覽本來就接近全螢幕，直接使用同一個畫布版面 |

不一按就切成整頁的原因：大多數修改是連續的小調整，而左側還有 prompt、比例與「無文字」需要使用。整頁畫布是給比較版本時用的。

### B2. 預覽區（原地模式）

- `ImagePreview` 新增 props：`onRefine(instruction)`、`isRefining`、`versions`、`activeVersionId`、`onSelectVersion`、`onExpand`。
- 圖片下方放修改輸入列：單行輸入框（`aria-label="描述要修改的地方"`，Enter 送出）、主按鈕「修改這張」，以及「下載圖片」「分享到 LINE」。「修改這張」是主要動作，視覺權重最高。
- 修改中不切成空白的生成中畫面：目前的圖片變暗並顯示進度（沿用 `generationStatus`），完成後新版本在原位淡入。這部分要改掉預覽圖現在寫死的 `duration-500`，改用 motion token；若使用者開啟減少動態效果，就只用淡入淡出。
- 失敗時顯示行內錯誤，原圖保留，輸入的修改說明也保留。

### B3. 版本與關聯

- 新增 `src/hooks/useImageVersions.js`，在記憶體中保存版本鏈：
  - 每個版本的欄位：`{ id, jobId, imageUrl, instruction, parentId, createdAt }`。
  - 一般生成會開始一條新的版本鏈，記為 v1，`parentId = null`。
  - 每次修改都以「目前選取的版本」為 parent，所以從 v2 再改會分出支線。
  - 從歷史紀錄載入時，以載入的那張圖開始一條新鏈。
  - 離開頁面就清空，不寫入資料庫。
- 版本列（預覽下方或畫布底部）：
  - 用縮圖顯示 v1 → v2 → v3，支線縮排顯示。
  - 點選任一版會切換預覽，之後的修改都套用在那一版。
  - 每個縮圖的 `aria-label` 包含版本號與修改說明。

### B4. 展開畫布（比較模式）

- 從預覽的位置放大到整個工作區：`transform-origin` 對準原預覽框，關閉時循原路縮回。支援 Esc、「關閉」按鈕和瀏覽器返回鍵。
- 比較方式（使用者的圖約七成是 16:9，並排會太小，所以不並排）：
  1. **按住看原圖**：按住畫面或按住「比較」按鈕時顯示 parent 版本，放開就回到目前版本。按下的當下立刻切換，不加延遲。鍵盤操作用按住空白鍵。
  2. **前後滑桿**：可拖曳的分隔線，用 Pointer Events 加 `setPointerCapture`，跟著手指移動。分隔線本身是 `role="slider"`，支援方向鍵。
- 修改輸入列固定在畫布底部，採半透明材質（`backdrop-blur`）。若使用者開啟 `prefers-reduced-transparency`，就改為實色。
- 畫布是可隨時關閉的平行工作區，不加暗色遮罩。

### B5. 修改的技術流程

1. 目前的版本圖片是 data URL（`/api/image-jobs` 回傳），前端轉成 `File` 後呼叫 `uploadFile(file, "image")` 取得 `uploadId`。同一個版本只上傳一次，`uploadId` 快取在版本物件上。
2. 呼叫 `transformImage({ uploadId, mode: "refine", prompt: instruction, aspectRatio: <原圖比例>, imageQuality, imageLanguage })`，再用 `waitForImageJob()` 等待結果。
3. 成功後寫入歷史紀錄：`source: "refine"`，`userScript` 存修改說明。`history.source` 有 CHECK 約束，因此新增 `db/migrations/027_history_source_by_purpose.sql` 允許依用途記錄的來源（見功能 C）。
4. 在後端新增 `refine` 轉換模式，因為現有的 `reference_gen` 指令是「建立變體」，而且「不沿用無關文字」，不符合「只改指定處」的需求：
   - `api/_shared/imagePrompt.js`：`refine` 指令為「只修改要求的部分；構圖、主體、配色、文字與版面其餘保持不變」。文字的處理依 `imageLanguage`，`none` 時移除所有文字。
   - `api/openapi.js` 的 mode enum 加入 `refine`。
   - 更新 `imagePrompt.test.js`。
5. 上傳、轉換、等待的流程由功能 C 的統一工作區 hook 負責，「修改這張」只是用途為 `refine`、來源是目前版本的一次轉換，不另寫一套流程。

### B6. 重複重生的提示

- 在 `promptHints.js` 新增 `isNearDuplicatePrompt(prev, next)`，用字元層級的相似度，門檻約 0.8。
- 當已經有生成結果、而新 prompt 與上一次幾乎相同時，生成按鈕上方顯示提示：「只改一小部分？用『修改這張』，構圖會保留。」點了之後游標移到修改輸入框。使用者仍可照常重新生成，不攔阻。

### B 驗收

- 生成後可以直接在預覽下方輸入修改並完成，不需要切換分頁或下載。
- 每一版都能點回去，從舊版再改會分出支線。
- 展開畫布可以按住看原圖、拖曳滑桿比較，關閉後回到原本的預覽位置。
- 測試：
  - `useImageVersions` 的單元測試，涵蓋新鏈、修改、分支與選取。
  - `ImagePreview.test.jsx` 涵蓋修改輸入、版本切換與錯誤時保留原圖。
  - 修改流程的 hook 測試，包含上傳只發生一次。
  - `imagePrompt.test.js` 新增 `refine` 測試。
  - `InfographicGenerator.test.jsx` 整合測試。

## 4. 功能 C：整合「一般創作」與「圖片轉換」

### C1. 為什麼整合

- **兩個分頁已經在做同一件事。** 一般創作附上參考圖時，`api/generate-images` 建立的就是 `operation = "edit"` 工作，跟圖片轉換一樣。近 30 天有 40 次 edit 工作，但只有 4 筆歷史紀錄來自圖片轉換分頁，可見使用者主要是在一般創作裡附圖。
- **「修改這張」本質上也是轉換**，只是來源圖換成目前的結果。若不整合，同一個能力會分散在三個地方。
- **使用者偏好直接寫 prompt。** 風格來源（上傳風格參考圖並分析）、已存風格與風格調色盤很少被用到，近 30 天歷史紀錄中沒有任何一筆使用 `style_id`。

### C2. 整合後的工作區

第一層只保留最常用的路徑：

1. **內容描述**（prompt），以及 A2 的提示卡。
2. **附圖（選填）**：可以上傳圖片，也可以按「用目前結果」把預覽中的版本帶進來。附圖之後出現「這張圖要怎麼用」：

   | 用途 | 呼叫端點 | prompt 的意義 | 輸出比例 |
   | --- | --- | --- | --- |
   | 參考內容（預設） | `generate-images`（`referenceUploadId`） | 描述要生成的畫面 | 使用者選擇 |
   | 修改這張 | `image-transform`（`refine`） | 描述要改的地方 | 沿用來源圖 |
   | 換背景 | `image-transform`（`bg_replace`） | 描述新背景 | 沿用來源圖 |
   | 取出元素 | `image-transform`（`element_extract`） | 描述要取出的元素 | 沿用來源圖 |

   - 輸入框的 placeholder 與標題會隨用途改變，例如換背景時顯示「描述新的背景」。
   - 選了沿用來源比例的用途時，比例控制顯示「沿用原圖」並停用，避免輸出被裁切。
3. **GenerateBar**：比例、品質、圖中文字（A1）。生成按鈕的文字跟著用途改變，例如「開始生成」「修改這張」「換背景」。

第二層收在「進階：風格」（預設收合，記住使用者的展開狀態）：

- 風格參考圖分析、已存風格、風格調色盤。
- 「套用風格到附圖」（原 `style_transfer`），只在有附圖時出現。
- 收合時若有套用中的風格，標題列顯示風格名稱並提供清除按鈕，讓目前狀態一眼可見。

### C3. 程式結構

- 移除 `image-transform` 分頁、`ImageTransformPanel` 與 `useImageTransform`，不保留舊入口。導覽（含手機底部導覽）跟著移除該項目。
- 新增 `src/hooks/useCreateWorkspace.js`，統一管理附圖、用途、送出、等待與寫入歷史紀錄：
  - 依用途選擇呼叫 `generateImage` 或 `transformImage`。
  - 成功後把結果交給 `useImageVersions`：沒有附圖或用途是參考內容時開始新的版本鏈；用途是轉換類而且來源是目前版本時，新版本的 parent 就是那個版本。
  - 原本 `useImageGeneration` 與 `useImageTransform` 重疊的工作狀態（進行中、取消、錯誤）合併到這裡，不要留兩份。
- 預覽區的「修改這張」輸入列是捷徑，等同於用目前版本作為附圖、用途為「修改這張」。
- 歷史紀錄：
  - `source` 改為依用途記錄：`general`、`refine`、`bg_replace`、`element_extract`、`style_transfer`。
  - 歷史紀錄頁的來源標籤與篩選要同步更新。
  - 既有歷史資料的 `source = 'image-transform'` 不做轉換，標籤對照表把它顯示為「圖片轉換」。
- 後端維持 `generate-images` 與 `image-transform` 兩個端點，因為兩者的請求內容不同；只新增 B5 的 `refine` 模式。

### C 驗收

- 導覽中不再有「圖片轉換」，原本的四種轉換都能在創作工作區透過附圖完成。
- 不附圖、不展開進階時，畫面只剩 prompt、附圖入口和生成設定。
- 切換用途時，placeholder、按鈕文字、比例狀態都正確改變。
- 測試：
  - `useCreateWorkspace` 依用途呼叫正確的服務與參數。
  - `InfographicGenerator.test.jsx` 移除轉換分頁相關斷言，改測整合流程。
  - 歷史紀錄的來源標籤測試。

## 5. 相依與風險

- **歷史圖片品質**：歷史紀錄存的是 800px、品質 0.6 的 JPEG（`useHistory.js` 的 `compressImage`），拿它來修改會放大畫質損失。建議在功能 B 之前或同時修正歷史圖片的儲存方式（保存原始 PNG，縮圖另外處理）。修正前，從歷史載入的版本在修改輸入列旁標示「此為壓縮預覽」。
- **歷史圖片的來源格式**：要確認歷史 `imageUrl` 在前端能否直接 `fetch` 成 Blob（例如 CORS 或 SAS 的設定）。若不行，就只開放本次工作階段生成的圖片使用「修改這張」。
- **費用**：每次修改都是一次生圖請求。修改按鈕旁沿用現有的品質與費用說明。
- **移除圖片轉換分頁的習慣衝擊**：少數使用過轉換的人會找不到舊入口。上線時在附圖區第一次出現用途選項時，加一行說明「圖片轉換已整合到這裡」，之後不再顯示。
- **風格功能降級**：收合後使用率可能更低。上線後觀察 `style_id` 與 `style_transfer` 的使用量，若持續接近零，再另案評估是否移除。

## 6. 交付順序

1. **A1 + A2**：改動範圍小，可以單獨上線。
2. **C 整合工作區**：`useCreateWorkspace`、附圖用途、風格收合、移除轉換分頁，以及 B5 的後端 `refine` 模式。
3. **B2 原地修改**與 **B3 版本鏈與版本列**。
4. **B4 展開畫布**與 **B6 重複重生的提示**。

每個階段都要：

- 跑相關的 vitest、`corepack pnpm lint` 和 `corepack pnpm build`。
- 改到後端時跑 `node --check`。
- 推送前執行 `openwiki --update` 並檢查產出。

上線後，用 `image_generation_jobs` 裡 `operation = 'edit'` 的比例，以及 prompt 中「不要文字」出現的次數，觀察成效。
