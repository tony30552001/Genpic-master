import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { LogIn, Mail, ShieldCheck } from "lucide-react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
    const { user, handleMicrosoftLogin, handleGoogleLoginSuccess, isAuthenticated, isLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const from = location.state?.from?.pathname || "/";

    // 如果已登入，直接跳轉
    if (isAuthenticated) {
        return <Navigate to={from} replace />;
    }

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] relative overflow-hidden">
            {/* 裝飾性背景元素 */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100/50 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-100/50 rounded-full blur-[120px] pointer-events-none" />

            <Card className="w-full max-w-md shadow-2xl border-white/40 bg-white/80 backdrop-blur-xl relative z-10 transition-all hover:shadow-blue-200/50">
                <CardHeader className="space-y-2 text-center pb-8">
                    <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 mb-4 transform -rotate-3 hover:rotate-0 transition-transform duration-300">
                        <LogIn className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">歡迎回到 GenPic</CardTitle>
                    <CardDescription className="text-slate-500 font-medium">請選擇您的登入方式</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Microsoft Login */}
                    <Button
                        variant="outline"
                        className="w-full h-12 text-base font-semibold border-slate-200 hover:bg-slate-50 hover:border-slate-300 gap-3 transition-all active:scale-[0.98]"
                        onClick={handleMicrosoftLogin}
                    >
                        <svg className="w-5 h-5" viewBox="0 0 23 23">
                            <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                            <path fill="#f35325" d="M1 1h10v10H1z" />
                            <path fill="#81bc06" d="M12 1h10v10H12z" />
                            <path fill="#05a6f0" d="M1 12h10v10H1z" />
                            <path fill="#ffba08" d="M12 12h10v10H12z" />
                        </svg>
                        使用 Microsoft 帳號登入
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white/0 px-2 text-slate-400 font-medium backdrop-blur-sm">或</span>
                        </div>
                    </div>

                    {/* Google Login Wrapper */}
                    <div className="flex justify-center flex-col items-center gap-3">
                        <div className="w-full [&>div]:!w-full [&>div]:!flex [&>div]:!justify-center">
                            <GoogleLogin
                                onSuccess={handleGoogleLoginSuccess}
                                onError={() => console.log('Login Failed')}
                                theme="filled_blue"
                                shape="rect"
                                width="100%"
                                text="signin_with"
                            />
                        </div>
                    </div>

                    <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-xs font-medium">
                        <ShieldCheck className="w-4 h-4" />
                        <span>您的隱私與安全受 SSO 協定保護</span>
                    </div>
                </CardContent>
            </Card>

            {/* 底部文字 */}
            <p className="absolute bottom-8 left-0 right-0 text-center text-slate-400 text-sm">
                &copy; 2026 GenPic Master. All rights reserved.
            </p>
        </div>
    );
}
