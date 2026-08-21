# 設計簡報（PPT Master）

> 最後更新：2026-08-18

---

## 1. 功能定位

「文件創作」底下現在有兩條獨立的工作流：

| 子頁籤 | 用途 | 產出 |
| --- | --- | --- |
| 文件分鏡 | 將文件切成分鏡，供 AI 生圖 | 分鏡腳本 |
| **設計簡報** | 由 AI **逐頁設計版面**，套用 **ppt-master 的設計語言** | PPTX（原生 DrawingML 形狀） |

「設計簡報」只需要一個主題或一份文件，就能從 0 到 1 產生整份簡報，
包含配色、版面骨架、視覺層級與 AI 配圖，且輸出是可在 PowerPoint 中直接編輯的原生形狀，不是圖片。

---

## 2. 為什麼需要獨立的 Python sidecar

[`hugohe3/ppt-master`](https://github.com/hugohe3/ppt-master)（MIT）**不是函式庫，是 Agent Skill**。它把簡報生成拆成兩半：

1. **設計半段**：文件 → 每頁一個「受限方言的 SVG」。這一段**只能由 LLM 手寫**，專案沒有提供任何 CLI 代勞。
2. **編譯半段**：完全確定性、可無人值守的兩道指令。

```bash
python scripts/svg_quality_checker.py <proj> --quick-generate --format ppt169 --stage final --json
python scripts/svg_to_pptx.py         <proj> --quick-generate -o out.pptx
```

匯出器**拒絕在沒有通過品質報告的情況下執行**，所以永遠是「先檢查、再匯出」的兩步驟。

因為編譯半段是 Python，而且 `attribution_guard.py` 會 AST 檢查 13 個檔案、SHA-256 檢查 `LICENSE`、
正則檢查 `SKILL.md` frontmatter，只要 skill 目錄被修改就 `SystemExit(78)`，
所以我們**原封不動 vendored 整個 skill**，用一個獨立的 Python 服務包起來，而不是移植到 Node。

Template 只在「授稿時」有意義，**編譯器完全不讀 `templates/`**。`design_spec.md` 幾乎全是給模型看的散文，
所以我們的作法是把選定 template 的 `design_spec.md` **注入 LLM 的 system prompt**。

---

## 3. 系統架構

```
瀏覽器  ── POST /api/deck-jobs ─────────────►  Node (App Service)
        ◄─ 202 { jobId } ───────────────────
        ── GET  /api/deck-jobs/:id (輪詢) ──►  deckJobWorker
                                                 │ 1. 取素材（Blob → AnyDoc，PDF 退回 sidecar PyMuPDF）
                                                 │ 2. LLM 產大綱（JSON，含 art_direction）
                                                 │ 3. 依配圖密度政策挑頁 → 租戶模型產圖 → PUT 給 sidecar
                                                 │ 4. 逐頁 LLM 產 SVG（注入 design_spec + 文法卡）
                                                 │ 5. sidecar check → 有 error 回饋修補（最多 3 輪）
                                                 │ 6. sidecar export → PPTX bytes
                                                 └ 7. 上傳 Blob，job succeeded
                                              ▼ HTTPS + 共用密鑰
                                    ppt-master-service (Container Apps)
                                    FastAPI + 原封 vendored skill + Python 3.12
```

### 檔案對照

| 檔案 | 職責 |
| --- | --- |
| `services/ppt-master-service/` | Python sidecar（FastAPI），詳見該目錄的 `README.md` |
| `db/migrations/011_deck_generation_jobs.sql` | `deck_generation_jobs` 佇列表 |
| `db/migrations/012_deck_job_events.sql` | `deck_job_events` 步驟事件表（時間軸資料來源） |
| `api/_shared/pptMasterClient.js` | Node → sidecar 的 HTTP 客戶端 |
| `api/_shared/deckContract.js` | 大綱正規化、頁數上限、SVG 前置健檢 |
| `api/_shared/svgAuthoringPrompt.js` | 蒸餾文法卡 + `design_spec` + 可用字型 → system prompt |
| `api/_shared/deckAuthor.js` | 大綱 → 逐頁 SVG → 品質閘門修補迴圈 |
| `api/_shared/deckImages.js` | 依配圖政策產生 AI 配圖（併發 2）並上傳到 deck 工作區 |
| `api/_shared/imageProviders.js` | 模型名稱 → 圖片 bytes（`gemini-imagen` / `gpt-image-2`） |
| `api/_shared/geminiImage.js` | 共用的 Gemini 圖片生成（`/api/generate-images` 也用它） |
| `api/_shared/deckJobs.js` | 佇列、worker、進度、步驟事件與逐頁預覽的保存 |
| `api/_shared/deckPreview.js` | 把預覽 SVG 內的 `../images/xxx` 換成內嵌 data URL |
| `api/deck-jobs/index.js` | `POST` 建立、`GET /:id` 查詢、`GET /:id/download` 下載、`GET /:id/slides/:n` 預覽 |
| `db/migrations/013_deck_slide_previews.sql` | `deck_slide_previews` 逐頁預覽表 |
| `db/migrations/015_deck_image_density.sql` | `deck_generation_jobs.image_density` 配圖密度 |
| `api/ppt-templates/index.js` | template 目錄（快取 10 分鐘，只回傳與畫布格式相符的版型） |
| `src/components/create/PptMasterStudio.jsx` | 「設計簡報」子頁籤主面板 |
| `src/components/create/PptTemplatePicker.jsx` | 風格／版型選擇器（受控元件） |
| `src/components/create/DeckImageDensityPicker.jsx` | 配圖密度選擇器（受控元件） |
| `src/components/create/pptTemplateCopy.js` | 模板 id → 繁體中文名稱、說明與標籤 |
| `src/components/create/DeckProgress.jsx` | 階段式進度、已耗時與背景執行說明 |
| `src/components/create/DeckTimeline.jsx` | 可展開的步驟時間軸（含逐頁明細） |
| `src/components/create/DeckSetupSummary.jsx` | 生成中／生成後把設定收合成一行摘要 |
| `src/components/create/DeckSlideRail.jsx` | 右側的垂直投影片縮圖列（PowerPoint 式） |
| `src/components/create/deckSteps.js` | 步驟中文名稱、事件流 → 時間軸、目前正在設計的頁碼 |
| `src/hooks/usePptMasterDeck.js` | 建立 job、輪詢、續傳、逐頁預覽快取、下載 |

---

## 4. 模板選擇與長時間等待

### 模板

`GET /api/ppt-templates` 只回傳 **`canvas_format` 等於 `DECK_CANVAS_FORMAT`（`ppt169`）** 的版型。
畫布固定是 1280×720，4:3、1:1、9:16 的版型 spec 會與授稿契約互相矛盾並在品質閘門失敗，
所以它們不該出現在選單裡。

上游索引只有英文摘要，因此 `src/components/create/pptTemplateCopy.js` 維護
模板 id → 繁體中文名稱／說明／標籤的對照。**上游新增模板時不會壞掉**：
找不到對照就退回英文摘要與 id。新增模板後請補上中文文案。

### 生成期間的追蹤

一份簡報要 5–15 分鐘，工作**完全跑在伺服器上**（`deck_generation_jobs` + worker），
瀏覽器只是輪詢者。因此：

- `usePptMasterDeck` 會把進行中的 `jobId` 存進 `localStorage`（`genpic_deck_job`），
  掛載時自動接回，切換頁籤、重新整理、關閉瀏覽器都不會弄丟工作。
- 工作成功後 `jobId` 仍保留，直到使用者按「重新產生」為止，重新整理後照樣能下載。
- 伺服器已不認得該 job（`404`）時就清掉本機紀錄，不視為錯誤。
- `waitForDeckJob()` 容忍連續 4 次輪詢失敗（休眠、換網路、暫時性 5xx），
  第 5 次才中止；**伺服器上的 job 狀態永遠是權威**。
- 只有「伺服器判定工作失敗」（`error.jobFailed`）或「工作不存在」（`404`）才會清掉本機的
  `jobId`。純粹的連線中斷會保留 `jobId` 並提示「回到此頁會自動接續」。
- 介面上的「停止追蹤」只停止這台裝置的輪詢，伺服器上的生成不會中止，這一點在按鈕的
  `aria-label` 與進度卡片文案中都有明說。

### 步驟時間軸

`phase` 只有一句話，說不出「現在做到第幾頁、上一頁過了沒」。因此 worker 另外把每一個
步驟寫進 `deck_job_events`（append-only），`GET /api/deck-jobs/:id` 會連同 job 一起回傳。

- 步驟集合定義在 `api/_shared/deckContract.js` 的 `DECK_STEPS`：
  `source`、`outline`、`images`、`slides`、`quality`、`export`。
- 事件狀態為 `running`、`succeeded`、`failed`、`skipped`。
- `slide_number IS NULL` 的事件代表**步驟本身**的狀態；帶 `slide_number` 的是該步驟底下的
  逐頁明細（第 N 頁設計完成、第 N 頁已修正、第 N 張配圖失敗）。
- 事件寫入失敗只會留下 warning，不會中斷生成——追蹤不該拖垮產出。
- 只有步驟層事件會更新 job 的 `phase`，逐頁事件僅推進 `progress_current`，
  避免標題文字在頁與頁之間跳動。
- 前端在 `src/components/create/deckSteps.js` 用 `buildTimeline()` 把事件流摺疊成步驟清單
  （同一層取最後一筆決定狀態），由 `DeckTimeline.jsx` 渲染；
  `running` 的步驟預設展開，其餘可自行點開。
- 失敗時 `usePptMasterDeck` 會保留 events，錯誤訊息下方直接顯示斷在哪一步。
- 生成中與生成後，主題／文件／頁數與風格骨架會收合成 `DeckSetupSummary` 的一行摘要
  （`{頁數} · {風格} · {骨架}`），把版位讓給進度；點「查看設定」可展開核對。
  等待期間輸入欄位本來就是唯讀的，留在畫面上只會把進度卡推到摺線以下。
- 進度卡標題在有事件之後固定為「AI 正在設計你的簡報」，步驟名稱交給時間軸，
  避免同一句話出現兩次；`phase` 只用於建立工作前的本機階段（準備、上傳文件）。

### 生成中的逐頁預覽

文字進度說不出「畫出來長什麼樣」。授稿產生的 SVG 就是匯出器唯一的輸入，
所以把它保存下來給瀏覽器看，就是所見即所得的預覽，不需要額外的渲染器。

- worker 每寫完一頁（初次授稿與**每一輪品質修正**）就把 SVG 存進 `deck_slide_previews`
  （一頁一列，`revision` 遞增）。保存比照事件記錄是 best-effort：預覽寫失敗只留 warning，
  絕不中斷生成。
- `GET /api/deck-jobs/:id` 會多回一份輕量的 `slides`（`slideNumber`、`revision`、`title`），
  SVG 本身走 `GET /api/deck-jobs/:id/slides/:n`，兩者都是 tenant + user 範圍。
- 瀏覽器用 **`<img>`** 渲染預覽，不把 SVG 放進 DOM——SVG 是模型輸出，不該當成信任邊界。
  `<img>` 是沙盒模式：沒有 script，**也不能載入外部資源**。因此授稿用的
  `href="../images/xxx.png"` 在預覽裡永遠是空白，配圖必須內嵌。
- 所以 `deckImages.js` 在把配圖送進 sidecar 的同時，另外存一份到
  `decks/<jobId>/images/<name>`（sidecar 工作區匯出後就被刪除），
  預覽端點再用 `deckPreview.js::inlineSlideImages()` 把它換成 data URL。
  換不到的圖片保持原樣：預覽留白，不讓整頁失敗。
- 前端以 `revision` 當快取鍵：只抓沒看過或被修正過的頁，換掉舊圖時
  `URL.revokeObjectURL`，`reset` 與 unmount 時全部釋放。
  預覽抓取失敗只讓那一格維持骨架，不影響生成流程與續傳語意。
- 版面是兩欄（`lg:grid-cols-5`）：左欄 `lg:col-span-3` 是設定／進度／結果，
  右欄 `lg:col-span-2` 是 `DeckSlideRail` 的垂直縮圖列，`lg` 以上 sticky。
  尚未產出的頁以骨架佔位，正在設計的那一頁有載入指示；
  點某一頁會在左欄放大顯示。成功與失敗都保留預覽。

### 尖峰負載、輸出截斷與素材檔名的三個現實

三個一定會遇到、且都不是使用者操作錯誤的失敗來源：

- **Azure GlobalStandard 尖峰拒絕**：部署在尖峰時會以 `429` 拒絕**體積過大的單一請求**
  （訊息是 *your request exceeds the maximum usage size allowed during peak load*）。
  這是針對「這個請求多大」的判定，不是「你叫得多頻繁」，所以重送同樣大小的請求沒有用。
  `api/_shared/llmRuntime.js` 的 `generateJson()` 因此在重試時同步**縮小 `max_output_tokens`**
  （下限 8000，逐頁授稿是 16000 → 9600 → 8000）並在「設計簡報」用途指派了備援模型
  時改用該模型（可以是另一家供應商），最多 4 次、退避帶抖動。4 次仍失敗才讓錯誤浮上來。
- **輸出被截斷**：模型會以 HTTP 200 回傳 `status: "incomplete"`（Gemini 是
  `finishReason: MAX_TOKENS`），輸出預算全花在推理或長篇內容上，訊息內容是空的。
  這與尖峰拒絕相反，重試必須**放大** `max_output_tokens`：`generateJson()` 逐次加倍
  （上限 32000）。大綱與逐頁授稿都從 16000 起跳。若回應的 `output_tokens` 明顯低於
  我們要的上限，代表是該部署自己的單次輸出長度限制，放大沒有意義，會直接回報
  「請改指派其他模型」。
- **非 ASCII 檔名**：sidecar 對檔名有保守的 ASCII 白名單，中文檔名會被回
  `unsafe file name (502)`，整份簡報在「解析素材」就死。`pptMasterClient.convertSource()`
  上傳前用 `sidecarFileName()` 正規化，保留副檔名（sidecar 靠它判斷格式）。
  使用者看到的檔名不受影響，正規化只作用在送往 sidecar 的那一次上傳。

---

## 5. 每頁 SVG 必須成立的硬性條件

以下全部是 **error 級**，違反就無法匯出。完整規則實作於 `api/_shared/svgAuthoringPrompt.js`，
前置健檢實作於 `api/_shared/deckContract.js` 的 `inspectSlideSvg()`，**Python 閘門永遠是最終權威**。

1. 良構 XML；`—`、`©` 用原生 Unicode，禁用 `&mdash;` 等 HTML 具名實體。
2. `xmlns` + `viewBox="0 0 1280 720"`，**每頁一致**；root `<svg>` 禁止 `transform`。
3. root 必須有 `data-pptx-page-role` ∈ `cover|toc|section|content|ending`。
4. 每個可見的**直屬 root** `<g>` 需有唯一 `id` **且** `data-pptx-bounds="x y w h"`，
   數值為正且落在畫布內。（`data-pptx-page-role` 一旦存在，缺 bounds 會從 warning 升級為 **error**。）
5. 幾何數字一律無單位有限小數：禁 `pt/%/em`、科學記號、前置 `+`、尾點 `5.`。
6. 只准白名單 inline 屬性；禁 `style`/`class`/`mask`/`textPath`/`@font-face`/SMIL/`script`/`foreignObject`。
7. 文字：一段落一個 `<text>`；換行用重複 `x` 的定位 `<tspan>` + 正 `dy`。
   `text-anchor` 不得放在 `<tspan>`。
   檢查器的量測盒是 `top = y − 0.85 × font-size`、`bottom = y + 0.35 × font-size`。
   模組邊界溢出 >5% = error；超出畫布的文字 = error。
8. 圖片：`href="../images/xxx.png"`（相對於 `svg_output/`）。

### 字型是輸出契約的一部分

容器裡實際安裝的字型決定版面。`GET /fonts` 會回報 `fc-list` 的結果，
`buildFontGuidance()` 只把**真的裝得到**的字型列入白名單寫進 prompt。
在 Windows 本機開發時 `fc-list` 不存在，會退回預設字型堆疊，這是預期行為。

### 配圖是決定性政策，不是模型的否決權

早期版本把「要不要配圖」整個交給大綱模型的 `needs_image`，結果模型幾乎一律回
`false`，使用者看到的就是「這份簡報不需要配圖」。現在職責切成三層：

- **決策層**：使用者選配圖密度，`api/_shared/deckContract.js` 的 `applyImagePolicy()`
  決定性地挑頁。模型只負責提名候選與描述畫面，沒有全有全無的否決權。
- **一致性層**：大綱同一次呼叫額外產出 `art_direction`（全份共用的英文視覺調性），
  且大綱階段就看得到所選 style／layout 的規範，因此範本調性只在這一處注入。
- **版面整合層**：每張圖帶 `image_role`，寫進授稿 prompt，讓授稿知道圖片要佔多大版面。

| 密度 | 行為 |
| --- | --- |
| `none` | 完全不配圖，`images` 步驟 `skipped` |
| `key`（預設） | 目標張數 `clamp(round(頁數 / 3), 2, 5)`；優先序 cover → section → 模型標記的 content → 其餘 content；`ending` 不配圖 |
| `every` | 每一頁都配圖 |

被政策選中卻沒有 `image_prompt` 的頁面，會用「簡報標題 + 頁標題 + 前兩條重點」
合成一份英文 brief 並記一筆事件，不靜默丟棄。

| `image_role` | 授稿指引 | 生圖指引 |
| --- | --- | --- |
| `background` | 滿版底圖，文字壓在其上 | 低對比、大量留白、中央無焦點 |
| `hero` | 佔半版的主視覺 | 主體明確、構圖偏一側 |
| `accent` | 小面積點綴 | 單一主體、簡潔 |

`cover` 預設 `background`、`section` 預設 `hero`、其餘預設 `accent`，模型可覆寫。

配圖模型**由租戶模型政策決定**（`ensureModelPolicy(tenantId).defaultModel`），
不是寫死 Gemini，也沒有前端模型選擇器。`api/_shared/imageProviders.js` 把模型名稱
收斂成 bytes：`gemini-imagen` 走 inline base64，`gpt-image-2` 走 `generateGptImage()`
再用 `fetchImageSource()` 下載。進入 `images` 步驟前會先確認該模型的憑證存在，
沒有就記一筆 `failed` 事件並以純版面繼續，不假裝成功、不跨模型回退。

尺寸上有一個已知落差：`16:9` 實際送給供應商的是 1536×1024（3:2），而授稿用
`preserveAspectRatio="xMidYMid slice"` 填滿。兩邊夾擊處理——生圖 prompt 要求主體置中
並留安全邊距，授稿 prompt 明講圖片約 3:2 會被裁切。

配圖以固定併發 2 生成（`gpt-image-2` 較慢且配額緊）。

---

## 6. 環境變數

| 變數 | 位置 | 說明 |
| --- | --- | --- |
| `PPT_MASTER_SERVICE_URL` | App Service | sidecar 的內部 URL，未設定則整個功能回 `503` |
| `PPT_MASTER_SERVICE_KEY` | App Service **與** Container Apps | 共用密鑰，兩邊必須一致 |
| `PPT_MASTER_TIMEOUT_MS` | App Service | 單一 sidecar 請求逾時，預設 900000 |
| `PPT_MASTER_INCLUDE_BRANDS` | App Service | 設為 `true` 才會開放品牌 template（預設隱藏，避免第三方商標問題） |
| `DECK_JOB_TIMEOUT_MINUTES` | App Service | worker lock 逾時，預設 40 |
| `DECK_JOB_POLL_MS` | App Service | worker 輪詢間隔，預設 5000 |
| `PPT_MASTER_WORKDIR` | Container Apps | deck 工作目錄，預設 `/tmp/decks` |
| `PPT_MASTER_COMMAND_TIMEOUT` | Container Apps | 單一 skill 指令逾時秒數 |
| `GPT_IMAGE_ENDPOINT` / `GPT_IMAGE_API_KEY` | App Service | 租戶預設模型為 `gpt-image-2` 時，配圖需要這兩個變數 |

撰稿使用的模型（含尖峰被拒時改用的同儕模型）在管理中心「分析模型」的「設計簡報」
用途指派，不再由環境變數設定。未指派時 job 會直接失敗並回報 `llm_not_configured`。

前端沒有新增任何 `VITE_*` 變數。

---

## 7. 部署

- sidecar 由 `.github/workflows/ppt-master-service.yml` 部署到 Azure Container Apps，
  只在 `services/ppt-master-service/**` 變動時觸發。
- 該 workflow 會在部署後輪詢 `/health`，`status` 必須是 `ok`（代表 `attribution_guard.py` exit 0）才算成功。
- 需要的 GitHub secrets：`AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID`、
  `AZURE_RESOURCE_GROUP`、`AZURE_CONTAINER_REGISTRY`、`AZURE_PPT_MASTER_CONTAINER_APP`。
- Container Apps 的環境 `cae-genpic` 沒有掛 VNet，App Service 也沒有 VNet 整合，
  因此 ingress 是 **external**，改成 internal 會直接切斷 App Service 的連線。
  實際的隔離手段是 **ingress IP 允許清單**：`ca-ppt-master` 只放行 `app-genpic-api`
  的 20 個 outbound IP，其餘來源一律 `403 RBAC: access denied`，再加上
  `X-Pixora-Service-Key` 這層共用密鑰。
- **升級或搬移 App Service plan 會換掉 outbound IP**，允許清單沒同步更新的話，
  sidecar 會開始回 `403`。改動 plan 後要重新比對
  `az webapp show --query possibleOutboundIpAddresses` 與 ingress 的 IP 規則。
- 資料庫 migration 是手動執行的。`012_deck_job_events.sql` 必須在部署新版 API 之前跑完，
  否則 `GET /api/deck-jobs/:id` 會因為查不到 `deck_job_events` 而失敗：
  `node api/scripts/migrate.cjs 012_deck_job_events.sql`（已於 2026-08-13 套用到 `db-genpic`）。
- `013_deck_slide_previews.sql` 同樣必須先於 API 部署執行，否則同一個端點會查不到
  `deck_slide_previews`：`node api/scripts/migrate.cjs 013_deck_slide_previews.sql`。

---

## 8. 驗證

```powershell
# 前端與共用契約
corepack pnpm exec vitest run api/_shared/__tests__/deckContract.test.js api/_shared/__tests__/deckPreview.test.js api/_shared/__tests__/azureOpenAI.test.js api/_shared/__tests__/llmRuntime.test.js api/_shared/__tests__/pptMasterClient.test.js src/hooks/__tests__/usePptMasterDeck.test.jsx src/services/__tests__/aiService.test.js src/components/create/__tests__/deckSteps.test.js src/components/create/__tests__/DeckSlideRail.test.jsx src/components/create/__tests__/PptMasterStudio.test.jsx
corepack pnpm lint
corepack pnpm build

# 後端
node --check api/server.js

# sidecar（容器內，零 AI 參與的完整管線）
docker build -t pixora-ppt-master:dev services/ppt-master-service
docker run --rm -e PPT_MASTER_SERVICE_KEY=dev pixora-ppt-master:dev python smoke.py
```

---

## 9. 已知限制

- 一份簡報 4–12 頁，實際耗時約 5–15 分鐘（逐頁 LLM 授稿 + 品質閘門修補）。
  生成期間可以離開頁面，回來會自動接續。
- 版型只開放 16:9（`ppt169`）；要支援其他比例必須同時改畫布常數、授稿契約與品質檢查。
- 品牌 template 帶有第三方商標，預設不開放，需要時才用 `PPT_MASTER_INCLUDE_BRANDS` 開啟。
- 使用者上傳自家 `.pptx` 萃取 template 尚未實作，需要先掛載 Azure Files 永續磁碟
  （容器檔案系統是暫時的，註冊的 template 會在重啟後消失）。
- 配圖失敗不會讓整份簡報失敗，該頁會改以純版面呈現，原因記在步驟事件與伺服器日誌。
  配圖模型未設定憑證時，`images` 步驟整步記為 `failed`，其餘流程照常完成。
- `every` 密度最多 12 張圖、併發上限 2；搭配較慢的 `gpt-image-2` 時牆鐘時間會明顯拉長。
- 授稿呼叫遇到尖峰 `429` 會自動縮小輸出預算並改用備援部署重試；若整段尖峰持續，
  仍會失敗，而且整個 job 會依 `MAX_ATTEMPTS` 從「解析素材」重跑，大綱與配圖都會重做。
- 生成中的預覽用的是**瀏覽器本機的字型**，容器裡是 `fc-list` 回報的那一組。
  版面骨架、配色與比例與最終 PPTX 一致，中文字型可能被替換，實際字面以下載的檔案為準。
- **sidecar 是單副本且 workspace 沒有持久化**（`min=max=1`、無 volume、workspace 在容器的
  `/tmp`）。容器一旦重啟，進行中的簡報 workspace 就消失，該 job 會在下一次 sidecar 呼叫時失敗。
  目前沒有設 liveness/readiness probe、也沒有 scale rule，所以不會有探針或縮放造成的重啟；
  實際的重啟來源只有**部署新 revision** 與平台維護。
  部署 `services/ppt-master-service/**` 之前，先確認沒有 `processing` 中的 deck job。
