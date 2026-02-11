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
  // 正常渲染
  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
});
