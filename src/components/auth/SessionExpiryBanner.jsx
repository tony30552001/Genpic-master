import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import useAuth from "@/hooks/useAuth";

/**
 * SessionExpiryBanner — 登入即將/已過期的非阻斷式重新登入提示
 * 當 authExpiredWarning 為 true 時顯示 sticky 橫幅，讓使用者在原頁面重新登入。
 */
export default function SessionExpiryBanner() {
  const {
    authExpiredWarning,
    dismissAuthExpiredWarning,
    handleGoogleLoginSuccess,
    handleMicrosoftLogin,
  } = useAuth();

  if (!authExpiredWarning) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-sm text-amber-900 shadow-sm dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-200"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-500" />

      <span className="flex-1 font-medium">
        您的登入已過期，請重新登入以繼續使用
      </span>

      {/* Google 重新登入 */}
      <div className="shrink-0 [&>div]:!m-0">
        <GoogleLogin
          onSuccess={(credentialResponse) => {
            handleGoogleLoginSuccess(credentialResponse);
          }}
          onError={() => console.warn("[SessionExpiryBanner] Google re-login failed")}
          theme="outline"
          shape="rect"
          size="small"
          text="signin_with"
          width="160"
        />
      </div>

      {/* Microsoft 重新登入 */}
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-8 gap-1.5 border-amber-300 bg-white/80 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
        onClick={handleMicrosoftLogin}
      >
        <svg className="size-3.5" viewBox="0 0 23 23" aria-hidden="true">
          <path fill="#f3f3f3" d="M0 0h23v23H0z" />
          <path fill="#f35325" d="M1 1h10v10H1z" />
          <path fill="#81bc06" d="M12 1h10v10H12z" />
          <path fill="#05a6f0" d="M1 12h10v10H1z" />
          <path fill="#ffba08" d="M12 12h10v10H12z" />
        </svg>
        Microsoft
      </Button>

      {/* 稍後（dismiss） */}
      <button
        type="button"
        aria-label="稍後再說"
        onClick={dismissAuthExpiredWarning}
        className="shrink-0 rounded p-1 text-amber-600 hover:bg-amber-100 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:text-amber-400 dark:hover:bg-amber-800"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
