# PowerPoint 簡報匯出功能

> 版本 v1.0 | 最後更新：2025-04-16

---

## 1. 功能概述

Pixora 智繪的 **PowerPoint 匯出功能**讓你可以：

1. **上傳文件** → AI 分析內容 → 生成每張投影片的重點與配圖 → 下載 .pptx 檔案
2. **貼上大綱** → AI 直接將文字大綱設計為投影片結構 → 下載 .pptx 檔案

產出的 .pptx 可直接用 Microsoft PowerPoint、Keynote 或 Google Slides 開啟並進行二次編輯，支援中英文混排與 AI 生成配圖嵌入。

---

## 2. 使用方式

### 方式一：上傳文件

1. 前往**「建立」**頁面
2. 在文件上傳區選擇**「上傳文件」**分頁
3. 拖曳或點擊上傳支援的格式：PDF、TXT、MD、PNG、JPG（最大 50 MB）
4. 在**「分析模式」**下拉選單中選擇 **「簡報設計（PowerPoint）」**
5. （可選）設定**投影片數量**：「自動（AI 決定）」或指定 1–10 張
6. 點擊**「設計簡報投影片」**，等待 AI 分析（通常 15–45 秒）
7. 分析完成後，點擊**「生成圖片」**為各投影片生成配圖
8. 至少有一張圖片生成完成後，點擊工具列的**「匯出 PPTX」**按鈕下載

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
6. 後續步驟同方式一（生成圖片 → 匯出 PPTX）

> **提示：** 大綱分頁固定使用簡報設計模式，無需另行選擇分析模式。

---

## 3. AI 生成的投影片結構

每張投影片由 AI（Gemini）生成以下欄位：

| 欄位 | 類型 | 說明 |
|------|------|------|
| scene_title | string | 投影片標題（15 字內） |
| bullet_points | string[] | 3–5 條重點項目，每條 20 字內 |
| speaker_notes | string | 講者備注，補充演講要點（60 字內） |
| visual_prompt | string | AI 生圖 Prompt（英文關鍵字，用於生成配圖） |
| scene_description | string | 投影片核心主旨（30 字內） |
| layout_type | string | 版面建議（目前固定為 default） |

---

## 4. 匯出的 PPTX 格式

| 設定 | 值 |
|------|----|
| 投影片比例 | 16:9（10 × 5.625 英吋） |
| 檔案命名 | {簡報標題}-{時間戳}.pptx |
| 每張投影片 | 序號徽章 + 標題 + 重點列表 + AI 配圖 |
| 講者備注 | 嵌入於投影片備注區，PowerPoint 可直接查看 |
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
- **右側（37.5% 寬）**：AI 生成配圖
- **備注區**：speaker_notes 內容（隱藏在備注面板，演講時可參考）

---

## 5. 注意事項

### 圖片嵌入

- PPTX 匯出時，系統會將 AI 生成的圖片透過 Canvas API 轉換為 base64 並嵌入至投影片中，確保離線也能正常顯示
- 若網路問題或 CORS 設定導致圖片無法讀取，系統會在匯出後提示「N 張圖片未能嵌入」，投影片文字內容仍完整保留
- 建議在所有圖片生成完成後再進行匯出

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
Gemini（gemini-1.5-flash）
         |  JSON 回應（scenes[] + bullet_points / speaker_notes）
DocumentScenes.jsx  <--- 場景卡片 + 生成圖片
         |  exportToPptx()
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
  "scenes": [
    {
      "scene_number": 1,
      "scene_title": "投影片標題",
      "scene_description": "主旨摘要",
      "bullet_points": ["重點一", "重點二", "重點三"],
      "speaker_notes": "講者備注內容",
      "visual_prompt": "English image generation prompt...",
      "layout_type": "default"
    }
  ]
}
`

### 前端核心函式

| 函式 / 元件 | 檔案 | 說明 |
|-------------|------|------|
| exportToPptx() | src/components/create/DocumentScenes.jsx | PPTX 生成與下載邏輯 |
| DocumentUploader | src/components/create/DocumentUploader.jsx | 上傳 / 大綱輸入 UI，含模式切換 |
| useDocumentAnalysis | src/hooks/useDocumentAnalysis.js | 文件分析狀態管理 |
| aiService.analyzeDocument | src/services/aiService.js | API 呼叫封裝 |

### 依賴套件

| 套件 | 版本 | 用途 |
|------|------|------|
| pptxgenjs | ^3.x | 前端純 JS PPTX 生成 |

pptxgenjs 採用**動態 import**（import('pptxgenjs')），僅在使用者點擊匯出時才載入，不影響首頁載入效能。

---

## 7. 已知限制

| 限制 | 說明 | 影響 |
|------|------|------|
| CORS 圖片嵌入 | Azure Blob Storage 未正確設定 CORS 時，圖片無法嵌入 | 投影片有文字無圖，可手動補上 |
| Null bullet point | 極少數情況下 Gemini 回傳 null 項目，會顯示為字串 "null" | 視覺上可能出現 "null" 文字，可手動刪除 |
| 版面範本 | 目前固定為預設版面（文字左、圖片右） | 尚不支援全圖、文字置中等變體版面 |
| 自訂主題色 | 目前固定為 Pixora 預設配色（紫色徽章、黑色文字） | 尚不支援品牌色彩自訂 |

---

## 8. 相關文件

- [PRODUCT_PLAN.md](./PRODUCT_PLAN.md) — 產品整體規劃與功能路線圖
- [EXECUTION_DETAILS.md](./EXECUTION_DETAILS.md) — 各階段執行細節
- [API_LOCAL_DEV.md](./API_LOCAL_DEV.md) — 本地開發環境設定
- [AZURE_PORTAL_SETUP.md](./AZURE_PORTAL_SETUP.md) — Azure 資源設定（含 CORS）
