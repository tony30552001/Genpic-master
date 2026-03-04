/**
 * URL 安全白名單驗證模組
 *
 * 防護目標: SSRF (Server-Side Request Forgery)
 * 攻擊情境: 攻擊者傳入 http://169.254.169.254/... (Azure IMDS) 竊取雲端 Managed Identity Token
 *           或掃描內部網路服務 (10.x, 192.168.x 等私有 IP)
 *
 * 防護策略:
 *   1. 只允許 HTTPS 協定
 *   2. 封鎖所有私有/保留 IP 範圍（包含 IPv4 & IPv6）
 *   3. 白名單限制：只允許自家 Azure Blob Storage hostname
 */

/** 封鎖的 IP 範圍（Regex） */
const BLOCKED_IP_PATTERNS = [
    /^127\./,                     // IPv4 Loopback
    /^10\./,                      // IPv4 私有 A 類
    /^172\.(1[6-9]|2\d|3[01])\./, // IPv4 私有 B 類
    /^192\.168\./,                // IPv4 私有 C 類
    /^169\.254\./,                // IPv4 Link-local / Azure IMDS ← 最關鍵封鎖點
    /^0\./,                       // IPv4 This network
    /^fc00:/i,                    // IPv6 Unique Local Address
    /^fe80:/i,                    // IPv6 Link-local
    /^::1$/,                      // IPv6 Loopback
    /^::$/,                       // IPv6 Unspecified
    /^localhost$/i,               // localhost hostname
];

/**
 * 判斷 URL 是否在允許的白名單內
 *
 * @param {string} urlString - 待驗證的 URL 字串
 * @returns {boolean} true 表示允許，false 表示拒絕
 */
const isUrlAllowed = (urlString) => {
    if (!urlString || typeof urlString !== "string") return false;

    let url;
    try {
        url = new URL(urlString);
    } catch {
        // 無法解析的 URL 視為不合法
        return false;
    }

    // 規則 1: 只允許 HTTPS（生產環境）
    // 開發環境若需要 HTTP，可透過 ALLOW_HTTP_URLS=true 環境變數暫時放寬
    const allowHttp = process.env.ALLOW_HTTP_URLS === "true" && process.env.NODE_ENV !== "production";
    if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
        return false;
    }

    const hostname = url.hostname;

    // 規則 2: 封鎖所有私有/保留 IP 範圍
    if (BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
        return false;
    }

    // 規則 3: 白名單 — 只允許自家 Azure Blob Storage
    const storageAccount = process.env.AZURE_STORAGE_ACCOUNT;
    if (storageAccount) {
        const allowedHost = `${storageAccount}.blob.core.windows.net`;
        if (hostname !== allowedHost) {
            return false;
        }
    }
    // 若未設定 AZURE_STORAGE_ACCOUNT（不應發生在生產環境），
    // 僅依賴 IP 封鎖規則作為基本防護

    return true;
};

module.exports = { isUrlAllowed };
