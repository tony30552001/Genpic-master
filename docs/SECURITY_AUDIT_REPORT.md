# 🔒 GenPic Master — 靜態安全審查報告 (SAST)

> **審查日期**: 2026-03-02
> **審查範圍**: 前端 (React/Vite) + 後端 (Azure Functions Node.js) + 資料庫 (PostgreSQL)
> **審查方法**: 靜態程式碼分析 + 邏輯推演

---

## 一、漏洞總覽表

| # | 風險等級 | 漏洞名稱 | 觸發位置 | 攻擊情境簡述 |
|---|---------|---------|---------|-------------|
| 1 | 🔴 **高** | **硬編碼機密資訊已提交至版本控制** | `.env`, `api/local.settings.json` | `.env` 包含真實 MSAL Client ID、Google Client ID；`local.settings.json` 包含 Azure Storage Key、PostgreSQL 連線字串（含帳密）、Google API Key、LINE 加密金鑰。一旦 repo 外洩，攻擊者即可直接存取資料庫、Blob Storage、Google AI 服務。 |
| 2 | 🔴 **高** | **生產環境認證旁路 (AUTH_DISABLED=true)** | `api/local.settings.json` → `api/_shared/auth.js:9,167-175` | `AUTH_DISABLED=true` 使所有 API 端點跳過 Token 驗證，以 "Local Dev" 身份執行。若此設定意外部署至生產環境，所有 API 完全無需認證即可呼叫。 |
| 3 | 🔴 **高** | **HS256 Token 跳過簽章驗證** | `api/_shared/auth.js:67-88` | 當收到 `alg: HS256` 且無 `kid` 的 JWT 時，程式碼 **完全跳過簽章驗證** 並直接信任 payload。攻擊者可手工偽造任意 HS256 JWT，冒充任何使用者。 |
| 4 | 🔴 **高** | **SSRF (Server-Side Request Forgery)** | `api/generate-images/index.js:37-54`, `api/analyze-document/index.js:97-109` | `imageUrl` 和 `documentUrl` 由使用者提供，後端直接 `fetch()`。攻擊者可傳入 `http://169.254.169.254/...`（Azure IMDS）竊取雲端 Managed Identity Token，或掃描內部網路服務。 |
| 5 | 🔴 **高** | **CORS 設定為通配符 `*`** | `api/_shared/http.js:2`, `api/local.settings.json:CORS_ALLOW_ORIGIN=*` | `Access-Control-Allow-Origin: *` 允許任何網域的 JavaScript 發起跨域請求，結合已認證的 Cookie/Token，可被第三方惡意網站利用進行 CSRF 式攻擊。 |
| 6 | 🟠 **中** | **Blob SAS Token 權限過大 (寫入 + 1 年讀取)** | `api/blob-sas/index.js:101,109-120` | 寫入 SAS 授予 `crw`（create/read/write）權限；讀取 SAS 有效期長達 **1 年**。若 SAS URL 外洩，攻擊者可長期讀取檔案，或上傳惡意檔案覆寫現有 Blob。 |
| 7 | 🟠 **中** | **Container 名稱由使用者控制，無白名單** | `api/blob-sas/index.js:85` | `req.body.container` 直接作為 SAS 生成的 containerName，攻擊者可指定任意 Container（如 `$logs`、其他業務 Container），取得不該存取的 Storage 區域的 SAS Token。 |
| 8 | 🟠 **中** | **記憶體內 Rate Limiting 可輕易繞過** | `api/_shared/rateLimit.js` | Rate Limit 使用 `Map()` 存於單一 Function 實例記憶體中。Azure Functions 可能有多個實例，每次冷啟動也會重置。攻擊者只需並行請求或觸發新實例即可繞過。 |
| 9 | 🟠 **中** | **IP-based Rate Limit Key 可偽造** | `api/_shared/rateLimit.js:6-11` | 當使用者未認證時，以 `x-forwarded-for` / `x-client-ip` 為 key，這些 header 可被客戶端任意偽造，輕易繞過速率限制。 |
| 10 | 🟠 **中** | **錯誤訊息洩漏內部細節** | `api/_shared/auth.js:234`, `api/generate-images/index.js:138`, 多處 catch | 錯誤回應直接附帶 `err.message`，可能洩漏資料庫結構、API Key 格式、內部服務 URL 等敏感資訊，協助攻擊者進一步攻擊。 |
| 11 | 🟠 **中** | **前端 AUTH_BYPASS 旁路可繞過** | `src/config.js:12`, `.env:VITE_AUTH_BYPASS=true` | `VITE_AUTH_BYPASS` 編譯時嵌入前端 bundle。若 build 時未正確設定，生產環境前端將跳過認證檢查，雖然後端仍有保護，但前端 UI 完全開放。 |
| 12 | 🟠 **中** | **SSL 憑證驗證被關閉** | `api/_shared/db.js:13` | `ssl: { rejectUnauthorized: false }` 關閉了 TLS 憑證驗證，使資料庫連線易受中間人攻擊 (MITM)，攻擊者可攔截和竄改 DB 流量。 |
| 13 | 🟠 **中** | **Google Token 存於 localStorage** | `src/context/AuthContext.jsx:161`, `src/services/authService.js:28` | Google ID Token (JWT) 完整存入 `localStorage`，若存在任何 XSS 漏洞，攻擊者可直接竊取 Token 冒充使用者。`localStorage` 不像 `httpOnly Cookie` 受同源政策保護。 |
| 14 | 🟡 **低** | **缺少 Security Headers** | `api/_shared/http.js` | 回應缺少 `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy` 等標準安全標頭，增加 Clickjacking、MIME sniffing 等風險。 |
| 15 | 🟡 **低** | **Debug 日誌洩漏敏感資訊** | `api/_shared/auth.js:187-191,206,231` | 認證流程中大量 `console.log` 輸出 Token issuer、subject、email 等資訊，生產環境中可能被日誌收集系統記錄，造成 PII 洩漏。 |
| 16 | 🟡 **低** | **Health 端點無認證** | `api/health/index.js` | `/api/health` 無需任何認證即可存取，雖風險較低，但可作為服務探測點，確認服務存活與版本。 |

