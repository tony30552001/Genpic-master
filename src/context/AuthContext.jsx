import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { loginWithMicrosoft, logout as microsoftLogout } from '../services/authService';
import { AUTH_BYPASS } from '../config';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const { instance, accounts } = useMsal();
    const isMsalAuthenticated = useIsAuthenticated();
    const [googleUser, setGoogleUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 初始化 Google 登入狀態 (從 localStorage)
    useEffect(() => {
        const savedUser = localStorage.getItem('google_user');
        if (savedUser) {
            try {
                setGoogleUser(JSON.parse(savedUser));
            } catch (e) {
                localStorage.removeItem('google_user');
            }
        }
        setIsLoading(false);
    }, []);

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
    }, []);

    const handleLogout = useCallback(async () => {
        if (googleUser) {
            googleLogout();
            setGoogleUser(null);
            localStorage.removeItem('google_user');
        } else {
            await microsoftLogout();
        }
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
