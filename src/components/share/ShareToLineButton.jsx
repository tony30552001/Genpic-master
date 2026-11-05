import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Share2,
} from "@/components/icons/lucideControls";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
} from "@/components/icons/lucideStatus";
import useLineConfig from "../../hooks/useLineConfig";
import { API_BASE_URL } from "../../config";
import { sendImageToLine } from "../../services/lineService";
import { apiGetBlob } from "../../services/apiClient";
import { uploadFile } from "../../services/storageService";
import { Settings2 } from "@/components/icons/lucideContent";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import LineSettings from "./LineSettings";

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

export default function ShareToLineButton({ imageUrl, user, message, className = "" }) {
    const lineConfig = useLineConfig({ user });
    const { isBound } = lineConfig;
    const [isBindingOpen, setIsBindingOpen] = useState(false);
    const [status, setStatus] = useState("idle"); // "idle" | "loading" | "success" | "error"
    const [errorMsg, setErrorMsg] = useState("");

    const handleShare = useCallback(async () => {
        if (!imageUrl) return;

        if (!isBound) {
            setIsBindingOpen(true);
            return;
        }
        setStatus("loading");
        setErrorMsg("");

        try {
            let fileToShare;
            if (imageUrl.startsWith("data:")) {
                const mimeMatch = imageUrl.match(/^data:([^;]+);/);
                const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
                const ext = mimeType.split("/")[1] || "png";
                fileToShare = dataURLtoFile(
                    imageUrl,
                    `share-to-line-${Date.now()}.${ext}`
                );
            } else if (imageUrl.startsWith(`${API_BASE_URL}/image-jobs/`)) {
                const blob = await apiGetBlob(imageUrl);
                const mimeType = blob.type || "image/png";
                fileToShare = new File([blob], `share-to-line-${Date.now()}.${mimeType.split("/")[1] || "png"}`, { type: mimeType });
            } else {
                throw new Error("只能分享已產生的圖片，請重新產生圖片後再試。");
            }
            const uploadResult = await uploadFile(fileToShare, "image");
            if (!uploadResult?.uploadId) {
                throw new Error("上傳圖片準備分享失敗，請稍後再試。");
            }

            const result = await sendImageToLine({
                uploadId: uploadResult.uploadId,
                message,
            });

            if (result && result.success) {
                setStatus("success");
                setTimeout(() => setStatus("idle"), 3000);
            }
        } catch (err) {
            setErrorMsg(err.message);
            setStatus("error");
            setTimeout(() => setStatus("idle"), 4000);
        }
    }, [imageUrl, isBound, message]);

    const isLoading = status === "loading";
    const label = {
        loading: "處理中…",
        success: "已分享！",
        error: "發送失敗",
    }[status] || "分享到 LINE";
    const StatusIcon = {
        loading: Loader2,
        success: CheckCircle,
        error: AlertCircle,
    }[status] || Share2;

    return (
        <div className={cn("relative flex items-center", className)}>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={!imageUrl || isLoading}
                onClick={handleShare}
                aria-label={label}
                title={label}
                className="size-9 rounded-[10px] [&_svg]:size-[18px]"
                style={{ color: status === "error" ? undefined : LINE_GREEN }}
            >
                <StatusIcon className={cn(isLoading && "animate-spin", status === "error" && "text-destructive")} aria-hidden="true" />
            </Button>

            {isBound && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsBindingOpen(true)}
                    aria-label="管理 LINE 綁定"
                    title="管理 LINE 綁定"
                    className="size-9 rounded-[10px] text-muted-foreground"
                >
                    <Settings2 className="icon-sm" aria-hidden="true" />
                </Button>
            )}

            {status === "error" && errorMsg && (
                <p role="alert" className="absolute right-0 top-full z-20 mt-1 w-60 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-destructive shadow-lg">
                    {errorMsg}
                </p>
            )}

            <Dialog open={isBindingOpen} onOpenChange={setIsBindingOpen}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <LineSettings useLineConfigHook={lineConfig} />
                </DialogContent>
            </Dialog>
        </div>
    );
}