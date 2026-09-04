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
6. 在 **Configuration** → **Application settings** 設定 backend settings。
7. 敏感值使用 Key Vault reference 或 App Service secrets，不要提交到 Git。
8. 在 **Authentication** 中停用 App Service Authentication / Easy Auth，或允許未驗證請求；Pixora BFF 會自行處理 Entra、Google、session 與 CSRF，不可讓平台的 `RedirectToLoginPage` 先攔截 `/api/*`。

至少確認以下設定存在：

- `DATABASE_URL`、`DATABASE_SSL`
- `AZURE_STORAGE_ACCOUNT`、`AZURE_STORAGE_KEY`、`BLOB_CONTAINER_DEFAULT`
- `AZURE_EMBEDDING_ENDPOINT`、`AZURE_EMBEDDING_API_KEY`、`EMBEDDING_MODEL=embed-v-4-0`（風格向量；`AZURE_EMBEDDING_ENDPOINT` 必須指到 Foundry 模型推論路徑，例如 `https://<resource>.services.ai.azure.com/models`，或部署頁複製的完整 Target URI；只填資源根網域會回 404）
- `DOCUMENT_ANALYSIS_MAX_CHARS=500000`（AnyDoc 解析後可交給同步 GPT 分析的最大字元數；超過時回傳 413，不會靜默截斷）
- `SECRET_ENCRYPTION_KEY`（32 bytes 的 base64 或 hex 金鑰；加密分析模型 API 金鑰與 LINE token）
- `GPT_IMAGE_ENDPOINT`、`GPT_IMAGE_API_KEY`、`GPT_IMAGE_DEPLOYMENT`
- `BLOB_CONTAINER_GENERATED=generated`
- `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`、`GOOGLE_CLIENT_ID`
- `ENTRA_REDIRECT_URI=https://<your-swa-domain>/api/auth/entra/callback`
- `AUTH_SESSION_SECRET`（至少 32 bytes 的隨機 secret）
- `AUTH_DISABLED=false`
- `CORS_ALLOW_ORIGIN=https://<your-swa-domain>,http://localhost:5175`
- `RATE_LIMIT_PER_MINUTE=60`
- `API_BODY_LIMIT=100mb`
- `IMAGE_JOB_POLL_MS=2000`（可選，App Service worker 掃描 queued jobs 的間隔）
- `UPLOAD_CLEANUP_ENABLED=true`（可選，清理逾期 staging upload；預設開啟）
- `UPLOAD_CLEANUP_INTERVAL_MS=3600000`（可選，清理 worker 間隔；預設每小時）
- `UPLOAD_CLEANUP_BATCH_SIZE=100`（可選，每批上限 500；預設 100）

App Service 會提供 `PORT`，不要在程式碼或設定中硬編固定 production port。

GPT Image 2 會由 `POST /api/generate-images` 建立 queued job，App Service
背景 worker 在不佔用 SWA gateway request 的情況下執行生成。生成結果會放在
`BLOB_CONTAINER_GENERATED`，前端再透過 `/api/image-jobs/{id}` polling 取得結果。

分析用的 LLM 不由環境變數設定。套用 `db/migrations/014_llm_models.sql` 後，
管理員在管理中心「分析模型」新增模型（模型代號、端點與 API 金鑰）並指派給六個用途：
文件分鏡、Prompt 優化、設計簡報、風格分析、檔名生成與場景優化。每個用途都可以
自由選擇 Azure OpenAI 或 Google Gemini 模型，備援模型也不必與主要模型同一家供應商。
金鑰以 `SECRET_ENCRYPTION_KEY` 加密後存放於資料庫。

`POST /api/analyze-document` 的文字、圖片與掃描型 PDF 分析使用「文件分鏡」用途指派的模型，
若指派 Azure OpenAI 模型，該 deployment 必須支援 Responses API、image input 與 PDF file input。

PPT Master 簡報生成（大綱、逐頁 SVG 撰寫與修復迴圈）使用「設計簡報」用途指派的模型。
這條路徑跑在背景 worker，可接受較長延遲以換取更嚴謹的 SVG 版面推理。

任何用途尚未指派前，對應 API 會回傳 HTTP 503 與 `llm_not_configured`，
簡報 job 則會直接標記為失敗，不會重試。

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

