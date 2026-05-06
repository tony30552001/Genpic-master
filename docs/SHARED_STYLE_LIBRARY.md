# 共享風格庫功能設計

## 目標

使用者回饋希望能有「共享的風格庫」，讓同一公司或租戶內的成員可以共用已驗證的視覺風格，降低重複分析參考圖與重寫風格 prompt 的成本。

此功能目標是把目前的個人風格收藏，擴展為可依標籤分類、可共享、可搜尋、可套用、可複製的團隊共享資產庫。

核心方向：

1. 保留「我的風格」作為個人私有收藏。
2. 新增「共享風格」作為同租戶內可見的團隊風格庫。
3. 使用使用者實際輸入的 `tags` 作為主要分類，不再以社群貼文、電商、教育等固定用途分類作為主要瀏覽方式。
4. 讓使用者可以將私人風格共享到共享庫，也可以將共享風格複製到自己的風格庫。
5. 在創作流程中快速套用共享風格，並保留目前風格分析、儲存、套用與刪除體驗。

## 已確認產品決策

| 項目 | 決策 |
|:---|:---|
| 共享範圍 | 同一租戶 / 公司內共享 |
| 預設狀態 | 新儲存的風格預設為私人 |
| 共享流程 | 使用者手動點擊「共享」後才進入共享庫 |
| 分類方式 | 以標籤作為主要分類與篩選，不在 UI 顯示固定用途分類 |
| MVP 功能 | 標籤分類瀏覽、搜尋、私人 / 共享切換、套用共享風格、複製到我的風格庫、共享人姓名 / 建立時間資訊、精選 / 熱門排序 |

## 目前狀態

### 主要前端檔案

- `src\pages\StylesPage.jsx`
  - 目前只將 `InfographicGenerator` 的初始 tab 設為 `styles`。
- `src\InfographicGenerator.jsx`
  - 管理主要 tab、風格分析、儲存風格、套用風格、生成圖片與歷史紀錄。
- `src\components\styles\StyleLibrary.jsx`
  - 目前支援個人風格列表、搜尋、標籤篩選、套用、刪除與批次管理。
- `src\components\styles\StyleCard.jsx`
  - 目前支援風格預覽、名稱、描述、標籤、套用與刪除。
- `src\components\create\ScriptEditor.jsx`
  - 一般創作流程中已有內嵌風格選擇器，可從已儲存風格套用。
- `src\hooks\useStyles.js`
  - 從 API 載入個人風格，並處理儲存、刪除與搜尋。
- `src\services\storageService.js`
  - 封裝 `/api/styles` 的 list、add、delete API。

### 主要後端與資料庫檔案

- `api\styles\index.js`
  - 目前 `GET /api/styles` 只回傳目前使用者建立的風格。
  - `POST /api/styles` 可建立風格。
  - `DELETE /api/styles/{id}` 只允許建立者刪除。
- `api\styles\function.json`
  - 目前支援 `get`、`post`、`delete`、`options`。
- `db\migrations\001_init.sql`
  - `styles` 表已有 `tenant_id`、`name`、`prompt`、`description`、`tags`、`preview_url`、`embedding`、`created_by`、`created_at`。
  - 尚未有 `category`、`visibility`、`published_at`、`updated_at`、熱門度與精選欄位。
- `db\migrations\003_add_templates.sql`
  - `templates` 表已有 `category` 欄位，可作為 style category 的先例。

## 使用者體驗設計

### 風格庫資訊架構

`風格庫` 頁面建議分成兩個 scope：

| Scope | 說明 | 主要操作 |
|:---|:---|:---|
| 我的風格 | 目前使用者建立或複製保存的風格 | 套用、共享 / 取消共享、編輯標籤、刪除 |
| 共享風格 | 同租戶內已共享的風格 | 套用、複製到我的風格庫、查看共享人姓名與熱門度 |

頁面上方建議包含：

