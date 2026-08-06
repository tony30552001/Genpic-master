# 本機 API 開發指南

> 版本 v1.0 | 最後更新：2026-02-10

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
    "DATABASE_URL": "postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require",
    "GOOGLE_API_KEY": "<your-gemini-api-key>",
    "GEMINI_MODEL_ANALYSIS": "gemini-1.5-flash",
    "GEMINI_MODEL_GENERATION": "gemini-3-pro-image-preview",
    "AZURE_OPENAI_ENDPOINT": "https://<resource>.services.ai.azure.com/openai/v1",
    "AZURE_OPENAI_API_KEY": "<your-azure-openai-key>",
    "AZURE_OPENAI_DEPLOYMENT": "gpt-5.6-luna",
    "AUTH_DISABLED": "false"
  }
}
```

「AI 智能優化」使用 Azure OpenAI Responses API。以上三個設定只放在
API runtime（App Service 或本機 adapter）；不要加上 `VITE_` 前綴，也不要放進前端 `.env`。
若未設定 `AZURE_OPENAI_API_KEY`，後端會暫時共用 `GPT_IMAGE_API_KEY`。

---

## 2.1 DB migrations

在專案根目錄執行最新 migration：

```powershell
$env:DATABASE_URL = "postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require"
$env:DATABASE_SSL = "true"
node api/scripts/migrate.cjs
```

這會包含 `009_image_generation_jobs.sql`。不要將正式資料庫連線字串提交到 repository。

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

## 5. MSAL 驗證注意事項

- 需在 Azure App Registration 設定 Redirect URI：
  - `http://localhost:5173`
- 建議至少開啟 `User.Read` scope
- 若要暫時略過驗證，可將 `AUTH_DISABLED` 改成 `true`

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
