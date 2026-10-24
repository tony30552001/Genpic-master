import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
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
    const isSuccess = status === "success";
    const isError = status === "error";

    return (
        <div className={`flex flex-wrap items-center gap-1 ${className}`}>
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
                    <Loader2 className="icon-sm mr-2 animate-spin" />
                ) : isSuccess ? (
                    <CheckCircle className="icon-sm mr-2 text-green-600" />
                ) : isError ? (
                    <AlertCircle className="icon-sm mr-2" />
                ) : (
                    <Share2 className="icon-sm mr-2" />
                )}

                {isLoading
                    ? "處理中…"
                    : isSuccess
                        ? "已分享！"
                        : isError
                            ? "發送失敗"
                            : "分享到 LINE"}


            </Button>

            {isBound && (
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsBindingOpen(true)}
                    aria-label="管理 LINE 綁定"
                >
                    <Settings2 className="icon-sm" aria-hidden="true" />
                </Button>
            )}

            {isError && errorMsg && (
                <p className="basis-full text-xs text-destructive mt-0.5">{errorMsg}</p>
            )}

            <Dialog open={isBindingOpen} onOpenChange={setIsBindingOpen}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <LineSettings useLineConfigHook={lineConfig} />
                </DialogContent>
            </Dialog>
        </div>
    );
}

