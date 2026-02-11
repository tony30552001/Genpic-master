import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App.jsx'
import { msalInstance } from './services/msalClient'

const root = createRoot(document.getElementById('root'));

// 確保 MSAL 初始化完成後再渲染，能夠正確處理 Redirect/Popup 回調
msalInstance.initialize().then(() => {
  // 檢查是否為 Popup Authentication (有 opener 且網址帶有 hash)
  // 如果是，我們不渲染完整的 App，以免干擾 MSAL 處理 Hash
  if (window.opener && window.name.includes('msal')) {
    console.log("Running in MSAL Popup - keeping hash for processing");
    return; // 直接結束，什麼都不渲染，或渲染一個簡單的 Loading
  }

  // 雙重檢查：有時候 window.name 不準，檢查 hash
  if (window.opener && (window.location.hash.includes('code=') || window.location.hash.includes('error='))) {
    console.log("Detected auth callback in popup. Rendering closer.");
    root.render(
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#666' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>正在完成登入...</h2>
          <p>請稍候，視窗將自動關閉。</p>
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
