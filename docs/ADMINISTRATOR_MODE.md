# Administrator 管理中心

Administrator 管理中心提供租戶層級的使用者、生成紀錄、圖片模型政策與風格資產管理。管理員權限由 `users.role = 'admin'` 控制；首次部署可在 linked App Service 設定 `ADMIN_EMAILS`，以逗號分隔登入 email，登入時會自動同步為管理員。

## 啟用步驟

1. 若尚未執行，依序執行 `db/migrations/006_administrator_mode.sql`、`db/migrations/007_dedupe_users.sql`、`db/migrations/008_user_status.sql`、`db/migrations/016_admin_list_indexes.sql` 與 `db/migrations/017_user_auth_provider.sql`。
2. 在 App Service 設定 `ADMIN_EMAILS`，例如 `admin@example.com`。
3. 若要開放 GPT Image 2，將 GPT 設定放在 App Service runtime（不是 `VITE_*` build 變數）：
   - `GPT_IMAGE_ENDPOINT`
   - `GPT_IMAGE_EDIT_ENDPOINT`（可省略，會由生成端點推導）
   - `GPT_IMAGE_API_KEY`
   - `GPT_IMAGE_DEPLOYMENT`
   - Foundry endpoint 範例：`https://<resource>.services.ai.azure.com/openai/v1/images/generations`
   - `services.ai.azure.com` 端點使用 `api-key` header；GPT credentials 一律保留在後端 runtime。
4. 重新登入後，管理員可從 `/admin` 開啟管理中心。

## 分析模型（LLM）

文件分析、Prompt 優化、簡報生成、風格分析、檔名生成與場景優化所使用的模型，全部在管理中心的
「分析模型」分頁維護，後端不再讀取 `AZURE_OPENAI_*` 或 `GEMINI_MODEL_ANALYSIS` 環境變數。

1. 執行 `db/migrations/014_llm_models.sql`。
2. 在 App Service 設定 `SECRET_ENCRYPTION_KEY`（32 bytes 的 base64 或 hex 金鑰，與 LINE token 共用）。
   由 `LINE_TOKEN_ENCRYPTION_KEY` 升級者請把原值原封不動複製過去，既有加密資料即可繼續解密。
3. 在管理中心「分析模型」新增模型：名稱、供應商、模型／部署代號、端點（Azure OpenAI 必填）與 API 金鑰。
   金鑰以 AES-256-GCM 加密存於 `llm_models`，儲存後不會再回傳前端。
4. 使用「測試」按鈕實際呼叫一次模型確認連線。
5. 在「用途指派」為六個用途各指派主要模型，必要時再指定一個備援模型
   （取代舊的 `AZURE_OPENAI_FALLBACK_DEPLOYMENT`）。

六個用途都可以自由選擇 Azure OpenAI 或 Google Gemini 模型，備援模型也不必與主要模型
同一家供應商；`api/_shared/llmRuntime.js` 會依每個模型的供應商決定呼叫方式。
尚未指派前，對應 API 會回傳 HTTP 503 與 `llm_not_configured`，不做任何靜默降級。

模型若在輸出上限內沒寫完（reasoning 模型特別容易），系統會自動加倍輸出上限重試
（上限 32000）；若是該部署本身的單次輸出長度不足，會直接回報並建議改指派其他模型。
「簡報生成」需要一次輸出較長的 JSON，請指派輸出長度充足的模型。

## 模型政策

模型政策儲存在 `tenant_model_settings`。管理員設定的 `default_model` 會由後端套用到一般創作、文件批次生成與圖片轉換；前端不再提供個人模型選擇器。`allowed_models` 目前支援 `gemini-imagen` 與 `gpt-image-2`，且預設模型必須包含在開放清單中。

## 載入行為

管理中心只會載入目前開啟的分頁資料，切換過的分頁會保留在記憶體中不重複請求；
變更使用者篩選時只重新載入目前分頁。生成紀錄與風格庫的縮圖以獨立請求逐張載入，
表格因此可在圖片下載完成前先顯示。

## 使用者篩選與搜尋

`users.auth_provider` 記錄每位使用者最後一次登入使用的身分提供者，於登入流程寫入，
既有資料由 `017_user_auth_provider.sql` 依最新的 `auth_sessions` 回填。

- 生成紀錄與風格庫的使用者篩選拆成「Entra ID」與「Google」兩個下拉選單，各自支援
  以姓名或 email 關鍵字搜尋；兩者互斥，同時只會套用一位使用者。早於
  `010_auth_sessions.sql` 的帳號沒有 session 可回填，會出現在「未記錄」篩選，
  並在下次登入時補上正確的提供者。
- 使用者清單提供關鍵字搜尋，輸入後以 `search` 參數在後端比對姓名與 email，並保留分頁。

## 管理 API

- `GET /api/me`：取得目前使用者角色與模型政策。
- `GET /api/management/users`：使用者清單與生成／風格統計，含 `authProvider`（`entra` 或 `google`）。
- `GET /api/management/users?page=1&pageSize=10&search=...`：分頁取得使用者清單，`search` 以關鍵字比對姓名與 email。
- `GET /api/management/user-options`：取得歷史紀錄與風格庫篩選用的使用者選項，含 `authProvider`。
- `GET /api/management/history?page=1&pageSize=10&userId=...`：分頁取得租戶生成紀錄，可用 `userId` 篩選；回傳 `hasImage` 而不內嵌圖片資料。
- `GET /api/management/history-images/{id}`：取得單筆生成紀錄的圖片（`Cache-Control: private, max-age=3600`）。
- `GET /api/management/styles?page=1&pageSize=10&userId=...`：分頁取得租戶風格庫，可用 `userId` 篩選；回傳 `hasPreview` 而不內嵌預覽圖。
- `GET /api/management/style-previews/{id}`：取得單一風格的預覽圖（`Cache-Control: private, max-age=3600`）。
- `GET|PUT /api/management/settings`：讀寫模型政策。
- `PUT /api/management/users/{id}`：調整使用者角色。
- `PUT /api/management/users/{id}` 搭配 `{ "isActive": false }`：停用使用者；停用後該帳號無法使用系統。
- `DELETE /api/management/styles/{id}`：刪除租戶風格並解除歷史紀錄關聯。
- `GET /api/management/llm-models`：取得分析模型清單、用途目錄與指派狀態（不含金鑰）。
- `POST /api/management/llm-models`：新增分析模型。
- `PUT /api/management/llm-models/{id}`：更新分析模型；`apiKey` 留空表示不變更。
- `DELETE /api/management/llm-models/{id}`：刪除分析模型；仍被指派時回傳 409。
- `PUT /api/management/llm-roles/{role}`：指派用途的主要與備援模型。
- `POST /api/management/llm-model-tests`：以 `{ modelId }` 或草稿設定實際呼叫模型測試連線。
