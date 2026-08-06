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

const renderApp = () => {
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
};

const bootstrap = async () => {
  try {
    await msalInstance.initialize();

    // 完成 redirect callback 後再渲染，避免重載時短暫判定為未登入。
    const response = await msalInstance.handleRedirectPromise();
    const account =
      response?.account ||
      msalInstance.getActiveAccount() ||
      msalInstance.getAllAccounts()[0];

    if (account) {
      msalInstance.setActiveAccount(account);
    }
  } catch (error) {
    console.error('MSAL 初始化或 Redirect 處理失敗:', error);
  }

  renderApp();
};

void bootstrap();
