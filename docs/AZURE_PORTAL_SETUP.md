# Azure Portal 設置流程

> 版本 v1.0 | 最後更新：2026-02-10

本文件說明如何用 **Portal 全流程** 建立 GenPic Master 的 Azure 基礎設施。

---

## 0. 登入 Azure Portal
- https://portal.azure.com
- 確認右上角訂閱與目錄正確

---

## 1. 建立 Resource Group
1. 進入 **Resource groups** → **Create**
2. **Subscription**：選你的訂閱
3. **Resource group**：`genpic-rg`
4. **Region**：建議 `East Asia`
5. **Review + Create** → **Create`

---

## 2. Entra ID App Registration（MSAL）
1. 進入 **Microsoft Entra ID** → **App registrations** → **New registration**
2. **Name**：`genpic-web`
3. **Supported account types**：Single tenant
4. **Redirect URI**：選 **Single-page application (SPA)**
   - `http://localhost:5173`
5. **Register**

記下：
- **Tenant ID**
- **Client ID**

---

## 3. Azure Static Web Apps（前端）
1. 進入 **Static Web Apps** → **Create**
2. **Resource group**：`genpic-rg`
3. **Name**：`genpic-swa`
4. **Plan type**：Free / Standard
5. **Deployment details**：先選 **Other**（之後再接 GitHub）
6. **Review + Create** → **Create**

---

## 4. Azure App Service（API）
1. 進入 **App Services** → **Create** → **Web App**
2. **Resource group**：`genpic-rg`
3. **Name**：`genpic-api`
4. **Publish**：Code
5. **Runtime stack**：Node.js
6. **Version**：22 LTS
7. **Operating System**：Linux
8. **Region**：East Asia
9. 選擇現有或新建 App Service Plan
10. **Review + Create** → **Create**

---

## 5. Key Vault（存 Gemini API Key）
1. 進入 **Key vaults** → **Create**
2. **Resource group**：`genpic-rg`
3. **Name**：`genpic-kv`
4. **Region**：East Asia
5. **Review + Create** → **Create**

新增 Secret：
- 進入 `genpic-kv` → **Secrets** → **Generate/Import**
- **Name**：`GEMINI-API-KEY`
- **Value**：你的 Gemini API Key
- **Create**

---

## 6. Application Insights（監控）
1. 進入 **Application Insights** → **Create**
2. **Resource group**：`genpic-rg`
3. **Name**：`genpic-ai`
4. **Region**：East Asia
5. **Resource mode**：Workspace-based
6. **Review + Create** → **Create**

---

## 7. Azure Storage（Blob）
1. 進入 **Storage accounts** → **Create**
2. **Resource group**：`genpic-rg`
3. **Storage account name**：`genpicstorage001`（需全域唯一）
4. **Region**：East Asia
5. **Performance**：Standard
6. **Redundancy**：LRS
7. **Review + Create** → **Create**

建立容器：
- 進入 Storage → **Data storage > Containers**
- 建立：
  - `uploads`
  - `generated`
  - `thumbnails`

---

## 8. PostgreSQL（Flexible Server）
1. 進入 **Azure Database for PostgreSQL** → **Create**
2. 選 **Flexible server**
3. **Resource group**：`genpic-rg`
4. **Server name**：`genpic-pg`
5. **Region**：East Asia
6. **Workload type**：Development
7. **Compute + Storage**：B1ms
8. **Admin username/password**：自行設定
9. **Review + Create** → **Create**

啟用 `pgvector`：
- 進入 PostgreSQL → **Connect** → 取得連線字串
- 用 psql 執行：
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

---

## 9. App Service 設定環境變數（App Settings）
1. 進入 `genpic-api` → **Configuration** → **Application settings**
2. 新增：
   - `AZURE_TENANT_ID` = Tenant ID
   - `AZURE_CLIENT_ID` = Client ID
   - `GOOGLE_CLIENT_ID` = Google OAuth client ID
   - `DATABASE_URL` = PostgreSQL connection string
   - `DATABASE_SSL` = `true`
   - `AZURE_STORAGE_ACCOUNT` = Storage account name
   - `AZURE_STORAGE_KEY` = Key Vault Secret Reference
   - `BLOB_CONTAINER_DEFAULT` = `uploads`
   - `GOOGLE_API_KEY` = Key Vault Secret Reference
     - Key Vault Secret 頁面複製 **Secret Identifier**
     - 格式：`@Microsoft.KeyVault(SecretUri=<SecretIdentifier>)`
   - `GEMINI_MODEL_ANALYSIS` = `gemini-1.5-flash`
   - `GEMINI_MODEL_GENERATION` = `gemini-3-pro-image-preview`
   - `AZURE_OPENAI_ENDPOINT` = `https://<resource>.services.ai.azure.com/openai/v1`
   - `AZURE_OPENAI_API_KEY` = Key Vault Secret Reference
   - `AZURE_OPENAI_DEPLOYMENT` = `gpt-5.6-luna`
   - `GPT_IMAGE_ENDPOINT` = Azure AI Foundry image endpoint
   - `GPT_IMAGE_EDIT_ENDPOINT` = Optional image edit endpoint
   - `GPT_IMAGE_API_KEY` = Key Vault Secret Reference
   - `GPT_IMAGE_DEPLOYMENT` = `gpt-image-2`
   - `BLOB_CONTAINER_GENERATED` = `generated`
   - `IMAGE_JOB_POLL_MS` = `2000`（可選）
   - `LINE_TOKEN_ENCRYPTION_KEY` = Key Vault Secret Reference
   - `ADMIN_EMAILS` = Comma-separated admin email list
   - `AUTH_DISABLED` = `false`
   - `CORS_ALLOW_ORIGIN` = `https://<your-swa-domain>`
   - `RATE_LIMIT_PER_MINUTE` = `60`
   - `API_BODY_LIMIT` = `100mb`
   - `SCM_DO_BUILD_DURING_DEPLOYMENT` = `true`
3. **Save**

部署後，先使用相同的 `DATABASE_URL` 執行 `node api/scripts/migrate.cjs`，
建立 `image_generation_jobs` table。GPT Image 2 會由 App Service 背景 worker
處理，避免 SWA linked API 約 45 秒 gateway timeout。

---

## 10. 連結 Static Web App 與 App Service
1. 進入現有 Static Web App → **APIs** → **Link**
2. 選擇 `genpic-api` App Service
3. 儲存設定，讓 Static Web App 的 `/api/*` 代理到 App Service 相同路徑
4. App Service 若啟用平台 CORS，加入：
   - `https://<your-swa-domain>`
   - `http://localhost:5173`
5. 正式環境不要將 `CORS_ALLOW_ORIGIN` 設為 `*`

---

## 11. 前端 .env 設定
```dotenv
VITE_MSAL_CLIENT_ID=<client-id>
VITE_MSAL_TENANT_ID=<tenant-id>
VITE_MSAL_REDIRECT_URI=http://localhost:5173
VITE_MSAL_SCOPES=User.Read
VITE_API_BASE_URL=/api
```

---

## 12. 最小驗證
- App Service `https://<your-app-service>.azurewebsites.net/api/health` 回 `200 {"status":"ok"}`
- Static Web App `https://<your-swa-domain>/api/health` 回 `200 {"status":"ok"}`
- MSAL 登入可取得 token
- API 呼叫不回 401
- Blob 容器存在
- PostgreSQL 可連線
