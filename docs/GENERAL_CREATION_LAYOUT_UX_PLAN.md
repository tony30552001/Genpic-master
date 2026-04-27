# 一般創作 Layout UX 優化計畫

## 目標

「一般創作」頁面目前功能完整，但版面可讀性、操作順序與視覺一致性仍有優化空間。此計畫目標是讓使用者更自然地理解創作流程，從「輸入內容」到「套用風格／參考圖」再到「輸出設定與生成」，形成清楚、穩定且一致的體驗。

核心優化方向：

1. 讓操作流程更明確：內容描述 → 風格／參考 → 輸出設定 → 生成 → 預覽／分享。
2. 提升 shadcn/ui 視覺一致性：統一卡片、按鈕、間距、圓角、色彩 token 與圖示使用。
3. 改善桌面與行動版的預覽體驗，降低使用者對結果位置與下一步操作的疑惑。
4. 保留現有功能與文件分析流程相容性，避免重構影響既有生成行為。

## 目前狀態

### 主要檔案

- `src\InfographicGenerator.jsx`
  - 管理一般創作頁面的主 layout。
  - 桌面版目前採 5 欄 grid：左側 3/5 控制區、右側 2/5 預覽區。
  - 底部使用固定 `GenerateBar` 作為輸出設定與生成 CTA。
- `src\components\create\ScriptEditor.jsx`
  - 管理內容描述、AI 智能優化、輔助設定、參考圖、風格分析、風格庫與範本儲存。
- `src\components\create\ImagePreview.jsx`
  - 管理桌面預覽、生成中 skeleton、空狀態、圖片顯示、下載與 LINE 分享。
- `src\components\create\GenerateBar.jsx`
  - 管理圖片比例、解析度、模型相關尺寸邏輯、生成進度、取消與主要生成按鈕。

### 現有操作流程

使用者目前需要自行推理流程：

1. 輸入內容描述。
2. 可選擇 AI 智能優化。
3. 可選擇上傳參考圖、分析風格或從風格庫套用風格。
4. 在底部選擇比例與解析度。
5. 點擊「開始生成圖片」。
6. 在預覽區查看結果，下載或分享到 LINE。

這些功能都有存在，但流程感不夠清楚；尤其底部生成列與主要內容輸入區視覺上分離，讓「下一步」的關聯較弱。

## UX 發現

### 1. 操作順序存在，但沒有被清楚呈現

目前畫面有內容輸入、AI 優化、輔助設定、輸出設定與預覽，但缺少一個輕量的流程提示。使用者可以完成任務，但需要靠經驗理解每個區塊的先後關係。

建議：在一般創作內容區加入低調的 3 步驟導引：

- 1 內容
- 2 風格／參考
- 3 生成

此導引應該輔助理解，不應取代主要操作或干擾頂部導航。

### 2. 「輔助設定」降低 clutter，但承載過多意圖

`ScriptEditor` 的「輔助設定」目前包含：

- 儲存為範本
- 上傳內容參考圖片
- 分析圖片風格
- 儲存分析後的風格
- 從風格庫選擇風格

這些功能可以歸類為不同意圖：準備素材、套用風格、保存重複使用的設定。若全部集中在同一個區塊，使用者會需要額外理解每個功能的角色。

建議：在輔助設定內再拆出清楚小節：

- 參考與風格
- 風格庫
- 範本與保存

### 3. 桌面預覽完整，行動版預覽較晚出現

桌面版右側一開始就有預覽區，使用者知道結果會出現在哪裡。行動版則需要生成後才透過 bottom sheet 顯示結果，使用者在生成前較難預期結果區的位置。

建議：行動版應該讓「生成結果會在哪裡出現」更可預期。可以用輕量預覽入口、結果佔位提示，或讓生成後的預覽入口與底部生成列更有關聯。

### 4. 視覺層級需要與設定頁一致

設定頁近期已改為更清楚的群組卡片、少量 icon、明確 badge 與 token-driven surfaces。一般創作頁仍有較多 one-off 樣式：

- 部分自訂 button 未使用 shadcn `Button`。
- 圓角混用 `rounded-lg`、`rounded-xl`、`rounded-2xl`。
- `text-[10px]` micro text 使用較多。
- 多個 `primary/5`、`primary/10` 區塊同時存在，導致注意力競爭。

建議：優先使用 `Button`、`Card`、`Badge`、`Textarea`、`Input` 等既有 shadcn/ui adapter，並以 `cn()` 管理條件樣式。

### 5. 色調使用大致正確，但 primary emphasis 過多

目前大多數顏色已使用 Tailwind/shadcn semantic token，例如 `primary`、`muted`、`card`、`border`。但輔助設定、AI 優化、風格分析、已套用狀態都使用 primary tint，視覺層級不夠分明。

建議：

