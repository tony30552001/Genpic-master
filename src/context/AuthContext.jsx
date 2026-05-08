import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { loginWithMicrosoft, logout as microsoftLogout } from '../services/authService';
import { setAuthExpiredHandler } from '../services/apiClient';
import { AUTH_BYPASS, GOOGLE_CLIENT_ID } from '../config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const { instance, accounts } = useMsal();
    const isMsalAuthenticated = useIsAuthenticated();
    const [googleUser, setGoogleUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authExpired, setAuthExpired] = useState(false);
    const [authExpiredWarning, setAuthExpiredWarning] = useState(false);
    const [msalInitialized, setMsalInitialized] = useState(false);

    const EXPIRY_WARN_BUFFER_MS = 2 * 60 * 1000;
    const expiryTimerRef = useRef(null);
    // Stable ref to latest handleGoogleLoginSuccess — avoids circular deps in tryGoogleSilentRefresh
    const handleGoogleLoginSuccessRef = useRef(null);

    const clearExpiryTimer = useCallback(() => {
        if (expiryTimerRef.current) {
            clearTimeout(expiryTimerRef.current);
            expiryTimerRef.current = null;
        }
    }, []);

    // 檢查 Token 是否過期
    const isTokenExpired = useCallback((token) => {
        try {
            const decoded = jwtDecode(token);
            return decoded.exp < Date.now() / 1000;
        } catch {
            return true;
        }
    }, []);

    /**
     * Google One Tap 靜默刷新
     * 當使用者瀏覽器有活躍 Google session 且只有單一帳號時，
     * auto_select: true 會在完全無 UI 的情況下自動刷新 token。
     * 失敗時 resolve(false)，由呼叫端決定是否顯示警告 banner。
     */
    const tryGoogleSilentRefresh = useCallback(() => {
        return new Promise((resolve) => {
            const googleApi = window.google?.accounts?.id;
            if (!googleApi || !GOOGLE_CLIENT_ID) { resolve(false); return; }

            let resolved = false;
            const safeResolve = (val) => {
                if (!resolved) { resolved = true; resolve(val); }
            };

            googleApi.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (response) => {
                    if (response?.credential) {
                        console.log('[Auth] Google One Tap 靜默刷新成功');
                        handleGoogleLoginSuccessRef.current?.(response);
                        safeResolve(true);
                    } else {
                        safeResolve(false);
                    }
                },
                auto_select: true,
                cancel_on_tap_outside: false,
            });

            googleApi.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    console.debug('[Auth] Google One Tap 靜默刷新未執行:',
                        notification.getNotDisplayedReason?.() ?? notification.getSkippedReason?.());
                    safeResolve(false);
                }
                if (notification.isDismissedMoment?.()) {
                    safeResolve(false);
                }
            });

            // 8 秒超時保護，避免 Promise 永遠懸空
            setTimeout(() => safeResolve(false), 8000);
        });
    }, []); // stable — 僅讀取 ref，不依賴任何 state

    // 設置 Google Token 過期計時器
    const setupExpiryTimer = useCallback((token) => {
        clearExpiryTimer();
        try {
            const decoded = jwtDecode(token);
            const expiresAtMs = decoded.exp * 1000;
            const timeUntilExpiry = expiresAtMs - Date.now() - EXPIRY_WARN_BUFFER_MS;

            if (timeUntilExpiry <= 0) {
                // 已過期：嘗試靜默刷新，失敗才顯示警告 banner
                tryGoogleSilentRefresh().then((ok) => {
                    if (!ok) setAuthExpiredWarning(true);
                });
                return false;
            }

            expiryTimerRef.current = setTimeout(async () => {
                console.warn('[Auth] Google Token 即將過期，嘗試靜默刷新...');
                const ok = await tryGoogleSilentRefresh();
                if (!ok) {
                    console.warn('[Auth] 靜默刷新失敗，顯示重新登入提示');
                    setAuthExpiredWarning(true);
                }
            }, timeUntilExpiry);

            console.log(`[Auth] Google Token 過期計時器已設定，${Math.round(timeUntilExpiry / 1000 / 60)} 分鐘後觸發`);
            return true;
        } catch {
            return false;
        }
    }, [clearExpiryTimer, tryGoogleSilentRefresh]);

    // 初始化 Google 登入狀態 (從 localStorage) 並設置過期計時器
    useEffect(() => {
        const savedUser = localStorage.getItem('google_user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (isTokenExpired(user.idToken)) {
                    googleLogout();
                    localStorage.removeItem('google_user');
                    setAuthExpired(true);
                } else {
                    setGoogleUser(user);
                    setupExpiryTimer(user.idToken);
                }
            } catch {
                localStorage.removeItem('google_user');
            }
        }
        return () => clearExpiryTimer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 監聽 MSAL 初始化完成
    useEffect(() => {
        const checkMsalInit = async () => {
            try {
                await new Promise(resolve => setTimeout(resolve, 0));
                setMsalInitialized(true);
            } catch (e) {
                console.error('MSAL 初始化檢查失敗:', e);
                setMsalInitialized(true);
            }
        };
        checkMsalInit();
    }, []);

    useEffect(() => {
        if (msalInitialized) setIsLoading(false);
    }, [msalInitialized]);

    // 設定 Token 過期處理回呼
    useEffect(() => {
        setAuthExpiredHandler(() => {
            if (googleUser) {
                googleLogout();
                setGoogleUser(null);
                localStorage.removeItem('google_user');
            }
            setAuthExpired(true);
        });
    }, [googleUser]);

    // MSAL 自動設定活躍帳號
    useEffect(() => {
        if (AUTH_BYPASS) return;
        if (!instance.getActiveAccount() && accounts.length > 0) {
            instance.setActiveAccount(accounts[0]);
        }
    }, [accounts, instance]);

    const handleGoogleLoginSuccess = useCallback((credentialResponse) => {
        const decoded = jwtDecode(credentialResponse.credential);
        const user = {
            displayName: decoded.name,
            email: decoded.email,
            photoURL: decoded.picture,
            isAnonymous: false,
            authType: 'google',
            idToken: credentialResponse.credential
        };
        setGoogleUser(user);
        localStorage.setItem('google_user', JSON.stringify(user));
        setAuthExpired(false);
        setAuthExpiredWarning(false);
        setupExpiryTimer(credentialResponse.credential);
    }, [setupExpiryTimer]);

    // handleGoogleLoginSuccessRef 保持與最新的 handleGoogleLoginSuccess 同步
    useEffect(() => {
        handleGoogleLoginSuccessRef.current = handleGoogleLoginSuccess;
    }, [handleGoogleLoginSuccess]);

    const handleLogout = useCallback(async () => {
        clearExpiryTimer();
        if (googleUser) {
            googleLogout();
            setGoogleUser(null);
            localStorage.removeItem('google_user');
        } else {
            await microsoftLogout();
        }
        setAuthExpired(false);
        setAuthExpiredWarning(false);
    }, [googleUser, clearExpiryTimer]);

    const dismissAuthExpiredWarning = useCallback(() => {
        setAuthExpiredWarning(false);
    }, []);

    // Tab 重新 visible 時主動偵測 token，嘗試靜默刷新
    useEffect(() => {
        const onVisibilityChange = async () => {
            if (document.visibilityState !== 'visible') return;
            const savedUser = localStorage.getItem('google_user');
            if (!savedUser) return;
            try {
                const { idToken } = JSON.parse(savedUser);
                if (idToken && isTokenExpired(idToken)) {
                    console.warn('[Auth] Tab 回到前景，偵測到 token 已過期，嘗試靜默刷新...');
                    const ok = await tryGoogleSilentRefresh();
                    if (!ok) setAuthExpiredWarning(true);
                }
            } catch {
                // ignore parse errors
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [isTokenExpired, tryGoogleSilentRefresh]);

    const user = React.useMemo(() => {
        if (AUTH_BYPASS) {
            return {
                displayName: "Local Dev",
                email: "local.dev@example.com",
                photoURL: null,
                isAnonymous: true,
                authType: 'bypass'
            };
        }
        if (googleUser) return googleUser;
        if (isMsalAuthenticated && accounts.length > 0) {
            const account = accounts[0];
            return {
                displayName: account.name || account.username,
                email: account.username,
                photoURL: null,
                isAnonymous: false,
                authType: 'microsoft'
            };
        }
        return null;
    }, [isMsalAuthenticated, accounts, googleUser]);

    const value = {
        user,
        isLoading,
        authExpired,
        authExpiredWarning,
        dismissAuthExpiredWarning,
        handleMicrosoftLogin: loginWithMicrosoft,
        handleGoogleLoginSuccess,
        handleLogout,
        isAuthenticated: !!user
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuthContext must be used within AuthProvider');
    return context;
};