1. Scope tabs：`我的風格` / `共享風格`。
2. 標籤分類列：`全部標籤` 加上目前列表中最常用的 tags。
3. 搜尋欄：搜尋風格名稱、描述、共享人姓名與標籤。
4. 標籤 chips：作為主要分類與篩選入口。
5. 排序控制：`最近更新`、`最新共享`、`熱門`、`精選`。

### 標籤分類

第一版以 `tags` 作為主要分類來源，避免固定用途分類與實際風格資料不一致。標籤來自風格分析建議與使用者儲存時輸入，例如 `科技感`、`溫暖`、`插畫`、`藍色`、`極簡`、`交通安全`。

UI 應以目前列表的標籤統計產生 chips，依使用次數排序；點擊標籤後以 AND 條件篩選風格。

### 風格卡片

共享風格卡片建議顯示：

- 預覽圖，若無預覽則顯示一致的空狀態。
- 風格名稱。
- 簡短描述。
- 主要標籤 badge。
- 標籤 chips。
- 共享人姓名；不顯示 email。
- 共享時間或建立時間。
- 精選 badge。
- 套用次數或複製次數。
- 主要操作：`套用`。
- 次要操作：`複製到我的風格庫`。

我的風格卡片額外顯示：

- 目前狀態：`私人` / `已共享`。
- `共享` 或 `取消共享`。
- 既有刪除與批次管理能力。

### 空狀態

| 狀態 | 文案方向 | 建議操作 |
|:---|:---|:---|
| 我的風格為空 | 尚未收藏任何風格 | 引導使用者到一般創作，上傳參考圖並分析風格 |
| 共享風格為空 | 團隊尚未共享風格 | 引導使用者共享第一個風格 |
| 篩選無結果 | 找不到符合條件的風格 | 提供清除搜尋與標籤篩選 |

## 權限與資料規則

### 可見性

| Visibility | 可見範圍 | 說明 |
|:---|:---|:---|
| `private` | 建立者本人 | 新風格預設狀態 |
| `shared` | 同租戶所有使用者 | 建立者共享後進入共享庫 |

### 授權規則

- 我的風格列表：只能看見 `tenant_id = current tenant` 且 `created_by = current user` 的風格。
- 共享風格列表：可看見 `tenant_id = current tenant` 且 `visibility = 'shared'` 的風格。
- 編輯、刪除、共享、取消共享：只允許建立者操作。
- 套用共享風格：同租戶使用者皆可操作。
- 複製共享風格：同租戶使用者可複製成自己的私人風格。
- 精選狀態：MVP 可先保留欄位，後續由管理者或內部流程維護。

## 資料模型設計

建議新增 migration 擴充 `styles` 表：

```sql
ALTER TABLE styles
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copy_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_curated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS styles_owner_visibility_idx
  ON styles(tenant_id, created_by, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS styles_shared_category_idx
  ON styles(tenant_id, visibility, category, published_at DESC);

CREATE INDEX IF NOT EXISTS styles_shared_popularity_idx
  ON styles(tenant_id, visibility, is_curated, usage_count DESC, copy_count DESC);
```

建議加入資料檢查：

```sql
ALTER TABLE styles
  ADD CONSTRAINT styles_visibility_check
  CHECK (visibility IN ('private', 'shared'));

ALTER TABLE styles
  ADD CONSTRAINT styles_category_check
  CHECK (category IN (
    'social',
    'presentation',
    'poster',
    'ecommerce',
    'education',
    'document',
    'brand',
    'general'
  ));
```

若正式資料庫已存在非標準資料，migration 需要先清理或轉換後再加上 check constraint。

## API 設計

### List styles

```http
GET /api/styles?scope=mine|shared|all&q=&tags=&sort=updated|newest|popular|curated
```

查詢規則：

