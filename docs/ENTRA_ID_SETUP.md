# Microsoft Entra ID (Azure AD) 設定指南

本專案已內建完整的 Microsoft Entra ID (前稱 Azure AD) 登入整合。請依照下列步驟在 Azure Portal 進行設定，即可啟用企業級身分驗證。

---

## 步驟 1：建立應用程式註冊 (App Registration)

1.  登入 [Azure Portal](https://portal.azure.com)。
2.  搜尋並進入 **Microsoft Entra ID**。
3.  在左側選單點選 **App registrations (應用程式註冊)** -> **New registration (新增註冊)**。
4.  輸入名稱：例如 `GenPic-Auth`。
5.  **Supported account types (支援的帳戶類型)**：
    -   通常選擇 **Accounts in this organizational directory only** (僅限此組織目錄中的帳戶 - 單一租戶)。
6.  **Redirect URI (重新導向 URI)**：
    -   平台選擇：**Single-page application (SPA)** (注意：不要選 Web)。
    -   網址輸入：`http://localhost:5173` (本地開發用)。
7.  點擊 **Register (註冊)**。

---

## 步驟 2：配置驗證設定

1.  註冊完成後，在該 App 的 **Overview (概觀)** 頁面，複製以下兩個 ID：
    -   **Application (client) ID** (應用程式用戶端識別碼)
    -   **Directory (tenant) ID** (目錄租戶識別碼)
2.  前往左側選單的 **Authentication (驗證)**：
    -   在 **Single-page application** 區塊下，點擊 **Add URI**，加入您正式站的網址：
        -   例如：`https://thankful-island-xxxx.azurestaticapps.net`
    -   勾選 **Access tokens (used for implicit flows)** 與 **ID tokens (used for implicit and hybrid flows)** (雖然 MSAL.js 2.0 使用 PKCE，但勾選這些可確保相容性)。
    -   點擊 **Save (儲存)**。
3.  前往左側選單的 **API permissions (API 權限)**：
    -   確認已有 `User.Read` (Microsoft Graph) 權限。
    -   若沒有，點擊 **Add a permission** -> **Microsoft Graph** -> **Delegated permissions** -> 搜尋並勾選 `User.Read` -> **Add permissions**。
    -   點擊 **Grant admin consent for <Organization Name>** (代表組織授權)，這樣使用者登入時就不會跳出授權同意畫面。

---

## 步驟 3：設定專案環境變數

### 3.1 前端設定 (.env)

開啟專案根目錄的 `.env` 檔案，填入剛才取得的 ID，並關閉 Bypass 模式：

```ini
# Microsoft Entra ID (MSAL)
VITE_MSAL_CLIENT_ID=您的_Application_Client_ID
VITE_MSAL_TENANT_ID=您的_Directory_Tenant_ID
VITE_MSAL_REDIRECT_URI=http://localhost:5173
VITE_MSAL_SCOPES=User.Read

# API Gateway
VITE_API_BASE_URL=http://localhost:7071/api

# Local auth bypass (設為 false 以啟用真實登入)
VITE_AUTH_BYPASS=false
```

### 3.2 後端本地設定 (api/local.settings.json)

開啟 `api/local.settings.json`，填入相同的 ID，並啟用驗證：

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_CLIENT_ID": "您的_Application_Client_ID",
    "AZURE_TENANT_ID": "您的_Directory_Tenant_ID",
    "AUTH_DISABLED": "false",
    ...其他設定保持不變
  }
}
```

---

## 步驟 4：正式環境設定 (Azure Static Web Apps)

當您部署到 Azure Static Web Apps 後，請記得在 Azure Portal 的 **Environment variables** (或 Configuration) 中加入這些設定：

| Variable Name | Value | 說明 |
| :--- | :--- | :--- |
| `AZURE_CLIENT_ID` | 您的_Application_Client_ID | 若已存在，請點擊 **Edit** 修改值，不要重複新增。 |
| `AZURE_TENANT_ID` | 您的_Directory_Tenant_ID | 若已存在，請點擊 **Edit** 修改值，不要重複新增。 |
| `AUTH_DISABLED` | `false` | 請修改為 `false` 以啟用驗證。 |

> **注意：** 如果您之前已依照部署指南加入了這些變數，請直接編輯它們。Azure 不允許重複的變數名稱 (App setting names must be unique)。

*(注意：前端的環境變數 `VITE_*` 需要在 Build 階段寫入。由於 SWA 的 Build 是在 GitHub Actions 執行的，您必須修改 GitHub Workflow 檔案，如下所示。)*

### 修正 GitHub Workflow (`.github/workflows/...yml`)

為了讓前端順利讀取到環境變數，請編輯您的 workflow 檔案，在 `Build And Deploy` 步驟的 `env` 區塊中加入這些變數：

```yaml
      - name: Build And Deploy
        id: builddeploy
        uses: Azure/static-web-apps-deploy@v1
        with:
          # ... 其他設定 ...
        env:
          VITE_MSAL_CLIENT_ID: ${{ secrets.VITE_MSAL_CLIENT_ID }}
          VITE_MSAL_TENANT_ID: ${{ secrets.VITE_MSAL_TENANT_ID }}
          VITE_MSAL_REDIRECT_URI: "https://thankful-island-0ab89420f.1.azurestaticapps.net" # 或您的自訂網域
          VITE_AUTH_BYPASS: "false"
          VITE_API_BASE_URL: "/api"
```

1.  前往 GitHub Repo 的 **Settings** -> **Secrets and variables** -> **Actions**。
2.  點擊 **New repository secret**。
3.  新增 `VITE_MSAL_CLIENT_ID` 和 `VITE_MSAL_TENANT_ID` (填入在步驟 2 取得的值)。
4.  提交 Workflow 變更，觸發重新部署。

---

## 常見問題

-   **登入後跳轉回 localhost 但顯示 404**：請確認您在 Azure Portal 的 Redirect URI 設定的是 `http://localhost:5173` 而不是 `http://localhost:5173/` (尾部斜線有時會造成問題)，且必須完全匹配。
-   **權限不足錯誤**：請確認已在 API Permissions 頁面點擊 "Grant admin consent"。