因此不需要把 App Service hostname 編譯進 Vite，也不需要為每個前端環境維護不同 API URL。BFF 會透過同源 HttpOnly session cookie 驗證請求，前端不再傳送 Provider Token。

## 4. GitHub Actions

現有 workflow 會：

1. Build 前端並部署 `dist/` 到 SWA。
2. 將 `api/` 原始檔、`package.json` 與 `package-lock.json` 部署到 App Service。
3. App Service 的 `SCM_DO_BUILD_DURING_DEPLOYMENT=true` 由 Oryx 使用 Node 22 安裝 production dependencies。
4. push 到 `main` 時，以 `Azure/webapps-deploy@v3` 將 API 部署到 App Service；文件-only push 不會觸發部署。
5. Pull Request 只部署 SWA preview，不會覆蓋正式 API。

Repository secrets：

- `AZURE_API_APP_SERVICE_NAME`
- `AZURE_API_APP_SERVICE_PUBLISH_PROFILE`

workflow 不再使用 `api_location: "api"`；API 由獨立 App Service deployment step 提供。
不要將本機 `node_modules` 放入 deployment package，避免 OneDeploy 在重新建置依賴時留下不完整的壓縮檔。

## 5. 資料庫 migration

部署 async image jobs 與 BFF session 前，先對正式 PostgreSQL 執行最新 migrations：

```powershell
$env:DATABASE_URL = "<postgresql-connection-string>"
$env:DATABASE_SSL = "true"
node api/scripts/migrate.cjs
```

`009_image_generation_jobs.sql` 與 `010_auth_sessions.sql` 只新增 job/session tables 和 indexes；不會修改既有 history 資料。執行前請確認 App Service 使用的資料庫連線字串相同。

若暫時 rollback 回 Azure Functions，`FUNCTIONS_WORKER_RUNTIME` 會讓 GPT Image 2
回到原本的同步 handler 路徑；非同步 worker 只在 App Service `npm start` 中啟動。

上傳 staging 的應用程式清理與 Azure lifecycle policy 的安全套用順序、drain gate、
rollback 與查核命令，請依照 [upload-lifecycle-operations.md](upload-lifecycle-operations.md)。

## 6. 驗證與 rollback

先直接測試 App Service：

```text
https://<app-service-domain>/api/health
```

再測試 SWA proxy：

```text
https://<swa-domain>/api/health
```

Scalar API 文件：

```text
https://<swa-domain>/api/docs/
```

接著驗證 Entra/Google 登入、頁面重整、App Service restart 後 session、圖片生成、文件分析、風格、歷史、範本、LINE 與管理 API。若切換失敗，可先 unlink App Service，再暫時恢復 workflow 的 `api_location: "api"`，因為既有 handlers、`function.json` 與 `host.json` 仍保留。

## 7. 常見問題

- **API 404**：確認 App Service Startup command 為 `npm start`、deployment package 包含 `server.js`，且 SWA 已連結正確 App Service。
- **JSON body 413**：一般文件會先上傳 Blob，App Service 透過 AnyDoc 解析，不應以提高 `API_BODY_LIMIT` 傳送大型 base64。base64 只保留給前端極小檔案的上傳失敗備援。
- **AnyDoc native binding 載入失敗**：確認部署使用 Node.js 20+ 的 Linux x64／arm64 App Service，且以 `npm ci --prefix api` 安裝 optional native package；不要使用 `--omit=optional`。
- **`document_text_too_large`**：文件已成功由 AnyDoc 解析，但 Markdown 超過 `DOCUMENT_ANALYSIS_MAX_CHARS`。第一版需縮小文件；300 MB 文件將由後續非同步 chunk pipeline 處理。
- **API 401**：確認 session cookie 未被瀏覽器封鎖，並檢查 `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`、`ENTRA_REDIRECT_URI`、`AUTH_SESSION_SECRET`、`DATABASE_URL`。
- **資料庫連線失敗**：確認 PostgreSQL firewall/private networking 允許 App Service outbound access。
- **GPT Image 2 仍顯示 Backend call failure**：確認 migration 已執行、App Service log 有 `image-jobs` worker、以及 `generated` Blob container 可寫入。
- **CORS 錯誤**：同源 SWA proxy 不應需要額外 CORS；若直接測試 App Service，將 SWA 網域與本機網域加入 `CORS_ALLOW_ORIGIN`，並保留 credentials。
