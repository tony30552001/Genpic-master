# GenPic UI 改善計畫

> 文件狀態：開發遵循基線  
> 建立日期：2026-09-04  
> 實作狀態：尚未開始  
> 適用範圍：GenPic Web 前端的登入、創作工作區、風格選擇器、設定與素材中心  
> 不代表授權：本文件核定改善方向與開發順序，不代表已授權一次修改全部畫面、刪除元件或變更產品功能。

## 1. 文件目的

本文件將 UI 稽核結果轉成可執行、可驗收、可回退的改善計畫，供後續開發、Code Review 與視覺 QA 使用。

改善重點不是全面換色或重做產品，而是保留現有工作台架構，移除容易呈現 AI SaaS 範本感的視覺模式：

- 登入頁的動態 Aurora／Mesh Gradient 與無功能性的毛玻璃。
- 卡片裡再包卡片的過度容器層級。
- 所有選項都使用等尺寸圓角卡片的排列方式。
- 大面積純白 surface 與過度使用品牌藍。
- 重複的 eyebrow、說明卡及無資訊意義的進場動畫。

## 2. 設計目標

### 2.1 產品定位

- 使用者：需要製作圖片、文件分鏡與簡報的內容、行銷及設計協作者。
- 主要任務：把需求、文件與參考素材有效率地轉成可用視覺成果。
- 建議調性：`modern-minimal workbench`，呈現沉穩、可控的專業創作工具，而不是強調「AI 魔法感」的展示型網站。

### 2.2 必須保留

- 現有路由、頁面資訊架構與主要操作流程。
- 一般創作頁的左側操作、右側預覽工作台。
- 簡報設計的設定區／簡報藍圖雙欄關係。
- 桌機版底部輸出設定列與手機版底部導覽。
- Google、Microsoft 登入方式及既有 session 行為。
- 既有表單資料結構、API 契約、生成 callback 與權限控制。
- Light／Dark theme、鍵盤操作、focus ring 與 reduced-motion 支援。

### 2.3 本計畫不包含

- 不重寫路由樹或頁面目錄。
- 不修改認證、生成、儲存、LINE 或其他後端流程。
- 不捏造範本預覽圖、產品指標、使用者證言或不存在的功能。
- 不以視覺改善為由順便重構不相關商業邏輯。
- 不刪除 production 元件；若後續確實需要刪除或更名，必須先提出明確檔案清單並取得確認。
- 不把素材中心的資料型別錯誤混入純視覺變更；該問題應獨立修復或提供穩定測試 fixture。

## 3. 共用設計規則

後續各批次必須共同遵循以下規則。

### 3.1 Surface 層級

整個介面只使用三種層級：

1. Page background。
2. Work surface。
3. Popover、dropdown 或 dialog。

一般工作內容最多只能有一層主要 elevation。內部分區應優先使用留白、標題與 divider，不得再以完整卡片包住另一張完整卡片。

### 3.2 顏色

- Light mode 的背景與工作面應使用帶有輕微色相的 neutral，不使用大面積純白。
- Dark mode 應維持清楚的 surface 差異，避免只靠陰影區分層級。
- 品牌藍只用於主要動作、選取狀態、重要連結與 focus。
- 不得讓頁首、頁籤、按鈕、說明框及裝飾同時使用相同高彩度藍色。
- 新色彩必須透過 semantic token 使用，不得在元件內新增任意 hex、HSL 或 RGB 值。

### 3.3 字體與資訊層級

- 保留 `Noto Sans TC` 為主要中文介面字體，避免為了造型導入缺字或可讀性不穩定的中文字型。
- 先透過字級、字重、行高與間距建立層級。
- 標題保持正體，不使用斜體標題。
- 不使用沒有資訊價值的英文 eyebrow 重複中文標題。

### 3.4 圓角與容器

- 主要 work surface 建議採約 12px 圓角。
- 輸入元件與一般按鈕建議採約 8px 圓角。
- 完全膠囊形只用於狀態、標籤及少量 segmented control。
- Helper text 預設直接顯示，不應每段都放入灰色圓角說明卡。

最終數值應在批次 0 的 token 設計中確認，確認後不得由個別頁面自行覆寫。

### 3.5 動態