- `scope=mine`：只列出自己的風格。
- `scope=shared`：列出同租戶共享風格。
- `scope=all`：可用於內嵌 picker，合併自己的風格與共享風格。
- `category`：保留為相容欄位；目前 UI 不使用固定用途分類。
- `q`：搜尋名稱、描述、共享人姓名與標籤。
- `tags`：逗號分隔，多標籤篩選。
- `sort=popular`：依 `usage_count`、`copy_count` 排序。
- `sort=curated`：優先顯示 `is_curated = true`。

### Create style

```http
POST /api/styles
```

Payload 建議：

```json
{
  "name": "季度報告插畫風",
  "prompt": "...",
  "description": "適合企業簡報與報告封面的柔和插畫風格",
  "tags": ["企業", "簡報", "插畫"],
  "previewUrl": "https://..."
}
```

建立規則：

- `visibility` 預設為 `private`。
- `category` 若未提供，預設為 `general`，但不作為主要 UI 分類。

### Update style

```http
PUT /api/styles/{id}
```

用途：

- 更新名稱、描述、標籤、分類。
- 可用於切換 `visibility`，但建議共享 / 取消共享使用明確 action endpoint 或明確 action payload，避免誤操作。

### Publish style

```http
POST /api/styles/{id}/publish
```

行為：

- 僅建立者可操作。
- 將 `visibility` 設為 `shared`。
- 設定 `published_at = now()`。
- 更新 `updated_at = now()`。

### Unpublish style

```http
POST /api/styles/{id}/unpublish
```

行為：

- 僅建立者可操作。
- 將 `visibility` 設為 `private`。
- 可保留 `published_at` 作為歷史，或清空以代表目前未發布；MVP 建議清空以降低語意歧義。

### Copy shared style

```http
POST /api/styles/{id}/copy
```

行為：

- 同租戶使用者可複製共享風格。
- 新增一筆 `created_by = current user`、`visibility = private` 的風格。
- 原風格 `copy_count += 1`。
- 複製名稱可使用原名，或加上 `副本` 標記。

### Mark style used

```http
POST /api/styles/{id}/use
```

行為：

- 使用者套用或成功生成時記錄使用。
- MVP 建議在「成功生成」後累加，避免只點擊套用但未實際使用也增加熱門度。
- 原風格 `usage_count += 1`。

### Response shape

前端需要的 style response：

```json
{
  "id": "uuid",
  "name": "季度報告插畫風",
  "prompt": "...",
  "description": "適合企業簡報與報告封面的柔和插畫風格",
  "tags": ["企業", "簡報", "插畫"],
  "previewUrl": "https://...",
  "visibility": "shared",
  "authorName": "Tony Lin",
  "createdAt": { "seconds": 1760000000 },
  "updatedAt": { "seconds": 1760000000 },
  "publishedAt": { "seconds": 1760000000 },
  "usageCount": 12,
  "copyCount": 4,
  "isCurated": false
}
```

## 前端實作計畫

### 1. 標籤分類策略

主要分類由 style `tags` 動態產生：

- 統計目前列表所有 tags。
- 依出現次數排序。
- 前 12 個標籤預設顯示，其餘收合。
- 點擊標籤 chips 進行多標籤篩選。

### 2. 擴充 `storageService`

新增或調整：

- `listStyles(params)`
- `addStyle(styleData)`
- `updateStyle(styleId, styleData)`
- `publishStyle(styleId)`
- `unpublishStyle(styleId)`
- `copyStyle(styleId)`
- `markStyleUsed(styleId)`

### 3. 重構 `useStyles`

`useStyles` 建議管理：

- `scope`
- `sort`
- `searchQuery`
- `selectedTags`
- `savedStyles`
- `isLoading`
- `isSavingStyle`
- `isSearching`
- `error`

並提供：

- `refreshStyles`
- `saveStyle`
- `deleteStyle`
- `deleteStyles`
- `updateStyle`
- `publishStyle`
- `unpublishStyle`
- `copyStyle`
- `applyStyle`

