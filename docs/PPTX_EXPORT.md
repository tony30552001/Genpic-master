# PowerPoint 簡報匯出功能

> 版本 v2.0 | 最後更新：2026-05-04

---

## 1. 功能定位

Pixora 智繪現在有兩條獨立的文件工作流：

- **文件分析**：將文件切成分鏡，供後續 AI 生圖與分鏡匯出。
- **簡報生成**：將文件或大綱直接整理成每一頁的投影片內容，再套用公司 PowerPoint 範本輸出可編輯 PPTX。

簡報生成不會使用分鏡、圖片生成或批次生圖流程。

---

## 2. 使用方式

1. 前往**建立**頁面，開啟**文件分析**。
2. 切換到**簡報生成**分頁。
3. 選擇**上傳文件**或**貼上大綱**，設定投影片數量。
4. 點擊**設計簡報投影片**，等待 AI 產生每頁內容。
5. 在投影片內容卡片中編輯標題、副標題、內文、重點與講者備注。
6. 點擊**套用公司範本並匯出**，下載使用 `api/assets/2026_ppt_template_16.9.pptx` 產生的 PPTX。

範本固定為公司 16:9 版型，前端不提供任意範本路徑或模型選擇。

---

## 3. 簡報資料契約

簡報模式回傳 `slides`，不回傳 `scenes`：

| 欄位 | 類型 | 說明 |
|------|------|------|
| slide_number | number | 投影片順序，伺服器會重新編號 |
| slide_type | string | `cover`、`section`、`content` 或 `closing` |
| title | string | 投影片標題 |
| subtitle | string | 標題下方摘要 |
| body | string | 可直接放在頁面上的補充內容 |
| bullets | string[] | 可直接放入投影片的重點列表 |
| speaker_notes | string | 講者備注，保留在分析結果中 |
| source_excerpt | string | 對應原文摘錄 |
| table | object/null | 可編輯原生 PowerPoint 表格 |
| chart | object/null | 可編輯原生 PowerPoint 圖表 |

表格最多 8 欄、10 列；圖表最多 12 個分類、4 個系列。只有文件內存在可靠資料時，AI 才應回傳表格或圖表。

分鏡模式仍使用原有 `scenes` 契約，並保留圖片生成流程。

---

## 4. 公司範本映射

伺服器端 `api/_shared/pptxAutomizer.js` 固定載入 API 部署套件內的：

`api/assets/2026_ppt_template_16.9.pptx`

投影片類型映射如下：

| AI slide_type | 範本頁 | 用途 |
|---------------|--------|------|
| cover | 1 | 封面標題與副標題 |
| section | 2 | 章節標題 |
| content（無表格/圖表） | 3 | 一般內容頁 |
| content（含表格/圖表） | 4 | 資料內容頁 |
| closing | 5 | 結尾頁 |

超過五頁時，內容頁會重複使用範本第 3 或第 4 頁；公司母片、背景、字型與裝飾仍來自原始範本。範本文字區域會由 Automizer 修改，表格與圖表則以原生 PowerPoint 元件新增，因此匯出後仍可編輯。

---

## 5. API

### 文件分析

**端點：** `POST /api/analyze-document`

簡報模式請求：

```json
{
  "documentUrl": "https://<storage>.blob.core.windows.net/...",
  "fileName": "outline.txt",
  "slideCount": "auto",
  "mode": "presentation"
}
```

簡報模式回應包含：

```json
{
  "title": "簡報主題",
  "summary": "內容摘要",
  "analysis_mode": "presentation",
  "presentation_schema_version": 2,
  "slides": [
    {
      "slide_number": 1,
      "slide_type": "cover",
      "title": "投影片標題",
      "subtitle": "副標題",
      "body": "",
      "bullets": [],
      "speaker_notes": "講者備注",
      "source_excerpt": "原文摘錄",
      "table": null,
      "chart": null
    }
  ]
}
```

### 公司範本匯出

**端點：** `POST /api/generate-presentation`

```json
{
  "slides": [
    {
      "slide_type": "content",
      "title": "營收趨勢",
      "subtitle": "季度表現",
      "body": "",
      "bullets": ["Q2 高於 Q1"],
      "table": null,
      "chart": null
    }
  ]
}
```

API 回傳 `application/vnd.openxmlformats-officedocument.presentationml.presentation` 二進位內容。伺服器只允許使用 repository 內的公司範本，不接受客戶端檔案路徑或外部圖片 URL。

---

## 6. 技術架構

```text
DocumentUploader
  -> useDocumentAnalysis
  -> POST /api/analyze-document
  -> Azure OpenAI JSON: slides[]
  -> PresentationGenerator
  -> POST /api/generate-presentation
  -> pptx-automizer + company template
  -> editable .pptx
```

主要檔案：

| 檔案 | 職責 |
|------|------|
| `src/components/create/PresentationGenerator.jsx` | 簡報投影片列表、內容編輯與匯出 |
| `src/hooks/useDocumentAnalysis.js` | 分析狀態與 `slides` 更新/刪除 |
| `api/analyze-document/index.js` | 簡報 Prompt 與模式分流 |
| `api/_shared/presentationSchema.js` | 投影片、表格與圖表正規化 |
| `api/_shared/pptxAutomizer.js` | 公司範本載入、文字映射與原生視覺化 |
| `api/generate-presentation/index.js` | 認證、限流與二進位回應 |

`speaker_notes` 會保留在 AI 結果與前端編輯狀態；目前 Automizer renderer 不提供動態講者備注寫入，因此公司範本匯出不會新增備注區內容。

不需要新增 Azure 資源；流程沿用現有 Blob Storage、Azure OpenAI、API App Service 與 Static Web Apps。

---

## 7. 依賴

| 套件 | 版本 | 用途 |
|------|------|------|
| `pptxgenjs`（frontend） | `^4.0.1` | 分鏡模式瀏覽器端 PPTX 匯出 |
| `pptx-automizer`（api） | `^0.8.2` | 載入公司範本與組合投影片 |
| `pptxgenjs`（api） | `^3.12.0` | Automizer 原生表格/圖表 bridge |

定向驗證：

```powershell
corepack pnpm exec vitest run api/_shared/__tests__/presentationSchema.test.js api/_shared/__tests__/pptxAutomizer.test.js
corepack pnpm build
```
