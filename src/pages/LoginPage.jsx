import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { AlertCircle, Lock } from "@/components/icons/lucideStatus";
import LoginShaderBackground from "@/components/auth/LoginShaderBackground";
import MicrosoftMark from "@/components/icons/MicrosoftMark";
import PixoraMark from "@/components/icons/PixoraMark";
import { useLocation, Navigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

function ResponsiveGoogleLogin({ onSuccess, onError }) {
    const containerRef = useRef(null);
    const [buttonWidth, setButtonWidth] = useState(240);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateWidth = () => {
            const width = Math.floor(container.getBoundingClientRect().width);
            setButtonWidth(Math.min(400, Math.max(200, width)));
        };

        updateWidth();

        if (typeof ResizeObserver !== "function") return;
        const observer = new ResizeObserver(updateWidth);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={containerRef} className="flex w-full justify-center overflow-hidden">
            <GoogleLogin
                onSuccess={onSuccess}
                onError={onError}
                type="standard"
                theme="outline"
                size="large"
                shape="rectangular"
                text="continue_with"
                logo_alignment="left"
                width={String(buttonWidth)}
                locale="zh-TW"
            />
        </div>
    );
}

function LoginLoadingState() {
    return (
        <main className="login-light-theme relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#83cbea] px-5 py-12 text-foreground sm:px-8">
            <LoginShaderBackground />
            <section className="login-glass-panel relative z-10 w-full max-w-[27rem] rounded-2xl p-7 sm:p-9">
                <div
                    className="space-y-7"
                    role="status"
                    aria-label="正在確認登入狀態"
                >
                    <div className="space-y-3">
                        <div className="h-12 w-12 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
                        <div className="h-8 w-44 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                        <div className="h-5 w-64 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
                    </div>
                    <div className="space-y-3">
                        <div className="h-10 animate-pulse rounded-[4px] bg-muted motion-reduce:animate-none" />
                        <div className="h-10 animate-pulse rounded-[4px] bg-muted motion-reduce:animate-none" />
                    </div>
                </div>
            </section>
        </main>
    );
}

export default function LoginPage() {
    const {
        handleMicrosoftLogin,
        handleGoogleLoginSuccess,
        isAuthenticated,
        isLoading,
        authExpired,
        profileError,
    } = useAuth();
    const location = useLocation();
    const [googleLoginError, setGoogleLoginError] = useState("");

    const from = location.state?.from?.pathname || "/";

    if (isAuthenticated) {
        return <Navigate to={from} replace />;
    }

    if (isLoading) {
        return <LoginLoadingState />;
    }

    const authError =
        profileError ||
        googleLoginError ||
        (authExpired ? "您的登入已過期，請重新登入以繼續使用" : "");

    const handleGoogleSuccess = (response) => {
        setGoogleLoginError("");
        handleGoogleLoginSuccess(response);
    };

    return (
        <main className="login-light-theme relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#83cbea] px-5 py-12 text-foreground sm:px-8">
            <LoginShaderBackground />

            <section className="login-glass-panel relative z-10 w-full max-w-[27rem] rounded-2xl p-7 animate-in fade-in-0 zoom-in-95 duration-500 motion-reduce:animate-none sm:p-9">
                <div className="mb-8">
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                            <PixoraMark className="h-7 w-7" title="Pixora" />
                        </div>
                        <div>
                            <p className="font-semibold tracking-tight text-foreground">Pixora 智繪</p>
                            <p className="text-xs text-muted-foreground">AI 智能視覺創作平台</p>
                        </div>
                    </div>

                    <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground sm:text-[2rem]">
                        繼續你的創作
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        登入後即可存取專案、範本與生成紀錄。
                    </p>
                </div>

                <div className="space-y-4">
                    {authError && (
                        <Alert variant="destructive" className="bg-destructive/5">
                            <AlertCircle className="icon-sm" />
                            <AlertDescription>
                                {authError}
                            </AlertDescription>
                        </Alert>
                    )}

                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full gap-3 rounded-[4px] border-input bg-background text-sm font-semibold shadow-sm transition-[background-color,border-color,transform,box-shadow] hover:border-foreground/20 hover:bg-muted/60 hover:shadow-md active:scale-[0.985] motion-reduce:transform-none"
                        onClick={handleMicrosoftLogin}
                    >
                        <MicrosoftMark className="h-5 w-5" />
                        使用 Microsoft 帳號繼續
                    </Button>

                    <div className="flex items-center gap-3" aria-hidden="true">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground">或</span>
                        <span className="h-px flex-1 bg-border" />
                    </div>

                    <ResponsiveGoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setGoogleLoginError("Google 登入失敗，請稍後再試")}
                    />
                </div>

                <div className="mt-8 flex items-start gap-2.5 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
                    <Lock className="icon-sm mt-0.5" />
                    <p>登入流程由 Microsoft Entra ID 或 Google 安全驗證。</p>
                </div>
            </section>
        </main>
    );
}
