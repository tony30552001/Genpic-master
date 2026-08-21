# 本機 API 開發指南

> 版本 v1.0 | 最後更新：2026-08-10

---

## 1. 安裝 Azure Functions Core Tools

```bash
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

確認版本：

```bash
func --version
```

---

## 2. 設定本機環境變數

編輯 [api/local.settings.json](../api/local.settings.json)：

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_TENANT_ID": "<your-tenant-id>",
    "AZURE_CLIENT_ID": "<your-client-id>",
    "AZURE_CLIENT_SECRET": "<server-only-client-secret>",
    "ENTRA_REDIRECT_URI": "http://localhost:3000/api/auth/entra/callback",
    "AUTH_SESSION_SECRET": "<random-session-secret>",
    "DATABASE_URL": "postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require",
    "DATABASE_SSL": "true",
    "GOOGLE_CLIENT_ID": "<google-client-id>",
    "CORS_ALLOW_ORIGIN": "http://localhost:5175",
    "GOOGLE_API_KEY": "<your-gemini-api-key>",
    "GEMINI_MODEL_GENERATION": "gemini-3-pro-image-preview",
    "SECRET_ENCRYPTION_KEY": "<32-byte-base64-or-hex-key>",
    "AUTH_DISABLED": "false"
  }
}
```

分析用的 LLM（文件分鏡、Prompt 優化、設計簡報、風格分析、檔名生成、場景優化）
不再由環境變數設定：模型代號、端點與金鑰都存在資料庫，由管理中心的「分析模型」
分頁維護，金鑰以 `SECRET_ENCRYPTION_KEY` 加密。本機開發同樣需要先套用
`db/migrations/014_llm_models.sql` 並在管理中心新增模型與完成用途指派，
否則相關 API 會回傳 HTTP 503 與 `llm_not_configured`。
`GOOGLE_API_KEY` 仍供圖片生成與 embedding 使用。

---

## 2.1 DB migrations

在專案根目錄執行最新 migration：

```powershell
$env:DATABASE_URL = "postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require"
$env:DATABASE_SSL = "true"
node api/scripts/migrate.cjs
```

這會包含 `010_auth_sessions.sql`。不要將正式資料庫連線字串或 session secret 提交到 repository。

---

## 3. 啟動 App Service API adapter

在專案根目錄執行：

```bash
cd api
npm install
npm start
```

預設 App Service adapter URL：

```
http://localhost:3000/api
```

`api/server.js` 會直接載入既有 handlers。執行 `npm start` 時，請先在 shell 或 IDE 設定 backend environment variables；`local.settings.json` 仍由 Azure Functions Core Tools 使用。

若要測試 GPT Image 2 的非同步流程，需另外設定 `GPT_IMAGE_ENDPOINT`、
`GPT_IMAGE_API_KEY`、`GPT_IMAGE_DEPLOYMENT`，並確保 `BLOB_CONTAINER_GENERATED`
（預設為 `generated`）可由 API 使用。`POST /api/generate-images` 會立即回傳
`202` 和 `jobId`，前端會輪詢 `GET /api/image-jobs/{jobId}`。

要繼續使用原本的 Functions runtime，可改執行：

```bash
func start
```

此時 URL 仍為 `http://localhost:7071/api`。
Functions runtime 會使用 GPT Image 2 的同步 fallback；`npm start` 才會啟用
PostgreSQL job worker 與 polling 流程。

---

## 4. 前端連線設定

編輯 [.env](../.env)：

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

若要透過 Vite 代理，可改用 `/api` 並在 `vite.config.js` 加 proxy（可選）。

---

## 5. BFF 驗證注意事項

- 在 Azure App Registration 的 **Web** 平台設定：
  - `http://localhost:3000/api/auth/entra/callback`
- 前端使用 `VITE_API_BASE_URL=http://localhost:3000/api`，登入由 BFF redirect 到 Entra。
- 登入成功後使用 HttpOnly Cookie；不要在前端設定 `VITE_MSAL_*` 或保存 Token。
- Google credential 只會一次性 POST 到 `/api/auth/google`。
- 若要暫時略過驗證，可將 `AUTH_DISABLED` 改成 `true`。

---

## 6. 健康檢查

啟動後可測：

```bash
curl http://localhost:3000/api/health
```

預期回應：

```json
{ "status": "ok" }
```

---

## 7. Scalar API Reference

啟動 API adapter 後，可使用 Scalar 查看互動式 API 文件：

```text
http://localhost:3000/api/docs/
```

OpenAPI 規格位於：

```text
http://localhost:3000/api/openapi.json
```

需要驗證的端點請先在同源瀏覽器完成 BFF 登入；Scalar 的 Authorize 面板不再接受 Provider Token。
