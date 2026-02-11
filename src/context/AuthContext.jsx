import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { loginWithMicrosoft, logout as microsoftLogout } from '../services/authService';
import { setAuthExpiredHandler } from '../services/apiClient';
import { AUTH_BYPASS } from '../config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const { instance, accounts } = useMsal();
    const isMsalAuthenticated = useIsAuthenticated();
    const [googleUser, setGoogleUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authExpired, setAuthExpired] = useState(false);
    const [msalInitialized, setMsalInitialized] = useState(false);

    // 初始化 Google 登入狀態 (從 localStorage)
    useEffect(() => {
        const savedUser = localStorage.getItem('google_user');
        if (savedUser) {
            try {
                const user = JSON.parse(savedUser);
                // 檢查 Token 是否已過期
                if (isTokenExpired(user.idToken)) {
                    // Token 已過期，清除登入狀態
                    googleLogout();
                    localStorage.removeItem('google_user');
                    setAuthExpired(true);
                } else {
                    setGoogleUser(user);
                }
            } catch (e) {
                localStorage.removeItem('google_user');
            }
        }
    }, []);

    // 監聽 MSAL 初始化完成
    useEffect(() => {
        // 等待 MSAL 初始化完成（instance 已準備就緒）
        const checkMsalInit = async () => {
            try {
                // MSAL 初始化由 main.jsx 處理，這裡等待一個渲染周期
                // 確保 useIsAuthenticated 已經有正確的初始值
                await new Promise(resolve => setTimeout(resolve, 0));
                setMsalInitialized(true);
            } catch (e) {
                console.error('MSAL 初始化檢查失敗:', e);
                setMsalInitialized(true);
            }
        };
        checkMsalInit();
    }, []);

    // 當 Google 或 MSAL 任一載入完成時，設定 isLoading 為 false
    useEffect(() => {
        if (msalInitialized) {
            setIsLoading(false);
        }
    }, [msalInitialized]);

    // 設定 Token 過期處理回呼
    useEffect(() => {
        setAuthExpiredHandler(() => {
            // 清除 Google 登入狀態
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

    // 檢查 Token 是否過期的輔助函數
    const isTokenExpired = (token) => {
        try {
            const decoded = jwtDecode(token);
            const currentTime = Date.now() / 1000;
            return decoded.exp < currentTime;
        } catch (e) {
            return true;
        }
    };

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
        setAuthExpired(false); // 清除過期標記
    }, []);

    const handleLogout = useCallback(async () => {
        if (googleUser) {
            googleLogout();
            setGoogleUser(null);
            localStorage.removeItem('google_user');
        } else {
            await microsoftLogout();
        }
        setAuthExpired(false);
    }, [googleUser]);

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
        authExpired,  // 新增：讓呼叫端知道認證已過期
        handleMicrosoftLogin: loginWithMicrosoft,
        handleGoogleLoginSuccess,
        handleLogout,
        isAuthenticated: !!user
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuthContext must be used within AuthProvider');
    return context;
};
