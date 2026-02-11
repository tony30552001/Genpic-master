import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App.jsx'
import { msalInstance } from './services/msalClient'

const root = createRoot(document.getElementById('root'));

// 確保 MSAL 初始化完成後再渲染，能夠正確處理 Redirect/Popup 回調
// 確保 MSAL 初始化完成後再渲染
msalInstance.initialize().then(() => {
  const isPopup = window.opener && window.name.includes("msal");
  const hasAuthHash = window.location.hash.includes("code=") || window.location.hash.includes("error=");

  // Debug Info
  console.log("Main.jsx: Initialized. isPopup:", isPopup, "HasOpener:", !!window.opener, "WindowName:", window.name, "Hash:", window.location.hash);

  // 寬鬆判斷：只要有 opener 且不是空的 hash，就假設是 Auth Callback
  if (isPopup || (window.opener && window.location.hash.length > 10)) {
    console.log("Detected popup auth flow. Waiting for main window to process hash.");

    // 關鍵修改：不手動呼叫 handleRedirectPromise，也不主動 close。
    // 在 loginPopup 模式下，主視窗 (Opener) 負責輪詢 Popup 的網址並處理 Hash。
    // 我們只需要保持視窗開啟且不渲染 App 即可。
    // 如果主視窗處理成功，它會自動關閉這個視窗。

    // 渲染一個提示，而不是整個 App
    root.render(
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#333', background: '#f9f9f9' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>驗證成功</h2>
          <p style={{ marginBottom: '2rem' }}>正在將登入資訊傳回主視窗，請稍候...</p>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>如果此視窗超過 10 秒未關閉，請手動關閉並重新整理主頁面。</p>
          <div style={{ fontSize: '0.8rem', color: '#999', padding: '10px', background: '#eee', borderRadius: '4px', marginTop: '20px' }}>
            Debug: Opener {window.opener ? 'Found' : 'Missing'} | Hash Length: {window.location.hash.length}
          </div>
        </div>
      </div>
    );
    return;
  }

  // 正常渲染
  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
});