---

## 二、高風險問題修復建議

### 🔴 #1: 硬編碼機密資訊已提交至版本控制

**問題核心**: `.env` 與 `api/local.settings.json` 包含真實的 API Key、資料庫帳密、Storage Key 等，且 `.env` 未被 `.gitignore` 排除。

**修復方案**:

```gitignore
# .gitignore — 新增以下行
.env
.env.local
.env.*.local
api/local.settings.json
```

**立即行動**:
1. **輪換所有已洩漏的金鑰**：Azure Storage Key、PostgreSQL 密碼、Google API Key、LINE 加密金鑰。
2. 使用 `git filter-branch` 或 `BFG Repo-Cleaner` 從 Git 歷史中徹底移除機密資訊。
3. 改用 Azure Key Vault / GitHub Secrets 管理所有機密。

```bash
# 使用 BFG 清除歷史中的機密
bfg --replace-text passwords.txt repo.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

---

### 🔴 #2: 生產環境認證旁路

**問題核心**: `AUTH_DISABLED=true` 在 `local.settings.json` 中預設開啟。

**修復方案**: 在 `auth.js` 中加入環境檢查，禁止在生產環境使用旁路。

```javascript
// api/_shared/auth.js — 修改 authDisabled 判斷邏輯
const isProduction = process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Production"
    || process.env.NODE_ENV === "production"
    || !!process.env.WEBSITE_SITE_NAME;  // Azure App Service/Functions 自動注入

const authDisabled = process.env.AUTH_DISABLED === "true" && !isProduction;

