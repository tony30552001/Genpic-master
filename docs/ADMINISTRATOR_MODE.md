# Administrator 管理中心

Administrator 管理中心提供租戶層級的使用者、生成紀錄、圖片模型政策與風格資產管理。管理員權限由 `users.role = 'admin'` 控制；首次部署可在 Azure Functions 設定 `ADMIN_EMAILS`，以逗號分隔登入 email，登入時會自動同步為管理員。

## 啟用步驟

1. 執行 `db/migrations/006_administrator_mode.sql`。
2. 在 Functions 設定 `ADMIN_EMAILS`，例如 `admin@example.com`。
3. 若要開放 GPT Image 2，將 GPT 設定放在 Functions runtime（不是 `VITE_*` build 變數）：
   - `GPT_IMAGE_ENDPOINT`
   - `GPT_IMAGE_EDIT_ENDPOINT`（可省略，會由生成端點推導）
   - `GPT_IMAGE_API_KEY`
   - `GPT_IMAGE_DEPLOYMENT`
4. 重新登入後，管理員可從 `/admin` 開啟管理中心。

## 模型政策

模型政策儲存在 `tenant_model_settings`。管理員設定的 `default_model` 會由後端套用到一般創作、文件批次生成與圖片轉換；前端不再提供個人模型選擇器。`allowed_models` 目前支援 `gemini-imagen` 與 `gpt-image-2`，且預設模型必須包含在開放清單中。

## 管理 API

- `GET /api/me`：取得目前使用者角色與模型政策。
- `GET /api/admin/users`：使用者清單與生成／風格統計。
- `GET /api/admin/history`：租戶生成紀錄，可用 `userId` 篩選。
- `GET /api/admin/styles`：租戶風格庫，可用 `userId` 篩選。
- `GET|PUT /api/admin/settings`：讀寫模型政策。
- `PUT /api/admin/users/{id}`：調整使用者角色。
- `DELETE /api/admin/styles/{id}`：刪除租戶風格並解除歷史紀錄關聯。
