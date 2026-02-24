/**
 * ShareToLineButton.jsx
 *
 * Smart LINE share button — automatically picks the optimal track:
 * - Track A (Bot Push): user has a bound LINE Official Account
 * - Track B (LIFF):    user uses personal LINE account via shareTargetPicker
 *
 * Usage:
 *   <ShareToLineButton imageUrl={url} user={user} />
 */

import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Share2, CheckCircle, AlertCircle } from "lucide-react";
import useLineConfig from "../../hooks/useLineConfig";
import { sendImageToLine } from "../../services/lineService";

const LINE_GREEN = "#06C755"; // Official LINE brand color

export default function ShareToLineButton({ imageUrl, message, user, className = "" }) {
    const { isBound, config } = useLineConfig({ user });
    const [status, setStatus] = useState("idle"); // "idle" | "loading" | "success" | "error"
    const [errorMsg, setErrorMsg] = useState("");

    const handleShare = useCallback(async () => {
        if (!imageUrl) return;
        setStatus("loading");
        setErrorMsg("");

        try {
            const result = await sendImageToLine(imageUrl, message);
            if (result.success) {
                setStatus("success");
                setTimeout(() => setStatus("idle"), 3000);
            } else {
                // LIFF shareTargetPicker was cancelled by user
                setStatus("idle");
            }
        } catch (err) {
            setErrorMsg(err.message);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 4000);
        }
    }, [imageUrl, message]);

    const isLoading = status === "loading";
    const isSuccess = status === "success";
    const isError = status === "error";

    return (
        <div className={`flex flex-col items-start gap-1 ${className}`}>
            <Button
                disabled={!imageUrl || isLoading}
                onClick={handleShare}
                className="relative"
                style={{
                    backgroundColor: isSuccess ? undefined : LINE_GREEN,
                    borderColor: isSuccess ? undefined : LINE_GREEN,
                    color: "#fff",
                }}
                variant={isSuccess ? "secondary" : "default"}
            >
                {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : isSuccess ? (
                    <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                ) : isError ? (
                    <AlertCircle className="w-4 h-4 mr-2" />
                ) : (
                    <Share2 className="w-4 h-4 mr-2" />
                )}

                {isLoading
                    ? "發送中…"
                    : isSuccess
                        ? "已發送！"
                        : isError
                            ? "發送失敗"
                            : "分享到 LINE"}

                {/* Track Badge */}
                {!isLoading && !isSuccess && !isError && (
                    <Badge
                        variant="outline"
                        className="ml-2 text-[10px] border-white/40 text-white"
                    >
                        {isBound
                            ? `Bot → ${config?.channelName || "官方帳號"}`
                            : "個人分享"}
                    </Badge>
                )}
            </Button>

            {isError && errorMsg && (
                <p className="text-xs text-destructive mt-0.5">{errorMsg}</p>
            )}
        </div>
    );
}
