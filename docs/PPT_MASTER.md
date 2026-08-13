# 設計簡報（PPT Master）

> 最後更新：2026-08-13

---

## 1. 功能定位

「文件分析」底下現在有三條獨立的工作流：

| 子頁籤 | 用途 | 產出 |
| --- | --- | --- |
| 文件分析 | 將文件切成分鏡，供 AI 生圖 | 分鏡腳本 |
| 簡報生成 | 將文件整理成投影片內容，套用**公司固定範本** | PPTX（`pptx-automizer`） |
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
                                                 │ 2. LLM 產大綱（JSON）
                                                 │ 3. 需要配圖 → Gemini 產圖 → PUT 給 sidecar
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
| `api/_shared/pptMasterClient.js` | Node → sidecar 的 HTTP 客戶端 |
| `api/_shared/deckContract.js` | 大綱正規化、頁數上限、SVG 前置健檢 |
| `api/_shared/svgAuthoringPrompt.js` | 蒸餾文法卡 + `design_spec` + 可用字型 → system prompt |
| `api/_shared/deckAuthor.js` | 大綱 → 逐頁 SVG → 品質閘門修補迴圈 |
| `api/_shared/deckImages.js` | 依大綱產生 AI 配圖並上傳到 deck 工作區 |
| `api/_shared/geminiImage.js` | 共用的 Gemini 圖片生成（`/api/generate-images` 也用它） |
| `api/_shared/deckJobs.js` | 佇列、worker、進度回報 |
| `api/deck-jobs/index.js` | `POST` 建立、`GET /:id` 查詢、`GET /:id/download` 下載 |
| `api/ppt-templates/index.js` | template 目錄（快取 10 分鐘，只回傳與畫布格式相符的版型） |
| `src/components/create/PptMasterStudio.jsx` | 「設計簡報」子頁籤主面板 |
| `src/components/create/PptTemplatePicker.jsx` | 風格／版型選擇器（受控元件） |
| `src/components/create/pptTemplateCopy.js` | 模板 id → 繁體中文名稱、說明與標籤 |
| `src/components/create/DeckProgress.jsx` | 階段式進度、已耗時與背景執行說明 |
| `src/hooks/usePptMasterDeck.js` | 建立 job、輪詢、續傳、下載 |

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

前端沒有新增任何 `VITE_*` 變數。

---

## 7. 部署

- sidecar 由 `.github/workflows/ppt-master-service.yml` 部署到 Azure Container Apps，
  只在 `services/ppt-master-service/**` 變動時觸發。
- 該 workflow 會在部署後輪詢 `/health`，`status` 必須是 `ok`（代表 `attribution_guard.py` exit 0）才算成功。
- 需要的 GitHub secrets：`AZURE_CLIENT_ID`、`AZURE_TENANT_ID`、`AZURE_SUBSCRIPTION_ID`、
  `AZURE_RESOURCE_GROUP`、`AZURE_CONTAINER_REGISTRY`、`AZURE_PPT_MASTER_CONTAINER_APP`。
- Container Apps 的 ingress 應設為 **internal**，只讓 App Service 連得到。

---

## 8. 驗證

```powershell
# 前端與共用契約
corepack pnpm exec vitest run api/_shared/__tests__/deckContract.test.js src/hooks/__tests__/usePptMasterDeck.test.jsx src/services/__tests__/aiService.test.js
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
- 配圖失敗不會讓整份簡報失敗，該頁會改以純版面呈現，原因記在伺服器日誌。