### 4. 升級 `StyleLibrary`

建議拆分或重構：

- `StyleLibrary`
  - 管理 scope、sort、標籤分類與列表布局。
- `StyleLibraryToolbar`
  - 搜尋、scope tabs、排序。
- `StyleTagNav`
  - 標籤分類。
- `StyleCard`
  - 卡片顯示與 actions。
- `StyleEmptyState`
  - 空狀態。

若第一版希望減少檔案變動，也可以先在現有 `StyleLibrary.jsx` 和 `StyleCard.jsx` 內完成，但需避免元件過大。

### 5. 更新儲存風格流程

儲存風格時保留「標籤」輸入作為分類來源，不再要求使用者選擇固定用途分類。儲存後仍為私人，不自動共享。

### 6. 更新套用流程

從共享風格套用時：

- 立即更新目前 `analyzedStyle`。
- 顯示已套用狀態，包含風格名稱與來源。
- 成功生成後呼叫 `markStyleUsed(styleId)`。
- 若 usage tracking 失敗，不應阻擋圖片生成流程，但應依現有錯誤處理策略記錄或顯示非阻斷提示。

### 7. 更新內嵌風格 picker

`ScriptEditor` 的內嵌 picker 可以採兩階段：

1. MVP：顯示「我的風格」與「共享風格」混合清單，卡片或列表項標示來源。
2. 後續：提供 scope tabs 或「查看完整共享風格庫」入口。

## UX 與無障礙要求

- 所有主要操作按鈕需至少 44px 高或有足夠 hit area。
- 不可只依賴 hover 顯示操作；手機與鍵盤使用者也必須能操作。
- Scope tabs 與標籤 chips 需使用 `aria-pressed` 或正確 tab semantics。
- 搜尋欄需有明確 `aria-label`。
- Icon-only button 必須有 `aria-label`。
- 共享 / 私人狀態不能只用顏色表達，需有文字 badge。
- 空狀態需要有明確下一步操作。
- 使用現有 `src\components\ui` 元件與 Tailwind semantic tokens。
- 使用 Lucide React 圖示，不使用 emoji 作為結構性圖示。

## 測試計畫

### API 測試

需覆蓋：

- `scope=mine` 只回傳自己的風格。
- `scope=shared` 回傳同租戶共享風格，不回傳其他租戶資料。
- 建立風格預設為 `private`。
- 只有建立者可以共享、取消共享、更新與刪除。
- 同租戶使用者可以 copy shared style。
- copy 後新資料屬於目前使用者且 visibility 為 `private`。
- sort popular / curated 行為正確。

### Frontend 測試

需覆蓋：

- Scope 切換。
- 標籤分類篩選。
- 搜尋與標籤篩選。
- 共享風格顯示共享人姓名與熱門度，不顯示 email。
- 我的風格顯示私人 / 已共享狀態。
- 點擊共享 / 取消共享 / 複製 / 套用時呼叫正確 action。
- 空狀態文案正確。

### 驗證命令

依目前專案 scripts：

```powershell
pnpm lint
pnpm test
pnpm build
```

## 實作順序

1. 建立標籤分類策略。
2. 新增 DB migration，擴充 `styles` 資料模型。
3. 擴充 `api\styles` 查詢、更新、共享、複製與使用統計。
4. 更新 `storageService` 與 `useStyles`。
5. 重構 `StyleLibrary` 與 `StyleCard`。
6. 串接 `InfographicGenerator` 與 `ScriptEditor` 的儲存、套用、使用統計流程。
7. 補上 API 與前端測試。
8. 執行 lint、test、build。

## 後續延伸

- 管理者精選 / 下架流程。
- 檢舉共享風格。
- 依團隊、部門或專案設定共享範圍。
- 風格版本管理。
- 品牌色與企業識別規範鎖定。
- 熱門分類與推薦風格。
- 分享連結或跨租戶公開市集。
