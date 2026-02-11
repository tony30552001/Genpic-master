import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App.jsx'
import { msalInstance } from './services/msalClient'

const root = createRoot(document.getElementById('root'));

// 避免在彈出視窗 (Popup) 中重複渲染整個應用程式
// 這是 MSAL 處理登入回調的標準做法
if (!window.opener) {
  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
} else {
  console.log("Running in popup - skipping app render to let MSAL process hash");
}
