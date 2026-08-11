# Microsoft Entra ID BFF 設定指南

Pixora 使用既有 Azure Static Web Apps + App Service 架構，由 App Service 作為 BFF 完成 Microsoft Entra ID authorization code login，再以既有 PostgreSQL 保存 Pixora 工作階段。不需要新增 Azure 資源。

## 1. 沿用既有 App Registration

1. 開啟 Microsoft Entra ID → **App registrations** → 既有 Pixora App Registration。
2. 在 **Authentication** 中新增 **Web** redirect URI：
   - 本機：`http://localhost:3000/api/auth/entra/callback`
   - 正式：`https://<your-swa-domain>/api/auth/entra/callback`
3. 移除不再使用的 SPA redirect URI 與 implicit access/id token 設定。
4. 在 **Certificates & secrets** 建立 client secret。Secret value 只放在既有 App Service Application settings，不要放進 Vite、GitHub workflow 或 repository。
5. 使用既有 tenant 的 OpenID scopes：`openid profile email`。目前 Pixora 不呼叫 Microsoft Graph，不需要為登入額外要求 `User.Read`。

## 2. App Service 設定

在既有 App Service → **Configuration** → **Application settings** 設定：

| Variable | 說明 |
| --- | --- |
| `AZURE_TENANT_ID` | Entra Directory/Tenant ID |
| `AZURE_CLIENT_ID` | 既有 App Registration client ID |
| `AZURE_CLIENT_SECRET` | App Registration secret value；使用 Key Vault reference 或 App Service secret |
| `ENTRA_REDIRECT_URI` | 與目前環境完全相同的 BFF callback URI |
| `AUTH_SESSION_SECRET` | 至少 32 bytes 的隨機 secret，用於 session cookie／CSRF 簽章材料 |
| `DATABASE_URL` | 既有 PostgreSQL connection string |
| `DATABASE_SSL` | 正式環境使用 `true` |
| `GOOGLE_CLIENT_ID` | 既有 Google OAuth client ID |
| `AUTH_DISABLED` | 正式環境固定為 `false` |
| `CORS_ALLOW_ORIGIN` | 精確列出 SWA 網域與本機開發網域，不使用 `*` |

產生 session secret 的例子：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. 前端環境變數

前端不再取得或保存 Entra Token，不需要 `VITE_MSAL_*`：

```ini
VITE_API_BASE_URL=/api
VITE_GOOGLE_CLIENT_ID=<public-google-client-id>
VITE_AUTH_BYPASS=false
```

Google credential 只會一次性送到 `/api/auth/google` 驗證；登入完成後瀏覽器只保存 HttpOnly Pixora session cookie。

## 4. Session 行為

- session cookie：HttpOnly、正式環境 Secure、SameSite=Lax。
- 閒置 8 小時後失效，最後活動時間會滑動更新。
- 最長 30 天後必須重新完成 Entra 或 Google 登入。
- Pixora 登出只撤銷 Pixora session，不會登出 Microsoft 或 Google SSO。
- App Service 重啟或 scale-out 不會清除 PostgreSQL session。

## 5. 常見問題

- **登入 callback 404**：確認 redirect URI 是 `/api/auth/entra/callback`，且 SWA 已將 `/api/*` linked 到正確 App Service。
- **登入後 401**：檢查 `AZURE_CLIENT_SECRET`、`ENTRA_REDIRECT_URI`、`DATABASE_URL` 與 `AUTH_SESSION_SECRET` 是否設定在 App Service，而不是前端環境。
- **本機跨來源 Cookie 未送出**：確認 API 的 `CORS_ALLOW_ORIGIN` 包含 Vite 網域，前端 API client 使用 `credentials: include`。
- **切換後第一次必須登入**：這是預期行為；舊 SPA localStorage Token 不會轉成新的 BFF session。
