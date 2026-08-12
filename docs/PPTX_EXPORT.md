# PowerPoint 簡報匯出功能

> 版本 v1.1 | 最後更新：2026-05-03

---

## 1. 功能概述

Pixora 智繪的 **PowerPoint 匯出功能**讓你可以：

1. **上傳文件** → AI 分析內容 → 直接下載投影片文字內容，配圖可選 → 下載 .pptx 檔案
2. **貼上大綱** → AI 直接將文字大綱設計為投影片結構 → 下載 .pptx 檔案

產出的 .pptx 可直接用 Microsoft PowerPoint、Keynote 或 Google Slides 開啟並進行二次編輯，支援中英文混排與 AI 生成配圖嵌入。

---

## 2. 使用方式

### 方式一：上傳文件

1. 前往**「建立」**頁面
2. 在文件上傳區選擇**「上傳文件」**分頁
3. 拖曳或點擊上傳支援的格式：PDF、Office、OpenDocument、RTF、EPUB、CSV、TXT、MD、PNG、JPG（最大 50 MB）
4. 在**「文件分析」**分頁設定分析內容與投影片數量，完成後切換到**「簡報生成」**分頁
5. 點擊**「設計簡報投影片」**，等待 AI 分析（通常 15–45 秒）
6. 分析完成後可使用**「匯出 PPTX」**直接下載；尚未生成配圖也能先匯出文字內容
7. 若要使用伺服器端 `pptx-automizer`，點擊**「Automizer PPTX」**；此匯出會產生相同的可編輯內容，但目前不包含動態講者備注
8. （可選）系統會依簡報內容提供一套 AI 建議的圖片風格；若不符合需求，可在**「文件圖片風格」**面板選擇風格庫樣式取代
9. （可選）點擊**「批次生成所有圖片」**為各投影片生成配圖，再次匯出即可將配圖嵌入簡報

### 方式二：貼上文字大綱（快速設計）

1. 前往**「建立」**頁面
2. 在文件上傳區選擇**「貼上大綱」**分頁
3. 在文字方塊中貼上或輸入簡報大綱，例如：

   `
   主題：AI 在醫療產業的應用

   一、前言：AI 技術快速發展，醫療需求龐大
   二、當前挑戰：人力不足、診斷錯誤率
   三、AI 解決方案：影像辨識診斷、藥物研發加速
   四、成功案例
   五、結語
   `

4. （可選）設定**投影片數量**：「自動」或指定 3–10 張
5. 點擊**「AI 設計簡報投影片」**按鈕
6. 切換到**「簡報生成」**分頁，後續步驟同方式一（可直接匯出，或先生成圖片再匯出）

> **提示：** 大綱分頁固定使用簡報設計模式，無需另行選擇分析模式。

---

## 3. AI 生成的投影片結構

每張投影片由 AI（Gemini）生成以下欄位：

| 欄位 | 類型 | 說明 |
|------|------|------|
| recommended_style | object | 依文件主題與受眾推薦的共用圖片風格；可由風格庫取代 |
| recommended_style.name | string | AI 建議的風格名稱 |
| recommended_style.description | string | AI 建議風格的中文說明 |
| recommended_style.prompt | string | 套用於所有投影片配圖的英文風格 Prompt |
| recommended_style.tags | string[] | 風格標籤 |
| scene_title | string | 投影片標題（15 字內） |
| bullet_points | string[] | 3–5 條重點項目，每條 20 字內 |
| speaker_notes | string | 講者備注，補充演講要點（60 字內） |
| visual_prompt | string | AI 生圖 Prompt（英文關鍵字，用於生成配圖） |
| scene_description | string | 投影片核心主旨（30 字內） |
| layout_type | string | 版面建議：default、title_content、two_column、table、chart 或 closing |
| tables | object[] | 最多一個可編輯原生表格；每個表格最多 8 欄、10 列 |
| charts | object[] | 最多一個可編輯原生圖表；支援 bar、line、pie、doughnut |

---

## 4. 匯出的 PPTX 格式

| 設定 | 值 |
|------|----|
| 投影片比例 | 16:9（10 × 5.625 英吋） |
| 檔案命名 | {簡報標題}-{時間戳}.pptx |
| 每張投影片 | 序號徽章 + 標題 + 重點列表 + 原生表格/圖表或可選 AI 配圖 |
| 講者備注 | 一般瀏覽器匯出會嵌入；Automizer 匯出目前不包含動態講者備注 |
| 圖片格式 | PNG（base64 嵌入，無需網路即可開啟） |

