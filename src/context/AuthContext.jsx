import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { loginWithMicrosoft, logout as microsoftLogout } from '../services/authService';
import { setAuthExpiredHandler } from '../services/apiClient';
import { getCurrentUserProfile } from '../services/adminService';
import { AUTH_BYPASS, GOOGLE_CLIENT_ID } from '../config';

const AuthContext = createContext(null);
const EXPIRY_WARN_BUFFER_MS = 2 * 60 * 1000;

const readStoredGoogleSession = () => {
    if (typeof localStorage === 'undefined') {
        return { user: null, expired: false };
    }

    const savedUser = localStorage.getItem('google_user');
    if (!savedUser) return { user: null, expired: false };

    try {
        const user = JSON.parse(savedUser);
        try {
            const decoded = jwtDecode(user.idToken);
            return {
                user: decoded.exp < Date.now() / 1000 ? null : user,
                expired: decoded.exp < Date.now() / 1000,
            };
        } catch {
            return { user: null, expired: true };
        }
    } catch {
        return { user: null, expired: false };
    }
};

export const AuthProvider = ({ children }) => {
    const { instance, accounts } = useMsal();
    const isMsalAuthenticated = useIsAuthenticated();
    const [initialGoogleSession] = useState(readStoredGoogleSession);
    const [googleUser, setGoogleUser] = useState(initialGoogleSession.user);
    const [authExpired, setAuthExpired] = useState(initialGoogleSession.expired);
    const [authExpiredWarning, setAuthExpiredWarning] = useState(false);
    const [msalInitialized, setMsalInitialized] = useState(false);
    const [profile, setProfile] = useState(null);
    const [isProfileLoading, setIsProfileLoading] = useState(false);
    const [profileError, setProfileError] = useState("");

    const isLoading = !msalInitialized;
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

    // 驗證儲存的 Google 登入狀態並設置過期計時器
    useEffect(() => {
        const savedUser = localStorage.getItem('google_user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                if (isTokenExpired(user.idToken)) {
                    googleLogout();
                    localStorage.removeItem('google_user');
                } else {
                    setupExpiryTimer(user.idToken);
                }
            } catch {
                localStorage.removeItem('google_user');
            }
        }
        return () => clearExpiryTimer();
    }, [clearExpiryTimer, isTokenExpired, setupExpiryTimer]);

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

    // 設定 Token 過期處理回呼
    useEffect(() => {
        const handleAuthExpired = () => {
            if (googleUser) {
                googleLogout();
                setGoogleUser(null);
                localStorage.removeItem('google_user');
                setAuthExpired(true);
                return;
            }

            // Microsoft 會保留 MSAL session，顯示重新驗證提示即可。
            setAuthExpiredWarning(true);
        };

        setAuthExpiredHandler(handleAuthExpired);
        return () => setAuthExpiredHandler(null);
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

    useEffect(() => {
        let cancelled = false;

        const loadProfile = async () => {
            await Promise.resolve();
            if (cancelled) return;

            if (!user || isLoading) {
                setProfile(null);
                setProfileError("");
                setIsProfileLoading(false);
                return;
            }

            setIsProfileLoading(true);
            setProfileError("");
            try {
                const data = await getCurrentUserProfile();
                if (cancelled) return;
                setProfile(
                    data?.user
                        ? { ...data.user, modelPolicy: data.modelPolicy || null }
                        : null
                );
            } catch (error) {
                if (cancelled) return;
                setProfile(null);
                setProfileError(error.message || "無法載入使用者設定");
            } finally {
                if (!cancelled) setIsProfileLoading(false);
            }
        };

        loadProfile();

        return () => {
            cancelled = true;
        };
    }, [user, isLoading]);

    const value = {
        user,
        profile,
        isAdmin: profile?.role === "admin",
        isProfileLoading,
        profileError,
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
