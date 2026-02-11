import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'
import { msalInstance } from './services/msalClient'
import { GOOGLE_CLIENT_ID } from './config'
import { AuthProvider } from './context/AuthContext'

const root = createRoot(document.getElementById('root'));

// 確保 MSAL 初始化完成後再渲染
msalInstance.initialize().then(() => {
  // 處理 Redirect 流程回傳的結果
  msalInstance.handleRedirectPromise().then((response) => {
    if (response) {
      // Redirect 登入成功，設定活躍帳號
      msalInstance.setActiveAccount(response.account);
    }
  }).catch((error) => {
    console.error('MSAL Redirect 處理失敗:', error);
  });

  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </GoogleOAuthProvider>
      </MsalProvider>
    </StrictMode>,
  );
});