- 動態只能用來說明狀態或空間關係。
- 一般列表與卡片預設保持靜態。
- 只允許動畫 `opacity` 與 `transform`，不得動畫 layout properties。
- Tab content replacement 可使用短 opacity transition。
- Dialog、popover 可使用短距離 transform。
- 不得讓所有 section 在顯示時套用 `fade-in + slide-in`。
- `prefers-reduced-motion` 下，空間動畫必須移除；必要 feedback 應縮減為不超過 150ms 的 opacity change。

### 3.6 互動狀態

互動元件應依實際能力提供清楚的：

- Default
- Hover
- Focus-visible
- Active
- Disabled
- Loading
- Error
- Success

若元件不會進入某個狀態，不得為了湊齊狀態而新增虛構行為。選取、錯誤與成功不可只依賴顏色表示。

### 3.7 Responsive

- 必須驗證 320、375、414、768 與 1280px。
- `html` 與 `body` 不得產生水平捲動。
- 主要按鈕、頁籤與導覽項目的可點擊文字不得因寬度不足斷成兩行。
- 手機版 section heading 應回到單欄。
- 圖像型 grid track 必須允許內容收縮，避免圖片撐破版面。

## 4. 目標畫面家族

整個產品必須共用相同的色彩、字體、按鈕、圓角與 motion 規則，但依任務使用不同布局：

| 畫面 | 布局家族 | 原則 |
|---|---|---|
| 登入 | Quiet authentication portal | 安靜、直接，不使用 AI 光暈展示效果 |
| 一般製圖／圖片變身／簡報設計 | Workbench | 操作區與成果區具有明確主從關係 |
| 素材中心 | Catalogue | 素材是視覺主角，工具列與統計退居次要 |
| 設定 | Long-form settings | 以章節、divider 與 inline status 組織，不堆疊卡片 |

## 5. 分批實作計畫

每一批必須獨立實作、驗證與提交。不得將所有畫面一次改完後才進行 QA。

### 批次 0：建立設計基線

#### 目的

先建立整個產品共用的設計規則，避免登入、創作頁與設定頁各自發展成不同系統。

#### 預計建立

- `design.md`
- `tokens.css`
- `.hallmark/preflight.json`
- `.hallmark/log.json`

#### 預計修改

- `src/index.css`

`src/index.css` 必須採 append-only 原則：保留既有 Tailwind／CSS entry 指令，只在最上方加入 token import，並逐步把既有變數對應到 semantic token。

#### 實作要求

- 定義 page、surface、popover、ink、muted、rule、accent、focus 等 semantic color token。
- 定義 4pt spacing scale。
- 定義文字、圓角、陰影、duration 與 easing token。
- 初次接入時應維持目前視覺結果，避免基線批次同時成為全面改版。

#### Gate

- Token 接入前後視覺等價。
- 不改變任何畫面行為。
- Focused tests、lint 與 build 通過。
- 完成本批後才可開始其他視覺批次。

### 批次 1：登入頁去除 AI 味

#### 預計修改

- `src/components/auth/LoginShaderBackground.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/__tests__/LoginPage.test.jsx`
- `src/index.css`

#### 實作要求

- 移除 `MeshGradient` 動態 shader。
- 背景改為單一低對比品牌色場或安靜紋理。
- 移除登入面板的重度 `backdrop-filter`、多層 radial glow 與複數內外陰影。
- 登入面板改為接近實色的 surface、1px rule 及單層低對比陰影。
- 保留登入框置中；不得為了差異化強行改成行銷 landing page。
- 保留 Google、Microsoft、錯誤訊息、session loading 與 requested-route redirect。

#### Gate

- `MeshGradient` 不再 mount。
- 登入 surface 不使用 backdrop blur。
- 現有登入測試全部通過。
- Light／Dark app theme 下登入內容都清楚可讀。
- 320、375、414、768、1280px 無水平溢位。

### 批次 2：攤平創作工作區

#### 預計修改

- `src/InfographicGenerator.jsx`
- `src/components/create/ScriptEditor.jsx`
- `src/components/create/StyleSourceTabs.jsx`
- `src/components/create/ImageTransformPanel.jsx`
- `src/components/settings/SettingsPanel.jsx`

#### 實作要求