### 投影片版面示意

`
+--------------------------------------------------+
| [N]  投影片標題                                  |
|                                   +-----------+  |
|  - 重點項目一                     |           |  |
|  - 重點項目二                     |  AI 配圖  |  |
|  - 重點項目三                     |           |  |
|  - 重點項目四                     |           |  |
|  - 重點項目五                     +-----------+  |
+--------------------------------------------------+
  [講者備注區 - speaker_notes]
`

- **左側（62.5% 寬）**：序號徽章（紫色）、標題、重點項目列表
- **右側（37.5% 寬）**：優先放置可編輯原生表格或圖表；沒有結構化資料時使用 AI 配圖，尚未生成時顯示可替換的提示區塊
- **備注區**：speaker_notes 內容（隱藏在備注面板，演講時可參考）

---

## 5. 注意事項

### 圖片嵌入

- PPTX 匯出時，系統會將 AI 生成的圖片透過 Canvas API 轉換為 base64 並嵌入至投影片中，確保離線也能正常顯示
- 若網路問題或 CORS 設定導致圖片無法讀取，系統會在匯出後提示「N 張圖片未能嵌入」，投影片文字內容仍完整保留
- 配圖不是匯出前置條件；尚未生成時，簡報會保留文字內容並顯示可替換的提示區塊

### CORS 設定（圖片無法嵌入時）

如果匯出後發現圖片未嵌入，請確認 Azure Blob Storage 的 CORS 規則允許前端來源網域（Access-Control-Allow-Origin）。詳見 [AZURE_PORTAL_SETUP.md](./AZURE_PORTAL_SETUP.md)。

### 可編輯性

匯出的 .pptx 完全可編輯：
- 可在 PowerPoint / Keynote / Google Slides 中調整版面、字型、顏色
- 可替換或刪除圖片
- 可修改重點文字與備注
- 可新增或刪除投影片

---

## 6. 技術架構（開發者參考）

### 資料流

`
使用者輸入（文件 / 純文字大綱）
         |
DocumentUploader.jsx  <--- 分頁：上傳文件 / 貼上大綱
         |
useDocumentAnalysis.js -> aiService.analyzeDocument()
         |  POST /api/analyze-document   body: { mode: "presentation" }
api/analyze-document/index.js（Azure Function）
         |  PRESENTATION_ANALYSIS_PROMPT_BASE
Gemini（Azure OpenAI deployment）
         | JSON 回應（scenes[] + bullet_points / speaker_notes / tables / charts）
DocumentScenes.jsx  <--- 投影片卡片 + 可選生成圖片 + 匯出按鈕
         |  exportToPptx()（瀏覽器端）或 exportWithAutomizer()（伺服器端）
         |  POST /api/generate-presentation
         |  pptx-automizer + pptxgenjs（Node.js）
         |
         |  exportToPptx()（分析完成即可執行）
pptxgenjs（動態 import，372 KB code-split chunk）
         |
.pptx 下載至本機
`

### API 請求格式

**端點：** POST /api/analyze-document

**請求 body（presentation 模式）：**

`json
{
  "documentUrl": "https://<storage>.blob.core.windows.net/...",
  "fileName": "outline.txt",
  "sceneCount": "auto",
  "mode": "presentation"
}
`

| 參數 | 類型 | 說明 |
|------|------|------|
| documentUrl | string | 文件的 Blob URL（大綱模式為暫存上傳的 .txt） |
| fileName | string | 原始檔案名稱 |
| sceneCount | string/number | "auto" 或 1–10 的整數 |
| mode | string | "presentation" 或 "storyboard"（預設） |

### API 回應格式（presentation 模式）

