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
    console.log("Detected popup auth flow. Attempting to handle redirect and close.");

    // 嘗試手動處理 (雖然 MsalProvider 也會做，但我們想攔截渲染)
    msalInstance.handleRedirectPromise().then((tokenResponse) => {
      console.log("HandleRedirectPromise done:", tokenResponse);
      if (tokenResponse || window.location.hash.includes("code=")) {
        // 成功處理或仍有 hash，嘗試關閉
        // 注意：如果 opener 遺失，window.close 可能無效，但通常在同源下有效
        window.close();
      }
    }).catch(e => console.error("Redirect Error:", e));

    // 渲染一個「正在登入」的提示，而不是整個 App
    root.render(
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#333', background: '#f9f9f9' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>正在驗證身分...</h2>
          <p style={{ marginBottom: '2rem' }}>視窗將在驗證完成後自動關閉。</p>
          <div style={{ fontSize: '0.8rem', color: '#999', padding: '10px', background: '#eee', borderRadius: '4px' }}>
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
