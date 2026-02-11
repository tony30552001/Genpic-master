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
    "AUTH_DISABLED": "false"
  }
}
```

---

## 2.1 DB migrations

在專案根目錄執行：

```bash
psql "postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require" \
  -f db/migrations/001_init.sql \
  -f db/migrations/002_add_history_fields.sql
```

---

## 3. 啟動 Functions

在專案根目錄執行：

```bash
cd api
npm install
func start
```

預設 Functions Base URL：

```
http://localhost:7071/api
```

---

## 4. 前端連線設定

編輯 [.env](../.env)：

```dotenv
VITE_API_BASE_URL=http://localhost:7071/api
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
curl http://localhost:7071/api/health
```

預期回應：

```json
{ "status": "ok" }
```
