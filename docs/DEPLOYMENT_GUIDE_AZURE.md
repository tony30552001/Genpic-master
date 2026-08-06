# Azure Static Web Apps + App Service 部署指南

本專案採用 **Azure Static Web Apps (SWA) + Azure App Service** 分離部署：

- SWA 託管 React/Vite 產出的 `dist/`
- App Service 執行 `api/server.js`
- SWA 的 `/api/*` 代理到已連結的 App Service

## 1. 專案部署結構

- 前端根目錄：`/`
- API 目錄：`/api`
- API 入口：`api/server.js`
- 前端輸出：`dist`
- 正式環境 API base URL：`/api`

`api/server.js` 會將既有 Azure Function handlers 轉成 App Service HTTP routes，因此不需要重寫 endpoint 商業邏輯。`function.json` 與 `host.json` 仍保留供 Functions 本機/回滾使用。

## 2. 建立 App Service

1. Azure Portal → **App Services** → **Create** → **Web App**。
2. **Publish** 選 `Code`。
3. Runtime 選 **Node.js 22 LTS / Linux**。
4. 區域建議與 SWA、PostgreSQL、Storage 相同。
5. Startup command 使用 `npm start`。
6. 在 **Configuration** → **Application settings** 設定目前 Function runtime 使用的所有 backend settings。
7. 敏感值使用 Key Vault reference 或 App Service secrets，不要提交到 Git。

至少確認以下設定存在：

- `DATABASE_URL`、`DATABASE_SSL`
- `AZURE_STORAGE_ACCOUNT`、`AZURE_STORAGE_KEY`、`BLOB_CONTAINER_DEFAULT`
- `GOOGLE_API_KEY`、`GEMINI_MODEL_ANALYSIS`、`GEMINI_MODEL_GENERATION`
- `AZURE_OPENAI_ENDPOINT`、`AZURE_OPENAI_API_KEY`、`AZURE_OPENAI_DEPLOYMENT`
- `GPT_IMAGE_ENDPOINT`、`GPT_IMAGE_API_KEY`、`GPT_IMAGE_DEPLOYMENT`
- `BLOB_CONTAINER_GENERATED=generated`
- `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`GOOGLE_CLIENT_ID`
- `AUTH_DISABLED=false`
- `CORS_ALLOW_ORIGIN=https://<your-swa-domain>,http://localhost:5173`
- `RATE_LIMIT_PER_MINUTE=60`
- `API_BODY_LIMIT=100mb`
- `IMAGE_JOB_POLL_MS=2000`（可選，App Service worker 掃描 queued jobs 的間隔）

App Service 會提供 `PORT`，不要在程式碼或設定中硬編固定 production port。

GPT Image 2 會由 `POST /api/generate-images` 建立 queued job，App Service
背景 worker 在不佔用 SWA gateway request 的情況下執行生成。生成結果會放在
`BLOB_CONTAINER_GENERATED`，前端再透過 `/api/image-jobs/{id}` polling 取得結果。

## 3. 連結 Static Web App

在 Static Web App 的 **APIs** 設定中，將 API App Service 設為 linked backend。連結後：

```text
https://<swa-domain>/api/health
  -> https://<app-service-domain>/api/health
```

前端維持：

```dotenv
VITE_API_BASE_URL=/api
```

因此不需要把 App Service hostname 編譯進 Vite，也不需要為每個前端環境維護不同 API URL。`X-Auth-Token`、Bearer token 與 `x-ms-client-principal` 會繼續交給既有 API auth logic 處理。

## 4. GitHub Actions

現有 workflow 會：

1. Build 前端並部署 `dist/` 到 SWA。
2. 使用 `npm ci --prefix api` 安裝 API dependencies。
3. push 到 `main` 時，以 `Azure/webapps-deploy@v3` 將 `api/` 部署到 App Service。
4. Pull Request 只部署 SWA preview，不會覆蓋正式 API。

Repository secrets：

- `AZURE_API_APP_SERVICE_NAME`
- `AZURE_API_APP_SERVICE_PUBLISH_PROFILE`

workflow 不再使用 `api_location: "api"`；API 由獨立 App Service deployment step 提供。

## 5. 資料庫 migration

部署 async image jobs 前，先對正式 PostgreSQL 執行一次最新 migrations：

```powershell
$env:DATABASE_URL = "<postgresql-connection-string>"
$env:DATABASE_SSL = "true"
node api/scripts/migrate.cjs
```

`009_image_generation_jobs.sql` 只新增 job table 和 indexes；不會修改既有
history 資料。執行前請確認 App Service 使用的資料庫連線字串相同。

## 6. 驗證與 rollback

先直接測試 App Service：

```text
https://<app-service-domain>/api/health
```

再測試 SWA proxy：

```text
https://<swa-domain>/api/health
```

接著驗證登入、圖片生成、文件分析、風格、歷史、範本、LINE 與管理 API。若切換失敗，可先 unlink App Service，再暫時恢復 workflow 的 `api_location: "api"`，因為既有 handlers、`function.json` 與 `host.json` 仍保留。

## 7. 常見問題

- **API 404**：確認 App Service Startup command 為 `npm start`、deployment package 包含 `server.js`，且 SWA 已連結正確 App Service。
- **JSON body 413**：確認 App Service 與 `API_BODY_LIMIT` 足以容納文件/圖片 base64；目前 adapter 預設為 `100mb`。
- **API 401**：確認 App Service linked API 沒有移除 `X-Auth-Token` 或 `x-ms-client-principal`，並檢查 `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`GOOGLE_CLIENT_ID`。
- **資料庫連線失敗**：確認 PostgreSQL firewall/private networking 允許 App Service outbound access。
- **GPT Image 2 仍顯示 Backend call failure**：確認 migration 已執行、App Service
  log 有 `image-jobs` worker、以及 `generated` Blob container 可寫入。
- **CORS 錯誤**：同源 SWA proxy 不應需要額外 CORS；若直接測試 App Service，將 SWA 網域與本機網域加入 `CORS_ALLOW_ORIGIN`。