- 保留桌機版操作區／預覽區的工作台比例。
- 每一個工作模式只保留一張主要 work surface。
- 「內容描述、用途、參考、風格」改用 section heading、留白與 divider 分區。
- 收合區塊展開後不得額外產生另一張完整外框卡片。
- 模型或連線狀態改用 inline status；helper text 不使用厚重提示卡。
- 不修改表單值、hooks、資料 fetching、生成 callback 或 PptMasterStudio 狀態機。

#### Gate

- 一般工作內容最多一層主要 elevation。
- Popover、dropdown、dialog 可使用第二層 elevation。
- 收合前後不產生非預期 layout jump。
- 手機版不因多層容器 padding 導致內容過窄。
- PptMasterStudio 現有測試全部通過。

### 批次 3：重做範本、調色盤與語言選擇

#### 預計修改

- `src/components/create/PromptTemplates.jsx`
- `src/components/create/StyleSourceTabs.jsx`
- `src/components/settings/SettingsPanel.jsx`

#### 預計新增測試

- `src/components/create/__tests__/PromptTemplates.test.jsx`
- `src/components/create/__tests__/StyleSourceTabs.test.jsx`
- `src/components/settings/__tests__/SettingsPanel.test.jsx`

#### 範本要求

- 移除桌機三欄、手機兩欄的等尺寸文字卡排列。
- 第一階段改為桌機兩欄、手機單欄的緊湊選擇列。
- 顯示範本名稱、二至三個主要風格標籤與精簡摘要。
- 點擊仍直接呼叫既有 `onFill(text, palette)`。
- 不得在此批次順便加入未核定的最近使用、收藏或持久化功能。
- 只有在取得真實且經確認的生成結果後，才可另案加入範本預覽縮圖。

#### 調色盤要求

- 保留既有畫風、情緒、光線、色彩、構圖等資料分類。
- 預設只展開一個分類，其餘分類顯示已選數量。
- 上方顯示目前已套用條件摘要與「全部清除」。
- 降低同一 viewport 同時出現的 chip 數量。
- 釐清沒有主動選取時仍出現「已套用」的狀態，不得把預設值誤呈現為使用者操作。

#### 語言要求

- 移除三欄的語言介紹卡。
- 改為單欄 radio list，或適合既有元件庫的 Select／Command menu。
- 每個選項只顯示語言名稱、代碼與選取狀態。

#### Gate

- 套用範本仍為一次點擊。
- `onFill(text, palette)` payload 完全不變。
- 範本、tab、chip 與語言選項均可由鍵盤操作。
- Focus、selected、disabled 狀態清楚，不只依賴顏色。
- 375px 下沒有兩欄過窄卡片或水平捲動。

### 批次 4：設定頁與素材中心去模板化

#### 預計修改

- `src/components/settings/SettingsPanel.jsx`
- `src/components/library/AssetCenter.jsx`
- `src/index.css`

#### 設定頁要求

- 移除中文「設定」上方重複的 `Settings` eyebrow badge。
- 直接使用能說明頁面用途的副標。
- 模型、語言與 LINE 整合以 section hierarchy 組織。
- 狀態提示使用 inline status，不使用滿版彩色說明卡。

#### 素材中心要求

- 三張等尺寸摘要卡改為單列統計／filter strip。
- 卡片 hover 最多只變更 border 或 surface，不同時上移、加陰影及放大圖片。
- 移除各 tab 通用的 `fade-in + slide-in-from-bottom`。
- Tab content replacement 最多保留短 opacity transition。
- 素材內容成為視覺主角，容器退到背景。

#### 前置阻擋

目前素材中心在本機曾因 `templates.map is not a function` 進入 Error Boundary。這是資料契約／功能問題，應獨立修復或提供穩定 fixture。若素材中心無法穩定開啟，本批不得宣告視覺驗收完成。

#### Gate

- 頁籤切換不再讓整個 section 滑入。
- Reduced-motion 下無空間動畫。
- 素材卡不使用多重 hover 裝飾。
- 素材中心可在穩定資料下完成桌機與手機視覺驗收。

### 批次 5：跨畫面驗收與發布

#### 必測矩陣

