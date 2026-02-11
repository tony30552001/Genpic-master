# Azure Static Web Apps 部署指南 (React + Azure Functions)

您的專案結構非常適合部署到 **Azure Static Web Apps (SWA)**。這是一個現代化的 Azure 服務，專門用於託管像您這樣的專案：前端使用靜態框架 (React/Vite)，後端使用 Serverless API (Azure Functions)。

## 為什麼選擇 Azure Static Web Apps？

1.  **自動化部署**：連接 GitHub 後，每次 `git push` 都會自動觸發 GitHub Actions 進行建置與部署。
2.  **整合式架構**：它會自動識別並部署您的 `src` (前端) 和 `api` (後端)，無需分開管理。
3.  **內建反向代理**：SWA 會自動處理路由，前端呼叫 `/api/*` 會直接轉發到後端函數，解決了 CORS 問題。
4.  **免費 SSL 憑證**：自動提供 HTTPS 安全連線。

---

## 步驟 1：準備工作

確認您的專案結構符合 SWA 的預設標準 (您的專案目前已經符合)：
-   **前端根目錄**：`/` (包含 `package.json`, `vite.config.js`)
-   **後端目錄**：`/api` (包含 `host.json`, `local.settings.json`, `package.json`)
-   **前端輸出目錄**：`dist` (這是 Vite 預設的建置輸出資料夾)

---

## 步驟 2：建立 Azure Static Web App