`json
{
  "title": "簡報主題",
  "summary": "內容摘要",
  "analysis_mode": "presentation",
  "recommended_style": {
    "name": "理性科技編輯風",
    "description": "以清晰的資訊層次與冷靜色彩呈現專業內容。",
    "prompt": "Editorial technology illustration, cool blue and graphite palette, clean geometric composition, soft studio lighting, subtle paper texture, generous negative space for text-image layouts",
    "tags": ["科技", "編輯", "專業"]
  },
  "scenes": [
    {
      "scene_number": 1,
      "scene_title": "投影片標題",
      "scene_description": "主旨摘要",
      "bullet_points": ["重點一", "重點二", "重點三"],
      "speaker_notes": "講者備注內容",
      "visual_prompt": "English image generation prompt...",
      "layout_type": "chart",
      "tables": [],
      "charts": [
        {
          "type": "bar",
          "title": "季度營收",
          "labels": ["Q1", "Q2"],
          "series": [
            { "name": "營收", "values": [100, 120] }
          ]
        }
      ]
    }
  ]
}
`

### 伺服器端 Automizer 匯出

**端點：** POST `/api/generate-presentation`

前端會先將可取得的投影片圖片轉成 base64，再提交：

`json
{
  "scenes": [
    {
      "scene_number": 1,
      "scene_title": "投影片標題",
      "scene_description": "主旨摘要",
      "bullet_points": ["重點一"],
      "generatedImage": "data:image/png;base64,...",
      "tables": [],
      "charts": []
    }
  ]
}
`

API 回傳 `application/vnd.openxmlformats-officedocument.presentationml.presentation` 二進位內容。現階段使用伺服器端動態產生的預設 root template，未開放任意伺服器檔案路徑或使用者自訂範本。

### 前端核心函式

| 函式 / 元件 | 檔案 | 說明 |
|-------------|------|------|
| exportToPptx() | src/components/create/DocumentScenes.jsx | PPTX 生成與下載邏輯 |
| PPTX 純函式 | src/utils/pptxExport.js | 投影片選取、重點 fallback、表格/圖表資料正規化與檔名清理 |
| DocumentUploader | src/components/create/DocumentUploader.jsx | 上傳 / 大綱輸入 UI，含模式切換 |
| useDocumentAnalysis | src/hooks/useDocumentAnalysis.js | 文件分析狀態管理 |
| aiService.analyzeDocument | src/services/aiService.js | API 呼叫封裝 |
| aiService.generatePresentationPptx | src/services/aiService.js | 呼叫伺服器端 Automizer 二進位匯出 API |
| 文件圖片風格面板 | src/components/create/DocumentScenes.jsx | 顯示 AI 建議風格，並可用風格庫樣式取代 |

### 依賴套件

| 套件 | 版本 | 用途 |
|------|------|------|
| pptxgenjs | ^4.0.1 | 前端純 JS PPTX 生成，包含原生表格與圖表 |
| pptx-automizer | ^0.8.2 | 後端 Node.js PPTX 範本與投影片組合 |
| pptxgenjs（api） | ^3.12.0 | Automizer 的伺服器端 PptxGenJS bridge |

pptxgenjs 採用**動態 import**（import('pptxgenjs')），僅在使用者點擊匯出時才載入，不影響首頁載入效能。

---

## 7. 已知限制

| 限制 | 說明 | 影響 |
|------|------|------|
| CORS 圖片嵌入 | Azure Blob Storage 未正確設定 CORS 時，圖片無法嵌入 | 投影片有文字無圖，可手動補上 |
| Null bullet point | 極少數情況下 Gemini 回傳 null 項目，會顯示為字串 "null" | 視覺上可能出現 "null" 文字，可手動刪除 |
| 版面範本 | Automizer 目前使用伺服器端動態建立的預設 root template | 尚不支援使用者上傳的 PowerPoint Master/Layout |
| Automizer 講者備注 | Automizer 公開 bridge 沒有動態 `addNotes()` API | 需要講者備注時使用一般「匯出 PPTX」 |
| 自訂主題色 | 目前固定為 Pixora 預設配色（紫色徽章、黑色文字） | 尚不支援品牌色彩自訂 |
| 配圖生成 | 配圖不是匯出前置條件 | 未生成配圖時需在 PowerPoint 中自行替換 |

---

## 8. 相關文件

- [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) — 產品整體規劃與功能路線圖
- [EXECUTION_DETAILS.md](./EXECUTION_DETAILS.md) — 各階段執行細節
- [API_LOCAL_DEV.md](./API_LOCAL_DEV.md) — 本地開發環境設定
- [AZURE_PORTAL_SETUP.md](./AZURE_PORTAL_SETUP.md) — Azure 資源設定（含 CORS）