if (authDisabled && isProduction) {
  console.error("[Auth CRITICAL] AUTH_DISABLED=true is set in production! Ignoring.");
}
```

---

### 🔴 #3: HS256 Token 跳過簽章驗證

**問題核心**: 第 67-88 行對 HS256 Token 完全跳過簽章驗證，信任任何人偽造的 payload。

**修復方案**: 移除 HS256 信任邏輯，或使用已知密鑰驗證。

```javascript
// api/_shared/auth.js — 移除不安全的 HS256 信任區塊
// 將第 67-89 行替換為：
if (decodedToken.header.alg === "HS256" && !decodedToken.header.kid) {
  // 不應信任無法驗證簽章的 Token
  reject(new Error(
    "HS256 tokens without a known signing key are not accepted. " +
    "Please use a supported identity provider (Microsoft/Google)."
  ));
  return;
}
```

若確實需要支援 Azure SWA 內部 Token，應改為從 `x-ms-client-principal` header 取得身份（已有 `parseSWAHeader` 實作），不要從不可驗證的 JWT 中提取。

---

### 🔴 #4: SSRF (Server-Side Request Forgery)

**問題核心**: `generate-images` 和 `analyze-document` 直接 `fetch()` 使用者提供的 URL。

**修復方案**: 加入 URL 白名單驗證。

```javascript
// api/_shared/urlValidator.js — 新建共用模組
const ALLOWED_HOSTS = [
  // 只允許自家 Blob Storage
  `${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
];

const BLOCKED_IP_RANGES = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private A
  /^172\.(1[6-9]|2\d|3[01])\./, // Private B
  /^192\.168\./,               // Private C
  /^169\.254\./,               // Link-local / Azure IMDS
  /^0\./,                      // Current network
  /^fc00:/i,                   // IPv6 ULA
  /^fe80:/i,                   // IPv6 Link-local
  /^::1$/,                     // IPv6 Loopback
];

const isUrlAllowed = (urlString) => {
  try {
    const url = new URL(urlString);

    // 只允許 HTTPS（生產環境）
    if (url.protocol !== "https:") return false;

    // 檢查 hostname 是否為 IP 位址
    const hostname = url.hostname;
    if (BLOCKED_IP_RANGES.some(regex => regex.test(hostname))) return false;

    // 白名單檢查
    if (ALLOWED_HOSTS.length > 0) {
      return ALLOWED_HOSTS.includes(hostname);
    }

    return true;
  } catch {
    return false;
  }
};

module.exports = { isUrlAllowed };
```

在 `generate-images/index.js` 和 `analyze-document/index.js` 中使用：

```javascript
const { isUrlAllowed } = require("../_shared/urlValidator");

// 在 fetch 之前加入驗證
if (imageUrl && !isUrlAllowed(imageUrl)) {
  context.res = error("不允許的圖片 URL", "bad_request", 400);
  return;
}
```

---

### 🔴 #5: CORS 設定為通配符

**修復方案**: 限制允許的 Origin。

```javascript
// api/_shared/http.js — 修改 corsHeaders 函式
const ALLOWED_ORIGINS = (process.env.CORS_ALLOW_ORIGIN || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

const corsHeaders = (req) => {
  const requestOrigin = req?.headers?.origin;
  let allowOrigin = "";

  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
  } else if (ALLOWED_ORIGINS.length === 0) {
    // 開發模式 fallback
    allowOrigin = requestOrigin || "*";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Auth-Token",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
};
```

並在 `local.settings.json` / 環境變數中設定具體的 Origin：
```
CORS_ALLOW_ORIGIN=https://your-app.azurestaticapps.net,http://localhost:5175
```

---

## 三、中風險問題修復建議

### 🟠 #6: Blob SAS Token 權限過大

```javascript
// api/blob-sas/index.js — 縮減權限與有效期
// 寫入 SAS: 只給 create + write，不給 read，有效期 10 分鐘
permissions: BlobSASPermissions.parse("cw"),
expiresOn: new Date(startsOn.getTime() + 10 * 60 * 1000),

// 讀取 SAS: 有效期縮短為 24 小時（而非 1 年）
const readExpiresOn = new Date(startsOn.getTime() + 24 * 60 * 60 * 1000);
```

### 🟠 #7: Container 名稱白名單

```javascript
// api/blob-sas/index.js — 加入 Container 白名單
const ALLOWED_CONTAINERS = new Set([
  process.env.BLOB_CONTAINER_DEFAULT || "uploads",
  "previews",
]);

const containerName = container || process.env.BLOB_CONTAINER_DEFAULT || "uploads";
if (!ALLOWED_CONTAINERS.has(containerName)) {
  context.res = error("不支援的 Container", "bad_request", 400);
  return;
}
```

### 🟠 #8 & #9: Rate Limiting 改進

建議改為使用外部 Store（如 Redis 或資料庫）做 Rate Limit，或至少在 Azure 層級使用 API Management / Azure Front Door 的 Rate Limit 功能。

對於 IP-based key，應僅信任來自反向代理的真實 IP：

```javascript
// api/_shared/rateLimit.js — 改進 IP 取得邏輯
const getKey = (req, user) => {
  // 優先使用認證使用者身份
  if (user?.email) return `user:${user.email}`;
  if (user?.oid) return `user:${user.oid}`;

  // 未認證時使用 Azure 注入的 Client IP（不信任可偽造的 header）
  const ip = req.headers?.["x-azure-clientip"]  // Azure Front Door
    || req.headers?.["client-ip"]                // Azure SWA
    || "unknown";
  return `ip:${ip}`;
};
```

### 🟠 #10: 錯誤訊息脫敏

```javascript
// 所有 API catch 區塊 — 使用通用錯誤訊息
// ❌ 不要這樣做
context.res = error("生成失敗: " + err.message, "generation_failed", 502);

// ✅ 應該這樣做
context.log.error("Image generation failed:", err);  // 只記在日誌
context.res = error("生成失敗，請稍後重試", "generation_failed", 502);
```

### 🟠 #12: 啟用 SSL 憑證驗證

```javascript
// api/_shared/db.js — 移除 rejectUnauthorized: false
const buildPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");

  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      // 如需自簽憑證，應提供 CA 憑證
      // ca: fs.readFileSync('/path/to/azure-ca.pem').toString()
    },
  });
};
```

### 🟠 #13: Token 改用 sessionStorage 或 httpOnly Cookie

最佳方案是使用 BFF (Backend For Frontend) 模式，將 Token 保存在 `httpOnly` Cookie 中。若短期無法重構，至少改為 `sessionStorage`（關閉分頁即清除）：

```javascript
// src/context/AuthContext.jsx — 將 localStorage 改為 sessionStorage
sessionStorage.setItem('google_user', JSON.stringify(user));
// ...
const savedUser = sessionStorage.getItem('google_user');
// ...
sessionStorage.removeItem('google_user');
```

---

## 四、低風險修復建議

### 🟡 #14: 加入安全標頭

```javascript
// api/_shared/http.js — 在 corsHeaders 中加入安全標頭
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",  // 現代瀏覽器建議關閉舊式 XSS filter
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// 在 ok() 和 error() 回應中合併
const ok = (body, status = 200) => ({
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders(), ...securityHeaders },
  body,
});
```

### 🟡 #15: 移除生產環境 Debug 日誌

```javascript
// api/_shared/auth.js — 使用環境感知的日誌
const isDebug = process.env.AUTH_DEBUG === "true";

// 用 isDebug 包裹所有 console.log
if (isDebug) {
  console.log("[Auth Debug] Token issuer:", iss);
}
```

---

## 五、安全改進優先順序 (建議)

| 優先順序 | 項目 | 預估影響 |
|---------|------|---------|
| P0 (立即) | #1 輪換所有洩漏金鑰、修正 .gitignore | 阻止持續性機密洩漏 |
| P0 (立即) | #3 移除 HS256 免驗證邏輯 | 阻止任意身份偽造 |
| P1 (本週) | #2 加入生產環境 Auth 保護 | 防止意外部署旁路 |
| P1 (本週) | #4 SSRF 防護 | 阻止雲端 metadata 竊取 |
| P1 (本週) | #5 收斂 CORS 設定 | 阻止跨域攻擊 |
| P2 (本月) | #6 #7 SAS Token 收斂 | 降低 Storage 曝險 |
| P2 (本月) | #10 錯誤訊息脫敏 | 減少資訊洩漏 |
| P2 (本月) | #12 啟用 SSL 驗證 | 防止 MITM |
| P3 (持續) | #8 #9 改善 Rate Limit | 防止濫用 |
| P3 (持續) | #13 #14 #15 強化前端與日誌 | 深度防禦 |

---

## 六、總結

本專案具有完整的 Auth 架構（MSAL + Google OAuth）、參數化查詢（無 SQL Injection 風險）、加密儲存 LINE Token 等良好實踐。但存在 **5 個高風險問題**，其中 **機密洩漏** 與 **HS256 Token 免驗證** 最為緊急，建議立即修復。
