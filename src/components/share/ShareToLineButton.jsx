import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Share2, CheckCircle, AlertCircle } from "lucide-react";
import useLineConfig from "../../hooks/useLineConfig";
import { sendImageToLine } from "../../services/lineService";
import { uploadFileToBlob } from "../../services/storageService";

const LINE_GREEN = "#06C755"; // Official LINE brand color

// Convert base64 data URI to File
const dataURLtoFile = (dataurl, filename) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

export default function ShareToLineButton({ imageUrl, message, user, className = "" }) {
    const { isBound, config } = useLineConfig({ user });
    const [status, setStatus] = useState("idle"); // "idle" | "loading" | "success" | "error"
    const [errorMsg, setErrorMsg] = useState("");

    const handleShare = useCallback(async () => {
        if (!imageUrl) return;
        setStatus("loading");
        setErrorMsg("");

        try {
            let finalImageUrl = imageUrl;
            let fileToShare = null;

            // 先產生 fileToShare，供原生分享以及 Blob 上傳使用
            if (imageUrl.startsWith("data:")) {
                const mimeMatch = imageUrl.match(/data:([^;]+);/);
                const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
                const ext = mimeType.split("/")[1] || "png";
                fileToShare = dataURLtoFile(imageUrl, `share-to-line-${Date.now()}.${ext}`);
            }

            // [新增] 如果是「個人分享」(Track B) 且裝置支援原生的圖片分享 (Web Share API)
            // 這樣會直接呼叫系統的分享選單（如 iOS Share Sheet），能直接將圖檔拋給 LINE App，不需只傳網址
            if (!isBound && fileToShare && navigator.canShare && navigator.canShare({ files: [fileToShare] })) {
                try {
                    await navigator.share({
                        files: [fileToShare],
                        text: message || 'GenPic 圖片分享',
                    });
                    // 手機原生分享成功
                    setStatus("success");
                    setTimeout(() => setStatus("idle"), 3000);
                    return;
                } catch (shareErr) {
                    // 若使用者自己取消 (AbortError) 就直接中止
                    if (shareErr.name === 'AbortError') {
                        setStatus("idle");
                        return;
                    }
                    // 其他不明錯誤則無縫退回舊版網址分享流程
                    console.warn("Native share failed, falling back to URL share", shareErr);
                }
            }

            // ==== 以下為舊版 (或 Track A) 分享流程 ====
            // 如果圖片是 base64 string，必須先上傳到雲端，因為 LINE 分享需要公開的 HTTP/HTTPS URL
            if (imageUrl.startsWith("data:")) {
                try {
                    const uploadResult = await uploadFileToBlob(fileToShare, "uploads"); // uploading to uploads container
                    finalImageUrl = uploadResult.readUrl || uploadResult.url;
                } catch (uploadErr) {
                    throw new Error("上傳圖片準備分享失敗: " + uploadErr.message);
                }
            }

            const result = await sendImageToLine(finalImageUrl, message);

            // Track B fallback: open LINE share URL in new tab automatically
            if (result && result.track === "liff_fallback" && result.url) {
                window.open(result.url, "_blank", "noopener,noreferrer");
                setStatus("success");
                setTimeout(() => setStatus("idle"), 3000);
                return;
            }

            if (result && result.success) {
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
                    ? "處理中…"
                    : isSuccess
                        ? "已分享！"
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

