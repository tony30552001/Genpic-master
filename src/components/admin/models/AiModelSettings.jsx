import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check } from "@/components/icons/lucideStatus";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import useAuth from "@/hooks/useAuth";
import useImageModelAdmin from "@/hooks/useImageModelAdmin";
import useLlmModelAdmin from "@/hooks/useLlmModelAdmin";
import ImageModelForm from "./ImageModelForm";
import LlmModelForm from "./LlmModelForm";
import ModelAssignments from "./ModelAssignments";
import ModelConnections from "./ModelConnections";

const SAVED_FLASH_MS = 1800;
const CARD_CLASS = "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground lg:max-h-full";

const confirmCopy = ({ action, kind, model }) => {
  if (action === "test") {
    return {
      title: `付費測試「${model.label}」？`,
      description: "會以 low 品質生成一張圖片並產生 Azure 費用；不會驗證其他品質或圖片編輯能力。",
      confirm: "送出測試",
    };
  }
  return {
    title: `刪除「${model.label}」？`,
    description: kind === "image"
      ? "需先從功能指派與開放清單移除，並等待在途工作完成。刪除後無法復原。"
      : "需先解除所有功能指派。刪除後無法復原。",
    confirm: "刪除",
    destructive: true,
  };
};

/** Admin 「AI 模型」 page: which model each feature uses (left) and the model connections (right). */
export default function AiModelSettings() {
  const { refreshProfile } = useAuth();
  const [notice, setNotice] = useState(null);
  const [savedRow, setSavedRow] = useState("");
  const savedTimer = useRef(null);
  const [dialog, setDialog] = useState({ open: false, kind: "image", model: null, seq: 0 });
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [confirmContent, setConfirmContent] = useState(null);

  const notify = useCallback(({ tone, text, row }) => {
    setNotice({ tone, text });
    if (!row) return;
    setSavedRow(row);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedRow(""), SAVED_FLASH_MS);
  }, []);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const image = useImageModelAdmin({ notify, refreshProfile });
  const llm = useLlmModelAdmin({ notify });

  const openDialog = (kind, model = null) =>
    setDialog((previous) => ({ open: true, kind, model, seq: previous.seq + 1 }));
  const closeDialog = () => setDialog((previous) => ({ ...previous, open: false }));

  const askConfirm = (request) => {
    setPendingConfirm(request);
    setConfirmContent(confirmCopy(request));
  };

  const handleConfirm = () => {
    const { action, kind, model } = pendingConfirm;
    setPendingConfirm(null);
    if (action === "test") void image.runTest(model);
    else if (kind === "image") void image.deleteModel(model);
    else void llm.deleteModel(model);
  };

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      <div className="flex min-h-9 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">左側指派各功能使用的模型，右側管理模型連線。選擇後立即儲存。</p>
        {notice && (
          <p
            key={notice.text}
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-sm animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none sm:justify-end sm:text-right",
              notice.tone === "error" ? "text-destructive" : notice.tone === "success" ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {notice.tone === "error" && <AlertCircle className="icon-sm shrink-0" aria-hidden="true" />}
            {notice.tone === "success" && <Check className="icon-sm shrink-0 text-success" aria-hidden="true" />}
            <span className="min-w-0">{notice.text}</span>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-start">
        <ModelAssignments image={image} llm={llm} savedRow={savedRow} className={CARD_CLASS} />
        <ModelConnections
          image={image}
          llm={llm}
          className={CARD_CLASS}
          onAdd={(kind) => openDialog(kind)}
          onEdit={(kind, model) => openDialog(kind, model)}
          onDelete={(kind, model) => askConfirm({ action: "delete", kind, model })}
          onTestImage={(model) => askConfirm({ action: "test", kind: "image", model })}
        />
      </div>

      <Dialog open={dialog.open} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          {dialog.kind === "image" && image.catalog && (
            <ImageModelForm
              key={dialog.seq}
              model={dialog.model}
              catalog={image.catalog}
              onCancel={closeDialog}
              onSubmit={async (form) => {
                await image.saveModel(form, dialog.model?.modelKey ?? null);
                closeDialog();
              }}
            />
          )}
          {dialog.kind === "text" && (
            <LlmModelForm
              key={dialog.seq}
              model={dialog.model}
              onCancel={closeDialog}
              onTestDraft={llm.testDraft}
              onSubmit={async (form) => {
                await llm.saveModel(form, dialog.model?.id ?? null);
                closeDialog();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingConfirm)} onOpenChange={(open) => !open && setPendingConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmContent?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmContent?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(confirmContent?.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {confirmContent?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