- 主要 CTA 保持最強 primary。
- AI 優化與已套用狀態使用較輕的 primary treatment。
- 一般資訊與提示改用 `muted` / `card` / `border`，避免所有資訊都像主要操作。

### 6. 行動版底部空間需要控管

行動版同時有：

- 底部導航列
- 固定生成列
- 生成後的快速預覽入口
- 生成結果 bottom sheet

若沒有明確 safe-area 與層級規劃，底部元素容易互相競爭。

建議：

- 生成列與底部導航保留安全間距。
- 生成後預覽入口避免遮擋主要 CTA。
- Bottom sheet 保持清楚的關閉入口與可捲動內容。

## 建議資訊架構

### 桌面版

保留目前高效率的雙欄工作區，但加強導引與分區：

- 左側：Create setup card stack
  - Step 1：內容描述
  - Step 2：風格／參考
  - Step 3：輸出設定摘要
- 右側：Preview & result panel
  - 空狀態依目前比例顯示穩定預覽框
  - 生成中顯示 progress/skeleton
  - 生成後顯示下載與分享操作
- 底部：固定 GenerateBar
  - 保留主要 CTA
  - 補上簡潔的輸出摘要，降低使用者往返查找設定的成本

### 行動版

採單欄漸進式流程：

1. 內容描述。
2. 輸出設定 compact card。
3. 參考與風格 accordion。
4. 生成 CTA。
5. 生成結果入口或 bottom sheet。

行動版不應讓使用者生成後才第一次理解結果呈現位置。

## 實作計畫

### 1. 新增一般創作頁面 header 與流程導引

- 在一般創作 tab 內容區加入 compact header。
- 顯示 3-step flow guide：內容、風格／參考、生成。
- 使用 token-driven 樣式，避免與頂部主導航競爭。

### 2. 重構 `ScriptEditor` 區塊結構

- 將目前長型編輯器分為更清楚的小節：
  - 內容描述
  - 提示詞優化
  - 參考與風格
  - 範本與保存
- 保留進階工具折疊行為，但在 accordion 內做更清楚分組。
- 降低「存為範本」視覺權重，避免與生成 CTA 競爭。
- 統一 spacing、card padding、圓角與輔助文字大小。

### 3. 改善 `GenerateBar` 資訊層級

- 將比例與解析度呈現為「輸出設定」而不只是底部 chrome。
- 增加目前輸出摘要：
  - 模型名稱
  - 圖片比例
  - 解析度或 GPT Image 2 對應像素尺寸
- 保持主要生成 CTA 最醒目。
- 確保文件分析 tab 的批次生成行為不被破壞。

### 4. 改善 `ImagePreview` 空狀態與 mobile 預覽

- 空狀態應反映目前選擇的比例，讓使用者知道構圖方向。
- 桌面預覽 frame 保持穩定，避免生成中 layout shift。
- 行動版補強生成前的結果預期，或讓生成後入口與 GenerateBar 更有連續性。
- 保留下載與 LINE 分享動作。

### 5. 對齊 shadcn/ui 視覺系統

- 優先使用既有元件：
  - `Button`
  - `Card`
  - `Badge`
  - `Textarea`
  - `Input`
- 使用 `cn()` 管理條件樣式。
- 減少 one-off primary tint surface。
- 控制 icon 數量，確保 Lucide icon 尺寸與 stroke 一致。
- 維持觸控目標至少約 44px。

### 6. 無障礙與互動品質

- 所有互動按鈕應明確設定 `type="button"`。
- 保留可見 focus ring。
- 維持或補強：
  - `aria-describedby`
  - `aria-expanded`
  - `aria-controls`
  - `aria-live`
- 避免重要操作只靠 hover 顯示。
- 動畫使用 `motion-reduce` 安全處理。

### 7. React 與效能守則

- 不引入新的 UI library。
- 不新增不必要的全域狀態。
- 若風格庫篩選邏輯變重，可使用 `useMemo`。
- 避免將昂貴計算放入 render loop。
- 保持 route-level bundle size 不因本次調整明顯增加。

## 驗證方式

實作後建議執行：

```powershell
npx eslint src\InfographicGenerator.jsx src\components\create\ScriptEditor.jsx src\components\create\ImagePreview.jsx src\components\create\GenerateBar.jsx
npm run build
```

若有改到生成進度或模型尺寸邏輯，再補跑相關 Vitest 測試。

注意：目前完整 `npm run lint` 仍有既有且非本計畫造成的錯誤，位於 API 與測試工具檔案中。

## 範圍與假設

- 本計畫聚焦「一般創作」tab。
- 文件分析流程不重新設計，但共用的 `GenerateBar` 變更必須相容。
- 不導入新 UI library。
- 視覺風格維持現有 shadcn/ui + Pixora blue token system。
- 優先改善流程感、可讀性、一致性與行動版操作信心。