| 維度 | 必測狀態 |
|---|---|
| 寬度 | 320、375、414、768、1280px |
| Theme | Light、Dark |
| 認證 | Session loading、Google、Microsoft、錯誤、已登入 redirect |
| 創作 | 一般製圖、文件分鏡、簡報設計、圖片變身 |
| 選擇器 | 範本、調色盤、我的風格、語言 |
| 素材 | Overview、Templates、Styles、History |
| 輸入 | 鍵盤、滑鼠、Touch |
| 動態 | Normal、`prefers-reduced-motion` |

#### 驗證順序

1. 執行該批新增或修改的 focused tests。
2. 執行 `pnpm lint`。
3. 執行 `pnpm build`。
4. 執行完整 `pnpm test`。
5. 若完整測試存在既有失敗，必須與本批新增失敗分開報告，不得以 focused tests 取代完整測試結果。
6. 使用相同 viewport、相同資料與相同 theme 截取 before／after 畫面。
7. 檢查 horizontal overflow、focus ring、文字截斷、touch target 與對比。

## 6. 變更與提交規則

- 每個批次使用獨立 commit 或 Pull Request，確保可單獨回退。
- 不得把設計基線、登入頁、選擇器與素材中心混成一個大型變更。
- 修改前先列出預計修改、建立與刪除的檔案。
- 刪除或更名 production 檔案必須取得明確確認。
- 保留工作目錄中的其他既有變更，不得重設或覆寫不屬於當前批次的檔案。
- Source code 與 tests 為最終行為依據；本文件的未知項目是驗證缺口，不是自動新增需求。
- 若實作需要偏離本文件，應先更新本文件的「偏離紀錄」，說明理由、影響範圍與核定結果，再修改程式。

## 7. Code Review 檢查表

每個 UI 變更至少回答以下問題：

- [ ] 是否保留原有資料流、API、權限與 callback？
- [ ] 是否使用既有 semantic token，而不是新增任意值？
- [ ] 是否出現卡片裡再包完整卡片？
- [ ] 是否把所有選項再次做成等尺寸圓角卡？
- [ ] 品牌藍是否只用於動作、選取與 focus？
- [ ] Helper text 是否被不必要地放進裝飾卡？
- [ ] 動畫是否傳達狀態或空間關係？移除後若不影響理解，是否應直接移除？
- [ ] 是否支援鍵盤、focus-visible 與 reduced-motion？
- [ ] 是否完成 320、375、414、768、1280px 驗證？
- [ ] 是否分別檢查 Light 與 Dark theme？
- [ ] 是否附上相同狀態、相同 viewport 的 before／after 證據？
- [ ] 是否只修改本批次列出的檔案與行為？

## 8. 完成定義

只有符合以下全部條件，才可宣告本 UI 改善計畫完成：

- [ ] 登入頁沒有 Aurora shader 與無功能性的毛玻璃。
- [ ] 一般工作區沒有超過一層的巢狀 work surface。
- [ ] 範本不再使用三欄等尺寸文字功能卡。
- [ ] 語言不再使用三欄介紹卡。
- [ ] 調色盤採用漸進揭露，且「已套用」狀態準確。
- [ ] 品牌藍只用於主要動作、選取與焦點。
- [ ] 動畫只傳達狀態改變，不裝飾所有 section。
- [ ] 桌機與手機保留相同核心工作流程。
- [ ] 認證、生成、設定、範本 callback 與 API 契約沒有改變。
- [ ] 新增視覺不依賴虛構範本圖、指標或產品能力。
- [ ] Focused tests、lint、build 與完整 tests 的結果均已記錄。
- [ ] 實際完成全部視覺 QA 矩陣。

## 9. 執行狀態

| 批次 | 狀態 | 實作紀錄 |
|---|---|---|
| 0. 設計基線 | 未開始 | — |
| 1. 登入頁 | 未開始 | — |
| 2. 創作工作區 | 未開始 | — |
| 3. 選擇器 | 未開始 | — |
| 4. 設定與素材中心 | 未開始 | — |
| 5. 跨畫面驗收 | 未開始 | — |

## 10. 偏離紀錄

若後續需要偏離本計畫，請在此新增紀錄，不要只在程式中留下例外：

| 日期 | 批次 | 偏離內容 | 理由 | 影響 | 核定狀態 |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