1.  登入 [Azure Portal](https://portal.azure.com)。
2.  搜尋並選擇 **Static Web Apps**。
3.  點擊 **+ Create** (建立)。
4.  填寫基本資訊：
    -   **Subscription (訂閱)**：選擇您的 Azure 訂閱。
    -   **Resource Group (資源群組)**：建立一個新的 (例如 `rg-genpic-prod`) 或選擇現有的。
    -   **Name (名稱)**：輸入專案名稱 (例如 `stapp-genpic-eastasia`)。
    -   **Plan Type (方案類型)**：選擇 **Free** (免費供嗜好使用) 或 **Standard** (若需要自訂網域 SSL 或 SLA)。
    -   **Region (區域)**：選擇離您使用者最近的區域 (例如 `East Asia`)。
5.  在 **Deployment details (部署詳細資料)** 區域：
    -   **Source (來源)**：選擇 **GitHub**。
    -   點擊 **Sign in with GitHub** 並授權 Azure 存取您的儲存庫。
    -   選擇您的 **Organization (組織)**、**Repository (儲存庫)** (`genpic-master`) 和 **Branch (分支)** (`main` 或您開發用的分支)。
6.  在 **Build Details (建置詳細資料)** 區域：
    -   **Build Presets (建置預設值)**：選擇 **React**。
    -   **App location (應用程式位置)**：輸入 `/` (代表前端在根目錄)。
    -   **Api location (Api 位置)**：輸入 `/api` (代表後端在 api 資料夾)。
    -   **Output location (輸出位置)**：輸入 `dist` (Vite 的預設輸出)。
7.  點擊 **Review + create**，然後點擊 **Create**。

---

## 步驟 3：設定環境變數

您的本地開發使用了 `local.settings.json` 中的環境變數 (如資料庫連線字串、API Key 等)。這些檔案**不會**被上傳到 Azure，因此您需要在 Azure Portal 中手動設定。

1.  在 Azure Portal 中，前往剛建立的 Static Web App 資源。
2.  在左側選單中，點擊 **Configuration (組態)** (在 Settings 下)。
3.  點擊 **+ Add** 加入以下應用程式設定 (請參考您的 `api/local.settings.json`)：

    | Name (名稱) | Value (值) | 說明 |
    | :--- | :--- | :--- |
    | `AZURE_TENANT_ID` | `6f4e2c19-7620-4dea-8852-11ec264fbef1` | Azure AD 租戶 ID |
    | `AZURE_CLIENT_ID` | `529a30b4-cdd0-4dbb-b3e6-257e717dfdbf` | 應用程式 Client ID |
    | `AZURE_STORAGE_ACCOUNT` | `genpicstorage001` | 儲存體帳戶名稱 |
    | `AZURE_STORAGE_KEY` | `QMjM3...` (請複製完整金鑰) | 儲存體帳戶金鑰 |
    | `DATABASE_URL` | `postgresql://...` (請複製完整連線字串) | Database 連線字串 |
    | `GOOGLE_API_KEY` | `AIzaSy...` (請複製完整 API Key) | Google Gemini API Key |
    | `GEMINI_MODEL_ANALYSIS` | `gemini-3-pro-preview` | 模型名稱 |
    | `GEMINI_MODEL_GENERATION` | `gemini-3-pro-image-preview` | 模型名稱 |
    | `AUTH_DISABLED` | `false` | 正式環境建議設為 false |
    | `CORS_ALLOW_ORIGIN` | `*` | 允許的來源 |
    | `RATE_LIMIT_PER_MINUTE` | `60` |速率限制 |
    | `BLOB_CONTAINER_DEFAULT` | `uploads` | Blob 容器名稱 |
    | `EMBEDDING_DIM` | `1536` | 嵌入向量維度 |
    | `EMBEDDING_MODEL` | `text-embedding-004` | 嵌入模型名稱 |

4.  加入所有變數後，記得點擊上方的 **Save (儲存)**。

---

## 步驟 4：驗證部署

1.  當您在步驟 2 點擊建立後，Azure 會自動在您的 GitHub 儲存庫中建立一個 Workflow 檔案 (位於 `.github/workflows/` 下)。
2.  前往您的 GitHub Repo 的 **Actions** 頁面，您應該會看到一個正在執行的 Workflow (通常叫做 `Azure Static Web Apps CI/CD`)。
3.  等待 Action 執行完成 (綠色勾勾)。
4.  回到 Azure Portal 的 Static Web App 概觀頁面，點擊 **URL** 連結。
5.  您的網站應該已經成功上線！測試一下登入、圖片生成等功能是否正常。

---

## 常見問題排除

-   **API 請求 404**：
    -   請確認您的前端 API 呼叫路徑是否正確 (應為 `/api/...`)。
    -   檢查 GitHub Action 部署日誌，確認與 API 相關的步驟是否成功。確保 `Api location` 設定正確為 `api`。
-   **環境變數無效**：
    -   Azure SWA 的環境變數設定後需要幾分鐘才會生效，有時需要重新整理或重新部署。
    -   請確保變數名稱與程式碼中 `process.env.VARIABLE_NAME` 完全一致。
-   **資料庫連線失敗**：
    -   請確認您的 Azure Database for PostgreSQL (或您使用的資料庫服務) 的防火牆設定，需允許 **Azure 服務和資源存取此伺服器** (Allow Azure services and resources to access this server)。因為 SWA Function 也是 Azure 服務的一部分。
-   **圖片上傳失敗 (CORS Error)**：
    -   錯誤訊息：`Access to XMLHttpRequest at '...' from origin '...' has been blocked by CORS policy`。
    -   原因：Azure Blob Storage 預設不允許跨網域存取。
    -   解決方法：
        1.  前往 Azure Portal 的 Storage Account (`genpicstorage001`)。
        2.  在左側選單找到 **Settings** -> **Resource sharing (CORS)**。
        3.  切換到 **Blob service** 分頁。
        4.  新增一條規則：
            -   **Allowed origins**: 輸入您的 Static Web App 網域 (例如 `https://thankful-island-xxx.azurestaticapps.net`)，或暫時使用 `*`。
            -   **Allowed methods**: 把 `GET`, `PUT`, `POST`, `OPTIONS`, `HEAD` 全部勾選 (或是至少勾選 `PUT` 與 `GET`)。
            -   **Allowed headers**: `*`
            -   **Exposed headers**: `*`
            -   **Max age**: `86400`
        5.  點擊 **Save**。等待幾分鐘後重試。
