# Administrator 管理中心

Administrator 管理中心提供租戶層級的使用者、生成紀錄、圖片模型政策與風格資產管理。管理員權限由 `users.role = 'admin'` 控制；首次部署可在 Azure Functions 設定 `ADMIN_EMAILS`，以逗號分隔登入 email，登入時會自動同步為管理員。

## 啟用步驟

1. 若尚未執行，依序執行 `db/migrations/006_administrator_mode.sql`、`db/migrations/007_dedupe_users.sql` 與 `db/migrations/008_user_status.sql`。
2. 在 Functions 設定 `ADMIN_EMAILS`，例如 `admin@example.com`。
3. 若要開放 GPT Image 2，將 GPT 設定放在 Functions runtime（不是 `VITE_*` build 變數）：
   - `GPT_IMAGE_ENDPOINT`
   - `GPT_IMAGE_EDIT_ENDPOINT`（可省略，會由生成端點推導）
   - `GPT_IMAGE_API_KEY`
   - `GPT_IMAGE_DEPLOYMENT`
   - Foundry endpoint 範例：`https://<resource>.services.ai.azure.com/openai/v1/images/generations`
   - `services.ai.azure.com` 端點使用 `api-key` header；只設定前端 `VITE_GPT_IMAGE_*` 不會讓 `/api/generate-images` 取得後端設定。
4. 重新登入後，管理員可從 `/admin` 開啟管理中心。

## AI 智能優化模型

圖片生成頁面的「AI 智能優化」使用 Azure OpenAI Responses API。請在
Azure Functions runtime 設定以下變數，不要使用 `VITE_*` 前端變數：

- `AZURE_OPENAI_ENDPOINT=https://<resource>.services.ai.azure.com/openai/v1`
- `AZURE_OPENAI_API_KEY=<Azure OpenAI API Key>`
- `AZURE_OPENAI_DEPLOYMENT=gpt-5.6-luna`

`AZURE_OPENAI_API_KEY` 未設定時，後端會共用 `GPT_IMAGE_API_KEY`，方便與
同一個 Azure AI Foundry 資源整合。`optimize-scene` 文件／分鏡功能仍使用
Gemini 設定。

## 模型政策

模型政策儲存在 `tenant_model_settings`。管理員設定的 `default_model` 會由後端套用到一般創作、文件批次生成與圖片轉換；前端不再提供個人模型選擇器。`allowed_models` 目前支援 `gemini-imagen` 與 `gpt-image-2`，且預設模型必須包含在開放清單中。

## 管理 API

- `GET /api/me`：取得目前使用者角色與模型政策。
- `GET /api/management/users`：使用者清單與生成／風格統計。
- `GET /api/management/users?page=1&pageSize=10`：分頁取得使用者清單。
- `GET /api/management/user-options`：取得歷史紀錄與風格庫篩選用的使用者選項。
- `GET /api/management/history?page=1&pageSize=10&userId=...`：分頁取得租戶生成紀錄，可用 `userId` 篩選。
- `GET /api/management/styles?page=1&pageSize=10&userId=...`：分頁取得租戶風格庫，可用 `userId` 篩選。
- `GET|PUT /api/management/settings`：讀寫模型政策。
- `PUT /api/management/users/{id}`：調整使用者角色。
- `PUT /api/management/users/{id}` 搭配 `{ "isActive": false }`：停用使用者；停用後該帳號無法使用系統。
- `DELETE /api/management/styles/{id}`：刪除租戶風格並解除歷史紀錄關聯。
